/**
 * Regular Trainings + per-Session tracking.
 *
 * Mirrors the "RegularCalls - Recording links" Google sheet:
 *   training name | recording-account email | folder URL | host
 *
 * Routes only respond when FEATURES_REGULAR_CALLS=true. Otherwise the entire
 * router 404s, so flipping the flag off cleanly disables the feature without
 * needing a deploy.
 *
 * Access — same shape as MySessions:
 *   founder / manager / lead / account_manager → full CRUD + sessions
 *   demo_lead                                  → read-only view
 *   anyone else                                → 403
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';
import { buildIcsInvite } from '../lib/ical';
import { sendEmail, safeBuildFromUser } from '../lib/mailer';
import { notify } from '../lib/notify';

export const regularTrainingsRouter = Router();
regularTrainingsRouter.use(requireAuth);

// Feature flag removed — regularCalls is always enabled.

const WRITE_ROLES = ['founder', 'manager', 'lead', 'account_manager'];
const READ_ROLES  = ['founder', 'manager', 'lead', 'account_manager', 'demo_lead', 'demo_intake'];

function canWrite(role: string) { return WRITE_ROLES.includes(role); }
function canRead(role: string)  { return READ_ROLES.includes(role); }

// ── Trainings ─────────────────────────────────────────────────────────────

regularTrainingsRouter.get('/trainings', async (req: AuthedRequest, res) => {
  if (!canRead(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const status = (req.query.status as string) || undefined;
  const where: any = {};
  if (status) where.status = status;
  const trainings = await prisma.regularTraining.findMany({
    where,
    select: {
      id: true, name: true, status: true,
      recordingAccountEmail: true, recordingAccountLabel: true, recordingFolderUrl: true,
      scheduleNotes: true, defaultTimeIst: true, meetingMode: true,
      lastSessionStatus: true, lastSessionComment: true,
      lastClientFeedback: true, lastTrainerFeedback: true,
      lastSessionDate: true, weeklySessionCount: true, notes: true,
      hostedByDefault: { select: { id: true, name: true } },
      client:          { select: { id: true, name: true, whatsappGroupLink: true, phoneCode: true, phoneDigits: true } },
      trainer:         { select: { id: true, name: true, skills: true, phoneCode: true, phoneDigits: true } },
      updatedAt: true, createdAt: true,
      _count: { select: { sessions: true } },
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
  });
  res.json(trainings);
});

regularTrainingsRouter.post('/trainings', async (req: AuthedRequest, res) => {
  if (!canWrite(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const b = req.body || {};
  if (typeof b.name !== 'string' || !b.name.trim()) return res.status(400).json({ error: 'name required' });
  const created = await prisma.regularTraining.create({
    data: {
      name: b.name.trim(),
      clientId:              b.clientId               || null,
      trainerId:             b.trainerId              || null,
      hostedByDefaultId:     b.hostedByDefaultId      || null,
      recordingAccountEmail: b.recordingAccountEmail  || null,
      recordingAccountLabel: b.recordingAccountLabel  || null,
      recordingFolderUrl:    b.recordingFolderUrl     || null,
      scheduleNotes:         b.scheduleNotes          || null,
      defaultTimeIst:        b.defaultTimeIst         || null,
      meetingMode:           b.meetingMode            || null,
      lastSessionStatus:     b.lastSessionStatus      || null,
      lastSessionComment:    b.lastSessionComment     || null,
      notes:                 b.notes                  || null,
      status:                b.status                 || 'active',
    },
  });
  await audit(req.user!.id, req.user!.name, 'REGULAR_TRAINING_CREATE', created.name);

  // Notify the assigned host when someone else allocates a training to them
  if (created.hostedByDefaultId && created.hostedByDefaultId !== req.user!.id) {
    const clientName = b.clientId
      ? (await prisma.client.findUnique({ where: { id: b.clientId }, select: { name: true } }))?.name
      : null;
    await notify({
      userId: created.hostedByDefaultId,
      kind: 'new_session_allocated',
      title: `New training allocated to you: ${created.name}`,
      body: clientName ? `Client: ${clientName}. Check My Sessions for details.` : 'Check My Sessions for details.',
      link: '/my-sessions',
      email: true,
    });
  }

  res.status(201).json(created);
});

regularTrainingsRouter.get('/trainings/:id', async (req: AuthedRequest, res) => {
  if (!canRead(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const t = await prisma.regularTraining.findUnique({
    where: { id: req.params.id },
    include: {
      hostedByDefault: { select: { id: true, name: true } },
      client:          { select: { id: true, name: true } },
      trainer:         { select: { id: true, name: true } },
      sessions: {
        select: {
          id: true, scheduledFor: true, status: true,
          actualStartAt: true, actualEndAt: true, durationMinutes: true,
          recordingUrl: true, feedback: true, notes: true,
          delayReason: true, timezone: true, sessionType: true,
          checklist: true, trainerFeedbackJson: true, clientFeedbackJson: true,
          hostedBy: { select: { id: true, name: true } },
        },
        orderBy: { scheduledFor: 'desc' },
        take: 50,
      },
    },
  });
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(t);
});

regularTrainingsRouter.patch('/trainings/:id', async (req: AuthedRequest, res) => {
  if (!canWrite(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const b = req.body || {};
  const data: any = {};
  for (const k of ['name', 'status', 'recordingAccountEmail', 'recordingAccountLabel', 'recordingFolderUrl', 'scheduleNotes', 'defaultTimeIst', 'meetingMode', 'lastSessionStatus', 'lastSessionComment', 'lastClientFeedback', 'lastTrainerFeedback', 'lastSessionDate', 'weeklySessionCount', 'notes', 'clientId', 'trainerId', 'hostedByDefaultId', 'temporaryHostId', 'trainerReplacementReason']) {
    if (k in b) data[k] = b[k] === '' ? null : b[k];
  }
  // Require reason when changing trainer
  if ('trainerId' in b) {
    const existing = await prisma.regularTraining.findUnique({ where: { id: req.params.id }, select: { trainerId: true } });
    if (existing && existing.trainerId && existing.trainerId !== b.trainerId && !b.trainerReplacementReason) {
      return res.status(400).json({ error: 'Please provide a reason for changing the trainer.' });
    }
  }
  // Capture old host before update to detect reassignment
  const oldTraining = data.hostedByDefaultId !== undefined
    ? await prisma.regularTraining.findUnique({ where: { id: req.params.id }, select: { hostedByDefaultId: true, name: true, clientId: true } })
    : null;

  const updated = await prisma.regularTraining.update({ where: { id: req.params.id }, data });
  await audit(req.user!.id, req.user!.name, 'REGULAR_TRAINING_UPDATE', updated.name);

  // Notify newly assigned host (skip if self-assigning or no change)
  if (
    oldTraining &&
    data.hostedByDefaultId &&
    data.hostedByDefaultId !== oldTraining.hostedByDefaultId &&
    data.hostedByDefaultId !== req.user!.id
  ) {
    const clientName = updated.clientId
      ? (await prisma.client.findUnique({ where: { id: updated.clientId }, select: { name: true } }))?.name
      : null;
    await notify({
      userId: data.hostedByDefaultId,
      kind: 'new_session_allocated',
      title: `Training allocated to you: ${updated.name}`,
      body: clientName ? `Client: ${clientName}. Check My Sessions for details.` : 'Check My Sessions for details.',
      link: '/my-sessions',
      email: true,
    });
  }

  res.json(updated);
});

// Toggle Demo Team escalation flag — only available while ownerTeam is still demo_team
regularTrainingsRouter.post('/trainings/:id/escalate', async (req: AuthedRequest, res) => {
  if (!canWrite(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const training = await prisma.regularTraining.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, ownerTeam: true, demoEscalationRequested: true },
  });
  if (!training) return res.status(404).json({ error: 'Not found' });
  if (training.ownerTeam !== 'demo_team') {
    return res.status(400).json({ error: 'Client already transferred to coordinator team — escalation not needed.' });
  }
  const flag = !training.demoEscalationRequested;
  const updated = await prisma.regularTraining.update({
    where: { id: req.params.id },
    data: { demoEscalationRequested: flag },
  });
  await audit(req.user!.id, req.user!.name, flag ? 'DEMO_ESCALATION_REQUESTED' : 'DEMO_ESCALATION_CLEARED', training.name);
  res.json(updated);
});

regularTrainingsRouter.delete('/trainings/:id', async (req: AuthedRequest, res) => {
  if (!canWrite(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const t = await prisma.regularTraining.findUnique({ where: { id: req.params.id }, select: { name: true } });
  if (!t) return res.status(404).json({ error: 'Not found' });
  // Soft delete via archive — preserves session history.
  await prisma.regularTraining.update({ where: { id: req.params.id }, data: { status: 'archived' } });
  await audit(req.user!.id, req.user!.name, 'REGULAR_TRAINING_ARCHIVE', t.name);
  res.json({ ok: true });
});

// ── Weekly payment summary ─────────────────────────────────────────────────
// GET /weekly-summary?week=2026-W23 — returns per-host session counts for the
//   given ISO week (defaults to current week).  Used by AM payment summary UI.
// POST /weekly-summary/submit — AM submits week for review; notifies founders.

function currentISOWeek(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil((((now.getTime() - jan1.getTime()) / 86400000) + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Parse ISO week string (e.g. "2026-W23") to Mon–Sun bounds in UTC. */
function isoWeekBounds(week: string): { start: Date; end: Date } | null {
  const m = week.match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const wk   = parseInt(m[2], 10);
  // Jan 4 is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7; // Mon=1…Sun=7
  const w1Monday = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000);
  const start = new Date(w1Monday.getTime() + (wk - 1) * 7 * 86400000);
  const end   = new Date(start.getTime() + 7 * 86400000 - 1);
  return { start, end };
}

regularTrainingsRouter.get('/weekly-summary', async (req: AuthedRequest, res) => {
  if (!canRead(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const week = (req.query.week as string) || currentISOWeek();
  const bounds = isoWeekBounds(week);
  if (!bounds) return res.status(400).json({ error: 'Invalid week format — use YYYY-Www' });

  // Trainings with sessions that occurred in this week (lastSessionDate within week range)
  const trainings = await prisma.regularTraining.findMany({
    where: { status: 'active' },
    select: {
      id: true, name: true, weeklySessionCount: true, lastSessionDate: true,
      hostedByDefault: { select: { id: true, name: true } },
      client:  { select: { id: true, name: true } },
      trainer: { select: { id: true, name: true } },
      sessions: {
        where: {
          scheduledFor: { gte: bounds.start, lte: bounds.end },
          status: { in: ['completed', 'in_progress'] },
        },
        select: { id: true, scheduledFor: true, status: true, durationMinutes: true },
      },
    },
    orderBy: [{ hostedByDefault: { name: 'asc' } }, { name: 'asc' }],
  });

  // Group by host
  const byHost: Record<string, { hostId: string; hostName: string; rows: any[] }> = {};
  for (const t of trainings) {
    const hostName = t.hostedByDefault?.name || 'Unassigned';
    const hostId   = t.hostedByDefault?.id   || 'unassigned';
    if (!byHost[hostId]) byHost[hostId] = { hostId, hostName, rows: [] };
    byHost[hostId].rows.push({
      trainingId: t.id,
      trainingName: t.name,
      clientName: t.client?.name || null,
      trainerName: t.trainer?.name || null,
      // count from actual completed sessions OR the AM-override field
      sessionCount: t.sessions.length || t.weeklySessionCount || 0,
      weeklySessionCount: t.weeklySessionCount,
      lastSessionDate: t.lastSessionDate,
      sessions: t.sessions,
    });
  }

  res.json({ week, hosts: Object.values(byHost) });
});

// POST /weekly-summary/submit — mark the week as submitted, notify Mitali/Bhavneet
regularTrainingsRouter.post('/weekly-summary/submit', async (req: AuthedRequest, res) => {
  if (!canWrite(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const { week, overrides } = req.body || {};
  if (!week) return res.status(400).json({ error: 'week required (YYYY-Www)' });

  // Apply any AM overrides to weeklySessionCount
  if (Array.isArray(overrides)) {
    for (const o of overrides) {
      if (o.trainingId && typeof o.sessionCount === 'number') {
        await prisma.regularTraining.update({
          where: { id: o.trainingId },
          data: { weeklySessionCount: o.sessionCount },
        });
      }
    }
  }

  // Notify founders / Mitali (role = 'founder' or 'manager')
  const notifyTargets = await prisma.user.findMany({
    where: { active: true, role: { in: ['founder', 'manager'] } },
    select: { id: true },
  });
  const { notifyMany } = await import('../lib/notify');
  await notifyMany(
    notifyTargets.map((u) => u.id),
    {
      kind: 'payment_summary_submitted',
      title: `Weekly payment summary submitted for ${week}`,
      body: `Submitted by ${req.user!.name}. Please review session counts and approve payment.`,
      link: '/my-sessions',
      email: true,
    }
  );

  await audit(req.user!.id, req.user!.name, 'WEEKLY_SUMMARY_SUBMIT', week);
  res.json({ ok: true, week });
});

// ── Account-manager session sheet ─────────────────────────────────────────
// GET /trainings/my-sessions — returns all active RegularTrainings hosted by
// the current user, enriched with the most recent upcoming TrainingSession.
// Used by the "My clients & sessions" table on MySessionsPage for AM role.

regularTrainingsRouter.get('/my-sessions', async (req: AuthedRequest, res) => {
  if (!canRead(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const now = new Date();
  // account_manager sees only their own trainings (hostedByDefaultId = me).
  // lead/founder/manager sees all — they manage across AMs.
  const isSelf = req.user!.role === 'account_manager';
  const where: any = { status: 'active' };
  if (isSelf) where.hostedByDefaultId = req.user!.id;
  const trainings = await prisma.regularTraining.findMany({
    where,
    select: {
      id: true, name: true, scheduleNotes: true, defaultTimeIst: true,
      meetingMode: true, lastSessionStatus: true, lastSessionComment: true,
      lastClientFeedback: true, lastTrainerFeedback: true,
      lastSessionDate: true, weeklySessionCount: true, notes: true,
      completedSessionCount: true, ownerTeam: true, demoEscalationRequested: true,
      hostedByDefault: { select: { id: true, name: true } },
      temporaryHost:   { select: { id: true, name: true } },
      client:  { select: { id: true, name: true, whatsappGroupLink: true, phoneCode: true, phoneDigits: true } },
      trainer: { select: { id: true, name: true, skills: true, phoneCode: true, phoneDigits: true } },
      sessions: {
        where: { status: { in: ['scheduled', 'in_progress'] }, scheduledFor: { gte: now } },
        select: {
          id: true, scheduledFor: true, meetingLink: true, notes: true, status: true,
          actualStartAt: true, actualEndAt: true, durationMinutes: true,
          timezone: true, sessionType: true, checklist: true,
          trainerFeedbackJson: true, clientFeedbackJson: true, delayReason: true,
          hostedBy: { select: { id: true, name: true } },
        },
        orderBy: { scheduledFor: 'asc' },
        take: 1,
      },
    },
    orderBy: [{ hostedByDefault: { name: 'asc' } }, { name: 'asc' }],
  });
  res.json(trainings);
});

// ── Sessions ──────────────────────────────────────────────────────────────

// All sessions across all trainings — handy for the global "today" view.
regularTrainingsRouter.get('/sessions', async (req: AuthedRequest, res) => {
  if (!canRead(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const status = (req.query.status as string) || undefined;
  const mine = req.query.mine === 'true';
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo   = req.query.dateTo   as string | undefined;
  const where: any = {};
  if (status) where.status = status;
  if (mine)   where.hostedById = req.user!.id;
  if (dateFrom || dateTo) {
    where.scheduledFor = {};
    if (dateFrom) where.scheduledFor.gte = new Date(dateFrom);
    if (dateTo)   where.scheduledFor.lte = new Date(dateTo);
  }
  const raw = await prisma.trainingSession.findMany({
    where,
    select: {
      id: true, scheduledFor: true, status: true,
      actualStartAt: true, actualEndAt: true, durationMinutes: true,
      meetingLink: true, recordingUrl: true, feedback: true, notes: true,
      delayReason: true, timezone: true, sessionType: true,
      checklist: true, trainerFeedbackJson: true, clientFeedbackJson: true,
      hostedBy: { select: { id: true, name: true } },
      regularTraining: {
        select: {
          id: true, name: true, recordingFolderUrl: true,
          client:          { select: { id: true, name: true } },
          trainer:         { select: { id: true, name: true } },
          hostedByDefault: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 500,
  });
  // Rename regularTraining → training for frontend consistency
  const sessions = raw.map(({ regularTraining, ...s }) => ({ ...s, training: regularTraining }));
  res.json(sessions);
});

// Schedule a session under a training.
regularTrainingsRouter.post('/trainings/:id/sessions', async (req: AuthedRequest, res) => {
  if (!canWrite(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const t = await prisma.regularTraining.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, hostedByDefaultId: true } });
  if (!t) return res.status(404).json({ error: 'Training not found' });
  const b = req.body || {};
  if (!b.scheduledFor) return res.status(400).json({ error: 'scheduledFor required' });
  const dt = new Date(b.scheduledFor);
  if (isNaN(dt.getTime())) return res.status(400).json({ error: 'scheduledFor invalid' });
  const resolvedHostId = b.hostedById || t.hostedByDefaultId || req.user!.id;
  const created = await prisma.trainingSession.create({
    data: {
      regularTrainingId: t.id,
      scheduledFor: dt,
      hostedById: resolvedHostId,
      status: 'scheduled',
      notes: b.notes || null,
    },
  });
  await audit(req.user!.id, req.user!.name, 'TRAINING_SESSION_SCHEDULED', `${t.name} · ${dt.toISOString().slice(0, 16)}`);

  // Notify the host if someone else is scheduling this session for them
  if (resolvedHostId !== req.user!.id) {
    const training = await prisma.regularTraining.findUnique({
      where: { id: t.id },
      select: { client: { select: { name: true } } },
    });
    const clientName = training?.client?.name || null;
    await notify({
      userId: resolvedHostId,
      kind: 'new_session_allocated',
      title: `${t.name} · ${dt.toISOString().slice(0, 16)}`,
      body: clientName ? `Client: ${clientName}` : undefined,
      link: '/sessions',
      email: true,
    });
  }

  res.status(201).json(created);
});

// Schedule session + send ICS calendar invite to trainer, client, and the host (AM)
regularTrainingsRouter.post('/trainings/:id/sessions/invite', async (req: AuthedRequest, res) => {
  if (!canWrite(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const training = await prisma.regularTraining.findUnique({
    where: { id: req.params.id },
    include: {
      client:  { select: { id: true, name: true, email: true } },
      trainer: { select: { id: true, name: true, email: true } },
      hostedByDefault: { select: { id: true, name: true, email: true } },
    },
  });
  if (!training) return res.status(404).json({ error: 'Training not found' });

  const b = req.body || {};
  if (!b.scheduledFor) return res.status(400).json({ error: 'scheduledFor required (ISO datetime)' });
  const dt = new Date(b.scheduledFor);
  if (isNaN(dt.getTime())) return res.status(400).json({ error: 'scheduledFor invalid' });
  const durationMinutes = Number(b.durationMinutes) || 60;

  // Create the session record
  const session = await prisma.trainingSession.create({
    data: {
      regularTrainingId: training.id,
      scheduledFor: dt,
      hostedById: b.hostedById || training.hostedByDefault?.id || req.user!.id,
      status: 'scheduled',
      meetingLink: b.meetingLink || null,
      notes: b.notes || null,
    },
  });

  // Who is the organiser? The requesting user (Kashish/AM)
  const organiser = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, email: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });
  const organiserEmail = organiser?.gmailAddress || organiser?.email || process.env.SMTP_USER!;

  const startISO = dt.toISOString();
  const uid = `training-${session.id}`;
  // Trainer override: if caller specified a different trainer for this session's invite
  let trainerForInvite = training.trainer;
  if (b.trainerOverrideId && b.trainerOverrideId !== training.trainer?.id) {
    const overrideTrainer = await prisma.trainer.findUnique({
      where: { id: b.trainerOverrideId },
      select: { id: true, name: true, email: true },
    });
    if (overrideTrainer) trainerForInvite = overrideTrainer as typeof training.trainer;
  }

  const summary = `${training.name} · Session`;
  const location = b.meetingLink || b.location || 'Online (link will be shared)';
  const istLabel = dt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' });
  const description = [
    `Training: ${training.name}`,
    training.client  ? `Client:  ${training.client.name}`  : null,
    trainerForInvite ? `Trainer: ${trainerForInvite.name}` : null,
    `Date/time: ${istLabel} IST`,
    `Duration: ${durationMinutes} min`,
    b.notes ? `\nNotes: ${b.notes}` : null,
  ].filter(Boolean).join('\n');

  const results: string[] = [];
  const errors: string[] = [];

  // Recipients: trainer email, client email, organiser email
  const recipients: Array<{ name: string; email: string }> = [];
  if (trainerForInvite?.email) recipients.push({ name: trainerForInvite.name, email: trainerForInvite.email });
  if (training.client?.email)  recipients.push({ name: training.client.name,  email: training.client.email });
  // Always include the organiser (so it lands on their calendar)
  if (organiserEmail && !recipients.find((r) => r.email === organiserEmail)) {
    recipients.push({ name: organiser?.name || 'Organiser', email: organiserEmail });
  }
  // Always CC these stakeholders on every session invite
  const fixedCc = [
    'samita@mitssolution.com',
    'mitagg@mitssolution.com',       // Mitali
    'bhavneet.kaur@mitssolution.com', // Bhavneet
  ];

  const fromUser = organiser ? safeBuildFromUser(organiser) : undefined;

  for (const recipient of recipients) {
    const ics = buildIcsInvite({
      uid,
      summary,
      description,
      location,
      organizerName: organiser?.name || 'MITS',
      organizerEmail: organiserEmail,
      startISO,
      durationMinutes,
      attendees: [{ name: recipient.name, email: recipient.email }],
      method: 'REQUEST',
    });
    try {
      const cc = fixedCc.filter((a) => a !== recipient.email && a !== organiserEmail);
      await sendEmail({
        to: recipient.email,
        subject: `📅 ${summary} · ${istLabel} IST`,
        body: description,
        fromUser,
        cc: cc.length ? cc : undefined,
        icsAttachment: { filename: 'session-invite.ics', content: ics, method: 'REQUEST' },
      });
      results.push(recipient.email);
    } catch (e: any) {
      errors.push(`${recipient.email}: ${e.message}`);
    }
  }

  await audit(req.user!.id, req.user!.name, 'TRAINING_SESSION_INVITE',
    `${training.name} · ${dt.toISOString().slice(0, 16)} → ${results.join(', ')}`);
  res.status(201).json({ session, sent: results, errors });
});

// Punch in
regularTrainingsRouter.post('/sessions/:id/start', async (req: AuthedRequest, res) => {
  if (!canWrite(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const s = await prisma.trainingSession.findUnique({ where: { id: req.params.id }, select: { id: true, hostedById: true, regularTraining: { select: { name: true } } } });
  if (!s) return res.status(404).json({ error: 'Not found' });
  if (s.hostedById !== req.user!.id && !['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: "Not your session" });
  }
  const updated = await prisma.trainingSession.update({
    where: { id: req.params.id },
    data: { status: 'in_progress', actualStartAt: new Date() },
  });
  await audit(req.user!.id, req.user!.name, 'TRAINING_SESSION_STARTED', s.regularTraining.name);
  res.json(updated);
});

// Punch out — captures feedback + recording URL in the same call.
regularTrainingsRouter.post('/sessions/:id/end', async (req: AuthedRequest, res) => {
  if (!canWrite(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const b = req.body || {};
  const s = await prisma.trainingSession.findUnique({ where: { id: req.params.id }, select: { id: true, hostedById: true, actualStartAt: true, regularTraining: { select: { name: true } } } });
  if (!s) return res.status(404).json({ error: 'Not found' });
  if (s.hostedById !== req.user!.id && !['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: "Not your session" });
  }
  const endAt = new Date();
  let duration: number | null = null;
  if (s.actualStartAt) duration = Math.max(1, Math.round((endAt.getTime() - s.actualStartAt.getTime()) / 60_000));
  const updated = await prisma.trainingSession.update({
    where: { id: req.params.id },
    data: {
      status: 'completed',
      actualEndAt: endAt,
      durationMinutes: duration,
      ...(typeof b.feedback === 'string'    ? { feedback:    b.feedback.slice(0, 4000) } : {}),
      ...(typeof b.recordingUrl === 'string' ? { recordingUrl: b.recordingUrl.slice(0, 800) } : {}),
      ...(typeof b.notes === 'string'        ? { notes:        b.notes.slice(0, 2000) } : {}),
    },
  });

  // Increment completedSessionCount on the parent training; auto-transfer to coordinator_team at 4
  const training = await prisma.regularTraining.update({
    where: { id: updated.regularTrainingId },
    data: {
      completedSessionCount: { increment: 1 },
    },
    select: { completedSessionCount: true, ownerTeam: true },
  });
  if (training.completedSessionCount >= 4 && training.ownerTeam === 'demo_team') {
    await prisma.regularTraining.update({
      where: { id: updated.regularTrainingId },
      data: { ownerTeam: 'coordinator_team', demoEscalationRequested: false },
    });
  }

  await audit(req.user!.id, req.user!.name, 'TRAINING_SESSION_ENDED', `${s.regularTraining.name} · ${duration ? duration + 'min' : 'no timer'}`);
  res.json(updated);
});

// Patch feedback / recording URL after the fact
regularTrainingsRouter.patch('/sessions/:id', async (req: AuthedRequest, res) => {
  if (!canWrite(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const s = await prisma.trainingSession.findUnique({ where: { id: req.params.id }, select: { id: true, hostedById: true, regularTraining: { select: { name: true } } } });
  if (!s) return res.status(404).json({ error: 'Not found' });
  if (s.hostedById !== req.user!.id && !['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: "Not your session" });
  }
  const b = req.body || {};
  const data: any = {};
  for (const k of ['feedback', 'recordingUrl', 'notes', 'status', 'delayReason', 'timezone', 'sessionType', 'checklist', 'trainerFeedbackJson', 'clientFeedbackJson', 'meetingLink', 'scheduledFor', 'durationMinutes']) {
    if (k in b) data[k] = b[k] === '' ? null : b[k];
  }
  const updated = await prisma.trainingSession.update({ where: { id: req.params.id }, data });
  await audit(req.user!.id, req.user!.name, 'TRAINING_SESSION_UPDATE', s.regularTraining.name);
  res.json(updated);
});
