/**
 * Handover welcome — sent by Mitali after Roshni hands off the client.
 * Subject: "Welcome Aboard [Name] -- MITS Solution"
 * Matches the email screenshot: playbook link, service agreement, team intro.
 *
 * Dual-channel: HTML email + plain text (also used for WhatsApp).
 */

export interface HandoverVars {
  clientName: string;
  trainerName?: string;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  paymentModel?: string;
  cycleEnd?: string;
  playbookUrl?: string;
  agreementUrl?: string;
}

const PLAYBOOK_URL = 'https://drive.google.com/file/d/1MITS_ClientPlaybook/view';
const WEBSITE = 'https://mitssolution.com';
const MITALI_EMAIL = 'mitagg@mitssolution.com';
const MITALI_PHONE = '+91 97795 30773';
const WELCOME_CC = 'mc.welcome@mitssolution.com';

export const HANDOVER_SUBJECT = (clientName: string) =>
  `Welcome Aboard ${clientName} -- MITS Solution`;

export function buildHandoverText(v: HandoverVars): string {
  const senderName = v.senderName || 'Mitali';
  const playbookUrl = v.playbookUrl || PLAYBOOK_URL;
  return [
    `Dear ${v.clientName},`,
    ``,
    `We hope this email finds you well. On behalf of the entire team at MITS Solution, we are thrilled to welcome you aboard!! We appreciate your trust in us and are committed to ensuring your experience with MITS is exceptional.`,
    ``,
    `To help you get started and better understand our processes, services, and how we work together, we have prepared a comprehensive guide – the MITS Client Playbook. This playbook serves as a valuable resource that outlines all the essential information you need to know about our company and how we can support your goals.`,
    `MITS Client Playbook: ${playbookUrl}`,
    ``,
    `Myself (${senderName}) would like to seize this opportunity to introduce my team, who will also be members of the group dedicated to providing you with our services.`,
    ``,
    `1) Kashish (Client Coordinator) - She will closely coordinate and schedule calls to cater to your service requirements effectively.`,
    ``,
    `2) Bhavneet (Team Leader) - Should any issues arise, Team Lead will be readily available to assist you with prompt resolutions like Resource change, Timing issues, etc, and Level 1 point of escalation. Also Bhavneet will reach you for very regular verbal feedback as well. [Escalation Response ETA ~24 hrs]`,
    ``,
    `3) ${senderName} (Customer Success Manager) - I will be your dedicated Customer Success Manager, overseeing and ensuring your satisfaction throughout our collaboration. I will be the Level L2 point of escalation and a further point of contact for recurring Payments. [Escalation Response ETA ~48 hrs]`,
    ``,
    `To get the services started, you need to sign the agreement containing all the terms and conditions related to the services. Please take the time to review the document thoroughly and sign it to signify your agreement.`,
    ``,
    `P.S - Please find the documents links below:-`,
    `1) Client Playbook: ${playbookUrl}`,
    `2) Service Agreement: ${v.agreementUrl || 'you might be receiving this document from sign easy soon.'}`,
    ``,
    `--`,
    `Regards,`,
    senderName,
    `mitagg@mitssolution.com`,
    `+91 97795 30773`,
    `mitssolution.com`,
  ].filter(line => line !== undefined).join('\n');
}

export function buildHandoverHtml(v: HandoverVars): string {
  const senderName = v.senderName || 'Mitali';
  const senderEmail = v.senderEmail || MITALI_EMAIL;
  const senderPhone = v.senderPhone || MITALI_PHONE;
  const subject = HANDOVER_SUBJECT(v.clientName);
  const playbookUrl = v.playbookUrl || PLAYBOOK_URL;
  const agreementNote = v.agreementUrl
    ? `<a href="${esc(v.agreementUrl)}" target="_blank" style="color:#1A6CDF;text-decoration:underline;">Service Agreement</a>`
    : `<span style="color:#9C27B0;">you might be receiving this document from sign easy soon.</span>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1A1B1E;font-size:15px;line-height:1.7;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f4f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;padding:32px 36px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td style="font-size:15px;line-height:1.7;color:#1A1B1E;">

          <p style="margin:0 0 16px;">Dear ${esc(v.clientName)},</p>

          <p style="margin:0 0 16px;">
            We hope this email finds you well. On behalf of the entire team at <b>MITS Solution</b>, we are thrilled to <b>welcome you aboard</b>!! We appreciate your trust in us and are committed to ensuring your experience with MITS is exceptional.
          </p>

          <p style="margin:0 0 16px;">
            To help you get started and better understand <b>our processes, services</b>, and <b>how we work together</b>, we have prepared a comprehensive guide –&nbsp;the&nbsp;<a href="${esc(playbookUrl)}" target="_blank" style="color:#1A6CDF;text-decoration:underline;font-weight:600;">MITS Client Playbook</a>. This playbook serves as a <b>valuable resource</b> that outlines all the <b>essential information</b> you need to know about our company and how we can <b>support your goals</b>.
          </p>

          <p style="margin:0 0 16px;">
            Myself (${esc(senderName)}) would like to seize this opportunity to <b>introduce my team</b>, who will also be members of the <b>group</b> dedicated to providing you with our services.
          </p>

          <p style="margin:0 0 12px;">
            <b>1) Kashish (Client Coordinator)</b> -&nbsp; She will closely coordinate and <b>schedule calls</b> to cater to your service requirements effectively.
          </p>

          <p style="margin:0 0 12px;">
            <b>2) <a href="mailto:bhavneet@mitssolution.com" style="color:#1A6CDF;text-decoration:underline;">Bhavneet</a> (Team Leader)</b> -&nbsp; Should any issues arise, Team Lead will be readily available to assist you with <b>prompt resolutions</b> like Resource change, Timing issues, etc, and <b>Level 1</b> point of escalation. Also Bhavneet will reach you for very regular verbal feedback as well. [Escalation Response ETA ~24 hrs]
          </p>

          <p style="margin:0 0 16px;">
            <b>3) ${esc(senderName)} (Customer Success Manager)</b> -&nbsp; I will be your dedicated <b>Customer Success Manager</b>, overseeing and ensuring your satisfaction throughout our collaboration. I will be the <b>Level L2</b> point of escalation and a further point of contact for recurring <b>Payments</b>. [Escalation Response ETA ~48 hrs]
          </p>

          <p style="margin:0 0 16px;">
            To get the <b>services started</b>, you need to sign the <a href="#" style="color:#1A6CDF;text-decoration:underline;">agreement</a> containing all the <b>terms and conditions</b> related to the services. Please take the time to <b>review the document</b> thoroughly and <b>sign it</b> to signify your agreement.
          </p>

          <p style="margin:0 0 6px;"><b>P.S - Please find the documents links below:-</b></p>
          <p style="margin:0 0 4px;">1) Client Playbook:-&nbsp;<a href="${esc(playbookUrl)}" target="_blank" style="color:#1A6CDF;text-decoration:underline;font-weight:600;">MITS Client Playbook</a></p>
          <p style="margin:0 0 20px;">2) Service Agreement:-&nbsp; ${agreementNote}</p>

          <p style="margin:0 0 4px;">--<br/>Regards,</p>

          <p style="margin:8px 0 4px;font-family:'Brush Script MT','Lucida Handwriting',cursive;font-size:32px;color:#1A1B1E;">${esc(senderName)} Aggarwal</p>

          <!-- Signature block -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:12px 0 6px;">
            <tr>
              <td style="border-top:2px solid #1A1B1E;border-bottom:2px solid #1A1B1E;padding:10px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding-right:28px;vertical-align:middle;">
                      <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-weight:900;font-size:38px;color:#1A1B1E;line-height:1;letter-spacing:-1px;">MITS</div>
                    </td>
                    <td style="vertical-align:middle;font-size:13px;line-height:1.7;color:#1A1B1E;">
                      <div>✉&nbsp;<a href="mailto:${esc(senderEmail)}" style="color:#1A6CDF;text-decoration:underline;">${esc(senderEmail)}</a></div>
                      <div>☎&nbsp;<a href="tel:${senderPhone.replace(/\s/g, '')}" style="color:#1A1B1E;text-decoration:none;">${esc(senderPhone)}</a></div>
                      <div>🔗&nbsp;<a href="${WEBSITE}" target="_blank" style="color:#1A1B1E;text-decoration:none;font-weight:600;">mitssolution.com</a></div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Social icons row -->
          <p style="margin:12px 0 6px;font-size:18px;letter-spacing:4px;">
            <a href="https://facebook.com/mitssolution" target="_blank" style="text-decoration:none;color:#1A1B1E;">f</a>&nbsp;
            𝕏&nbsp;
            <a href="https://linkedin.com/company/mitssolution" target="_blank" style="text-decoration:none;color:#1A1B1E;">in</a>&nbsp;
            📸&nbsp;▶
          </p>

          <p style="margin:8px 0 0;font-size:13px;">
            <span style="color:#9C7B2C;">🏆</span>&nbsp;
            <a href="${WEBSITE}" target="_blank" style="color:#9C7B2C;font-weight:700;font-style:italic;text-decoration:underline;">MITS Solution got awarded as one of the top Ed'Tech Firms in 2022</a>
          </p>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** WhatsApp text for the handover welcome — concise version of the email. */
export function buildHandoverWhatsAppText(v: HandoverVars): string {
  const senderName = v.senderName || 'Mitali';
  const playbookUrl = v.playbookUrl || PLAYBOOK_URL;
  return [
    `Dear ${v.clientName},`,
    ``,
    `Welcome aboard MITS Solution! 🎉`,
    ``,
    `I'm ${senderName}, your Customer Success Manager. Thrilled to have you with us!`,
    ``,
    `Here's your team:`,
    `• Kashish – Client Coordinator (schedules your sessions)`,
    `• Bhavneet – Team Leader (Level 1 escalation, ~24 hr response)`,
    `• ${senderName} – Customer Success Manager (Level 2 escalation, payments, ~48 hr response)`,
    v.trainerName ? `• ${v.trainerName} – Your Primary Trainer` : '',
    ``,
    `📖 MITS Client Playbook: ${playbookUrl}`,
    ``,
    `Please review and sign the service agreement — you'll receive it via SignEasy shortly.`,
    ``,
    `Feel free to reach out anytime. Looking forward to a great partnership! 🙏`,
    `– ${senderName}`,
  ].filter(Boolean).join('\n');
}

export function buildHandoverWelcomeCc(): string {
  return WELCOME_CC;
}

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
