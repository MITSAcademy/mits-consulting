import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const trainerLeadsRouter = Router();
trainerLeadsRouter.use(requireAuth);

const include = { recruiter: { select: { id: true, name: true } } };

trainerLeadsRouter.get('/', async (_req, res) => {
  const leads = await prisma.trainerLead.findMany({ include, orderBy: { createdAt: 'desc' } });
  res.json(leads);
});

trainerLeadsRouter.post('/', async (req: AuthedRequest, res) => {
  const { name, skills, source, expectedRateInr, stage, notes, recruiterId } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const lead = await prisma.trainerLead.create({
    data: {
      name, skills, source, expectedRateInr: expectedRateInr || 0,
      stage: stage || 'New', notes,
      recruiterId: recruiterId || req.user!.id,
    },
    include,
  });
  await audit(req.user!.id, req.user!.name, 'TRAINER_LEAD_CREATE', name);
  res.status(201).json(lead);
});

trainerLeadsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const data: any = {};
  for (const f of ['name', 'skills', 'source', 'expectedRateInr', 'stage', 'notes', 'recruiterId']) {
    if (f in req.body) data[f] = req.body[f];
  }
  const lead = await prisma.trainerLead.update({ where: { id: req.params.id }, data, include });
  await audit(req.user!.id, req.user!.name, 'TRAINER_LEAD_UPDATE', lead.name);
  res.json(lead);
});

trainerLeadsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  await prisma.trainerLead.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
