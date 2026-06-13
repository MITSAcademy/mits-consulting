import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';

export const auditRouter = Router();
auditRouter.use(requireAuth);

auditRouter.get('/', requireRole('founder'), async (req, res) => {
  const { limit } = req.query as any;
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Number(limit) || 200, 500),
  });
  res.json(logs);
});

// Any signed-in user can pull THEIR OWN audit entries for a single day.
// Used by the daily-report auto-fill.
auditRouter.get('/mine', async (req: AuthedRequest, res) => {
  const day = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const start = new Date(day + 'T00:00:00.000Z');
  const end = new Date(day + 'T23:59:59.999Z');
  const logs = await prisma.auditLog.findMany({
    where: { byId: req.user!.id, createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  res.json(logs);
});
