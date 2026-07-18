/**
 * Sends a feedback survey email from Mitali's address to each active client
 * whose payDate1 (next due date) is exactly 2 days away — i.e. payment is
 * approaching and it's a good moment to ask for feedback.
 *
 * Rules:
 * - Only clients with a valid email on file
 * - Only if feedbackEmailSentAt is null OR from a prior payment cycle
 *   (i.e. feedbackEmailSentAt < payDate1 - 14 days, meaning it's a new cycle)
 * - Sent FROM Mitali's Gmail (mitagg@mitssolution.com) via her SMTP
 * - CC: Mitali herself
 * - Logged to AuditLog
 *
 * Cron: 9:00 AM IST daily
 * Manual: POST /api/briefing/feedback-survey-trigger
 */

import { prisma } from './prisma';
import { sendEmail, safeBuildFromUser } from './mailer';
import { audit } from './audit';

const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSep1UNX-Cx3USsytUO2NvwtsQdanCYOlFANLzeNS442hx5TQQ/viewform';

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildHtml(clientName: string, mitaliName: string): string {
  const firstName = clientName.split(' ')[0];
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,'Helvetica Neue',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">

      <!-- Body -->
      <tr><td style="padding:32px 36px;color:#1a1a1a;font-size:15px;line-height:1.7;">
        <p style="margin:0 0 16px;">Dear ${firstName},</p>
        <p style="margin:0 0 16px;">I hope this email finds you well. At MITS, we continuously strive to enhance our services and ensure the utmost satisfaction for our <strong>valued clients</strong> like you.</p>
        <p style="margin:0 0 24px;">Your <strong>feedback</strong> is vital to us, and we would be incredibly grateful if you could take a few minutes to complete our survey. This has been designed to gather your valuable insights and opinions on your experience with our company.</p>

        <!-- CTA Button -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="padding:8px 0 24px;">
            <a href="${FORM_URL}" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-weight:700;font-size:15px;letter-spacing:0.3px;">📋 Fill Client Survey Form</a>
          </td></tr>
        </table>

        <p style="margin:0 0 16px;">We genuinely <strong>value</strong> your honest feedback, as it will help us identify areas of <strong>improvement</strong> and tailor our services to <strong>better meet</strong> your needs.</p>
        <p style="margin:0 0 24px;">Rest assured that all responses will remain <strong>confidential</strong>, and your participation is entirely <strong>voluntary</strong>.</p>

        <p style="margin:0;color:#555;font-size:14px;">Regards,<br/><strong>${mitaliName}</strong></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

export async function sendClientFeedbackEmails(opts: { force?: boolean; sample?: boolean } = {}): Promise<{ sent: number; skipped: number; errors: number }> {
  const today = todayIST();
  const targetDate = addDays(today, 2); // payDate1 is 2 days from now

  // Fetch sender (Mitali) + CC recipients (Vaibhav, Samita)
  const users = await prisma.user.findMany({
    where: { id: { in: ['u-mitali', 'u-vaibhav', 'u-samita'] } },
    select: { id: true, name: true, email: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true, phone: true },
  });
  const mitali = users.find((u) => u.id === 'u-mitali');
  const vaibhav = users.find((u) => u.id === 'u-vaibhav');
  const samita = users.find((u) => u.id === 'u-samita');

  if (!mitali?.gmailAddress || !mitali?.smtpAppPassword) {
    console.warn('[feedback-email] Mitali SMTP not configured — skipping');
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const fromUser = safeBuildFromUser(mitali as any);
  if (!fromUser) {
    console.warn('[feedback-email] Could not build fromUser for Mitali — skipping');
    return { sent: 0, skipped: 0, errors: 0 };
  }

  // CC: Vaibhav + Samita only (Mitali is the sender — don't CC her on her own email)
  const ccEmails = [vaibhav?.email, samita?.email].filter(Boolean).join(', ');

  // Find all active clients whose payDate1 = targetDate (2 days away)
  const clients = await prisma.client.findMany({
    where: {
      regularTrainings: { some: { status: 'active' } },
      payDate1: targetDate,
    },
    select: {
      id: true, name: true, email: true,
      feedbackEmailSentAt: true,
      payDate1: true,
    },
  });

  // Sample mode: send one test email to internal team only, no real client emails
  if (opts.sample) {
    const sampleClientName = clients[0]?.name || 'Test Client';
    const html = buildHtml(sampleClientName, mitali.name);
    const sampleTo = [vaibhav?.email, samita?.email].filter(Boolean).join(', ');
    if (!sampleTo) {
      console.warn('[feedback-email] Sample skipped — no internal recipient emails configured');
      return { sent: 0, skipped: 0, errors: 0 };
    }
    await sendEmail({
      to: sampleTo,
      cc: undefined,
      subject: `[SAMPLE] We value your feedback - MITS Solution`,
      body: `[SAMPLE — no client copied]\n\nDear ${sampleClientName.split(' ')[0]},\n\nWe'd love your feedback! Please fill our Client Survey Form: ${FORM_URL}\n\nRegards,\n${mitali.name}`,
      htmlBody: html,
      fromUser,
    });
    console.log(`[feedback-email] Sample sent to internal team (${clients.length} clients would receive real email)`);
    return { sent: 1, skipped: 0, errors: 0 };
  }

  let sent = 0, skipped = 0, errors = 0;

  for (const client of clients) {
    if (!client.email) { skipped++; continue; }

    // Skip if already sent in this cycle (feedbackEmailSentAt within last 7 days)
    if (!opts.force && client.feedbackEmailSentAt) {
      const daysSince = Math.floor((Date.parse(today) - Date.parse(client.feedbackEmailSentAt)) / 86_400_000);
      if (daysSince < 7) { skipped++; continue; }
    }

    try {
      const html = buildHtml(client.name, mitali.name);
      await sendEmail({
        to: client.email,
        cc: ccEmails,
        subject: 'We value your feedback - MITS Solution',
        body: `Dear ${client.name.split(' ')[0]},\n\nWe'd love your feedback! Please fill our Client Survey Form: ${FORM_URL}\n\nRegards,\n${mitali.name}`,
        htmlBody: html,
        fromUser,
      });

      await prisma.client.update({
        where: { id: client.id },
        data: { feedbackEmailSentAt: today },
      });

      await audit(
        mitali.id, mitali.name,
        'FEEDBACK_EMAIL_SENT',
        `Feedback survey email sent to ${client.name} (${client.email}) — payDate1 in 2 days (${targetDate})`,
        { clientId: client.id }
      );

      sent++;
      console.log(`[feedback-email] Sent to ${client.name} <${client.email}>`);
    } catch (e) {
      errors++;
      console.error(`[feedback-email] Failed for ${client.name}:`, e);
    }
  }

  console.log(`[feedback-email] Done — sent:${sent} skipped:${skipped} errors:${errors} (targetDate=${targetDate})`);
  return { sent, skipped, errors };
}
