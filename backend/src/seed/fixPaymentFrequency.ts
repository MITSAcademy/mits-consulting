/**
 * Set paymentFrequency for clients based on Excel sheet.
 * Monthly = single pay date only. NA = training already paid, no dates.
 * Run with: npm run seed:fix-payment-frequency
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setFreq(name: string, frequency: string) {
  const matches = await prisma.client.findMany({
    where: { name: { contains: name, mode: 'insensitive' } },
    select: { id: true, name: true, paymentFrequency: true },
  });
  if (matches.length === 0) { console.log(`  ✗ NOT FOUND: ${name}`); return; }
  for (const c of matches) {
    await prisma.client.update({ where: { id: c.id }, data: { paymentFrequency: frequency } });
    console.log(`  ✓ ${c.name} → ${frequency}`);
  }
}

async function main() {
  console.log('=== fixPaymentFrequency ===\n');

  // Monthly clients (single pay date in Excel)
  await setFreq('Satvik arun',       'monthly');
  await setFreq('Lallitha',          'monthly');
  await setFreq('Lalita',            'monthly');
  await setFreq('Sruthi',            'monthly');
  await setFreq('Shruthi',           'monthly');
  await setFreq('Ambika',            'monthly');
  await setFreq('Raja',              'monthly');
  await setFreq('Teju',              'monthly');
  await setFreq('Rohit',             'monthly');
  await setFreq('Priyanka shivansh', 'monthly');
  await setFreq('Sharon',            'monthly');
  await setFreq('Anurag',            'monthly');
  await setFreq('Pramod',            'monthly');

  // Second Meghna (23 Aug only) — find by payDate1 = 2026-08-23
  const meghnas = await prisma.client.findMany({
    where: { name: { contains: 'meghna', mode: 'insensitive' } },
    select: { id: true, name: true, payDate1: true },
  });
  for (const m of meghnas) {
    const freq = m.payDate1 === '2026-08-23' ? 'monthly' : 'biweekly';
    await prisma.client.update({ where: { id: m.id }, data: { paymentFrequency: freq } });
    console.log(`  ✓ ${m.name} (PD1: ${m.payDate1}) → ${freq}`);
  }

  // NA clients — training already paid, no dates needed
  await setFreq('Training Sathvik',  'na');
  await setFreq('Training Shalini',  'na');
  await setFreq('Training Deepthi',  'na');

  console.log('\n=== Done ===');
}

main().catch(console.error).finally(() => prisma.$disconnect());
