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

function buildHtml(clientName: string, mitaliName: string, mitaliEmail: string, mitaliPhone: string): string {
  const firstName = clientName.split(' ')[0];
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  body { margin:0; padding:0; background:#f4f4f4; font-family: Arial, sans-serif; }
  .wrap { max-width:600px; margin:24px auto; background:#ffffff; border:1px solid #e0e0e0; border-radius:8px; overflow:hidden; }
  .body { padding:32px 36px; color:#1a1a1a; font-size:15px; line-height:1.7; }
  .body p { margin:0 0 16px; }
  .cta-btn {
    display:inline-block; margin:8px 0 20px;
    background:#1a1a2e; color:#ffffff !important; text-decoration:none;
    padding:13px 28px; border-radius:6px; font-weight:700; font-size:15px;
    letter-spacing:0.3px;
  }
  .highlight { background:#fff8e1; font-weight:bold; }
  .divider { border:none; border-top:1px solid #e0e0e0; margin:24px 0; }
  .sig { font-size:13px; color:#444; }
  .sig-name { font-size:17px; font-weight:700; color:#1a1a1a; margin-bottom:6px; font-family: Georgia, serif; font-style: italic; }
  .brand { font-size:26px; font-weight:900; color:#1a1a1a; letter-spacing:-1px; }
  .brand-sub { font-size:11px; color:#888; letter-spacing:1px; text-transform:uppercase; }
  .footer-tagline { font-size:13px; color:#888; font-style:italic; margin-top:8px; }
  .confid { font-size:11px; background:#fee2e2; color:#991b1b; padding:3px 8px; border-radius:4px; font-weight:700; display:inline-block; margin-bottom:4px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="body">
    <p>Dear ${firstName},</p>

    <p>I hope this email finds you well. At MITS, we continuously strive to enhance our services and ensure the utmost satisfaction for our <strong>valued clients</strong> like you.</p>

    <p>Your <span class="highlight">feedback</span> is vital to us, and we would be incredibly grateful if you could take a few minutes to complete our <strong>Client Survey Form</strong>. This form has been designed to gather your valuable insights and opinions on your experience with our company.</p>

    <p style="text-align:center;">
      <a href="${FORM_URL}" class="cta-btn">📋 Fill Client Survey Form</a>
    </p>

    <p>We genuinely <strong>value</strong> your honest <span class="highlight">feedback</span>, as it will help us identify areas of <strong>improvement</strong> and tailor our services to <strong>better meet</strong> your needs.</p>

    <p>Rest assured that all <strong>responses</strong> will remain <strong>confidential</strong>, and your participation in the <strong>survey</strong> is entirely <strong>voluntary</strong>.</p>

    <hr class="divider"/>

    <div class="sig">
      <p style="margin:0 0 4px;">Regards,</p>
      <div class="sig-name">${mitaliName}</div>
      <table cellpadding="0" cellspacing="0">
        <tr><td style="padding:2px 0;">✉️&nbsp;</td><td><a href="mailto:${mitaliEmail}" style="color:#1a6cdf;">${mitaliEmail}</a></td></tr>
        ${mitaliPhone ? `<tr><td style="padding:2px 0;">📞&nbsp;</td><td>${mitaliPhone}</td></tr>` : ''}
        <tr><td style="padding:2px 0;">🔗&nbsp;</td><td><a href="https://mitssolution.com" style="color:#1a6cdf;">mitssolution.com</a></td></tr>
      </table>
      <hr class="divider"/>
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:20px; vertical-align:middle;">
          <div class="brand">MITS</div>
          <div class="brand-sub">Solution</div>
        </td>
      </tr></table>
      <div class="footer-tagline">🏆 MITS Solution got awarded as one of the top Ed'Tech Firms in 2022</div>
      <div style="margin-top:8px; font-style:italic; font-size:14px; color:#555;">Boost your skills with our IT training programs</div>
    </div>
  </div>
</div>
</body>
</html>`;
}

export async function sendClientFeedbackEmails(opts: { force?: boolean } = {}): Promise<{ sent: number; skipped: number; errors: number }> {
  const today = todayIST();
  const targetDate = addDays(today, 2); // payDate1 is 2 days from now

  // Fetch Mitali user (sender)
  const mitali = await prisma.user.findUnique({
    where: { id: 'u-mitali' },
    select: { id: true, name: true, email: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true, phone: true },
  });
  if (!mitali?.gmailAddress || !mitali?.smtpAppPassword) {
    console.warn('[feedback-email] Mitali SMTP not configured — skipping');
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const fromUser = safeBuildFromUser(mitali as any);
  if (!fromUser) {
    console.warn('[feedback-email] Could not build fromUser for Mitali — skipping');
    return { sent: 0, skipped: 0, errors: 0 };
  }

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

  let sent = 0, skipped = 0, errors = 0;

  for (const client of clients) {
    if (!client.email) { skipped++; continue; }

    // Skip if already sent in this cycle (feedbackEmailSentAt within last 10 days)
    if (!opts.force && client.feedbackEmailSentAt) {
      const daysSince = Math.floor((Date.parse(today) - Date.parse(client.feedbackEmailSentAt)) / 86_400_000);
      if (daysSince < 10) { skipped++; continue; }
    }

    try {
      const mitaliEmail = mitali.sendAsAddress || mitali.gmailAddress!;
      const html = buildHtml(client.name, mitali.name, mitaliEmail, (mitali as any).phone || '');
      await sendEmail({
        to: client.email,
        cc: mitaliEmail,
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
