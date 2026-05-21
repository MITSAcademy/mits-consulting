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
  const handoverName = v.handoverTo || 'Mitali';
  const senderName = v.senderName || 'Roshni';
  const formatAmount = v.cycleAmount ? `${v.currency || 'USD'} ${v.cycleAmount.toLocaleString('en-IN')}` : '—';
  return [
    `Hi ${v.clientName},`,
    ``,
    `It's our absolute pleasure to formally confirm your engagement with MITS Consulting. Thank you for trusting us with your goals — we're excited to get started.`,
    ``,
    `── ENGAGEMENT DETAILS ──`,
    `Engagement type:    ${v.engagementType || '—'}`,
    `Payment model:      ${v.paymentModel || '—'}`,
    `Sessions per cycle: ${v.sessionsPerCycle ?? '—'}`,
    `Cycle amount:       ${formatAmount}`,
    `Cycle window:       ${v.cycleStart || '—'} → ${v.cycleEnd || '—'}`,
    v.preferredTimeIst ? `Preferred timing:   ${v.preferredTimeIst} IST` : '',
    v.trainerName ? `Primary trainer:    ${v.trainerName}` : '',
    ``,
    `── WHAT HAPPENS NEXT ──`,
    ``,
    `From this point, you'll be in the safe hands of our Customer Success team led by ${handoverName}. She'll personally reach out within the next working day to:`,
    `  • Introduce her team (Bhavneet, Kashish, Muskan).`,
    `  • Walk you through how daily sessions are coordinated and tracked.`,
    `  • Set up the feedback rhythm (daily WhatsApp updates · weekly calls · bi-weekly review).`,
    `  • Confirm the payment schedule so there are no surprises later.`,
    ``,
    `If you have any immediate questions before the handover call, please reply to this email — I'll be glad to help.`,
    ``,
    `Welcome aboard. Let's make this engagement a great one.`,
    ``,
    `Warm regards,`,
    senderName,
    `MITS Consulting · Sales`,
    `https://mitssolution.com`,
  ].filter(Boolean).join('\n');
}

export function buildEngagementLetterHtml(v: EngagementLetterVars): string {
  const handoverName = v.handoverTo || 'Mitali';
  const senderName = v.senderName || 'Roshni';
  const subject = ENGAGEMENT_LETTER_SUBJECT(v.clientName);
  const formatAmount = v.cycleAmount ? `${v.currency || 'USD'} ${v.cycleAmount.toLocaleString('en-IN')}` : '—';
  const row = (label: string, val?: string | number) => val == null || val === '' || val === '—'
    ? ''
    : `<tr><td style="padding:8px 12px;background:#f7f7f9;border:1px solid #e4e4e7;font-weight:600;width:40%;">${esc(label)}</td><td style="padding:8px 12px;border:1px solid #e4e4e7;">${esc(String(val))}</td></tr>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1A1B1E;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f4f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;padding:32px 36px;">
        <tr><td style="font-size:15px;line-height:1.7;color:#1A1B1E;">

          <p style="margin:0 0 16px;font-size:18px;font-weight:700;">Welcome aboard, ${esc(v.clientName)} 🎉</p>

          <p style="margin:0 0 14px;">
            It's our absolute pleasure to formally confirm your engagement with <b>MITS Consulting</b>. Thank you for trusting us with your goals — we're excited to get started.
          </p>

          <h3 style="margin:22px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;color:#6B6F78;">Engagement details</h3>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 16px;border-collapse:collapse;">
            ${row('Engagement type', v.engagementType)}
            ${row('Payment model', v.paymentModel)}
            ${row('Sessions per cycle', v.sessionsPerCycle)}
            ${row('Cycle amount', formatAmount)}
            ${row('Cycle window', v.cycleStart && v.cycleEnd ? `${v.cycleStart} → ${v.cycleEnd}` : '')}
            ${row('Preferred timing', v.preferredTimeIst ? `${v.preferredTimeIst} IST` : '')}
            ${row('Primary trainer', v.trainerName)}
          </table>

          <h3 style="margin:22px 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;color:#6B6F78;">What happens next</h3>
          <p style="margin:0 0 12px;">
            From this point, you'll be in the safe hands of our Customer Success team led by <b>${esc(handoverName)}</b>. She'll personally reach out within the next working day to:
          </p>
          <ul style="margin:0 0 16px;padding-left:20px;">
            <li style="margin:0 0 6px;">Introduce her team (Bhavneet, Kashish, Muskan).</li>
            <li style="margin:0 0 6px;">Walk you through how daily sessions are coordinated and tracked.</li>
            <li style="margin:0 0 6px;">Set up the feedback rhythm (<b>daily WhatsApp updates · weekly calls · bi-weekly review</b>).</li>
            <li style="margin:0;">Confirm the payment schedule so there are no surprises later.</li>
          </ul>

          <p style="margin:0 0 14px;">
            If you have any immediate questions before the handover call, please reply to this email — I'll be glad to help.
          </p>

          <p style="margin:0 0 14px;font-weight:600;">Welcome aboard. Let's make this engagement a great one.</p>

          <p style="margin:18px 0 4px;">Warm regards,</p>
          <p style="margin:0;font-weight:600;">${esc(senderName)}</p>
          <p style="margin:0;color:#6B6F78;font-size:13px;">MITS Consulting · Sales</p>

          <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 0;"/>
          <p style="margin:12px 0 0;font-size:11px;color:#9aa0a6;">
            ${v.senderEmail ? `Reply directly to <a href="mailto:${esc(v.senderEmail)}" style="color:#1A6CDF;">${esc(v.senderEmail)}</a> for any clarification.` : ''}
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
