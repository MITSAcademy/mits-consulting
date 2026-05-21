import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const leverageRouter = Router();
leverageRouter.use(requireAuth);

const include = { client: { select: { id: true, name: true, cycleEnd: true } } };

leverageRouter.get('/', async (req, res) => {
  const { status } = req.query as any;
  const where: any = {};
  if (status) where.status = status;
  const items = await prisma.leverageRequest.findMany({ where, include, orderBy: { createdAt: 'desc' } });
  res.json(items);
});

leverageRouter.post('/', async (req: AuthedRequest, res) => {
  const { clientId, daysRequested, reasonStated, newCommittedDate } = req.body;
  if (!clientId || !daysRequested) return res.status(400).json({ error: 'clientId, daysRequested required' });
  const isAuto = Number(daysRequested) <= 3;
  const lr = await prisma.leverageRequest.create({
    data: {
      clientId, daysRequested: Number(daysRequested),
      reasonStated: reasonStated || '',
      newCommittedDate: newCommittedDate || '',
      status: isAuto ? 'AutoApproved' : 'PendingVaibhav',
      isAutoApproved: isAuto,
    },
    include,
  });
  if (isAuto) {
    await prisma.client.update({ where: { id: clientId }, data: { lifecycle: 'LeverageGranted' } });
  }
  await audit(req.user!.id, req.user!.name, 'LEVERAGE_CREATE', `${lr.client.name} · ${daysRequested}d`);
  res.status(201).json(lr);
});

leverageRouter.post('/:id/decision', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only founder decides' });
  const { decision } = req.body; // "Approved" | "Rejected"
  const lr = await prisma.leverageRequest.update({
    where: { id: req.params.id },
    data: { status: decision },
    include,
  });
  if (decision === 'Approved') {
    await prisma.client.update({ where: { id: lr.clientId }, data: { lifecycle: 'LeverageGranted' } });
  }
  await audit(req.user!.id, req.user!.name, 'LEVERAGE_DECISION', `${lr.client.name} · ${decision}`);
  res.json(lr);
});
