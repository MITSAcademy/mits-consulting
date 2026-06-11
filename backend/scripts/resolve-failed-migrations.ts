import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Delete any failed migration records so prisma migrate deploy can proceed.
  // Safe to run repeatedly — only removes rows with rolled_back_at IS NULL AND finished_at IS NULL.
  const result = await prisma.$executeRawUnsafe(`
    DELETE FROM "_prisma_migrations"
    WHERE finished_at IS NULL
      AND rolled_back_at IS NULL
      AND started_at IS NOT NULL
  `);
  if (result > 0) console.log(`Cleared ${result} failed migration record(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
