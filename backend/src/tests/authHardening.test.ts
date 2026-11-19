/**
 * Auth hardening: self-registration and exit-impersonation.
 *
 * Before this fix:
 *   - POST /api/auth/register accepted `role` from the body, so anyone could
 *     create a founder account once the database had users.
 *   - POST /api/auth/exit-impersonation re-issued a founder session for any
 *     `founderId` in the body, with no login at all.
 *
 *   Run:  npx jest authHardening
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';

type Row = { id: string; name: string; email: string; role: string; active: boolean; passwordHash: string };
const users: Row[] = [];

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      count: jest.fn(async () => users.length),
      findUnique: jest.fn(async ({ where }: any) =>
        users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `u-${users.length + 1}`, active: true, ...data };
        users.push(row);
        return row;
      }),
    },
  },
}));
jest.mock('../lib/audit', () => ({ audit: jest.fn() }));
jest.mock('../lib/rbacLog', () => ({ recordForbidden: jest.fn() }));

import { authRouter } from '../routes/auth';
import { signToken } from '../lib/auth';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const founder: Row = { id: 'u-founder', name: 'Founder', email: 'f@mitssolution.com', role: 'founder', active: true, passwordHash: 'x' };
const staff: Row = { id: 'u-staff', name: 'Staff', email: 's@mitssolution.com', role: 'staff', active: true, passwordHash: 'x' };

function sessionOf(res: request.Response): { id: string; imp?: string } | null {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('mits_token='));
  if (!raw) return null;
  return jwt.verify(raw.split(';')[0].slice('mits_token='.length), SECRET) as any;
}

beforeEach(() => {
  users.length = 0;
});

describe('POST /api/auth/register', () => {
  it('refuses to create any account once users exist, whatever role is asked for', async () => {
    users.push(founder);
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Mallory', email: 'm@evil.test', password: 'secret123', role: 'founder' });
    expect(res.status).toBe(403);
    expect(users).toHaveLength(1);
    expect(sessionOf(res)).toBeNull();
  });

  it('still bootstraps the first founder on an empty database', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Owner', email: 'owner@mitssolution.com', password: 'secret123', role: 'staff' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('founder');
  });
});

describe('POST /api/auth/exit-impersonation', () => {
  it('no longer issues a founder session from a founderId in the body', async () => {
    users.push(founder, staff);
    const res = await request(app).post('/api/auth/exit-impersonation').send({ founderId: founder.id });
    expect(res.status).toBe(401);
    expect(sessionOf(res)).toBeNull();
  });

  it('refuses a plain staff session even with a founderId in the body', async () => {
    users.push(founder, staff);
    const res = await request(app)
      .post('/api/auth/exit-impersonation')
      .set('Cookie', `mits_token=${signToken({ id: staff.id })}`)
      .send({ founderId: founder.id });
    expect(res.status).toBe(400);
    expect(sessionOf(res)).toBeNull();
  });

  it('restores the founder from a "view as" session started by that founder', async () => {
    users.push(founder, staff);
    const imp = await request(app)
      .post(`/api/auth/impersonate/${staff.id}`)
      .set('Cookie', `mits_token=${signToken({ id: founder.id })}`);
    expect(imp.status).toBe(200);
    const viewAs = sessionOf(imp)!;
    expect(viewAs).toMatchObject({ id: staff.id, imp: founder.id });

    const exit = await request(app)
      .post('/api/auth/exit-impersonation')
      .set('Cookie', `mits_token=${signToken({ id: viewAs.id, imp: viewAs.imp })}`);
    expect(exit.status).toBe(200);
    expect(exit.body.user.id).toBe(founder.id);
    expect(sessionOf(exit)).toMatchObject({ id: founder.id });
    expect(sessionOf(exit)!.imp).toBeUndefined();
  });

  it('refuses to restore a founder who has since been deactivated', async () => {
    users.push({ ...founder, active: false }, staff);
    const res = await request(app)
      .post('/api/auth/exit-impersonation')
      .set('Cookie', `mits_token=${signToken({ id: staff.id, imp: founder.id })}`);
    expect(res.status).toBe(403);
  });

  it('rejects a forged impersonation cookie', async () => {
    users.push(founder, staff);
    const forged = jwt.sign({ id: staff.id, imp: founder.id }, 'not-the-secret');
    const res = await request(app).post('/api/auth/exit-impersonation').set('Cookie', `mits_token=${forged}`);
    expect(res.status).toBe(401);
  });

  it('still accepts the founder token as a Bearer header', async () => {
    users.push(founder, staff);
    const res = await request(app)
      .post('/api/auth/exit-impersonation')
      .set('Authorization', `Bearer ${signToken({ id: founder.id })}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(founder.id);
  });
});
