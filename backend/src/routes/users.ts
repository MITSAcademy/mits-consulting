import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest, hashPassword } from '../lib/auth';
import { audit } from '../lib/audit';
import { encryptSecret, clearUserTransporter, sendEmail, decryptSecret } from '../lib/mailer';

export const usersRouter = Router();

usersRouter.use(requireAuth);

const ALLOWED_DOMAIN = '@mitssolution.com';

usersRouter.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, reportsToId: true, active: true, createdAt: true, gmailAddress: true, smtpConfiguredAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(users);
});

// ─── Per-user SMTP (Gmail) ──────────────────────────────────────────────────

// Status of current user's SMTP config (returns whether configured + masked Gmail)
usersRouter.get('/me/smtp', async (req: AuthedRequest, res) => {
  const u = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { gmailAddress: true, smtpAppPassword: true, smtpConfiguredAt: true },
  });
  res.json({
    gmailAddress: u?.gmailAddress || null,
    hasPassword: !!u?.smtpAppPassword,
    configuredAt: u?.smtpConfiguredAt || null,
  });
});

// Save or update current user's Gmail + App Password.
// Domain locked to @mitssolution.com.
usersRouter.post('/me/smtp', async (req: AuthedRequest, res) => {
  const { gmailAddress, appPassword } = req.body || {};
  if (!gmailAddress || !appPassword) {
    return res.status(400).json({ error: 'gmailAddress and appPassword required' });
  }
  const email = String(gmailAddress).trim().toLowerCase();
  if (!email.endsWith(ALLOWED_DOMAIN)) {
    return res.status(400).json({ error: `Only ${ALLOWED_DOMAIN} addresses are allowed.` });
  }
  const cleanPass = String(appPassword).replace(/\s+/g, '');
  if (cleanPass.length !== 16) {
    return res.status(400).json({ error: 'Gmail App Passwords are 16 characters (spaces optional).' });
  }
  // Ensure no other user has claimed this Gmail
  const existing = await prisma.user.findFirst({ where: { gmailAddress: email, id: { not: req.user!.id } } });
  if (existing) return res.status(409).json({ error: `${email} is already linked to another user.` });

  const encrypted = encryptSecret(cleanPass);
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { gmailAddress: email, smtpAppPassword: encrypted, smtpConfiguredAt: new Date() },
  });
  clearUserTransporter(req.user!.id); // force-rebuild on next send

  await audit(req.user!.id, req.user!.name, 'USER_SMTP_SET', `${email}`);
  res.json({ ok: true, gmailAddress: email });
});

// Clear the current user's SMTP config (fall back to system SMTP)
usersRouter.delete('/me/smtp', async (req: AuthedRequest, res) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { gmailAddress: null, smtpAppPassword: null, smtpConfiguredAt: null },
  });
  clearUserTransporter(req.user!.id);
  await audit(req.user!.id, req.user!.name, 'USER_SMTP_CLEAR', '');
  res.json({ ok: true });
});

// Send a test email to the user's own configured Gmail to verify creds
usersRouter.post('/me/smtp/test', async (req: AuthedRequest, res) => {
  const u = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true },
  });
  if (!u?.gmailAddress || !u?.smtpAppPassword) {
    return res.status(400).json({ error: 'Configure your Gmail + App Password first.' });
  }
  try {
    const pwd = decryptSecret(u.smtpAppPassword);
    const r = await sendEmail({
      to: u.gmailAddress,
      subject: 'MITS Portal · email test',
      body: `Hi ${u.name},\n\nThis test was sent FROM your own Gmail (${u.gmailAddress}) via the MITS Portal.\n\nIf you got this, your portal email is configured correctly. Demo confirmations, payment receipts, and other automated messages will now go out under your address.\n\n— MITS Portal`,
      fromUser: { id: u.id, name: u.name, gmailAddress: u.gmailAddress, appPasswordPlain: pwd },
    });
    res.json({ ok: true, providerMessageId: r.id });
  } catch (e: any) {
    res.status(502).json({ error: 'Send failed: ' + (e.message || String(e)) });
  }
});

usersRouter.post('/', requireRole('founder'), async (req: AuthedRequest, res) => {
  const { name, email, password, role, reportsToId } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Missing fields' });
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) return res.status(409).json({ error: 'Email taken' });
  const passwordHash = await hashPassword(password);
  const u = await prisma.user.create({
    data: { name, email: email.toLowerCase(), passwordHash, role, reportsToId: reportsToId || null },
  });
  await audit(req.user!.id, req.user!.name, 'USER_CREATE', `${u.name} · ${u.role}`);
  res.status(201).json({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active });
});

usersRouter.patch('/:id', requireRole('founder'), async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const data: any = {};
  for (const k of ['name', 'role', 'reportsToId', 'active']) {
    if (k in req.body) data[k] = req.body[k];
  }
  if (req.body.password) data.passwordHash = await hashPassword(req.body.password);
  const u = await prisma.user.update({ where: { id }, data });
  await audit(req.user!.id, req.user!.name, 'USER_UPDATE', `${u.name}`);
  res.json({ id: u.id, name: u.name, role: u.role, active: u.active });
});

usersRouter.delete('/:id', requireRole('founder'), async (req: AuthedRequest, res) => {
  const u = await prisma.user.update({ where: { id: req.params.id }, data: { active: false } });
  await audit(req.user!.id, req.user!.name, 'USER_DEACTIVATE', `${u.name}`);
  res.json({ ok: true });
});
