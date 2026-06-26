/**
 * Daily Payment Follow-Up Report — sent at 12:00 PM IST every day.
 *
 * Recipients: Vaibhav, Samita, Mitali ONLY.
 * Covers all clients that Mitali's team (Mitali / Bhavneet / Kashish / Muskan)
 * are responsible for — same scope as the Payment Follow-Up UI page.
 *
 * Sections:
 *   1. 🔴 Overdue — payDate2 in the past
 *   2. 🟡 Due Today / Soon (≤3 days)
 *   3. 🟢 Upcoming (4–14 days)
 *   4. ✅ No date set
 */

import { prisma } from './prisma';
import { sendEmail, safeBuildFromUser } from './mailer';

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIST(): Date {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000);
}

function todayIST(): string {
  return nowIST().toISOString().slice(0, 10);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

function fmtAmt(amount: number, currency: string): string {
  const sym = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'AED' ? 'AED ' : '₹';
  return `${sym}${amount.toLocaleString('en-IN')}`;
}

function esc(s: string | null | undefined): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function daysDiff(iso: string): number {
  const today = new Date(todayIST() + 'T00:00:00Z');
  const d = new Date(iso + 'T00:00:00Z');
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const STYLE = `
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f4f5;margin:0;padding:0;}
  .wrap{max-width:780px;margin:24px auto;background:#fff;border-radius:10px;padding:28px 32px;box-shadow:0 2px 8px rgba(0,0,0,0.09);}
  h2{margin:0 0 2px;font-size:19px;color:#111;}
  .sub{font-size:12px;color:#888;margin:0 0 22px;}
  .confidential{display:inline-block;background:#fee2e2;color:#991b1b;font-size:11px;font-weight:700;border-radius:4px;padding:2px 8px;margin-bottom:18px;letter-spacing:.3px;}
  h3{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin:24px 0 8px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;color:#374151;}
  .summary{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap;}
  .stat{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 18px;text-align:center;min-width:110px;}
  .stat-n{font-size:22px;font-weight:800;margin-bottom:2px;}
  .stat-l{font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;}
  .red-n{color:#b91c1c;} .amber-n{color:#b45309;} .blue-n{color:#1d4ed8;} .green-n{color:#15803d;}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:4px;}
  th{background:#f3f4f6;text-align:left;padding:8px 10px;color:#4b5563;font-weight:600;font-size:12px;}
  td{padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:middle;}
  tr:last-child td{border-bottom:none;}
  tr.overdue-row{background:#fff7f7;}
  tr.duesoon-row{background:#fffbeb;}
  .pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;}
  .pill-red{background:#fee2e2;color:#991b1b;}
  .pill-amber{background:#fef3c7;color:#92400e;}
  .pill-blue{background:#dbeafe;color:#1e40af;}
  .pill-green{background:#dcfce7;color:#166534;}
  .pill-grey{background:#f3f4f6;color:#6b7280;}
  .amount{font-weight:600;font-variant-numeric:tabular-nums;}
  .red{color:#b91c1c;font-weight:600;}
  .amber{color:#b45309;font-weight:600;}
  .muted{color:#9ca3af;font-size:12px;}
  .empty{color:#9ca3af;font-style:italic;padding:10px 0;font-size:12px;}
  .footer{margin-top:28px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px;}
`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Row {
  name: string;
  hostOwner: string | null;
  cycleAmount: number;
  currency: string;
  payDate1: string | null;
  payDate2: string | null;
  leverageUntil: string | null;
  feedbackNeeded: boolean;
  phone: string | null;
  daysUntilDue: number | null;
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function section(title: string, rows: Row[], pillClass: string, pillLabel: (r: Row) => string, rowClass: string): string {
  if (rows.length === 0) {
    return `<h3>${title}</h3><p class="empty">None.</p>`;
  }
  const trs = rows.map(r => {
    const days = r.daysUntilDue;
    const daysStr = days === null ? '—'
      : days < 0 ? `<span class="red">${Math.abs(days)}d overdue</span>`
      : days === 0 ? '<span class="amber">Today</span>'
      : `<span class="amber">In ${days}d</span>`;

    return `<tr class="${rowClass}">
      <td><strong>${esc(r.name)}</strong>${r.feedbackNeeded ? ' <span class="pill pill-amber" style="font-size:10px;">⚠ feedback</span>' : ''}</td>
      <td class="muted">${esc(r.hostOwner || '—')}</td>
      <td>${fmtDate(r.payDate1)}</td>
      <td>${fmtDate(r.payDate2)}${r.leverageUntil ? ' <span class="muted">(leverage)</span>' : ''}</td>
      <td>${daysStr}</td>
      <td class="amount">${fmtAmt(r.cycleAmount, r.currency)}</td>
      <td><span class="pill ${pillClass}">${pillLabel(r)}</span></td>
    </tr>`;
  }).join('');

  return `
    <h3>${title}</h3>
    <table>
      <thead><tr>
        <th>Client</th><th>Host</th><th>Last Paid</th><th>Next Due</th><th>Days</th><th>Amount</th><th>Status</th>
      </tr></thead>
      <tbody>${trs}</tbody>
    </table>`;
}

function buildHtml(params: {
  date: string;
  overdue: Row[];
  dueSoon: Row[];
  upcoming: Row[];
  noDate: Row[];
}): string {
  const { date, overdue, dueSoon, upcoming, noDate } = params;

  const totalOverdue = overdue.reduce((s, r) => s + r.cycleAmount, 0);
  const totalDueSoon = dueSoon.reduce((s, r) => s + r.cycleAmount, 0);
  const totalUpcoming = upcoming.reduce((s, r) => s + r.cycleAmount, 0);

  const summaryHtml = `
    <div class="summary">
      <div class="stat"><div class="stat-n red-n">${overdue.length}</div><div class="stat-l">Overdue</div></div>
      <div class="stat"><div class="stat-n amber-n">${dueSoon.length}</div><div class="stat-l">Due Soon</div></div>
      <div class="stat"><div class="stat-n blue-n">${upcoming.length}</div><div class="stat-l">Upcoming</div></div>
      <div class="stat"><div class="stat-n green-n">₹${(totalOverdue + totalDueSoon + totalUpcoming).toLocaleString('en-IN')}</div><div class="stat-l">Total Tracked</div></div>
    </div>`;

  const overdueSection = section(
    `🔴 Overdue (${overdue.length})`,
    overdue,
    'pill-red',
    (r) => `${Math.abs(r.daysUntilDue!)}d overdue`,
    'overdue-row',
  );

  const dueSoonSection = section(
    `🟡 Due Today / Soon — within 3 days (${dueSoon.length})`,
    dueSoon,
    'pill-amber',
    (r) => r.daysUntilDue === 0 ? 'Due today' : `Due in ${r.daysUntilDue}d`,
    'duesoon-row',
  );

  const upcomingSection = section(
    `🔵 Upcoming — next 4–14 days (${upcoming.length})`,
    upcoming,
    'pill-blue',
    (r) => `Due in ${r.daysUntilDue}d`,
    '',
  );

  const noDateSection = noDate.length > 0 ? `
    <h3>⚪ No Due Date Set (${noDate.length})</h3>
    <table>
      <thead><tr><th>Client</th><th>Host</th><th>Last Paid</th><th>Amount</th></tr></thead>
      <tbody>${noDate.map(r => `<tr>
        <td>${esc(r.name)}</td>
        <td class="muted">${esc(r.hostOwner || '—')}</td>
        <td>${fmtDate(r.payDate1)}</td>
        <td class="amount">${fmtAmt(r.cycleAmount, r.currency)}</td>
      </tr>`).join('')}</tbody>
    </table>` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <h2>💰 Payment Follow-Up — Daily Report</h2>
  <p class="sub">${esc(date)} · Generated at 12:00 PM IST · MITS Consulting Hub</p>
  <span class="confidential">🔒 CONFIDENTIAL — Vaibhav, Samita &amp; Mitali only</span>

  ${summaryHtml}
  ${overdueSection}
  ${dueSoonSection}
  ${upcomingSection}
  ${noDateSection}

  <div class="footer">
    Auto-sent daily at noon IST by MITS Hub · <a href="https://hub.mitssolution.com/follow-up-payments">View live sheet →</a><br/>
    Covers Active + LeverageGranted clients managed by Mitali's team (Mitali / Bhavneet / Kashish / Muskan).
  </div>
</div>
</body></html>`;
}

// ── Data fetch ────────────────────────────────────────────────────────────────

async function fetchData(): Promise<Row[]> {
  const today = todayIST();

  const clients = await prisma.client.findMany({
    where: {
      lifecycle: { in: ['Active', 'LeverageGranted', 'SaleWon'] },
      cycleAmount: { gt: 0 },
      hostOwnerId: { in: ['u-mitali', 'u-bhavneet', 'u-kashish', 'u-muskan'] },
    },
    select: {
      name: true,
      cycleAmount: true,
      currency: true,
      payDate1: true,
      payDate2: true,
      leverageUntil: true,
      lastFeedbackTakenAt: true,
      phoneCode: true,
      phoneDigits: true,
      hostOwner: { select: { name: true } },
      payments: {
        orderBy: { paymentDate: 'desc' },
        take: 1,
        select: { paymentDate: true },
      },
    },
    orderBy: { payDate2: 'asc' },
  });

  return clients.map((c) => {
    const payDate1 = c.payDate1 || c.payments[0]?.paymentDate || null;
    const payDate2 = c.payDate2 || null;
    const daysUntilDue = payDate2
      ? Math.floor((Date.parse(payDate2) - Date.parse(today)) / 86_400_000)
      : null;

    let feedbackNeeded = false;
    if (payDate2 && daysUntilDue !== null && daysUntilDue <= 3) {
      if (c.lastFeedbackTakenAt) {
        const daysSinceFeedback = Math.floor((Date.parse(today) - Date.parse(c.lastFeedbackTakenAt)) / 86_400_000);
        feedbackNeeded = daysSinceFeedback > 3;
      } else {
        feedbackNeeded = true;
      }
    }

    const phone = c.phoneCode && c.phoneDigits ? `+${c.phoneCode}${c.phoneDigits}` : null;

    return {
      name: c.name,
      hostOwner: c.hostOwner?.name || null,
      cycleAmount: c.cycleAmount,
      currency: (c.currency as string) || 'INR',
      payDate1,
      payDate2,
      leverageUntil: c.leverageUntil,
      feedbackNeeded,
      phone,
      daysUntilDue,
    };
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function sendPaymentFollowUpReport({ force = false }: { force?: boolean } = {}) {
  const today = todayIST();
  const lockKey = `payment-followup-report:${today}`;

  if (!force) {
    const locked = await prisma.$executeRaw`
      INSERT INTO "CronLock" (key, "createdAt")
      VALUES (${lockKey}, NOW())
      ON CONFLICT (key) DO NOTHING
    `;
    if (locked === 0) {
      console.log('[payment-followup-report] SKIP — already sent today');
      return;
    }
  }

  const rows = await fetchData();

  const overdue  = rows.filter(r => r.daysUntilDue !== null && r.daysUntilDue < 0);
  const dueSoon  = rows.filter(r => r.daysUntilDue !== null && r.daysUntilDue >= 0 && r.daysUntilDue <= 3);
  const upcoming = rows.filter(r => r.daysUntilDue !== null && r.daysUntilDue > 3 && r.daysUntilDue <= 14);
  const noDate   = rows.filter(r => r.daysUntilDue === null);

  const dateLabel = new Date(today + 'T00:00:00Z').toLocaleDateString('en-IN', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  const urgency = overdue.length > 0
    ? `🔴 ${overdue.length} OVERDUE · `
    : dueSoon.length > 0 ? '🟡 ' : '🟢 ';

  const subject = `${urgency}Payment Follow-Up Report — ${dateLabel}`;
  const html = buildHtml({ date: dateLabel, overdue, dueSoon, upcoming, noDate });

  // Send from Vaibhav's account
  const vaibhav = await prisma.user.findFirst({
    where: { role: 'founder' },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });

  if (!vaibhav?.gmailAddress || !vaibhav?.smtpAppPassword) {
    console.error('[payment-followup-report] Vaibhav has no Gmail App Password — cannot send');
    return;
  }

  const fromUser = safeBuildFromUser(vaibhav);
  if (!fromUser) {
    console.error('[payment-followup-report] Could not decrypt Vaibhav\'s App Password');
    return;
  }

  // Recipients: Vaibhav + Samita + Mitali ONLY
  const recipients = await prisma.user.findMany({
    where: { id: { in: ['u-vaibhav', 'u-samita', 'u-mitali'] } },
    select: { email: true, gmailAddress: true },
  });

  const toEmails = recipients
    .map(u => u.gmailAddress || u.email)
    .filter(Boolean)
    .join(', ');

  await sendEmail({
    to: toEmails,
    subject,
    body: subject,
    htmlBody: html,
    fromUser,
  });

  console.log(`[payment-followup-report] Sent to ${toEmails} — ${overdue.length} overdue, ${dueSoon.length} due soon, ${upcoming.length} upcoming`);
}
