/**
 * Engagement letter — sent by Roshni when she closes the deal (SaleClosing → SaleWon).
 * Goes to the client to confirm the engagement; CCs Mitali so she's aware of the
 * incoming handover.
 *
 * Produces:
 *  - html (branded email)
 *  - plain text (used for WhatsApp + email text alternative)
 */

export interface EngagementLetterVars {
  clientName: string;
  engagementType?: string;       // 'Support' | 'Training' | 'TaskBased'
  paymentModel?: string;         // 'Weekly' | 'BiWeekly' | 'Monthly'
  sessionsPerCycle?: number;
  cycleAmount?: number;
  currency?: string;             // 'USD' | 'INR' | …
  cycleStart?: string;
  cycleEnd?: string;
  preferredTimeIst?: string;
  trainerName?: string;
  senderName?: string;           // Roshni
  senderEmail?: string;          // Roshni's gmail if configured
  handoverTo?: string;           // 'Mitali' by default
}

export const ENGAGEMENT_LETTER_SUBJECT = (clientName: string) =>
  `Engagement confirmed · Welcome aboard, ${clientName}`;

export function buildEngagementLetterText(v: EngagementLetterVars): string {
  const senderName = v.senderName || 'Roshni';
  return [
    `Hi ${v.clientName},`,
    ``,
    `Thank you for choosing MITS Solution. Please find the Engagement Letter attached to this email for your reference.`,
    ``,
    `Kindly go through the document at your convenience. If you have any questions or need any clarification, please feel free to reach out.`,
    ``,
    `We look forward to a great partnership!`,
    ``,
    `Warm regards,`,
    senderName,
    `MITS Solution`,
    `https://mitssolution.com`,
  ].filter(Boolean).join('\n');
}

export function buildEngagementLetterHtml(v: EngagementLetterVars): string {
  const senderName = v.senderName || 'Roshni';
  const subject = ENGAGEMENT_LETTER_SUBJECT(v.clientName);

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1A1B1E;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f4f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;padding:32px 36px;">
        <tr><td style="font-size:15px;line-height:1.7;color:#1A1B1E;">

          <p style="margin:0 0 20px;font-size:17px;font-weight:700;">Hi ${esc(v.clientName)},</p>

          <p style="margin:0 0 16px;">
            Thank you for choosing <b>MITS Solution</b>. Please find the <b>Engagement Letter</b> attached to this email for your reference.
          </p>

          <p style="margin:0 0 16px;">
            Kindly go through the document at your convenience. If you have any questions or need any clarification, please feel free to reach out.
          </p>

          <p style="margin:0 0 24px;">We look forward to a great partnership!</p>

          <p style="margin:18px 0 4px;">Warm regards,</p>
          <p style="margin:0;font-weight:600;">${esc(senderName)}</p>
          <p style="margin:0;color:#6B6F78;font-size:13px;">MITS Solution</p>

          <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 12px;"/>

          <!-- Signature block -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 8px;">
            <tr>
              <td style="padding-right:20px;vertical-align:middle;">
                <div style="font-family:'Helvetica Neue',Arial,sans-serif;font-weight:900;font-size:32px;color:#1A1B1E;line-height:1;letter-spacing:-1px;">MITS</div>
              </td>
              <td style="vertical-align:middle;font-size:13px;line-height:1.7;color:#1A1B1E;">
                <div>✉&nbsp; <a href="mailto:sales@mitssolution.com" style="color:#1A6CDF;text-decoration:underline;">sales@mitssolution.com</a></div>
                <div>🔗&nbsp; <a href="https://mitssolution.com" target="_blank" style="color:#1A1B1E;text-decoration:none;font-weight:600;">mitssolution.com</a></div>
              </td>
            </tr>
          </table>

          <p style="margin:12px 0 0;font-size:11px;color:#9aa0a6;line-height:1.5;">
            <i>Well being Notice — Receiving this email outside of normal working hours? Please respond at the time that works best for you.</i>
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
