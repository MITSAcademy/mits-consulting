/**
 * Daily status report for Malika — sent at 5:30 PM IST from Vaibhav's account.
 *
 * Tables:
 *   1. Completed today — payments received on today's date (100% done)
 *   2. In Progress — clients with pending renewal due soon / overdue, with ETA
 *   3. Tomorrow's plan — renewals due tomorrow + next 2 days
 */

import { prisma } from './prisma';
import { sendEmail, safeBuildFromUser } from './mailer';

// ── IST helpers ───────────────────────────────────────────────────────────────

function nowIST(): Date {
  const utc = new Date();
  return new Date(utc.getTime() + 5.5 * 60 * 60 * 1000);
}

function todayIST(): string {
  return nowIST().toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

function fmtAmount(amount: number, currency: string): string {
  const sym = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '₹';
  return `${sym}${amount.toLocaleString('en-IN')}`;
}

function daysFromToday(iso: string): number {
  const today = new Date(todayIST() + 'T00:00:00Z');
  const due = new Date(iso + 'T00:00:00Z');
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

// ── HTML builder ─────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const STYLE = `
  body { font-family: 'Helvetica Neue', Arial, sans-serif; background:#f5f5f5; margin:0; padding:0; }
  .wrap { max-width:700px; margin:24px auto; background:#fff; border-radius:8px; padding:28px 32px; box-shadow:0 1px 4px rgba(0,0,0,0.08); }
  h2 { margin:0 0 4px; font-size:18px; color:#1a1b1e; }
  .sub { font-size:13px; color:#666; margin:0 0 24px; }
  h3 { font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; margin:24px 0 10px; color:#444; border-bottom:2px solid #eee; padding-bottom:6px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { background:#f0f0f0; text-align:left; padding:8px 10px; color:#555; font-weight:600; }
  td { padding:8px 10px; border-bottom:1px solid #f0f0f0; vertical-align:top; }
  tr:last-child td { border-bottom:none; }
  .green { color:#1a7c3e; font-weight:600; }
  .amber { color:#b45309; font-weight:600; }
  .red   { color:#b91c1c; font-weight:600; }
  .pill { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600; }
  .pill-green { background:#dcfce7; color:#166534; }
  .pill-amber { background:#fef3c7; color:#92400e; }
  .pill-red   { background:#fee2e2; color:#991b1b; }
  .empty { color:#999; font-style:italic; font-size:13px; padding:10px 0; }
  .footer { margin-top:28px; font-size:11px; color:#aaa; border-top:1px solid #eee; padding-top:12px; }
`;

function buildStatusReportHtml(params: {
  date: string;
  completedToday: Array<{ name: string; amount: number; currency: string; kind: string; mode: string | null }>;
  inProgress: Array<{ name: string; amount: number; currency: string; dueDate: string; daysOverdue: number; phone: string | null }>;
  tomorrow: Array<{ name: string; amount: number; currency: string; dueDate: string }>;
}): string {
  const { date, completedToday, inProgress, tomorrow } = params;

  const completedRows = completedToday.length
    ? completedToday.map(r => `
        <tr>
          <td>${esc(r.name)}</td>
          <td class="green">${fmtAmount(r.amount, r.currency)}</td>
          <td>${esc(r.kind)}</td>
          <td>${esc(r.mode || '—')}</td>
          <td><span class="pill pill-green">✓ Done</span></td>
        </tr>`).join('')
    : `<tr><td colspan="5" class="empty">No payments received today.</td></tr>`;

  const inProgressRows = inProgress.length
    ? inProgress.map(r => {
        const overdue = r.daysOverdue > 0;
        const pillClass = overdue ? 'pill-red' : 'pill-amber';
        const label = overdue ? `${r.daysOverdue}d overdue` : `Due ${fmtDate(r.dueDate)}`;
        const eta = overdue
          ? `<span class="red">Overdue by ${r.daysOverdue} day${r.daysOverdue > 1 ? 's' : ''} — chase ASAP</span>`
          : `<span class="amber">ETA: ${fmtDate(r.dueDate)}</span>`;
        return `
        <tr>
          <td>${esc(r.name)}</td>
          <td class="amber">${fmtAmount(r.amount, r.currency)}</td>
          <td><span class="pill ${pillClass}">${label}</span></td>
          <td>${eta}</td>
          <td>${r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : '—'}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" class="empty">No pending collections right now.</td></tr>`;

  const tomorrowRows = tomorrow.length
    ? tomorrow.map(r => `
        <tr>
          <td>${esc(r.name)}</td>
          <td>${fmtAmount(r.amount, r.currency)}</td>
          <td>${fmtDate(r.dueDate)}</td>
          <td><span class="pill pill-amber">Due soon</span></td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="empty">Nothing scheduled for the next 2 days.</td></tr>`;

  const totalCollected = completedToday.reduce((s, r) => s + r.amount, 0);
  const totalPending = inProgress.reduce((s, r) => s + r.amount, 0);

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <h2>📊 Daily Payments Status Report</h2>
  <p class="sub">${date} · Auto-generated at 5:30 PM IST · For Malika Gupta (Accounts)</p>

  <h3>✅ Completed Today</h3>
  <p style="font-size:13px;color:#555;margin:0 0 8px;">
    ${completedToday.length} payment${completedToday.length !== 1 ? 's' : ''} received &nbsp;·&nbsp;
    <strong>Total: ${fmtAmount(totalCollected, 'INR')}</strong>
  </p>
  <table>
    <thead><tr><th>Client</th><th>Amount</th><th>Type</th><th>Mode</th><th>Status</th></tr></thead>
    <tbody>${completedRows}</tbody>
  </table>

  <h3>🔄 In Progress (Pending Collections)</h3>
  <p style="font-size:13px;color:#555;margin:0 0 8px;">
    ${inProgress.length} client${inProgress.length !== 1 ? 's' : ''} pending &nbsp;·&nbsp;
    <strong>Total outstanding: ${fmtAmount(totalPending, 'INR')}</strong>
  </p>
  <table>
    <thead><tr><th>Client</th><th>Amount</th><th>Due</th><th>ETA / Status</th><th>Phone</th></tr></thead>
    <tbody>${inProgressRows}</tbody>
  </table>

  <h3>📅 Tomorrow's Plan (Next 2 Days)</h3>
  <table>
    <thead><tr><th>Client</th><th>Amount</th><th>Due Date</th><th>Status</th></tr></thead>
    <tbody>${tomorrowRows}</tbody>
  </table>

  <div class="footer">
    Sent automatically from MITS Hub · <a href="https://hub.mitssolution.com">hub.mitssolution.com</a><br/>
    This report covers Active + LeverageGranted clients only. Contact Vaibhav for any discrepancies.
  </div>
</div>
</body></html>`;
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function fetchReportData() {
  const today = todayIST();
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 2);

  // 1. Payments actually received today
  const completedPayments = await prisma.payment.findMany({
    where: { paymentDate: today },
    select: {
      kind: true, amount: true, currency: true, paymentMode: true,
      client: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // 2. Active/LeverageGranted clients with payDate2 <= today (overdue) or payDate2 today (due today)
  const overdueOrDueToday = await prisma.client.findMany({
    where: {
      lifecycle: { in: ['Active', 'LeverageGranted'] },
      payDate2: { lte: today },
    },
    select: {
      name: true, cycleAmount: true, currency: true, payDate2: true,
      phoneCode: true, phoneDigits: true,
    },
    orderBy: { payDate2: 'asc' },
  });

  // 3. Renewals due in next 2 days (tomorrow + day after)
  const upcomingRenewals = await prisma.client.findMany({
    where: {
      lifecycle: { in: ['Active', 'LeverageGranted'] },
      payDate2: { in: [tomorrow, dayAfter] },
    },
    select: {
      name: true, cycleAmount: true, currency: true, payDate2: true,
    },
    orderBy: { payDate2: 'asc' },
  });

  return { today, completedPayments, overdueOrDueToday, upcomingRenewals };
}

// ── Main send function ────────────────────────────────────────────────────────

export async function sendMalikaStatusReport({ force = false }: { force?: boolean } = {}) {
  // Acquire lock to prevent duplicate sends on Render multi-instance deploys
  const lockKey = `malika-status:${todayIST()}`;
  if (!force) {
    const locked = await prisma.$executeRaw`
      INSERT INTO "CronLock" (key, "createdAt")
      VALUES (${lockKey}, NOW())
      ON CONFLICT (key) DO NOTHING
    `;
    if (locked === 0) {
      console.log('[malika-report] SKIP — already sent today');
      return;
    }
  }

  const { today, completedPayments, overdueOrDueToday, upcomingRenewals } = await fetchReportData();

  const completedToday = completedPayments.map(p => ({
    name: p.client.name,
    amount: p.amount,
    currency: p.currency as string,
    kind: p.kind,
    mode: p.paymentMode,
  }));

  const inProgress = overdueOrDueToday.map(c => {
    const days = daysFromToday(c.payDate2!);
    const phone = c.phoneCode && c.phoneDigits
      ? `+${c.phoneCode} ${c.phoneDigits}`
      : null;
    return {
      name: c.name,
      amount: c.cycleAmount,
      currency: c.currency as string,
      dueDate: c.payDate2!,
      daysOverdue: days < 0 ? Math.abs(days) : 0,
      phone,
    };
  });

  const tomorrow = upcomingRenewals.map(c => ({
    name: c.name,
    amount: c.cycleAmount,
    currency: c.currency as string,
    dueDate: c.payDate2!,
  }));

  const dateLabel = new Date(today + 'T00:00:00Z').toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  const overdueCount = inProgress.filter(r => r.daysOverdue > 0).length;
  const urgencyFlag = overdueCount > 0 ? `🔴 ${overdueCount} OVERDUE · ` : inProgress.length > 0 ? '🟡 ' : '🟢 ';
  const subject = `${urgencyFlag}Payments Status Report — ${dateLabel}`;

  const html = buildStatusReportHtml({ date: dateLabel, completedToday, inProgress, tomorrow });

  // Send from Vaibhav's account
  const vaibhav = await prisma.user.findFirst({
    where: { role: 'founder' },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });

  if (!vaibhav?.gmailAddress || !vaibhav?.smtpAppPassword) {
    console.error('[malika-report] Vaibhav has no Gmail App Password configured — cannot send');
    return;
  }

  const fromUser = safeBuildFromUser(vaibhav);
  if (!fromUser) {
    console.error('[malika-report] Could not decrypt Vaibhav\'s App Password');
    return;
  }

  await sendEmail({
    to: 'malgup@mitssolution.com',
    cc: 'er.vaibhavaggarwal@gmail.com',
    subject,
    body: subject,
    htmlBody: html,
    fromUser,
  });

  console.log(`[malika-report] Sent to malgup@mitssolution.com — ${completedToday.length} done, ${inProgress.length} pending`);
}
