/**
 * One-off script: update team display names + phone numbers without touching anything else.
 * Run with: npm run seed:contacts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const UPDATES: Array<{ id: string; name: string; phone: string | null }> = [
  { id: 'u-vaibhav',  name: 'Vaibhav Aggarwal', phone: null },                  // leave alone if already set
  { id: 'u-samita',   name: 'Samita Gupta',     phone: '+91 73476 13659' },
  { id: 'u-anjali',   name: 'Anjali',           phone: '+91 90566 77384' },
  { id: 'u-taran',    name: 'Taranpreet Kaur',  phone: '+91 70879 83742' },
  { id: 'u-aman',     name: 'Amandeep Kaur',    phone: '+91 81460 16061' },
  { id: 'u-kanchan',  name: 'Kanchan Sharma',   phone: '+91 76580 33316' },
  { id: 'u-roshni',   name: 'Roshni',           phone: '+91 62835 05780' },
];

async function main() {
  for (const u of UPDATES) {
    const updated = await prisma.user.update({
      where: { id: u.id },
      data: u.phone ? { name: u.name, phone: u.phone } : { name: u.name },
    }).catch(() => null);
    if (updated) console.log(`  ✓ ${updated.name} (${updated.email}) phone=${updated.phone || '—'}`);
    else console.log(`  · skip ${u.id} (not found)`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
