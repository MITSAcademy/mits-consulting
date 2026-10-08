/**
 * Notifies the team when a student completes a course purchase.
 *
 * Sent from Samita's Gmail App Password where available so these stay off the
 * Resend quota, which is routinely exhausted; the mailer falls back on its own
 * if that path is down.
 */

import { sendEmail, safeBuildFromUser } from './mailer';
import { prisma } from './prisma';

const VAIBHAV_EMAIL = 'vaibhav.aggarwal@mitssolution.com';
const PORTAL_URL = process.env.PORTAL_URL || 'https://mits-frontend.onrender.com';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface PurchaseNotification {
  studentName: string;
  studentEmail: string;
  studentPhone?: string | null;
  studentId: string;
  courseTitle: string;
  amount: number; // minor units
  currency: string;
  merchantTxnId: string;
  gatewayRef?: string | null;
}

function formatAmount(minorUnits: number, currency: string): string {
  return `${currency} ${(minorUnits / 100).toFixed(2)}`;
}

function buildHtml(p: PurchaseNotification): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 12px;color:#666;font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:8px 12px;color:#1a1a1a;font-size:14px;">${escapeHtml(value)}</td></tr>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,'Helvetica Neue',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">

      <tr><td style="background:#0f5132;padding:20px 32px;">
        <span style="color:#ffffff;font-size:17px;font-weight:700;">Course purchased — ${escapeHtml(formatAmount(p.amount, p.currency))}</span>
      </td></tr>

      <tr><td style="padding:28px 32px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;">
          ${row('Student', p.studentName)}
          ${row('Email', p.studentEmail)}
          ${p.studentPhone ? row('Phone', p.studentPhone) : ''}
          ${row('Course', p.courseTitle)}
          ${row('Amount', formatAmount(p.amount, p.currency))}
          ${row('Reference', p.gatewayRef || p.merchantTxnId)}
        </table>
      </td></tr>

      <tr><td align="center" style="padding:20px 0 28px;">
        <a href="${PORTAL_URL}/students/${p.studentId}" style="display:inline-block;background:#0f5132;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px;">Open student in hub</a>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

export async function sendPurchaseNotification(p: PurchaseNotification): Promise<void> {
  try {
    const samita = await prisma.user.findUnique({
      where: { id: 'u-samita' },
      select: { id: true, name: true, gmailAddress: true, sendAsAddress: true, smtpAppPassword: true, email: true },
    });

    const fromUser = samita?.smtpAppPassword && samita.gmailAddress
      ? safeBuildFromUser({
          id: samita.id,
          name: samita.name,
          gmailAddress: samita.gmailAddress,
          smtpAppPassword: samita.smtpAppPassword,
          sendAsAddress: samita.sendAsAddress,
        })
      : undefined;

    const samitaEmail = samita?.sendAsAddress || samita?.gmailAddress || samita?.email;
    const cc = [samitaEmail].filter((e): e is string => !!e && e !== VAIBHAV_EMAIL);

    const args = {
      to: VAIBHAV_EMAIL,
      cc: cc.join(', ') || undefined,
      subject: `Course purchased — ${p.studentName} (${formatAmount(p.amount, p.currency)})`,
      body: `Course purchased\n\nStudent: ${p.studentName}\nEmail: ${p.studentEmail}\nPhone: ${p.studentPhone || '—'}\nCourse: ${p.courseTitle}\nAmount: ${formatAmount(p.amount, p.currency)}\nReference: ${p.gatewayRef || p.merchantTxnId}\n\nOpen in hub: ${PORTAL_URL}/students/${p.studentId}`,
      htmlBody: buildHtml(p),
      skipVaibhavCc: true, // already the recipient
    };

    if (fromUser) {
      try {
        await sendEmail({ ...args, fromUser });
        return;
      } catch (e) {
        console.error('[purchase-email] Gmail send failed, falling back:', e);
      }
    }
    await sendEmail(args);
  } catch (e) {
    // A failed notification must never roll back a settled payment.
    console.error('[purchase-email] Failed to notify:', e);
  }
}
