import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { initScheduler } from './lib/scheduler';
import { sendPaymentFollowUpReport } from './lib/paymentFollowUpReport';
import { requireAuth, requireRole } from './lib/auth';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { clientsRouter } from './routes/clients';
import { trainersRouter } from './routes/trainers';
import { trainerLeadsRouter } from './routes/trainerLeads';
import { partnersRouter } from './routes/partners';
import { sourcingRouter } from './routes/sourcing';
import { paymentsRouter } from './routes/payments';
import { tasksRouter } from './routes/tasks';
import { notificationsRouter } from './routes/notifications';
import { sessionLogsRouter } from './routes/sessionLogs';
import { leverageRouter } from './routes/leverage';
import { accountsRouter } from './routes/accounts';
import { feedbackRouter } from './routes/feedback';
import { payoutsRouter } from './routes/payouts';
import { banksRouter } from './routes/banks';
import { auditRouter } from './routes/audit';
import { reportsRouter } from './routes/reports';
import { templatesRouter } from './routes/templates';
import { sourcesRouter } from './routes/sources';
import { flagsRouter } from './routes/flags';
import { rawLeadsRouter } from './routes/rawLeads';
import { editRequestsRouter } from './routes/editRequests';
import { metricsRouter } from './routes/metrics';
import { uploadsRouter, UPLOAD_DIR } from './routes/uploads';
import { messagesRouter } from './routes/messages';
import { calendarRouter } from './routes/calendar';
import { oauthRouter } from './routes/oauth';
import { aiRouter } from './routes/ai';
import { followUpPaymentsRouter } from './routes/followUpPayments';
import { commentsRouter } from './routes/comments';
import { callLogsRouter } from './routes/callLogs';
import { demoTeamReportRouter } from './routes/demoTeamReport';
import { featuresRouter } from './routes/features';
import { regularTrainingsRouter } from './routes/regularTrainings';
import { issueTrackerRouter } from './routes/issueTracker';
import { freelanceRequirementsRouter } from './routes/freelanceRequirements';
import { meetingLinksRouter } from './routes/meetingLinks';
import { coordinatorDashboardRouter } from './routes/coordinatorDashboard';
import { briefingRouter } from './routes/briefing';
import { timesheetRouter } from './routes/timesheet';
import { retrospectiveRouter } from './routes/retrospective';
import { rolePermissionsRouter } from './routes/rolePermissions';
import { seedRouter } from './routes/seed';
import { searchRouter } from './routes/search';
import { escalationsRouter } from './routes/escalations';
import { prisma } from './lib/prisma';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

app.set('trust proxy', 1); // Render sits behind a proxy — needed for rate-limit IP detection
app.use(compression());  // gzip all JSON responses — cuts payload size ~60-70%
app.use(
  cors({
    origin: CLIENT_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Rate limiting — prevent brute force + abuse
// Auth endpoints: tight limit (5 req/min per IP)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a minute.' },
  skip: () => process.env.NODE_ENV !== 'production',
});

// General API: 300 req/min per IP (generous for active usage, blocks scraping)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
  skip: () => process.env.NODE_ENV !== 'production',
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: true, ts: Date.now() });
  } catch (err: any) {
    res.status(503).json({ ok: false, db: false, error: err?.message ?? 'DB unreachable' });
  }
});

// Serve uploaded files (audio recordings, screenshots, skill matrices).
// In production, replace with S3/Cloudinary + signed URLs.
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/trainers', trainersRouter);
app.use('/api/trainer-leads', trainerLeadsRouter);
app.use('/api/partners', partnersRouter);
app.use('/api/sourcing', sourcingRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/session-logs', sessionLogsRouter);
app.use('/api/leverage', leverageRouter);
app.use('/api/accounts-queue', accountsRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/payouts', payoutsRouter);
app.use('/api/banks', banksRouter);
app.use('/api/audit', auditRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/flags', flagsRouter);
app.use('/api/raw-leads', rawLeadsRouter);
app.use('/api/edit-requests', editRequestsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/oauth', oauthRouter);
app.use('/api/ai', aiRouter);
app.use('/api/follow-up-payments', followUpPaymentsRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/call-logs', callLogsRouter);
app.use('/api/reports/demo-team', demoTeamReportRouter);
app.use('/api/features', featuresRouter);
app.use('/api/regular-trainings', regularTrainingsRouter);
app.use('/api/issue-tracker', issueTrackerRouter);
app.use('/api/freelance-requirements', freelanceRequirementsRouter);
app.use('/api/meeting-links', meetingLinksRouter);
app.use('/api/coordinator-dashboard', coordinatorDashboardRouter);
app.use('/api/briefing', briefingRouter);
app.use('/api/timesheet', timesheetRouter);
app.use('/api/retrospective', retrospectiveRouter);
app.use('/api/role-permissions', rolePermissionsRouter);
app.use('/api/seed', seedRouter);
app.use('/api/search', searchRouter);
app.use('/api/escalations', escalationsRouter);

// One-time: send welcome emails to Areena and Mohini from Vaibhav
app.post('/api/internal/send-welcome-staff', requireAuth, requireRole('founder'), async (_req, res) => {
  try {
    const { prisma: db } = await import('./lib/prisma');
    const { safeBuildFromUser, sendEmail } = await import('./lib/mailer');
    const vaibhav = await db.user.findUnique({ where: { id: 'u-vaibhav' }, select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true } });
    if (!vaibhav?.gmailAddress || !vaibhav?.smtpAppPassword) return res.status(500).json({ error: 'Vaibhav SMTP not configured' });
    const fromUser = safeBuildFromUser(vaibhav);
    if (!fromUser) return res.status(500).json({ error: 'Could not build fromUser' });

    const recipients = [
      { name: 'Areena', email: 'areena.beri@mitssolution.com', role: 'full access (same as Vaibhav)', note: 'You have been given founder-level access to manage operations on my behalf.' },
      { name: 'Mohini', email: 'mohini.behal@mitssolution.com', role: 'Sales (same as Roshni)', note: 'You have been set up in the Sales Closer role — same access as Roshni — to manage the sales pipeline and follow-ups.' },
    ];

    const results: any[] = [];
    for (const r of recipients) {
      const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
      <tr><td style="background:#1A1B1E;padding:28px 36px;">
        <div style="font-size:20px;font-weight:700;color:#FBBF24;letter-spacing:0.5px;">MITS Consulting Hub</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:4px;">by MITS Solution</div>
      </td></tr>
      <tr><td style="padding:36px;">
        <p style="font-size:16px;font-weight:600;color:#1A1B1E;margin:0 0 16px;">Welcome aboard, ${r.name}! 👋</p>
        <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
          I'm excited to welcome you to the <strong>MITS Consulting Hub</strong> — our internal operations platform where our entire team manages clients, sessions, payments, trainers, and more.
        </p>
        <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
          ${r.note}
        </p>
        <table cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:20px 0;width:100%;">
          <tr><td>
            <div style="font-size:12px;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Your access details</div>
            <div style="font-size:14px;color:#111827;margin-bottom:6px;"><strong>Hub URL:</strong> <a href="https://mits-frontend.onrender.com" style="color:#2563eb;">mits-frontend.onrender.com</a></div>
            <div style="font-size:14px;color:#111827;margin-bottom:6px;"><strong>Login:</strong> Use your <strong>@mitssolution.com</strong> Google account (SSO — no password needed)</div>
            <div style="font-size:14px;color:#111827;"><strong>Role:</strong> ${r.role}</div>
          </td></tr>
        </table>
        <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
          Simply go to the Hub, click <strong>"Sign in with Google"</strong>, and you'll be in. If you face any issues logging in, reply to this email and I'll sort it out.
        </p>
        <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 24px;">
          Looking forward to working with you!
        </p>
        <div style="font-size:14px;color:#1A1B1E;font-weight:600;">Vaibhav Aggarwal</div>
        <div style="font-size:12px;color:#6b7280;">Founder, MITS Solution</div>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:16px 36px;border-top:1px solid #e5e7eb;">
        <div style="font-size:11px;color:#9ca3af;text-align:center;">MITS Solution · Internal staff communication · Not for external distribution</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

      await sendEmail({
        fromUser,
        to: r.email,
        subject: `Welcome to MITS Consulting Hub, ${r.name}! 🎉`,
        body: `Welcome to MITS Consulting Hub, ${r.name}!`,
        htmlBody: html,
      });
      results.push({ to: r.email, ok: true });
    }

    res.json({ ok: true, results });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// Founder-only: create missing RegularTraining stubs for all Active/LeverageGranted clients that don't have one
app.post('/api/internal/backfill-training-stubs', requireAuth, requireRole('founder'), async (_req, res) => {
  try {
    const clients = await prisma.client.findMany({
      where: { lifecycle: { in: ['Active', 'LeverageGranted'] } },
      select: { id: true, name: true },
    });
    const existing = await prisma.regularTraining.findMany({
      where: { clientId: { in: clients.map((c) => c.id) }, status: 'active' },
      select: { clientId: true },
    });
    const hasStub = new Set(existing.map((t) => t.clientId));
    const missing = clients.filter((c) => !hasStub.has(c.id));
    for (const c of missing) {
      await prisma.regularTraining.create({
        data: { name: c.name, clientId: c.id, status: 'active', ownerTeam: 'coordinator_team', hostedByDefaultId: null },
      });
    }
    res.json({ ok: true, created: missing.length, clients: missing.map((c) => c.name) });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// Founder-only: manually trigger the payment follow-up email right now
app.post('/api/internal/send-payment-report', requireAuth, requireRole('founder'), async (_req, res) => {
  try {
    await sendPaymentFollowUpReport({ force: true });
    res.json({ ok: true, message: 'Payment follow-up report sent.' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to send report' });
  }
});

// Founder-only: check SMTP health for all configured users (verify transporter auth)
app.get('/api/internal/smtp-health', requireAuth, requireRole('founder'), async (_req, res) => {
  try {
    const { decryptSecret } = await import('./lib/mailer');
    const { getUserTransporter } = await import('./lib/mailer');
    const users = await prisma.user.findMany({
      where: { smtpAppPassword: { not: null }, active: true },
      select: { id: true, name: true, email: true, gmailAddress: true, smtpAppPassword: true, smtpConfiguredAt: true },
    });
    const results = await Promise.all(users.map(async (u) => {
      try {
        const pwd = decryptSecret(u.smtpAppPassword!);
        const tx = getUserTransporter(u.id, u.gmailAddress!, pwd);
        await tx.verify();
        return { id: u.id, name: u.name, email: u.gmailAddress || u.email, ok: true, configuredAt: u.smtpConfiguredAt };
      } catch (e: any) {
        return { id: u.id, name: u.name, email: u.gmailAddress || u.email, ok: false, error: e?.message, configuredAt: u.smtpConfiguredAt };
      }
    }));
    res.json({ results, broken: results.filter(r => !r.ok).map(r => r.name) });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// Founder-only: send App Password advisory email to all SMTP-configured users
app.post('/api/internal/send-smtp-advisory', requireAuth, requireRole('founder'), async (_req, res) => {
  try {
    const { safeBuildFromUser, sendEmail, decryptSecret, getUserTransporter } = await import('./lib/mailer');
    const vaibhav = await prisma.user.findUnique({
      where: { id: 'u-vaibhav' },
      select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
    });
    if (!vaibhav?.gmailAddress || !vaibhav?.smtpAppPassword) return res.status(500).json({ error: 'Vaibhav SMTP not configured' });
    const fromUser = safeBuildFromUser(vaibhav);
    if (!fromUser) return res.status(500).json({ error: 'Could not build fromUser' });

    const users = await prisma.user.findMany({
      where: { smtpAppPassword: { not: null }, active: true },
      select: { id: true, name: true, email: true, gmailAddress: true, smtpAppPassword: true },
    });

    // Run health check for each user first
    const health = await Promise.all(users.map(async (u: any) => {
      try {
        const pwd = decryptSecret(u.smtpAppPassword!);
        const tx = getUserTransporter(u.id, u.gmailAddress!, pwd);
        await tx.verify();
        return { ...u, ok: true };
      } catch {
        return { ...u, ok: false };
      }
    }));

    const steps = `
<ol style="font-size:13px;color:#374151;line-height:1.9;margin:0;padding-left:18px;">
  <li>Go to <a href="https://myaccount.google.com/apppasswords" style="color:#2563eb;">myaccount.google.com/apppasswords</a></li>
  <li>Sign in with your <strong>@mitssolution.com</strong> Google account</li>
  <li>Click <strong>"Create a new App Password"</strong> → App: Mail, Device: Other → name it "MITS Hub"</li>
  <li>Copy the 16-character password shown</li>
  <li>Open the Hub → click your avatar (top right) → <strong>Email settings</strong></li>
  <li>Paste the new App Password and click <strong>Save</strong></li>
</ol>`;

    const footer = `<tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;"><div style="font-size:11px;color:#9ca3af;text-align:center;">MITS Solution · Internal staff communication</div></td></tr>`;
    const header = (sub: string) => `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;"><tr><td align="center"><table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;"><tr><td style="background:#1A1B1E;padding:24px 32px;border-radius:12px 12px 0 0;"><div style="font-size:18px;font-weight:700;color:#FBBF24;">MITS Consulting Hub</div><div style="font-size:12px;color:#9ca3af;margin-top:2px;">${sub}</div></td></tr><tr><td style="padding:32px;">`;
    const closeTags = `</td></tr>${footer}</table></td></tr></table></body></html>`;

    const sent: { name: string; status: string }[] = [];

    for (const u of health) {
      const to = u.gmailAddress || u.email;
      if (!to) continue;

      let subject: string;
      let html: string;

      if (!u.ok) {
        // Broken — urgent, personalised
        subject = `⚠️ Action needed: Your Hub email is broken, ${u.name.split(' ')[0]}`;
        html = header('Urgent: Your Gmail App Password has stopped working') +
          `<p style="font-size:15px;font-weight:700;color:#dc2626;margin:0 0 12px;">Your Hub email is currently not working.</p>
          <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
            We ran a live check and your Gmail App Password is returning an <strong>Invalid login</strong> error. This means <strong>no emails are being sent from your account</strong> — session sheets, payment follow-ups, and notifications are all failing silently.
          </p>
          <table cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:20px;margin:0 0 20px;width:100%;">
            <tr><td>
              <div style="font-size:13px;font-weight:700;color:#991b1b;margin-bottom:10px;">Fix this now — takes 2 minutes:</div>
              ${steps}
            </td></tr>
          </table>
          <p style="font-size:13px;color:#6b7280;margin:0;">Once done, use the <strong>"Send test email"</strong> button in Hub → Email settings to confirm it's working. Reply to this email if you need help.</p>` +
          closeTags;
      } else {
        // Working — general advisory
        subject = 'Reminder: Re-enter your App Password if you ever change your Google password';
        html = header('Gmail App Password — Good to know') +
          `<p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 12px;">✅ Your Hub email is currently working fine.</p>
          <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 16px;">
            Just a reminder — the Hub sends emails using a <strong>Gmail App Password</strong> linked to your Google account.
            <strong>If you ever change your Google account password, your App Password is automatically revoked</strong> and Hub emails will stop working until you re-enter it.
          </p>
          <table cellpadding="0" cellspacing="0" style="background:#fef9ec;border:1px solid #fcd34d;border-radius:8px;padding:20px;margin:0 0 20px;width:100%;">
            <tr><td>
              <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:10px;">If you change your Google password in the future, do this:</div>
              ${steps}
            </td></tr>
          </table>
          <p style="font-size:13px;color:#6b7280;margin:0;">You can test your email any time from Hub → your avatar → Email settings → <strong>"Send test email"</strong>.</p>` +
          closeTags;
      }

      await sendEmail({ fromUser, to, subject, body: subject, htmlBody: html });
      sent.push({ name: u.name, status: u.ok ? 'ok' : 'broken' });
    }

    res.json({ ok: true, sent, broken: sent.filter(s => s.status === 'broken').map(s => s.name) });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`[mits-backend] listening on :${PORT}`);
  initScheduler();
});
