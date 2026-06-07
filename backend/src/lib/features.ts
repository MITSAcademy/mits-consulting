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
export interface FeatureFlags {
  regularCalls: boolean;
}

export function readFlags(): FeatureFlags {
  return {
    regularCalls: process.env.FEATURES_REGULAR_CALLS === 'true',
  };
}

export function flagOn(name: keyof FeatureFlags): boolean {
  return readFlags()[name] === true;
}
