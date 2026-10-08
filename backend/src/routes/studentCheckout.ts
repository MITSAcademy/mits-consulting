import { Router, raw } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { requireStudentAuth, StudentRequest } from '../lib/studentAuth';
import { findCourse } from '../lib/courseCatalog';
import {
  payglocalEnabled,
  initiatePayCollect,
  fetchStatus,
  extractIds,
  isPaidStatus,
  isFailedStatus,
} from '../lib/payglocal';

export const studentCheckoutRouter = Router();

const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
  skip: () => process.env.NODE_ENV !== 'production',
});

// PayGlocal retries webhooks, so this is looser than the buyer-facing limit but
// still bounded.
const callbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
});

function newMerchantTxnId(): string {
  return `MITS${crypto.randomBytes(12).toString('hex')}`.slice(0, 24).toUpperCase();
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

/**
 * Re-confirms an outcome with PayGlocal's status API and settles the purchase.
 * Both the browser callback and the webhook funnel through here, so a forged
 * body can at most trigger a status lookup it cannot influence.
 */
async function confirmAndSettle(merchantTxnId: string): Promise<void> {
  const purchase = await prisma.studentPurchase.findUnique({ where: { merchantTxnId } });
  if (!purchase) {
    console.warn(`[payglocal] outcome for unknown merchantTxnId ${merchantTxnId}`);
    return;
  }
  if (purchase.status === 'PAID') return; // idempotent: retries must not re-settle
  if (!purchase.gatewayRef) {
    console.warn(`[payglocal] ${merchantTxnId} has no gid yet — cannot confirm`);
    return;
  }

  const status = await fetchStatus(purchase.gatewayRef);
  if (isPaidStatus(status)) {
    await prisma.studentPurchase.updateMany({
      where: { merchantTxnId, status: { not: 'PAID' } },
      data: { status: 'PAID', paidAt: new Date() },
    });
    console.log(`[payglocal] ${merchantTxnId} settled PAID`);
  } else if (isFailedStatus(status)) {
    await prisma.studentPurchase.updateMany({
      where: { merchantTxnId, status: { notIn: ['PAID'] } },
      data: { status: 'FAILED' },
    });
  } else {
    console.log(`[payglocal] ${merchantTxnId} still ${status} — leaving PENDING`);
  }
}

// POST /api/student/checkout/payglocal/order
studentCheckoutRouter.post('/payglocal/order', checkoutLimiter, requireStudentAuth, async (req: StudentRequest, res) => {
  if (!payglocalEnabled()) return res.status(503).json({ error: 'Payments are not enabled.' });

  const courseId = Number(req.body?.courseId);
  if (!Number.isInteger(courseId)) return res.status(400).json({ error: 'Course id is required.' });

  // Price comes from our catalog, never from the request — otherwise a buyer
  // edits the amount in the browser and pays $1 for a $2000 course.
  const course = findCourse(courseId);
  if (!course) return res.status(404).json({ error: 'Course not found.' });

  const student = req.student!;
  const merchantTxnId = newMerchantTxnId();

  const purchase = await prisma.studentPurchase.create({
    data: {
      studentId: student.id,
      courseId: course.id,
      courseTitle: course.title,
      amount: course.amount,
      currency: course.currency,
      merchantTxnId,
    },
  });

  try {
    const { firstName, lastName } = splitName(student.name);
    const { redirectUrl, gid } = await initiatePayCollect({
      merchantTxnId,
      amount: course.amount,
      currency: course.currency,
      firstName,
      lastName,
      email: student.email,
    });

    await prisma.studentPurchase.update({ where: { id: purchase.id }, data: { gatewayRef: gid } });

    res.json({
      redirectUrl,
      gid,
      merchantTxnId,
      courseTitle: course.title,
      amount: (course.amount / 100).toFixed(2),
      currency: course.currency,
    });
  } catch (e) {
    console.error(`[payglocal] initiate failed for ${merchantTxnId}:`, e);
    await prisma.studentPurchase.update({ where: { id: purchase.id }, data: { status: 'FAILED' } });
    res.status(502).json({ error: 'Could not start checkout. Please try again.' });
  }
});

// GET /api/student/checkout/status/:merchantTxnId — polled by the success page.
// Namespaced under /status so a literal path segment can never be mistaken for
// a transaction id.
studentCheckoutRouter.get('/status/:merchantTxnId', requireStudentAuth, async (req: StudentRequest, res) => {
  const purchase = await prisma.studentPurchase.findUnique({
    where: { merchantTxnId: req.params.merchantTxnId },
  });
  // Scoped to the caller: the txn id must never be enough to read someone else's purchase.
  if (!purchase || purchase.studentId !== req.student!.id) {
    return res.status(404).json({ error: 'Not found' });
  }

  // The webhook may not have landed yet, so re-check while the buyer waits.
  if (purchase.status === 'PENDING' && purchase.gatewayRef) {
    await confirmAndSettle(purchase.merchantTxnId);
  }

  const fresh = await prisma.studentPurchase.findUnique({ where: { id: purchase.id } });
  res.json({
    status: fresh!.status,
    amount: (fresh!.amount / 100).toFixed(2),
    currency: fresh!.currency,
    courseTitle: fresh!.courseTitle,
    merchantTxnId: fresh!.merchantTxnId,
  });
});

/**
 * The global express.json() runs before this router, so by the time a callback
 * arrives its body may already be a parsed object (JSON content-type) or still
 * a Buffer (text/plain, which is what PayGlocal sends for JWE). Normalise both
 * back to the raw string the JWE/JSON decoders expect.
 */
function bodyToString(body: unknown): string {
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') return JSON.stringify(body);
  return '';
}

/** Shared handler for both PayGlocal-initiated paths. */
async function handleGatewayPost(rawBody: string): Promise<string | null> {
  const { merchantTxnId, gid } = await extractIds(rawBody);

  let txnId = merchantTxnId;
  if (!txnId && gid) {
    const byGid = await prisma.studentPurchase.findFirst({ where: { gatewayRef: gid } });
    txnId = byGid?.merchantTxnId ?? null;
  }
  if (!txnId) {
    console.warn('[payglocal] callback with no recognizable transaction id');
    return null;
  }

  await confirmAndSettle(txnId);
  return txnId;
}

// POST /api/student/checkout/payglocal/callback — browser lands here from the
// hosted page, so it must answer with a redirect rather than JSON.
studentCheckoutRouter.post(
  '/payglocal/callback',
  callbackLimiter,
  raw({ type: '*/*', limit: '1mb' }),
  async (req, res) => {
    let txn: string | null = null;
    try {
      txn = await handleGatewayPost(bodyToString(req.body));
    } catch (e) {
      console.error('[payglocal] callback handling failed:', e);
    }
    const base = process.env.CHECKOUT_RETURN_URL || 'https://mitsedge.com/checkout/success';
    res.redirect(302, `${base}${base.includes('?') ? '&' : '?'}txn=${txn ?? ''}`);
  },
);

// POST /api/student/checkout/payglocal/webhook — server-to-server, independent
// of the browser. Always 200 so PayGlocal does not retry a poisoned body forever.
studentCheckoutRouter.post(
  '/payglocal/webhook',
  callbackLimiter,
  raw({ type: '*/*', limit: '1mb' }),
  async (req, res) => {
    try {
      await handleGatewayPost(bodyToString(req.body));
      res.json({ status: 'ok' });
    } catch (e) {
      console.error('[payglocal] webhook handling failed:', e);
      res.json({ status: 'error' });
    }
  },
);
