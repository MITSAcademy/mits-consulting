import { Router } from 'express';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';

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
