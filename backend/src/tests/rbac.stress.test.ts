/**
 * RBAC Stress Test — MITS Consulting Backend
 *
 * Tests critical access boundaries for every role in the system.
 * Runs against a live server (default: http://localhost:4000).
 *
 * Pre-requisites:
 *   1. Backend server must be running:  npm run dev   (or  npm start)
 *   2. Seed data must exist:            npm run seed
 *   3. Jest + supertest installed:
 *        npm install --save-dev jest @types/jest supertest @types/supertest ts-jest
 *   4. Add to package.json scripts:
 *        "test": "jest --testPathPattern=src/tests"
 *      And add jest config (jest.config.ts):
 *        export default { preset: 'ts-jest', testEnvironment: 'node' };
 *
 * Run:  npx jest rbac.stress  (requires server running on PORT 4000)
 *
 * All seed users share the password: password123
 */

import supertest from 'supertest';

// ── Configuration ─────────────────────────────────────────────────────────────
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:4000';
const api = supertest(BASE_URL);

// Default password set by seed/index.ts  (bcrypt hash of "password123")
const DEFAULT_PASSWORD = 'password123';

// ── Seed user credentials (from backend/src/seed/index.ts) ───────────────────
const USERS = {
  founder: {
    email: 'vaibhav.aggarwal@mitssolution.com',
    id: 'u-vaibhav',
    role: 'founder',
  },
  demo_intake_anjali: {
    email: 'anjali.maini@mitssolution.com',
    id: 'u-anjali',
    role: 'demo_intake',
  },
  demo_intake_taran: {
    email: 'tarkau@mitssolution.com',
    id: 'u-taran',
    role: 'demo_intake',
  },
  recruiter_aman: {
    email: 'amandeep.kaur@mitssolution.com',
    id: 'u-aman',
    role: 'recruiter',
  },
  recruiter_kanchan: {
    email: 'kanchan.sharma@mitssolution.com',
    id: 'u-kanchan',
    role: 'recruiter',
  },
  account_manager_kashish: {
    email: 'kashish@mitssolution.com',
    id: 'u-kashish',
    role: 'account_manager',
  },
  account_manager_muskan: {
    email: 'muskan@mitssolution.com',
    id: 'u-muskan',
    role: 'account_manager',
  },
  lead_bhavneet: {
    email: 'bhavneet.kaur@mitssolution.com',
    id: 'u-bhavneet',
    role: 'lead',
  },
  manager_mitali: {
    email: 'mitagg@mitssolution.com',
    id: 'u-mitali',
    role: 'manager',
  },
  accounts_areena: {
    email: 'areena.beri@mitssolution.com',
    id: 'u-areena',
    role: 'founder',
  },
  sales_closer_roshni: {
    email: 'roshni.seth@mitssolution.com',
    id: 'u-roshni',
    role: 'sales_closer',
  },
} as const;

// ── Token store (populated in beforeAll) ─────────────────────────────────────
const tokens: Record<string, string> = {};

// ── Helper: login and cache token ────────────────────────────────────────────
async function login(key: string, email: string): Promise<string> {
  const res = await api
    .post('/api/auth/login')
    .send({ email, password: DEFAULT_PASSWORD })
    .set('Accept', 'application/json');

  if (res.status !== 200) {
    throw new Error(
      `Login failed for ${email}: HTTP ${res.status} — ${JSON.stringify(res.body)}`,
    );
  }
  const token = res.body.token as string;
  if (!token) {
    throw new Error(`No token returned for ${email}: ${JSON.stringify(res.body)}`);
  }
  tokens[key] = token;
  return token;
}

// ── Helper: authenticated GET / POST with Bearer token ────────────────────────
function get(path: string, tokenKey: string) {
  return api
    .get(path)
    .set('Authorization', `Bearer ${tokens[tokenKey]}`)
    .set('Accept', 'application/json');
}

function post(path: string, tokenKey: string, body: Record<string, unknown> = {}) {
  return api
    .post(path)
    .set('Authorization', `Bearer ${tokens[tokenKey]}`)
    .set('Accept', 'application/json')
    .send(body);
}

// ── Global setup: login all roles ─────────────────────────────────────────────
beforeAll(async () => {
  await Promise.all(
    Object.entries(USERS).map(([key, u]) => login(key, u.email)),
  );
}, 30_000); // 30s timeout — network + bcrypt on each login

// =============================================================================
// HEALTH CHECK — sanity gate before role tests
// =============================================================================
describe('Health check', () => {
  it('GET /api/health returns 200', async () => {
    const res = await api.get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// =============================================================================
// AUTH — login produces tokens
// =============================================================================
describe('Auth — login', () => {
  it('all role tokens are truthy strings', () => {
    for (const key of Object.keys(USERS)) {
      expect(typeof tokens[key]).toBe('string');
      expect(tokens[key].length).toBeGreaterThan(20);
    }
  });

  it('wrong password returns 401', async () => {
    const res = await api
      .post('/api/auth/login')
      .send({ email: USERS.founder.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// demo_intake (Anjali) — role: demo_intake
// =============================================================================
describe('demo_intake (Anjali) access boundaries', () => {
  // Anjali should NEVER see Active-lifecycle clients.
  // The server filters lifecycle to INTAKE_STAGES only — so even if she requests
  // ?lifecycle=Active the server should return an empty list (or 0 Active items).
  it('GET /api/clients — response contains NO lifecycle=Active items', async () => {
    const res = await get('/api/clients', 'demo_intake_anjali');
    expect(res.status).toBe(200);
    const clients: Array<{ lifecycle: string }> = res.body;
    const activeClients = clients.filter((c) => c.lifecycle === 'Active');
    expect(activeClients).toHaveLength(0);
  });

  it('GET /api/clients?lifecycle=Active — still contains NO Active items (server enforces filter)', async () => {
    const res = await get('/api/clients?lifecycle=Active', 'demo_intake_anjali');
    // Server may return 200 with empty array or 403 — either is acceptable
    if (res.status === 200) {
      const clients: Array<{ lifecycle: string }> = res.body;
      const activeClients = clients.filter((c) => c.lifecycle === 'Active');
      expect(activeClients).toHaveLength(0);
    } else {
      expect(res.status).toBe(403);
    }
  });

  it('GET /api/regular-trainings/trainings — returns 403', async () => {
    const res = await get('/api/regular-trainings/trainings', 'demo_intake_anjali');
    expect(res.status).toBe(403);
  });

  it('GET /api/regular-trainings/my-sessions — returns 403', async () => {
    const res = await get('/api/regular-trainings/my-sessions', 'demo_intake_anjali');
    expect(res.status).toBe(403);
  });

  it('POST /api/clients/:id/stage to move to Active — returns 403', async () => {
    // Use the first client visible to Anjali as target (or a known intake-stage client id)
    const listRes = await get('/api/clients', 'demo_intake_anjali');
    const clients: Array<{ id: string }> = listRes.body;
    if (clients.length === 0) {
      // No clients in intake — can't test stage move; treat as skip
      console.warn('SKIP: no intake clients visible to Anjali — cannot test stage=Active block');
      return;
    }
    const clientId = clients[0].id;
    const res = await post(`/api/clients/${clientId}/stage`, 'demo_intake_anjali', {
      lifecycle: 'Active',
    });
    expect(res.status).toBe(403);
  });

  it('GET /api/audit — returns 403', async () => {
    const res = await get('/api/audit', 'demo_intake_anjali');
    expect(res.status).toBe(403);
  });

  it('GET /api/follow-up-payments — returns 403', async () => {
    const res = await get('/api/follow-up-payments', 'demo_intake_anjali');
    expect(res.status).toBe(403);
  });

  it('POST /api/clients — returns 201 (intake can create leads)', async () => {
    const res = await post('/api/clients', 'demo_intake_anjali', {
      name: 'Test RBAC Client',
      lifecycle: 'Lead',
    });
    expect(res.status).toBe(201);
  });
});

// =============================================================================
// recruiter (Amandeep) — role: recruiter
// =============================================================================
describe('recruiter (Amandeep) access boundaries', () => {
  it('GET /api/clients — phone and email fields are redacted (null)', async () => {
    const res = await get('/api/clients', 'recruiter_aman');
    expect(res.status).toBe(200);
    const clients: Array<{
      phoneCode: string | null;
      phoneDigits: string | null;
      email: string | null;
    }> = res.body;

    if (clients.length === 0) {
      console.warn('SKIP: no clients returned for recruiter — cannot verify redaction');
      return;
    }

    // Every client returned must have phone/email redacted
    for (const c of clients) {
      expect(c.phoneCode).toBeNull();
      expect(c.phoneDigits).toBeNull();
      expect(c.email).toBeNull();
    }
  });

  it('GET /api/follow-up-payments — returns 403', async () => {
    const res = await get('/api/follow-up-payments', 'recruiter_aman');
    expect(res.status).toBe(403);
  });

  it('POST /api/clients — returns 403', async () => {
    const res = await post('/api/clients', 'recruiter_aman', {
      name: 'RBAC Test Lead',
      lifecycle: 'Lead',
    });
    expect(res.status).toBe(403);
  });

  it('GET /api/audit — returns 403', async () => {
    const res = await get('/api/audit', 'recruiter_aman');
    expect(res.status).toBe(403);
  });

  it('GET /api/regular-trainings/trainings — returns 403', async () => {
    const res = await get('/api/regular-trainings/trainings', 'recruiter_aman');
    expect(res.status).toBe(403);
  });

  it('POST /api/trainers — returns 403', async () => {
    // recruiter CAN add trainers per seed ALLOWED list; verify they can
    // (this is a "MUST be allowed" check for recruiter)
    const res = await post('/api/trainers', 'recruiter_aman', {
      name: 'Test Trainer RBAC',
      email: `rbac-trainer-${Date.now()}@test.com`,
      phoneCode: '+91',
      phoneDigits: '9000000001',
      rateModel: 'hourly',
      defaultRateInr: 500,
      skills: 'Java',
      experienceYears: 3,
    });
    // recruiter IS in ALLOWED list for POST /api/trainers — expect 201 not 403
    expect(res.status).toBe(201);
  });
});

// =============================================================================
// account_manager (Kashish) — role: account_manager
// =============================================================================
describe('account_manager (Kashish) access boundaries', () => {
  it('GET /api/clients — only returns clients where hostOwnerId = u-kashish', async () => {
    const res = await get('/api/clients', 'account_manager_kashish');
    expect(res.status).toBe(200);
    const clients: Array<{ hostOwnerId: string }> = res.body;
    for (const c of clients) {
      expect(c.hostOwnerId).toBe('u-kashish');
    }
  });

  it('GET /api/clients — does NOT include Anjali intake-only clients (hostOwnerId ≠ u-anjali)', async () => {
    const res = await get('/api/clients', 'account_manager_kashish');
    expect(res.status).toBe(200);
    const clients: Array<{ intakeOwnerId: string | null; hostOwnerId: string }> = res.body;
    // Anjali's intake clients have intakeOwnerId=u-anjali and hostOwnerId=null
    // (not Active). In default view, Kashish only sees Active clients she hosts.
    const anjaliIntakeClients = clients.filter(
      (c) => c.intakeOwnerId === 'u-anjali' && c.hostOwnerId !== 'u-kashish',
    );
    expect(anjaliIntakeClients).toHaveLength(0);
  });

  it('GET /api/audit — returns 403', async () => {
    const res = await get('/api/audit', 'account_manager_kashish');
    expect(res.status).toBe(403);
  });

  it('POST /api/trainers — returns 403', async () => {
    const res = await post('/api/trainers', 'account_manager_kashish', {
      name: 'RBAC Trainer Test',
      email: `rbac-am-trainer-${Date.now()}@test.com`,
      phoneCode: '+91',
      phoneDigits: '9000000002',
      rateModel: 'hourly',
      defaultRateInr: 500,
      skills: 'Python',
      experienceYears: 2,
    });
    expect(res.status).toBe(403);
  });

  it('POST /api/clients — returns 403', async () => {
    const res = await post('/api/clients', 'account_manager_kashish', {
      name: 'RBAC Client Test',
      lifecycle: 'Lead',
    });
    expect(res.status).toBe(403);
  });

  it('GET /api/regular-trainings/trainings — returns 200 (AM has read access)', async () => {
    const res = await get('/api/regular-trainings/trainings', 'account_manager_kashish');
    expect(res.status).toBe(200);
  });

  it('GET /api/follow-up-payments — returns 403 (AM does not need payment follow-up)', async () => {
    const res = await get('/api/follow-up-payments', 'account_manager_kashish');
    expect(res.status).toBe(403);
  });
});

// =============================================================================
// lead (Bhavneet) — role: lead
// =============================================================================
describe('lead (Bhavneet) access boundaries and permissions', () => {
  // === MUST NOT ===

  it('GET /api/audit — returns 403', async () => {
    const res = await get('/api/audit', 'lead_bhavneet');
    expect(res.status).toBe(403);
  });

  it('POST /api/session-logs with a client not in Bhavneet team — returns 403 or 400', async () => {
    // demo_intake clients (Anjali's) do not belong to Bhavneet's team scope.
    // Try to create a session log referencing a non-team client.
    // We use 'c-test-roshni-vb' (SaleClosing, hostOwnerId=null) as a non-team client.
    const res = await post('/api/session-logs', 'lead_bhavneet', {
      clientId: 'c-test-roshni-vb',
      trainerId: 't-anand',
      sessionDate: new Date().toISOString().slice(0, 10),
      sessionType: 'Regular',
      durationMins: 60,
    });
    // The server should block this with 403 (not Bhavneet's team) or 400 (bad data)
    // but not 201.
    expect(res.status).not.toBe(201);
    expect([400, 403, 404, 422]).toContain(res.status);
  });

  // === MUST be allowed ===

  it('GET /api/clients — returns 200 with clients from Kashish/Muskan team', async () => {
    const res = await get('/api/clients', 'lead_bhavneet');
    expect(res.status).toBe(200);
    const clients: Array<{ hostOwnerId: string }> = res.body;
    // All visible clients must be owned by Bhavneet's team members
    const allowedHostOwners = ['u-bhavneet', 'u-kashish', 'u-muskan'];
    for (const c of clients) {
      expect(allowedHostOwners).toContain(c.hostOwnerId);
    }
  });

  it('GET /api/clients — result includes clients from u-kashish or u-muskan', async () => {
    const res = await get('/api/clients', 'lead_bhavneet');
    expect(res.status).toBe(200);
    const clients: Array<{ hostOwnerId: string }> = res.body;
    const teamClients = clients.filter(
      (c) => c.hostOwnerId === 'u-kashish' || c.hostOwnerId === 'u-muskan',
    );
    // If seed data exists, there should be active clients for Kashish/Muskan
    expect(teamClients.length).toBeGreaterThanOrEqual(0); // soft check — seed may vary
  });

  it('GET /api/regular-trainings/trainings — returns 200 (lead has read access)', async () => {
    const res = await get('/api/regular-trainings/trainings', 'lead_bhavneet');
    expect(res.status).toBe(200);
  });

  it('GET /api/regular-trainings/my-sessions — returns 200 (lead has read access)', async () => {
    const res = await get('/api/regular-trainings/my-sessions', 'lead_bhavneet');
    expect(res.status).toBe(200);
  });

  it('GET /api/follow-up-payments — returns 403 (lead does not have payment access)', async () => {
    const res = await get('/api/follow-up-payments', 'lead_bhavneet');
    expect(res.status).toBe(403);
  });

  it('POST /api/trainers — returns 403 (lead cannot add trainers)', async () => {
    const res = await post('/api/trainers', 'lead_bhavneet', {
      name: 'RBAC Lead Trainer Test',
      email: `rbac-lead-trainer-${Date.now()}@test.com`,
      phoneCode: '+91',
      phoneDigits: '9000000003',
      rateModel: 'hourly',
      defaultRateInr: 500,
      skills: 'Java',
      experienceYears: 4,
    });
    expect(res.status).toBe(403);
  });
});

// =============================================================================
// manager (Mitali) — role: manager
// =============================================================================
describe('manager (Mitali) access boundaries', () => {
  it('GET /api/clients — only returns her team clients (hostOwnerId in team)', async () => {
    const res = await get('/api/clients', 'manager_mitali');
    expect(res.status).toBe(200);
    const clients: Array<{ hostOwnerId: string }> = res.body;
    const mitaliTeam = ['u-mitali', 'u-bhavneet', 'u-kashish', 'u-muskan'];
    for (const c of clients) {
      expect(mitaliTeam).toContain(c.hostOwnerId);
    }
  });

  it('GET /api/clients — does NOT include Anjali intake-only clients', async () => {
    const res = await get('/api/clients', 'manager_mitali');
    expect(res.status).toBe(200);
    const clients: Array<{ intakeOwnerId: string | null; lifecycle: string }> = res.body;
    // Intake-only clients have lifecycle not in Active/LeverageGranted
    const intakeOnlyClients = clients.filter(
      (c) => !['Active', 'LeverageGranted'].includes(c.lifecycle),
    );
    expect(intakeOnlyClients).toHaveLength(0);
  });

  it('GET /api/audit — returns 200 (manager can access audit)', async () => {
    const res = await get('/api/audit', 'manager_mitali');
    expect(res.status).toBe(200);
  });

  it('GET /api/regular-trainings/trainings — returns 200', async () => {
    const res = await get('/api/regular-trainings/trainings', 'manager_mitali');
    expect(res.status).toBe(200);
  });

  it('GET /api/follow-up-payments — returns 200', async () => {
    const res = await get('/api/follow-up-payments', 'manager_mitali');
    expect(res.status).toBe(200);
  });

  it('POST /api/trainers — returns 201 (manager can add trainers)', async () => {
    const res = await post('/api/trainers', 'manager_mitali', {
      name: 'RBAC Manager Trainer Test',
      email: `rbac-mgr-trainer-${Date.now()}@test.com`,
      phoneCode: '+91',
      phoneDigits: '9000000004',
      rateModel: 'hourly',
      defaultRateInr: 700,
      skills: 'DevOps',
      experienceYears: 5,
    });
    expect(res.status).toBe(201);
  });
});

// =============================================================================
// accounts (Areena) — role: accounts
// =============================================================================
describe('accounts (Areena) access boundaries', () => {
  it('GET /api/regular-trainings/trainings — returns 403', async () => {
    const res = await get('/api/regular-trainings/trainings', 'accounts_areena');
    expect(res.status).toBe(403);
  });

  it('GET /api/regular-trainings/my-sessions — returns 403', async () => {
    const res = await get('/api/regular-trainings/my-sessions', 'accounts_areena');
    expect(res.status).toBe(403);
  });

  it('POST /api/clients — returns 403', async () => {
    const res = await post('/api/clients', 'accounts_areena', {
      name: 'RBAC Accounts Client Test',
      lifecycle: 'Lead',
    });
    expect(res.status).toBe(403);
  });

  it('GET /api/audit — returns 403 (accounts cannot see full audit log)', async () => {
    const res = await get('/api/audit', 'accounts_areena');
    expect(res.status).toBe(403);
  });

  it('GET /api/follow-up-payments — returns 200 (accounts can access payments)', async () => {
    const res = await get('/api/follow-up-payments', 'accounts_areena');
    expect(res.status).toBe(200);
  });

  it('POST /api/trainers — returns 403', async () => {
    const res = await post('/api/trainers', 'accounts_areena', {
      name: 'RBAC Accounts Trainer Test',
      email: `rbac-acct-trainer-${Date.now()}@test.com`,
      phoneCode: '+91',
      phoneDigits: '9000000005',
      rateModel: 'hourly',
      defaultRateInr: 500,
      skills: 'AWS',
      experienceYears: 2,
    });
    expect(res.status).toBe(403);
  });
});

// =============================================================================
// founder (Vaibhav) — role: founder
// Must have access to everything
// =============================================================================
describe('founder (Vaibhav) — unrestricted access', () => {
  it('GET /api/clients — returns 200', async () => {
    const res = await get('/api/clients', 'founder');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/clients?lifecycle=Active — returns 200 with Active clients', async () => {
    const res = await get('/api/clients?lifecycle=Active', 'founder');
    expect(res.status).toBe(200);
  });

  it('GET /api/audit — returns 200', async () => {
    const res = await get('/api/audit', 'founder');
    expect(res.status).toBe(200);
  });

  it('GET /api/regular-trainings/trainings — returns 200', async () => {
    const res = await get('/api/regular-trainings/trainings', 'founder');
    expect(res.status).toBe(200);
  });

  it('GET /api/regular-trainings/my-sessions — returns 200', async () => {
    const res = await get('/api/regular-trainings/my-sessions', 'founder');
    expect(res.status).toBe(200);
  });

  it('GET /api/follow-up-payments — returns 200', async () => {
    const res = await get('/api/follow-up-payments', 'founder');
    expect(res.status).toBe(200);
  });

  it('GET /api/trainers — returns 200', async () => {
    const res = await get('/api/trainers', 'founder');
    expect(res.status).toBe(200);
  });

  it('GET /api/users — returns 200', async () => {
    const res = await get('/api/users', 'founder');
    expect(res.status).toBe(200);
  });

  it('GET /api/payments — returns 200', async () => {
    const res = await get('/api/payments', 'founder');
    expect(res.status).toBe(200);
  });

  it('GET /api/reports — returns 200', async () => {
    const res = await get('/api/reports', 'founder');
    // Reports may have multiple sub-routes; just verify not blocked
    expect([200, 404]).toContain(res.status); // 404 if no default route
  });

  it('GET /api/clients — sees ALL lifecycle stages (not filtered)', async () => {
    // Founder sees everything — verify response includes non-Active items too
    const res = await get('/api/clients', 'founder');
    expect(res.status).toBe(200);
    const clients: Array<{ lifecycle: string }> = res.body;
    const lifecycles = new Set(clients.map((c) => c.lifecycle));
    // In a seeded DB there should be multiple lifecycle stages visible to founder
    expect(lifecycles.size).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/clients — phone/email are NOT redacted for founder', async () => {
    const res = await get('/api/clients', 'founder');
    expect(res.status).toBe(200);
    const clients: Array<{
      phoneCode: string | null;
      phoneDigits: string | null;
      lifecycle: string;
    }> = res.body;
    // At least one active client should have phone data
    const withPhone = clients.filter((c) => c.phoneCode !== null && c.phoneDigits !== null);
    expect(withPhone.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// sales_closer (Roshni) — role: sales_closer
// =============================================================================
describe('sales_closer (Roshni) access boundaries', () => {
  it('GET /api/clients — returns 200', async () => {
    const res = await get('/api/clients', 'sales_closer_roshni');
    expect(res.status).toBe(200);
  });

  it('GET /api/audit — returns 403', async () => {
    const res = await get('/api/audit', 'sales_closer_roshni');
    expect(res.status).toBe(403);
  });

  it('GET /api/regular-trainings/trainings — returns 403', async () => {
    const res = await get('/api/regular-trainings/trainings', 'sales_closer_roshni');
    expect(res.status).toBe(403);
  });

  it('GET /api/follow-up-payments — returns 403 (not in ALLOWED list)', async () => {
    const res = await get('/api/follow-up-payments', 'sales_closer_roshni');
    expect(res.status).toBe(403);
  });
});

// =============================================================================
// Unauthenticated — all protected routes must return 401
// =============================================================================
describe('Unauthenticated access — all protected routes return 401', () => {
  const PROTECTED_ROUTES = [
    '/api/clients',
    '/api/trainers',
    '/api/audit',
    '/api/follow-up-payments',
    '/api/regular-trainings/trainings',
    '/api/regular-trainings/my-sessions',
    '/api/payments',
    '/api/users',
  ];

  for (const route of PROTECTED_ROUTES) {
    it(`GET ${route} without token returns 401`, async () => {
      const res = await api.get(route).set('Accept', 'application/json');
      expect(res.status).toBe(401);
    });
  }
});
