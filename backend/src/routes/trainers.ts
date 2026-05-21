import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const trainersRouter = Router();
trainersRouter.use(requireAuth);

const include = {
  recruitedBy: { select: { id: true, name: true, role: true } },
};

trainersRouter.get('/', async (_req, res) => {
  const trainers = await prisma.trainer.findMany({ include, orderBy: { name: 'asc' } });
  res.json(trainers);
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

function costScore(trainerRate: number, clientBudget: number) {
  if (!trainerRate) return 50;
  if (!clientBudget) return 70;     // no budget set → neutral preference
  // Convert client budget (USD) into INR-ish baseline. Assume USD → ₹83.
  const inrBudget = clientBudget * 83;
  if (trainerRate <= inrBudget * 0.5) return 100;
  if (trainerRate <= inrBudget * 0.8) return 90;
  if (trainerRate <= inrBudget) return 75;
  if (trainerRate <= inrBudget * 1.2) return 40;
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

  // Pre-fetch supporting data in parallel
  const [trainers, sessionLogs, proposals, allClients, users] = await Promise.all([
    prisma.trainer.findMany({ where: { active: true }, include }),
    prisma.sessionLog.findMany({ select: { trainerId: true, clientId: true, taskId: true } }),
    prisma.proposal.findMany({ select: { trainerId: true, verification: true } }),
    prisma.client.findMany({ select: { id: true, primaryTrainerId: true, hostOwnerId: true } }),
    prisma.user.findMany({ select: { id: true, role: true } }),
  ]);

  // Pre-compute lookups
  const userRoleById = new Map(users.map((u) => [u.id, u.role]));
  const team5HostIds = new Set(
    users.filter((u) => TEAM5_ROLES.has(u.role)).map((u) => u.id),
  );
  const team5ClientIds = new Set(
    allClients.filter((c) => c.hostOwnerId && team5HostIds.has(c.hostOwnerId)).map((c) => c.id),
  );

  // Per-trainer aggregates
  const sessionsByTrainer = new Map<string, number>();
  const team5SessionsByTrainer = new Map<string, number>();
  for (const s of sessionLogs) {
    sessionsByTrainer.set(s.trainerId, (sessionsByTrainer.get(s.trainerId) || 0) + 1);
    if (s.clientId && team5ClientIds.has(s.clientId)) {
      team5SessionsByTrainer.set(s.trainerId, (team5SessionsByTrainer.get(s.trainerId) || 0) + 1);
    }
  }
  const proposalsByTrainer = new Map<string, { total: number; passed: number }>();
  for (const p of proposals) {
    if (!p.trainerId) continue;
    const x = proposalsByTrainer.get(p.trainerId) || { total: 0, passed: 0 };
    x.total += 1;
    if (p.verification === 'Pass') x.passed += 1;
    proposalsByTrainer.set(p.trainerId, x);
  }
  const pastClientCountByTrainer = new Map<string, number>();
  for (const c of allClients) {
    if (!c.primaryTrainerId) continue;
    pastClientCountByTrainer.set(
      c.primaryTrainerId,
      (pastClientCountByTrainer.get(c.primaryTrainerId) || 0) + 1,
    );
  }

  const scored = trainers.map((t) => {
    const have = skillTokens(t.skills);
    const sk = skillScore(required, have);
    const cs = costScore(t.defaultRateInr || 0, clientBudget);
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
  'skills', 'experienceYears', 'active', 'requiresVerification', 'recruitedById',
];

trainersRouter.post('/', async (req: AuthedRequest, res) => {
  const data: any = {};
  for (const f of fields) if (f in req.body) data[f] = req.body[f];
  if (!data.name) return res.status(400).json({ error: 'Name required' });
  if (!data.recruitedById) data.recruitedById = req.user!.id;
  const t = await prisma.trainer.create({ data, include });
  await audit(req.user!.id, req.user!.name, 'TRAINER_CREATE', t.name);
  res.status(201).json(t);
});

trainersRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const data: any = {};
  for (const f of fields) if (f in req.body) data[f] = req.body[f];
  const t = await prisma.trainer.update({ where: { id: req.params.id }, data, include });
  await audit(req.user!.id, req.user!.name, 'TRAINER_UPDATE', t.name);
  res.json(t);
});

trainersRouter.delete('/:id', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only founder' });
  await prisma.trainer.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});
