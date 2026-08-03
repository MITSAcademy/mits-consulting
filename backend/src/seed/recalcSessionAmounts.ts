import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

function hoursToSessions(h: number): number { return h <= 1.0 ? 0.5 : 1; }

async function main() {
  const logs = await p.sessionLog.findMany({
    where: { sessionHappened: true },
    select: { id: true, hours: true, rateSnapshot: true, rateModel: true, amountInr: true },
  });

  const updates: { id: string; amountInr: number }[] = [];
  for (const log of logs) {
    if (!log.rateSnapshot) continue;
    const correct = log.rateModel === 'per_session'
      ? Math.round(hoursToSessions(log.hours) * log.rateSnapshot)
      : Math.round(log.hours * log.rateSnapshot);
    if (correct !== log.amountInr) updates.push({ id: log.id, amountInr: correct });
  }

  if (updates.length > 0) {
    await p.$transaction(updates.map(({ id, amountInr }) =>
      p.sessionLog.update({ where: { id }, data: { amountInr } })
    ));
  }
  console.log(`Updated ${updates.length} / ${logs.length} session logs`);
}
main().finally(() => p.$disconnect());
