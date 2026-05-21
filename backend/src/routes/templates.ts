import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const templatesRouter = Router();
templatesRouter.use(requireAuth);

templatesRouter.get('/', async (_req, res) => {
  const t = await prisma.emailTemplate.findMany({ orderBy: { name: 'asc' } });
  res.json(t);
});

templatesRouter.post('/', async (req: AuthedRequest, res) => {
  const { id, kind, stage, name, subject, body, variables } = req.body;
  if (!id || !name || !body) return res.status(400).json({ error: 'id, name, body required' });
  const t = await prisma.emailTemplate.create({
    data: { id, kind: kind || 'Email', stage, name, subject, body, variables: variables || [] },
  });
  await audit(req.user!.id, req.user!.name, 'TEMPLATE_CREATE', name);
  res.status(201).json(t);
});

templatesRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const data: any = {};
  for (const f of ['kind', 'stage', 'name', 'subject', 'body', 'variables']) {
    if (f in req.body) data[f] = req.body[f];
  }
  const t = await prisma.emailTemplate.update({ where: { id: req.params.id }, data });
  res.json(t);
});

templatesRouter.delete('/:id', async (req: AuthedRequest, res) => {
  await prisma.emailTemplate.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
