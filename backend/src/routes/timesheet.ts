import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const timesheetRouter = Router();
timesheetRouter.use(requireAuth);

const CAN_MANAGE_CODES = ['founder', 'manager', 'demo_lead'];
const CAN_VIEW_ALL = ['founder', 'manager', 'demo_lead'];
const CAN_APPROVE = ['manager'];
const CANNOT_FILL = ['founder'];

function isValidDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

// GET /timesheet/job-codes — all job codes (active + inactive for managers, active only for others)
timesheetRouter.get('/job-codes', async (req: AuthedRequest, res) => {
  const user = req.user!;
  const canManage = CAN_MANAGE_CODES.includes(user.role);
  const codes = await prisma.jobCode.findMany({
    where: canManage ? undefined : { active: true },
    select: { id: true, code: true, name: true, description: true, maxHoursPerDay: true, active: true, createdAt: true },
    orderBy: { code: 'asc' },
  });
  res.json(codes);
});

// POST /timesheet/job-codes — create job code
timesheetRouter.post('/job-codes', async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!CAN_MANAGE_CODES.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
  const { code, name, description, maxHoursPerDay } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: 'code and name are required' });
  const existing = await prisma.jobCode.findUnique({ where: { code } });
  if (existing) return res.status(409).json({ error: 'Job code already exists' });
  const jc = await prisma.jobCode.create({
    data: {
      code, name, description: description || null, createdById: user.id,
      ...(maxHoursPerDay != null ? { maxHoursPerDay: Number(maxHoursPerDay) } : {}),
    },
  });
  res.json(jc);
});

// PATCH /timesheet/job-codes/:id — update name/description/active
timesheetRouter.patch('/job-codes/:id', async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!CAN_MANAGE_CODES.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
  const { name, description, active, maxHoursPerDay } = req.body || {};
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (active !== undefined) data.active = active;
  if (maxHoursPerDay !== undefined) data.maxHoursPerDay = maxHoursPerDay === null ? null : Number(maxHoursPerDay);
  const jc = await prisma.jobCode.update({ where: { id: req.params.id }, data });
  res.json(jc);
});

// GET /timesheet/entries
timesheetRouter.get('/entries', async (req: AuthedRequest, res) => {
  const user = req.user!;
  const canViewAll = CAN_VIEW_ALL.includes(user.role);
  const { date, userId, from, to, status } = req.query as Record<string, string>;

  // Build where clause
  const where: Record<string, unknown> = {};

  if (canViewAll && userId) {
    where.userId = userId;
  } else if (!canViewAll) {
    where.userId = user.id;
  }

  if (date) {
    where.date = date;
  } else if (from || to) {
    const dateFilter: Record<string, string> = {};
    if (from) dateFilter.gte = from;
    if (to) dateFilter.lte = to;
    where.date = dateFilter;
  }

  if (status) where.status = status;

  const entries = await prisma.timesheetEntry.findMany({
    where,
    include: {
      jobCode: { select: { code: true, name: true } },
      user: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
  res.json(entries);
});

// POST /timesheet/entries — create entry
timesheetRouter.post('/entries', async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (CANNOT_FILL.includes(user.role)) return res.status(403).json({ error: 'Founders do not fill timesheets' });
  const { date, jobCodeId, hours, description } = req.body || {};
  if (!date || !isValidDate(date)) return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) required' });
  if (!jobCodeId) return res.status(400).json({ error: 'jobCodeId required' });
  const h = Number(hours);
  if (!hours || h <= 0 || h > 24) return res.status(400).json({ error: 'hours must be between 0 and 24' });
  if (!description) return res.status(400).json({ error: 'description required' });

  // Check maxHoursPerDay cap
  const jobCode = await prisma.jobCode.findUnique({ where: { id: jobCodeId } });
  if (jobCode?.maxHoursPerDay != null) {
    const existing = await prisma.timesheetEntry.aggregate({
      where: { userId: user.id, jobCodeId, date, status: { not: 'rejected' } },
      _sum: { hours: true },
    });
    const alreadyLogged = existing._sum.hours ?? 0;
    if (alreadyLogged + h > jobCode.maxHoursPerDay) {
      return res.status(400).json({ error: `Exceeds max ${jobCode.maxHoursPerDay}h/day for this job code` });
    }
  }

  const entry = await prisma.timesheetEntry.create({
    data: { userId: user.id, date, jobCodeId, hours: h, description, status: 'draft' },
    include: {
      jobCode: { select: { code: true, name: true } },
      user: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });
  res.json(entry);
});

// PATCH /timesheet/entries/:id — edit entry (owner only, draft or rejected)
timesheetRouter.patch('/entries/:id', async (req: AuthedRequest, res) => {
  const user = req.user!;
  const entry = await prisma.timesheetEntry.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.userId !== user.id) return res.status(403).json({ error: 'Not your entry' });
  if (!['draft', 'rejected'].includes(entry.status)) return res.status(400).json({ error: 'Can only edit draft or rejected entries' });
  const { jobCodeId, hours, description } = req.body || {};
  const data: Record<string, unknown> = {};
  if (jobCodeId !== undefined) data.jobCodeId = jobCodeId;
  if (hours !== undefined) {
    const h = Number(hours);
    if (h <= 0 || h > 24) return res.status(400).json({ error: 'hours must be between 0 and 24' });
    data.hours = h;
  }
  if (description !== undefined) data.description = description;
  const updated = await prisma.timesheetEntry.update({
    where: { id: req.params.id },
    data,
    include: {
      jobCode: { select: { code: true, name: true } },
      user: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });
  res.json(updated);
});

// DELETE /timesheet/entries/:id — delete entry (owner only, draft only)
timesheetRouter.delete('/entries/:id', async (req: AuthedRequest, res) => {
  const user = req.user!;
  const entry = await prisma.timesheetEntry.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.userId !== user.id) return res.status(403).json({ error: 'Not your entry' });
  if (entry.status !== 'draft') return res.status(400).json({ error: 'Can only delete draft entries' });
  await prisma.timesheetEntry.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// POST /timesheet/entries/:id/submit — submit for approval
timesheetRouter.post('/entries/:id/submit', async (req: AuthedRequest, res) => {
  const user = req.user!;
  const entry = await prisma.timesheetEntry.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.userId !== user.id) return res.status(403).json({ error: 'Not your entry' });
  if (entry.status !== 'draft') return res.status(400).json({ error: 'Entry must be in draft status to submit' });
  const updated = await prisma.timesheetEntry.update({
    where: { id: req.params.id },
    data: { status: 'submitted' },
    include: {
      jobCode: { select: { code: true, name: true } },
      user: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });
  await audit(user.id, user.name, 'TIMESHEET_SUBMITTED', `Entry ${req.params.id} for ${entry.date}`);
  res.json(updated);
});

// POST /timesheet/entries/:id/approve
timesheetRouter.post('/entries/:id/approve', async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!CAN_APPROVE.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
  const entry = await prisma.timesheetEntry.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.status !== 'submitted') return res.status(400).json({ error: 'Entry must be submitted to approve' });
  const updated = await prisma.timesheetEntry.update({
    where: { id: req.params.id },
    data: { status: 'approved', approvedById: user.id, approvedAt: new Date() },
    include: {
      jobCode: { select: { code: true, name: true } },
      user: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });
  await audit(user.id, user.name, 'TIMESHEET_APPROVED', `Entry ${req.params.id} for ${entry.date}`);
  res.json(updated);
});

// POST /timesheet/entries/:id/reject
timesheetRouter.post('/entries/:id/reject', async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!CAN_APPROVE.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
  const { note } = req.body || {};
  if (!note) return res.status(400).json({ error: 'Rejection note required' });
  const entry = await prisma.timesheetEntry.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (entry.status !== 'submitted') return res.status(400).json({ error: 'Entry must be submitted to reject' });
  const updated = await prisma.timesheetEntry.update({
    where: { id: req.params.id },
    data: { status: 'rejected', rejectionNote: note },
    include: {
      jobCode: { select: { code: true, name: true } },
      user: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });
  await audit(user.id, user.name, 'TIMESHEET_REJECTED', `Entry ${req.params.id}: ${note}`);
  res.json(updated);
});

// POST /timesheet/entries/bulk-approve
timesheetRouter.post('/entries/bulk-approve', async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!CAN_APPROVE.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
  const { ids, action, rejectionNote } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids must be a non-empty array' });
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' });
  if (action === 'reject' && !rejectionNote) return res.status(400).json({ error: 'rejectionNote is required for reject' });

  const data: Record<string, unknown> =
    action === 'approve'
      ? { status: 'approved', approvedById: user.id, approvedAt: new Date() }
      : { status: 'rejected', rejectionNote };

  const result = await prisma.timesheetEntry.updateMany({
    where: { id: { in: ids }, status: 'submitted' },
    data,
  });

  await audit(user.id, user.name, `TIMESHEET_BULK_${action.toUpperCase()}`, `${result.count} entries`);
  res.json({ updated: result.count });
});

// GET /timesheet/summary — per-user totals (CAN_VIEW_ALL only)
timesheetRouter.get('/summary', async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!CAN_VIEW_ALL.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
  const { from, to } = req.query as Record<string, string>;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const entries = await prisma.timesheetEntry.findMany({
    where: { date: { gte: from, lte: to } },
    include: { user: { select: { name: true } } },
  });
  const map: Record<string, {
    userId: string; userName: string; totalHours: number;
    submittedCount: number; approvedCount: number; draftCount: number; rejectedCount: number;
  }> = {};
  for (const e of entries) {
    if (!map[e.userId]) map[e.userId] = { userId: e.userId, userName: e.user.name, totalHours: 0, submittedCount: 0, approvedCount: 0, draftCount: 0, rejectedCount: 0 };
    map[e.userId].totalHours += e.hours;
    if (e.status === 'submitted') map[e.userId].submittedCount++;
    else if (e.status === 'approved') map[e.userId].approvedCount++;
    else if (e.status === 'draft') map[e.userId].draftCount++;
    else if (e.status === 'rejected') map[e.userId].rejectedCount++;
  }
  res.json(Object.values(map).sort((a, b) => b.totalHours - a.totalHours));
});
