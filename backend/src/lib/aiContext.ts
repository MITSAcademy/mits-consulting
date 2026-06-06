/**
 * Build a compact, AI-friendly snapshot of the current state of MITS Hub
 * so the assistant can answer questions like "how many demos pending on
 * Anjali?" or "what did Roshni close today?" with real numbers instead
 * of "check the Demos page".
 *
 * Keep this LEAN — every token added here is sent on EVERY question, so
 * inflating it linearly inflates cost and latency. Target: under ~2000
 * tokens of structured text.
 *
 * Cached for 60 seconds per user so a burst of follow-ups doesn't hammer
 * the DB. The context is the same for every user (org-wide snapshot),
 * but we still key by something so a future per-user shaping is trivial.
 */
import { prisma } from './prisma';

interface CachedContext {
  text: string;
  builtAt: number;
}

const CACHE_TTL_MS = 60_000;
let cached: CachedContext | null = null;

export async function buildMitsContext(): Promise<string> {
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    return cached.text;
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayStart = new Date(today + 'T00:00:00Z');

  // ── Per-team-member pipeline counts ─────────────────────────────────────
  // For each user we summarise: how many open clients sit at each lifecycle
  // they're responsible for. Ownership is multi-field (intake/sales/host),
  // so the question "Anjali's demos" can mean different things — we surface
  // each angle and let the LLM disambiguate.
  const users = await prisma.user.findMany({
    select: { id: true, name: true, role: true },
    where: { role: { not: 'staff' } },
    orderBy: { name: 'asc' },
  });

  // Aggregate counts per (ownerId, ownerField, lifecycle) — three SQLs
  // since Prisma's groupBy doesn't let us union them in one go.
  const intakeCounts = await prisma.client.groupBy({
    by: ['intakeOwnerId', 'lifecycle'],
    _count: { _all: true },
    where: { intakeOwnerId: { not: null } },
  });
  const salesCounts = await prisma.client.groupBy({
    by: ['salesOwnerId', 'lifecycle'],
    _count: { _all: true },
    where: { salesOwnerId: { not: null } },
  });
  const hostCounts = await prisma.client.groupBy({
    by: ['hostOwnerId', 'lifecycle'],
    _count: { _all: true },
    where: { hostOwnerId: { not: null } },
  });

  const byUser: Record<string, { intake: Record<string, number>; sales: Record<string, number>; host: Record<string, number> }> = {};
  for (const u of users) byUser[u.id] = { intake: {}, sales: {}, host: {} };
  for (const r of intakeCounts) if (r.intakeOwnerId && byUser[r.intakeOwnerId]) byUser[r.intakeOwnerId].intake[r.lifecycle] = r._count._all;
  for (const r of salesCounts)  if (r.salesOwnerId  && byUser[r.salesOwnerId])  byUser[r.salesOwnerId].sales[r.lifecycle]   = r._count._all;
  for (const r of hostCounts)   if (r.hostOwnerId   && byUser[r.hostOwnerId])   byUser[r.hostOwnerId].host[r.lifecycle]     = r._count._all;

  // ── Today's audit log — what the team actually did today ────────────────
  const todayAudits = await prisma.auditLog.findMany({
    where: { createdAt: { gte: todayStart } },
    select: { byName: true, action: true, details: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  // Bucket by person → action counts + a sample of recent details
  const todayByPerson: Record<string, { actions: Record<string, number>; samples: string[] }> = {};
  for (const a of todayAudits) {
    const k = a.byName || '—';
    if (!todayByPerson[k]) todayByPerson[k] = { actions: {}, samples: [] };
    todayByPerson[k].actions[a.action] = (todayByPerson[k].actions[a.action] || 0) + 1;
    if (todayByPerson[k].samples.length < 3 && a.details) {
      todayByPerson[k].samples.push(`${a.action}: ${a.details.slice(0, 90)}`);
    }
  }

  // ── Org-wide pipeline + payments snapshot ───────────────────────────────
  const [pipelineCounts, subStatusCounts, openSourcing, openVerifications, todayPayments] = await Promise.all([
    prisma.client.groupBy({ by: ['lifecycle'], _count: { _all: true } }),
    prisma.client.groupBy({
      by: ['saleClosingSubStatus'],
      _count: { _all: true },
      where: { lifecycle: { in: ['SaleClosing', 'SaleWon'] } },
    }),
    prisma.sourcingRequest.count({ where: { status: 'Open' } }),
    prisma.sourcingRequest.count({ where: { status: 'Proposed' } }),
    prisma.payment.findMany({
      where: { paymentDate: { gte: today } },
      select: { amount: true, currency: true, kind: true, client: { select: { name: true } } },
      take: 20,
    }),
  ]);

  // ── Stitch into compact text ────────────────────────────────────────────
  const lines: string[] = [];
  lines.push(`LIVE SNAPSHOT (cached up to 60s, asof ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC)`);
  lines.push('');

  lines.push('## Org pipeline counts');
  for (const r of pipelineCounts) lines.push(`  ${r.lifecycle}: ${r._count._all}`);
  lines.push('');

  lines.push('## Sales-close sub-status (Roshni\'s queue)');
  for (const r of subStatusCounts) lines.push(`  ${r.saleClosingSubStatus || '(unset)'}: ${r._count._all}`);
  lines.push('');

  lines.push(`## Recruiter queue: ${openSourcing} sourcing requests Open, ${openVerifications} proposals awaiting verification`);
  lines.push('');

  if (todayPayments.length > 0) {
    lines.push(`## Payments recorded today (${todayPayments.length})`);
    for (const p of todayPayments) lines.push(`  ${p.client.name}: ${p.currency} ${p.amount} (${p.kind})`);
    lines.push('');
  }

  lines.push('## Per-user open client counts (by ownership field)');
  for (const u of users) {
    const ub = byUser[u.id];
    const intake = Object.entries(ub.intake).map(([k, v]) => `${k}:${v}`).join(', ');
    const sales  = Object.entries(ub.sales).map(([k, v]) => `${k}:${v}`).join(', ');
    const host   = Object.entries(ub.host).map(([k, v]) => `${k}:${v}`).join(', ');
    const parts: string[] = [];
    if (intake) parts.push(`intakeOwner→{${intake}}`);
    if (sales)  parts.push(`salesOwner→{${sales}}`);
    if (host)   parts.push(`hostOwner→{${host}}`);
    if (parts.length === 0) continue;
    lines.push(`  ${u.name} (${u.role}): ${parts.join(' · ')}`);
  }
  lines.push('');

  lines.push(`## Today's activity by person (${todayAudits.length} log entries)`);
  for (const [name, b] of Object.entries(todayByPerson)) {
    const actions = Object.entries(b.actions).map(([k, v]) => `${k}×${v}`).join(', ');
    lines.push(`  ${name}: ${actions}`);
    for (const s of b.samples) lines.push(`    - ${s}`);
  }
  if (Object.keys(todayByPerson).length === 0) lines.push('  (No team activity logged yet today)');
  lines.push('');

  lines.push('Use these numbers when answering "how many", "who has", "what did X do today" — they\'re fresh. Names map: u-anjali=Anjali Maini, u-taran=Taranpreet Kaur, u-aman=Amandeep Kaur, u-kanchan=Kanchan Sharma, u-samita=Samita Gupta, u-roshni=Roshni Seth, u-mitali=Mitali, u-bhavneet=Bhavneet, u-vaibhav=Vaibhav.');

  const text = lines.join('\n');
  cached = { text, builtAt: Date.now() };
  return text;
}
