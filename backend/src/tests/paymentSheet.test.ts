/**
 * Payment Sheet regression tests
 *
 * Covers the four Payment Sheet bugs fixed on branch `Mits-changes`. These are
 * pure unit tests: prisma and auth are mocked, so they need NO database and NO
 * running server (unlike rbac.stress.test.ts, which requires both).
 *
 *   Run:  npx jest paymentSheet
 *
 * Scope note: bugs 1, 3 and 4 have backend logic that is exercised here against
 * the real route handlers. Bug 2's exclusion rule lives only in the frontend --
 * see the final describe block for why it cannot be covered from here.
 */

import express from 'express';
import supertest from 'supertest';

// -- Auth mock: lets each test pick the acting user's role -------------------
const mockCurrentUser = { id: 'u-test', role: 'founder', name: 'Test User', email: 't@example.com' };
jest.mock('../lib/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.user = { ...mockCurrentUser }; next(); },
  requireRole: (...roles: string[]) => (req: any, res: any, next: any) =>
    roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Forbidden' }),
}));

// -- Prisma mock ------------------------------------------------------------
jest.mock('../lib/prisma', () => ({
  prisma: {
    trainer:         { findUnique: jest.fn() },
    client:          { findUnique: jest.fn() },
    regularTraining: { findFirst: jest.fn() },
    sessionLog:      { create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    trainerPayWeek:  { upsert: jest.fn(), findMany: jest.fn() },
    auditLog:        { create: jest.fn() },
  },
}));

import { RateModel } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { sessionLogsRouter } from '../routes/sessionLogs';
import { trainerPayWeeksRouter } from '../routes/trainerPayWeeks';

const db = prisma as any;

const app = express();
app.use(express.json());
app.use('/session-logs', sessionLogsRouter);
app.use('/trainer-pay-weeks', trainerPayWeeksRouter);
const api = supertest(app);

/** The `data` object handed to prisma.sessionLog.create by the route. */
const createdData = () => db.sessionLog.create.mock.calls[0][0].data;

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser.role = 'founder';
  mockCurrentUser.id = 'u-test';
  db.regularTraining.findFirst.mockResolvedValue({ id: 'rt-1' });
  db.client.findUnique.mockResolvedValue({ hostOwnerId: 'u-test', assignedAmId: 'u-test' });
  db.sessionLog.create.mockResolvedValue({ id: 'sl-1', trainer: { name: 'Test Trainer' } });
  db.auditLog.create.mockResolvedValue({});
});

const postLog = (body: any) =>
  api.post('/session-logs').send({ trainerId: 't-1', clientId: 'c-1', date: '2026-09-01', ...body });

/* ---------------------------------------------------------------------------
   BUG 1 -- the trainer's payment structure must drive the calculation
   --------------------------------------------------------------------------- */
describe('Bug 1 -- payment structure (hourly vs per-session) is applied strictly', () => {
  it('uses the HOURLY trainer structure when the caller omits rateModel', async () => {
    // Regression: the route used to default to `rateModel || 'per_session'` and
    // only consult the trainer when no rate was supplied. A 3h hourly session
    // was therefore billed as 1 per-session unit (800) instead of 3h x 800.
    db.trainer.findUnique.mockResolvedValue({ defaultRateInr: 800, rateModel: 'hourly' });

    const res = await postLog({ hours: 3, rateSnapshot: 800 });

    expect(res.status).toBe(201);
    expect(db.trainer.findUnique).toHaveBeenCalled();
    expect(createdData().rateModel).toBe('hourly');
    expect(createdData().amountInr).toBe(2400); // 3 x 800, NOT 800
  });

  it('bills a PER-SESSION trainer by session units, not by hours', async () => {
    const res = await postLog({ hours: 3, rateSnapshot: 1500, rateModel: 'per_session' });

    expect(res.status).toBe(201);
    expect(createdData().rateModel).toBe('per_session');
    expect(createdData().amountInr).toBe(1500); // >1h = 1 session, NOT 3 x 1500
  });

  it('bills a PER-SESSION trainer a half session for <= 1h', async () => {
    const res = await postLog({ hours: 0.75, rateSnapshot: 1500, rateModel: 'per_session' });

    expect(res.status).toBe(201);
    expect(createdData().amountInr).toBe(750); // 0.5 x 1500
  });

  it('bills an HOURLY trainer sub-hour time pro rata, not as a half session', async () => {
    const res = await postLog({ hours: 0.5, rateSnapshot: 800, rateModel: 'hourly' });

    expect(res.status).toBe(201);
    expect(createdData().amountInr).toBe(400); // 0.5 x 800
  });

  it('falls back to per_session only when the trainer record has no structure', async () => {
    db.trainer.findUnique.mockResolvedValue(null);

    const res = await postLog({ hours: 2, rateSnapshot: 1000 });

    expect(res.status).toBe(201);
    expect(createdData().rateModel).toBe('per_session');
  });

  // Table-driven across every rate model in the enum, so the billing rule for
  // each one is pinned. Not tied to any trainer name or id.
  //
  // The two training_* rows document current fall-through behaviour only: those
  // trainers are paid a lump sum separately and the Payment Sheet excludes them
  // entirely (Bug 2), so the amount stored here is never billed from the sheet.
  it.each([
    { model: 'hourly',            hours: 3,    rate: 800,  expected: 2400  },
    { model: 'hourly',            hours: 0.5,  rate: 800,  expected: 400   },
    { model: 'hourly',            hours: 1,    rate: 800,  expected: 800   },
    { model: 'per_session',       hours: 3,    rate: 1500, expected: 1500  },
    { model: 'per_session',       hours: 1,    rate: 1500, expected: 750   },
    { model: 'per_session',       hours: 0.75, rate: 1500, expected: 750   },
    { model: 'per_session',       hours: 1.25, rate: 1500, expected: 1500  },
    { model: 'training_one_shot', hours: 2,    rate: 5000, expected: 10000 },
    { model: 'training_monthly',  hours: 2,    rate: 5000, expected: 10000 },
  ])('$model: $hours h @ $rate -> $expected', async ({ model, hours, rate, expected }) => {
    const res = await postLog({ hours, rateSnapshot: rate, rateModel: model });

    expect(res.status).toBe(201);
    expect(createdData().rateModel).toBe(model);
    expect(createdData().amountInr).toBe(expected);
  });
});

/* ---------------------------------------------------------------------------
   BUG 3 -- no session logged must mean 0 days and 0 payment
   --------------------------------------------------------------------------- */
describe('Bug 3 -- "No Session Happened" produces zero hours and zero payment', () => {
  it('stores 0 hours and 0 amount when the session did not happen', async () => {
    const res = await postLog({ hours: 2, rateSnapshot: 1500, rateModel: 'per_session', sessionHappened: false });

    expect(res.status).toBe(201);
    expect(createdData().sessionHappened).toBe(false);
    expect(createdData().hours).toBe(0);
    expect(createdData().amountInr).toBe(0); // never a half session
  });

  it('ignores an amount override on a no-show so it cannot be paid', async () => {
    const res = await postLog({
      hours: 2, rateSnapshot: 1500, rateModel: 'per_session',
      sessionHappened: false, amountInr: 5000,
    });

    expect(res.status).toBe(201);
    expect(createdData().amountInr).toBe(0);
  });

  // Generic across every rate model — a no-show must never bill, whatever the
  // trainer's payment structure.
  it.each(Object.values(RateModel))('%s: a no-show bills 0 hours and 0 amount', async (model) => {
    const res = await postLog({ hours: 2, rateSnapshot: 5000, rateModel: model, sessionHappened: false });

    expect(res.status).toBe(201);
    expect(createdData().hours).toBe(0);
    expect(createdData().amountInr).toBe(0);
  });

  it('records who cancelled, still at zero', async () => {
    const res = await postLog({
      hours: 1, rateSnapshot: 1500, rateModel: 'per_session',
      sessionHappened: false, cancelledBy: 'client',
    });

    expect(res.status).toBe(201);
    expect(createdData().cancelledBy).toBe('client');
    expect(createdData().amountInr).toBe(0);
  });
});

/* ---------------------------------------------------------------------------
   BUG 4 -- the Days override persists and never rewrites logged hours
   --------------------------------------------------------------------------- */
describe('Bug 4 -- Days override persists on TrainerPayWeek', () => {
  const patchDays = (daysOverride: any, trainerId = 't-1') =>
    api.patch(`/trainer-pay-weeks/${trainerId}`).send({ weekStart: '2026-09-01', daysOverride });

  beforeEach(() => {
    db.trainerPayWeek.upsert.mockImplementation(({ create, update }: any) =>
      Promise.resolve({ id: 'pw-1', trainerId: 't-1', weekStart: '2026-09-01', ...create, ...update }));
  });

  it('persists an edited day count', async () => {
    const res = await patchDays(2.5);

    expect(res.status).toBe(200);
    expect(res.body.daysOverride).toBe(2.5);
    const args = db.trainerPayWeek.upsert.mock.calls[0][0];
    expect(args.update.daysOverride).toBe(2.5);
    expect(args.create.daysOverride).toBe(2.5);
    expect(args.where).toEqual({ trainerId_weekStart: { trainerId: 't-1', weekStart: '2026-09-01' } });
  });

  it('NEVER writes to SessionLog when Days is edited', async () => {
    await patchDays(4);

    // The whole point of Option B: the logged duration stays untouched.
    expect(db.sessionLog.update).not.toHaveBeenCalled();
    expect(db.sessionLog.updateMany).not.toHaveBeenCalled();
    expect(db.sessionLog.create).not.toHaveBeenCalled();
  });

  it('keeps overrides isolated per trainer (no cross-contamination)', async () => {
    const written: Record<string, any> = {};
    db.trainerPayWeek.upsert.mockImplementation(({ where, create }: any) => {
      const id = where.trainerId_weekStart.trainerId;
      written[id] = create.daysOverride;
      return Promise.resolve({ trainerId: id, weekStart: '2026-09-01', daysOverride: create.daysOverride });
    });

    const a = await patchDays(2,    't-alpha');
    const b = await patchDays(4.5,  't-beta');
    const c = await patchDays(null, 't-gamma');

    expect(a.body.daysOverride).toBe(2);
    expect(b.body.daysOverride).toBe(4.5);
    expect(c.body.daysOverride).toBeNull();
    // Each trainer holds exactly its own value — no bleed between rows.
    expect(written).toEqual({ 't-alpha': 2, 't-beta': 4.5, 't-gamma': null });

    // Every write addressed only its own trainer+week composite key.
    expect(db.trainerPayWeek.upsert.mock.calls.map((call: any[]) => call[0].where.trainerId_weekStart))
      .toEqual([
        { trainerId: 't-alpha', weekStart: '2026-09-01' },
        { trainerId: 't-beta',  weekStart: '2026-09-01' },
        { trainerId: 't-gamma', weekStart: '2026-09-01' },
      ]);

    // And no trainer's logged hours were touched by any of it.
    expect(db.sessionLog.update).not.toHaveBeenCalled();
    expect(db.sessionLog.updateMany).not.toHaveBeenCalled();
  });

  it('scopes an override to its own week, not the trainer globally', async () => {
    await patchDays(3, 't-alpha');
    await api.patch('/trainer-pay-weeks/t-alpha').send({ weekStart: '2026-09-08', daysOverride: 1 });

    const keys = db.trainerPayWeek.upsert.mock.calls.map((call: any[]) => call[0].where.trainerId_weekStart);
    expect(keys).toEqual([
      { trainerId: 't-alpha', weekStart: '2026-09-01' },
      { trainerId: 't-alpha', weekStart: '2026-09-08' },
    ]);
  });

  it('accepts half days', async () => {
    const res = await patchDays(0.5);
    expect(res.status).toBe(200);
    expect(db.trainerPayWeek.upsert.mock.calls[0][0].update.daysOverride).toBe(0.5);
  });

  it('accepts 0 days', async () => {
    const res = await patchDays(0);
    expect(res.status).toBe(200);
    expect(db.trainerPayWeek.upsert.mock.calls[0][0].update.daysOverride).toBe(0);
  });

  it('clears the override with null, restoring the derived value', async () => {
    const res = await patchDays(null);
    expect(res.status).toBe(200);
    expect(db.trainerPayWeek.upsert.mock.calls[0][0].update.daysOverride).toBeNull();
  });

  it('rejects a negative day count', async () => {
    const res = await patchDays(-1);
    expect(res.status).toBe(400);
    expect(db.trainerPayWeek.upsert).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric day count', async () => {
    const res = await patchDays('abc');
    expect(res.status).toBe(400);
    expect(db.trainerPayWeek.upsert).not.toHaveBeenCalled();
  });

  it('requires weekStart', async () => {
    const res = await api.patch('/trainer-pay-weeks/t-1').send({ daysOverride: 2 });
    expect(res.status).toBe(400);
    expect(db.trainerPayWeek.upsert).not.toHaveBeenCalled();
  });

  it.each(['founder', 'manager', 'lead', 'accounts', 'payment_processor', 'demo_lead'])(
    'allows %s to edit Days', async (role) => {
      mockCurrentUser.role = role;
      const res = await patchDays(3);
      expect(res.status).toBe(200);
    });

  it.each(['staff', 'recruiter', 'account_manager', 'demo_intake', 'sales_closer'])(
    'forbids %s from editing Days', async (role) => {
      mockCurrentUser.role = role;
      const res = await patchDays(3);
      expect(res.status).toBe(403);
      expect(db.trainerPayWeek.upsert).not.toHaveBeenCalled();
    });

  it('leaves the existing Mitali/Bhavneet gates untouched', async () => {
    mockCurrentUser.role = 'founder';
    mockCurrentUser.id = 'u-someone-else';
    const ack = await api.patch('/trainer-pay-weeks/t-1')
      .send({ weekStart: '2026-09-01', mitaliAckAt: new Date().toISOString() });
    expect(ack.status).toBe(403);
  });
});

/* ---------------------------------------------------------------------------
   BUG 2 -- internal training calls excluded from the Payment Sheet
   --------------------------------------------------------------------------- */
describe('Bug 2 -- internal training calls excluded', () => {
  // The exclusion rule (`isTrainingCall`, matching rateModel training_one_shot /
  // training_monthly) lives in frontend/src/pages/TrainerPaySheetPage.tsx. It has
  // no backend counterpart by design: GET /session-logs deliberately returns every
  // log for the week and the Payment Sheet filters at render time.
  //
  // It cannot be covered from backend/src/tests -- backend tsconfig sets
  // rootDir: "src", so it cannot import across into frontend/ -- and frontend has
  // no test runner configured (no vitest/jest in frontend/package.json).
  // Covering it needs a frontend test runner, which is a tooling decision.
  it.todo('excludes training_one_shot / training_monthly logs -- blocked: no frontend test runner');

  it('GET /session-logs still returns all logs (filtering is the sheet job)', async () => {
    db.sessionLog.findMany.mockResolvedValue([
      { id: 'a', trainer: { rateModel: 'per_session' } },
      { id: 'b', trainer: { rateModel: 'training_monthly' } },
    ]);
    const res = await api.get('/session-logs').query({ weekStart: '2026-09-01' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2); // backend contract unchanged by this fix
  });
});

/* ---------------------------------------------------------------------------
   RATE MODEL CONTRACT
   Guards the root cause of Bug 1, and guards Bug 2 against a new training type.
   --------------------------------------------------------------------------- */
describe('RateModel enum contract', () => {
  // Bug 1's root cause: the Payment Sheet compared rateModel to 'per_hour' --
  // a string that is NOT in this enum. The branch was dead, so every hourly
  // trainer was silently billed per-session for years. A test like this one
  // would have caught it the day it was written.
  //
  // If this fails, the enum changed. Update these in lockstep:
  //   frontend/src/pages/TrainerPaySheetPage.tsx
  //     effectiveRateModel()  -- fallback value
  //     isTrainingCall()      -- which models are separately-paid training calls
  //     toSessions()          -- which models bill by hours vs by session
  //   backend/src/routes/sessionLogs.ts -- per_session vs hourly branches

  /** Models the Payment Sheet bills by raw hours. */
  const BILLED_BY_HOURS = ['hourly'];
  /** Models the Payment Sheet bills in session units (<=1h = 0.5, >1h = 1). */
  const BILLED_PER_SESSION = ['per_session'];
  /** Models paid as a separate lump sum — excluded from the sheet entirely. */
  const LUMP_SUM_TRAINING = ['training_one_shot', 'training_monthly'];

  it('contains exactly the models the Payment Sheet knows how to handle', () => {
    expect(Object.values(RateModel).sort()).toEqual(
      [...BILLED_BY_HOURS, ...BILLED_PER_SESSION, ...LUMP_SUM_TRAINING].sort(),
    );
  });

  it('classifies every model — none silently falls through to a default', () => {
    const classified = [...BILLED_BY_HOURS, ...BILLED_PER_SESSION, ...LUMP_SUM_TRAINING];
    for (const model of Object.values(RateModel)) {
      expect(classified).toContain(model);
    }
  });

  it('never classifies a model as both billable and lump-sum', () => {
    const billable = [...BILLED_BY_HOURS, ...BILLED_PER_SESSION];
    for (const model of LUMP_SUM_TRAINING) {
      expect(billable).not.toContain(model);
    }
  });

  it('rejects strings that are not in the enum (the "per_hour" class of bug)', () => {
    // 'per_hour' was never a real value. Guard against it — and its friends —
    // being reintroduced as a magic string anywhere in the pay pipeline.
    for (const bogus of ['per_hour', 'hourly_rate', 'session', 'per-session']) {
      expect(Object.values(RateModel)).not.toContain(bogus);
    }
  });
});
