import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';
import { askAi, getConfiguredProvider } from '../lib/aiProvider';
import { buildMitsContext } from '../lib/aiContext';

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

// POST /ask — AI chat using notes as knowledge base
brainNotesRouter.post('/ask', async (req: AuthedRequest, res) => {
  const { message, history } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  const cfg = getConfiguredProvider();
  if (!cfg) {
    return res.status(503).json({ error: 'AI not configured', code: 'NO_AI_PROVIDER' });
  }

  const user = req.user!;

  // Fetch notes visible to the user
  const notesWhere: any = user.role === 'founder'
    ? {}
    : { visibleTo: { has: user.role } };

  const [notes, liveContext] = await Promise.all([
    prisma.brainNote.findMany({
      where: notesWhere,
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      take: 60,
    }),
    buildMitsContext(user).catch(() => ''),
  ]);

  // Build notes knowledge block
  const notesBlock = notes.length === 0
    ? '(No notes in the knowledge base yet)'
    : notes.map((n) =>
        `### ${n.title} [${n.category}${n.isPinned ? ', pinned' : ''}]\n${n.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`
      ).join('\n\n');

  const systemPrompt = `You are the Second Brain assistant for MITS Consulting — an AI guide powered by Vaibhav's personal knowledge base, portal SOPs, and live operational data.

The user asking is: ${user.name} (role: ${user.role}).

## Vaibhav's Knowledge Base (${notes.length} notes)
${notesBlock}

## Portal Processes & SOPs
MITS runs a training-and-consulting operation. The client lifecycle:
  Lead → IntakeReceived → WithRecruiters → VerificationPending → TrainerMatched → DemoScheduled → DemoDone → FeedbackPending → SaleClosing → SaleWon → Active → Completed.
  Side states: Dormant, Hold, Churned, InternalSearch.

Roshni's 7-step SaleClosing: 1) Checklist 2) Engagement letter 3) Payment WA 4) Record payment 5) Confirmation 6) Group rename 7) Mitali handover.
Win outcomes: Training-Paid, JBT-Paid, Training-EmployerLater, JBT-EmployerLater. Plus CP (closure pending) and C (not starting).

## Live Snapshot
${liveContext}

## Instructions
- Answer questions using the knowledge base above as primary context.
- When the question is about processes or SOPs, cite which note or process you're drawing from.
- When the question is about live data, use the snapshot.
- Be concise but complete. Use bullet points when listing steps or items.
- If you don't know something, say so clearly rather than guessing.`;

  try {
    const result = await askAi({
      systemPrompt,
      question: message,
      history: Array.isArray(history) ? history : [],
      maxTokens: 1200,
    });
    res.json({ answer: result.answer, provider: result.provider, model: result.model });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI error' });
  }
});
