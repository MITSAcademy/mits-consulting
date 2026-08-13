import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Cap connection pool at 3 — Render Starter has 512MB RAM and each idle
// Postgres connection costs ~5-10MB. Default pool (num_cpus * 2 + 1) is too large.
export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    datasourceUrl: process.env.DATABASE_URL
      ? process.env.DATABASE_URL + (process.env.DATABASE_URL.includes('?') ? '&' : '?') + 'connection_limit=10&pool_timeout=15'
      : undefined,
  });

if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;
