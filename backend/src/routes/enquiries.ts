import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';
import { sendEnquiryNotification } from '../lib/enquiryEmail';

export const enquiriesRouter = Router();

const ALLOWED = ['founder', 'manager', 'demo_lead', 'sales_closer'];

// Tight limit on the public submit endpoint — a handful of form posts per minute is normal,
// anything past that is either abuse or a retry storm on the mitsedge.com side.
const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
  skip: () => process.env.NODE_ENV !== 'production',
});

// POST /api/enquiries — public, called server-to-server by mitsedge.com's backend.
// Auth is a shared secret rather than a user session since there's no logged-in user here.
enquiriesRouter.post('/', submitLimiter, async (req, res) => {
  const key = req.headers['x-enquiry-key'];
  const expected = process.env.ENQUIRY_WEBHOOK_SECRET;
  if (!expected || key !== expected) return res.status(401).json({ error: 'Unauthorized' });

  const { name, email, phone, message, course } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

  const enquiry = await prisma.enquiry.create({
    data: {
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      message: message?.trim() || null,
      course: course?.trim() || null,
    },
  });
  res.status(201).json({ ok: true, id: enquiry.id });

  // Fire-and-forget — never let a slow/failed notification block the webhook response.
  sendEnquiryNotification(enquiry).catch(() => {});
});

// Everything below is internal — staff viewing/managing the enquiry inbox.
enquiriesRouter.use(requireAuth);

enquiriesRouter.get('/', requireRole(...ALLOWED), async (_req, res) => {
  const enquiries = await prisma.enquiry.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  res.json(enquiries);
});

enquiriesRouter.patch('/:id', requireRole(...ALLOWED), async (req: AuthedRequest, res) => {
  const fields = ['status'];
  const data: any = {};
  for (const f of fields) if (f in req.body) data[f] = req.body[f];
  const enquiry = await prisma.enquiry.update({ where: { id: req.params.id }, data });
  res.json(enquiry);
});

enquiriesRouter.delete('/:id', requireRole(...ALLOWED), async (req: AuthedRequest, res) => {
  await prisma.enquiry.delete({ where: { id: req.params.id } });
  await audit(req.user!.id, req.user!.name, 'ENQUIRY_DELETE', req.params.id);
  res.json({ ok: true });
});

// POST /enquiries/:id/convert — convert enquiry into a Contact
enquiriesRouter.post('/:id/convert', requireRole(...ALLOWED), async (req: AuthedRequest, res) => {
  const enquiry = await prisma.enquiry.findUnique({ where: { id: req.params.id } });
  if (!enquiry) return res.status(404).json({ error: 'Enquiry not found' });
  if (enquiry.convertedToContactId) return res.status(409).json({ error: 'Already converted to a contact' });

  const contact = await prisma.contact.create({
    data: {
      name: enquiry.name,
      email: enquiry.email || null,
      source: 'Website enquiry',
      notes: enquiry.message || null,
      addedById: req.user!.id,
    },
  });
  await prisma.enquiry.update({
    where: { id: req.params.id },
    data: { convertedToContactId: contact.id, status: 'converted' },
  });
  await audit(req.user!.id, req.user!.name, 'ENQUIRY_CONVERT', `${enquiry.name} → contact ${contact.id}`);
  res.json({ contact });
});
