/**
 * Auth for public students (mitsedge.com signups) — deliberately separate from
 * the staff auth in ./auth.ts.
 *
 * Staff `requireAuth` looks up prisma.user and would 401 a student id anyway,
 * but tokens here also carry `typ: 'student'` and are verified against it, so a
 * token can never be replayed across the two systems even if ids were to collide.
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { prisma } from './prisma';

const JWT_SECRET = (() => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production.');
  }
  return 'dev-secret-change-me';
})();

const COOKIE_NAME = 'mits_student_token';
const TOKEN_TYPE = 'student';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface StudentRequest extends Request {
  student?: { id: string; email: string; name: string };
}

export function signStudentToken(studentId: string) {
  return jwt.sign({ id: studentId, typ: TOKEN_TYPE }, JWT_SECRET, { expiresIn: '30d' });
}

export function setStudentCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: MAX_AGE_MS,
  });
}

export function clearStudentCookie(res: Response) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  });
}

export async function requireStudentAuth(req: StudentRequest, res: Response, next: NextFunction) {
  try {
    let token = req.cookies?.[COOKIE_NAME];
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7);
    }
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const decoded = jwt.verify(token, JWT_SECRET) as { id?: string; typ?: string };
    if (decoded.typ !== TOKEN_TYPE || !decoded.id) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const student = await prisma.student.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, name: true, active: true },
    });
    if (!student || !student.active) return res.status(401).json({ error: 'Account inactive' });

    req.student = { id: student.id, email: student.email, name: student.name };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
