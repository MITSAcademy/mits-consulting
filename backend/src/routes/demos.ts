import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';

export const demosRouter = Router();
demosRouter.use(requireAuth);

const READ_ROLES = ['founder', 'manager', 'demo_lead', 'demo_intake'];

// GET /api/demos — list demos, optionally filtered by conductedById and date range
demosRouter.get('/', async (req: AuthedRequest, res) => {
  if (!READ_ROLES.includes(req.user!.role)) return res.status(403).json({ error: 'Forbidden' });

  const { conductedById, from, to, status } = req.query as Record<string, string | undefined>;

  const where: any = {};
  if (conductedById) where.conductedById = conductedById;
  if (status) where.status = status;
  if (from || to) {
    where.scheduledDate = {};
    if (from) where.scheduledDate.gte = from;
    if (to)   where.scheduledDate.lte = to;
  }

  const demos = await prisma.demo.findMany({
    where,
    include: {
      client:      { select: { id: true, name: true, lifecycle: true } },
      trainer:     { select: { id: true, name: true } },
      conductedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }],
  });
  res.json(demos);
});
