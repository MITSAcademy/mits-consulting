/**
 * Custom-amount payments (mitsedge.com/pay).
 *
 * A payer states what the money is for and pays an amount, either one they
 * typed or one fixed by a staff-created link. These are plain payment records:
 * settling one NEVER creates a StudentPurchase or any enrollment, so paying a
 * small amount here cannot buy a course. The team is emailed and decides what
 * the payment covers.
 */

import crypto from 'crypto';
import { prisma } from './prisma';
import { fetchStatus, isPaidStatus, isFailedStatus } from './payglocal';
import { sendEmail, safeBuildFromUser } from './mailer';

/** Smallest custom payment, in minor units ($5.00): below this is a typo or a test. */
export const CUSTOM_MIN_MINOR = 500;
/** Largest custom payment, in minor units ($10,000.00). */
export const CUSTOM_MAX_MINOR = 1_000_000;
export const CUSTOM_CURRENCY = 'USD';

/** Custom payments carry their own prefix so a callback can be routed by id alone. */
export const CUSTOM_TXN_PREFIX = 'MPAY';

export function newCustomTxnId(): string {
  return `${CUSTOM_TXN_PREFIX}${crypto.randomBytes(12).toString('hex')}`.slice(0, 24).toUpperCase();
}

export function isCustomTxnId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(CUSTOM_TXN_PREFIX);
}

export function newLinkToken(): string {
  return crypto.randomBytes(18).toString('hex');
}

/**
 * Parses an amount typed by a payer ("550", "550.5", "1,250.00", 550) into
 * minor units. Returns null for anything that is not a plain positive amount
 * with at most two decimals, rather than guessing.
 */
export function parseAmountToMinor(raw: unknown): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    raw = String(raw);
  }
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/^\$/, '').replace(/,(?=\d{3}(\D|$))/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function amountError(minor: number | null): string | null {
  if (minor === null) return 'Enter the amount as a number, for example 550 or 550.00.';
  if (minor < CUSTOM_MIN_MINOR) return `The minimum payment is $${(CUSTOM_MIN_MINOR / 100).toFixed(2)}.`;
  if (minor > CUSTOM_MAX_MINOR) {
    return `The maximum online payment is $${(CUSTOM_MAX_MINOR / 100).toLocaleString('en-US')}. Please contact us for larger amounts.`;
  }
  return null;
}

export function formatMinor(minor: number, currency: string): string {
  return `${currency} ${(minor / 100).toFixed(2)}`;
}

/** Why a link cannot be paid, or null when it can. */
export async function linkProblem(link: {
  id: string;
  active: boolean;
  expiresAt: Date | null;
}): Promise<'inactive' | 'expired' | 'paid' | null> {
  if (!link.active) return 'inactive';
  if (link.expiresAt && link.expiresAt < new Date()) return 'expired';
  const paid = await prisma.customPayment.count({ where: { linkId: link.id, status: 'PAID' } });
  return paid > 0 ? 'paid' : null;
}

// ------------------------------------------------------------------ email

const VAIBHAV_EMAIL = 'vaibhav.aggarwal@mitssolution.com';
const PORTAL_URL = process.env.PORTAL_URL || 'https://mits-frontend.onrender.com';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function samitaSender(displayName?: string) {
  const samita = await prisma.user.findUnique({
    where: { id: 'u-samita' },
    select: { id: true, name: true, email: true, gmailAddress: true, sendAsAddress: true, smtpAppPassword: true },
  });
  const fromUser =
    samita?.smtpAppPassword && samita.gmailAddress
      ? safeBuildFromUser({
          id: samita.id,
          name: displayName || samita.name,
          gmailAddress: samita.gmailAddress,
          smtpAppPassword: samita.smtpAppPassword,
          sendAsAddress: samita.sendAsAddress,
        })
      : undefined;
  return { fromUser, samitaEmail: samita?.sendAsAddress || samita?.gmailAddress || samita?.email };
}

async function sendWithFallback(args: Parameters<typeof sendEmail>[0], fromUser: Awaited<ReturnType<typeof samitaSender>>['fromUser']) {
  if (fromUser) {
    try {
      await sendEmail({ ...args, fromUser });
      return;
    } catch (e) {
      console.error('[custom-payment] Gmail send failed, falling back:', e);
    }
  }
  await sendEmail(args);
}

interface PaidPayment {
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  purpose: string;
  amount: number;
  currency: string;
  merchantTxnId: string;
  gatewayRef: string | null;
  viaLink: boolean;
}

function table(rows: [string, string][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;">${rows
    .map(
      ([l, v]) =>
        `<tr><td style="padding:8px 12px;color:#666;font-size:13px;white-space:nowrap;vertical-align:top;">${l}</td><td style="padding:8px 12px;color:#1a1a1a;font-size:14px;">${escapeHtml(v)}</td></tr>`,
    )
    .join('')}</table>`;
}

function shell(title: string, inner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:24px 0;background:#f5f5f5;font-family:Arial,'Helvetica Neue',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
<tr><td style="background:#0f5132;padding:20px 32px;color:#ffffff;font-size:17px;font-weight:700;">${escapeHtml(title)}</td></tr>
<tr><td style="padding:28px 32px;color:#1a1a1a;font-size:14px;line-height:1.6;">${inner}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Tells the team. Never throws: mail must not undo a settled payment. */
async function notifyTeam(p: PaidPayment): Promise<void> {
  try {
    const { fromUser, samitaEmail } = await samitaSender();
    const amount = formatMinor(p.amount, p.currency);
    const reference = p.gatewayRef || p.merchantTxnId;
    const source = p.viaLink ? 'Fixed-amount link created by staff' : 'Amount typed by the payer';
    const cc = [samitaEmail].filter((e): e is string => !!e && e !== VAIBHAV_EMAIL);
    await sendWithFallback(
      {
        to: VAIBHAV_EMAIL,
        cc: cc.join(', ') || undefined,
        subject: `Custom payment received — ${p.payerName} (${amount})`,
        body: `Custom payment received\n\nThis is NOT a course purchase and has not enrolled anyone. Check the amount against what was agreed, then act on it.\n\nName: ${p.payerName}\nEmail: ${p.payerEmail}\nPhone: ${p.payerPhone}\nFor: ${p.purpose}\nAmount: ${amount}\nSource: ${source}\nReference: ${reference}\n\nAll custom payments: ${PORTAL_URL}/custom-payments`,
        htmlBody: shell(
          `Custom payment received — ${amount}`,
          `<p style="margin:0 0 16px;padding:10px 12px;background:#fff8e1;border:1px solid #f0d98c;border-radius:6px;font-size:13px;">This is <strong>not a course purchase</strong> and has not enrolled anyone. Check the amount against what was agreed, then act on it.</p>
${table([
  ['Name', p.payerName],
  ['Email', p.payerEmail],
  ['Phone', p.payerPhone],
  ['For', p.purpose],
  ['Amount', amount],
  ['Source', source],
  ['Reference', reference],
])}
<p style="margin:18px 0 0;"><a href="${PORTAL_URL}/custom-payments" style="color:#0f5132;font-weight:700;">Open custom payments in the hub</a></p>`,
        ),
        skipVaibhavCc: true,
      },
      fromUser,
    );
  } catch (e) {
    console.error('[custom-payment] Failed to notify the team:', e);
  }
}

/** Receipt to the payer. Says "payment received", never "enrolled". */
async function sendReceipt(p: PaidPayment): Promise<void> {
  try {
    const { fromUser } = await samitaSender('MITS Edge');
    const amount = formatMinor(p.amount, p.currency);
    const reference = p.gatewayRef || p.merchantTxnId;
    await sendWithFallback(
      {
        to: p.payerEmail,
        subject: `Payment received: ${amount}`,
        body: `Hi ${p.payerName},\n\nWe have received your payment of ${amount}.\n\nFor: ${p.purpose}\nReference: ${reference}\n\nOur team will contact you shortly about the next steps. Please keep this email as your record of the payment.\n\nThank you,\nMITS Edge`,
        htmlBody: shell(
          'Payment received',
          `<p style="margin:0 0 14px;">Hi ${escapeHtml(p.payerName)},</p>
<p style="margin:0 0 16px;">We have received your payment of <strong>${escapeHtml(amount)}</strong>.</p>
${table([
  ['For', p.purpose],
  ['Amount', amount],
  ['Reference', reference],
])}
<p style="margin:18px 0 0;">Our team will contact you shortly about the next steps. Please keep this email as your record of the payment.</p>
<p style="margin:14px 0 0;">Thank you,<br/>MITS Edge</p>`,
        ),
        skipVaibhavCc: true,
      },
      fromUser,
    );
  } catch (e) {
    console.error('[custom-payment] Failed to send the receipt:', e);
  }
}

// ---------------------------------------------------------------- settling

/**
 * Re-confirms a custom payment with PayGlocal's status API and settles it.
 * Callback, webhook, the payer's polling and the reconcile sweep all come
 * through here; the outcome is only ever what the status API says.
 */
export async function confirmAndSettleCustom(merchantTxnId: string): Promise<void> {
  const payment = await prisma.customPayment.findUnique({ where: { merchantTxnId } });
  if (!payment) {
    console.warn(`[custom-payment] outcome for unknown merchantTxnId ${merchantTxnId}`);
    return;
  }
  if (payment.status === 'PAID') return;
  if (!payment.gatewayRef) return;

  const status = await fetchStatus(payment.gatewayRef);
  if (isPaidStatus(status)) {
    // updateMany's count is the race-safe signal that this call flipped it, so
    // the emails go out exactly once however many confirmations arrive.
    const settled = await prisma.customPayment.updateMany({
      where: { merchantTxnId, status: { not: 'PAID' } },
      data: { status: 'PAID', paidAt: new Date() },
    });
    if (settled.count > 0) {
      console.log(`[custom-payment] ${merchantTxnId} settled PAID`);
      const paid: PaidPayment = {
        payerName: payment.payerName,
        payerEmail: payment.payerEmail,
        payerPhone: payment.payerPhone,
        purpose: payment.purpose,
        amount: payment.amount,
        currency: payment.currency,
        merchantTxnId: payment.merchantTxnId,
        gatewayRef: payment.gatewayRef,
        viaLink: !!payment.linkId,
      };
      await sendReceipt(paid);
      await notifyTeam(paid);
    }
  } else if (isFailedStatus(status)) {
    await prisma.customPayment.updateMany({
      where: { merchantTxnId, status: { notIn: ['PAID'] } },
      data: { status: 'FAILED' },
    });
  }
}

/** Re-checks custom payments still PENDING, for callbacks that never arrived. */
export async function reconcilePendingCustomPayments(opts: {
  maxAgeMs: number;
  minAgeMs?: number;
  limit: number;
}): Promise<number> {
  const now = Date.now();
  const pending = await prisma.customPayment.findMany({
    where: {
      status: 'PENDING',
      gatewayRef: { not: null },
      createdAt: { gte: new Date(now - opts.maxAgeMs), lte: new Date(now - (opts.minAgeMs ?? 0)) },
    },
    orderBy: { createdAt: 'desc' },
    take: opts.limit,
    select: { merchantTxnId: true },
  });
  for (const p of pending) {
    try {
      await confirmAndSettleCustom(p.merchantTxnId);
    } catch (e) {
      console.error(`[custom-payment] reconcile failed for ${p.merchantTxnId}:`, e);
    }
  }
  return pending.length;
}
