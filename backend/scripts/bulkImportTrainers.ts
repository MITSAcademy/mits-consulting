/**
 * Bulk-import trainers from raw OCR/spreadsheet data.
 *
 * Run:
 *   cd backend
 *   npx tsx scripts/bulkImportTrainers.ts
 *
 * The script uses Prisma directly (no HTTP).  It upserts on phoneDigits so
 * duplicate phone numbers are silently skipped.  Rows with no phoneDigits get
 * a cuid-based synthetic key so they are always inserted as new records (you
 * may want to review those manually later).
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

// Simple unique ID generator (no extra deps needed)
const createId = () => randomBytes(8).toString('hex');

const prisma = new PrismaClient();

// ─── RAW DATA ────────────────────────────────────────────────────────────────
// Paste your 3,231 rows here.  Each element can be:
//   - a plain string  "Name | phone | skills | rate"  (pipe-separated), OR
//   - an object with any of the keys shown below.
//
// String format (all fields optional after name):
//   "Name | +91XXXXXXXXXX | Skill1, Skill2 | 1200"
//
// Object format:
//   { name, phone, skills, rate }
//
// ─── REPLACE THE SAMPLE ARRAY BELOW WITH YOUR ACTUAL DATA ──────────────────
const RAW_DATA: Array<string | RawRow> = [
  // ── PASTE YOUR DATA HERE ──────────────────────────────────────────────────
  // Examples (remove once real data is pasted):
  // "Abhilash Sailpoint Iiq | +91 98765 43210 | | 1200",
  // "Karthick F5 | +91 99999 00000 | | 15k",
  // { name: "Ravi Kumar", phone: "+91 88888 77777", skills: "Java, Spring", rate: "900" },
];

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface RawRow {
  name?: string;
  phone?: string;
  skills?: string;
  rate?: string | number;
}

// ─── SKILL KEYWORDS THAT MAY BE EMBEDDED IN NAMES ────────────────────────────
// Add more as you encounter them.  Case-insensitive match against each word in
// the name.  Everything from the first keyword onwards is treated as skills.
const SKILL_KEYWORDS = new Set([
  // Tech products / platforms
  'sailpoint', 'iiq', 'identitynow', 'saviynt', 'cyberark', 'beyondtrust',
  'okta', 'ping', 'forgerock', 'azure', 'aws', 'gcp', 'devops', 'kubernetes',
  'docker', 'ansible', 'terraform', 'jenkins', 'git', 'linux', 'windows',
  'active', 'directory', 'ldap', 'sap', 'oracle', 'salesforce', 'servicenow',
  'java', 'python', 'dotnet', '.net', 'react', 'angular', 'nodejs', 'spring',
  'microservices', 'rest', 'api', 'sql', 'mysql', 'postgres', 'mongodb',
  'hadoop', 'spark', 'tableau', 'powerbi', 'qlik', 'selenium', 'testing',
  'automation', 'manual', 'qa', 'pega', 'uipath', 'blueprism', 'rpa',
  'cybersecurity', 'network', 'cisco', 'checkpoint', 'palo', 'alto',
  'f5', 'bigip', 'fortinet', 'juniper', 'ccna', 'ccnp', 'ccie',
  'vmware', 'nutanix', 'openshift', 'openstack',
  'scrum', 'agile', 'project', 'management', 'pmp', 'prince2',
  'etl', 'informatica', 'datastage', 'talend', 'mulesoft', 'boomi',
  'sharepoint', 'dynamics', 'power', 'platform',
  // Generic roles that sometimes bleed into names
  'trainer', 'consultant', 'expert', 'specialist',
]);

// OCR noise tokens to strip from skills
const NOISE_SKILLS = new Set([
  '', '()', '(', ')', '-', '_', 'na', 'nil', 'n/a',
  'training', 'trainer', 'consultant',
]);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Split "Abhilash Sailpoint Iiq" → { cleanName: "Abhilash", embeddedSkills: "Sailpoint Iiq" } */
function splitNameFromSkills(raw: string): { cleanName: string; embeddedSkills: string } {
  const words = raw.trim().split(/\s+/);
  let splitAt = words.length; // default: no split

  for (let i = 1; i < words.length; i++) {
    if (SKILL_KEYWORDS.has(words[i].toLowerCase())) {
      splitAt = i;
      break;
    }
  }

  return {
    cleanName: words.slice(0, splitAt).join(' ').trim(),
    embeddedSkills: words.slice(splitAt).join(' ').trim(),
  };
}

/** Normalize skills string: merge embedded + declared, remove noise tokens */
function normalizeSkills(declared?: string, embedded?: string): string | undefined {
  const parts: string[] = [];

  const push = (s?: string) => {
    if (!s) return;
    s.split(/[,;|/]+/).forEach((t) => {
      const clean = t.trim().replace(/\s+/g, ' ');
      // Remove pure numeric tokens, short noise, "()", "60", etc.
      if (/^\d+$/.test(clean)) return;
      if (NOISE_SKILLS.has(clean.toLowerCase())) return;
      if (clean.length < 2) return;
      parts.push(clean);
    });
  };

  push(embedded);
  push(declared);

  if (!parts.length) return undefined;

  // Deduplicate (case-insensitive)
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (!seen.has(key)) { seen.add(key); deduped.push(p); }
  }
  return deduped.join(', ');
}

/**
 * Normalize a phone string.
 * Strips spaces, dashes, dots.
 * If the result starts with +91 → phoneCode = "+91", phoneDigits = remaining 10 (or whatever we have).
 * Otherwise returns phoneCode = "+91" (default), phoneDigits = cleaned digits.
 */
function normalizePhone(raw?: string): { phoneCode: string; phoneDigits: string | undefined } {
  if (!raw) return { phoneCode: '+91', phoneDigits: undefined };

  // Remove spaces, dashes, dots, parens
  const stripped = raw.replace(/[\s\-.() ]/g, '');

  if (stripped.startsWith('+91')) {
    const digits = stripped.slice(3);
    return { phoneCode: '+91', phoneDigits: digits || undefined };
  }

  if (stripped.startsWith('91') && stripped.length > 10) {
    const digits = stripped.slice(2);
    return { phoneCode: '+91', phoneDigits: digits || undefined };
  }

  // Pure digits (10 digits = Indian mobile)
  if (/^\d+$/.test(stripped)) {
    return { phoneCode: '+91', phoneDigits: stripped };
  }

  // Has a different country code (+1, +44, etc.)
  const ccMatch = stripped.match(/^(\+\d{1,3})(.*)$/);
  if (ccMatch) {
    return { phoneCode: ccMatch[1], phoneDigits: ccMatch[2] || undefined };
  }

  return { phoneCode: '+91', phoneDigits: stripped || undefined };
}

/**
 * Parse rate strings: "900" → 900, "15k" → 15000, "1.5k" → 1500, "15,000" → 15000
 */
function parseRate(raw?: string | number): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  if (typeof raw === 'number') return Math.round(raw);

  const s = String(raw).trim().toLowerCase().replace(/,/g, '');
  const kMatch = s.match(/^([\d.]+)\s*k$/);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);

  const num = parseFloat(s);
  return isNaN(num) ? 0 : Math.round(num);
}

/** Parse a pipe-separated string row */
function parseStringRow(row: string): RawRow {
  const parts = row.split('|').map((p) => p.trim());
  return {
    name: parts[0] || undefined,
    phone: parts[1] || undefined,
    skills: parts[2] || undefined,
    rate: parts[3] || undefined,
  };
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Starting bulk import of ${RAW_DATA.length} rows…`);

  const existingCountBefore = await prisma.trainer.count();
  console.log(`Existing trainers in DB: ${existingCountBefore}`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const noPhone: string[] = [];

  for (let i = 0; i < RAW_DATA.length; i++) {
    const raw = RAW_DATA[i];
    const row: RawRow = typeof raw === 'string' ? parseStringRow(raw) : raw;

    if (!row.name?.trim()) {
      console.warn(`[${i + 1}] Skipping — no name`);
      skipped++;
      continue;
    }

    // 1. Split skill keywords embedded in name
    const { cleanName, embeddedSkills } = splitNameFromSkills(row.name.trim());

    // 2. Normalize phone
    const { phoneCode, phoneDigits } = normalizePhone(row.phone);

    // 3. Merge skills
    const skills = normalizeSkills(row.skills, embeddedSkills);

    // 4. Parse rate
    const defaultRateInr = parseRate(row.rate);

    if (!phoneDigits) {
      noPhone.push(cleanName);
    }

    // 5. Upsert key: phoneDigits if present, else a stable key derived from name
    //    (name-based key avoids duplicate inserts on re-runs for no-phone rows)
    const upsertKey = phoneDigits
      ? phoneDigits
      : `NO_PHONE_${cleanName.toLowerCase().replace(/\s+/g, '_')}`;

    try {
      // phoneDigits is indexed but not @unique in schema, so use findFirst + create/update
      const existing = await prisma.trainer.findFirst({
        where: { phoneDigits: upsertKey },
        select: { id: true },
      });

      if (existing) {
        // Update only fields that add value — don't overwrite manually-enriched data
        await prisma.trainer.update({
          where: { id: existing.id },
          data: {
            ...(skills ? { skills } : {}),
            ...(defaultRateInr > 0 ? { defaultRateInr } : {}),
          },
        });
      } else {
        await prisma.trainer.create({
          data: {
            name: cleanName,
            phoneCode,
            phoneDigits: upsertKey,
            skills: skills ?? null,
            defaultRateInr,
          },
        });
      }
      inserted++;
    } catch (err: any) {
      console.error(`[${i + 1}] Error for "${cleanName}": ${err.message}`);
      errors++;
    }

    if ((i + 1) % 200 === 0) {
      console.log(`  … processed ${i + 1} / ${RAW_DATA.length}`);
    }
  }

  const existingCountAfter = await prisma.trainer.count();

  console.log('\n─── Import Summary ─────────────────────────────────────────');
  console.log(`Rows processed : ${RAW_DATA.length}`);
  console.log(`Upserted OK    : ${inserted}`);
  console.log(`Skipped (no name): ${skipped}`);
  console.log(`Errors         : ${errors}`);
  console.log(`Trainers before: ${existingCountBefore}`);
  console.log(`Trainers after : ${existingCountAfter}`);
  console.log(`Net new rows   : ${existingCountAfter - existingCountBefore}`);
  if (noPhone.length > 0) {
    console.log(`\nRows with no phone (${noPhone.length}) — used synthetic key:`);
    noPhone.slice(0, 20).forEach((n) => console.log('  •', n));
    if (noPhone.length > 20) console.log(`  … and ${noPhone.length - 20} more`);
  }
  console.log('────────────────────────────────────────────────────────────');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
