/**
 * Randomised property tests for the Payment Sheet calculation.
 *
 * There is no frontend test runner in this repo, so this script drives the REAL
 * shared module (frontend/src/lib/paySheetCalc.ts) directly. It is pure — no
 * database, no server, no DOM.
 *
 *   Run:  cd backend && npx tsx scripts/paySheetCalcCheck.ts [--trainers=N] [--seed=N]
 *
 * It asserts, for every generated trainer-week and on every surface:
 *   a) round(Days x Rate) === displayed Total, with zero exceptions
 *   b) training_one_shot / training_monthly trainers are excluded everywhere
 *   c) no-show and zero-hour logs contribute 0 days
 *   d) a Days override drives Days and Total, and never mutates a log
 *   e) no undefined / null / NaN token reaches any rendered surface
 *   f) grid, CSV, WhatsApp, Bhavneet and PayoutView agree on Days/Rate/Total
 */

import {
  buildTrainerWeekRows, buildCsvLines, buildWhatsAppLines, grandTotal,
  rowPending, pendingTotal,
  toSessions, isTrainingCall, roundDays, fmtRate, effectiveRateModel,
  escapeHtml, tsvCell,
  type CalcLog, type OverrideLookup, type TrainerWeekRow,
} from '../../frontend/src/lib/paySheetCalc';

/* ── deterministic RNG so a failure is reproducible ───────────────────────── */
let seed = Number(process.argv.find((a) => a.startsWith('--seed='))?.split('=')[1] ?? 20260909);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const TRAINER_COUNT = Number(process.argv.find((a) => a.startsWith('--trainers='))?.split('=')[1] ?? 120);

const RATE_MODELS = ['hourly', 'per_session', 'training_one_shot', 'training_monthly'];
// Deliberately includes values whose binary representation is inexact (0.1, 0.3,
// 1.1, 2.2 ...) so float drift in the Days sum would surface.
const HOURS = [0, 0.1, 0.25, 0.5, 0.75, 1, 1.1, 1.25, 1.5, 2, 2.2, 2.5, 3, 3.3, 4, 6, 8];
const RATES = [0, 300, 500, 800, 900, 1000, 1100, 1300, 1500, 1800, 2000, 2500, 5000, 20000];
const STATUSES = ['Logged', 'Paid', 'NotPaid', 'Hold'];
const COMMENTS = [null, '', 'ok', 'Diwali bonus approved', 'special rate agreed', 'check with Mitali', 'a, comma "quoted" note'];

type Fixture = {
  trainerId: string; name: string; rateModel: string;
  logs: CalcLog[]; override: number | null;
};

function makeFixtures(n: number): Fixture[] {
  const out: Fixture[] = [];
  for (let i = 0; i < n; i++) {
    const rateModel = pick(RATE_MODELS);
    const trainerId = `t${i}`;
    const name = `Trainer ${String(i).padStart(3, '0')}`;
    const trainer = {
      id: trainerId, name, rateModel,
      defaultRateInr: pick(RATES),
      upiId: rnd() < 0.4 ? `t${i}@upi` : undefined,
      bankHolderName: rnd() < 0.6 ? `Holder ${i}` : undefined,
      bankName: rnd() < 0.6 ? 'HDFC' : undefined,
      bankAccountNumber: rnd() < 0.6 ? `9000${i}` : undefined,
      bankIfscCode: rnd() < 0.6 ? 'HDFC0001234' : undefined,
      phoneCode: rnd() < 0.5 ? '+91' : undefined,
      phoneDigits: rnd() < 0.5 ? `98765${String(i).padStart(5, '0')}` : undefined,
    };
    const logCount = int(0, 6);
    const logs: CalcLog[] = [];
    // A single rate for most weeks; sometimes deliberately inconsistent.
    const baseRate = pick(RATES);
    const mixedRates = rnd() < 0.25;
    for (let j = 0; j < logCount; j++) {
      const hours = pick(HOURS);
      const happened = rnd() < 0.8;
      const rate = mixedRates ? pick(RATES) : baseRate;
      logs.push({
        id: `${trainerId}-l${j}`,
        date: `2026-09-${String(7 + (j % 7)).padStart(2, '0')}`,
        hours: happened ? hours : pick(HOURS),
        rateSnapshot: rate,
        rateModel,
        // Stored amount is deliberately arbitrary — legacy rows in production do
        // NOT satisfy days x rate, which is the whole reason for this change.
        amountInr: rnd() < 0.5 ? Math.round(hours * rate) : int(0, 40000),
        status: pick(STATUSES),
        comments: pick(COMMENTS),
        sessionHappened: happened,
        trainer,
        client: rnd() < 0.8 ? { id: `c${j}`, name: `Client ${j}` } : null,
      });
    }
    const override = rnd() < 0.3 ? pick([0, 0.5, 1, 1.5, 2, 2.5, 3, 4.5, 7]) : null;
    out.push({ trainerId, name, rateModel, logs, override });
  }
  return out;
}

/* ── assertions ───────────────────────────────────────────────────────────── */
let checks = 0;
const failures: string[] = [];
function check(cond: boolean, msg: string) {
  checks++;
  if (!cond) failures.push(msg);
}

/** Catches undefined / null / NaN / [object Object] leaking into rendered text. */
const BAD_TOKEN = /\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/;

/** RFC-4180 CSV line parser — deliberately strict, so a quoting bug in the
 *  export shows up as a wrong column count rather than being silently absorbed. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Exhaustive stress of the Days-override interaction against hostile rate data.
 *
 * Every override value is crossed with every rate shape and every rate model,
 * including shapes that cannot occur through the UI (negative, NaN, null,
 * undefined) so that corrupt rows in an old database cannot put a NaN or a
 * stray token on a payment screen.
 */
function stressOverrideMatrix() {
  const OVERRIDES: (number | null)[] = [null, 0, 0.5, 1, 2.5, 7, 100];
  const RATE_SHAPES: { label: string; rates: any[] }[] = [
    { label: 'single',            rates: [1300, 1300, 1300] },
    { label: 'mixed',             rates: [1000, 1500] },
    { label: 'all-zero',          rates: [0, 0] },
    { label: 'mixed-with-zero',   rates: [0, 1500] },
    { label: 'negative',          rates: [-500, -500] },
    { label: 'mixed-negative',    rates: [-500, 1000] },
    // Labels deliberately avoid the words NaN/null/undefined: they end up in the
    // trainer NAME, and the stray-token scanner would flag its own fixture.
    { label: 'one-unusable',      rates: [NaN, 1200] },
    { label: 'all-unusable',      rates: [NaN, NaN] },
    { label: 'missing-values',    rates: [null, undefined] },
  ];
  const MODELS = ['hourly', 'per_session', 'training_one_shot', 'training_monthly'];

  let combos = 0;
  for (const override of OVERRIDES) {
    for (const shape of RATE_SHAPES) {
      for (const model of MODELS) {
        combos++;
        const id = `x-${model}-${shape.label}-${override}`;
        const trainer = { id, name: `Stress ${shape.label}`, rateModel: model };
        const logs: CalcLog[] = shape.rates.map((rate, j) => ({
          id: `${id}-l${j}`, date: '2026-09-07', hours: [0, 0.5, 2, 3][j % 4],
          rateSnapshot: rate as number, rateModel: model, amountInr: 4321,
          status: 'Logged', comments: null, sessionHappened: j !== 0,
          trainer, client: { name: 'C' },
        }));
        const getOverride: OverrideLookup = (t) => (t === id ? override : null);
        const rows = buildTrainerWeekRows(logs, getOverride);
        const isLumpSum = model === 'training_one_shot' || model === 'training_monthly';

        if (isLumpSum) {
          // An override must never resurrect an excluded trainer.
          check(rows.length === 0,
            `stress[${id}]: training-call trainer produced ${rows.length} row(s) — override leaked onto an excluded trainer`);
          check(buildCsvLines(rows).length === 0 && buildWhatsAppLines(rows).length === 0,
            `stress[${id}]: excluded trainer reached an export`);
          continue;
        }

        check(rows.length === 1, `stress[${id}]: expected 1 row, got ${rows.length}`);
        const r = rows[0];

        // The core rule must hold even on corrupt rate data.
        check(Number.isFinite(r.rate), `stress[${id}]: rate is ${r.rate}`);
        check(Number.isFinite(r.days), `stress[${id}]: days is ${r.days}`);
        check(Number.isFinite(r.total), `stress[${id}]: total is ${r.total}`);
        check(r.total === Math.round(r.days * r.rate),
          `stress[${id}]: total ${r.total} !== round(${r.days} x ${r.rate})`);

        // The override drives Days exactly, or is absent.
        if (override != null) {
          check(r.isOverridden, `stress[${id}]: override ${override} not applied`);
          check(r.days === roundDays(override), `stress[${id}]: days ${r.days} !== ${override}`);
        } else {
          check(!r.isOverridden, `stress[${id}]: reported overridden with no override`);
        }

        // Nothing corrupt may reach a rendered surface.
        const csv = buildCsvLines(rows)[0];
        const wa = buildWhatsAppLines(rows)[0];
        check(!BAD_TOKEN.test(csv), `stress[${id}]: CSV carries a stray token: ${csv}`);
        check(!BAD_TOKEN.test(wa), `stress[${id}]: WhatsApp carries a stray token: ${wa}`);
        const cells = parseCsvLine(csv);
        check(cells.length === 8, `stress[${id}]: CSV has ${cells.length} columns`);
        check(Number(cells[6]) === Math.round(Number(cells[4]) * Number(cells[5])),
          `stress[${id}]: CSV row does not tie out: ${csv}`);

        // The displayed rate must still be a really-stored value (or 0 when
        // every stored rate was unusable).
        const finiteStored = shape.rates.filter((x) => Number.isFinite(x));
        check(finiteStored.length === 0 ? r.rate === 0 : finiteStored.includes(r.rate),
          `stress[${id}]: rate ${r.rate} was never stored (${shape.rates.join(',')})`);
      }
    }
  }
  console.log(`override stress matrix        : ${combos} combinations (overrides x rate shapes x rate models)`);
}

function main() {
  const fixtures = makeFixtures(TRAINER_COUNT);
  const allLogs = fixtures.flatMap((f) => f.logs);
  const overrides = new Map<string, number | null>();
  for (const f of fixtures) overrides.set(f.trainerId, f.override);
  const getOverride: OverrideLookup = (id) => overrides.get(id) ?? null;

  // Deep copy to prove no surface mutates the logs it was handed (invariant d).
  const before = JSON.stringify(allLogs);

  /* The five surfaces. Grid, Bhavneet and PayoutView read row fields directly;
     CSV and WhatsApp go through the real exported line builders. */
  const gridRows = buildTrainerWeekRows(allLogs, getOverride);
  const payoutRows = buildTrainerWeekRows(allLogs, getOverride);
  const bhavneetRows = buildTrainerWeekRows(allLogs, getOverride);
  const csvLines = buildCsvLines(gridRows);
  const waLines = buildWhatsAppLines(gridRows);

  check(JSON.stringify(allLogs) === before,
    '(d) building rows mutated the underlying session logs');

  /* (b) training-call trainers excluded everywhere */
  const trainingIds = new Set(fixtures.filter((f) => f.rateModel === 'training_one_shot' || f.rateModel === 'training_monthly').map((f) => f.trainerId));
  for (const r of gridRows) {
    check(!trainingIds.has(r.trainer.id),
      `(b) training-call trainer ${r.trainer.id} (${r.trainer.rateModel}) reached the sheet`);
  }
  const excludedWithLogs = fixtures.filter((f) => trainingIds.has(f.trainerId) && f.logs.length > 0);
  check(excludedWithLogs.length > 0, '(b) fixture set never produced a training-call trainer with logs — test is vacuous');
  for (const line of [...csvLines, ...waLines]) {
    for (const f of excludedWithLogs) {
      check(!line.includes(f.name), `(b) excluded trainer ${f.name} appeared in an export line`);
    }
  }

  /* per-row invariants */
  const byId = new Map(gridRows.map((r) => [r.trainer.id, r]));
  for (const r of gridRows) {
    const f = fixtures.find((x) => x.trainerId === r.trainer.id)!;

    /* (a) the core rule, on the grid row itself */
    check(r.total === Math.round(r.days * r.rate),
      `(a) ${r.trainer.id}: total ${r.total} !== round(${r.days} x ${r.rate}) = ${Math.round(r.days * r.rate)}`);

    /* (c) no-show / zero-hour logs contribute nothing */
    const expectedDerived = roundDays(f.logs.reduce((s, l) => s + toSessions(l), 0));
    check(r.derivedDays === expectedDerived,
      `(c) ${r.trainer.id}: derivedDays ${r.derivedDays} !== ${expectedDerived}`);
    for (const l of f.logs) {
      if (l.sessionHappened === false || !l.hours || l.hours <= 0) {
        check(toSessions(l) === 0, `(c) ${l.id}: no-show/zero-hour log contributed ${toSessions(l)} days`);
      }
    }

    /* (d) override drives Days */
    if (f.override != null) {
      check(r.isOverridden, `(d) ${r.trainer.id}: override ${f.override} not reported as overridden`);
      check(r.days === roundDays(f.override), `(d) ${r.trainer.id}: days ${r.days} !== override ${f.override}`);
      check(r.total === Math.round(roundDays(f.override) * r.rate),
        `(d) ${r.trainer.id}: total not derived from the override`);
    } else {
      check(!r.isOverridden, `(d) ${r.trainer.id}: reported overridden with no override set`);
      check(r.days === r.derivedDays, `(d) ${r.trainer.id}: days ${r.days} !== derivedDays ${r.derivedDays}`);
    }

    /* pending must be a share of the row, never more than it, never negative */
    const pend = rowPending(r);
    check(Number.isFinite(pend), `(g) ${r.trainer.id}: pending is ${pend}`);
    check(pend >= Math.min(0, r.total) && Math.abs(pend) <= Math.abs(r.total) + 1,
      `(g) ${r.trainer.id}: pending ${pend} outside the row total ${r.total}`);
    const allPaid = f.logs.length > 0 && f.logs.every((l) => l.status === 'Paid');
    const nonePaid = f.logs.length > 0 && f.logs.every((l) => l.status !== 'Paid');
    if (allPaid) check(pend === 0, `(g) ${r.trainer.id}: fully paid but pending ${pend}`);
    if (nonePaid) check(pend === r.total, `(g) ${r.trainer.id}: nothing paid but pending ${pend} !== total ${r.total}`);
    check(r.unpaidDerivedDays <= r.derivedDays + 1e-9,
      `(g) ${r.trainer.id}: unpaidDerivedDays ${r.unpaidDerivedDays} > derivedDays ${r.derivedDays}`);

    /* the displayed rate must be a rate that is really stored on a log */
    const stored = f.logs.map((l) => l.rateSnapshot);
    check(stored.length === 0 || stored.includes(r.rate),
      `(a) ${r.trainer.id}: displayed rate ${r.rate} is not stored on any log (${stored.join(',')})`);

    /* (e) no stray tokens in any numeric field */
    for (const [k, v] of Object.entries({ days: r.days, rate: r.rate, total: r.total, derivedDays: r.derivedDays })) {
      check(typeof v === 'number' && Number.isFinite(v), `(e) ${r.trainer.id}: ${k} is ${String(v)}`);
    }
    check(!BAD_TOKEN.test(String(r.days)) && !BAD_TOKEN.test(String(r.total)),
      `(e) ${r.trainer.id}: stray token in a rendered number`);
    /* float drift must never reach the Days cell */
    check(String(r.days).replace('-', '').replace('.', '').length <= 8,
      `(e) ${r.trainer.id}: Days rendered with float drift: ${r.days}`);
  }

  /* (f) every surface agrees, field by field */
  for (const surface of [payoutRows, bhavneetRows]) {
    check(surface.length === gridRows.length, '(f) surface produced a different number of rows than the grid');
    for (let i = 0; i < surface.length; i++) {
      const a = gridRows[i], b = surface[i];
      check(a.trainer.id === b.trainer.id, `(f) row ${i}: trainer mismatch`);
      check(a.days === b.days, `(f) ${a.trainer.id}: days ${a.days} vs ${b.days}`);
      check(a.rate === b.rate, `(f) ${a.trainer.id}: rate ${a.rate} vs ${b.rate}`);
      check(a.total === b.total, `(f) ${a.trainer.id}: total ${a.total} vs ${b.total}`);
    }
  }

  /* (f) + (a) parsed back out of the REAL export text */
  check(csvLines.length === gridRows.length, '(f) CSV produced a different row count');
  check(waLines.length === gridRows.length, '(f) WhatsApp produced a different row count');
  for (let i = 0; i < csvLines.length; i++) {
    const r = gridRows[i];

    // CSV: a real RFC-4180 parse, so quoting bugs surface instead of hiding.
    const cells = parseCsvLine(csvLines[i]);
    const csvDays = Number(cells[4]), csvRate = Number(cells[5]), csvTotal = Number(cells[6]);
    check(csvDays === r.days, `(f) CSV ${r.trainer.id}: days ${csvDays} vs grid ${r.days}`);
    check(csvRate === r.rate, `(f) CSV ${r.trainer.id}: rate ${csvRate} vs grid ${r.rate}`);
    check(csvTotal === r.total, `(f) CSV ${r.trainer.id}: total ${csvTotal} vs grid ${r.total}`);
    check(csvTotal === Math.round(csvDays * csvRate), `(a) CSV ${r.trainer.id}: ${csvDays} x ${csvRate} !== ${csvTotal}`);
    check(!BAD_TOKEN.test(csvLines[i]), `(e) CSV line has a stray token: ${csvLines[i]}`);
    // The quoted fields must keep the row's column count intact.
    check(cells.length === 8, `(e) CSV ${r.trainer.id}: ${cells.length} columns, expected 8`);

    // WhatsApp: "<sr> <name> <days> * <rate> (=) <total>"
    const m = waLines[i].match(/^\s*(\d+)\s+(.*?)\s+([\d.]+)\s+\*\s+([\d.]+)\s+\(=\)\s+(\d+)\s*$/);
    check(!!m, `(e) WhatsApp line unparseable: ${waLines[i]}`);
    if (m) {
      const waDays = Number(m[3]), waRate = Number(m[4]), waTotal = Number(m[5]);
      check(waDays === r.days, `(f) WA ${r.trainer.id}: days ${waDays} vs grid ${r.days}`);
      check(waRate === r.rate, `(f) WA ${r.trainer.id}: rate ${waRate} vs grid ${r.rate}`);
      check(waTotal === r.total, `(f) WA ${r.trainer.id}: total ${waTotal} vs grid ${r.total}`);
      check(waTotal === Math.round(waDays * waRate), `(a) WA ${r.trainer.id}: ${waDays} x ${waRate} !== ${waTotal}`);
    }
    check(!BAD_TOKEN.test(waLines[i]), `(e) WhatsApp line has a stray token: ${waLines[i]}`);
  }

  /* grand total ties out to the sum of the rows */
  const gt = grandTotal(gridRows);
  check(gt === gridRows.reduce((s, r) => s + Math.round(r.days * r.rate), 0),
    '(a) grand total is not the sum of Days x Rate');

  /* (d) again, end to end: nothing anywhere mutated a log */
  check(JSON.stringify(allLogs) === before, '(d) a surface mutated the session logs');

  /* targeted regression: the historical Sathish Punati row. Under the new rule
     the Total follows Days x Rate instead of the stored 10183. */
  const sathishLogs: CalcLog[] = Array.from({ length: 5 }, (_, j) => ({
    id: `sp-${j}`, date: '2026-09-07', hours: j === 4 ? 1 : 2,
    rateSnapshot: 1300, rateModel: 'per_session', amountInr: j === 0 ? 6183 : 1000,
    status: 'Logged', comments: null, sessionHappened: true,
    trainer: { id: 'sp', name: 'Sathish Punati', rateModel: 'per_session' },
    client: { name: 'Acme' },
  }));
  const sp = buildTrainerWeekRows(sathishLogs)[0];
  check(sp.days === 4.5, `regression: Sathish days ${sp.days} !== 4.5`);
  check(sp.rate === 1300, `regression: Sathish rate ${sp.rate} !== 1300 (must be the STORED rate, never 10183/4.5)`);
  check(sp.total === 5850, `regression: Sathish total ${sp.total} !== 5850`);
  check(sp.storedTotal === 10183, `regression: Sathish storedTotal ${sp.storedTotal} !== 10183 (stored data must be untouched)`);

  /* Pending pro-ration regression: 2 of 3 equal days paid must report a third
     of the row, NOT the whole row (the bug this replaced). */
  const partial = buildTrainerWeekRows([0, 1, 2].map((j) => ({
    id: `pp${j}`, date: '2026-09-07', hours: 2, rateSnapshot: 1200,
    rateModel: 'per_session', amountInr: 1200, status: j < 2 ? 'Paid' : 'Logged',
    sessionHappened: true, trainer: { id: 'pp', name: 'Partly Paid', rateModel: 'per_session' },
  })))[0];
  check(partial.days === 3, `pending regression: days ${partial.days} !== 3`);
  check(partial.total === 3600, `pending regression: total ${partial.total} !== 3600`);
  check(partial.unpaidDerivedDays === 1, `pending regression: unpaidDerivedDays ${partial.unpaidDerivedDays} !== 1`);
  check(rowPending(partial) === 1200, `pending regression: pending ${rowPending(partial)} !== 1200 (a third of 3600)`);
  check(pendingTotal([partial]) === 1200, `pending regression: pendingTotal ${pendingTotal([partial])} !== 1200`);

  /* float-drift regression: 1.1 + 2.2 must not render as 3.3000000000000003 */
  const drift = buildTrainerWeekRows([
    { id: 'd1', date: '2026-09-07', hours: 1.1, rateSnapshot: 1000, rateModel: 'hourly', amountInr: 0, status: 'Logged', sessionHappened: true, trainer: { id: 'dr', name: 'Drift', rateModel: 'hourly' } },
    { id: 'd2', date: '2026-09-08', hours: 2.2, rateSnapshot: 1000, rateModel: 'hourly', amountInr: 0, status: 'Logged', sessionHappened: true, trainer: { id: 'dr', name: 'Drift', rateModel: 'hourly' } },
  ])[0];
  check(drift.days === 3.3, `regression: float drift reached Days as ${drift.days}`);
  check(drift.total === 3300, `regression: drift total ${drift.total} !== 3300`);

  /* fmtRate must never emit a stray token */
  for (const n of [0, 1300, 1300.5, 0.25]) {
    check(!BAD_TOKEN.test(fmtRate(n)), `(e) fmtRate(${n}) = ${fmtRate(n)}`);
  }

  stressOverrideMatrix();

  /* summary */
  const excluded = fixtures.filter((f) => trainingIds.has(f.trainerId)).length;
  const overridden = gridRows.filter((r) => r.isOverridden).length;
  const mixedRate = gridRows.filter((r) => r.distinctRates.length > 1).length;
  const disagreeing = gridRows.filter((r) => r.total !== r.storedTotal).length;

  /* (g) escaping — user-controlled text must never escape into generated
     documents. The PDF export writes into a window that inherits the app's
     origin, so an unescaped trainer name is executable script. */
  const TAB = String.fromCharCode(9), LF = String.fromCharCode(10), CR = String.fromCharCode(13);
  const HOSTILE = [
    '<img src=x onerror=alert(1)>',
    '</td><script>fetch("//evil")</script><td>',
    'Anita "Quotes" ' + String.fromCharCode(39) + 'Brien',
    '<b>&amp;</b>',
    'Ravi' + TAB + 'Kumar',
    'line1' + LF + 'line2',
    'Ravi' + CR + LF + 'Kumar',
  ];

  for (const raw of HOSTILE) {
    const e = escapeHtml(raw);
    check(!/[<>]/.test(e), `(g) escapeHtml left an angle bracket in: ${JSON.stringify(raw)}`);
    check(!e.includes('"'), `(g) escapeHtml left a raw double quote in: ${JSON.stringify(raw)}`);
    check(!e.includes("'"), `(g) escapeHtml left a raw single quote in: ${JSON.stringify(raw)}`);
    check(!/<script/i.test(e), `(g) escapeHtml let a script tag through: ${JSON.stringify(raw)}`);
    check(!/onerror=/i.test(e) || !/</.test(e), `(g) escapeHtml left an executable handler: ${JSON.stringify(raw)}`);

    const t = tsvCell(raw);
    check(!(t.includes(TAB) || t.includes(CR) || t.includes(LF)),
      `(g) tsvCell left a delimiter in: ${JSON.stringify(raw)}`);
  }
  // Escaping must be lossless in the sense that nothing is silently dropped.
  check(escapeHtml('A & B') === 'A &amp; B', '(g) escapeHtml mangled a plain ampersand');
  check(escapeHtml(null) === '' && escapeHtml(undefined) === '',
    '(g) escapeHtml turned a nullish value into a literal null/undefined');
  check(tsvCell(null) === '' && tsvCell(undefined) === '',
    '(g) tsvCell turned a nullish value into a literal null/undefined');
  // Unicode / emoji / RTL must survive untouched (item 9).
  for (const ok of ['Zoë Müller', '日本語講師', 'مدرب', 'Ravi 🎉 Kumar']) {
    check(escapeHtml(ok) === ok, `(g) escapeHtml altered safe unicode: ${ok}`);
    check(tsvCell(ok) === ok, `(g) tsvCell altered safe unicode: ${ok}`);
  }

  console.log('Payment Sheet calculation — randomised property tests');
  console.log('='.repeat(66));
  console.log(`seed                          : ${process.argv.find((a) => a.startsWith('--seed=')) ?? '20260909 (default)'}`);
  console.log(`trainers generated            : ${fixtures.length}`);
  console.log(`  excluded as training calls  : ${excluded}`);
  console.log(`  rows on the sheet           : ${gridRows.length}`);
  console.log(`  with a Days override        : ${overridden}`);
  console.log(`  with disagreeing log rates  : ${mixedRate}`);
  console.log(`  where stored != Days x Rate : ${disagreeing}  <- these are the rows that used to show a badge`);
  console.log(`session logs generated        : ${allLogs.length}`);
  console.log(`assertions run                : ${checks}`);
  console.log('='.repeat(66));

  if (failures.length) {
    console.log(`\nFAILED — ${failures.length} assertion(s):\n`);
    for (const f of failures.slice(0, 40)) console.log('  ✗ ' + f);
    if (failures.length > 40) console.log(`  … +${failures.length - 40} more`);
    process.exitCode = 1;
  } else {
    console.log('\nALL PASSED — Days x Rate === Total on every row of every surface.');
  }
}

main();
