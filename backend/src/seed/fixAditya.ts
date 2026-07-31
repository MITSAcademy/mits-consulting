import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const c = await p.client.findFirst({
    where: { name: { contains: 'Aditya', mode: 'insensitive' } },
    select: { id: true, name: true, payDate1: true, payDate2: true, paymentFrequency: true },
  });
  console.log('before:', c);
  if (!c) { console.log('NOT FOUND'); return; }
  await p.client.update({ where: { id: c.id }, data: { payDate1: c.payDate2, payDate2: null } });
  console.log('done');
}
main().finally(() => p.$disconnect());
