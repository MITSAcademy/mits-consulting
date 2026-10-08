import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword } from '../lib/auth';
import {
  signStudentToken,
  setStudentCookie,
  clearStudentCookie,
  requireStudentAuth,
  StudentRequest,
} from '../lib/studentAuth';
import { issueOtp, verifyOtp } from '../lib/studentOtp';
import { sendStudentOtpEmail } from '../lib/studentOtpEmail';

export const studentAuthRouter = Router();

// These are browser-facing and unauthenticated, so they are the one part of the
// API a stranger can hammer. Limits are deliberately tighter than the global
// 300/min, and tightest on the endpoints that send email.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again shortly.' },
  skip: () => process.env.NODE_ENV !== 'production',
});

const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again shortly.' },
  skip: () => process.env.NODE_ENV !== 'production',
});

const emailField = z.string().trim().toLowerCase().email();
const passwordField = z.string().min(8, 'Password must be at least 8 characters').max(200);

// Password is optional: the website's signup form only collects details and
// verifies by OTP, so accounts can start passwordless and set one later.
const signupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailField,
  password: passwordField.optional(),
  phone: z.string().trim().max(30).optional(),
});
const verifyOtpSchema = z.object({ email: emailField, otp: z.string().trim().length(6) });
const loginSchema = z.object({ email: emailField, password: z.string().min(1).max(200) });
const emailOnlySchema = z.object({ email: emailField });
const googleSchema = z.object({ idToken: z.string().min(1) });

function sessionResponse(student: { id: string; email: string; name: string; phone: string | null }) {
  return {
    student: { id: student.id, email: student.email, name: student.name, phone: student.phone },
  };
}

/** Issues the session cookie and returns the bearer token alongside it.
 *  mits-web runs cross-origin, where mobile browsers block third-party cookies,
 *  so it uses the bearer; the cookie is there for same-origin use. */
function grantSession(res: Parameters<typeof setStudentCookie>[0], studentId: string) {
  const token = signStudentToken(studentId);
  setStudentCookie(res, token);
  return token;
}

// POST /api/student/signup — creates an unverified account and emails an OTP.
studentAuthRouter.post('/signup', otpLimiter, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid details' });
  }
  const { name, email, password, phone } = parsed.data;

  const existing = await prisma.student.findUnique({ where: { email } });
  if (existing?.emailVerified) {
    // Don't confirm that the address is registered — tell them to check mail
    // either way and send nothing.
    return res.json({ ok: true, message: 'Check your email for a verification code.' });
  }

  const passwordHash = password ? await hashPassword(password) : undefined;
  const student = existing
    ? await prisma.student.update({
        where: { id: existing.id },
        // Only overwrite the hash when a new password was supplied, so an
        // unverified retry without one does not wipe an existing password.
        data: { name, phone: phone || null, ...(passwordHash ? { passwordHash } : {}) },
      })
    : await prisma.student.create({
        data: { name, email, phone: phone || null, passwordHash: passwordHash ?? null },
      });

  const code = await issueOtp(student.id, 'signup');
  try {
    await sendStudentOtpEmail(student.email, student.name, code, 'signup');
  } catch (e) {
    console.error('[student-auth] signup OTP email failed:', e);
    return res.status(502).json({ error: 'Could not send the verification email. Please try again.' });
  }

  res.json({ ok: true, message: 'Check your email for a verification code.' });
});

// POST /api/student/verify-otp — completes signup and starts a session.
studentAuthRouter.post('/verify-otp', authLimiter, async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid code' });
  const { email, otp } = parsed.data;

  const student = await prisma.student.findUnique({ where: { email } });
  if (!student || !student.active) return res.status(400).json({ error: 'Invalid or expired code' });

  if (!(await verifyOtp(student.id, 'signup', otp))) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  const updated = await prisma.student.update({
    where: { id: student.id },
    data: { emailVerified: true },
  });

  const token = grantSession(res, updated.id);
  res.json({ ...sessionResponse(updated), token });
});

// POST /api/student/login — email + password.
studentAuthRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid email or password' });
  const { email, password } = parsed.data;

  const student = await prisma.student.findUnique({ where: { email } });

  // Always run a bcrypt comparison so a missing account and a wrong password
  // take the same time — otherwise response timing enumerates registered emails.
  const hash = student?.passwordHash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await verifyPassword(password, hash);

  if (!student || !student.active || !student.passwordHash || !ok) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (!student.emailVerified) {
    return res.status(403).json({ error: 'Please verify your email first.', needsVerification: true });
  }

  const token = grantSession(res, student.id);
  res.json({ ...sessionResponse(student), token });
});

// POST /api/student/request-otp — emails a login code.
studentAuthRouter.post('/request-otp', otpLimiter, async (req, res) => {
  const parsed = emailOnlySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid email' });

  const student = await prisma.student.findUnique({ where: { email: parsed.data.email } });

  // Same reply whether or not the account exists.
  if (student?.active) {
    const code = await issueOtp(student.id, 'login');
    try {
      await sendStudentOtpEmail(student.email, student.name, code, 'login');
    } catch (e) {
      console.error('[student-auth] login OTP email failed:', e);
    }
  }

  res.json({ ok: true, message: 'If that email is registered, a code is on its way.' });
});

// POST /api/student/login-otp — email + code.
studentAuthRouter.post('/login-otp', authLimiter, async (req, res) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid or expired code' });
  const { email, otp } = parsed.data;

  const student = await prisma.student.findUnique({ where: { email } });
  if (!student || !student.active) return res.status(400).json({ error: 'Invalid or expired code' });

  if (!(await verifyOtp(student.id, 'login', otp))) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  // Signing in from an emailed code proves control of the address.
  const updated = student.emailVerified
    ? student
    : await prisma.student.update({ where: { id: student.id }, data: { emailVerified: true } });

  const token = grantSession(res, updated.id);
  res.json({ ...sessionResponse(updated), token });
});

// POST /api/student/google — Google Identity Services ID token.
const googleClient = new OAuth2Client();

studentAuthRouter.post('/google', authLimiter, async (req, res) => {
  const parsed = googleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Missing Google token' });

  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) {
    console.error('[student-auth] GOOGLE_CLIENT_ID is not set — refusing Google sign-in');
    return res.status(503).json({ error: 'Google sign-in is unavailable.' });
  }

  let payload;
  try {
    // Verifies signature against Google's JWKS and checks aud/iss/exp. The
    // client-supplied email is only trusted once this passes.
    const ticket = await googleClient.verifyIdToken({ idToken: parsed.data.idToken, audience });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Invalid Google token' });
  }

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    return res.status(401).json({ error: 'Google account email is not verified' });
  }

  const email = payload.email.toLowerCase();
  const name = payload.name?.trim() || email.split('@')[0];

  let student = await prisma.student.findUnique({ where: { googleSub: payload.sub } });
  if (!student) {
    const byEmail = await prisma.student.findUnique({ where: { email } });
    student = byEmail
      ? await prisma.student.update({
          where: { id: byEmail.id },
          data: { googleSub: payload.sub, emailVerified: true },
        })
      : await prisma.student.create({
          data: { email, name, googleSub: payload.sub, emailVerified: true },
        });
  }

  if (!student.active) return res.status(403).json({ error: 'Account is inactive' });

  const token = grantSession(res, student.id);
  res.json({ ...sessionResponse(student), token });
});

// POST /api/student/logout
studentAuthRouter.post('/logout', (_req, res) => {
  clearStudentCookie(res);
  res.json({ ok: true });
});

// GET /api/student/me
studentAuthRouter.get('/me', requireStudentAuth, async (req: StudentRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.student!.id },
    select: { id: true, email: true, name: true, phone: true, emailVerified: true, createdAt: true },
  });
  if (!student) return res.status(404).json({ error: 'Not found' });
  res.json({ student });
});

// POST /api/student/me/password — set or change the signed-in student's password.
// Accounts created through the website's OTP signup start passwordless, so a
// current password is only demanded when one already exists.
studentAuthRouter.post('/me/password', authLimiter, requireStudentAuth, async (req: StudentRequest, res) => {
  const parsed = z
    .object({ currentPassword: z.string().max(200).optional(), newPassword: passwordField })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid password' });
  }

  const student = await prisma.student.findUnique({ where: { id: req.student!.id } });
  if (!student) return res.status(404).json({ error: 'Not found' });

  if (student.passwordHash) {
    const ok = parsed.data.currentPassword
      ? await verifyPassword(parsed.data.currentPassword, student.passwordHash)
      : false;
    if (!ok) return res.status(403).json({ error: 'Current password is incorrect' });
  }

  await prisma.student.update({
    where: { id: student.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
  res.json({ ok: true });
});

// GET /api/student/me/purchases — the signed-in student's own courses.
// Always scoped to the token's student; there is no id parameter to tamper with.
studentAuthRouter.get('/me/purchases', requireStudentAuth, async (req: StudentRequest, res) => {
  const purchases = await prisma.studentPurchase.findMany({
    where: { studentId: req.student!.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, courseId: true, courseTitle: true, status: true,
      amount: true, currency: true, createdAt: true, paidAt: true,
    },
  });
  res.json({ purchases });
});

// GET /api/student/me/purchases/:id — one purchase, scoped to the caller so a
// guessed id cannot read someone else's receipt.
studentAuthRouter.get('/me/purchases/:id', requireStudentAuth, async (req: StudentRequest, res) => {
  const purchase = await prisma.studentPurchase.findFirst({
    where: { id: req.params.id, studentId: req.student!.id },
    select: {
      id: true, courseId: true, courseTitle: true, status: true,
      amount: true, currency: true, gateway: true, merchantTxnId: true,
      gatewayRef: true, createdAt: true, paidAt: true,
    },
  });
  if (!purchase) return res.status(404).json({ error: 'Not found' });
  res.json({ purchase });
});
