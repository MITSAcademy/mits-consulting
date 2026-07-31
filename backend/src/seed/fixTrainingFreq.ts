import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const result = await p.client.updateMany({
    where: { name: { startsWith: 'Training', mode: 'insensitive' } },
    data: { paymentFrequency: 'na', payDate1: null, payDate2: null },
  });
  console.log('updated', result.count, 'Training rows to na');
}
main().finally(() => p.$disconnect());
