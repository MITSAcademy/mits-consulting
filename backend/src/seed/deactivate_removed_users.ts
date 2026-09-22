/**
 * One-time migration: deactivate Malika, Roshni, and Ashok.
 * Roshni's role has been taken over by Mohini; the other two are no longer in the system.
 * Data (payments, client assignments) is preserved — only active=false so they stop
 * appearing in dropdowns and receiving emails.
 *
 * Run: npx ts-node src/seed/deactivate_removed_users.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const IDS = ['u-malika', 'u-roshni', 'u-ashok'];

  const result = await prisma.user.updateMany({
    where: { id: { in: IDS } },
    data: { active: false },
  });

  console.log(`Deactivated ${result.count} users: ${IDS.join(', ')}`);

  for (const id of IDS) {
    const u = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, active: true } });
    console.log(`  ${u?.name} (${u?.id}) — active: ${u?.active}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
