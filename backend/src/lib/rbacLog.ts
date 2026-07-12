/**
 * In-memory ring buffer of recent 403 Forbidden responses.
 * Used by GET /api/internal/rbac-health to surface permission denials
 * without requiring log file access.
 * Max 500 entries — oldest dropped when full.
 */

interface RbacEntry {
  ts: string;       // ISO timestamp
  method: string;
  path: string;
  role: string;
  userId: string;
  userName: string;
}

const MAX = 500;
const log: RbacEntry[] = [];

export function recordForbidden(entry: Omit<RbacEntry, 'ts'>) {
  if (log.length >= MAX) log.shift();
  log.push({ ...entry, ts: new Date().toISOString() });
}

export function getRecentForbidden(limitHours = 24): RbacEntry[] {
  const cutoff = new Date(Date.now() - limitHours * 60 * 60 * 1000).toISOString();
  return log.filter((e) => e.ts >= cutoff);
}

export function getForbiddenSummary(limitHours = 24) {
  const entries = getRecentForbidden(limitHours);
  // Group by role + path
  const map = new Map<string, { count: number; lastSeen: string; role: string; path: string; method: string }>();
  for (const e of entries) {
    const key = `${e.role}::${e.method}::${e.path}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
      if (e.ts > existing.lastSeen) existing.lastSeen = e.ts;
    } else {
      map.set(key, { count: 1, lastSeen: e.ts, role: e.role, path: e.path, method: e.method });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}
