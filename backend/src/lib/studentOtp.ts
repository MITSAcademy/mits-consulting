/**
 * Email OTPs for student signup and login.
 *
 * Codes are bcrypt-hashed at rest, single-use, expire in 10 minutes and lock
 * out after 5 wrong attempts. Issuing a new code invalidates the student's
 * outstanding ones for that purpose, so an attacker cannot widen the guess
 * space by requesting many codes at once.
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from './prisma';

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type OtpPurpose = 'signup' | 'login';

/** Cryptographically random 6-digit code — Math.random() is not acceptable here. */
function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function issueOtp(studentId: string, purpose: OtpPurpose): Promise<string> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);

  // Supersede any outstanding codes for this purpose.
  await prisma.studentOtp.updateMany({
    where: { studentId, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.studentOtp.create({
    data: { studentId, purpose, codeHash, expiresAt: new Date(Date.now() + TTL_MS) },
  });

  return code;
}

/**
 * Returns true only for a live, unconsumed, matching code. Every outcome —
 * wrong code, expired, too many attempts, no code at all — is reported to the
 * caller as a plain false so responses cannot be used to probe account state.
 */
export async function verifyOtp(studentId: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  const otp = await prisma.studentOtp.findFirst({
    where: { studentId, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) return false;

  if (otp.expiresAt < new Date() || otp.attempts >= MAX_ATTEMPTS) {
    await prisma.studentOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    return false;
  }

  const ok = await bcrypt.compare(code, otp.codeHash);
  if (!ok) {
    await prisma.studentOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return false;
  }

  await prisma.studentOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  return true;
}
