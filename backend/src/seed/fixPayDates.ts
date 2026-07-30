/**
 * One-off: fix corrupted payDate1/payDate2 entries.
 * Matches by client name (case-insensitive, partial match).
 * Run with: npm run seed:fix-pay-dates
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Source of truth: Excel sheet values
// All dates are YYYY-MM-DD
const FIXES: Array<{ name: string; payDate1: string | null; payDate2: string | null }> = [
  // Same date (PD1 = PD2) — fixed using Excel
  { name: 'Methan',       payDate1: '2026-08-21', payDate2: '2026-09-04' },
  { name: 'Sai Shivani',  payDate1: '2026-08-13', payDate2: '2026-08-27' },
  { name: 'Shiva',        payDate1: '2026-08-08', payDate2: '2026-08-22' },
  { name: 'Naman',        payDate1: '2026-08-17', payDate2: '2026-08-31' },
  { name: 'Pradeep',      payDate1: '2026-08-18', payDate2: '2026-09-01' },
  { name: 'Raj',          payDate1: '2026-08-18', payDate2: '2026-09-01' },
  { name: 'Bhavik',       payDate1: '2026-08-20', payDate2: '2026-09-03' },
  { name: 'Indu',         payDate1: '2026-08-20', payDate2: '2026-09-03' },
  { name: 'Ashrith',      payDate1: '2026-08-21', payDate2: '2026-09-04' },
  { name: 'Shruthi',      payDate1: '2026-08-22', payDate2: '2026-09-05' },
  { name: 'Lalita',       payDate1: '2026-08-23', payDate2: '2026-09-06' },
  { name: 'Ambika',       payDate1: '2026-08-25', payDate2: '2026-09-08' },
  { name: 'Raja',         payDate1: '2026-08-25', payDate2: '2026-09-08' },

  // PD2 before PD1 — fixed using Excel
  { name: 'Naveena',      payDate1: '2026-08-01', payDate2: '2026-08-15' },
  { name: 'Yaswanth',     payDate1: '2026-08-09', payDate2: '2026-08-23' },
  { name: 'Sirija',       payDate1: '2026-08-10', payDate2: '2026-08-24' },
  { name: 'Rahul',        payDate1: '2026-08-12', payDate2: '2026-08-26' },
  { name: 'Rohit',        payDate1: '2026-08-17', payDate2: '2026-08-31' },
  { name: 'Priyanka',     payDate1: '2026-08-20', payDate2: '2026-09-03' },
];

// Clients with two different rows having the same name — handle by exact match below
const NAME_OVERRIDES: Array<{ name: string; payDate1: string; payDate2: string; secondRow?: boolean }> = [
  // Two "Meghna" rows — fix both
  { name: 'Meghna',       payDate1: '2026-08-07', payDate2: '2026-08-21' },
  // Two "Bhavik" rows — one is 6 Aug (same date), one is 14 Aug (PD2 < PD1)
  { name: 'Bhavik',       payDate1: '2026-08-14', payDate2: '2026-08-28', secondRow: true },
  // Two "Nikhil" rows — Nikhil Greeshu has PD2 before PD1
  { name: 'Nikhil',       payDate1: '2026-08-04', payDate2: '2026-08-18', secondRow: true },
  // Yashwanthi
  { name: 'Yashwanthi',   payDate1: '2026-08-07', payDate2: '2026-08-21' },
];

async function main() {
  console.log('=== fixPayDates migration ===\n');

  for (const fix of FIXES) {
    // Find all matching clients (case-insensitive)
    const matches = await prisma.client.findMany({
      where: { name: { contains: fix.name, mode: 'insensitive' } },
      select: { id: true, name: true, payDate1: true, payDate2: true },
    });

    if (matches.length === 0) {
      console.log(`  ✗ NOT FOUND: ${fix.name}`);
      continue;
    }

    // Skip "Bhavik" and "Nikhil" and "Meghna" here — handled in NAME_OVERRIDES
    if (['Bhavik', 'Nikhil', 'Meghna', 'Yashwanthi'].some(n => fix.name.toLowerCase() === n.toLowerCase())) {
      // Will be handled below
      continue;
    }

    for (const client of matches) {
      await prisma.client.update({
        where: { id: client.id },
        data: { payDate1: fix.payDate1, payDate2: fix.payDate2 },
      });
      console.log(`  ✓ ${client.name} (${client.id}): PD1 ${client.payDate1 || 'null'} → ${fix.payDate1}, PD2 ${client.payDate2 || 'null'} → ${fix.payDate2}`);
    }
  }

  // Handle duplicates — Meghna, Bhavik, Nikhil, Yashwanthi
  // For these, apply to ALL matching rows (both get corrected)
  const dupeNames = ['Meghna', 'Bhavik', 'Nikhil', 'Yashwanthi'];
  for (const name of dupeNames) {
    const matches = await prisma.client.findMany({
      where: { name: { contains: name, mode: 'insensitive' } },
      select: { id: true, name: true, payDate1: true, payDate2: true },
      orderBy: { createdAt: 'asc' },
    });

    if (matches.length === 0) {
      console.log(`  ✗ NOT FOUND: ${name}`);
      continue;
    }

    // Find the primary fix
    const primaryFix = FIXES.find(f => f.name.toLowerCase() === name.toLowerCase())
      || NAME_OVERRIDES.find(f => f.name.toLowerCase() === name.toLowerCase() && !f.secondRow);
    const secondaryFix = NAME_OVERRIDES.find(f => f.name.toLowerCase() === name.toLowerCase() && f.secondRow);

    for (let i = 0; i < matches.length; i++) {
      const client = matches[i];
      const fix = i === 0 ? primaryFix : (secondaryFix || primaryFix);
      if (!fix) continue;

      // Only fix if dates are actually wrong
      const pd1Wrong = !client.payDate1 || !client.payDate2 || client.payDate2 <= client.payDate1;
      if (!pd1Wrong) {
        console.log(`  · ${client.name} (${client.id}): dates look OK — skipping`);
        continue;
      }

      await prisma.client.update({
        where: { id: client.id },
        data: { payDate1: fix.payDate1, payDate2: fix.payDate2 },
      });
      console.log(`  ✓ ${client.name} (${client.id}): PD1 ${client.payDate1 || 'null'} → ${fix.payDate1}, PD2 ${client.payDate2 || 'null'} → ${fix.payDate2}`);
    }
  }

  console.log('\n=== Done ===');
}

main().catch(console.error).finally(() => prisma.$disconnect());
