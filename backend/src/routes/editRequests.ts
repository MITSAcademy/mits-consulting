import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const editRequestsRouter = Router();
editRequestsRouter.use(requireAuth);

editRequestsRouter.get('/', requireRole('founder', 'demo_lead', 'manager'), async (_req, res) => {
  const items = await prisma.editRequest.findMany({
    include: {
      requestedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(items);
});

editRequestsRouter.post('/', async (req: AuthedRequest, res) => {
  const { entity, entityId, category, field, oldValue, newValue, reason } = req.body;
  if (!entity || !entityId || !field) return res.status(400).json({ error: 'entity, entityId, field required' });
  const r = await prisma.editRequest.create({
    data: {
      entity, entityId, category: category || 'unknown', field,
      oldValue: oldValue?.toString() || null,
      newValue: newValue?.toString() || null,
      reason: reason || null,
      requestedById: req.user!.id,
      status: 'Pending',
    },
  });
  await audit(req.user!.id, req.user!.name, 'EDIT_REQUEST', `${entity}/${field}`);
  res.status(201).json(r);
});

// Approver can only write fields in these whitelists. Without this, the
// requester could craft an EditRequest for ANY field (passwordHash, lifecycle,
// freshPaymentReceived, googleRefreshToken, …) and a clicker would approve it
// without realizing what they were authorizing.
const CLIENT_EDITABLE = new Set<string>([
  'name', 'email', 'phoneCode', 'phoneDigits', 'whatsappGroupName', 'whatsappGroupLink',
  'country', 'engagementType', 'paymentModel', 'currency', 'cycleAmount',
  'feedbackDay', 'preferredTimeIst', 'sessionsPerCycle',
  'intakeSkillHint', 'notes',
]);
const TRAINER_EDITABLE = new Set<string>([
  'name', 'email', 'phoneCode', 'phoneDigits', 'whatsappGroupLink', 'whatsappGroupName',
  'skills', 'experienceYears', 'defaultRateInr', 'rateModel',
  'paymentMethod', 'bankAccount', 'upiId',
  'notes', 'active',
]);

// Coerce string newValue (EditRequest stores everything as text) to a typed
// value Prisma will accept. Returns the input unchanged for string fields.
function coerceValue(entity: string, field: string, raw: string | null): any {
  if (raw === null || raw === undefined) return null;
  // Booleans
  if (['active'].includes(field)) {
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
  }
  // Ints
  if (['cycleAmount', 'experienceYears', 'defaultRateInr', 'sessionsPerCycle', 'feedbackDay'].includes(field)) {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.trunc(n);
    throw new Error(`Cannot coerce "${raw}" to a number for ${field}.`);
  }
  return raw;
}

editRequestsRouter.post('/:id/approve', requireRole('founder', 'demo_lead', 'manager'), async (req: AuthedRequest, res) => {
  const r = await prisma.editRequest.findUnique({ where: { id: req.params.id } });
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (r.status !== 'Pending') return res.status(409).json({ error: 'Already reviewed' });

  // Validate field against the per-entity whitelist before applying.
  const whitelist = r.entity === 'client' ? CLIENT_EDITABLE
                  : r.entity === 'trainer' ? TRAINER_EDITABLE
                  : null;
  if (!whitelist) {
    return res.status(400).json({ error: `Unknown entity "${r.entity}". Approve only supports client / trainer.` });
  }
  if (!whitelist.has(r.field)) {
    return res.status(403).json({
      error: `Field "${r.field}" is not approvable on ${r.entity}. Allowed: ${[...whitelist].join(', ')}.`,
    });
  }

  let typedValue: any;
  try {
    typedValue = coerceValue(r.entity, r.field, r.newValue);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }

  const data: any = { [r.field]: typedValue };
  try {
    if (r.entity === 'client') await prisma.client.update({ where: { id: r.entityId }, data });
    if (r.entity === 'trainer') await prisma.trainer.update({ where: { id: r.entityId }, data });
  } catch (e: any) {
    return res.status(400).json({ error: 'Failed to apply: ' + e.message });
  }

  const updated = await prisma.editRequest.update({
    where: { id: r.id },
    data: { status: 'Approved', reviewedById: req.user!.id, reviewedAt: new Date() },
  });
  await audit(req.user!.id, req.user!.name, 'EDIT_APPROVE', `${r.entity}/${r.field}`);
  res.json(updated);
});

editRequestsRouter.post('/:id/reject', requireRole('founder', 'demo_lead', 'manager'), async (req: AuthedRequest, res) => {
  const updated = await prisma.editRequest.update({
    where: { id: req.params.id },
    data: { status: 'Rejected', reviewedById: req.user!.id, reviewedAt: new Date() },
  });
  await audit(req.user!.id, req.user!.name, 'EDIT_REJECT', req.params.id);
  res.json(updated);
});
