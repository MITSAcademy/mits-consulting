/**
 * Client welcome email — branded HTML template mirroring the sample provided by Samita.
 * Sent to a new client by Samita (or Anjali on her behalf) once initial outreach completes.
 *
 * The template references:
 *   - Client Interest Document → Google Drive link
 *   - sales@mitssolution.com → mailto link
 *   - Samita's signature image (path served from /uploads/brand/samita-signature.png if present)
 *   - MITS logo and standard footer
 */

export const WELCOME_EMAIL_SUBJECT = 'Introducing MITS Solution - Your Partner for Success';

export const WELCOME_EMAIL_LINKS = {
  clientInterestDoc: 'https://drive.google.com/file/d/1NcZHkYtbmfojQMK48m5KmgvTC_CU2ofD/view?usp=drive_link',
  sales: 'mailto:sales@mitssolution.com',
  website: 'https://mitssolution.com',
  bookCalendar: 'https://mitssolution.com/book-demo',
};

/**
 * Builds the HTML welcome email. Pass clientName (and optionally firstName-only for greeting).
 * If senderName is omitted, defaults to "Samita Gupta".
 */
export function buildWelcomeEmailHtml(opts: {
  clientName?: string;
  senderName?: string;
  senderEmail?: string;
  senderPhone?: string;
  senderTitle?: string;
  signatureUrl?: string; // public URL to a signature image (PNG transparent ideal)
}): string {
  const greeting = opts.clientName ? `Hi ${escape(opts.clientName)},` : 'Hi Dear,';
  const senderName = opts.senderName || 'Samita Gupta';
  const senderEmail = opts.senderEmail || 'samita@mitssolution.com';
  const senderPhone = opts.senderPhone || '+91 73476 13659';
  const senderTitle = opts.senderTitle || '';
  const signatureUrl = opts.signatureUrl || '';
  const { clientInterestDoc, sales, website } = WELCOME_EMAIL_LINKS;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${escape(WELCOME_EMAIL_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1A1B1E;-webkit-text-size-adjust:100%;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f4f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;padding:32px 36px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <tr><td style="font-size:15px;line-height:1.7;color:#1A1B1E;">

          <h1 style="font-size:20px;margin:0 0 18px;color:#1A1B1E;font-weight:700;">Introducing MITS Solution - Your Partner for Success</h1>

          <p style="margin:0 0 16px;">${greeting}</p>

          <p style="margin:0 0 16px;">
            I hope this email finds you well. On behalf of our entire team, I extend a warm <b>welcome</b> to you and express our sincere <b>gratitude</b> for considering our services. We are thrilled to have the <b>opportunity</b> to work with you and support your <b>goals</b>.
          </p>

          <p style="margin:0 0 16px;">
            To provide you with <b>deeper insights</b> into our company, <b>services</b>, and the <b>value</b> we bring to our clients, I am excited to share our
            <a href="${clientInterestDoc}" target="_blank" style="color:#1A6CDF;text-decoration:underline;font-weight:600;">Client Interest Document</a>.
            This <b>comprehensive</b> guide covers <b>key features</b>, our <b>streamlined process</b>, <b>essential guidelines</b>, and <b>compelling reasons</b> why MITS Solution is the <b>perfect choice</b> for your needs.
          </p>

          <p style="margin:0 0 12px;">
            I would like to seize this opportunity to <b>introduce my team,</b> who will be instrumental in ensuring a smooth collaboration:
          </p>

          <p style="margin:0 0 12px;">
            1. <b style="color:#1A6CDF;">Anjali</b> (Client Coordinator): She will be the host of the <b>demo meeting</b> arranged and <b>excels</b> in <b>coordinating</b> and <b>scheduling</b> calls to address your <b>needs</b> promptly.
          </p>

          <p style="margin:0 0 16px;">
            2. <b>Samita</b> (Customer Success Manager): I will be your dedicated <b>Customer Success Manager</b>, I will oversee your satisfaction throughout our partnership. I will also be the point of escalation for <b>Level L1</b> issues and recurring payments.
          </p>

          <p style="margin:0 0 16px;">
            Once the <b>demo</b> is <b>successfully</b> done, someone from my
            <a href="${sales}" style="color:#1A6CDF;text-decoration:underline;font-weight:600;">sales</a>
            team will get in touch with you for further <b>payment</b> process.
          </p>

          <p style="margin:0 0 16px;">
            We believe that our <b>combined efforts</b> will lead to <b>mutual success</b>, and we are eager to <b>embark</b> on this <b>journey</b> with <b>you</b>.
          </p>

          <p style="margin:0 0 16px;">
            If you have any questions or need further assistance, please don't hesitate to reach out to <b>me.</b>
          </p>

          <p style="margin:0 0 16px;">
            Thank you once again for choosing MITS Solution as your partner. We look forward to a <b>fruitful</b> and <b>enriching</b> collaboration.
          </p>

          <p style="margin:0 0 4px;">--<br/>Regards,</p>

          ${signatureUrl
            ? `<p style="margin:8px 0 4px;"><img src="${signatureUrl}" alt="${escape(senderName)}" style="height:60px;display:block;"/></p>`
            : `<p style="margin:8px 0 4px;font-family:'Brush Script MT','Lucida Handwriting',cursive;font-size:28px;color:#1A1B1E;">${escape(senderName)}</p>`
          }
          ${senderTitle ? `<p style="margin:0 0 8px;font-size:13px;color:#6B6F78;">${escape(senderTitle)}</p>` : ''}

          <!-- Signature block -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 6px;">
            <tr>
              <td style="border-top:2px solid #1A1B1E;border-bottom:2px solid #1A1B1E;padding:10px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding-right:28px;vertical-align:middle;">
                      <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-weight:900;font-size:38px;color:#1A1B1E;line-height:1;letter-spacing:-1px;">MITS</div>
                    </td>
                    <td style="vertical-align:middle;font-size:13px;line-height:1.7;color:#1A1B1E;">
                      <div>✉&nbsp; <a href="mailto:${senderEmail}" style="color:#1A6CDF;text-decoration:underline;">${senderEmail}</a></div>
                      <div>☎&nbsp; <a href="tel:${senderPhone.replace(/\s/g, '')}" style="color:#1A1B1E;text-decoration:none;">${senderPhone}</a></div>
                      <div>🔗&nbsp; <a href="${website}" target="_blank" style="color:#1A1B1E;text-decoration:none;font-weight:600;">mitssolution.com</a></div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <p style="margin:16px 0 8px;font-size:13px;">
            <span style="color:#9C7B2C;">🏆</span>&nbsp;
            <a href="${website}" target="_blank" style="color:#9C7B2C;font-weight:700;font-style:italic;text-decoration:underline;">MITS Solution got awarded as one of the top Ed'Tech Firms in 2022</a>
          </p>

          <p style="margin:18px 0 0;font-size:11px;color:#9aa0a6;line-height:1.5;">
            <i>Well being Notice — Receiving this email outside of normal working hours? Managing work and personal responsibilities is unique for each of us. Please respond at the time that works best for you.</i>
          </p>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escape(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
