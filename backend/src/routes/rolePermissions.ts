import { Router } from 'express';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { getMatrix, RESOURCE_MATRIX, ALL_ROLES } from '../lib/rolePermissions';

export const rolePermissionsRouter = Router();
rolePermissionsRouter.use(requireAuth);

// GET /role-permissions/matrix — founder only
rolePermissionsRouter.get('/matrix', requireRole('founder'), async (_req, res) => {
  const matrix = await getMatrix();
  res.json(matrix);
});

// POST /role-permissions/toggle — founder only
rolePermissionsRouter.post('/toggle', requireRole('founder'), async (req: AuthedRequest, res) => {
  const { resource, role, allowed } = req.body;
  if (!resource || !role || allowed === undefined) {
    return res.status(400).json({ error: 'resource, role, allowed required' });
  }
  if (!RESOURCE_MATRIX[resource]) return res.status(400).json({ error: 'Unknown resource' });
  if (!ALL_ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role' });

  const row = await prisma.rolePermission.upsert({
    where: { resource_role: { resource, role } },
    create: { resource, role, allowed: Boolean(allowed), updatedById: req.user!.id },
    update: { allowed: Boolean(allowed), updatedById: req.user!.id },
  });
  res.json(row);
});

// POST /role-permissions/reset — founder only — revert to default
rolePermissionsRouter.post('/reset', requireRole('founder'), async (req: AuthedRequest, res) => {
  const { resource, role } = req.body;
  if (!resource || !role) return res.status(400).json({ error: 'resource, role required' });

  await prisma.rolePermission.deleteMany({ where: { resource, role } });
  res.json({ ok: true });
});
