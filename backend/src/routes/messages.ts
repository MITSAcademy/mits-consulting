import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';
import { sendEmail, smtpConfigured, renderTemplate } from '../lib/mailer';

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

// ---------- Status / health ----------

messagesRouter.get('/health', (_req, res) => {
  res.json({
    email: { provider: 'smtp', configured: smtpConfigured() },
    whatsapp: { provider: 'wa-link' }, // free path
  });
});

// ---------- Build wa.me URL (no API send) ----------

function waLink(phone?: string | null, message?: string): string {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}${message ? '?text=' + encodeURIComponent(message) : ''}`;
}

// ---------- Resolve variables from a client / trainer ----------

async function buildVars(opts: { clientId?: string; trainerId?: string; extra?: Record<string, any> }) {
  const vars: Record<string, any> = { ...(opts.extra || {}) };
  if (opts.clientId) {
    const c = await prisma.client.findUnique({
      where: { id: opts.clientId },
      include: { primaryTrainer: true, bankAccount: true, partner: true },
    });
    if (c) {
      vars.client_name = c.name;
      vars.client_email = c.email || (c.intakeData as any)?.client_email || '';
      vars.demo_date = c.demoDate || '';
      vars.demo_time = c.demoTimeIst || '';
      vars.skills = c.intakeSkillHint || (c.intakeData as any)?.detailed_skill_set || '';
      vars.meeting_link = (c.intakeData as any)?.meeting_link || '';
      vars.trainer_name = c.primaryTrainer?.name || '';
      vars.package = c.paymentModel || '';
      vars.sessions = String(c.sessionsPerCycle || 0);
      vars.currency = c.currency;
      vars.amount = c.cycleAmount || 0;
      vars.cycle_start = c.cycleStart || '';
      vars.cycle_end = c.cycleEnd || '';
      vars.session_time = c.preferredTimeIst || '';
      vars.bank_details = c.bankAccount ? `${c.bankAccount.label} (****${c.bankAccount.last4})` : '';
      vars.payment_date = c.freshPaymentDate || '';
      vars.next_cycle_start = '';
      vars.next_cycle_end = '';
    }
  }
  if (opts.trainerId) {
    const t = await prisma.trainer.findUnique({ where: { id: opts.trainerId } });
    if (t) {
      vars.trainer_name = vars.trainer_name || t.name;
      vars.trainer_email = t.email || '';
      vars.trainer_phone = `${t.phoneCode || ''}${t.phoneDigits || ''}`;
    }
  }
  return vars;
}

// ---------- Send email (SMTP) ----------

messagesRouter.post('/email', async (req: AuthedRequest, res) => {
  const { to, subject, body, templateId, clientId, trainerId, variables } = req.body;
  if (!to) return res.status(400).json({ error: '"to" email required' });
  if (!subject && !templateId) return res.status(400).json({ error: 'subject required (or templateId to derive)' });
  if (!body && !templateId) return res.status(400).json({ error: 'body required (or templateId to derive)' });

  // Build final subject + body
  let finalSubject = subject || '';
  let finalBody = body || '';
  if (templateId) {
    const tpl = await prisma.emailTemplate.findUnique({ where: { id: templateId } });
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    const v = await buildVars({ clientId, trainerId, extra: variables });
    if (!subject) finalSubject = renderTemplate(tpl.subject || tpl.name, v);
    if (!body) finalBody = renderTemplate(tpl.body, v);
  } else if (variables) {
    finalSubject = renderTemplate(finalSubject, variables);
    finalBody = renderTemplate(finalBody, variables);
  }

  // Persist + send. If SMTP not configured, we still log with status=Queued so the user has a record.
  const msg = await prisma.outboundMessage.create({
    data: {
      kind: 'Email',
      templateId: templateId || null,
      toEmail: to,
      subject: finalSubject,
      body: finalBody,
      clientId: clientId || null,
      trainerId: trainerId || null,
      sentById: req.user!.id,
      status: smtpConfigured() ? 'Queued' : 'Queued',
      provider: 'smtp',
    },
  });

  if (!smtpConfigured()) {
    await prisma.outboundMessage.update({
      where: { id: msg.id },
      data: {
        status: 'Failed',
        errorText: 'SMTP not configured — set SMTP_HOST/USER/PASS in .env and restart the backend.',
      },
    });
    await audit(req.user!.id, req.user!.name, 'EMAIL_NOT_CONFIGURED', `${to} · ${finalSubject}`);
    return res.status(503).json({
      error: 'SMTP not configured on the server. Set SMTP_HOST/USER/PASS in backend/.env and restart.',
      messageId: msg.id,
    });
  }

  try {
    // Prefer the current user's own Gmail if configured (so emails go from their address)
    const me = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true },
    });
    let fromUser;
    if (me?.gmailAddress && me?.smtpAppPassword) {
      const { decryptSecret } = await import('../lib/mailer');
      fromUser = {
        id: me.id, name: me.name, gmailAddress: me.gmailAddress,
        appPasswordPlain: decryptSecret(me.smtpAppPassword),
      };
    }
    const r = await sendEmail({ to, subject: finalSubject, body: finalBody, fromUser });
    await prisma.outboundMessage.update({
      where: { id: msg.id },
      data: { status: 'Sent', providerMessageId: r.id, provider: r.provider },
    });
    await audit(req.user!.id, req.user!.name, 'EMAIL_SENT', `${to} · ${finalSubject} · via ${r.provider}`);
    res.status(201).json({ ok: true, messageId: msg.id, providerMessageId: r.id, provider: r.provider });
  } catch (e: any) {
    await prisma.outboundMessage.update({
      where: { id: msg.id },
      data: { status: 'Failed', errorText: e.message || String(e) },
    });
    await audit(req.user!.id, req.user!.name, 'EMAIL_FAILED', `${to} · ${e.message}`);
    res.status(502).json({ error: 'Email send failed: ' + (e.message || String(e)), messageId: msg.id });
  }
});

// ---------- "Send" WhatsApp = build wa.me link + log it ----------

messagesRouter.post('/whatsapp', async (req: AuthedRequest, res) => {
  const { toPhone, toName, body, templateId, clientId, trainerId, variables } = req.body;
  if (!toPhone) return res.status(400).json({ error: 'toPhone required (E.164 digits or +91… form)' });

  let finalBody = body || '';
  if (templateId) {
    const tpl = await prisma.emailTemplate.findUnique({ where: { id: templateId } });
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    const v = await buildVars({ clientId, trainerId, extra: variables });
    if (!body) finalBody = renderTemplate(tpl.body, v);
  } else if (variables) {
    finalBody = renderTemplate(finalBody, variables);
  }

  const url = waLink(toPhone, finalBody);
  if (!url) return res.status(400).json({ error: 'Invalid phone' });

  // Free-path: we don't actually call any API. We log the intent + the wa.me URL.
  // The frontend opens the URL in a new tab; user pastes into WhatsApp.
  const msg = await prisma.outboundMessage.create({
    data: {
      kind: 'WhatsApp',
      templateId: templateId || null,
      toPhone,
      toName: toName || null,
      body: finalBody,
      clientId: clientId || null,
      trainerId: trainerId || null,
      sentById: req.user!.id,
      status: 'Logged',
      provider: 'wa-link',
    },
  });
  await audit(req.user!.id, req.user!.name, 'WHATSAPP_LOGGED', `${toPhone}${toName ? ' · ' + toName : ''}`);
  res.status(201).json({ ok: true, messageId: msg.id, url });
});

// ---------- List messages for a client / trainer ----------

messagesRouter.get('/', async (req, res) => {
  const { clientId, trainerId, kind, limit } = req.query as any;
  const where: any = {};
  if (clientId) where.clientId = clientId;
  if (trainerId) where.trainerId = trainerId;
  if (kind) where.kind = kind;
  const list = await prisma.outboundMessage.findMany({
    where,
    include: { sentBy: { select: { id: true, name: true } } },
    orderBy: { sentAt: 'desc' },
    take: Math.min(Number(limit) || 50, 200),
  });
  res.json(list);
});
