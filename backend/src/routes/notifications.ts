/**
 * In-app notifications — list mine, mark read, count unread.
 *
 * Endpoints (all require auth, scoped to the logged-in user):
 *   GET    /api/notifications              → recent notifications (50 most recent)
 *   GET    /api/notifications/unread-count → { count: N }
 *   POST   /api/notifications/:id/read     → mark a single notification read
 *   POST   /api/notifications/read-all     → mark every unread one read
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req: AuthedRequest, res) => {
  const items = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(items);
});

notificationsRouter.get('/unread-count', async (req: AuthedRequest, res) => {
  const count = await prisma.notification.count({
    where: { userId: req.user!.id, readAt: null },
  });
  res.json({ count });
});

notificationsRouter.post('/:id/read', async (req: AuthedRequest, res) => {
  // updateMany with the userId filter so users can't mark someone else's notifications.
  const r = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true, updated: r.count });
});

notificationsRouter.post('/read-all', async (req: AuthedRequest, res) => {
  const r = await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ ok: true, updated: r.count });
});
