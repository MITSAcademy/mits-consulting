import { prisma } from './prisma';

export async function audit(userId: string | undefined, userName: string, action: string, details?: string) {
  await prisma.auditLog.create({
    data: {
      byId: userId || null,
      byName: userName,
      action,
      details: details || null,
    },
  });
}
