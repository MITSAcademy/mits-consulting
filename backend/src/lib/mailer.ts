/**
 * SMTP mailer using nodemailer. Supports:
 *  • System fallback — SMTP_HOST/USER/PASS env vars
 *  • Per-user override — each User can configure their own Gmail App Password,
 *    stored encrypted with SMTP_USER_ENCRYPTION_KEY (or JWT_SECRET as fallback).
 *  • Calendar invites — pass `icsAttachment` to embed an RFC 5545 .ics file as an alternative.
 */
import nodemailer, { Transporter } from 'nodemailer';
import crypto from 'crypto';

let systemTransporter: Transporter | null = null;
// Per-user transporters cached by user id (reset when password changes)
const userTransporters = new Map<string, { gmail: string; pwHash: string; tx: Transporter }>();

export function smtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function getSystemTransporter(): Transporter {
  if (systemTransporter) return systemTransporter;
  if (!smtpConfigured()) {
    throw new Error(
      'System SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in backend/.env.',
    );
  }
  systemTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  });
  return systemTransporter;
}

/** Per-user Gmail transporter using their stored App Password. */
export function getUserTransporter(userId: string, gmail: string, plainAppPassword: string): Transporter {
  const pass = plainAppPassword.replace(/\s+/g, '');
  const pwHash = require('crypto').createHash('sha256').update(pass).digest('hex').slice(0, 16);
  const cached = userTransporters.get(userId);
  if (cached && cached.gmail === gmail && cached.pwHash === pwHash) return cached.tx;
  const tx = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: gmail, pass },
    connectionTimeout: 30_000,
    greetingTimeout: 30_000,
    socketTimeout: 60_000,
  });
  userTransporters.set(userId, { gmail, pwHash, tx });
  return tx;
}

export function clearUserTransporter(userId: string) {
  userTransporters.delete(userId);
}

// ─── Encryption helpers (AES-256-GCM) ─────────────────────────────────────────

function getKey(): Buffer {
  const raw = process.env.SMTP_USER_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-fallback-key';
  return crypto.createHash('sha256').update(raw).digest();
}

/** Returns base64 string: iv(12) | tag(16) | ciphertext. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptSecret(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Build the `fromUser` arg from a user row, safely. Returns undefined when:
 *  - The user has no Gmail or app-password configured (mailer will throw
 *    MISSING_APP_PASSWORD, which triggers the setup modal).
 *  - decryptSecret throws (e.g. SMTP_USER_ENCRYPTION_KEY rotated and the
 *    stored ciphertext can no longer be opened). Without this guard the
 *    crypto error bubbled all the way up as a generic 500 with raw GCM
 *    auth-tag stack trace.
 */
export function safeBuildFromUser(me: {
  id: string; name: string;
  gmailAddress?: string | null;
  smtpAppPassword?: string | null;
  sendAsAddress?: string | null;
}): SendEmailArgs['fromUser'] | undefined {
  if (!me?.gmailAddress || !me?.smtpAppPassword) return undefined;
  try {
    return {
      id: me.id,
      name: me.name,
      gmailAddress: me.gmailAddress,
      appPasswordPlain: decryptSecret(me.smtpAppPassword),
      sendAsAddress: me.sendAsAddress,
    };
  } catch (e) {
    console.warn(`[mailer] decryptSecret failed for user ${me.id} — App Password likely encrypted with a rotated key. User will be prompted to re-save.`, (e as any)?.message);
    return undefined;
  }
}

/**
 * Build a safe public error message + a code for the 502 response when a send fails.
 * Hides raw SMTP errors ("535-5.7.8 Username and Password not accepted…") from end-users
 * while keeping the friendly MISSING_APP_PASSWORD path readable. Server-side log
 * still captures the full error for debugging.
 */
export function formatSendError(label: string, err: unknown): { error: string; code?: string } {
  const code = (err as any)?.code;
  const message = (err as any)?.message || String(err);
  // eslint-disable-next-line no-console
  console.error(`[${label}] send failed:`, message, err);
  if (code === 'MISSING_APP_PASSWORD') {
    return { error: message, code };
  }
  // EAUTH = Gmail rejected credentials (expired/revoked App Password) — treat same as missing
  if (code === 'EAUTH') {
    return {
      error: 'Your Gmail App Password has expired or been revoked. Please re-save it in Settings → My email.',
      code: 'MISSING_APP_PASSWORD',
    };
  }
  return {
    error: `${label} send failed. Open Settings → My email to re-save your App Password, or contact admin if it persists.`,
    code,
  };
}

// ─── Send email ───────────────────────────────────────────────────────────────

export interface SendEmailArgs {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  /** When set, send from this user's own Gmail (must have gmailAddress + decrypted appPassword).
   *  If `sendAsAddress` is also set, SMTP auth still uses gmailAddress, but the From: header is
   *  rewritten to sendAsAddress. Workspace admin must enable "Send mail as group address" first. */
  fromUser?: { id: string; name: string; gmailAddress: string; appPasswordPlain: string; sendAsAddress?: string | null };
  /** Optional ICS file to attach (and embed as alternative). */
  icsAttachment?: { filename: string; content: string; method?: string };
  /** Generic file attachments (e.g. engagement-letter PDF). Sent alongside icsAttachment if both present. */
  attachments?: { filename: string; content: Buffer | string; contentType?: string }[];
  cc?: string | string[];
  bcc?: string | string[];
  /** When set, use this as the HTML body verbatim instead of auto-wrapping `body` in <pre>. */
  htmlBody?: string;
}

export interface SendEmailResult {
  id: string;
  provider: 'smtp-user' | 'smtp-system';
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  let tx: Transporter;
  let from: string;
  let provider: SendEmailResult['provider'];

  if (args.fromUser?.gmailAddress && args.fromUser?.appPasswordPlain) {
    // Path 1 — user-initiated email (engagement letter, skill matrix, etc.).
    // Auth + From: the user's own Gmail App Password.
    tx = getUserTransporter(args.fromUser.id, args.fromUser.gmailAddress, args.fromUser.appPasswordPlain);
    const fromAddr = args.fromUser.sendAsAddress?.trim() || args.fromUser.gmailAddress;
    from = `"${args.fromUser.name}" <${fromAddr}>`;
    provider = 'smtp-user';
  } else if (args.fromUser) {
    // Path 2 — user-initiated but their App Password is missing or unreadable.
    // Refuse so the frontend can pop the setup modal (per founder request:
    // never silently use someone else's account for personal emails).
    const who = args.fromUser?.name || 'this user';
    const err: any = new Error(
      `${who} hasn't configured their Gmail App Password yet. Set it up in Settings → My email to send.`,
    );
    err.code = 'MISSING_APP_PASSWORD';
    throw err;
  } else {
    // Path 3 — SYSTEM-INITIATED notification (notify() / handover task email /
    // sourcing-request assignment / etc.) — these aren't personal correspondence
    // so they go from the shared MITS Hub system account. Without this path,
    // sourcing-request notifications silently failed for any sender who hadn't
    // configured their App Password yet — Kanchan reported missing emails for
    // today's requests. Restoring the system SMTP fallback for this path only.
    if (!smtpConfigured()) {
      const err: any = new Error('System SMTP not configured (SMTP_HOST / SMTP_USER / SMTP_PASS env vars). System notifications cannot send.');
      err.code = 'SYSTEM_SMTP_NOT_CONFIGURED';
      throw err;
    }
    tx = getSystemTransporter();
    from = process.env.SMTP_FROM || `"MITS Hub" <${process.env.SMTP_USER}>`;
    provider = 'smtp-system';
  }

  const html = args.htmlBody
    ? args.htmlBody
    : `<pre style="font-family:Inter,sans-serif;white-space:pre-wrap;font-size:14px;line-height:1.6;">${escapeHtml(args.body)}</pre>`;

  const mailOpts: any = {
    from,
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    replyTo: args.replyTo,
    subject: args.subject,
    text: args.body,
    html,
  };

  if (args.icsAttachment) {
    // Both an alternative (so most mail clients show "Add to calendar") and an attachment
    mailOpts.icalEvent = {
      method: args.icsAttachment.method || 'REQUEST',
      content: args.icsAttachment.content,
      filename: args.icsAttachment.filename,
    };
    mailOpts.attachments = [
      {
        filename: args.icsAttachment.filename,
        content: args.icsAttachment.content,
        contentType: `text/calendar; charset=utf-8; method=${args.icsAttachment.method || 'REQUEST'}`,
      },
    ];
  }
  // Append generic attachments (engagement-letter PDF, screenshots, etc.)
  if (args.attachments && args.attachments.length > 0) {
    mailOpts.attachments = [
      ...(mailOpts.attachments || []),
      ...args.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    ];
  }

  const info = await tx.sendMail(mailOpts);
  return { id: info.messageId, provider };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Simple {{var}} substitution. */
export function renderTemplate(tmpl: string, vars: Record<string, string | number | undefined | null>): string {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

// Back-compat alias for older callers
export const getTransporter = getSystemTransporter;
