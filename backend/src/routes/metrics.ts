import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';

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

metricsRouter.get('/pipeline', requireRole('founder', 'manager', 'lead', 'demo_lead', 'sales_closer'), async (_req, res) => {
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

metricsRouter.get('/money-flow', requireRole('founder', 'manager', 'accounts'), async (_req, res) => {
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

// Single lightweight endpoint for all sidebar badge counts.
// Uses DB count() queries scoped to the requesting user's role — no full client dumps.
metricsRouter.get('/nav-badges', async (req: AuthedRequest, res) => {
  const role = req.user!.role;
  const userId = req.user!.id;
  const today = todayISO();
  const weekOut = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();

  // Helper: count clients matching a where clause
  const cc = (where: any) => prisma.client.count({ where });

  const [
    pendingVaibhavCount,
    pendingLeverageCount,
    sourcingOpenCount,
    verPendingCount,
    editReqPendingCount,
    escalationCount,
    dormantOverdueCount,
    holdDueCount,
    demoIntakePendingCount,
    demosTodayCount,
    feedbackPendingCount,
    renewalsDueCount,
    followUpActiveTotalCount,
    salesClosingActiveCount,
    followUpsDueCount,
  ] = await Promise.all([
    // pendingVaibhav — founder/accounts only
    ['founder', 'accounts'].includes(role)
      ? cc({ paymentPendingVaibhav: true })
      : Promise.resolve(0),

    // leverage pending — founder only
    role === 'founder'
      ? prisma.leverageRequest.count({ where: { status: 'PendingVaibhav' } })
      : Promise.resolve(0),

    // sourcing open — founder/recruiter
    ['founder', 'recruiter'].includes(role)
      ? prisma.sourcingRequest.count({ where: { status: 'Open' } })
      : Promise.resolve(0),

    // verifications pending — founder/demo_lead/demo_intake
    ['founder', 'demo_lead', 'demo_intake'].includes(role)
      ? prisma.sourcingRequest.count({ where: { status: 'Proposed' } })
      : Promise.resolve(0),

    // edit requests pending — founder/demo_lead
    ['founder', 'demo_lead'].includes(role)
      ? prisma.editRequest.count({ where: { status: 'Pending' } })
      : Promise.resolve(0),

    // escalations — founder/manager/lead/demo_lead/demo_intake
    ['founder', 'manager', 'lead', 'demo_lead', 'demo_intake'].includes(role)
      ? prisma.regularTraining.count({ where: { demoEscalationRequested: true, status: 'active' } })
      : Promise.resolve(0),

    // dormant overdue
    role === 'sales_closer'
      ? cc({ lifecycle: 'SaleClosing', saleClosingSubStatus: 'DP', salesOwnerId: userId })
      : ['founder', 'demo_lead', 'demo_intake', 'sales_closer'].includes(role)
      ? cc({ lifecycle: 'Dormant', dormantCheckBackOn: { lte: today } })
      : Promise.resolve(0),

    // hold due
    role === 'sales_closer'
      ? cc({ lifecycle: 'SaleClosing', saleClosingSubStatus: { in: ['CP', 'C'] }, salesOwnerId: userId })
      : ['founder', 'manager', 'demo_lead', 'sales_closer'].includes(role)
      ? cc({ lifecycle: 'Hold', holdCheckBackOn: { lte: today } })
      : Promise.resolve(0),

    // demo intake pending — founder/demo_lead/demo_intake
    ['founder', 'demo_lead', 'demo_intake'].includes(role)
      ? cc({ lifecycle: { in: ['Lead', 'IntakeSent'] } })
      : Promise.resolve(0),

    // demos today — founder/demo_lead/demo_intake
    ['founder', 'demo_lead', 'demo_intake'].includes(role)
      ? cc({ lifecycle: 'DemoScheduled', demoDate: { lte: weekOut } })
      : Promise.resolve(0),

    // feedback pending — founder/demo_lead
    ['founder', 'demo_lead'].includes(role)
      ? cc({ lifecycle: { in: ['DemoDone', 'FeedbackPending'] } })
      : Promise.resolve(0),

    // renewals due — founder only
    role === 'founder'
      ? cc({ lifecycle: { in: ['Active', 'LeverageGranted'] }, nextRenewalDue: { lte: weekOut } })
      : Promise.resolve(0),

    // follow-up payments active total — founder/manager/accounts/demo_lead
    ['founder', 'manager', 'accounts', 'demo_lead'].includes(role)
      ? cc({ lifecycle: { in: ['Active', 'LeverageGranted', 'SaleWon'] }, cycleAmount: { gt: 0 } })
      : Promise.resolve(0),

    // sales closing active — founder/sales_closer
    role === 'sales_closer'
      ? cc({ lifecycle: { in: ['SaleClosing', 'SaleWon'] }, saleClosingSubStatus: { not: 'DP' }, salesOwnerId: userId })
      : ['founder', 'demo_lead'].includes(role)
      ? cc({ lifecycle: { in: ['DemoDone', 'FeedbackPending', 'SaleClosing'] } })
      : Promise.resolve(0),

    // follow-ups due (Roshni) — founder/sales_closer
    role === 'sales_closer'
      ? cc({ lifecycle: { in: ['SaleClosing', 'SaleWon'] }, OR: [{ saleClosingSubStatus: null }, { saleClosingSubStatus: 'RP' }], salesOwnerId: userId })
      : role === 'founder'
      ? cc({ lifecycle: { in: ['SaleClosing', 'SaleWon'] }, saleClosingSubStatus: { in: ['RP', 'CP', 'C'] }, roshniNextCallOn: { lte: today } })
      : Promise.resolve(0),
  ]);

  res.json({
    pendingVaibhav: pendingVaibhavCount,
    pendingLeverage: pendingLeverageCount,
    sourcingOpen: sourcingOpenCount,
    verPending: verPendingCount,
    editReqPending: editReqPendingCount,
    escalationCount,
    dormantOverdue: dormantOverdueCount,
    holdDue: holdDueCount,
    demoIntakePending: demoIntakePendingCount,
    demosToday: demosTodayCount,
    feedbackPending: feedbackPendingCount,
    renewalsDue: renewalsDueCount,
    followUpActiveTotal: followUpActiveTotalCount,
    salesClosingActive: salesClosingActiveCount,
    followUpsDue: followUpsDueCount,
  });
});

// ── Finance dashboard — founder only ─────────────────────────────────────────
// GET /api/metrics/finance?months=12
// Returns: per-month actual revenue, expenses, net P&L + projections + business health
metricsRouter.get('/finance', requireRole('founder'), async (req: AuthedRequest, res) => {
  const monthCount = Math.min(Number(req.query.months) || 12, 24);
  const today = todayISO();

  const FX_INR: Record<string, number> = { USD: 83, CAD: 60, INR: 1, EUR: 90, GBP: 105, AUD: 55, AED: 23 };

  // Build list of YYYY-MM strings going back N months (newest first)
  const months: string[] = [];
  for (let i = 0; i < monthCount; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  months.reverse(); // oldest first

  // Fetch all data in parallel
  const firstMonth = months[0] + '-01';
  const [allPayments, allSessions, allClients, allPayouts] = await Promise.all([
    prisma.payment.findMany({
      where: { paymentDate: { gte: firstMonth } },
      select: { amount: true, currency: true, paymentDate: true, kind: true },
    }),
    prisma.sessionLog.findMany({
      where: { date: { gte: firstMonth } },
      select: { amountInr: true, date: true, status: true, hours: true, sessionHappened: true },
    }),
    prisma.client.findMany({
      select: {
        id: true, lifecycle: true, currency: true, cycleAmount: true, paymentModel: true,
        createdAt: true, churnRisk: true, source: true,
        freshPaymentAmount: true, freshPaymentDate: true,
        nextRenewalDue: true,
      },
    }),
    prisma.payoutBatch.findMany({
      where: { createdAt: { gte: new Date(firstMonth) } },
      select: { totalInr: true, status: true, weekStart: true, paidAt: true },
    }),
  ]);

  // ── Per-month buckets ─────────────────────────────────────────────────
  const byMonth = months.map((m) => {
    const payments = allPayments.filter((p) => p.paymentDate.startsWith(m));
    const sessions = allSessions.filter((s) => s.date.startsWith(m));

    // Revenue by currency → INR
    const byCurrency: Record<string, number> = {};
    for (const p of payments) byCurrency[p.currency] = (byCurrency[p.currency] || 0) + p.amount;
    const revenueINR = Object.entries(byCurrency).reduce((s, [c, a]) => s + a * (FX_INR[c] || 0), 0);
    const freshRevINR = allPayments
      .filter((p) => p.paymentDate.startsWith(m) && p.kind === 'Fresh')
      .reduce((s, p) => s + p.amount * (FX_INR[p.currency] || 0), 0);
    const renewalRevINR = allPayments
      .filter((p) => p.paymentDate.startsWith(m) && p.kind === 'Renewal')
      .reduce((s, p) => s + p.amount * (FX_INR[p.currency] || 0), 0);

    // Trainer cost (actual paid)
    const trainerPaid = sessions.filter((s) => s.status === 'Paid').reduce((s, l) => s + l.amountInr, 0);
    const trainerPending = sessions.filter((s) => ['Logged', 'ReadyForFinal', 'PaymentApproved'].includes(s.status)).reduce((s, l) => s + l.amountInr, 0);
    const trainerTotal = sessions.reduce((s, l) => s + l.amountInr, 0);

    // Gross margin
    const grossMargin = revenueINR - trainerTotal;
    const marginPct = revenueINR > 0 ? Math.round((grossMargin / revenueINR) * 100) : 0;

    // Sessions
    const totalSessions = sessions.length;
    const sessionHours = sessions.reduce((s, l) => s + l.hours, 0);
    const noShows = sessions.filter((s) => !s.sessionHappened).length;

    // Client snapshot at month end
    const monthEnd = m + '-31'; // rough upper bound
    const newClients = allClients.filter((c) => c.createdAt.toISOString().slice(0, 7) === m).length;

    return {
      month: m,
      revenueINR: Math.round(revenueINR),
      freshRevINR: Math.round(freshRevINR),
      renewalRevINR: Math.round(renewalRevINR),
      byCurrency,
      trainerPaid: Math.round(trainerPaid),
      trainerPending: Math.round(trainerPending),
      trainerTotal: Math.round(trainerTotal),
      grossMargin: Math.round(grossMargin),
      marginPct,
      totalSessions,
      sessionHours: Math.round(sessionHours * 10) / 10,
      noShows,
      newClients,
    };
  });

  // ── Current business state ────────────────────────────────────────────
  const activeClients = allClients.filter((c) => ['Active', 'LeverageGranted'].includes(c.lifecycle));
  const churned = allClients.filter((c) => c.lifecycle === 'Churned');
  const pipeline = allClients.filter((c) =>
    ['Lead','IntakeSent','IntakeReceived','InternalSearch','WithRecruiters','VerificationPending','TrainerMatched','DemoScheduled','DemoDone','SaleClosing'].includes(c.lifecycle)
  );

  // Monthly recurring revenue projection: sum of active clients' cycleAmount converted to INR, normalised to monthly
  const CYCLE_MONTHS: Record<string, number> = { Weekly: 0.25, BiWeekly: 0.5, Monthly: 1, None: 0 };
  const mrr = activeClients.reduce((s, c) => {
    const cycleMult = CYCLE_MONTHS[c.paymentModel || 'None'] || 0;
    if (!cycleMult || !c.cycleAmount) return s;
    const inr = c.cycleAmount * (FX_INR[c.currency || 'INR'] || 1);
    return s + inr * (1 / cycleMult); // normalise to monthly
  }, 0);

  // Revenue by client source (all time)
  const sourceBreakdown: Record<string, { count: number; active: number }> = {};
  for (const c of allClients) {
    const src = c.source || 'Unknown';
    if (!sourceBreakdown[src]) sourceBreakdown[src] = { count: 0, active: 0 };
    sourceBreakdown[src].count++;
    if (['Active','LeverageGranted'].includes(c.lifecycle)) sourceBreakdown[src].active++;
  }

  // Churn risk breakdown
  const churnRisk = {
    red: activeClients.filter((c) => c.churnRisk === 'Red').length,
    amber: activeClients.filter((c) => c.churnRisk === 'Amber').length,
    green: activeClients.filter((c) => c.churnRisk === 'Green').length,
    none: activeClients.filter((c) => !c.churnRisk).length,
  };

  // Revenue at risk (red + amber churn risk clients' expected monthly revenue)
  const revenueAtRisk = activeClients
    .filter((c) => ['Red', 'Amber'].includes(c.churnRisk || ''))
    .reduce((s, c) => {
      const cycleMult = CYCLE_MONTHS[c.paymentModel || 'None'] || 0;
      if (!cycleMult || !c.cycleAmount) return s;
      return s + c.cycleAmount * (FX_INR[c.currency || 'INR'] || 1) * (1 / cycleMult);
    }, 0);

  // 3-month rolling average revenue (for trend)
  const lastThree = byMonth.slice(-3);
  const avgRevenue3m = lastThree.length ? lastThree.reduce((s, m) => s + m.revenueINR, 0) / lastThree.length : 0;

  // Projection: next 3 months based on MRR (simple linear)
  const projections = [1, 2, 3].map((i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + i);
    return {
      month: d.toISOString().slice(0, 7),
      projectedRevenueINR: Math.round(mrr),
      projectedTrainerCostINR: byMonth.length
        ? Math.round(byMonth.slice(-3).reduce((s, m) => s + m.trainerTotal, 0) / Math.max(lastThree.length, 1))
        : 0,
    };
  });

  // Renewals due soon (next 30 days)
  const thirtyOut = new Date();
  thirtyOut.setDate(thirtyOut.getDate() + 30);
  const thirtyISO = thirtyOut.toISOString().slice(0, 10);
  const renewalsDue = activeClients.filter((c) => c.nextRenewalDue && c.nextRenewalDue <= thirtyISO && c.nextRenewalDue >= today);

  res.json({
    byMonth,
    projections,
    snapshot: {
      activeClients: activeClients.length,
      churned: churned.length,
      pipeline: pipeline.length,
      mrr: Math.round(mrr),
      avgRevenue3m: Math.round(avgRevenue3m),
      revenueAtRisk: Math.round(revenueAtRisk),
      churnRisk,
      sourceBreakdown,
      renewalsDueSoon: renewalsDue.length,
    },
    fxRates: FX_INR,
  });
});
