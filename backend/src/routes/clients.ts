import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';
import { notify } from '../lib/notify';
import { sendEmail, decryptSecret } from '../lib/mailer';
import { buildIcsInvite } from '../lib/ical';
import { buildWelcomeEmailHtml, WELCOME_EMAIL_SUBJECT } from '../lib/welcomeEmail';
import { buildSkillMatrixHtml, buildSkillMatrixText, istToUsZones, DEFAULT_SOFT_SKILLS } from '../lib/skillMatrix';
import { buildSkillMatrixPdf } from '../lib/skillMatrixPdf';
import { buildPreDemoReminderHtml, buildPreDemoReminderText, PRE_DEMO_REMINDER_SUBJECT } from '../lib/preDemoTrainerReminder';
import { buildEngagementLetterHtml, buildEngagementLetterText, ENGAGEMENT_LETTER_SUBJECT } from '../lib/engagementLetter';
import { buildEngagementLetterPdf } from '../lib/engagementLetterPdf';
import { buildHandoverHtml, buildHandoverText, HANDOVER_SUBJECT } from '../lib/mitaliHandover';

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

const include = {
  partner: true,
  bankAccount: true,
  leadOwner: { select: { id: true, name: true, role: true } },
  intakeOwner: { select: { id: true, name: true, role: true } },
  salesOwner: { select: { id: true, name: true, role: true } },
  hostOwner: { select: { id: true, name: true, role: true } },
  primaryTrainer: true,
};

// PII redaction rules:
//   • recruiter                              → always redact phone/email/group + strip intake PII
//   • demo_intake who isn't the intake owner → same redaction (privacy across colleagues)
//   • everyone else (founder/manager/demo_lead/sales/host) → full visibility
// `viewer` is the requesting user.
function redactClient<T extends Record<string, any>>(c: T, viewer: { id: string; role: string }): T {
  const isRecruiter = viewer.role === 'recruiter';
  const isOtherIntake = viewer.role === 'demo_intake' && c.intakeOwnerId && c.intakeOwnerId !== viewer.id;
  if (!isRecruiter && !isOtherIntake) return c;
  const redacted: any = { ...c, phoneCode: null, phoneDigits: null, email: null,
    whatsappGroupName: null, whatsappGroupLink: null };
  // Strip personal info from intake replies too — keep only skills/timing (operational)
  if (c.intakeData) {
    const id = c.intakeData as any;
    redacted.intakeData = {
      detailed_skill_set: id.detailed_skill_set || null,
      current_priority_task: id.current_priority_task || null,
      demo_timing_ist: id.demo_timing_ist || null,
      session_timing_ist: id.session_timing_ist || null,
      trainer_preference: id.trainer_preference || null,
      meeting_tool: id.meeting_tool || null,
      // omit client_email, additional_notes
    };
  }
  // Owner contact is also out of scope for recruiters (keep id/name/role only)
  if (isRecruiter && c.intakeOwner) {
    redacted.intakeOwner = { id: c.intakeOwner.id, name: c.intakeOwner.name, role: c.intakeOwner.role };
  }
  return redacted;
}

clientsRouter.get('/', async (req: AuthedRequest, res) => {
  const { lifecycle, search } = req.query as any;
  const where: any = {};
  if (lifecycle) where.lifecycle = lifecycle;
  if (search) where.name = { contains: String(search), mode: 'insensitive' };
  const clients = await prisma.client.findMany({ where, include, orderBy: { createdAt: 'desc' } });
  res.json(clients.map((c) => redactClient(c, req.user!)));
});

// Roshni follow-ups list — clients in SaleClosing/SaleWon with sub-status RP or CP,
// bucketed by roshniNextCallOn relative to today. MUST be registered BEFORE GET /:id
// or Express will match "roshni" as :id and 404.
// Renewals approaching — Active / LeverageGranted clients with nextRenewalDue
// within the next 14 days (or already overdue). Surfaced alongside Roshni's
// payment follow-ups so she has one daily queue.
clientsRouter.get('/roshni/renewals-approaching', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'sales_closer'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Roshni / managers / founder can view this queue.' });
  }
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(); horizon.setDate(horizon.getDate() + 14);
  const horizonISO = horizon.toISOString().slice(0, 10);
  // Roshni sees clients she owns; founder/manager see all
  const ownerFilter = req.user!.role === 'sales_closer' ? { salesOwnerId: req.user!.id } : {};
  const clients = await prisma.client.findMany({
    where: {
      ...ownerFilter,
      lifecycle: { in: ['Active', 'LeverageGranted'] },
      nextRenewalDue: { not: null, lte: horizonISO },
    },
    select: {
      id: true, name: true, lifecycle: true,
      phoneCode: true, phoneDigits: true, email: true,
      whatsappGroupLink: true,
      nextRenewalDue: true,
      cycleAmount: true, currency: true,
      sessionsUsed: true, sessionsPerCycle: true,
      churnRisk: true,
      primaryTrainer: { select: { id: true, name: true } },
      salesOwner: { select: { id: true, name: true } },
    },
    orderBy: { nextRenewalDue: 'asc' },
  });
  const items = clients.map((c) => {
    const due = c.nextRenewalDue || '';
    const overdue = !!due && due < today;
    const daysUntil = due ? Math.floor((Date.parse(due) - Date.parse(today)) / 86_400_000) : 0;
    return { ...c, overdue, daysUntil };
  });
  res.json({
    items,
    counts: {
      overdue: items.filter((i) => i.overdue).length,
      thisWeek: items.filter((i) => !i.overdue && i.daysUntil <= 7).length,
      next7to14: items.filter((i) => !i.overdue && i.daysUntil > 7 && i.daysUntil <= 14).length,
    },
  });
});

clientsRouter.get('/roshni/follow-ups', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'sales_closer'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Roshni / managers / founder can view this queue.' });
  }
  const today = new Date().toISOString().slice(0, 10);
  const ownerFilter = req.user!.role === 'sales_closer' ? { salesOwnerId: req.user!.id } : {};
  const clients = await prisma.client.findMany({
    where: {
      ...ownerFilter,
      lifecycle: { in: ['SaleClosing', 'SaleWon'] },
      saleClosingSubStatus: { in: ['RP', 'CP'] },
    },
    select: {
      id: true, name: true, lifecycle: true,
      phoneCode: true, phoneDigits: true,
      email: true,
      whatsappGroupLink: true,
      saleClosingSubStatus: true,
      roshniNextCallOn: true,
      roshniLastContactAt: true,
      roshniLastContactOutcome: true,
      salesOwner: { select: { id: true, name: true } },
    },
    orderBy: { roshniNextCallOn: 'asc' },
  });
  const items = clients.map((c) => {
    const due = c.roshniNextCallOn || '';
    const bucket = !due ? 'unscheduled' : due < today ? 'overdue' : due === today ? 'today' : 'upcoming';
    const daysOverdue = due && due < today ? Math.floor((Date.parse(today) - Date.parse(due)) / 86_400_000) : 0;
    return { ...c, bucket, daysOverdue };
  });
  res.json({
    items,
    counts: {
      overdue:    items.filter((i) => i.bucket === 'overdue').length,
      today:      items.filter((i) => i.bucket === 'today').length,
      upcoming:   items.filter((i) => i.bucket === 'upcoming').length,
      unscheduled: items.filter((i) => i.bucket === 'unscheduled').length,
    },
  });
});

clientsRouter.get('/:id', async (req: AuthedRequest, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      ...include,
      payments: { orderBy: { paymentDate: 'desc' } },
      sourcingRequests: { include: { proposals: { include: { trainer: true } } } },
      tasks: true,
      sessionLogs: { orderBy: { date: 'desc' }, take: 50 },
      leverageRequests: { orderBy: { createdAt: 'desc' } },
      feedback: { orderBy: { weekStart: 'desc' }, take: 20 },
    },
  });
  if (!client) return res.status(404).json({ error: 'Not found' });
  res.json(redactClient(client, req.user!));
});

const allowedFields = [
  'name', 'email', 'phoneCode', 'phoneDigits', 'whatsappGroupName', 'whatsappGroupLink',
  'country', 'engagementType', 'paymentModel', 'currency', 'cycleAmount',
  'lifecycle', 'funderType', 'partnerId', 'source',
  'leadOwnerId', 'intakeOwnerId', 'salesOwnerId', 'hostOwnerId',
  'primaryTrainerId', 'engagementTrainerRateInr', 'preferredTimeIst',
  'feedbackDay', 'bankAccountId', 'accountNameRaw',
  'freshPaymentReceived', 'freshPaymentDate', 'freshPaymentAmount',
  'cycleStart', 'cycleEnd', 'nextRenewalDue', 'sessionsPerCycle', 'sessionsUsed',
  'churnRisk', 'paymentPendingVaibhav', 'pendingVaibhavSince', 'requiresVerification',
  'intakeData', 'intakeSkillHint', 'intakeReceivedAt',
  'demoDate', 'demoTimeIst', 'demoActualDate', 'demoActualTimeIst',
  'demoOutcome', 'demoFeedback', 'demoNextSteps',
  'demoEvidenceUrl', 'demoEvidenceKind',
  'dormantSince', 'dormantReason', 'dormantCheckBackOn', 'dormantResumeFromStage',
  'notes',
];

// Field → permission category.
//   identity   — name, group name
//   contact    — phone, email, group link
//   engagement — source, type, currency, amount, notes
//   pipeline   — REASSIGN owners (managerial; lifecycle uses its own /stage endpoint)
//   workflow   — capture intake replies, match trainer, set schedule (Team 2's daily job)
//   financial  — bank, payment amounts, cycle dates
//   sensitive  — verification toggle, churn risk
const FIELD_CATEGORY: Record<string, string> = {
  name: 'identity', whatsappGroupName: 'identity',
  phoneCode: 'contact', phoneDigits: 'contact', email: 'contact', whatsappGroupLink: 'contact',
  source: 'engagement', engagementType: 'engagement', currency: 'engagement',
  cycleAmount: 'engagement', funderType: 'engagement', partnerId: 'engagement',
  paymentModel: 'engagement', country: 'engagement', notes: 'engagement',
  lifecycle: 'pipeline',
  intakeOwnerId: 'pipeline', salesOwnerId: 'pipeline',
  hostOwnerId: 'pipeline', leadOwnerId: 'pipeline',
  intakeData: 'workflow', intakeSkillHint: 'workflow', intakeReceivedAt: 'workflow',
  primaryTrainerId: 'workflow', engagementTrainerRateInr: 'workflow',
  preferredTimeIst: 'workflow', feedbackDay: 'workflow',
  demoDate: 'workflow', demoTimeIst: 'workflow',
  demoActualDate: 'workflow', demoActualTimeIst: 'workflow',
  demoOutcome: 'workflow', demoFeedback: 'workflow', demoNextSteps: 'workflow',
  demoEvidenceUrl: 'workflow', demoEvidenceKind: 'workflow',
  dormantSince: 'workflow', dormantReason: 'workflow',
  dormantCheckBackOn: 'workflow', dormantResumeFromStage: 'workflow',
  bankAccountId: 'financial', paymentPendingVaibhav: 'financial',
  pendingVaibhavSince: 'financial', accountNameRaw: 'financial',
  freshPaymentReceived: 'financial', freshPaymentDate: 'financial', freshPaymentAmount: 'financial',
  cycleStart: 'financial', cycleEnd: 'financial', nextRenewalDue: 'financial',
  sessionsPerCycle: 'financial', sessionsUsed: 'financial', churnRisk: 'financial',
  requiresVerification: 'sensitive',
};

// Permission matrix. "workflow" lets Team 2 capture intake / match trainers without
// being able to reassign ownership chains (those stay in "pipeline").
const CLIENT_PERMS: Record<string, Record<string, boolean>> = {
  founder:           { identity: true,  contact: true,  engagement: true,  pipeline: true,  workflow: true,  financial: true,  sensitive: true  },
  demo_lead:         { identity: true,  contact: true,  engagement: true,  pipeline: true,  workflow: true,  financial: false, sensitive: false },
  manager:           { identity: true,  contact: true,  engagement: true,  pipeline: true,  workflow: true,  financial: true,  sensitive: true  },
  demo_intake:       { identity: false, contact: false, engagement: false, pipeline: false, workflow: true,  financial: false, sensitive: false },
  recruiter:         { identity: false, contact: false, engagement: false, pipeline: false, workflow: false, financial: false, sensitive: false },
  sales_closer:      { identity: false, contact: false, engagement: true,  pipeline: false, workflow: false, financial: true,  sensitive: false },
  accounts:          { identity: false, contact: false, engagement: false, pipeline: false, workflow: false, financial: true,  sensitive: false },
  lead:              { identity: false, contact: false, engagement: false, pipeline: false, workflow: true,  financial: false, sensitive: false },
  staff:             { identity: false, contact: false, engagement: false, pipeline: false, workflow: true,  financial: false, sensitive: false },
  payment_processor: { identity: false, contact: false, engagement: false, pipeline: false, workflow: false, financial: false, sensitive: false },
};

function canEditFields(role: string, fields: string[]): { ok: boolean; blocked?: string[] } {
  if (role === 'founder') return { ok: true };
  const perms = CLIENT_PERMS[role] || {};
  const blocked: string[] = [];
  for (const f of fields) {
    const cat = FIELD_CATEGORY[f];
    if (!cat) continue;
    if (!perms[cat]) blocked.push(`${f} (${cat})`);
  }
  return blocked.length === 0 ? { ok: true } : { ok: false, blocked };
}

clientsRouter.post('/', async (req: AuthedRequest, res) => {
  const data: any = {};
  for (const f of allowedFields) if (f in req.body) data[f] = req.body[f];
  if (!data.name) return res.status(400).json({ error: 'Name required' });
  if (!data.leadOwnerId) data.leadOwnerId = req.user!.id;
  const client = await prisma.client.create({ data, include });
  await audit(req.user!.id, req.user!.name, 'CLIENT_CREATE', client.name);
  res.status(201).json(client);
});

clientsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const data: any = {};
  for (const f of allowedFields) if (f in req.body) data[f] = req.body[f];
  const check = canEditFields(req.user!.role, Object.keys(data));
  if (!check.ok) {
    return res.status(403).json({
      error: `Your role (${req.user!.role}) cannot edit: ${check.blocked!.join(', ')}. Use the "Request edit" flow instead.`,
    });
  }
  const client = await prisma.client.update({ where: { id: req.params.id }, data, include });
  await audit(req.user!.id, req.user!.name, 'CLIENT_UPDATE', `${client.name} · ${Object.keys(data).join(',')}`);

  // If Anjali/Taran just attached demo evidence AND the outcome is not Positive,
  // ping the proposing recruiter so they can react. The notification carries the
  // client link; recipient can play the audio / view the screenshot inline.
  if (data.demoEvidenceUrl
      && (client.demoOutcome === 'Negative' || client.demoOutcome === 'Neutral')) {
    try {
      const primaryProposal = await prisma.proposal.findFirst({
        where: { trainerId: client.primaryTrainerId || undefined, request: { clientId: client.id } },
        orderBy: { proposedAt: 'desc' },
        select: { proposedById: true },
      });
      const recruiterId = primaryProposal?.proposedById;
      if (recruiterId && recruiterId !== req.user!.id) {
        await notify({
          userId: recruiterId,
          kind: 'DemoEvidenceShared',
          title: `Demo evidence from ${client.name} (${client.demoOutcome})`,
          body: `${req.user!.name} attached ${client.demoEvidenceKind || 'evidence'} from the demo. Outcome: ${client.demoOutcome}. ${client.demoFeedback ? '\n\nFeedback: ' + client.demoFeedback : ''}`,
          link: `/clients/${client.id}`,
          email: true,
        });
      }
    } catch (e) {
      console.warn('[demo-evidence notify] failed:', (e as any)?.message);
    }
  }

  res.json(client);
});

// Which roles may move a client INTO a given stage.
// Mirrors the source.html stage-action button visibility (canIntake / canClose / canActivate).
const STAGE_TRANSITION_PERMS: Record<string, string[]> = {
  Lead:                ['founder', 'manager', 'demo_lead', 'demo_intake'],
  IntakeSent:          ['founder', 'manager', 'demo_lead', 'demo_intake'],
  IntakeReceived:      ['founder', 'manager', 'demo_lead', 'demo_intake'],
  InternalSearch:      ['founder', 'manager', 'demo_lead', 'demo_intake'],
  WithRecruiters:      ['founder', 'manager', 'demo_lead', 'demo_intake'],
  VerificationPending: ['founder', 'manager', 'demo_lead', 'demo_intake', 'recruiter'],
  TrainerMatched:      ['founder', 'manager', 'demo_lead', 'demo_intake'],
  DemoScheduled:       ['founder', 'manager', 'demo_lead', 'demo_intake'],
  DemoDone:            ['founder', 'manager', 'demo_lead', 'demo_intake'],
  // FeedbackPending = Samita's queue. Anjali pushes here when demo is done; Samita acts.
  FeedbackPending:     ['founder', 'manager', 'demo_lead', 'demo_intake'],
  // SaleClosing — Samita can route here directly from positive feedback (via post-demo-feedback endpoint)
  SaleClosing:         ['founder', 'manager', 'sales_closer', 'demo_lead'],
  SaleWon:             ['founder', 'manager', 'sales_closer'],
  Active:              ['founder', 'manager'],
  LeverageGranted:     ['founder', 'manager'],
  // Hold = client said "need time to decide" post-demo. Roshni gets 3-day reminder.
  Hold:                ['founder', 'manager', 'demo_lead', 'sales_closer'],
  // Dormant — any owner involved with the client can mark them silent
  Dormant:             ['founder', 'manager', 'demo_lead', 'demo_intake', 'sales_closer'],
  Churned:             ['founder', 'manager'],
  Completed:           ['founder', 'manager'],
};

// Valid BACKWARD transitions (FROM → set of allowed FROM-stages for that destination).
// Without this map, anyone could rewind any client to any earlier stage which is messy.
// Forward transitions are always allowed (provided the role permission above passes).
//
// Reading: BACK_TRANSITIONS[targetStage] = [from-stages where stepping back to targetStage is OK]
const FORWARD_ORDER = [
  'Lead', 'IntakeSent', 'IntakeReceived', 'InternalSearch', 'WithRecruiters',
  'VerificationPending', 'TrainerMatched', 'DemoScheduled', 'DemoDone',
  'FeedbackPending', 'SaleClosing', 'SaleWon', 'Active',
];

// to-stage → list of from-stages allowed to roll back here.
// Forward moves are always allowed, terminals (Hold/Dormant/Churned/Completed) too.
const BACK_TRANSITIONS: Record<string, string[]> = {
  Lead:                ['IntakeSent', 'Dormant'],
  IntakeSent:          ['IntakeReceived', 'Dormant'],
  IntakeReceived:      ['InternalSearch', 'WithRecruiters', 'VerificationPending', 'Dormant'],
  InternalSearch:      ['WithRecruiters', 'VerificationPending', 'TrainerMatched', 'DemoScheduled', 'DemoDone', 'Dormant'],
  // DemoDone → WithRecruiters is the bad-feedback re-loop (Samita reassigns back to Anjali's recruiters)
  WithRecruiters:      ['InternalSearch', 'VerificationPending', 'TrainerMatched', 'DemoScheduled', 'DemoDone', 'Hold', 'Dormant'],
  VerificationPending: ['TrainerMatched', 'DemoScheduled', 'DemoDone', 'Dormant'],
  TrainerMatched:      ['DemoScheduled', 'DemoDone', 'Dormant'],
  DemoScheduled:       ['DemoDone', 'FeedbackPending', 'Dormant'],
  DemoDone:            ['FeedbackPending', 'SaleClosing', 'Dormant'],
  FeedbackPending:     ['SaleClosing', 'Hold', 'WithRecruiters', 'Dormant'],
  SaleClosing:         ['SaleWon', 'Dormant'],
  SaleWon:             ['Active', 'Dormant'],
  Active:              ['Hold', 'LeverageGranted', 'Dormant'],
};

function isForward(from: string, to: string): boolean {
  const fi = FORWARD_ORDER.indexOf(from);
  const ti = FORWARD_ORDER.indexOf(to);
  // both in main path AND target index > source index
  return fi >= 0 && ti >= 0 && ti > fi;
}

function isValidTransition(from: string, to: string): { ok: boolean; reason?: string } {
  if (from === to) return { ok: true };
  // Forward along the main pipeline is always OK if roles permit
  if (isForward(from, to)) return { ok: true };
  // Terminal moves (Hold, Dormant, Churned, Completed) allowed from any active stage
  const terminal = ['Hold', 'Dormant', 'Churned', 'Completed'];
  if (terminal.includes(to)) return { ok: true };
  // Backward moves: must be in BACK_TRANSITIONS
  const allowedFroms = BACK_TRANSITIONS[to] || [];
  if (allowedFroms.includes(from)) return { ok: true };
  return {
    ok: false,
    reason: `Can't move "${from}" → "${to}". Valid back-options from "${from}" only allow specific earlier stages (see BACK_TRANSITIONS in backend).`,
  };
}

clientsRouter.post('/:id/stage', async (req: AuthedRequest, res) => {
  const { lifecycle, reason, resumeToStage, dormantSince, dormantReason, dormantCheckBackOn, sendInvite } = req.body;
  if (!lifecycle) return res.status(400).json({ error: 'lifecycle required' });
  const allowed = STAGE_TRANSITION_PERMS[lifecycle];
  if (!allowed) return res.status(400).json({ error: `Unknown stage: ${lifecycle}` });
  // Founder always wins
  if (req.user!.role !== 'founder' && !allowed.includes(req.user!.role)) {
    return res.status(403).json({
      error: `Your role (${req.user!.role}) cannot move clients to "${lifecycle}". Allowed: ${allowed.join(', ')}.`,
    });
  }
  // Pull current state to validate the direction
  const current = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: {
      lifecycle: true, primaryTrainerId: true,
      demoDate: true, demoTimeIst: true,
      demoActualDate: true, demoActualTimeIst: true,
      demoOutcome: true, demoFeedback: true, demoNextSteps: true,
    },
  });
  if (!current) return res.status(404).json({ error: 'Client not found' });
  const valid = isValidTransition(current.lifecycle, lifecycle);
  if (!valid.ok) return res.status(409).json({ error: valid.reason });

  // Gate: must have sent the skill matrix to the client BEFORE scheduling the demo.
  // Bypass allowed for founder + manager (escape hatch for special cases).
  if (lifecycle === 'DemoScheduled' && !['founder', 'manager'].includes(req.user!.role)) {
    const sent = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { skillMatrixSentAt: true },
    });
    if (!sent?.skillMatrixSentAt) {
      return res.status(409).json({
        error: 'Skill matrix not sent to client yet. Open the client → "Send skill matrix to client" before scheduling the demo.',
      });
    }
  }

  // Build the update payload — Dormant-specific bookkeeping
  const data: any = { lifecycle };
  if (lifecycle === 'Dormant') {
    data.dormantSince = dormantSince || new Date().toISOString().slice(0, 10);
    if (dormantReason !== undefined) data.dormantReason = dormantReason;
    if (dormantCheckBackOn !== undefined) data.dormantCheckBackOn = dormantCheckBackOn;
    // Remember where we came from for the Resume flow
    data.dormantResumeFromStage = current.lifecycle;
  } else if (current.lifecycle === 'Dormant') {
    // Coming out of Dormant — clear the tracking fields
    data.dormantSince = null;
    data.dormantReason = null;
    data.dormantCheckBackOn = null;
    data.dormantResumeFromStage = null;
  }

  // ─── Hold tracking bookkeeping ───────────────────────────────────────────
  // Must run BEFORE the prisma.client.update below — earlier versions had this
  // block AFTER the update which made every Hold transition lose holdSince /
  // holdCheckBackOn / holdResumeFromStage silently (HoldClientsPage couldn't
  // bucket overdue/today and Resume defaulted to the stage we left).
  if (lifecycle === 'Hold') {
    data.holdSince = new Date().toISOString().slice(0, 10);
    if (reason !== undefined) data.holdReason = reason;
    // Default 3-day check-back for Roshni follow-up
    const cb = new Date(); cb.setDate(cb.getDate() + 3);
    data.holdCheckBackOn = cb.toISOString().slice(0, 10);
    data.holdResumeFromStage = current.lifecycle;
  } else if (current.lifecycle === 'Hold') {
    data.holdSince = null;
    data.holdReason = null;
    data.holdCheckBackOn = null;
    data.holdResumeFromStage = null;
  }

  const client = await prisma.client.update({ where: { id: req.params.id }, data, include });

  // ─── Sourcing side-effects ────────────────────────────────────────────────
  // When a client moves OUT of the recruiter flow (Dormant / Hold / pulled-back to
  // InternalSearch / Churned / back to Lead-stages), close any active sourcing
  // requests so they vanish from the recruiter's queue. Without this, requests
  // routed to Aman/Kanchan keep showing even after Samita marks the client dormant
  // or Anjali pulls them back to handle herself.
  const removeFromRecruiterQueue = [
    'Dormant', 'Hold', 'InternalSearch', 'Churned',
    'Lead', 'IntakeSent', 'IntakeReceived',
  ];
  try {
    if (
      removeFromRecruiterQueue.includes(lifecycle)
      && !removeFromRecruiterQueue.includes(current.lifecycle)
    ) {
      const active = await prisma.sourcingRequest.findMany({
        where: { clientId: req.params.id, status: { in: ['Open', 'Proposed'] } },
        select: { id: true, sentToId: true },
      });
      if (active.length > 0) {
        await prisma.sourcingRequest.updateMany({
          where: { id: { in: active.map((a) => a.id) } },
          data: { status: 'Closed' },
        });
        await audit(
          req.user!.id, req.user!.name, 'SOURCING_AUTOCLOSE',
          `${client.name}: ${active.length} sourcing request(s) closed (stage → ${lifecycle})`,
        );
      }
    }
  } catch (e) {
    console.error('Auto-close sourcing requests failed (non-fatal):', e);
  }

  try {
    if (lifecycle === 'WithRecruiters' && current.lifecycle !== 'WithRecruiters') {
      const existing = await prisma.sourcingRequest.findFirst({
        where: { clientId: req.params.id, status: { in: ['Open', 'Proposed'] } },
      });
      if (!existing) {
        // Inline routing — same rules as POST /sourcing
        const DEFAULT_RECRUITER_FOR: Record<string, string> = {
          'u-anjali': 'u-aman',
          'u-taran': 'u-kanchan',
        };
        let sentToId =
          DEFAULT_RECRUITER_FOR[req.user!.id] ||
          DEFAULT_RECRUITER_FOR[(client as any).intakeOwnerId || ''] ||
          null;
        if (!sentToId) {
          const counts = await Promise.all(
            ['u-aman', 'u-kanchan'].map(async (id) => ({
              id,
              n: await prisma.sourcingRequest.count({ where: { sentToId: id, status: { in: ['Open', 'Proposed'] } } }),
            })),
          );
          counts.sort((a, b) => a.n - b.n);
          sentToId = counts[0]?.id || null;
        }
        await prisma.sourcingRequest.create({
          data: {
            clientId: req.params.id,
            sentById: req.user!.id,
            sentToId,
            sentAt: new Date().toISOString().slice(0, 10),
            status: 'Open',
          },
        });
        await audit(
          req.user!.id, req.user!.name, 'SOURCING_AUTOCREATE',
          `${client.name} → ${sentToId} (re-opened on stage move to WithRecruiters)`,
        );
        if (sentToId) {
          await notify({
            userId: sentToId,
            kind: 'SourcingAssigned',
            title: `New sourcing request — ${client.name}`,
            body: `${req.user!.name} pushed this client to you. Open Sourcing to propose trainers.`,
            link: `/sourcing`,
            email: true,
          });
        }
      }
    }
  } catch (e) {
    console.error('Auto-sourcing failed (non-fatal):', e);
  }

  // ─── Demo history side-effects ───────────────────────────────────────────
  // Hold bookkeeping moved above the prisma.client.update — see comment there.

  // Entering DemoScheduled: create a new Demo row (so we have history per attempt)
  // Entering DemoDone: update the most-recent Scheduled demo with actuals + outcome
  // Leaving DemoScheduled to a non-DemoDone (e.g. back to WithRecruiters): mark Cancelled
  try {
    if (lifecycle === 'DemoScheduled' && current.lifecycle !== 'DemoScheduled') {
      const newDemo = await prisma.demo.create({
        data: {
          clientId: req.params.id,
          trainerId: current.primaryTrainerId,
          scheduledDate: client.demoDate || null,
          scheduledTimeIst: client.demoTimeIst || null,
          status: 'Scheduled',
        },
      });
      // Send ICS calendar invite when requested (default true if flag omitted by older clients)
      if (sendInvite !== false) {
        await sendDemoInvite(req, newDemo.id, client).catch((e) => console.error('Demo invite failed:', e));
      }
      // Notify the recruiter who proposed this trainer that their candidate is doing a demo.
      // Includes email so Aman/Kanchan see it in inbox even if not in portal.
      try {
        const proposal = await prisma.proposal.findFirst({
          where: { trainerId: current.primaryTrainerId || undefined, request: { clientId: req.params.id } },
          orderBy: { proposedAt: 'desc' },
          select: { proposedById: true, trainer: { select: { name: true } } },
        });
        if (proposal?.proposedById && proposal.proposedById !== req.user!.id) {
          await notify({
            userId: proposal.proposedById,
            kind: 'DemoScheduled',
            title: `Your trainer is on demo — ${client.name}`,
            body: `${proposal.trainer?.name || 'Trainer'} is doing the demo on ${client.demoDate || 'TBD'}${client.demoTimeIst ? ' at ' + client.demoTimeIst + ' IST' : ''}. Heads up so you can stay in the loop.`,
            link: `/clients/${req.params.id}`,
            email: true,
          });
        }
      } catch (e) {
        console.warn('[demo-scheduled notify recruiter] failed:', (e as any)?.message);
      }
    } else if (lifecycle === 'DemoDone') {
      const latest = await prisma.demo.findFirst({
        where: { clientId: req.params.id, status: { in: ['Scheduled', 'Rescheduled'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (latest) {
        await prisma.demo.update({
          where: { id: latest.id },
          data: {
            status: 'Done',
            actualDate: client.demoActualDate || client.demoDate || null,
            actualTimeIst: client.demoActualTimeIst || client.demoTimeIst || null,
            outcome: client.demoOutcome,
            feedback: client.demoFeedback,
            nextSteps: client.demoNextSteps,
            conductedById: req.user!.id,
          },
        });
      } else {
        // No prior Scheduled row — create one in Done state (covers manual jumps)
        await prisma.demo.create({
          data: {
            clientId: req.params.id,
            trainerId: current.primaryTrainerId,
            scheduledDate: client.demoDate || null,
            scheduledTimeIst: client.demoTimeIst || null,
            actualDate: client.demoActualDate || client.demoDate || null,
            actualTimeIst: client.demoActualTimeIst || client.demoTimeIst || null,
            outcome: client.demoOutcome,
            feedback: client.demoFeedback,
            nextSteps: client.demoNextSteps,
            status: 'Done',
            conductedById: req.user!.id,
          },
        });
      }
    } else if (current.lifecycle === 'DemoScheduled' && lifecycle !== 'DemoDone' && lifecycle !== 'DemoScheduled') {
      // Back-moved without conducting the demo → mark the open Scheduled row as Cancelled
      const latest = await prisma.demo.findFirst({
        where: { clientId: req.params.id, status: 'Scheduled' },
        orderBy: { createdAt: 'desc' },
      });
      if (latest) {
        await prisma.demo.update({
          where: { id: latest.id },
          data: { status: 'Cancelled', nextSteps: reason || latest.nextSteps },
        });
      }
    }
  } catch (e) {
    console.error('Demo history update failed (non-fatal):', e);
  }

  // Auto-handoff: when Anjali marks DemoDone, immediately push to Samita's feedback queue.
  // This is a non-fatal best-effort step — the DemoDone transition still succeeds even if this fails.
  if (lifecycle === 'DemoDone' && current.lifecycle !== 'FeedbackPending') {
    try {
      const handed = await prisma.client.update({
        where: { id: req.params.id },
        data: { lifecycle: 'FeedbackPending' },
        include,
      });
      await audit(
        req.user!.id, req.user!.name, 'STAGE_CHANGE',
        `${client.name}: DemoDone → FeedbackPending (auto, awaiting Samita feedback)`,
      );
      return res.json(handed);
    } catch (e) {
      console.error('Auto-handoff to FeedbackPending failed (non-fatal):', e);
    }
  }

  await audit(
    req.user!.id, req.user!.name, 'STAGE_CHANGE',
    `${client.name}: ${current.lifecycle} → ${lifecycle}${reason ? ' (' + reason + ')' : ''}`,
  );
  res.json(client);
});

clientsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only founder can delete clients' });
  const c = await prisma.client.delete({ where: { id: req.params.id } });
  await audit(req.user!.id, req.user!.name, 'CLIENT_DELETE', c.name);
  res.json({ ok: true });
});

// ─── Roshni follow-up Task helper ─────────────────────────────────────────
// Creates/updates a single Task per (client, owner) so overdue follow-ups
// surface on the /tasks page. Title prefixed so we can identify them.
async function upsertRoshniFollowUpTask(clientId: string, ownerId: string, clientName: string, dueDate: string, kind: string) {
  const title = `Roshni follow-up · ${clientName} (${kind})`;
  const existing = await prisma.task.findFirst({
    where: {
      clientId,
      ownerId,
      type: 'OTHER',
      status: 'Pending',
      title: { startsWith: 'Roshni follow-up · ' },
    },
  });
  if (existing) {
    await prisma.task.update({
      where: { id: existing.id },
      data: { dueDate, title, priority: 'High' },
    });
  } else {
    await prisma.task.create({
      data: { clientId, ownerId, type: 'OTHER', title, dueDate, status: 'Pending', priority: 'High' },
    });
  }
}

async function closeRoshniFollowUpTasks(clientId: string) {
  await prisma.task.updateMany({
    where: {
      clientId,
      type: 'OTHER',
      status: 'Pending',
      title: { startsWith: 'Roshni follow-up · ' },
    },
    data: { status: 'Done' },
  });
}

// ─── Roshni sub-status (RP / CP / C) ──────────────────────────────────────
// Sub-status overlay on top of SaleClosing/SaleWon. Doesn't change lifecycle —
// just marks Roshni's progress: RP=ready-for-payment, CP=closure-pending (no
// pickup after 3 working days), C=client confirmed not starting.
clientsRouter.post('/:id/sub-status', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'sales_closer'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: `Your role (${req.user!.role}) cannot set Roshni sub-status.` });
  }
  const { subStatus, nextCallOn, lastContactOutcome, reason } = req.body as {
    subStatus: 'RP' | 'CP' | 'C' | null;
    nextCallOn?: string;
    lastContactOutcome?: string;
    reason?: string;
  };
  const allowedSubStatuses = [null, 'RP', 'CP', 'C'];
  if (!allowedSubStatuses.includes(subStatus)) {
    return res.status(400).json({ error: `Invalid sub-status: ${subStatus}. Must be RP, CP, C, or null.` });
  }
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, lifecycle: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (!['SaleClosing', 'SaleWon'].includes(client.lifecycle)) {
    return res.status(409).json({
      error: `Sub-status only applies to SaleClosing / SaleWon clients (current: ${client.lifecycle}).`,
    });
  }
  const today = new Date().toISOString().slice(0, 10);
  const updated = await prisma.client.update({
    where: { id: client.id },
    data: {
      saleClosingSubStatus: subStatus,
      saleClosingSubStatusAt: new Date(),
      saleClosingSubStatusById: req.user!.id,
      ...(nextCallOn !== undefined ? { roshniNextCallOn: nextCallOn || null } : {}),
      ...(lastContactOutcome !== undefined ? {
        roshniLastContactOutcome: lastContactOutcome || null,
        roshniLastContactAt: today,
      } : {}),
    },
    include,
  });
  // Maintain a single follow-up Task per client owned by the actor — RP/CP with a next-call-on
  // date creates/updates the Task; C or null clears it. Surfaces overdue calls on /tasks.
  try {
    if ((subStatus === 'RP' || subStatus === 'CP') && nextCallOn) {
      const kind = subStatus === 'CP' ? 'no pickup' : 'payment promised';
      await upsertRoshniFollowUpTask(client.id, req.user!.id, client.name, nextCallOn, kind);
    } else if (subStatus === 'C' || subStatus === null) {
      await closeRoshniFollowUpTasks(client.id);
    }
  } catch (e) {
    console.warn('[sub-status] follow-up Task upsert failed:', (e as any)?.message);
  }
  await audit(
    req.user!.id, req.user!.name, 'ROSHNI_SUB_STATUS',
    `${client.name}: ${subStatus || 'cleared'}${reason ? ' · ' + reason : ''}${nextCallOn ? ' · next call ' + nextCallOn : ''}`,
  );
  res.json(updated);
});

// Payment-terms checklist — the 10-item walkthrough Roshni opens on the close call.
// Reading returns the saved items (or seeds defaults). Writing replaces the array.
type ChecklistItem = { key: string; label: string; checked: boolean; note?: string; checkedAt?: string; checkedById?: string };

function defaultChecklistItems(): ChecklistItem[] {
  return [
    { key: 'demo_feedback',      label: 'Took the client\'s feedback on the demo session',                 checked: false },
    { key: 'start_date',         label: 'Confirmed preferred start date',                                  checked: false },
    { key: 'session_timing',     label: 'Confirmed session timings (IST) + days/week',                     checked: false },
    { key: 'package',            label: 'Explained the support / training package details',               checked: false },
    { key: 'amount',             label: 'Finalized the cycle amount + currency',                           checked: false },
    { key: 'cadence',            label: 'Confirmed payment cadence (Weekly / Biweekly / Monthly / One-shot)', checked: false },
    { key: 'payment_method',     label: 'Discussed payment methods (HDFC wire / GPay / Remitly)',          checked: false },
    { key: 'screenshot',         label: 'Asked for payment confirmation screenshot post-payment',          checked: false },
    { key: 'trainer_avail',      label: 'Coordinated with internal team on resource availability',         checked: false },
    { key: 'mitali_handover',    label: 'Set expectation that Mitali will reach out post-payment',         checked: false },
  ];
}

clientsRouter.get('/:id/payment-checklist', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'sales_closer'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: { id: true, paymentChecklist: true, paymentChecklistCompletedAt: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const saved = (client.paymentChecklist as ChecklistItem[] | null) || null;
  // Merge: keep saved checked-state, but always present the canonical item set
  // (so adding new items in defaultChecklistItems() rolls out without migration).
  const defaults = defaultChecklistItems();
  const items: ChecklistItem[] = defaults.map((d) => {
    const existing = saved?.find((s) => s.key === d.key);
    return existing ? { ...d, ...existing } : d;
  });
  res.json({ items, completedAt: client.paymentChecklistCompletedAt || null });
});

clientsRouter.patch('/:id/payment-checklist', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'sales_closer'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  const { items, completed } = req.body as { items: ChecklistItem[]; completed?: boolean };
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });
  // Stamp checkedAt/By on items that just got checked
  const today = new Date().toISOString().slice(0, 10);
  const stamped = items.map((it) => (it.checked && !it.checkedAt
    ? { ...it, checkedAt: today, checkedById: req.user!.id }
    : it));
  const allChecked = stamped.every((it) => it.checked);
  const updated = await prisma.client.update({
    where: { id: req.params.id },
    data: {
      paymentChecklist: stamped as any,
      paymentChecklistCompletedAt: completed || allChecked
        ? today
        : null,
    },
    select: { id: true, paymentChecklist: true, paymentChecklistCompletedAt: true },
  });
  await audit(
    req.user!.id, req.user!.name, 'PAYMENT_CHECKLIST_UPDATE',
    `${req.params.id} · ${stamped.filter((it) => it.checked).length}/${stamped.length} checked`,
  );
  res.json(updated);
});

// One-click "mark contacted" — Roshni bumps the last-contact timestamp without
// opening the SubStatusModal. Optionally bumps next-call-on by N days so the
// follow-up queue rolls forward.
clientsRouter.post('/:id/mark-contacted', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'sales_closer'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  const { outcome, bumpDays, nextCallOn } = req.body as {
    outcome?: string;     // 'NoPickup' | 'Discussed' | 'PaymentPromised' | 'PaidScreenshotPending' | string
    bumpDays?: number;    // shift roshniNextCallOn forward by N days (default 1)
    nextCallOn?: string;  // explicit next-call date — overrides bumpDays
  };
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, roshniNextCallOn: true, lifecycle: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const today = new Date().toISOString().slice(0, 10);
  let newNextCall: string | undefined = nextCallOn;
  if (!newNextCall && typeof bumpDays === 'number' && bumpDays > 0) {
    const base = client.roshniNextCallOn && client.roshniNextCallOn >= today
      ? client.roshniNextCallOn
      : today;
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + bumpDays);
    newNextCall = d.toISOString().slice(0, 10);
  }
  const updated = await prisma.client.update({
    where: { id: client.id },
    data: {
      roshniLastContactAt: today,
      ...(outcome ? { roshniLastContactOutcome: outcome } : {}),
      ...(newNextCall ? { roshniNextCallOn: newNextCall } : {}),
    },
    select: { id: true, roshniLastContactAt: true, roshniLastContactOutcome: true, roshniNextCallOn: true },
  });
  await audit(
    req.user!.id, req.user!.name, 'ROSHNI_MARK_CONTACTED',
    `${client.name}${outcome ? ' · ' + outcome : ''}${newNextCall ? ' · next call ' + newNextCall : ''}`,
  );
  res.json(updated);
});

// Generate a personalised "couldn't reach you" WhatsApp message for Roshni to
// send when client doesn't pick up. Used by the SubStatusModal when she marks
// CP / NoPickup — gives her a ready-to-paste message including the next-call date.
clientsRouter.get('/:id/no-pickup-template', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'sales_closer'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { primaryTrainer: { select: { name: true } } },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const nextCallOn = (req.query.nextCallOn as string) || client.roshniNextCallOn || '';
  const trainerName = client.primaryTrainer?.name || '';
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { name: true, phone: true },
  });
  const senderName = me?.name?.split(' ')[0] || 'Roshni';
  const senderPhone = me?.phone || '+91 62835 05780';

  const lines: string[] = [];
  lines.push(`Hi ${client.name || 'Sir/Mam'},`);
  lines.push('');
  lines.push(`This is ${senderName} from MITS Solution. I tried reaching you today regarding the next steps on your demo${trainerName ? ` with ${trainerName}` : ''}.`);
  lines.push('');
  lines.push(`Could you please confirm a convenient time so we can finalize the schedule and payment details?`);
  if (nextCallOn) {
    lines.push('');
    lines.push(`I'll try reaching you again on ${nextCallOn}.`);
  }
  lines.push('');
  lines.push(`Best regards,`);
  lines.push(senderName);
  lines.push(senderPhone);

  const text = lines.join('\n');
  const digits = `${client.phoneCode || ''}${client.phoneDigits || ''}`.replace(/[^0-9]/g, '');
  const url = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
  res.json({ text, url });
});

// ─── Payment confirmation (Roshni's post-payment step) ────────────────────
// Logs the client's payment screenshot + builds the coordination message
// for the internal payment-confirmation WhatsApp group.
clientsRouter.post('/:id/payment-confirmation', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'sales_closer'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: `Your role (${req.user!.role}) cannot record payment confirmation.` });
  }
  const { screenshotUrl, postedToGroup } = req.body as {
    screenshotUrl?: string;
    postedToGroup?: boolean;
  };
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, name: true, lifecycle: true, engagementType: true,
      cycleAmount: true, currency: true, paymentModel: true,
      sessionsPerCycle: true,
      freshPaymentReceived: true, freshPaymentAmount: true, freshPaymentDate: true,
      primaryTrainer: { select: { name: true } },
    },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const today = new Date().toISOString().slice(0, 10);
  await prisma.client.update({
    where: { id: client.id },
    data: {
      ...(screenshotUrl ? { paymentScreenshotUrl: screenshotUrl, paymentScreenshotReceivedAt: today } : {}),
      ...(postedToGroup ? { paymentConfirmationPostedAt: today } : {}),
    },
  });

  // Build the coordination message (Support vs Training format)
  const amt = client.freshPaymentAmount ?? client.cycleAmount ?? 0;
  const cur = (client.currency || 'usd').toLowerCase();
  const paid = client.freshPaymentReceived ? (client.freshPaymentAmount === client.cycleAmount ? 'full' : 'half') : 'pending';
  const paidAmt = client.freshPaymentAmount ?? 0;
  const dt = client.freshPaymentDate || today;
  const isTraining = client.engagementType === 'Training' || client.engagementType === 'TaskBased';

  let groupMessage: string;
  if (isTraining) {
    // "Deepti closed at 350 usd for 1 month training, paid same, 3rd May 2026."
    groupMessage = `${client.name} closed at ${client.cycleAmount || amt} ${cur} for 1 month training, paid ${paid === 'full' ? 'same' : `${paidAmt} ${cur}`}, ${dt}.`;
  } else {
    // "Sruthi closed at 400 usd, 1 month support,1 hour, paid half(200 usd), biweekly payment, 1st June 2026"
    const sessions = client.sessionsPerCycle || 0;
    const cycle = client.paymentModel || 'biweekly';
    groupMessage = `${client.name} closed at ${client.cycleAmount || amt} ${cur}, 1 month support, ${sessions || 1} hour, paid ${paid}(${paidAmt} ${cur}), ${cycle} payment, ${dt}.`;
  }

  await audit(
    req.user!.id, req.user!.name, 'PAYMENT_CONFIRMATION',
    `${client.name}${screenshotUrl ? ' · screenshot uploaded' : ''}${postedToGroup ? ' · posted to group' : ''}`,
  );
  res.json({ ok: true, groupMessage, isTraining });
});

// ─── WhatsApp group rename (post-payment handover to Mitali team) ─────────
// Roshni renames the client group from "RP" to "Training X Y Z" or "JBT X Y Z".
clientsRouter.post('/:id/group-rename', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'sales_closer'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: `Your role (${req.user!.role}) cannot rename the group.` });
  }
  const { newName } = req.body as { newName: string };
  if (!newName?.trim()) return res.status(400).json({ error: 'newName is required.' });
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, whatsappGroupName: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const today = new Date().toISOString().slice(0, 10);
  const updated = await prisma.client.update({
    where: { id: client.id },
    data: {
      whatsappGroupName: newName.trim(),
      whatsappGroupRenamedAt: today,
      whatsappGroupRenamedBy: req.user!.id,
    },
    include,
  });
  await audit(
    req.user!.id, req.user!.name, 'WA_GROUP_RENAME',
    `${client.name}: "${client.whatsappGroupName}" → "${newName.trim()}"`,
  );
  res.json(updated);
});


// Demo history for a client (every attempt with the trainer who conducted it)
clientsRouter.get('/:id/demos', async (req, res) => {
  const demos = await prisma.demo.findMany({
    where: { clientId: req.params.id },
    include: {
      trainer: { select: { id: true, name: true, skills: true } },
      conductedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }],
  });
  res.json(demos);
});

// Backfill a past demo that happened OUTSIDE the portal (e.g. before the team
// onboarded, or an offline session that wasn't logged at the time). Creates a
// Demo row with status='Done' so the history reflects reality. Does NOT touch
// the client's lifecycle — strictly an audit/history entry.
clientsRouter.post('/:id/demos/backfill', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'demo_lead', 'demo_intake'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Samita, Anjali, Taran or admin can backfill demos' });
  }
  const { trainerId, actualDate, actualTimeIst, outcome, feedback, nextSteps } = req.body || {};
  if (!actualDate) return res.status(400).json({ error: 'actualDate required' });
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const demo = await prisma.demo.create({
    data: {
      clientId: req.params.id,
      trainerId: trainerId || null,
      // Use the same date for both fields so the card renders cleanly.
      scheduledDate: actualDate,
      scheduledTimeIst: actualTimeIst || null,
      actualDate,
      actualTimeIst: actualTimeIst || null,
      outcome: outcome || null,
      feedback: feedback || null,
      nextSteps: nextSteps || null,
      status: 'Done',
      conductedById: req.user!.id,
    },
    include: {
      trainer: { select: { id: true, name: true, skills: true } },
      conductedBy: { select: { id: true, name: true } },
    },
  });
  await audit(
    req.user!.id, req.user!.name, 'DEMO_BACKFILL',
    `${client.name} · ${actualDate}${outcome ? ' · ' + outcome : ''}`,
  );
  res.status(201).json(demo);
});

// ─── Engagement letter (Roshni → client on SaleWon) + handover trigger ─────
// Sent by Roshni when the deal closes. Auto-CCs Mitali so she's aware.
// Compulsory dual-send: email + WhatsApp (UI calls both endpoints in sequence).
clientsRouter.post('/:id/engagement-letter', async (req: AuthedRequest, res) => {
  const channel = (req.body?.channel || 'email') as 'email' | 'whatsapp';
  // Only Roshni / sales / managers / founder
  if (!['founder', 'manager', 'sales_closer', 'demo_lead'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Roshni, sales, manager or founder can send the engagement letter' });
  }
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { primaryTrainer: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const toEmail = client.email || (client.intakeData as any)?.client_email || '';
  const phone = `${client.phoneCode || ''}${client.phoneDigits || ''}`.replace(/[^0-9]/g, '');

  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });
  const vars = {
    clientName: client.name,
    engagementType: client.engagementType,
    paymentModel: client.paymentModel || undefined,
    sessionsPerCycle: client.sessionsPerCycle || undefined,
    cycleAmount: client.cycleAmount || undefined,
    currency: client.currency,
    cycleStart: client.cycleStart || undefined,
    cycleEnd: client.cycleEnd || undefined,
    preferredTimeIst: client.preferredTimeIst || undefined,
    trainerName: client.primaryTrainer?.name || undefined,
    senderName: me?.name || 'Roshni',
    senderEmail: me?.gmailAddress || undefined,
    handoverTo: 'Mitali',
  };
  const subject = ENGAGEMENT_LETTER_SUBJECT(client.name);
  const text = buildEngagementLetterText(vars);
  const html = buildEngagementLetterHtml(vars);

  if (channel === 'whatsapp') {
    if (!phone) return res.status(400).json({ error: 'No phone on file for this client' });
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    await prisma.outboundMessage.create({
      data: { kind: 'WhatsApp', toPhone: phone, toName: client.name, body: text, clientId: client.id, sentById: req.user!.id, status: 'Logged', provider: 'wa-link' },
    });
    await audit(req.user!.id, req.user!.name, 'ENGAGEMENT_LETTER_WA', `${client.name} · ${phone}`);
    return res.json({ ok: true, url, text });
  }

  if (!toEmail) return res.status(400).json({ error: 'No email on file for this client' });
  let fromUser;
  if (me?.gmailAddress && me?.smtpAppPassword) {
    fromUser = { id: me.id, name: me.name, gmailAddress: me.gmailAddress, appPasswordPlain: decryptSecret(me.smtpAppPassword), sendAsAddress: me.sendAsAddress };
  }
  const msg = await prisma.outboundMessage.create({
    data: { kind: 'Email', toEmail, subject, body: text, clientId: client.id, sentById: req.user!.id, status: 'Queued', provider: 'smtp' },
  });
  try {
    // CC Mitali so she's aware of the incoming handover (her actual email if her gmail is set; else system fallback)
    const mitali = await prisma.user.findFirst({ where: { id: 'u-mitali' }, select: { gmailAddress: true } });
    const cc = mitali?.gmailAddress || undefined;
    // Generate the branded engagement-letter PDF as an attachment. Best-effort —
    // if PDF generation fails, send the email without the attachment rather than
    // failing the whole send.
    let pdfAttachment: { filename: string; content: Buffer; contentType: string } | undefined;
    try {
      const pdfBuf = await buildEngagementLetterPdf(vars);
      const safeName = (client.name || 'client').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);
      pdfAttachment = {
        filename: `MITS_Engagement_Letter_${safeName}.pdf`,
        content: pdfBuf,
        contentType: 'application/pdf',
      };
    } catch (pdfErr) {
      console.warn('[engagement-letter] PDF build failed, sending email without attachment:', (pdfErr as any)?.message);
    }
    const r = await sendEmail({
      to: toEmail,
      cc,
      subject,
      body: text,
      htmlBody: html,
      fromUser,
      ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}),
    });
    await prisma.outboundMessage.update({ where: { id: msg.id }, data: { status: 'Sent', providerMessageId: r.id, provider: r.provider } });
    await audit(req.user!.id, req.user!.name, 'ENGAGEMENT_LETTER_EMAIL', `${client.name} · ${toEmail}${cc ? ' · cc ' + cc : ''}${pdfAttachment ? ' · pdf attached' : ''}`);
    res.status(201).json({ ok: true, messageId: msg.id, pdfAttached: !!pdfAttachment });
  } catch (e: any) {
    await prisma.outboundMessage.update({ where: { id: msg.id }, data: { status: 'Failed', errorText: e.message || String(e) } });
    res.status(502).json({ error: 'Engagement letter send failed: ' + (e.message || String(e)), code: (e as any)?.code, messageId: msg.id });
  }
});

// Handover-to-Mitali notification (creates a Task on Mitali's queue so the call gets scheduled).
clientsRouter.post('/:id/handover-to-mitali', async (req: AuthedRequest, res) => {
  if (!['founder', 'manager', 'sales_closer', 'demo_lead'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Roshni / sales / manager / founder' });
  }
  const client = await prisma.client.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, hostOwnerId: true } });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const today = new Date().toISOString().slice(0, 10);
  const due = new Date(); due.setDate(due.getDate() + 1);
  const dueDate = due.toISOString().slice(0, 10);
  const task = await prisma.task.create({
    data: {
      type: 'OTHER',
      title: `Handover call · ${client.name} (from Roshni) — call within 1 working day, introduce team, set up feedback rhythm`,
      clientId: client.id,
      ownerId: 'u-mitali',
      status: 'Pending',
      dueDate,
    },
  });
  // Also assign Mitali as the hostOwner if not already set
  if (!client.hostOwnerId) {
    await prisma.client.update({ where: { id: client.id }, data: { hostOwnerId: 'u-mitali' } }).catch(() => null);
  }
  await audit(req.user!.id, req.user!.name, 'HANDOVER_TO_MITALI', `${client.name} · task ${task.id} due ${dueDate}`);
  res.status(201).json({ ok: true, taskId: task.id });
});

// ─── Mitali handover welcome (Mitali → client after taking over) ───────────
// Sent by Mitali (or manager/founder) once she takes the handover from Roshni.
// Introduces her team + feedback rhythm + payment cadence.
clientsRouter.post('/:id/handover-welcome', async (req: AuthedRequest, res) => {
  const channel = (req.body?.channel || 'email') as 'email' | 'whatsapp';
  if (!['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Mitali (manager) or founder can send the handover welcome' });
  }
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { primaryTrainer: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });
  const vars = {
    clientName: client.name,
    trainerName: client.primaryTrainer?.name || undefined,
    senderName: me?.name || 'Mitali',
    senderEmail: me?.gmailAddress || undefined,
    paymentModel: client.paymentModel || undefined,
    cycleEnd: client.cycleEnd || undefined,
  };
  const subject = HANDOVER_SUBJECT(client.name);
  const text = buildHandoverText(vars);
  const html = buildHandoverHtml(vars);

  if (channel === 'whatsapp') {
    const phone = `${client.phoneCode || ''}${client.phoneDigits || ''}`.replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'No phone on file for this client' });
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    await prisma.outboundMessage.create({
      data: { kind: 'WhatsApp', toPhone: phone, toName: client.name, body: text, clientId: client.id, sentById: req.user!.id, status: 'Logged', provider: 'wa-link' },
    });
    await audit(req.user!.id, req.user!.name, 'HANDOVER_WELCOME_WA', `${client.name} · ${phone}`);
    return res.json({ ok: true, url, text });
  }

  const toEmail = client.email || (client.intakeData as any)?.client_email || '';
  if (!toEmail) return res.status(400).json({ error: 'No email on file for this client' });
  let fromUser;
  if (me?.gmailAddress && me?.smtpAppPassword) {
    fromUser = { id: me.id, name: me.name, gmailAddress: me.gmailAddress, appPasswordPlain: decryptSecret(me.smtpAppPassword), sendAsAddress: me.sendAsAddress };
  }
  const msg = await prisma.outboundMessage.create({
    data: { kind: 'Email', toEmail, subject, body: text, clientId: client.id, sentById: req.user!.id, status: 'Queued', provider: 'smtp' },
  });
  try {
    const r = await sendEmail({ to: toEmail, subject, body: text, htmlBody: html, fromUser });
    await prisma.outboundMessage.update({ where: { id: msg.id }, data: { status: 'Sent', providerMessageId: r.id, provider: r.provider } });
    // Mark handover as completed so the "Send handover welcome" button hides afterwards
    await prisma.client.update({ where: { id: client.id }, data: { hostOwnerId: me?.id || 'u-mitali' } }).catch(() => null);
    await audit(req.user!.id, req.user!.name, 'HANDOVER_WELCOME_EMAIL', `${client.name} · ${toEmail}`);
    res.status(201).json({ ok: true, messageId: msg.id });
  } catch (e: any) {
    await prisma.outboundMessage.update({ where: { id: msg.id }, data: { status: 'Failed', errorText: e.message || String(e) } });
    res.status(502).json({ error: 'Handover welcome send failed: ' + (e.message || String(e)), code: (e as any)?.code, messageId: msg.id });
  }
});

// ─── Pre-demo trainer reminder ───────────────────────────────────────────
// Anjali fires this ~15-30 min before the demo: cameras off, no CV sharing, etc.
// Returns either { ok: true } for email or { url } for whatsapp.
clientsRouter.post('/:id/pre-demo-reminder', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'demo_lead', 'demo_intake'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Samita, Anjali, Taran or admin can send pre-demo reminders' });
  }
  const channel = (req.body?.channel || 'email') as 'email' | 'whatsapp';
  const overrideText: string | undefined = req.body?.customText;
  const joinLink: string | undefined = req.body?.joinLink;

  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, name: true, demoDate: true, demoTimeIst: true,
      primaryTrainerId: true,
      primaryTrainer: { select: { id: true, name: true, email: true, phoneCode: true, phoneDigits: true, whatsappGroupLink: true } },
    },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const trainer = client.primaryTrainer;
  if (!trainer) return res.status(400).json({ error: 'No primary trainer assigned to this client' });

  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });

  const demoCallTime = client.demoDate
    ? `${client.demoTimeIst ? client.demoTimeIst + ' IST · ' : ''}${client.demoDate}`
    : undefined;
  const vars = {
    trainerName: trainer.name,
    demoCallTime,
    joinLink,
    senderName: me?.name || 'MITS Consulting',
  };
  const subject = PRE_DEMO_REMINDER_SUBJECT(trainer.name, demoCallTime);
  const text = overrideText?.trim() ? overrideText : buildPreDemoReminderText(vars);
  const html = overrideText?.trim()
    ? `<pre style="font-family:Inter,sans-serif;white-space:pre-wrap;font-size:14px;line-height:1.7;">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))}</pre>`
    : buildPreDemoReminderHtml(vars);

  if (channel === 'whatsapp') {
    // Prefer the MITS↔trainer private WhatsApp group; fall back to personal phone if no group.
    const groupLink = trainer.whatsappGroupLink || '';
    const digits = `${trainer.phoneCode || ''}${trainer.phoneDigits || ''}`.replace(/[^0-9]/g, '');
    if (!groupLink && !digits) return res.status(400).json({ error: 'No WhatsApp group link or phone on file for trainer' });
    const url = groupLink || `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    const channelKind = groupLink ? 'group' : 'personal';
    await prisma.outboundMessage.create({
      data: {
        kind: 'WhatsApp',
        toPhone: groupLink || digits,
        toName: groupLink ? `${trainer.name} · group` : trainer.name,
        body: text,
        clientId: client.id,
        trainerId: trainer.id,
        sentById: req.user!.id,
        status: 'Logged',
        provider: 'wa-link',
      },
    });
    await audit(req.user!.id, req.user!.name, 'PRE_DEMO_REMINDER_WA', `${trainer.name} · ${channelKind} · ${groupLink || digits}`);
    return res.json({ ok: true, url, text, channel: channelKind });
  }

  // email path
  if (!trainer.email) return res.status(400).json({ error: 'No email on file for trainer' });
  let fromUser;
  if (me?.gmailAddress && me?.smtpAppPassword) {
    fromUser = { id: me.id, name: me.name, gmailAddress: me.gmailAddress, appPasswordPlain: decryptSecret(me.smtpAppPassword), sendAsAddress: me.sendAsAddress };
  }
  const msg = await prisma.outboundMessage.create({
    data: {
      kind: 'Email', toEmail: trainer.email, subject, body: text,
      clientId: client.id, trainerId: trainer.id, sentById: req.user!.id,
      status: 'Queued', provider: 'smtp',
    },
  });
  try {
    const r = await sendEmail({ to: trainer.email, subject, body: text, htmlBody: html, fromUser });
    await prisma.outboundMessage.update({ where: { id: msg.id }, data: { status: 'Sent', providerMessageId: r.id, provider: r.provider } });
    await audit(req.user!.id, req.user!.name, 'PRE_DEMO_REMINDER_EMAIL', `${trainer.name} · ${trainer.email}`);
    res.status(201).json({ ok: true, messageId: msg.id });
  } catch (e: any) {
    await prisma.outboundMessage.update({ where: { id: msg.id }, data: { status: 'Failed', errorText: e.message || String(e) } });
    res.status(502).json({ error: 'Reminder send failed: ' + (e.message || String(e)), code: (e as any)?.code, messageId: msg.id });
  }
});

// ─── Skill matrix (Anjali sends Aman's matrix to client) ───────────────────
// Compulsory step before DemoScheduled (see stage transition guard below).
clientsRouter.post('/:id/send-skill-matrix', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'demo_lead', 'demo_intake'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Samita, Anjali, Taran or admin can send the skill matrix' });
  }
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, email: true, intakeData: true, demoDate: true, demoTimeIst: true, primaryTrainerId: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const toEmail = client.email || (client.intakeData as any)?.client_email || '';
  if (!toEmail) return res.status(400).json({ error: 'No email on file for this client' });

  // Caller can pass demoDate/demoTimeIst so the matrix populates Date/Time for Demo
  // even before the demo is formally scheduled. Persist them on the client too.
  const demoDateOverride = (req.body?.demoDate as string) || client.demoDate || '';
  const demoTimeOverride = (req.body?.demoTimeIst as string) || client.demoTimeIst || '';
  if ((req.body?.demoDate && req.body.demoDate !== client.demoDate)
      || (req.body?.demoTimeIst && req.body.demoTimeIst !== client.demoTimeIst)) {
    await prisma.client.update({
      where: { id: client.id },
      data: {
        demoDate: req.body?.demoDate || client.demoDate || null,
        demoTimeIst: req.body?.demoTimeIst || client.demoTimeIst || null,
      },
    });
  }

  // Pull all proposals for this client and assemble the matrix
  const reqs = await prisma.sourcingRequest.findMany({
    where: { clientId: client.id, status: { in: ['Open', 'Proposed', 'Closed'] } },
    include: { proposals: { include: { trainer: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const allProposals = reqs.flatMap((r) => r.proposals);
  const passed = allProposals.filter((p: any) => p.verification === 'Pass');
  const baseList = passed.length > 0 ? passed : allProposals;
  let candidates: any[];
  if (baseList.length === 0) {
    // Internal Search fallback — Anjali picked from the pool, no Proposal exists.
    // Synthesize from the client's primary trainer so the matrix can still go out.
    if (!client.primaryTrainerId) {
      return res.status(400).json({ error: 'No trainer on file for this client — pick a trainer first.' });
    }
    const t = await prisma.trainer.findUnique({
      where: { id: client.primaryTrainerId },
      select: { name: true, experienceYears: true, skills: true },
    });
    if (!t) {
      return res.status(400).json({ error: 'Primary trainer not found.' });
    }
    const skillList = (t.skills || '')
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12)
      .map((skill) => ({ skill, proficiency: 4 }));
    if (skillList.length === 0) {
      return res.status(400).json({ error: 'No skills listed on this trainer — add skills to the trainer profile before sending.' });
    }
    candidates = [{
      name: t.name || '—',
      totalExperience: t.experienceYears ? `${t.experienceYears} Years` : '—',
      demoDate: demoDateOverride,
      demoTimeIst: demoTimeOverride ? `${demoTimeOverride} IST` : '',
      zoneTimes: istToUsZones(demoTimeOverride, demoDateOverride),
      mustHaveSkills: skillList,
      softSkills: DEFAULT_SOFT_SKILLS,
    }];
  } else {
    // Build candidates with a smart fallback: if structured mustHaveSkills is missing
    // on a proposal, derive it from the linked trainer's freeform "skills" string
    // (same approach as the primaryTrainer fallback above). Only error out if a
    // trainer truly has no skill data anywhere — that's the real blocker, not the
    // recruiter having skipped the structured matrix.
    const parseSkillsString = (raw: string | null | undefined) =>
      (raw || '').split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12)
        .map((skill) => ({ skill, proficiency: 4 }));
    const built = baseList.map((p: any) => {
      const proposalSkills = Array.isArray(p.mustHaveSkills) ? p.mustHaveSkills : [];
      const fallbackSkills = proposalSkills.length === 0
        ? parseSkillsString(p.trainerSkills || p.trainer?.skills)
        : proposalSkills;
      return {
        name: p.trainer?.name || p.trainerName || '—',
        totalExperience: p.experienceYears ? `${p.experienceYears} Years` : '—',
        demoDate: demoDateOverride,
        demoTimeIst: demoTimeOverride ? `${demoTimeOverride} IST` : '',
        zoneTimes: istToUsZones(demoTimeOverride, demoDateOverride),
        mustHaveSkills: fallbackSkills,
        softSkills: Array.isArray(p.softSkills) && p.softSkills.length > 0 ? p.softSkills : DEFAULT_SOFT_SKILLS,
      };
    });
    const trulyEmpty = built.filter((c) => c.mustHaveSkills.length === 0);
    if (trulyEmpty.length > 0) {
      return res.status(400).json({
        error: `Skill matrix incomplete — ${trulyEmpty.length} trainer(s) have no skill data anywhere (proposal mustHaveSkills + trainer pool skills both empty): ${trulyEmpty.map((c) => c.name).join(', ')}. Ask Aman/Kanchan to fill skills on the trainer's pool profile.`,
      });
    }
    candidates = built;
  }
  const subject = `MITS · Proposed trainer profiles for ${client.name}`;
  const html = buildSkillMatrixHtml({ clientName: client.name, candidates, introNote: req.body?.introNote });
  const text = buildSkillMatrixText({ clientName: client.name, candidates, introNote: req.body?.introNote });

  // Sender = current user — uses per-user gmail if configured
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });
  let fromUser;
  if (me?.gmailAddress && me?.smtpAppPassword) {
    fromUser = {
      id: me.id, name: me.name, gmailAddress: me.gmailAddress,
      appPasswordPlain: decryptSecret(me.smtpAppPassword),
      sendAsAddress: me.sendAsAddress,
    };
  }

  const msg = await prisma.outboundMessage.create({
    data: {
      kind: 'Email',
      toEmail,
      subject,
      body: text,
      clientId: client.id,
      sentById: req.user!.id,
      status: 'Queued',
      provider: 'smtp',
    },
  });
  try {
    // Generate the matrix PDF attachment — Anjali's ask: clients should get the
    // matrix both inline AND as a portable file they can forward/save.
    // Best-effort: if PDF build throws we still send the email with HTML body.
    let pdfAttachment: { filename: string; content: Buffer; contentType: string } | undefined;
    try {
      const pdfBuf = await buildSkillMatrixPdf({
        clientName: client.name,
        candidates,
        introNote: req.body?.introNote,
      });
      const safeName = (client.name || 'client').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);
      pdfAttachment = {
        filename: `MITS_Skillset_Matrix_${safeName}.pdf`,
        content: pdfBuf,
        contentType: 'application/pdf',
      };
    } catch (pdfErr) {
      console.warn('[skill-matrix] PDF build failed, sending without attachment:', (pdfErr as any)?.message);
    }
    const r = await sendEmail({
      to: toEmail,
      cc: req.body?.cc || undefined,
      subject,
      body: text,
      htmlBody: html,
      fromUser,
      ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}),
    });
    await prisma.outboundMessage.update({
      where: { id: msg.id },
      data: { status: 'Sent', providerMessageId: r.id, provider: r.provider },
    });
    // Mark on the client that the matrix has been sent — unlocks Schedule demo
    await prisma.client.update({
      where: { id: client.id },
      data: { skillMatrixSentAt: new Date().toISOString().slice(0, 10), skillMatrixSentById: req.user!.id },
    });
    await audit(
      req.user!.id, req.user!.name, 'SKILL_MATRIX_SENT',
      `${client.name} · ${candidates.length} candidate(s) · ${toEmail}${pdfAttachment ? ' · pdf attached' : ''}`,
    );
    res.status(201).json({ ok: true, messageId: msg.id, candidates: candidates.length, pdfAttached: !!pdfAttachment });
  } catch (e: any) {
    await prisma.outboundMessage.update({
      where: { id: msg.id },
      data: { status: 'Failed', errorText: e.message || String(e) },
    });
    res.status(502).json({ error: 'Skill matrix send failed: ' + (e.message || String(e)), code: (e as any)?.code, messageId: msg.id });
  }
});

// Skill matrix · WhatsApp link builder. WhatsApp text has a length cap, so we send a
// compact summary + a note that the full matrix went via email.
clientsRouter.post('/:id/send-skill-matrix-whatsapp', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'demo_lead', 'demo_intake'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Samita, Anjali, Taran or admin can send the skill matrix' });
  }
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, phoneCode: true, phoneDigits: true, demoDate: true, demoTimeIst: true, primaryTrainerId: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const digits = `${client.phoneCode || ''}${client.phoneDigits || ''}`.replace(/[^0-9]/g, '');
  if (!digits) return res.status(400).json({ error: 'No phone on file for this client' });

  // Same date/time override pattern as the email send — persists to client too.
  const demoDateUse = (req.body?.demoDate as string) || client.demoDate || '';
  const demoTimeUse = (req.body?.demoTimeIst as string) || client.demoTimeIst || '';
  if ((req.body?.demoDate && req.body.demoDate !== client.demoDate)
      || (req.body?.demoTimeIst && req.body.demoTimeIst !== client.demoTimeIst)) {
    await prisma.client.update({
      where: { id: client.id },
      data: {
        demoDate: req.body?.demoDate || client.demoDate || null,
        demoTimeIst: req.body?.demoTimeIst || client.demoTimeIst || null,
      },
    });
  }

  // Pull proposals + assemble compact list
  const reqs = await prisma.sourcingRequest.findMany({
    where: { clientId: client.id, status: { in: ['Open', 'Proposed', 'Closed'] } },
    include: { proposals: { include: { trainer: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const allProposals = reqs.flatMap((r) => r.proposals);
  const passed = allProposals.filter((p: any) => p.verification === 'Pass');
  const baseList = passed.length > 0 ? passed : allProposals;

  // Internal Search fallback — synthesize from primary trainer when no proposals exist.
  type WaItem = { name: string; experienceYears?: number | null; mustHaveSkills: any[] };
  let waItems: WaItem[];
  if (baseList.length === 0) {
    if (!client.primaryTrainerId) {
      return res.status(400).json({ error: 'No trainer on file for this client — pick a trainer first.' });
    }
    const t = await prisma.trainer.findUnique({
      where: { id: client.primaryTrainerId },
      select: { name: true, experienceYears: true, skills: true },
    });
    if (!t) return res.status(400).json({ error: 'Primary trainer not found.' });
    const skillList = (t.skills || '')
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12)
      .map((skill) => ({ skill, proficiency: 4 }));
    waItems = [{ name: t.name || '—', experienceYears: t.experienceYears, mustHaveSkills: skillList }];
  } else {
    // Same fallback as send-skill-matrix (email): derive from trainer.skills string
    // when proposal-level mustHaveSkills is empty so the WA send doesn't silently
    // render skills as "—" for trainers Aman/Kanchan didn't fill manually.
    const parseSkillsWa = (raw: string | null | undefined) =>
      (raw || '').split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12)
        .map((skill) => ({ skill, proficiency: 4 }));
    waItems = baseList.map((p: any) => {
      const proposalSkills = Array.isArray(p.mustHaveSkills) ? p.mustHaveSkills : [];
      const fallbackSkills = proposalSkills.length === 0
        ? parseSkillsWa(p.trainerSkills || p.trainer?.skills)
        : proposalSkills;
      return {
        name: p.trainer?.name || p.trainerName || '—',
        experienceYears: p.experienceYears ?? p.trainer?.experienceYears ?? null,
        mustHaveSkills: fallbackSkills,
      };
    });
  }

  // Compact text summary (WhatsApp message body)
  const lines: string[] = [];
  lines.push(`Hi ${client.name},`);
  lines.push('');
  lines.push(`MITS Consulting — proposed trainer profiles for your review:`);
  lines.push('');
  waItems.forEach((p, i) => {
    const name = p.name || `Candidate ${i + 1}`;
    const exp = p.experienceYears ? `${p.experienceYears} yrs exp` : '';
    const skills = (p.mustHaveSkills || [])
      .map((s: any) => `${s.skill} (${(s.proficiency ?? 0).toFixed(1)}/5)`)
      .join(', ');
    lines.push(`${i + 1}. ${name}${exp ? ' · ' + exp : ''}`);
    if (skills) lines.push(`   Skills: ${skills}`);
  });
  if (demoDateUse) {
    lines.push('');
    lines.push(`Proposed demo: ${demoDateUse}${demoTimeUse ? ' · ' + demoTimeUse + ' IST' : ''}`);
  }
  lines.push('');
  lines.push(`The detailed skillset matrix has been shared on your email — please review and confirm your preferred candidate.`);
  lines.push('');
  lines.push(`— MITS Consulting`);
  const text = lines.join('\n');
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

  await prisma.outboundMessage.create({
    data: {
      kind: 'WhatsApp',
      toPhone: digits,
      toName: client.name,
      body: text,
      clientId: client.id,
      sentById: req.user!.id,
      status: 'Logged',
      provider: 'wa-link',
    },
  });
  // Mark on the client that the matrix has been shared — unlocks Schedule demo even
  // when the WhatsApp channel was used standalone (e.g. client has no email).
  await prisma.client.update({
    where: { id: client.id },
    data: { skillMatrixSentAt: new Date().toISOString().slice(0, 10), skillMatrixSentById: req.user!.id },
  });
  await audit(req.user!.id, req.user!.name, 'SKILL_MATRIX_SENT_WA', `${client.name} · ${digits}`);
  res.json({ ok: true, url, text });
});

// Manual "mark as sent" — Anjali/Taran sometimes share the matrix outside the portal
// (e.g. WhatsApp on their phone). They can click this to unlock Schedule demo without
// triggering an email or WhatsApp tab.
clientsRouter.post('/:id/mark-skill-matrix-sent', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'demo_lead', 'demo_intake'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Samita, Anjali, Taran or admin can mark the skill matrix sent' });
  }
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, demoDate: true, demoTimeIst: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  await prisma.client.update({
    where: { id: client.id },
    data: {
      skillMatrixSentAt: new Date().toISOString().slice(0, 10),
      skillMatrixSentById: req.user!.id,
      // Save demo date/time if the caller passed them (so the audit + downstream steps have context).
      demoDate: req.body?.demoDate || client.demoDate || null,
      demoTimeIst: req.body?.demoTimeIst || client.demoTimeIst || null,
    },
  });
  await audit(req.user!.id, req.user!.name, 'SKILL_MATRIX_MARK_SENT', `${client.name} · manual`);
  res.json({ ok: true });
});

// ─── Welcome email (Samita / Anjali) ───────────────────────────────────────
// Sends the branded "Introducing MITS Solution" welcome email to the client.
// Body: HTML template from lib/welcomeEmail.ts (matches Samita's provided sample).
// CC: defaults to vaibhav.aggarwal@mitssolution.com so founder has visibility.
clientsRouter.post('/:id/welcome-email', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'demo_lead', 'demo_intake'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Samita, Anjali, Taran or admin can send the welcome email' });
  }
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, email: true, intakeData: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const toEmail = client.email || (client.intakeData as any)?.client_email || '';
  if (!toEmail) return res.status(400).json({ error: 'No email on file for this client' });

  // Sender = current user. Prefer per-user gmail if configured.
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true, phone: true, role: true },
  });
  const senderEmail = me?.gmailAddress || 'samita@mitssolution.com';
  const senderName = me?.name || 'Samita Gupta';
  const senderPhone = me?.phone || '+91 73476 13659';
  // Friendly title for the contact card based on role
  const senderTitle =
    me?.role === 'demo_lead' ? 'Customer Success Manager' :
    me?.role === 'demo_intake' ? 'Client Coordinator' :
    me?.role === 'sales_closer' ? 'Sales' :
    me?.role === 'manager' ? 'Operations Manager' :
    me?.role === 'founder' ? 'Founder' :
    '';
  let fromUser;
  if (me?.gmailAddress && me?.smtpAppPassword) {
    fromUser = {
      id: me.id, name: me.name, gmailAddress: me.gmailAddress,
      appPasswordPlain: decryptSecret(me.smtpAppPassword),
      sendAsAddress: me.sendAsAddress,
    };
  }

  const html = buildWelcomeEmailHtml({
    clientName: client.name,
    senderName,
    senderEmail,
    senderPhone,
    senderTitle,
    signatureUrl: req.body?.signatureUrl || undefined,
  });
  const plainText = [
    `Hi ${client.name || 'Dear'},`,
    ``,
    `On behalf of MITS Solution, a warm welcome — thank you for considering our services.`,
    ``,
    `Client Interest Document: https://drive.google.com/file/d/1NcZHkYtbmfojQMK48m5KmgvTC_CU2ofD/view?usp=drive_link`,
    ``,
    `Your dedicated team:`,
    ` • Anjali — Client Coordinator (demo host, scheduling)`,
    ` • Samita — Customer Success Manager (L1 escalations, recurring payments)`,
    ``,
    `Once the demo is done, our sales team (sales@mitssolution.com) will reach out for the payment process.`,
    ``,
    `Warm regards,`,
    senderName,
    `MITS Consulting`,
    `https://mitssolution.com`,
  ].join('\n');

  // Persist message + send
  const msg = await prisma.outboundMessage.create({
    data: {
      kind: 'Email',
      toEmail,
      subject: WELCOME_EMAIL_SUBJECT,
      body: plainText,
      clientId: client.id,
      sentById: req.user!.id,
      status: 'Queued',
      provider: 'smtp',
    },
  });
  try {
    const r = await sendEmail({
      to: toEmail,
      cc: req.body?.cc || 'vaibhav.aggarwal@mitssolution.com',
      subject: WELCOME_EMAIL_SUBJECT,
      body: plainText,
      htmlBody: html,
      fromUser,
    });
    await prisma.outboundMessage.update({
      where: { id: msg.id },
      data: { status: 'Sent', providerMessageId: r.id, provider: r.provider },
    });
    await audit(req.user!.id, req.user!.name, 'WELCOME_EMAIL_SENT', `${client.name} · ${toEmail}`);
    res.status(201).json({ ok: true, messageId: msg.id, providerMessageId: r.id });
  } catch (e: any) {
    await prisma.outboundMessage.update({
      where: { id: msg.id },
      data: { status: 'Failed', errorText: e.message || String(e) },
    });
    res.status(502).json({ error: 'Welcome email send failed: ' + (e.message || String(e)), code: (e as any)?.code, messageId: msg.id });
  }
});

// ─── Post-demo feedback (Samita) → auto-route to Roshni / Anjali / Hold ────
// outcome:
//   'Positive'  → SaleClosing (assigned to Roshni)
//   'Negative'  → WithRecruiters (back to recruiter loop, Anjali handles)
//   'NeedTime'  → Hold with 3-day check-back for Roshni follow-up
clientsRouter.post('/:id/post-demo-feedback', async (req: AuthedRequest, res) => {
  const { outcome, note } = req.body as { outcome: 'Positive' | 'Negative' | 'NeedTime'; note?: string };
  if (!['Positive', 'Negative', 'NeedTime'].includes(outcome)) {
    return res.status(400).json({ error: 'outcome must be Positive | Negative | NeedTime' });
  }
  // Permission: only Samita (demo_lead), managers and founder may record this
  if (!['founder', 'manager', 'demo_lead'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Samita (demo_lead) or admin can record post-demo feedback' });
  }
  const existing = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: { id: true, lifecycle: true, name: true, primaryTrainerId: true, salesOwnerId: true },
  });
  if (!existing) return res.status(404).json({ error: 'Client not found' });
  if (existing.lifecycle !== 'FeedbackPending' && existing.lifecycle !== 'DemoDone') {
    return res.status(409).json({ error: `Post-demo feedback can only be recorded when client is in FeedbackPending or DemoDone (current: ${existing.lifecycle}).` });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const baseUpdate: any = {
    demoOutcome: outcome === 'NeedTime' ? 'Neutral' : outcome,
    postDemoFeedbackBy: req.user!.id,
    postDemoFeedbackAt: today,
    postDemoFeedbackNote: note || null,
  };

  if (outcome === 'Positive') {
    // Route to Roshni for payment closing
    baseUpdate.lifecycle = 'SaleClosing';
    baseUpdate.salesOwnerId = existing.salesOwnerId || 'u-roshni';
  } else if (outcome === 'Negative') {
    // Re-loop: send back to recruiters via Anjali's intake
    baseUpdate.lifecycle = 'WithRecruiters';
  } else {
    // NeedTime → Hold with 3-day check-back
    baseUpdate.lifecycle = 'Hold';
    baseUpdate.holdSince = today;
    baseUpdate.holdReason = note || 'Client needs time to decide post-demo';
    const cb = new Date(); cb.setDate(cb.getDate() + 3);
    baseUpdate.holdCheckBackOn = cb.toISOString().slice(0, 10);
    baseUpdate.holdResumeFromStage = existing.lifecycle;
  }

  const updated = await prisma.client.update({
    where: { id: existing.id },
    data: baseUpdate,
    include,
  });

  // For negative feedback, auto-create a sourcing request to recruiters (same logic as stage transition)
  if (outcome === 'Negative') {
    try {
      const open = await prisma.sourcingRequest.findFirst({
        where: { clientId: existing.id, status: { in: ['Open', 'Proposed'] } },
      });
      if (!open) {
        const DEFAULT_RECRUITER_FOR: Record<string, string> = { 'u-anjali': 'u-aman', 'u-taran': 'u-kanchan' };
        const sentToId =
          DEFAULT_RECRUITER_FOR[req.user!.id] ||
          DEFAULT_RECRUITER_FOR[(updated as any).intakeOwnerId || ''] ||
          'u-aman';
        await prisma.sourcingRequest.create({
          data: { clientId: existing.id, sentById: req.user!.id, sentToId, sentAt: today, status: 'Open' },
        });
      }
    } catch (e) {
      console.error('Auto-sourcing on negative feedback failed (non-fatal):', e);
    }
  }

  await audit(
    req.user!.id, req.user!.name, 'POST_DEMO_FEEDBACK',
    `${existing.name}: ${outcome}${note ? ' — ' + note : ''} → ${baseUpdate.lifecycle}`,
  );
  res.json(updated);
});

// Manual resend of demo invite (for reschedules or "forgot to send the first time")
clientsRouter.post('/:id/demo-invite', async (req: AuthedRequest, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { primaryTrainer: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  if (!client.demoDate) return res.status(400).json({ error: 'No demo date set on this client' });
  // Find latest scheduled demo (or create a synthetic one for the invite)
  const latest = await prisma.demo.findFirst({
    where: { clientId: client.id, status: { in: ['Scheduled', 'Rescheduled'] } },
    orderBy: { createdAt: 'desc' },
  });
  const demoId = latest?.id || `manual-${Date.now()}`;
  try {
    await sendDemoInvite(req, demoId, client);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(502).json({ error: e.message || 'Invite send failed' });
  }
});

// Multi-trainer demo scheduling. Anjali can schedule demos for 2+ trainers at once,
// each with their own date/time (matching each trainer's availability). Creates one
// Demo row per slot and sends a separate, per-trainer calendar invite.
clientsRouter.post('/:id/schedule-multi-demo', async (req: AuthedRequest, res) => {
  const allowed = ['founder', 'manager', 'demo_lead', 'demo_intake'];
  if (!allowed.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only Samita, Anjali, Taran or admin can schedule demos.' });
  }
  const { slots, sendInvite = true } = req.body as {
    slots: { trainerId: string; date: string; timeIst: string }[];
    sendInvite?: boolean;
  };
  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ error: 'At least one slot required.' });
  }
  for (const s of slots) {
    if (!s.trainerId || !s.date || !s.timeIst) {
      return res.status(400).json({ error: 'Every slot needs trainerId, date and timeIst.' });
    }
  }

  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: { primaryTrainer: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Mirror /stage endpoint's two safety gates so multi-schedule can't be used to
  // bypass them. These were missing originally, letting a client at SaleClosing
  // (or similar downstream stage) be force-rewound to DemoScheduled with no audit.
  // 1) Direction validator — refuses jumps that aren't in the lifecycle matrix.
  // 2) Skill-matrix sent gate (founder/manager bypass for escape hatch).
  if (client.lifecycle !== 'DemoScheduled') {
    const valid = isValidTransition(client.lifecycle, 'DemoScheduled');
    if (!valid.ok) return res.status(409).json({ error: valid.reason });
  }
  if (!['founder', 'manager'].includes(req.user!.role) && !client.skillMatrixSentAt) {
    return res.status(409).json({
      error: 'Skill matrix not sent to client yet. Open the client → "Send skill matrix to client" before scheduling the demo.',
    });
  }

  // Sort by date+time → earliest is the headline
  const sorted = [...slots].sort((a, b) => `${a.date} ${a.timeIst}`.localeCompare(`${b.date} ${b.timeIst}`));
  const earliest = sorted[0];

  const results: { trainerId: string; trainerName: string; demoId: string; date: string; timeIst: string }[] = [];

  for (const slot of sorted) {
    const trainer = await prisma.trainer.findUnique({ where: { id: slot.trainerId } });
    if (!trainer) {
      console.warn(`[schedule-multi-demo] trainer ${slot.trainerId} not found, skipping`);
      continue;
    }

    // Find existing scheduled demo for this trainer (so updates don't duplicate)
    const existing = await prisma.demo.findFirst({
      where: { clientId: client.id, trainerId: slot.trainerId, status: { in: ['Scheduled', 'Rescheduled'] } },
      orderBy: { createdAt: 'desc' },
    });
    let demo;
    if (existing) {
      demo = await prisma.demo.update({
        where: { id: existing.id },
        data: {
          scheduledDate: slot.date,
          scheduledTimeIst: slot.timeIst,
          status: 'Rescheduled',
        },
      });
    } else {
      demo = await prisma.demo.create({
        data: {
          clientId: client.id,
          trainerId: slot.trainerId,
          scheduledDate: slot.date,
          scheduledTimeIst: slot.timeIst,
          status: 'Scheduled',
        },
      });
    }

    if (sendInvite) {
      try {
        await sendDemoInvite(req, demo.id, client, { trainer, date: slot.date, timeIst: slot.timeIst });
      } catch (e: any) {
        console.error(`[schedule-multi-demo] invite failed for ${trainer.name}:`, e?.message || e);
      }
    }

    // Notify the recruiter who proposed this trainer (if different from caller)
    try {
      const proposal = await prisma.proposal.findFirst({
        where: { trainerId: slot.trainerId, request: { clientId: client.id } },
        orderBy: { proposedAt: 'desc' },
        select: { proposedById: true },
      });
      if (proposal?.proposedById && proposal.proposedById !== req.user!.id) {
        await notify({
          userId: proposal.proposedById,
          kind: 'DemoScheduled',
          title: `Your trainer is on demo — ${client.name}`,
          body: `${trainer.name} is doing the demo on ${slot.date} at ${slot.timeIst} IST. Heads up so you can stay in the loop.`,
          link: `/clients/${client.id}`,
          email: true,
        });
      }
    } catch (e) {
      console.warn('[schedule-multi-demo] notify recruiter failed:', (e as any)?.message);
    }

    results.push({ trainerId: slot.trainerId, trainerName: trainer.name, demoId: demo.id, date: slot.date, timeIst: slot.timeIst });
  }

  // Update headline fields on client (earliest demo = the public-facing date/time)
  await prisma.client.update({
    where: { id: client.id },
    data: {
      demoDate: earliest.date,
      demoTimeIst: earliest.timeIst,
      ...(client.primaryTrainerId ? {} : { primaryTrainerId: earliest.trainerId }),
    },
  });

  // Move to DemoScheduled if not already there
  if (client.lifecycle !== 'DemoScheduled') {
    await prisma.client.update({
      where: { id: client.id },
      data: { lifecycle: 'DemoScheduled' },
    });
    await audit(
      req.user!.id, req.user!.name, 'STAGE_CHANGE',
      `${client.name}: ${client.lifecycle} → DemoScheduled (multi-trainer · ${results.length} slot${results.length === 1 ? '' : 's'})`,
    );
  } else {
    await audit(
      req.user!.id, req.user!.name, 'DEMO_RESCHEDULED',
      `${client.name}: multi-trainer reschedule · ${results.length} slot${results.length === 1 ? '' : 's'}`,
    );
  }

  res.json({ ok: true, scheduled: results });
});

// ─── Demo invite (ICS) helper ───────────────────────────────────────────────
//
// Privacy model: Client and trainer emails are NEVER shared with each other.
// We send TWO separate emails (one to client, one to trainer), each with the
// recipient ONLY in BCC (To = organizer's own address). The ICS attendees list
// for each email contains only that recipient + organizer.

function formatDemoDateLong(yyyyMmDd: string): string {
  try {
    const d = new Date(yyyyMmDd + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return yyyyMmDd; }
}

async function sendDemoInvite(
  req: AuthedRequest,
  demoId: string,
  client: any,
  overrides?: { trainer?: any; date?: string; timeIst?: string },
) {
  // Per-slot overrides (multi-trainer scheduling) — fall back to client fields.
  const date = overrides?.date || client.demoDate;
  if (!date) return; // need a date to build an ICS

  const time = (overrides?.timeIst || client.demoTimeIst || '20:00').padEnd(5, '0').slice(0, 5);
  const startISO = `${date}T${time}:00+05:30`;

  // Resolve trainer (override > primary)
  const trainer = overrides?.trainer ?? (client.primaryTrainer || (client.primaryTrainerId
    ? await prisma.trainer.findUnique({ where: { id: client.primaryTrainerId } })
    : null));
  const clientEmail = client.email || (client.intakeData as any)?.client_email || '';
  const trainerEmail = trainer?.email || '';
  if (!clientEmail && !trainerEmail) {
    console.log(`Skipping demo invite for ${client.name}: no client/trainer email`);
    return;
  }

  // Organizer = the user who scheduled. Use their Gmail if configured.
  const organizer = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });
  const orgEmail = organizer?.gmailAddress || process.env.SMTP_FROM?.match(/<([^>]+)>/)?.[1] || process.env.SMTP_USER || 'ops@mitssolution.com';
  const orgName = organizer?.name || 'MITS Consulting';
  let fromUser: { id: string; name: string; gmailAddress: string; appPasswordPlain: string; sendAsAddress?: string | null } | undefined;
  if (organizer?.gmailAddress && organizer?.smtpAppPassword) {
    fromUser = {
      id: organizer.id, name: organizer.name, gmailAddress: organizer.gmailAddress,
      appPasswordPlain: decryptSecret(organizer.smtpAppPassword),
      sendAsAddress: organizer.sendAsAddress,
    };
  }

  const skills = (client.intakeData as any)?.detailed_skill_set || client.intakeSkillHint || '';
  const meetingTool = (client.intakeData as any)?.meeting_tool || 'Zoom (joining link will be shared separately)';
  const longDate = formatDemoDateLong(date);
  const subject = `Demo Session Invitation · ${longDate} at ${time} IST`;
  const ics_summary = `MITS Demo · ${client.name}${trainer ? ' × ' + trainer.name : ''}`;

  // Build a per-recipient, personalised email body
  function buildBody(recipientName: string, role: 'client' | 'trainer'): { text: string; ics_desc: string } {
    const greeting = `Dear ${recipientName || 'Sir/Madam'},`;
    const intro = role === 'client'
      ? `You are warmly invited to a personalised demo session arranged by MITS Consulting. Our team has selected a trainer aligned with the skill set you shared, and the session details are confirmed as below.`
      : `Greetings from MITS Consulting. We are pleased to confirm your upcoming demo session with one of our clients. Kindly find the session details below.`;

    const counterpartyLine = role === 'client'
      ? (trainer ? `Trainer:          ${trainer.name}${trainer.skills ? ` · ${trainer.skills}` : ''}` : null)
      : `Skill focus:      ${skills || 'as discussed during onboarding'}`;

    const lines = [
      greeting,
      '',
      intro,
      '',
      '────────────────────────────────────────',
      `Session date:     ${longDate}`,
      `Session time:     ${time} IST (Indian Standard Time)`,
      `Duration:         60 minutes`,
      counterpartyLine,
      `Meeting platform: ${meetingTool}`,
      '────────────────────────────────────────',
      '',
      'A calendar invitation (.ics) is attached with this email. Adding it to your calendar will automatically reserve the slot and send you a reminder before the session begins.',
      '',
      'Kindly join the meeting 5 minutes before the scheduled time. The joining link will be circulated shortly before the session.',
      '',
      'Should you wish to reschedule or have any questions, please feel free to reply to this email directly.',
      '',
      'We look forward to a productive session.',
      '',
      'Warm regards,',
      orgName,
      'MITS Consulting',
      'https://mitssolution.com',
    ].filter(Boolean) as string[];

    const ics_desc = [
      `Demo session arranged by MITS Consulting.`,
      ``,
      `Date: ${longDate}`,
      `Time: ${time} IST`,
      counterpartyLine,
      `Platform: ${meetingTool}`,
      ``,
      `Organiser: ${orgName} (MITS Consulting)`,
      ``,
      `Reply to this invite to confirm or reschedule.`,
    ].filter(Boolean).join('\n');

    return { text: lines.join('\n'), ics_desc };
  }

  // Helper to deliver to one party. Puts the recipient in "To" (not BCC) so Gmail's
  // auto-add-to-Calendar treats it as a real invite addressed to them.
  // Per recipient, only that recipient is listed as the ICS attendee (privacy preserved —
  // the other party's email is never disclosed across recipients).
  async function deliverOne(recipientName: string, recipientEmail: string, role: 'client' | 'trainer' | 'organizer') {
    // Reuse the client/trainer body for the organizer copy (treat them as 'client' POV is closest).
    const bodyRole: 'client' | 'trainer' = role === 'trainer' ? 'trainer' : 'client';
    const { text, ics_desc } = buildBody(recipientName, bodyRole);
    const ics = buildIcsInvite({
      uid: `${demoId}-${role}`,
      summary: ics_summary,
      description: ics_desc,
      location: meetingTool,
      organizerName: orgName,
      organizerEmail: orgEmail,
      startISO,
      durationMinutes: 60,
      attendees: [{ name: recipientName, email: recipientEmail }],
      method: 'REQUEST',
    });
    await sendEmail({
      to: recipientEmail,           // recipient in To so Gmail auto-adds the ICS to their Calendar
      subject,
      body: text,
      icsAttachment: { filename: 'mits-demo-session.ics', content: ics, method: 'REQUEST' },
      fromUser,
    });
  }

  const sentTo: string[] = [];
  if (clientEmail) {
    await deliverOne(client.name, clientEmail, 'client');
    sentTo.push(`client(${clientEmail})`);
  }
  if (trainerEmail) {
    await deliverOne(trainer.name, trainerEmail, 'trainer');
    sentTo.push(`trainer(${trainerEmail})`);
  }
  // Also deliver an invite to the scheduler (organizer) so the demo lands on THEIR
  // Google Calendar too — fixes "calendar invites not syncing with email calendar".
  // Only if the organizer has a real email and it's not the same as client/trainer already on the list.
  if (orgEmail && orgEmail !== clientEmail && orgEmail !== trainerEmail) {
    try {
      await deliverOne(orgName, orgEmail, 'organizer');
      sentTo.push(`organizer(${orgEmail})`);
    } catch (e) {
      console.warn('[demo invite] organizer copy failed:', (e as any)?.message);
    }
  }

  await audit(
    req.user!.id, req.user!.name, 'DEMO_INVITE_SENT',
    `${client.name} · ${date} ${time} IST${trainer ? ' · trainer ' + trainer.name : ''} · To ${sentTo.join(', ')}`,
  );
}
