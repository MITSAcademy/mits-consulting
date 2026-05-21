import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get('/', async (req: AuthedRequest, res) => {
  const { userId, from, to } = req.query as any;
  const where: any = {};
  if (userId) where.userId = userId;
  if (from || to) where.date = { gte: from, lte: to };
  const reports = await prisma.dailyReport.findMany({
    where,
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { date: 'desc' },
  });
  res.json(reports);
});

reportsRouter.post('/', async (req: AuthedRequest, res) => {
  const { date, content } = req.body;
  if (!date || !content) return res.status(400).json({ error: 'date + content required' });
  const r = await prisma.dailyReport.create({
    data: { userId: req.user!.id, date, content },
  });
  await audit(req.user!.id, req.user!.name, 'DAILY_REPORT', date);
  res.status(201).json(r);
});
