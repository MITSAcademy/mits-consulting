import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const payoutsRouter = Router();
payoutsRouter.use(requireAuth);

payoutsRouter.get('/', async (_req, res) => {
  const batches = await prisma.payoutBatch.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(batches);
});

payoutsRouter.post('/', async (req: AuthedRequest, res) => {
  if (!['founder', 'payment_processor', 'manager', 'accounts'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { weekStart, sessionIds } = req.body;
  if (!weekStart || !Array.isArray(sessionIds) || sessionIds.length === 0) {
    return res.status(400).json({ error: 'weekStart + sessionIds required' });
  }
  const logs = await prisma.sessionLog.findMany({ where: { id: { in: sessionIds } } });
  const totalInr = logs.reduce((s, l) => s + l.amountInr, 0);
  const batch = await prisma.payoutBatch.create({
    data: { weekStart, totalInr, sessionIds, status: 'Pending' },
  });
  await prisma.sessionLog.updateMany({ where: { id: { in: sessionIds } }, data: { status: 'ReadyForFinal' } });
  await audit(req.user!.id, req.user!.name, 'PAYOUT_BATCH_CREATE', `${weekStart} · ₹${totalInr}`);
  res.status(201).json(batch);
});

payoutsRouter.post('/:id/approve', async (req: AuthedRequest, res) => {
  if (!['founder', 'demo_lead'].includes(req.user!.role)) return res.status(403).json({ error: 'Forbidden' });
  const batch = await prisma.payoutBatch.update({
    where: { id: req.params.id },
    data: { status: 'Approved', approvedAt: new Date() },
  });
  await prisma.sessionLog.updateMany({
    where: { id: { in: batch.sessionIds } },
    data: { status: 'PaymentApproved' },
  });
  await audit(req.user!.id, req.user!.name, 'PAYOUT_APPROVE', batch.id);
  res.json(batch);
});

payoutsRouter.post('/:id/pay', async (req: AuthedRequest, res) => {
  if (!['founder', 'payment_processor', 'accounts'].includes(req.user!.role)) return res.status(403).json({ error: 'Forbidden' });
  const batch = await prisma.payoutBatch.update({
    where: { id: req.params.id },
    data: { status: 'Paid', paidAt: new Date() },
  });
  await prisma.sessionLog.updateMany({
    where: { id: { in: batch.sessionIds } },
    data: { status: 'Paid' },
  });
  await audit(req.user!.id, req.user!.name, 'PAYOUT_PAID', batch.id);
  res.json(batch);
});
