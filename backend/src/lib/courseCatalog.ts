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

/**
 * The smallest amount checkout will charge (minor units, so $5.00).
 *
 * Anything lower is a leftover test price, not a course fee: on 8 Oct course
 * 1086 was set to $1 to put a live payment through, was never reset, and a
 * real buyer was charged $1 for a course the website showed at $450. The order
 * endpoint refuses these unless PAYGLOCAL_ALLOW_TEST_PRICES=true is set for a
 * deliberate test, so a forgotten test price can no longer reach a customer.
 */
export const MIN_CHARGE_MINOR = 500;

export function isTestPrice(course: CatalogCourse): boolean {
  return course.amount < MIN_CHARGE_MINOR;
}

export function testPricesAllowed(): boolean {
  return (process.env.PAYGLOCAL_ALLOW_TEST_PRICES || '').trim() === 'true';
}

/** Every course priced below the floor, for the startup warning and tests. */
export function testPricedCourses(): CatalogCourse[] {
  return [...BY_ID.values()].filter(isTestPrice);
}

export function catalogSize(): number {
  return BY_ID.size;
}
