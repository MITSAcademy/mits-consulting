import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { decryptSecret } from '../lib/mailer';

export const calendarRouter = Router();
calendarRouter.use(requireAuth);

// ─── Google Calendar 2-way sync ─────────────────────────────────────────────
// Reads the signed-in user's primary Google Calendar between `from` and `to`.
// Requires (a) GOOGLE_CLIENT_ID/SECRET env vars and (b) the user has signed in
// via Google with the calendar.readonly scope (which stores a refresh_token).

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return null;
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const j: any = await resp.json();
  if (!resp.ok) {
    console.error('Google token refresh failed:', j);
    return null;
  }
  return j.access_token || null;
}

calendarRouter.get('/google', async (req: AuthedRequest, res) => {
  const me = req.user!.id;
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = new Date(); defaultEnd.setDate(defaultEnd.getDate() + 60);
  const from = (req.query.from as string) || today;
  const to = (req.query.to as string) || defaultEnd.toISOString().slice(0, 10);

  const u = await prisma.user.findUnique({
    where: { id: me },
    select: { id: true, googleRefreshToken: true, gmailAddress: true },
  });
  if (!u?.googleRefreshToken) {
    return res.json({
      connected: false,
      events: [],
      error: 'Sign in with Google to grant calendar access (the SSO flow asks for calendar.readonly).',
    });
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(u.googleRefreshToken);
  } catch {
    return res.json({ connected: false, events: [], error: 'Stored Google token is unreadable — sign in again.' });
  }

  const accessToken = await refreshAccessToken(refreshToken);
  if (!accessToken) {
    return res.json({ connected: false, events: [], error: 'Google token refresh failed — sign in again.' });
  }

  // Fetch events from primary calendar
  const params = new URLSearchParams({
    timeMin: new Date(from + 'T00:00:00Z').toISOString(),
    timeMax: new Date(to + 'T23:59:59Z').toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const apiResp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!apiResp.ok) {
    const txt = await apiResp.text();
    return res.json({ connected: true, events: [], error: `Google API error: ${apiResp.status} ${txt.slice(0, 200)}` });
  }
  const data: any = await apiResp.json();
  const items: any[] = data.items || [];

  const events = items
    .filter((e) => e.status !== 'cancelled')
    .map((e) => {
      const startISO = e.start?.dateTime || e.start?.date; // dateTime is ISO, date is YYYY-MM-DD (all-day)
      const isAllDay = !!e.start?.date && !e.start?.dateTime;
      const startDate = (startISO || '').slice(0, 10);
      // Show times in IST for consistency with our other events
      let timeIst = '';
      if (!isAllDay && e.start?.dateTime) {
        const d = new Date(e.start.dateTime);
        timeIst = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
      }
      return {
        id: `g-${e.id}`,
        kind: 'google' as const,
        title: e.summary || '(no title)',
        date: startDate,
        timeIst,
        status: e.status,
        htmlLink: e.htmlLink,
        link: null as string | null,
      };
    })
    .filter((e) => e.date);

  res.json({ connected: true, events });
});



// GET /api/calendar/mine?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns demos + session tasks where the current user has any role
// (intake_owner, sales_owner, host_owner, demo conducted_by, or task owner).
calendarRouter.get('/mine', async (req: AuthedRequest, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const defaultEnd = new Date(); defaultEnd.setDate(defaultEnd.getDate() + 30);
  const from = (req.query.from as string) || today;
  const to = (req.query.to as string) || defaultEnd.toISOString().slice(0, 10);
  const me = req.user!.id;

  // Demos where I'm involved (as intake owner, sales owner, host owner, or conductor)
  const demos = await prisma.demo.findMany({
    where: {
      OR: [
        { conductedById: me },
        { client: { intakeOwnerId: me } },
        { client: { salesOwnerId: me } },
        { client: { hostOwnerId: me } },
      ],
      AND: [
        { OR: [{ scheduledDate: { gte: from } }, { actualDate: { gte: from } }] },
        { OR: [{ scheduledDate: { lte: to } }, { actualDate: { lte: to } }] },
      ],
    },
    include: {
      client: { select: { id: true, name: true } },
      trainer: { select: { id: true, name: true } },
    },
  });

  // Session tasks I own
  const tasks = await prisma.task.findMany({
    where: {
      ownerId: me,
      type: 'SESSION',
      dueDate: { gte: from, lte: to },
    },
    include: {
      client: { select: { id: true, name: true } },
      trainer: { select: { id: true, name: true } },
    },
  });

  const events = [
    ...demos.map((d) => ({
      id: `demo-${d.id}`,
      kind: 'demo' as const,
      title: `Demo · ${d.client?.name || '—'}${d.trainer ? ' × ' + d.trainer.name : ''}`,
      date: d.actualDate || d.scheduledDate || '',
      timeIst: d.actualTimeIst || d.scheduledTimeIst || '',
      clientId: d.client?.id,
      clientName: d.client?.name,
      trainerId: d.trainer?.id,
      trainerName: d.trainer?.name,
      status: d.status,
      outcome: d.outcome,
      link: d.client ? `/clients/${d.client.id}` : null,
    })),
    ...tasks.map((t) => ({
      id: `task-${t.id}`,
      kind: 'session' as const,
      title: t.title,
      date: t.dueDate || '',
      timeIst: '',
      clientId: t.client?.id,
      clientName: t.client?.name,
      trainerId: t.trainer?.id,
      trainerName: t.trainer?.name,
      status: t.status,
      link: t.client ? `/clients/${t.client.id}` : null,
    })),
  ]
    .filter((e) => e.date)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.timeIst || '').localeCompare(b.timeIst || ''));

  res.json({ from, to, events });
});
