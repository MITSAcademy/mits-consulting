/**
 * Notifies the sales inbox whenever a new website enquiry comes in via
 * POST /api/enquiries (mitsedge.com webhook). System-initiated — sent
 * from the shared MITS Hub SMTP account, not a staff member's Gmail.
 */

import { sendEmail } from './mailer';

const SALES_EMAIL = process.env.ENQUIRY_NOTIFY_EMAIL || 'mc.sales@mitssolution.com';
const PORTAL_URL = process.env.PORTAL_URL || 'https://hub.mitssolution.com';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHtml(enquiry: { name: string; email: string | null; phone: string | null; message: string | null; course: string | null }): string {
  const row = (label: string, value: string | null) => value
    ? `<tr><td style="padding:8px 12px;color:#666;font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:8px 12px;color:#1a1a1a;font-size:14px;">${escapeHtml(value)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,'Helvetica Neue',sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">

      <tr><td style="background:#1a1a2e;padding:20px 32px;">
        <span style="color:#ffffff;font-size:17px;font-weight:700;">New Website Enquiry</span>
      </td></tr>

      <tr><td style="padding:28px 32px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;">
          ${row('Name', enquiry.name)}
          ${row('Email', enquiry.email)}
          ${row('Phone', enquiry.phone)}
          ${row('Course', enquiry.course)}
          ${row('Message', enquiry.message)}
        </table>
      </td></tr>

      <tr><td style="padding:20px 32px 4px;">
        <p style="margin:0 0 8px;color:#1a1a1a;font-size:14px;font-weight:700;">Next steps</p>
        <ol style="margin:0;padding-left:18px;color:#333;font-size:14px;line-height:1.8;">
          <li>Call/WhatsApp the lead within 24 hours.</li>
          <li>Log the enquiry outcome and schedule a demo if interested.</li>
          <li>Update status in the portal enquiry inbox.</li>
        </ol>
      </td></tr>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding:20px 0 28px;">
          <a href="${PORTAL_URL}/demo-intake" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px;">Open enquiry inbox</a>
        </td></tr>
      </table>

    </table>
  </td></tr>
</table>
</body></html>`;
}

export async function sendEnquiryNotification(enquiry: {
  name: string; email: string | null; phone: string | null; message: string | null; course: string | null;
}): Promise<void> {
  try {
    await sendEmail({
      to: SALES_EMAIL,
      subject: `New website enquiry — ${enquiry.name}${enquiry.course ? ` (${enquiry.course})` : ''}`,
      body: `New website enquiry\n\nName: ${enquiry.name}\nEmail: ${enquiry.email || '—'}\nPhone: ${enquiry.phone || '—'}\nCourse: ${enquiry.course || '—'}\nMessage: ${enquiry.message || '—'}\n\nNext steps: call/WhatsApp within 24 hours, log the outcome, schedule a demo if interested.`,
      htmlBody: buildHtml(enquiry),
    });
  } catch (e) {
    console.error('[enquiry-email] Failed to send notification:', e);
  }
}
