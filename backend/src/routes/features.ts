/**
 * Public-ish features endpoint — returns which feature flags are currently
 * on for the running backend. Frontend uses this to hide nav entries that
 * point to gated routes.
 *
 * No sensitive data — flag names and booleans only.
 */
import { Router } from 'express';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { readFlags, readFlagsForUser, ALL_FLAGS } from '../lib/features';
import { prisma } from '../lib/prisma';

export const featuresRouter = Router();
featuresRouter.use(requireAuth);

featuresRouter.get('/', async (req: AuthedRequest, res) => {
  const flags = await readFlagsForUser(req.user!.id);
  res.json(flags);
});

featuresRouter.get('/matrix', requireRole('founder'), async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: 'asc' },
  });
  const allOverrides = await prisma.userFeatureFlag.findMany();
  const overrideMap = new Map<string, Map<string, boolean>>();
  for (const row of allOverrides) {
    if (!overrideMap.has(row.userId)) overrideMap.set(row.userId, new Map());
    overrideMap.get(row.userId)!.set(row.flag, row.enabled);
  }
  const envDefaults = readFlags();
  const usersWithFlags = users.map((u) => {
    const userOverrides = overrideMap.get(u.id) || new Map();
    const flags: Record<string, boolean> = {};
    for (const flag of ALL_FLAGS) {
      flags[flag] = userOverrides.has(flag) ? userOverrides.get(flag)! : envDefaults[flag];
    }
    return { id: u.id, name: u.name, role: u.role, flags };
  });
  res.json({ flags: ALL_FLAGS, users: usersWithFlags });
});

featuresRouter.post('/matrix', requireRole('founder'), async (req, res) => {
  const { userId, flag, enabled } = req.body as { userId: string; flag: string; enabled: boolean };
  if (!ALL_FLAGS.includes(flag as any)) {
    return res.status(400).json({ error: `Unknown flag: ${flag}` });
  }
  await prisma.userFeatureFlag.upsert({
    where: { userId_flag: { userId, flag } },
    create: { userId, flag, enabled },
    update: { enabled },
  });
  res.json({ ok: true });
});

featuresRouter.delete('/matrix', requireRole('founder'), async (req, res) => {
  const { userId, flag } = req.body as { userId: string; flag: string };
  if (!ALL_FLAGS.includes(flag as any)) {
    return res.status(400).json({ error: `Unknown flag: ${flag}` });
  }
  await prisma.userFeatureFlag.deleteMany({ where: { userId, flag } });
  res.json({ ok: true });
});
