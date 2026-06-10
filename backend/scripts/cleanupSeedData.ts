/**
 * Remove seeded / demo / test data from RegularTraining, Client, Trainer.
 * Keeps only real records (those with real phone numbers or matching the sheet).
 *
 * Run: npx tsx scripts/cleanupSeedData.ts
 *
 * SAFE — only archives RegularTrainings (soft delete), does NOT delete Clients
 * or Trainers since they may have payment history / session logs.
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Names that are clearly demo/seed data — adjust as needed
const DEMO_CLIENT_NAMES = [
  'Alice Johnson', 'Bob Smith', 'Carol White', 'David Brown',
  'Test Client', 'Demo Client', 'Sample', 'Seed',
];

const DEMO_TRAINER_NAMES = [
  'Test Trainer', 'Demo Trainer', 'Sample Trainer',
];

async function main() {
  // 1. Archive RegularTrainings with no client, no trainer, or demo names
  const demoTrainings = await prisma.regularTraining.findMany({
    where: {
      OR: [
        { client: { name: { in: DEMO_CLIENT_NAMES } } },
        { trainer: { name: { in: DEMO_TRAINER_NAMES } } },
        { AND: [{ clientId: null }, { trainerId: null }] },
      ],
      status: { not: 'archived' },
    },
    select: { id: true, name: true },
  });

  if (demoTrainings.length === 0) {
    console.log('No demo RegularTrainings found — nothing to clean up.');
  } else {
    console.log(`Archiving ${demoTrainings.length} demo trainings:`);
    for (const t of demoTrainings) {
      await prisma.regularTraining.update({ where: { id: t.id }, data: { status: 'archived' } });
      console.log(`  archived: ${t.name}`);
    }
  }

  // 2. Show summary of what remains
  const active = await prisma.regularTraining.count({ where: { status: 'active' } });
  const archived = await prisma.regularTraining.count({ where: { status: 'archived' } });
  console.log(`\nResult: ${active} active, ${archived} archived trainings.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
