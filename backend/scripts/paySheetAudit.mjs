/**
 * Payment Sheet audit — STRICTLY READ-ONLY.
 *
 * Answers the verification questions for the four Payment Sheet bug fixes by
 * querying the database directly. Contains no create/update/delete/upsert calls
 * of any kind, so it is safe to run against production.
 *
 *   Usage:  node scripts/paySheetAudit.mjs [YYYY-MM-DD weekStart]
 *
 * Defaults to the current week's Monday. Uses whatever DATABASE_URL is already
 * configured in backend/.env — it does not construct a connection of its own.
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
  const weekStart = process.argv[2] || mondayOf(new Date());
  const weekEnd = addDays(weekStart, 6);

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

  console.log('\nDone. No data was modified by this script.');
}

main()
  .catch((e) => { console.error('AUDIT FAILED:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
