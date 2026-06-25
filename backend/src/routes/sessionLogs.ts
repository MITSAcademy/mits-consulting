import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';

const SESSION_LOG_READ  = ['founder', 'manager', 'lead', 'account_manager', 'accounts', 'payment_processor'];
const SESSION_LOG_WRITE = ['founder', 'manager', 'lead', 'account_manager', 'payment_processor'];
import { audit } from '../lib/audit';

export const sessionLogsRouter = Router();
sessionLogsRouter.use(requireAuth);

const include = {
  trainer: {
    select: {
      id: true, name: true, email: true,
      phoneCode: true, phoneDigits: true,
      bankHolderName: true, bankName: true, bankAccountNumber: true,
      bankIfscCode: true, bankBranchName: true, bankAccountType: true,
      upiId: true, paymentMethod: true,
    },
  },
  client: { select: { id: true, name: true } },
};

sessionLogsRouter.get('/', requireRole(...SESSION_LOG_READ), async (req, res) => {
  const { status, trainerId, clientId, from, to, weekStart } = req.query as any;
  const where: any = {};
  if (status) where.status = status;
  if (trainerId) where.trainerId = trainerId;
  if (clientId) where.clientId = clientId;
  if (from || to) where.date = { gte: from, lte: to };
  if (weekStart) {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    where.date = { gte: weekStart, lte: end.toISOString().slice(0, 10) };
  }
  const logs = await prisma.sessionLog.findMany({ where, include, orderBy: { date: 'desc' } });
  res.json(logs);
});

const LEAD_TEAM_IDS = ['u-bhavneet', 'u-kashish', 'u-muskan'];

sessionLogsRouter.post('/', requireRole(...SESSION_LOG_WRITE), async (req: AuthedRequest, res) => {
  const { trainerId, clientId, date, hours, rateSnapshot, rateModel, notes, amountInr: amountOverride, feedback, sessionHappened } = req.body;
  const didHappen = sessionHappened !== false && sessionHappened !== 'false';
  if (!trainerId || !date) return res.status(400).json({ error: 'trainerId and date required' });
  if (didHappen && !hours) return res.status(400).json({ error: 'hours required when session happened' });

  // lead (Bhavneet) can only log sessions for clients owned by her team.
  if (req.user!.role === 'lead' && clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { hostOwnerId: true } });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.hostOwnerId || !LEAD_TEAM_IDS.includes(client.hostOwnerId)) {
      return res.status(403).json({ error: 'You can only log sessions for clients on your team (Bhavneet / Kashish / Muskan)' });
    }
  }
  // account_manager can only log for their own clients
  if (req.user!.role === 'account_manager' && clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { hostOwnerId: true, assignedAmId: true } });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.hostOwnerId !== req.user!.id && client.assignedAmId !== req.user!.id) {
      return res.status(403).json({ error: 'You can only log sessions for your assigned clients' });
    }
  }

  // No-show: hours=0, amount=0, regardless of what was sent
  const actualHours = didHappen ? (hours || 0) : 0;
  const effectiveHourlyRate = rateModel === 'per_session' ? (rateSnapshot || 0) / 2 : (rateSnapshot || 0);
  const defaultAmount = didHappen ? Math.round(actualHours * effectiveHourlyRate) : 0;
  const amount = didHappen && amountOverride != null && !isNaN(Number(amountOverride))
    ? Math.round(Number(amountOverride)) : defaultAmount;

  const data: any = {
    trainerId, clientId, date, hours: actualHours, rateSnapshot: rateSnapshot || 0,
    rateModel: rateModel || 'per_session', amountInr: amount, status: 'Logged',
    notes: notes || null, feedback: feedback || null, loggedById: req.user!.id,
    sessionHappened: didHappen,
  };
  const log = await prisma.sessionLog.create({ data, include });
  const noShowNote = !didHappen ? ' · NO SHOW' : '';
  const overrideNote = didHappen && amountOverride != null && amount !== defaultAmount ? ` · amount overridden to ₹${amount}` : '';
  const feedbackNote = feedback ? ` · feedback: ${feedback}` : '';
  await audit(req.user!.id, req.user!.name, 'SESSION_LOG', `${log.trainer.name} · ${date}${noShowNote}${overrideNote}${feedbackNote}`);
  res.status(201).json(log);
});

sessionLogsRouter.patch('/:id', requireRole(...SESSION_LOG_WRITE), async (req: AuthedRequest, res) => {
  const data: any = {};
  // Any authorized role can edit these operational fields
  for (const f of ['hours', 'rateSnapshot', 'amountInr', 'notes', 'proceed', 'comments', 'sessionHappened']) {
    if (f in req.body) data[f] = req.body[f];
  }
  // Status (Paid/NotPaid) is restricted to demo_lead (Samita) and founder
  if ('status' in req.body) {
    const role = req.user!.role;
    if (role !== 'demo_lead' && role !== 'founder') {
      return res.status(403).json({ error: 'Only Samita (demo_lead) or founder can mark payment status' });
    }
    data.status = req.body.status;
  }

  // Auto-recalculate amountInr when rate or hours change (unless explicitly overridden)
  if (('rateSnapshot' in req.body || 'hours' in req.body) && !('amountInr' in req.body)) {
    const existing = await prisma.sessionLog.findUnique({ where: { id: req.params.id }, select: { hours: true, rateSnapshot: true, rateModel: true } });
    if (existing) {
      const hours = data.hours ?? existing.hours;
      const rate = data.rateSnapshot ?? existing.rateSnapshot ?? 0;
      const rateModel = existing.rateModel;
      const hourlyRate = rateModel === 'per_session' ? rate / 2 : rate;
      data.amountInr = Math.round(hours * hourlyRate);
    }
  }

  const log = await prisma.sessionLog.update({ where: { id: req.params.id }, data, include });
  res.json(log);
});

// Founder-only: delete all session logs before a given date (irreversible)
sessionLogsRouter.delete('/purge-before', requireRole('founder'), async (req: AuthedRequest, res) => {
  const { before } = req.query as any;
  if (!before) return res.status(400).json({ error: 'before date required' });
  const { count } = await prisma.sessionLog.deleteMany({ where: { date: { lt: before } } });
  await audit(req.user!.id, req.user!.name, 'SESSION_PURGE', `Deleted ${count} session logs before ${before}`);
  res.json({ ok: true, deleted: count });
});

sessionLogsRouter.post('/bulk-status', requireRole(...SESSION_LOG_WRITE), async (req: AuthedRequest, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids) || !status) return res.status(400).json({ error: 'ids + status required' });
  await prisma.sessionLog.updateMany({ where: { id: { in: ids } }, data: { status } });
  await audit(req.user!.id, req.user!.name, 'SESSION_BULK', `${ids.length} → ${status}`);
  res.json({ ok: true, count: ids.length });
});
