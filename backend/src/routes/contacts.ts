import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const contactsRouter = Router();
contactsRouter.use(requireAuth);

const ALLOWED = ['founder', 'manager', 'sales_closer'];

contactsRouter.get('/', requireRole(...ALLOWED), async (_req, res) => {
  const contacts = await prisma.contact.findMany({
    orderBy: { createdAt: 'desc' },
    include: { addedBy: { select: { id: true, name: true } } },
    take: 500,
  });
  res.json(contacts);
});

contactsRouter.post('/', requireRole(...ALLOWED), async (req: AuthedRequest, res) => {
  const { name, email, phoneCode, phoneDigits, company, source, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const contact = await prisma.contact.create({
    data: {
      name: name.trim(),
      email: email?.trim() || null,
      phoneCode: phoneCode?.trim() || null,
      phoneDigits: phoneDigits?.trim() || null,
      company: company?.trim() || null,
      source: source?.trim() || null,
      notes: notes?.trim() || null,
      addedById: req.user!.id,
    },
    include: { addedBy: { select: { id: true, name: true } } },
  });
  await audit(req.user!.id, req.user!.name, 'CONTACT_CREATE', contact.name);
  res.status(201).json(contact);
});

contactsRouter.patch('/:id', requireRole(...ALLOWED), async (req: AuthedRequest, res) => {
  const fields = ['name', 'email', 'phoneCode', 'phoneDigits', 'company', 'source', 'notes'];
  const data: any = {};
  for (const f of fields) if (f in req.body) data[f] = req.body[f] || null;
  const contact = await prisma.contact.update({
    where: { id: req.params.id },
    data,
    include: { addedBy: { select: { id: true, name: true } } },
  });
  res.json(contact);
});

contactsRouter.delete('/:id', requireRole(...ALLOWED), async (req: AuthedRequest, res) => {
  await prisma.contact.delete({ where: { id: req.params.id } });
  await audit(req.user!.id, req.user!.name, 'CONTACT_DELETE', req.params.id);
  res.json({ ok: true });
});

// POST /contacts/:id/convert — convert contact into a client (Sales pipeline, Lead stage)
contactsRouter.post('/:id/convert', requireRole(...ALLOWED), async (req: AuthedRequest, res) => {
  const contact = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  if (contact.convertedToClientId) return res.status(409).json({ error: 'Already converted to a client' });

  const client = await prisma.client.create({
    data: {
      name: contact.name,
      email: contact.email || null,
      phoneCode: contact.phoneCode || null,
      phoneDigits: contact.phoneDigits || null,
      lifecycle: 'Lead',
      source: contact.source || null,
      notes: contact.notes || null,
      salesOwnerId: req.user!.id,
    },
  });
  await prisma.contact.update({
    where: { id: req.params.id },
    data: { convertedToClientId: client.id },
  });
  await audit(req.user!.id, req.user!.name, 'CONTACT_CONVERT', `${contact.name} → client ${client.id}`);
  res.json({ client });
});
