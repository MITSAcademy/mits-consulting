/**
 * Automated issue escalation matrix
 *
 * L0 → L1 (Bhavneet)  : if Open and no action for 24h
 * L1 → L2 (Mitali)    : if still Open and no action for 48h after L1
 * L2 → L3 (Vaibhav)   : if still Open and no action for 24h after L2
 *
 * Runs every hour via scheduler.
 */

import { prisma } from './prisma';
import { notify } from './notify';

// User IDs for escalation targets
const L1_USER_ID = 'u-bhavneet';  // Bhavneet
const L2_USER_ID = 'u-mitali';    // Mitali
const L3_USER_ID = 'u-vaibhav';   // Vaibhav

const HOURS_TO_L1 = 24;
const HOURS_TO_L2 = 48;
const HOURS_TO_L3 = 24;

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

export async function runIssueEscalation() {
  const now = new Date();

  // L0 → L1: open issues created >24h ago, not yet escalated
  const toL1 = await prisma.issueTracker.findMany({
    where: { status: 'Open', escalationLevel: 0, createdAt: { lt: hoursAgo(HOURS_TO_L1) } },
    select: { id: true, title: true, coordinatorName: true },
  });

  for (const issue of toL1) {
    const log = [{ level: 1, at: now.toISOString(), reason: `No action after ${HOURS_TO_L1}h — escalated to Bhavneet` }];
    await prisma.issueTracker.update({
      where: { id: issue.id },
      data: { escalationLevel: 1, escalatedAt: now, escalationLog: JSON.stringify(log) },
    });
    await notify({
      userId: L1_USER_ID,
      kind: 'issue_escalated',
      title: `Issue escalated to you: ${issue.title}`,
      body: `No action taken in ${HOURS_TO_L1}h. Raised by: ${issue.coordinatorName || 'coordinator'}.`,
      link: '/issue-tracker',
      email: true,
    }).catch(() => {});
    console.log(`[escalation] Issue ${issue.id} → L1 (Bhavneet)`);
  }

  // L1 → L2: escalated to L1 >48h ago, still open
  const toL2 = await prisma.issueTracker.findMany({
    where: { status: 'Open', escalationLevel: 1, escalatedAt: { lt: hoursAgo(HOURS_TO_L2) } },
    select: { id: true, title: true, coordinatorName: true, escalationLog: true },
  });

  for (const issue of toL2) {
    const existingLog = issue.escalationLog ? (() => { try { return JSON.parse(issue.escalationLog!); } catch { return []; } })() : [];
    const log = [...existingLog, { level: 2, at: now.toISOString(), reason: `No action after ${HOURS_TO_L2}h at L1 — escalated to Mitali` }];
    await prisma.issueTracker.update({
      where: { id: issue.id },
      data: { escalationLevel: 2, escalatedAt: now, escalationLog: JSON.stringify(log) },
    });
    await notify({
      userId: L2_USER_ID,
      kind: 'issue_escalated',
      title: `Issue escalated to you: ${issue.title}`,
      body: `Unresolved for ${HOURS_TO_L2}h after Bhavneet. Raised by: ${issue.coordinatorName || 'coordinator'}.`,
      link: '/issue-tracker',
      email: true,
    }).catch(() => {});
    console.log(`[escalation] Issue ${issue.id} → L2 (Mitali)`);
  }

  // L2 → L3: escalated to L2 >24h ago, still open
  const toL3 = await prisma.issueTracker.findMany({
    where: { status: 'Open', escalationLevel: 2, escalatedAt: { lt: hoursAgo(HOURS_TO_L3) } },
    select: { id: true, title: true, coordinatorName: true, escalationLog: true },
  });

  for (const issue of toL3) {
    const existingLog = issue.escalationLog ? (() => { try { return JSON.parse(issue.escalationLog!); } catch { return []; } })() : [];
    const log = [...existingLog, { level: 3, at: now.toISOString(), reason: `No action after ${HOURS_TO_L3}h at L2 — escalated to Vaibhav` }];
    await prisma.issueTracker.update({
      where: { id: issue.id },
      data: { escalationLevel: 3, escalatedAt: now, escalationLog: JSON.stringify(log) },
    });
    await notify({
      userId: L3_USER_ID,
      kind: 'issue_escalated',
      title: `URGENT: Issue escalated to you: ${issue.title}`,
      body: `Unresolved through L1+L2. Raised by: ${issue.coordinatorName || 'coordinator'}.`,
      link: '/issue-tracker',
      email: true,
    }).catch(() => {});
    console.log(`[escalation] Issue ${issue.id} → L3 (Vaibhav)`);
  }

  if (toL1.length + toL2.length + toL3.length > 0) {
    console.log(`[escalation] Done — ${toL1.length} → L1, ${toL2.length} → L2, ${toL3.length} → L3`);
  }
}
