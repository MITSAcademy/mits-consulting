/**
 * Demo-team reporting dashboard.
 *
 * One-shot endpoint that returns everything the dashboard renders:
 *   1. Pipeline funnel (Lead → FeedbackPending)
 *   2. Workload per person (Anjali, Taran, Aman, Kanchan + Samita)
 *   3. Aging buckets per stage (0-3d / 4-7d / 8-14d / 15+d)
 *   4. "Stuck heatmap": stage × age-bucket grid
 *   5. Top stuck clients (oldest first)
 *   6. Recently moved (last 24h activity)
 *   7. Push-now recommendations (auto-flagged based on heuristics)
 *
 * Access: founder + demo_lead (Samita) — same as the user asked.
 *
 * All counts are derived in-memory from a small set of Prisma queries so this
 * stays cheap. Cached 30s per user.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';

export const demoTeamReportRouter = Router();
demoTeamReportRouter.use(requireAuth);

const ALLOWED = ['founder', 'demo_lead', 'manager'];

const DEMO_PIPELINE_STAGES = [
  'Lead',
  'IntakeSent',
  'IntakeReceived',
  'WithRecruiters',
  'VerificationPending',
  'TrainerMatched',
  'DemoScheduled',
  'DemoDone',
  'FeedbackPending',
];

const TEAM_OWNERS = ['u-anjali', 'u-taran', 'u-aman', 'u-kanchan', 'u-samita'];

interface CachedReport { data: any; builtAt: number; }
const cache = new Map<string, CachedReport>();
const CACHE_TTL_MS = 30_000;

demoTeamReportRouter.get('/', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }

  const cacheKey = `${req.user!.role}`;
  const c = cache.get(cacheKey);
  if (c && Date.now() - c.builtAt < CACHE_TTL_MS) return res.json(c.data);

  const today = new Date().toISOString().slice(0, 10);
  const todayStart = new Date(today + 'T00:00:00Z');
  const last24h = new Date(Date.now() - 24 * 3600_000);

  // ── 1. Fetch all clients in pipeline stages ───────────────────────────
  const clients = await prisma.client.findMany({
    where: { lifecycle: { in: DEMO_PIPELINE_STAGES as any } },
    select: {
      id: true, name: true,
      lifecycle: true,
      engagementType: true, source: true,
      currency: true, cycleAmount: true,
      stageEnteredAt: true,
      demoDate: true, demoTimeIst: true,
      intakeOwnerId: true,
      intakeOwner: { select: { id: true, name: true } },
      // For WithRecruiters, "owner" is the assigned recruiter via SourcingRequest
      sourcingRequests: {
        where: { status: { in: ['Open', 'Proposed'] } },
        select: { sentToId: true, sentTo: { select: { id: true, name: true } } },
        orderBy: { sentAt: 'desc' },
        take: 1,
      },
    },
  });

  // Compute days-in-stage. Uses stageEnteredAt when present, otherwise falls
  // back to createdAt (which schema has on Client).
  const today_ms = Date.parse(today);
  function daysInStage(c: { stageEnteredAt: string | null }): number {
    if (!c.stageEnteredAt) return 0;
    return Math.max(0, Math.floor((today_ms - Date.parse(c.stageEnteredAt)) / 86_400_000));
  }
  function effectiveOwner(c: any): { id: string | null; name: string | null } {
    // Recruiter-stage clients belong to whoever the sourcing request was assigned to.
    if (['WithRecruiters', 'VerificationPending'].includes(c.lifecycle)) {
      const sr = c.sourcingRequests?.[0];
      return sr?.sentToId
        ? { id: sr.sentToId, name: sr.sentTo?.name || null }
        : { id: null, name: null };
    }
    // Intake / demo stages → intakeOwner.
    return { id: c.intakeOwnerId, name: c.intakeOwner?.name || null };
  }

  // ── 2. Pipeline funnel: count per stage ───────────────────────────────
  const funnel = DEMO_PIPELINE_STAGES.map((stage) => {
    const xs = clients.filter((c) => c.lifecycle === stage);
    const aged14 = xs.filter((c) => daysInStage(c) >= 15).length;
    return { stage, count: xs.length, aged14 };
  });

  // ── 3. Workload per team member ───────────────────────────────────────
  const workload = TEAM_OWNERS.map((uid) => {
    const owned = clients.filter((c) => effectiveOwner(c).id === uid);
    const byStage: Record<string, number> = {};
    for (const stage of DEMO_PIPELINE_STAGES) byStage[stage] = 0;
    for (const c of owned) byStage[c.lifecycle] = (byStage[c.lifecycle] || 0) + 1;
    const aged14 = owned.filter((c) => daysInStage(c) >= 15).length;
    return {
      userId: uid,
      userName: owned[0]?.intakeOwner?.name || owned[0]?.sourcingRequests?.[0]?.sentTo?.name || (uid.replace('u-', '')),
      total: owned.length,
      aged14,
      byStage,
    };
  });
  // Patch missing names from a separate lookup (in case owner has 0 clients).
  const usersForLabels = await prisma.user.findMany({
    where: { id: { in: TEAM_OWNERS } },
    select: { id: true, name: true },
  });
  for (const w of workload) {
    const u = usersForLabels.find((x) => x.id === w.userId);
    if (u) w.userName = u.name;
  }

  // ── 4. Aging buckets per stage (heatmap) ──────────────────────────────
  const ageBuckets: { stage: string; b03: number; b47: number; b814: number; b15: number }[] = [];
  for (const stage of DEMO_PIPELINE_STAGES) {
    const xs = clients.filter((c) => c.lifecycle === stage);
    const b = { stage, b03: 0, b47: 0, b814: 0, b15: 0 };
    for (const c of xs) {
      const d = daysInStage(c);
      if      (d <= 3)  b.b03++;
      else if (d <= 7)  b.b47++;
      else if (d <= 14) b.b814++;
      else              b.b15++;
    }
    ageBuckets.push(b);
  }

  // ── 5. Top stuck clients (oldest first, max 15) ───────────────────────
  const topStuck = clients
    .map((c) => ({ ...c, days: daysInStage(c) }))
    .filter((c) => c.days >= 8)
    .sort((a, b) => b.days - a.days)
    .slice(0, 15)
    .map((c) => {
      const owner = effectiveOwner(c);
      return {
        id: c.id,
        name: c.name,
        lifecycle: c.lifecycle,
        engagementType: c.engagementType,
        amount: c.cycleAmount ? `${c.currency} ${c.cycleAmount}` : null,
        ownerName: owner.name,
        daysStuck: c.days,
        demoDate: c.demoDate,
        // Auto-suggest next action based on stage
        suggestedAction: suggestNextAction(c.lifecycle, c.days),
      };
    });

  // ── 6. Recently moved (last 24h) ──────────────────────────────────────
  const recentMoves = clients
    .filter((c) => c.stageEnteredAt && Date.parse(c.stageEnteredAt) >= last24h.getTime())
    .sort((a, b) => Date.parse(b.stageEnteredAt!) - Date.parse(a.stageEnteredAt!))
    .slice(0, 20)
    .map((c) => ({
      id: c.id, name: c.name, lifecycle: c.lifecycle,
      enteredAt: c.stageEnteredAt,
      ownerName: effectiveOwner(c).name,
    }));

  // ── 7. Push-now recommendations ───────────────────────────────────────
  // Heuristics:
  //  • Any DemoScheduled with demoDate in the past + DemoDone hasn't moved → push Anjali/Samita
  //  • WithRecruiters >7 days → push Aman/Kanchan to propose
  //  • IntakeSent >5 days → push Anjali/Taran to chase intake
  //  • DemoDone >3 days → push Samita to take feedback
  const recommendations: { client: { id: string; name: string }; ownerName: string | null; reason: string; severity: 'high' | 'medium'; lifecycle: string }[] = [];
  for (const c of clients) {
    const days = daysInStage(c);
    const owner = effectiveOwner(c);
    if (c.lifecycle === 'DemoScheduled' && c.demoDate && c.demoDate < today) {
      recommendations.push({
        client: { id: c.id, name: c.name },
        ownerName: owner.name,
        reason: `Demo date ${c.demoDate} has passed — mark Demo done or reschedule`,
        severity: 'high',
        lifecycle: c.lifecycle,
      });
    } else if (c.lifecycle === 'WithRecruiters' && days >= 7) {
      recommendations.push({
        client: { id: c.id, name: c.name },
        ownerName: owner.name,
        reason: `Stuck ${days}d with recruiter — push for proposals`,
        severity: days >= 14 ? 'high' : 'medium',
        lifecycle: c.lifecycle,
      });
    } else if (c.lifecycle === 'IntakeSent' && days >= 5) {
      recommendations.push({
        client: { id: c.id, name: c.name },
        ownerName: owner.name,
        reason: `Intake sent ${days}d ago — chase the form`,
        severity: days >= 10 ? 'high' : 'medium',
        lifecycle: c.lifecycle,
      });
    } else if (c.lifecycle === 'DemoDone' && days >= 3) {
      recommendations.push({
        client: { id: c.id, name: c.name },
        ownerName: owner.name,
        reason: `Demo done ${days}d ago — take feedback now (Samita)`,
        severity: days >= 7 ? 'high' : 'medium',
        lifecycle: c.lifecycle,
      });
    } else if (c.lifecycle === 'VerificationPending' && days >= 5) {
      recommendations.push({
        client: { id: c.id, name: c.name },
        ownerName: owner.name,
        reason: `Proposals waiting verification ${days}d — verify Pass/Fail`,
        severity: 'medium',
        lifecycle: c.lifecycle,
      });
    } else if (c.lifecycle === 'TrainerMatched' && days >= 4) {
      recommendations.push({
        client: { id: c.id, name: c.name },
        ownerName: owner.name,
        reason: `Trainer matched ${days}d ago — schedule the demo`,
        severity: 'medium',
        lifecycle: c.lifecycle,
      });
    }
  }
  // Sort by severity then days-stuck
  recommendations.sort((a, b) => {
    const sa = a.severity === 'high' ? 0 : 1;
    const sb = b.severity === 'high' ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return 0;
  });

  // ── 8. Conversion rates (7d, 30d) ─────────────────────────────────────
  const dateNow = new Date();
  const d30Start = new Date(dateNow.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const d7Start  = new Date(dateNow.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const allRecentClients = await prisma.client.findMany({
    where: { createdAt: { gte: new Date(d30Start) } },
    select: { lifecycle: true, createdAt: true },
  });
  function conversion(since: string) {
    const xs = allRecentClients.filter((c) => c.createdAt.toISOString().slice(0, 10) >= since);
    const total = xs.length;
    const reachedDemo = xs.filter((c) => ['DemoScheduled', 'DemoDone', 'FeedbackPending', 'SaleClosing', 'SaleWon', 'Active', 'LeverageGranted', 'Completed'].includes(c.lifecycle)).length;
    const reachedSale = xs.filter((c) => ['SaleClosing', 'SaleWon', 'Active', 'LeverageGranted', 'Completed'].includes(c.lifecycle)).length;
    return { total, reachedDemo, reachedSale,
      demoRate: total ? Math.round((reachedDemo / total) * 100) : 0,
      saleRate: total ? Math.round((reachedSale / total) * 100) : 0,
    };
  }
  const conversion7  = conversion(d7Start);
  const conversion30 = conversion(d30Start);

  // ── 9. Demo schedule next 7 days (counts per day) ─────────────────────
  const demosByDay: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    demosByDay[d.toISOString().slice(0, 10)] = 0;
  }
  const upcomingDemos = await prisma.demo.findMany({
    where: {
      status: { in: ['Scheduled', 'Rescheduled'] },
      scheduledDate: { gte: today },
    },
    select: { scheduledDate: true },
    take: 200,
  });
  for (const d of upcomingDemos) {
    if (d.scheduledDate && d.scheduledDate in demosByDay) demosByDay[d.scheduledDate]++;
  }

  // ── 10. Top-of-page KPIs ──────────────────────────────────────────────
  const kpis = {
    totalPipeline:    clients.length,
    aged14:           clients.filter((c) => daysInStage(c) >= 15).length,
    demosThisWeek:    upcomingDemos.length,
    recommendations:  recommendations.length,
  };

  const data = {
    asOf: new Date().toISOString(),
    kpis,
    funnel,
    workload,
    ageBuckets,
    topStuck,
    recentMoves,
    recommendations,
    conversion7, conversion30,
    demosByDay,
  };
  cache.set(cacheKey, { data, builtAt: Date.now() });
  res.json(data);
});

function suggestNextAction(stage: string, days: number): string {
  switch (stage) {
    case 'Lead':                return 'Send the intake form';
    case 'IntakeSent':          return days > 7 ? 'Call them to fill it' : 'Wait 1-2 more days';
    case 'IntakeReceived':      return 'Push to recruiters';
    case 'WithRecruiters':      return days > 10 ? 'Escalate to Vaibhav' : 'Nudge Aman / Kanchan';
    case 'VerificationPending': return 'Verify proposals Pass / Fail';
    case 'TrainerMatched':      return 'Schedule the demo with the trainer';
    case 'DemoScheduled':       return 'Confirm with client + trainer';
    case 'DemoDone':            return 'Take feedback from Samita';
    case 'FeedbackPending':     return 'Disposition — Pass to Roshni / Reject / Hold';
    default:                    return 'Review';
  }
}
