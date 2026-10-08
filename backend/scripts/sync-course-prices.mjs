// Pulls course prices from the mits-web repo into src/lib/courseCatalog.data.json.
//
// mits-web owns the catalog: scripts/catalog/*.mjs is the source of truth, and
// `node scripts/build-course-catalog.mjs` there emits lib/course-prices.json.
// This copies that projection in, converting dollars to cents so the Hub never
// does float arithmetic on money.
//
//   node scripts/sync-course-prices.mjs ../mits-web
//   MITS_WEB_PATH=/path/to/mits-web node scripts/sync-course-prices.mjs

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webPath = process.argv[2] || process.env.MITS_WEB_PATH;
if (!webPath) {
  console.error('Usage: node scripts/sync-course-prices.mjs <path-to-mits-web>');
  process.exit(1);
}

const source = resolve(webPath, 'lib/course-prices.json');
if (!existsSync(source)) {
  console.error(`Not found: ${source}\nRun "node scripts/build-course-catalog.mjs" in mits-web first.`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(source, 'utf8'));
if (!Array.isArray(raw) || raw.length === 0) {
  console.error('course-prices.json is empty or not an array — refusing to write.');
  process.exit(1);
}

const courses = raw.map((c) => {
  if (!Number.isInteger(c.id) || !c.title || typeof c.price !== 'number' || !c.currency) {
    console.error(`Malformed entry: ${JSON.stringify(c)}`);
    process.exit(1);
  }
  if (!(c.price > 0 && c.price <= 10000)) {
    console.error(`Price out of sane range for ${c.id}: ${c.price}`);
    process.exit(1);
  }
  return { id: c.id, title: c.title, amount: Math.round(c.price * 100), currency: c.currency };
});

const ids = new Set(courses.map((c) => c.id));
if (ids.size !== courses.length) {
  console.error('Duplicate course ids — refusing to write.');
  process.exit(1);
}

const out = join(dirname(fileURLToPath(import.meta.url)), '../src/lib/courseCatalog.data.json');

// Warn loudly about anything priced far below the catalog — almost always a
// leftover test price that would otherwise be silently restored to full price
// (or, worse, left live).
if (existsSync(out)) {
  const current = JSON.parse(readFileSync(out, 'utf8'));
  const byId = new Map(current.map((c) => [c.id, c.amount]));
  for (const c of courses) {
    const old = byId.get(c.id);
    if (old != null && old < 500 && c.amount !== old) {
      console.warn(`! ${c.id} "${c.title}" was ${old} minor units (test price) and is being reset to ${c.amount}`);
    }
  }
}

writeFileSync(out, `${JSON.stringify(courses, null, 2)}\n`);
console.log(`Wrote ${courses.length} courses to src/lib/courseCatalog.data.json`);
