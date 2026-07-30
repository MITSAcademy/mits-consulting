/**
 * Mitali daily activity report — sent at 11:30 PM IST.
 *
 * Pulls from AuditLog for the day to compute:
 *   • Payments collected (PAYMENT_ADVANCED)
 *   • Feedback taken (FEEDBACK_TAKEN)
 *   • Leverage granted (LEVERAGE_GRANTED)
 *   • Follow-up notes added (FOLLOWUP_NOTE)
 *   • Pay dates set (PAY_DATES_SET)
 *   • Timesheet hours (if she logged time today)
 *   • First/last action timestamp → active window
 *
 * Config stored in ReportConfig table (key = 'mitali-daily-report').
 * Vaibhav can toggle recipients and enable/disable from Settings.
 */

import { prisma } from './prisma';
import { sendEmail, safeBuildFromUser } from './mailer';

const ACTION_LABELS: Record<string, string> = {
  PAYMENT_ADVANCED: 'Payment collected',
  FEEDBACK_TAKEN: 'Feedback taken',
  LEVERAGE_GRANTED: 'Leverage granted',
  FOLLOWUP_NOTE: 'Follow-up note added',
  PAY_DATES_SET: 'Pay dates updated',
  CLIENT_UPDATE: 'Client updated',
  COMMENT_ADDED: 'Comment added',
  PENDING_VAIBHAV_ON: 'Escalated to Vaibhav',
  PENDING_VAIBHAV_OFF: 'Vaibhav resolved',
};

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

function fmtIST(d: Date) {
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function statBox(label: string, value: string | number, color: string) {
  return `
  <td style="padding:8px;">
    <div style="background:${color}12;border:1px solid ${color}30;border-radius:10px;padding:16px 20px;min-width:110px;text-align:center;">
      <div style="font-size:26px;font-weight:800;color:${color};">${value}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:3px;font-weight:500;">${label}</div>
    </div>
  </td>`;
}

function row(time: string, action: string, detail: string, idx: number) {
  return `
  <tr style="background:${idx % 2 === 0 ? '#f9fafb' : '#fff'};">
    <td style="padding:8px 12px;font-size:11px;color:#6b7280;white-space:nowrap;font-family:monospace;">${time}</td>
    <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#1f2937;white-space:nowrap;">${action}</td>
    <td style="padding:8px 12px;font-size:12px;color:#374151;">${detail}</td>
  </tr>`;
}

export async function sendMitaliDailyReport() {
  // Check config — enabled by default, configurable via ReportConfig
  let config: { enabled: boolean; extraRecipients: string[] } = { enabled: true, extraRecipients: [] };
  try {
    const cfg = await (prisma as any).reportConfig.findUnique({ where: { key: 'mitali-daily-report' } });
    if (cfg) config = JSON.parse(cfg.value);
  } catch {
    // ReportConfig table may not exist yet — use defaults
  }
  if (!config.enabled) {
    console.log('[mitali-daily-report] disabled in config — skipping');
    return;
  }

  const vaibhav = await prisma.user.findUnique({
    where: { id: 'u-vaibhav' },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });
  if (!vaibhav?.gmailAddress || !vaibhav?.smtpAppPassword) {
    console.warn('[mitali-daily-report] Vaibhav SMTP not configured — skipping');
    return;
  }

  const mitali = await prisma.user.findUnique({
    where: { id: 'u-mitali' },
    select: { id: true, name: true, email: true, gmailAddress: true },
  });
  if (!mitali) {
    console.warn('[mitali-daily-report] Mitali user not found — skipping');
    return;
  }

  // IST day window — derive today's date directly in IST from UTC
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const istOffset = 5.5 * 60 * 60 * 1000;
  // Compute midnight IST in UTC: get IST date string, parse as a local midnight, then subtract the offset
  const istDateStr = new Date(now.getTime() + istOffset).toISOString().slice(0, 10); // YYYY-MM-DD in IST
  const dayStartUTC = new Date(`${istDateStr}T00:00:00+05:30`);
  const dayEndUTC = new Date(`${istDateStr}T23:59:59.999+05:30`);
  const utcStart = dayStartUTC;
  const utcEnd = dayEndUTC;

  // Fetch all audit logs for Mitali today
  const logs = await prisma.auditLog.findMany({
    where: {
      byId: mitali.id,
      createdAt: { gte: utcStart, lte: utcEnd },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Fetch timesheet entry for today
  let timesheetHours: number | null = null;
  try {
    const ts = await (prisma as any).timesheetEntry.findFirst({
      where: { userId: mitali.id, date: { gte: utcStart, lte: utcEnd } },
      select: { hoursWorked: true },
    });
    if (ts?.hoursWorked) timesheetHours = ts.hoursWorked;
  } catch { /* table may not have this field */ }

  // Count by action type
  const counts: Record<string, number> = {};
  for (const log of logs) {
    counts[log.action] = (counts[log.action] || 0) + 1;
  }

  const paymentsCollected = counts['PAYMENT_ADVANCED'] || 0;
  const feedbackTaken = counts['FEEDBACK_TAKEN'] || 0;
  const leverageGranted = counts['LEVERAGE_GRANTED'] || 0;
  const notesAdded = counts['FOLLOWUP_NOTE'] || 0;
  const totalActions = logs.length;

  // Active window
  let activeWindow = '—';
  if (logs.length >= 2) {
    const first = new Date(logs[0].createdAt);
    const last = new Date(logs[logs.length - 1].createdAt);
    const mins = Math.round((last.getTime() - first.getTime()) / 60000);
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    activeWindow = `${fmtTime(first)} – ${fmtTime(last)} (${hrs > 0 ? `${hrs}h ` : ''}${rem}m)`;
  } else if (logs.length === 1) {
    activeWindow = fmtTime(new Date(logs[0].createdAt));
  }

  const fromUser = safeBuildFromUser(vaibhav);
  if (!fromUser) return;

  // Build recipients
  const samita = await prisma.user.findFirst({ where: { role: 'demo_lead' }, select: { email: true, gmailAddress: true } });
  const toList = [
    mitali.gmailAddress || mitali.email,
    vaibhav.gmailAddress,
    samita?.gmailAddress || samita?.email,
    ...config.extraRecipients,
  ].filter(Boolean) as string[];
  const toEmails = [...new Set(toList)].join(', ');

  const subject = `Mitali's Daily Activity Report — ${todayStr}`;

  const activityRows = logs.map((l, i) =>
    row(
      fmtTime(new Date(l.createdAt)),
      ACTION_LABELS[l.action] || l.action,
      l.details || '—',
      i,
    )
  ).join('');

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
  <tr><td align="center">
    <table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">

      <!-- Header -->
      <tr><td style="background:#1A1B1E;padding:24px 32px;border-radius:12px 12px 0 0;">
        <div style="font-size:18px;font-weight:700;color:#FBBF24;">MITS Consulting Hub</div>
        <div style="font-size:13px;color:#9ca3af;margin-top:4px;">Mitali's Daily Activity Report · ${todayStr}</div>
      </td></tr>

      <!-- Stats row -->
      <tr><td style="padding:28px 32px 0;">
        <table cellpadding="0" cellspacing="0">
          <tr>
            ${statBox('Payments Collected', paymentsCollected, '#10b981')}
            ${statBox('Feedback Taken', feedbackTaken, '#6366f1')}
            ${statBox('Leverage Granted', leverageGranted, '#f59e0b')}
            ${statBox('Notes Added', notesAdded, '#3b82f6')}
            ${statBox('Total Actions', totalActions, '#8b5cf6')}
            ${timesheetHours !== null ? statBox('Hours Logged', timesheetHours + 'h', '#ec4899') : ''}
          </tr>
        </table>
      </td></tr>

      <!-- Active window -->
      <tr><td style="padding:16px 32px 0;">
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;font-size:12px;color:#374151;">
          <strong>Active window:</strong> ${activeWindow}
        </div>
      </td></tr>

      <!-- Action log -->
      <tr><td style="padding:24px 32px;">
        <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:10px;">Activity log (${totalActions} actions)</div>
        ${totalActions === 0
          ? '<div style="font-size:13px;color:#9ca3af;padding:16px 0;">No activity recorded today.</div>'
          : `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;border-collapse:collapse;">
              <thead>
                <tr style="background:#f3f4f6;">
                  <th style="padding:8px 12px;font-size:10px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Time (IST)</th>
                  <th style="padding:8px 12px;font-size:10px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Action</th>
                  <th style="padding:8px 12px;font-size:10px;color:#6b7280;text-align:left;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Detail</th>
                </tr>
              </thead>
              <tbody>${activityRows}</tbody>
            </table>`
        }
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
        <div style="font-size:11px;color:#9ca3af;text-align:center;">MITS Solution · Automated daily report · Sent at 11:30 PM IST</div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

  await sendEmail({ to: toEmails, subject, body: subject, htmlBody: html, fromUser });
  console.log(`[mitali-daily-report] Sent to ${toEmails} — ${paymentsCollected} payments, ${feedbackTaken} feedback, ${totalActions} total actions`);
}
