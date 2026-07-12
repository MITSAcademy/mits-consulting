import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { prisma } from './prisma';
import { recordForbidden } from './rbacLog';

// Hard refuse to boot in production with the dev fallback — accidentally
// running without JWT_SECRET in prod would issue tokens any GitHub stalker
// could forge. In dev the fallback stays so `npm run dev` works out of the box.
const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production. Set it in Render env vars (or use `generateValue: true` in render.yaml).');
  }
  return 'dev-secret-change-me';
})();
const COOKIE_NAME = 'mits_token';

export interface AuthedRequest extends Request {
  user?: { id: string; role: string; name: string; email: string };
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export function signToken(payload: object) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function setAuthCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  });
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    let token = req.cookies?.[COOKIE_NAME];
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7);
    }
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || !user.active) return res.status(401).json({ error: 'User inactive' });
    req.user = { id: user.id, role: user.role, name: user.name, email: user.email };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export async function verifyAndGetUser(token: string) {
  const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
  return prisma.user.findUnique({ where: { id: decoded.id } });
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      recordForbidden({
        method: req.method,
        path: req.path,
        role: req.user.role,
        userId: req.user.id,
        userName: req.user.name,
      });
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
