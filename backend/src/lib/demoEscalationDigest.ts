/**
 * Daily demo escalation digest — sent at 11:00 AM IST.
 *
 * Compiles all RegularTraining escalations that are still pending
 * acknowledgment by the demo team and emails Samita + Anjali + Taran.
 *
 * An escalation is "pending" when demoEscalationRequested = true
 * and escalationDemoAckAt IS NULL.
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

export async function sendDemoEscalationDigest(): Promise<void> {
  // Fetch all pending escalations (demoEscalationRequested = true, not yet acked)
  const pending = await prisma.regularTraining.findMany({
    where: {
      demoEscalationRequested: true,
      escalationDemoAckAt:     null,
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

  if (pending.length === 0) {
    console.log('[demo-escalation-digest] No pending escalations — skipping email');
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

  // Use Vaibhav's Gmail as the sender (system email)
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

  const rows = pending.map((t, i) => escalationRow(t, i)).join('');
  const toEmails = demoTeam.map((u) => u.sendAsAddress || u.gmailAddress || u.email).filter(Boolean) as string[];
  if (toEmails.length === 0) {
    console.warn('[demo-escalation-digest] No valid email addresses for demo team — skipping');
    return;
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:700px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);padding:28px 32px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-size:22px;">⚠️</span>
        <span style="font-size:20px;font-weight:800;color:#fbbf24;letter-spacing:-0.02em;">Demo Escalation Digest</span>
      </div>
      <div style="font-size:13px;color:#94a3b8;">${todayLabel} · 11:00 AM IST</div>
    </div>

    <!-- Summary banner -->
    <div style="background:#fef3c7;border-bottom:1px solid #fde68a;padding:14px 32px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:18px;">🔔</span>
      <span style="font-size:13px;color:#92400e;font-weight:600;">
        ${pending.length} training${pending.length > 1 ? 's' : ''} awaiting demo team acknowledgment
      </span>
    </div>

    <!-- Table -->
    <div style="padding:24px 32px;">
      <p style="font-size:13px;color:#6b7280;margin:0 0 16px;">
        The following escalations have been raised by the coordinator team and are pending your response.
        Please log into the portal to acknowledge and update each one.
      </p>

      <div style="overflow-x:auto;border-radius:10px;border:1px solid #e5e7eb;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Client</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Trainer</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Coordinator</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Flagged On</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Status</th>
              <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e5e7eb;">Actions Taken</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <!-- CTA -->
      <div style="margin-top:24px;text-align:center;">
        <a href="https://mits-frontend.onrender.com/issues"
           style="display:inline-block;background:#fbbf24;color:#0a0c12;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:-0.01em;">
          View &amp; Acknowledge in Portal →
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
      <p style="font-size:11px;color:#9ca3af;margin:0;">
        This is an automated daily digest from MITS Consulting Hub · Sent at 11:00 AM IST
      </p>
    </div>
  </div>
</body>
</html>`;

  const fromUser = safeBuildFromUser(vaibhav);
  const [primaryTo, ...ccRest] = toEmails;

  await sendEmail({
    to: primaryTo,
    cc: ccRest.length > 0 ? ccRest : undefined,
    subject: `⚠️ Demo Escalation Digest — ${pending.length} pending · ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })}`,
    body: `Demo Escalation Digest — ${pending.length} pending escalations. Please view in the portal.`,
    htmlBody: html,
    fromUser,
  });

  console.log(`[demo-escalation-digest] Sent to ${toEmails.join(', ')} — ${pending.length} escalations`);
}
