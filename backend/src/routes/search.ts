import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { prisma } from '../lib/prisma';

export const searchRouter = Router();
searchRouter.use(requireAuth);

searchRouter.get('/', async (req: AuthedRequest, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.json({ clients: [], trainers: [], users: [] });
  }

  const [clients, trainers, users] = await Promise.all([
    prisma.client.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      select: { id: true, name: true, lifecycle: true, assignedAmId: true },
      take: 5,
    }),
    prisma.trainer.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      select: { id: true, name: true, skills: true },
      take: 5,
    }),
    prisma.user.findMany({
      where: {
        name: { contains: q, mode: 'insensitive' },
        active: true,
      },
      select: { id: true, name: true, role: true },
      take: 3,
    }),
  ]);

  res.json({ clients, trainers, users });
});
