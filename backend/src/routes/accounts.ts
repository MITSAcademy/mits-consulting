import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const accountsRouter = Router();
accountsRouter.use(requireAuth);

const include = {
  client: { select: { id: true, name: true, currency: true, cycleAmount: true } },
  payment: true,
};

accountsRouter.get('/', async (_req, res) => {
  const items = await prisma.accountsQueueItem.findMany({ include, orderBy: { createdAt: 'desc' } });
  res.json(items);
});

accountsRouter.post('/', async (req: AuthedRequest, res) => {
  const { clientId, paymentId, status } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  const item = await prisma.accountsQueueItem.create({
    data: { clientId, paymentId: paymentId || null, status: status || 'Pending' },
    include,
  });
  res.status(201).json(item);
});

accountsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const { status } = req.body;
  const item = await prisma.accountsQueueItem.update({
    where: { id: req.params.id },
    data: { status },
    include,
  });
  await audit(req.user!.id, req.user!.name, 'ACCOUNTS_UPDATE', `${item.client.name} → ${status}`);
  res.json(item);
});

accountsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  await prisma.accountsQueueItem.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
