/**
 * Demo-reset script — wipes dynamic data (clients/proposals/sourcing/payments/tasks/leverage/feedback)
 * and re-seeds a clean, varied set with at least one client at every lifecycle stage.
 *
 * Static data (users, banks, partners, trainers, lead sources, templates, feature flags)
 * is left untouched. Re-run any time things get messy.
 *
 *   npm run seed:demo
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { PrismaClient, Lifecycle, EngagementType, Currency, PaymentModel, ConfirmationKind } from '@prisma/client';

const prisma = new PrismaClient();

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDays(iso: string, n: number) {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}

async function main() {
  console.log('Demo-reset: wiping dynamic data…');
  // Order matters due to FK cascades
  await prisma.accountsQueueItem.deleteMany();
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

  const today = todayISO();
  // Ensure placeholder files exist for any seeded /uploads/* references the demo proposals point to.
  // Without this, the <audio> / <img> elements 404 in the Verifications page.
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  // 51-byte silent MP3 (ID3 header + one silent frame)
  const SILENT_MP3 = Buffer.from(
    'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQZAAAAAAAAAA=',
    'base64',
  );
  // 1×1 transparent PNG
  const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  const TINY_PDF = Buffer.from('%PDF-1.4\n%demo placeholder\n');
  const stubs: Array<[string, Buffer]> = [
    ['demo-pooja-call.mp3', SILENT_MP3],
    ['demo-rakesh-call.mp3', SILENT_MP3],
    ['demo-vikram-wa.png', TINY_PNG],
    ['demo-vikram-skills.pdf', TINY_PDF],
  ];
  for (const [name, buf] of stubs) {
    const fp = path.join(uploadsDir, name);
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, buf);
  }

  console.log('Seeding demo scenarios…');

  // ----- Sample at every relevant stage -----
  const scenarios: Array<{
    name: string;
    lifecycle: Lifecycle;
    intakeOwnerId?: string | null;
    salesOwnerId?: string | null;
    hostOwnerId?: string | null;
    primaryTrainerId?: string | null;
    engagementTrainerRateInr?: number;
    intakeSkillHint?: string;
    intakeData?: any;
    engagementType?: EngagementType;
    currency?: Currency;
    cycleAmount?: number;
    paymentModel?: PaymentModel | null;
    cycleStart?: string | null;
    cycleEnd?: string | null;
    nextRenewalDue?: string | null;
    sessionsPerCycle?: number;
    sessionsUsed?: number;
    churnRisk?: string;
    freshPaymentReceived?: boolean;
    freshPaymentDate?: string | null;
    freshPaymentAmount?: number;
    paymentPendingVaibhav?: boolean;
    pendingVaibhavSince?: string | null;
    bankAccountId?: string;
    accountNameRaw?: string;
    source?: string;
    phoneCode?: string;
    phoneDigits?: string;
    whatsappGroupName?: string;
    dormantSince?: string;
    dormantReason?: string;
    dormantCheckBackOn?: string;
    dormantResumeFromStage?: string;
  }> = [
    {
      name: 'Karthik · brand-new lead (Lead)',
      lifecycle: 'Lead',
      source: 'LinkedIn',
      engagementType: 'Support',
      currency: 'USD',
      phoneCode: '+1', phoneDigits: '5125550101',
      intakeSkillHint: 'Java backend',
      whatsappGroupName: 'Karthik · Java · MITS',
    },
    {
      name: 'Riya · intake sent (IntakeSent)',
      lifecycle: 'IntakeSent',
      intakeOwnerId: 'u-anjali',
      source: 'LinkedIn',
      engagementType: 'Support',
      currency: 'USD',
      phoneCode: '+1', phoneDigits: '5125550102',
      whatsappGroupName: 'Riya · MITS',
    },
    {
      name: 'Vivek · intake done (IntakeReceived)',
      lifecycle: 'IntakeReceived',
      intakeOwnerId: 'u-anjali',
      source: 'Direct referral',
      engagementType: 'Support',
      currency: 'USD',
      phoneCode: '+1', phoneDigits: '5125550103',
      intakeSkillHint: 'Salesforce admin + Apex',
      intakeData: {
        detailed_skill_set: 'Salesforce admin + Apex',
        current_priority_task: 'Project go-live next week',
        client_email: 'vivek@example.com',
        demo_timing_ist: 'Evening 7-9 IST',
        session_timing_ist: '9 AM IST Mon-Fri',
        trainer_preference: 'Banking domain preferred',
        meeting_tool: 'Zoom',
        additional_notes: '',
      },
      whatsappGroupName: 'Vivek · Salesforce · MITS',
    },
    {
      name: 'Hari · internal pool searched (InternalSearch)',
      lifecycle: 'InternalSearch',
      intakeOwnerId: 'u-taran',
      source: 'Direct referral',
      engagementType: 'Support',
      currency: 'USD',
      phoneCode: '+1', phoneDigits: '5125550104',
      intakeSkillHint: 'Cerner clinical',
      intakeData: {
        detailed_skill_set: 'Cerner clinical, HL7 integration',
        current_priority_task: 'Cerner Millennium upgrade',
        client_email: 'hari@example.com',
        demo_timing_ist: 'Morning 9-11 IST',
        session_timing_ist: '9 AM IST',
        trainer_preference: '',
        meeting_tool: 'Zoom',
      },
      whatsappGroupName: 'Hari · Cerner · MITS',
    },
    {
      name: 'Priyanka · with recruiters (WithRecruiters)',
      lifecycle: 'WithRecruiters',
      intakeOwnerId: 'u-anjali',
      source: 'LinkedIn',
      engagementType: 'Support',
      currency: 'USD',
      phoneCode: '+1', phoneDigits: '5125550105',
      intakeSkillHint: 'iOS Swift, SwiftUI',
      intakeData: {
        detailed_skill_set: 'iOS Swift, SwiftUI, Combine',
        current_priority_task: 'Building an app for a client',
        client_email: 'priyanka@example.com',
        demo_timing_ist: 'Evening 8-10 IST',
        session_timing_ist: '9 PM IST Mon/Wed/Fri',
        trainer_preference: '5+ yrs iOS prod experience',
        meeting_tool: 'Zoom',
      },
      whatsappGroupName: 'Priyanka · iOS · MITS',
    },
    {
      name: 'Asha · verify proposals (VerificationPending)',
      lifecycle: 'VerificationPending',
      intakeOwnerId: 'u-taran',
      source: 'LinkedIn',
      engagementType: 'Support',
      currency: 'USD',
      phoneCode: '+1', phoneDigits: '5125550106',
      intakeSkillHint: 'Snowflake, dbt, Airflow',
      intakeData: {
        detailed_skill_set: 'Snowflake, dbt, Airflow',
        current_priority_task: 'Data warehouse migration',
        client_email: 'asha@example.com',
        demo_timing_ist: 'Morning 9-11 IST',
        session_timing_ist: '9 AM IST',
        trainer_preference: 'Snowflake cert preferred',
        meeting_tool: 'Webex',
      },
      whatsappGroupName: 'Asha · Snowflake · MITS',
    },
    {
      name: 'Rohit · trainer matched (TrainerMatched)',
      lifecycle: 'TrainerMatched',
      intakeOwnerId: 'u-anjali',
      primaryTrainerId: 't-anand',
      engagementTrainerRateInr: 900,
      source: 'Mytabtech',
      engagementType: 'Support',
      currency: 'USD',
      phoneCode: '+1', phoneDigits: '5125550107',
      intakeSkillHint: 'Java, Spring Boot',
      intakeData: {
        detailed_skill_set: 'Java, Spring Boot, Microservices',
        current_priority_task: 'API performance optimization',
        client_email: 'rohit@example.com',
        demo_timing_ist: 'Evening 7-9 IST',
        session_timing_ist: '8 PM IST Mon/Wed/Fri',
      },
      whatsappGroupName: 'Rohit · Java · MITS',
    },
    {
      name: 'Neha · demo scheduled (DemoScheduled)',
      lifecycle: 'DemoScheduled',
      intakeOwnerId: 'u-taran',
      primaryTrainerId: 't-sneha',
      engagementTrainerRateInr: 1100,
      source: 'Anuradha',
      engagementType: 'Support',
      currency: 'USD',
      phoneCode: '+1', phoneDigits: '5125550108',
      intakeSkillHint: 'React, Node.js',
      intakeData: {
        detailed_skill_set: 'React, Node.js, TypeScript',
        current_priority_task: 'Refactor monolith to microservices',
        client_email: 'neha@example.com',
        demo_timing_ist: 'Morning 10 IST',
        session_timing_ist: '9 AM IST Mon-Fri',
      },
      whatsappGroupName: 'Neha · React · MITS',
    },
    {
      name: 'Sai · demo done · ready for Roshni (DemoDone)',
      lifecycle: 'DemoDone',
      intakeOwnerId: 'u-anjali',
      primaryTrainerId: 't-kiran',
      engagementTrainerRateInr: 1200,
      source: 'Mytabtech',
      engagementType: 'Support',
      currency: 'USD',
      phoneCode: '+1', phoneDigits: '5125550109',
      intakeSkillHint: 'AWS, DevOps',
      intakeData: {
        detailed_skill_set: 'AWS, DevOps, Kubernetes',
        current_priority_task: 'Migrate on-prem to AWS',
        client_email: 'sai@example.com',
      },
      whatsappGroupName: 'Sai · AWS · MITS',
    },
    {
      name: 'Manish · sale closing (SaleClosing)',
      lifecycle: 'SaleClosing',
      intakeOwnerId: 'u-anjali',
      salesOwnerId: 'u-roshni',
      primaryTrainerId: 't-rakesh',
      engagementTrainerRateInr: 1500,
      source: 'LinkedIn',
      engagementType: 'Support',
      currency: 'USD',
      cycleAmount: 700,
      paymentModel: 'BiWeekly',
      phoneCode: '+1', phoneDigits: '5125550110',
      intakeSkillHint: 'Python ML',
      intakeData: {
        detailed_skill_set: 'Python, ML, NLP',
        current_priority_task: 'Build NLP pipeline',
        client_email: 'manish@example.com',
      },
      whatsappGroupName: 'Manish · ML · MITS',
    },
    {
      name: 'Surya · active (paid + running)',
      lifecycle: 'Active',
      intakeOwnerId: 'u-anjali',
      salesOwnerId: 'u-roshni',
      hostOwnerId: 'u-kashish',
      primaryTrainerId: 't-anand',
      engagementTrainerRateInr: 800,
      source: 'Mytabtech',
      engagementType: 'Support',
      currency: 'USD',
      cycleAmount: 600,
      paymentModel: 'BiWeekly',
      cycleStart: addDays(today, -5),
      cycleEnd: addDays(today, 8),
      nextRenewalDue: addDays(today, 8),
      sessionsPerCycle: 10,
      sessionsUsed: 4,
      churnRisk: 'Green',
      freshPaymentReceived: true,
      freshPaymentDate: addDays(today, -5),
      freshPaymentAmount: 600,
      bankAccountId: 'b-hdfc-mits-anupama',
      accountNameRaw: 'Mytabtech',
      phoneCode: '+1', phoneDigits: '5125550111',
      intakeSkillHint: 'Java, Spring Boot',
      whatsappGroupName: 'Surya · Java · MITS',
    },
    {
      name: 'Bhargavi · active · renewal due TOMORROW',
      lifecycle: 'Active',
      intakeOwnerId: 'u-taran',
      salesOwnerId: 'u-roshni',
      hostOwnerId: 'u-muskan',
      primaryTrainerId: 't-priya',
      engagementTrainerRateInr: 1100,
      source: 'Anuradha',
      engagementType: 'Support',
      currency: 'USD',
      cycleAmount: 700,
      paymentModel: 'Weekly',
      cycleStart: addDays(today, -6),
      cycleEnd: addDays(today, 1),
      nextRenewalDue: addDays(today, 1),
      sessionsPerCycle: 5,
      sessionsUsed: 4,
      churnRisk: 'Amber',
      freshPaymentReceived: true,
      freshPaymentDate: addDays(today, -6),
      freshPaymentAmount: 700,
      bankAccountId: 'b-hdfc-anupama',
      accountNameRaw: 'Anuradha',
      phoneCode: '+1', phoneDigits: '5125550112',
      intakeSkillHint: 'Salesforce',
      whatsappGroupName: 'Bhargavi · SF · MITS',
    },
    {
      name: 'Ramya · payment pending on Vaibhav',
      lifecycle: 'Active',
      intakeOwnerId: 'u-anjali',
      salesOwnerId: 'u-roshni',
      hostOwnerId: 'u-kashish',
      primaryTrainerId: 't-sneha',
      engagementTrainerRateInr: 1000,
      source: 'Direct referral',
      engagementType: 'Support',
      currency: 'USD',
      cycleAmount: 550,
      paymentModel: 'BiWeekly',
      cycleStart: addDays(today, -3),
      cycleEnd: addDays(today, 11),
      nextRenewalDue: addDays(today, 11),
      sessionsPerCycle: 10,
      sessionsUsed: 2,
      churnRisk: 'Green',
      freshPaymentReceived: false,
      paymentPendingVaibhav: true,
      pendingVaibhavSince: addDays(today, -3),
      bankAccountId: 'b-mits-pvt',
      accountNameRaw: 'MITS PVT LTD',
      phoneCode: '+1', phoneDigits: '5125550113',
      intakeSkillHint: 'Cerner',
      whatsappGroupName: 'Ramya · Cerner · MITS',
    },
    {
      name: 'Training · Python · Ram',
      lifecycle: 'Active',
      intakeOwnerId: 'u-anjali',
      primaryTrainerId: 't-rakesh',
      engagementTrainerRateInr: 1500,
      hostOwnerId: 'u-muskan',
      source: 'Thiru',
      engagementType: 'Training',
      currency: 'USD',
      cycleAmount: 400,
      bankAccountId: 'b-mits-pvt',
      accountNameRaw: 'Thiru',
      freshPaymentReceived: true,
      freshPaymentDate: addDays(today, -4),
      freshPaymentAmount: 400,
      phoneCode: '+1', phoneDigits: '5125550114',
      intakeSkillHint: 'Python',
      whatsappGroupName: 'Ram · Python training · MITS',
    },
    {
      name: 'Akhil · on hold',
      lifecycle: 'Hold',
      intakeOwnerId: 'u-anjali',
      primaryTrainerId: 't-aditya',
      engagementTrainerRateInr: 900,
      hostOwnerId: 'u-kashish',
      source: 'LinkedIn',
      engagementType: 'Support',
      currency: 'USD',
      cycleAmount: 600,
      phoneCode: '+1', phoneDigits: '5125550115',
      intakeSkillHint: 'Cybersecurity',
      whatsappGroupName: 'Akhil · Cyber · MITS',
    },
    // ── Dormant scenarios ─────────────────────────────────────
    {
      name: 'Deepa · dormant after demo (check-back due soon)',
      lifecycle: 'Dormant',
      intakeOwnerId: 'u-taran',
      primaryTrainerId: 't-priya',
      engagementTrainerRateInr: 1100,
      source: 'LinkedIn',
      engagementType: 'Support',
      currency: 'USD',
      phoneCode: '+1', phoneDigits: '5125550116',
      intakeSkillHint: 'Salesforce admin',
      intakeData: {
        detailed_skill_set: 'Salesforce admin + Flows',
        current_priority_task: 'Org admin certification',
        client_email: 'deepa@example.com',
        demo_timing_ist: 'Evening 7-9 IST',
      },
      whatsappGroupName: 'Deepa · SF · MITS',
      dormantSince: addDays(today, -10),
      dormantReason: 'No reply since demo done — said "let me think it over". Reading group messages but not replying.',
      dormantCheckBackOn: addDays(today, 1),
      dormantResumeFromStage: 'DemoDone',
    },
    {
      name: 'Tushar · dormant lead (long gap)',
      lifecycle: 'Dormant',
      intakeOwnerId: 'u-anjali',
      source: 'Direct referral',
      engagementType: 'Support',
      currency: 'USD',
      phoneCode: '+1', phoneDigits: '5125550117',
      intakeSkillHint: 'AWS DevOps',
      whatsappGroupName: 'Tushar · AWS · MITS',
      dormantSince: addDays(today, -32),
      dormantReason: 'Stopped responding after the initial WhatsApp ping. Possibly already engaged elsewhere.',
      dormantCheckBackOn: addDays(today, 15),
      dormantResumeFromStage: 'IntakeSent',
    },
    // ── Extra pre-demo variety so Anjali has more to do ─────
    {
      name: 'Aakanksha · new lead (Java + Kafka)',
      lifecycle: 'Lead',
      source: 'Direct referral',
      engagementType: 'Support',
      currency: 'USD',
      phoneCode: '+1', phoneDigits: '5125550118',
      intakeSkillHint: 'Java, Kafka, Microservices',
      whatsappGroupName: 'Aakanksha · Java/Kafka · MITS',
    },
    {
      name: 'Pravin · intake sent (no reply yet)',
      lifecycle: 'IntakeSent',
      intakeOwnerId: 'u-anjali',
      source: 'LinkedIn',
      engagementType: 'Training',
      currency: 'USD',
      cycleAmount: 350,
      phoneCode: '+1', phoneDigits: '5125550119',
      intakeSkillHint: 'Manual testing fundamentals',
      whatsappGroupName: 'Pravin · QA · MITS',
    },
    // ── Extra training scenarios for variety ─────────────────
    {
      name: 'Training · ServiceNow · Meera',
      lifecycle: 'TrainerMatched',
      intakeOwnerId: 'u-taran',
      primaryTrainerId: 't-priya',
      engagementTrainerRateInr: 1100,
      source: 'Sforce',
      engagementType: 'Training',
      currency: 'USD',
      cycleAmount: 550,
      phoneCode: '+1', phoneDigits: '5125550120',
      intakeSkillHint: 'ServiceNow ITSM',
      intakeData: {
        detailed_skill_set: 'ServiceNow ITSM, ITAM, Discovery',
        current_priority_task: 'CIS-ITSM certification',
        client_email: 'meera@example.com',
      },
      whatsappGroupName: 'Meera · ServiceNow training · MITS',
    },
  ];

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    await prisma.client.create({
      data: {
        id: 'c-demo-' + i,
        name: s.name,
        phoneCode: s.phoneCode || '+1',
        phoneDigits: s.phoneDigits || null,
        whatsappGroupName: s.whatsappGroupName || null,
        country: 'US',
        engagementType: s.engagementType || 'Support',
        paymentModel: s.paymentModel || null,
        currency: s.currency || 'USD',
        cycleAmount: s.cycleAmount || 0,
        lifecycle: s.lifecycle,
        funderType: 'Self',
        source: s.source || null,
        leadOwnerId: 'u-vaibhav',
        intakeOwnerId: s.intakeOwnerId || null,
        salesOwnerId: s.salesOwnerId || null,
        hostOwnerId: s.hostOwnerId || null,
        primaryTrainerId: s.primaryTrainerId || null,
        engagementTrainerRateInr: s.engagementTrainerRateInr || 0,
        preferredTimeIst: '09:00',
        feedbackDay: 'Wednesday',
        bankAccountId: s.bankAccountId || null,
        accountNameRaw: s.accountNameRaw || null,
        freshPaymentReceived: !!s.freshPaymentReceived,
        freshPaymentDate: s.freshPaymentDate || null,
        freshPaymentAmount: s.freshPaymentAmount || 0,
        cycleStart: s.cycleStart || null,
        cycleEnd: s.cycleEnd || null,
        nextRenewalDue: s.nextRenewalDue || null,
        sessionsPerCycle: s.sessionsPerCycle || 0,
        sessionsUsed: s.sessionsUsed || 0,
        churnRisk: s.churnRisk || 'Green',
        paymentPendingVaibhav: !!s.paymentPendingVaibhav,
        pendingVaibhavSince: s.pendingVaibhavSince || null,
        intakeSkillHint: s.intakeSkillHint || null,
        intakeData: s.intakeData || undefined,
        intakeReceivedAt: s.intakeData ? today : null,
        dormantSince: s.dormantSince || null,
        dormantReason: s.dormantReason || null,
        dormantCheckBackOn: s.dormantCheckBackOn || null,
        dormantResumeFromStage: s.dormantResumeFromStage || null,
      },
    });
  }

  // ----- Sample sourcing request: PRIYANKA with NO proposals yet (Aman is sourcing) -----
  const priyanka = await prisma.client.findFirst({ where: { name: { contains: 'Priyanka' } } });
  if (priyanka) {
    await prisma.sourcingRequest.create({
      data: {
        clientId: priyanka.id,
        status: 'Open',
        sentById: 'u-anjali',
        sentToId: 'u-aman',
        sentAt: today,
      },
    });
  }

  // ----- Sample sourcing request: ASHA with 3 proposals already in for verification -----
  const asha = await prisma.client.findFirst({ where: { name: { contains: 'Asha' } } });
  if (asha) {
    const req = await prisma.sourcingRequest.create({
      data: {
        clientId: asha.id,
        status: 'Proposed',
        sentById: 'u-taran',
        sentToId: 'u-aman',
        sentAt: addDays(today, -1),
      },
    });
    // Three proposals — varied confirmation kinds. Files are stub paths;
    // the user uploads real ones via the modal in production use.
    await prisma.proposal.createMany({
      data: [
        {
          requestId: req.id,
          trainerName: 'Pooja Sharma',
          trainerSkills: 'Snowflake, dbt, Airflow',
          trainerPhone: '+91 98765 11111',
          trainerEmail: 'pooja@trainer.com',
          rateInr: 1200,
          experienceYears: 4,
          notes: '4yrs Snowflake + dbt exp. Available IST evenings. Confirmed timing on a 12-min call.',
          proposedById: 'u-aman',
          proposedAt: addDays(today, -1),
          verification: 'Pending',
          confirmationKind: ConfirmationKind.Audio,
          confirmationUrl: '/uploads/demo-pooja-call.mp3',
        },
        {
          requestId: req.id,
          trainerName: 'Vikram Joshi',
          trainerSkills: 'Snowflake, SQL, Python',
          trainerPhone: '+91 98765 22222',
          trainerEmail: 'vikram@trainer.com',
          rateInr: 1100,
          experienceYears: 6,
          notes: 'Strong on data warehousing fundamentals. Mornings IST.',
          proposedById: 'u-aman',
          proposedAt: addDays(today, -1),
          verification: 'Pending',
          confirmationKind: ConfirmationKind.Screenshot,
          confirmationUrl: '/uploads/demo-vikram-wa.png',
          skillMatrixUrl: '/uploads/demo-vikram-skills.pdf',
        },
        {
          requestId: req.id,
          trainerId: 't-rakesh',
          rateInr: 1500,
          experienceYears: 10,
          notes: 'Existing pool — Rakesh has Snowflake background too. Premium rate.',
          proposedById: 'u-aman',
          proposedAt: addDays(today, -1),
          verification: 'Pending',
          confirmationKind: ConfirmationKind.Audio,
          confirmationUrl: '/uploads/demo-rakesh-call.mp3',
        },
      ],
    });
  }

  // ----- Payments for the paid clients -----
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
  }

  // ----- Tasks (sessions) for active clients -----
  const activeClients = await prisma.client.findMany({ where: { lifecycle: 'Active' } });
  for (const c of activeClients) {
    if (!c.primaryTrainerId || !c.hostOwnerId) continue;
    // Yesterday's session — done + logged
    const tDone = await prisma.task.create({
      data: {
        clientId: c.id,
        ownerId: c.hostOwnerId,
        trainerId: c.primaryTrainerId,
        title: `Session ${c.preferredTimeIst} IST`,
        dueDate: addDays(today, -1),
        type: 'SESSION',
        priority: 'Normal',
        estimatedHours: 1,
        engagementRateInr: c.engagementTrainerRateInr,
        status: 'Done',
        completedAt: addDays(today, -1),
      },
    });
    await prisma.sessionLog.create({
      data: {
        trainerId: c.primaryTrainerId,
        clientId: c.id,
        date: addDays(today, -1),
        hours: 1,
        rateSnapshot: c.engagementTrainerRateInr,
        rateModel: 'hourly',
        amountInr: c.engagementTrainerRateInr,
        status: 'Logged',
        taskId: tDone.id,
      },
    });
    // Today's session — pending
    await prisma.task.create({
      data: {
        clientId: c.id,
        ownerId: c.hostOwnerId,
        trainerId: c.primaryTrainerId,
        title: `Session ${c.preferredTimeIst} IST`,
        dueDate: today,
        type: 'SESSION',
        priority: 'Normal',
        estimatedHours: 1,
        engagementRateInr: c.engagementTrainerRateInr,
      },
    });
  }

  // ----- A leverage request pending Vaibhav -----
  const someActive = activeClients[0];
  if (someActive) {
    await prisma.leverageRequest.create({
      data: {
        clientId: someActive.id,
        daysRequested: 5,
        reasonStated: 'Trainer travelling next week.',
        newCommittedDate: addDays(today, 5),
        status: 'PendingVaibhav',
      },
    });
  }

  // ----- A few raw leads waiting cleanup -----
  await prisma.rawLead.createMany({
    data: [
      { raw: 'Tarun Mehta 9876512345 needs salesforce', status: 'Pending' },
      { raw: 'Came across a guy: +1 555 444 3322 — Java + AWS, looking for 6 months', status: 'Pending' },
      { raw: 'priya@example.com / iOS Swift / from referral', status: 'Pending' },
    ],
  });

  // ----- Summary -----
  const counts = {
    clients: await prisma.client.count(),
    sourcingOpen: await prisma.sourcingRequest.count({ where: { status: 'Open' } }),
    sourcingProposed: await prisma.sourcingRequest.count({ where: { status: 'Proposed' } }),
    proposals: await prisma.proposal.count(),
    payments: await prisma.payment.count(),
    tasks: await prisma.task.count(),
    sessionLogs: await prisma.sessionLog.count(),
    leverage: await prisma.leverageRequest.count(),
    rawLeads: await prisma.rawLead.count(),
  };
  console.log('✓ Demo data reseeded.');
  console.log(counts);
  console.log('\nLog in as anjali@mits.local / password123 to see the kanban with one client at every stage.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
