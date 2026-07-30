import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Exact name match (case-insensitive, trimmed)
async function fixExact(name: string, pd1: string | null, pd2: string | null, freq = 'biweekly') {
  const matches = await prisma.client.findMany({
    where: { regularTrainings: { some: { status: 'active' } } },
    select: { id: true, name: true },
  });
  const exact = matches.filter(c => c.name.trim().toLowerCase() === name.toLowerCase());
  if (!exact.length) { console.log(`✗ NOT FOUND exact: "${name}"`); return; }
  for (const c of exact) {
    await prisma.client.update({ where: { id: c.id }, data: { payDate1: pd1, payDate2: pd2, paymentFrequency: freq } });
    console.log(`✓ "${c.name}": → ${pd1||'null'} / ${pd2||'null'} [${freq}]`);
  }
}

async function fixById(id: string, pd1: string | null, pd2: string | null, freq = 'biweekly', label = '') {
  await prisma.client.update({ where: { id }, data: { payDate1: pd1, payDate2: pd2, paymentFrequency: freq } });
  console.log(`✓ [${label||id}]: → ${pd1||'null'} / ${pd2||'null'} [${freq}]`);
}

async function main() {
  console.log('=== fix8: exact Excel sync ===\n');

  // First show all active clients so we can verify IDs for ambiguous ones
  const all = await prisma.client.findMany({
    where: { regularTrainings: { some: { status: 'active' } } },
    select: { id: true, name: true, payDate1: true, payDate2: true, paymentFrequency: true },
    orderBy: { name: 'asc' },
  });
  console.log('--- current state (active clients) ---');
  all.forEach(c => console.log(`[${c.id}] "${c.name}" ${c.payDate1||'null'} / ${c.payDate2||'null'} [${c.paymentFrequency}]`));
  console.log('--- end ---\n');

  await fixExact('Nikhil',           '2026-06-30', '2026-07-14'); // Nikhil Amit (t1405)
  await fixExact('Saiteja',          '2026-07-10', '2026-07-26');
  await fixExact('Akhil',            '2026-07-21', null,          'monthly');
  await fixExact('Methan',           '2026-07-21', '2026-07-28');
  await fixExact('Harshita',         '2026-07-26', '2026-08-09');
  await fixExact('Bipana',           '2026-07-29', '2026-08-12');
  await fixExact('Rahul',            '2026-07-29', '2026-08-12');
  await fixExact('Sunny',            '2026-07-29', '2026-08-12');
  await fixExact('Sai shivani',      '2026-07-30', '2026-08-13');
  await fixExact('Naveena',          '2026-08-01', '2026-08-15');
  await fixExact('Nikhit',           '2026-08-01', '2026-08-05');
  await fixExact('Shiva',            '2026-08-01', '2026-08-08');
  await fixExact('Ganesh',           '2026-08-02', '2026-08-16');
  await fixExact('Chandrika',        '2026-08-03', '2026-08-10');
  await fixExact('Naman',            '2026-08-03', '2026-08-17');
  await fixExact('Nikhil ',          '2026-08-04', '2026-08-18'); // Nikhil Arun (vf832, trailing space)
  await fixExact('Pradeep',          '2026-08-04', '2026-08-18');
  await fixExact('Raj',              '2026-08-04', '2026-08-18');
  await fixExact('Sujath',           '2026-08-04', '2026-08-11');
  await fixExact('Sirisha',          '2026-08-05', '2026-08-19');
  await fixExact('Pravallika',       '2026-08-05', '2026-08-12');
  await fixExact('Indu',             '2026-08-06', '2026-08-20');
  await fixExact('Ashrith',          '2026-08-07', '2026-08-21');
  await fixExact('Satvik',           '2026-08-07', null,          'monthly');
  await fixExact('Yashwanthi',       '2026-08-07', '2026-08-21');
  await fixExact('Lalita',           '2026-08-09', null,          'monthly');
  await fixExact('Yaswanth',         '2026-08-09', '2026-08-23');
  await fixExact('Sirija',           '2026-08-10', '2026-08-24');
  await fixExact('Sruthi',           '2026-08-10', null,          'monthly');
  await fixExact('Shruthi',          '2026-08-10', null,          'monthly');
  await fixExact('Veer',             '2026-08-10', '2026-08-24');
  await fixExact('Ambika',           '2026-08-11', null,          'monthly');
  await fixExact('Amrutha',          '2026-08-11', '2026-08-25');
  await fixExact('Raja',             '2026-08-11', null,          'monthly');
  await fixExact('Pawan',            '2026-08-12', '2026-08-24');
  await fixExact('Vandhana',         '2026-08-12', '2026-08-26');
  await fixExact('Teju',             '2026-08-15', null,          'monthly');
  await fixExact('Rohit',            '2026-08-17', null,          'monthly');
  await fixExact('Priyanka shivansh','2026-08-20', null,          'monthly');
  await fixExact('Sharon',           '2026-08-27', null,          'monthly');
  await fixExact('Anurag',           '2026-08-31', null,          'monthly');
  await fixExact('Pramod',           '2026-08-31', null,          'monthly');
  await fixExact('Training Sathvik', null,          null,          'na');
  await fixExact('Training Shalini', null,          null,          'na');
  await fixExact('Training Deepthi', null,          null,          'na');

  // Bhavik — two active rows, fix by createdAt order
  const bhaviks = await prisma.client.findMany({
    where: { name: { contains: 'bhavik', mode: 'insensitive' }, regularTrainings: { some: { status: 'active' } } },
    select: { id: true, name: true }, orderBy: { createdAt: 'asc' },
  });
  if (bhaviks[0]) await fixById(bhaviks[0].id, '2026-07-30', '2026-08-14', 'biweekly', 'Bhavik[0]');
  if (bhaviks[1]) await fixById(bhaviks[1].id, '2026-08-06', '2026-08-20', 'biweekly', 'Bhavik[1]');

  // Meghna — two active rows
  const meghnas = await prisma.client.findMany({
    where: { name: { contains: 'meghna', mode: 'insensitive' }, regularTrainings: { some: { status: 'active' } } },
    select: { id: true, name: true }, orderBy: { createdAt: 'asc' },
  });
  if (meghnas[0]) await fixById(meghnas[0].id, '2026-08-07', '2026-08-21', 'biweekly', 'Meghna[0]');
  if (meghnas[1]) await fixById(meghnas[1].id, '2026-08-23', null,          'monthly',  'Meghna[1]');

  console.log('\n=== Done ===');
}
main().catch(console.error).finally(() => prisma.$disconnect());
