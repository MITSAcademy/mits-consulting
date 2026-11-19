import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword, signToken, setAuthCookie, clearAuthCookie, requireAuth, verifyAndGetUser, readSessionCookie, decodeToken, AuthedRequest } from '../lib/auth';
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
  // Ignored: kept so older clients that still send it get a clear 403, not a 400.
  role: z.string().optional(),
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
  // Bootstrap only: the very first user of an empty database becomes founder.
  // After that, accounts are created by a founder in Team (or via Google SSO
  // for existing users). Self-registration used to accept a `role` from the
  // request body, which let anyone on the internet create a founder account.
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
  const { name, email, password } = parsed.data;
  const count = await prisma.user.count();
  if (count > 0) {
    return res.status(403).json({ error: 'Registration is closed. Ask a founder to add you in Team.' });
  }
  const finalRole = 'founder';
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
  // `imp` records who started the impersonation, so exit can restore that
  // founder from the session cookie alone (no client-supplied id).
  const token = signToken({ id: target.id, imp: req.user!.id });
  setAuthCookie(res, token);
  await audit(req.user!.id, req.user!.name, 'IMPERSONATE', `→ ${target.name} (${target.role})`);
  res.json({ user: { id: target.id, name: target.name, email: target.email, role: target.role }, token });
});

// Exit impersonation: restore the founder's session.
// Accepts either:
//   a) Bearer <founderToken> header — verifies and restores cookie
//   b) the current "view as" session cookie — its signed `imp` claim names the
//      founder who started it, and a fresh founder token is issued.
// It no longer accepts a founderId from the request body: that let any
// logged-out caller or staff user mint a founder session.
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
  // Path B: founder token not available (e.g. Google sign-in, page reload) —
  // restore from the signed impersonation claim in the session cookie.
  const sessionToken = readSessionCookie(req);
  if (!sessionToken) return res.status(401).json({ error: 'Not authenticated' });
  let claims;
  try {
    claims = decodeToken(sessionToken);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  if (!claims.imp) return res.status(400).json({ error: 'Not an impersonation session' });
  const founder = await prisma.user.findUnique({ where: { id: claims.imp } });
  if (!founder || !founder.active || founder.role !== 'founder') {
    return res.status(403).json({ error: 'Not a founder account' });
  }
  setAuthCookie(res, signToken({ id: founder.id }));
  await audit(founder.id, founder.name, 'EXIT_IMPERSONATION', 'restored-from-session');
  return res.json({ user: { id: founder.id, name: founder.name, email: founder.email, role: founder.role } });
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
