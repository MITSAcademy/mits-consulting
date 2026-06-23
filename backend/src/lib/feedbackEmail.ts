/**
 * Feedback email — sent by Mitali to collect client feedback via survey form.
 * Subject: "We value your feedback - MITS Solution"
 * Matches the email screenshot with Client Survey Form link.
 */

const SURVEY_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSep1UNX-Cx3USsytUO2NvwtsQdanCYOlFANLzeNS442hx5TQQ/viewform';
const WEBSITE = 'https://mitssolution.com';
const MITALI_EMAIL = 'mitagg@mitssolution.com';
const MITALI_PHONE = '+91 97795 30773';

export const FEEDBACK_EMAIL_SUBJECT = 'We value your feedback - MITS Solution';

export function buildFeedbackEmailText(opts: {
  clientName?: string;
  senderName?: string;
  surveyUrl?: string;
}): string {
  const name = opts.clientName || 'there';
  const senderName = opts.senderName || 'Mitali';
  const surveyUrl = opts.surveyUrl || SURVEY_URL;
  return [
    `Dear ${name},`,
    ``,
    `I hope this email finds you well. At MITS, we continuously strive to enhance our services and ensure the utmost satisfaction for our valued clients like you.`,
    ``,
    `Your feedback is vital to us, and we would be incredibly grateful if you could take a few minutes to complete our Client Survey Form. This form has been designed to gather your valuable insights and opinions on your experience with our company.`,
    ``,
    `Client Survey Form: ${surveyUrl}`,
    ``,
    `We genuinely value your honest feedback, as it will help us identify areas of improvement and tailor our services to better meet your needs.`,
    ``,
    `Rest assured that all responses will remain confidential, and your participation in the survey is entirely voluntary.`,
    ``,
    `--`,
    `Regards,`,
    senderName,
  ].join('\n');
}

export function buildFeedbackEmailHtml(opts: {
  clientName?: string;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  surveyUrl?: string;
  signatureUrl?: string;
}): string {
  const name = opts.clientName || 'there';
  const senderName = opts.senderName || 'Mitali';
  const senderEmail = opts.senderEmail || MITALI_EMAIL;
  const senderPhone = opts.senderPhone || MITALI_PHONE;
  const surveyUrl = opts.surveyUrl || SURVEY_URL;
  const signatureUrl = opts.signatureUrl || '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(FEEDBACK_EMAIL_SUBJECT)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1A1B1E;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f4f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;padding:32px 36px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td style="font-size:15px;line-height:1.7;color:#1A1B1E;">

          <p style="margin:0 0 16px;">Dear ${esc(name)},</p>

          <p style="margin:0 0 16px;">
            I hope this email finds you well. At MITS, we continuously strive to enhance our services and ensure the utmost satisfaction for our <b>valued clients</b> like you.
          </p>

          <p style="margin:0 0 16px;">
            Your <b>feedback</b> is vital to us, and we would be incredibly grateful if you could take a few minutes to complete our
            <a href="${esc(surveyUrl)}" target="_blank" style="color:#1A6CDF;text-decoration:underline;font-weight:600;">Client Survey Form</a>.
            This form has been designed to gather your valuable insights and opinions on your experience with our company.
          </p>

          <p style="margin:0 0 16px;">
            We genuinely <b>value</b> your <b>honest feedback</b>, as it will help us identify areas of <b>improvement</b> and tailor our services to <b>better meet</b> your needs.
          </p>

          <p style="margin:0 0 24px;">
            Rest assured that all <b>responses</b> will remain <b>confidential</b>, and your participation in the <b>survey</b> is entirely <b>voluntary</b>.
          </p>

          <p style="margin:0 0 4px;">--<br/>Regards,</p>

          ${signatureUrl
            ? `<p style="margin:8px 0 4px;"><img src="${esc(signatureUrl)}" alt="${esc(senderName)}" style="height:60px;display:block;"/></p>`
            : `<p style="margin:8px 0 4px;font-family:'Brush Script MT','Lucida Handwriting',cursive;font-size:32px;color:#1A1B1E;">${esc(senderName)} Aggarwal</p>`
          }

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

          <!-- Social icons -->
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

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
