import { Router } from 'express';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { sendEmail, safeBuildFromUser } from '../lib/mailer';

async function getFromUser() {
  // Try Vaibhav first; if his SMTP isn't configured, fall back to any configured user
  const users = await prisma.user.findMany({
    where: { smtpAppPassword: { not: null }, active: true },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
    orderBy: [{ id: 'asc' }],
  });
  // Prefer Vaibhav
  const preferred = users.find((u: any) => u.id === 'u-vaibhav') || users[0];
  return preferred ? safeBuildFromUser(preferred) : null;
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
const READ_ROLES = [...REGULAR_ROLES, 'recruiter'];

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

freelanceRequirementsRouter.get('/', requireRole(...READ_ROLES), async (_req, res) => {
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
    console.error('[freelance-req-notify] email failed (non-fatal):', e?.message, e?.stack);
  }

  res.status(201).json(item);
});

freelanceRequirementsRouter.patch('/:id', requireRole(...READ_ROLES), async (req: AuthedRequest, res) => {
  const REGULAR_FIELDS = ['clientName', 'skillRequired', 'currentTrainer', 'clientTimings', 'trainersUsed', 'status', 'priority', 'clientId'];
  const FREELANCE_FIELDS = ['trainerName', 'trainerRecording', 'trainerTimings', 'trainerPhone', 'trainerEmail'];

  const isRecruiter = req.user!.role === 'recruiter';
  const allowedFields = isRecruiter ? FREELANCE_FIELDS : [...REGULAR_FIELDS, ...FREELANCE_FIELDS];

  const data: any = { lastUpdatedById: req.user!.id };
  for (const f of allowedFields) {
    if (f in req.body) data[f] = req.body[f];
  }

  const item = await (prisma as any).freelanceRequirement.update({
    where: { id: req.params.id },
    data,
    include,
  });
  res.json({ ...item, isEscalated: shouldEscalate(item) });
});

// POST /:id/proposals — add/replace the full proposals array (recruiter or above)
freelanceRequirementsRouter.post('/:id/proposals', requireRole(...READ_ROLES), async (req: AuthedRequest, res) => {
  const { proposals } = req.body;
  if (!Array.isArray(proposals)) return res.status(400).json({ error: 'proposals array required' });

  // Each proposal: { trainerName, trainerPhone, trainerEmail, trainerRecording, trainerTimings, notes, experience, payment, paymentReleaseDate, paymentStatus }
  const clean = proposals.map((p: any) => ({
    trainerName: p.trainerName?.trim() || null,
    trainerPhone: p.trainerPhone?.trim() || null,
    trainerEmail: p.trainerEmail?.trim() || null,
    trainerRecording: p.trainerRecording?.trim() || null,
    trainerTimings: p.trainerTimings?.trim() || null,
    notes: p.notes?.trim() || null,
    experience: p.experience?.trim() || null,
    payment: p.payment != null && !isNaN(Number(p.payment)) ? Number(p.payment) : null,
    paymentReleaseDate: p.paymentReleaseDate?.trim() || null,
    paymentStatus: p.paymentStatus?.trim() || null,
    addedByName: req.user!.name,
    addedAt: new Date().toISOString(),
  }));

  // Fetch existing to merge (append mode)
  const existing = await (prisma as any).freelanceRequirement.findUnique({
    where: { id: req.params.id }, select: { proposals: true },
  });
  const prev = Array.isArray(existing?.proposals) ? existing.proposals : [];
  const merged = [...prev, ...clean];

  const data: any = { proposals: merged, lastUpdatedById: req.user!.id };
  // Mirror first trainer into legacy fields for backward compat
  if (merged[0]?.trainerName) {
    data.trainerName = merged[0].trainerName;
    data.trainerPhone = merged[0].trainerPhone || null;
    data.trainerEmail = merged[0].trainerEmail || null;
    data.trainerRecording = merged[0].trainerRecording || null;
    data.trainerTimings = merged[0].trainerTimings || null;
  }

  const item = await (prisma as any).freelanceRequirement.update({
    where: { id: req.params.id }, data, include,
  });
  await audit(req.user!.id, req.user!.name, 'FREELANCE_PROPOSALS', `${req.params.id} · ${clean.length} added`);
  res.json({ ...item, isEscalated: shouldEscalate(item) });
});

// DELETE /:id/proposals/:idx — remove one proposal by index
freelanceRequirementsRouter.delete('/:id/proposals/:idx', requireRole(...READ_ROLES), async (req: AuthedRequest, res) => {
  const idx = parseInt(req.params.idx, 10);
  const existing = await (prisma as any).freelanceRequirement.findUnique({
    where: { id: req.params.id }, select: { proposals: true },
  });
  const prev = Array.isArray(existing?.proposals) ? existing.proposals : [];
  if (idx < 0 || idx >= prev.length) return res.status(400).json({ error: 'Invalid proposal index' });
  const updated = prev.filter((_: any, i: number) => i !== idx);

  const data: any = { proposals: updated, lastUpdatedById: req.user!.id };
  if (updated.length === 0) {
    data.trainerName = null; data.trainerPhone = null;
    data.trainerEmail = null; data.trainerRecording = null; data.trainerTimings = null;
  } else if (updated[0]?.trainerName) {
    data.trainerName = updated[0].trainerName;
    data.trainerPhone = updated[0].trainerPhone || null;
    data.trainerEmail = updated[0].trainerEmail || null;
  }

  const item = await (prisma as any).freelanceRequirement.update({
    where: { id: req.params.id }, data, include,
  });
  res.json({ ...item, isEscalated: shouldEscalate(item) });
});

// POST /:id/proposals/:idx/notify — send email to trainer about the requirement
freelanceRequirementsRouter.post('/:id/proposals/:idx/notify', requireRole(...READ_ROLES), async (req: AuthedRequest, res) => {
  const idx = parseInt(req.params.idx, 10);
  const req2 = await (prisma as any).freelanceRequirement.findUnique({
    where: { id: req.params.id }, select: { proposals: true, clientName: true, skillRequired: true, clientTimings: true },
  });
  if (!req2) return res.status(404).json({ error: 'Requirement not found' });
  const proposals = Array.isArray(req2.proposals) ? req2.proposals : [];
  if (idx < 0 || idx >= proposals.length) return res.status(400).json({ error: 'Invalid proposal index' });

  const p = proposals[idx] as any;
  if (!p.trainerEmail) return res.status(400).json({ error: 'No email address on this trainer proposal' });

  const fromUser = await getFromUser();
  if (!fromUser) return res.status(503).json({ error: 'No SMTP sender configured' });

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
      <tr><td style="background:#1A1B1E;padding:24px 32px;border-radius:12px 12px 0 0;">
        <div style="font-size:18px;font-weight:700;color:#FBBF24;">MITS Consulting Hub</div>
        <div style="font-size:12px;color:#9ca3af;margin-top:2px;">Training Opportunity</div>
      </td></tr>
      <tr><td style="padding:28px 32px;">
        <p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 12px;">Hi ${p.trainerName || 'Trainer'},</p>
        <p style="font-size:14px;color:#374151;margin:0 0 16px;">We have a training opportunity that matches your profile. Please find the details below:</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;border-collapse:collapse;">
          <tr><td style="padding:8px 14px;font-size:13px;color:#6b7280;white-space:nowrap;border-bottom:1px solid #f3f4f6;">Skill Required</td><td style="padding:8px 14px;font-size:13px;color:#111827;font-weight:500;border-bottom:1px solid #f3f4f6;">${req2.skillRequired}</td></tr>
          <tr><td style="padding:8px 14px;font-size:13px;color:#6b7280;white-space:nowrap;border-bottom:1px solid #f3f4f6;">Client</td><td style="padding:8px 14px;font-size:13px;color:#111827;font-weight:500;border-bottom:1px solid #f3f4f6;">${req2.clientName}</td></tr>
          ${req2.clientTimings ? `<tr><td style="padding:8px 14px;font-size:13px;color:#6b7280;white-space:nowrap;">Client Timings</td><td style="padding:8px 14px;font-size:13px;color:#111827;font-weight:500;">${req2.clientTimings}</td></tr>` : ''}
        </table>
        <p style="font-size:13px;color:#6b7280;margin:20px 0 0;">If you're interested, please reply to this email or contact us at your earliest convenience.</p>
        <p style="font-size:13px;color:#6b7280;margin:8px 0 0;">— ${req.user!.name}, MITS Consulting</p>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
        <div style="font-size:11px;color:#9ca3af;text-align:center;">MITS Solution · Internal notification</div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

  await sendEmail({
    fromUser,
    to: p.trainerEmail,
    subject: `Training opportunity: ${req2.skillRequired} — MITS Consulting`,
    body: `Hi ${p.trainerName || 'Trainer'}, we have a training opportunity for ${req2.skillRequired} for client ${req2.clientName}. Please reply if interested.`,
    htmlBody: html,
  });
  await audit(req.user!.id, req.user!.name, 'FREELANCE_TRAINER_NOTIFY', `${req.params.id} · ${p.trainerEmail}`);
  res.json({ ok: true });
});

// POST /:id/re-raise — clone a requirement for the next day, preserving all details
// Proposals are cleared so the recruiter team starts fresh sourcing.
freelanceRequirementsRouter.post('/:id/re-raise', requireRole(...REGULAR_ROLES), async (req: AuthedRequest, res) => {
  const source = await (prisma as any).freelanceRequirement.findUnique({
    where: { id: req.params.id },
  });
  if (!source) return res.status(404).json({ error: 'Requirement not found' });

  const clone = await (prisma as any).freelanceRequirement.create({
    data: {
      clientName:       source.clientName,
      skillRequired:    source.skillRequired,
      currentTrainer:   source.currentTrainer,
      clientTimings:    source.clientTimings,
      trainersUsed:     source.trainersUsed,
      clientId:         source.clientId,
      priority:         source.priority,
      status:           'Open',
      isEscalated:      false,
      proposals:        [],
      flaggedById:      req.user!.id,
      lastUpdatedById:  req.user!.id,
    },
    include,
  });

  await audit(req.user!.id, req.user!.name, 'FREELANCE_REQ_RERAISE', `${source.clientName} · cloned from ${source.id}`);

  // Notify recruiters (To), raiser + their manager (CC) about the re-raised requirement
  try {
    const [fromUser, recruiters] = await Promise.all([getFromUser(), getRecruiters()]);
    if (fromUser && recruiters.length) {
      // Fetch raiser + their manager for CC
      const raiser = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { email: true, gmailAddress: true, reportsToId: true },
      });
      const raiserEmail = raiser?.gmailAddress || raiser?.email || null;
      let managerEmail: string | null = null;
      if (raiser?.reportsToId) {
        const mgr = await prisma.user.findUnique({
          where: { id: raiser.reportsToId },
          select: { email: true, gmailAddress: true },
        });
        managerEmail = mgr?.gmailAddress || mgr?.email || null;
      }
      const ccList = [raiserEmail, managerEmail].filter((e): e is string => !!e);

      const rows = [
        ['Client', source.clientName],
        ['Skill required', source.skillRequired],
        ['Current trainer', source.currentTrainer || '—'],
        ['Client timings', source.clientTimings || '—'],
        ['Trainers tried', source.trainersUsed || '—'],
        ['Priority', source.priority || 'Medium'],
        ['Re-raised by', req.user!.name],
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
        <div style="font-size:12px;color:#9ca3af;margin-top:2px;">Trainer Requirement Re-Raised</div>
      </td></tr>
      <tr><td style="padding:28px 32px;">
        <p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 8px;">A requirement has been re-raised for today</p>
        <p style="font-size:13px;color:#6b7280;margin:0 0 16px;">This requirement was not fulfilled and has been re-posted. Please source a trainer as soon as possible.</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;border-collapse:collapse;">
          ${tableRows}
        </table>
        <p style="margin:20px 0 0;"><a href="https://mits-frontend.onrender.com/freelance-requirements" style="display:inline-block;background:#FBBF24;color:#1A1B1E;font-weight:600;font-size:13px;padding:10px 20px;border-radius:6px;text-decoration:none;">View Requirements</a></p>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;">
        <div style="font-size:11px;color:#9ca3af;text-align:center;">MITS Solution · Internal notification</div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

      // Send one email: first recruiter in To, rest + raiser + manager in CC
      const [primaryTo, ...ccRecruiters] = recruiters.map((r: any) => r.email);
      await sendEmail({
        fromUser,
        to: primaryTo,
        cc: [...ccRecruiters, ...ccList],
        subject: `Re-raised requirement: ${source.skillRequired} for ${source.clientName}`,
        body: `Requirement re-raised by ${req.user!.name}: ${source.skillRequired} for ${source.clientName}.`,
        htmlBody: html,
      });
    }
  } catch (e: any) {
    console.error('[freelance-reraise-notify] email failed (non-fatal):', e?.message);
  }

  res.status(201).json(clone);
});

freelanceRequirementsRouter.delete('/:id', requireRole('founder', 'manager', 'lead'), async (req: AuthedRequest, res) => {
  await (prisma as any).freelanceRequirement.delete({ where: { id: req.params.id } });
  await audit(req.user!.id, req.user!.name, 'FREELANCE_REQ_DELETE', req.params.id);
  res.json({ ok: true });
});

// Comments
freelanceRequirementsRouter.post('/:id/comments', requireRole(...READ_ROLES), async (req: AuthedRequest, res) => {
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
