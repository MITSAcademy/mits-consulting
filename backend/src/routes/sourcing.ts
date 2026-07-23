import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';
import { notify } from '../lib/notify';
import { sendEmail, decryptSecret } from '../lib/mailer';
import {
  buildTrainerOutreachText,
  buildTrainerOutreachHtml,
  TRAINER_OUTREACH_SUBJECT,
  TrainerOutreachVars,
} from '../lib/trainerOutreach';

export const sourcingRouter = Router();
sourcingRouter.use(requireAuth);

// Recruiters get a client view with PII stripped — phone, email, group name/link gone.
// Demo history + skills (the things they need to source well) stay intact.
function redactSourcingForRecruiter<T extends { client?: any } | null>(item: T, role: string): T {
  if (!item || role !== 'recruiter') return item;
  const c = item.client;
  if (!c) return item;
  const id = (c.intakeData as any) || {};
  return {
    ...item,
    client: {
      ...c,
      phoneCode: null,
      phoneDigits: null,
      email: null,
      whatsappGroupName: null,
      whatsappGroupLink: null,
      // Strip personal lines from intake replies
      intakeData: id ? {
        detailed_skill_set: id.detailed_skill_set || null,
        current_priority_task: id.current_priority_task || null,
        demo_timing_ist: id.demo_timing_ist || null,
        session_timing_ist: id.session_timing_ist || null,
        trainer_preference: id.trainer_preference || null,
        meeting_tool: id.meeting_tool || null,
        // client_email + additional_notes intentionally dropped
      } : null,
    },
  } as T;
}

const include = {
  client: {
    include: {
      // Demos give recruiters context on which trainers were already tried + why they failed.
      // Sorted newest-first; limit to 6 to keep payload sane.
      demos: {
        orderBy: [{ scheduledDate: 'desc' as const }, { createdAt: 'desc' as const }],
        take: 6,
        include: {
          trainer: { select: { id: true, name: true, skills: true } },
        },
      },
      intakeOwner: { select: { id: true, name: true, role: true } },
    },
  },
  sentBy: { select: { id: true, name: true } },
  sentTo: { select: { id: true, name: true } },
  proposals: { include: { trainer: true, proposedBy: { select: { id: true, name: true } } } },
};

// Default routing: each intake person has a primary recruiter partner.
// Anjali ↔ Aman, Taran ↔ Kanchan. Demo intake can override at send-time.
const DEFAULT_RECRUITER_FOR: Record<string, string> = {
  'u-anjali': 'u-aman',
  'u-taran':  'u-kanchan',
};
// Fallback for everyone else / when sender isn't an intake person — round-robin
const RECRUITER_POOL = ['u-aman', 'u-kanchan'];

sourcingRouter.get('/', async (req: AuthedRequest, res) => {
  const { status } = req.query as any;
  const where: any = {};
  if (status) where.status = status;
  // Recruiters only see requests explicitly routed to them
  if (req.user!.role === 'recruiter') {
    where.sentToId = req.user!.id;
  }
  const items = await prisma.sourcingRequest.findMany({ where, include, orderBy: { createdAt: 'desc' } });
  res.json(items.map((it) => redactSourcingForRecruiter(it, req.user!.role)));
});

sourcingRouter.get('/:id', async (req: AuthedRequest, res) => {
  const r = await prisma.sourcingRequest.findUnique({ where: { id: req.params.id }, include });
  if (!r) return res.status(404).json({ error: 'Not found' });
  // Recruiters can't peek at requests routed to another recruiter
  if (req.user!.role === 'recruiter' && r.sentToId && r.sentToId !== req.user!.id) {
    return res.status(403).json({ error: 'Not your request' });
  }
  res.json(redactSourcingForRecruiter(r, req.user!.role));
});

sourcingRouter.post('/', async (req: AuthedRequest, res) => {
  const { clientId, sentToId: requestedSentToId, sentAt } = req.body;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });

  // Auto-route if no recruiter specified:
  //   1. If the current user has a default recruiter mapping (Anjali/Taran), use it.
  //   2. If they don't (e.g. founder/manager), use the client's intakeOwner's default.
  //   3. Otherwise round-robin from the pool.
  let sentToId: string | null = requestedSentToId || null;
  if (!sentToId) {
    sentToId = DEFAULT_RECRUITER_FOR[req.user!.id] || null;
  }
  if (!sentToId) {
    const c = await prisma.client.findUnique({ where: { id: clientId }, select: { intakeOwnerId: true } });
    if (c?.intakeOwnerId && DEFAULT_RECRUITER_FOR[c.intakeOwnerId]) {
      sentToId = DEFAULT_RECRUITER_FOR[c.intakeOwnerId];
    }
  }
  if (!sentToId) {
    // Round-robin: which recruiter has fewest active requests?
    const counts = await Promise.all(
      RECRUITER_POOL.map(async (id) => ({
        id,
        n: await prisma.sourcingRequest.count({ where: { sentToId: id, status: { in: ['Open', 'Proposed'] } } }),
      })),
    );
    counts.sort((a, b) => a.n - b.n);
    sentToId = counts[0]?.id || null;
  }

  // DEDUP — never create a duplicate Open/Proposed sourcing request for the same client.
  // (Anjali/Taran sometimes click "No match → recruiters" multiple times, which would
  //  otherwise pile up rows like "Hari × 2" on Aman's sourcing page.)
  const existingActive = await prisma.sourcingRequest.findFirst({
    where: { clientId, status: { in: ['Open', 'Proposed'] } },
    include,
    orderBy: { createdAt: 'desc' },
  });
  if (existingActive) {
    // Optionally update the routing target if a new sentToId was provided
    if (sentToId && sentToId !== existingActive.sentToId) {
      const updated = await prisma.sourcingRequest.update({
        where: { id: existingActive.id },
        data: { sentToId },
        include,
      });
      await audit(req.user!.id, req.user!.name, 'SOURCING_REROUTE', `${updated.client.name} → ${sentToId}`);
      return res.json(updated);
    }
    // Otherwise just return the existing one — idempotent re-tap.
    return res.json(existingActive);
  }

  const r = await prisma.sourcingRequest.create({
    data: {
      clientId,
      sentById: req.user!.id,
      sentToId: sentToId || null,
      sentAt: sentAt || new Date().toISOString().slice(0, 10),
      status: 'Open',
    },
    include,
  });
  await prisma.client.update({ where: { id: clientId }, data: { lifecycle: 'WithRecruiters' } });
  await audit(req.user!.id, req.user!.name, 'SOURCING_CREATE', r.client.name);
  // Ping the recruiter the request was routed to.
  if (sentToId) {
    await notify({
      userId: sentToId,
      kind: 'SourcingAssigned',
      title: `New sourcing request — ${r.client.name}`,
      body: `${req.user!.name} sent a new client your way. Open the sourcing page to propose trainers.`,
      link: `/sourcing`,
      email: true,
    });
  }
  res.status(201).json(r);
});

sourcingRouter.patch('/:id', async (req: AuthedRequest, res) => {
  // Role gate: routing (sentToId) is a Team-2 / leadership decision. Recruiters
  // can only patch requests assigned to them (status only — to mark Closed).
  const ALLOWED = ['founder', 'manager', 'demo_lead', 'demo_intake', 'recruiter'];
  if (!ALLOWED.includes(req.user!.role)) {
    return res.status(403).json({ error: `Your role (${req.user!.role}) cannot edit sourcing requests.` });
  }
  const data: any = {};
  for (const f of ['status', 'sentToId', 'sentAt']) if (f in req.body) data[f] = req.body[f];
  const prior = await prisma.sourcingRequest.findUnique({ where: { id: req.params.id }, select: { sentToId: true, client: { select: { name: true } } } });
  if (!prior) return res.status(404).json({ error: 'Sourcing request not found' });
  if (req.user!.role === 'recruiter') {
    if (prior.sentToId !== req.user!.id) {
      return res.status(403).json({ error: 'Not assigned to you.' });
    }
    if ('sentToId' in data && data.sentToId !== req.user!.id) {
      return res.status(403).json({ error: 'Recruiters cannot reassign requests to another user.' });
    }
  }
  const r = await prisma.sourcingRequest.update({ where: { id: req.params.id }, data, include });
  // If routing changed, notify the new recruiter.
  if (data.sentToId && data.sentToId !== prior?.sentToId) {
    await notify({
      userId: data.sentToId,
      kind: 'SourcingReassigned',
      title: `Sourcing request reassigned to you — ${prior?.client?.name || r.client.name}`,
      body: `${req.user!.name} routed this client to you.`,
      link: `/sourcing`,
      email: true,
    });
  }
  res.json(r);
});

// Add proposal(s) — recruiter submits 1-4 trainers initially, and may append more
// at any time until the request is Closed (a trainer was matched) or Rejected.
sourcingRouter.post('/:id/proposals', async (req: AuthedRequest, res) => {
  const { proposals } = req.body;
  if (!Array.isArray(proposals) || proposals.length === 0) {
    return res.status(400).json({ error: 'proposals array required' });
  }
  // Pre-check request status
  const existing = await prisma.sourcingRequest.findUnique({
    where: { id: req.params.id },
    include: { client: { select: { id: true, lifecycle: true, name: true } } },
  });
  if (!existing) return res.status(404).json({ error: 'Sourcing request not found' });
  if (existing.status === 'Closed') {
    return res.status(409).json({
      error: 'This sourcing request is closed (a trainer was already matched). Open a new request if more options are needed.',
    });
  }
  // Stages where adding proposals no longer makes sense (trainer already matched / past demo)
  const lockedLifecycles = ['TrainerMatched', 'DemoScheduled', 'DemoDone', 'SaleClosing', 'SaleWon', 'Active', 'LeverageGranted', 'Completed', 'Churned'];
  if (existing.client && lockedLifecycles.includes(existing.client.lifecycle)) {
    return res.status(409).json({
      error: `Client is at "${existing.client.lifecycle}" — proposals can't be added after a trainer is matched. Reset to InternalSearch/WithRecruiters first if you need to re-source.`,
    });
  }

  // VALIDATE: each proposal must include proof of trainer confirmation
  // (audio recording of the call OR WhatsApp screenshot showing timing/rate agreed)
  const VALID_KINDS = ['Audio', 'Screenshot'];
  for (let i = 0; i < proposals.length; i++) {
    const p = proposals[i];
    const label = p.trainerName || p.trainerId || `proposal ${i + 1}`;
    if (!p.confirmationUrl) {
      return res.status(400).json({
        error: `Confirmation proof required for "${label}". Upload an audio recording of the trainer call OR a WhatsApp screenshot showing they confirmed timing/rate.`,
      });
    }
    if (!p.confirmationKind || !VALID_KINDS.includes(p.confirmationKind)) {
      return res.status(400).json({
        error: `Confirmation kind for "${label}" must be one of: ${VALID_KINDS.join(', ')}.`,
      });
    }
  }

  // If only some proposals in the batch have a slot, propagate the first non-empty slot to
  // the rest so Aman doesn't have to re-enter the same time for every trainer he submits.
  const batchFallbackSlot: any[] | null =
    (proposals as any[]).find((p) => Array.isArray(p.availabilitySlots) && p.availabilitySlots.length > 0)?.availabilitySlots ?? null;

  const created = await prisma.$transaction(async (tx) => {
    const ps = [];
    for (const p of proposals) {
      // Auto-add to trainer pool: when the recruiter is proposing a fresh contact
      // (no trainerId from pool selector), find an existing trainer by phone digits
      // or create a new one. This ensures every proposed trainer immediately shows
      // up in the pool and can be reused without re-typing in the next request.
      let trainerId: string | null = p.trainerId || null;
      if (!trainerId && (p.trainerName || p.trainerPhone)) {
        // Normalize phone: digits only, last 10. Normalize name: collapse whitespace,
        // strip punctuation, lowercase — so "Ravi  Kumar", "Ravi.Kumar", "ravi kumar"
        // all match the same trainer instead of creating duplicates.
        const phoneDigits = (p.trainerPhone || '').replace(/[^0-9]/g, '').slice(-10);
        const normName = (p.trainerName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        // Country-code heuristic: 10-digit US-looking phone or explicit +1 prefix → +1
        const trainerPhoneRaw = (p.trainerPhone || '').trim();
        const phoneCode = trainerPhoneRaw.startsWith('+1') || (phoneDigits.length === 10 && /^[2-9]/.test(phoneDigits) && trainerPhoneRaw.startsWith('+1')) ? '+1' : '+91';
        // De-dupe pass 1 — exact phone digits match.
        let existingTrainer = null;
        if (phoneDigits) {
          existingTrainer = await tx.trainer.findFirst({ where: { phoneDigits } });
        }
        // De-dupe pass 2 — normalized-name match. Compares lowercase + punctuation-stripped
        // form against every active trainer so small typing variations dedupe.
        if (!existingTrainer && normName) {
          const candidates = await tx.trainer.findMany({
            where: { active: true },
            select: { id: true, name: true },
          });
          existingTrainer = candidates.find((t) =>
            (t.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === normName,
          ) || null;
        }
        if (existingTrainer) {
          trainerId = existingTrainer.id;
        } else {
          const newTrainer = await tx.trainer.create({
            data: {
              name: (p.trainerName || 'Unnamed').replace(/\s+/g, ' ').trim(),
              email: p.trainerEmail || null,
              phoneCode,
              phoneDigits: phoneDigits || null,
              skills: p.trainerSkills || null,
              defaultRateInr: p.rateInr || 0,
              experienceYears: p.experienceYears || 0,
              rateModel: 'hourly',
              paymentMethod: 'UPI',
              recruitedById: req.user!.id,
              active: true,
            },
          });
          trainerId = newTrainer.id;
        }
      }
      const c = await tx.proposal.create({
        data: {
          requestId: req.params.id,
          trainerId,
          trainerName: p.trainerName || null,
          trainerSkills: p.trainerSkills || null,
          trainerPhone: p.trainerPhone || null,
          trainerEmail: p.trainerEmail || null,
          rateInr: p.rateInr || 0,
          experienceYears: p.experienceYears || 0,
          availabilitySlots: Array.isArray(p.availabilitySlots) && p.availabilitySlots.length > 0
            ? p.availabilitySlots
            : (batchFallbackSlot ?? null),
          notes: p.notes || null,
          proposedById: req.user!.id,
          proposedAt: new Date().toISOString().slice(0, 10),
          verification: 'Pending',
          confirmationKind: p.confirmationKind,
          confirmationUrl: p.confirmationUrl,
          skillMatrixUrl: p.skillMatrixUrl || null,
          // Structured skill matrix entries — preferred over uploaded file when present
          mustHaveSkills: Array.isArray(p.mustHaveSkills) ? p.mustHaveSkills : null,
          softSkills: Array.isArray(p.softSkills) ? p.softSkills : null,
        },
      });
      ps.push(c);
    }
    // Move request to Proposed (no-op if already), and client to VerificationPending
    // ONLY if client isn't already past that stage. Never regress.
    if (existing.status !== 'Proposed') {
      await tx.sourcingRequest.update({ where: { id: req.params.id }, data: { status: 'Proposed' } });
    }
    if (existing.client && ['WithRecruiters', 'InternalSearch', 'IntakeReceived'].includes(existing.client.lifecycle)) {
      await tx.client.update({ where: { id: existing.client.id }, data: { lifecycle: 'VerificationPending' } });
    }
    return ps;
  });
  await audit(
    req.user!.id, req.user!.name, 'PROPOSALS_ADD',
    `${created.length} proposal(s) → ${existing.client?.name || existing.clientId}${existing.status === 'Proposed' ? ' (appended)' : ''}`,
  );
  // Notify the demo intake owner that they have proposals to verify.
  // Falls back to whichever Team-2 user originally captured the lead.
  const fullClient = await prisma.client.findUnique({
    where: { id: existing.clientId },
    select: { name: true, intakeOwnerId: true, leadOwnerId: true },
  });
  const notifyTarget = fullClient?.intakeOwnerId || fullClient?.leadOwnerId;
  if (notifyTarget && notifyTarget !== req.user!.id) {
    await notify({
      userId: notifyTarget,
      kind: 'ProposalReceived',
      title: `${created.length} trainer proposal${created.length === 1 ? '' : 's'} for ${fullClient?.name || existing.clientId}`,
      body: `${req.user!.name} proposed candidates — review on the verifications page.`,
      link: `/verifications`,
      email: true,
    });
  }
  res.status(201).json(created);
});

sourcingRouter.patch('/proposal/:proposalId', async (req: AuthedRequest, res) => {
  // Role gate. Different fields have different owners:
  //   verification* — only Team-2 (Anjali/Taran/Samita) + leadership; recruiters
  //     would otherwise be able to PATCH their own proposal to Pass and bypass
  //     the dedicated /pass endpoint that enforces the notify-trainer gate.
  //   notes/rateInr/availabilitySlots — recruiter who owns the proposal can
  //     keep editing as they iterate.
  //   postDemoNote/postDemoEvidence* — Team-2 records per-trainer feedback on
  //     Move-back, never touched by recruiters.
  const ROLE = req.user!.role;
  const TEAM_2 = ['founder', 'manager', 'demo_lead', 'demo_intake'];
  const RECRUITER_OK = ['founder', 'manager', 'recruiter'];
  const incoming: Record<string, any> = {};
  for (const f of [
    'verification', 'verificationNotes', 'notes', 'rateInr',
    'availabilitySlots',
    'postDemoStatus', 'postDemoNote', 'postDemoEvidenceUrl', 'postDemoEvidenceKind',
  ]) {
    if (f in req.body) incoming[f] = req.body[f];
  }
  const wantsVerificationEdit = 'verification' in incoming || 'verificationNotes' in incoming;
  const wantsPostDemoEdit = 'postDemoStatus' in incoming || 'postDemoNote' in incoming || 'postDemoEvidenceUrl' in incoming || 'postDemoEvidenceKind' in incoming;
  const wantsRecruiterEdit = 'notes' in incoming || 'rateInr' in incoming || 'availabilitySlots' in incoming;
  if (wantsVerificationEdit && !TEAM_2.includes(ROLE)) {
    return res.status(403).json({ error: `Your role (${ROLE}) cannot change a proposal's verification status. Use the /pass endpoint or ask Anjali/Taran.` });
  }
  if (wantsPostDemoEdit && !TEAM_2.includes(ROLE)) {
    return res.status(403).json({ error: `Your role (${ROLE}) cannot record post-demo feedback on a proposal.` });
  }
  if (wantsRecruiterEdit && !RECRUITER_OK.includes(ROLE) && !TEAM_2.includes(ROLE)) {
    return res.status(403).json({ error: `Your role (${ROLE}) cannot edit proposal details.` });
  }
  // Ownership check for recruiter — they can only touch their own proposals.
  if (ROLE === 'recruiter') {
    const ownership = await prisma.proposal.findUnique({
      where: { id: req.params.proposalId },
      select: { proposedById: true, request: { select: { sentToId: true } } },
    });
    if (!ownership) return res.status(404).json({ error: 'Proposal not found' });
    if (ownership.proposedById !== req.user!.id && ownership.request.sentToId !== req.user!.id) {
      return res.status(403).json({ error: 'Not your proposal.' });
    }
  }
  const p = await prisma.proposal.update({ where: { id: req.params.proposalId }, data: incoming });
  await audit(req.user!.id, req.user!.name, 'PROPOSAL_UPDATE', `${p.id} → ${p.verification}`);
  res.json(p);
});

// Remove a pending proposal — recruiter can remove their own; leadership can remove any.
sourcingRouter.delete('/proposal/:proposalId', async (req: AuthedRequest, res) => {
  const ROLE = req.user!.role;
  const proposal = await prisma.proposal.findUnique({
    where: { id: req.params.proposalId },
    select: { id: true, verification: true, proposedById: true, request: { select: { sentToId: true } } },
  });
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.verification === 'Pass') {
    return res.status(400).json({ error: 'Cannot remove a passed proposal.' });
  }
  const isLeadership = ['founder', 'manager', 'demo_lead', 'demo_intake'].includes(ROLE);
  const isOwner = proposal.proposedById === req.user!.id || proposal.request.sentToId === req.user!.id;
  if (!isLeadership && !(ROLE === 'recruiter' && isOwner)) {
    return res.status(403).json({ error: 'You can only remove proposals you submitted.' });
  }
  await prisma.proposal.delete({ where: { id: req.params.proposalId } });
  await audit(req.user!.id, req.user!.name, 'PROPOSAL_REMOVE', req.params.proposalId);
  res.json({ ok: true });
});

// Atomic "Pass" endpoint — runs the entire verification handoff server-side.
// 1. Mark proposal Pass.
// 2. Auto-fail other Pending proposals on the same request.
// 3. If trainer was a "new" entry (no trainerId), create a Trainer record and link it.
// 4. Set client primaryTrainer + rate + lifecycle TrainerMatched.
// 5. Close the sourcing request.
sourcingRouter.post('/proposal/:proposalId/pass', async (req: AuthedRequest, res) => {
  const proposal = await prisma.proposal.findUnique({
    where: { id: req.params.proposalId },
    include: { request: { include: { client: true, proposals: true } } },
  });
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  // Permission: any user who can edit "workflow" on this client can pass a proposal
  // (founder, manager, demo_lead, demo_intake — i.e. Team 2 + leadership).
  const ALLOWED = ['founder', 'manager', 'demo_lead', 'demo_intake'];
  if (!ALLOWED.includes(req.user!.role)) {
    return res.status(403).json({ error: `Your role (${req.user!.role}) cannot verify proposals.` });
  }
  // Compulsory: the proposing recruiter (Aman/Kanchan) must have notified the trainer first.
  // Founder + manager keep an admin bypass for edge cases.
  if (!proposal.trainerNotifiedAt && !['founder', 'manager'].includes(req.user!.role)) {
    return res.status(409).json({
      error: 'Trainer has not been notified yet. Ask the recruiter (Aman/Kanchan) to click "Notify trainer" on this proposal first — email + WhatsApp must go out before verification.',
    });
  }

  const result = await prisma.$transaction(async (tx) => {
    // 3. If trainer is "new" (not from pool), create Trainer row first.
    let trainerId = proposal.trainerId;
    if (!trainerId) {
      const newTrainer = await tx.trainer.create({
        data: {
          name: proposal.trainerName || 'Unnamed',
          email: proposal.trainerEmail,
          phoneCode: '+91',
          phoneDigits: (proposal.trainerPhone || '').replace(/[^0-9]/g, '').slice(-10) || null,
          skills: proposal.trainerSkills,
          defaultRateInr: proposal.rateInr || 0,
          experienceYears: proposal.experienceYears || 0,
          rateModel: 'hourly',
          paymentMethod: 'UPI',
          recruitedById: proposal.proposedById,
          active: true,
        },
      });
      trainerId = newTrainer.id;
      // Link the proposal to the newly-created trainer
      await tx.proposal.update({ where: { id: proposal.id }, data: { trainerId } });
    }

    // 1. Mark this proposal Pass
    await tx.proposal.update({
      where: { id: proposal.id },
      data: { verification: 'Pass', verificationNotes: null },
    });

    // 2. (Removed) — we no longer auto-fail sibling Pending proposals.
    // Anjali/Taran routinely Pass multiple trainers per request so the client can
    // see two or three options on the skillset matrix and we can run more than
    // one demo. If a recruiter needs a specific proposal failed, they Fail it
    // explicitly.

    // 3. Update client: primaryTrainer (the most recent Pass becomes the
    // default for downstream actions like Schedule demo). The skill matrix
    // includes every Pass'd trainer regardless of which one is primary.
    // Only set lifecycle → TrainerMatched on the FIRST pass (don't regress).
    const client = await tx.client.findUnique({
      where: { id: proposal.request.clientId },
      select: { lifecycle: true },
    });
    await tx.client.update({
      where: { id: proposal.request.clientId },
      data: {
        primaryTrainerId: trainerId,
        engagementTrainerRateInr: proposal.rateInr || 0,
        // Only advance to TrainerMatched if the client isn't already past that stage.
        ...(client?.lifecycle && ['Lead', 'IntakeSent', 'IntakeReceived', 'InternalSearch', 'WithRecruiters', 'VerificationPending'].includes(client.lifecycle)
          ? { lifecycle: 'TrainerMatched' as const }
          : {}),
      },
    });

    // 4. Close the request ONLY when no Pending proposals remain — i.e. every
    // proposal has been explicitly Pass'd or Fail'd. With multi-pass enabled,
    // closing on the first Pass would hide remaining Pending proposals from the
    // Verifications page (which filters by status = Proposed) and Anjali would
    // lose the ability to Pass them.
    const remainingPending = await tx.proposal.count({
      where: { requestId: proposal.requestId, verification: 'Pending' },
    });
    if (remainingPending === 0) {
      await tx.sourcingRequest.update({
        where: { id: proposal.requestId },
        data: { status: 'Closed' },
      });
    }

    const totalPassed = await tx.proposal.count({ where: { requestId: proposal.requestId, verification: 'Pass' } });
    return { trainerId, totalPassed, remainingPending };
  });

  await audit(
    req.user!.id,
    req.user!.name,
    'PROPOSAL_PASS',
    `${proposal.trainerName || proposal.trainerId} for ${proposal.request.client.name}${result.totalPassed > 1 ? ` · ${result.totalPassed} total passed on this request` : ''}`,
  );
  res.json({ ok: true, ...result });
});

// Single-click "Notify + Pass" — Anjali's escape hatch when the recruiter has
// notified the trainer outside the portal (WhatsApp call, manual email) but the
// trainerNotifiedAt flag wasn't set. Same allowed roles as /pass; stamps the
// notified flag with the caller's id (so the audit log shows who self-attested)
// and then runs the standard Pass logic. Distinct audit action from PROPOSAL_PASS.
sourcingRouter.post('/proposal/:proposalId/notify-and-pass', async (req: AuthedRequest, res) => {
  const proposal = await prisma.proposal.findUnique({
    where: { id: req.params.proposalId },
    include: { request: { include: { client: true } } },
  });
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });

  const ALLOWED = ['founder', 'manager', 'demo_lead', 'demo_intake'];
  if (!ALLOWED.includes(req.user!.role)) {
    return res.status(403).json({ error: `Your role (${req.user!.role}) cannot verify proposals.` });
  }

  const today = new Date().toISOString().slice(0, 10);

  const result = await prisma.$transaction(async (tx) => {
    // Stamp notified (if not already) — the caller self-attests that the trainer was notified outside the portal.
    const selfNotified = !proposal.trainerNotifiedAt;
    if (selfNotified) {
      await tx.proposal.update({
        where: { id: proposal.id },
        data: {
          trainerNotifiedAt: today,
          trainerNotifiedById: req.user!.id,
        },
      });
    }

    // Create trainer record if proposal was for a "new" trainer not yet in the pool
    let trainerId = proposal.trainerId;
    if (!trainerId) {
      const newTrainer = await tx.trainer.create({
        data: {
          name: proposal.trainerName || 'Unnamed',
          email: proposal.trainerEmail,
          phoneCode: '+91',
          phoneDigits: (proposal.trainerPhone || '').replace(/[^0-9]/g, '').slice(-10) || null,
          skills: proposal.trainerSkills,
          defaultRateInr: proposal.rateInr || 0,
          experienceYears: proposal.experienceYears || 0,
          rateModel: 'hourly',
          paymentMethod: 'UPI',
          recruitedById: proposal.proposedById,
          active: true,
        },
      });
      trainerId = newTrainer.id;
      await tx.proposal.update({ where: { id: proposal.id }, data: { trainerId } });
    }

    await tx.proposal.update({
      where: { id: proposal.id },
      data: { verification: 'Pass', verificationNotes: null },
    });

    const client = await tx.client.findUnique({
      where: { id: proposal.request.clientId },
      select: { lifecycle: true },
    });
    await tx.client.update({
      where: { id: proposal.request.clientId },
      data: {
        primaryTrainerId: trainerId,
        engagementTrainerRateInr: proposal.rateInr || 0,
        ...(client?.lifecycle && ['Lead', 'IntakeSent', 'IntakeReceived', 'InternalSearch', 'WithRecruiters', 'VerificationPending'].includes(client.lifecycle)
          ? { lifecycle: 'TrainerMatched' as const }
          : {}),
      },
    });

    const remainingPending = await tx.proposal.count({
      where: { requestId: proposal.requestId, verification: 'Pending' },
    });
    if (remainingPending === 0) {
      await tx.sourcingRequest.update({
        where: { id: proposal.requestId },
        data: { status: 'Closed' },
      });
    }

    const totalPassed = await tx.proposal.count({ where: { requestId: proposal.requestId, verification: 'Pass' } });
    return { trainerId, totalPassed, remainingPending, selfNotified };
  });

  await audit(
    req.user!.id,
    req.user!.name,
    'PROPOSAL_NOTIFY_AND_PASS',
    `${proposal.trainerName || proposal.trainerId} for ${proposal.request.client.name}${result.selfNotified ? ' · trainer self-attested notified' : ''}${result.totalPassed > 1 ? ` · ${result.totalPassed} total passed` : ''}`,
  );
  res.json({ ok: true, ...result });
});

sourcingRouter.delete('/:id', async (req: AuthedRequest, res) => {
  // Limit to leadership — recruiters could otherwise nuke each other's requests.
  if (!['founder', 'manager'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only founder / manager can delete sourcing requests.' });
  }
  await prisma.sourcingRequest.delete({ where: { id: req.params.id } });
  await audit(req.user!.id, req.user!.name, 'SOURCING_DELETE', req.params.id);
  res.json({ ok: true });
});

// ─── Trainer outreach (Aman / Kanchan) ──────────────────────────────────────
//
// For a given Proposal (one of the trainers the recruiter has suggested), build
// a message with rate, payment day, host details and demo time, and either:
//   - GET /proposals/:id/outreach        → returns preview { text, html, subject, vars }
//   - POST /proposals/:id/outreach/email → actually sends email to the trainer
//   - POST /proposals/:id/outreach/whatsapp → logs the WA message and returns wa.me URL
//
// Allowed roles: recruiter (Aman/Kanchan), founder, manager.

/**
 * Wraps recruiter-edited plain text in a minimal, branded HTML container.
 * Used when the recruiter has manually edited the message body — we honour their wording
 * verbatim instead of re-rendering from structured fields.
 */
function wrapTextAsBrandedHtml(text: string, subject: string, senderName: string): string {
  const escHtml = (s: string) => (s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  // Auto-linkify URLs in the text so trainer can click guidelines, website, etc.
  const escaped = escHtml(text).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" style="color:#1A6CDF;text-decoration:underline;">$1</a>',
  );
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${escHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:'Inter','Helvetica Neue',Arial,sans-serif;color:#1A1B1E;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f4f4f6;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;padding:32px 36px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <tr><td style="font-size:15px;line-height:1.7;color:#1A1B1E;white-space:pre-wrap;">${escaped}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function loadProposalContext(proposalId: string) {
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      trainer: true,
      request: {
        include: {
          client: {
            include: {
              intakeOwner: { select: { id: true, name: true, email: true, gmailAddress: true, phone: true } },
              hostOwner:   { select: { id: true, name: true, email: true, gmailAddress: true, phone: true } },
            },
          },
          // Include sibling proposals so we can inherit slot from a sibling when this proposal has none.
          proposals: { select: { id: true, availabilitySlots: true } },
        },
      },
    },
  });
  if (!proposal) return null;
  return proposal;
}

function to12h(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return hhmm;
  let h = Number(m[1]);
  const mm = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${mm} ${ampm}`;
}

function formatDemoTimeFor(clientDemoDate?: string | null, clientDemoTimeIst?: string | null): string {
  if (!clientDemoDate) return '(to be confirmed)';
  try {
    const d = new Date(clientDemoDate + 'T12:00:00');
    const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const raw = (clientDemoTimeIst || '').trim();
    // Convert "20:00" style 24h strings to "8:00 PM" — if it's already human-readable, pass through
    const time = raw && /^\d{1,2}:\d{2}$/.test(raw) ? to12h(raw) : raw;
    return time ? `${time} IST · ${dateStr}` : dateStr;
  } catch { return clientDemoDate; }
}

/**
 * Convert proposal.availabilitySlots (the time Aman entered while proposing) into a
 * human-readable "8:00 AM IST · 8 June 2026" string for the trainer notification email.
 *
 * Slot shape: { window?: string, fromIst?: "HH:MM", toIst?: "HH:MM", date?: string }
 * Returns null if no usable slot found — caller falls back to client-level demo date.
 */
function formatSlotAsDemo(slots: any): string | null {
  if (!Array.isArray(slots) || slots.length === 0) return null;
  const slot = slots[0]; // take first slot
  if (!slot) return null;
  // Build time string from fromIst (24h "HH:MM") → 12h human
  let timePart = '';
  if (slot.fromIst) {
    const m = /^(\d{1,2}):(\d{2})/.exec(slot.fromIst);
    if (m) {
      let h = Number(m[1]);
      const mm = m[2];
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      timePart = `${h}:${mm} ${ampm}`;
      if (slot.toIst) {
        const m2 = /^(\d{1,2}):(\d{2})/.exec(slot.toIst);
        if (m2) {
          let h2 = Number(m2[1]);
          const mm2 = m2[2];
          const ampm2 = h2 >= 12 ? 'PM' : 'AM';
          h2 = h2 % 12 || 12;
          timePart += `–${h2}:${mm2} ${ampm2}`;
        }
      }
      timePart += ' IST';
    }
  }
  // Use window label (e.g. "Morning", "9 AM – 11 AM") as fallback time part
  if (!timePart && slot.window) timePart = slot.window;
  // Build date string from slot.date ("YYYY-MM-DD") or window text
  let datePart = '';
  if (slot.date) {
    try {
      const d = new Date(slot.date + 'T12:00:00');
      datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { datePart = slot.date; }
  }
  const parts = [timePart, datePart].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function buildVarsFromProposal(p: any, overrides: Partial<TrainerOutreachVars> = {}, senderName?: string): TrainerOutreachVars {
  const client = p.request?.client || {};
  // Host = whoever runs the demo — prefer hostOwner, fall back to intakeOwner (Anjali/Taran).
  const host = client.hostOwner || client.intakeOwner || null;
  const hostPhone = host?.phone || '';
  const hostEmail = host?.gmailAddress || host?.email || '';
  // Demo time priority:
  //   1. This proposal's own availability slots (freshest)
  //   2. Any sibling proposal in the same request that has slots (batch-fill fallback)
  //   3. Client-level demoDate (may be stale)
  //   4. "(to be confirmed)"
  const proposalDemoTime = formatSlotAsDemo(p.availabilitySlots)
    ?? (() => {
      const siblings: any[] = p.request?.proposals || [];
      const sibling = siblings.find((s: any) => s.id !== p.id && Array.isArray(s.availabilitySlots) && s.availabilitySlots.length > 0);
      return sibling ? formatSlotAsDemo(sibling.availabilitySlots) : null;
    })();
  return {
    trainerName: p.trainer?.name || p.trainerName || 'Trainer',
    hostName: host?.name || 'MITS Host',
    hostPhone,
    hostEmail,
    rateInr: overrides.rateInr ?? p.rateInr ?? 0,
    hoursPerSession: overrides.hoursPerSession ?? 2,
    paymentClearanceDay: overrides.paymentClearanceDay,
    demoCallTime: overrides.demoCallTime ?? proposalDemoTime ?? formatDemoTimeFor(client.demoDate, client.demoTimeIst),
    guidelinesLink: overrides.guidelinesLink,
    websiteLink: overrides.websiteLink,
    senderName: senderName || overrides.senderName,
    ...overrides,
  };
}

// Preview — recruiter sees the rendered template + raw vars before sending
sourcingRouter.get('/proposals/:id/outreach', async (req: AuthedRequest, res) => {
  if (!['founder', 'manager', 'recruiter'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only recruiters or admin can preview trainer outreach' });
  }
  const p = await loadProposalContext(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposal not found' });
  // Recruiter scoping: Aman/Kanchan only see their own
  if (req.user!.role === 'recruiter' && p.request.sentToId !== req.user!.id) {
    return res.status(403).json({ error: 'Not assigned to you' });
  }
  const vars = buildVarsFromProposal(p, {}, req.user!.name);
  res.json({
    subject: TRAINER_OUTREACH_SUBJECT(vars),
    text: buildTrainerOutreachText(vars),
    html: buildTrainerOutreachHtml(vars),
    vars,
    trainer: { id: p.trainer?.id || null, name: p.trainer?.name || p.trainerName, email: p.trainer?.email || p.trainerEmail, phone: p.trainer?.phoneDigits ? `${p.trainer.phoneCode || ''}${p.trainer.phoneDigits}` : p.trainerPhone },
  });
});

// Send email to the trainer
sourcingRouter.post('/proposals/:id/outreach/email', async (req: AuthedRequest, res) => {
  if (!['founder', 'manager', 'recruiter'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only recruiters or admin can send trainer outreach' });
  }
  const p = await loadProposalContext(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposal not found' });
  if (req.user!.role === 'recruiter' && p.request.sentToId !== req.user!.id) {
    return res.status(403).json({ error: 'Not assigned to you' });
  }
  const toEmail: string = p.trainer?.email || p.trainerEmail || '';
  if (!toEmail) return res.status(400).json({ error: 'No email on file for this trainer — add one before sending.' });

  // Apply caller-supplied overrides. Plus optional customSubject / customText for cases where the
  // recruiter manually edited the body — when present, those take precedence over the structured render.
  const overrides = (req.body?.overrides || {}) as (Partial<TrainerOutreachVars> & { customSubject?: string; customText?: string });
  const me = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, gmailAddress: true, smtpAppPassword: true, sendAsAddress: true },
  });
  const vars = buildVarsFromProposal(p, overrides, me?.name || 'MITS Recruitment');
  const subject = overrides.customSubject?.trim() || TRAINER_OUTREACH_SUBJECT(vars);
  const text = overrides.customText?.trim() ? overrides.customText : buildTrainerOutreachText(vars);
  // If recruiter edited the body, wrap it in a simple branded HTML container — don't re-render
  // from structured vars (would clobber their edits).
  const html = overrides.customText?.trim()
    ? wrapTextAsBrandedHtml(overrides.customText, subject, me?.name || 'MITS Recruitment')
    : buildTrainerOutreachHtml(vars);

  let fromUser;
  if (me?.gmailAddress && me?.smtpAppPassword) {
    fromUser = {
      id: me.id, name: me.name, gmailAddress: me.gmailAddress,
      appPasswordPlain: decryptSecret(me.smtpAppPassword),
      sendAsAddress: me.sendAsAddress,
    };
  }

  // CC two people on every trainer outreach email:
  //   1. Samita (demo_lead / manager) — resolves via reportsToId chain, falls back to demo_lead role
  //   2. The intake partner paired with this recruiter (Taran↔Kanchan, Anjali↔Aman)
  //      so they can see exactly what's going out to the trainer for their client
  const INTAKE_PARTNER_FOR: Record<string, string> = {
    'u-aman':    'u-anjali',
    'u-kanchan': 'u-taran',
  };
  const ccAddresses: string[] = [];
  {
    // 1. Samita / manager via reportsToId chain
    let managerEmail: string | null = null;
    if (me?.id) {
      const recruiterRow = await prisma.user.findUnique({
        where: { id: me.id },
        select: { reportsToId: true },
      });
      if (recruiterRow?.reportsToId) {
        const mgr = await prisma.user.findUnique({
          where: { id: recruiterRow.reportsToId },
          select: { sendAsAddress: true, gmailAddress: true, email: true },
        });
        managerEmail = mgr?.sendAsAddress || mgr?.gmailAddress || mgr?.email || null;
      }
    }
    if (!managerEmail) {
      const samita = await prisma.user.findFirst({
        where: { role: 'demo_lead', active: true },
        select: { sendAsAddress: true, gmailAddress: true, email: true },
      });
      managerEmail = samita?.sendAsAddress || samita?.gmailAddress || samita?.email || null;
    }
    if (managerEmail && managerEmail !== toEmail) ccAddresses.push(managerEmail);

    // 2. Intake partner (Taran for Kanchan, Anjali for Aman)
    const intakePartnerId = me?.id ? INTAKE_PARTNER_FOR[me.id] : undefined;
    if (intakePartnerId) {
      const partner = await prisma.user.findUnique({
        where: { id: intakePartnerId },
        select: { sendAsAddress: true, gmailAddress: true, email: true },
      });
      const partnerEmail = partner?.sendAsAddress || partner?.gmailAddress || partner?.email || null;
      if (partnerEmail && partnerEmail !== toEmail && !ccAddresses.includes(partnerEmail)) {
        ccAddresses.push(partnerEmail);
      }
    }
  }

  // Persist + send
  const msg = await prisma.outboundMessage.create({
    data: {
      kind: 'Email',
      toEmail,
      subject,
      body: text,
      clientId: p.request.clientId,
      trainerId: p.trainer?.id || null,
      sentById: req.user!.id,
      status: 'Queued',
      provider: 'smtp',
    },
  });
  try {
    const r = await sendEmail({ to: toEmail, subject, body: text, htmlBody: html, fromUser, cc: ccAddresses.length ? ccAddresses : undefined });
    await prisma.outboundMessage.update({
      where: { id: msg.id },
      data: { status: 'Sent', providerMessageId: r.id, provider: r.provider },
    });
    // Stamp the proposal as notified — unlocks verification Pass for Anjali/Taran
    const today = new Date().toISOString().slice(0, 10);
    const notifyVarsToSave = { rateInr: vars.rateInr, hoursPerSession: overrides.hoursPerSession ?? 2, paymentClearanceDay: overrides.paymentClearanceDay ?? 'Every Wednesday', pricingMode: overrides.pricingMode ?? 'session', demoCallTime: overrides.demoCallTime ?? '' };
    await prisma.proposal.update({
      where: { id: p.id },
      data: { trainerNotifiedAt: today, trainerNotifiedById: req.user!.id, lastNotifyVars: notifyVarsToSave },
    });
    await audit(req.user!.id, req.user!.name, 'TRAINER_OUTREACH_EMAIL', `${vars.trainerName} · ${toEmail} · ₹${vars.rateInr}`);
    res.status(201).json({ ok: true, messageId: msg.id, providerMessageId: r.id });
  } catch (e: any) {
    await prisma.outboundMessage.update({
      where: { id: msg.id },
      data: { status: 'Failed', errorText: e.message || String(e) },
    });
    res.status(502).json({ error: 'Trainer email send failed: ' + (e.message || String(e)), code: (e as any)?.code, messageId: msg.id });
  }
});

// Build WhatsApp link + log it (free path — no API send, recruiter clicks the wa.me URL)
sourcingRouter.post('/proposals/:id/outreach/whatsapp', async (req: AuthedRequest, res) => {
  if (!['founder', 'manager', 'recruiter'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only recruiters or admin can build WhatsApp messages' });
  }
  const p = await loadProposalContext(req.params.id);
  if (!p) return res.status(404).json({ error: 'Proposal not found' });
  if (req.user!.role === 'recruiter' && p.request.sentToId !== req.user!.id) {
    return res.status(403).json({ error: 'Not assigned to you' });
  }
  // Prefer the trainer's WhatsApp GROUP link (private 1:1 chat between MITS team and trainer);
  // fall back to personal phone if no group is configured.
  const groupLink: string = p.trainer?.whatsappGroupLink || '';
  const phoneRaw: string =
    (p.trainer?.phoneDigits ? `${p.trainer.phoneCode || ''}${p.trainer.phoneDigits}` : '') ||
    p.trainerPhone || '';
  const digits = (phoneRaw || '').replace(/[^0-9]/g, '');
  if (!groupLink && !digits) {
    return res.status(400).json({ error: 'No WhatsApp group link or phone on file for this trainer.' });
  }

  const overrides = (req.body?.overrides || {}) as (Partial<TrainerOutreachVars> & { customText?: string });
  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } });
  const vars = buildVarsFromProposal(p, overrides, me?.name || 'MITS Recruitment');
  const text = overrides.customText?.trim() ? overrides.customText : buildTrainerOutreachText(vars);

  // Group links can't carry pre-filled text — recruiter pastes from clipboard / message history.
  // Personal wa.me links pre-fill the text in the trainer's chat.
  const url = groupLink || `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  const channel = groupLink ? 'group' : 'personal';

  await prisma.outboundMessage.create({
    data: {
      kind: 'WhatsApp',
      toPhone: groupLink || phoneRaw,
      toName: groupLink ? `${vars.trainerName} · group` : vars.trainerName,
      body: text,
      clientId: p.request.clientId,
      trainerId: p.trainer?.id || null,
      sentById: req.user!.id,
      status: 'Logged',
      provider: 'wa-link',
    },
  });
  // Stamp proposal as notified — unlocks verification Pass
  const today = new Date().toISOString().slice(0, 10);
  const waNotifyVars = { rateInr: vars.rateInr, hoursPerSession: overrides.hoursPerSession ?? 2, paymentClearanceDay: overrides.paymentClearanceDay ?? 'Every Wednesday', pricingMode: overrides.pricingMode ?? 'session', demoCallTime: overrides.demoCallTime ?? '' };
  await prisma.proposal.update({
    where: { id: p.id },
    data: { trainerNotifiedAt: today, trainerNotifiedById: req.user!.id, lastNotifyVars: waNotifyVars },
  });
  await audit(req.user!.id, req.user!.name, 'TRAINER_OUTREACH_WA', `${vars.trainerName} · ${channel} · ${groupLink || phoneRaw} · ₹${vars.rateInr}`);
  res.json({ ok: true, url, text, channel });
});

// ─── Mark as "already notified" (trainer was told outside the tool) ──────────
// Recruiter confirms the details manually instead of sending via the tool.
// Body: { rateInr, hoursPerSession, paymentClearanceDay, pricingMode, demoCallTime? }
// All fields required (no history) OR all can be omitted if lastNotifyVars exists
// and the recruiter checks the "same as last time" box (frontend sends confirmed:true).
sourcingRouter.post('/proposals/:id/outreach/mark-notified', async (req: AuthedRequest, res) => {
  if (!['founder', 'manager', 'recruiter'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Only recruiters or admin can mark trainer as notified.' });
  }
  const p = await prisma.proposal.findUnique({
    where: { id: req.params.id },
    select: { id: true, rateInr: true, lastNotifyVars: true, request: { select: { sentToId: true, clientId: true } } },
  });
  if (!p) return res.status(404).json({ error: 'Proposal not found' });
  if (req.user!.role === 'recruiter' && p.request.sentToId !== req.user!.id) {
    return res.status(403).json({ error: 'Not assigned to you' });
  }

  const { confirmed, rateInr, hoursPerSession, paymentClearanceDay, pricingMode, demoCallTime } = req.body as {
    confirmed?: boolean;
    rateInr?: number;
    hoursPerSession?: number;
    paymentClearanceDay?: string;
    pricingMode?: string;
    demoCallTime?: string;
  };

  let notifyVars: any;

  if (confirmed && p.lastNotifyVars) {
    // Recruiter confirmed same details as last time — reuse stored vars
    notifyVars = p.lastNotifyVars;
  } else {
    // No history or recruiter changed details — require all fields
    if (!rateInr || !hoursPerSession || !paymentClearanceDay || !pricingMode) {
      return res.status(400).json({
        error: 'Please fill in rate, hours/session, payment day, and pricing mode.',
        requiresForm: true,
      });
    }
    notifyVars = { rateInr, hoursPerSession, paymentClearanceDay, pricingMode, demoCallTime: demoCallTime || '' };
  }

  const today = new Date().toISOString().slice(0, 10);
  await prisma.proposal.update({
    where: { id: p.id },
    data: { trainerNotifiedAt: today, trainerNotifiedById: req.user!.id, lastNotifyVars: notifyVars },
  });
  await audit(req.user!.id, req.user!.name, 'TRAINER_NOTIFIED_MANUAL', `proposal ${p.id} · ₹${notifyVars.rateInr}`);
  res.json({ ok: true, notifyVars });
});

// ─── Skill matrix per proposal (Aman fills criteria) ───────────────────────
// Patch a single proposal's structured matrix entries (mustHaveSkills / softSkills).
sourcingRouter.patch('/proposals/:id/skill-matrix', async (req: AuthedRequest, res) => {
  if (!['founder', 'manager', 'recruiter', 'demo_lead', 'demo_intake'].includes(req.user!.role)) {
    return res.status(403).json({ error: 'Not allowed to edit skill matrix' });
  }
  const { mustHaveSkills, softSkills } = req.body || {};
  if (mustHaveSkills && !Array.isArray(mustHaveSkills)) return res.status(400).json({ error: 'mustHaveSkills must be array' });
  if (softSkills && !Array.isArray(softSkills)) return res.status(400).json({ error: 'softSkills must be array' });

  const existing = await prisma.proposal.findUnique({
    where: { id: req.params.id },
    include: { request: true, trainer: true },
  });
  if (!existing) return res.status(404).json({ error: 'Proposal not found' });
  if (req.user!.role === 'recruiter' && existing.request.sentToId !== req.user!.id) {
    return res.status(403).json({ error: 'Not assigned to you' });
  }

  const updated = await prisma.proposal.update({
    where: { id: req.params.id },
    data: {
      ...(mustHaveSkills !== undefined ? { mustHaveSkills } : {}),
      ...(softSkills !== undefined ? { softSkills } : {}),
    },
  });
  await audit(
    req.user!.id, req.user!.name, 'SKILL_MATRIX_UPDATED',
    `${existing.trainer?.name || existing.trainerName || existing.id}: ${(mustHaveSkills || []).length} skills · ${(softSkills || []).length} soft items`,
  );
  res.json(updated);
});

// Preview the consolidated skill matrix for a client's current proposals (returns rendered HTML + text).
sourcingRouter.get('/clients/:clientId/skill-matrix', async (req: AuthedRequest, res) => {
  const { buildSkillMatrixHtml, buildSkillMatrixText, istToUsZones, DEFAULT_SOFT_SKILLS } = await import('../lib/skillMatrix');
  const client = await prisma.client.findUnique({
    where: { id: req.params.clientId },
    select: { id: true, name: true, demoDate: true, demoTimeIst: true, primaryTrainerId: true },
  });
  if (!client) return res.status(404).json({ error: 'Client not found' });
  // Allow caller (the modal) to override demoDate/demoTimeIst at preview time
  // so the recruiter sees the matrix populated even before the demo is scheduled.
  const demoDateUse = (req.query.demoDate as string) || client.demoDate || '';
  const demoTimeUse = (req.query.demoTimeIst as string) || client.demoTimeIst || '';
  // Anjali's two asks: (1) let her tick which trainers to include before sharing,
  // (2) allow a per-trainer demo slot since trainers don't all have the same
  // availability. Both are passed by the modal as query params:
  //   selectedTrainerIds = comma-separated list of trainerIds to include
  //   slots               = JSON string of [{ trainerId, date, timeIst }] for
  //                         per-trainer overrides
  const selectedTrainerIdsParam = (req.query.selectedTrainerIds as string) || '';
  const selectedTrainerIds = selectedTrainerIdsParam ? selectedTrainerIdsParam.split(',').filter(Boolean) : null;
  let perTrainerSlots: { trainerId: string; date?: string; timeIst?: string }[] = [];
  if (typeof req.query.slots === 'string' && req.query.slots) {
    try { perTrainerSlots = JSON.parse(req.query.slots) || []; } catch { perTrainerSlots = []; }
  }
  const slotFor = (trainerId: string | null | undefined) =>
    trainerId ? perTrainerSlots.find((s) => s.trainerId === trainerId) : undefined;

  // Collect all proposals from this client's currently-open or proposed sourcing requests.
  const reqs = await prisma.sourcingRequest.findMany({
    where: { clientId: client.id, status: { in: ['Open', 'Proposed', 'Closed'] } },
    include: { proposals: { include: { trainer: true } } },
    orderBy: { createdAt: 'desc' },
  });
  // Prefer Passed proposals; fall back to all if none passed yet.
  const allProposals = reqs.flatMap((r) => r.proposals);
  const passed = allProposals.filter((p: any) => p.verification === 'Pass');
  // Helper: parse a comma/semicolon/newline-separated "skills" string into the
  // {skill, proficiency} shape that the matrix renderer expects.
  const parseSkillsString = (raw: string | null | undefined) =>
    (raw || '').split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12)
      .map((skill) => ({ skill, proficiency: 4 }));
  let basePool = (passed.length > 0 ? passed : allProposals);
  // Apply Anjali's trainer-selection filter — when she ticks only 2 of 3, drop the rest.
  if (selectedTrainerIds && selectedTrainerIds.length > 0) {
    basePool = basePool.filter((p: any) => p.trainer?.id && selectedTrainerIds.includes(p.trainer.id));
  }
  let candidates = basePool.map((p: any) => {
    const proposalSkills = Array.isArray(p.mustHaveSkills) ? p.mustHaveSkills : [];
    const fallbackSkills = proposalSkills.length === 0
      ? parseSkillsString(p.trainerSkills || p.trainer?.skills)
      : proposalSkills;
    // Per-trainer slot override (Anjali sets each trainer's own date+time)
    const slot = slotFor(p.trainer?.id);
    const dateUse = slot?.date || demoDateUse;
    const timeUse = slot?.timeIst || demoTimeUse;
    return {
      trainerId: p.trainer?.id || null,
      name: p.trainer?.name || p.trainerName || '—',
      totalExperience: p.experienceYears ? `${p.experienceYears} Years` : (p.trainer?.experienceYears ? `${p.trainer.experienceYears} Years` : '—'),
      demoDate: dateUse,
      demoTimeIst: timeUse ? `${timeUse} IST` : '',
      zoneTimes: istToUsZones(timeUse, dateUse),
      mustHaveSkills: fallbackSkills,
      softSkills: Array.isArray(p.softSkills) && p.softSkills.length > 0 ? p.softSkills : DEFAULT_SOFT_SKILLS,
    };
  });
  // Internal Search fallback: when Anjali picks a trainer directly from the pool we
  // never create a Proposal — synthesize a single candidate from the primary trainer.
  if (candidates.length === 0 && client.primaryTrainerId
      && (!selectedTrainerIds || selectedTrainerIds.includes(client.primaryTrainerId))) {
    const t = await prisma.trainer.findUnique({
      where: { id: client.primaryTrainerId },
      select: { name: true, experienceYears: true, skills: true },
    });
    if (t) {
      const skillList = (t.skills || '')
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12)
        .map((skill) => ({ skill, proficiency: 4 }));
      const slot = slotFor(client.primaryTrainerId);
      const dateUse = slot?.date || demoDateUse;
      const timeUse = slot?.timeIst || demoTimeUse;
      candidates = [{
        trainerId: client.primaryTrainerId,
        name: t.name || '—',
        totalExperience: t.experienceYears ? `${t.experienceYears} Years` : '—',
        demoDate: dateUse,
        demoTimeIst: timeUse ? `${timeUse} IST` : '',
        zoneTimes: istToUsZones(timeUse, dateUse),
        mustHaveSkills: skillList,
        softSkills: DEFAULT_SOFT_SKILLS,
      }];
    }
  }
  const opts = {
    clientName: client.name,
    candidates,
    introNote: `Dear ${client.name}, please find below the proposed trainer profiles for your review.`,
  };
  res.json({
    html: buildSkillMatrixHtml(opts),
    text: buildSkillMatrixText(opts),
    subject: `MITS · Proposed trainer profiles for ${client.name}`,
    candidates,
  });
});


