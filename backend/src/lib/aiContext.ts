/**
 * Build an AI-friendly snapshot tailored to the requesting user's role.
 *
 * Permission model — same shape as the rest of the app:
 *   founder / manager    → full org-wide view (everything)
 *   demo_lead (Samita)   → demo intake queue + feedback queue + handoffs
 *   demo_intake (Anjali, Taran) → their own intake/demo clients
 *   recruiter (Aman, Kanchan)    → their sourcing requests + trainers
 *   sales_closer (Roshni)        → her sales-close queue + renewals
 *   account_manager (Muskan, Kashish) → their hosted clients
 *   accounts (Areena, Ashok)     → payments-related view
 *   payment_processor (Malika)    → payment-processing view
 *
 * Everyone sees: org pipeline counts, their own activity today, the
 * 7-step Roshni workflow vocabulary.
 *
 * PII stripped: phone numbers, raw emails, addresses — the AI doesn't need
 * them to answer "how many", "who has", "tell me about <client>" questions.
 *
 * Cached for 60s PER USER (role+id combo) so a follow-up question doesn't
 * re-query the DB but different users get different context.
 */
import { prisma } from './prisma';

interface CachedContext { text: string; builtAt: number; }
const CACHE_TTL_MS = 60_000;
const cacheByUser = new Map<string, CachedContext>();

type Role = string;
const FULL_ACCESS: Role[] = ['founder', 'manager'];
const isFull = (role: Role) => FULL_ACCESS.includes(role);

export async function buildMitsContext(user: { id: string; role: Role; name: string }): Promise<string> {
  const cacheKey = `${user.id}::${user.role}`;
  const c = cacheByUser.get(cacheKey);
  if (c && Date.now() - c.builtAt < CACHE_TTL_MS) return c.text;

  const today = new Date().toISOString().slice(0, 10);
  const todayStart = new Date(today + 'T00:00:00Z');
  const inSevenDays = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();

  const lines: string[] = [];
  lines.push(`LIVE SNAPSHOT  (asof ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC,  for ${user.name} — role: ${user.role})`);
  lines.push('');

  // ── 1. Org pipeline counts — everyone sees these ────────────────────────
  const pipelineCounts = await prisma.client.groupBy({ by: ['lifecycle'], _count: { _all: true } });
  lines.push('## Org pipeline (all clients)');
  for (const r of pipelineCounts) lines.push(`  ${r.lifecycle}: ${r._count._all}`);
  lines.push('');

  // ── 2. Per-user permissioned client index ───────────────────────────────
  // Build the client-filter WHERE clause based on what this role legitimately
  // needs. Full-access roles see everything; others see only their own.
  const clientWhere = isFull(user.role)
    ? { lifecycle: { notIn: ['Churned', 'Completed'] as any } }
    : buildPermissionedClientWhere(user);

  const clientLimit = isFull(user.role) ? 300 : 200;

  const visibleClients = clientWhere
    ? await prisma.client.findMany({
        where: clientWhere,
        select: {
          name: true,
          lifecycle: true,
          engagementType: true,
          currency: true,
          cycleAmount: true,
          saleClosingSubStatus: true,
          source: true,
          demoDate: true,
          demoTimeIst: true,
          intakeOwner:    { select: { name: true } },
          salesOwner:     { select: { name: true } },
          hostOwner:      { select: { name: true } },
          primaryTrainer: { select: { name: true } },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: clientLimit,
      })
    : [];

  if (visibleClients.length > 0) {
    lines.push(`## Clients you can see (${visibleClients.length}${isFull(user.role) ? ', most-recent first' : ', filtered by your role'})`);
    lines.push('  Format: NAME | stage | engagement | amount | sub | source | trainer | intake/sales/host owner | demo | created');
    for (const c of visibleClients) {
      const owners = [
        c.intakeOwner?.name ? `intake:${c.intakeOwner.name}` : null,
        c.salesOwner?.name  ? `sales:${c.salesOwner.name}`   : null,
        c.hostOwner?.name   ? `host:${c.hostOwner.name}`     : null,
      ].filter(Boolean).join(', ');
      const amount = c.cycleAmount ? `${c.currency} ${c.cycleAmount}` : '—';
      const demo = c.demoDate ? `${c.demoDate}${c.demoTimeIst ? ' ' + c.demoTimeIst : ''}` : '—';
      const sub = c.saleClosingSubStatus || '—';
      const created = c.createdAt.toISOString().slice(0, 10);
      lines.push(`  ${c.name} | ${c.lifecycle} | ${c.engagementType} | ${amount} | ${sub} | ${c.source || '—'} | ${c.primaryTrainer?.name || '—'} | ${owners || '—'} | demo:${demo} | ${created}`);
    }
    lines.push('');
  } else if (clientWhere === null) {
    lines.push("## Clients — your role doesn't own client records directly.");
    lines.push('');
  } else {
    lines.push('## Clients you own — none right now.');
    lines.push('');
  }

  // ── 3. Sub-status breakdown — relevant for Roshni + leadership ──────────
  if (isFull(user.role) || user.role === 'sales_closer') {
    const subStatusCounts = await prisma.client.groupBy({
      by: ['saleClosingSubStatus'],
      _count: { _all: true },
      where: {
        lifecycle: { in: ['SaleClosing', 'SaleWon'] },
        ...(isFull(user.role) ? {} : { salesOwnerId: user.id }),
      },
    });
    if (subStatusCounts.length > 0) {
      lines.push(`## Sales-close sub-status${isFull(user.role) ? '' : ' (yours)'}`);
      for (const r of subStatusCounts) lines.push(`  ${r.saleClosingSubStatus || '(unset)'}: ${r._count._all}`);
      lines.push('');
    }
  }

  // ── 4. Trainer pool — recruiters + leadership ───────────────────────────
  if (isFull(user.role) || user.role === 'recruiter' || user.role === 'demo_intake' || user.role === 'demo_lead') {
    const trainers = await prisma.trainer.findMany({
      where: { active: true },
      select: {
        name: true,
        skills: true,
        experienceYears: true,
        defaultRateInr: true,
        rateModel: true,
      },
      orderBy: { name: 'asc' },
      take: 80,
    });
    if (trainers.length > 0) {
      lines.push(`## Trainer pool (${trainers.length} active)`);
      for (const t of trainers) {
        const skills = (t.skills || '').slice(0, 80);
        lines.push(`  ${t.name} | ${t.experienceYears ?? '?'}y | ₹${t.defaultRateInr || '?'}/${t.rateModel} | ${skills}`);
      }
      lines.push('');
    }
  }

  // ── 5. Sourcing requests — recruiters + leadership ──────────────────────
  if (isFull(user.role) || user.role === 'recruiter' || user.role === 'demo_intake' || user.role === 'demo_lead') {
    const sourcingWhere = isFull(user.role)
      ? { status: { in: ['Open', 'Proposed'] as any } }
      : { status: { in: ['Open', 'Proposed'] as any }, sentToId: user.id };
    const sourcingReqs = await prisma.sourcingRequest.findMany({
      where: sourcingWhere,
      select: {
        status: true,
        sentAt: true,
        client:   { select: { name: true, lifecycle: true } },
        sentTo:   { select: { name: true } },
        proposals: { select: { trainer: { select: { name: true } }, verification: true } },
      },
      orderBy: { sentAt: 'desc' },
      take: 50,
    });
    if (sourcingReqs.length > 0) {
      lines.push(`## Open sourcing requests${isFull(user.role) ? '' : ' (assigned to you)'}`);
      for (const r of sourcingReqs) {
        const proposalSummary = r.proposals.length === 0
          ? 'no proposals'
          : r.proposals.map((p) => `${p.trainer?.name || '?'}:${p.verification}`).join(', ');
        lines.push(`  ${r.client.name} (${r.client.lifecycle}) | ${r.status} | sent ${r.sentAt} → ${r.sentTo?.name || '?'} | ${proposalSummary}`);
      }
      lines.push('');
    }
  }

  // ── 6. Demos scheduled in the next 7 days — demo_intake + leadership ────
  if (isFull(user.role) || user.role === 'demo_intake' || user.role === 'demo_lead') {
    const demos = await prisma.demo.findMany({
      where: {
        status: { in: ['Scheduled', 'Rescheduled'] },
        scheduledDate: { gte: today, lte: inSevenDays },
      },
      select: {
        scheduledDate: true,
        scheduledTimeIst: true,
        status: true,
        client:  { select: { name: true } },
        trainer: { select: { name: true } },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTimeIst: 'asc' }],
      take: 50,
    });
    if (demos.length > 0) {
      lines.push(`## Demos in next 7 days (${demos.length})`);
      for (const d of demos) {
        lines.push(`  ${d.scheduledDate} ${d.scheduledTimeIst || ''} IST | ${d.client?.name || '?'} ↔ ${d.trainer?.name || '?'} | ${d.status}`);
      }
      lines.push('');
    }
  }

  // ── 7. Payments today + recent — accounts + leadership + sales_closer ───
  if (isFull(user.role) || user.role === 'accounts' || user.role === 'payment_processor' || user.role === 'sales_closer') {
    const paymentWhere: any = {};
    if (user.role === 'sales_closer') {
      // Only payments for clients she owns
      paymentWhere.client = { salesOwnerId: user.id };
    }
    const todayPayments = await prisma.payment.findMany({
      where: { ...paymentWhere, paymentDate: today },
      select: { amount: true, currency: true, kind: true, client: { select: { name: true } } },
      take: 30,
    });
    if (todayPayments.length > 0) {
      lines.push(`## Payments today (${todayPayments.length})`);
      for (const p of todayPayments) lines.push(`  ${p.client.name}: ${p.currency} ${p.amount} (${p.kind})`);
      lines.push('');
    }
  }

  // ── 7.5 Call logs — Mitali / Bhavneet / AMs ─────────────────────────────
  if (isFull(user.role) || user.role === 'lead' || user.role === 'account_manager') {
    const recentCalls = await prisma.callLog.findMany({
      where: isFull(user.role) ? {} : { byId: user.id },
      select: {
        kind: true, outcome: true, calledAt: true,
        status: true, scheduledFor: true, durationMinutes: true, feedback: true,
        client: { select: { name: true } },
        by:     { select: { name: true } },
      },
      orderBy: { calledAt: 'desc' },
      take: 40,
    });
    if (recentCalls.length > 0) {
      const scheduled = recentCalls.filter((c) => c.status === 'scheduled' || c.status === 'in_progress');
      const completed = recentCalls.filter((c) => c.status === 'completed');
      if (scheduled.length > 0) {
        lines.push(`## Scheduled/live calls${isFull(user.role) ? '' : ' (yours)'} (${scheduled.length})`);
        for (const c of scheduled) {
          const when = c.scheduledFor?.toISOString().replace('T', ' ').slice(0, 16) || '—';
          lines.push(`  [${c.status}] ${when} | ${c.client.name} | ${c.kind} | ${c.by.name}`);
        }
        lines.push('');
      }
      if (completed.length > 0) {
        lines.push(`## Completed calls${isFull(user.role) ? '' : ' (yours)'} (${completed.length})`);
        for (const c of completed) {
          const d = c.calledAt.toISOString().slice(0, 10);
          const dur = c.durationMinutes ? `${c.durationMinutes}m` : '—';
          const fb = c.feedback ? ` | fb: "${c.feedback.slice(0, 50)}"` : '';
          lines.push(`  ${d} | ${c.client.name} | ${c.kind}${c.outcome ? ' · ' + c.outcome : ''} | ${dur} | ${c.by.name}${fb}`);
        }
        lines.push('');
      }
    }
  }

  // ── 7.6 Mitali / leadership: payment follow-up snapshot ─────────────────
  if (isFull(user.role) || user.role === 'lead') {
    const followUpClients = await prisma.client.findMany({
      where: { lifecycle: { in: ['Active', 'LeverageGranted', 'SaleWon'] } },
      select: {
        name: true,
        followupNote: true,
        lastFeedbackTakenAt: true,
        lastLeverageAskedAt: true,
        paymentPendingVaibhav: true,
      },
      take: 100,
    });
    const pendingV = followUpClients.filter((c) => c.paymentPendingVaibhav).length;
    const feedbackStale = followUpClients.filter((c) => !c.lastFeedbackTakenAt).length;
    const leverageStale = followUpClients.filter((c) => !c.lastLeverageAskedAt).length;
    lines.push(`## Payment follow-up (Mitali's queue): ${followUpClients.length} active clients, ${pendingV} pending on Vaibhav, ${feedbackStale} have never had feedback taken, ${leverageStale} have never been asked for leverage.`);
    lines.push('');
  }

  // ── 8. Your own activity today (always shown) ───────────────────────────
  const myAudits = await prisma.auditLog.findMany({
    where: { createdAt: { gte: todayStart }, byId: user.id },
    select: { action: true, details: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  if (myAudits.length > 0) {
    const actionCounts: Record<string, number> = {};
    for (const a of myAudits) actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
    lines.push(`## Your activity today (${myAudits.length} actions)`);
    lines.push(`  ${Object.entries(actionCounts).map(([k, v]) => `${k}×${v}`).join(', ')}`);
    for (const a of myAudits.slice(0, 6)) lines.push(`    - ${a.action}: ${(a.details || '').slice(0, 80)}`);
    lines.push('');
  }

  // ── 9. Org-wide activity today — leadership only ────────────────────────
  if (isFull(user.role)) {
    const orgAudits = await prisma.auditLog.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { byName: true, action: true, details: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const byPerson: Record<string, Record<string, number>> = {};
    for (const a of orgAudits) {
      const k = a.byName || '—';
      if (!byPerson[k]) byPerson[k] = {};
      byPerson[k][a.action] = (byPerson[k][a.action] || 0) + 1;
    }
    if (Object.keys(byPerson).length > 0) {
      lines.push(`## Today's team activity (${orgAudits.length} entries)`);
      for (const [name, actions] of Object.entries(byPerson)) {
        lines.push(`  ${name}: ${Object.entries(actions).map(([a, c]) => `${a}×${c}`).join(', ')}`);
      }
      lines.push('');
    }
  }

  // ── Footer / instructions for the LLM ───────────────────────────────────
  lines.push('When answering: quote the actual numbers / names from the data above. If the user asks about something not in their snapshot (e.g. a client they don\'t own and they\'re not founder/manager), say "you don\'t have access to that client" rather than making something up. Team first names: Vaibhav, Samita, Anjali, Taran (Taranpreet), Aman (Amandeep), Kanchan, Roshni, Mitali, Bhavneet, Muskan, Kashish, Areena, Ashok, Malika.');

  const text = lines.join('\n');
  cacheByUser.set(cacheKey, { text, builtAt: Date.now() });
  return text;
}

/** Where-clause for clients a non-founder/manager user can see based on
 *  ownership fields. Returns null if the role doesn't own clients (accounts
 *  / payment_processor handle data they shouldn't index per-client anyway). */
function buildPermissionedClientWhere(user: { id: string; role: Role }): any {
  switch (user.role) {
    case 'sales_closer':
      return {
        OR: [
          { salesOwnerId: user.id },
          { lifecycle: { in: ['SaleClosing', 'SaleWon', 'Active', 'LeverageGranted'] } },
        ],
        lifecycle: { notIn: ['Churned', 'Completed'] },
      };
    case 'demo_intake':
      return {
        OR: [
          { intakeOwnerId: user.id },
          { lifecycle: { in: ['Lead', 'IntakeSent', 'IntakeReceived', 'WithRecruiters', 'VerificationPending', 'TrainerMatched', 'DemoScheduled', 'DemoDone', 'FeedbackPending'] } },
        ],
        lifecycle: { notIn: ['Churned', 'Completed'] },
      };
    case 'demo_lead':
      // Samita sees the full pre-sales pipeline
      return { lifecycle: { in: ['Lead', 'IntakeSent', 'IntakeReceived', 'WithRecruiters', 'VerificationPending', 'TrainerMatched', 'DemoScheduled', 'DemoDone', 'FeedbackPending', 'SaleClosing'] } };
    case 'recruiter':
      // Aman/Kanchan don't own clients directly; they see clients tied to
      // sourcing requests assigned to them. Surface those.
      return {
        sourcingRequests: { some: { sentToId: user.id } },
        lifecycle: { notIn: ['Churned', 'Completed'] },
      };
    case 'account_manager':
      // Muskan/Kashish see clients they host (post-handover service delivery)
      return {
        OR: [
          { hostOwnerId: user.id },
          { assignedAmId: user.id },
        ],
        lifecycle: { notIn: ['Churned', 'Completed'] },
      };
    case 'lead': // Bhavneet — backs up manager
      return { lifecycle: { notIn: ['Churned', 'Completed'] } };
    case 'accounts':
    case 'payment_processor':
      // These roles don't need a per-client index — they work off the
      // payments view. Returning null skips the section entirely.
      return null;
    default:
      return null;
  }
}
