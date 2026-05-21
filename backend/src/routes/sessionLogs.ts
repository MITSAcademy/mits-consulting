import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const sessionLogsRouter = Router();
sessionLogsRouter.use(requireAuth);

const include = {
  trainer: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
};

sessionLogsRouter.get('/', async (req, res) => {
  const { status, trainerId, from, to, weekStart } = req.query as any;
  const where: any = {};
  if (status) where.status = status;
  if (trainerId) where.trainerId = trainerId;
  if (from || to) where.date = { gte: from, lte: to };
  if (weekStart) {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    where.date = { gte: weekStart, lte: end.toISOString().slice(0, 10) };
  }
  const logs = await prisma.sessionLog.findMany({ where, include, orderBy: { date: 'desc' } });
  res.json(logs);
});

sessionLogsRouter.post('/', async (req: AuthedRequest, res) => {
  const { trainerId, clientId, date, hours, rateSnapshot, rateModel, notes } = req.body;
  if (!trainerId || !date || !hours) return res.status(400).json({ error: 'trainerId, date, hours required' });
  const amount = rateModel === 'hourly' ? Math.round(hours * rateSnapshot) : rateSnapshot;
  const log = await prisma.sessionLog.create({
    data: { trainerId, clientId, date, hours, rateSnapshot, rateModel, amountInr: amount, status: 'Logged', notes },
    include,
  });
  await audit(req.user!.id, req.user!.name, 'SESSION_LOG', `${log.trainer.name} · ${date}`);
  res.status(201).json(log);
});

sessionLogsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const data: any = {};
  for (const f of ['status', 'hours', 'rateSnapshot', 'amountInr', 'notes']) {
    if (f in req.body) data[f] = req.body[f];
  }
  const log = await prisma.sessionLog.update({ where: { id: req.params.id }, data, include });
  res.json(log);
});

sessionLogsRouter.post('/bulk-status', async (req: AuthedRequest, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids) || !status) return res.status(400).json({ error: 'ids + status required' });
  await prisma.sessionLog.updateMany({ where: { id: { in: ids } }, data: { status } });
  await audit(req.user!.id, req.user!.name, 'SESSION_BULK', `${ids.length} → ${status}`);
  res.json({ ok: true, count: ids.length });
});
