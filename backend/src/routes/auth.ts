import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword, signToken, setAuthCookie, clearAuthCookie, requireAuth, verifyAndGetUser, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.string().default('staff'),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!user.active) return res.status(401).json({ error: 'Account inactive' });
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = signToken({ id: user.id });
  setAuthCookie(res, token);
  await audit(user.id, user.name, 'LOGIN', `${user.role}`);
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token,
  });
});

authRouter.post('/register', async (req, res) => {
  // Bootstrap-only — register first user as founder, others as plain users.
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { name, email, password, role } = parsed.data;
  const count = await prisma.user.count();
  const finalRole = count === 0 ? 'founder' : role;
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: 'Email already registered' });
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { name, email: email.toLowerCase(), passwordHash, role: finalRole as any },
  });
  const token = signToken({ id: user.id });
  setAuthCookie(res, token);
  await audit(user.id, user.name, 'REGISTER', `${user.role}`);
  res.status(201).json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token,
  });
});

authRouter.post('/logout', requireAuth, async (req: AuthedRequest, res) => {
  if (req.user) await audit(req.user.id, req.user.name, 'LOGOUT', '');
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

// Founder-only: issue a token for another user (view-as / impersonate)
// Sets the auth cookie so subsequent requests run as the target user.
authRouter.post('/impersonate/:userId', requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Founder only' });
  const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  const token = signToken({ id: target.id });
  setAuthCookie(res, token);
  await audit(req.user!.id, req.user!.name, 'IMPERSONATE', `→ ${target.name} (${target.role})`);
  res.json({ user: { id: target.id, name: target.name, email: target.email, role: target.role }, token });
});

// Exit impersonation: restore the founder's session.
// Accepts either:
//   a) Bearer <founderToken> header — verifies and restores cookie
//   b) { founderId } body — re-issues a fresh token for that founder (fallback for lost token)
authRouter.post('/exit-impersonation', async (req, res) => {
  const authHeader = req.headers.authorization;
  // Path A: have the founder token
  if (authHeader?.startsWith('Bearer ')) {
    const founderToken = authHeader.slice(7);
    try {
      const founder = await verifyAndGetUser(founderToken);
      if (!founder || !founder.active || founder.role !== 'founder') {
        return res.status(403).json({ error: 'Not a founder token' });
      }
      setAuthCookie(res, founderToken);
      await audit(founder.id, founder.name, 'EXIT_IMPERSONATION', '');
      return res.json({ user: { id: founder.id, name: founder.name, email: founder.email, role: founder.role } });
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
  // Path B: lost the token — re-issue using founderId from body
  const { founderId } = req.body || {};
  if (founderId) {
    const founder = await prisma.user.findUnique({ where: { id: founderId } });
    if (!founder || !founder.active || founder.role !== 'founder') {
      return res.status(403).json({ error: 'Not a founder account' });
    }
    const freshToken = signToken({ id: founder.id });
    setAuthCookie(res, freshToken);
    await audit(founder.id, founder.name, 'EXIT_IMPERSONATION', 'token-reissued');
    return res.json({ user: { id: founder.id, name: founder.name, email: founder.email, role: founder.role } });
  }
  return res.status(400).json({ error: 'Provide Bearer token or founderId' });
});

// List all users (founder only) — lightweight, for the impersonate picker
authRouter.get('/users', requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Founder only' });
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  });
  res.json(users);
});
