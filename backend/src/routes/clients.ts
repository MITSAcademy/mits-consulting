import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';
import { notify } from '../lib/notify';
import { sendEmail, decryptSecret } from '../lib/mailer';
import { buildIcsInvite } from '../lib/ical';
import { buildWelcomeEmailHtml, WELCOME_EMAIL_SUBJECT } from '../lib/welcomeEmail';
import { buildSkillMatrixHtml, buildSkillMatrixText, istToUsZones, DEFAULT_SOFT_SKILLS } from '../lib/skillMatrix';
import { buildPreDemoReminderHtml, buildPreDemoReminderText, PRE_DEMO_REMINDER_SUBJECT } from '../lib/preDemoTrainerReminder';
import { buildEngagementLetterHtml, buildEngagementLetterText, ENGAGEMENT_LETTER_SUBJECT } from '../lib/engagementLetter';
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

  const client = await prisma.client.update({ where: { id: req.params.id }, data, include });

  // ─── Sourcing side-effects ────────────────────────────────────────────────
  // When a client lands at WithRecruiters and has no active sourcing request,
  // auto-create one routed to the right recruiter. This catches the case where
  // a client got back-moved post-demo and otherwise would be invisible to recruiters.
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
          });
        }
      }
    }
  } catch (e) {
    console.error('Auto-sourcing failed (non-fatal):', e);
  }

  // ─── Demo history side-effects ───────────────────────────────────────────
  // ─── Hold tracking bookkeeping ───────────────────────────────────────────
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
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true },
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
    fromUser = { id: me.id, name: me.name, gmailAddress: me.gmailAddress, appPasswordPlain: decryptSecret(me.smtpAppPassword) };
  }
  const msg = await prisma.outboundMessage.create({
    data: { kind: 'Email', toEmail, subject, body: text, clientId: client.id, sentById: req.user!.id, status: 'Queued', provider: 'smtp' },
  });
  try {
    // CC Mitali so she's aware of the incoming handover (her actual email if her gmail is set; else system fallback)
    const mitali = await prisma.user.findFirst({ where: { id: 'u-mitali' }, select: { gmailAddress: true } });
    const cc = mitali?.gmailAddress || undefined;
    const r = await sendEmail({ to: toEmail, cc, subject, body: text, htmlBody: html, fromUser });
    await prisma.outboundMessage.update({ where: { id: msg.id }, data: { status: 'Sent', providerMessageId: r.id, provider: r.provider } });
    await audit(req.user!.id, req.user!.name, 'ENGAGEMENT_LETTER_EMAIL', `${client.name} · ${toEmail}${cc ? ' · cc ' + cc : ''}`);
    res.status(201).json({ ok: true, messageId: msg.id });
  } catch (e: any) {
    await prisma.outboundMessage.update({ where: { id: msg.id }, data: { status: 'Failed', errorText: e.message || String(e) } });
    res.status(502).json({ error: 'Engagement letter send failed: ' + (e.message || String(e)), messageId: msg.id });
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
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true },
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
    fromUser = { id: me.id, name: me.name, gmailAddress: me.gmailAddress, appPasswordPlain: decryptSecret(me.smtpAppPassword) };
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
    res.status(502).json({ error: 'Handover welcome send failed: ' + (e.message || String(e)), messageId: msg.id });
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
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true },
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
    fromUser = { id: me.id, name: me.name, gmailAddress: me.gmailAddress, appPasswordPlain: decryptSecret(me.smtpAppPassword) };
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
    res.status(502).json({ error: 'Reminder send failed: ' + (e.message || String(e)), messageId: msg.id });
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
    select: { id: true, name: true, email: true, intakeData: true, demoDate: true, demoTimeIst: true },
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
  if (baseList.length === 0) {
    return res.status(400).json({ error: 'No proposals found for this client — recruiters must propose trainers first.' });
  }
  // Require at least one mustHaveSkills entry per candidate before sending (compulsory criteria)
  const missing = baseList.filter((p: any) => !Array.isArray(p.mustHaveSkills) || p.mustHaveSkills.length === 0);
  if (missing.length > 0) {
    return res.status(400).json({
      error: `Skill matrix incomplete — ${missing.length} proposed trainer(s) have no "Must Have Skills" filled in. Ask Aman/Kanchan to fill them.`,
    });
  }
  const candidates = baseList.map((p: any) => ({
    name: p.trainer?.name || p.trainerName || '—',
    totalExperience: p.experienceYears ? `${p.experienceYears} Years` : '—',
    demoDate: demoDateOverride,
    demoTimeIst: demoTimeOverride ? `${demoTimeOverride} IST` : '',
    zoneTimes: istToUsZones(demoTimeOverride, demoDateOverride),
    mustHaveSkills: p.mustHaveSkills,
    softSkills: Array.isArray(p.softSkills) && p.softSkills.length > 0 ? p.softSkills : DEFAULT_SOFT_SKILLS,
  }));
  const subject = `MITS · Proposed trainer profiles for ${client.name}`;
  const html = buildSkillMatrixHtml({ clientName: client.name, candidates, introNote: req.body?.introNote });
  const text = buildSkillMatrixText({ clientName: client.name, candidates, introNote: req.body?.introNote });

  // Sender = current user — uses per-user gmail if configured
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true },
  });
  let fromUser;
  if (me?.gmailAddress && me?.smtpAppPassword) {
    fromUser = {
      id: me.id, name: me.name, gmailAddress: me.gmailAddress,
      appPasswordPlain: decryptSecret(me.smtpAppPassword),
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
    const r = await sendEmail({
      to: toEmail,
      cc: req.body?.cc || undefined,
      subject,
      body: text,
      htmlBody: html,
      fromUser,
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
      `${client.name} · ${candidates.length} candidate(s) · ${toEmail}`,
    );
    res.status(201).json({ ok: true, messageId: msg.id, candidates: candidates.length });
  } catch (e: any) {
    await prisma.outboundMessage.update({
      where: { id: msg.id },
      data: { status: 'Failed', errorText: e.message || String(e) },
    });
    res.status(502).json({ error: 'Skill matrix send failed: ' + (e.message || String(e)), messageId: msg.id });
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
    select: { id: true, name: true, phoneCode: true, phoneDigits: true, demoDate: true, demoTimeIst: true },
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
  if (baseList.length === 0) {
    return res.status(400).json({ error: 'No proposals found for this client.' });
  }

  // Compact text summary (WhatsApp message body)
  const lines: string[] = [];
  lines.push(`Hi ${client.name},`);
  lines.push('');
  lines.push(`MITS Consulting — proposed trainer profiles for your review:`);
  lines.push('');
  baseList.forEach((p: any, i: number) => {
    const name = p.trainer?.name || p.trainerName || `Candidate ${i + 1}`;
    const exp = p.experienceYears ? `${p.experienceYears} yrs exp` : '';
    const skills = (Array.isArray(p.mustHaveSkills) ? p.mustHaveSkills : [])
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
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, phone: true, role: true },
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
    res.status(502).json({ error: 'Welcome email send failed: ' + (e.message || String(e)), messageId: msg.id });
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

async function sendDemoInvite(req: AuthedRequest, demoId: string, client: any) {
  if (!client.demoDate) return; // need a date to build an ICS

  // Build start time. demoTimeIst (HH:MM) is IST = +05:30
  const time = (client.demoTimeIst || '20:00').padEnd(5, '0').slice(0, 5);
  const startISO = `${client.demoDate}T${time}:00+05:30`;

  // Resolve emails
  const trainer = client.primaryTrainer || (client.primaryTrainerId
    ? await prisma.trainer.findUnique({ where: { id: client.primaryTrainerId } })
    : null);
  const clientEmail = client.email || (client.intakeData as any)?.client_email || '';
  const trainerEmail = trainer?.email || '';
  if (!clientEmail && !trainerEmail) {
    console.log(`Skipping demo invite for ${client.name}: no client/trainer email`);
    return;
  }

  // Organizer = the user who scheduled. Use their Gmail if configured.
  const organizer = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true },
  });
  const orgEmail = organizer?.gmailAddress || process.env.SMTP_FROM?.match(/<([^>]+)>/)?.[1] || process.env.SMTP_USER || 'ops@mitssolution.com';
  const orgName = organizer?.name || 'MITS Consulting';
  let fromUser: { id: string; name: string; gmailAddress: string; appPasswordPlain: string } | undefined;
  if (organizer?.gmailAddress && organizer?.smtpAppPassword) {
    fromUser = {
      id: organizer.id, name: organizer.name, gmailAddress: organizer.gmailAddress,
      appPasswordPlain: decryptSecret(organizer.smtpAppPassword),
    };
  }

  const skills = (client.intakeData as any)?.detailed_skill_set || client.intakeSkillHint || '';
  const meetingTool = (client.intakeData as any)?.meeting_tool || 'Zoom (joining link will be shared separately)';
  const longDate = formatDemoDateLong(client.demoDate);
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

  // Helper to send to one party with the recipient ONLY in BCC (privacy: no cross-visibility)
  async function deliverOne(recipientName: string, recipientEmail: string, role: 'client' | 'trainer') {
    const { text, ics_desc } = buildBody(recipientName, role);
    const ics = buildIcsInvite({
      uid: `${demoId}-${role}`,
      summary: ics_summary,
      description: ics_desc,
      location: meetingTool,
      organizerName: orgName,
      organizerEmail: orgEmail,
      startISO,
      durationMinutes: 60,
      // Only this recipient as attendee in their ICS — the other party is never disclosed
      attendees: [{ name: recipientName, email: recipientEmail }],
      method: 'REQUEST',
    });
    await sendEmail({
      to: orgEmail,                // organizer's own address — the visible "To" header
      bcc: recipientEmail,         // recipient gets it but their address is not visible to others
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

  await audit(
    req.user!.id, req.user!.name, 'DEMO_INVITE_SENT',
    `${client.name} · ${client.demoDate} ${time} IST · BCC ${sentTo.join(', ')}`,
  );
}
