import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';

const SESSION_LOG_READ  = ['founder', 'manager', 'lead', 'staff', 'account_manager', 'accounts', 'payment_processor'];
const SESSION_LOG_WRITE = ['founder', 'manager', 'lead', 'staff', 'account_manager', 'accounts', 'payment_processor'];
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
  client: { select: { id: true, name: true, hostOwner: { select: { id: true, name: true } } } },
};

sessionLogsRouter.get('/', requireRole(...SESSION_LOG_READ), async (req: AuthedRequest, res) => {
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
  // account_manager: scope to clients from their active RegularTrainings only
  if (req.user!.role === 'account_manager') {
    const myTrainings = await prisma.regularTraining.findMany({
      where: {
        status: 'active',
        OR: [{ hostedByDefaultId: req.user!.id }, { client: { assignedAmId: req.user!.id } }],
      },
      select: { clientId: true },
    });
    const myClientIds = [...new Set(myTrainings.map((t) => t.clientId).filter(Boolean))] as string[];
    where.clientId = clientId ? clientId : { in: myClientIds };
  }
  // lead: scope to clients that have at least one active RegularTraining
  // (matches My Sessions exactly — avoids missing clients whose hostOwnerId is unset or outside the team)
  if (req.user!.role === 'lead') {
    where.client = { regularTrainings: { some: { status: 'active' } } };
  }
  const logs = await prisma.sessionLog.findMany({ where, include, orderBy: { date: 'desc' } });
  res.json(logs);
});

const LEAD_TEAM_IDS = ['u-bhavneet', 'u-kashish', 'u-muskan'];

sessionLogsRouter.post('/', requireRole(...SESSION_LOG_WRITE), async (req: AuthedRequest, res) => {
  const { trainerId, clientId, date, hours, rateSnapshot, rateModel, notes, amountInr: amountOverride, feedback, sessionHappened, cancelledBy } = req.body;
  const didHappen = sessionHappened !== false && sessionHappened !== 'false';
  if (!trainerId || !date) return res.status(400).json({ error: 'trainerId and date required' });
  if (!clientId) return res.status(400).json({ error: 'clientId is required — every session log must be linked to a client' });
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
    const directlyAssigned = client.hostOwnerId === req.user!.id || client.assignedAmId === req.user!.id;
    if (!directlyAssigned) {
      // Also allow if they host an active RegularTraining for this client (covers backfilled stubs with null assignedAmId)
      const training = await prisma.regularTraining.findFirst({
        where: { clientId, status: 'active', hostedByDefaultId: req.user!.id },
        select: { id: true },
      });
      if (!training) {
        return res.status(403).json({ error: 'You can only log sessions for your assigned clients' });
      }
    }
  }

  // Validate that clientId + trainerId match an active RegularTraining — ensures the 4 systems stay in sync
  const linkedTraining = await prisma.regularTraining.findFirst({
    where: { clientId, trainerId, status: 'active' },
    select: { id: true },
  });
  if (!linkedTraining) {
    return res.status(400).json({
      error: `No active RegularTraining found linking this client to this trainer. Please fix the training record first — every session log must correspond to a live training in the system.`,
    });
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
    cancelledBy: !didHappen ? (cancelledBy || null) : null,
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
  for (const f of ['hours', 'rateSnapshot', 'amountInr', 'notes', 'proceed', 'comments', 'sessionHappened', 'cancelledBy', 'feedback']) {
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

// Delete a single session log — write roles only; lead/AM can only delete their own team's logs
sessionLogsRouter.delete('/:id', requireRole(...SESSION_LOG_WRITE), async (req: AuthedRequest, res) => {
  const log = await prisma.sessionLog.findUnique({ where: { id: req.params.id }, select: { id: true, trainerId: true, clientId: true, loggedById: true, client: { select: { hostOwnerId: true, assignedAmId: true } } } });
  if (!log) return res.status(404).json({ error: 'Not found' });
  // lead: can only delete logs for their team's clients
  if (req.user!.role === 'lead' && log.client?.hostOwnerId !== req.user!.id) {
    return res.status(403).json({ error: 'You can only delete session logs for your assigned clients' });
  }
  // account_manager: can only delete their own logged entries
  if (req.user!.role === 'account_manager' && log.loggedById !== req.user!.id) {
    return res.status(403).json({ error: 'You can only delete session logs you created' });
  }
  await prisma.sessionLog.delete({ where: { id: req.params.id } });
  await audit(req.user!.id, req.user!.name, 'SESSION_LOG_DELETE', `log ${req.params.id}`);
  res.json({ ok: true });
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
