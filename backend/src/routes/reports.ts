import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

const REPORTS_ALL_ROLES = ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'];

reportsRouter.get('/', async (req: AuthedRequest, res) => {
  const { userId, from, to } = req.query as any;
  const where: any = {};
  // Non-leadership roles can only read their own reports
  if (!REPORTS_ALL_ROLES.includes(req.user!.role)) {
    where.userId = req.user!.id;
  } else if (userId) {
    where.userId = userId;
  }
  if (from || to) where.date = { gte: from, lte: to };
  const reports = await prisma.dailyReport.findMany({
    where,
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { date: 'desc' },
  });
  res.json(reports);
});

reportsRouter.post('/', async (req: AuthedRequest, res) => {
  const { date, content } = req.body;
  if (!date || !content) return res.status(400).json({ error: 'date + content required' });
  const r = await prisma.dailyReport.create({
    data: { userId: req.user!.id, date, content },
  });
  await audit(req.user!.id, req.user!.name, 'DAILY_REPORT', date);
  res.status(201).json(r);
});

// ── Monthly summary report ────────────────────────────────────────────────────
// GET /api/reports/monthly?month=YYYY-MM
// Access: founder, manager, lead, account_manager
reportsRouter.get(
  '/monthly',
  requireRole('founder', 'manager', 'lead', 'account_manager'),
  async (req: AuthedRequest, res) => {
    const { month } = req.query as { month?: string };
    // Default to current month if not provided
    const m = month || new Date().toISOString().slice(0, 7);
    // Validate format
    if (!/^\d{4}-\d{2}$/.test(m)) {
      return res.status(400).json({ error: 'month must be YYYY-MM' });
    }
    const [year, mo] = m.split('-').map(Number);
    const monthStart = new Date(year, mo - 1, 1);
    const monthEnd = new Date(year, mo, 1); // exclusive

    // paymentDate is a string in the DB (e.g. "2026-06-15"), use string prefix match
    const monthPrefix = m; // "YYYY-MM"

    // 1. Sessions in month
    const sessions = await prisma.sessionLog.findMany({
      where: { date: { startsWith: monthPrefix } },
      select: {
        id: true,
        hours: true,
        amountInr: true,
        status: true,
        trainerId: true,
        trainer: { select: { id: true, name: true } },
        client: { select: { id: true, assignedAmId: true, assignedAm: { select: { id: true, name: true } } } },
      },
    });

    const totalSessions = sessions.length;
    const totalSessionHours = sessions.reduce((s, x) => s + x.hours, 0);
    const totalTrainersPaid = sessions
      .filter((x) => x.status === 'Paid')
      .reduce((s, x) => s + x.amountInr, 0);

    // 2. Payments in month
    const payments = await prisma.payment.findMany({
      where: { paymentDate: { startsWith: monthPrefix } },
      select: {
        id: true,
        amount: true,
        currency: true,
        paymentDate: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalPaymentsReceived = payments.reduce((s, x) => s + x.amount, 0);
    const recentPayments = payments.slice(0, 10).map((p) => ({
      id: p.id,
      clientName: p.client?.name ?? 'Unknown',
      amount: p.amount,
      currency: p.currency,
      paymentDate: p.paymentDate,
    }));

    // 3. Active clients (lifecycle=Active)
    const activeClients = await prisma.client.count({
      where: { lifecycle: 'Active' },
    });

    // 4. New clients this month (createdAt in range)
    const newClients = await prisma.client.count({
      where: { createdAt: { gte: monthStart, lt: monthEnd } },
    });

    // 5. Lost clients = Retrospective entries in this month
    const lostClients = await prisma.retrospective.count({
      where: { removedAt: { gte: monthStart, lt: monthEnd } },
    });

    // 6. By coordinator (assignedAm on sessions)
    const coordMap = new Map<string, { name: string; sessions: number; clientIds: Set<string> }>();
    for (const s of sessions) {
      const am = s.client?.assignedAm;
      if (!am) continue;
      if (!coordMap.has(am.id)) {
        coordMap.set(am.id, { name: am.name, sessions: 0, clientIds: new Set() });
      }
      const entry = coordMap.get(am.id)!;
      entry.sessions++;
      if (s.client?.id) entry.clientIds.add(s.client.id);
    }
    const byCoordinator = Array.from(coordMap.values()).map((e) => ({
      name: e.name,
      sessions: e.sessions,
      clients: e.clientIds.size,
    })).sort((a, b) => b.sessions - a.sessions);

    // 7. Top trainers by sessions this month
    const trainerMap = new Map<string, { name: string; sessions: number; amountInr: number }>();
    for (const s of sessions) {
      if (!trainerMap.has(s.trainerId)) {
        trainerMap.set(s.trainerId, { name: s.trainer.name, sessions: 0, amountInr: 0 });
      }
      const entry = trainerMap.get(s.trainerId)!;
      entry.sessions++;
      entry.amountInr += s.amountInr;
    }
    const topTrainers = Array.from(trainerMap.values())
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10);

    res.json({
      month: m,
      summary: {
        totalSessions,
        totalSessionHours: Math.round(totalSessionHours * 10) / 10,
        totalPaymentsReceived,
        totalTrainersPaid,
        activeClients,
        newClients,
        lostClients,
      },
      byCoordinator,
      topTrainers,
      recentPayments,
    });
  }
);
