/**
 * Weekly feedback compliance report — sent every Saturday at 8 AM IST.
 * Shows which clients got verbal feedback (Mitali/Bhavneet) and written feedback (Kashish/Muskan)
 * for the current Mon–Sat week.
 */

import { prisma } from './prisma';
import { sendEmail, safeBuildFromUser } from './mailer';
import { audit } from './audit';

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function weekBoundsIST(): { monday: string; saturday: string } {
  const today = todayIST();
  const ref = new Date(today + 'T00:00:00Z');
  const day = ref.getUTCDay();
  const daysToMon = day === 0 ? 6 : day - 1;
  const mon = new Date(ref);
  mon.setUTCDate(ref.getUTCDate() - daysToMon);
  const sat = new Date(mon);
  sat.setUTCDate(mon.getUTCDate() + 5);
  return { monday: mon.toISOString().slice(0, 10), saturday: sat.toISOString().slice(0, 10) };
}

function fmt(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export async function sendWeeklyFeedbackReport(): Promise<void> {
  const { monday, saturday } = weekBoundsIST();

  const vaibhav = await prisma.user.findUnique({
    where: { id: 'u-vaibhav' },
    select: { id: true, name: true, email: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });
  if (!vaibhav?.gmailAddress || !vaibhav?.smtpAppPassword) {
    console.warn('[weekly-feedback-report] Vaibhav SMTP not configured');
    return;
  }
  const fromUser = safeBuildFromUser(vaibhav as any);
  if (!fromUser) return;

  const recipients = await prisma.user.findMany({
    where: { id: { in: ['u-mitali', 'u-bhavneet', 'u-vaibhav'] } },
    select: { email: true },
  });
  const toEmails = recipients.map(u => u.email).filter(Boolean).join(', ');

  // Active clients
  const clients = await prisma.client.findMany({
    where: { regularTrainings: { some: { status: 'active' } } },
    select: {
      id: true, name: true,
      assignedAm: { select: { name: true } },
      hostOwner: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });

  const monStart = new Date(monday + 'T00:00:00+05:30');
  const satEnd = new Date(saturday + 'T23:59:59+05:30');

  const VERBAL_IDS = ['u-mitali', 'u-bhavneet'];
  const WRITTEN_IDS = ['u-kashish', 'u-muskan'];
  const staffIds = [...VERBAL_IDS, ...WRITTEN_IDS];

  const staffNames: Record<string, string> = {
    'u-mitali': 'Mitali', 'u-bhavneet': 'Bhavneet',
    'u-kashish': 'Kashish', 'u-muskan': 'Muskan',
  };

  // Derive compliance from FeedbackActivity
  const activities = await prisma.feedbackActivity.findMany({
    where: { loggedById: { in: staffIds }, loggedAt: { gte: monStart, lte: satEnd } },
    select: { clientId: true, loggedById: true },
  });

  const activityMap: Record<string, Set<string>> = {};
  for (const a of activities) {
    if (!activityMap[a.clientId]) activityMap[a.clientId] = new Set();
    activityMap[a.clientId].add(a.loggedById);
  }

  const totalClients = clients.length;
  let verbalDone = 0, verbalMissed = 0, writtenDone = 0, writtenMissed = 0;

  const rows = clients.map(c => {
    const who = activityMap[c.id] || new Set();
    const gotVerbal = VERBAL_IDS.some(id => who.has(id));
    const gotWritten = WRITTEN_IDS.some(id => who.has(id));
    if (gotVerbal) verbalDone++; else verbalMissed++;
    if (gotWritten) writtenDone++; else writtenMissed++;
    const verbalBy = VERBAL_IDS.filter(id => who.has(id)).map(id => staffNames[id]).join(', ') || '—';
    const writtenBy = WRITTEN_IDS.filter(id => who.has(id)).map(id => staffNames[id]).join(', ') || '—';
    const coordinator = c.assignedAm?.name || c.hostOwner?.name || '—';
    return { name: c.name, gotVerbal, gotWritten, verbalBy, writtenBy, coordinator };
  });

  const missedRows = rows.filter(r => !r.gotVerbal || !r.gotWritten);

  const rowHtml = rows.map(r => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;">${r.name}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:center;">${r.gotVerbal ? `<span style="color:#16a34a;font-weight:700;">✓</span> ${r.verbalBy}` : '<span style="color:#dc2626;font-weight:700;">✗ Missing</span>'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:center;">${r.gotWritten ? `<span style="color:#16a34a;font-weight:700;">✓</span> ${r.writtenBy}` : '<span style="color:#dc2626;font-weight:700;">✗ Missing</span>'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;color:#666;">${r.coordinator}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="700" cellpadding="0" cellspacing="0" style="max-width:700px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">

      <tr><td style="background:#1a1a2e;padding:20px 28px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#888;margin-bottom:4px;">MITS · Weekly Feedback Compliance</div>
        <div style="font-size:20px;font-weight:800;color:#f0f0f0;">Week: ${fmt(monday)} – ${fmt(saturday)}</div>
      </td></tr>

      <tr><td style="padding:20px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:12px 16px;background:#f0fdf4;border-radius:6px;text-align:center;width:25%;">
              <div style="font-size:24px;font-weight:800;color:#16a34a;">${totalClients}</div>
              <div style="font-size:11px;color:#555;margin-top:2px;">Active Clients</div>
            </td>
            <td width="8"></td>
            <td style="padding:12px 16px;background:#f0fdf4;border-radius:6px;text-align:center;width:25%;">
              <div style="font-size:24px;font-weight:800;color:#16a34a;">${verbalDone}</div>
              <div style="font-size:11px;color:#555;margin-top:2px;">Verbal Done</div>
            </td>
            <td width="8"></td>
            <td style="padding:12px 16px;background:${verbalMissed > 0 ? '#fef2f2' : '#f0fdf4'};border-radius:6px;text-align:center;width:25%;">
              <div style="font-size:24px;font-weight:800;color:${verbalMissed > 0 ? '#dc2626' : '#16a34a'};">${verbalMissed}</div>
              <div style="font-size:11px;color:#555;margin-top:2px;">Verbal Missed</div>
            </td>
            <td width="8"></td>
            <td style="padding:12px 16px;background:${writtenMissed > 0 ? '#fef2f2' : '#f0fdf4'};border-radius:6px;text-align:center;width:25%;">
              <div style="font-size:24px;font-weight:800;color:${writtenMissed > 0 ? '#dc2626' : '#16a34a'};">${writtenMissed}</div>
              <div style="font-size:11px;color:#555;margin-top:2px;">Written Missed</div>
            </td>
          </tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 28px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:8px 10px;text-align:left;font-size:12px;color:#555;font-weight:700;border-bottom:1px solid #e5e7eb;">Client</th>
              <th style="padding:8px 10px;text-align:center;font-size:12px;color:#555;font-weight:700;border-bottom:1px solid #e5e7eb;">Verbal (Mitali / Bhavneet)</th>
              <th style="padding:8px 10px;text-align:center;font-size:12px;color:#555;font-weight:700;border-bottom:1px solid #e5e7eb;">Written (Kashish / Muskan)</th>
              <th style="padding:8px 10px;text-align:left;font-size:12px;color:#555;font-weight:700;border-bottom:1px solid #e5e7eb;">Coordinator</th>
            </tr>
          </thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </td></tr>

      <tr><td style="padding:12px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
        <span style="font-size:11px;color:#888;"><b style="color:#555;">MITS</b> · Automated weekly feedback compliance report · Do not reply</span>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  const subject = `Weekly Feedback Compliance: ${fmt(monday)}–${fmt(saturday)} · ${missedRows.length} missing`;

  await sendEmail({
    to: toEmails,
    subject,
    body: `Weekly Feedback Compliance Report\nWeek: ${monday} to ${saturday}\nActive clients: ${totalClients}\nVerbal done: ${verbalDone} / missed: ${verbalMissed}\nWritten done: ${writtenDone} / missed: ${writtenMissed}`,
    htmlBody: html,
    fromUser,
  });

  await audit('u-vaibhav', 'System', 'WEEKLY_FEEDBACK_REPORT', `Sent weekly feedback compliance report: ${totalClients} clients, ${missedRows.length} with gaps`, {});
  console.log(`[weekly-feedback-report] Sent — ${totalClients} clients, ${missedRows.length} with gaps`);
}
