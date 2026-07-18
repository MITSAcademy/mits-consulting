import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';

export const feedbackPunchRouter = Router();
feedbackPunchRouter.use(requireAuth);

function weekBoundsIST(refDate?: string): { monday: string; saturday: string } {
  const ref = refDate ? new Date(refDate + 'T00:00:00Z') : new Date(
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00Z'
  );
  const day = ref.getUTCDay();
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

// Convert a UTC DateTime to an IST date string (YYYY-MM-DD)
function toISTDate(dt: Date): string {
  return dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// GET /api/feedback-punches/compliance?week=YYYY-MM-DD
// Derives compliance from FeedbackActivity — no manual punching needed
feedbackPunchRouter.get('/compliance', async (req: AuthedRequest, res) => {
  try {
  const role = req.user!.role;
  const userId = req.user!.id;
  const weekParam = req.query.week as string | undefined;
  if (weekParam && !/^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    return res.status(400).json({ error: 'week must be YYYY-MM-DD' });
  }
  const { monday, saturday } = weekBoundsIST(weekParam);

  // IST = UTC+5:30, so IST midnight = UTC 18:30 previous day
  const monStart = new Date(monday + 'T00:00:00.000Z');
  monStart.setUTCMinutes(monStart.getUTCMinutes() - 330); // shift back 5h30m to get IST midnight in UTC
  const satEnd = new Date(saturday + 'T23:59:59.999Z');
  satEnd.setUTCMinutes(satEnd.getUTCMinutes() - 330);

  const VERBAL_IDS = ['u-mitali', 'u-bhavneet'];
  const WRITTEN_IDS = ['u-kashish', 'u-muskan'];
  const staffIds = ['u-mitali', 'u-bhavneet', 'u-kashish', 'u-muskan'];

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

  // All FeedbackActivity by relevant staff this week
  const activities = await prisma.feedbackActivity.findMany({
    where: {
      loggedById: { in: staffIds },
      loggedAt: { gte: monStart, lte: satEnd },
    },
    select: { clientId: true, loggedById: true, loggedAt: true, type: true },
  });

  // Build per-client per-staff activity map
  // verbal: clientId → Set<staffId> (any activity this week counts)
  // written: clientId → staffId → Set<date>
  const verbalMap: Record<string, Set<string>> = {};
  const writtenMap: Record<string, Record<string, Set<string>>> = {};

  for (const a of activities) {
    const dateIST = toISTDate(a.loggedAt);
    if (VERBAL_IDS.includes(a.loggedById)) {
      if (!verbalMap[a.clientId]) verbalMap[a.clientId] = new Set();
      verbalMap[a.clientId].add(a.loggedById);
    }
    if (WRITTEN_IDS.includes(a.loggedById)) {
      if (!writtenMap[a.clientId]) writtenMap[a.clientId] = {};
      if (!writtenMap[a.clientId][a.loggedById]) writtenMap[a.clientId][a.loggedById] = new Set();
      writtenMap[a.clientId][a.loggedById].add(dateIST);
    }
  }

  // Serialize to JSON-friendly shape
  // verbal: [{ clientId, staffId }]
  // written: [{ clientId, staffId, date }]
  const verbalDone: { clientId: string; staffId: string }[] = [];
  for (const [clientId, staffSet] of Object.entries(verbalMap)) {
    for (const staffId of staffSet) {
      verbalDone.push({ clientId, staffId });
    }
  }

  const writtenDone: { clientId: string; staffId: string; date: string }[] = [];
  for (const [clientId, byStaff] of Object.entries(writtenMap)) {
    for (const [staffId, dates] of Object.entries(byStaff)) {
      for (const date of dates) {
        writtenDone.push({ clientId, staffId, date });
      }
    }
  }

  // Staff visible to requester
  const staff = await prisma.user.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, name: true, role: true },
  });
  let visibleStaffIds = staffIds;
  if (role === 'lead') visibleStaffIds = ['u-bhavneet', 'u-kashish', 'u-muskan'];
  else if (role === 'account_manager') visibleStaffIds = [userId];

  // Filter compliance arrays to only include entries for visible staff
  const visibleSet = new Set(visibleStaffIds);
  const filteredVerbalDone = verbalDone.filter(v => visibleSet.has(v.staffId));
  const filteredWrittenDone = writtenDone.filter(w => visibleSet.has(w.staffId));

  res.json({
    week: { monday, saturday },
    clients,
    verbalDone: filteredVerbalDone,
    writtenDone: filteredWrittenDone,
    staff: staff.filter(s => visibleStaffIds.includes(s.id)),
  });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Internal error' });
  }
});
