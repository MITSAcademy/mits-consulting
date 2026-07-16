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
      client: { select: { name: true, lifecycle: true } },
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
      detail: `${p.currency || ''} ${p.amount} on ${p.paymentDate ? String(p.paymentDate).slice(0, 10) : 'unknown'} · status: ${p.client?.lifecycle || 'unknown'}`.trim(),
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

  // ── BACKFILL GAPS (records created before the FK columns were added) ──────

  // 9. SessionLogs with no regularTrainingId (old records, created before migration)
  const sessionNoTrainingId = await prisma.sessionLog.findMany({
    where: { regularTrainingId: null },
    select: {
      id: true, date: true,
      client: { select: { name: true } },
      trainer: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
    take: 100,
  });
  checks.push({
    id: 'sessionlog_no_training_id',
    severity: 'warning',
    title: 'Session logs not linked to a RegularTraining (backfill needed)',
    description: 'These session logs were created before the regularTrainingId column was added. They are not formally linked to any training record.',
    count: sessionNoTrainingId.length,
    items: sessionNoTrainingId.map((s) => ({
      id: s.id,
      label: `${s.client?.name || 'Unknown client'} · ${String(s.date).slice(0, 10)}`,
      detail: `trainer: ${s.trainer?.name || 'none'}`,
    })),
  });

  // 10. Payments with no trainerId (old records, created before migration)
  const paymentNoTrainer = await prisma.payment.findMany({
    where: { trainerId: null },
    select: {
      id: true, paymentDate: true, amount: true, currency: true,
      client: { select: { name: true, lifecycle: true } },
    },
    orderBy: { paymentDate: 'desc' },
    take: 100,
  });
  checks.push({
    id: 'payment_no_trainer_id',
    severity: 'warning',
    title: 'Payments not linked to a trainer (backfill needed)',
    description: 'These payments were created before the trainerId column was added. They have no trainer linked.',
    count: paymentNoTrainer.length,
    items: paymentNoTrainer.map((p) => ({
      id: p.id,
      label: `${p.client?.name || 'Unknown client'} · ${String(p.paymentDate).slice(0, 10)}`,
      detail: `${p.currency} ${p.amount} · client status: ${p.client?.lifecycle || 'unknown'}`,
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

// POST /api/integrity-check/backfill — auto-fix regularTrainingId + trainerId on old records
// Matches each SessionLog/Payment to an active RegularTraining by clientId+trainerId
integrityCheckRouter.post('/backfill', requireRole('founder'), async (_req: AuthedRequest, res) => {
  let sessionFixed = 0, sessionSkipped = 0;
  let paymentFixed = 0, paymentSkipped = 0;

  // ── Backfill SessionLog.regularTrainingId ──────────────────────────────────
  const logsToFix = await prisma.sessionLog.findMany({
    where: { regularTrainingId: null, clientId: { not: null } },
    select: { id: true, clientId: true, trainerId: true },
  });

  for (const log of logsToFix) {
    // Pass 1: exact match by clientId + trainerId (any status)
    const training = await prisma.regularTraining.findFirst({
      where: { clientId: log.clientId!, trainerId: log.trainerId },
      select: { id: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    if (training) {
      await prisma.sessionLog.update({ where: { id: log.id }, data: { regularTrainingId: training.id } });
      sessionFixed++;
      continue;
    }
    // Pass 2: any training for this client (trainer may have changed)
    const anyTraining = await prisma.regularTraining.findFirst({
      where: { clientId: log.clientId! },
      select: { id: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    if (anyTraining) {
      await prisma.sessionLog.update({ where: { id: log.id }, data: { regularTrainingId: anyTraining.id } });
      sessionFixed++;
      continue;
    }
    sessionSkipped++;
  }

  // ── Backfill Payment.trainerId ─────────────────────────────────────────────
  const paymentsToFix = await prisma.payment.findMany({
    where: { trainerId: null },
    select: { id: true, clientId: true },
  });

  for (const payment of paymentsToFix) {
    // Pass 1: any RegularTraining for this client with a trainer (active first)
    const training = await prisma.regularTraining.findFirst({
      where: { clientId: payment.clientId, trainerId: { not: null } },
      select: { trainerId: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    if (training?.trainerId) {
      await prisma.payment.update({ where: { id: payment.id }, data: { trainerId: training.trainerId } });
      paymentFixed++;
      continue;
    }
    // Pass 2: fall back to client.primaryTrainerId
    const client = await prisma.client.findUnique({
      where: { id: payment.clientId },
      select: { primaryTrainerId: true },
    });
    if (client?.primaryTrainerId) {
      await prisma.payment.update({ where: { id: payment.id }, data: { trainerId: client.primaryTrainerId } });
      paymentFixed++;
      continue;
    }
    // Pass 3: infer from most recent Feedback for this client
    const recentFeedback = await prisma.feedback.findFirst({
      where: { clientId: payment.clientId, trainerId: { not: null } },
      select: { trainerId: true },
      orderBy: { weekStart: 'desc' },
    });
    if (recentFeedback?.trainerId) {
      await prisma.payment.update({ where: { id: payment.id }, data: { trainerId: recentFeedback.trainerId } });
      paymentFixed++;
      continue;
    }
    paymentSkipped++;
  }

  res.json({
    sessionLogs: { fixed: sessionFixed, skipped: sessionSkipped },
    payments: { fixed: paymentFixed, skipped: paymentSkipped },
    message: `Fixed ${sessionFixed} session logs and ${paymentFixed} payments. Skipped ${sessionSkipped + paymentSkipped} with no matching training.`,
  });
});

// POST /api/integrity-check/fix-feedback-trainers
// For every feedback record whose (clientId, trainerId) pair has no active training,
// re-point trainerId to the trainer on that client's active RegularTraining.
integrityCheckRouter.post('/fix-feedback-trainers', requireRole('founder'), async (_req: AuthedRequest, res) => {
  // Get all feedback with a trainerId
  const feedbacks = await prisma.feedback.findMany({
    where: { trainerId: { not: null } },
    select: { id: true, clientId: true, trainerId: true },
  });

  let fixed = 0;
  let skipped = 0;

  for (const fb of feedbacks) {
    // Check if the current (clientId, trainerId) pair has a valid active training
    const validTraining = await prisma.regularTraining.findFirst({
      where: { clientId: fb.clientId, trainerId: fb.trainerId!, status: 'active' },
      select: { id: true },
    });
    if (validTraining) continue; // already correct

    // Find the active training for this client with any trainer
    const activeTraining = await prisma.regularTraining.findFirst({
      where: { clientId: fb.clientId, status: 'active', trainerId: { not: null } },
      select: { trainerId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (activeTraining?.trainerId) {
      await prisma.feedback.update({ where: { id: fb.id }, data: { trainerId: activeTraining.trainerId } });
      fixed++;
    } else {
      skipped++;
    }
  }

  res.json({ fixed, skipped, message: `Fixed ${fixed} feedback records. Skipped ${skipped} with no active training for client.` });
});

// POST /api/integrity-check/fix-feedback-trainer
// Finds the trainer by phone, creates a RegularTraining for the client, fixing the critical feedback mismatch.
// Body: { clientPhone?: string, clientName?: string, trainerPhone: string, trainingName?: string }
integrityCheckRouter.post('/fix-feedback-trainer', requireRole('founder'), async (req: AuthedRequest, res) => {
  const { clientPhone, clientName, trainerPhone, trainingName } = req.body as {
    clientPhone?: string;
    clientName?: string;
    trainerPhone?: string;
    trainingName?: string;
  };

  if (!trainerPhone) return res.status(400).json({ error: 'trainerPhone is required' });

  // Find trainer by phone (strip non-digits for comparison)
  const digitsOnly = (s: string) => s.replace(/\D/g, '');
  const trainerDigits = digitsOnly(trainerPhone);

  const allTrainers = await prisma.trainer.findMany({ select: { id: true, name: true, phone: true, phoneDigits: true } });
  const trainer = allTrainers.find((t) => {
    const p = t.phoneDigits || t.phone || '';
    return digitsOnly(p).endsWith(trainerDigits) || trainerDigits.endsWith(digitsOnly(p));
  });
  if (!trainer) return res.status(404).json({ error: `No trainer found with phone containing ${trainerPhone}` });

  // Find client
  let client = null;
  if (clientPhone) {
    const phoneDigits = digitsOnly(clientPhone);
    const allClients = await prisma.client.findMany({ select: { id: true, name: true, phone: true } });
    client = allClients.find((c) => {
      const p = c.phone || '';
      return digitsOnly(p).endsWith(phoneDigits) || phoneDigits.endsWith(digitsOnly(p));
    }) || null;
  }
  if (!client && clientName) {
    client = await prisma.client.findFirst({
      where: { name: { contains: clientName, mode: 'insensitive' } },
      select: { id: true, name: true, phone: true },
    });
  }
  if (!client) return res.status(404).json({ error: 'Client not found. Provide clientPhone or clientName.' });

  // Check if active training already exists
  const existing = await prisma.regularTraining.findFirst({
    where: { clientId: client.id, trainerId: trainer.id, status: 'active' },
  });
  if (existing) {
    return res.json({ alreadyExists: true, trainingId: existing.id, client: client.name, trainer: trainer.name });
  }

  // Create the RegularTraining
  const training = await prisma.regularTraining.create({
    data: {
      name: trainingName || `${client.name} – ${trainer.name}`,
      clientId: client.id,
      trainerId: trainer.id,
      status: 'active',
    },
  });

  res.json({
    created: true,
    trainingId: training.id,
    trainingName: training.name,
    client: client.name,
    trainer: trainer.name,
  });
});

// DELETE /api/integrity-check/dummy-clients — remove all dummy_* test clients and their data
integrityCheckRouter.delete('/dummy-clients', requireRole('founder'), async (_req: AuthedRequest, res) => {
  const dummies = await prisma.client.findMany({
    where: { name: { startsWith: 'dummy', mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (dummies.length === 0) return res.json({ deleted: 0, names: [] });

  const ids = dummies.map((c) => c.id);

  // Delete cascade-dependent records first (in case DB doesn't cascade automatically)
  await prisma.sessionLog.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.feedback.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.regularTraining.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });

  res.json({ deleted: dummies.length, names: dummies.map((c) => c.name) });
});
