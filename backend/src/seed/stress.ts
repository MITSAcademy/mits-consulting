/**
 * Stress test seed — wipes dynamic data + generates a high-volume dataset:
 *   ~1500 trainers
 *   ~ 40 working demos (DemoScheduled + FeedbackPending)
 *   ~100 dormant clients
 *   ~300 hold clients
 *   + a normal distribution across the other lifecycle stages
 *
 * Run:    npm run seed:stress
 * Keeps:  users, bank accounts, email templates, lead sources, feature flags
 * Wipes:  clients, sourcing, proposals, payments, sessionLogs, demos, tasks, leverage,
 *         rawLeads, editRequests, payoutBatches, outboundMessages, feedback, generated trainers.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient, Lifecycle, EngagementType, Currency, PaymentModel, ConfirmationKind, DemoStatus } from '@prisma/client';

const prisma = new PrismaClient();

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDays(iso: string, n: number) { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN<T>(arr: T[], n: number): T[] { return [...arr].sort(() => Math.random() - 0.5).slice(0, n); }
function randInt(lo: number, hi: number) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }
function chance(p: number) { return Math.random() < p; }

// ─── Lookup banks ───────────────────────────────────────────────────────
const FIRST = ['Aanya','Aarav','Aaradhya','Aditi','Aditya','Advik','Akshay','Amaira','Aman','Ananya','Anika','Anisha','Anya','Arjun','Aryan','Asher','Avi','Bhavya','Charvi','Chirag','Daksh','Devansh','Devika','Dhruv','Diya','Eshaan','Esha','Farhan','Gaurav','Gauri','Harshita','Hriday','Isha','Ishaan','Ishita','Ivan','Jai','Janvi','Jiya','Kabir','Kanak','Karan','Kavya','Krish','Krithika','Laksh','Lavanya','Madhav','Mahek','Manav','Mira','Naitik','Naina','Nakul','Navya','Neha','Nikhil','Nirav','Nisha','Nivaan','Nivedita','Ojas','Om','Palak','Pankaj','Pari','Parth','Pia','Prachi','Priyank','Rachit','Radhika','Rahul','Rajat','Ravi','Reyansh','Riya','Rohan','Rohit','Rudra','Saanvi','Saachi','Saira','Samar','Sameer','Sania','Sanvi','Sara','Shaurya','Shivani','Shreya','Sia','Siddhant','Siya','Srishti','Suhana','Suhani','Suresh','Swara','Tanay','Tanya','Tara','Tarini','Tejas','Trisha','Udhav','Uma','Urvi','Vaibhav','Vansh','Varun','Veer','Vihaan','Vivaan','Yash','Yashvi','Zara','Zoya','Aakash','Akhil','Apoorva','Bhavik','Charvik','Dia','Esha','Falguni','Hari','Indra','Jaya','Kashvi','Lakshay','Manya','Niharika','Omkar','Pratham','Rishi','Sneha','Tanvi','Urvashi','Vipul','Yamini','Aaravi','Ayush','Bipasha','Chetana','Dev','Ekansh','Farah','Gunjan','Himanshu','Indu','Jasleen','Kabir','Lalit','Manju'];
const LAST = ['Sharma','Verma','Reddy','Iyer','Singh','Patel','Nair','Mehta','Kapoor','Joshi','Khanna','Pillai','Saxena','Choudhary','Banerjee','Mukherjee','Rao','Bhatt','Agarwal','Aggarwal','Goyal','Kumar','Yadav','Gupta','Jain','Bansal','Bhardwaj','Chopra','Das','Dixit','Dube','Gandhi','Ghosh','Goel','Gupta','Hegde','Iyengar','Jha','Joshi','Kashyap','Kaur','Khan','Kohli','Krishnan','Kulkarni','Madan','Malhotra','Mani','Menon','Mishra','Modi','Nadkarni','Nanda','Narayanan','Pandit','Parikh','Parmar','Pathak','Pawar','Prasad','Punjabi','Raghavan','Rajan','Raman','Ranjan','Sahay','Saluja','Sangha','Sanyal','Sapra','Sarin','Sehgal','Sen','Sengupta','Seth','Sethi','Shah','Sharma','Shastri','Shukla','Sinha','Sodhi','Srinivasan','Subramanian','Suri','Talwar','Thakkar','Thakur','Tiwari','Trivedi','Vaidya','Varma','Vasudevan','Vedanta','Virmani'];

const SKILL_GROUPS: Array<{ skills: string; hint: string }> = [
  { skills: 'Java, Spring Boot, Microservices, REST APIs, JPA', hint: 'Java' },
  { skills: 'AWS, EKS, Terraform, CloudFormation, IAM', hint: 'AWS' },
  { skills: 'React, Node.js, TypeScript, GraphQL, Redux', hint: 'React Node' },
  { skills: 'Python, Pandas, PyTorch, NLP, ML Ops', hint: 'Python ML' },
  { skills: 'Salesforce admin, Apex, Lightning, Flows, OmniStudio', hint: 'Salesforce' },
  { skills: 'ServiceNow ITSM, ITAM, Discovery, ITOM, GRC', hint: 'ServiceNow' },
  { skills: 'iOS Swift, SwiftUI, Combine, Core Data', hint: 'iOS Swift' },
  { skills: 'Cybersecurity, SIEM, SOC, Pen-testing, Splunk', hint: 'Cybersecurity' },
  { skills: 'Snowflake, dbt, Airflow, Spark, Databricks', hint: 'Data engineering' },
  { skills: 'Cerner, Epic, HL7, FHIR, EHR integrations', hint: 'Cerner' },
  { skills: '.NET, C#, Azure, ASP.NET Core, EF', hint: '.NET' },
  { skills: 'Selenium, Cypress, Playwright, manual QA, TestNG', hint: 'QA testing' },
  { skills: 'SAP HANA, SAP Fiori, SAP BW, ABAP', hint: 'SAP' },
  { skills: 'Tableau, Power BI, DAX, SQL, data visualisation', hint: 'BI' },
  { skills: 'Kubernetes, Docker, Helm, Istio, Prometheus', hint: 'DevOps' },
  { skills: 'Workday HCM, Workday Studio, EIB', hint: 'Workday' },
  { skills: 'Oracle EBS, Oracle Fusion, PL/SQL', hint: 'Oracle' },
  { skills: 'Android, Kotlin, Jetpack Compose, Room', hint: 'Android' },
  { skills: 'Angular, RxJS, NgRx, TypeScript', hint: 'Angular' },
  { skills: 'Vue 3, Nuxt, Pinia, Composition API', hint: 'Vue' },
];

const SOURCES = ['Direct outreach','Referral','LinkedIn Inbound','Partner channel','Webinar attendee','Cold email','MITS website','Trade show'];
const COUNTRY_CODES = ['+1','+91','+44','+61','+971'];

async function main() {
  console.log('Stress seed — wiping dynamic data…');
  await prisma.outboundMessage.deleteMany();
  await prisma.sessionLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.leverageRequest.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.proposal.deleteMany();
  await prisma.sourcingRequest.deleteMany();
  await prisma.demo.deleteMany();
  await prisma.client.deleteMany();
  await prisma.rawLead.deleteMany();
  await prisma.editRequest.deleteMany();
  await prisma.payoutBatch.deleteMany();
  // Wipe generated trainers (keep curated ones from base seed and any with manually-set ids)
  await prisma.trainer.deleteMany({ where: { id: { startsWith: 't-stress-' } } });
  await prisma.trainer.deleteMany({ where: { id: { startsWith: 't-gen-' } } });
  await prisma.trainer.deleteMany({ where: { name: { in: ['Smoke', 'Test'] } } });

  const today = todayISO();

  // Placeholder files for uploads referenced in proposals
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const SILENT_MP3 = Buffer.from('SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQZAAAAAAAAAA=', 'base64');
  const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  ['stress-call-1.mp3', 'stress-call-2.mp3', 'stress-wa-1.png'].forEach((n) => {
    const fp = path.join(uploadsDir, n);
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, n.endsWith('.mp3') ? SILENT_MP3 : TINY_PNG);
  });

  // ─── Trainers (target 1500) ──────────────────────────────────────
  console.log('Seeding ~1500 trainers (batched)…');
  const TRAINER_TARGET = 1500;
  const trainerRows: any[] = [];
  for (let i = 0; i < TRAINER_TARGET; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const sk = pick(SKILL_GROUPS);
    const phoneCode = chance(0.9) ? '+91' : pick(['+1', '+44', '+61']);
    const phoneDigits = String(7000000000 + randInt(1, 2999999999)).slice(-10);
    trainerRows.push({
      id: `t-stress-${i}`,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
      phoneCode,
      phoneDigits,
      skills: sk.skills,
      experienceYears: randInt(1, 18),
      defaultRateInr: randInt(600, 2200),
      rateModel: 'hourly' as const,
      paymentMethod: chance(0.7) ? 'UPI' : 'Bank',
      upiId: chance(0.7) ? `${first.toLowerCase()}@oksbi` : null,
      active: chance(0.95),
      requiresVerification: chance(0.4),
      whatsappGroupLink: chance(0.35) ? `https://chat.whatsapp.com/MITS${(i + 100000).toString(36)}` : null,
      recruitedById: chance(0.5) ? 'u-aman' : 'u-kanchan',
    });
  }
  // Batch create in chunks of 500 (Prisma's recommended batch size for createMany)
  for (let i = 0; i < trainerRows.length; i += 500) {
    await prisma.trainer.createMany({ data: trainerRows.slice(i, i + 500), skipDuplicates: true });
    process.stdout.write(`  · ${Math.min(i + 500, trainerRows.length)}/${trainerRows.length}\r`);
  }
  console.log(`\n  ✓ Trainers created.`);
  const allTrainerIds = (await prisma.trainer.findMany({ select: { id: true } })).map((t) => t.id);

  // ─── Clients (distributed: 40 working demos + 100 dormant + 300 hold + 100 various) ───
  console.log('Seeding clients…');

  // Build the exact distribution requested
  const distribution: Array<{ stage: Lifecycle; count: number }> = [
    // Working demos = DemoScheduled + FeedbackPending (post-demo flow)
    { stage: 'DemoScheduled',       count: 25 },
    { stage: 'FeedbackPending',     count: 15 },   // = 40 working demos
    { stage: 'Dormant',             count: 100 },  // explicit per request
    { stage: 'Hold',                count: 300 },  // explicit per request
    // Realistic spread for the rest of the funnel
    { stage: 'Lead',                count: 30 },
    { stage: 'IntakeSent',          count: 25 },
    { stage: 'IntakeReceived',      count: 20 },
    { stage: 'InternalSearch',      count: 15 },
    { stage: 'WithRecruiters',      count: 30 },
    { stage: 'VerificationPending', count: 20 },
    { stage: 'TrainerMatched',      count: 15 },
    { stage: 'DemoDone',            count: 10 },
    { stage: 'SaleClosing',         count: 15 },
    { stage: 'SaleWon',             count: 8 },
    { stage: 'Active',              count: 50 },
  ];

  // Flatten into a list of stage assignments
  const stageQueue: Lifecycle[] = [];
  for (const { stage, count } of distribution) {
    for (let i = 0; i < count; i++) stageQueue.push(stage);
  }
  // Shuffle so creation order is interleaved
  stageQueue.sort(() => Math.random() - 0.5);

  const createdClients: Array<{ id: string; lifecycle: Lifecycle; primaryTrainerId: string | null; demoDate: string | null; intakeOwnerId: string | null }> = [];
  let cIdx = 0;

  for (const lifecycle of stageQueue) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const name = `${first} ${last}`;
    const sk = pick(SKILL_GROUPS);
    const isTraining = chance(0.15);
    const engagementType: EngagementType = isTraining ? 'Training' : 'Support';
    const currency: Currency = chance(0.85) ? 'USD' : chance(0.5) ? 'CAD' : 'INR';
    const cycleAmount = isTraining ? randInt(250, 900) : randInt(450, 950);

    const hasIntake = ['IntakeReceived','InternalSearch','WithRecruiters','VerificationPending','TrainerMatched','DemoScheduled','DemoDone','FeedbackPending','SaleClosing','SaleWon','Active','Hold','Dormant'].includes(lifecycle);
    const hasTrainer = ['TrainerMatched','DemoScheduled','DemoDone','FeedbackPending','SaleClosing','SaleWon','Active','Hold'].includes(lifecycle);
    const trainerId = hasTrainer ? pick(allTrainerIds) : null;
    const isActive = lifecycle === 'Active' || lifecycle === 'LeverageGranted';
    const intakeOwnerId = hasIntake ? (chance(0.5) ? 'u-anjali' : 'u-taran') : null;

    let demoDate: string | null = null;
    let demoActualDate: string | null = null;
    let demoOutcome: string | null = null;
    if (lifecycle === 'DemoScheduled') {
      demoDate = addDays(today, randInt(-2, 14));
    } else if (['DemoDone','FeedbackPending','SaleClosing','SaleWon','Active','Hold'].includes(lifecycle)) {
      demoDate = addDays(today, -randInt(3, 30));
      demoActualDate = demoDate;
      demoOutcome = chance(0.7) ? 'Positive' : chance(0.5) ? 'Neutral' : 'Negative';
    }

    // Dormant tracking
    let dormantSince: string | null = null, dormantReason: string | null = null,
      dormantCheckBackOn: string | null = null, dormantResumeFromStage: string | null = null;
    if (lifecycle === 'Dormant') {
      dormantSince = addDays(today, -randInt(3, 90));
      dormantReason = pick([
        'No reply since intake sent. Possibly engaged elsewhere.',
        'Said "let me think" after demo, then silence.',
        'Group went quiet after WhatsApp ping. Read receipts on, not replying.',
        'Cancelled demo last minute, never rescheduled.',
        'Said budget tight, will revisit next quarter.',
        'Switched roles internally — sponsor changed.',
        'Holiday period — said back in 2 weeks, didn\'t return.',
      ]);
      // Spread check-back: 30% overdue, 30% within 7 days, 40% later
      const r = Math.random();
      const offset = r < 0.3 ? -randInt(1, 15) : r < 0.6 ? randInt(0, 7) : randInt(8, 45);
      dormantCheckBackOn = addDays(today, offset);
      dormantResumeFromStage = pick(['Lead','IntakeSent','IntakeReceived','DemoDone','SaleClosing']);
    }

    // Hold tracking (3-day check-back)
    let holdSince: string | null = null, holdReason: string | null = null,
      holdCheckBackOn: string | null = null, holdResumeFromStage: string | null = null;
    if (lifecycle === 'Hold') {
      const daysAgo = randInt(0, 12);
      holdSince = addDays(today, -daysAgo);
      // checkback = holdSince + 3, so some will be overdue, some today, some future
      holdCheckBackOn = addDays(holdSince, 3);
      holdReason = pick([
        'Client said "need a week to discuss with team".',
        'Budget approval pending from finance.',
        'Wants to compare with one more vendor; will revert by Friday.',
        'Holiday season; resume after first week of next month.',
        'Sponsor on leave, will confirm post-return.',
        'Procurement onboarding in progress.',
        'Internal restructuring; pause for 10 days.',
      ]);
      holdResumeFromStage = 'FeedbackPending';
    }

    // Skill matrix sent gate
    let skillMatrixSentAt: string | null = null;
    let skillMatrixSentById: string | null = null;
    if (['DemoScheduled','DemoDone','FeedbackPending','SaleClosing','SaleWon','Active','Hold'].includes(lifecycle)) {
      skillMatrixSentAt = addDays(today, -randInt(4, 35));
      skillMatrixSentById = chance(0.5) ? 'u-anjali' : 'u-taran';
    }

    // Cycle dates for active
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

    const cid = `c-stress-${cIdx++}`;
    const countryCode = pick(COUNTRY_CODES);
    await prisma.client.create({
      data: {
        id: cid,
        name,
        phoneCode: countryCode,
        phoneDigits: String(6000000000 + randInt(1, 3999999999)).slice(-10),
        whatsappGroupName: chance(0.4) ? `${first} · ${sk.hint} · MITS` : null,
        whatsappGroupLink: chance(0.3) ? `https://chat.whatsapp.com/CLI${(cIdx + 200000).toString(36)}` : null,
        email: chance(0.85) ? `${first.toLowerCase()}.${last.toLowerCase()}@example.com` : null,
        country: currency === 'CAD' ? 'CA' : currency === 'INR' ? 'IN' : 'US',
        engagementType,
        paymentModel: isActive ? (sessionsPerCycle === 5 ? PaymentModel.Weekly : sessionsPerCycle === 10 ? PaymentModel.BiWeekly : PaymentModel.Monthly) : null,
        currency,
        cycleAmount,
        lifecycle,
        funderType: chance(0.15) ? 'Partner' : 'Self',
        source: pick(SOURCES),
        leadOwnerId: 'u-vaibhav',
        intakeOwnerId,
        salesOwnerId: ['SaleClosing','SaleWon','Active','Hold','FeedbackPending'].includes(lifecycle) ? 'u-roshni' : null,
        hostOwnerId: isActive ? (chance(0.5) ? 'u-kashish' : 'u-muskan') : null,
        primaryTrainerId: trainerId,
        engagementTrainerRateInr: trainerId ? randInt(700, 1700) : 0,
        preferredTimeIst: pick(['09:00','20:00','08:00','21:00']),
        feedbackDay: pick(['Wednesday','Thursday','Friday']),
        bankAccountId: 'b-mits-pvt',
        freshPaymentReceived,
        freshPaymentDate,
        freshPaymentAmount,
        cycleStart, cycleEnd, nextRenewalDue,
        sessionsPerCycle, sessionsUsed, churnRisk,
        paymentPendingVaibhav: chance(0.05),
        pendingVaibhavSince: chance(0.5) ? addDays(today, -randInt(1, 20)) : null,
        intakeSkillHint: sk.hint,
        intakeData: hasIntake ? {
          detailed_skill_set: sk.skills,
          current_priority_task: pick(['Cert in 4 weeks','Client-facing project starts next month','Resume-ready for FAANG','Internal upskill mandate']),
          client_email: chance(0.85) ? `${first.toLowerCase()}@example.com` : '',
          demo_timing_ist: pick(['Morning 9-11 IST','Evening 7-9 IST','Flexible']),
          session_timing_ist: pick(['9-10 PM IST weekdays','7-8 AM IST mon/wed/fri','Flexible']),
          trainer_preference: pick(['Indian, 5+ yrs exp','English-fluent, US time-zone friendly','Female trainer preferred','Open']),
          meeting_tool: pick(['Zoom','Google Meet','Microsoft Teams']),
          additional_notes: '',
        } : undefined,
        intakeReceivedAt: hasIntake ? addDays(today, -randInt(1, 30)) : null,
        demoDate,
        demoTimeIst: demoDate ? pick(['09:00','20:00','21:00']) : null,
        demoActualDate,
        demoActualTimeIst: demoActualDate ? pick(['09:00','20:00']) : null,
        demoOutcome: demoOutcome as any,
        demoFeedback: demoOutcome ? pick(['Strong fit on skills, wants to proceed.','Clicked with the trainer on first call.','Liked the approach, said yes.','Needs to discuss with manager.','Concerned about depth — wants more.','Not a fit, looking for senior profile.']) : null,
        dormantSince, dormantReason, dormantCheckBackOn, dormantResumeFromStage,
        holdSince, holdReason, holdCheckBackOn, holdResumeFromStage,
        skillMatrixSentAt, skillMatrixSentById,
      },
    });
    createdClients.push({ id: cid, lifecycle, primaryTrainerId: trainerId, demoDate, intakeOwnerId });
  }
  console.log(`  ✓ ${createdClients.length} clients created.`);

  // ─── Demo history ───────────────────────────────────────────────────
  console.log('Seeding demo history…');
  const stagesWithDemos: Lifecycle[] = ['DemoScheduled','DemoDone','FeedbackPending','SaleClosing','SaleWon','Active','Hold','Dormant'];
  let demoCount = 0;
  for (const c of createdClients) {
    if (!stagesWithDemos.includes(c.lifecycle)) continue;
    const numDemos = chance(0.1) ? 3 : chance(0.4) ? 2 : 1;
    for (let i = 0; i < numDemos; i++) {
      const isLast = i === numDemos - 1;
      const status: DemoStatus = isLast && c.lifecycle === 'DemoScheduled' ? 'Scheduled'
        : isLast ? 'Done' : chance(0.7) ? 'Done' : 'Cancelled';
      await prisma.demo.create({
        data: {
          clientId: c.id,
          trainerId: c.primaryTrainerId || pick(allTrainerIds),
          scheduledDate: c.demoDate || addDays(today, -randInt(5, 60)),
          scheduledTimeIst: pick(['09:00','20:00']),
          actualDate: status === 'Done' ? (c.demoDate || addDays(today, -randInt(5, 60))) : null,
          actualTimeIst: status === 'Done' ? pick(['09:00','20:00']) : null,
          status,
          outcome: status === 'Done' ? pick(['Positive','Neutral','Negative']) : null,
        },
      });
      demoCount++;
    }
  }
  console.log(`  ✓ ${demoCount} demos created.`);

  // ─── Sourcing requests + proposals for clients in recruiter stages ───
  console.log('Seeding sourcing requests + proposals…');
  const PARTNER: Record<string, string> = { 'u-anjali': 'u-aman', 'u-taran': 'u-kanchan' };
  const inSourcing = createdClients.filter((c) => ['InternalSearch','WithRecruiters','VerificationPending'].includes(c.lifecycle));
  let proposalCount = 0;
  let sourcingCount = 0;
  for (const c of inSourcing) {
    const isProposed = c.lifecycle === 'VerificationPending';
    const status = isProposed ? 'Proposed' : 'Open';
    const sender = c.intakeOwnerId || (chance(0.5) ? 'u-anjali' : 'u-taran');
    const sentTo = PARTNER[sender] || (chance(0.5) ? 'u-aman' : 'u-kanchan');
    const req = await prisma.sourcingRequest.create({
      data: {
        clientId: c.id,
        status: status as any,
        sentById: sender,
        sentToId: sentTo,
        sentAt: addDays(today, -randInt(0, 10)),
      },
    });
    sourcingCount++;
    if (isProposed) {
      const n = randInt(2, 4);
      const chosen = pickN(allTrainerIds, n);
      for (let i = 0; i < n; i++) {
        const verification = i === 0 && chance(0.4) ? 'Pass' : chance(0.2) ? 'Fail' : 'Pending';
        // Structured skill matrix populated based on stage skill
        const skillBank = ['Hands-on lab','Core skill','Domain expertise','Live troubleshooting'];
        const mustHaveSkills = skillBank.map((s) => ({
          skill: s,
          proficiency: Math.round((3.5 + Math.random() * 1.5) * 2) / 2,
        }));
        const softSkills = [
          { item: 'Confident',           value: 'Yes' },
          { item: 'English Speaking',    value: 'Yes' },
          { item: 'Trustworthy',         value: 'Yes' },
          { item: 'Zoom',                value: 'Installed' },
          { item: 'Internet Connection', value: 'Active' },
        ];
        const notified = chance(0.6);
        await prisma.proposal.create({
          data: {
            requestId: req.id,
            trainerId: chosen[i],
            rateInr: randInt(800, 1700),
            experienceYears: randInt(3, 12),
            notes: pick(['Available IST evenings.','Has banking domain experience.','Premium rate but strong fit.','New to MITS but high rec from internal team.']),
            proposedById: chance(0.5) ? 'u-aman' : 'u-kanchan',
            proposedAt: addDays(today, -randInt(0, 5)),
            verification: verification as any,
            verificationNotes: verification === 'Fail' ? pick(['Rate too high.','Timing conflict.','Picked another proposal.']) : null,
            confirmationKind: chance(0.7) ? ConfirmationKind.Audio : ConfirmationKind.Screenshot,
            confirmationUrl: pick(['/uploads/stress-call-1.mp3','/uploads/stress-call-2.mp3','/uploads/stress-wa-1.png']),
            mustHaveSkills,
            softSkills,
            trainerNotifiedAt: notified ? addDays(today, -randInt(0, 3)) : null,
            trainerNotifiedById: notified ? (chance(0.5) ? 'u-aman' : 'u-kanchan') : null,
          },
        });
        proposalCount++;
      }
    }
  }
  console.log(`  ✓ ${sourcingCount} sourcing requests, ${proposalCount} proposals.`);

  // ─── Payments for active + sale clients ────────────────────────────
  console.log('Seeding payments…');
  const payClients = createdClients.filter((c) => ['SaleClosing','SaleWon','Active'].includes(c.lifecycle));
  let payCount = 0;
  for (const c of payClients) {
    if (!chance(0.7)) continue;
    await prisma.payment.create({
      data: {
        clientId: c.id,
        kind: 'Fresh',
        amount: randInt(450, 950),
        currency: 'USD',
        paymentDate: addDays(today, -randInt(1, 30)),
        bankAccountId: 'b-mits-pvt',
        paymentMode: pick(['Bank','UPI','Zelle','Wire']),
      },
    });
    payCount++;
  }
  console.log(`  ✓ ${payCount} payments.`);

  // ─── Session logs for active clients (last 3 weeks) ────────────────
  console.log('Seeding session logs…');
  const actives = createdClients.filter((c) => c.lifecycle === 'Active' && c.primaryTrainerId);
  let sessionCount = 0;
  for (const c of actives) {
    const numSessions = randInt(3, 12);
    for (let i = 0; i < numSessions; i++) {
      const date = addDays(today, -randInt(0, 21));
      const minutes = randInt(45, 90);
      const rateSnap = randInt(700, 1700);
      await prisma.sessionLog.create({
        data: {
          clientId: c.id,
          trainerId: c.primaryTrainerId!,
          date,
          hours: minutes / 60,
          rateSnapshot: rateSnap,
          rateModel: 'hourly',
          amountInr: Math.round((minutes / 60) * rateSnap),
          notes: pick(['Worked on production bug fix.','Code review session.','Architecture deep-dive.','Pair programming.']),
        },
      });
      sessionCount++;
    }
  }
  console.log(`  ✓ ${sessionCount} session logs.`);

  // Final summary
  const summary = {
    trainers: await prisma.trainer.count(),
    clients: await prisma.client.count(),
    'clients.workingDemos': await prisma.client.count({ where: { lifecycle: { in: ['DemoScheduled', 'FeedbackPending'] } } }),
    'clients.dormant': await prisma.client.count({ where: { lifecycle: 'Dormant' } }),
    'clients.hold': await prisma.client.count({ where: { lifecycle: 'Hold' } }),
    'clients.active': await prisma.client.count({ where: { lifecycle: 'Active' } }),
    demos: await prisma.demo.count(),
    sourcing: await prisma.sourcingRequest.count(),
    proposals: await prisma.proposal.count(),
    'proposals.notified': await prisma.proposal.count({ where: { trainerNotifiedAt: { not: null } } }),
    payments: await prisma.payment.count(),
    sessions: await prisma.sessionLog.count(),
  };
  console.log('\n✓ Stress seed complete:');
  console.log(summary);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
