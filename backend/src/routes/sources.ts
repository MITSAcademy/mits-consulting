import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const sourcesRouter = Router();
sourcesRouter.use(requireAuth);

sourcesRouter.get('/', async (_req, res) => {
  const s = await prisma.leadSource.findMany({ orderBy: { name: 'asc' } });
  res.json(s);
});

sourcesRouter.post('/', requireRole('founder', 'demo_lead'), async (req: AuthedRequest, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const s = await prisma.leadSource.create({ data: { name } });
  await audit(req.user!.id, req.user!.name, 'SOURCE_CREATE', name);
  res.status(201).json(s);
});

sourcesRouter.delete('/:id', requireRole('founder', 'demo_lead'), async (req: AuthedRequest, res) => {
  await prisma.leadSource.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
