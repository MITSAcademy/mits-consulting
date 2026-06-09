// One-off: email Anjali + Taran about the Internal-Search → Matrix fix.
// Reads SMTP_* from backend/.env via dotenv.
import 'dotenv/config';
import nodemailer from 'nodemailer';

const to = ['anjali@mitssolution.com', 'taran@mitssolution.com'];
const cc = ['vaibhav.aggarwal@mitssolution.com'];

const subject = '[MITS Hub] Fix shipped — Skill Matrix now works after Internal Search';

const text = `Hi Anjali, Hi Taran,

Quick update on the issue Anjali flagged this morning — the Internal Search → Skill Matrix flow is now fixed and live in production.

WHAT WAS BROKEN
When you picked a trainer through Internal Search, the Mark as Sent / Send Email / Send WhatsApp buttons stayed inactive. The system was only looking at trainers proposed by Aman / Kanchan; Internal-Search picks weren't being treated as matrix candidates.

WHAT'S FIXED
1. Matrix now auto-populates from the trainer you picked. Open "Send skill matrix" and you'll see the candidate, skills, experience and demo date/time pre-filled. Send Email and Send WhatsApp work end-to-end.

2. "Mark as sent" works in all cases. Even if the preview is empty (rare edge case), you can still mark sent — useful when you've shared the matrix manually outside the portal.

3. New "Skip matrix · Schedule demo" button on the Trainer Matched stage. Use this when you've already shared the profile externally, or when the matrix step isn't needed for this client. It unlocks Schedule Demo immediately and lets you record an optional note.

HOW TO TEST (please verify on your next live client)
- Open a client at Trainer Matched stage that was sourced through Internal Search
- Click "Send skill matrix" → confirm the preview now shows the trainer
- Click Send Email (and Send WhatsApp if phone is on file) → confirm both go through
- On a fresh test client, also try the new "Skip matrix · Schedule demo" path

Please do a hard refresh (Cmd+Shift+R / Ctrl+Shift+R) once before testing — the deploy is live but old tabs may be cached.

Let me know if anything still feels stuck. Happy to jump on a quick call.

Thanks,
Vaibhav
`;

const html = `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.55;max-width:640px;margin:0 auto;">
<p>Hi Anjali, Hi Taran,</p>

<p>Quick update on the issue Anjali flagged this morning — <strong>the Internal Search → Skill Matrix flow is now fixed and live in production.</strong></p>

<h3 style="color:#b91c1c;font-size:15px;margin:18px 0 6px;">What was broken</h3>
<p>When you picked a trainer through <em>Internal Search</em>, the <strong>Mark as Sent / Send Email / Send WhatsApp</strong> buttons stayed inactive because the system was only looking at trainers proposed by Aman / Kanchan. Internal-Search picks weren't being treated as candidates for the matrix.</p>

<h3 style="color:#047857;font-size:15px;margin:18px 0 6px;">What's fixed</h3>
<ol>
  <li><strong>Matrix now auto-populates from the trainer you picked.</strong> Open <em>Send skill matrix</em> and you'll see the candidate, skills, experience, and demo date/time pre-filled. Send Email and Send WhatsApp work end-to-end.</li>
  <li><strong>"Mark as sent" works in all cases.</strong> Even if the preview is empty (rare edge case), you can still mark sent — useful when you've shared the matrix manually outside the portal.</li>
  <li><strong>New "Skip matrix · Schedule demo" button</strong> on the <em>Trainer Matched</em> stage. Use this when you've already shared the profile externally, or when the matrix step isn't needed for this client. It unlocks Schedule Demo immediately, optionally with a note.</li>
</ol>

<h3 style="color:#1d4ed8;font-size:15px;margin:18px 0 6px;">How to test</h3>
<ul>
  <li>Open a client at <em>Trainer Matched</em> stage that was sourced through Internal Search</li>
  <li>Click <strong>Send skill matrix</strong> → confirm the preview now shows the trainer</li>
  <li>Click <strong>Send Email</strong> (and <strong>Send WhatsApp</strong> if phone is on file) → confirm both go through</li>
  <li>On a fresh test client, also try the new <strong>Skip matrix · Schedule demo</strong> path</li>
</ul>

<p style="background:#fef3c7;padding:10px 12px;border-left:3px solid #f59e0b;border-radius:4px;">⚠️ Please do a <strong>hard refresh</strong> (Cmd+Shift+R / Ctrl+Shift+R) once before testing — the deploy is live but old tabs may be cached.</p>

<p>Let me know if anything still feels stuck. Happy to jump on a quick call if needed.</p>

<p>Thanks,<br/>Vaibhav</p>
</body></html>`;

const host = process.env.SMTP_HOST || 'smtp.gmail.com';
const port = Number(process.env.SMTP_PORT || 465);
const secure = String(process.env.SMTP_SECURE ?? 'true').toLowerCase() !== 'false';
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM || user;

if (!user || !pass) {
  console.error('SMTP_USER or SMTP_PASS missing in backend/.env');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000,
});

try {
  const info = await transporter.sendMail({
    from,
    to: to.join(', '),
    cc: cc.join(', '),
    subject,
    text,
    html,
  });
  console.log('Sent. messageId=', info.messageId);
  console.log('accepted=', info.accepted);
  console.log('rejected=', info.rejected);
} catch (err) {
  console.error('Send failed:', err.message);
  process.exit(2);
}
