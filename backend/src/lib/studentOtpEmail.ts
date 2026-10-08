/**
 * Delivers student OTP codes.
 *
 * Sent from Samita's Gmail App Password rather than Resend: the Resend daily
 * quota is routinely exhausted by internal mail, and a dropped OTP locks a
 * paying student out of checkout.
 */

import { sendEmail, safeBuildFromUser } from './mailer';
import { prisma } from './prisma';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHtml(name: string, code: string, purpose: 'signup' | 'login'): string {
  const heading = purpose === 'signup' ? 'Confirm your email' : 'Sign in to MITS Edge';
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,'Helvetica Neue',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="460" cellpadding="0" cellspacing="0" style="max-width:460px;width:100%;background:#ffffff;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
      <tr><td style="background:#1a1a2e;padding:20px 32px;">
        <span style="color:#ffffff;font-size:17px;font-weight:700;">MITS Edge</span>
      </td></tr>
      <tr><td style="padding:28px 32px 8px;">
        <p style="margin:0 0 6px;color:#1a1a1a;font-size:16px;font-weight:700;">${heading}</p>
        <p style="margin:0 0 20px;color:#555;font-size:14px;">Hi ${escapeHtml(name)}, use this code to continue:</p>
        <div style="background:#f6f6f9;border:1px solid #e3e3ec;border-radius:8px;padding:16px;text-align:center;">
          <span style="font-size:30px;font-weight:700;letter-spacing:7px;color:#1a1a2e;font-family:monospace;">${code}</span>
        </div>
        <p style="margin:18px 0 0;color:#777;font-size:13px;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
      </td></tr>
      <tr><td style="padding:22px 32px 28px;">
        <p style="margin:0;color:#999;font-size:12px;">Never share this code. MITS Edge staff will never ask you for it.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export async function sendStudentOtpEmail(
  to: string,
  name: string,
  code: string,
  purpose: 'signup' | 'login',
): Promise<void> {
  const samita = await prisma.user.findUnique({
    where: { id: 'u-samita' },
    select: { id: true, name: true, gmailAddress: true, sendAsAddress: true, smtpAppPassword: true },
  });

  const fromUser = samita?.smtpAppPassword && samita.gmailAddress
    ? safeBuildFromUser({
        id: samita.id,
        name: 'MITS Edge',
        gmailAddress: samita.gmailAddress,
        smtpAppPassword: samita.smtpAppPassword,
        sendAsAddress: samita.sendAsAddress,
      })
    : undefined;

  const args = {
    to,
    subject: `${code} is your MITS Edge verification code`,
    body: `Hi ${name},\n\nYour MITS Edge verification code is ${code}.\nIt expires in 10 minutes.\n\nIf you didn't request this, ignore this email. Never share this code with anyone.`,
    htmlBody: buildHtml(name, code, purpose),
    skipVaibhavCc: true, // a student's OTP is not internal correspondence
  };

  if (fromUser) {
    try {
      await sendEmail({ ...args, fromUser });
      return;
    } catch (e) {
      // Samita's App Password can expire or be revoked at any time. That is an
      // internal mail problem and must not stop a student from signing up, so
      // fall through to the system sender rather than failing the request.
      console.error('[student-otp] Gmail send failed, falling back to Resend:', e);
    }
  }

  await sendEmail(args);
}
