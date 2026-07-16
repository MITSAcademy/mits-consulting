import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireRole, AuthedRequest } from '../lib/auth';

export const integrityCheckRouter = Router();

interface CheckItem {
  id: string;
  label: string;
  detail: string;
}

interface Check {
  id: string;
  severity: 'critical' | 'warning';
  title: string;
  description: string;
  count: number;
  items: CheckItem[];
}

integrityCheckRouter.get('/', requireRole('founder', 'manager'), async (_req: AuthedRequest, res) => {
  const checks: Check[] = [];

  // ── CRITICAL ──────────────────────────────────────────────────────────────

  // 1. Active trainings with no client
  const trainingNoClient = await prisma.regularTraining.findMany({
    where: { status: 'active', clientId: null },
    select: { id: true, name: true, trainer: { select: { name: true } } },
    take: 50,
  });
  checks.push({
    id: 'training_no_client',
    severity: 'critical',
    title: 'Active trainings with no client',
    description: 'These active RegularTraining records have no client linked. They will not appear on any client profile.',
    count: trainingNoClient.length,
    items: trainingNoClient.map((t) => ({
      id: t.id,
      label: t.name,
      detail: `trainer: ${t.trainer?.name || 'none'}`,
    })),
  });

  // 2. Active trainings with no trainer
  const trainingNoTrainer = await prisma.regularTraining.findMany({
    where: { status: 'active', trainerId: null },
    select: { id: true, name: true, client: { select: { name: true } } },
    take: 50,
  });
  checks.push({
    id: 'training_no_trainer',
    severity: 'critical',
    title: 'Active trainings with no trainer',
    description: 'These active RegularTraining records have no trainer assigned.',
    count: trainingNoTrainer.length,
    items: trainingNoTrainer.map((t) => ({
      id: t.id,
      label: t.name,
      detail: `client: ${t.client?.name || 'none'}`,
    })),
  });

  // 3. Active trainings with no host
  const trainingNoHost = await prisma.regularTraining.findMany({
    where: { status: 'active', hostedByDefaultId: null },
    select: { id: true, name: true, client: { select: { name: true } } },
    take: 50,
  });
  checks.push({
    id: 'training_no_host',
    severity: 'critical',
    title: 'Active trainings with no host',
    description: 'These active RegularTraining records have no default host (hostedByDefaultId is null).',
    count: trainingNoHost.length,
    items: trainingNoHost.map((t) => ({
      id: t.id,
      label: t.name,
      detail: `client: ${t.client?.name || 'none'}`,
    })),
  });

  // 4. Session logs with no client
  const sessionNoClient = await prisma.sessionLog.findMany({
    where: { clientId: null },
    select: { id: true, date: true, trainer: { select: { name: true } } },
    orderBy: { date: 'desc' },
    take: 50,
  });
  checks.push({
    id: 'sessionlog_no_client',
    severity: 'critical',
    title: 'Session logs with no client',
    description: 'These SessionLog entries have no client linked — they will not appear on any client profile.',
    count: sessionNoClient.length,
    items: sessionNoClient.map((s) => ({
      id: s.id,
      label: `Session on ${String(s.date).slice(0, 10)}`,
      detail: `trainer: ${s.trainer?.name || 'none'}`,
    })),
  });

  // 5. Feedback with wrong trainer (trainer doesn't match any active training for that client)
  const allFeedbackRaw = await prisma.feedback.findMany({
    where: {},
    select: {
      id: true,
      clientId: true,
      trainerId: true,
      weekStart: true,
    },
  });
  const allFeedback = allFeedbackRaw.filter((f) => !!f.trainerId);

  // Fetch trainer/client names for display separately
  const feedbackClientIds = [...new Set(allFeedback.map((f) => f.clientId))];
  const feedbackTrainerIds = [...new Set(allFeedback.map((f) => f.trainerId!))];
  const [fbClients, fbTrainers] = await Promise.all([
    prisma.client.findMany({ where: { id: { in: feedbackClientIds } }, select: { id: true, name: true } }),
    prisma.trainer.findMany({ where: { id: { in: feedbackTrainerIds } }, select: { id: true, name: true } }),
  ]);
  const fbClientMap = new Map(fbClients.map((c) => [c.id, c.name]));
  const fbTrainerMap = new Map(fbTrainers.map((t) => [t.id, t.name]));

  // Collect unique (clientId, trainerId) pairs
  const pairSet = new Map<string, { clientId: string; trainerId: string }>();
  for (const f of allFeedback) {
    const key = `${f.clientId}::${f.trainerId}`;
    if (!pairSet.has(key)) {
      pairSet.set(key, { clientId: f.clientId!, trainerId: f.trainerId! });
    }
  }
  const pairs = Array.from(pairSet.values());

  // Single query to find valid (clientId, trainerId) pairs that have an active training
  const validTrainings = pairs.length > 0
    ? await prisma.regularTraining.findMany({
        where: {
          OR: pairs.map((p) => ({
            clientId: p.clientId,
            trainerId: p.trainerId,
            status: 'active',
          })),
        },
        select: { clientId: true, trainerId: true },
      })
    : [];

  const validPairSet = new Set(validTrainings.map((t) => `${t.clientId}::${t.trainerId}`));

  const wrongTrainerFeedback = allFeedback
    .filter((f) => !validPairSet.has(`${f.clientId}::${f.trainerId}`))
    .slice(0, 50);

  checks.push({
    id: 'feedback_wrong_trainer',
    severity: 'critical',
    title: 'Feedback linked to wrong trainer',
    description: 'These feedback records reference a trainer who has no active RegularTraining for that client.',
    count: wrongTrainerFeedback.length,
    items: wrongTrainerFeedback.map((f) => ({
      id: f.id,
      label: fbClientMap.get(f.clientId) || f.clientId || 'Unknown client',
      detail: `trainer: ${f.trainerId ? (fbTrainerMap.get(f.trainerId) || 'unknown') : 'none'} · week: ${f.weekStart ? String(f.weekStart).slice(0, 10) : 'unknown'}`,
    })),
  });

  // ── WARNING ───────────────────────────────────────────────────────────────

  // 6. Renewal payments where client has no active training
  const paymentNoTraining = await prisma.payment.findMany({
    where: {
      kind: 'Renewal',
      client: { regularTrainings: { none: { status: 'active' } } },
    },
    select: {
      id: true,
      amount: true,
      currency: true,
      paymentDate: true,
      client: { select: { name: true } },
    },
    orderBy: { paymentDate: 'desc' },
    take: 50,
  });
  checks.push({
    id: 'payment_no_active_training',
    severity: 'warning',
    title: 'Renewal payments with no active training',
    description: 'These Renewal payments belong to clients who currently have no active RegularTraining.',
    count: paymentNoTraining.length,
    items: paymentNoTraining.map((p) => ({
      id: p.id,
      label: p.client?.name || 'Unknown client',
      detail: `${p.currency || ''} ${p.amount} on ${p.paymentDate ? String(p.paymentDate).slice(0, 10) : 'unknown'}`.trim(),
    })),
  });

  // 7. Active training clients with no payDate2
  const clientNoPaydate = await prisma.client.findMany({
    where: {
      regularTrainings: { some: { status: 'active' } },
      payDate2: null,
    },
    select: { id: true, name: true, payDate1: true },
  });
  checks.push({
    id: 'client_no_paydate',
    severity: 'warning',
    title: 'Active clients missing next pay date',
    description: 'These clients have an active training but no payDate2 (next due date) set.',
    count: clientNoPaydate.length,
    items: clientNoPaydate.slice(0, 50).map((c) => ({
      id: c.id,
      label: c.name,
      detail: `last paid: ${c.payDate1 ? String(c.payDate1).slice(0, 10) : 'never'}`,
    })),
  });

  // 8. Active trainings with inactive trainer
  const trainingInactiveTrainer = await prisma.regularTraining.findMany({
    where: { status: 'active', trainer: { active: false } },
    select: {
      id: true,
      name: true,
      client: { select: { name: true } },
      trainer: { select: { name: true, active: true } },
    },
    take: 50,
  });
  checks.push({
    id: 'training_inactive_trainer',
    severity: 'warning',
    title: 'Active trainings with inactive trainer',
    description: 'These active trainings are assigned to trainers who have been marked as inactive.',
    count: trainingInactiveTrainer.length,
    items: trainingInactiveTrainer.map((t) => ({
      id: t.id,
      label: t.name,
      detail: `trainer ${t.trainer?.name || 'unknown'} is inactive`,
    })),
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  const critical = checks
    .filter((c) => c.severity === 'critical' && c.count > 0)
    .reduce((n, c) => n + c.count, 0);
  const warning = checks
    .filter((c) => c.severity === 'warning' && c.count > 0)
    .reduce((n, c) => n + c.count, 0);

  res.json({
    summary: {
      totalIssues: critical + warning,
      critical,
      warning,
    },
    checks,
  });
});
