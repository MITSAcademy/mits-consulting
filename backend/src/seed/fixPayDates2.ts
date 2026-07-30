/**
 * Round 2: fix remaining bad dates using exact Excel sheet values.
 * Run with: npm run seed:fix-pay-dates-2
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fix(name: string, payDate1: string | null, payDate2: string | null) {
  const matches = await prisma.client.findMany({
    where: { name: { contains: name, mode: 'insensitive' } },
    select: { id: true, name: true, payDate1: true, payDate2: true },
  });
  if (matches.length === 0) { console.log(`  ✗ NOT FOUND: ${name}`); return; }
  for (const c of matches) {
    await prisma.client.update({ where: { id: c.id }, data: { payDate1, payDate2 } });
    console.log(`  ✓ ${c.name} (${c.id}): ${c.payDate1||'NA'} / ${c.payDate2||'NA'} → ${payDate1||'NA'} / ${payDate2||'NA'}`);
  }
}

async function fixById(id: string, payDate1: string | null, payDate2: string | null, label: string) {
  const c = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true, payDate1: true, payDate2: true } });
  if (!c) { console.log(`  ✗ NOT FOUND: ${id}`); return; }
  await prisma.client.update({ where: { id }, data: { payDate1, payDate2 } });
  console.log(`  ✓ ${label} / ${c.name} (${c.id}): ${c.payDate1||'NA'} / ${c.payDate2||'NA'} → ${payDate1||'NA'} / ${payDate2||'NA'}`);
}

async function main() {
  console.log('=== fixPayDates2 (from Excel) ===\n');

  // Row 2: Nikhil Amit — 30 Jun / 14 Jul (both past — these are overdue, keep as is for now, team will update when paid)
  // Row 3: Saiteja — 10 Jul / 26 Jul (overdue)
  // Row 5: Methan — already fixed to 21 Aug / 4 Sep — but Excel says 21 Jul / 28 Jul
  // These are overdue clients — restore to Excel values so team knows what was expected
  await fix('Nikhil Amit',   '2026-06-30', '2026-07-14');
  await fix('Saiteja',       '2026-07-10', '2026-07-26');
  await fix('Methan',        '2026-07-21', '2026-07-28');
  await fix('Harshita',      '2026-07-26', '2026-08-09');
  await fix('Bipana',        '2026-07-29', '2026-08-12');
  await fix('Rahul',         '2026-07-29', '2026-08-12');
  await fix('Sunny',         '2026-07-29', '2026-08-12');

  // Row 10: Bhavik (30 Jul / 14 Aug)
  // Row 11: Sai Shivani — 30 Jul / 13 Aug
  await fix('Sai shivani',   '2026-07-30', '2026-08-13');

  // Row 16: Chandrika — 3 Aug / 10 Aug (was NA / 3 Aug)
  await fix('Chandrika',     '2026-08-03', '2026-08-10');

  // Row 21: Sujath — 4 Aug / 11 Aug
  await fix('Sujath',        '2026-08-04', '2026-08-11');

  // Row 22: Sirisha testing — 5 Aug / 19 Aug
  await fix('Sirisha',       '2026-08-05', '2026-08-19');

  // Row 23: Training Pravallika — 5 Aug / 12 Aug
  await fix('Pravallika',    '2026-08-05', '2026-08-12');

  // Row 28: Satvik arun — 7 Aug only (single date in Excel = PD1, no PD2)
  await fix('Satvik',        '2026-08-07', null);

  // Row 30: Lallitha Jadhav — 9 Aug only
  await fix('Lallitha',      '2026-08-09', null);
  await fix('Lalita',        '2026-08-09', null);

  // Row 33: Sruthi — 10 Aug only
  await fix('Sruthi',        '2026-08-10', null);
  await fix('Shruthi',       '2026-08-10', null);

  // Row 35: Ambika — 11 Aug only
  await fix('Ambika',        '2026-08-11', null);

  // Row 36: Amrutha — 11 Aug / 25 Aug
  await fix('Amrutha',       '2026-08-11', '2026-08-25');

  // Row 37: Raja — 11 Aug only
  await fix('Raja',          '2026-08-11', null);

  // Row 38: Pawan — 12 Aug / 24 Aug
  await fix('Pawan',         '2026-08-12', '2026-08-24');

  // Row 39: Vandhana — 12 Aug / 26 Aug
  await fix('Vandhana',      '2026-08-12', '2026-08-26');

  // Row 40: Teju — 15 Aug only
  await fix('Teju',          '2026-08-15', null);

  // Row 41: Rohit — 17 Aug only
  await fix('Rohit',         '2026-08-17', null);

  // Row 42: Priyanka shivansh — 20 Aug only
  await fix('Priyanka shivansh', '2026-08-20', null);

  // Row 43: Meghna (second one) — 23 Aug only
  // Row 44: Sharon Gforce — 27 Aug only
  await fix('Sharon',        '2026-08-27', null);

  // Row 45: Anurag Jadhav — 31 Aug only
  await fix('Anurag',        '2026-08-31', null);

  // Row 46: Training Pramod — 31 Aug only
  await fix('Pramod',        '2026-08-31', null);

  // Rows 47-49: Training Sathvik, Training Scada Shalini, Training Testing Deepthi — NA/NA
  await fix('Training Sathvik',  null, null);
  await fix('Training Shalini',  null, null);
  await fix('Training Deepthi',  null, null);

  // Veer — 10 Aug / 24 Aug
  await fix('Veer',          '2026-08-10', '2026-08-24');

  // Sirija — 10 Aug / 24 Aug (already set but confirm)
  await fix('Sirija',        '2026-08-10', '2026-08-24');

  // Yashwanthi — 7 Aug / 21 Aug (already set)

  console.log('\n=== Done ===');
}

main().catch(console.error).finally(() => prisma.$disconnect());
