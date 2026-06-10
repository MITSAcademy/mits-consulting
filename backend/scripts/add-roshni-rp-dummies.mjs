// One-shot script — adds 5 dummy RP clients for Roshni to prod DB
// Run: node scripts/add-roshni-rp-dummies.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const today = new Date().toISOString().slice(0, 10);
const now = new Date();

const clients = [
  {
    name: 'dummy_kabir',
    engagementType: 'Support',
    currency: 'USD',
    cycleAmount: 550,
    source: 'LinkedIn',
    phoneCode: '+91', phoneDigits: '9100000001',
  },
  {
    name: 'dummy_meera',
    engagementType: 'Training',
    currency: 'USD',
    cycleAmount: 500,
    source: 'Referral',
    phoneCode: '+91', phoneDigits: '9100000002',
  },
  {
    name: 'dummy_farhan',
    engagementType: 'Support',
    currency: 'USD',
    cycleAmount: 600,
    source: 'Instagram',
    phoneCode: '+1', phoneDigits: '5125550201',
  },
  {
    name: 'dummy_lakshmi',
    engagementType: 'Training',
    currency: 'USD',
    cycleAmount: 480,
    source: 'LinkedIn',
    phoneCode: '+91', phoneDigits: '9100000004',
  },
  {
    name: 'dummy_tariq',
    engagementType: 'Support',
    currency: 'USD',
    cycleAmount: 520,
    source: 'Referral',
    phoneCode: '+91', phoneDigits: '9100000005',
  },
];

for (const c of clients) {
  const existing = await prisma.client.findFirst({ where: { name: c.name } });
  if (existing) {
    console.log(`Skipping ${c.name} — already exists`);
    continue;
  }
  await prisma.client.create({
    data: {
      name: c.name,
      lifecycle: 'SaleClosing',
      saleClosingSubStatus: 'RP',
      saleClosingSubStatusAt: now,
      stageEnteredAt: today,
      salesOwnerId: 'u-roshni',
      intakeOwnerId: 'u-anjali',
      engagementType: c.engagementType,
      currency: c.currency,
      cycleAmount: c.cycleAmount,
      source: c.source,
      phoneCode: c.phoneCode,
      phoneDigits: c.phoneDigits,
      paymentModel: 'BiWeekly',
      intakeData: { detailed_skill_set: 'To be filled', client_email: '' },
    },
  });
  console.log(`Created ${c.name}`);
}

await prisma.$disconnect();
console.log('Done.');
