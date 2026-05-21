import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const rawLeadsRouter = Router();
rawLeadsRouter.use(requireAuth);

rawLeadsRouter.get('/', async (_req, res) => {
  const l = await prisma.rawLead.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(l);
});

rawLeadsRouter.post('/', async (req: AuthedRequest, res) => {
  const { raw, cleanedName, cleanedPhone, cleanedSkill } = req.body;
  if (!raw) return res.status(400).json({ error: 'raw required' });
  const r = await prisma.rawLead.create({
    data: { raw, cleanedName, cleanedPhone, cleanedSkill, status: 'Pending' },
  });
  res.status(201).json(r);
});

rawLeadsRouter.post('/bulk', async (req: AuthedRequest, res) => {
  const { lines } = req.body; // array of raw strings
  if (!Array.isArray(lines)) return res.status(400).json({ error: 'lines required' });
  const created = await prisma.$transaction(
    lines.map((raw: string) => prisma.rawLead.create({ data: { raw, status: 'Pending' } })),
  );
  await audit(req.user!.id, req.user!.name, 'RAW_LEAD_BULK', `${created.length}`);
  res.status(201).json({ count: created.length });
});

rawLeadsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const data: any = {};
  for (const f of ['status', 'cleanedName', 'cleanedPhone', 'cleanedSkill']) {
    if (f in req.body) data[f] = req.body[f];
  }
  const r = await prisma.rawLead.update({ where: { id: req.params.id }, data });
  res.json(r);
});

rawLeadsRouter.post('/:id/promote', async (req: AuthedRequest, res) => {
  // Promote to a Client (Lead stage)
  const r = await prisma.rawLead.findUnique({ where: { id: req.params.id } });
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (!r.cleanedName) return res.status(400).json({ error: 'cleanedName required before promotion' });
  const client = await prisma.client.create({
    data: {
      name: r.cleanedName,
      phoneDigits: r.cleanedPhone || null,
      phoneCode: r.cleanedPhone?.startsWith('+') ? r.cleanedPhone.split(' ')[0] : '+1',
      intakeSkillHint: r.cleanedSkill || null,
      lifecycle: 'Lead',
      leadOwnerId: req.user!.id,
    },
  });
  await prisma.rawLead.update({ where: { id: r.id }, data: { status: 'Processed' } });
  await audit(req.user!.id, req.user!.name, 'RAW_LEAD_PROMOTE', client.name);
  res.json({ client });
});

rawLeadsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  await prisma.rawLead.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
