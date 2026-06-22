import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import prisma from '../lib/prisma';

export const retrospectiveRouter = Router();
retrospectiveRouter.use(requireAuth);

const ALLOWED = ['founder', 'manager', 'lead', 'account_manager'];

function canAccess(role: string) {
  return ALLOWED.includes(role);
}

// GET /retrospective — list all, newest first
retrospectiveRouter.get('/', async (req: any, res) => {
  if (!canAccess(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
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
  if (!canAccess(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
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

// PATCH /retrospective/:id — update reason, owner, comments
retrospectiveRouter.patch('/:id', async (req: any, res) => {
  if (!canAccess(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
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
