import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';

export const trainerPayWeeksRouter = Router();
trainerPayWeeksRouter.use(requireAuth);

// GET /?weekStart=YYYY-MM-DD — fetch all rows for a week
trainerPayWeeksRouter.get('/', async (req: AuthedRequest, res) => {
  const { weekStart } = req.query as any;
  if (!weekStart) return res.status(400).json({ error: 'weekStart required' });
  const rows = await prisma.trainerPayWeek.findMany({ where: { weekStart } });
  res.json(rows);
});

// PATCH /:trainerId — upsert a row for trainer+week
trainerPayWeeksRouter.patch('/:trainerId', async (req: AuthedRequest, res) => {
  const { trainerId } = req.params;
  const { weekStart, mitaliAckAt, bhavneetVerification } = req.body;
  if (!weekStart) return res.status(400).json({ error: 'weekStart required' });

  // Role gates
  if (mitaliAckAt !== undefined && req.user!.id !== 'u-mitali') {
    return res.status(403).json({ error: 'Only Mitali can acknowledge' });
  }
  if (bhavneetVerification !== undefined && req.user!.id !== 'u-bhavneet') {
    return res.status(403).json({ error: 'Only Bhavneet can verify' });
  }

  const data: any = {};
  if (mitaliAckAt !== undefined) data.mitaliAckAt = mitaliAckAt ? new Date(mitaliAckAt) : new Date();
  if (bhavneetVerification !== undefined) data.bhavneetVerification = bhavneetVerification;

  const row = await prisma.trainerPayWeek.upsert({
    where: { trainerId_weekStart: { trainerId, weekStart } },
    create: { trainerId, weekStart, ...data },
    update: data,
  });
  res.json(row);
});
