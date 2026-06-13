import 'dotenv/config';
import nodemailer from 'nodemailer';

async function main() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP_USER / SMTP_PASS not configured');
  }

  const tx = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
  <div style="background:#18181b;padding:24px 32px;border-radius:12px 12px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Welcome to MITS Consulting Hub</h1>
  </div>
  <div style="background:#fafafa;padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px;">
    <p style="margin:0 0 16px;">Hi Mitali,</p>
    <p style="margin:0 0 16px;">Your manager account on the <strong>MITS Consulting Hub</strong> is set up and ready. Here's everything you need.</p>

    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:20px 24px;margin:24px 0;">
      <p style="margin:0 0 10px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.06em;font-weight:600;">Login details</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr>
          <td style="padding:6px 0;color:#555;width:80px;vertical-align:top;">URL</td>
          <td><a href="https://mits-consulting.onrender.com" style="color:#7c3aed;font-weight:600;">mits-consulting.onrender.com</a></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#555;vertical-align:top;">Email</td>
          <td style="font-weight:500;">mitagg@mitssolution.com</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#555;vertical-align:top;">Sign in</td>
          <td>Click <strong>Sign in with Google</strong> on the login page and choose your <strong>mitagg@mitssolution.com</strong> account &mdash; no separate password needed.</td>
        </tr>
      </table>
    </div>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 28px;">
      <p style="margin:0;font-size:14px;"><strong>First time?</strong> Go to the URL above, click <em>Sign in with Google</em>, and pick your mitssolution.com account. You will be logged in straight away.</p>
    </div>

    <p style="margin:0 0 14px;font-weight:600;font-size:15px;">What you have access to</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;line-height:1.6;">
      <tr style="background:#f4f4f5;">
        <td style="padding:9px 12px;font-weight:600;white-space:nowrap;">Payment follow-up</td>
        <td style="padding:9px 12px;color:#555;">Chase outstanding payments from your team's active clients</td>
      </tr>
      <tr>
        <td style="padding:9px 12px;font-weight:600;">Clients</td>
        <td style="padding:9px 12px;color:#555;">View all active clients under your team (Bhavneet, Kashish, Muskan)</td>
      </tr>
      <tr style="background:#f4f4f5;">
        <td style="padding:9px 12px;font-weight:600;white-space:nowrap;">Payout batches</td>
        <td style="padding:9px 12px;color:#555;">Review and approve trainer payout batches submitted by Bhavneet</td>
      </tr>
      <tr>
        <td style="padding:9px 12px;font-weight:600;white-space:nowrap;">Team dashboard</td>
        <td style="padding:9px 12px;color:#555;">See workload, session counts, and overdue renewals across your coordinators</td>
      </tr>
      <tr style="background:#f4f4f5;">
        <td style="padding:9px 12px;font-weight:600;">Feedback</td>
        <td style="padding:9px 12px;color:#555;">Review client session feedback for your team</td>
      </tr>
      <tr>
        <td style="padding:9px 12px;font-weight:600;white-space:nowrap;">Day-to-day tools</td>
        <td style="padding:9px 12px;color:#555;">My sessions, Issues, Tasks, Daily report, My calendar</td>
      </tr>
    </table>

    <p style="margin:28px 0 6px;font-size:14px;color:#555;">Questions or anything not working? Message Vaibhav directly.</p>
    <p style="margin:0;color:#999;font-size:13px;">— MITS Consulting Hub</p>
  </div>
</div>
`;

  const text = `Hi Mitali,

Your manager account on MITS Consulting Hub is ready.

HOW TO LOG IN
  URL:    https://mits-consulting.onrender.com
  Email:  mitagg@mitssolution.com
  Method: Click "Sign in with Google" and choose mitagg@mitssolution.com
          No separate password needed.

YOUR ACCESS
  Payment follow-up  — Chase outstanding payments from your team's active clients
  Clients            — All active clients under your team (Bhavneet, Kashish, Muskan)
  Payout batches     — Review and approve trainer payout batches submitted by Bhavneet
  Team dashboard     — Workload, session counts, overdue renewals across coordinators
  Feedback           — Client session feedback for your team
  Day-to-day tools   — My sessions, Issues, Tasks, Daily report, My calendar

Questions or anything not working? Message Vaibhav.

— MITS Consulting Hub`;

  const info = await tx.sendMail({
    from: process.env.SMTP_FROM || `"MITS Consulting Portal" <${process.env.SMTP_USER}>`,
    to: 'mitagg@mitssolution.com',
    subject: 'Welcome to MITS Consulting Hub — your account is ready',
    html,
    text,
  });

  console.log('Welcome email sent:', info.messageId);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
