import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';
import { billingCountryForDial, buyerDetailsSchema, formatPhone, normalisePhone } from '../lib/buyerDetails';
import { payglocalEnabled, initiatePayCollect } from '../lib/payglocal';
import {
  CUSTOM_CURRENCY,
  CUSTOM_MAX_MINOR,
  CUSTOM_MIN_MINOR,
  amountError,
  confirmAndSettleCustom,
  linkProblem,
  newCustomTxnId,
  newLinkToken,
  parseAmountToMinor,
} from '../lib/customPayments';

/**
 * Custom-amount payments.
 *
 * `customPayRouter` is public (mitsedge.com/pay, no account). It only ever
 * creates CustomPayment rows, never a StudentPurchase, so nothing paid here
 * can enroll anyone in a course.
 *
 * `customPaymentsRouter` is staff-facing: fixed-amount links, and the list of
 * money received (founder only, like every other money view).
 */
export const customPayRouter = Router();
export const customPaymentsRouter = Router();

const prodOnly = { skip: () => process.env.NODE_ENV !== 'production' };

// Public and unauthenticated, and each order calls the gateway, so this is tight.
const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a minute and try again.' },
  ...prodOnly,
});
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
  ...prodOnly,
});

const purposeField = z
  .string()
  .trim()
  .min(3, 'Please say what this payment is for')
  .max(200, 'Please keep the description under 200 characters');

const orderSchema = buyerDetailsSchema.extend({
  purpose: purposeField.optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  token: z.string().trim().max(100).optional(),
});

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

const LINK_MESSAGES = {
  inactive: 'This payment link is no longer active. Please ask us for a new one.',
  expired: 'This payment link has expired. Please ask us for a new one.',
  paid: 'This payment link has already been paid.',
} as const;

// GET /api/pay/link/:token — what a fixed-amount link asks for.
customPayRouter.get('/link/:token', readLimiter, async (req, res) => {
  const link = await prisma.paymentLink.findUnique({ where: { token: req.params.token } });
  if (!link) return res.status(404).json({ error: 'This payment link is not valid.' });
  const problem = await linkProblem(link);
  res.json({
    amount: (link.amount / 100).toFixed(2),
    currency: link.currency,
    purpose: link.purpose,
    clientName: link.clientName,
    payable: !problem,
    message: problem ? LINK_MESSAGES[problem] : null,
  });
});

// GET /api/pay/config — limits the page shows before the payer types anything.
customPayRouter.get('/config', readLimiter, (_req, res) => {
  res.json({
    enabled: payglocalEnabled(),
    currency: CUSTOM_CURRENCY,
    min: (CUSTOM_MIN_MINOR / 100).toFixed(2),
    max: (CUSTOM_MAX_MINOR / 100).toFixed(2),
  });
});

// POST /api/pay/order — starts a custom payment.
customPayRouter.post('/order', orderLimiter, async (req, res) => {
  if (!payglocalEnabled()) return res.status(503).json({ error: 'Payments are not enabled.' });

  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Please check your details.' });
  }
  const { buyerName, buyerEmail, token } = parsed.data;
  const buyerPhone = formatPhone(parsed.data.buyerPhone);

  let amount: number;
  let purpose: string;
  let linkId: string | null = null;

  if (token) {
    // A staff link fixes the amount and purpose; whatever the page sent for
    // either is ignored, so the payer cannot change what was agreed.
    const link = await prisma.paymentLink.findUnique({ where: { token } });
    if (!link) return res.status(404).json({ error: 'This payment link is not valid.' });
    const problem = await linkProblem(link);
    if (problem) return res.status(410).json({ error: LINK_MESSAGES[problem] });
    amount = link.amount;
    purpose = link.purpose;
    linkId = link.id;
  } else {
    const minor = parseAmountToMinor(parsed.data.amount);
    const problem = amountError(minor);
    if (problem) return res.status(400).json({ error: problem });
    if (!parsed.data.purpose) return res.status(400).json({ error: 'Please say what this payment is for' });
    amount = minor!;
    purpose = parsed.data.purpose;
  }

  // Belt and braces: nothing outside the limits reaches the gateway, link or not.
  if (amount < CUSTOM_MIN_MINOR || amount > CUSTOM_MAX_MINOR) {
    console.error(`[custom-payment] refused out-of-range amount ${amount}`);
    return res.status(400).json({ error: 'This amount cannot be paid online. Please contact us.' });
  }

  const merchantTxnId = newCustomTxnId();
  const payment = await prisma.customPayment.create({
    data: {
      payerName: buyerName,
      payerEmail: buyerEmail,
      payerPhone: buyerPhone,
      purpose,
      amount,
      currency: CUSTOM_CURRENCY,
      merchantTxnId,
      linkId,
    },
  });

  try {
    const { firstName, lastName } = splitName(buyerName);
    const phone = normalisePhone(buyerPhone);
    const { redirectUrl, gid } = await initiatePayCollect({
      merchantTxnId,
      amount,
      currency: CUSTOM_CURRENCY,
      firstName,
      lastName,
      email: buyerEmail,
      phone: phone.digits,
      phoneCountryCode: phone.countryCode,
      billingCountry: billingCountryForDial(phone.countryCode),
    });
    await prisma.customPayment.update({ where: { id: payment.id }, data: { gatewayRef: gid } });
    res.json({
      redirectUrl,
      merchantTxnId,
      amount: (amount / 100).toFixed(2),
      currency: CUSTOM_CURRENCY,
      purpose,
    });
  } catch (e) {
    console.error(`[custom-payment] initiate failed for ${merchantTxnId}:`, e);
    await prisma.customPayment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    res.status(502).json({ error: 'Could not start the payment. Please try again.' });
  }
});

// GET /api/pay/status/:merchantTxnId — polled by the result page. There is no
// account to scope to, so the random transaction id is the secret, and the
// reply carries no contact details.
customPayRouter.get('/status/:merchantTxnId', readLimiter, async (req, res) => {
  const found = await prisma.customPayment.findUnique({ where: { merchantTxnId: req.params.merchantTxnId } });
  if (!found) return res.status(404).json({ error: 'Not found' });

  if (found.status === 'PENDING' && found.gatewayRef) {
    await confirmAndSettleCustom(found.merchantTxnId);
  }
  const fresh = await prisma.customPayment.findUnique({ where: { id: found.id } });
  res.json({
    status: fresh!.status,
    amount: (fresh!.amount / 100).toFixed(2),
    currency: fresh!.currency,
    purpose: fresh!.purpose,
    reference: fresh!.gatewayRef || fresh!.merchantTxnId,
    merchantTxnId: fresh!.merchantTxnId,
  });
});

// ------------------------------------------------------------------ staff

customPaymentsRouter.use(requireAuth);

const LINK_ROLES = ['founder', 'manager', 'sales_closer'];
const PAY_PAGE_URL = () => (process.env.PAY_PAGE_URL || 'https://mitsedge.com/pay').replace(/\/$/, '');

const linkSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  purpose: purposeField,
  clientName: z.string().trim().max(120).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

function linkView(l: {
  id: string;
  token: string;
  amount: number;
  currency: string;
  purpose: string;
  clientName: string | null;
  active: boolean;
  expiresAt: Date | null;
  createdByName: string;
  createdAt: Date;
  payments?: { status: string }[];
}) {
  return {
    id: l.id,
    url: `${PAY_PAGE_URL()}?t=${l.token}`,
    amount: l.amount,
    currency: l.currency,
    purpose: l.purpose,
    clientName: l.clientName,
    active: l.active,
    expiresAt: l.expiresAt,
    createdByName: l.createdByName,
    createdAt: l.createdAt,
    paid: !!l.payments?.some((p) => p.status === 'PAID'),
  };
}

// GET /api/custom-payments/links
customPaymentsRouter.get('/links', requireRole(...LINK_ROLES), async (_req, res) => {
  const links = await prisma.paymentLink.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { payments: { select: { status: true } } },
  });
  res.json(links.map(linkView));
});

// POST /api/custom-payments/links — a link whose amount the payer cannot change.
customPaymentsRouter.post('/links', requireRole(...LINK_ROLES), async (req: AuthedRequest, res) => {
  const parsed = linkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid link details' });
  }
  const minor = parseAmountToMinor(parsed.data.amount);
  const problem = amountError(minor);
  if (problem) return res.status(400).json({ error: problem });

  const link = await prisma.paymentLink.create({
    data: {
      token: newLinkToken(),
      amount: minor!,
      currency: CUSTOM_CURRENCY,
      purpose: parsed.data.purpose,
      clientName: parsed.data.clientName || null,
      expiresAt: parsed.data.expiresInDays
        ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
        : null,
      createdById: req.user!.id,
      createdByName: req.user!.name,
    },
  });
  await audit(
    req.user!.id,
    req.user!.name,
    'PAYMENT_LINK_CREATE',
    `${CUSTOM_CURRENCY} ${(link.amount / 100).toFixed(2)} — ${link.purpose}${link.clientName ? ` (${link.clientName})` : ''}`,
  );
  res.json(linkView(link));
});

// POST /api/custom-payments/links/:id/deactivate
customPaymentsRouter.post('/links/:id/deactivate', requireRole(...LINK_ROLES), async (req: AuthedRequest, res) => {
  const link = await prisma.paymentLink.findUnique({ where: { id: req.params.id } });
  if (!link) return res.status(404).json({ error: 'Link not found' });
  await prisma.paymentLink.update({ where: { id: link.id }, data: { active: false } });
  await audit(req.user!.id, req.user!.name, 'PAYMENT_LINK_DEACTIVATE', `${link.purpose}`);
  res.json({ ok: true });
});

// GET /api/custom-payments — money received. Founder only, by standing rule.
customPaymentsRouter.get('/', requireRole('founder'), async (req: AuthedRequest, res) => {
  const payments = await prisma.customPayment.findMany({
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: {
      id: true, payerName: true, payerEmail: true, payerPhone: true, purpose: true,
      amount: true, currency: true, status: true, merchantTxnId: true, gatewayRef: true,
      linkId: true, paidAt: true, createdAt: true,
    },
  });
  await audit(req.user!.id, req.user!.name, 'CUSTOM_PAYMENT_VIEW', `${payments.length} records`);
  res.json(payments);
});
