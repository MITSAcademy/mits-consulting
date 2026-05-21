import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const flagsRouter = Router();
flagsRouter.use(requireAuth);

flagsRouter.get('/', async (_req, res) => {
  const all = await prisma.featureFlag.findMany();
  const obj: Record<string, boolean> = {};
  all.forEach((f) => (obj[f.key] = f.value));
  res.json(obj);
});

flagsRouter.put('/:key', requireRole('founder'), async (req: AuthedRequest, res) => {
  const { value } = req.body;
  const f = await prisma.featureFlag.upsert({
    where: { key: req.params.key },
    create: { key: req.params.key, value: !!value },
    update: { value: !!value },
  });
  await audit(req.user!.id, req.user!.name, 'FLAG_UPDATE', `${f.key}=${f.value}`);
  res.json(f);
});

const FLAG_DEFAULTS: Record<string, boolean> = {
  phase_two_enabled: false,
  whatsapp_integration: true,
  daily_reporting: true,
  verification_gate: true,
  owner_assignment_by_lead: true,
  audit_log_visible: true,
  payment_access_restricted: true,
  multi_trainer_proposals: true,
  smart_match_scoring: true,
  bulk_upload_structured: true,
  bulk_upload_raw: true,
  email_templates: true,
  phone_validation: true,
  whatsapp_group_preferred: true,
  configurable_lead_sources: true,
  strict_edit_permissions: true,
  edit_request_flow: true,
  edit_request_auto_approve: false,
  sso_mitssolution: false,
  drag_drop_kanban: false,
};

flagsRouter.post('/reset', requireRole('founder'), async (req: AuthedRequest, res) => {
  await prisma.$transaction(
    Object.entries(FLAG_DEFAULTS).map(([key, value]) =>
      prisma.featureFlag.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      })
    )
  );
  await audit(req.user!.id, req.user!.name, 'FLAG_RESET', 'all flags reset to defaults');
  res.json({ ok: true, defaults: FLAG_DEFAULTS });
});
