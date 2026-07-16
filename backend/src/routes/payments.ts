import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';
import { checkPermission } from '../lib/rolePermissions';

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

const include = {
  client: { select: { id: true, name: true, currency: true } },
  bankAccount: true,
  receivedBy: { select: { id: true, name: true } },
};

paymentsRouter.get('/', async (req: AuthedRequest, res) => {
  if (!await checkPermission('payments.read', req.user!.role)) return res.status(403).json({ error: 'Forbidden' });
  const { from, to, clientId } = req.query as any;
  const where: any = {};
  if (clientId) where.clientId = clientId;
  if (from || to) where.paymentDate = { gte: from, lte: to };
  const payments = await prisma.payment.findMany({ where, include, orderBy: { paymentDate: 'desc' } });
  res.json(payments);
});

paymentsRouter.post('/', async (req: AuthedRequest, res) => {
  if (!await checkPermission('payments.write', req.user!.role)) return res.status(403).json({ error: 'Not allowed to record payments' });
  const { clientId, kind, amount, currency, paymentDate, bankAccountId, paymentMode } = req.body;
  if (!clientId || !amount || !currency || !paymentDate) {
    return res.status(400).json({ error: 'clientId, amount, currency, paymentDate required' });
  }
  const today = new Date(); today.setHours(23, 59, 59, 999);
  if (new Date(paymentDate) > today) {
    return res.status(400).json({ error: `Payment date cannot be in the future. You entered ${paymentDate} — please use today's date or earlier.` });
  }
  const kindToUse = kind || 'Fresh';
  const amountToUse = Number(amount);

  let priorFreshTotal = 0;
  let clientCycleAmount: number | null = null;
  if (kindToUse === 'Fresh') {
    const existingFresh = await prisma.payment.findMany({
      where: { clientId, kind: 'Fresh' },
      select: { amount: true },
    });
    priorFreshTotal = existingFresh.reduce((s, p) => s + (p.amount || 0), 0);
    const cli = await prisma.client.findUnique({
      where: { id: clientId },
      select: { cycleAmount: true },
    });
    clientCycleAmount = cli?.cycleAmount || null;
  }

  const activeTraining = await prisma.regularTraining.findFirst({
    where: { clientId, status: 'active' },
    select: { trainerId: true },
  });
  const p = await prisma.payment.create({
    data: {
      clientId, kind: kindToUse, amount: amountToUse, currency,
      paymentDate, bankAccountId: bankAccountId || null,
      paymentMode: paymentMode || 'Bank',
      receivedById: req.user!.id,
      trainerId: activeTraining?.trainerId || null,
    },
    include,
  });

  if (kindToUse === 'Fresh') {
    const newTotal = priorFreshTotal + amountToUse;
    const fullyReceived = clientCycleAmount ? newTotal >= clientCycleAmount : true;
    await prisma.client.update({
      where: { id: clientId },
      data: {
        freshPaymentReceived: fullyReceived,
        freshPaymentDate: paymentDate,
        freshPaymentAmount: newTotal,
        ...(fullyReceived ? { lifecycle: 'SaleWon' as const } : {}),
      },
    });
  }
  await audit(
    req.user!.id, req.user!.name, 'PAYMENT_RECORD',
    `${p.client.name} · ${currency} ${amountToUse}${kindToUse === 'Fresh' && priorFreshTotal > 0 ? ` · top-up (prior ${currency} ${priorFreshTotal})` : ''}`,
  );
  res.status(201).json(p);
});

// PATCH /:id — correct payment date (manager/founder only, cannot set future date)
paymentsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  if (!['founder', 'manager'].includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const { paymentDate } = req.body;
  if (!paymentDate) return res.status(400).json({ error: 'paymentDate required' });
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  if (new Date(paymentDate) > todayEnd) {
    return res.status(400).json({ error: `Payment date cannot be in the future.` });
  }
  const updated = await prisma.payment.update({ where: { id: req.params.id }, data: { paymentDate } });
  res.json(updated);
});

paymentsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only founder' });
  await prisma.payment.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
