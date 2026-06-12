import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { prisma } from '../lib/prisma';

export const meetingLinksRouter = Router();
meetingLinksRouter.use(requireAuth);

const ALLOWED_ROLES = ['founder', 'manager', 'demo_lead', 'demo_intake', 'account_manager', 'lead'];

meetingLinksRouter.get('/', async (req: AuthedRequest, res) => {
  const links = await prisma.meetingLink.findMany({
    include: { owner: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(links);
});

meetingLinksRouter.post('/', async (req: AuthedRequest, res) => {
  const { label, platform, url } = req.body || {};
  if (!label || !platform || !url) return res.status(400).json({ error: 'label, platform, and url are required' });
  const link = await prisma.meetingLink.create({
    data: { label, platform, url, ownerId: req.user!.id },
    include: { owner: { select: { id: true, name: true } } },
  });
  res.json(link);
});

meetingLinksRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const link = await prisma.meetingLink.findUnique({ where: { id: req.params.id } });
  if (!link) return res.status(404).json({ error: 'Not found' });
  if (link.ownerId !== req.user!.id && !['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not yours' });
  }
  const { label, platform, url } = req.body || {};
  const data: any = {};
  if (label !== undefined) data.label = label;
  if (platform !== undefined) data.platform = platform;
  if (url !== undefined) data.url = url;
  const updated = await prisma.meetingLink.update({ where: { id: req.params.id }, data, include: { owner: { select: { id: true, name: true } } } });
  res.json(updated);
});

meetingLinksRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const link = await prisma.meetingLink.findUnique({ where: { id: req.params.id } });
  if (!link) return res.status(404).json({ error: 'Not found' });
  if (link.ownerId !== req.user!.id && !['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not yours' });
  }
  await prisma.meetingLink.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
