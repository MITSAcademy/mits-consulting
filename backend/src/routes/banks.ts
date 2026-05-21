import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const banksRouter = Router();
banksRouter.use(requireAuth);

banksRouter.get('/', async (_req, res) => {
  const b = await prisma.bankAccount.findMany({ orderBy: { label: 'asc' } });
  res.json(b);
});

banksRouter.post('/', requireRole('founder', 'accounts'), async (req: AuthedRequest, res) => {
  const { id, label, bank, last4, active } = req.body;
  if (!id || !label || !bank) return res.status(400).json({ error: 'id, label, bank required' });
  const b = await prisma.bankAccount.create({ data: { id, label, bank, last4: last4 || '----', active: active !== false } });
  await audit(req.user!.id, req.user!.name, 'BANK_CREATE', label);
  res.status(201).json(b);
});

banksRouter.patch('/:id', requireRole('founder', 'accounts'), async (req: AuthedRequest, res) => {
  const data: any = {};
  for (const f of ['label', 'bank', 'last4', 'active']) if (f in req.body) data[f] = req.body[f];
  const b = await prisma.bankAccount.update({ where: { id: req.params.id }, data });
  res.json(b);
});

banksRouter.delete('/:id', requireRole('founder'), async (req: AuthedRequest, res) => {
  await prisma.bankAccount.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});
