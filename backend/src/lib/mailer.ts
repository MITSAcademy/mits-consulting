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
const userTransporters = new Map<string, { gmail: string; tx: Transporter }>();

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
  const cached = userTransporters.get(userId);
  if (cached && cached.gmail === gmail) return cached.tx;
  const tx = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: gmail, pass: plainAppPassword.replace(/\s+/g, '') },
  });
  userTransporters.set(userId, { gmail, tx });
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

// ─── Send email ───────────────────────────────────────────────────────────────

export interface SendEmailArgs {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  /** When set, send from this user's own Gmail (must have gmailAddress + decrypted appPassword). */
  fromUser?: { id: string; name: string; gmailAddress: string; appPasswordPlain: string };
  /** Optional ICS file to attach (and embed as alternative). */
  icsAttachment?: { filename: string; content: string; method?: string };
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
    tx = getUserTransporter(args.fromUser.id, args.fromUser.gmailAddress, args.fromUser.appPasswordPlain);
    from = `"${args.fromUser.name}" <${args.fromUser.gmailAddress}>`;
    provider = 'smtp-user';
  } else {
    tx = getSystemTransporter();
    from = process.env.SMTP_FROM || process.env.SMTP_USER!;
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
