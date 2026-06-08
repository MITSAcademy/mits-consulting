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

// ── HTML helpers ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sectionHtml(title: string, color: string, rows: string[]): string {
  if (!rows.length) return '';
  return `
    <div style="margin:0 0 24px;">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${color};margin-bottom:10px;">${esc(title)}</div>
      <table style="width:100%;border-collapse:collapse;">
        ${rows.join('')}
      </table>
    </div>`;
}

function row(client: string, detail: string, badge: string, badgeColor: string, extra = ''): string {
  return `
    <tr style="border-bottom:1px solid #2a2d35;">
      <td style="padding:8px 6px;font-weight:600;color:#f0f0f0;font-size:14px;">${esc(client)}</td>
      <td style="padding:8px 6px;color:#9aa0a6;font-size:13px;">${esc(detail)}</td>
      <td style="padding:8px 6px;white-space:nowrap;">
        <span style="background:${badgeColor};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;">${esc(badge)}</span>
        ${extra}
      </td>
    </tr>`;
}

function emailWrapper(recipientName: string, shift: string, date: string, sections: string, emptyCopy: string): string {
  const hasContent = sections.trim().length > 0;
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0d0f12;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#e8e8e8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0f12;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="620" style="max-width:620px;width:100%;background:#16181e;border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1a1d24 0%,#1e2430 100%);padding:24px 28px 20px;border-bottom:1px solid #2a2d35;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6b6f78;margin-bottom:6px;">MITS Solution · Daily Briefing</div>
          <div style="font-size:22px;font-weight:800;color:#f0f0f0;line-height:1.2;">Good ${shift === 'morning' ? 'Morning' : 'Evening'}, ${esc(recipientName)} 👋</div>
          <div style="font-size:13px;color:#6b6f78;margin-top:4px;">${esc(date)} · ${shift === 'morning' ? 'Start-of-day priorities' : 'End-of-day wrap-up'}</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:24px 28px;">
          ${hasContent ? `
            <p style="margin:0 0 20px;font-size:14px;color:#9aa0a6;line-height:1.6;">
              Here's what needs your attention ${shift === 'morning' ? 'before you start your day' : 'before you wrap up'}. Tackle the highlighted items first.
            </p>
            ${sections}
          ` : `
            <div style="text-align:center;padding:32px 0;">
              <div style="font-size:36px;margin-bottom:12px;">🎉</div>
              <div style="font-size:18px;font-weight:700;color:#f0f0f0;">All clear!</div>
              <p style="color:#6b6f78;font-size:14px;margin-top:6px;">${esc(emptyCopy)}</p>
            </div>
          `}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 28px;border-top:1px solid #2a2d35;background:#13151a;">
          <div style="font-size:12px;color:#4a4d56;line-height:1.6;">
            <span style="font-weight:800;color:#6b6f78;">MITS</span> &nbsp;·&nbsp; Automated briefing &nbsp;·&nbsp; Do not reply
          </div>
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

    const sections: string[] = [];

    if (demoToday.length) {
      sections.push(sectionHtml("🎯 Today's Demos", '#22c55e', demoToday.map(c =>
        row(c.name, `${c.demoTimeIst || '?'} IST · ${c.intakeSkillHint || '—'}`, 'TODAY', '#16a34a')
      )));
    }

    if (intakeReceived.length) {
      sections.push(sectionHtml('📥 Intake Received — Process Now', '#f59e0b', intakeReceived.map(c =>
        row(c.name, c.intakeSkillHint || 'Skills not filled', 'INTAKE IN', '#d97706',
          `<span style="font-size:11px;color:#6b6f78;margin-left:6px;">Since ${fmtDate(c.stageEnteredAt)}</span>`)
      )));
    }

    if (pendingVerifications.length) {
      sections.push(sectionHtml('✅ Trainer Verifications Pending', '#6366f1', pendingVerifications.map(p =>
        row((p as any).request?.client?.name || '—', `Trainer: ${(p as any).trainer?.name || p.trainerName || '—'}`, 'VERIFY', '#4f46e5')
      )));
    }

    if (intakeSent.length) {
      sections.push(sectionHtml('📤 Intake Form Sent — Awaiting Reply', '#64748b', intakeSent.map(c =>
        row(c.name, c.intakeSkillHint || '—', 'WAITING', '#475569',
          `<span style="font-size:11px;color:#6b6f78;margin-left:6px;">Since ${fmtDate(c.stageEnteredAt)}</span>`)
      )));
    }

    if (internalSearch.length) {
      sections.push(sectionHtml('🔍 With Recruiters / Internal Search', '#0ea5e9', internalSearch.map(c =>
        row(c.name, c.intakeSkillHint || '—', c.lifecycle === 'WithRecruiters' ? 'RECRUITERS' : 'SEARCHING', '#0284c7',
          `<span style="font-size:11px;color:#6b6f78;margin-left:6px;">Since ${fmtDate(c.stageEnteredAt)}</span>`)
      )));
    }

    if (verPending.length) {
      sections.push(sectionHtml('⏳ Verification Pending', '#f97316', verPending.map(c =>
        row(c.name, c.intakeSkillHint || '—', 'VER PENDING', '#ea580c')
      )));
    }

    if (feedbackPending.length) {
      sections.push(sectionHtml('💬 Demo Done — Feedback Needed', '#ec4899', feedbackPending.map(c =>
        row(c.name, c.intakeSkillHint || '—', 'FEEDBACK', '#db2777',
          `<span style="font-size:11px;color:#6b6f78;margin-left:6px;">Since ${fmtDate(c.stageEnteredAt)}</span>`)
      )));
    }

    if (demoScheduled.length) {
      sections.push(sectionHtml('📅 Upcoming Demos', '#06b6d4', demoScheduled.map(c =>
        row(c.name, `${fmtDate(c.demoDate)} · ${c.demoTimeIst || '?'} IST`, 'SCHEDULED', '#0891b2')
      )));
    }

    const totalItems = myClients.length + pendingVerifications.length;
    const subject = totalItems > 0
      ? `[MITS] ${shift === 'morning' ? '🌅 Morning' : '🌙 Evening'} Briefing · ${totalItems} item${totalItems !== 1 ? 's' : ''} need attention · ${today}`
      : `[MITS] ${shift === 'morning' ? '🌅 Morning' : '🌙 Evening'} Briefing · All clear for ${today}`;

    const html = emailWrapper(
      recipient.name,
      shift,
      dateLabel,
      sections.join(''),
      'No pending items right now. Great job keeping up!',
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

    const sections: string[] = [];

    if (myOpenRequests.length) {
      sections.push(sectionHtml('🚨 Open Sourcing Requests — Propose Trainers', '#ef4444', myOpenRequests.map(r =>
        row(r.client?.name || '—', r.client?.intakeSkillHint || '—', 'PROPOSE NOW', '#dc2626')
      )));
    }

    if (myPendingProposals.length) {
      sections.push(sectionHtml('📣 Your Proposals — Notify Trainer', '#f59e0b', myPendingProposals.map(p =>
        row(
          (p as any).request?.client?.name || '—',
          `Trainer: ${(p as any).trainer?.name || p.trainerName || '—'}`,
          'NOTIFY TRAINER',
          '#d97706',
        )
      )));
    }

    const newLeads = myLeads.filter(l => l.stage === 'New');
    const vettingLeads = myLeads.filter(l => l.stage === 'Vetting');
    const contactedLeads = myLeads.filter(l => l.stage === 'Contacted');

    if (newLeads.length) {
      sections.push(sectionHtml('🆕 New Trainer Leads — Contact Today', '#6366f1', newLeads.map(l =>
        row(l.name, l.skills || '—', 'NEW', '#4f46e5',
          `<span style="font-size:11px;color:#6b6f78;margin-left:6px;">₹${l.expectedRateInr || '?'}/hr</span>`)
      )));
    }

    if (vettingLeads.length) {
      sections.push(sectionHtml('🔎 Trainer Leads in Vetting', '#0ea5e9', vettingLeads.map(l =>
        row(l.name, l.skills || '—', 'VETTING', '#0284c7',
          `<span style="font-size:11px;color:#6b6f78;margin-left:6px;">₹${l.expectedRateInr || '?'}/hr</span>`)
      )));
    }

    if (contactedLeads.length) {
      sections.push(sectionHtml('📞 Trainer Leads Contacted — Follow Up', '#64748b', contactedLeads.map(l =>
        row(l.name, l.skills || '—', 'FOLLOW UP', '#475569',
          `<span style="font-size:11px;color:#6b6f78;margin-left:6px;">₹${l.expectedRateInr || '?'}/hr</span>`)
      )));
    }

    const totalItems = myOpenRequests.length + myPendingProposals.length + myLeads.length;
    const subject = totalItems > 0
      ? `[MITS] ${shift === 'morning' ? '🌅 Morning' : '🌙 Evening'} Briefing · ${totalItems} item${totalItems !== 1 ? 's' : ''} need attention · ${today}`
      : `[MITS] ${shift === 'morning' ? '🌅 Morning' : '🌙 Evening'} Briefing · All clear for ${today}`;

    const html = emailWrapper(
      recipient.name,
      shift,
      dateLabel,
      sections.join(''),
      'No open requests or pending trainer actions. Great work!',
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
