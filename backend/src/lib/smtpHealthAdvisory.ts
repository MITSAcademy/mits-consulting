import { prisma } from './prisma';
import { sendEmail } from './mailer';

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

const CAL_STEPS = `
<ol style="font-size:13px;color:#374151;line-height:1.9;margin:0;padding-left:18px;">
  <li>Open the MITS Hub and click <strong>Sign in with Google</strong></li>
  <li>Select your <strong>@mitssolution.com</strong> account</li>
  <li>On the permissions screen, click <strong>Allow</strong> (includes calendar access)</li>
  <li>You'll be taken straight back in — calendar sync will resume</li>
</ol>`;

export async function sendSmtpHealthAdvisory() {
  // Find users with no calendar token or a stale one (not connected in 50+ days)
  const cutoff = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: { active: true, role: { notIn: ['resume_sanitiser'] } },
    select: {
      id: true, name: true, email: true, gmailAddress: true,
      googleRefreshToken: true, googleCalendarConnectedAt: true,
    },
  });

  // Monday-only for healthy users; daily for those with no token at all
  const isMonday = new Date().getDay() === 1;

  for (const u of users) {
    const to = u.gmailAddress || u.email;
    if (!to) continue;
    const firstName = u.name.split(' ')[0];

    const noToken = !u.googleRefreshToken;
    const stale = u.googleCalendarConnectedAt && new Date(u.googleCalendarConnectedAt) < cutoff;

    if (noToken) {
      // Alert every day until they reconnect
      const html = wrap('Action needed: Reconnect your Google account',
        `<p style="font-size:15px;font-weight:700;color:#dc2626;margin:0 0 12px;">⚠️ ${firstName}, your Google calendar is not connected.</p>
        <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
          Your Hub calendar is showing no events because your Google account isn't linked yet.
          This takes less than a minute to fix.
        </p>
        <table cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:20px;margin:0 0 20px;width:100%;">
          <tr><td>
            <div style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:10px;">Reconnect now:</div>
            ${CAL_STEPS}
          </td></tr>
        </table>
        <p style="font-size:13px;color:#6b7280;margin:0;">If you see your calendar events already, ignore this — someone will fix the check shortly.</p>`
      );
      await sendEmail({
        to,
        subject: `⚠️ ${firstName} — your Hub calendar isn't connected`,
        body: `Your Google calendar is not connected to the Hub. Please sign in with Google to restore it.`,
        htmlBody: html,
      });
    } else if (stale && isMonday) {
      // Nudge on Mondays if it's been a while — token may have expired
      const html = wrap('Google calendar — reconnect reminder',
        `<p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 12px;">📅 ${firstName}, your calendar connection may need a refresh.</p>
        <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
          It's been a while since you last signed in with Google. If your Hub calendar looks empty or out of date,
          a quick re-login will fix it — Google occasionally expires access after long periods of inactivity.
        </p>
        <table cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:20px;margin:0 0 20px;width:100%;">
          <tr><td>
            <div style="font-size:13px;font-weight:700;color:#1e40af;margin-bottom:10px;">To refresh your calendar access:</div>
            ${CAL_STEPS}
          </td></tr>
        </table>
        <p style="font-size:13px;color:#6b7280;margin:0;">If your calendar is showing correctly, no action needed.</p>`
      );
      await sendEmail({
        to,
        subject: `Reminder: Refresh your Hub calendar connection, ${firstName}`,
        body: `Your Google calendar connection may have expired. Please sign in again to refresh it.`,
        htmlBody: html,
      });
    }
  }

  console.log(`[calendar-advisory] done — checked ${users.length} users`);
}
