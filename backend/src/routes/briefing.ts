/**
 * POST /api/briefing/trigger  (founder only)
 * Body: { team: 'team1' | 'team2', shift: 'morning' | 'evening' }
 *
 * Fires the daily briefing email immediately — useful for testing and
 * one-off manual sends without waiting for the cron schedule.
 */
import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { sendTeam1Briefing, sendTeam2Briefing } from '../lib/dailyBriefing';

export const briefingRouter = Router();
briefingRouter.use(requireAuth);

briefingRouter.post('/trigger', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') {
    return res.status(403).json({ error: 'Only founder can manually trigger briefings.' });
  }
  const { team, shift } = req.body as { team?: string; shift?: string };
  if (!['team1', 'team2'].includes(team || '')) return res.status(400).json({ error: 'team must be team1 or team2' });
  if (!['morning', 'evening'].includes(shift || '')) return res.status(400).json({ error: 'shift must be morning or evening' });

  try {
    if (team === 'team1') await sendTeam1Briefing(shift as 'morning' | 'evening');
    else await sendTeam2Briefing(shift as 'morning' | 'evening');
    res.json({ ok: true, message: `${team} ${shift} briefing sent.` });
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
  }
});
