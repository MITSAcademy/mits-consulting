import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const logs = await p.sessionLog.findMany({
    where: { sessionHappened: true },
    select: { id: true, hours: true, rateSnapshot: true, rateModel: true, amountInr: true },
  });

  let updated = 0;
  for (const log of logs) {
    if (!log.rateSnapshot || log.rateSnapshot === 0) continue;
    let correct: number;
    if (log.rateModel === 'per_session') {
      const sessions = log.hours <= 1.0 ? 0.5 : 1;
      correct = Math.round(sessions * log.rateSnapshot);
    } else {
      correct = Math.round(log.hours * log.rateSnapshot);
    }
    if (correct !== log.amountInr) {
      await p.sessionLog.update({ where: { id: log.id }, data: { amountInr: correct } });
      updated++;
    }
  }
  console.log(`Updated ${updated} / ${logs.length} session logs`);
}
main().finally(() => p.$disconnect());
