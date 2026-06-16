import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';

export const auditRouter = Router();
auditRouter.use(requireAuth);

// Main audit log — founder sees all; manager/lead see their team entries
auditRouter.get('/', async (req: AuthedRequest, res) => {
  const role = req.user!.role;
  const allowed = ['founder', 'manager'];
  if (!allowed.includes(role)) return res.status(403).json({ error: 'Not allowed' });

  const { clientId, trainerId, byId, action, from, to, limit } = req.query as Record<string, string>;

  const where: any = {};
  if (clientId)  where.clientId  = clientId;
  if (trainerId) where.trainerId = trainerId;
  if (byId)      where.byId      = byId;
  if (action)    where.action    = { contains: action, mode: 'insensitive' };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to)   where.createdAt.lte = new Date(to + 'T23:59:59.999Z');
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(limit) || 200, 500),
  });
  res.json(logs);
});

// Per-entity activity feed used by ClientDetailPage + TrainerDetailPage
auditRouter.get('/entity', async (req: AuthedRequest, res) => {
  const role = req.user!.role;
  const allowed = ['founder', 'manager', 'account_manager'];
  if (!allowed.includes(role)) return res.status(403).json({ error: 'Not allowed' });

  const { clientId, trainerId } = req.query as Record<string, string>;
  if (!clientId && !trainerId) return res.status(400).json({ error: 'clientId or trainerId required' });

  const where: any = {};
  if (clientId)  where.clientId  = clientId;
  if (trainerId) where.trainerId = trainerId;

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(logs);
});

// Any signed-in user can pull THEIR OWN entries for a day (daily report auto-fill)
auditRouter.get('/mine', async (req: AuthedRequest, res) => {
  const day = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const start = new Date(day + 'T00:00:00.000Z');
  const end   = new Date(day + 'T23:59:59.999Z');
  const logs = await prisma.auditLog.findMany({
    where: { byId: req.user!.id, createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  res.json(logs);
});
