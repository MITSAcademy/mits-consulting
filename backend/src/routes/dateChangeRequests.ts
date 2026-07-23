/**
 * Date Change Request approval workflow.
 *
 * When Mitali wants to change payDate1/payDate2:
 *   Path A (payment_received): links a payment + optional screenshot → Samita approves
 *   Path B (leverage): fills context form → Vaibhav approves
 *
 * Old dates stay locked until approved.
 */
import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { sendEmail, safeBuildFromUser } from '../lib/mailer';

export const dateChangeRequestsRouter = Router();
dateChangeRequestsRouter.use(requireAuth);

const SUBMITTERS = ['accounts', 'manager', 'founder'];
const APPROVERS_A  = ['demo_lead', 'manager', 'founder']; // payment_received: Samita, Mitali, or founder
const APPROVERS_B  = ['founder', 'demo_lead'];            // leverage: Vaibhav or Samita only

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// ── helpers ───────────────────────────────────────────────────────────────────
async function notifyApproval(
  clientName: string,
  requestId: string,
  type: string,
  requesterName: string,
  approverEmails: string[],
  vaibhav: { id: string; gmailAddress: string | null; smtpAppPassword: string | null; sendAsAddress: string | null; name: string }
) {
  const fromUser = safeBuildFromUser(vaibhav);
  if (!fromUser || !approverEmails.length) return;

  const typeLabel = type === 'payment_received' ? 'Payment Received' : 'Leverage Request';
  const subject = `[Action Required] Date Change Request — ${clientName} (${typeLabel})`;
  const hubUrl = `https://mits-frontend.onrender.com/payment-follow-up`;

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
    <div style="background:#1A1B1E;padding:20px 28px;">
      <div style="color:#FBBF24;font-weight:700;font-size:16px;">MITS Consulting Hub</div>
      <div style="color:#9ca3af;font-size:12px;margin-top:4px;">Date Change Request — Approval Needed</div>
    </div>
    <div style="padding:24px 28px;">
      <p style="font-size:14px;color:#111827;margin:0 0 16px;"><strong>${requesterName}</strong> submitted a <strong>${typeLabel}</strong> request for client <strong>${clientName}</strong>.</p>
      <p style="font-size:13px;color:#374151;">Please review and approve or reject in the hub:</p>
      <a href="${hubUrl}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#FBBF24;color:#1A1B1E;font-weight:700;border-radius:8px;text-decoration:none;font-size:13px;">Open Payment Follow-up →</a>
    </div>
    <div style="background:#f9fafb;padding:12px 28px;border-top:1px solid #e5e7eb;">
      <div style="font-size:11px;color:#9ca3af;">Request ID: ${requestId} · MITS Solution</div>
    </div>
  </div>`;

  await sendEmail({ to: approverEmails.join(', '), subject, body: subject, htmlBody: html, fromUser });
}

async function notifyRequester(
  clientName: string,
  status: 'approved' | 'rejected',
  rejectionNote: string | null,
  requesterEmail: string,
  vaibhav: { id: string; gmailAddress: string | null; smtpAppPassword: string | null; sendAsAddress: string | null; name: string }
) {
  const fromUser = safeBuildFromUser(vaibhav);
  if (!fromUser) return;
  const subject = `Date Change Request ${status === 'approved' ? 'Approved ✓' : 'Rejected ✗'} — ${clientName}`;
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
    <p>Your date change request for <strong>${clientName}</strong> has been <strong>${status}</strong>.</p>
    ${status === 'rejected' && rejectionNote ? `<p style="color:#dc2626;">Reason: ${rejectionNote}</p>` : ''}
    ${status === 'approved' ? '<p style="color:#16a34a;">The payment dates have been updated.</p>' : '<p>You may resubmit with corrections.</p>'}
  </div>`;
  await sendEmail({ to: requesterEmail, subject, body: subject, htmlBody: html, fromUser });
}

// ── GET / — list requests (pending for approvers, own requests for accounts) ──
dateChangeRequestsRouter.get('/', async (req: AuthedRequest, res) => {
  const role = req.user!.role;
  const userId = req.user!.id;
  const isApprover = [...APPROVERS_A, ...APPROVERS_B].includes(role);

  const where: any = isApprover
    ? { status: 'pending' }
    : { requestedById: userId };

  const requests = await prisma.dateChangeRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      client: { select: { id: true, name: true, payDate1: true, payDate2: true } },
    },
  });

  res.json(requests);
});

// ── GET /client/:clientId — pending request for a specific client ──────────────
dateChangeRequestsRouter.get('/client/:clientId', async (req: AuthedRequest, res) => {
  const request = await prisma.dateChangeRequest.findFirst({
    where: { clientId: req.params.clientId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
  res.json(request || null);
});

// ── POST / — submit a new request ─────────────────────────────────────────────
dateChangeRequestsRouter.post('/', async (req: AuthedRequest, res) => {
  if (!SUBMITTERS.includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed' });
  }

  const {
    clientId, type,
    proposedDate1, proposedDate2,
    // Path A
    linkedPaymentId, screenshotBase64,
    amountExpected, amountActual, paymentDoneDate,
    // Path B
    summary30d, mitaliF15d, bhavneetF15d, lastSessionDate, issueDetail, leverageScreenshot,
  } = req.body;

  if (!clientId || !type) return res.status(400).json({ error: 'clientId and type required' });
  if (!['payment_received', 'leverage'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, currency: true, cycleAmount: true } });
  if (!client) return res.status(404).json({ error: 'Client not found' });

  // Block if there's already a pending request for this client
  const existing = await prisma.dateChangeRequest.findFirst({ where: { clientId, status: 'pending' } });
  if (existing) return res.status(409).json({ error: 'A pending request already exists for this client. Wait for it to be approved or rejected first.' });

  // Validate Path A required fields
  if (type === 'payment_received') {
    if (!paymentDoneDate) return res.status(400).json({ error: 'paymentDoneDate is required' });
    if (!amountActual) return res.status(400).json({ error: 'amountActual is required' });
    if (!screenshotBase64) return res.status(400).json({ error: 'Payment screenshot is required' });
    if (!proposedDate1) return res.status(400).json({ error: 'proposedDate1 (next due date) is required' });
    // Block future payment dates
    if (paymentDoneDate > todayIST()) return res.status(400).json({ error: 'Payment done date cannot be in the future' });
  }

  // Validate Path B minimum word count
  if (type === 'leverage' && issueDetail) {
    const wordCount = issueDetail.trim().split(/\s+/).length;
    if (wordCount < 50) return res.status(400).json({ error: `Issue detail must be at least 50 words (you wrote ${wordCount}).` });
  }

  const request = await prisma.dateChangeRequest.create({
    data: {
      clientId,
      requestedById: req.user!.id,
      requestedByName: req.user!.name,
      type,
      proposedDate1: proposedDate1 || null,
      proposedDate2: proposedDate2 || null,
      linkedPaymentId: linkedPaymentId || null,
      screenshotBase64: screenshotBase64 || null,
      amountExpected: amountExpected != null ? Number(amountExpected) : null,
      amountActual: amountActual != null ? Number(amountActual) : null,
      paymentDoneDate: paymentDoneDate || null,
      summary30d: summary30d || null,
      mitaliF15d: mitaliF15d || null,
      bhavneetF15d: bhavneetF15d || null,
      lastSessionDate: lastSessionDate || null,
      issueDetail: issueDetail || null,
      leverageScreenshot: leverageScreenshot || null,
    },
  });

  await audit(req.user!.id, req.user!.name, 'DATE_CHANGE_REQUESTED',
    `${client.name}: requested date change (${type}) — proposed ${proposedDate1 || '?'} / ${proposedDate2 || '?'}`,
    { clientId });

  // Notify approvers
  try {
    const vaibhav = await prisma.user.findUnique({
      where: { id: 'u-vaibhav' },
      select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
    });
    if (vaibhav?.gmailAddress && vaibhav?.smtpAppPassword) {
      if (type === 'payment_received') {
        // Notify Samita (demo_lead)
        const samita = await prisma.user.findFirst({ where: { role: 'demo_lead' }, select: { gmailAddress: true, email: true } });
        const emails = [samita?.gmailAddress || samita?.email, vaibhav.gmailAddress].filter(Boolean) as string[];
        await notifyApproval(client.name, request.id, type, req.user!.name, emails, vaibhav);
      } else {
        // Notify Vaibhav only
        await notifyApproval(client.name, request.id, type, req.user!.name, [vaibhav.gmailAddress!], vaibhav);
      }
    }
  } catch (e) { console.warn('[date-change] email notify failed', e); }

  res.json({ ok: true, request });
});

// ── PATCH /:id — resubmit (edit) a rejected request ──────────────────────────
dateChangeRequestsRouter.patch('/:id', async (req: AuthedRequest, res) => {
  const request = await prisma.dateChangeRequest.findUnique({ where: { id: req.params.id } });
  if (!request) return res.status(404).json({ error: 'Not found' });
  if (request.requestedById !== req.user!.id) return res.status(403).json({ error: 'Not your request' });
  if (request.status !== 'rejected') return res.status(400).json({ error: 'Only rejected requests can be resubmitted' });

  const {
    proposedDate1, proposedDate2,
    linkedPaymentId, screenshotBase64,
    amountExpected, amountActual, paymentDoneDate,
    summary30d, mitaliF15d, bhavneetF15d, lastSessionDate, issueDetail, leverageScreenshot,
  } = req.body;

  if (request.type === 'leverage' && issueDetail) {
    const wordCount = issueDetail.trim().split(/\s+/).length;
    if (wordCount < 50) return res.status(400).json({ error: `Issue detail must be at least 50 words (you wrote ${wordCount}).` });
  }

  const updated = await prisma.dateChangeRequest.update({
    where: { id: request.id },
    data: {
      status: 'pending',
      proposedDate1: proposedDate1 ?? request.proposedDate1,
      proposedDate2: proposedDate2 ?? request.proposedDate2,
      linkedPaymentId: linkedPaymentId ?? request.linkedPaymentId,
      screenshotBase64: screenshotBase64 ?? request.screenshotBase64,
      amountExpected: amountExpected != null ? Number(amountExpected) : (request as any).amountExpected,
      amountActual: amountActual != null ? Number(amountActual) : (request as any).amountActual,
      paymentDoneDate: paymentDoneDate ?? (request as any).paymentDoneDate,
      summary30d: summary30d ?? request.summary30d,
      mitaliF15d: mitaliF15d ?? request.mitaliF15d,
      bhavneetF15d: bhavneetF15d ?? request.bhavneetF15d,
      lastSessionDate: lastSessionDate ?? request.lastSessionDate,
      issueDetail: issueDetail ?? request.issueDetail,
      leverageScreenshot: leverageScreenshot ?? request.leverageScreenshot,
      rejectionNote: null,
      approvedById: null,
      approvedByName: null,
      approvedAt: null,
    },
  });

  res.json({ ok: true, request: updated });
});

// ── POST /:id/approve ─────────────────────────────────────────────────────────
dateChangeRequestsRouter.post('/:id/approve', async (req: AuthedRequest, res) => {
  const role = req.user!.role;
  const request = await prisma.dateChangeRequest.findUnique({
    where: { id: req.params.id },
    include: { client: { select: { id: true, name: true, email: true, currency: true, cycleAmount: true } } },
  });
  if (!request) return res.status(404).json({ error: 'Not found' });
  if (request.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

  // Role check: Path A → Samita/manager/founder; Path B → manager/founder
  const allowed = request.type === 'payment_received' ? APPROVERS_A : APPROVERS_B;
  if (!allowed.includes(role)) return res.status(403).json({ error: 'Not authorised to approve this type' });

  const req_ = request as any;

  if (request.type === 'payment_received') {
    // Path A: record the actual payment + update payDate1 to Mitali's proposed next due date
    if (!request.proposedDate1) return res.status(400).json({ error: 'No proposed next due date on this request' });
    const activeTraining = await prisma.regularTraining.findFirst({
      where: { clientId: request.clientId, status: 'active' },
      select: { trainerId: true },
    });
    const recordedAmount = req_.amountActual ?? req_.amountExpected ?? request.client.cycleAmount ?? 0;
    const paymentDate = req_.paymentDoneDate || todayIST();
    await prisma.$transaction([
      prisma.client.update({
        where: { id: request.clientId },
        data: {
          payDate1: request.proposedDate1,
          leverageUntil: null,
          leverageNote: null,
        },
      }),
      prisma.payment.create({
        data: {
          clientId: request.clientId,
          trainerId: activeTraining?.trainerId || null,
          kind: 'Renewal',
          amount: Math.round(Number(recordedAmount)),
          currency: (request.client.currency || 'USD') as any,
          paymentDate,
          receivedById: req.user!.id,
        },
      }),
    ]);
  } else {
    // Path B: just apply the date change
    await prisma.client.update({
      where: { id: request.clientId },
      data: {
        ...(request.proposedDate1 !== null ? { payDate1: request.proposedDate1 } : {}),
        ...(request.proposedDate2 !== null ? { payDate2: request.proposedDate2 } : {}),
      },
    });
  }

  await prisma.dateChangeRequest.update({
    where: { id: request.id },
    data: {
      status: 'approved',
      approvedById: req.user!.id,
      approvedByName: req.user!.name,
      approvedAt: new Date(),
    },
  });

  await audit(req.user!.id, req.user!.name, 'DATE_CHANGE_APPROVED',
    request.type === 'payment_received'
      ? `${request.client.name}: payment approved by ${req.user!.name} — ${req_.amountActual || req_.amountExpected || '?'} recorded, next due ${request.proposedDate1 || '?'}`
      : `${request.client.name}: leverage approved — ${request.proposedDate1 || '?'} / ${request.proposedDate2 || '?'}`,
    { clientId: request.clientId });

  // Notify Mitali
  try {
    const vaibhav = await prisma.user.findUnique({
      where: { id: 'u-vaibhav' },
      select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
    });
    const requester = await prisma.user.findUnique({ where: { id: request.requestedById }, select: { email: true, gmailAddress: true } });
    const email = requester?.gmailAddress || requester?.email;
    if (vaibhav && email) await notifyRequester(request.client.name, 'approved', null, email, vaibhav);
  } catch (e) { console.warn('[date-change] email notify failed', e); }

  res.json({ ok: true });
});

// ── POST /:id/reject ──────────────────────────────────────────────────────────
dateChangeRequestsRouter.post('/:id/reject', async (req: AuthedRequest, res) => {
  const role = req.user!.role;
  const { rejectionNote } = req.body;
  const request = await prisma.dateChangeRequest.findUnique({
    where: { id: req.params.id },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!request) return res.status(404).json({ error: 'Not found' });
  if (request.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

  const allowed = request.type === 'payment_received' ? APPROVERS_A : APPROVERS_B;
  if (!allowed.includes(role)) return res.status(403).json({ error: 'Not authorised to reject this type' });

  await prisma.dateChangeRequest.update({
    where: { id: request.id },
    data: {
      status: 'rejected',
      approvedById: req.user!.id,
      approvedByName: req.user!.name,
      approvedAt: new Date(),
      rejectionNote: rejectionNote || null,
    },
  });

  await audit(req.user!.id, req.user!.name, 'DATE_CHANGE_REJECTED',
    `${request.client.name}: date change rejected — ${rejectionNote || 'no reason given'}`,
    { clientId: request.clientId });

  // Notify Mitali
  try {
    const vaibhav = await prisma.user.findUnique({
      where: { id: 'u-vaibhav' },
      select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
    });
    const requester = await prisma.user.findUnique({ where: { id: request.requestedById }, select: { email: true, gmailAddress: true } });
    const email = requester?.gmailAddress || requester?.email;
    if (vaibhav && email) await notifyRequester(request.client.name, 'rejected', rejectionNote || null, email, vaibhav);
  } catch (e) { console.warn('[date-change] email notify failed', e); }

  res.json({ ok: true });
});
