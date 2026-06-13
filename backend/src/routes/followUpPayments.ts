/**
 * Mitali's payment follow-up workspace.
 *
 * Mirrors the "MITS Accounts (Managed by Mitali)" Google Sheet:
 *   Client | Pay Date 1 | Pay Date 2 | Amount | AccountName | Comments | Actions
 *
 * Key rules:
 * - payDate1 = last collected date (for reference)
 * - payDate2 = next due date (what Mitali is chasing)
 * - When a payment comes in: payDate1 ← payDate2, payDate2 ← new due date
 * - Leverage = date extension, max 3 days from current payDate2
 * - Feedback must be taken within 3 days before payDate2
 * - Comments are a full threaded log (Comment model), not just a single note
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

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────
// GET / — main list (mirrors the sheet)
// ─────────────────────────────────────────
followUpPaymentsRouter.get('/', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }

  const teamFilter = TEAM_SCOPE[req.user!.role]
    ? { hostOwnerId: { in: TEAM_SCOPE[req.user!.role] } }
    : {};

  const clients = await prisma.client.findMany({
    where: { lifecycle: { in: ['Active', 'LeverageGranted', 'SaleWon'] }, ...teamFilter },
    select: {
      id: true, name: true,
      currency: true, cycleAmount: true,
      engagementType: true,
      payDate1: true, payDate2: true,
      leverageUntil: true, leverageNote: true,
      followupNote: true, followupNoteAt: true,
      lastFeedbackTakenAt: true, lastLeverageAskedAt: true,
      paymentPendingVaibhav: true,
      hostOwner: { select: { name: true } },
      primaryTrainer: { select: { id: true, name: true } },
      regularTrainings: {
        where: { status: 'active' },
        select: { id: true, name: true },
        take: 1,
      },
      payments: {
        select: { id: true, kind: true, amount: true, currency: true, paymentDate: true },
        orderBy: { paymentDate: 'desc' },
        take: 4,
      },
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, body: true, authorName: true, createdAt: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  const today = todayISO();
  const rows = clients.map((c) => {
    // Derive payDate1/payDate2 from stored fields or fall back to latest payments
    const lastPayment = c.payments[0];
    const payDate1 = c.payDate1 || lastPayment?.paymentDate || null;
    const payDate2 = c.payDate2 || null;

    // How overdue is the next payment?
    let daysUntilDue: number | null = null;
    if (payDate2) {
      daysUntilDue = Math.floor((Date.parse(payDate2) - Date.parse(today)) / 86_400_000);
    }

    // Feedback gate: feedback must be taken within 3 days before payDate2
    let feedbackNeeded = false;
    if (payDate2 && c.lastFeedbackTakenAt) {
      const daysSinceFeedback = Math.floor((Date.parse(today) - Date.parse(c.lastFeedbackTakenAt)) / 86_400_000);
      feedbackNeeded = daysUntilDue !== null && daysUntilDue <= 3 && daysSinceFeedback > 3;
    } else if (payDate2) {
      feedbackNeeded = daysUntilDue !== null && daysUntilDue <= 3;
    }

    // Status derivation
    let status: 'pending_vaibhav' | 'paid' | 'overdue' | 'due_soon' | 'no_date' = 'no_date';
    if (c.paymentPendingVaibhav) status = 'pending_vaibhav';
    else if (!payDate2)           status = 'no_date';
    else if (daysUntilDue! < 0)  status = 'overdue';
    else if (daysUntilDue! <= 3) status = 'due_soon';
    else                          status = 'paid';

    return {
      id: c.id,
      name: c.name,
      currency: c.currency,
      cycleAmount: c.cycleAmount,
      engagementType: c.engagementType,
      payDate1,
      payDate2,
      daysUntilDue,
      leverageUntil: c.leverageUntil,
      leverageNote: c.leverageNote,
      followupNote: c.followupNote,
      followupNoteAt: c.followupNoteAt,
      lastFeedbackTakenAt: c.lastFeedbackTakenAt,
      lastLeverageAskedAt: c.lastLeverageAskedAt,
      paymentPendingVaibhav: c.paymentPendingVaibhav,
      hostOwner: c.hostOwner?.name || null,
      primaryTrainer: c.primaryTrainer ? { id: c.primaryTrainer.id, name: c.primaryTrainer.name } : null,
      trainingId: c.regularTrainings[0]?.id || null,
      trainingName: c.regularTrainings[0]?.name || null,
      latestComment: c.comments[0] || null,
      feedbackNeeded,
      status,
      paymentCount: c.payments.length,
    };
  });

  // Sort: overdue first, then due_soon, then pending_vaibhav, then rest
  const ORDER = { overdue: 0, due_soon: 1, pending_vaibhav: 2, paid: 3, no_date: 4 };
  rows.sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.daysUntilDue ?? 999) - (b.daysUntilDue ?? 999));

  res.json(rows);
});

// ─────────────────────────────────────────
// POST /:id/advance-payment
// When Mitali collects: payDate1 ← payDate2, set new payDate2
// Body: { newDate2: 'YYYY-MM-DD', amount?: number }
// ─────────────────────────────────────────
followUpPaymentsRouter.post('/:id/advance-payment', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const { newDate2 } = req.body || {};
  if (!newDate2 || !/^\d{4}-\d{2}-\d{2}$/.test(newDate2)) {
    return res.status(400).json({ error: 'newDate2 must be YYYY-MM-DD' });
  }
  const c = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, payDate2: true },
  });
  if (!c) return res.status(404).json({ error: 'Client not found' });
  const oldDate2 = c.payDate2;
  await prisma.client.update({
    where: { id: c.id },
    data: {
      payDate1: oldDate2 || todayISO(), // move current date2 → date1
      payDate2: newDate2,               // set next due date
      leverageUntil: null,              // clear leverage on payment
      leverageNote: null,
    },
  });
  await audit(req.user!.id, req.user!.name, 'PAYMENT_ADVANCED', `${c.name}: date2 ${oldDate2} → ${newDate2}`);
  res.json({ ok: true, payDate1: oldDate2 || todayISO(), payDate2: newDate2 });
});

// ─────────────────────────────────────────
// POST /:id/set-pay-dates
// Set initial payDate1/payDate2 manually
// Body: { date1?: string, date2?: string }
// ─────────────────────────────────────────
followUpPaymentsRouter.post('/:id/set-pay-dates', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const { date1, date2 } = req.body || {};
  const c = await prisma.client.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
  if (!c) return res.status(404).json({ error: 'Client not found' });
  await prisma.client.update({
    where: { id: c.id },
    data: {
      ...(date1 !== undefined ? { payDate1: date1 || null } : {}),
      ...(date2 !== undefined ? { payDate2: date2 || null } : {}),
    },
  });
  await audit(req.user!.id, req.user!.name, 'PAY_DATES_SET', `${c.name}: ${date1 || '—'} / ${date2 || '—'}`);
  res.json({ ok: true });
});

// ─────────────────────────────────────────
// POST /:id/leverage
// Grant leverage — extend payDate2 by up to 3 days
// Body: { newDate2: 'YYYY-MM-DD', note: string }
// ─────────────────────────────────────────
followUpPaymentsRouter.post('/:id/leverage', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const { newDate2, note } = req.body || {};
  if (!newDate2 || !/^\d{4}-\d{2}-\d{2}$/.test(newDate2)) {
    return res.status(400).json({ error: 'newDate2 must be YYYY-MM-DD' });
  }
  const c = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, payDate2: true },
  });
  if (!c) return res.status(404).json({ error: 'Client not found' });

  // Enforce max 3-day extension from current payDate2 (or today if no payDate2)
  const base = c.payDate2 || todayISO();
  const maxAllowed = addDays(base, 3);
  if (newDate2 > maxAllowed) {
    return res.status(400).json({ error: `Leverage can extend at most 3 days (max ${maxAllowed})` });
  }
  const noteText = typeof note === 'string' ? note.slice(0, 400) : '';
  await prisma.client.update({
    where: { id: c.id },
    data: {
      payDate2: newDate2,
      leverageUntil: newDate2,
      leverageNote: noteText || null,
    },
  });
  // Auto-log as comment so it's visible in the comment thread
  await (prisma as any).comment.create({
    data: {
      clientId: c.id,
      authorId: req.user!.id,
      authorName: req.user!.name,
      body: `Leverage granted — next due moved to ${newDate2}${noteText ? `: ${noteText}` : ''}.`,
    },
  });
  await audit(req.user!.id, req.user!.name, 'LEVERAGE_GRANTED', `${c.name}: payDate2 → ${newDate2}. ${noteText}`);
  res.json({ ok: true, payDate2: newDate2, leverageUntil: newDate2 });
});

// ─────────────────────────────────────────
// PATCH /:id/note — update the quick followup note (legacy, kept for compat)
// ─────────────────────────────────────────
followUpPaymentsRouter.patch('/:id/note', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 800) : '';
  const c = await prisma.client.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
  if (!c) return res.status(404).json({ error: 'Client not found' });
  await prisma.client.update({
    where: { id: c.id },
    data: { followupNote: note || null, followupNoteAt: todayISO() },
  });
  await audit(req.user!.id, req.user!.name, 'FOLLOWUP_NOTE', `${c.name}: ${note.slice(0, 60)}`);
  res.json({ ok: true });
});

// ─────────────────────────────────────────
// POST /:id/feedback-taken
// ─────────────────────────────────────────
followUpPaymentsRouter.post('/:id/feedback-taken', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const today = todayISO();
  const c = await prisma.client.update({
    where: { id: req.params.id },
    data: { lastFeedbackTakenAt: today },
    select: { id: true, name: true },
  });
  await audit(req.user!.id, req.user!.name, 'FEEDBACK_TAKEN', c.name);
  res.json({ ok: true, lastFeedbackTakenAt: today });
});

// ─────────────────────────────────────────
// POST /:id/leverage-asked (legacy — logs referral/testimonial ask)
// ─────────────────────────────────────────
followUpPaymentsRouter.post('/:id/leverage-asked', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const today = todayISO();
  const c = await prisma.client.update({
    where: { id: req.params.id },
    data: { lastLeverageAskedAt: today },
    select: { id: true, name: true },
  });
  await audit(req.user!.id, req.user!.name, 'LEVERAGE_ASKED', c.name);
  res.json({ ok: true, lastLeverageAskedAt: today });
});

// ─────────────────────────────────────────
// POST /:id/pending-vaibhav
// ─────────────────────────────────────────
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
