/**
 * Payment Sheet audit — STRICTLY READ-ONLY.
 *
 * Answers the verification questions for the four Payment Sheet bug fixes by
 * querying the database directly. Contains no create/update/delete/upsert calls
 * of any kind, so it is safe to run against production.
 *
 *   Usage:  node scripts/paySheetAudit.mjs [YYYY-MM-DD weekStart] [--weeks=N]
 *
 * Defaults to the current week's Monday. Uses whatever DATABASE_URL is already
 * configured in backend/.env — it does not construct a connection of its own.
 *
 * Sections printed:
 *   TASK 1-5              the original Payment Sheet bug-fix verification
 *   RATE MISMATCH REPORT  every trainer-week where Days x stored rate does not
 *                         equal the Amount, with a per-log breakdown, payment
 *                         status, historical scope, and a copy-paste CSV block.
 *                         --weeks=N widens that report past a single week.
 *   BULK CORRECTION PROPOSAL
 *                         for those same mismatched rows, what the amount WOULD
 *                         be under the fixed formula (days x stored rate), the
 *                         over/under difference, and a per-row confidence flag.
 *                         A proposal for a human to read: it changes nothing,
 *                         applies nothing, and writes nothing.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Same rules the Payment Sheet applies (TrainerPaySheetPage.tsx) ───────────
const LUMP_SUM_TRAINING = ['training_one_shot', 'training_monthly'];

const effectiveRateModel = (log) =>
  log.trainer?.rateModel || log.rateModel || 'per_session';

const isTrainingCall = (log) => LUMP_SUM_TRAINING.includes(effectiveRateModel(log));

/** Days per the FIXED rule. */
const toSessions = (log) => {
  if (log.sessionHappened === false || !log.hours || log.hours <= 0) return 0;
  if (effectiveRateModel(log) === 'hourly') return log.hours;
  return log.hours <= 1.0 ? 0.5 : 1;
};

/** Days per the OLD buggy rule, for before/after comparison. */
const toSessionsOld = (log) => (log.hours <= 1.0 ? 0.5 : 1);

function mondayOf(d) {
  const x = new Date(d);
  const day = x.getUTCDay();
  x.setUTCDate(x.getUTCDate() - (day === 0 ? 6 : day - 1));
  return x.toISOString().slice(0, 10);
}
const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const h = (t) => console.log('\n' + '='.repeat(78) + '\n' + t + '\n' + '='.repeat(78));
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

async function main() {
  const args = process.argv.slice(2);
  const weekStart = args.find((a) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(a)) || mondayOf(new Date());
  const weekEnd = addDays(weekStart, 6);
  // Optional wider range, used by the RATE MISMATCH REPORT only. TASK 1-5 stay
  // on the single week so their output is unchanged from before.
  const weeksArg = args.find((a) => a.startsWith('--weeks='));
  const weekCount = Math.max(1, parseInt((weeksArg || '--weeks=1').split('=')[1], 10) || 1);
  const rangeStart = weekStart;
  const rangeEnd = addDays(weekStart, weekCount * 7 - 1);

  console.log('READ-ONLY Payment Sheet audit');
  console.log(`Week: ${weekStart} .. ${weekEnd}`);

  const dbInfo = await prisma.$queryRawUnsafe('select current_database() as db, current_user as usr');
  console.log(`Database: ${dbInfo[0].db} (user ${dbInfo[0].usr})`);

  const trainers = await prisma.trainer.findMany({
    select: { id: true, name: true, rateModel: true, defaultRateInr: true, active: true },
    orderBy: { name: 'asc' },
  });

  /* ── TASK 1: every trainer's rateModel, grouped ─────────────────────────── */
  h('TASK 1 — All trainers grouped by rateModel');
  const byModel = new Map();
  for (const t of trainers) {
    if (!byModel.has(t.rateModel)) byModel.set(t.rateModel, []);
    byModel.get(t.rateModel).push(t);
  }
  for (const model of ['hourly', 'per_session', 'training_one_shot', 'training_monthly']) {
    const list = byModel.get(model) || [];
    console.log(`\n${model}  —  ${list.length} trainer(s)`);
    for (const t of list) {
      console.log(`   ${t.name.padEnd(30)} rate=${String(t.defaultRateInr).padEnd(7)} active=${t.active}  id=${t.id}`);
    }
  }
  const unknown = [...byModel.keys()].filter(
    (m) => !['hourly', 'per_session', 'training_one_shot', 'training_monthly'].includes(m));
  if (unknown.length) console.log(`\n!! UNEXPECTED rateModel values present: ${unknown.join(', ')}`);

  console.log('\n-- Named example lookup --');
  const named = trainers.filter((t) => /abhishek/i.test(t.name));
  if (!named.length) console.log('   No trainer matching /abhishek/i found.');
  for (const t of named) console.log(`   ${t.name}: rateModel = ${t.rateModel}  (id ${t.id})`);

  /* ── TASK 2: logs excluded by the Bug 2 filter, per trainer ─────────────── */
  h('TASK 2 — Logs excluded by the training-call filter');
  const weekLogs = await prisma.sessionLog.findMany({
    where: { date: { gte: weekStart, lte: weekEnd } },
    include: {
      trainer: { select: { id: true, name: true, rateModel: true } },
      client: { select: { id: true, name: true } },
      regularTraining: { select: { name: true } },
    },
  });
  const allTimeTraining = await prisma.sessionLog.groupBy({
    by: ['trainerId'],
    _count: { _all: true },
    where: { trainer: { rateModel: { in: LUMP_SUM_TRAINING } } },
  });

  console.log(`\nLogs in week before filter: ${weekLogs.length}`);
  const excluded = weekLogs.filter(isTrainingCall);
  const kept = weekLogs.filter((l) => !isTrainingCall(l));
  console.log(`Logs excluded by filter:    ${excluded.length}`);
  console.log(`Logs remaining on sheet:    ${kept.length}`);

  const exByTrainer = new Map();
  for (const l of excluded) {
    const k = l.trainer.name;
    if (!exByTrainer.has(k)) exByTrainer.set(k, { model: l.trainer.rateModel, n: 0, hours: 0, amount: 0 });
    const e = exByTrainer.get(k);
    e.n++; e.hours += l.hours; e.amount += l.amountInr;
  }
  console.log('\nExcluded this week, by trainer:');
  if (!exByTrainer.size) console.log('   (none)');
  for (const [name, e] of exByTrainer) {
    console.log(`   ${name.padEnd(30)} ${e.model.padEnd(18)} logs=${String(e.n).padEnd(4)} hours=${e.hours}  was billing ${inr(e.amount)}`);
  }

  console.log('\nAll-time log counts for training-model trainers:');
  if (!allTimeTraining.length) console.log('   (none)');
  for (const g of allTimeTraining) {
    const t = trainers.find((x) => x.id === g.trainerId);
    console.log(`   ${(t?.name || g.trainerId).padEnd(30)} ${String(t?.rateModel).padEnd(18)} total logs = ${g._count._all}`);
  }

  /* ── TASK 3: trainers the fix CANNOT help ───────────────────────────────── */
  h('TASK 3 — Trainers doing both client sessions AND training calls (fix cannot help)');
  console.log('\nNOTE: SessionLog has no session-type field, so this cannot be answered');
  console.log('definitively from the data. Below is every hourly/per_session trainer with');
  console.log('the trainings/clients they logged against — review for internal training calls.\n');

  const billable = weekLogs.filter((l) => !isTrainingCall(l));
  const ctx = new Map();
  for (const l of billable) {
    const k = l.trainer.name;
    if (!ctx.has(k)) ctx.set(k, { model: effectiveRateModel(l), items: new Map() });
    const label = `${l.regularTraining?.name || '(no training)'} / ${l.client?.name || '(no client)'}`;
    ctx.get(k).items.set(label, (ctx.get(k).items.get(label) || 0) + 1);
  }
  const SUSPECT = /train(ing)?\s*call|internal|in-house|staff|team\s*train/i;
  const flagged = [];
  for (const [name, v] of ctx) {
    const labels = [...v.items.keys()];
    const hits = labels.filter((l) => SUSPECT.test(l));
    console.log(`   ${name}  [${v.model}]`);
    for (const l of labels) console.log(`       ${SUSPECT.test(l) ? '>> ' : '   '}${l}  (${v.items.get(l)} log(s))`);
    if (hits.length && labels.length > hits.length) flagged.push({ name, model: v.model, hits });
  }
  console.log('\nHEURISTIC FLAGS (mixed billable + internal-looking work) — CONFIRM MANUALLY:');
  if (!flagged.length) console.log('   (none matched the heuristic — this is NOT proof none exist)');
  for (const f of flagged) console.log(`   ${f.name} [${f.model}] -> ${f.hits.join(', ')}`);

  /* ── TASK 5: before/after per trainer ───────────────────────────────────── */
  h('TASK 5 — Days/amount BEFORE vs AFTER the fix, every trainer this week');
  const rows = new Map();
  for (const l of weekLogs) {
    const k = l.trainer.id;
    if (!rows.has(k)) rows.set(k, {
      name: l.trainer.name, model: effectiveRateModel(l),
      oldDays: 0, newDays: 0, amount: 0, logs: 0, noShow: 0, excluded: isTrainingCall(l),
    });
    const r = rows.get(k);
    r.logs++;
    if (l.sessionHappened === false) r.noShow++;
    r.oldDays += toSessionsOld(l);
    if (!isTrainingCall(l)) { r.newDays += toSessions(l); r.amount += l.amountInr; }
  }
  console.log('\n' + 'TRAINER'.padEnd(28) + 'MODEL'.padEnd(18) + 'LOGS'.padEnd(6)
    + 'NO-SHOW'.padEnd(9) + 'DAYS(old)'.padEnd(11) + 'DAYS(new)'.padEnd(11) + 'AMOUNT');
  console.log('-'.repeat(100));
  for (const r of [...rows.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const tag = r.excluded ? '  <-- EXCLUDED (training call)' : '';
    console.log(
      r.name.padEnd(28) + r.model.padEnd(18) + String(r.logs).padEnd(6) +
      String(r.noShow).padEnd(9) + String(r.oldDays).padEnd(11) +
      String(r.excluded ? 0 : r.newDays).padEnd(11) + inr(r.excluded ? 0 : r.amount) + tag);
  }

  console.log('\n-- Bug 3 candidates: trainers with 0 billable days this week --');
  const zero = [...rows.values()].filter((r) => !r.excluded && r.newDays === 0);
  if (!zero.length) console.log('   (none)');
  for (const r of zero) {
    console.log(`   ${r.name.padEnd(28)} logs=${r.logs} noShow=${r.noShow}  OLD days=${r.oldDays} -> NEW days=0  (stored amount ${inr(r.amount)})`);
    if (r.amount > 0) console.log(`      !! stored amountInr is non-zero — legacy data written before the fix`);
  }

  /* ── TASK 4 evidence: TrainerPayWeek state ──────────────────────────────── */
  h('TASK 4 — TrainerPayWeek state (run before AND after the migration)');
  const pwCount = await prisma.trainerPayWeek.count();
  console.log(`\nTotal TrainerPayWeek rows: ${pwCount}`);
  const sample = await prisma.trainerPayWeek.findMany({ take: 5, orderBy: { createdAt: 'asc' } });
  console.log('Oldest 5 rows (compare these byte-for-byte before/after):');
  for (const r of sample) console.log('   ' + JSON.stringify(r));
  const cols = await prisma.$queryRawUnsafe(
    `select column_name, data_type, is_nullable from information_schema.columns
      where table_name = 'TrainerPayWeek' order by ordinal_position`);
  console.log('Columns:');
  for (const c of cols) console.log(`   ${c.column_name.padEnd(24)} ${c.data_type.padEnd(28)} nullable=${c.is_nullable}`);

  /* ── RATE MISMATCH REPORT ───────────────────────────────────────────────── */
  // Mirrors displayRate() in TrainerPaySheetPage.tsx: a trainer-week reconciles
  // only when it has ONE stored rate AND |storedRate * days - amount| < 1.
  function reconcileRow(rates, days, amount) {
    const distinct = Array.from(new Set(rates)).sort((a, b) => a - b);
    const stored = distinct.length ? distinct[0] : 0;
    const expected = days > 0 ? Math.round(stored * days) : 0;
    const reconciles = days > 0
      ? (distinct.length <= 1 && Math.abs(stored * days - amount) < 1)
      : distinct.length <= 1;
    return { stored, distinct, expected, reconciles, diff: amount - expected };
  }

  // Group a set of logs into trainer-weeks, applying the same exclusions the
  // Payment Sheet applies (training calls never appear on it).
  function groupTrainerWeeks(logs) {
    const m = new Map();
    for (const l of logs) {
      if (isTrainingCall(l)) continue;
      const wk = mondayOf(l.date);
      const key = l.trainer.id + '|' + wk;
      if (!m.has(key)) m.set(key, { trainer: l.trainer, weekStart: wk, days: 0, amount: 0, rates: [], logs: [] });
      const t = m.get(key);
      t.days += toSessions(l);
      t.amount += l.amountInr;
      t.rates.push(l.rateSnapshot);
      t.logs.push(l);
    }
    return m;
  }

  const LOG_FIELDS = {
    id: true, date: true, hours: true, rateSnapshot: true, rateModel: true,
    amountInr: true, status: true, sessionHappened: true,
    trainer: { select: { id: true, name: true, rateModel: true, defaultRateInr: true } },
    client: { select: { name: true } },
  };

  h(`RATE MISMATCH REPORT — ${rangeStart} .. ${rangeEnd}${weekCount > 1 ? ` (${weekCount} weeks)` : ''}`);
  console.log('');
  console.log('Rows where  Days x stored rate  does NOT equal the Amount on the Payment Sheet.');
  console.log('These are the rows the sheet flags with a warning badge. Nothing here is a');
  console.log('correction — it is a list for a human to review, trainer by trainer.');

  const rangeLogs = await prisma.sessionLog.findMany({
    where: { date: { gte: rangeStart, lte: rangeEnd } },
    select: LOG_FIELDS,
    orderBy: { date: 'asc' },
  });

  const inRange = groupTrainerWeeks(rangeLogs);
  const bad = [];
  for (const tw of inRange.values()) {
    const rec = reconcileRow(tw.rates, tw.days, tw.amount);
    if (!rec.reconciles) bad.push({ ...tw, ...rec });
  }
  bad.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  console.log('');
  console.log(`Trainer-weeks examined : ${inRange.size}`);
  console.log(`Mismatched             : ${bad.length}`);
  if (!bad.length) {
    console.log('');
    console.log('   No mismatches found in this range. Nothing to review.');
  }

  // Historical scope, for the affected trainers only (bounded query).
  const affectedIds = [...new Set(bad.map((b) => b.trainer.id))];
  const history = new Map();  // trainerId -> { weeks:Set, logs:n, gap:n, paidLogs:n }
  if (affectedIds.length) {
    const allLogs = await prisma.sessionLog.findMany({
      where: { trainerId: { in: affectedIds } },
      select: LOG_FIELDS,
      orderBy: { date: 'asc' },
    });
    for (const tw of groupTrainerWeeks(allLogs).values()) {
      const rec = reconcileRow(tw.rates, tw.days, tw.amount);
      if (rec.reconciles) continue;
      if (!history.has(tw.trainer.id)) history.set(tw.trainer.id, { weeks: [], logs: 0, gap: 0, paidLogs: 0 });
      const hh = history.get(tw.trainer.id);
      hh.weeks.push(tw.weekStart);
      hh.logs += tw.logs.length;
      hh.gap += rec.diff;
      hh.paidLogs += tw.logs.filter((l) => l.status === 'Paid').length;
    }
  }

  const csvRows = [];
  bad.forEach((b, i) => {
    const paid = b.logs.filter((l) => l.status === 'Paid');
    const hh = history.get(b.trainer.id) || { weeks: [], logs: 0, gap: 0, paidLogs: 0 };
    const rateNote = b.distinct.length > 1
      ? `${b.distinct.map(inr).join(', ')}  <-- logs disagree with each other`
      : `${inr(b.stored)}   (all logs agree)`;
    const profileNote = b.trainer.defaultRateInr === b.stored
      ? 'matches the logs'
      : `DIFFERS from the logs' ${inr(b.stored)}`;

    console.log('');
    console.log('-'.repeat(78));
    console.log(` ${i + 1}. ${b.trainer.name}   (week of ${b.weekStart})`);
    console.log(`    trainer id: ${b.trainer.id}   payment structure: ${b.trainer.rateModel}`);
    console.log('-'.repeat(78));
    console.log(`    Profile rate (Trainer.defaultRateInr) : ${inr(b.trainer.defaultRateInr)}  — ${profileNote}`);
    console.log(`    Stored rate on this week's logs       : ${rateNote}`);
    console.log(`    Days billed this week                 : ${b.days}`);
    console.log(`    Expected amount (Days x rate)         : ${inr(b.expected)}   (${b.days} x ${inr(b.stored)})`);
    console.log(`    ACTUAL amount on the sheet            : ${inr(b.amount)}`);
    console.log(`    DIFFERENCE                            : ${inr(Math.abs(b.diff))} ${b.diff > 0 ? 'MORE than expected' : 'LESS than expected'}`);
    if (paid.length) {
      console.log(`    ** ALREADY PAID: ${paid.length} of ${b.logs.length} logs are marked Paid — money may already have gone out **`);
    } else {
      console.log(`    Payment status: none of the ${b.logs.length} logs are marked Paid yet`);
    }

    console.log('');
    console.log('    Session logs in this week:');
    console.log('      ' + 'DATE'.padEnd(12) + 'HOURS'.padEnd(7) + 'DAYS'.padEnd(6) + 'RATE'.padEnd(10) +
                'AMOUNT'.padEnd(11) + 'STATUS'.padEnd(16) + 'CLIENT');
    for (const l of b.logs) {
      const flag = l.status === 'Paid' ? ' <-- PAID' : '';
      console.log('      ' + String(l.date).padEnd(12) + String(l.hours).padEnd(7) +
        String(toSessions(l)).padEnd(6) + inr(l.rateSnapshot).padEnd(10) +
        inr(l.amountInr).padEnd(11) + (l.status + flag).padEnd(16) + (l.client?.name || '—'));
    }

    console.log('');
    console.log(`    Historical scope for this trainer (all time, not just this week):`);
    console.log(`      weeks with a mismatch : ${hh.weeks.length}`);
    console.log(`      logs involved         : ${hh.logs}`);
    console.log(`      logs already Paid     : ${hh.paidLogs}`);
    console.log(`      total gap across all  : ${inr(Math.abs(hh.gap))} ${hh.gap > 0 ? 'MORE than expected' : 'LESS than expected'}`);
    if (hh.weeks.length) {
      const shown = hh.weeks.slice(0, 12).join(', ');
      console.log(`      affected weeks        : ${shown}${hh.weeks.length > 12 ? ` … +${hh.weeks.length - 12} more` : ''}`);
    }

    csvRows.push([
      b.weekStart, `"${b.trainer.name}"`, b.trainer.id, b.trainer.rateModel,
      b.trainer.defaultRateInr, b.stored, `"${b.distinct.join(' | ')}"`,
      b.days, b.expected, b.amount, b.diff,
      b.logs.length, paid.length, hh.weeks.length, hh.logs, hh.paidLogs, hh.gap,
    ].join(','));
  });

  if (bad.length) {
    const totalGap = bad.reduce((s, b) => s + b.diff, 0);
    const totalPaid = bad.reduce((s, b) => s + b.logs.filter((l) => l.status === 'Paid').length, 0);
    console.log('');
    console.log('='.repeat(78));
    console.log(` SUMMARY: ${bad.length} mismatched trainer-week(s) across ${affectedIds.length} trainer(s)`);
    console.log(` Net gap in this range : ${inr(Math.abs(totalGap))} ${totalGap > 0 ? 'MORE than expected' : 'LESS than expected'}`);
    console.log(` Logs already Paid     : ${totalPaid}${totalPaid ? '   <-- review these first' : ''}`);
    console.log('='.repeat(78));

    console.log('');
    console.log('--- CSV (copy from the line below into a spreadsheet) ---');
    console.log([
      'Week', 'Trainer', 'TrainerId', 'PaymentStructure', 'ProfileRate', 'StoredRate', 'AllStoredRates',
      'Days', 'ExpectedAmount', 'ActualAmount', 'Difference',
      'LogsThisWeek', 'PaidLogsThisWeek', 'HistoricMismatchWeeks', 'HistoricLogs', 'HistoricPaidLogs', 'HistoricTotalGap',
    ].join(','));
    for (const row of csvRows) console.log(row);
    console.log('--- end CSV ---');
  }

  /* ── BULK CORRECTION PROPOSAL ───────────────────────────────────────────── */
  // STILL READ-ONLY. Takes every trainer-week the RATE MISMATCH REPORT flagged
  // above and works out what the amount WOULD be under the fixed formula
  //
  //     proposedAmount = round(days x stored rate)
  //
  // where `days` already comes from the corrected toSessions() rule — session
  // units for per_session trainers, raw hours for hourly ones. This section
  // proposes numbers for a human to read. It writes nothing, and it does not
  // alter any row of the report above.

  const PROPOSAL_DISCLAIMER = [
    '  THIS IS A PROPOSAL ONLY. Nothing has been changed.',
    '  Every row must be reviewed by a human before any correction is applied.',
    '  Rows marked NEEDS MANUAL REVIEW require special attention — do not',
    '  bulk-approve without checking them individually.',
  ];
  const loudDisclaimer = () => {
    console.log('');
    console.log('!'.repeat(78));
    for (const line of PROPOSAL_DISCLAIMER) console.log('!!' + line);
    console.log('!'.repeat(78));
  };

  // Free-text markers that suggest a human deliberately set the amount. A hit
  // does NOT mean the row is wrong — it means the row must not be auto-touched.
  const OVERRIDE_PATTERNS = [
    ['bonus', /bonus/i],
    ['adjustment', /adjust/i],
    ['override', /overrid/i],
    ['special rate', /special\s*-?\s*rate/i],
    ['manual', /manual/i],
    ['negotiated', /negotiat/i],
    ['incentive', /incentive/i],
    ['arrears', /arrear/i],
    ['discount', /discount/i],
  ];

  h(`BULK CORRECTION PROPOSAL — ${rangeStart} .. ${rangeEnd}${weekCount > 1 ? ` (${weekCount} weeks)` : ''}`);
  loudDisclaimer();

  // Comments/notes for the flagged logs only — a bounded, read-only lookup.
  const flaggedLogIds = bad.flatMap((b) => b.logs.map((l) => l.id));
  const freeTextById = new Map();
  if (flaggedLogIds.length) {
    const withText = await prisma.sessionLog.findMany({
      where: { id: { in: flaggedLogIds } },
      select: { id: true, comments: true, notes: true },
    });
    for (const r of withText) freeTextById.set(r.id, r);
  }

  const scanOverride = (log) => {
    const extra = freeTextById.get(log.id) || {};
    const hits = [];
    for (const [field, text] of [['comments', extra.comments], ['notes', extra.notes]]) {
      if (!text) continue;
      for (const [label, re] of OVERRIDE_PATTERNS) {
        if (re.test(text)) {
          const quoted = String(text).replace(/\s+/g, ' ').trim().slice(0, 60);
          hits.push(`"${label}" in ${field} ("${quoted}")`);
        }
      }
    }
    return hits;
  };

  const proposals = bad.map((b) => {
    const proposedAmount = b.days > 0 ? Math.round(b.days * b.stored) : 0;
    const difference = b.amount - proposedAmount;
    const direction = difference === 0 ? 'NO CHANGE' : difference > 0 ? 'OVERPAID' : 'UNDERPAID';
    const paidLogs = b.logs.filter((l) => l.status === 'Paid');
    const overrideHits = b.logs.flatMap(scanOverride);

    // "LIKELY SAFE" requires ALL of these. Any one of them failing forces a
    // manual read, because the proposed number would otherwise be a guess.
    const reasons = [];
    if (b.distinct.length > 1) {
      reasons.push(`rates disagree across logs (${b.distinct.map(inr).join(' vs ')}) — the proposal used the lowest, ${inr(b.stored)}`);
    }
    if (overrideHits.length) {
      reasons.push(`comment suggests intentional override — ${overrideHits.join('; ')}`);
    }
    if (proposedAmount === 0 && b.amount !== 0) {
      reasons.push(`proposal would zero out a non-zero stored amount of ${inr(b.amount)} (stored rate is ${inr(b.stored)})`);
    }
    const safe = reasons.length === 0;

    return {
      ...b, proposedAmount, difference, direction, paidLogs, safe,
      confidence: safe ? 'LIKELY SAFE TO AUTO-CORRECT' : 'NEEDS MANUAL REVIEW',
      reviewNote: safe
        ? 'all logs in this week share one stored rate; no override keywords in comments/notes'
        : reasons.join('; '),
    };
  });

  if (!proposals.length) {
    console.log('');
    console.log('No mismatched trainer-weeks in this range, so there is nothing to propose.');
  } else {
    console.log('');
    console.log(`Proposed corrections for the ${proposals.length} mismatched trainer-week(s) listed above,`);
    console.log('in the same order. Formula: proposedAmount = round(days x stored rate).');
    console.log(`Override keyword scan (case-insensitive, on SessionLog.comments and .notes): ${OVERRIDE_PATTERNS.map(([l]) => l).join(', ')}.`);
    console.log('');
    console.log(
      'WEEK'.padEnd(12) + 'TRAINER'.padEnd(24) + 'DAYS'.padEnd(6) + 'RATE'.padEnd(10) +
      'CURRENT'.padEnd(12) + 'PROPOSED'.padEnd(12) + 'DIFFERENCE'.padEnd(12) +
      'DIRECTION'.padEnd(11) + 'PAID'.padEnd(7) + 'CONFIDENCE');
    console.log('-'.repeat(130));
    for (const p of proposals) {
      console.log(
        String(p.weekStart).padEnd(12) +
        String(p.trainer.name).slice(0, 22).padEnd(24) +
        String(p.days).padEnd(6) +
        inr(p.stored).padEnd(10) +
        inr(p.amount).padEnd(12) +
        inr(p.proposedAmount).padEnd(12) +
        inr(Math.abs(p.difference)).padEnd(12) +
        p.direction.padEnd(11) +
        `${p.paidLogs.length}/${p.logs.length}`.padEnd(7) +
        p.confidence);
      console.log('            why: ' + p.reviewNote);
      if (p.paidLogs.length) {
        console.log(`            ** ${p.paidLogs.length} of ${p.logs.length} logs already marked Paid — money may already have gone out **`);
      }
    }

    /* ── Proposal summary ─────────────────────────────────────────────────── */
    const safeRows = proposals.filter((p) => p.safe);
    const reviewRows = proposals.filter((p) => !p.safe);
    const sumAbs = (rs) => rs.reduce((s, r) => s + Math.abs(r.difference), 0);
    const sumNet = (rs) => rs.reduce((s, r) => s + r.difference, 0);
    const sumPaidLogs = (rs) => rs.reduce((s, r) => s + r.paidLogs.length, 0);
    const sumCurrent = (rs) => rs.reduce((s, r) => s + r.amount, 0);
    const sumProposed = (rs) => rs.reduce((s, r) => s + r.proposedAmount, 0);

    const describe = (label, rs) => {
      const net = sumNet(rs);
      console.log('');
      console.log(` ${label}`);
      console.log(`   trainer-weeks           : ${rs.length}`);
      console.log(`   current stored total    : ${inr(sumCurrent(rs))}`);
      console.log(`   proposed total          : ${inr(sumProposed(rs))}`);
      console.log(`   total amount in play    : ${inr(sumAbs(rs))}  (sum of absolute differences)`);
      console.log(`   net movement            : ${inr(Math.abs(net))} ${net === 0 ? '' : net > 0 ? 'would come OFF the sheet (overpaid)' : 'would go ON to the sheet (underpaid)'}`);
      console.log(`   overpaid / underpaid    : ${rs.filter((r) => r.difference > 0).length} / ${rs.filter((r) => r.difference < 0).length}`);
      console.log(`   logs already Paid       : ${sumPaidLogs(rs)}`);
    };

    console.log('');
    console.log('='.repeat(78));
    console.log(' PROPOSAL SUMMARY');
    console.log('='.repeat(78));
    describe('LIKELY SAFE TO AUTO-CORRECT', safeRows);
    describe('NEEDS MANUAL REVIEW', reviewRows);
    console.log('');
    console.log(` TOTAL: ${proposals.length} trainer-week(s), ${inr(sumAbs(proposals))} in play, ${sumPaidLogs(proposals)} already-Paid log(s) involved`);
    console.log('='.repeat(78));

    /* ── Proposal CSV ─────────────────────────────────────────────────────── */
    const csvq = (v) => `"${String(v == null ? '' : v).replace(/\s*[\r\n]+\s*/g, ' ').replace(/"/g, '""')}"`;
    console.log('');
    console.log('--- CSV (copy from the line below into a spreadsheet) ---');
    console.log([
      'Week', 'Trainer', 'TrainerId', 'PaymentStructure', 'ProfileRate', 'StoredRate', 'AllStoredRates',
      'Days', 'CurrentAmount', 'ProposedAmount', 'Difference', 'Direction',
      'LogsThisWeek', 'PaidLogsThisWeek', 'Confidence', 'ReviewNote',
    ].join(','));
    for (const p of proposals) {
      console.log([
        p.weekStart, csvq(p.trainer.name), p.trainer.id, p.trainer.rateModel,
        p.trainer.defaultRateInr, p.stored, csvq(p.distinct.join(' | ')),
        p.days, p.amount, p.proposedAmount, p.difference, p.direction,
        p.logs.length, p.paidLogs.length, csvq(p.confidence), csvq(p.reviewNote),
      ].join(','));
    }
    console.log('--- end CSV ---');
  }

  loudDisclaimer();
  console.log('\nDone. No data was modified by this script.');
}

main()
  .catch((e) => { console.error('AUDIT FAILED:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
