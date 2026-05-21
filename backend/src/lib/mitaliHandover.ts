/**
 * Handover welcome — sent by Mitali after Roshni hands off the client.
 * Introduces her team, explains the feedback rhythm, confirms next steps.
 *
 * Dual-channel: HTML email + plain text (also used for WhatsApp).
 */

export interface HandoverVars {
  clientName: string;
  trainerName?: string;
  senderName?: string;             // Mitali
  senderEmail?: string;            // Mitali's gmail if configured
  paymentModel?: string;
  cycleEnd?: string;
}

export const HANDOVER_SUBJECT = (clientName: string) =>
  `Hello from your MITS Customer Success team, ${clientName}`;

export function buildHandoverText(v: HandoverVars): string {
  const senderName = v.senderName || 'Mitali';
  return [
    `Hi ${v.clientName},`,
    ``,
    `I'm ${senderName}, your dedicated Customer Success Manager at MITS Consulting. Now that Roshni has handed your engagement over to my team, allow me to introduce who you'll be working with day-to-day:`,
    ``,
    `── YOUR DEDICATED MITS TEAM ──`,
    `Mitali     — Customer Success Manager (your escalation point)`,
    `Bhavneet   — Operations Lead (weekly review calls)`,
    `Kashish    — Daily session coordinator`,
    `Muskan     — Daily session coordinator`,
    v.trainerName ? `${v.trainerName.padEnd(11)}— Your primary trainer` : '',
    ``,
    `── HOW WE'LL STAY IN TOUCH ──`,
    ``,
    `• Daily WhatsApp: Kashish and Muskan will ping you each working day to share the session log and ask for a quick feedback note.`,
    `• Twice a week: Bhavneet will call you for a 10-15 minute feedback conversation — what's working, what isn't, anything we should adjust.`,
    `• Every two weeks: I'll personally call you for a structured review — progress against goals, satisfaction, and the next cycle plan.`,
    `• Payments: I'll send you the payment schedule for your package and keep you reminded so we never run into surprises.${v.paymentModel ? ` (Your model: ${v.paymentModel}${v.cycleEnd ? ' · next cycle ends ' + v.cycleEnd : ''}.)` : ''}`,
    ``,
    `Please save my number and reach out anytime you need anything — whether that's a topic deep-dive, a rescheduling, or just a vent. We're here for it.`,
    ``,
    `Looking forward to a long and successful partnership.`,
    ``,
    `Warm regards,`,
    senderName,
    `Customer Success Manager · MITS Consulting`,
    `https://mitssolution.com`,
  ].filter(Boolean).join('\n');
}

export function buildHandoverHtml(v: HandoverVars): string {
  const senderName = v.senderName || 'Mitali';
  const subject = HANDOVER_SUBJECT(v.clientName);
  const memberRow = (role: string, name: string, badge?: string) =>
    `<tr><td style="padding:6px 12px;background:#f7f7f9;border:1px solid #e4e4e7;font-weight:600;width:40%;">${esc(role)}</td><td style="padding:6px 12px;border:1px solid #e4e4e7;">${esc(name)}${badge ? ` <span style="color:#6B6F78;font-size:12px;">· ${esc(badge)}</span>` : ''}</td></tr>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1A1B1E;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f4f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;padding:32px 36px;">
        <tr><td style="font-size:15px;line-height:1.7;color:#1A1B1E;">

          <p style="margin:0 0 16px;font-size:18px;font-weight:700;">Hi ${esc(v.clientName)} — welcome to the team 👋</p>

          <p style="margin:0 0 14px;">
            I'm <b>${esc(senderName)}</b>, your dedicated Customer Success Manager at <b>MITS Consulting</b>. Now that Roshni has handed your engagement over to my team, allow me to introduce who you'll be working with day-to-day.
          </p>

          <h3 style="margin:22px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;color:#6B6F78;">Your dedicated MITS team</h3>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 16px;">
            ${memberRow('Customer Success Manager', senderName, 'escalation point')}
            ${memberRow('Operations Lead',          'Bhavneet',  'weekly review calls')}
            ${memberRow('Daily Coordinator',        'Kashish')}
            ${memberRow('Daily Coordinator',        'Muskan')}
            ${v.trainerName ? memberRow('Primary Trainer', v.trainerName) : ''}
          </table>

          <h3 style="margin:22px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;color:#6B6F78;">How we'll stay in touch</h3>
          <ul style="margin:0 0 16px;padding-left:20px;">
            <li style="margin:0 0 8px;"><b>Daily on WhatsApp</b> — Kashish and Muskan will ping you each working day with the session log and a quick feedback prompt.</li>
            <li style="margin:0 0 8px;"><b>Twice a week on call</b> — Bhavneet will call you for a 10-15 minute feedback conversation: what's working, what isn't, and anything we should adjust.</li>
            <li style="margin:0 0 8px;"><b>Every two weeks</b> — I'll personally call for a structured review: progress against your goals, satisfaction, and the next cycle plan.</li>
            <li style="margin:0;"><b>Payments</b> — I'll share the payment schedule for your package${v.paymentModel ? ` (${esc(v.paymentModel)}${v.cycleEnd ? ` · next cycle ends ${esc(v.cycleEnd)}` : ''})` : ''} and keep you gently reminded so we never run into surprises.</li>
          </ul>

          <p style="margin:0 0 14px;">
            Please save my number and reach out any time you need something — whether that's a topic deep-dive, rescheduling a session, or just to share thoughts. We're here for it.
          </p>

          <p style="margin:0 0 14px;font-weight:600;">Looking forward to a long and successful partnership.</p>

          <p style="margin:18px 0 4px;">Warm regards,</p>
          <p style="margin:0;font-weight:600;">${esc(senderName)}</p>
          <p style="margin:0;color:#6B6F78;font-size:13px;">Customer Success Manager · MITS Consulting</p>
          ${v.senderEmail ? `<p style="margin:6px 0 0;"><a href="mailto:${esc(v.senderEmail)}" style="color:#1A6CDF;text-decoration:underline;font-size:13px;">${esc(v.senderEmail)}</a></p>` : ''}

        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
