import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const pramod = await p.client.findFirst({
    where: { name: { contains: 'Pramod', mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (!pramod) { console.log('Pramod NOT FOUND'); return; }
  await p.client.update({
    where: { id: pramod.id },
    data: { paymentFrequency: 'monthly', payDate1: '2026-08-31', payDate2: null },
  });
  console.log('Training Pramod: monthly, PD1=31 Aug, PD2=null — done');
}
main().finally(() => p.$disconnect());
