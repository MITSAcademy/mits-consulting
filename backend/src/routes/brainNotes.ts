import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { audit } from '../lib/audit';
import { askAi, getConfiguredProvider } from '../lib/aiProvider';
import { buildMitsContext } from '../lib/aiContext';

export const brainNotesRouter = Router();
brainNotesRouter.use(requireAuth);

// GET / — list notes visible to the requester (auto-seeds defaults on first ever load)
brainNotesRouter.get('/', async (req: AuthedRequest, res) => {
  const user = req.user!;
  const { category, tag, search, pinned } = req.query as any;

  // Auto-seed on first load if table is completely empty
  const total = await prisma.brainNote.count();
  if (total === 0) {
    const vaibhav = await prisma.user.findUnique({ where: { id: 'u-vaibhav' }, select: { id: true } });
    if (vaibhav) {
      // fire-and-forget so the GET still returns quickly; notes appear on next load
      runDefaultSeed(vaibhav.id).catch((e) => console.error('[brain-notes] auto-seed error:', e));
    }
  }

  // Founder sees all; others see notes where their role is in visibleTo
  const where: any = user.role === 'founder' ? {} : {
    visibleTo: { has: user.role },
  };

  if (category) where.category = category;
  if (pinned === 'true') where.isPinned = true;
  if (tag) where.tags = { has: tag };
  if (search) where.OR = [
    { title: { contains: search, mode: 'insensitive' } },
    { content: { contains: search, mode: 'insensitive' } },
  ];

  const notes = await prisma.brainNote.findMany({
    where,
    include: { author: { select: { id: true, name: true } } },
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
  });
  res.json(notes);
});

// GET /:id — single note (founder always; others if role in visibleTo)
brainNotesRouter.get('/:id', async (req: AuthedRequest, res) => {
  const user = req.user!;
  const note = await prisma.brainNote.findUnique({
    where: { id: req.params.id },
    include: { author: { select: { id: true, name: true } } },
  });
  if (!note) return res.status(404).json({ error: 'Not found' });
  if (user.role !== 'founder' && !note.visibleTo.includes(user.role)) {
    return res.status(403).json({ error: 'Not visible to your role' });
  }
  res.json(note);
});

// ── Default seed data ─────────────────────────────────────────────────────────
const ALL_R = ['manager','lead','account_manager','demo_lead','demo_intake','recruiter','sales_closer','accounts','payment_processor'];
const OPS_R = ['manager','lead','account_manager'];

const DEFAULT_NOTES = [
  { title: 'Golden Rule: Never Promise a Specific Trainer', category: 'decision', isPinned: true, tags: ['trainers','sales','onboarding'], visibleTo: ALL_R,
    content: `<h2>Decision</h2><p>We <strong>never guarantee a specific trainer by name</strong> to a client before training starts. We promise expertise level and subject match — not a named individual.</p><h2>Why</h2><ul><li>Trainers fall sick, get better offers, or become unavailable with short notice.</li><li>A promised trainer creates a contract-level expectation we can't always fulfill.</li><li>Has caused refund demands in the past when we swapped last-minute.</li></ul><h2>What to say instead</h2><blockquote>"We'll match you with a senior trainer from our vetted pool who has hands-on project experience in [topic]. You'll be introduced before the first session and can give feedback after — if it's not the right fit, we'll find someone better."</blockquote>` },

  { title: 'Payment First, Portal Access Second', category: 'decision', isPinned: true, tags: ['payment','ops'], visibleTo: ALL_R,
    content: `<h2>Decision</h2><p>No client gets a welcome email or trainer introduction until at least the <strong>first instalment is paid and confirmed</strong>.</p><h2>Why</h2><ul><li>We had cases where sessions started before payment cleared — all became collections headaches.</li><li>Creates urgency for the client to complete payment quickly.</li></ul><h2>Process</h2><ol><li>Roshni marks Sales Close in portal</li><li>Mitali assigns AM + sends payment link</li><li>AM waits for confirmation from Natasha / bank</li><li>Only then: welcome email sent, trainer introduced</li></ol><h2>Exceptions</h2><p>Vaibhav can override for high-trust corporate or partner clients (Collaborate, Technumen, G-Force, Sforce). Must be documented in the client note.</p>` },

  { title: 'Leverage = Last Resort, Not First Offer', category: 'decision', isPinned: true, tags: ['payment','leverage','collections'], visibleTo: OPS_R,
    content: `<h2>Decision</h2><p>Leverage (pausing sessions for non-payment) is granted only after <strong>3 follow-up attempts over 7+ days</strong> with no payment or credible date commitment.</p><h2>Escalation path</h2><ol><li><strong>Day 0</strong>: Payment due → Kashish / Muskan sends WhatsApp reminder</li><li><strong>Day 3</strong>: Second reminder with payment link</li><li><strong>Day 7</strong>: Call the client — get a committed date in writing</li><li><strong>Day 10</strong>: No payment, no solid date → escalate to Mitali</li><li><strong>Mitali decision</strong>: approve leverage or negotiate extension</li></ol><p>Only Mitali or Vaibhav can approve leverage. AMs do not grant it independently.</p>` },

  { title: 'Team Structure & Who Does What', category: 'general', isPinned: false, tags: ['team','roles','org'], visibleTo: ALL_R,
    content: `<h2>MITS Consulting Hub — Team Map</h2><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#f3f4f6"><th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Person</th><th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Role</th><th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Owns</th></tr></thead><tbody><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Vaibhav</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Founder</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Everything. Final decisions on pricing, refunds, leverage exceptions, hiring.</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Mitali</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Manager (Team 1)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Payment collection, AM oversight, daily ops, escalation point for AMs.</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Bhavneet</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Lead (Team 1)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Session scheduling, trainer management, daily session sheet, AM support.</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Kashish / Muskan</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Account Managers</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Client portfolio — sessions, follow-ups, payment reminders, feedback calls.</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Samita</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Demo Lead (Team 2)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">All demos, feedback queue, demo-stage client decisions.</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Anjali / Taran</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Demo Intake (Team 2)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Logging inbound leads, scheduling demos for Samita.</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Roshni</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Sales Closer</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Post-demo follow-up, proposal, closure call. Marks "Sales Close" in portal.</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Amandeep / Kanchan</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Recruiters</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Sourcing trainers. Amandeep: Java/cloud/DevOps. Kanchan: frontend/full-stack/niche.</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Natasha</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Payment Processor</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Confirms payments received, updates portal, bank reconciliation.</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Areena / Ashok</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Accounts</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Invoicing, GST, reports, partner payments.</td></tr></tbody></table><h2>Escalation chain</h2><p>AM issue → <strong>Bhavneet</strong> → <strong>Mitali</strong> → <strong>Vaibhav</strong><br/>Demo issue → <strong>Samita</strong> → <strong>Vaibhav</strong><br/>Payment dispute → <strong>Mitali</strong> → <strong>Vaibhav</strong></p>` },

  { title: 'SOP: Demo → Onboarding Flow (Full)', category: 'sop', isPinned: false, tags: ['demo','onboarding','sales','flow'], visibleTo: ALL_R,
    content: `<h2>Step 1 — Lead logged (Anjali / Taran)</h2><p>Inbound lead comes via WhatsApp, website, or referral. Demo Intake creates client record in portal, logs source, sets status to <strong>Demo Scheduled</strong>.</p><h2>Step 2 — Demo (Samita)</h2><p>Samita conducts the demo. Immediately after: updates portal notes, marks <strong>Demo Done</strong> or <strong>No Show</strong>. No show → reschedule within 24h.</p><h2>Step 3 — Post-demo follow-up (Roshni, within 24h)</h2><p>Roshni calls the lead. Handles objections. If interested → sends proposal with pricing. Marks <strong>Proposal Sent</strong>.</p><h2>Step 4 — Closure (Roshni)</h2><p>Roshni marks <strong>Sales Close</strong> in portal. Mitali is notified. Payment link sent.</p><h2>Step 5 — Handover to Team 1 (after first payment)</h2><p>Natasha confirms payment. Mitali assigns AM. AM sends welcome message + skill matrix if applicable. Welcome email triggered via portal.</p><h2>Step 6 — Trainer sourcing</h2><p>AM raises sourcing request. Bhavneet assigns to Amandeep or Kanchan. 2-3 options within 3 days. Trainer introduced to client within 5 days of payment.</p><blockquote><strong>Target: first session within 7 days of first payment.</strong></blockquote>` },

  { title: 'SOP: Trainer Onboarding Checklist', category: 'sop', isPinned: false, tags: ['trainers','onboarding','ops','checklist'], visibleTo: ['manager','lead','recruiter'],
    content: `<h2>Before adding to portal</h2><ul><li>✅ LinkedIn profile verified — check experience is real, not inflated</li><li>✅ Trial session done with Bhavneet or internal team member (30 min)</li><li>✅ Rate agreed and documented (per hour or per session)</li><li>✅ Payment method collected: UPI ID or bank account + IFSC</li></ul><h2>Before first client session</h2><ul><li>✅ Trainer profile created in portal (photo, bio, skills, rate)</li><li>✅ NDA sent and signed (use template in portal)</li><li>✅ WhatsApp group: Trainer + Bhavneet + Mitali + AM</li><li>✅ Session time confirmed with both trainer and client</li><li>✅ Client introduced to trainer over WhatsApp 30 min before first session</li></ul><h2>Day of first session</h2><ul><li>✅ AM or Bhavneet joins first 10 minutes (silent, camera off)</li><li>✅ Feedback form sent to client within 1 hour of session end</li></ul><h2>After 3 sessions</h2><ul><li>Feedback score below 4/5 → discuss with trainer, log note</li><li>Below 3/5 → escalate to Vaibhav, consider trainer swap</li></ul><h2>Trainer payment</h2><p>Paid after client confirms session happened. Natasha processes via bank or UPI. Do not pay for sessions marked as no-show by client.</p>` },

  { title: 'SOP: Client Wants to Pause or Exit', category: 'sop', isPinned: false, tags: ['support','pause','retention','churn'], visibleTo: OPS_R,
    content: `<h2>First: understand the real reason</h2><p>Ask: "Can you help me understand what's made you feel this way? I want to make sure we get this right."</p><h3>Reason 1: "Too busy / travelling"</h3><p>Offer to reschedule sessions — not to pause billing. Propose recording sessions.</p><h3>Reason 2: "Not seeing results"</h3><p><strong>Escalate to Mitali same day.</strong> Arrange feedback call within 48 hours. Do not promise a pause before the call.</p><h3>Reason 3: "Financial issue"</h3><p>Discuss revised payment schedule. 2-week session hold possible with Mitali approval — billing cycle continues. No free extensions.</p><h3>Reason 4: "Trainer isn't good"</h3><p><strong>Escalate to Bhavneet immediately.</strong> Arrange trainer swap within 3 days. Offer 1 free make-up session. Never defend the trainer to the client.</p><h2>Refunds</h2><p>Need Vaibhav's approval. AMs and Mitali do not commit to refunds. Say: "I'll raise this with our founder and come back to you within 24 hours."</p>` },

  { title: 'SOP: Trainer Goes Missing / No Show', category: 'sop', isPinned: false, tags: ['trainers','escalation','ops','no-show'], visibleTo: OPS_R,
    content: `<h2>Within 15 minutes of session start</h2><ol><li>AM calls trainer on phone (not just WhatsApp)</li><li>If no answer → WhatsApp client: <em>"We're trying to reach your trainer. We'll update you in 10 minutes."</em></li><li>Notify Bhavneet on team group immediately</li></ol><h2>After 30 minutes — no-show confirmed</h2><ol><li>Call client: <em>"I'm really sorry — [Trainer name] hasn't joined. This session will be rescheduled at no extra cost, and we'll add a free make-up session."</em></li><li>Mark session as No Show (Trainer) in portal</li><li>Bhavneet to arrange backup trainer within 24 hours</li><li>Trainer's payment for that session is withheld</li></ol><h2>If unreachable 48 hours</h2><p>Treat as resignation. Begin replacement sourcing. Escalate to Vaibhav. Flag for blacklist review.</p>` },

  { title: 'Pricing Policy & Discount Authority', category: 'strategy', isPinned: false, tags: ['pricing','sales','discounts'], visibleTo: ['manager','lead','demo_lead','sales_closer'],
    content: `<h2>Our pricing model</h2><p>We sell by package (number of sessions or months), not by hour. This locks commitment and simplifies follow-up.</p><h2>Who can discount how much</h2><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#f3f4f6"><th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Person</th><th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Max discount</th><th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Condition</th></tr></thead><tbody><tr><td style="padding:6px 10px;border:1px solid #e5e7eb">Roshni (sales)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">5%</td><td style="padding:6px 10px;border:1px solid #e5e7eb">No approval needed</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb">Samita (demo lead)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">10%</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Competitive situations — log reason</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb">Mitali (manager)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">15%</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Must document reason in portal</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb">Vaibhav (founder)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Unlimited</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Strategic clients, referrals, partners</td></tr></tbody></table><h2>Rules</h2><ul><li>Never discount just because someone asks — try value conversation first</li><li>Don't discount for clients who already paid full price previously</li><li>Partner clients (Collaborate, Technumen, G-Force, Sforce) have separate rate cards — check with Vaibhav before quoting</li></ul>` },

  { title: 'Client Retention — What Actually Works', category: 'strategy', isPinned: false, tags: ['retention','clients','am'], visibleTo: OPS_R,
    content: `<h2>Top 3 reasons clients churn</h2><ol><li><strong>Trainer quality issues</strong> — inconsistent delivery, cancellations, poor communication</li><li><strong>No visible progress</strong> — client doesn't feel they're learning fast enough</li><li><strong>AM response lag</strong> — taking too long to reply to concerns</li></ol><h2>What retains clients</h2><ul><li><strong>Weekly check-in WhatsApp</strong> from their AM — even 1 line ("Hope yesterday's session went well!")</li><li><strong>Proactive milestone celebration</strong> — "You've completed 10 sessions — great commitment!"</li><li><strong>Solving problems before they escalate</strong> — if a session is cancelled, reach out first</li><li><strong>Personal connection</strong> — know client's goals, reference them in conversations</li></ul><h2>Target</h2><p>Each AM: less than 10% churn per quarter. Above 15% triggers a review with Mitali.</p><h2>Early warning signs — act within 24h</h2><ul><li>Client stops responding to WhatsApp for 3+ days</li><li>Feedback form score drops below 3.5</li><li>Client misses 2 consecutive sessions without explanation</li><li>Client starts asking "how many sessions are left?" without excitement</li></ul>` },

  { title: 'Sourcing Playbook — Finding Trainers Fast', category: 'strategy', isPinned: false, tags: ['trainers','sourcing','recruiters'], visibleTo: ['lead','recruiter'],
    content: `<h2>Best channels (ranked by quality)</h2><ol><li><strong>Referrals from existing trainers</strong> — best quality. Ask current trainers. Offer ₹500 referral bonus.</li><li><strong>LinkedIn search</strong> — "corporate trainer" + skill + city. Message within 24h. Kanchan: frontend/full-stack. Amandeep: Java/cloud/DevOps.</li><li><strong>Naukri / Indeed</strong> — for volume when needing multiple trainers quickly</li><li><strong>Facebook groups</strong> — "Corporate Trainers India" (15k+ members) good for niche skills</li></ol><h2>First outreach message</h2><blockquote>Hi [Name], I'm from MITS Solutions. We're looking for an experienced [Skill] trainer for a corporate client. Sessions are online, 1-1 or small batch. Would you be open to a quick 10-min call? Our rates are competitive and we have consistent, ongoing work.</blockquote><h2>Rate benchmarks (2026)</h2><ul><li>Java / Spring Boot: ₹700–1000/hr</li><li>AWS / DevOps / Kubernetes: ₹1000–1400/hr</li><li>React / Node.js / Frontend: ₹800–1200/hr</li><li>Data Science / ML: ₹1000–1500/hr</li><li>Salesforce / SAP: ₹1200–1800/hr</li></ul><h2>Red flags</h2><ul><li>Can't do a 30-min trial session on short notice</li><li>No LinkedIn or weak profile for claimed experience</li><li>Insists on cash payment only</li></ul><h2>SLA</h2><p>Shortlist of 2-3 trainers within <strong>3 days</strong> of sourcing request. Client introduction within <strong>5 days</strong>.</p>` },

  { title: 'Payment Collection Scripts (Word-for-Word)', category: 'general', isPinned: false, tags: ['payment','collections','scripts','whatsapp'], visibleTo: OPS_R,
    content: `<h2>First reminder (due date)</h2><blockquote>Hi [Name]! Hope your sessions are going well 😊 Just a gentle reminder that your next instalment of ₹[amount] was due today. You can pay via [link]. Do let me know if you need any help!</blockquote><h2>Second reminder (+3 days)</h2><blockquote>Hi [Name], following up on the payment of ₹[amount] due on [date]. Please let me know when you'll be able to process it — I want to make sure your sessions continue without interruption. Payment link: [link]</blockquote><h2>Third reminder (+7 days) — firmer</h2><blockquote>Hi [Name], I've reached out a couple of times about the pending ₹[amount]. We want to keep your sessions going. I'll need to flag this with my manager if it stays unpaid — please let me know by [date], or call me if there's anything I can help with.</blockquote><h2>Before leverage (after Mitali approval)</h2><blockquote>Hi [Name], the payment of ₹[amount] remains pending. I've raised this with our management, and we'll unfortunately need to pause your upcoming sessions from [date] until payment is cleared. Please let me know today if there's any way we can sort this out.</blockquote><h2>After payment received</h2><blockquote>Hi [Name], great news — we've received your payment of ₹[amount]. Thank you! Your next session is confirmed for [date/time]. See you then! 😊</blockquote>` },

  { title: 'Common Client Objections & How to Handle Them', category: 'general', isPinned: false, tags: ['sales','objections','demo','scripts'], visibleTo: ALL_R,
    content: `<h2>"Your price is too high"</h2><p><em>Don't discount immediately.</em> Ask: "Compared to what?" Reframe on value — real industry experience, customised content, dedicated AM. If still stuck, offer a smaller starter package.</p><h2>"Can I try one session first?"</h2><p>Yes — but a <strong>paid trial at a discounted rate</strong>, not free. Say: "We do offer a trial session at ₹[X] — it's a great way to test the fit before committing to the full package."</p><h2>"I want to think about it"</h2><p>Ask what's holding them back. Usually price, timing, or they need approval. Solve the real objection. Set a specific follow-up: "Should I call you Thursday at 6pm?"</p><h2>"I found someone cheaper on LinkedIn / Udemy"</h2><p>"Absolutely — there are cheaper options. The difference with us is accountability. If your trainer cancels or isn't a good fit, we handle it. With freelancers, you're on your own. What matters more — the cheapest rate, or certainty that the training actually happens and delivers results?"</p><h2>"My company will reimburse — invoice them directly?"</h2><p>Standard. Collect company GST number, issue pro-forma invoice. Payment within 5 business days of reimbursement approval. Ask for 50% advance upfront for new corporate clients.</p><h2>"The trainer doesn't seem experienced enough"</h2><p>Don't defend. Say: "Thank you — that's exactly what I need to know early. Let me arrange a better match for your next session." Then escalate to Bhavneet immediately.</p>` },

  { title: 'WhatsApp Communication Standards', category: 'general', isPinned: false, tags: ['communication','ops','clients','standards'], visibleTo: ALL_R,
    content: `<h2>Response time targets</h2><ul><li><strong>Client messages</strong>: within 2 hours, 10am–7pm IST</li><li><strong>Trainer messages</strong>: within 4 hours</li><li><strong>Internal team</strong>: same day</li></ul><h2>Tone guidelines</h2><ul><li>Start with the client's name — "Hi Nikhil!" not just "Hi"</li><li>Complete sentences — "k", "ok", "noted" as standalone replies are not acceptable</li><li>End every message with a clear next step or question</li><li>No ALL CAPS — reads as shouting</li><li>Emojis are fine — 1-2 max per message</li></ul><h2>Never discuss over WhatsApp</h2><ul><li>Refund decisions — always take to a phone call</li><li>Pricing negotiations — follow up with a formal quote on email</li><li>Trainer rates or internal costs</li><li>Complaints about other team members</li></ul><h2>When a client is angry</h2><p>Acknowledge first, never defend: <em>"I completely understand your frustration, and I'm sorry about this. Let me look into it right now and come back to you within the hour."</em> Then actually follow up within the hour.</p>` },

  { title: 'Feedback Call Guide (Session 3 + Midpoint)', category: 'general', isPinned: false, tags: ['feedback','retention','clients','calls'], visibleTo: OPS_R,
    content: `<h2>When to call</h2><ul><li>After session 3 — first structured check-in (mandatory)</li><li>At package midpoint</li><li>If feedback form score drops below 3.5/5</li><li>If client hasn't responded to WhatsApp in 5+ days</li></ul><h2>Call structure (10 minutes)</h2><ol><li><strong>Warm open</strong>: "Hi [Name], just calling to check in on how the training is going — do you have 10 minutes?"</li><li><strong>Progress check</strong>: "What's been most useful so far?" / "Is the pace right?" / "Anything you wish we were covering?"</li><li><strong>Trainer check</strong>: "How are you finding [trainer name]?" / "Any sessions particularly good or not so good?"</li><li><strong>Forward plan</strong>: "You have X sessions left. By the end you'll have [outcome]. Any questions about what comes next?"</li><li><strong>Close</strong>: "I'm your dedicated contact — always feel free to reach out."</li></ol><h2>After the call</h2><p>Log notes in portal within 1 hour. Any concern flagged → flag in portal + notify Mitali same day.</p>` },

  { title: 'Partner Accounts — How We Work With Them', category: 'general', isPinned: false, tags: ['partners','corporate','billing','reference'], visibleTo: ['manager','lead','accounts'],
    content: `<h2>Key partners</h2><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#f3f4f6"><th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Partner</th><th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Contact</th><th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Terms</th><th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Notes</th></tr></thead><tbody><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Collaborate Solutions</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Rita</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Monthly bulk / Net 30–60</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Bulk training contracts. High volume — needs reliable, experienced trainers.</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Technumen</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Vikram</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Per engagement / Net 45</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Salesforce training focus.</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>G-Force</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Suresh</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Per engagement / Net 30</td><td style="padding:6px 10px;border:1px solid #e5e7eb">General tech training.</td></tr><tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Sforce</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Anil</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Per engagement / Net 45</td><td style="padding:6px 10px;border:1px solid #e5e7eb">ServiceNow training.</td></tr></tbody></table><h2>Rules</h2><ul><li>Always issue GST invoice — partners require it for their books</li><li>Chase payment at Net 25 (5 days before due) — don't wait for them to be late</li><li>Rate negotiations go through Vaibhav only — never quote partner rates externally</li><li>Trainers for partner clients must be 5+ years experience — no freshers</li></ul>` },
];

async function runDefaultSeed(authorId: string): Promise<{ created: number; skipped: number }> {
  let created = 0, skipped = 0;
  for (const n of DEFAULT_NOTES) {
    const existing = await prisma.brainNote.findFirst({ where: { title: n.title } });
    if (existing) { skipped++; continue; }
    await prisma.brainNote.create({
      data: {
        title: n.title, content: n.content, category: n.category as any,
        tags: n.tags, visibleTo: n.visibleTo, isPinned: n.isPinned, authorId,
      },
    });
    created++;
  }
  return { created, skipped };
}

// POST /seed-defaults — one-time seed with MITS knowledge base (founder only, idempotent)
brainNotesRouter.post('/seed-defaults', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only Vaibhav can seed notes' });
  const { created, skipped } = await runDefaultSeed(req.user!.id);
  await audit(req.user!.id, req.user!.name, 'BRAIN_NOTE_SEED', `${created} created, ${skipped} skipped`);
  res.json({ created, skipped, total: DEFAULT_NOTES.length });
});

// POST / — create note (founder only)
brainNotesRouter.post('/', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only Vaibhav can create notes' });
  const { title, content, category, tags, visibleTo, isPinned } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  const note = await prisma.brainNote.create({
    data: {
      title: title.trim(),
      content: content || '',
      category: category || 'general',
      tags: Array.isArray(tags) ? tags : [],
      visibleTo: Array.isArray(visibleTo) ? visibleTo : [],
      isPinned: !!isPinned,
      authorId: req.user!.id,
    },
    include: { author: { select: { id: true, name: true } } },
  });
  await audit(req.user!.id, req.user!.name, 'BRAIN_NOTE_CREATE', note.title);
  res.status(201).json(note);
});

// PATCH /:id — update note (founder only)
brainNotesRouter.patch('/:id', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only Vaibhav can edit notes' });
  const { title, content, category, tags, visibleTo, isPinned } = req.body;
  const data: any = {};
  if (title !== undefined) data.title = title.trim();
  if (content !== undefined) data.content = content;
  if (category !== undefined) data.category = category;
  if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : [];
  if (visibleTo !== undefined) data.visibleTo = Array.isArray(visibleTo) ? visibleTo : [];
  if (isPinned !== undefined) data.isPinned = !!isPinned;
  const note = await prisma.brainNote.update({
    where: { id: req.params.id },
    data,
    include: { author: { select: { id: true, name: true } } },
  });
  await audit(req.user!.id, req.user!.name, 'BRAIN_NOTE_UPDATE', note.title);
  res.json(note);
});

// DELETE /:id — delete note (founder only)
brainNotesRouter.delete('/:id', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Only Vaibhav can delete notes' });
  const note = await prisma.brainNote.findUnique({ where: { id: req.params.id }, select: { title: true } });
  if (!note) return res.status(404).json({ error: 'Not found' });
  await prisma.brainNote.delete({ where: { id: req.params.id } });
  await audit(req.user!.id, req.user!.name, 'BRAIN_NOTE_DELETE', note.title);
  res.json({ ok: true });
});

// POST /ask — AI chat using notes as knowledge base
brainNotesRouter.post('/ask', async (req: AuthedRequest, res) => {
  const { message, history } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  const cfg = getConfiguredProvider();
  if (!cfg) {
    return res.status(503).json({ error: 'AI not configured', code: 'NO_AI_PROVIDER' });
  }

  const user = req.user!;

  // Fetch notes visible to the user
  const notesWhere: any = user.role === 'founder'
    ? {}
    : { visibleTo: { has: user.role } };

  const [notes, liveContext] = await Promise.all([
    prisma.brainNote.findMany({
      where: notesWhere,
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      take: 60,
    }),
    buildMitsContext(user).catch(() => ''),
  ]);

  // Build notes knowledge block
  const notesBlock = notes.length === 0
    ? '(No notes in the knowledge base yet)'
    : notes.map((n) =>
        `### ${n.title} [${n.category}${n.isPinned ? ', pinned' : ''}]\n${n.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`
      ).join('\n\n');

  const systemPrompt = `You are the Second Brain assistant for MITS Consulting — an AI guide powered by Vaibhav's personal knowledge base, portal SOPs, and live operational data.

The user asking is: ${user.name} (role: ${user.role}).

## Vaibhav's Knowledge Base (${notes.length} notes)
${notesBlock}

## Portal Processes & SOPs
MITS runs a training-and-consulting operation. The client lifecycle:
  Lead → IntakeReceived → WithRecruiters → VerificationPending → TrainerMatched → DemoScheduled → DemoDone → FeedbackPending → SaleClosing → SaleWon → Active → Completed.
  Side states: Dormant, Hold, Churned, InternalSearch.

Roshni's 7-step SaleClosing: 1) Checklist 2) Engagement letter 3) Payment WA 4) Record payment 5) Confirmation 6) Group rename 7) Mitali handover.
Win outcomes: Training-Paid, JBT-Paid, Training-EmployerLater, JBT-EmployerLater. Plus CP (closure pending) and C (not starting).

## Live Snapshot
${liveContext}

## Instructions
- Answer questions using the knowledge base above as primary context.
- When the question is about processes or SOPs, cite which note or process you're drawing from.
- When the question is about live data, use the snapshot.
- Be concise but complete. Use bullet points when listing steps or items.
- If you don't know something, say so clearly rather than guessing.`;

  try {
    const result = await askAi({
      systemPrompt,
      question: message,
      history: Array.isArray(history) ? history : [],
      maxTokens: 1200,
    });
    res.json({ answer: result.answer, provider: result.provider, model: result.model });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI error' });
  }
});
