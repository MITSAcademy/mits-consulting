import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const feedbackRouter = Router();
feedbackRouter.use(requireAuth);

const include = { client: { select: { id: true, name: true } } };

feedbackRouter.get('/', async (_req, res) => {
  const fb = await prisma.feedback.findMany({ include, orderBy: { weekStart: 'desc' } });
  res.json(fb);
});

feedbackRouter.post('/', async (req: AuthedRequest, res) => {
  const { clientId, weekStart, rating, notes } = req.body;
  if (!clientId || !weekStart || !rating) return res.status(400).json({ error: 'clientId, weekStart, rating required' });
  const fb = await prisma.feedback.create({ data: { clientId, weekStart, rating: Number(rating), notes }, include });
  await audit(req.user!.id, req.user!.name, 'FEEDBACK_CREATE', `${fb.client.name} · ${rating}`);
  res.status(201).json(fb);
});

feedbackRouter.delete('/:id', async (_req, res) => {
  await prisma.feedback.delete({ where: { id: _req.params.id } });
  res.json({ ok: true });
});
