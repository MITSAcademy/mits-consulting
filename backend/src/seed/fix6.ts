import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // Show all Nikhils with their training status so we know which are real active clients
  const nikhils = await prisma.client.findMany({
    where: { name: { contains: 'nikhil', mode: 'insensitive' } },
    select: {
      id: true, name: true, payDate1: true, payDate2: true, email: true,
      regularTrainings: { where: { status: 'active' }, select: { id: true, name: true } },
    },
  });
  console.log('All Nikhils:');
  nikhils.forEach(n => console.log(`  [${n.id}] "${n.name}" PD1:${n.payDate1} PD2:${n.payDate2} email:${n.email} trainings:${n.regularTrainings.map(t=>t.name).join(',')}`));

  // Show Saipriya/Ganesh, Shiva — check if they exist
  const saipriya = await prisma.client.findMany({ where: { name: { contains: 'sai', mode: 'insensitive' } }, select: { id: true, name: true, payDate1: true, payDate2: true, regularTrainings: { where: { status: 'active' }, select: { id: true } } } });
  console.log('\nSai* clients:');
  saipriya.forEach(c => console.log(`  "${c.name}" PD1:${c.payDate1} PD2:${c.payDate2} active_trainings:${c.regularTrainings.length}`));

  const shiva = await prisma.client.findMany({ where: { name: { contains: 'shiv', mode: 'insensitive' } }, select: { id: true, name: true, payDate1: true, payDate2: true, regularTrainings: { where: { status: 'active' }, select: { id: true } } } });
  console.log('\nShiv* clients:');
  shiva.forEach(c => console.log(`  "${c.name}" PD1:${c.payDate1} PD2:${c.payDate2} active_trainings:${c.regularTrainings.length}`));

  const ganesh = await prisma.client.findMany({ where: { name: { contains: 'ganesh', mode: 'insensitive' } }, select: { id: true, name: true, payDate1: true, payDate2: true, regularTrainings: { where: { status: 'active' }, select: { id: true } } } });
  console.log('\nGanesh* clients:');
  ganesh.forEach(c => console.log(`  "${c.name}" PD1:${c.payDate1} PD2:${c.payDate2} active_trainings:${c.regularTrainings.length}`));
}
main().catch(console.error).finally(() => prisma.$disconnect());
