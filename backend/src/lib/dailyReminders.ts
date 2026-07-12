/**
 * Daily proactive reminders — fires in-app notifications to each user about
 * what needs their attention today.
 *
 * Reminder types:
 *   1. Sessions overdue      → account_managers + leads: active clients with no session in 7 days
 *   2. Renewals due today    → founders + managers: clients where nextRenewalDue = today
 *   3. Dormant check-back    → founders + demo_leads: dormant clients where dormantCheckBackOn <= today
 *   4. Issues open 48h+      → managers + leads: issues not Resolved/Closed and created > 48h ago
 */

import { prisma } from './prisma';
import { notify } from './notify';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function sendDailyReminders(): Promise<void> {
  try {
    const today = todayIso();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // ── 1. Sessions overdue — account_managers and leads ─────────────────────
    try {
      const sessionUsers = await prisma.user.findMany({
        where: { role: { in: ['account_manager', 'lead'] }, active: true },
        select: { id: true, role: true },
      });

      for (const user of sessionUsers) {
        // Find active clients assigned to this user
        const whereClause =
          user.role === 'account_manager'
            ? { lifecycle: 'Active' as const, assignedAmId: user.id }
            : { lifecycle: 'Active' as const, leadOwnerId: user.id };

        const activeClients = await prisma.client.findMany({
          where: whereClause,
          select: { id: true, name: true },
        });

        const overdueClients: { id: string; name: string }[] = [];

        for (const client of activeClients) {
          const recentSession = await prisma.sessionLog.findFirst({
            where: {
              clientId: client.id,
              date: { gte: sevenDaysAgo.toISOString().slice(0, 10) },
            },
            select: { id: true },
          });
          if (!recentSession) {
            overdueClients.push(client);
          }
        }

        // Cap at 5 per user
        const top5 = overdueClients.slice(0, 5);
        for (const client of top5) {
          await notify({
            userId: user.id,
            kind: 'SessionOverdue',
            title: `⏰ No session this week: ${client.name}`,
            body: 'Consider scheduling a check-in.',
            link: `/clients/${client.id}`,
          });
        }
      }
    } catch (e) {
      console.error('[dailyReminders] sessions-overdue block failed:', (e as any)?.message || e);
    }

    // ── 2. Renewals due today — founders and managers ─────────────────────────
    try {
      const renewalClients = await prisma.client.findMany({
        where: { lifecycle: 'Active', nextRenewalDue: today },
        select: { id: true, name: true },
      });

      if (renewalClients.length > 0) {
        const renewalUsers = await prisma.user.findMany({
          where: { role: { in: ['founder', 'manager'] }, active: true },
          select: { id: true },
        });

        for (const client of renewalClients) {
          for (const user of renewalUsers) {
            await notify({
              userId: user.id,
              kind: 'RenewalDueToday',
              title: `🔔 Renewal due today: ${client.name}`,
              body: 'Follow up on renewal payment.',
              link: `/clients/${client.id}`,
            });
          }
        }
      }
    } catch (e) {
      console.error('[dailyReminders] renewals-due block failed:', (e as any)?.message || e);
    }

    // ── 3. Dormant clients overdue for check-back — founders and demo_leads ──
    try {
      const dormantClients = await prisma.client.findMany({
        where: {
          lifecycle: 'Dormant',
          dormantCheckBackOn: { lte: today },
        },
        select: { id: true, name: true },
      });

      if (dormantClients.length > 0) {
        const dormantUsers = await prisma.user.findMany({
          where: { role: { in: ['founder', 'demo_lead'] }, active: true },
          select: { id: true },
        });

        for (const user of dormantUsers) {
          // Cap at 5 per user
          const top5 = dormantClients.slice(0, 5);
          for (const client of top5) {
            await notify({
              userId: user.id,
              kind: 'DormantCheckBackOverdue',
              title: `💤 Dormant check-back overdue: ${client.name}`,
              link: `/clients/${client.id}`,
            });
          }
        }
      }
    } catch (e) {
      console.error('[dailyReminders] dormant-check-back block failed:', (e as any)?.message || e);
    }

    // ── 4. Pending issues unresolved > 48 hours — managers and leads ─────────
    try {
      const openIssues = await prisma.issueTracker.findMany({
        where: {
          status: { notIn: ['Resolved', 'Closed'] },
          createdAt: { lt: fortyEightHoursAgo },
        },
        select: { id: true, title: true },
        orderBy: { createdAt: 'asc' },
      });

      if (openIssues.length > 0) {
        const issueUsers = await prisma.user.findMany({
          where: { role: { in: ['manager', 'lead'] }, active: true },
          select: { id: true },
        });

        for (const user of issueUsers) {
          // Cap at 3 per user
          const top3 = openIssues.slice(0, 3);
          for (const issue of top3) {
            await notify({
              userId: user.id,
              kind: 'IssueOpen48h',
              title: `⚠️ Issue open 48h+: ${issue.title}`,
              link: '/issues',
            });
          }
        }
      }
    } catch (e) {
      console.error('[dailyReminders] issues-open-48h block failed:', (e as any)?.message || e);
    }

    console.log('[dailyReminders] Daily reminders sent for', today);
  } catch (e) {
    console.error('[dailyReminders] Top-level error:', (e as any)?.message || e);
  }
}
