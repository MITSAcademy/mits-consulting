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

const ALLOWED = ['founder', 'manager', 'accounts', 'demo_lead'];

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

  const clients = await prisma.client.findMany({
    where: { regularTrainings: { some: { status: 'active' } } },
    select: {
      id: true, name: true,
      currency: true, cycleAmount: true,
      engagementType: true,
      payDate1: true, payDate2: true,
      leverageUntil: true, leverageNote: true,
      followupNote: true, followupNoteAt: true,
      lastFeedbackTakenAt: true, lastLeverageAskedAt: true,
      paymentPendingVaibhav: true,
      email: true, accountNameRaw: true,
      hostOwner: { select: { name: true } },
      assignedAm: { select: { name: true } },
      phoneCode: true, phoneDigits: true, whatsappGroupLink: true,
      primaryTrainer: { select: { id: true, name: true, phoneCode: true, phoneDigits: true, whatsappGroupLink: true } },
      regularTrainings: {
        where: { status: 'active' },
        select: { id: true, name: true },
        take: 1,
      },
      payments: {
        where: { kind: { not: 'Fresh' } },  // only Renewal payments = follow-up collections
        select: { id: true, kind: true, amount: true, currency: true, paymentDate: true, receivedBy: { select: { name: true } } },
        orderBy: { paymentDate: 'desc' },
        take: 10,
      },
      lifecycle: true,
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
    // payDate1 = upcoming payment due date (what Mitali is chasing NOW)
    // payDate2 = the payment after that (future reference)
    const payDate1 = c.payDate1 || null;
    const payDate2 = c.payDate2 || null;

    // Overdue/due-soon based on payDate1 (the current due date)
    let daysUntilDue: number | null = null;
    if (payDate1) {
      daysUntilDue = Math.floor((Date.parse(payDate1) - Date.parse(today)) / 86_400_000);
    }

    // Feedback gate: feedback must be taken within 3 days before payDate1
    let feedbackNeeded = false;
    if (payDate1 && c.lastFeedbackTakenAt) {
      const daysSinceFeedback = Math.floor((Date.parse(today) - Date.parse(c.lastFeedbackTakenAt)) / 86_400_000);
      feedbackNeeded = daysUntilDue !== null && daysUntilDue <= 3 && daysSinceFeedback > 3;
    } else if (payDate1) {
      feedbackNeeded = daysUntilDue !== null && daysUntilDue <= 3;
    }

    // Deferred: client is in LeverageGranted lifecycle OR has an active leverageUntil in the future
    const isDeferred = (c as any).lifecycle === 'LeverageGranted' ||
      (c.leverageUntil != null && c.leverageUntil >= today);

    // Status derivation
    let status: 'pending_vaibhav' | 'paid' | 'overdue' | 'due_soon' | 'no_date' | 'deferred' = 'no_date';
    if (c.paymentPendingVaibhav) status = 'pending_vaibhav';
    else if (isDeferred)          status = 'deferred';
    else if (!payDate1)           status = 'no_date';
    else if (daysUntilDue! < 0)  status = 'overdue';
    else if (daysUntilDue! <= 3) status = 'due_soon';
    else                          status = 'paid';

    return {
      id: c.id,
      name: c.name,
      currency: c.currency,
      cycleAmount: c.cycleAmount ?? 0,
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
      isEmployerCall: (c as any).isEmployerCall || false,
      employerName: (c as any).employerName || null,
      clientEmail: (c as any).email || null,
      accountName: (c as any).accountNameRaw || (c as any).assignedAm?.name || null,
      hostOwner: c.hostOwner?.name || null,
      clientPhone: (c.phoneCode && c.phoneDigits) ? `${c.phoneCode}${c.phoneDigits}`.replace(/[^0-9+]/g, '') : null,
      clientGroupLink: (c as any).whatsappGroupLink || null,
      primaryTrainer: c.primaryTrainer ? {
        id: c.primaryTrainer.id,
        name: c.primaryTrainer.name,
        phone: (c.primaryTrainer.phoneCode && c.primaryTrainer.phoneDigits) ? `${c.primaryTrainer.phoneCode}${c.primaryTrainer.phoneDigits}`.replace(/[^0-9+]/g, '') : null,
        groupLink: (c.primaryTrainer as any).whatsappGroupLink || null,
      } : null,
      trainingId: c.regularTrainings[0]?.id || null,
      trainingName: c.regularTrainings[0]?.name || null,
      latestComment: c.comments[0] || null,
      feedbackNeeded,
      status,
      paymentCount: c.payments.length,
      payments: c.payments,
    };
  });

  // Sort by payDate1 ascending (soonest due first = most urgent at top).
  // no_date rows (NA) always go last.
  rows.sort((a, b) => {
    const aIsNoDate = a.status === 'no_date';
    const bIsNoDate = b.status === 'no_date';
    if (aIsNoDate && !bIsNoDate) return 1;
    if (!aIsNoDate && bIsNoDate) return -1;
    if (aIsNoDate && bIsNoDate) return a.name.localeCompare(b.name);
    const aD = a.payDate1 || '9999';
    const bD = b.payDate1 || '9999';
    return aD.localeCompare(bD);
  });

  res.json(rows);
});

// ─────────────────────────────────────────
// POST /:id/advance-payment
// When Mitali collects: payDate1 ← payDate2, set new payDate2
// Body: { newDate2: 'YYYY-MM-DD', amount?: number }
// ─────────────────────────────────────────
followUpPaymentsRouter.post('/:id/advance-payment', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const { newDate2, amountReceived } = req.body || {};
  if (!newDate2 || !/^\d{4}-\d{2}-\d{2}$/.test(newDate2)) {
    return res.status(400).json({ error: 'newDate2 must be YYYY-MM-DD' });
  }
  const c = await prisma.client.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, payDate1: true, payDate2: true, cycleAmount: true, currency: true },
  });
  if (!c) return res.status(404).json({ error: 'Client not found' });
  const activeTraining = await prisma.regularTraining.findFirst({
    where: { clientId: c.id, status: 'active' },
    select: { trainerId: true },
  });
  const collectedDate = c.payDate1 || todayISO();
  const newDate1 = c.payDate2 || todayISO();
  const recordedAmount = (amountReceived !== undefined && amountReceived !== null && !isNaN(Number(amountReceived)))
    ? Math.round(Number(amountReceived))
    : (c.cycleAmount || 0);
  await prisma.$transaction([
    prisma.client.update({
      where: { id: c.id },
      data: {
        payDate1: newDate1,
        payDate2: newDate2,
        leverageUntil: null,
        leverageNote: null,
      },
    }),
    prisma.payment.create({
      data: {
        clientId: c.id,
        trainerId: activeTraining?.trainerId || null,
        kind: 'Renewal',
        amount: recordedAmount,
        currency: (c.currency || 'USD') as any,
        paymentDate: collectedDate,
        receivedById: req.user!.id,
      },
    }),
  ]);
  await audit(req.user!.id, req.user!.name, 'PAYMENT_ADVANCED', `${c.name}: collected ${collectedDate} (${c.currency} ${recordedAmount}), next due ${newDate1} → ${newDate2}`, { clientId: c.id });
  res.json({ ok: true, payDate1: newDate1, payDate2: newDate2 });
});

// ─────────────────────────────────────────
// POST /:id/set-pay-dates
// Set initial payDate1/payDate2 manually
// Body: { date1?: string, date2?: string }
// ─────────────────────────────────────────
followUpPaymentsRouter.post('/:id/set-pay-dates', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const { date1, date2 } = req.body || {};
  if (date1) {
    const minAllowed = new Date();
    minAllowed.setDate(minAllowed.getDate() - 3);
    minAllowed.setHours(0, 0, 0, 0);
    if (new Date(date1) < minAllowed) return res.status(400).json({ error: 'Last paid date cannot be more than 3 days in the past.' });
  }
  const c = await prisma.client.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
  if (!c) return res.status(404).json({ error: 'Client not found' });
  await prisma.client.update({
    where: { id: c.id },
    data: {
      ...(date1 !== undefined ? { payDate1: date1 || null } : {}),
      ...(date2 !== undefined ? { payDate2: date2 || null } : {}),
    },
  });
  await audit(req.user!.id, req.user!.name, 'PAY_DATES_SET', `${c.name}: ${date1 || '—'} / ${date2 || '—'}`, { clientId: c.id });
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
  await audit(req.user!.id, req.user!.name, 'LEVERAGE_GRANTED', `${c.name}: payDate2 → ${newDate2}. ${noteText}`, { clientId: c.id });
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
  await audit(req.user!.id, req.user!.name, 'FOLLOWUP_NOTE', `${c.name}: ${note.slice(0, 60)}`, { clientId: c.id });
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
  await audit(req.user!.id, req.user!.name, 'FEEDBACK_TAKEN', c.name, { clientId: c.id });
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
  await audit(req.user!.id, req.user!.name, 'LEVERAGE_ASKED', c.name, { clientId: c.id });
  res.json({ ok: true, lastLeverageAskedAt: today });
});

// ─────────────────────────────────────────
// PATCH /:id/amount — update cycleAmount + currency; requires a reason (logged as comment)
// Body: { cycleAmount: number, currency?: string, reason: string }
// Restricted to founder/manager only
// ─────────────────────────────────────────
followUpPaymentsRouter.patch('/:id/amount', async (req: AuthedRequest, res) => {
  const AMOUNT_ROLES = ['founder', 'manager'];
  if (!AMOUNT_ROLES.includes(req.user!.role)) return res.status(403).json({ error: 'Only founder/manager can edit amount' });
  const amount = Number(req.body?.cycleAmount);
  const currency = typeof req.body?.currency === 'string' ? req.body.currency.trim().toUpperCase() : undefined;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (isNaN(amount) || amount < 0) return res.status(400).json({ error: 'cycleAmount must be a non-negative number' });
  if (!reason) return res.status(400).json({ error: 'reason is required when editing amount' });
  const c = await prisma.client.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, cycleAmount: true, currency: true } });
  if (!c) return res.status(404).json({ error: 'Client not found' });
  await prisma.client.update({
    where: { id: c.id },
    data: { cycleAmount: amount, ...(currency ? { currency } : {}) },
  });
  // Log reason as a comment visible to all
  await (prisma as any).comment.create({
    data: {
      clientId: c.id,
      authorId: req.user!.id,
      authorName: req.user!.name,
      body: `Amount updated: ${c.cycleAmount} ${c.currency} → ${amount} ${currency || c.currency}. Reason: ${reason}`,
    },
  });
  await audit(req.user!.id, req.user!.name, 'CLIENT_UPDATE', `${c.name}: cycleAmount → ${amount}${currency ? ' ' + currency : ''} (${reason})`, { clientId: c.id });
  res.json({ ok: true, cycleAmount: amount, ...(currency ? { currency } : {}) });
});

// ─────────────────────────────────────────
// PATCH /:id/currency — update currency only; founder/manager/accounts
// Body: { currency: string }  — no reason required (low-stakes correction)
// ─────────────────────────────────────────
followUpPaymentsRouter.patch('/:id/currency', async (req: AuthedRequest, res) => {
  const CURRENCY_ROLES = ['founder', 'manager', 'accounts'];
  if (!CURRENCY_ROLES.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const VALID = ['INR', 'USD', 'CAD', 'GBP', 'AED'];
  const currency = typeof req.body?.currency === 'string' ? req.body.currency.trim().toUpperCase() : '';
  if (!VALID.includes(currency)) return res.status(400).json({ error: `currency must be one of ${VALID.join(', ')}` });
  const c = await prisma.client.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, currency: true } });
  if (!c) return res.status(404).json({ error: 'Client not found' });
  await prisma.client.update({ where: { id: c.id }, data: { currency } });
  await audit(req.user!.id, req.user!.name, 'CLIENT_UPDATE', `${c.name}: currency ${c.currency} → ${currency}`, { clientId: c.id });
  res.json({ ok: true, currency });
});

// ─────────────────────────────────────────
// PATCH /:id/account-name — update accountNameRaw; founder/manager only
// Body: { accountName: string }
// ─────────────────────────────────────────
followUpPaymentsRouter.patch('/:id/account-name', async (req: AuthedRequest, res) => {
  const ACCT_ROLES = ['founder', 'manager'];
  if (!ACCT_ROLES.includes(req.user!.role)) return res.status(403).json({ error: 'Only founder/manager can edit account name' });
  const accountName = typeof req.body?.accountName === 'string' ? req.body.accountName.trim() : '';
  const c = await prisma.client.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
  if (!c) return res.status(404).json({ error: 'Client not found' });
  await prisma.client.update({ where: { id: c.id }, data: { accountNameRaw: accountName || null } });
  await audit(req.user!.id, req.user!.name, 'CLIENT_UPDATE', `${c.name}: accountName → ${accountName || '(cleared)'}`, { clientId: c.id });
  res.json({ ok: true, accountName: accountName || null });
});

// ─────────────────────────────────────────
// POST /:id/pending-vaibhav — founder only
// ─────────────────────────────────────────
followUpPaymentsRouter.post('/:id/pending-vaibhav', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only founder can mark pending on Vaibhav' });
  const desired = !!req.body?.pending;
  const c = await prisma.client.update({
    where: { id: req.params.id },
    data: { paymentPendingVaibhav: desired },
    select: { id: true, name: true },
  });
  await audit(req.user!.id, req.user!.name, desired ? 'PENDING_VAIBHAV_ON' : 'PENDING_VAIBHAV_OFF', c.name, { clientId: c.id });
  res.json({ ok: true, paymentPendingVaibhav: desired });
});

// ─────────────────────────────────────────
// POST /:id/employer-call — toggle employer call flag; requires employerName
// Body: { isEmployerCall: boolean, employerName?: string }
// Restricted to manager/founder
// ─────────────────────────────────────────
followUpPaymentsRouter.post('/:id/employer-call', async (req: AuthedRequest, res) => {
  const EM_ROLES = ['founder', 'manager'];
  if (!EM_ROLES.includes(req.user!.role)) return res.status(403).json({ error: 'Only manager/founder can mark employer calls' });
  const desired = !!req.body?.isEmployerCall;
  const employerName = typeof req.body?.employerName === 'string' ? req.body.employerName.trim() : '';
  if (desired && !employerName) return res.status(400).json({ error: 'employerName is required when marking as employer call' });
  const c = await prisma.client.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
  if (!c) return res.status(404).json({ error: 'Client not found' });
  await (prisma as any).client.update({
    where: { id: c.id },
    data: { isEmployerCall: desired, ...(desired ? { employerName } : {}) },
  });
  await audit(req.user!.id, req.user!.name, desired ? 'EMPLOYER_CALL_ON' : 'EMPLOYER_CALL_OFF', `${c.name}${desired ? ' · ' + employerName : ''}`, { clientId: c.id });
  res.json({ ok: true, isEmployerCall: desired, employerName: desired ? employerName : null });
});
