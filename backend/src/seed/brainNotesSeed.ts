/**
 * Seed script — populates Second Brain with real MITS knowledge.
 * Run: npx ts-node src/seed/brainNotesSeed.ts
 */

import 'dotenv/config';
import { prisma } from '../lib/prisma';

const VAIBHAV_ID = 'u-vaibhav';

const ALL_ROLES = [
  'manager', 'lead', 'account_manager', 'demo_lead',
  'demo_intake', 'recruiter', 'sales_closer', 'accounts', 'payment_processor',
];
const OPS_ROLES = ['manager', 'lead', 'account_manager'];
const TEAM_ROLES = ['manager', 'lead', 'account_manager', 'demo_lead', 'demo_intake', 'recruiter'];

const notes = [

  // ── PINNED DECISIONS ──────────────────────────────────────────────────────
  {
    title: 'Golden Rule: Never Promise a Specific Trainer',
    category: 'decision',
    isPinned: true,
    tags: ['trainers', 'sales', 'onboarding'],
    visibleTo: ALL_ROLES,
    content: `<h2>Decision</h2>
<p>We <strong>never guarantee a specific trainer by name</strong> to a client before training starts. We promise expertise level and subject match — not a named individual.</p>
<h2>Why</h2>
<ul>
  <li>Trainers fall sick, get better offers, or become unavailable with short notice.</li>
  <li>A promised trainer creates a contract-level expectation we can't always fulfill.</li>
  <li>Has caused refund demands in the past when we had to swap last-minute.</li>
</ul>
<h2>What to say instead</h2>
<blockquote>"We'll match you with a senior trainer from our vetted pool who has hands-on project experience in [topic]. You'll be introduced before the first session and can give feedback after — if it's not the right fit, we'll find someone better."</blockquote>`,
  },

  {
    title: 'Payment First, Portal Access Second',
    category: 'decision',
    isPinned: true,
    tags: ['payment', 'ops'],
    visibleTo: ALL_ROLES,
    content: `<h2>Decision</h2>
<p>No client gets a welcome email or trainer introduction until at least the <strong>first instalment is paid and confirmed</strong>.</p>
<h2>Why</h2>
<ul>
  <li>We had cases where sessions started before payment cleared — all became collections headaches.</li>
  <li>Creates urgency for the client to complete payment quickly.</li>
</ul>
<h2>Process</h2>
<ol>
  <li>Roshni marks Sales Close in portal</li>
  <li>Mitali assigns AM + sends payment link</li>
  <li>AM waits for payment confirmation from Natasha / bank</li>
  <li>Only then: welcome email sent, trainer introduced</li>
</ol>
<h2>Exceptions</h2>
<p>Vaibhav can manually override for high-trust corporate or partner clients (Collaborate, Technumen, G-Force, Sforce). Must be documented in the client note.</p>`,
  },

  {
    title: 'Leverage = Last Resort, Not First Offer',
    category: 'decision',
    isPinned: true,
    tags: ['payment', 'leverage', 'collections'],
    visibleTo: OPS_ROLES,
    content: `<h2>Decision</h2>
<p>Leverage (pausing sessions for non-payment) is granted only after <strong>3 follow-up attempts over 7+ days</strong> with no payment or credible date commitment.</p>
<h2>Why</h2>
<p>Using leverage too early damages the relationship. Most clients pay when reminded — we don't need to pause sessions for a 2-day delay.</p>
<h2>Escalation path</h2>
<ol>
  <li><strong>Day 0</strong>: Payment due → Kashish / Muskan sends WhatsApp reminder</li>
  <li><strong>Day 3</strong>: Second reminder with payment link</li>
  <li><strong>Day 7</strong>: Call the client — get a committed date in writing</li>
  <li><strong>Day 10</strong>: No payment, no solid date → escalate to Mitali</li>
  <li><strong>Mitali decision</strong>: approve leverage or negotiate extension</li>
</ol>
<p>Only Mitali or Vaibhav can approve leverage. AMs do not grant it independently.</p>`,
  },

  // ── TEAM & ROLES ──────────────────────────────────────────────────────────
  {
    title: 'Team Structure & Who Does What',
    category: 'general',
    isPinned: false,
    tags: ['team', 'roles', 'org'],
    visibleTo: ALL_ROLES,
    content: `<h2>MITS Consulting Hub — Team Map</h2>
<table style="border-collapse:collapse;width:100%;font-size:13px">
  <thead><tr style="background:#f3f4f6"><th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Person</th><th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Role</th><th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Owns</th></tr></thead>
  <tbody>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Vaibhav</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Founder</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Everything. Final decisions on pricing, refunds, leverage exceptions, hiring.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Mitali</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Manager (Team 1)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Payment collection, AM oversight, daily ops, escalation point for AMs.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Bhavneet</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Lead (Team 1)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Session scheduling, trainer management, daily session sheet, AM support.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Kashish</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Account Manager</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Client portfolio — sessions, follow-ups, payment reminders, feedback.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Muskan</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Account Manager</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Client portfolio — sessions, follow-ups, payment reminders, feedback.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Samita</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Demo Lead (Team 2)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">All demos, feedback queue, demo-stage client decisions.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Anjali</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Demo Intake (Team 2)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Logging inbound leads, scheduling demos for Samita.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Taran</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Demo Intake (Team 2)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Logging inbound leads, scheduling demos for Samita.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Roshni</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Sales Closer</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Post-demo follow-up, proposal, closure call. Marks "Sales Close" in portal.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Amandeep</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Recruiter</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Sourcing trainers — Java, cloud, DevOps profiles.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Kanchan</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Recruiter</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Sourcing trainers — frontend, full-stack, niche skills.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Natasha</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Payment Processor</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Confirms all payments received, updates portal, bank reconciliation.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Areena / Ashok</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Accounts</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Invoicing, GST, reports, partner payments.</td></tr>
  </tbody>
</table>

<h2>Escalation chain</h2>
<p>AM issue → <strong>Bhavneet</strong> → <strong>Mitali</strong> → <strong>Vaibhav</strong><br/>
Demo issue → <strong>Samita</strong> → <strong>Vaibhav</strong><br/>
Payment dispute → <strong>Mitali</strong> → <strong>Vaibhav</strong></p>`,
  },

  // ── SOPs ─────────────────────────────────────────────────────────────────
  {
    title: 'SOP: Demo → Onboarding Flow (Full)',
    category: 'sop',
    isPinned: false,
    tags: ['demo', 'onboarding', 'sales', 'flow'],
    visibleTo: ALL_ROLES,
    content: `<h2>Step 1 — Lead logged (Anjali / Taran)</h2>
<p>Inbound lead comes via WhatsApp, website, or referral. Demo Intake (Anjali or Taran) creates the client record in portal, logs source, sets status to <strong>Demo Scheduled</strong>.</p>

<h2>Step 2 — Demo (Samita)</h2>
<p>Samita conducts the demo. Immediately after: updates portal notes, marks <strong>Demo Done</strong> or <strong>No Show</strong>. No show → Anjali/Taran reschedules within 24h.</p>

<h2>Step 3 — Post-demo follow-up (Roshni, within 24h)</h2>
<p>Roshni calls the lead. Handles objections. If interested → sends proposal with pricing. Marks <strong>Proposal Sent</strong>.</p>

<h2>Step 4 — Closure (Roshni)</h2>
<p>Roshni marks <strong>Sales Close</strong> in portal. Mitali is notified automatically. Payment link sent.</p>

<h2>Step 5 — Handover to Team 1 (after first payment)</h2>
<p>Natasha confirms payment. Mitali assigns AM (Kashish or Muskan). AM sends welcome message. Skill matrix sent if applicable. Welcome email triggered by AM via portal.</p>

<h2>Step 6 — Trainer sourcing (Bhavneet / recruiters)</h2>
<p>AM raises sourcing request in portal. Bhavneet assigns to Amandeep or Kanchan. Recruiter finds 2-3 options within 3 days. Bhavneet reviews and selects. Trainer introduced to client within 5 days of payment.</p>

<blockquote><strong>Target: first session within 7 days of first payment.</strong></blockquote>`,
  },

  {
    title: 'SOP: Trainer Onboarding Checklist',
    category: 'sop',
    isPinned: false,
    tags: ['trainers', 'onboarding', 'ops', 'checklist'],
    visibleTo: ['manager', 'lead', 'recruiter'],
    content: `<h2>Before adding to portal</h2>
<ul>
  <li>✅ LinkedIn profile verified — check experience is real, not inflated</li>
  <li>✅ Trial session done with Bhavneet or an internal team member (30 min)</li>
  <li>✅ Rate agreed and documented (per hour or per session)</li>
  <li>✅ Payment method collected: UPI ID or bank account + IFSC</li>
</ul>

<h2>Before first client session</h2>
<ul>
  <li>✅ Trainer profile created in portal (photo, bio, skills, rate)</li>
  <li>✅ NDA sent and signed (use template in portal)</li>
  <li>✅ WhatsApp group created: Trainer + Bhavneet + Mitali + AM</li>
  <li>✅ Session time confirmed with trainer + client</li>
  <li>✅ Client introduced to trainer over WhatsApp 30 min before first session</li>
</ul>

<h2>Day of first session</h2>
<ul>
  <li>✅ AM or Bhavneet joins first 10 minutes of session (silent, camera off)</li>
  <li>✅ Feedback form sent to client within 1 hour of session end</li>
</ul>

<h2>After 3 sessions</h2>
<ul>
  <li>Check feedback score — below 4/5: discuss with trainer, log note</li>
  <li>Below 3/5: escalate to Vaibhav. Consider trainer swap.</li>
</ul>

<h2>Payment to trainer</h2>
<p>Trainer payment is processed after client confirms session happened. Natasha handles payment via bank or UPI. Areena logs in accounts. Do not pay trainer if session was marked as no-show by client.</p>`,
  },

  {
    title: 'SOP: Client Wants to Pause or Exit',
    category: 'sop',
    isPinned: false,
    tags: ['support', 'pause', 'retention', 'churn'],
    visibleTo: OPS_ROLES,
    content: `<h2>First: understand the real reason</h2>
<p>Before agreeing to anything, ask: "Can you help me understand what's made you want to pause? I want to make sure we get this right for you."</p>

<h3>Reason 1: "I'm travelling / too busy right now"</h3>
<p>Offer to reschedule sessions — <em>not</em> to pause billing. Propose recording sessions. Most busy clients are happy with flexibility, not a full pause.</p>

<h3>Reason 2: "I'm not seeing results"</h3>
<p><strong>Red flag. Escalate to Mitali same day.</strong> Arrange a feedback call within 48 hours. Do not promise a pause before the call.</p>

<h3>Reason 3: "Financial issue"</h3>
<p>Discuss revised payment schedule. 2-week session hold possible with Mitali approval — but billing cycle continues. No free extensions.</p>

<h3>Reason 4: "The trainer isn't good"</h3>
<p><strong>Escalate to Bhavneet immediately.</strong> Arrange trainer swap within 3 days. Offer 1 free make-up session. Do not defend the trainer to the client.</p>

<h2>Refunds</h2>
<p>Refunds need Vaibhav's approval. AMs and Mitali do not commit to refunds. You can say: "I'll raise this with our founder and come back to you within 24 hours."</p>`,
  },

  {
    title: 'SOP: What to Do When a Trainer Goes Missing',
    category: 'sop',
    isPinned: false,
    tags: ['trainers', 'escalation', 'ops', 'no-show'],
    visibleTo: OPS_ROLES,
    content: `<h2>Within 15 minutes of session start time</h2>
<ol>
  <li>AM calls trainer on phone (not just WhatsApp)</li>
  <li>If no answer → WhatsApp client: <em>"We're trying to reach your trainer. We'll update you in 10 minutes."</em></li>
  <li>Notify Bhavneet on team group immediately</li>
</ol>

<h2>After 30 minutes — no-show confirmed</h2>
<ol>
  <li>Call client to apologise: <em>"I'm really sorry about this — [Trainer name] hasn't joined. This session will be rescheduled at no extra cost, and we'll offer a free make-up session."</em></li>
  <li>Mark session as <strong>No Show (Trainer)</strong> in portal</li>
  <li>Bhavneet to arrange backup trainer within 24 hours</li>
  <li>Trainer's payment for that session is withheld pending explanation</li>
</ol>

<h2>If trainer is unreachable 48 hours</h2>
<p>Treat as resignation. Begin replacement sourcing immediately. Escalate to Vaibhav. Flag trainer for review / blacklist.</p>`,
  },

  // ── STRATEGY ─────────────────────────────────────────────────────────────
  {
    title: 'Pricing Policy & Discount Authority',
    category: 'strategy',
    isPinned: false,
    tags: ['pricing', 'sales', 'discounts'],
    visibleTo: ['manager', 'lead', 'demo_lead', 'sales_closer'],
    content: `<h2>Our pricing model</h2>
<p>We sell by package (number of sessions or months), not by hour. This locks commitment and simplifies follow-up.</p>

<h2>Who can discount how much</h2>
<table style="border-collapse:collapse;width:100%;font-size:13px">
  <thead><tr style="background:#f3f4f6">
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Person</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Max discount</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Condition</th>
  </tr></thead>
  <tbody>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb">Roshni (sales)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">5%</td><td style="padding:6px 10px;border:1px solid #e5e7eb">No approval needed</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb">Samita (demo lead)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">10%</td><td style="padding:6px 10px;border:1px solid #e5e7eb">For competitive situations — log reason</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb">Mitali (manager)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">15%</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Must document reason in portal</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb">Vaibhav (founder)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Unlimited</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Strategic clients, referrals, partners</td></tr>
  </tbody>
</table>

<h2>Rules</h2>
<ul>
  <li>Never discount just because someone asks — try value conversation first</li>
  <li>Don't discount for clients who already paid full price in previous batches</li>
  <li>Partner clients (Collaborate, Technumen, G-Force, Sforce) have separate rate cards — check with Vaibhav before quoting</li>
</ul>`,
  },

  {
    title: 'Client Retention — What Actually Works',
    category: 'strategy',
    isPinned: false,
    tags: ['retention', 'clients', 'am'],
    visibleTo: OPS_ROLES,
    content: `<h2>Top 3 reasons clients churn</h2>
<ol>
  <li><strong>Trainer quality issues</strong> — inconsistent delivery, cancellations, poor communication with client</li>
  <li><strong>No visible progress</strong> — client doesn't feel they're learning fast enough or getting real value</li>
  <li><strong>AM response lag</strong> — taking too long to reply to concerns, making client feel ignored</li>
</ol>

<h2>What retains clients</h2>
<ul>
  <li><strong>Weekly check-in WhatsApp</strong> from their AM — even 1 line ("Hope yesterday's session went well!")</li>
  <li><strong>Proactive milestone celebration</strong> ("You've completed 10 sessions — great commitment!")</li>
  <li><strong>Solving problems before they escalate</strong> — if a session is cancelled, reach out first, don't wait for the client to complain</li>
  <li><strong>Personal connection</strong> — know client's goals, reference them in conversations</li>
</ul>

<h2>Target</h2>
<p>Each AM should have less than 10% churn per quarter. Above 15% triggers a review with Mitali.</p>

<h2>Early warning signs</h2>
<ul>
  <li>Client stops responding to WhatsApp after 3+ days</li>
  <li>Feedback form score drops below 3.5</li>
  <li>Client misses 2 consecutive sessions without explanation</li>
  <li>Client starts asking "how many sessions are left?" without excitement</li>
</ul>
<p>Any of these → flag in portal + call client within 24 hours.</p>`,
  },

  {
    title: 'Sourcing Playbook — Finding Good Trainers Fast',
    category: 'strategy',
    isPinned: false,
    tags: ['trainers', 'sourcing', 'recruiters'],
    visibleTo: ['lead', 'recruiter'],
    content: `<h2>Best channels (ranked by quality)</h2>
<ol>
  <li><strong>Referrals from existing trainers</strong> — best quality. Always ask current trainers if they know someone for a new skill. Offer ₹500 referral bonus.</li>
  <li><strong>LinkedIn search</strong> — "corporate trainer" + skill keyword + city. Message within 24h. Kanchan handles frontend/full-stack; Amandeep handles Java/cloud/DevOps.</li>
  <li><strong>Naukri / Indeed</strong> — for volume when we need multiple trainers quickly</li>
  <li><strong>Facebook groups</strong> — "Corporate Trainers India" (15k+ members) is good for niche or regional skills</li>
</ol>

<h2>First outreach message</h2>
<blockquote>Hi [Name], I'm from MITS Solutions. We're looking for an experienced [Skill] trainer for a corporate client. Sessions are online, 1-1 or small batch. Would you be open to a quick 10-min call? Our rates are competitive and we offer consistent, ongoing work.</blockquote>

<h2>Rate benchmarks (as of 2026)</h2>
<ul>
  <li>Java / Spring Boot: ₹700–1000/hr</li>
  <li>AWS / DevOps / Kubernetes: ₹1000–1400/hr</li>
  <li>React / Node.js / Frontend: ₹800–1200/hr</li>
  <li>Data Science / ML: ₹1000–1500/hr</li>
  <li>Salesforce / SAP: ₹1200–1800/hr</li>
</ul>

<h2>Red flags to avoid</h2>
<ul>
  <li>Can't do a 30-min trial session on short notice</li>
  <li>No LinkedIn or weak profile for claimed experience level</li>
  <li>Insists on cash payment only</li>
  <li>Has trained clients but has zero referrals to share</li>
</ul>

<h2>SLA</h2>
<p>Shortlist of 2-3 trainers within <strong>3 days</strong> of sourcing request. Client introduction within <strong>5 days</strong>.</p>`,
  },

  // ── GENERAL ──────────────────────────────────────────────────────────────
  {
    title: 'Payment Collection Scripts (Word-for-Word)',
    category: 'general',
    isPinned: false,
    tags: ['payment', 'collections', 'scripts', 'whatsapp'],
    visibleTo: OPS_ROLES,
    content: `<h2>First reminder (payment due date)</h2>
<blockquote>Hi [Name]! Hope your sessions are going well 😊 Just a gentle reminder that your next instalment of ₹[amount] was due today. You can pay via [link]. Do let me know if you need any help!</blockquote>

<h2>Second reminder (+3 days)</h2>
<blockquote>Hi [Name], following up on the payment of ₹[amount] that was due on [date]. Please let me know when you'll be able to process it — I want to make sure your sessions continue without any interruption. Payment link: [link]</blockquote>

<h2>Third reminder (+7 days) — firmer tone</h2>
<blockquote>Hi [Name], I've reached out a couple of times about the pending ₹[amount]. We genuinely want to keep your sessions going smoothly. I'll need to flag this with my manager if it stays unpaid — please let me know by [date], or call me if there's anything I can help with.</blockquote>

<h2>Before leverage (after Mitali approval)</h2>
<blockquote>Hi [Name], as discussed, the payment of ₹[amount] remains pending. I've raised this with our management team, and we'll unfortunately need to pause your upcoming sessions from [date] until the payment is cleared. I genuinely want to avoid this — please let me know today if there's any way we can sort it out.</blockquote>

<h2>After payment received — confirmation</h2>
<blockquote>Hi [Name], great news — we've received your payment of ₹[amount]. Thank you! Your next session is confirmed for [date/time]. See you then! 😊</blockquote>`,
  },

  {
    title: 'Common Client Objections & How to Handle Them',
    category: 'general',
    isPinned: false,
    tags: ['sales', 'objections', 'demo', 'scripts'],
    visibleTo: ALL_ROLES,
    content: `<h2>"Your price is too high"</h2>
<p><em>Don't discount immediately.</em> Ask: "Compared to what?" Then reframe on value — our trainers have real industry experience, we customise content, and you have a dedicated AM for the whole journey. If still stuck, offer a smaller starter package.</p>

<h2>"Can I try one session first?"</h2>
<p>Yes — but frame it as a <strong>paid trial at a discounted single-session rate</strong>, not a free demo. This filters serious buyers. Say: "We do offer a trial session at ₹[X] — it's not free but it's a great way to test the fit before committing to the full package."</p>

<h2>"I want to think about it"</h2>
<p>Ask what's holding them back. Usually it's price, timing, or they need to get approval from someone. Solve the real objection. Set a specific follow-up: "Should I call you Thursday at 6pm?"</p>

<h2>"I found someone cheaper on LinkedIn / Udemy"</h2>
<p>"Absolutely — there are cheaper options. The difference with us is accountability. If your trainer cancels or isn't the right fit, we handle it, find a replacement, and offer make-up sessions. With freelancers, you're on your own. What matters more — the cheapest rate, or the certainty that this training actually happens and delivers results?"</p>

<h2>"My company will reimburse — can you invoice them directly?"</h2>
<p>Standard. Collect company GST number, issue pro-forma invoice in company name. Payment expected within 5 business days of reimbursement approval. Ask for advance of at least 50% upfront if new corporate client.</p>

<h2>"The trainer you sent doesn't seem experienced enough"</h2>
<p>Don't defend the trainer. Say: "Thank you for the feedback — that's exactly the kind of thing I need to know early. Let me arrange a different trainer for your next session. Can you tell me specifically what you were hoping for?" Then escalate to Bhavneet immediately.</p>`,
  },

  {
    title: 'WhatsApp Communication Standards',
    category: 'general',
    isPinned: false,
    tags: ['communication', 'ops', 'clients', 'standards'],
    visibleTo: ALL_ROLES,
    content: `<h2>Response time targets</h2>
<ul>
  <li><strong>Client messages</strong>: within 2 hours, 10am–7pm IST</li>
  <li><strong>Trainer messages</strong>: within 4 hours</li>
  <li><strong>Internal team</strong>: same day</li>
</ul>

<h2>Tone guidelines</h2>
<ul>
  <li>Start with the client's name — "Hi Nikhil!" not just "Hi"</li>
  <li>Use complete sentences — "k", "ok", "noted" as standalone replies are not acceptable</li>
  <li>End every message with a clear next step or question</li>
  <li>No ALL CAPS — reads as shouting</li>
  <li>Emojis are okay but 1-2 max per message</li>
</ul>

<h2>Never discuss over WhatsApp</h2>
<ul>
  <li>Refund decisions — always take to a phone call</li>
  <li>Pricing negotiations — follow up with a formal quote on email</li>
  <li>Trainer rates or our internal costs</li>
  <li>Complaints about other team members</li>
</ul>

<h2>When a client is angry</h2>
<p>Acknowledge first, never defend: <em>"I completely understand your frustration, and I'm really sorry about this. Let me look into it right now and come back to you within the hour."</em></p>
<p>Then actually follow up within the hour — even if just to say you're still looking into it.</p>`,
  },

  {
    title: 'Feedback Call Guide (Session 3 + Midpoint)',
    category: 'general',
    isPinned: false,
    tags: ['feedback', 'retention', 'clients', 'calls'],
    visibleTo: OPS_ROLES,
    content: `<h2>When to call</h2>
<ul>
  <li>After session 3 — first structured check-in (mandatory)</li>
  <li>At package midpoint</li>
  <li>If feedback form score drops below 3.5/5</li>
  <li>If client hasn't responded to WhatsApp in 5+ days</li>
</ul>

<h2>Call structure (10 minutes)</h2>
<ol>
  <li><strong>Warm open (1 min)</strong>: "Hi [Name], just calling to check in on how the training is going for you — do you have 10 minutes?"</li>
  <li><strong>Progress check (3 min)</strong>:
    <ul>
      <li>"What's been the most useful thing you've learned so far?"</li>
      <li>"Is the pace right for you — too fast, too slow?"</li>
      <li>"Anything you wish we were covering that we're not?"</li>
    </ul>
  </li>
  <li><strong>Trainer check (2 min)</strong>:
    <ul>
      <li>"How are you finding [trainer name]? Good communication?"</li>
      <li>"Any sessions that were particularly good or not so good?"</li>
    </ul>
  </li>
  <li><strong>Forward plan (3 min)</strong>:
    <ul>
      <li>"You have X sessions left. By the end, you'll have [specific outcome]."</li>
      <li>"Any questions about what comes next after this package?"</li>
    </ul>
  </li>
  <li><strong>Close (1 min)</strong>: "Anything else I can help with? I'm your dedicated point of contact — always feel free to reach out."</li>
</ol>

<h2>After the call</h2>
<p>Log notes in portal within 1 hour. If any concern flagged → flag in portal + notify Mitali same day.</p>`,
  },

  // ── BANK ACCOUNTS ─────────────────────────────────────────────────────────
  {
    title: 'Bank Accounts Reference',
    category: 'general',
    isPinned: false,
    tags: ['finance', 'payments', 'bank', 'reference'],
    visibleTo: ['manager', 'payment_processor', 'accounts'],
    content: `<h2>MITS Bank Accounts</h2>
<table style="border-collapse:collapse;width:100%;font-size:13px">
  <thead><tr style="background:#f3f4f6">
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Account</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Bank</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Last 4</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Used for</th>
  </tr></thead>
  <tbody>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb">HDFC · MITS Anupama (Current)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">HDFC</td><td style="padding:6px 10px;border:1px solid #e5e7eb">6639</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Primary business receipts</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb">HDFC · Anupama (Saving)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">HDFC</td><td style="padding:6px 10px;border:1px solid #e5e7eb">8039</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Personal / overflow</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb">CBI · Making IT Simplest</td><td style="padding:6px 10px;border:1px solid #e5e7eb">CBI</td><td style="padding:6px 10px;border:1px solid #e5e7eb">6134</td><td style="padding:6px 10px;border:1px solid #e5e7eb">MITS brand receipts</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb">MITS PVT LTD</td><td style="padding:6px 10px;border:1px solid #e5e7eb">MITS</td><td style="padding:6px 10px;border:1px solid #e5e7eb">—</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Corporate / GST invoices</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb">Zelle (US)</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Zelle</td><td style="padding:6px 10px;border:1px solid #e5e7eb">USD</td><td style="padding:6px 10px;border:1px solid #e5e7eb">US-based clients</td></tr>
  </tbody>
</table>
<p style="font-size:12px;color:#6b7280;margin-top:8px">Full account list visible in portal → Finance. Only Natasha, Areena, Ashok, and Vaibhav have edit access.</p>`,
  },

  // ── PARTNERS ──────────────────────────────────────────────────────────────
  {
    title: 'Partner Accounts — How We Work With Them',
    category: 'general',
    isPinned: false,
    tags: ['partners', 'corporate', 'billing', 'reference'],
    visibleTo: ['manager', 'lead', 'accounts'],
    content: `<h2>Our key partners</h2>
<table style="border-collapse:collapse;width:100%;font-size:13px">
  <thead><tr style="background:#f3f4f6">
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Partner</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Contact</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Billing cycle</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Payment terms</th>
    <th style="padding:6px 10px;text-align:left;border:1px solid #e5e7eb">Notes</th>
  </tr></thead>
  <tbody>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Collaborate Solutions</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Rita</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Monthly bulk</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Net 30–60</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Bulk training contracts. High volume, needs reliable trainers.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Technumen</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Vikram</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Per engagement</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Net 45</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Salesforce training focus.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>G-Force</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Suresh</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Per engagement</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Net 30</td><td style="padding:6px 10px;border:1px solid #e5e7eb">General tech training.</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb"><strong>Sforce</strong></td><td style="padding:6px 10px;border:1px solid #e5e7eb">Anil</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Per engagement</td><td style="padding:6px 10px;border:1px solid #e5e7eb">Net 45</td><td style="padding:6px 10px;border:1px solid #e5e7eb">ServiceNow training.</td></tr>
  </tbody>
</table>

<h2>Partner billing rules</h2>
<ul>
  <li>Always issue GST invoice — partners require it for their own books</li>
  <li>Chase payment at Net 25 (5 days before due) — don't wait for them to be late</li>
  <li>Rate negotiations go through Vaibhav only — don't quote partner rates to anyone</li>
  <li>Trainer for partner client should be experienced (5+ years) — no freshers</li>
</ul>`,
  },
];

async function seed() {
  console.log(`Seeding ${notes.length} brain notes…`);

  for (const n of notes) {
    const existing = await prisma.brainNote.findFirst({ where: { title: n.title } });
    if (existing) {
      console.log(`  skip (exists): ${n.title}`);
      continue;
    }
    await prisma.brainNote.create({
      data: {
        title: n.title,
        content: n.content,
        category: n.category as any,
        tags: n.tags,
        visibleTo: n.visibleTo,
        isPinned: n.isPinned,
        authorId: VAIBHAV_ID,
      },
    });
    console.log(`  created: ${n.title}`);
  }

  console.log('Done.');
  await prisma.$disconnect();
}

seed().catch((e) => { console.error(e); process.exit(1); });
