import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const payoutsRouter = Router();
payoutsRouter.use(requireAuth);

payoutsRouter.get('/', async (_req, res) => {
  const batches = await prisma.payoutBatch.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(batches);
});

payoutsRouter.post('/', async (req: AuthedRequest, res) => {
  // Bhavneet (lead) creates batches from payment sheet; payment_processor + founder also allowed
  if (!['founder', 'lead', 'payment_processor', 'accounts'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Forbidden — only Bhavneet (lead), payment processor, or founder can create payout batches' });
  }
  const { weekStart, sessionIds } = req.body;
  if (!weekStart || !Array.isArray(sessionIds) || sessionIds.length === 0) {
    return res.status(400).json({ error: 'weekStart + sessionIds required' });
  }
  // Filter to ONLY sessions that are still in the Logged state. Without this
  // guard a caller could include sessions that were already paid in a prior
  // batch, double-paying the trainer.
  const logs = await prisma.sessionLog.findMany({
    where: { id: { in: sessionIds }, status: 'Logged' },
  });
  if (logs.length === 0) {
    return res.status(409).json({
      error: 'None of the supplied sessions are in "Logged" status — every one is already in a payout batch (Pending / Approved / Paid).',
    });
  }
  const validIds = logs.map((l) => l.id);
  const dropped = sessionIds.length - validIds.length;
  const totalInr = logs.reduce((s, l) => s + l.amountInr, 0);
  const batch = await prisma.payoutBatch.create({
    data: { weekStart, totalInr, sessionIds: validIds, status: 'Pending' },
  });
  await prisma.sessionLog.updateMany({ where: { id: { in: validIds } }, data: { status: 'ReadyForFinal' } });
  await audit(
    req.user!.id, req.user!.name, 'PAYOUT_BATCH_CREATE',
    `${weekStart} · ₹${totalInr} · ${validIds.length} sessions${dropped ? ` (${dropped} skipped — already in a batch)` : ''}`,
  );
  res.status(201).json({ ...batch, droppedIds: dropped });
});

payoutsRouter.post('/:id/approve', async (req: AuthedRequest, res) => {
  // Mitali (manager) approves Bhavneet's batches; founder as override
  if (!['founder', 'manager'].includes(req.user!.role)) return res.status(403).json({ error: 'Forbidden — only Mitali (manager) or founder can approve payout batches' });
  // Guard: only Pending → Approved. updateMany with where:status returns
  // count: 0 if the batch is already Approved/Paid/Cancelled, which we 409.
  const updated = await prisma.payoutBatch.updateMany({
    where: { id: req.params.id, status: 'Pending' },
    data: { status: 'Approved', approvedAt: new Date() },
  });
  if (updated.count === 0) {
    const current = await prisma.payoutBatch.findUnique({ where: { id: req.params.id }, select: { status: true } });
    return res.status(409).json({
      error: current
        ? `Batch is already "${current.status}" — can only approve a batch in "Pending" status.`
        : 'Batch not found.',
    });
  }
  const batch = await prisma.payoutBatch.findUnique({ where: { id: req.params.id } });
  if (batch) {
    await prisma.sessionLog.updateMany({
      where: { id: { in: batch.sessionIds } },
      data: { status: 'PaymentApproved' },
    });
  }
  await audit(req.user!.id, req.user!.name, 'PAYOUT_APPROVE', req.params.id);
  res.json(batch);
});

payoutsRouter.post('/:id/pay', async (req: AuthedRequest, res) => {
  if (!['founder', 'payment_processor', 'accounts'].includes(req.user!.role)) return res.status(403).json({ error: 'Forbidden' });
  // Guard: only Approved → Paid. Refuses re-paying a Paid batch (which would
  // overwrite paidAt and log a duplicate audit), and refuses paying a Pending
  // batch (forces the Approve gate to be respected).
  const updated = await prisma.payoutBatch.updateMany({
    where: { id: req.params.id, status: 'Approved' },
    data: { status: 'Paid', paidAt: new Date() },
  });
  if (updated.count === 0) {
    const current = await prisma.payoutBatch.findUnique({ where: { id: req.params.id }, select: { status: true } });
    return res.status(409).json({
      error: current
        ? `Batch is "${current.status}" — can only pay a batch in "Approved" status.`
        : 'Batch not found.',
    });
  }
  const batch = await prisma.payoutBatch.findUnique({ where: { id: req.params.id } });
  if (batch) {
    await prisma.sessionLog.updateMany({
      where: { id: { in: batch.sessionIds } },
      data: { status: 'Paid' },
    });
  }
  await audit(req.user!.id, req.user!.name, 'PAYOUT_PAID', req.params.id);
  res.json(batch);
});

// POST /payouts/auto-archive — archive previous week's Logged sessions into a PayoutBatch.
// Called by Saturday cron (system) or manually by founder/lead. Idempotent: if a batch
// for that weekStart already exists it returns the existing batch.
payoutsRouter.post('/auto-archive', async (req: AuthedRequest, res) => {
  if (!['founder', 'lead', 'manager', 'payment_processor'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  // Default to archiving the *previous* Monday's week (the week just ended Saturday)
  const { weekStart: supplied } = req.body || {};
  let weekStart = supplied as string | undefined;
  if (!weekStart) {
    // Compute the Monday that just ended
    const now = new Date();
    const day = now.getDay(); // 0=Sun … 6=Sat
    const daysToLastMonday = day === 0 ? 6 : day - 1;
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - daysToLastMonday - 7);
    weekStart = lastMonday.toISOString().slice(0, 10);
  }

  // Idempotency: already archived?
  const existing = await prisma.payoutBatch.findFirst({ where: { weekStart } });
  if (existing) {
    return res.json({ alreadyArchived: true, batch: existing });
  }

  const weekEnd = addDays(weekStart, 6);
  const logs = await prisma.sessionLog.findMany({
    where: { status: 'Logged', date: { gte: weekStart, lte: weekEnd } },
  });

  if (logs.length === 0) {
    return res.json({ archived: 0, weekStart, message: 'No Logged sessions found for this week' });
  }

  const validIds = logs.map((l) => l.id);
  const totalInr = logs.reduce((s, l) => s + l.amountInr, 0);
  const batch = await prisma.payoutBatch.create({
    data: { weekStart, totalInr, sessionIds: validIds, status: 'Pending' },
  });
  await prisma.sessionLog.updateMany({ where: { id: { in: validIds } }, data: { status: 'ReadyForFinal' } });
  await audit(req.user!.id, req.user!.name, 'PAYOUT_BATCH_AUTO_ARCHIVE', `${weekStart} · ₹${totalInr} · ${validIds.length} sessions`);
  res.status(201).json({ archived: validIds.length, weekStart, totalInr, batch });
});

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
