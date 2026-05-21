import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

const include = {
  client: { select: { id: true, name: true } },
  trainer: { select: { id: true, name: true, defaultRateInr: true, rateModel: true } },
  owner: { select: { id: true, name: true } },
};

tasksRouter.get('/', async (req: AuthedRequest, res) => {
  const { mine, status, dueOn } = req.query as any;
  const where: any = {};
  if (mine === '1') where.ownerId = req.user!.id;
  if (status) where.status = status;
  if (dueOn) where.dueDate = dueOn;
  const tasks = await prisma.task.findMany({ where, include, orderBy: { dueDate: 'asc' } });
  res.json(tasks);
});

const fields = [
  'clientId', 'ownerId', 'trainerId', 'title', 'dueDate',
  'status', 'priority', 'estimatedHours', 'type', 'engagementRateInr', 'completedAt',
];

tasksRouter.post('/', async (req: AuthedRequest, res) => {
  const data: any = {};
  for (const f of fields) if (f in req.body) data[f] = req.body[f];
  if (!data.title) return res.status(400).json({ error: 'title required' });
  const t = await prisma.task.create({ data, include });
  await audit(req.user!.id, req.user!.name, 'TASK_CREATE', t.title);
  res.status(201).json(t);
});

tasksRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const data: any = {};
  for (const f of fields) if (f in req.body) data[f] = req.body[f];
  const t = await prisma.task.update({ where: { id: req.params.id }, data, include });
  res.json(t);
});

// Mark session done -> create SessionLog
tasksRouter.post('/:id/complete', async (req: AuthedRequest, res) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id }, include });
  if (!task) return res.status(404).json({ error: 'Not found' });
  const done = await prisma.$transaction(async (tx) => {
    const t = await tx.task.update({
      where: { id: task.id },
      data: { status: 'Done', completedAt: new Date().toISOString().slice(0, 10) },
      include,
    });
    let log = null;
    if (task.type === 'SESSION' && task.trainerId) {
      const trainer = await tx.trainer.findUnique({ where: { id: task.trainerId } });
      if (trainer) {
        const rate = task.engagementRateInr || trainer.defaultRateInr;
        const amount = trainer.rateModel === 'hourly' ? Math.round(task.estimatedHours * rate) : rate;
        log = await tx.sessionLog.create({
          data: {
            trainerId: trainer.id,
            clientId: task.clientId,
            date: task.dueDate || new Date().toISOString().slice(0, 10),
            hours: task.estimatedHours,
            rateSnapshot: rate,
            rateModel: trainer.rateModel,
            amountInr: amount,
            status: 'Logged',
            taskId: task.id,
          },
        });
        if (task.clientId) {
          await tx.client.update({
            where: { id: task.clientId },
            data: { sessionsUsed: { increment: 1 } },
          });
        }
      }
    }
    return { task: t, log };
  });
  await audit(req.user!.id, req.user!.name, 'TASK_COMPLETE', task.title);
  res.json(done);
});

tasksRouter.delete('/:id', async (req: AuthedRequest, res) => {
  await prisma.task.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
