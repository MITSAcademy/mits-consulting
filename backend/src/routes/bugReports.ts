import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { notify } from '../lib/notify';

export const bugReportsRouter = Router();
bugReportsRouter.use(requireAuth);

// POST /api/bug-reports — submit a bug report
bugReportsRouter.post('/', async (req: AuthedRequest, res) => {
  const { description, url, screenshot } = req.body;
  if (!description?.trim()) return res.status(400).json({ error: 'Description required' });

  const user = req.user!;
  const today = new Date().toISOString().slice(0, 10);

  // Create bug report
  const bug = await prisma.bugReport.create({
    data: {
      reportedById: user.id,
      url: url || '',
      role: user.role,
      description: description.trim(),
      screenshot: screenshot || null,
    },
  });

  // Also create an IssueTracker entry so it shows up in the Issues page
  const issue = await prisma.issueTracker.create({
    data: {
      date: today,
      coordinatorId: user.id,
      coordinatorName: user.name,
      title: `[BUG] ${description.trim().slice(0, 80)}`,
      description: `Reported by ${user.name} (${user.role}) at ${url}\n\n${description.trim()}`,
      status: 'Open',
    },
  });

  // Update bug with linked issue
  await prisma.bugReport.update({ where: { id: bug.id }, data: { issueId: issue.id } });

  // Notify founder(s)
  const founders = await prisma.user.findMany({ where: { role: 'founder', active: true }, select: { id: true } });
  for (const f of founders) {
    await notify({
      userId: f.id,
      kind: 'bug_report',
      title: `🐛 Bug reported by ${user.name}`,
      body: description.trim().slice(0, 120),
      link: '/issues',
    });
  }

  // Fire webhook for auto-fix (non-blocking)
  const webhookUrl = process.env.AUTOFIX_WEBHOOK_URL;
  if (webhookUrl) {
    const crypto = await import('crypto');
    const payload = JSON.stringify({ bugId: bug.id, description: bug.description, url: bug.url, role: bug.role, reportedBy: user.name });
    const sig = crypto.createHmac('sha256', process.env.AUTOFIX_WEBHOOK_SECRET || '').update(payload).digest('hex');
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-MITS-Signature': sig },
      body: payload,
    }).catch((e) => console.warn('[bug-report] webhook failed:', e.message));
  }

  res.json({ ok: true, bugId: bug.id, issueId: issue.id });
});

// PATCH /api/bug-reports/:id — update status/fixCommit (founder only)
bugReportsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const { status, fixCommit } = req.body;
  const bug = await prisma.bugReport.update({
    where: { id: req.params.id },
    data: { status, fixCommit },
  });
  res.json(bug);
});

// GET /api/bug-reports — list (founder only)
bugReportsRouter.get('/', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Forbidden' });
  const bugs = await prisma.bugReport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { reportedBy: { select: { name: true, role: true } } },
  });
  res.json(bugs);
});
