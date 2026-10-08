/**
 * Course prices for student checkout.
 *
 * courseCatalog.data.json is generated — do not hand-edit it. Prices are owned
 * by mits-web (scripts/catalog/*.mjs); regenerate there, then run
 * `node scripts/sync-course-prices.mjs ../../mits-web` here.
 *
 * The data file must not be named courseCatalog.json: Node resolves `.json`
 * before `.ts`, so `./courseCatalog` would import the raw array instead of this
 * module and every export would silently be undefined at runtime.
 */

import catalog from './courseCatalog.data.json';

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
