/**
 * Call log — account managers (Muskan, Kashish) + Bhavneet + Mitali log calls
 * they made to clients here. Lightweight: clientId + kind + outcome + notes.
 *
 * Roles:
 *   founder, manager, lead, account_manager → can create logs and see them
 *   accounts, payment_processor             → no access (not their work)
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const callLogsRouter = Router();
callLogsRouter.use(requireAuth);

const ALLOWED = ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'];

callLogsRouter.get('/', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const clientId = (req.query.clientId as string) || undefined;
  const mine = req.query.mine === 'true';
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const where: any = {};
  if (clientId) where.clientId = clientId;
  if (mine) where.byId = req.user!.id;
  const logs = await prisma.callLog.findMany({
    where,
    select: {
      id: true, kind: true, outcome: true, durationMinutes: true, notes: true, calledAt: true,
      client: { select: { id: true, name: true } },
      by:     { select: { id: true, name: true } },
    },
    orderBy: { calledAt: 'desc' },
    take: limit,
  });
  res.json(logs);
});

callLogsRouter.post('/', async (req: AuthedRequest, res) => {
  if (!ALLOWED.includes(req.user!.role)) return res.status(403).json({ error: 'Not allowed' });
  const { clientId, kind, outcome, durationMinutes, notes } = req.body || {};
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const log = await prisma.callLog.create({
    data: {
      clientId,
      byId: req.user!.id,
      kind: typeof kind === 'string' ? kind : 'checkin',
      outcome: typeof outcome === 'string' ? outcome : null,
      durationMinutes: typeof durationMinutes === 'number' ? durationMinutes : null,
      notes: typeof notes === 'string' ? notes.slice(0, 1000) : null,
    },
  });
  await audit(req.user!.id, req.user!.name, 'CALL_LOG', `${client.name} · ${kind || 'checkin'}${outcome ? ' · ' + outcome : ''}`);
  res.status(201).json(log);
});
