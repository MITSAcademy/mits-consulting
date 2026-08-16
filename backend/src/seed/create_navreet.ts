/**
 * One-time script: create Navreet's account with resume_sanitiser role.
 * Run AFTER deploying the migration: npx ts-node src/seed/create_navreet.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'navreet.kaur@mitssolution.com';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('User already exists:', existing.id, existing.name, existing.role);
    return;
  }

  const pw = process.env.NAVREET_PASSWORD;
  if (!pw) throw new Error('Set NAVREET_PASSWORD env var before running');
  const passwordHash = await bcrypt.hash(pw, 10);
  const user = await prisma.user.create({
    data: {
      name: 'Navreet Kaur',
      email,
      passwordHash,
      role: 'resume_sanitiser' as any,
    },
  });
  console.log('Created:', user.id, user.name, user.email, user.role);
}

main().catch(console.error).finally(() => prisma.$disconnect());
