import { Router } from 'express';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { prisma } from '../lib/prisma';

export const escalationsRouter = Router();
escalationsRouter.use(requireAuth);
escalationsRouter.use(requireRole('founder', 'manager', 'lead', 'demo_lead', 'demo_intake'));

escalationsRouter.get('/', async (_req: AuthedRequest, res) => {
  const escalations = await prisma.regularTraining.findMany({
    where: { demoEscalationRequested: true, status: 'active' },
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

// PATCH /:id/status — update escalationStatus and/or escalationActionsTaken
escalationsRouter.patch('/:id/status', async (req: AuthedRequest, res) => {
  const { escalationStatus, escalationActionsTaken, escalationDemoAck } = req.body || {};
  const training = await prisma.regularTraining.findUnique({ where: { id: req.params.id } });
  if (!training) return res.status(404).json({ error: 'Training not found' });

  const data: any = {};
  if (escalationStatus !== undefined) data.escalationStatus = escalationStatus;
  if (escalationActionsTaken !== undefined) data.escalationActionsTaken = escalationActionsTaken;
  if (escalationDemoAck !== undefined) data.escalationDemoAck = escalationDemoAck;
  const updated = await prisma.regularTraining.update({ where: { id: req.params.id }, data });
  res.json(updated);
});

escalationsRouter.post('/:id/resolve', async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const { notes } = req.body || {};

  const training = await prisma.regularTraining.findUnique({ where: { id } });
  if (!training) return res.status(404).json({ error: 'Training not found' });

  const resolveData: any = { demoEscalationRequested: false, escalationStatus: 'Resolved' };
  await prisma.regularTraining.update({ where: { id }, data: resolveData });

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
