/**
 * Per-client / per-trainer comment threads.
 * Any team member with read access can post a comment.
 * Comments are permanent — no delete (unless founder).
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';

export const commentsRouter = Router();
commentsRouter.use(requireAuth);

// GET /comments?clientId=xxx   OR   ?trainerId=xxx
commentsRouter.get('/', async (req: AuthedRequest, res) => {
  const { clientId, trainerId } = req.query as Record<string, string>;
  if (!clientId && !trainerId) {
    return res.status(400).json({ error: 'clientId or trainerId required' });
  }
  const where = clientId ? { clientId } : { trainerId };
  const comments = await (prisma as any).comment.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, body: true, authorId: true, authorName: true,
      pinned: true, createdAt: true,
    },
  });
  res.json(comments);
});

// POST /comments
commentsRouter.post('/', async (req: AuthedRequest, res) => {
  const { clientId, trainerId, body } = req.body || {};
  if (!body || typeof body !== 'string' || !body.trim()) {
    return res.status(400).json({ error: 'body required' });
  }
  if (!clientId && !trainerId) {
    return res.status(400).json({ error: 'clientId or trainerId required' });
  }
  const comment = await (prisma as any).comment.create({
    data: {
      clientId: clientId || undefined,
      trainerId: trainerId || undefined,
      authorId: req.user!.id,
      authorName: req.user!.name,
      body: body.trim().slice(0, 2000),
    },
    select: {
      id: true, body: true, authorId: true, authorName: true,
      pinned: true, createdAt: true,
    },
  });
  res.json(comment);
});

// PATCH /comments/:id/pin  (founder only)
commentsRouter.patch('/:id/pin', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Founders only' });
  const { pinned } = req.body || {};
  const c = await (prisma as any).comment.update({
    where: { id: req.params.id },
    data: { pinned: !!pinned },
    select: { id: true, pinned: true },
  });
  res.json(c);
});

// DELETE /comments/:id  (founder or own comment within 5 mins)
commentsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const c = await (prisma as any).comment.findUnique({
    where: { id: req.params.id },
    select: { id: true, authorId: true, createdAt: true },
  });
  if (!c) return res.status(404).json({ error: 'Not found' });
  const isOwn = c.authorId === req.user!.id;
  const ageMs = Date.now() - new Date(c.createdAt).getTime();
  const canDelete = req.user!.role === 'founder' || (isOwn && ageMs < 5 * 60 * 1000);
  if (!canDelete) return res.status(403).json({ error: 'Cannot delete this comment' });
  await (prisma as any).comment.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
