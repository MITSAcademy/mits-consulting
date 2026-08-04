import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { sendEmail } from '../lib/mailer';
import { audit } from '../lib/audit';
import nodemailer from 'nodemailer';

export const marketingCampaignsRouter = Router();
marketingCampaignsRouter.use(requireAuth);

const ALLOWED = ['founder'];

// Brevo SMTP transporter (created on first use)
let brevoTransporter: nodemailer.Transporter | null = null;
function getBrevoTransporter() {
  if (brevoTransporter) return brevoTransporter;
  if (!process.env.BREVO_SMTP_USER || !process.env.BREVO_SMTP_PASS) return null;
  brevoTransporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: { user: process.env.BREVO_SMTP_USER, pass: process.env.BREVO_SMTP_PASS },
  });
  return brevoTransporter;
}

// Resolve recipients for a campaign
async function resolveRecipients(campaign: any): Promise<{ id: string; name: string; email: string }[]> {
  const where: any = { email: { not: null } };
  if (campaign.recipientMode === 'all_active') {
    where.lifecycle = 'Active';
  } else if (campaign.recipientMode === 'all_clients') {
    // no lifecycle filter — every client with an email
  } else if (campaign.recipientMode === 'by_lifecycle' && campaign.lifecycles?.length) {
    where.lifecycle = { in: campaign.lifecycles };
  } else if (campaign.recipientMode === 'individual' && campaign.clientIds?.length) {
    where.id = { in: campaign.clientIds };
  }
  const clients = await prisma.client.findMany({
    where,
    select: { id: true, name: true, email: true },
  });
  return clients.filter((c) => !!c.email) as { id: string; name: string; email: string }[];
}

// GET / — list all campaigns
marketingCampaignsRouter.get('/', requireRole(...ALLOWED), async (_req, res) => {
  const campaigns = await prisma.marketingCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true } },
      sentBy:    { select: { id: true, name: true } },
    },
  });
  res.json(campaigns);
});

// POST / — create draft
marketingCampaignsRouter.post('/', requireRole(...ALLOWED), async (req: AuthedRequest, res) => {
  const { name, subject, htmlBody, fromName, fromEmail, recipientMode, lifecycles, clientIds } = req.body;
  if (!name)    return res.status(400).json({ error: 'name required' });
  if (!subject) return res.status(400).json({ error: 'subject required' });
  if (!htmlBody) return res.status(400).json({ error: 'htmlBody required' });

  const campaign = await prisma.marketingCampaign.create({
    data: {
      name, subject, htmlBody,
      fromName: fromName || 'MITS Consulting',
      fromEmail: fromEmail || 'sales.mc@mitssolution.com',
      recipientMode: recipientMode || 'all_active',
      lifecycles: lifecycles || [],
      clientIds: clientIds || [],
      createdById: req.user!.id,
      status: 'Draft',
    },
  });
  res.status(201).json(campaign);
});

// PATCH /:id — update draft
marketingCampaignsRouter.patch('/:id', requireRole(...ALLOWED), async (req: AuthedRequest, res) => {
  const existing = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.status === 'Sent') return res.status(400).json({ error: 'Cannot edit a sent campaign' });

  const { name, subject, htmlBody, fromName, fromEmail, recipientMode, lifecycles, clientIds } = req.body;
  const data: any = {};
  if (name !== undefined)          data.name = name;
  if (subject !== undefined)       data.subject = subject;
  if (htmlBody !== undefined)      data.htmlBody = htmlBody;
  if (fromName !== undefined)      data.fromName = fromName;
  if (fromEmail !== undefined)     data.fromEmail = fromEmail;
  if (recipientMode !== undefined) data.recipientMode = recipientMode;
  if (lifecycles !== undefined)    data.lifecycles = lifecycles;
  if (clientIds !== undefined)     data.clientIds = clientIds;

  const updated = await prisma.marketingCampaign.update({ where: { id: req.params.id }, data });
  res.json(updated);
});

// DELETE /:id — delete draft
marketingCampaignsRouter.delete('/:id', requireRole(...ALLOWED), async (req: AuthedRequest, res) => {
  const existing = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.status === 'Sending') return res.status(400).json({ error: 'Cannot delete while sending' });
  await prisma.marketingCampaign.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// POST /:id/preview-recipients — dry-run recipient list
marketingCampaignsRouter.post('/:id/preview-recipients', requireRole(...ALLOWED), async (req, res) => {
  const campaign = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  const recipients = await resolveRecipients(campaign);
  res.json({ count: recipients.length, recipients });
});

// POST /:id/send — send the campaign
marketingCampaignsRouter.post('/:id/send', requireRole(...ALLOWED), async (req: AuthedRequest, res) => {
  const campaign = await prisma.marketingCampaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  if (campaign.status === 'Sent') return res.status(400).json({ error: 'Already sent' });
  if (campaign.status === 'Sending') return res.status(400).json({ error: 'Already sending' });

  const recipients = await resolveRecipients(campaign);
  if (recipients.length === 0) return res.status(400).json({ error: 'No recipients with email addresses found' });

  // Mark as sending and return immediately — actual send happens async
  await prisma.marketingCampaign.update({
    where: { id: campaign.id },
    data: { status: 'Sending', totalRecipients: recipients.length, sentById: req.user!.id },
  });
  res.json({ ok: true, totalRecipients: recipients.length, message: 'Send started — check campaign status for progress' });

  // Send in background
  (async () => {
    const brevo = getBrevoTransporter();
    const provider = brevo ? 'brevo' : 'smtp-system';
    let sentCount = 0;
    let failedCount = 0;

    for (const r of recipients) {
      try {
        const personalised = campaign.htmlBody
          .replace(/\{\{name\}\}/gi, r.name)
          .replace(/\{\{email\}\}/gi, r.email);

        if (brevo) {
          await brevo.sendMail({
            from: `"${campaign.fromName}" <${campaign.fromEmail}>`,
            to: `"${r.name}" <${r.email}>`,
            subject: campaign.subject,
            html: personalised,
          });
        } else {
          await sendEmail({
            to: r.email,
            subject: campaign.subject,
            body: r.name,
            htmlBody: personalised,
          });
        }
        sentCount++;
      } catch (e) {
        console.error(`[marketing] failed to send to ${r.email}:`, e);
        failedCount++;
      }
      // Respect free-tier rate limits (max ~5/sec for Brevo)
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    await prisma.marketingCampaign.update({
      where: { id: campaign.id },
      data: {
        status: failedCount === recipients.length ? 'Failed' : 'Sent',
        sentAt: new Date(),
        sentCount,
        failedCount,
        provider,
      },
    });

    await audit(
      req.user!.id, req.user!.name, 'MARKETING_CAMPAIGN_SENT',
      `"${campaign.name}" → ${sentCount} sent, ${failedCount} failed via ${provider}`,
    );
  })().catch((e) => console.error('[marketing] background send error:', e));
});
