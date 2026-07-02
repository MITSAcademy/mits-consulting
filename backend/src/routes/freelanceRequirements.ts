import { Router } from 'express';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { sendEmail, safeBuildFromUser } from '../lib/mailer';

async function getFromUser() {
  const vaibhav = await prisma.user.findUnique({
    where: { id: 'u-vaibhav' },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });
  return vaibhav ? safeBuildFromUser(vaibhav) : null;
}

async function getRecruiters(): Promise<{ email: string; name: string }[]> {
  const users = await prisma.user.findMany({
    where: { role: 'recruiter', active: true },
    select: { email: true, gmailAddress: true, name: true },
  });
  return users.map((u: any) => ({ name: u.name, email: u.gmailAddress || u.email })).filter((u: any) => u.email);
}

export const freelanceRequirementsRouter = Router();
freelanceRequirementsRouter.use(requireAuth);

// Regular team + management can read and write
const REGULAR_ROLES = ['founder', 'manager', 'lead', 'account_manager'];

const include = {
  flaggedBy: { select: { id: true, name: true } },
  lastUpdatedBy: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
  comments: { orderBy: { createdAt: 'asc' as const } },
};

// Auto-escalate requirements older than 7 days with no trainer assigned
function shouldEscalate(req: any): boolean {
  if (req.isEscalated) return true;
  if (req.trainerName) return false;
  const age = Math.floor((Date.now() - new Date(req.createdAt).getTime()) / 86_400_000);
  return age >= 7;
}

freelanceRequirementsRouter.get('/', requireRole(...REGULAR_ROLES), async (_req, res) => {
  const items = await (prisma as any).freelanceRequirement.findMany({
    include,
    orderBy: { createdAt: 'desc' },
  });
  // Auto-mark escalated
  const result = items.map((r: any) => ({ ...r, isEscalated: shouldEscalate(r) }));
  res.json(result);
});

freelanceRequirementsRouter.post('/', requireRole(...REGULAR_ROLES), async (req: AuthedRequest, res) => {
  const {
    clientName, skillRequired, currentTrainer, clientTimings, trainersUsed,
    clientId, priority,
  } = req.body || {};
  if (!clientName || !skillRequired) {
    return res.status(400).json({ error: 'clientName and skillRequired are required' });
  }
  const item = await (prisma as any).freelanceRequirement.create({
    data: {
      clientName: clientName.trim(),
      skillRequired: skillRequired.trim(),
      currentTrainer: currentTrainer?.trim() || null,
      clientTimings: clientTimings?.trim() || null,
      trainersUsed: trainersUsed?.trim() || null,
      clientId: clientId || null,
      priority: priority || 'Medium',
      flaggedById: req.user!.id,
      lastUpdatedById: req.user!.id,
    },
    include,
  });
  await audit(req.user!.id, req.user!.name, 'FREELANCE_REQ_CREATE', `${clientName} · ${skillRequired}`);

  // Notify all recruiters about the new requirement
  try {
    const [fromUser, recruiters] = await Promise.all([getFromUser(), getRecruiters()]);
    if (fromUser && recruiters.length) {
      const rows = [
        ['Client', clientName],
        ['Skill required', skillRequired],
        ['Current trainer', currentTrainer || '—'],
        ['Client timings', clientTimings || '—'],
        ['Trainers tried', trainersUsed || '—'],
        ['Priority', priority || 'Medium'],
        ['Flagged by', req.user!.name],
      ];
      const tableRows = rows.map(([k, v]) =>
        `<tr><td style="padding:6px 12px;font-size:13px;color:#6b7280;white-space:nowrap;">${k}</td><td style="padding:6px 12px;font-size:13px;color:#111827;font-weight:500;">${v}</td></tr>`
      ).join('');
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
      <tr><td style="background:#1A1B1E;padding:24px 32px;border-radius:12px 12px 0 0;">
        <div style="font-size:18px;font-weight:700;color:#FBBF24;">MITS Consulting Hub</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px;">New Freelance Trainer Requirement</div>
      </td></tr>
      <tr><td style="padding:28px 32px;">
        <p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 16px;">A new trainer requirement has been raised</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;border-collapse:collapse;">
          ${tableRows}
        </table>
        <p style="font-size:13px;color:#6b7280;margin:20px 0 0;">Please log in to the Hub to review and source a suitable trainer.</p>
        <p style="margin:16px 0 0;"><a href="https://mits-frontend.onrender.com/freelance-requirements" style="display:inline-block;background:#FBBF24;color:#1A1B1E;font-weight:600;font-size:13px;padding:10px 20px;border-radius:6px;text-decoration:none;">View Requirements</a></p>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
        <div style="font-size:11px;color:#9ca3af;text-align:center;">MITS Solution · Internal notification</div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

      for (const r of recruiters) {
        await sendEmail({
          fromUser,
          to: r.email,
          subject: `New trainer requirement: ${skillRequired} for ${clientName}`,
          body: `New trainer requirement raised by ${req.user!.name}: ${skillRequired} for ${clientName}. Priority: ${priority || 'Medium'}.`,
          htmlBody: html,
        });
      }
    }
  } catch (e: any) {
    console.warn('[freelance-req-notify] email failed (non-fatal):', e?.message);
  }

  res.status(201).json(item);
});

freelanceRequirementsRouter.patch('/:id', requireRole(...REGULAR_ROLES), async (req: AuthedRequest, res) => {
  const REGULAR_FIELDS = ['clientName', 'skillRequired', 'currentTrainer', 'clientTimings', 'trainersUsed', 'status', 'priority', 'clientId'];
  const FREELANCE_FIELDS = ['trainerName', 'trainerRecording', 'trainerTimings', 'trainerPhone', 'trainerEmail'];

  const data: any = { lastUpdatedById: req.user!.id };
  for (const f of [...REGULAR_FIELDS, ...FREELANCE_FIELDS]) {
    if (f in req.body) data[f] = req.body[f];
  }

  const item = await (prisma as any).freelanceRequirement.update({
    where: { id: req.params.id },
    data,
    include,
  });
  res.json({ ...item, isEscalated: shouldEscalate(item) });
});

freelanceRequirementsRouter.delete('/:id', requireRole('founder', 'manager', 'lead'), async (req: AuthedRequest, res) => {
  await (prisma as any).freelanceRequirement.delete({ where: { id: req.params.id } });
  await audit(req.user!.id, req.user!.name, 'FREELANCE_REQ_DELETE', req.params.id);
  res.json({ ok: true });
});

// Comments
freelanceRequirementsRouter.post('/:id/comments', requireRole(...REGULAR_ROLES), async (req: AuthedRequest, res) => {
  const { body } = req.body || {};
  if (!body?.trim()) return res.status(400).json({ error: 'body required' });
  const comment = await (prisma as any).freelanceRequirementComment.create({
    data: {
      requirementId: req.params.id,
      authorId: req.user!.id,
      authorName: req.user!.name,
      body: body.trim().slice(0, 2000),
    },
  });
  res.status(201).json(comment);
});
