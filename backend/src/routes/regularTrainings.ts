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
import { flagOn } from '../lib/features';

export const regularTrainingsRouter = Router();
regularTrainingsRouter.use(requireAuth);

// Feature-flag gate. Runs before any route handler — 404 if the flag is off
// so the routes are completely invisible to off-flag deployments.
regularTrainingsRouter.use((_req, res, next) => {
  if (!flagOn('regularCalls')) return res.status(404).json({ error: 'Feature not enabled' });
  next();
});

const WRITE_ROLES = ['founder', 'manager', 'lead', 'account_manager'];
const READ_ROLES  = ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'];

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
      scheduleNotes: true, notes: true,
      hostedByDefault: { select: { id: true, name: true } },
      client:          { select: { id: true, name: true } },
      trainer:         { select: { id: true, name: true } },
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
      notes:                 b.notes                  || null,
      status:                b.status                 || 'active',
    },
  });
  await audit(req.user!.id, req.user!.name, 'REGULAR_TRAINING_CREATE', created.name);
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
  for (const k of ['name', 'status', 'recordingAccountEmail', 'recordingAccountLabel', 'recordingFolderUrl', 'scheduleNotes', 'notes', 'clientId', 'trainerId', 'hostedByDefaultId']) {
    if (k in b) data[k] = b[k] === '' ? null : b[k];
  }
  const updated = await prisma.regularTraining.update({ where: { id: req.params.id }, data });
  await audit(req.user!.id, req.user!.name, 'REGULAR_TRAINING_UPDATE', updated.name);
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
  const sessions = await prisma.trainingSession.findMany({
    where,
    select: {
      id: true, scheduledFor: true, status: true,
      actualStartAt: true, actualEndAt: true, durationMinutes: true,
      recordingUrl: true, feedback: true, notes: true,
      hostedBy: { select: { id: true, name: true } },
      regularTraining: { select: { id: true, name: true, recordingFolderUrl: true } },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 200,
  });
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
  const created = await prisma.trainingSession.create({
    data: {
      regularTrainingId: t.id,
      scheduledFor: dt,
      hostedById: b.hostedById || t.hostedByDefaultId || req.user!.id,
      status: 'scheduled',
      notes: b.notes || null,
    },
  });
  await audit(req.user!.id, req.user!.name, 'TRAINING_SESSION_SCHEDULED', `${t.name} · ${dt.toISOString().slice(0, 16)}`);
  res.status(201).json(created);
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
  for (const k of ['feedback', 'recordingUrl', 'notes', 'status']) {
    if (k in b) data[k] = b[k] === '' ? null : b[k];
  }
  const updated = await prisma.trainingSession.update({ where: { id: req.params.id }, data });
  await audit(req.user!.id, req.user!.name, 'TRAINING_SESSION_UPDATE', s.regularTraining.name);
  res.json(updated);
});
