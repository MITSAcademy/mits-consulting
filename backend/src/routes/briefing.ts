/**
 * POST /api/briefing/trigger  (founder only)
 * Body: { team: 'team1' | 'team2', shift: 'morning' | 'evening' }
 *
 * Fires the daily briefing email immediately — useful for testing and
 * one-off manual sends without waiting for the cron schedule.
 */
import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { sendTeam1Briefing, sendTeam2Briefing, sendSamitaBriefing, sendRoshniBriefing } from '../lib/dailyBriefing';
import { sendDemoEscalationDigest } from '../lib/demoEscalationDigest';
import { sendMalikaStatusReport } from '../lib/malikaStatusReport';
import { sendMitaliDailyReport } from '../lib/mitaliDailyReport';
import { sendClientFeedbackEmails } from '../lib/clientFeedbackEmail';
import { sendWeeklyFeedbackReport } from '../lib/weeklyFeedbackReport';

export const briefingRouter = Router();
briefingRouter.use(requireAuth);

briefingRouter.post('/trigger', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') {
    return res.status(403).json({ error: 'Only founder can manually trigger briefings.' });
  }
  const { team, shift } = req.body as { team?: string; shift?: string };
  if (!['team1', 'team2', 'samita', 'roshni'].includes(team || '')) return res.status(400).json({ error: 'team must be team1, team2, samita or roshni' });
  if (!['morning', 'evening'].includes(shift || '')) return res.status(400).json({ error: 'shift must be morning or evening' });

  try {
    if (team === 'team1') await sendTeam1Briefing(shift as 'morning' | 'evening');
    else if (team === 'team2') await sendTeam2Briefing(shift as 'morning' | 'evening');
    else if (team === 'roshni') await sendRoshniBriefing(shift as 'morning' | 'evening');
    else await sendSamitaBriefing(shift as 'morning' | 'evening');
    res.json({ ok: true, message: `${team} ${shift} briefing sent.` });
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// POST /api/briefing/mitali-daily  — trigger Mitali's daily activity report immediately
briefingRouter.post('/mitali-daily', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') {
    return res.status(403).json({ error: 'Only founder can trigger this.' });
  }
  try {
    await sendMitaliDailyReport();
    res.json({ ok: true, message: "Mitali's daily report sent." });
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// POST /api/briefing/feedback-survey  — trigger feedback survey emails now (force or sample mode)
briefingRouter.post('/feedback-survey', async (req: AuthedRequest, res) => {
  if (!['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  const sample = req.query.sample === 'true' || req.body?.sample === true;
  try {
    const result = await sendClientFeedbackEmails({ force: !sample, sample });
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// POST /api/briefing/malika-status  — trigger Malika's status report immediately
briefingRouter.post('/malika-status', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') {
    return res.status(403).json({ error: 'Only founder can trigger this.' });
  }
  try {
    await sendMalikaStatusReport({ force: true });
    res.json({ ok: true, message: 'Malika status report sent.' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// POST /api/briefing/feedback-compliance — trigger weekly feedback compliance report now
briefingRouter.post('/feedback-compliance', async (req: AuthedRequest, res) => {
  if (!['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  try {
    await sendWeeklyFeedbackReport({ id: req.user!.id, name: req.user!.name });
    res.json({ ok: true, message: 'Weekly feedback compliance report sent.' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// POST /api/briefing/demo-escalation-digest — trigger demo escalation digest now
briefingRouter.post('/demo-escalation-digest', async (req: AuthedRequest, res) => {
  if (!['founder', 'manager', 'lead'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  try {
    await sendDemoEscalationDigest();
    res.json({ ok: true, message: 'Demo escalation digest sent.' });
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
  }
});
