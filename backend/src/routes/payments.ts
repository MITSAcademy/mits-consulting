import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

const include = {
  client: { select: { id: true, name: true, currency: true } },
  bankAccount: true,
  receivedBy: { select: { id: true, name: true } },
};

paymentsRouter.get('/', async (req, res) => {
  const { from, to, clientId } = req.query as any;
  const where: any = {};
  if (clientId) where.clientId = clientId;
  if (from || to) where.paymentDate = { gte: from, lte: to };
  const payments = await prisma.payment.findMany({ where, include, orderBy: { paymentDate: 'desc' } });
  res.json(payments);
});

paymentsRouter.post('/', async (req: AuthedRequest, res) => {
  if (!['founder', 'demo_lead', 'manager', 'sales_closer', 'accounts'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed to record payments' });
  }
  const { clientId, kind, amount, currency, paymentDate, bankAccountId, paymentMode } = req.body;
  if (!clientId || !amount || !currency || !paymentDate) {
    return res.status(400).json({ error: 'clientId, amount, currency, paymentDate required' });
  }
  const p = await prisma.payment.create({
    data: {
      clientId, kind: kind || 'Fresh', amount: Number(amount), currency,
      paymentDate, bankAccountId: bankAccountId || null,
      paymentMode: paymentMode || 'Bank',
      receivedById: req.user!.id,
    },
    include,
  });
  if (kind === 'Fresh') {
    await prisma.client.update({
      where: { id: clientId },
      data: {
        freshPaymentReceived: true,
        freshPaymentDate: paymentDate,
        freshPaymentAmount: Number(amount),
        lifecycle: 'SaleWon',
      },
    });
  }
  await audit(req.user!.id, req.user!.name, 'PAYMENT_RECORD', `${p.client.name} · ${currency} ${amount}`);
  res.status(201).json(p);
});

paymentsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only founder' });
  await prisma.payment.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
