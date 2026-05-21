import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const editRequestsRouter = Router();
editRequestsRouter.use(requireAuth);

editRequestsRouter.get('/', async (_req, res) => {
  const items = await prisma.editRequest.findMany({
    include: {
      requestedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(items);
});

editRequestsRouter.post('/', async (req: AuthedRequest, res) => {
  const { entity, entityId, category, field, oldValue, newValue, reason } = req.body;
  if (!entity || !entityId || !field) return res.status(400).json({ error: 'entity, entityId, field required' });
  const r = await prisma.editRequest.create({
    data: {
      entity, entityId, category: category || 'unknown', field,
      oldValue: oldValue?.toString() || null,
      newValue: newValue?.toString() || null,
      reason: reason || null,
      requestedById: req.user!.id,
      status: 'Pending',
    },
  });
  await audit(req.user!.id, req.user!.name, 'EDIT_REQUEST', `${entity}/${field}`);
  res.status(201).json(r);
});

editRequestsRouter.post('/:id/approve', requireRole('founder', 'demo_lead', 'manager'), async (req: AuthedRequest, res) => {
  const r = await prisma.editRequest.findUnique({ where: { id: req.params.id } });
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (r.status !== 'Pending') return res.status(409).json({ error: 'Already reviewed' });

  // Apply the change
  const data: any = { [r.field]: r.newValue };
  try {
    if (r.entity === 'client') await prisma.client.update({ where: { id: r.entityId }, data });
    if (r.entity === 'trainer') await prisma.trainer.update({ where: { id: r.entityId }, data });
  } catch (e: any) {
    return res.status(400).json({ error: 'Failed to apply: ' + e.message });
  }

  const updated = await prisma.editRequest.update({
    where: { id: r.id },
    data: { status: 'Approved', reviewedById: req.user!.id, reviewedAt: new Date() },
  });
  await audit(req.user!.id, req.user!.name, 'EDIT_APPROVE', `${r.entity}/${r.field}`);
  res.json(updated);
});

editRequestsRouter.post('/:id/reject', requireRole('founder', 'demo_lead', 'manager'), async (req: AuthedRequest, res) => {
  const updated = await prisma.editRequest.update({
    where: { id: req.params.id },
    data: { status: 'Rejected', reviewedById: req.user!.id, reviewedAt: new Date() },
  });
  await audit(req.user!.id, req.user!.name, 'EDIT_REJECT', req.params.id);
  res.json(updated);
});
