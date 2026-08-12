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
import { sendBhavneetDailySheet } from './bhavneetDailySheet';
import { sendSmtpHealthAdvisory } from './smtpHealthAdvisory';
import { sendDailyReminders } from './dailyReminders';
import { sendMitaliDailyReport } from './mitaliDailyReport';
import { sendClientFeedbackEmails } from './clientFeedbackEmail';
import { sendWeeklyFeedbackReport } from './weeklyFeedbackReport';
import { sendDemoEscalationDigest } from './demoEscalationDigest';
import { prisma } from './prisma';

function safe(label: string, fn: () => Promise<void>) {
  fn().catch((e) => console.error(`[scheduler] ${label} failed:`, e));
}

async function autoArchiveWeeklyPayouts() {
  // Find the Monday of the current week
  const now = new Date();
  const day = now.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday);
  const weekStart = monday.toISOString().slice(0, 10);
  const weekEnd = new Date(monday);
  weekEnd.setDate(monday.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  // Idempotency check
  const existing = await prisma.payoutBatch.findFirst({ where: { weekStart } });
  if (existing) {
    console.log(`[weekly-archive] batch for ${weekStart} already exists — skipping`);
    return;
  }

  const logs = await prisma.sessionLog.findMany({
    where: { status: 'Logged', date: { gte: weekStart, lte: weekEndStr } },
    select: { id: true, amountInr: true },
  });
  if (logs.length === 0) {
    console.log(`[weekly-archive] no Logged sessions for ${weekStart} — skipping`);
    return;
  }

  const ids = logs.map((l) => l.id);
  const totalInr = logs.reduce((s, l) => s + l.amountInr, 0);
  await prisma.payoutBatch.create({ data: { weekStart, totalInr, sessionIds: ids, status: 'Pending' } });
  await prisma.sessionLog.updateMany({ where: { id: { in: ids } }, data: { status: 'ReadyForFinal' } });
  console.log(`[weekly-archive] archived ${ids.length} sessions for ${weekStart} → ₹${totalInr}`);
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

  // Demo escalation digest — 11:00 AM IST daily → Samita, Anjali, Taran
  cron.schedule('0 11 * * *', () => safe('demo-escalation-digest', () => sendDemoEscalationDigest()), {
    timezone: 'Asia/Kolkata',
  });

  // Malika status report disabled

  // Payment Follow-Up Report — 12:00 PM IST → Vaibhav, Samita, Mitali, Areena
  cron.schedule('0 12 * * *', () => safe('payment-followup-report', () => sendPaymentFollowUpReport({ force: true })), {
    timezone: 'Asia/Kolkata',
  });

  // Bhavneet's daily session sheet — 2:00 PM IST → Kashish, Muskan (CC: Samita, Vaibhav, Mitali, Bhavneet)
  cron.schedule('0 14 * * *', () => safe('bhavneet-daily-sheet', () => sendBhavneetDailySheet()), {
    timezone: 'Asia/Kolkata',
  });

  // SMTP health advisory — 9:00 AM IST daily → emails broken users urgently, working users get a reminder
  cron.schedule('5 9 * * *', () => safe('smtp-health-advisory', () => sendSmtpHealthAdvisory()), {
    timezone: 'Asia/Kolkata',
  });

  // Daily proactive reminders — 9:30 AM IST daily → in-app notifications per user
  cron.schedule('30 9 * * *', () => safe('daily-reminders', () => sendDailyReminders()), {
    timezone: 'Asia/Kolkata',
  });

  // Saturday 8:00 AM IST — weekly feedback compliance report
  cron.schedule('0 8 * * 6', () => safe('weekly-feedback-report', () => sendWeeklyFeedbackReport()), {
    timezone: 'Asia/Kolkata',
  });

  // Saturday 11:00 PM IST — auto-archive current week's session logs into a PayoutBatch
  cron.schedule('0 23 * * 6', () => safe('weekly-payout-archive', autoArchiveWeeklyPayouts), {
    timezone: 'Asia/Kolkata',
  });

  // 11:30 PM IST daily — Mitali's daily activity report (payments, feedback, active window)
  cron.schedule('30 23 * * *', () => safe('mitali-daily-report', () => sendMitaliDailyReport()), {
    timezone: 'Asia/Kolkata',
  });

  // 5:00 AM IST daily — feedback survey emails to clients whose payDate1 is 2 days away
  cron.schedule('0 5 * * *', () => safe('client-feedback-emails', async () => { await sendClientFeedbackEmails(); }), {
    timezone: 'Asia/Kolkata',
  });

  console.log('[scheduler] Daily briefing crons registered (Asia/Kolkata timezone)');
  console.log('[scheduler]   Team 2 (Anjali + Taran) → 06:00 + 18:00 IST');
  console.log('[scheduler]   Team 1 (Aman + Kanchan) → 09:00 + 16:00 IST (CC Samita + Vaibhav)');
  console.log('[scheduler]   Samita (team overview)  → 07:00 + 19:00 IST (CC Vaibhav)');
  console.log('[scheduler]   Roshni (sales pipeline) → 08:00 + 20:00 IST (CC Vaibhav)');
  console.log('[scheduler]   Payment follow-up report → 12:00 IST (Vaibhav + Samita + Mitali only)');
  console.log('[scheduler]   Daily proactive reminders → 09:30 IST (per-user in-app notifications)');
  console.log('[scheduler]   Mitali daily activity report → 23:30 IST (Mitali + Vaibhav + Samita)');
}
