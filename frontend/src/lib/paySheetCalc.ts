/**
 * Payment Sheet calculation — THE single source of truth.
 *
 * Every surface that shows a trainer's week (the Excel grid, the CSV export, the
 * WhatsApp export, the monthly Bhavneet sheet, and the Payout view) builds its
 * rows from `buildTrainerWeekRows` in this file. They cannot disagree with each
 * other because there is only one implementation.
 *
 * This module has NO imports on purpose: it stays loadable by a plain Node
 * script, which is how the randomised property tests exercise it (there is no
 * frontend test runner in this repo).
 *
 * ============================================================================
 * DESIGN RULE (supersedes the earlier "always show the stored rate + a warning
 * badge" rule — read this before changing display maths again)
 * ============================================================================
 *
 * The displayed Total is ALWAYS `round(Days x Rate)`, computed live. It is never
 * the sum of the stored `amountInr` values.
 *
 * Why this rule replaced the previous one
 * ---------------------------------------
 * Three approaches have now been tried, in this order:
 *
 *   1. Show stored Amount, and show `Amount / Days` as the Rate when they
 *      disagreed. REJECTED: the rate shown matched no trainer's profile, and
 *      was correctly reported as "rates stopped syncing from the profile".
 *      Never fabricate a rate. This part of the rule still stands.
 *
 *   2. Show stored Amount and the real stored Rate, and flag the gap with a
 *      warning badge (MixedRateBadge). REJECTED: every badge was re-reported as
 *      "the calculations are wrong again". A live payment page that routinely
 *      shows arithmetic that does not add up trains its readers to distrust it,
 *      and the badge could not distinguish "bad historical data" from "a bug we
 *      just shipped".
 *
 *   3. (current) Show the real stored Rate, the real Days, and a Total DERIVED
 *      from them. Days x Rate now ties out by construction on every surface, so
 *      there is nothing left to warn about on the live page.
 *
 * Where the discrepancy information went
 * --------------------------------------
 * It did not disappear. Where the stored `amountInr` disagrees with Days x Rate,
 * that is still meaningful — it may mean wrong historical data, or a real open
 * question about what is owed. That analysis now lives ONLY in the read-only
 * audit report (`backend/scripts/paySheetAudit.mjs`, RATE MISMATCH REPORT and
 * BULK CORRECTION PROPOSAL), which a human runs deliberately. It is deliberately
 * kept off the day-to-day sheet.
 *
 * What this rule does NOT do
 * --------------------------
 * It does not change what is paid. Real money is computed server-side in
 * `POST /payouts`, which re-reads the selected session logs and sums their
 * stored `amountInr`. The frontend sends only `sessionIds`. Nothing in this
 * file can move that number. Keep it that way: if you ever make a payout amount
 * come from `row.total`, you have turned a display convenience into a financial
 * change, and this comment is where you were warned.
 * ========================================================================== */

/** Values of the RateModel enum in schema.prisma. */
export const LUMP_SUM_TRAINING = ['training_one_shot', 'training_monthly'];

export type CalcTrainer = {
  id: string;
  name: string;
  rateModel?: string;
  [key: string]: any;
};

export type CalcLog = {
  id: string;
  date: string;
  hours: number;
  rateSnapshot: number;
  rateModel?: string;
  amountInr: number;
  status?: string;
  comments?: string | null;
  sessionHappened?: boolean;
  trainer: CalcTrainer;
  client?: { id?: string; name: string } | null;
};

/** The trainer's payment structure. The trainer record is the source of truth;
 *  the log's snapshot is only a fallback for logs whose trainer no longer
 *  resolves. */
export function effectiveRateModel(log: CalcLog): string {
  return log.trainer?.rateModel || log.rateModel || 'per_session';
}

/** Internal training calls are paid as a separate lump sum, so their timings
 *  must never reach this sheet. */
export function isTrainingCall(log: CalcLog): boolean {
  return LUMP_SUM_TRAINING.includes(effectiveRateModel(log));
}

/** Convert one log to "days", strictly per the trainer's payment structure:
 *    hourly:      raw hours
 *    per_session: <=1h = 0.5 session, >1h = 1 session
 *  A session that did not happen ("No Session Happened") or that carries no
 *  logged time counts as 0 — it must not bill as a half session. */
export function toSessions(log: CalcLog): number {
  if (log.sessionHappened === false || !log.hours || log.hours <= 0) return 0;
  if (effectiveRateModel(log) === 'hourly') return log.hours;
  return log.hours <= 1.0 ? 0.5 : 1;
}

/** Summing floats drifts: 1.1 + 2.2 is 3.3000000000000003, which used to reach
 *  the Days cell verbatim. Days are half-sessions or logged hours, so two
 *  decimals is more precision than the input ever carries. */
export function roundDays(days: number): number {
  if (!Number.isFinite(days)) return 0;
  return Math.round(days * 100) / 100;
}

/** A stored figure only counts if it is a real, finite number.
 *  `rateSnapshot` and `amountInr` are non-nullable Ints in the schema, so this
 *  should never fire — but a corrupt or half-migrated row must degrade to 0
 *  rather than print the literal text "NaN" on a payment screen. */
function usableNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** The rate to DISPLAY for a week: always a rate that is actually stored on one
 *  of the logs, never a computed one. Sorting makes it independent of the order
 *  the logs happen to arrive in, so every surface picks the same figure. When a
 *  week's logs disagree, the lowest stored rate is shown — the disagreement
 *  itself is reported by the audit script, not here. */
export function displayedRate(rates: number[]): number {
  const distinct = Array.from(new Set(rates.filter(usableNumber))).sort((a, b) => a - b);
  return distinct[0] ?? 0;
}

/** The one and only Total formula. */
export function computeTotal(days: number, rate: number): number {
  const d = usableNumber(days) ? days : 0;
  const r = usableNumber(rate) ? rate : 0;
  return Math.round(d * r);
}

export type TrainerWeekRow = {
  trainer: CalcTrainer;
  /** Days DISPLAYED — the manual override when one is set, else derived. */
  days: number;
  /** Days derived from the session logs, ignoring any override. */
  derivedDays: number;
  /** Of `derivedDays`, the portion sitting on logs that are not yet Paid.
   *  Used to pro-rate a partly-paid week — see rowPending(). */
  unpaidDerivedDays: number;
  /** True when a manual Days override supplied `days`. */
  isOverridden: boolean;
  /** The stored rate shown on screen. */
  rate: number;
  /** Every distinct stored rate this week, ascending. Diagnostics only. */
  distinctRates: number[];
  /** DISPLAY total: always round(days x rate). */
  total: number;
  /** Sum of the stored amountInr. NOT displayed — kept so write paths and the
   *  audit trail can still reach the real stored figure. */
  storedTotal: number;
  /** Rate snapshot of the first log — used by the inline rate editor's WRITE
   *  path, which must address a real log, not the display figure. */
  firstLogRate: number;
  logIds: string[];
  logs: CalcLog[];
  comments: string[];
  clients: string[];
  /** Latest session date in the week. */
  date: string;
  /** 'Paid' only when every log is Paid, else the last non-Paid status seen. */
  status: string;
};

export type OverrideLookup = (trainerId: string) => number | null | undefined;

/**
 * Group a week's logs into one row per trainer.
 *
 * Training calls are dropped here as well as at the page's filter, so a caller
 * that forgets to pre-filter still cannot bill one.
 *
 * `getOverride` supplies the manual Days override for a trainer+week. Passing
 * nothing means "no overrides", which is what a surface that has not loaded the
 * TrainerPayWeek rows would otherwise silently assume — so always pass it.
 */
export function buildTrainerWeekRows(
  logs: CalcLog[],
  getOverride: OverrideLookup = () => null,
): TrainerWeekRow[] {
  type Acc = {
    trainer: CalcTrainer; derivedDays: number; unpaidDerivedDays: number; storedTotal: number;
    rates: number[]; logIds: string[]; logs: CalcLog[];
    comments: string[]; clients: Set<string>; date: string; status: string;
  };
  const map = new Map<string, Acc>();

  for (const l of logs) {
    if (isTrainingCall(l)) continue;
    const key = l.trainer.id;
    if (!map.has(key)) {
      map.set(key, {
        trainer: l.trainer, derivedDays: 0, unpaidDerivedDays: 0, storedTotal: 0, rates: [],
        logIds: [], logs: [], comments: [], clients: new Set<string>(),
        date: l.date, status: 'Paid',
      });
    }
    const a = map.get(key)!;
    const logDays = toSessions(l);
    a.derivedDays += logDays;
    if (l.status !== 'Paid') a.unpaidDerivedDays += logDays;
    if (usableNumber(l.amountInr)) a.storedTotal += l.amountInr;
    a.rates.push(l.rateSnapshot);
    a.logIds.push(l.id);
    a.logs.push(l);
    if (l.comments) a.comments.push(l.comments);
    if (l.client?.name) a.clients.add(l.client.name);
    if (l.date > a.date) a.date = l.date;
    if (l.status !== 'Paid') a.status = l.status ?? 'Logged';
  }

  return Array.from(map.values())
    .map((a): TrainerWeekRow => {
      const derivedDays = roundDays(a.derivedDays);
      const override = getOverride(a.trainer.id);
      const isOverridden = override != null;
      const days = roundDays(isOverridden ? Number(override) : derivedDays);
      const rate = displayedRate(a.rates);
      return {
        trainer: a.trainer,
        days,
        derivedDays,
        unpaidDerivedDays: roundDays(a.unpaidDerivedDays),
        isOverridden,
        rate,
        distinctRates: Array.from(new Set(a.rates.filter(usableNumber))).sort((x, y) => x - y),
        total: computeTotal(days, rate),
        storedTotal: a.storedTotal,
        firstLogRate: usableNumber(a.rates[0]) ? a.rates[0] : 0,
        logIds: a.logIds,
        logs: a.logs,
        comments: a.comments,
        clients: Array.from(a.clients),
        date: a.date,
        status: a.status,
      };
    })
    .sort((x, y) => x.trainer.name.localeCompare(y.trainer.name));
}

/** Grand total of the DISPLAYED figures. Always equals the sum of Days x Rate. */
export function grandTotal(rows: TrainerWeekRow[]): number {
  return rows.reduce((s, r) => s + r.total, 0);
}

/**
 * The still-unpaid share of one row's displayed Total.
 *
 * Payment status lives on the individual session logs, but the Total is now a
 * whole-week figure (Days x Rate), so a part-paid week has to be pro-rated: the
 * unpaid fraction of the week's derived days is applied to the displayed Total.
 * Two logs paid out of three therefore reports a third of the row, which is what
 * the old per-log `amountInr` sum reported too.
 *
 * Do NOT simplify this to "any unpaid log means the whole row is pending" — that
 * over-reports every part-paid week, which is the bug this function exists to
 * avoid.
 */
export function rowPending(r: TrainerWeekRow): number {
  if (r.derivedDays > 0) {
    return Math.round(r.total * (r.unpaidDerivedDays / r.derivedDays));
  }
  // No derived days to pro-rate against (every log a no-show, or an overridden
  // row with no logged time). Fall back to the whole row when it is not Paid.
  return r.status !== 'Paid' ? r.total : 0;
}

/** Sum of the unpaid share across rows — the "Pending Payment" figure. */
export function pendingTotal(rows: TrainerWeekRow[]): number {
  return rows.reduce((s, r) => s + rowPending(r), 0);
}

/** Whole rates render plainly; a fractional one keeps 2dp so the row ties out. */
export function fmtRate(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Export row builders ──────────────────────────────────────────────────────
 * The text-producing half of the CSV and WhatsApp exports lives here, with no
 * Blob/document involved, so the randomised tests can assert on the REAL export
 * output rather than on a re-implementation of it. The page keeps only the
 * download plumbing. */

/** Pipe-separated bank line used by the CSV export. */
export function bankDetailsInline(t: CalcTrainer): string {
  if (t.upiId) return `UPI: ${t.upiId}`;
  return [
    t.bankHolderName, t.bankName,
    t.bankAccountNumber ? `A/c: ${t.bankAccountNumber}` : '',
    t.bankIfscCode ? `IFSC: ${t.bankIfscCode}` : '',
  ].filter(Boolean).join(' | ');
}

export const CSV_HEADER = [
  'Sr No', 'Trainer Name', 'Bank Account / UPI Details', 'Phone (UPI)',
  'Days', 'Rate/Session (₹)', 'Total Amount (₹)', 'Comments',
].join(',');

/** RFC-4180 quoting. Every free-text field goes through this: a trainer comment
 *  containing a comma used to shift every later column by one, and one
 *  containing a double quote produced a row no spreadsheet could parse. */
export function csvQuote(v: string): string {
  return `"${String(v ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""')}"`;
}

/** One CSV line per trainer-week. Numbers stay raw — a locale-formatted
 *  thousands separator would inject a comma into the column. */
export function buildCsvLines(rows: TrainerWeekRow[]): string[] {
  return rows.map((t, i) => {
    const tr = t.trainer;
    const phone = tr.phoneCode && tr.phoneDigits ? `${tr.phoneCode}${tr.phoneDigits}` : '';
    return [
      i + 1, csvQuote(tr.name), csvQuote(bankDetailsInline(tr)), csvQuote(phone),
      t.days, t.rate, t.total, csvQuote(t.comments.filter(Boolean).join('; ')),
    ].join(',');
  });
}

/** The fixed-width WhatsApp summary body (no header, no grand total). */
export function buildWhatsAppLines(rows: TrainerWeekRow[]): string[] {
  return rows.map((t, i) =>
    `${String(i + 1).padEnd(6)} ${t.trainer.name.padEnd(22)} ${String(t.days).padEnd(6)} * ${String(t.rate).padEnd(12)} (=) ${t.total}`);
}
