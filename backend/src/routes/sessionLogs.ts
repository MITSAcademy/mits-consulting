import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';

const SESSION_LOG_READ  = ['founder', 'lead', 'account_manager', 'accounts', 'payment_processor'];
const SESSION_LOG_WRITE = ['founder', 'lead', 'account_manager', 'payment_processor'];
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
  const { trainerId, clientId, date, hours, rateSnapshot, rateModel, notes, amountInr: amountOverride, feedback } = req.body;
  if (!trainerId || !date || !hours) return res.status(400).json({ error: 'trainerId, date, hours required' });

  // lead (Bhavneet) can only log sessions for clients owned by her team.
  // null hostOwnerId = unassigned → also blocked (not her team).
  if (req.user!.role === 'lead' && clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { hostOwnerId: true } });
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.hostOwnerId || !LEAD_TEAM_IDS.includes(client.hostOwnerId)) {
      return res.status(403).json({ error: 'You can only log sessions for clients on your team (Bhavneet / Kashish / Muskan)' });
    }
  }
  const defaultAmount = Math.round(hours * rateSnapshot);
  const amount = (amountOverride != null && !isNaN(Number(amountOverride))) ? Math.round(Number(amountOverride)) : defaultAmount;
  const log = await prisma.sessionLog.create({
    data: {
      trainerId, clientId, date, hours, rateSnapshot, rateModel,
      amountInr: amount, status: 'Logged', notes,
      feedback: feedback || null,
      loggedById: req.user!.id,
    },
    include,
  });
  const overrideNote = (amountOverride != null && amount !== defaultAmount) ? ` · amount overridden to ₹${amount} (default ₹${defaultAmount})` : '';
  const feedbackNote = feedback ? ` · feedback: ${feedback}` : '';
  await audit(req.user!.id, req.user!.name, 'SESSION_LOG', `${log.trainer.name} · ${date}${overrideNote}${feedbackNote}`);
  res.status(201).json(log);
});

sessionLogsRouter.patch('/:id', requireRole(...SESSION_LOG_WRITE), async (req: AuthedRequest, res) => {
  const data: any = {};
  // Any authorized role can edit these operational fields
  for (const f of ['hours', 'rateSnapshot', 'amountInr', 'notes', 'proceed', 'comments']) {
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
  const log = await prisma.sessionLog.update({ where: { id: req.params.id }, data, include });
  res.json(log);
});

sessionLogsRouter.post('/bulk-status', requireRole(...SESSION_LOG_WRITE), async (req: AuthedRequest, res) => {
  const { ids, status } = req.body;
  if (!Array.isArray(ids) || !status) return res.status(400).json({ error: 'ids + status required' });
  await prisma.sessionLog.updateMany({ where: { id: { in: ids } }, data: { status } });
  await audit(req.user!.id, req.user!.name, 'SESSION_BULK', `${ids.length} → ${status}`);
  res.json({ ok: true, count: ids.length });
});
