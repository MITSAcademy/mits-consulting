/**
 * Feature flags — env-var driven, simple boolean checks.
 *
 * Pattern: set `FEATURES_REGULAR_CALLS=true` on Render to enable. Anything
 * other than the literal string "true" (case-sensitive) is treated as off.
 *
 * Defaults: ALL flags off. New features ship dark — flip via Render env when
 * ready to test, and Render auto-redeploys.
 *
 * Used by:
 *   • Route guards (404 the entire router when flag is off)
 *   • GET /api/features endpoint so the frontend can hide nav entries +
 *     skip rendering gated pages, no client-side detection needed.
 */
import { prisma } from './prisma';

export interface FeatureFlags {
  regularCalls: boolean;
}

export const ALL_FLAGS: (keyof FeatureFlags)[] = ['regularCalls'];

export function readFlags(): FeatureFlags {
  return {
    regularCalls: process.env.FEATURES_REGULAR_CALLS === 'true',
  };
}

export async function readFlagsForUser(userId: string): Promise<FeatureFlags> {
  const base = readFlags();
  const overrides = await prisma.userFeatureFlag.findMany({ where: { userId } });
  for (const row of overrides) {
    if (ALL_FLAGS.includes(row.flag as keyof FeatureFlags)) {
      (base as any)[row.flag] = row.enabled;
    }
  }
  return base;
}

export function flagOn(name: keyof FeatureFlags): boolean {
  return readFlags()[name] === true;
}
