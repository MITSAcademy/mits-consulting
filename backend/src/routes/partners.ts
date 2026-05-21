import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const partnersRouter = Router();
partnersRouter.use(requireAuth);

partnersRouter.get('/', async (_req, res) => {
  const partners = await prisma.partner.findMany({ orderBy: { name: 'asc' } });
  res.json(partners);
});

partnersRouter.get('/:id', async (req, res) => {
  const p = await prisma.partner.findUnique({
    where: { id: req.params.id },
    include: { clients: true },
  });
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

const fields = ['name', 'contact', 'email', 'phone', 'billingCycle', 'paymentTerms', 'notes', 'active'];

partnersRouter.post('/', async (req: AuthedRequest, res) => {
  const data: any = {};
  for (const f of fields) if (f in req.body) data[f] = req.body[f];
  if (!data.name) return res.status(400).json({ error: 'Name required' });
  const p = await prisma.partner.create({ data });
  await audit(req.user!.id, req.user!.name, 'PARTNER_CREATE', p.name);
  res.status(201).json(p);
});

partnersRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const data: any = {};
  for (const f of fields) if (f in req.body) data[f] = req.body[f];
  const p = await prisma.partner.update({ where: { id: req.params.id }, data });
  await audit(req.user!.id, req.user!.name, 'PARTNER_UPDATE', p.name);
  res.json(p);
});

partnersRouter.delete('/:id', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only founder' });
  await prisma.partner.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
