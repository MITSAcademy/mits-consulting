import { prisma } from './prisma';
import { safeBuildFromUser, sendEmail, decryptSecret, getUserTransporter } from './mailer';

const STEPS = `
<ol style="font-size:13px;color:#374151;line-height:1.9;margin:0;padding-left:18px;">
  <li>Go to <a href="https://myaccount.google.com/apppasswords" style="color:#2563eb;">myaccount.google.com/apppasswords</a></li>
  <li>Sign in with your <strong>@mitssolution.com</strong> Google account</li>
  <li>Click <strong>"Create a new App Password"</strong> → App: Mail, Device: Other → name it "MITS Hub"</li>
  <li>Copy the 16-character password shown</li>
  <li>Open the Hub → click your avatar (top right) → <strong>Email settings</strong></li>
  <li>Paste the new App Password and click <strong>Save</strong></li>
</ol>`;

function wrap(subtitle: string, body: string) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
      <tr><td style="background:#1A1B1E;padding:24px 32px;border-radius:12px 12px 0 0;">
        <div style="font-size:18px;font-weight:700;color:#FBBF24;">MITS Consulting Hub</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${subtitle}</div>
      </td></tr>
      <tr><td style="padding:32px;">${body}</td></tr>
      <tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
        <div style="font-size:11px;color:#9ca3af;text-align:center;">MITS Solution · Internal staff communication</div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

export async function sendSmtpHealthAdvisory() {
  const vaibhav = await prisma.user.findUnique({
    where: { id: 'u-vaibhav' },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });
  if (!vaibhav?.gmailAddress || !vaibhav?.smtpAppPassword) {
    console.warn('[smtp-advisory] Vaibhav SMTP not configured — skipping');
    return;
  }
  const fromUser = safeBuildFromUser(vaibhav);
  if (!fromUser) return;

  const users = await prisma.user.findMany({
    where: { smtpAppPassword: { not: null }, active: true },
    select: { id: true, name: true, email: true, gmailAddress: true, smtpAppPassword: true },
  });

  // Live health check for each user
  const health = await Promise.all(users.map(async (u: any) => {
    try {
      const pwd = decryptSecret(u.smtpAppPassword!);
      const tx = getUserTransporter(u.id, u.gmailAddress!, pwd);
      await tx.verify();
      return { ...u, ok: true };
    } catch {
      return { ...u, ok: false };
    }
  }));

  for (const u of health) {
    const to = u.gmailAddress || u.email;
    if (!to) continue;

    const firstName = u.name.split(' ')[0];

    if (!u.ok) {
      const html = wrap('Urgent: Your Gmail App Password has stopped working',
        `<p style="font-size:15px;font-weight:700;color:#dc2626;margin:0 0 12px;">⚠️ ${firstName}, your Hub email is currently broken.</p>
        <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
          We ran a daily check and your Gmail App Password is returning an <strong>Invalid login</strong> error.
          <strong>No emails are going out from your account</strong> — session sheets, notifications, and follow-ups are all failing silently.
        </p>
        <table cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:20px;margin:0 0 20px;width:100%;">
          <tr><td>
            <div style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:10px;">Fix this now — takes 2 minutes:</div>
            ${STEPS}
          </td></tr>
        </table>
        <p style="font-size:13px;color:#6b7280;margin:0;">Once done, use <strong>Hub → avatar → Email settings → Send test email</strong> to confirm. Reply to this email if you need help.</p>`
      );
      await sendEmail({
        fromUser, to,
        subject: `⚠️ Action needed: Your Hub email is broken, ${firstName}`,
        body: `Your Hub Gmail App Password is broken. Please re-enter it now.`,
        htmlBody: html,
      });
    } else {
      // Only send the general reminder on Mondays to avoid daily noise
      const isMonday = new Date().getDay() === 1;
      if (!isMonday) continue;

      const html = wrap('Gmail App Password — Weekly reminder',
        `<p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 12px;">✅ ${firstName}, your Hub email is working fine.</p>
        <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
          Weekly reminder — if you ever <strong>change your Google account password</strong>, your Hub App Password will be automatically revoked and emails will stop working.
        </p>
        <table cellpadding="0" cellspacing="0" style="background:#fef9ec;border:1px solid #fcd34d;border-radius:8px;padding:20px;margin:0 0 20px;width:100%;">
          <tr><td>
            <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:10px;">If you change your Google password, do this immediately:</div>
            ${STEPS}
          </td></tr>
        </table>
        <p style="font-size:13px;color:#6b7280;margin:0;">Test anytime: Hub → avatar → Email settings → <strong>Send test email</strong>.</p>`
      );
      await sendEmail({
        fromUser, to,
        subject: 'Weekly reminder: Re-enter App Password if you change your Google password',
        body: 'Weekly SMTP health reminder — your email is currently working fine.',
        htmlBody: html,
      });
    }
  }

  const broken = health.filter((u: any) => !u.ok).map((u: any) => u.name);
  console.log(`[smtp-advisory] done — broken: [${broken.join(', ') || 'none'}]`);
}
