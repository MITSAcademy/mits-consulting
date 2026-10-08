/**
 * Course prices for student checkout.
 *
 * courseCatalog.json is generated — do not hand-edit it. Prices are owned by
 * mits-web (scripts/catalog/*.mjs); regenerate there, then run
 * `node scripts/sync-course-prices.mjs ../../mits-web` here.
 */

import catalog from './courseCatalog.json';

export interface CatalogCourse {
  id: number;
  title: string;
  amount: number; // minor units (cents)
  currency: string;
}

const BY_ID = new Map<number, CatalogCourse>((catalog as CatalogCourse[]).map((c) => [c.id, c]));

export function findCourse(id: number): CatalogCourse | undefined {
  return BY_ID.get(id);
}

export function catalogSize(): number {
  return BY_ID.size;
}
