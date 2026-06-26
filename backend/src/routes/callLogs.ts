/**
 * Call log — account managers (Muskan, Kashish) + Bhavneet + Mitali log calls
 * they made to clients here. Lightweight: clientId + kind + outcome + notes.
 *
 * Roles:
 *   founder, manager, lead, account_manager → can create logs and see them
 *   accounts, payment_processor             → no access (not their work)
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const callLogsRouter = Router();
callLogsRouter.use(requireAuth);

const ALLOWED = ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'];

callLogsRouter.get('/', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const clientId = (req.query.clientId as string) || undefined;
  const mine = req.query.mine === 'true';
  const status = req.query.status as string | undefined;        // scheduled | in_progress | completed | missed
  const scheduledOnly = req.query.scheduledOnly === 'true';     // shorthand: only scheduled + in_progress
  const limit = Math.min(Number(req.query.limit) || 100, 500);

  const where: any = {};
  if (clientId) where.clientId = clientId;
  if (mine) where.byId = req.user!.id;
  if (status) where.status = status;
  if (scheduledOnly) where.status = { in: ['scheduled', 'in_progress'] };

  const orderBy: any = scheduledOnly
    ? [{ scheduledFor: 'asc' }, { calledAt: 'desc' }]
    : { calledAt: 'desc' };

  const logs = await prisma.callLog.findMany({
    where,
    select: {
      id: true, kind: true, outcome: true, durationMinutes: true, notes: true, calledAt: true,
      status: true, scheduledFor: true, actualStartAt: true, actualEndAt: true, feedback: true,
      activityType: true, sessionTookPlace: true, cancellationReason: true,
      client: { select: { id: true, name: true } },
      by:     { select: { id: true, name: true } },
    },
    orderBy,
    take: limit,
  });
  res.json(logs);
});

// Schedule a future call (status='scheduled', scheduledFor set, no actuals yet).
callLogsRouter.post('/schedule', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const { clientId, scheduledFor, kind, notes } = req.body || {};
  if (!clientId || !scheduledFor) return res.status(400).json({ error: 'clientId and scheduledFor required' });
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const dt = new Date(scheduledFor);
  if (isNaN(dt.getTime())) return res.status(400).json({ error: 'scheduledFor must be a valid date' });
  const log = await prisma.callLog.create({
    data: {
      clientId,
      byId: req.user!.id,
      kind: typeof kind === 'string' ? kind : 'checkin',
      status: 'scheduled',
      scheduledFor: dt,
      notes: typeof notes === 'string' ? notes.slice(0, 1000) : null,
    },
  });
  await audit(req.user!.id, req.user!.name, 'CALL_SCHEDULED', `${client.name} · ${dt.toISOString().slice(0, 16)}`);
  res.status(201).json(log);
});

// Punch in — start the call (status='in_progress', actualStartAt=now).
callLogsRouter.post('/:id/start', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const existing = await prisma.callLog.findUnique({ where: { id: req.params.id }, select: { id: true, byId: true, clientId: true, status: true, client: { select: { name: true } } } });
  if (!existing) return res.status(404).json({ error: 'Call not found' });
  // Only the owner can punch in (or founder/manager override)
  if (existing.byId !== req.user!.id && !['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: "This call belongs to someone else" });
  }
  const log = await prisma.callLog.update({
    where: { id: existing.id },
    data: { status: 'in_progress', actualStartAt: new Date() },
  });
  await audit(req.user!.id, req.user!.name, 'CALL_STARTED', existing.client.name);
  res.json(log);
});

// Punch out — end the call (status='completed', actualEndAt=now, durationMinutes auto-computed).
callLogsRouter.post('/:id/end', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const { outcome, feedback, notes } = req.body || {};
  const existing = await prisma.callLog.findUnique({ where: { id: req.params.id }, select: { id: true, byId: true, actualStartAt: true, client: { select: { name: true } } } });
  if (!existing) return res.status(404).json({ error: 'Call not found' });
  if (existing.byId !== req.user!.id && !['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: "This call belongs to someone else" });
  }
  const endAt = new Date();
  let duration: number | null = null;
  if (existing.actualStartAt) {
    duration = Math.max(1, Math.round((endAt.getTime() - existing.actualStartAt.getTime()) / 60_000));
  }
  const log = await prisma.callLog.update({
    where: { id: existing.id },
    data: {
      status: 'completed',
      actualEndAt: endAt,
      durationMinutes: duration,
      ...(typeof outcome === 'string' && outcome ? { outcome } : {}),
      ...(typeof feedback === 'string' ? { feedback: feedback.slice(0, 2000) } : {}),
      ...(typeof notes === 'string' && notes ? { notes: notes.slice(0, 1000) } : {}),
    },
  });
  await audit(req.user!.id, req.user!.name, 'CALL_ENDED', `${existing.client.name} · ${duration ? duration + 'min' : 'no timer'}`);
  res.json(log);
});

// Patch feedback / notes after-the-fact (no time changes).
callLogsRouter.patch('/:id/feedback', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const { feedback, notes, outcome } = req.body || {};
  const existing = await prisma.callLog.findUnique({ where: { id: req.params.id }, select: { id: true, byId: true, client: { select: { name: true } } } });
  if (!existing) return res.status(404).json({ error: 'Call not found' });
  if (existing.byId !== req.user!.id && !['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: "This call belongs to someone else" });
  }
  const log = await prisma.callLog.update({
    where: { id: existing.id },
    data: {
      ...(typeof feedback === 'string' ? { feedback: feedback.slice(0, 2000) } : {}),
      ...(typeof notes === 'string'    ? { notes: notes.slice(0, 1000) } : {}),
      ...(typeof outcome === 'string' && outcome ? { outcome } : {}),
    },
  });
  await audit(req.user!.id, req.user!.name, 'CALL_FEEDBACK_UPDATED', existing.client.name);
  res.json(log);
});

// Mark as missed (status='missed') — used when a scheduled call's time passes without action.
callLogsRouter.post('/:id/missed', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const existing = await prisma.callLog.findUnique({ where: { id: req.params.id }, select: { id: true, byId: true, client: { select: { name: true } } } });
  if (!existing) return res.status(404).json({ error: 'Call not found' });
  if (existing.byId !== req.user!.id && !['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: "This call belongs to someone else" });
  }
  await prisma.callLog.update({ where: { id: existing.id }, data: { status: 'missed' } });
  await audit(req.user!.id, req.user!.name, 'CALL_MISSED', existing.client.name);
  res.json({ ok: true });
});

callLogsRouter.post('/', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const { clientId, kind, activityType, outcome, sessionTookPlace, cancellationReason, durationMinutes, notes } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  // If session didn't take place, cancellationReason is required
  if (sessionTookPlace === false && !cancellationReason) {
    return res.status(400).json({ error: 'cancellationReason required when session did not take place' });
  }
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const log = await prisma.callLog.create({
    data: {
      clientId,
      byId: req.user!.id,
      kind: typeof kind === 'string' ? kind : 'checkin',
      activityType: typeof activityType === 'string' ? activityType : null,
      outcome: typeof outcome === 'string' ? outcome : null,
      sessionTookPlace: typeof sessionTookPlace === 'boolean' ? sessionTookPlace : null,
      cancellationReason: typeof cancellationReason === 'string' ? cancellationReason.slice(0, 1000) : null,
      durationMinutes: typeof durationMinutes === 'number' ? Math.round(durationMinutes) : null,
      notes: typeof notes === 'string' ? notes.slice(0, 1000) : null,
    },
  });
  // When a feedback check-in is logged, stamp lastFeedbackTakenAt so the
  // Payment follow-up page and feedback tracking stay in sync automatically.
  if (kind === 'feedback') {
    const today = new Date().toISOString().slice(0, 10);
    await prisma.client.update({ where: { id: clientId }, data: { lastFeedbackTakenAt: today } });
  }
  await audit(req.user!.id, req.user!.name, 'CALL_LOG', `${client.name} · ${activityType || kind || 'checkin'}${outcome ? ' · ' + outcome : ''}`);
  res.status(201).json(log);
});
