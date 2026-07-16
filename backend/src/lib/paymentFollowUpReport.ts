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
  const sym = currency === 'USD' ? '$' : currency === 'CAD' ? 'CA$' : currency === 'GBP' ? '£' : currency === 'AED' ? 'AED ' : '₹';
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

interface PaymentRow {
  clientName: string;
  amount: number;
  currency: string;
  paymentDate: string;
  punchedBy: string | null;
  notes: string | null;
}

// ── HTML builder ──────────────────────────────────────────────────────────────

const PILL: Record<string, string> = {
  'pill-red':   'display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#fee2e2;color:#991b1b;',
  'pill-amber': 'display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#fef3c7;color:#92400e;',
  'pill-blue':  'display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#dbeafe;color:#1e40af;',
  'pill-green': 'display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;background:#dcfce7;color:#166534;',
};

const TH = 'background:#f3f4f6;text-align:left;padding:9px 12px;color:#4b5563;font-weight:600;font-size:12px;border-bottom:2px solid #e5e7eb;';
const TD = 'padding:9px 12px;font-size:13px;vertical-align:middle;border-bottom:1px solid #f3f4f6;';

function section(title: string, rows: Row[], pillClass: string, pillLabel: (r: Row) => string, bgColor: string): string {
  const h3 = `<h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;color:#374151;">${title}</h3>`;

  if (rows.length === 0) {
    return `${h3}<p style="color:#9ca3af;font-style:italic;font-size:13px;margin:0 0 16px;">None.</p>`;
  }

  const trs = rows.map(r => {
    const days = r.daysUntilDue;
    const daysStr = days === null ? '—'
      : days < 0 ? `<span style="color:#b91c1c;font-weight:700;">${Math.abs(days)}d overdue</span>`
      : days === 0 ? '<span style="color:#b45309;font-weight:700;">Today</span>'
      : `<span style="color:#b45309;font-weight:600;">In ${days}d</span>`;

    const rowBg = bgColor ? `background:${bgColor};` : '';

    return `<tr style="${rowBg}">
      <td style="${TD}"><strong style="font-size:13px;">${esc(r.name)}</strong>${r.feedbackNeeded ? '&nbsp;<span style="display:inline-block;padding:1px 6px;border-radius:999px;font-size:10px;font-weight:700;background:#fef3c7;color:#92400e;">⚠ feedback</span>' : ''}</td>
      <td style="${TD}color:#9ca3af;font-size:12px;">${esc(r.hostOwner || '—')}</td>
      <td style="${TD}">${fmtDate(r.payDate1)}</td>
      <td style="${TD}">${fmtDate(r.payDate2)}${r.leverageUntil ? ' <span style="color:#9ca3af;font-size:11px;">(leverage)</span>' : ''}</td>
      <td style="${TD}">${daysStr}</td>
      <td style="${TD}font-weight:600;">${fmtAmt(r.cycleAmount, r.currency)}</td>
      <td style="${TD}"><span style="${PILL[pillClass] || ''}">${pillLabel(r)}</span></td>
    </tr>`;
  }).join('');

  return `${h3}
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin-bottom:8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead><tr>
        <th style="${TH}">Client</th>
        <th style="${TH}">Host</th>
        <th style="${TH}">Next Due (Pay 1)</th>
        <th style="${TH}">2nd Installment</th>
        <th style="${TH}">Days</th>
        <th style="${TH}">Amount</th>
        <th style="${TH}">Status</th>
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
  freshPayments: PaymentRow[];
  followUpPayments: PaymentRow[];
}): string {
  const { date, overdue, dueSoon, upcoming, noDate, freshPayments, followUpPayments } = params;

  const totalTracked = overdue.length + dueSoon.length + upcoming.length + noDate.length;

  const summaryHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td width="25%" style="padding:4px;">
          <table width="100%" cellpadding="12" cellspacing="0" style="background:#fff5f5;border:1px solid #fecaca;border-radius:8px;text-align:center;">
            <tr><td style="font-size:28px;font-weight:800;color:#b91c1c;line-height:1;">${overdue.length}</td></tr>
            <tr><td style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;padding-top:4px;">Overdue</td></tr>
          </table>
        </td>
        <td width="25%" style="padding:4px;">
          <table width="100%" cellpadding="12" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;text-align:center;">
            <tr><td style="font-size:28px;font-weight:800;color:#b45309;line-height:1;">${dueSoon.length}</td></tr>
            <tr><td style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;padding-top:4px;">Due Soon</td></tr>
          </table>
        </td>
        <td width="25%" style="padding:4px;">
          <table width="100%" cellpadding="12" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;text-align:center;">
            <tr><td style="font-size:28px;font-weight:800;color:#1d4ed8;line-height:1;">${upcoming.length}</td></tr>
            <tr><td style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;padding-top:4px;">Upcoming</td></tr>
          </table>
        </td>
        <td width="25%" style="padding:4px;">
          <table width="100%" cellpadding="12" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-align:center;">
            <tr><td style="font-size:28px;font-weight:800;color:#15803d;line-height:1;">${totalTracked}</td></tr>
            <tr><td style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;padding-top:4px;">Total Clients</td></tr>
          </table>
        </td>
      </tr>
    </table>`;

  const overdueSection = section(
    `🔴 Overdue (${overdue.length})`,
    overdue,
    'pill-red',
    (r) => `${Math.abs(r.daysUntilDue!)}d overdue`,
    '#fff5f5',
  );

  const dueSoonSection = section(
    `🟡 Due Today / Soon — within 3 days (${dueSoon.length})`,
    dueSoon,
    'pill-amber',
    (r) => r.daysUntilDue === 0 ? 'Due today' : `Due in ${r.daysUntilDue}d`,
    '#fffbeb',
  );

  const upcomingSection = section(
    `🔵 Upcoming — next 4–14 days (${upcoming.length})`,
    upcoming,
    'pill-blue',
    (r) => `Due in ${r.daysUntilDue}d`,
    '',
  );

  const noDateSection = noDate.length > 0 ? `
    <h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;color:#374151;">⚪ No Due Date Set (${noDate.length})</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin-bottom:8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead><tr>
        <th style="${TH}">Client</th><th style="${TH}">Host</th><th style="${TH}">Last Paid</th><th style="${TH}">Amount</th>
      </tr></thead>
      <tbody>${noDate.map(r => `<tr>
        <td style="${TD}">${esc(r.name)}</td>
        <td style="${TD}color:#9ca3af;font-size:12px;">${esc(r.hostOwner || '—')}</td>
        <td style="${TD}">${fmtDate(r.payDate1)}</td>
        <td style="${TD}font-weight:600;">${fmtAmt(r.cycleAmount, r.currency)}</td>
      </tr>`).join('')}</tbody>
    </table>` : '';

  const weeklyPaymentSection = (title: string, emoji: string, color: string, bg: string, border: string, payments: PaymentRow[]) => {
    if (payments.length === 0) return `
      <h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;color:#374151;">${emoji} ${title} (0)</h3>
      <p style="color:#9ca3af;font-style:italic;font-size:13px;margin:0 0 16px;">None this week.</p>`;
    const trs = payments.map(p => `<tr>
      <td style="${TD}"><strong>${esc(p.clientName)}</strong></td>
      <td style="${TD}font-weight:700;color:${color};">${fmtAmt(p.amount, p.currency)}</td>
      <td style="${TD}color:#9ca3af;font-size:12px;">${fmtDate(p.paymentDate)}</td>
      <td style="${TD}color:#6b7280;font-size:12px;">${esc(p.punchedBy || '—')}</td>
    </tr>`).join('');
    return `
      <h3 style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid ${border};color:#374151;">${emoji} ${title} (${payments.length})</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin-bottom:8px;border:1px solid ${border};border-radius:8px;overflow:hidden;">
        <thead><tr style="background:${bg};">
          <th style="${TH}">Client</th><th style="${TH}">Amount</th><th style="${TH}">Date</th><th style="${TH}">Received By</th>
        </tr></thead>
        <tbody>${trs}</tbody>
      </table>`;
  };

  const freshSection = weeklyPaymentSection('Fresh Payments Received This Week (by Roshni)', '💵', '#15803d', '#f0fdf4', '#bbf7d0', freshPayments);
  const followUpWeekSection = weeklyPaymentSection('Follow-Up Payments Collected This Week (by Mitali\'s Team)', '✅', '#1d4ed8', '#eff6ff', '#bfdbfe', followUpPayments);

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f4f5;margin:0;padding:0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
  <tr><td align="center">
    <table width="780" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.09);">
      <tr><td>
        <h2 style="margin:0 0 4px;font-size:20px;color:#111827;">💰 Payment Follow-Up — Daily Report</h2>
        <p style="font-size:12px;color:#9ca3af;margin:0 0 12px;">${esc(date)} · Generated at 12:00 PM IST · MITS Consulting Hub</p>
        <div style="display:inline-block;background:#fee2e2;color:#991b1b;font-size:11px;font-weight:700;border-radius:4px;padding:3px 10px;margin-bottom:20px;letter-spacing:.3px;">🔒 CONFIDENTIAL — Vaibhav, Samita, Mitali &amp; Bhavneet only</div>

        ${summaryHtml}
        ${freshSection}
        ${followUpWeekSection}
        ${overdueSection}
        ${dueSoonSection}
        ${upcomingSection}
        ${noDateSection}

        <div style="margin-top:28px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px;">
          Auto-sent daily at noon IST by MITS Hub ·
          <a href="https://hub.mitssolution.com/follow-up-payments" style="color:#6366f1;">View live sheet →</a><br/>
          Covers all active clients with an active training — same scope as the Payment Follow-Ups page.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── Data fetch ────────────────────────────────────────────────────────────────

function weekStart(): string {
  const d = nowIST();
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

async function fetchWeeklyPayments(): Promise<{ fresh: PaymentRow[]; followUp: PaymentRow[] }> {
  const since = weekStart();

  const payments = await prisma.payment.findMany({
    where: { paymentDate: { gte: since } },
    select: {
      kind: true,
      amount: true,
      currency: true,
      paymentDate: true,
      client: { select: { name: true } },
      receivedBy: { select: { name: true } },
    },
    orderBy: { paymentDate: 'desc' },
  });

  const fresh: PaymentRow[] = [];
  const followUp: PaymentRow[] = [];

  for (const p of payments) {
    const row: PaymentRow = {
      clientName: p.client?.name || '—',
      amount: p.amount,
      currency: (p.currency as string) || 'USD',
      paymentDate: p.paymentDate,
      punchedBy: p.receivedBy?.name || null,
      notes: null,
    };

    if (p.kind === 'Fresh') {
      fresh.push(row);
    } else {
      followUp.push(row);
    }
  }

  return { fresh, followUp };
}

async function fetchData(): Promise<Row[]> {
  const today = todayIST();

  const clients = await prisma.client.findMany({
    where: {
      regularTrainings: { some: { status: 'active' } },
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
    orderBy: { payDate1: 'asc' },
  });

  return clients.map((c) => {
    const payDate1 = c.payDate1 || null; // Next due date (primary — what Mitali is chasing)
    const payDate2 = c.payDate2 || null; // Second installment date
    // Always use payDate1 as the reference date for overdue/due-soon calculation
    const refDate = payDate1;
    const daysUntilDue = refDate
      ? Math.floor((Date.parse(refDate) - Date.parse(today)) / 86_400_000)
      : null;

    let feedbackNeeded = false;
    if (refDate && daysUntilDue !== null && daysUntilDue <= 3) {
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
      cycleAmount: c.cycleAmount ?? 0,
      currency: (c.currency as string) || 'USD',
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

  const [rows, { fresh: freshPayments, followUp: followUpPayments }] = await Promise.all([
    fetchData(),
    fetchWeeklyPayments(),
  ]);

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
  const html = buildHtml({ date: dateLabel, overdue, dueSoon, upcoming, noDate, freshPayments, followUpPayments });

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

  // Recipients: Vaibhav + Samita + Mitali + Areena (NOT Bhavneet — she gets her own 2 PM sheet)
  const recipients = await prisma.user.findMany({
    where: { id: { in: ['u-vaibhav', 'u-samita', 'u-mitali'] } },
    select: { email: true, gmailAddress: true },
  });

  const toEmails = [
    ...recipients.map(u => u.gmailAddress || u.email).filter(Boolean),
    'areena.beri@mitssolution.com',
  ].join(', ');

  await sendEmail({
    to: toEmails,
    subject,
    body: subject,
    htmlBody: html,
    fromUser,
  });

  console.log(`[payment-followup-report] Sent to ${toEmails} — ${overdue.length} overdue, ${dueSoon.length} due soon, ${upcoming.length} upcoming`);
}
