import { Router } from 'express';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { prisma } from '../lib/prisma';

export const escalationsRouter = Router();
escalationsRouter.use(requireAuth);
escalationsRouter.use(requireRole('founder', 'manager', 'lead', 'demo_lead'));

escalationsRouter.get('/', async (_req: AuthedRequest, res) => {
  const escalations = await prisma.regularTraining.findMany({
    where: {
      demoEscalationRequested: true,
      status: 'active',
    },
    include: {
      client: { select: { id: true, name: true, lifecycle: true } },
      trainer: { select: { id: true, name: true } },
      hostedByDefault: { select: { id: true, name: true } },
      sessions: {
        orderBy: { scheduledFor: 'desc' },
        take: 1,
        select: { scheduledFor: true, status: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  res.json(escalations);
});

escalationsRouter.post('/:id/resolve', async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const { notes } = req.body || {};

  const training = await prisma.regularTraining.findUnique({ where: { id } });
  if (!training) return res.status(404).json({ error: 'Training not found' });

  await prisma.regularTraining.update({
    where: { id },
    data: { demoEscalationRequested: false },
  });

  // Record resolution as a comment on the client if notes provided
  if (notes && training.clientId) {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
    await prisma.comment.create({
      data: {
        body: `[Escalation resolved] ${notes}`,
        authorId: req.user!.id,
        authorName: user?.name || 'Unknown',
        clientId: training.clientId,
      },
    });
  }

  res.json({ ok: true });
});
