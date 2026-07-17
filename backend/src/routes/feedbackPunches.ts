import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const feedbackPunchRouter = Router();
feedbackPunchRouter.use(requireAuth);

function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function weekBoundsIST(refDate?: string): { monday: string; saturday: string } {
  const ref = refDate ? new Date(refDate + 'T00:00:00Z') : new Date(
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00Z'
  );
  const day = ref.getUTCDay(); // 0=Sun,1=Mon,...,6=Sat
  const daysToMon = day === 0 ? 6 : day - 1;
  const mon = new Date(ref);
  mon.setUTCDate(ref.getUTCDate() - daysToMon);
  const sat = new Date(mon);
  sat.setUTCDate(mon.getUTCDate() + 5);
  return {
    monday: mon.toISOString().slice(0, 10),
    saturday: sat.toISOString().slice(0, 10),
  };
}

// GET /api/feedback-punches/compliance?week=YYYY-MM-DD
// Returns weekly compliance data for the dashboard
feedbackPunchRouter.get('/compliance', async (req: AuthedRequest, res) => {
  const role = req.user!.role;
  const userId = req.user!.id;
  const weekParam = req.query.week as string | undefined;
  const { monday, saturday } = weekBoundsIST(weekParam);

  // All active clients
  const clients = await prisma.client.findMany({
    where: { regularTrainings: { some: { status: 'active' } } },
    select: {
      id: true, name: true,
      assignedAm: { select: { id: true, name: true } },
      hostOwner: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  });

  // All punches for this week
  const punches = await prisma.feedbackPunch.findMany({
    where: { date: { gte: monday, lte: saturday } },
    select: {
      id: true, clientId: true, punchedById: true, date: true, type: true, note: true,
      punchedBy: { select: { id: true, name: true, role: true } },
    },
  });

  // Staff members relevant to compliance
  const staffIds = ['u-mitali', 'u-bhavneet', 'u-kashish', 'u-muskan'];
  const staff = await prisma.user.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, name: true, role: true },
  });

  // Filter what the requester can see
  let visibleStaffIds = staffIds;
  if (role === 'lead') visibleStaffIds = ['u-bhavneet', 'u-kashish', 'u-muskan'];
  else if (role === 'account_manager') visibleStaffIds = [userId];

  res.json({
    week: { monday, saturday },
    clients,
    punches,
    staff: staff.filter(s => visibleStaffIds.includes(s.id)),
  });
});

// POST /api/feedback-punches
// Punch feedback for a client on a given date
feedbackPunchRouter.post('/', async (req: AuthedRequest, res) => {
  const { clientId, date, type, note } = req.body as {
    clientId: string; date: string; type: string; note?: string;
  };
  const role = req.user!.role;

  if (!clientId || !date || !type) {
    return res.status(400).json({ error: 'clientId, date, and type are required' });
  }
  if (!['verbal', 'written'].includes(type)) {
    return res.status(400).json({ error: 'type must be verbal or written' });
  }
  // verbal = mitali/bhavneet; written = kashish/muskan/bhavneet
  if (type === 'verbal' && !['founder', 'manager', 'lead'].includes(role)) {
    return res.status(403).json({ error: 'Only Mitali or Bhavneet can log verbal feedback' });
  }

  const today = todayIST();
  if (date > today) {
    return res.status(400).json({ error: 'Cannot punch feedback for a future date' });
  }

  try {
    const punch = await prisma.feedbackPunch.upsert({
      where: { clientId_punchedById_date: { clientId, punchedById: req.user!.id, date } },
      create: { clientId, punchedById: req.user!.id, date, type, note: note || null },
      update: { type, note: note || null },
    });

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
    await audit(req.user!.id, req.user!.name, 'FEEDBACK_PUNCH', `Logged ${type} feedback for ${client?.name} on ${date}`, { clientId });

    res.json({ ok: true, punch });
  } catch (e: any) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Already punched for this client/date' });
    throw e;
  }
});

// DELETE /api/feedback-punches/:id
feedbackPunchRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const punch = await prisma.feedbackPunch.findUnique({ where: { id: req.params.id } });
  if (!punch) return res.status(404).json({ error: 'Not found' });

  // Only the person who punched or founder/manager can delete
  if (punch.punchedById !== req.user!.id && !['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }

  await prisma.feedbackPunch.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
