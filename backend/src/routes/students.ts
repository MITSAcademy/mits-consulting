import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';

export const studentsRouter = Router();
studentsRouter.use(requireAuth);

const ALLOWED = ['founder', 'manager', 'sales_closer'];

// Money is founder-only, by explicit instruction. This is hard-coded rather
// than routed through checkPermission()/RolePermission because that matrix is
// editable at runtime and so cannot enforce a standing rule.
const requireFounder = requireRole('founder');

studentsRouter.get('/', requireRole(...ALLOWED), async (_req, res) => {
  const students = await prisma.student.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      emailVerified: true,
      active: true,
      createdAt: true,
      _count: { select: { purchases: { where: { status: 'PAID' } } } },
    },
  });
  res.json(
    students.map(({ _count, ...s }) => ({ ...s, paidPurchaseCount: _count.purchases })),
  );
});

// Profile + what they bought. Deliberately no amounts — this route is open to
// managers and sales, so the select below must never grow to include money.
studentsRouter.get('/:id', requireRole(...ALLOWED), async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      emailVerified: true,
      active: true,
      createdAt: true,
      purchases: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, courseId: true, courseTitle: true, status: true, createdAt: true, paidAt: true },
      },
    },
  });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(student);
});

studentsRouter.get('/:id/payments', requireFounder, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true },
  });
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const payments = await prisma.studentPurchase.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      courseId: true,
      courseTitle: true,
      amount: true,
      currency: true,
      status: true,
      gateway: true,
      merchantTxnId: true,
      gatewayRef: true,
      paidAt: true,
      createdAt: true,
    },
  });

  await audit(req.user!.id, req.user!.name, 'STUDENT_PAYMENT_VIEW', `${student.name} (${payments.length} records)`);
  res.json(payments);
});
