/**
 * Daily briefing emails — sent automatically on a schedule to help each team
 * start their shift knowing exactly what needs action.
 *
 * Team 2 (Anjali + Taran)  → 6 AM IST + 6 PM IST  — demo pipeline items
 * Team 1 (Aman + Kanchan)  → 9 AM IST + 4 PM IST  — sourcing / recruiter items
 *
 * CC: manager of that team + Vaibhav (founder) on every send.
 */

import { prisma } from './prisma';
import { sendEmail } from './mailer';

// ── IST offset helpers ────────────────────────────────────────────────────────

/** Returns current time as { h, m } in IST (UTC+5:30). */
function nowIST() {
  const utc = new Date();
  const ist = new Date(utc.getTime() + 5.5 * 60 * 60 * 1000);
  return { h: ist.getUTCHours(), m: ist.getUTCMinutes() };
}

/** Returns today's date string in IST (YYYY-MM-DD). */
function todayIST(): string {
  const utc = new Date();
  const ist = new Date(utc.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); }
  catch { return d; }
}

/** Days since a date (positive = past, 0 = today). */
function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  try {
    const ms = new Date(todayIST()).getTime() - new Date(iso.slice(0, 10)).getTime();
    return Math.floor(ms / 86400000);
  } catch { return 0; }
}

/** Urgency tier based on days pending. */
function urgency(days: number): { label: string; bg: string; text: string; dot: string } {
  if (days >= 3) return { label: `${days}d overdue`, bg: '#3d1010', text: '#ff6b6b', dot: '#ef4444' };
  if (days === 2) return { label: '2d pending',   bg: '#2d1f00', text: '#fbbf24', dot: '#f59e0b' };
  if (days === 1) return { label: '1d pending',   bg: '#1a2010', text: '#86efac', dot: '#22c55e' };
  return              { label: 'today',           bg: '#0f1e2d', text: '#7dd3fc', dot: '#38bdf8' };
}

/** Truncate skills to first 2 comma-separated tokens, max 20 chars each. */
function shortSkill(s?: string | null): string {
  if (!s) return '';
  return s.split(',').slice(0, 2).map(t => t.trim().slice(0, 20)).join(', ');
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * A compact item row: name | skill chip | days badge — no long text.
 * stageEnteredAt drives the urgency colour.
 */
function itemRow(name: string, skill: string | null | undefined, stageEnteredAt: string | null | undefined, action: string): string {
  const days = daysSince(stageEnteredAt);
  const u = urgency(days);
  const skillChip = skill ? `<span style="font-size:11px;color:#6b6f78;background:#1e2028;padding:1px 7px;border-radius:4px;margin-left:6px;">${esc(shortSkill(skill))}</span>` : '';
  return `
    <tr>
      <td style="padding:7px 0;border-bottom:1px solid #1e2028;vertical-align:middle;">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${u.dot};margin-right:8px;vertical-align:middle;"></span>
        <span style="font-weight:600;color:#f0f0f0;font-size:14px;">${esc(name)}</span>
        ${skillChip}
      </td>
      <td style="padding:7px 0;border-bottom:1px solid #1e2028;text-align:right;white-space:nowrap;vertical-align:middle;">
        <span style="font-size:11px;font-weight:700;color:${u.text};background:${u.bg};padding:2px 8px;border-radius:4px;margin-right:6px;">${esc(u.label)}</span>
        <span style="font-size:11px;color:#4a4d56;text-transform:uppercase;letter-spacing:.05em;">${esc(action)}</span>
      </td>
    </tr>`;
}

function sectionHtml(title: string, color: string, rows: string[], count: number): string {
  if (!rows.length) return '';
  return `
    <div style="margin:0 0 20px;border-left:3px solid ${color};padding-left:12px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${color};margin-bottom:8px;">
        ${esc(title)} <span style="font-weight:400;color:#4a4d56;">(${count})</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${rows.join('')}
      </table>
    </div>`;
}

function summaryBar(sections: Array<{ label: string; count: number; color: string }>): string {
  const chips = sections.filter(s => s.count > 0).map(s =>
    `<span style="display:inline-block;background:${s.color}22;color:${s.color};font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px;margin:2px 4px 2px 0;">${s.count} ${esc(s.label)}</span>`
  ).join('');
  return chips ? `<div style="margin:0 0 24px;">${chips}</div>` : '';
}

function emailWrapper(recipientName: string, shift: string, date: string, totalItems: number, summary: string, sections: string, emptyCopy: string): string {
  const hasContent = sections.trim().length > 0;
  const urgencyLine = totalItems >= 5
    ? `<div style="margin-top:6px;font-size:12px;font-weight:700;color:#ef4444;letter-spacing:.04em;">⚠ ${totalItems} items need action — prioritise now</div>`
    : totalItems > 0
    ? `<div style="margin-top:6px;font-size:12px;color:#f59e0b;">${totalItems} item${totalItems !== 1 ? 's' : ''} pending</div>`
    : `<div style="margin-top:6px;font-size:12px;color:#22c55e;">✓ All clear</div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0d0f12;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#e8e8e8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0f12;padding:20px 0;">
    <tr><td align="center">
      <table role="presentation" width="580" style="max-width:580px;width:100%;background:#16181e;border-radius:10px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="background:#1a1d24;padding:20px 24px 16px;border-bottom:1px solid #2a2d35;">
          <div style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#4a4d56;">MITS · Daily Briefing · ${shift === 'morning' ? 'Morning' : 'Evening'}</div>
          <div style="font-size:20px;font-weight:800;color:#f0f0f0;margin-top:4px;">${esc(recipientName)} — ${esc(date)}</div>
          ${urgencyLine}
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:20px 24px;">
          ${hasContent ? `${summary}${sections}` : `
            <div style="text-align:center;padding:28px 0;">
              <div style="font-size:32px;margin-bottom:8px;">🎉</div>
              <div style="font-size:16px;font-weight:700;color:#f0f0f0;">All clear!</div>
              <p style="color:#6b6f78;font-size:13px;margin-top:4px;">${esc(emptyCopy)}</p>
            </div>
          `}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:12px 24px;border-top:1px solid #1e2028;background:#13151a;">
          <span style="font-size:11px;color:#4a4d56;"><b style="color:#6b6f78;">MITS</b> · Automated briefing · Do not reply</span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── Team 2 briefing (Anjali + Taran) — each person gets their own email ───────

export async function sendTeam2Briefing(shift: 'morning' | 'evening') {
  const today = todayIST();

  // CC: Samita + Vaibhav
  const ccUsers = await prisma.user.findMany({
    where: { id: { in: ['u-samita', 'u-vaibhav'] } },
    select: { gmailAddress: true, sendAsAddress: true, email: true },
  });
  const ccAddresses = ccUsers.map(u => u.sendAsAddress || u.gmailAddress || u.email).filter(Boolean) as string[];

  const recipients = await prisma.user.findMany({
    where: { id: { in: ['u-anjali', 'u-taran'] } },
    select: { id: true, name: true, gmailAddress: true, sendAsAddress: true, email: true },
  });

  const dateLabel = new Date(today).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  for (const recipient of recipients) {
    const toEmail = recipient.sendAsAddress || recipient.gmailAddress || recipient.email;
    if (!toEmail) continue;

    // Clients this person owns
    const myClients = await prisma.client.findMany({
      where: {
        lifecycle: {
          in: ['IntakeSent', 'IntakeReceived', 'InternalSearch', 'WithRecruiters',
               'VerificationPending', 'DemoScheduled', 'DemoDone', 'FeedbackPending'],
        },
        intakeOwnerId: recipient.id,
      },
      select: {
        id: true, name: true, lifecycle: true, intakeSkillHint: true,
        demoDate: true, demoTimeIst: true, stageEnteredAt: true,
      },
      orderBy: { stageEnteredAt: 'asc' },
    });

    // Proposals pending verification (shared — both can action these)
    const pendingVerifications = await prisma.proposal.findMany({
      where: { verification: 'Pending', trainerNotifiedAt: { not: null } },
      include: {
        request: { select: { client: { select: { name: true } } } },
        trainer: { select: { name: true } },
      },
      orderBy: { proposedAt: 'asc' },
      take: 20,
    });

    const demoToday = myClients.filter(c => c.lifecycle === 'DemoScheduled' && c.demoDate === today);
    const intakeReceived = myClients.filter(c => c.lifecycle === 'IntakeReceived');
    const intakeSent = myClients.filter(c => c.lifecycle === 'IntakeSent');
    const internalSearch = myClients.filter(c => ['InternalSearch', 'WithRecruiters'].includes(c.lifecycle));
    const verPending = myClients.filter(c => c.lifecycle === 'VerificationPending');
    const demoScheduled = myClients.filter(c => c.lifecycle === 'DemoScheduled' && c.demoDate !== today);
    const feedbackPending = myClients.filter(c => ['DemoDone', 'FeedbackPending'].includes(c.lifecycle));

    const sectionDefs = [
      { items: demoToday,          label: "Today's Demos",          color: '#22c55e', action: 'DEMO TODAY' },
      { items: intakeReceived,     label: 'Intake Received',        color: '#f59e0b', action: 'PROCESS'   },
      { items: pendingVerifications.map(p => ({ name: (p as any).request?.client?.name || '—', intakeSkillHint: `Trainer: ${(p as any).trainer?.name || p.trainerName || '—'}`, stageEnteredAt: p.proposedAt?.toString() })),
                                   label: 'Verify Trainer',         color: '#6366f1', action: 'VERIFY'    },
      { items: feedbackPending,    label: 'Feedback Needed',        color: '#ec4899', action: 'FEEDBACK'  },
      { items: verPending,         label: 'Verification Pending',   color: '#f97316', action: 'VER PENDING'},
      { items: internalSearch,     label: 'With Recruiters',        color: '#0ea5e9', action: 'FOLLOW UP' },
      { items: intakeSent,         label: 'Intake Sent — Awaiting', color: '#64748b', action: 'WAITING'   },
      { items: demoScheduled,      label: 'Upcoming Demos',         color: '#06b6d4', action: 'SCHEDULED' },
    ];

    const sections: string[] = [];
    for (const s of sectionDefs) {
      if (!s.items.length) continue;
      sections.push(sectionHtml(s.label, s.color,
        s.items.map(c => itemRow(c.name, (c as any).intakeSkillHint, (c as any).stageEnteredAt, s.action)),
        s.items.length,
      ));
    }

    const totalItems = myClients.length + pendingVerifications.length;
    const subject = totalItems > 0
      ? `[MITS] ${shift === 'morning' ? '🌅' : '🌙'} ${totalItems} pending · ${recipient.name.split(' ')[0]} · ${today}`
      : `[MITS] ${shift === 'morning' ? '🌅' : '🌙'} All clear · ${today}`;

    const summaryChips = summaryBar(sectionDefs.map(s => ({ label: s.label, count: s.items.length, color: s.color })));

    const html = emailWrapper(
      recipient.name.split(' ')[0],
      shift,
      dateLabel,
      totalItems,
      summaryChips,
      sections.join(''),
      'No pending items. Great job keeping up!',
    );

    await sendEmail({
      to: toEmail,
      subject,
      body: `Daily briefing for ${recipient.name} — ${totalItems} items need attention. View in HTML-capable email client.`,
      htmlBody: html,
      cc: ccAddresses.filter(e => e !== toEmail),
    });

    console.log(`[briefing] Team 2 ${shift} → ${recipient.name} (${toEmail}) — ${totalItems} items`);
  }
}

// ── Team 1 briefing (Aman + Kanchan) — each person gets their own email ───────

export async function sendTeam1Briefing(shift: 'morning' | 'evening') {
  const today = todayIST();

  // CC: Samita + Vaibhav
  const ccUsers = await prisma.user.findMany({
    where: { id: { in: ['u-samita', 'u-vaibhav'] } },
    select: { gmailAddress: true, sendAsAddress: true, email: true },
  });
  const ccAddresses = ccUsers.map(u => u.sendAsAddress || u.gmailAddress || u.email).filter(Boolean) as string[];

  const recipients = await prisma.user.findMany({
    where: { id: { in: ['u-aman', 'u-kanchan'] } },
    select: { id: true, name: true, gmailAddress: true, sendAsAddress: true, email: true },
  });

  const dateLabel = new Date(today).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  // Open sourcing requests are shared (routed to the team, not person-specific)
  const openRequests = await prisma.sourcingRequest.findMany({
    where: { status: 'Open', sentToId: { in: ['u-aman', 'u-kanchan'] } },
    include: { client: { select: { name: true, intakeSkillHint: true } }, sentTo: { select: { id: true } } },
    orderBy: { createdAt: 'asc' },
  });

  for (const recipient of recipients) {
    const toEmail = recipient.sendAsAddress || recipient.gmailAddress || recipient.email;
    if (!toEmail) continue;

    // Open requests routed specifically to this person
    const myOpenRequests = openRequests.filter(r => r.sentTo?.id === recipient.id);

    // Proposals this person submitted that are still unnotified
    const myPendingProposals = await prisma.proposal.findMany({
      where: {
        verification: 'Pending',
        proposedById: recipient.id,
        trainerNotifiedAt: null,
      },
      include: {
        request: { select: { client: { select: { name: true } } } },
        trainer: { select: { name: true, skills: true } },
      },
      orderBy: { proposedAt: 'asc' },
    });

    // Trainer leads owned by this person
    const myLeads = await prisma.trainerLead.findMany({
      where: {
        stage: { in: ['New', 'Contacted', 'Vetting'] },
        recruiterId: recipient.id,
      },
      orderBy: { createdAt: 'asc' },
      take: 30,
    });

    const newLeads = myLeads.filter(l => l.stage === 'New');
    const vettingLeads = myLeads.filter(l => l.stage === 'Vetting');
    const contactedLeads = myLeads.filter(l => l.stage === 'Contacted');

    const sectionDefs = [
      { items: myOpenRequests.map(r => ({ name: r.client?.name || '—', intakeSkillHint: r.client?.intakeSkillHint, stageEnteredAt: r.createdAt?.toString() })),
                                    label: 'Propose Trainers',     color: '#ef4444', action: 'PROPOSE NOW' },
      { items: myPendingProposals.map(p => ({ name: (p as any).request?.client?.name || '—', intakeSkillHint: `Trainer: ${(p as any).trainer?.name || p.trainerName || '—'}`, stageEnteredAt: p.proposedAt?.toString() })),
                                    label: 'Notify Trainer',       color: '#f59e0b', action: 'NOTIFY'      },
      { items: newLeads.map(l => ({ name: l.name, intakeSkillHint: l.skills, stageEnteredAt: l.createdAt?.toString() })),
                                    label: 'New Leads',            color: '#6366f1', action: 'CONTACT'     },
      { items: vettingLeads.map(l => ({ name: l.name, intakeSkillHint: l.skills, stageEnteredAt: l.createdAt?.toString() })),
                                    label: 'Leads in Vetting',     color: '#0ea5e9', action: 'VETTING'     },
      { items: contactedLeads.map(l => ({ name: l.name, intakeSkillHint: l.skills, stageEnteredAt: l.createdAt?.toString() })),
                                    label: 'Leads — Follow Up',    color: '#64748b', action: 'FOLLOW UP'   },
    ];

    const sections: string[] = [];
    for (const s of sectionDefs) {
      if (!s.items.length) continue;
      sections.push(sectionHtml(s.label, s.color,
        s.items.map(c => itemRow(c.name, c.intakeSkillHint, c.stageEnteredAt, s.action)),
        s.items.length,
      ));
    }

    const totalItems = myOpenRequests.length + myPendingProposals.length + myLeads.length;
    const subject = totalItems > 0
      ? `[MITS] ${shift === 'morning' ? '🌅' : '🌙'} ${totalItems} pending · ${recipient.name.split(' ')[0]} · ${today}`
      : `[MITS] ${shift === 'morning' ? '🌅' : '🌙'} All clear · ${today}`;

    const summaryChips = summaryBar(sectionDefs.map(s => ({ label: s.label, count: s.items.length, color: s.color })));

    const html = emailWrapper(
      recipient.name.split(' ')[0],
      shift,
      dateLabel,
      totalItems,
      summaryChips,
      sections.join(''),
      'No open requests or pending actions. Great work!',
    );

    await sendEmail({
      to: toEmail,
      subject,
      body: `Daily briefing for ${recipient.name} — ${totalItems} items need attention. View in HTML-capable email client.`,
      htmlBody: html,
      cc: ccAddresses.filter(e => e !== toEmail),
    });

    console.log(`[briefing] Team 1 ${shift} → ${recipient.name} (${toEmail}) — ${totalItems} items`);
  }
}
