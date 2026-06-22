import { prisma } from './prisma';

export const ALL_ROLES = [
  'founder', 'manager', 'lead', 'account_manager', 'demo_lead',
  'recruiter', 'sales_closer', 'accounts', 'payment_processor',
];

export const RESOURCE_MATRIX: Record<string, { label: string; defaultRoles: string[] }> = {
  'feedback.read':           { label: 'Feedback: View',              defaultRoles: ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'] },
  'feedback.write':          { label: 'Feedback: Create/Edit',       defaultRoles: ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'] },
  'feedback.delete':         { label: 'Feedback: Delete',            defaultRoles: ['founder', 'manager'] },
  'tasks.read':              { label: 'Tasks: View',                 defaultRoles: ['founder', 'manager', 'lead', 'account_manager', 'demo_lead', 'accounts', 'payment_processor'] },
  'tasks.write':             { label: 'Tasks: Create/Edit',          defaultRoles: ['founder', 'manager', 'lead', 'account_manager', 'demo_lead', 'accounts', 'payment_processor'] },
  'tasks.complete':          { label: 'Tasks: Complete (bills)',     defaultRoles: ['founder', 'manager', 'lead', 'account_manager'] },
  'tasks.delete':            { label: 'Tasks: Delete',               defaultRoles: ['founder', 'manager', 'lead'] },
  'payments.read':           { label: 'Payments: View',              defaultRoles: ['founder', 'manager', 'demo_lead', 'sales_closer', 'accounts', 'payment_processor'] },
  'payments.write':          { label: 'Payments: Record',            defaultRoles: ['founder', 'manager', 'demo_lead', 'sales_closer', 'accounts'] },
  'sessions.sheet':          { label: 'Session Sheet',               defaultRoles: ['founder', 'manager', 'lead', 'account_manager'] },
  'sessions.retrospective':  { label: 'Retrospective',               defaultRoles: ['founder', 'manager', 'lead', 'account_manager'] },
  'sessions.payment':        { label: 'Weekly Payment Tab',          defaultRoles: ['founder', 'manager', 'lead', 'account_manager'] },
  'trainers.finance':        { label: 'Trainers: Bank/UPI/Rates',   defaultRoles: ['founder', 'manager', 'accounts', 'payment_processor'] },
  'users.full':              { label: 'Users: Full Directory',       defaultRoles: ['founder', 'manager', 'lead', 'account_manager', 'demo_lead'] },
};

export async function checkPermission(resource: string, role: string): Promise<boolean> {
  const override = await prisma.rolePermission.findUnique({
    where: { resource_role: { resource, role } },
  });
  if (override !== null) return override.allowed;
  const entry = RESOURCE_MATRIX[resource];
  if (!entry) return false;
  return entry.defaultRoles.includes(role);
}

export async function getMatrix(): Promise<{
  resources: { key: string; label: string }[];
  roles: string[];
  permissions: Record<string, Record<string, boolean>>;
  overrides: Record<string, Record<string, boolean>>;
}> {
  const overrideRows = await prisma.rolePermission.findMany();
  const overrideMap: Record<string, Record<string, boolean>> = {};
  for (const row of overrideRows) {
    if (!overrideMap[row.resource]) overrideMap[row.resource] = {};
    overrideMap[row.resource][row.role] = row.allowed;
  }

  const permissions: Record<string, Record<string, boolean>> = {};
  for (const [key, entry] of Object.entries(RESOURCE_MATRIX)) {
    permissions[key] = {};
    for (const role of ALL_ROLES) {
      if (overrideMap[key]?.[role] !== undefined) {
        permissions[key][role] = overrideMap[key][role];
      } else {
        permissions[key][role] = entry.defaultRoles.includes(role);
      }
    }
  }

  return {
    resources: Object.entries(RESOURCE_MATRIX).map(([key, { label }]) => ({ key, label })),
    roles: ALL_ROLES,
    permissions,
    overrides: overrideMap,
  };
}
