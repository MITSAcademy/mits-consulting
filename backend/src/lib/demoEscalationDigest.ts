/**
 * Daily demo escalation digest — sent at 11:00 AM IST.
 *
 * Compiles two types of pending items for the demo team:
 *  1. RegularTraining escalations (demoEscalationRequested=true, not yet acked)
 *  2. IssueTracker issues (escalationLevel > 0, acknowledgedBySamitaAt IS NULL)
 *
 * Emails Samita + Anjali + Taran.
 */

import { prisma } from './prisma';
import { sendEmail, safeBuildFromUser } from './mailer';

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function escStatusBadge(status: string | null): string {
  if (!status) return '<span style="color:#9ca3af;font-style:italic;">No status set</span>';
  const colors: Record<string, string> = {
    'Work in Progress': '#ca8a04',
    'Not Resolved':     '#dc2626',
    Resolved:           '#16a34a',
  };
  const bg: Record<string, string> = {
    'Work in Progress': '#fef9c3',
    'Not Resolved':     '#fee2e2',
    Resolved:           '#dcfce7',
  };
  const c = colors[status] || '#6b7280';
  const b = bg[status] || '#f3f4f6';
  return `<span style="background:${b};color:${c};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;">${status}</span>`;
}

function escalationRow(t: any, idx: number): string {
  const bg = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
  const flaggedDate = t.escalationFlaggedAt ? fmtDate(new Date(t.escalationFlaggedAt)) : '—';
  const clientName  = t.client?.name || t.name || '—';
  const trainerName = t.trainer?.name || '—';
  const hostName    = t.hostedByDefault?.name || '—';
  const actionsTaken = t.escalationActionsTaken || '<span style="color:#9ca3af;font-style:italic;">None yet</span>';
  return `
  <tr style="background:${bg};border-bottom:1px solid #e5e7eb;">
    <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#111827;">${clientName}</td>
    <td style="padding:10px 14px;font-size:12px;color:#374151;">${trainerName}</td>
    <td style="padding:10px 14px;font-size:12px;color:#374151;">${hostName}</td>
    <td style="padding:10px 14px;font-size:12px;color:#6b7280;white-space:nowrap;">${flaggedDate}</td>
    <td style="padding:10px 14px;">${escStatusBadge(t.escalationStatus)}</td>
    <td style="padding:10px 14px;font-size:12px;color:#374151;max-width:200px;">${actionsTaken}</td>
  </tr>`;
}

function issueRow(issue: any, idx: number): string {
  const bg = idx % 2 === 0 ? '#f9fafb' : '#ffffff';
  const statusColors: Record<string, { bg: string; color: string }> = {
    'Open':        { bg: '#fee2e2', color: '#dc2626' },
    'In Progress': { bg: '#fef3c7', color: '#ca8a04' },
    'Resolved':    { bg: '#dcfce7', color: '#16a34a' },
  };
  const sc = statusColors[issue.status] || { bg: '#f3f4f6', color: '#6b7280' };
  const raisedBy = issue.raisedByName || issue.raisedById || '—';
  const clientName = issue.client?.name || '—';
  const since = issue.escalatedAt
    ? fmtDate(new Date(issue.escalatedAt))
    : fmtDate(new Date(issue.createdAt));
  return `
  <tr style="background:${bg};border-bottom:1px solid #e5e7eb;">
    <td style="padding:10px 14px;font-size:13px;font-weight:700;color:#111827;">${clientName}</td>
    <td style="padding:10px 14px;font-size:12px;color:#374151;max-width:220px;">${issue.title}</td>
    <td style="padding:10px 14px;font-size:12px;color:#374151;">${raisedBy}</td>
    <td style="padding:10px 14px;font-size:12px;color:#6b7280;white-space:nowrap;">${since}</td>
    <td style="padding:10px 14px;">
      <span style="background:${sc.bg};color:${sc.color};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;">${issue.status}</span>
    </td>
  </tr>`;
}

export async function sendDemoEscalationDigest(): Promise<void> {
  // 1. Pending training escalations
  const pendingTrainings = await prisma.regularTraining.findMany({
    where: {
      demoEscalationRequested: true,
      escalationDemoAckAt:     null,
      status:                  'active',
    },
    select: {
      id: true,
      name: true,
      escalationStatus: true,
      escalationFlaggedAt: true,
      escalationActionsTaken: true,
      client:          { select: { name: true } },
      trainer:         { select: { name: true } },
      hostedByDefault: { select: { name: true } },
    },
    orderBy: { escalationFlaggedAt: 'asc' },
  });

  // 2. Pending issue tracker issues not yet acknowledged by Samita
  const pendingIssues = await prisma.issueTracker.findMany({
    where: {
      escalationLevel:       { gt: 0 },
      acknowledgedBySamitaAt: null,
      status:                { not: 'Resolved' },
    },
    select: {
      id: true,
      title: true,
      status: true,
      raisedByName: true,
      raisedById: true,
      escalationLevel: true,
      escalatedAt: true,
      createdAt: true,
      client: { select: { name: true } },
    },
    orderBy: { escalatedAt: 'asc' },
  });

  const totalPending = pendingTrainings.length + pendingIssues.length;

  if (totalPending === 0) {
    console.log('[demo-escalation-digest] No pending items — skipping email');
    return;
  }

  // Demo team recipients
  const demoTeam = await prisma.user.findMany({
    where: { role: { in: ['demo_lead', 'demo_intake'] }, active: true },
    select: { id: true, name: true, email: true, gmailAddress: true, sendAsAddress: true },
  });

  if (demoTeam.length === 0) {
    console.warn('[demo-escalation-digest] No demo team members found — skipping');
    return;
  }

  const vaibhav = await prisma.user.findUnique({
    where: { id: 'u-vaibhav' },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });
  if (!vaibhav?.gmailAddress || !vaibhav?.smtpAppPassword) {
    console.warn('[demo-escalation-digest] Vaibhav SMTP not configured — skipping');
    return;
  }

  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  });

  const ccUsers = await prisma.user.findMany({
    where: { id: { in: ['u-mitali', 'u-bhavneet'] } },
    select: { email: true, gmailAddress: true, sendAsAddress: true },
  });
  const ccEmails = ccUsers.map((u) => u.sendAsAddress || u.gmailAddress || u.email).filter(Boolean) as string[];

  const toEmails = demoTeam.map((u) => u.sendAsAddress || u.gmailAddress || u.email).filter(Boolean) as string[];
  if (toEmails.length === 0) {
    console.warn('[demo-escalation-digest] No valid email addresses for demo team — skipping');
    return;
  }

  const trainingSection = pendingTrainings.length === 0 ? '' : `
    <!-- Training escalations -->
    <div style="padding:0 32px 8px;">
      <div style="font-size:12px;font-weight:800;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
        <span>📋</span> Training Escalations (${pendingTrainings.length})
      </div>
      <div style="overflow-x:auto;border-radius:10px;border:1px solid #e5e7eb;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Client</th>
              <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Trainer</th>
              <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Coordinator</th>
              <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Flagged On</th>
              <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Status</th>
              <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Actions Taken</th>
            </tr>
          </thead>
          <tbody>
            ${pendingTrainings.map((t, i) => escalationRow(t, i)).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  const issuesSection = pendingIssues.length === 0 ? '' : `
    <!-- Issue tracker escalations -->
    <div style="padding:16px 32px 8px;">
      <div style="font-size:12px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
        <span>🚨</span> Issues Escalated to Demo Team (${pendingIssues.length})
      </div>
      <div style="overflow-x:auto;border-radius:10px;border:1px solid #e5e7eb;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Client</th>
              <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Issue Title</th>
              <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Raised By</th>
              <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Escalated On</th>
              <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${pendingIssues.map((issue, i) => issueRow(issue, i)).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:720px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:28px 32px;">
      <div style="margin-bottom:6px;">
        <span style="font-size:20px;font-weight:800;color:#fbbf24;letter-spacing:-0.02em;">⚠️ Demo Team Escalation Digest</span>
      </div>
      <div style="font-size:13px;color:#94a3b8;">${todayLabel} · 11:00 AM IST</div>
    </div>

    <!-- Summary banner -->
    <div style="background:#fef3c7;border-bottom:1px solid #fde68a;padding:14px 32px;">
      <span style="font-size:13px;color:#92400e;font-weight:600;">
        🔔 ${totalPending} item${totalPending > 1 ? 's' : ''} awaiting your acknowledgment
        ${pendingTrainings.length > 0 ? ` — ${pendingTrainings.length} training escalation${pendingTrainings.length > 1 ? 's' : ''}` : ''}
        ${pendingIssues.length > 0 ? `${pendingTrainings.length > 0 ? ' &amp;' : ' —'} ${pendingIssues.length} issue${pendingIssues.length > 1 ? 's' : ''}` : ''}
      </span>
    </div>

    <div style="padding:24px 0 8px;">
      <p style="font-size:13px;color:#6b7280;margin:0 32px 16px;">
        Please log into the portal to review and acknowledge each item below.
      </p>
      ${trainingSection}
      ${issuesSection}
    </div>

    <!-- CTA -->
    <div style="padding:20px 32px;text-align:center;">
      <a href="https://mits-frontend.onrender.com/issues"
         style="display:inline-block;background:#fbbf24;color:#0a0c12;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:-0.01em;margin-right:10px;">
        Issues →
      </a>
      <a href="https://mits-frontend.onrender.com/my-sessions"
         style="display:inline-block;background:#1e293b;color:#fbbf24;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:-0.01em;">
        Training Escalations →
      </a>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
      <p style="font-size:11px;color:#9ca3af;margin:0;">
        Automated daily digest from MITS Consulting Hub · Sent at 11:00 AM IST
      </p>
    </div>
  </div>
</body>
</html>`;

  const fromUser = safeBuildFromUser(vaibhav);
  const [primaryTo, ...ccRest] = toEmails;
  const allCc = [...ccRest, ...ccEmails];

  await sendEmail({
    to: primaryTo,
    cc: allCc.length > 0 ? allCc : undefined,
    subject: `⚠️ Demo Escalation Digest — ${totalPending} pending · ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })}`,
    body: `Demo Escalation Digest — ${totalPending} pending items (${pendingTrainings.length} training escalations, ${pendingIssues.length} issues). Please view in the portal.`,
    htmlBody: html,
    fromUser,
  });

  console.log(`[demo-escalation-digest] Sent to ${toEmails.join(', ')} — ${pendingTrainings.length} training escalations, ${pendingIssues.length} issues`);
}
