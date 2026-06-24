/**
 * Coordinator Dashboard API
 *
 * Used by Bhavneet (lead) and Mitali (manager) to monitor team activity.
 *
 * Returns per-coordinator stats:
 *   - Active client count
 *   - Sessions this week (scheduled + completed)
 *   - Overdue renewals (nextRenewalDue < today)
 *   - Open issues assigned to them or their clients
 *   - Pending tasks
 *   - Last session date across their clients
 */
import { Router } from 'express';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { prisma } from '../lib/prisma';

export const coordinatorDashboardRouter = Router();
coordinatorDashboardRouter.use(requireAuth);
coordinatorDashboardRouter.use(requireRole('founder', 'manager', 'lead'));

// Coordinator IDs and their hierarchy
const BHAVNEET_TEAM = ['u-bhavneet', 'u-kashish', 'u-muskan'];
const MITALI_TEAM   = ['u-mitali', 'u-bhavneet', 'u-kashish', 'u-muskan'];

function teamFor(role: string): string[] {
  if (role === 'lead')    return BHAVNEET_TEAM;
  if (role === 'manager') return MITALI_TEAM;
  return MITALI_TEAM; // founder sees all team
}

coordinatorDashboardRouter.get('/', async (req: AuthedRequest, res) => {
  const team = teamFor(req.user!.role);
  const today = new Date().toISOString().slice(0, 10);

  // Week boundaries (Mon–Sun)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  // Fetch all team members info
  const teamUsers = await prisma.user.findMany({
    where: { id: { in: team } },
    select: { id: true, name: true, role: true, email: true },
  });

  // Per-coordinator stats in parallel
  const stats = await Promise.all(
    teamUsers.map(async (coordinator) => {
      const [
        activeClients,
        overdueRenewals,
        openIssues,
        pendingTasks,
        weekSessions,
        recentSessions,
      ] = await Promise.all([
        // Active trainings hosted by this coordinator
        prisma.regularTraining.count({
          where: { hostedByDefaultId: coordinator.id, status: 'active' },
        }),

        // Overdue renewals — active training clients with past nextRenewalDue
        prisma.regularTraining.count({
          where: {
            hostedByDefaultId: coordinator.id,
            status: 'active',
            client: { nextRenewalDue: { lt: today } },
          },
        }),

        // Open issues related to this coordinator's clients
        prisma.issueTracker.count({
          where: {
            status: { in: ['Open', 'InProgress'] },
            client: { regularTrainings: { some: { hostedByDefaultId: coordinator.id, status: 'active' } } },
          },
        }),

        // Pending tasks assigned to this coordinator
        prisma.task.count({
          where: {
            ownerId: coordinator.id,
            status: 'Pending',
          },
        }),

        // Sessions this week (hosted by this coordinator)
        prisma.trainingSession.count({
          where: {
            hostedById: coordinator.id,
            scheduledFor: { gte: monday, lte: sunday },
            status: { in: ['scheduled', 'in_progress', 'completed'] },
          },
        }),

        // Last 3 completed sessions
        prisma.trainingSession.findMany({
          where: {
            hostedById: coordinator.id,
            status: 'completed',
          },
          orderBy: { scheduledFor: 'desc' },
          take: 3,
          select: {
            scheduledFor: true,
            durationMinutes: true,
            regularTraining: {
              select: {
                client: { select: { id: true, name: true } },
                name: true,
              },
            },
          },
        }),
      ]);

      // Client list for allocation view — derived from active trainings
      const activeTrainings = await prisma.regularTraining.findMany({
        where: { hostedByDefaultId: coordinator.id, status: 'active' },
        select: {
          client: {
            select: { id: true, name: true, lifecycle: true, nextRenewalDue: true,
              primaryTrainer: { select: { name: true } } },
          },
        },
        orderBy: { client: { name: 'asc' } },
      });
      const clients = activeTrainings.map(t => t.client).filter(Boolean);

      return {
        coordinator: { id: coordinator.id, name: coordinator.name, role: coordinator.role },
        stats: {
          activeClients,
          overdueRenewals,
          openIssues,
          pendingTasks,
          weekSessions,
        },
        recentSessions: recentSessions.map((s) => ({
          scheduledFor: s.scheduledFor,
          durationMinutes: s.durationMinutes,
          trainingName: s.regularTraining?.name,
          clientName: s.regularTraining?.client?.name,
        })),
        clients,
      };
    })
  );

  res.json({ team: stats, generatedAt: new Date().toISOString() });
});

// Reassign a client to a different coordinator (Bhavneet/Mitali allocation)
coordinatorDashboardRouter.patch('/reallocate/:clientId', async (req: AuthedRequest, res) => {
  const { newHostOwnerId } = req.body || {};
  if (!newHostOwnerId) return res.status(400).json({ error: 'newHostOwnerId required' });

  // Can only reassign within team
  const team = teamFor(req.user!.role);
  if (!team.includes(newHostOwnerId)) {
    return res.status(403).json({ error: 'Can only assign to coordinators within your team' });
  }

  const client = await prisma.client.findUnique({
    where: { id: req.params.clientId },
    select: { id: true, name: true, hostOwnerId: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Verify current owner is in team
  if (client.hostOwnerId && !team.includes(client.hostOwnerId)) {
    return res.status(403).json({ error: 'Client not in your team scope' });
  }

  const updated = await prisma.client.update({
    where: { id: client.id },
    data: { hostOwnerId: newHostOwnerId, assignedAmId: newHostOwnerId },
    select: { id: true, name: true, hostOwner: { select: { id: true, name: true } } },
  });

  // Also update all active RT rows so My Sessions reflects the change immediately
  await prisma.regularTraining.updateMany({
    where: { clientId: client.id, status: 'active' },
    data: { hostedByDefaultId: newHostOwnerId },
  });

  res.json(updated);
});

// Team summary — per-coordinator card data for the dashboard overview
coordinatorDashboardRouter.get('/team-summary', async (_req: AuthedRequest, res) => {
  const today = new Date().toISOString().slice(0, 10);

  // Only account_manager and lead roles
  const coordinators = await prisma.user.findMany({
    where: { role: { in: ['account_manager', 'lead'] }, active: true },
    select: { id: true, name: true, role: true },
  });

  const summaries = await Promise.all(
    coordinators.map(async (coord) => {
      const [activeClients, sessionsToday, pendingTasks, escalations] = await Promise.all([
        prisma.regularTraining.count({
          where: { hostedByDefaultId: coord.id, status: 'active' },
        }),
        prisma.regularTraining.count({
          where: {
            hostedByDefaultId: coord.id,
            status: 'active',
            sessions: {
              some: {
                scheduledFor: {
                  gte: new Date(`${today}T00:00:00.000Z`),
                  lte: new Date(`${today}T23:59:59.999Z`),
                },
              },
            },
          },
        }),
        prisma.task.count({
          where: { ownerId: coord.id, status: { not: 'Done' } },
        }),
        prisma.regularTraining.count({
          where: { hostedByDefaultId: coord.id, demoEscalationRequested: true, status: 'active' },
        }),
      ]);

      return {
        id: coord.id,
        name: coord.name,
        role: coord.role,
        activeClients,
        sessionsToday,
        pendingTasks,
        escalations,
        atRiskClients: 0, // clientMood field not in schema
      };
    })
  );

  res.json({ coordinators: summaries });
});
