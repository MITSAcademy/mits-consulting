/**
 * Pre-demo reminder sent to the trainer ~15-30 min before the demo starts.
 * Refined version of the team's note about cameras off, no CV sharing, etc.
 *
 * Sent by Anjali (or whoever schedules) just before the call begins.
 */

export const PRE_DEMO_REMINDER_SUBJECT = (trainerName?: string, demoTime?: string) =>
  `Demo reminder${trainerName ? ' · ' + trainerName : ''}${demoTime ? ' · ' + demoTime : ''}`;

export interface PreDemoVars {
  trainerName?: string;
  clientName?: string;        // Kept generic in body — never disclosed to trainer if confidential
  demoCallTime?: string;      // "8 PM IST · 21 May 2026"
  joinLink?: string;          // Optional — Zoom/Meet link if available
  senderName?: string;
}

/** Plain text — used for WhatsApp + as text alternative on email. */
export function buildPreDemoReminderText(v: PreDemoVars): string {
  const lines = [
    `Hi ${v.trainerName || 'there'},`,
    ``,
    `Quick reminder ahead of your upcoming demo call${v.demoCallTime ? ` at ${v.demoCallTime}` : ''}. Please keep the following guidelines in mind to ensure a smooth, professional experience for our client:`,
    ``,
    `1. Camera off for the entire call.`,
    `   Please keep your camera turned OFF throughout the demo. We do not enable video on these calls.`,
    ``,
    `2. CVs are never shared.`,
    `   We do not share your CV / résumé with the client. Please do not offer to share it during the call.`,
    ``,
    `3. Personal details stay confidential.`,
    `   Please do not disclose your phone number, personal email, LinkedIn profile, or current/past company names to the client. All coordination goes via MITS.`,
    ``,
    `4. Join from laptop only.`,
    `   Please join the meeting from a laptop / desktop — not from a mobile phone. This ensures a stable, professional setup.`,
    ``,
    `5. Display name (optional).`,
    `   You may change your display name in the meeting if you prefer — this is optional.`,
    ``,
    v.joinLink ? `Meeting link: ${v.joinLink}` : `The meeting link will be shared just before the call.`,
    ``,
    `Thank you for partnering with MITS — looking forward to a great session.`,
    ``,
    `Warm regards,`,
    v.senderName || 'MITS Consulting',
  ];
  return lines.filter((l) => l !== undefined).join('\n');
}

/** HTML version for email — clean numbered list. */
export function buildPreDemoReminderHtml(v: PreDemoVars): string {
  const subject = PRE_DEMO_REMINDER_SUBJECT(v.trainerName, v.demoCallTime);
  const senderName = v.senderName || 'MITS Consulting';
  const linkLine = v.joinLink
    ? `Meeting link: <a href="${esc(v.joinLink)}" target="_blank" style="color:#1A6CDF;text-decoration:underline;">${esc(v.joinLink)}</a>`
    : `The meeting link will be shared just before the call.`;
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1A1B1E;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f4f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;padding:32px 36px;">
        <tr><td style="font-size:15px;line-height:1.7;color:#1A1B1E;">

          <p style="margin:0 0 12px;">Hi <b>${esc(v.trainerName || 'there')}</b>,</p>

          <p style="margin:0 0 16px;">
            Quick reminder ahead of your upcoming demo call${v.demoCallTime ? ` at <b>${esc(v.demoCallTime)}</b>` : ''}. Please keep the following guidelines in mind to ensure a smooth, professional experience for our client:
          </p>

          <ol style="margin:0 0 16px;padding-left:20px;">
            <li style="margin:0 0 10px;"><b>Camera off for the entire call.</b><br/>
              Please keep your camera turned <b>OFF</b> throughout the demo. We do not enable video on these calls.
            </li>
            <li style="margin:0 0 10px;"><b>CVs are never shared.</b><br/>
              We do not share your CV / résumé with the client. Please do not offer to share it during the call.
            </li>
            <li style="margin:0 0 10px;"><b>Personal details stay confidential.</b><br/>
              Please do not disclose your phone number, personal email, LinkedIn profile, or current/past company names to the client. All coordination goes via MITS.
            </li>
            <li style="margin:0 0 10px;"><b>Join from laptop only.</b><br/>
              Please join the meeting from a laptop / desktop — not from a mobile phone. This ensures a stable, professional setup.
            </li>
            <li style="margin:0 0 10px;"><b>Display name (optional).</b><br/>
              You may change your display name in the meeting if you prefer — this is optional.
            </li>
          </ol>

          <p style="margin:0 0 16px;">${linkLine}</p>

          <p style="margin:0 0 16px;">Thank you for partnering with MITS — looking forward to a great session.</p>

          <p style="margin:18px 0 4px;">Warm regards,</p>
          <p style="margin:0;font-weight:600;">${esc(senderName)}</p>
          <p style="margin:0;color:#6B6F78;font-size:13px;">MITS Consulting</p>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
