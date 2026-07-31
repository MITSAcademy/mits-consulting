import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  // Only confirmed mismatch vs Excel:
  // Priyanka shivansh: DB has PD1=1 Aug, PD2=8 Aug (monthly) — Excel says 20 Aug / NA
  const priyanka = await p.client.findFirst({
    where: { name: { equals: 'Priyanka shivansh', mode: 'insensitive' }, lifecycle: 'Active' },
    select: { id: true, name: true },
  });
  if (priyanka) {
    await p.client.update({ where: { id: priyanka.id }, data: { paymentFrequency: 'monthly', payDate1: '2026-08-20', payDate2: null } });
    console.log(`✓ ${priyanka.name}: monthly | 20 Aug | NA`);
  } else {
    console.log('NOT FOUND: Priyanka shivansh');
  }
  console.log('Done');
}
main().finally(() => p.$disconnect());
