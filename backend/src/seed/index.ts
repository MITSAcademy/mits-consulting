import 'dotenv/config';
import { PrismaClient, Role, Lifecycle, EngagementType, Currency, PaymentModel, RateModel } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEAM = [
  { id: 'u-vaibhav',  name: 'Vaibhav Aggarwal',   email: 'vaibhav@mits.local',  role: 'founder' as Role,           reportsToId: null,        phone: '+91 99999 00001' },
  { id: 'u-samita',   name: 'Samita Gupta',       email: 'samita@mits.local',   role: 'demo_lead' as Role,         reportsToId: 'u-vaibhav', phone: '+91 73476 13659' },
  { id: 'u-anjali',   name: 'Anjali',             email: 'anjali@mits.local',   role: 'demo_intake' as Role,       reportsToId: 'u-samita',  phone: '+91 90566 77384' },
  { id: 'u-taran',    name: 'Taranpreet Kaur',    email: 'taran@mits.local',    role: 'demo_intake' as Role,       reportsToId: 'u-samita',  phone: '+91 70879 83742' },
  { id: 'u-aman',     name: 'Amandeep Kaur',      email: 'aman@mits.local',     role: 'recruiter' as Role,         reportsToId: 'u-vaibhav', phone: '+91 81460 16061' },
  { id: 'u-kanchan',  name: 'Kanchan Sharma',     email: 'kanchan@mits.local',  role: 'recruiter' as Role,         reportsToId: 'u-vaibhav', phone: '+91 76580 33316' },
  { id: 'u-roshni',   name: 'Roshni',             email: 'roshni@mits.local',   role: 'sales_closer' as Role,      reportsToId: 'u-vaibhav', phone: '+91 62835 05780' },
  { id: 'u-mitali',   name: 'Mitali',             email: 'mitali@mits.local',   role: 'manager' as Role,           reportsToId: 'u-vaibhav', phone: null },
  { id: 'u-bhavneet', name: 'Bhavneet',           email: 'bhavneet@mits.local', role: 'lead' as Role,              reportsToId: 'u-mitali',  phone: null },
  { id: 'u-kashish',  name: 'Kashish',            email: 'kashish@mits.local',  role: 'staff' as Role,             reportsToId: 'u-bhavneet',phone: null },
  { id: 'u-muskan',   name: 'Muskan',             email: 'muskan@mits.local',   role: 'staff' as Role,             reportsToId: 'u-bhavneet',phone: null },
  { id: 'u-areena',   name: 'Areena',             email: 'areena@mits.local',   role: 'accounts' as Role,          reportsToId: 'u-vaibhav', phone: null },
  { id: 'u-ashok',    name: 'Ashok ji',           email: 'ashok@mits.local',    role: 'accounts' as Role,          reportsToId: 'u-vaibhav', phone: null },
  { id: 'u-malika',   name: 'Malika',             email: 'malika@mits.local',   role: 'payment_processor' as Role, reportsToId: 'u-vaibhav', phone: null },
];

const BANK_ACCOUNTS = [
  { id: 'b-hdfc-mits-anupama', label: 'HDFC · MITS Anupama (Current)', bank: 'HDFC', last4: '6639' },
  { id: 'b-hdfc-anupama', label: 'HDFC · Anupama (Saving)', bank: 'HDFC', last4: '8039' },
  { id: 'b-hdfc-shakti', label: 'HDFC · Shakti (Saving)', bank: 'HDFC', last4: '2550' },
  { id: 'b-cbi-anupama', label: 'CBI · Anupama (Saving)', bank: 'CBI', last4: '1440' },
  { id: 'b-cbi-anupama-shakti', label: 'CBI · Anupama+Shakti (Saving)', bank: 'CBI', last4: '7420' },
  { id: 'b-cbi-shakti-rc', label: 'CBI · Shakti RC', bank: 'CBI', last4: '7044' },
  { id: 'b-cbi-shakti-sav', label: 'CBI · Shakti (Saving)', bank: 'CBI', last4: '6243' },
  { id: 'b-cbi-shakti-steel', label: 'CBI · Shakti Steel (Current)', bank: 'CBI', last4: '0267' },
  { id: 'b-cbi-mits-simple', label: 'CBI · Making IT Simplest', bank: 'CBI', last4: '6134' },
  { id: 'b-cbi-shivam', label: 'CBI · Shivam (Saving)', bank: 'CBI', last4: '3704' },
  { id: 'b-mits-pvt', label: 'MITS PVT LTD', bank: 'MITS', last4: '----' },
  { id: 'b-vaibhav-sbi', label: 'Vaibhav · SBI', bank: 'SBI', last4: '----' },
  { id: 'b-zelle', label: 'Zelle (US)', bank: 'Zelle', last4: 'USD' },
];

const PARTNERS = [
  { id: 'p-collaborate', name: 'Collaborate Solutions', contact: 'Rita @ Collaborate', email: 'rita@collaborate.com', phone: '+91 80000 12345', billingCycle: 'Monthly bulk', paymentTerms: 'Net 30 to 60', notes: 'Bulk training contracts.' },
  { id: 'p-technumen', name: 'Technumen', contact: 'Vikram @ Technumen', email: 'vikram@technumen.com', phone: '+91 80000 12346', billingCycle: 'Per engagement', paymentTerms: 'Net 45', notes: 'Salesforce training.' },
  { id: 'p-gforce', name: 'G-Force', contact: 'Suresh @ G-Force', email: 'suresh@gforce.com', phone: '+91 80000 12347', billingCycle: 'Per engagement', paymentTerms: 'Net 30', notes: '' },
  { id: 'p-sforce', name: 'Sforce', contact: 'Anil @ Sforce', email: 'anil@sforce.com', phone: '+91 80000 12348', billingCycle: 'Per engagement', paymentTerms: 'Net 45', notes: 'ServiceNow training.' },
];

const TRAINERS = [
  { id: 't-anand', name: 'Anand Rao', email: 'anand@trainer.com', phoneCode: '+91', phoneDigits: '9876543210', rateModel: 'hourly' as RateModel, defaultRateInr: 800, paymentMethod: 'UPI', upiId: 'anand@okhdfcbank', skills: 'Java, Spring Boot, Microservices', experienceYears: 8, recruitedById: 'u-aman' },
  { id: 't-kiran', name: 'Kiran Reddy', email: 'kiran@trainer.com', phoneCode: '+91', phoneDigits: '9876543211', rateModel: 'per_session' as RateModel, defaultRateInr: 1200, paymentMethod: 'Bank', bankAccount: 'XXXX1234', skills: 'AWS, DevOps, Kubernetes', experienceYears: 6, recruitedById: 'u-aman' },
  { id: 't-sneha', name: 'Sneha Iyer', email: 'sneha@trainer.com', phoneCode: '+91', phoneDigits: '9876543212', rateModel: 'hourly' as RateModel, defaultRateInr: 1000, paymentMethod: 'UPI', upiId: 'sneha@okicici', skills: 'React, Node.js, TypeScript', experienceYears: 5, recruitedById: 'u-kanchan' },
  { id: 't-rakesh', name: 'Rakesh Verma', email: 'rakesh@trainer.com', phoneCode: '+91', phoneDigits: '9876543213', rateModel: 'per_session' as RateModel, defaultRateInr: 1500, paymentMethod: 'UPI', upiId: 'rakesh@oksbi', skills: 'Python, ML, AI, NLP', experienceYears: 10, recruitedById: 'u-kanchan' },
  { id: 't-priya', name: 'Priya Nair', email: 'priyan@trainer.com', phoneCode: '+91', phoneDigits: '9876543214', rateModel: 'hourly' as RateModel, defaultRateInr: 1100, paymentMethod: 'UPI', upiId: 'priyan@oksbi', skills: 'Salesforce, ServiceNow', experienceYears: 7, recruitedById: 'u-aman' },
  { id: 't-aditya', name: 'Aditya Mehta', email: 'aditya@trainer.com', phoneCode: '+91', phoneDigits: '9876543215', rateModel: 'hourly' as RateModel, defaultRateInr: 900, paymentMethod: 'UPI', upiId: 'aditya@oksbi', skills: 'Cybersecurity, Network', experienceYears: 6, recruitedById: 'u-kanchan' },
];

const TRAINER_LEADS = [
  { name: 'Sanjana Kumari', skills: 'Data Engineering, Spark, Snowflake', source: 'LinkedIn', expectedRateInr: 1100, stage: 'Contacted', recruiterId: 'u-aman', notes: 'Open to part-time, 3 yrs Snowflake exp.' },
  { name: 'Karthik Bhat', skills: 'iOS, Swift, SwiftUI', source: 'Naukri', expectedRateInr: 1300, stage: 'Vetting', recruiterId: 'u-kanchan', notes: 'Has trial scheduled.' },
  { name: 'Meera Joshi', skills: '.NET, C#, Azure', source: 'Referral', expectedRateInr: 900, stage: 'New', recruiterId: 'u-aman', notes: '' },
];

const SOURCES = [
  'Mytabtech', 'Anuradha', 'Reva', 'Reva Mehrotra', 'Mamta Aggarwal',
  'Anupama Aggarwal', 'Shakti Kumar Aggarwal', 'Thiru',
  'LinkedIn', 'Direct referral', 'Collaborate', 'Technumen', 'G-Force', 'Sforce',
];

const TEMPLATES = [
  { id: 'tpl-intake', kind: 'WhatsApp', stage: 'Lead', name: 'Intake form request', subject: '', body: `Hi Dear,\nGreetings from MITS Solution\nThanks for showing interest with us !!\nI would like some details from you to take up your demo to next steps:-\n1) Detailed skill set:-\n2) Any current priority task:-\n3) Email id:-\n4) Available timing for Demo call in IST ( Morning and Evening both):-\n5) Preferred Session timing in IST (Once we get started):-\n6) Specific Trainer Experience/Preference (if any):-\n7) Open to connect with zoom/webex (if not,recommened?):-\n8) Anything additional you want :-`, variables: ['{{client_name}}'] },
  { id: 'tpl-demo-confirm', kind: 'Email', stage: 'DemoScheduled', name: 'Demo confirmation', subject: 'MITS Demo confirmed — {{demo_date}} {{demo_time}} IST', body: 'Hi {{client_name}},\n\nConfirming your demo with our trainer {{trainer_name}} on {{demo_date}} at {{demo_time}} IST.\n\nSkills covered: {{skills}}\nMeeting link: {{meeting_link}}\n\nLooking forward to connecting.\n\nBest,\nMITS Solution', variables: ['{{client_name}}','{{trainer_name}}','{{demo_date}}','{{demo_time}}','{{skills}}','{{meeting_link}}'] },
  { id: 'tpl-engagement', kind: 'Email', stage: 'SaleClosing', name: 'Engagement letter', subject: 'MITS Engagement — {{package}} for {{client_name}}', body: 'Hi {{client_name}},\n\nThank you for choosing MITS Solution.\n\nPackage:        {{package}}\nSessions/cycle: {{sessions}}\nCycle amount:   {{currency}} {{amount}}\nTrainer:        {{trainer_name}}\n\nBest,\nMITS Solution', variables: ['{{client_name}}','{{package}}','{{sessions}}','{{currency}}','{{amount}}','{{trainer_name}}'] },
];

const REAL_CLIENTS = [
  { name: 'Apporva saurab', amount: 600, p1: '2026-05-12', p2: '2026-05-27', acct: 'b-hdfc-mits-anupama', source: 'Mytabtech', phone: '+19407581572', skill: 'Java, Spring Boot' },
  { name: 'Nizam', amount: 600, p1: '2026-05-12', p2: '2026-05-27', acct: 'b-hdfc-mits-anupama', source: 'Mytabtech', phone: '+18722034175', skill: 'AWS DevOps' },
  { name: 'Nikhita', amount: 650, p1: '2026-05-13', p2: '2026-05-28', acct: 'b-hdfc-anupama', source: 'Anuradha', phone: '+19132387107', skill: 'React, Node.js' },
  { name: 'Richie', amount: 650, p1: '2026-05-13', p2: '2026-05-20', acct: 'b-cbi-anupama', source: 'Reva', phone: '+15513587447', skill: 'Python ML', oneweek: true },
  { name: 'Dinesh', amount: 650, p1: '2026-05-14', p2: '2026-05-29', acct: 'b-hdfc-mits-anupama', source: 'Mytabtech', phone: '+18607968190', skill: 'Salesforce' },
  { name: 'Navya', amount: 250, p1: '2026-05-15', p2: '', acct: 'b-mits-pvt', source: 'Direct referral', phone: '+18135935304', skill: 'Manual Testing' },
  { name: 'Nitesh', amount: 650, p1: '2026-05-15', p2: '2026-05-30', acct: 'b-mits-pvt', source: 'Direct referral', phone: '+18135286162', skill: 'Cybersecurity' },
  { name: 'Pranathi', amount: 600, p1: '2026-05-15', p2: '2026-05-30', acct: 'b-hdfc-mits-anupama', source: 'Mytabtech', phone: '+12245870785', skill: 'Java' },
  { name: 'Training Python Ram', amount: 400, p1: '2026-05-15', p2: '2026-05-30', acct: 'b-mits-pvt', source: 'Thiru', phone: '+19044347258', skill: 'Python', engagement: 'Training' as const },
  { name: 'Priyanka shivansh', amount: 650, p1: '2026-05-16', p2: '2026-05-31', acct: 'b-hdfc-anupama', source: 'Anuradha', phone: '+919440133363', skill: 'Java' },
  { name: 'Ramya Cerner', amount: 550, p1: '2026-05-16', p2: '', acct: 'b-mits-pvt', source: 'Direct referral', phone: '+18137169143', skill: 'Cerner', pendingVaibhav: true },
  { name: 'Surya', amount: 600, p1: '2026-05-16', p2: '2026-05-31', acct: 'b-hdfc-mits-anupama', source: 'Mytabtech', phone: '+919949499850', skill: 'Java' },
  { name: 'Uteej', amount: 900, p1: '2026-05-17', p2: '2026-06-01', acct: 'b-hdfc-anupama', source: 'Anuradha', phone: '+12065048951', skill: 'AWS' },
  { name: 'Bhargavi', amount: 700, p1: '2026-05-19', p2: '2026-05-26', acct: 'b-hdfc-anupama', source: 'Anuradha', phone: '+17797752785', skill: 'Salesforce', oneweek: true },
  { name: 'Saiteja', amount: 550, p1: '2026-05-20', p2: '2026-06-03', acct: 'b-hdfc-anupama', source: 'Anuradha', phone: '+16605288623', skill: 'DevOps' },
  { name: 'Neeshma', amount: 650, p1: '2026-05-20', p2: '2026-06-03', acct: 'b-hdfc-mits-anupama', source: 'Mytabtech', phone: '+18167567383', skill: 'Java' },
  { name: 'Rahul', amount: 700, p1: '2026-05-20', p2: '2026-06-03', acct: 'b-hdfc-mits-anupama', source: 'Mytabtech', phone: '+13093636414', skill: 'Python ML' },
  { name: 'Yaswanth', amount: 700, p1: '2026-05-20', p2: '2026-06-03', acct: 'b-hdfc-mits-anupama', source: 'Mytabtech', phone: '+15128156436', skill: 'Java' },
  { name: 'Naveena', amount: 650, p1: '2026-05-22', p2: '2026-06-06', acct: 'b-hdfc-mits-anupama', source: 'Mytabtech', phone: '+14709202814', skill: 'React, Node.js' },
  { name: 'Manoj', amount: 750, p1: '2026-05-27', p2: '2026-06-10', acct: 'b-cbi-anupama', source: 'Reva Mehrotra', phone: '+19735687089', skill: 'Java' },
  { name: 'Raja', amount: 900, p1: '2026-06-11', p2: '', acct: 'b-cbi-shakti-rc', source: 'Shakti Kumar Aggarwal', phone: '+16478609409', skill: 'AWS', currency: 'CAD' as const },
  // Pipeline preview
  { name: 'Karthik (new lead)', amount: 0, p1: '', p2: '', acct: 'b-mits-pvt', source: 'LinkedIn', phone: '+15125550101', skill: 'Java backend', stage: 'Lead' as Lifecycle },
  { name: 'Riya (intake sent)', amount: 0, p1: '', p2: '', acct: 'b-mits-pvt', source: 'LinkedIn', phone: '+15125550102', skill: '', stage: 'IntakeSent' as Lifecycle },
  { name: 'Vivek (intake done)', amount: 0, p1: '', p2: '', acct: 'b-mits-pvt', source: 'Direct referral', phone: '+15125550103', skill: 'Salesforce', stage: 'IntakeReceived' as Lifecycle },
  { name: 'Priyanka (with recruiters)', amount: 0, p1: '', p2: '', acct: 'b-mits-pvt', source: 'Direct referral', phone: '+15125550104', skill: 'iOS Swift', stage: 'WithRecruiters' as Lifecycle },
  { name: 'Asha (awaiting verification)', amount: 0, p1: '', p2: '', acct: 'b-mits-pvt', source: 'LinkedIn', phone: '+15125550105', skill: 'Snowflake', stage: 'VerificationPending' as Lifecycle },
  { name: 'Shalini Control Eng', amount: 0, p1: '', p2: '', acct: 'b-hdfc-mits-anupama', source: 'Mytabtech', phone: '+918464080186', skill: 'Control Engineering', stage: 'SaleClosing' as Lifecycle, engagement: 'Training' as const },
];

function inferModel(amount: number, p1: string, p2: string, oneweek?: boolean): PaymentModel {
  if (oneweek) return 'Weekly';
  if (!p1 || !p2) return 'BiWeekly';
  const d = (+new Date(p2) - +new Date(p1)) / (1000 * 60 * 60 * 24);
  if (d <= 8) return 'Weekly';
  if (d <= 18) return 'BiWeekly';
  return 'Monthly';
}

function sessionsFor(m: PaymentModel) {
  return m === 'Weekly' ? 5 : m === 'BiWeekly' ? 10 : 20;
}

function addDays(iso: string, n: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log('Seeding MITS database…');
  const password = await bcrypt.hash('password123', 10);

  // Users
  for (const u of TEAM) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { name: u.name, email: u.email, role: u.role, reportsToId: u.reportsToId || null, active: true },
      create: { id: u.id, name: u.name, email: u.email, passwordHash: password, role: u.role, reportsToId: u.reportsToId || null },
    });
  }

  // Banks
  for (const b of BANK_ACCOUNTS) {
    await prisma.bankAccount.upsert({ where: { id: b.id }, update: b, create: b });
  }

  // Partners
  for (const p of PARTNERS) {
    await prisma.partner.upsert({ where: { id: p.id }, update: p, create: p });
  }

  // Trainers
  for (const t of TRAINERS) {
    await prisma.trainer.upsert({ where: { id: t.id }, update: t, create: t });
  }

  // Trainer leads
  for (const l of TRAINER_LEADS) {
    const exists = await prisma.trainerLead.findFirst({ where: { name: l.name } });
    if (!exists) await prisma.trainerLead.create({ data: l });
  }

  // Lead sources
  for (const name of SOURCES) {
    await prisma.leadSource.upsert({ where: { name }, update: {}, create: { name } });
  }

  // Templates
  for (const t of TEMPLATES) {
    await prisma.emailTemplate.upsert({ where: { id: t.id }, update: t as any, create: t as any });
  }

  // Feature flags
  const FLAGS = {
    phase_two_enabled: false,
    whatsapp_integration: true,
    daily_reporting: true,
    verification_gate: true,
    audit_log_visible: true,
    payment_access_restricted: true,
    multi_trainer_proposals: true,
    bulk_upload_structured: true,
    bulk_upload_raw: true,
    email_templates: true,
    phone_validation: true,
    whatsapp_group_preferred: true,
    configurable_lead_sources: true,
    strict_edit_permissions: true,
    edit_request_flow: true,
  };
  for (const [k, v] of Object.entries(FLAGS)) {
    await prisma.featureFlag.upsert({ where: { key: k }, update: { value: v }, create: { key: k, value: v } });
  }

  // Clients
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < REAL_CLIENTS.length; i++) {
    const rc = REAL_CLIENTS[i];
    const eng = (rc.engagement || 'Support') as EngagementType;
    const model = inferModel(rc.amount, rc.p1, rc.p2, (rc as any).oneweek);
    const currency = ((rc as any).currency || 'USD') as Currency;
    const stage = ((rc as any).stage || (rc.p1 ? 'Active' : 'Lead')) as Lifecycle;
    const cycleStart = rc.p1 || null;
    const cycleEnd = rc.p2 || (rc.p1 ? addDays(rc.p1, model === 'Weekly' ? 6 : model === 'BiWeekly' ? 13 : 27) : null);
    const sessions = sessionsFor(model);
    const used = stage === 'Active' ? Math.floor(Math.random() * sessions) : 0;
    const risk = used >= sessions - 1 && stage === 'Active' ? 'Amber' : 'Green';

    const id = 'c-' + i + '-' + rc.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 10);
    const exists = await prisma.client.findUnique({ where: { id } });
    if (exists) continue;

    await prisma.client.create({
      data: {
        id,
        name: rc.name,
        phoneCode: rc.phone.startsWith('+91') ? '+91' : '+1',
        phoneDigits: rc.phone.replace(/[^0-9]/g, '').slice(rc.phone.startsWith('+91') ? 2 : 1),
        whatsappGroupName: `${rc.name} - ${rc.skill?.split(',')[0]?.trim() || 'MITS'} - Group`,
        country: currency === 'CAD' ? 'CA' : 'US',
        engagementType: eng,
        paymentModel: eng === 'Support' ? model : null,
        currency,
        cycleAmount: rc.amount || 0,
        lifecycle: stage,
        funderType: 'Self',
        source: rc.source,
        leadOwnerId: 'u-vaibhav',
        intakeOwnerId: ['SaleClosing', 'SaleWon', 'Active', 'LeverageGranted', 'Hold', 'Completed', 'Churned'].includes(stage) ? null : (i % 2 === 0 ? 'u-anjali' : 'u-taran'),
        salesOwnerId: ['SaleClosing', 'SaleWon', 'Active', 'LeverageGranted'].includes(stage) ? 'u-roshni' : null,
        hostOwnerId: stage === 'Active' ? (i % 2 === 0 ? 'u-kashish' : 'u-muskan') : null,
        primaryTrainerId: stage === 'Active' ? ['t-anand', 't-sneha', 't-rakesh', 't-priya', 't-kiran', 't-aditya'][i % 6] : null,
        engagementTrainerRateInr: stage === 'Active' ? [800, 1000, 1500, 1100, 1200, 900][i % 6] : 0,
        preferredTimeIst: '09:00',
        feedbackDay: ['Wednesday', 'Thursday', 'Friday'][i % 3],
        bankAccountId: rc.acct,
        accountNameRaw: rc.source,
        freshPaymentReceived: !!rc.p1,
        freshPaymentDate: rc.p1 || null,
        freshPaymentAmount: rc.p1 ? rc.amount : 0,
        cycleStart, cycleEnd,
        nextRenewalDue: rc.p2 || null,
        sessionsPerCycle: sessions,
        sessionsUsed: used,
        churnRisk: risk,
        paymentPendingVaibhav: !!(rc as any).pendingVaibhav,
        pendingVaibhavSince: (rc as any).pendingVaibhav ? today : null,
        intakeSkillHint: rc.skill || null,
        intakeData: rc.skill ? {
          detailed_skill_set: rc.skill,
          current_priority_task: 'Has a project review in 2 weeks',
          client_email: `${rc.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8)}@example.com`,
          demo_timing_ist: 'Morning 9-11 IST or Evening 7-9 IST',
          session_timing_ist: '9 AM IST Mon-Fri',
        } : undefined,
      },
    });
  }

  // Create payments for clients with fresh payments
  const clients = await prisma.client.findMany({ where: { freshPaymentReceived: true } });
  for (const c of clients) {
    const existing = await prisma.payment.findFirst({ where: { clientId: c.id } });
    if (existing) continue;
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

  // Tasks for active clients
  const actives = await prisma.client.findMany({ where: { lifecycle: 'Active' }, take: 8 });
  for (const c of actives) {
    const existing = await prisma.task.findFirst({ where: { clientId: c.id } });
    if (existing) continue;
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

  console.log('✓ Seed complete.');
  console.log('Login with any user email (e.g. vaibhav@mits.local) and password: password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
