import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function fix(nameContains: string, data: { paymentFrequency: string; payDate1: string | null; payDate2: string | null }) {
  const c = await p.client.findFirst({
    where: { name: { contains: nameContains, mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (!c) { console.log(`NOT FOUND: ${nameContains}`); return; }
  await p.client.update({ where: { id: c.id }, data });
  console.log(`✓ ${c.name}: ${data.paymentFrequency} | PD1=${data.payDate1 || 'NA'} | PD2=${data.payDate2 || 'NA'}`);
}

async function main() {
  await fix('Aditya',           { paymentFrequency: 'biweekly', payDate1: '2026-08-13', payDate2: '2026-08-27' });
  await fix('Training Pramod',  { paymentFrequency: 'monthly',  payDate1: '2026-08-31', payDate2: null });
  await fix('Training Sathvik', { paymentFrequency: 'na',       payDate1: null,         payDate2: null });
  await fix('Training Shalini', { paymentFrequency: 'na',       payDate1: null,         payDate2: null });
  await fix('Training Deepthi', { paymentFrequency: 'na',       payDate1: null,         payDate2: null });
  // Ashish, Sandeep, Dinesh, Alkehya, Sahil, Vamshi, Python Ram — already na, no change needed
  console.log('All done');
}
main().finally(() => p.$disconnect());
