import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';
import { checkPermission } from '../lib/rolePermissions';

export const feedbackRouter = Router();
feedbackRouter.use(requireAuth);

// Returns the Monday of the current week as YYYY-MM-DD (IST-aware via UTC+5:30 offset)
function getWeekStart(): string {
  const now = new Date();
  // Shift to IST (UTC+5:30) so the week boundary flips at midnight IST, not UTC midnight
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const day = ist.getUTCDay(); // 0=Sun … 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  ist.setUTCDate(ist.getUTCDate() + diffToMonday);
  return ist.toISOString().slice(0, 10);
}

const include = {
  client: { select: { id: true, name: true, phoneCode: true, phoneDigits: true } },
  trainer: { select: { id: true, name: true } },
};

feedbackRouter.get('/', async (req: AuthedRequest, res) => {
  if (!await checkPermission('feedback.read', req.user!.role)) return res.status(403).json({ error: 'Forbidden' });
  const { weekStart } = req.query as any;
  const where: any = weekStart ? { weekStart } : {};
  const fb = await (prisma as any).feedback.findMany({
    where,
    include: {
      ...include,
      activities: {
        orderBy: { loggedAt: 'desc' },
        include: { loggedBy: { select: { id: true, name: true } } },
      },
    },
    orderBy: { weekStart: 'desc' },
  });
  res.json(fb);
});

feedbackRouter.post('/', async (req: AuthedRequest, res) => {
  if (!await checkPermission('feedback.write', req.user!.role)) return res.status(403).json({ error: 'Forbidden' });
  const { clientId, weekStart, rating, notes, communicationStatus, trainerId } = req.body;
  if (!clientId || !weekStart || !rating) return res.status(400).json({ error: 'clientId, weekStart, rating required' });
  const fb = await prisma.feedback.create({
    data: {
      clientId, weekStart, rating: Number(rating), notes,
      communicationStatus: communicationStatus || null,
      trainerId: trainerId || null,
    },
    include,
  });
  await audit(req.user!.id, req.user!.name, 'FEEDBACK_CREATE', `${fb.client.name} · ${rating}`);
  res.status(201).json(fb);
});

feedbackRouter.patch('/:id', async (req: AuthedRequest, res) => {
  if (!await checkPermission('feedback.write', req.user!.role)) return res.status(403).json({ error: 'Forbidden' });
  const { rating, notes, communicationStatus, trainerId, weekStart } = req.body;
  const fb = await prisma.feedback.update({
    where: { id: req.params.id },
    data: {
      ...(rating !== undefined ? { rating: Number(rating) } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(communicationStatus !== undefined ? { communicationStatus } : {}),
      ...(trainerId !== undefined ? { trainerId: trainerId || null } : {}),
      ...(weekStart !== undefined ? { weekStart } : {}),
    },
    include,
  });
  res.json(fb);
});

feedbackRouter.delete('/:id', async (req: AuthedRequest, res) => {
  if (!await checkPermission('feedback.delete', req.user!.role)) return res.status(403).json({ error: 'Forbidden' });
  await prisma.feedback.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// POST /feedback/ensure-client/:clientId — get or create a feedback record for THIS week
feedbackRouter.post('/ensure-client/:clientId', async (req: AuthedRequest, res) => {
  if (!await checkPermission('feedback.write', req.user!.role)) return res.status(403).json({ error: 'Forbidden' });
  const currentWeekStart = getWeekStart();
  const fbInclude = {
    client: { select: { id: true, name: true, phoneCode: true, phoneDigits: true } },
    trainer: { select: { id: true, name: true } },
    activities: { orderBy: { loggedAt: 'desc' as const }, include: { loggedBy: { select: { id: true, name: true } } } },
  };
  let fb = await prisma.feedback.findFirst({
    where: { clientId: req.params.clientId, weekStart: currentWeekStart },
    include: fbInclude,
  });
  if (!fb) {
    const client = await prisma.client.findUnique({ where: { id: req.params.clientId }, select: { id: true, name: true } });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    fb = await prisma.feedback.create({
      data: { clientId: req.params.clientId, weekStart: currentWeekStart, rating: 3 },
      include: fbInclude,
    });
  }
  res.json(fb);
});

// ── Activity log ─────────────────────────────────────────────────────────────
// POST /feedback/:id/activity — log a call/message/note against this feedback entry
feedbackRouter.post('/:id/activity', async (req: AuthedRequest, res) => {
  if (!await checkPermission('feedback.write', req.user!.role)) return res.status(403).json({ error: 'Forbidden' });
  const fb = await prisma.feedback.findUnique({ where: { id: req.params.id }, select: { id: true, clientId: true } });
  if (!fb) return res.status(404).json({ error: 'Not found' });
  const { type, note, loggedAt } = req.body;
  if (!type) return res.status(400).json({ error: 'type required' });
  const activityLoggedAt = loggedAt ? new Date(loggedAt) : new Date();
  const activity = await (prisma as any).feedbackActivity.create({
    data: {
      feedbackId: fb.id,
      clientId: fb.clientId,
      type,
      note: note?.trim() || null,
      loggedById: req.user!.id,
      loggedAt: activityLoggedAt,
    },
    include: { loggedBy: { select: { id: true, name: true } } },
  });
  // Stamp lastFeedbackTakenAt on the client so Team Board feedback warning clears
  if (fb.clientId) {
    await prisma.client.update({
      where: { id: fb.clientId },
      data: { lastFeedbackTakenAt: activityLoggedAt.toISOString().slice(0, 10) },
    });
  }
  await audit(req.user!.id, req.user!.name, 'FEEDBACK_ACTIVITY', `${type}${note ? ': ' + note : ''}`);
  res.status(201).json(activity);
});

// GET /feedback/client/:clientId/activities — all activities for a client (shown on client profile)
feedbackRouter.get('/client/:clientId/activities', async (req: AuthedRequest, res) => {
  if (!await checkPermission('feedback.read', req.user!.role)) return res.status(403).json({ error: 'Forbidden' });
  const activities = await (prisma as any).feedbackActivity.findMany({
    where: { clientId: req.params.clientId },
    orderBy: { loggedAt: 'desc' },
    include: { loggedBy: { select: { id: true, name: true } } },
  });
  res.json(activities);
});
