/**
 * Reads /tmp/trainers_parsed.json (output of the Python parse step) and
 * upserts all trainers into the DB.  Safe to re-run — deduplicates on phoneDigits.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();

interface ParsedTrainer {
  name: string;
  phoneCountryCode: string;
  phoneDigits: string;
  skills: string[];
  ratePerHour: number | null;
}

async function main() {
  const rows: ParsedTrainer[] = JSON.parse(
    readFileSync('/tmp/trainers_parsed.json', 'utf8')
  );

  const before = await prisma.trainer.count();
  console.log(`Trainers before import: ${before}`);
  console.log(`Rows to process: ${rows.length}`);

  let inserted = 0, updated = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.phoneDigits || r.phoneDigits.length < 8) continue;

    const skills = r.skills.length ? r.skills.join(', ') : null;
    const defaultRateInr = r.ratePerHour ?? 0;

    try {
      const existing = await prisma.trainer.findFirst({
        where: { phoneDigits: r.phoneDigits },
        select: { id: true },
      });

      if (existing) {
        await prisma.trainer.update({
          where: { id: existing.id },
          data: {
            ...(skills ? { skills } : {}),
            ...(defaultRateInr > 0 ? { defaultRateInr } : {}),
          },
        });
        updated++;
      } else {
        await prisma.trainer.create({
          data: {
            name: r.name,
            phoneCode: r.phoneCountryCode,
            phoneDigits: r.phoneDigits,
            skills,
            defaultRateInr,
          },
        });
        inserted++;
      }
    } catch (err: any) {
      console.error(`[${i + 1}] Error for "${r.name}": ${err.message}`);
      errors++;
    }

    if ((i + 1) % 300 === 0) {
      console.log(`  … ${i + 1}/${rows.length} (inserted: ${inserted}, updated: ${updated})`);
    }
  }

  const after = await prisma.trainer.count();
  console.log('\n─── Import Summary ─────────────────────────────────');
  console.log(`Rows processed : ${rows.length}`);
  console.log(`New inserted   : ${inserted}`);
  console.log(`Existing updated: ${updated}`);
  console.log(`Errors         : ${errors}`);
  console.log(`Trainers before: ${before}`);
  console.log(`Trainers after : ${after}`);
  console.log(`Net new        : ${after - before}`);
  console.log('─────────────────────────────────────────────────────');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
