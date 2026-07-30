import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixMonthly(name: string, payDate1: string) {
  const matches = await prisma.client.findMany({
    where: { name: { contains: name, mode: 'insensitive' } },
    select: { id: true, name: true, payDate1: true, paymentFrequency: true },
  });
  if (!matches.length) { console.log(`  ✗ NOT FOUND: ${name}`); return; }
  for (const c of matches) {
    if (c.name.toLowerCase().includes('training')) continue;
    await prisma.client.update({ where: { id: c.id }, data: { paymentFrequency: 'monthly', payDate1, payDate2: null } });
    console.log(`  ✓ ${c.name}: PD1=${payDate1}, PD2=null, freq=monthly`);
  }
}

async function main() {
  console.log('=== fix4: restore monthly clients payDate1 ===\n');

  await fixMonthly('Ambika',            '2026-08-11');
  await fixMonthly('Anurag',            '2026-08-31');
  await fixMonthly('Lalita',            '2026-08-09');
  await fixMonthly('Lallitha',          '2026-08-09');
  await fixMonthly('Pramod',            '2026-08-31');
  await fixMonthly('Raja',              '2026-08-11');
  await fixMonthly('Rohit',             '2026-08-17');
  await fixMonthly('Sharon',            '2026-08-27');
  await fixMonthly('Shruthi',           '2026-08-10');
  await fixMonthly('Sruthi',            '2026-08-10');
  await fixMonthly('Teju',              '2026-08-15');
  await fixMonthly('Priyanka shivansh', '2026-08-20');
  await fixMonthly('Satvik',            '2026-08-07');

  // Second Meghna (23 Aug, monthly) — find by createdAt order or email
  const meghnas = await prisma.client.findMany({
    where: { name: { contains: 'meghna', mode: 'insensitive' } },
    select: { id: true, name: true, payDate1: true, payDate2: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log('\nMeghnas found:');
  meghnas.forEach((m, i) => console.log(`  [${i}] ${m.name} | PD1:${m.payDate1} PD2:${m.payDate2} | email:${m.email}`));
  // First Meghna = 7 Aug biweekly, second = 23 Aug monthly
  if (meghnas.length >= 2) {
    await prisma.client.update({ where: { id: meghnas[0].id }, data: { paymentFrequency: 'biweekly', payDate1: '2026-08-07', payDate2: '2026-08-21' } });
    console.log(`  ✓ ${meghnas[0].name} → biweekly 7 Aug / 21 Aug`);
    await prisma.client.update({ where: { id: meghnas[1].id }, data: { paymentFrequency: 'monthly', payDate1: '2026-08-23', payDate2: null } });
    console.log(`  ✓ ${meghnas[1].name} → monthly 23 Aug`);
  }

  // Rohit check — Excel has only one Rohit (17 Aug monthly). If two matched, second is wrong.
  const rohits = await prisma.client.findMany({
    where: { name: { contains: 'rohit', mode: 'insensitive' } },
    select: { id: true, name: true, payDate1: true, payDate2: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log('\nRohits found:', rohits.map(r => `${r.name} PD1:${r.payDate1}`).join(', '));

  // Anurag check — Excel has one Anurag Jadhav (31 Aug monthly)
  const anurag = await prisma.client.findMany({
    where: { name: { contains: 'anurag', mode: 'insensitive' } },
    select: { id: true, name: true, payDate1: true, payDate2: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log('Anurag found:', anurag.map(a => `${a.name} PD1:${a.payDate1}`).join(', '));

  console.log('\n=== Done ===');
}

main().catch(console.error).finally(() => prisma.$disconnect());
