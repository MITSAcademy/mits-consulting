/**
 * Cron scheduler — initialised once when the Express server boots.
 *
 * Schedule (all times IST = UTC+5:30):
 *   Team 2 (Anjali + Taran)  → 06:00 IST = 00:30 UTC  (morning)
 *                            → 18:00 IST = 12:30 UTC  (evening)
 *   Team 1 (Aman + Kanchan)  → 09:00 IST = 03:30 UTC  (morning)
 *                            → 16:00 IST = 10:30 UTC  (evening)
 *
 * node-cron uses server local time by default; we pass timezone explicitly
 * so it's correct regardless of the server's system timezone (Render = UTC).
 */

import cron from 'node-cron';
import { sendTeam2Briefing, sendTeam1Briefing, sendSamitaBriefing, sendRoshniBriefing } from './dailyBriefing';
import { runIssueEscalation } from './issueEscalation';
import { sendMalikaStatusReport } from './malikaStatusReport';
import { sendPaymentFollowUpReport } from './paymentFollowUpReport';

function safe(label: string, fn: () => Promise<void>) {
  fn().catch((e) => console.error(`[scheduler] ${label} failed:`, e));
}

export function initScheduler() {
  // Team 2 — 6:00 AM IST
  cron.schedule('0 6 * * *', () => safe('team2-morning', () => sendTeam2Briefing('morning')), {
    timezone: 'Asia/Kolkata',
  });

  // Team 2 — 6:00 PM IST
  cron.schedule('0 18 * * *', () => safe('team2-evening', () => sendTeam2Briefing('evening')), {
    timezone: 'Asia/Kolkata',
  });

  // Team 1 — 9:00 AM IST
  cron.schedule('0 9 * * *', () => safe('team1-morning', () => sendTeam1Briefing('morning')), {
    timezone: 'Asia/Kolkata',
  });

  // Team 1 — 4:00 PM IST
  cron.schedule('0 16 * * *', () => safe('team1-evening', () => sendTeam1Briefing('evening')), {
    timezone: 'Asia/Kolkata',
  });

  // Samita — 7:00 AM IST + 7:00 PM IST (team overview)
  cron.schedule('0 7 * * *', () => safe('samita-morning', () => sendSamitaBriefing('morning')), {
    timezone: 'Asia/Kolkata',
  });
  cron.schedule('0 19 * * *', () => safe('samita-evening', () => sendSamitaBriefing('evening')), {
    timezone: 'Asia/Kolkata',
  });

  // Roshni — 8:00 AM IST + 8:00 PM IST (sales pipeline)
  cron.schedule('0 8 * * *', () => safe('roshni-morning', () => sendRoshniBriefing('morning')), {
    timezone: 'Asia/Kolkata',
  });
  cron.schedule('0 20 * * *', () => safe('roshni-evening', () => sendRoshniBriefing('evening')), {
    timezone: 'Asia/Kolkata',
  });

  // Issue escalation — runs every hour
  cron.schedule('0 * * * *', () => safe('issue-escalation', () => runIssueEscalation()), {
    timezone: 'Asia/Kolkata',
  });

  // Malika — daily payments status report at 5:30 PM IST
  cron.schedule('30 17 * * *', () => safe('malika-status-report', () => sendMalikaStatusReport()), {
    timezone: 'Asia/Kolkata',
  });

  // Payment Follow-Up — daily sheet to Vaibhav + Samita + Mitali at 12:00 PM IST
  cron.schedule('0 12 * * *', () => safe('payment-followup-report', () => sendPaymentFollowUpReport()), {
    timezone: 'Asia/Kolkata',
  });

  console.log('[scheduler] Daily briefing crons registered (Asia/Kolkata timezone)');
  console.log('[scheduler]   Team 2 (Anjali + Taran) → 06:00 + 18:00 IST');
  console.log('[scheduler]   Team 1 (Aman + Kanchan) → 09:00 + 16:00 IST (CC Samita + Vaibhav)');
  console.log('[scheduler]   Samita (team overview)  → 07:00 + 19:00 IST (CC Vaibhav)');
  console.log('[scheduler]   Roshni (sales pipeline) → 08:00 + 20:00 IST (CC Vaibhav)');
  console.log('[scheduler]   Payment follow-up report → 12:00 IST (Vaibhav + Samita + Mitali only)');
}
