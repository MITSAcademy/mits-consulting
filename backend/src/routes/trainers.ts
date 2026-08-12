import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const trainersRouter = Router();
trainersRouter.use(requireAuth);

const include = {
  recruitedBy: { select: { id: true, name: true, role: true } },
};

const FINANCE_ROLES = ['founder', 'manager', 'accounts', 'payment_processor'];

trainersRouter.get('/', async (req: AuthedRequest, res) => {
  const trainers = await prisma.trainer.findMany({ include, orderBy: { name: 'asc' } });
  const canSeeFinance = FINANCE_ROLES.includes(req.user!.role);
  // Strip bank/UPI/rate details for non-finance roles
  const sanitized = trainers.map((t: any) => {
    if (canSeeFinance) return t;
    const { upiId, bankName, accountNumber, ifscCode, defaultRateInr, rateModel, ...safe } = t;
    return safe;
  });
  res.json(sanitized);
});

// ─────────────────────────────────────────────────────────────────────────
//  MATCHING — weighted score per trainer vs. a target client.
//
//  Criteria (each 0-100, then weighted-summed):
//    skill          — token overlap between client.skills and trainer.skills
//    cost           — closer to (and ≤) client budget = higher; over budget = lower
//    sessionCount   — total sessions logged (cap at 100 sessions → 100)
//    teamSessions   — sessions with a Team-5 host (Mitali's tree); cap at 30
//    demoSuccess    — proposals Passed / total proposals (×100)
//    pastClients    — distinct clients trainer has been primary for; cap at 10
//
//  Weights are tunable via query string for experimentation, with defaults
//  matching what the team currently optimizes for.
// ─────────────────────────────────────────────────────────────────────────
const DEFAULT_WEIGHTS = {
  skill:        40,
  cost:         15,
  sessionCount: 12,
  teamSessions: 10,
  demoSuccess:  13,
  pastClients:  10,
};
// Mitali's team = users whose role is host-like (lead, staff) plus those reporting to her
const TEAM5_ROLES = new Set(['lead', 'staff', 'manager']);

function skillTokens(s?: string | null) {
  return (s || '')
    .toLowerCase()
    .split(/[,\s/+()]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2);
}

function skillScore(required: string[], have: string[]) {
  if (!required.length) return 0;
  const set = new Set(have);
  let hits = 0;
  required.forEach((t) => { if (set.has(t)) hits++; });
  return Math.round((hits / required.length) * 100);
}

// Rough FX → INR. Mirrored from /metrics/home so the scoring uses the same
// rates as MoneyFlow reporting. Tune in one place if accountancy wants real spot.
const FX_TO_INR: Record<string, number> = { USD: 83, CAD: 60, INR: 1, EUR: 90, GBP: 105, AUD: 55, AED: 23 };

function costScore(trainerRateInr: number, clientBudget: number, clientCurrency: string) {
  if (!trainerRateInr) return 50;
  if (!clientBudget) return 70;     // no budget set → neutral preference
  // Convert client cycleAmount (in its native currency) to INR using the FX
  // table. Was previously hard-coded as USD→₹83 for every client — which
  // 83×-inflated the INR budget for INR-currency clients and made every
  // trainer score 100/100 on cost regardless of actual rate.
  const fx = FX_TO_INR[clientCurrency] ?? 1;
  const inrBudget = clientBudget * fx;
  if (trainerRateInr <= inrBudget * 0.5) return 100;
  if (trainerRateInr <= inrBudget * 0.8) return 90;
  if (trainerRateInr <= inrBudget) return 75;
  if (trainerRateInr <= inrBudget * 1.2) return 40;
  return 10;
}

trainersRouter.get('/match', async (req, res) => {
  const { clientId } = req.query as { clientId?: string };
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  // Read weights from query (override defaults)
  const w = { ...DEFAULT_WEIGHTS };
  for (const k of Object.keys(w) as Array<keyof typeof w>) {
    const q = req.query[k];
    if (typeof q === 'string' && !isNaN(Number(q))) w[k] = Math.max(0, Math.min(100, Number(q)));
  }
  const wSum = Object.values(w).reduce((s, n) => s + n, 0) || 1;

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const requiredSkillStr =
    (client.intakeData as any)?.detailed_skill_set ||
    client.intakeSkillHint ||
    '';
  const required = skillTokens(requiredSkillStr);
  const clientBudget = client.cycleAmount || 0;

  // Use DB aggregates instead of loading all rows into memory
  const [trainers, sessionCounts, team5SessionCounts, proposalCounts, pastClientCounts] = await Promise.all([
    prisma.trainer.findMany({ where: { active: true }, include }),
    prisma.sessionLog.groupBy({ by: ['trainerId'], _count: { id: true } }),
    // team5 sessions = sessions on clients whose hostOwner has a team-lead role
    prisma.$queryRaw<{ trainerid: string; cnt: bigint }[]>`
      SELECT sl."trainerId" AS trainerid, COUNT(*) AS cnt
      FROM "SessionLog" sl
      JOIN "Client" c ON c.id = sl."clientId"
      JOIN "User" u ON u.id = c."hostOwnerId"
      WHERE u.role IN ('lead','staff','manager')
      GROUP BY sl."trainerId"
    `,
    prisma.proposal.groupBy({ by: ['trainerId', 'verification'], _count: { id: true } }),
    prisma.client.groupBy({ by: ['primaryTrainerId'], _count: { id: true } }),
  ]);

  // Build lookups from aggregates
  const sessionsByTrainer = new Map(sessionCounts.map((r) => [r.trainerId, r._count.id]));
  const team5SessionsByTrainer = new Map(team5SessionCounts.map((r) => [r.trainerid, Number(r.cnt)]));

  const proposalsByTrainer = new Map<string, { total: number; passed: number }>();
  for (const p of proposalCounts) {
    if (!p.trainerId) continue;
    const x = proposalsByTrainer.get(p.trainerId) || { total: 0, passed: 0 };
    x.total += p._count.id;
    if (p.verification === 'Pass') x.passed += p._count.id;
    proposalsByTrainer.set(p.trainerId, x);
  }
  const pastClientCountByTrainer = new Map(
    pastClientCounts.filter((r) => r.primaryTrainerId).map((r) => [r.primaryTrainerId!, r._count.id])
  );

  const scored = trainers.map((t) => {
    const have = skillTokens(t.skills);
    const sk = skillScore(required, have);
    const cs = costScore(t.defaultRateInr || 0, clientBudget, client.currency || 'USD');
    const totalSessions = sessionsByTrainer.get(t.id) || 0;
    const sc = Math.min(100, Math.round((totalSessions / 100) * 100));
    const team5 = team5SessionsByTrainer.get(t.id) || 0;
    const ts = Math.min(100, Math.round((team5 / 30) * 100));
    const ps = proposalsByTrainer.get(t.id) || { total: 0, passed: 0 };
    const ds = ps.total > 0 ? Math.round((ps.passed / ps.total) * 100) : 50; // neutral if untested
    const past = pastClientCountByTrainer.get(t.id) || 0;
    const pc = Math.min(100, Math.round((past / 10) * 100));

    const total = Math.round(
      (sk * w.skill + cs * w.cost + sc * w.sessionCount + ts * w.teamSessions + ds * w.demoSuccess + pc * w.pastClients) / wSum,
    );

    return {
      trainer: t,
      total,
      breakdown: {
        skill: sk, cost: cs, sessionCount: sc, teamSessions: ts, demoSuccess: ds, pastClients: pc,
        // raw counts for transparency
        raw: {
          requiredSkills: required,
          haveSkills: have,
          trainerRateInr: t.defaultRateInr,
          clientBudgetUSD: clientBudget,
          totalSessions,
          team5Sessions: team5,
          proposalsTotal: ps.total,
          proposalsPassed: ps.passed,
          pastClients: past,
        },
      },
    };
  });

  scored.sort((a, b) => b.total - a.total);

  res.json({
    client: { id: client.id, name: client.name, skills: requiredSkillStr, budget: clientBudget, currency: client.currency },
    weights: w,
    results: scored,
  });
});

// Demo history for a trainer (every demo where they were the assigned trainer)
trainersRouter.get('/:id/demos', async (req, res) => {
  const demos = await prisma.demo.findMany({
    where: { trainerId: req.params.id },
    include: {
      client: { select: { id: true, name: true, intakeSkillHint: true } },
      conductedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }],
  });
  res.json(demos);
});

trainersRouter.get('/:id', async (req, res) => {
  const trainer = await prisma.trainer.findUnique({
    where: { id: req.params.id },
    include: {
      ...include,
      clients: true,
      proposals: { include: { request: { include: { client: true } } } },
      sessionLogs: { orderBy: { date: 'desc' }, take: 50 },
    },
  });
  if (!trainer) return res.status(404).json({ error: 'Not found' });
  res.json(trainer);
});

const fields = [
  'name', 'email', 'phoneCode', 'phoneDigits', 'whatsappGroupName', 'whatsappGroupLink',
  'rateModel', 'defaultRateInr', 'paymentMethod', 'upiId', 'bankAccount',
  'bankHolderName', 'bankName', 'bankAccountNumber', 'bankIfscCode', 'bankBranchName', 'bankAccountType', 'bankChequeUrl',
  'skills', 'experienceYears', 'active', 'requiresVerification', 'recruitedById',
  'availabilityWindow', 'availableFromIst', 'availableToIst',
  'availabilitySlots',
];

trainersRouter.post('/', async (req: AuthedRequest, res) => {
  // Trainer pool ops are owned by recruiters + leadership; demo_lead too
  // because Samita / Anjali quick-add trainers from Internal Search.
  const ALLOWED = ['founder', 'manager', 'lead', 'recruiter', 'demo_lead', 'demo_intake', 'account_manager'];
  if (!ALLOWED.includes(req.user!.role)) {
    return res.status(403).json({ error: `Your role (${req.user!.role}) cannot add trainers.` });
  }
  const data: any = {};
  for (const f of fields) if (f in req.body) data[f] = req.body[f];
  if (!data.name) return res.status(400).json({ error: 'Name required' });
  // Soft duplicate check — warn if same name+phone already exists
  if (data.phoneDigits) {
    const existing = await (prisma as any).trainer.findFirst({
      where: {
        phoneDigits: data.phoneDigits,
        name: { equals: data.name?.trim(), mode: 'insensitive' },
        active: true,
      },
      select: { id: true, name: true, seqId: true },
    });
    if (existing) {
      return res.status(409).json({
        error: `Trainer already exists: ${existing.name} (T-${existing.seqId || existing.id})`,
        code: 'TRAINER_DUPLICATE',
        existingId: existing.id,
      });
    }
  }
  if (!data.recruitedById) data.recruitedById = req.user!.id;
  const t = await prisma.trainer.create({ data, include });
  await audit(req.user!.id, req.user!.name, 'TRAINER_CREATE', t.name, { trainerId: t.id });
  res.status(201).json(t);
});

trainersRouter.patch('/:id', async (req: AuthedRequest, res) => {
  // Same gate as POST. Without this any role could PATCH bank/UPI/rate which
  // is a finance-sensitive surface.
  const ALLOWED = ['founder', 'manager', 'lead', 'recruiter', 'demo_lead', 'demo_intake', 'account_manager'];
  if (!ALLOWED.includes(req.user!.role)) {
    return res.status(403).json({ error: `Your role (${req.user!.role}) cannot edit trainers.` });
  }
  // Bank / UPI / payment fields are leadership-only — recruiters can edit
  // contact info + skills + rate.
  const FINANCE_FIELDS = ['bankAccount', 'paymentMethod', 'upiId',
    'bankHolderName', 'bankName', 'bankAccountNumber', 'bankIfscCode', 'bankBranchName', 'bankAccountType', 'bankChequeUrl'];
  const touchingFinance = FINANCE_FIELDS.some((f) => f in req.body);
  if (touchingFinance && !['founder', 'manager', 'lead'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only founder / manager / lead can change trainer bank / UPI / payment fields.' });
  }
  const data: any = {};
  for (const f of fields) if (f in req.body) data[f] = req.body[f];
  if (data.phoneDigits) {
    const existing = await prisma.trainer.findFirst({ where: { phoneDigits: data.phoneDigits, NOT: { id: req.params.id } } });
    if (existing) return res.status(409).json({ error: `Phone ${data.phoneDigits} already belongs to trainer "${existing.name}".` });
  }
  let t;
  try {
    t = await prisma.trainer.update({ where: { id: req.params.id }, data, include });
  } catch (e: any) {
    if (e?.code === 'P2002' && e?.meta?.target?.includes('phoneDigits')) {
      return res.status(409).json({ error: `Phone ${data.phoneDigits} is already used by another trainer.` });
    }
    throw e;
  }

  // When defaultRateInr changes, propagate to all unpaid session logs so the
  // payment sheet reflects the new rate without manual edits.
  if ('defaultRateInr' in data && data.defaultRateInr) {
    const newRate = Number(data.defaultRateInr);
    const newRateModel = data.rateModel || t.rateModel || 'per_session';
    const unpaidLogs = await prisma.sessionLog.findMany({
      where: { trainerId: req.params.id, status: { in: ['Logged', 'ReadyForFinal'] }, sessionHappened: true },
      select: { id: true, hours: true },
    });
    await Promise.all(unpaidLogs.map((log) => {
      const sessions = log.hours <= 1.0 ? 0.5 : 1;
      const amountInr = newRateModel === 'per_session'
        ? Math.round(sessions * newRate)
        : Math.round(log.hours * newRate);
      return prisma.sessionLog.update({ where: { id: log.id }, data: { rateSnapshot: newRate, amountInr } });
    }));
    if (unpaidLogs.length > 0) {
      await audit(req.user!.id, req.user!.name, 'TRAINER_RATE_SYNC',
        `${t.name} rate → ₹${newRate} · synced ${unpaidLogs.length} unpaid log(s)`, { trainerId: t.id });
    }
  }

  await audit(req.user!.id, req.user!.name, 'TRAINER_UPDATE', t.name, { trainerId: t.id });
  res.json(t);
});

trainersRouter.delete('/:id', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only founder' });
  await prisma.trainer.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});
