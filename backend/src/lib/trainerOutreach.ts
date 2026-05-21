/**
 * Trainer outreach message — sent by Aman/Kanchan (recruiter team) to a proposed trainer
 * to confirm the deal, the rate, the host, payment day and demo call expectations.
 *
 * Mirrors the actual "Fwd: Meeting guidelines" email Amandeep sends, plus the three
 * WhatsApp follow-ups about engagement model, payment structure and demo-call etiquette.
 *
 * Produces:
 *  - plain text (used for WhatsApp / fallback)
 *  - HTML (used for the email body, branded with MITS footer)
 */

export interface TrainerOutreachVars {
  trainerName?: string;
  hostName?: string;
  hostPhone?: string;
  hostEmail?: string;
  rateInr?: number;
  hoursPerSession?: number;             // hours covered by the rate (default 1 hour of work = 60 min)
  paymentClearanceDay?: string;         // e.g. "Every Wednesday"
  demoCallTime?: string;                // e.g. "8 PM IST · 21 May 2026"
  maxMinutesPerDay?: number;            // default 120
  guidelinesLink?: string;              // Google Drive PDF of "Meeting Do's and Don'ts"
  websiteLink?: string;                 // defaults to https://www.mitssolution.com
  senderName?: string;                  // The recruiter sending it (Aman / Kanchan)
}

const DEFAULTS = {
  paymentClearanceDay: 'Every Wednesday',
  websiteLink: 'https://www.mitssolution.com',
  guidelinesLink: 'https://drive.google.com/file/d/1NcZHkYtbmfojQMK48m5KmgvTC_CU2ofD/view?usp=drive_link',
  rateInr: 600,
  hoursPerSession: 1,                   // 60 minutes
  maxMinutesPerDay: 120,
};

export const TRAINER_OUTREACH_SUBJECT = (v: TrainerOutreachVars) =>
  `Meeting guidelines · ${v.trainerName || 'Trainer'} × MITS Consulting`;

function rupees(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

/** Plain-text version (WhatsApp / SMS / fallback text body). */
export function buildTrainerOutreachText(v: TrainerOutreachVars): string {
  const rate = v.rateInr ?? DEFAULTS.rateInr;
  const hours = v.hoursPerSession ?? DEFAULTS.hoursPerSession;
  const minsPerSession = hours * 60;
  const maxMins = v.maxMinutesPerDay ?? DEFAULTS.maxMinutesPerDay;
  const paymentLine = `${rupees(rate)} for ${minsPerSession} minutes of work`;
  const guidelines = v.guidelinesLink || DEFAULTS.guidelinesLink;
  const website = v.websiteLink || DEFAULTS.websiteLink;
  const clearance = v.paymentClearanceDay || DEFAULTS.paymentClearanceDay;
  const demoTime = v.demoCallTime || '(time to be confirmed)';

  return [
    `Hi ${v.trainerName || 'there'},`,
    ``,
    `We truly appreciate the time and effort you dedicate to working with MITS Solution. To help ensure our client meetings are as effective and professional as possible, please review the meeting guidelines we have prepared.`,
    ``,
    `Meeting Do's and Don'ts:`,
    `${guidelines}`,
    ``,
    `══════════════════════════════════`,
    `KEY DETAILS FOR YOUR UPCOMING MEETING`,
    `══════════════════════════════════`,
    `Host name:          ${v.hostName || '—'} (Host)`,
    `Host phone:         ${v.hostPhone || '—'}`,
    `Host email:         ${v.hostEmail || '—'}`,
    `Payment discussed:  ${paymentLine}`,
    `Payment clearance:  ${clearance}`,
    `Demo call time:     ${demoTime}`,
    ``,
    `── ABOUT THE ENGAGEMENT ──`,
    ``,
    `This is a part-time remote engagement. A maximum of ${maxMins} minutes of your time per day will be required. The client will share their screen and you will support them remotely by solving the queries they face in their project. This is third-party work.`,
    ``,
    `── PAYMENT STRUCTURE ──`,
    ``,
    `The agreed rate is ${rupees(rate)} for every ${minsPerSession} minutes of work. The total minutes you spend on the project are recorded daily by our team. On a weekly basis the total minutes are divided by 60 to convert into hours; the resulting amount is transferred to your bank account on ${clearance}. No additional charges are deducted.`,
    ``,
    `── ABOUT THE DEMO CALL ──`,
    ``,
    `The demo call is a normal interaction call between you and the client over Zoom (audio only). It is an unpaid call for project discussion. Typical duration is 45-90 minutes depending on the conversation. The client will share their screen and walk you through the project, then ask you a few related questions — please answer confidently and actively.`,
    ``,
    `── IMPORTANT — PLEASE NOTE ──`,
    ``,
    `• During any client-facing session or demo call, do NOT share your personal contact details (phone number, email, LinkedIn, current/past company names) with the client. Any violation will result in strict penalties.`,
    `• If the client shares their contact information and requests additional work beyond the scheduled hours, please report it immediately to your coordinator or session host.`,
    `• Unauthorised extra work outside the MITS engagement will not be compensated.`,
    ``,
    `Thank you for your cooperation in maintaining our professional standards. If you have any questions or need further assistance, please reach out to me.`,
    ``,
    `Warm regards,`,
    v.senderName || 'MITS Recruitment Team',
    `MITS Consulting`,
    website,
  ].join('\n');
}

/** HTML version for email — clean tables, IMPORTANT NOTE callout box, branded. */
export function buildTrainerOutreachHtml(v: TrainerOutreachVars): string {
  const rate = v.rateInr ?? DEFAULTS.rateInr;
  const hours = v.hoursPerSession ?? DEFAULTS.hoursPerSession;
  const minsPerSession = hours * 60;
  const maxMins = v.maxMinutesPerDay ?? DEFAULTS.maxMinutesPerDay;
  const paymentLine = `${rupees(rate)} for ${minsPerSession} minutes of work`;
  const guidelines = v.guidelinesLink || DEFAULTS.guidelinesLink;
  const website = v.websiteLink || DEFAULTS.websiteLink;
  const clearance = v.paymentClearanceDay || DEFAULTS.paymentClearanceDay;
  const demoTime = v.demoCallTime || '(time to be confirmed)';
  const senderName = v.senderName || 'MITS Recruitment Team';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(TRAINER_OUTREACH_SUBJECT(v))}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1A1B1E;-webkit-text-size-adjust:100%;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f4f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;padding:32px 36px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <tr><td style="font-size:15px;line-height:1.7;color:#1A1B1E;">

          <p style="margin:0 0 16px;">Hi <b>${esc(v.trainerName || 'there')}</b>,</p>

          <p style="margin:0 0 16px;">
            We truly appreciate the time and effort you dedicate to working with <b>MITS Solution</b>. To help ensure our client meetings are as effective and professional as possible, we have prepared a brief set of guidelines for you to review.
          </p>

          <p style="margin:0 0 16px;">
            The attached document, <b>"Meeting Do's and Don'ts"</b>, outlines best practices for creating a positive meeting experience and highlights certain practices to avoid. Please take a few moments to go through it:
            <br/>
            <a href="${guidelines}" target="_blank" style="color:#1A6CDF;text-decoration:underline;font-weight:600;">▸ Meeting Guidelines</a>
          </p>

          <p style="margin:18px 0 8px;font-weight:700;font-size:16px;">Key details for your upcoming meeting</p>

          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 22px;border-collapse:collapse;">
            <tr><td style="padding:8px 12px;background:#f7f7f9;border:1px solid #e4e4e7;font-weight:600;width:40%;">Host name</td>
                <td style="padding:8px 12px;border:1px solid #e4e4e7;"><b>${esc(v.hostName || '—')}</b> <span style="color:#6B6F78;">(Host)</span></td></tr>
            <tr><td style="padding:8px 12px;background:#f7f7f9;border:1px solid #e4e4e7;font-weight:600;">Host phone</td>
                <td style="padding:8px 12px;border:1px solid #e4e4e7;">
                  ${v.hostPhone ? `<a href="tel:${esc(v.hostPhone.replace(/\s/g, ''))}" style="color:#1A6CDF;text-decoration:underline;">${esc(v.hostPhone)}</a>` : '—'}
                </td></tr>
            <tr><td style="padding:8px 12px;background:#f7f7f9;border:1px solid #e4e4e7;font-weight:600;">Host email</td>
                <td style="padding:8px 12px;border:1px solid #e4e4e7;">
                  ${v.hostEmail ? `<a href="mailto:${esc(v.hostEmail)}" style="color:#1A6CDF;text-decoration:underline;">${esc(v.hostEmail)}</a>` : '—'}
                </td></tr>
            <tr><td style="padding:8px 12px;background:#f7f7f9;border:1px solid #e4e4e7;font-weight:600;">Payment discussed</td>
                <td style="padding:8px 12px;border:1px solid #e4e4e7;"><b>${esc(paymentLine)}</b></td></tr>
            <tr><td style="padding:8px 12px;background:#f7f7f9;border:1px solid #e4e4e7;font-weight:600;">Payment clearance day</td>
                <td style="padding:8px 12px;border:1px solid #e4e4e7;">${esc(clearance)}</td></tr>
            <tr><td style="padding:8px 12px;background:#f7f7f9;border:1px solid #e4e4e7;font-weight:600;">Demo call time</td>
                <td style="padding:8px 12px;border:1px solid #e4e4e7;"><b>${esc(demoTime)}</b></td></tr>
          </table>

          <h3 style="margin:18px 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#6B6F78;">About the engagement</h3>
          <p style="margin:0 0 14px;">
            This is a part-time remote engagement. A maximum of <b>${maxMins} minutes</b> of your time per day will be required. The client will share their screen and you will support them remotely by solving the queries they face in their project. This is third-party work.
          </p>

          <h3 style="margin:18px 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#6B6F78;">Payment structure</h3>
          <p style="margin:0 0 14px;">
            The agreed rate is <b>${rupees(rate)} for ${minsPerSession} minutes</b> of work. The total minutes you spend on the project are recorded daily by our team. On a weekly basis the total minutes are divided by 60 to convert into hours; the resulting amount is transferred to your bank account on <b>${esc(clearance)}</b>. No additional charges will be deducted.
          </p>

          <h3 style="margin:18px 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:0.06em;color:#6B6F78;">About the demo call</h3>
          <p style="margin:0 0 18px;">
            The demo call is a normal interaction call between you and the client over <b>Zoom (audio only)</b>. It is an <b>unpaid</b> call for project discussion. The typical duration is <b>45-90 minutes</b> depending on the conversation. The client will share their screen and walk you through their project, then ask you a few related questions — please answer confidently and actively.
          </p>

          <!-- IMPORTANT NOTE callout -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:18px 0;border-collapse:collapse;background:#fff7ed;border:1px solid #f59e0b;border-radius:6px;">
            <tr><td style="padding:14px 16px;">
              <div style="font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9a3412;font-size:13px;margin-bottom:8px;">⚠ Important — please note</div>
              <ul style="margin:0;padding-left:20px;color:#1A1B1E;">
                <li style="margin:0 0 8px;">During any client-facing session or demo call, do <b>not</b> share your personal contact details (phone number, email ID, LinkedIn profile, current or past company names) with the client. <b>Any violation will result in strict penalties.</b></li>
                <li style="margin:0 0 8px;">If the client provides their contact information and requests additional work beyond the scheduled hours, you are required to report this <b>immediately</b> to your coordinator or session host.</li>
                <li style="margin:0;">Please be aware that <b>unauthorised extra work will not be compensated.</b> We appreciate your cooperation in maintaining professional standards.</li>
              </ul>
            </td></tr>
          </table>

          <p style="margin:18px 0 16px;">If you have any questions or need further assistance, please reach out to me directly.</p>

          <p style="margin:18px 0 4px;">Warm regards,</p>
          <p style="margin:0;font-weight:600;">${esc(senderName)}</p>
          <p style="margin:0;color:#6B6F78;font-size:13px;">MITS Consulting · Recruitment</p>
          <p style="margin:6px 0 0;">
            <a href="${website}" target="_blank" style="color:#1A6CDF;text-decoration:underline;font-size:13px;">${esc(website.replace(/^https?:\/\//, ''))}</a>
          </p>

          <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 0;"/>
          <p style="margin:12px 0 0;font-size:11px;color:#9aa0a6;line-height:1.5;">
            This email was sent by the MITS Consulting recruitment team regarding an upcoming demo engagement. If you did not expect this message, reply and let us know.
          </p>

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
