import { prisma } from './prisma';

export interface AuditOpts {
  clientId?: string;
  trainerId?: string;
}

export async function audit(
  userId: string | undefined,
  userName: string,
  action: string,
  details?: string,
  opts?: AuditOpts,
) {
  await prisma.auditLog.create({
    data: {
      byId: userId || null,
      byName: userName,
      action,
      details: details || null,
      clientId: opts?.clientId || null,
      trainerId: opts?.trainerId || null,
    },
  });
}
