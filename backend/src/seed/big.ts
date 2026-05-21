/**
 * Aggressive testing seed — generates a large volume of clients, trainers,
 * sourcing requests, demos, payments, sessions, and dormant clients. Use this
 * when stress-testing the UI under realistic load.
 *
 *   npm run seed:big
 *
 * Wipes the same tables as seed:demo but inserts ~80 clients, ~20 trainers,
 * dozens of sourcing requests + proposals, full demo history with multiple
 * attempts per client (including failed/rescheduled), session logs across
 * the last 3 weeks, and weekly payout batches.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient, Lifecycle, EngagementType, Currency, PaymentModel, ConfirmationKind, RateModel, DemoStatus } from '@prisma/client';

const prisma = new PrismaClient();

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDays(iso: string, n: number) { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN<T>(arr: T[], n: number): T[] { return [...arr].sort(() => Math.random() - 0.5).slice(0, n); }
function randInt(lo: number, hi: number) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }
function chance(p: number) { return Math.random() < p; }

const FIRST_NAMES = [
  'Aanya', 'Arjun', 'Aditi', 'Akhil', 'Anisha', 'Bhavya', 'Chirag', 'Devika', 'Dhruv', 'Eshaan',
  'Farah', 'Gaurav', 'Harshita', 'Ishaan', 'Jay', 'Kavya', 'Lakshya', 'Mira', 'Nikhil', 'Ojas',
  'Pari', 'Rahul', 'Riya', 'Shaurya', 'Tara', 'Uma', 'Vikrant', 'Yash', 'Zara', 'Aarav',
  'Apoorva', 'Bhavya', 'Charvi', 'Diya', 'Esha', 'Manav', 'Nidhi', 'Omkar', 'Pratham', 'Saanvi',
  'Tanay', 'Urvi', 'Vihaan', 'Yogita', 'Aryan', 'Bhumi', 'Cyrus', 'Dia', 'Eshan', 'Falguni',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Reddy', 'Iyer', 'Singh', 'Patel', 'Nair', 'Mehta', 'Kapoor', 'Joshi',
  'Khanna', 'Pillai', 'Saxena', 'Choudhary', 'Banerjee', 'Mukherjee', 'Pillai', 'Rao', 'Bhatt',
];
const SKILL_GROUPS: Array<{ skills: string; hint: string }> = [
  { skills: 'Java, Spring Boot, Microservices, REST APIs', hint: 'Java' },
  { skills: 'AWS, EKS, DevOps, Terraform, CloudFormation', hint: 'AWS' },
  { skills: 'React, Node.js, TypeScript, GraphQL', hint: 'React Node' },
  { skills: 'Python, ML, NLP, PyTorch, sklearn', hint: 'Python ML' },
  { skills: 'Salesforce admin, Apex, Lightning, Flows', hint: 'Salesforce' },
  { skills: 'ServiceNow ITSM, ITAM, Discovery, ITOM', hint: 'ServiceNow' },
  { skills: 'iOS Swift, SwiftUI, Combine', hint: 'iOS Swift' },
  { skills: 'Cybersecurity, SIEM, SOC, penetration testing', hint: 'Cybersecurity' },
  { skills: 'Snowflake, dbt, Airflow, Spark', hint: 'Data engineering' },
  { skills: 'Cerner, Epic, HL7, FHIR', hint: 'Cerner' },
  { skills: '.NET, C#, Azure, ASP.NET Core', hint: '.NET' },
  { skills: 'Selenium, Cypress, Playwright, manual QA', hint: 'QA testing' },
  { skills: 'Android Kotlin, Compose, Room', hint: 'Android' },
  { skills: 'Kubernetes, Helm, Istio, observability', hint: 'K8s' },
];
const SOURCES = ['Mytabtech', 'Anuradha', 'Reva', 'Reva Mehrotra', 'Mamta Aggarwal',
  'Anupama Aggarwal', 'Shakti Kumar Aggarwal', 'Thiru', 'LinkedIn', 'Direct referral',
  'Collaborate', 'Technumen', 'G-Force', 'Sforce'];
const ALL_LIFECYCLES: Lifecycle[] = [
  'Lead', 'IntakeSent', 'IntakeReceived', 'InternalSearch', 'WithRecruiters',
  'VerificationPending', 'TrainerMatched', 'DemoScheduled', 'DemoDone',
  'SaleClosing', 'SaleWon', 'Active', 'Hold', 'Dormant',
];
const STAGE_WEIGHTS: Array<[Lifecycle, number]> = [
  ['Lead', 8], ['IntakeSent', 6], ['IntakeReceived', 5],
  ['InternalSearch', 4], ['WithRecruiters', 5], ['VerificationPending', 4],
  ['TrainerMatched', 4], ['DemoScheduled', 5], ['DemoDone', 3],
  ['FeedbackPending', 5],                                              // Samita's queue
  ['SaleClosing', 4], ['SaleWon', 2], ['Active', 16],
  ['Hold', 4], ['Dormant', 5],                                         // Hold bumped so Roshni's queue is non-empty
];

function weightedStage(): Lifecycle {
  const total = STAGE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [s, w] of STAGE_WEIGHTS) {
    r -= w;
    if (r <= 0) return s;
  }
  return 'Active';
}

async function main() {
  console.log('Aggressive seed: wiping dynamic data…');
  await prisma.accountsQueueItem.deleteMany();
  await prisma.demo.deleteMany();
  await prisma.outboundMessage.deleteMany();
  await prisma.sessionLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.leverageRequest.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.proposal.deleteMany();
  await prisma.sourcingRequest.deleteMany();
  await prisma.client.deleteMany();
  await prisma.rawLead.deleteMany();
  await prisma.editRequest.deleteMany();
  await prisma.payoutBatch.deleteMany();
  // Wipe non-core trainers we generated last time (keep the original t-anand etc.)
  await prisma.trainer.deleteMany({ where: { id: { startsWith: 't-gen-' } } });
  // Wipe smoke-test residue (any "Smoke"/"Test" trainers that got auto-created via the Pass endpoint)
  await prisma.trainer.deleteMany({ where: { name: { in: ['Smoke', 'Test'] } } });

  const today = todayISO();

  // Placeholder files for the uploads referenced in proposals
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const SILENT_MP3 = Buffer.from('SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQZAAAAAAAAAA=', 'base64');
  const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  ['stress-call-1.mp3', 'stress-call-2.mp3', 'stress-wa-1.png'].forEach((n) => {
    const fp = path.join(uploadsDir, n);
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, n.endsWith('.mp3') ? SILENT_MP3 : TINY_PNG);
  });

  // ─── Trainers ────────────────────────────────────────────────────
  // Keep the 6 hand-curated trainers from the standard seed (t-anand etc.)
  // and add 14 more generated ones for variety.
  console.log('Seeding extra trainers…');
  const baseTrainers = await prisma.trainer.findMany();
  const GEN_TRAINER_COUNT = 14;
  const genTrainers: Array<{ id: string }> = [];
  for (let i = 0; i < GEN_TRAINER_COUNT; i++) {
    const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const sk = pick(SKILL_GROUPS);
    const id = `t-gen-${i}`;
    await prisma.trainer.create({
      data: {
        id,
        name,
        email: `${name.toLowerCase().replace(/\s/g, '.')}@trainer.local`,
        phoneCode: '+91',
        phoneDigits: String(7000000000 + randInt(1, 999999999)).slice(0, 10),
        skills: sk.skills,
        defaultRateInr: randInt(700, 1800),
        experienceYears: randInt(3, 12),
        rateModel: chance(0.7) ? RateModel.hourly : RateModel.per_session,
        paymentMethod: 'UPI',
        upiId: `${name.split(' ')[0].toLowerCase()}@oksbi`,
        active: chance(0.9), // most active, a few inactive
        recruitedById: chance(0.5) ? 'u-aman' : 'u-kanchan',
      },
    });
    genTrainers.push({ id });
  }
  const allTrainerIds = [...baseTrainers.map((t) => t.id), ...genTrainers.map((t) => t.id)];

  // ─── Clients ─────────────────────────────────────────────────────
  console.log('Seeding clients…');
  const CLIENT_COUNT = 80;
  const createdClients: Array<{ id: string; lifecycle: Lifecycle; primaryTrainerId: string | null; demoDate?: string | null }> = [];
  for (let i = 0; i < CLIENT_COUNT; i++) {
    const sk = pick(SKILL_GROUPS);
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const name = `${firstName} ${lastName}`;
    const lifecycle = weightedStage();
    const isTraining = chance(0.15);
    const engagementType: EngagementType = isTraining ? 'Training' : 'Support';
    const currency: Currency = chance(0.85) ? 'USD' : chance(0.5) ? 'CAD' : 'INR';
    const cycleAmount = isTraining ? randInt(250, 900) : randInt(450, 950);

    const hasIntake = ['IntakeReceived', 'InternalSearch', 'WithRecruiters', 'VerificationPending',
      'TrainerMatched', 'DemoScheduled', 'DemoDone', 'FeedbackPending',
      'SaleClosing', 'SaleWon', 'Active', 'Hold', 'Dormant'].includes(lifecycle);
    const hasTrainer = ['TrainerMatched', 'DemoScheduled', 'DemoDone', 'FeedbackPending',
      'SaleClosing', 'SaleWon', 'Active', 'Hold'].includes(lifecycle);
    const trainerId = hasTrainer ? pick(allTrainerIds) : null;
    const isActive = lifecycle === 'Active' || lifecycle === 'LeverageGranted';

    // Demo dates for demo-relevant stages
    let demoDate: string | null = null;
    let demoActualDate: string | null = null;
    let demoOutcome: string | null = null;
    if (lifecycle === 'DemoScheduled') {
      demoDate = addDays(today, randInt(-2, 7));
    } else if (['DemoDone', 'FeedbackPending', 'SaleClosing', 'SaleWon', 'Active', 'Hold'].includes(lifecycle)) {
      demoDate = addDays(today, -randInt(3, 30));
      demoActualDate = demoDate;
      demoOutcome = chance(0.75) ? 'Positive' : chance(0.5) ? 'Neutral' : 'Negative';
    }

    // Hold tracking — Roshni needs to follow up after 3 days; mix overdue / today / future
    let holdSince: string | null = null, holdReason: string | null = null,
      holdCheckBackOn: string | null = null, holdResumeFromStage: string | null = null;
    if (lifecycle === 'Hold') {
      const daysAgo = randInt(0, 8);
      holdSince = addDays(today, -daysAgo);
      // checkback = holdSince + 3; spread so some are overdue (negative) and some upcoming
      holdCheckBackOn = addDays(holdSince, 3);
      holdReason = pick([
        'Client said "need a week to discuss with team".',
        'Budget approval pending from finance.',
        'Wants to compare with one more vendor; will revert by Friday.',
        'Holiday season; resume after first week of next month.',
        'Sponsor on leave, will confirm post-return.',
      ]);
      holdResumeFromStage = 'FeedbackPending';
    }

    // Post-demo feedback metadata for FeedbackPending stage (so the page has rich rows)
    let postDemoFeedbackBy: string | null = null;
    let postDemoFeedbackAt: string | null = null;
    if (lifecycle === 'FeedbackPending') {
      // Some have a placeholder note from Anjali waiting for Samita; others are blank
      postDemoFeedbackBy = null;
      postDemoFeedbackAt = null;
    }

    // Skill matrix sent gate — populate for any stage past TrainerMatched so demos can be scheduled
    let skillMatrixSentAt: string | null = null;
    let skillMatrixSentById: string | null = null;
    if (['DemoScheduled', 'DemoDone', 'FeedbackPending', 'SaleClosing', 'SaleWon', 'Active', 'Hold'].includes(lifecycle)) {
      skillMatrixSentAt = addDays(today, -randInt(4, 35));
      skillMatrixSentById = chance(0.5) ? 'u-anjali' : 'u-taran';
    }

    // Cycle dates for active clients
    let cycleStart: string | null = null, cycleEnd: string | null = null, nextRenewalDue: string | null = null;
    let sessionsPerCycle = 0, sessionsUsed = 0, churnRisk = 'Green';
    let freshPaymentReceived = false, freshPaymentDate: string | null = null, freshPaymentAmount = 0;
    if (isActive) {
      const cycleLen = chance(0.5) ? 14 : chance(0.7) ? 7 : 28;
      cycleStart = addDays(today, -randInt(0, cycleLen));
      cycleEnd = addDays(cycleStart, cycleLen);
      nextRenewalDue = cycleEnd;
      sessionsPerCycle = cycleLen === 7 ? 5 : cycleLen === 14 ? 10 : 20;
      sessionsUsed = randInt(0, sessionsPerCycle);
      churnRisk = sessionsUsed >= sessionsPerCycle - 1 ? 'Amber' : chance(0.05) ? 'Red' : 'Green';
      freshPaymentReceived = true;
      freshPaymentDate = cycleStart;
      freshPaymentAmount = cycleAmount;
    }

    // Dormant fields
    let dormantSince: string | null = null, dormantReason: string | null = null,
      dormantCheckBackOn: string | null = null, dormantResumeFromStage: string | null = null;
    if (lifecycle === 'Dormant') {
      dormantSince = addDays(today, -randInt(3, 60));
      dormantReason = pick([
        'No reply since intake sent. Possibly engaged elsewhere.',
        'Said "let me think" after demo, then silence.',
        'Group went quiet after WhatsApp ping. Read receipts on, not replying.',
        'Cancelled demo last minute, never rescheduled.',
        'Said budget tight, will revisit next quarter.',
      ]);
      dormantCheckBackOn = addDays(today, randInt(-5, 30));
      dormantResumeFromStage = pick(['Lead', 'IntakeSent', 'IntakeReceived', 'DemoDone', 'SaleClosing']);
    }

    const cid = `c-big-${i}`;
    await prisma.client.create({
      data: {
        id: cid,
        name,
        phoneCode: chance(0.85) ? '+1' : '+91',
        phoneDigits: String(5000000000 + randInt(1, 999999999)).slice(0, 10),
        whatsappGroupName: `${firstName} · ${sk.hint} · MITS`,
        country: currency === 'CAD' ? 'CA' : currency === 'INR' ? 'IN' : 'US',
        engagementType,
        paymentModel: isActive ? (sessionsPerCycle === 5 ? PaymentModel.Weekly : sessionsPerCycle === 10 ? PaymentModel.BiWeekly : PaymentModel.Monthly) : null,
        currency,
        cycleAmount,
        lifecycle,
        funderType: chance(0.15) ? 'Partner' : 'Self',
        source: pick(SOURCES),
        leadOwnerId: 'u-vaibhav',
        intakeOwnerId: hasIntake ? (chance(0.5) ? 'u-anjali' : 'u-taran') : null,
        salesOwnerId: ['SaleClosing', 'SaleWon', 'Active', 'Hold', 'FeedbackPending'].includes(lifecycle) ? 'u-roshni' : null,
        hostOwnerId: isActive ? (chance(0.5) ? 'u-kashish' : 'u-muskan') : null,
        primaryTrainerId: trainerId,
        engagementTrainerRateInr: trainerId ? randInt(700, 1700) : 0,
        preferredTimeIst: pick(['09:00', '20:00', '08:00', '21:00']),
        feedbackDay: pick(['Wednesday', 'Thursday', 'Friday']),
        bankAccountId: 'b-mits-pvt',
        accountNameRaw: null,
        freshPaymentReceived,
        freshPaymentDate,
        freshPaymentAmount,
        cycleStart, cycleEnd, nextRenewalDue,
        sessionsPerCycle, sessionsUsed, churnRisk,
        paymentPendingVaibhav: chance(0.06),
        pendingVaibhavSince: chance(0.5) ? addDays(today, -randInt(1, 20)) : null,
        intakeSkillHint: sk.hint,
        intakeData: hasIntake ? {
          detailed_skill_set: sk.skills,
          current_priority_task: pick(['Cert in 4 weeks', 'Client-facing project starts next month', 'Resume-ready for FAANG', 'Internal upskill mandate']),
          client_email: `${firstName.toLowerCase()}@example.com`,
          demo_timing_ist: pick(['Morning 9-11 IST', 'Evening 7-9 IST', 'Flexible']),
          session_timing_ist: pick(['9 AM IST Mon-Fri', '8 PM IST Mon/Wed/Fri', 'Weekends']),
        } : undefined,
        intakeReceivedAt: hasIntake ? addDays(today, -randInt(1, 30)) : null,
        demoDate,
        demoTimeIst: demoDate ? pick(['09:00', '20:00', '21:00']) : null,
        demoActualDate,
        demoActualTimeIst: demoActualDate ? pick(['09:00', '20:00']) : null,
        demoOutcome: demoOutcome as any,
        demoFeedback: demoOutcome ? pick(['Strong fit on skills, wants to proceed.', 'Clicked with the trainer on first call.', 'Liked the approach, said yes.', 'Needs to discuss with manager.', 'Concerned about depth — wants more.', 'Not a fit, looking for senior profile.']) : null,
        dormantSince, dormantReason, dormantCheckBackOn, dormantResumeFromStage,
        holdSince, holdReason, holdCheckBackOn, holdResumeFromStage,
        postDemoFeedbackBy, postDemoFeedbackAt,
        skillMatrixSentAt, skillMatrixSentById,
        // Also include FeedbackPending in the stage list for sourcing/sales owner inheritance
        ...(lifecycle === 'FeedbackPending' ? { intakeOwnerId: hasIntake ? (chance(0.5) ? 'u-anjali' : 'u-taran') : null } : {}),
      },
    });
    createdClients.push({ id: cid, lifecycle, primaryTrainerId: trainerId, demoDate });
  }

  // ─── Demo history rows ───────────────────────────────────────────
  console.log('Seeding demo history…');
  for (const c of createdClients) {
    // For any client past TrainerMatched, plant one or more Demo rows
    const stagesWithDemos = ['DemoScheduled', 'DemoDone', 'FeedbackPending', 'SaleClosing', 'SaleWon', 'Active', 'Hold', 'Dormant'];
    if (!stagesWithDemos.includes(c.lifecycle)) continue;
    // 60% chance of a single demo, 30% chance of two (re-shopped to another trainer), 10% chance of three
    const numDemos = chance(0.1) ? 3 : chance(0.4) ? 2 : 1;
    for (let i = 0; i < numDemos; i++) {
      const isLast = i === numDemos - 1;
      const status: DemoStatus = isLast && c.lifecycle === 'DemoScheduled' ? 'Scheduled'
        : isLast ? 'Done'
        : chance(0.5) ? 'Cancelled' : 'Done';
      // Always pick a trainer — fall back to a random one if the client has none assigned
      // (happens for Hold/Dormant where the trainer reference is null).
      const trainerId = isLast ? (c.primaryTrainerId || pick(allTrainerIds)) : pick(allTrainerIds);
      const scheduled = c.demoDate ? addDays(c.demoDate, -i * randInt(7, 21)) : addDays(today, -randInt(5, 60));
      const isDone = status === 'Done';
      const outcome = isDone ? (isLast ? 'Positive' : chance(0.5) ? 'Negative' : 'Neutral') : null;
      await prisma.demo.create({
        data: {
          clientId: c.id,
          trainerId: trainerId,
          scheduledDate: scheduled,
          scheduledTimeIst: pick(['09:00', '20:00', '21:00']),
          actualDate: isDone ? scheduled : null,
          actualTimeIst: isDone ? pick(['09:15', '20:05', '21:10']) : null,
          status,
          outcome,
          feedback: isDone ? pick([
            'Trainer demonstrated strong fundamentals. Client engaged through the call.',
            'Pace was good, mock interview at the end worked well.',
            'Client liked the project examples shared.',
            'Some hesitation about the trainer\'s depth on advanced topics.',
            'Client wants someone with banking-domain exposure.',
            'Cultural fit not great. Will look for a different trainer.',
          ]) : null,
          nextSteps: isDone && outcome === 'Positive' ? 'Send engagement letter' : status === 'Cancelled' ? 'Client cancelled, re-shopping' : null,
          conductedById: isDone ? (chance(0.5) ? 'u-anjali' : 'u-taran') : null,
        },
      });
    }
  }

  // ─── Sourcing requests ───────────────────────────────────────────
  console.log('Seeding sourcing requests + proposals…');
  // For clients at InternalSearch/WithRecruiters/VerificationPending, create sourcing requests.
  // Route per the standard pairing: Anjali → Aman, Taran → Kanchan (with occasional override).
  const PARTNER: Record<string, string> = { 'u-anjali': 'u-aman', 'u-taran': 'u-kanchan' };
  const inSourcing = createdClients.filter((c) => ['InternalSearch', 'WithRecruiters', 'VerificationPending'].includes(c.lifecycle));
  // Need intakeOwnerId per client — fetch them
  const sourceClients = await prisma.client.findMany({ where: { id: { in: inSourcing.map((x) => x.id) } } });
  // Track per-recruiter load so we can balance if needed
  let amanLoad = 0, kanchanLoad = 0;
  for (const c of sourceClients) {
    const isProposed = c.lifecycle === 'VerificationPending';
    const status = isProposed ? 'Proposed' : 'Open';
    const sender = c.intakeOwnerId || (chance(0.5) ? 'u-anjali' : 'u-taran');
    const partner = PARTNER[sender] || 'u-aman';
    // 90% follow the partner mapping. The 10% override goes to the *less loaded* recruiter
    // so we don't pile up on one side (avoids "Aman 3 / Kanchan 10" imbalance).
    let sentTo: string;
    if (chance(0.9)) {
      sentTo = partner;
    } else {
      sentTo = amanLoad <= kanchanLoad ? 'u-aman' : 'u-kanchan';
    }
    if (sentTo === 'u-aman') amanLoad++;
    else kanchanLoad++;
    const req = await prisma.sourcingRequest.create({
      data: {
        clientId: c.id,
        status: status as any,
        sentById: sender,
        sentToId: sentTo,
        sentAt: addDays(today, -randInt(0, 10)),
      },
    });
    if (isProposed) {
      const proposalCount = randInt(2, 4);
      const chosen = pickN(allTrainerIds, proposalCount);
      // Pull skill list for this client so the matrix entries are domain-relevant
      const clientSkills = c.intakeSkillHint?.toLowerCase() || 'general';
      const skillBank = clientSkills.includes('java') ? ['Spring Boot', 'Microservices', 'JPA/Hibernate', 'REST APIs']
        : clientSkills.includes('aws') ? ['EKS', 'Terraform', 'CloudFormation', 'IAM']
        : clientSkills.includes('react') ? ['Hooks', 'TypeScript', 'GraphQL', 'Performance']
        : clientSkills.includes('python') ? ['NumPy/Pandas', 'PyTorch', 'NLP', 'Model deployment']
        : clientSkills.includes('salesforce') ? ['Apex', 'Lightning Web Components', 'Flows', 'Integration']
        : clientSkills.includes('servicenow') ? ['ITSM', 'ITAM', 'Discovery', 'Catalog']
        : clientSkills.includes('ios') ? ['SwiftUI', 'Combine', 'Core Data', 'App Store deployment']
        : clientSkills.includes('cyber') ? ['SIEM', 'SOC operations', 'Penetration testing', 'Compliance']
        : clientSkills.includes('data') ? ['dbt', 'Airflow', 'Spark', 'Snowflake']
        : clientSkills.includes('cerner') ? ['HL7', 'FHIR', 'PowerChart', 'Bedrock']
        : clientSkills.includes('.net') ? ['C#', 'ASP.NET Core', 'Entity Framework', 'Azure']
        : clientSkills.includes('qa') ? ['Selenium', 'Cypress', 'Playwright', 'API testing']
        : ['Core skill', 'Domain expertise', 'Hands-on lab', 'Live troubleshooting'];

      for (let i = 0; i < proposalCount; i++) {
        const verification = i === 0 && chance(0.4) ? 'Pass' : chance(0.2) ? 'Fail' : 'Pending';
        // Structured skill matrix — 4 must-have rows + standard checklist
        const mustHaveSkills = skillBank.slice(0, 4).map((s) => ({
          skill: s,
          proficiency: Math.round((3.5 + Math.random() * 1.5) * 2) / 2, // 3.5 to 5.0 in 0.5 steps
        }));
        const softSkills = [
          { item: 'Confident',           value: chance(0.95) ? 'Yes' : 'Partial' },
          { item: 'English Speaking',    value: 'Yes' },
          { item: 'Trustworthy',         value: 'Yes' },
          { item: 'Zoom',                value: 'Installed' },
          { item: 'Internet Connection', value: 'Active' },
        ];
        await prisma.proposal.create({
          data: {
            requestId: req.id,
            trainerId: chosen[i],
            rateInr: randInt(800, 1700),
            experienceYears: randInt(3, 12),
            notes: pick(['Available IST evenings.', 'Has banking domain experience.', 'Premium rate but strong fit.', 'New to MITS but high rec from internal team.']),
            proposedById: chance(0.5) ? 'u-aman' : 'u-kanchan',
            proposedAt: addDays(today, -randInt(0, 5)),
            verification: verification as any,
            verificationNotes: verification === 'Fail' ? pick(['Rate too high.', 'Timing conflict.', 'Picked another proposal.']) : null,
            confirmationKind: chance(0.7) ? ConfirmationKind.Audio : ConfirmationKind.Screenshot,
            confirmationUrl: pick(['/uploads/stress-call-1.mp3', '/uploads/stress-call-2.mp3', '/uploads/stress-wa-1.png']),
            mustHaveSkills,
            softSkills,
          },
        });
      }
    }
  }

  // ─── Payments ────────────────────────────────────────────────────
  console.log('Seeding payments…');
  const paidClients = await prisma.client.findMany({ where: { freshPaymentReceived: true } });
  for (const c of paidClients) {
    await prisma.payment.create({
      data: {
        clientId: c.id,
        kind: 'Fresh',
        amount: c.freshPaymentAmount,
        currency: c.currency,
        paymentDate: c.freshPaymentDate!,
        bankAccountId: c.bankAccountId,
        paymentMode: 'Bank',
        receivedById: 'u-roshni',
      },
    });
    // Half of them also have a renewal payment
    if (chance(0.4) && c.cycleStart) {
      await prisma.payment.create({
        data: {
          clientId: c.id,
          kind: 'Renewal',
          amount: c.cycleAmount,
          currency: c.currency,
          paymentDate: addDays(c.cycleStart, -randInt(7, 28)),
          bankAccountId: c.bankAccountId,
          paymentMode: 'Bank',
          receivedById: 'u-mitali',
        },
      });
    }
  }

  // ─── Session logs ────────────────────────────────────────────────
  console.log('Seeding session logs across last 3 weeks…');
  const actives = await prisma.client.findMany({ where: { lifecycle: 'Active' } });
  for (const c of actives) {
    if (!c.primaryTrainerId) continue;
    const sessions = c.sessionsUsed || randInt(2, 8);
    for (let i = 0; i < sessions; i++) {
      const sessionDate = addDays(today, -randInt(0, 21));
      const status = chance(0.5) ? 'Paid' : chance(0.5) ? 'PaymentApproved' : chance(0.5) ? 'ReadyForFinal' : 'Logged';
      await prisma.sessionLog.create({
        data: {
          trainerId: c.primaryTrainerId,
          clientId: c.id,
          date: sessionDate,
          hours: 1,
          rateSnapshot: c.engagementTrainerRateInr || 1000,
          rateModel: 'hourly',
          amountInr: c.engagementTrainerRateInr || 1000,
          status: status as any,
        },
      });
    }
  }

  // ─── Tasks (today's sessions) ────────────────────────────────────
  console.log('Seeding tasks…');
  for (const c of actives.slice(0, 30)) {
    if (!c.primaryTrainerId || !c.hostOwnerId) continue;
    await prisma.task.create({
      data: {
        clientId: c.id,
        ownerId: c.hostOwnerId,
        trainerId: c.primaryTrainerId,
        title: `Session ${c.preferredTimeIst} IST`,
        dueDate: today,
        type: 'SESSION',
        priority: chance(0.1) ? 'High' : 'Normal',
        estimatedHours: 1,
        engagementRateInr: c.engagementTrainerRateInr,
      },
    });
  }

  // ─── Leverage requests ───────────────────────────────────────────
  for (let i = 0; i < 4; i++) {
    const c = pick(actives);
    if (!c) break;
    await prisma.leverageRequest.create({
      data: {
        clientId: c.id,
        daysRequested: randInt(2, 7),
        reasonStated: pick(['Job interview travel.', 'Family emergency.', 'Trainer travelling.', 'Sick week.']),
        newCommittedDate: addDays(today, randInt(2, 7)),
        status: i === 0 ? 'PendingVaibhav' : i === 1 ? 'AutoApproved' : i === 2 ? 'Approved' : 'Rejected',
      },
    });
  }

  // ─── Raw leads ───────────────────────────────────────────────────
  await prisma.rawLead.createMany({
    data: [
      { raw: 'Anjali introduced Karan +91 9876543219 needs Java for FAANG prep', status: 'Pending' },
      { raw: 'Riya on Discord asked about Salesforce', status: 'Pending' },
      { raw: 'Cold email: meera@xyz.com — wants AWS, urgent', status: 'Pending' },
      { raw: 'Reva referred — call +1 555-444-2222 for ServiceNow', status: 'Pending' },
      { raw: 'LinkedIn DM from Aakash, iOS Swift, 6 months engagement', status: 'Pending' },
    ],
  });

  // ─── Summary ─────────────────────────────────────────────────────
  const counts = {
    clients: await prisma.client.count(),
    trainers: await prisma.trainer.count(),
    demos: await prisma.demo.count(),
    sourcing: await prisma.sourcingRequest.count(),
    proposals: await prisma.proposal.count(),
    payments: await prisma.payment.count(),
    sessions: await prisma.sessionLog.count(),
    tasks: await prisma.task.count(),
    leverage: await prisma.leverageRequest.count(),
    rawLeads: await prisma.rawLead.count(),
  };
  console.log('✓ Aggressive seed complete:');
  console.log(counts);
  console.log('\nLog in as anjali@mits.local / password123');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
