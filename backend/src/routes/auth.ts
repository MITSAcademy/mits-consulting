import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword, signToken, setAuthCookie, clearAuthCookie, requireAuth, AuthedRequest } from '../lib/auth';
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
