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

  // Sum payments per currency — was previously USD + CAD only, which silently
  // dropped INR / EUR / GBP / AUD / AED into a black hole on MoneyFlow.
  const byCurrency: Record<string, number> = {};
  for (const p of payments) byCurrency[p.currency] = (byCurrency[p.currency] || 0) + p.amount;
  const usdIn = byCurrency.USD || 0;
  const cadIn = byCurrency.CAD || 0;
  const inrIn = byCurrency.INR || 0;
  const eurIn = byCurrency.EUR || 0;
  const gbpIn = byCurrency.GBP || 0;
  const audIn = byCurrency.AUD || 0;
  const aedIn = byCurrency.AED || 0;
  // Rough FX → INR for the consolidated "total inflow" view. Tune these in
  // one place if accountancy wants real spot rates.
  const FX_INR: Record<string, number> = { USD: 83, CAD: 60, INR: 1, EUR: 90, GBP: 105, AUD: 55, AED: 23 };
  const totalInINR = Object.entries(byCurrency).reduce((s, [c, a]) => s + a * (FX_INR[c] || 0), 0);
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
      usdIn, cadIn, inrIn, eurIn, gbpIn, audIn, aedIn,
      byCurrency,
      usdInINR: usdIn * FX_INR.USD,
      cadInINR: cadIn * FX_INR.CAD,
      totalInINR,
      trainerOut, trainerPending,
      net: totalInINR - trainerOut,
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
    // Sum per currency so a bank that receives INR / EUR / GBP / AUD / AED
    // doesn't appear empty just because the old code only summed USD + CAD.
    const byCurrency: Record<string, number> = {};
    for (const p of ps) byCurrency[p.currency] = (byCurrency[p.currency] || 0) + p.amount;
    return {
      bank: b,
      count: ps.length,
      usd: byCurrency.USD || 0,
      cad: byCurrency.CAD || 0,
      byCurrency,
    };
  });
  res.json({ byBank: byBank.filter((b) => b.count > 0) });
});
