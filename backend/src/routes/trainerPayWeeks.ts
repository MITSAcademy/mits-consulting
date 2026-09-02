import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';

export const trainerPayWeeksRouter = Router();
trainerPayWeeksRouter.use(requireAuth);

// Same roles the Payment Sheet grants `canEdit` to in the UI.
const PAY_SHEET_EDIT = ['founder', 'manager', 'lead', 'accounts', 'payment_processor', 'demo_lead'];

// GET /?weekStart=YYYY-MM-DD — fetch all rows for a week
trainerPayWeeksRouter.get('/', async (req: AuthedRequest, res) => {
  const { weekStart } = req.query as any;
  if (!weekStart) return res.status(400).json({ error: 'weekStart required' });
  const rows = await prisma.trainerPayWeek.findMany({ where: { weekStart } });
  res.json(rows);
});

// PATCH /:trainerId — upsert a row for trainer+week
trainerPayWeeksRouter.patch('/:trainerId', async (req: AuthedRequest, res) => {
  const { trainerId } = req.params;
  const { weekStart, mitaliAckAt, bhavneetVerification, daysOverride } = req.body;
  if (!weekStart) return res.status(400).json({ error: 'weekStart required' });

  // Role gates
  if (mitaliAckAt !== undefined && req.user!.id !== 'u-mitali') {
    return res.status(403).json({ error: 'Only Mitali can acknowledge' });
  }
  if (bhavneetVerification !== undefined && req.user!.id !== 'u-bhavneet') {
    return res.status(403).json({ error: 'Only Bhavneet can verify' });
  }
  // daysOverride mirrors the Payment Sheet's own edit permission (canEdit).
  if (daysOverride !== undefined && !PAY_SHEET_EDIT.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed to edit Days on the payment sheet' });
  }

  const data: any = {};
  if (mitaliAckAt !== undefined) data.mitaliAckAt = mitaliAckAt ? new Date(mitaliAckAt) : new Date();
  if (bhavneetVerification !== undefined) data.bhavneetVerification = bhavneetVerification;
  // null clears the override and returns the row to the derived value.
  if (daysOverride !== undefined) {
    if (daysOverride === null) {
      data.daysOverride = null;
    } else {
      const n = Number(daysOverride);
      if (isNaN(n) || n < 0) return res.status(400).json({ error: 'daysOverride must be a number >= 0' });
      data.daysOverride = n;
    }
  }

  const row = await prisma.trainerPayWeek.upsert({
    where: { trainerId_weekStart: { trainerId, weekStart } },
    create: { trainerId, weekStart, ...data },
    update: data,
  });
  res.json(row);
});
