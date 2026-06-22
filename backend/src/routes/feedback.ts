import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const feedbackRouter = Router();
feedbackRouter.use(requireAuth);

const FEEDBACK_READERS = ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'];
const FEEDBACK_WRITERS = ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'];

const include = {
  client: { select: { id: true, name: true, phoneCode: true, phoneDigits: true } },
  trainer: { select: { id: true, name: true } },
};

feedbackRouter.get('/', requireRole(...FEEDBACK_READERS), async (_req, res) => {
  const fb = await prisma.feedback.findMany({ include, orderBy: { weekStart: 'desc' } });
  res.json(fb);
});

feedbackRouter.post('/', requireRole(...FEEDBACK_WRITERS), async (req: AuthedRequest, res) => {
  const { clientId, weekStart, rating, notes, communicationStatus, trainerId } = req.body;
  if (!clientId || !weekStart || !rating) return res.status(400).json({ error: 'clientId, weekStart, rating required' });
  const fb = await prisma.feedback.create({
    data: {
      clientId, weekStart, rating: Number(rating), notes,
      communicationStatus: communicationStatus || null,
      trainerId: trainerId || null,
    },
    include,
  });
  await audit(req.user!.id, req.user!.name, 'FEEDBACK_CREATE', `${fb.client.name} · ${rating}`);
  res.status(201).json(fb);
});

feedbackRouter.patch('/:id', requireRole(...FEEDBACK_WRITERS), async (req: AuthedRequest, res) => {
  const { rating, notes, communicationStatus, trainerId, weekStart } = req.body;
  const fb = await prisma.feedback.update({
    where: { id: req.params.id },
    data: {
      ...(rating !== undefined ? { rating: Number(rating) } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(communicationStatus !== undefined ? { communicationStatus } : {}),
      ...(trainerId !== undefined ? { trainerId: trainerId || null } : {}),
      ...(weekStart !== undefined ? { weekStart } : {}),
    },
    include,
  });
  res.json(fb);
});

feedbackRouter.delete('/:id', requireRole('founder', 'manager'), async (_req, res) => {
  await prisma.feedback.delete({ where: { id: _req.params.id } });
  res.json({ ok: true });
});
