/**
 * Mitali's payment follow-up workspace.
 *
 * Replaces the "MITS Accounts (Managed by Mitali)" Google Sheet — same shape,
 * but live data + structured comments + 1-click feedback / leverage logging.
 *
 * Per row: client + last fresh payment + last 2 renewal payments + days
 * since last collection + computed status + her free-form note.
 *
 * Access: founder, manager (Mitali), lead (Bhavneet — read-only for chase
 * questions; she's mostly on feedback + sessions).
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const followUpPaymentsRouter = Router();
followUpPaymentsRouter.use(requireAuth);

const ALLOWED = ['founder', 'manager', 'accounts'];

// Team scoping: manager sees only her team's clients in follow-up list
const TEAM_SCOPE: Record<string, string[]> = {
  manager: ['u-mitali', 'u-bhavneet', 'u-kashish', 'u-muskan'],
};

followUpPaymentsRouter.get('/', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }

  const teamFilter = TEAM_SCOPE[req.user!.role]
    ? { hostOwnerId: { in: TEAM_SCOPE[req.user!.role] } }
    : {};

  // Lifecycles that need recurring collection: client is live + delivering.
  // (Active, LeverageGranted, SaleWon — the post-handover states.)
  const clients = await prisma.client.findMany({
    where: { lifecycle: { in: ['Active', 'LeverageGranted', 'SaleWon'] }, ...teamFilter },
    select: {
      id: true, name: true,
      currency: true, cycleAmount: true,
      engagementType: true, source: true,
      followupNote: true, followupNoteAt: true,
      lastFeedbackTakenAt: true, lastLeverageAskedAt: true,
      paymentPendingVaibhav: true,
      hostOwner: { select: { name: true } },
      assignedAmId: true,
      primaryTrainer: { select: { name: true } },
      payments: {
        select: { id: true, kind: true, amount: true, currency: true, paymentDate: true, createdAt: true },
        orderBy: { paymentDate: 'desc' },
        take: 6,
      },
    },
    orderBy: { name: 'asc' },
  });

  const today = new Date().toISOString().slice(0, 10);
  const rows = clients.map((c) => {
    const fresh = c.payments.find((p) => p.kind === 'Fresh');
    const renewals = c.payments.filter((p) => p.kind === 'Renewal');
    // Date 1 / Date 2 columns from the sheet ≈ last two renewals (or fresh + 1st renewal if no renewals yet)
    const date1 = renewals[1] || renewals[0] || fresh;
    const date2 = renewals[0] || null;
    const lastPaymentDate = c.payments[0]?.paymentDate || null;
    const daysSinceLast = lastPaymentDate
      ? Math.floor((Date.parse(today) - Date.parse(lastPaymentDate)) / 86_400_000)
      : null;

    // Status derivation. Order matters — pendingVaibhav wins over everything.
    let status: 'pending_vaibhav' | 'paid' | 'overdue' | 'due_soon' | 'unknown' = 'unknown';
    if (c.paymentPendingVaibhav) status = 'pending_vaibhav';
    else if (daysSinceLast === null) status = 'unknown';
    else if (daysSinceLast > 21)     status = 'overdue';
    else if (daysSinceLast > 14)     status = 'due_soon';
    else                              status = 'paid';

    return {
      id: c.id,
      name: c.name,
      currency: c.currency,
      cycleAmount: c.cycleAmount,
      engagementType: c.engagementType,
      source: c.source,
      followupNote: c.followupNote,
      followupNoteAt: c.followupNoteAt,
      lastFeedbackTakenAt: c.lastFeedbackTakenAt,
      lastLeverageAskedAt: c.lastLeverageAskedAt,
      paymentPendingVaibhav: c.paymentPendingVaibhav,
      hostOwner: c.hostOwner?.name || null,
      primaryTrainer: c.primaryTrainer?.name || null,
      date1: date1 ? { paymentDate: date1.paymentDate, amount: date1.amount, kind: date1.kind } : null,
      date2: date2 ? { paymentDate: date2.paymentDate, amount: date2.amount, kind: date2.kind } : null,
      lastPaymentDate, daysSinceLast,
      status,
      paymentCount: c.payments.length,
    };
  });

  res.json(rows);
});

// Update Mitali's free-form note on a client (the "comments" column on her sheet)
followUpPaymentsRouter.patch('/:id/note', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 800) : '';
  const c = await prisma.client.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
  if (!c) return res.status(404).json({ error: 'Client not found' });
  await prisma.client.update({
    where: { id: c.id },
    data: { followupNote: note || null, followupNoteAt: new Date().toISOString().slice(0, 10) },
  });
  await audit(req.user!.id, req.user!.name, 'FOLLOWUP_NOTE', `${c.name}: ${note.slice(0, 60)}`);
  res.json({ ok: true });
});

// Mark "feedback taken today" — bumps the lastFeedbackTakenAt timestamp
followUpPaymentsRouter.post('/:id/feedback-taken', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const today = new Date().toISOString().slice(0, 10);
  const c = await prisma.client.update({
    where: { id: req.params.id },
    data: { lastFeedbackTakenAt: today },
    select: { id: true, name: true },
  });
  await audit(req.user!.id, req.user!.name, 'FEEDBACK_TAKEN', c.name);
  res.json({ ok: true, lastFeedbackTakenAt: today });
});

// Mark "leverage asked today" — bumps the lastLeverageAskedAt timestamp
followUpPaymentsRouter.post('/:id/leverage-asked', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const today = new Date().toISOString().slice(0, 10);
  const c = await prisma.client.update({
    where: { id: req.params.id },
    data: { lastLeverageAskedAt: today },
    select: { id: true, name: true },
  });
  await audit(req.user!.id, req.user!.name, 'LEVERAGE_ASKED', c.name);
  res.json({ ok: true, lastLeverageAskedAt: today });
});

// Toggle paymentPendingVaibhav — marks payment as awaiting Vaibhav's collection
followUpPaymentsRouter.post('/:id/pending-vaibhav', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const desired = !!req.body?.pending;
  const c = await prisma.client.update({
    where: { id: req.params.id },
    data: { paymentPendingVaibhav: desired },
    select: { id: true, name: true },
  });
  await audit(req.user!.id, req.user!.name, desired ? 'PENDING_VAIBHAV_ON' : 'PENDING_VAIBHAV_OFF', c.name);
  res.json({ ok: true, paymentPendingVaibhav: desired });
});
