import { Router } from 'express';
import { requireAuth } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { checkPermission } from '../lib/rolePermissions';

export const retrospectiveRouter = Router();
retrospectiveRouter.use(requireAuth);

// GET /retrospective — list all, newest first
retrospectiveRouter.get('/', async (req: any, res) => {
  if (!await checkPermission('sessions.retrospective', req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  const rows = await prisma.retrospective.findMany({
    orderBy: { removedAt: 'desc' },
    include: {
      removedBy: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  });
  res.json(rows);
});

// POST /retrospective — create entry (called on remove)
retrospectiveRouter.post('/', async (req: any, res) => {
  if (!await checkPermission('sessions.retrospective', req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  const { sourceType, sourceId, clientName, trainerName, reason, sessionDate } = req.body;
  if (!sourceType || !clientName) return res.status(400).json({ error: 'sourceType and clientName required' });
  const entry = await prisma.retrospective.create({
    data: {
      sourceType,
      sourceId: sourceId || null,
      clientName,
      trainerName: trainerName || null,
      reason: reason || null,
      sessionDate: sessionDate || null,
      removedById: req.user.id,
    },
  });
  res.json(entry);
});

// DELETE /retrospective/:id — lead/manager/founder
retrospectiveRouter.delete('/:id', async (req: any, res) => {
  const role = req.user.role;
  if (!['founder', 'manager', 'lead'].includes(role)) return res.status(403).json({ error: 'Forbidden' });
  await prisma.retrospective.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// DELETE /retrospective/purge-duplicates — delete all rows with reason "Duplicate"
retrospectiveRouter.delete('/purge-duplicates', async (req: any, res) => {
  const role = req.user.role;
  if (!['founder', 'manager', 'lead'].includes(role)) return res.status(403).json({ error: 'Forbidden' });
  const { count } = await prisma.retrospective.deleteMany({ where: { reason: 'Duplicate' } });
  res.json({ ok: true, deleted: count });
});

// PATCH /retrospective/:id — update reason, owner, comments
retrospectiveRouter.patch('/:id', async (req: any, res) => {
  if (!await checkPermission('sessions.retrospective', req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  const { reason, ownerId, comments } = req.body;
  const entry = await prisma.retrospective.update({
    where: { id: req.params.id },
    data: {
      ...(reason !== undefined && { reason }),
      ...(ownerId !== undefined && { ownerId: ownerId || null }),
      ...(comments !== undefined && { comments }),
    },
    include: {
      removedBy: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  });
  res.json(entry);
});
