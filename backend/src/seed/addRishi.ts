/**
 * One-off: add Rishi as a founder-role user (dev.rishi@mitssolution.com).
 * Run with: npm run seed:rishi
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: 'dev.rishi@mitssolution.com' } });
  if (existing) {
    console.log('Rishi already exists:', existing.id, '— ensuring role=founder and active=true');
    await prisma.user.update({ where: { id: existing.id }, data: { role: 'founder', active: true } });
    console.log('Done.');
    return;
  }

  const passwordHash = await bcrypt.hash('password123', 10);
  const u = await prisma.user.create({
    data: {
      id: 'u-rishi',
      name: 'Rishi',
      email: 'dev.rishi@mitssolution.com',
      passwordHash,
      role: 'founder',
      reportsToId: null,
      active: true,
    },
  });
  console.log('Created:', u.id, u.name, u.email, u.role);
}

main().catch(console.error).finally(() => prisma.$disconnect());
