import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const brainNotesRouter = Router();
brainNotesRouter.use(requireAuth);

// GET / — list notes visible to the requester
brainNotesRouter.get('/', async (req: AuthedRequest, res) => {
  const user = req.user!;
  const { category, tag, search, pinned } = req.query as any;

  // Founder sees all; others see notes where their role is in visibleTo
  const where: any = user.role === 'founder' ? {} : {
    visibleTo: { has: user.role },
  };

  if (category) where.category = category;
  if (pinned === 'true') where.isPinned = true;
  if (tag) where.tags = { has: tag };
  if (search) where.OR = [
    { title: { contains: search, mode: 'insensitive' } },
    { content: { contains: search, mode: 'insensitive' } },
  ];

  const notes = await prisma.brainNote.findMany({
    where,
    include: { author: { select: { id: true, name: true } } },
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
  });
  res.json(notes);
});

// GET /:id — single note (founder always; others if role in visibleTo)
brainNotesRouter.get('/:id', async (req: AuthedRequest, res) => {
  const user = req.user!;
  const note = await prisma.brainNote.findUnique({
    where: { id: req.params.id },
    include: { author: { select: { id: true, name: true } } },
  });
  if (!note) return res.status(404).json({ error: 'Not found' });
  if (user.role !== 'founder' && !note.visibleTo.includes(user.role)) {
    return res.status(403).json({ error: 'Not visible to your role' });
  }
  res.json(note);
});

// POST / — create note (founder only)
brainNotesRouter.post('/', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only Vaibhav can create notes' });
  const { title, content, category, tags, visibleTo, isPinned } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  const note = await prisma.brainNote.create({
    data: {
      title: title.trim(),
      content: content || '',
      category: category || 'general',
      tags: Array.isArray(tags) ? tags : [],
      visibleTo: Array.isArray(visibleTo) ? visibleTo : [],
      isPinned: !!isPinned,
      authorId: req.user!.id,
    },
    include: { author: { select: { id: true, name: true } } },
  });
  await audit(req.user!.id, req.user!.name, 'BRAIN_NOTE_CREATE', note.title);
  res.status(201).json(note);
});

// PATCH /:id — update note (founder only)
brainNotesRouter.patch('/:id', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only Vaibhav can edit notes' });
  const { title, content, category, tags, visibleTo, isPinned } = req.body;
  const data: any = {};
  if (title !== undefined) data.title = title.trim();
  if (content !== undefined) data.content = content;
  if (category !== undefined) data.category = category;
  if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : [];
  if (visibleTo !== undefined) data.visibleTo = Array.isArray(visibleTo) ? visibleTo : [];
  if (isPinned !== undefined) data.isPinned = !!isPinned;
  const note = await prisma.brainNote.update({
    where: { id: req.params.id },
    data,
    include: { author: { select: { id: true, name: true } } },
  });
  await audit(req.user!.id, req.user!.name, 'BRAIN_NOTE_UPDATE', note.title);
  res.json(note);
});

// DELETE /:id — delete note (founder only)
brainNotesRouter.delete('/:id', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only Vaibhav can delete notes' });
  const note = await prisma.brainNote.findUnique({ where: { id: req.params.id }, select: { title: true } });
  if (!note) return res.status(404).json({ error: 'Not found' });
  await prisma.brainNote.delete({ where: { id: req.params.id } });
  await audit(req.user!.id, req.user!.name, 'BRAIN_NOTE_DELETE', note.title);
  res.json({ ok: true });
});
