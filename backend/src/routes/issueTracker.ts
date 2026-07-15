import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const issueTrackerRouter = Router();
issueTrackerRouter.use(requireAuth);

const READ_ROLES  = ['founder', 'manager', 'lead', 'account_manager', 'demo_lead', 'demo_intake'];
const WRITE_ROLES = ['founder', 'manager', 'lead', 'account_manager'];
const ADMIN_ROLES = ['founder', 'manager', 'lead'];

const include = {
  client:   { select: { id: true, name: true } },
  trainer:  { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
};

// GET / — list all issues
issueTrackerRouter.get('/', async (req: AuthedRequest, res) => {
  if (!READ_ROLES.includes(req.user!.role)) return res.status(403).json({ error: 'Forbidden' });

  const { status, coordinatorId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

  const where: any = {};
  if (status)        where.status = status;
  if (coordinatorId) where.coordinatorId = coordinatorId;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = dateFrom;
    if (dateTo)   where.date.lte = dateTo;
  }

  const issues = await prisma.issueTracker.findMany({
    where,
    include,
    orderBy: { createdAt: 'desc' },
  });
  res.json(issues);
});

// POST / — create new issue
issueTrackerRouter.post('/', async (req: AuthedRequest, res) => {
  if (!WRITE_ROLES.includes(req.user!.role)) return res.status(403).json({ error: 'Forbidden' });

  const { title, date, coordinatorId, coordinatorName, clientId, trainerId, description, status } = req.body || {};

  if (!title) return res.status(400).json({ error: 'title is required' });
  if (!date)  return res.status(400).json({ error: 'date is required' });

  const issue = await prisma.issueTracker.create({
    data: {
      title,
      date,
      coordinatorId:   coordinatorId   ?? req.user!.id,
      coordinatorName: coordinatorName ?? req.user!.name,
      ...(clientId    ? { clientId }    : {}),
      ...(trainerId   ? { trainerId }   : {}),
      ...(description ? { description } : {}),
      ...(status      ? { status }      : {}),
    },
    include,
  });

  await audit(req.user!.id, req.user!.name, 'ISSUE_CREATE', title);
  res.status(201).json(issue);
});

// PATCH /:id — update issue
issueTrackerRouter.patch('/:id', async (req: AuthedRequest, res) => {
  if (!WRITE_ROLES.includes(req.user!.role)) return res.status(403).json({ error: 'Forbidden' });

  const ALLOWED_FIELDS = [
    'title', 'description', 'status', 'resolutionNotes',
    'closedById', 'closedAt', 'clientId', 'trainerId',
  ];

  const data: any = {};
  for (const f of ALLOWED_FIELDS) {
    if (f in req.body) data[f] = req.body[f];
  }

  // Auto-close: set closedById + closedAt when status moves to Closed/Resolved
  if (data.status === 'Closed' || data.status === 'Resolved') {
    if (!data.closedById) data.closedById = req.user!.id;
    if (!data.closedAt)   data.closedAt   = new Date();
  }

  const issue = await prisma.issueTracker.update({
    where: { id: req.params.id },
    data,
    include,
  });

  await audit(req.user!.id, req.user!.name, 'ISSUE_UPDATE', issue.title);
  res.json(issue);
});

// DELETE /:id — founder/manager/lead
issueTrackerRouter.delete('/:id', async (req: AuthedRequest, res) => {
  if (!ADMIN_ROLES.includes(req.user!.role)) return res.status(403).json({ error: 'Forbidden' });

  const issue = await prisma.issueTracker.findUnique({ where: { id: req.params.id }, select: { title: true } });
  if (!issue) return res.status(404).json({ error: 'Not found' });

  await prisma.issueTracker.delete({ where: { id: req.params.id } });
  await audit(req.user!.id, req.user!.name, 'ISSUE_DELETE', issue.title);
  res.json({ ok: true });
});

// DELETE /purge-all — founder only, wipes all issue tracker entries
issueTrackerRouter.delete('/purge-all', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Founder only' });
  const { count } = await prisma.issueTracker.deleteMany({});
  await audit(req.user!.id, req.user!.name, 'ISSUE_PURGE_ALL', `Deleted ${count} issues`);
  res.json({ ok: true, deleted: count });
});
