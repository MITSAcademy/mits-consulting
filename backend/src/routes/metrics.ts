import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../lib/auth';

export const metricsRouter = Router();
metricsRouter.use(requireAuth);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

metricsRouter.get('/home', async (_req, res) => {
  const today = todayISO();
  const monthStart = today.slice(0, 8) + '01';

  const [payments, clients, sessions, leverage] = await Promise.all([
    prisma.payment.findMany({ where: { paymentDate: { gte: monthStart } } }),
    prisma.client.findMany(),
    prisma.sessionLog.findMany({ where: { date: { gte: monthStart } } }),
    prisma.leverageRequest.findMany({ where: { status: 'PendingVaibhav' } }),
  ]);

  const usdIn = payments.filter((p) => p.currency === 'USD').reduce((s, p) => s + p.amount, 0);
  const cadIn = payments.filter((p) => p.currency === 'CAD').reduce((s, p) => s + p.amount, 0);
  const trainerOut = sessions.reduce((s, l) => s + l.amountInr, 0);
  const trainerPending = sessions
    .filter((l) => ['Logged', 'ReadyForFinal', 'PaymentApproved'].includes(l.status))
    .reduce((s, l) => s + l.amountInr, 0);

  const active = clients.filter((c) => c.lifecycle === 'Active' || c.lifecycle === 'LeverageGranted');
  const inPipeline = clients.filter((c) =>
    ['Lead', 'IntakeSent', 'IntakeReceived', 'InternalSearch', 'WithRecruiters', 'VerificationPending', 'TrainerMatched', 'DemoScheduled', 'DemoDone', 'SaleClosing'].includes(c.lifecycle),
  );
  const dueToday = active.filter((c) => c.nextRenewalDue === today).length;
  const holds = clients.filter((c) => c.lifecycle === 'Hold').length;
  const red = active.filter((c) => c.churnRisk === 'Red').length;
  const amber = active.filter((c) => c.churnRisk === 'Amber').length;
  const pendingVaibhav = clients.filter((c) => c.paymentPendingVaibhav);
  const dormant = clients.filter((c) => c.lifecycle === 'Dormant');
  const dormantOverdue = dormant.filter((c) => c.dormantCheckBackOn && c.dormantCheckBackOn <= today).length;

  res.json({
    money: {
      usdIn, cadIn,
      usdInINR: usdIn * 83,
      cadInINR: cadIn * 60,
      totalInINR: usdIn * 83 + cadIn * 60,
      trainerOut, trainerPending,
      net: usdIn * 83 + cadIn * 60 - trainerOut,
    },
    ops: {
      activeClients: active.length,
      inPipeline: inPipeline.length,
      dueToday, holds, red, amber,
      pendingLeverage: leverage.length,
      pendingVaibhav: pendingVaibhav.length,
      dormant: dormant.length,
      dormantOverdue,
    },
    pendingVaibhav,
    counts: {
      total: clients.length,
    },
  });
});

metricsRouter.get('/pipeline', async (_req, res) => {
  const LIFECYCLE = [
    'Lead', 'IntakeSent', 'IntakeReceived', 'InternalSearch', 'WithRecruiters',
    'VerificationPending', 'TrainerMatched', 'DemoScheduled', 'DemoDone',
    'SaleClosing', 'SaleWon', 'Active',
  ];
  const all = await prisma.client.findMany({ orderBy: { createdAt: 'desc' } });
  const grouped: Record<string, any[]> = {};
  LIFECYCLE.forEach((s) => (grouped[s] = []));
  all.forEach((c) => {
    if (grouped[c.lifecycle]) grouped[c.lifecycle].push(c);
  });
  res.json(grouped);
});

metricsRouter.get('/money-flow', async (_req, res) => {
  const today = todayISO();
  const monthStart = today.slice(0, 8) + '01';
  const banks = await prisma.bankAccount.findMany();
  const payments = await prisma.payment.findMany({ where: { paymentDate: { gte: monthStart } } });
  const byBank = banks.map((b) => {
    const ps = payments.filter((p) => p.bankAccountId === b.id);
    const usd = ps.filter((p) => p.currency === 'USD').reduce((s, p) => s + p.amount, 0);
    const cad = ps.filter((p) => p.currency === 'CAD').reduce((s, p) => s + p.amount, 0);
    return { bank: b, count: ps.length, usd, cad };
  });
  res.json({ byBank: byBank.filter((b) => b.count > 0) });
});
