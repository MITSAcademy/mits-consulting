/**
 * Seed RegularTraining records from the Bhavneet sheet.
 * Run: npx tsx scripts/seedRegularTrainings.ts
 *
 * - Creates or updates Client records (upsert by name)
 * - Creates or updates Trainer records (upsert by name)
 * - Creates RegularTraining linking them, assigned to Kashish or Muskan
 *   based on the sheet grouping (rows 2-27 = Kashish, rows 28-53 = Muskan,
 *   row 2 Training Virtual = Bhavneet)
 * - Skips rows where trainer is "not confirmed"
 * - Phone formatting: trainers → +91, clients → +1 (US/Canada) or +91 (India)
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ── helpers ────────────────────────────────────────────────────────────────

function fmtClientPhone(raw: string | null): { code: string; digits: string } | null {
  if (!raw) return null;
  const s = raw.replace(/\D/g, '');
  if (!s) return null;
  // Indian numbers: starts with 91 (12 digits) or is exactly 10 digits starting 6-9
  if (s.length === 12 && s.startsWith('91')) return { code: '+91', digits: s.slice(2) };
  if (s.length === 10 && /^[6-9]/.test(s)) return { code: '+91', digits: s };
  // US/Canada: 11 digits starting with 1, or 10 digits
  if (s.length === 11 && s.startsWith('1')) return { code: '+1', digits: s.slice(1) };
  if (s.length === 10 && /^[2-9]/.test(s)) return { code: '+1', digits: s };
  // fallback: treat as US 10-digit (take last 10)
  return { code: '+1', digits: s.slice(-10) };
}

function fmtTrainerPhone(raw: string | null): { code: string; digits: string } | null {
  if (!raw) return null;
  // Some rows have two numbers separated by /
  const first = raw.split('/')[0].trim();
  const s = first.replace(/\D/g, '');
  if (!s) return null;
  if (s.length === 12 && s.startsWith('91')) return { code: '+91', digits: s.slice(2) };
  if (s.length === 10) return { code: '+91', digits: s };
  return { code: '+91', digits: s.slice(-10) };
}

// ── data ───────────────────────────────────────────────────────────────────

const RAW: Array<{
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  trainerName: string;
  trainerPhone: string;
  host: 'Kashish' | 'Muskan' | 'Bhavneet';
  timeIst: string;
  skill: string;
}> = [
  // ── Bhavneet ──
  { clientName: 'Training Virtual Employees', clientPhone: '', clientEmail: '', trainerName: 'Virtual Employees', trainerPhone: '', host: 'Bhavneet', timeIst: '08:00', skill: 'Virtual' },

  // ── Kashish ──
  { clientName: 'Manoj',              clientPhone: '19735687089', clientEmail: 'manuedu5054@gmail.com',        trainerName: 'Akram',         trainerPhone: '6394957133',  host: 'Kashish', timeIst: '08:00', skill: '' },
  { clientName: 'Dinesh',             clientPhone: '18607968190', clientEmail: 'dkarant90@gmail.com',          trainerName: 'Rahul N',       trainerPhone: '9514334594',  host: 'Kashish', timeIst: '08:00', skill: '' },
  { clientName: 'Harpreet',           clientPhone: '91999962413', clientEmail: 'karan.preet@aol.com',          trainerName: 'Abdul',         trainerPhone: '9866441587',  host: 'Kashish', timeIst: '20:00', skill: '' },
  { clientName: 'Venkat',             clientPhone: '91993272035', clientEmail: 'balta.venkatesh@gmail.com',    trainerName: 'Rahul Jasiwal', trainerPhone: '939844607',   host: 'Kashish', timeIst: '08:00', skill: '' },
  { clientName: 'Priya',              clientPhone: '16144038079', clientEmail: 'mpriyadharshini92@gmail.com',  trainerName: 'Chandra',       trainerPhone: '9182113854',  host: 'Kashish', timeIst: '16:30', skill: '' },
  { clientName: 'Krishna',            clientPhone: '12014486700', clientEmail: 'kuruhanuma@gmail.com',         trainerName: 'Suresh',        trainerPhone: '9087914819',  host: 'Kashish', timeIst: '07:00', skill: '' },
  { clientName: 'Kavitha',            clientPhone: '18723303776', clientEmail: 'kavi64050@gmail.com',          trainerName: 'Gautham',       trainerPhone: '8075196292',  host: 'Kashish', timeIst: '08:00', skill: '' },
  { clientName: 'Vinith',             clientPhone: '18046375396', clientEmail: 'vroy3006.sfg@gmail.com',       trainerName: 'Ayush',         trainerPhone: '8448050455',  host: 'Kashish', timeIst: '06:30', skill: '' },
  { clientName: 'Rohit',              clientPhone: '19014384138', clientEmail: 'rohit.gadugu92@gmail.com',     trainerName: 'Arnoald',       trainerPhone: '8248072423',  host: 'Kashish', timeIst: '12:30', skill: '' },
  { clientName: 'Jahnavi',            clientPhone: '18138935528', clientEmail: 'jahnavidasari28@gmail.com',    trainerName: 'Pramil',        trainerPhone: '7755902019',  host: 'Kashish', timeIst: '08:30', skill: '' },
  { clientName: 'Priyanka',           clientPhone: '919440133363',clientEmail: 'priyankadantulu94@gmail.com', trainerName: 'Shivansh',      trainerPhone: '6394906234',  host: 'Kashish', timeIst: '10:30', skill: '' },
  { clientName: 'Surya',              clientPhone: '919994499850',clientEmail: 'suryasimha.chintha@gmail.com',trainerName: 'Omkar',         trainerPhone: '7776902859',  host: 'Kashish', timeIst: '08:00', skill: '' },
  { clientName: 'Shruthi',            clientPhone: '16185270107', clientEmail: 'jshruthi97@gmail.com',         trainerName: 'Bhupendra',     trainerPhone: '9987218936',  host: 'Kashish', timeIst: '20:00', skill: '' },
  { clientName: 'Rahul',              clientPhone: '13093636414', clientEmail: 'rahul122087@gmail.com',        trainerName: 'Abhilash',      trainerPhone: '8378877766',  host: 'Kashish', timeIst: '22:00', skill: '' },
  { clientName: 'Yaswanth',           clientPhone: '15128156436', clientEmail: 'yeshwanth.reddy166@gmail.com',trainerName: 'Niwaz',         trainerPhone: '6264904912',  host: 'Kashish', timeIst: '09:00', skill: '' },
  { clientName: 'Naveena',            clientPhone: '14709022814', clientEmail: 'sunatangella@gmail.com',       trainerName: 'Aniket',        trainerPhone: '8468950846',  host: 'Kashish', timeIst: '21:30', skill: '' },
  { clientName: 'Sujit',              clientPhone: '18175280757', clientEmail: 'msujithmedha22@gmail.com',     trainerName: 'Vetri',         trainerPhone: '8610087749',  host: 'Kashish', timeIst: '18:00', skill: '' },
  { clientName: 'Asghar Jadhav',      clientPhone: '17175712932', clientEmail: 'asgharmac@gmail.com',          trainerName: 'Phanideep',     trainerPhone: '8328663598',  host: 'Kashish', timeIst: '20:00', skill: '' },
  { clientName: 'Nikhil',             clientPhone: '16095408222', clientEmail: 'nikhilreddy.t1405@gmail.com', trainerName: 'Raj',           trainerPhone: '8828129141',  host: 'Kashish', timeIst: '08:00', skill: '' },
  { clientName: 'Teju',               clientPhone: '17326721493', clientEmail: 'tejaswinipenchala@gmail.com', trainerName: 'Kishant',       trainerPhone: '9087070125',  host: 'Kashish', timeIst: '08:00', skill: '' },
  { clientName: 'Satvik',             clientPhone: '18453770580', clientEmail: 'satvikmallempudi196@gmail.com',trainerName: 'Arun/Anand',   trainerPhone: '7338165435',  host: 'Kashish', timeIst: '19:30', skill: '' },
  { clientName: 'Ambika',             clientPhone: '18453200044', clientEmail: 'ambika.bathini@gmail.com',     trainerName: 'Muthu',         trainerPhone: '9894998892',  host: 'Kashish', timeIst: '07:30', skill: '' },
  { clientName: 'Sravya',             clientPhone: '16129878685', clientEmail: 'sravya2331@gmail.com',         trainerName: 'Durga',         trainerPhone: '9491335145',  host: 'Kashish', timeIst: '14:30', skill: '' },
  { clientName: 'Deepthi',            clientPhone: '19085651255', clientEmail: 'deeptikollu7@gmail.com',       trainerName: 'Karthik',       trainerPhone: '814330543',   host: 'Kashish', timeIst: '07:00', skill: '' },
  { clientName: 'Sathvik',            clientPhone: '12106268596', clientEmail: 'sathvireddy1210@gmail.com',    trainerName: 'Peet',          trainerPhone: '6290949166',  host: 'Kashish', timeIst: '09:00', skill: '' },
  { clientName: 'Ram',                clientPhone: '14947342758', clientEmail: 'ramkidec11@gmail.com',         trainerName: 'Sachin',        trainerPhone: '8668833919',  host: 'Kashish', timeIst: '08:00', skill: '' },
  { clientName: 'Abhi',               clientPhone: '19029826324', clientEmail: 'avajinapelli@gmail.com',       trainerName: 'Jagdeesh',      trainerPhone: '8328682105',  host: 'Kashish', timeIst: '08:00', skill: '' },
  { clientName: 'Nikhil (Arun)',      clientPhone: '12035331095', clientEmail: 'nikhil.t1405@gmail.com',       trainerName: 'Arun',          trainerPhone: '8143290149',  host: 'Kashish', timeIst: '06:30', skill: '' },
  { clientName: 'Ooha',               clientPhone: '14016668469', clientEmail: 'oohasi234@gmail.com',          trainerName: 'Akram',         trainerPhone: '6394957133',  host: 'Kashish', timeIst: '06:30', skill: '' },
  { clientName: 'Rehman',             clientPhone: '18173669398', clientEmail: 'rehaman.theaman@gmail.com',    trainerName: 'Usha',          trainerPhone: '6360248947',  host: 'Kashish', timeIst: '08:00', skill: '' },
  { clientName: 'Sunny',              clientPhone: '12815094456', clientEmail: 'dasarishirish@gmail.com',      trainerName: 'Saroj',         trainerPhone: '',            host: 'Kashish', timeIst: '07:00', skill: '' },
  { clientName: 'Training Shalini',   clientPhone: '918464080186',clientEmail: 'shalini123.dl@gmail.com',     trainerName: 'Manoj',         trainerPhone: '8074834527',  host: 'Kashish', timeIst: '05:30', skill: 'PCL Scada' },
  { clientName: 'Training Ashish',    clientPhone: '17035777326', clientEmail: 'aashish.palla@gmail.com',      trainerName: 'Ayush',         trainerPhone: '9111132565',  host: 'Kashish', timeIst: '08:00', skill: 'Salesforce' },
  { clientName: 'Yashwanthi',         clientPhone: '15139969723', clientEmail: 'yashwanthiky@gmail.com',       trainerName: 'Nikhil',        trainerPhone: '7978725393',  host: 'Kashish', timeIst: '09:00', skill: '' },

  // ── Muskan ──
  { clientName: 'Akhil',              clientPhone: '13094397619', clientEmail: 'akhilsai9700547755@gmail.com', trainerName: 'Ayush',         trainerPhone: '8448050455',  host: 'Muskan',  timeIst: '07:00', skill: 'Salesforce CPQ' },
  { clientName: 'Bhargavi',           clientPhone: '17797752785', clientEmail: 'ramayabharghavi.ch@gmail.com', trainerName: 'Shravan',       trainerPhone: '8870065714',  host: 'Muskan',  timeIst: '06:00', skill: 'Data Engineer' },
  { clientName: 'Bipana',             clientPhone: '19727301042', clientEmail: 'bipana.dreamgirl.@gmail.com',  trainerName: 'Tushar',        trainerPhone: '97732231018', host: 'Muskan',  timeIst: '07:30', skill: 'Java React' },
  { clientName: 'Gayatri',            clientPhone: '16475327092', clientEmail: 'gayathri.anbarasu2@gmail.com', trainerName: 'Abdul',         trainerPhone: '9866441587',  host: 'Muskan',  timeIst: '07:00', skill: 'Networking' },
  { clientName: 'Harshitha',          clientPhone: '13145685154', clientEmail: 'Harshithakatalaваyi23@gmail.com',trainerName:'Ravi',         trainerPhone: '9871622692',  host: 'Muskan',  timeIst: '20:00', skill: 'iOS Developer' },
  { clientName: 'Mansa',              clientPhone: '12342815550', clientEmail: 'mansa.qa66@gmail.com',         trainerName: 'Samkit',        trainerPhone: '9691777815',  host: 'Muskan',  timeIst: '08:00', skill: 'Selenium' },
  { clientName: 'Meghana',            clientPhone: '19096835191', clientEmail: 'meghanavarayuri@gmail.com',    trainerName: 'Bhuvanesh',     trainerPhone: '8960914286',  host: 'Muskan',  timeIst: '06:00', skill: 'Java' },
  { clientName: 'Nagasri',            clientPhone: '19907519222', clientEmail: 'mnagasri0306@gmail.com',       trainerName: 'Sidharth',      trainerPhone: '7017603885',  host: 'Muskan',  timeIst: '08:00', skill: 'Java Backend' },
  { clientName: 'Pavitra',            clientPhone: '16043772462', clientEmail: 'pk.pavithra777@gmail.com',     trainerName: 'Tamil',         trainerPhone: '8939124684',  host: 'Muskan',  timeIst: '08:00', skill: 'Data Engineer' },
  { clientName: 'Raja',               clientPhone: '16478609409', clientEmail: 'gnsmrjrmn@gmail.com',          trainerName: 'Arun',          trainerPhone: '8143290149',  host: 'Muskan',  timeIst: '21:00', skill: 'Java' },
  { clientName: 'Ramya',              clientPhone: '18137169143', clientEmail: 'no email',                     trainerName: 'Manoj',         trainerPhone: '8074834527',  host: 'Muskan',  timeIst: '22:30', skill: 'Sage Reporting' },
  { clientName: 'Snehlata',           clientPhone: '919948989838',clientEmail: 'thalakantisneha@gmail.com',   trainerName: 'Virendra',      trainerPhone: '9545787470',  host: 'Muskan',  timeIst: '06:00', skill: 'Salesforce' },
  { clientName: 'Training Dinesh',    clientPhone: '14379894467', clientEmail: 'easygogeo1729@gmail.com',      trainerName: 'Prassana',      trainerPhone: '9944334767',  host: 'Muskan',  timeIst: '07:00', skill: 'AI Engineer' },
  { clientName: 'Training Sahil',     clientPhone: '15755171707', clientEmail: 'sahil.ghiyasi07@gmail.com',    trainerName: 'Shubham',       trainerPhone: '9839015625',  host: 'Muskan',  timeIst: '08:00', skill: 'Cybersecurity' },
  { clientName: 'Training Sandeep',   clientPhone: '14259613418', clientEmail: 'no email',                     trainerName: 'Sachin',        trainerPhone: '8668833919',  host: 'Muskan',  timeIst: '08:00', skill: 'Data Engineer' },
  { clientName: 'Training Vamshi',    clientPhone: '13146882876', clientEmail: 'muppaneni565143n@gmail.com',   trainerName: 'Peet',          trainerPhone: '6290949166',  host: 'Muskan',  timeIst: '09:00', skill: 'Data Engineer' },
];

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  // 1. Find host users
  const hosts = await prisma.user.findMany({
    where: { name: { in: ['Kashish', 'Muskan', 'Bhavneet'] } },
    select: { id: true, name: true },
  });
  const hostMap: Record<string, string> = {};
  for (const h of hosts) hostMap[h.name] = h.id;

  console.log('Host map:', hostMap);
  if (!hostMap['Kashish'] || !hostMap['Muskan']) {
    throw new Error('Could not find Kashish or Muskan in the users table. Make sure they are registered.');
  }

  let created = 0, skipped = 0;

  for (const row of RAW) {
    if (!row.trainerName || row.trainerName === 'not confirmed') { skipped++; continue; }

    const hostId = hostMap[row.host];
    if (!hostId) { console.warn(`No host found for ${row.host}, skipping ${row.clientName}`); skipped++; continue; }

    // ── Client ──
    const clientPhone = fmtClientPhone(row.clientPhone);
    const clientEmail = row.clientEmail && row.clientEmail !== 'no email' ? row.clientEmail.trim() : null;

    let client = await prisma.client.findFirst({
      where: { name: { equals: row.clientName, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!client) {
      client = await prisma.client.create({
        data: {
          name: row.clientName,
          email: clientEmail,
          phoneCode: clientPhone?.code || '+1',
          phoneDigits: clientPhone?.digits || null,
          lifecycle: 'Active',
          engagementType: 'Training',
          hostOwnerId: hostId,
        },
        select: { id: true },
      });
    } else {
      // Update phone/email if missing
      await prisma.client.update({
        where: { id: client.id },
        data: {
          ...(clientEmail ? { email: clientEmail } : {}),
          ...(clientPhone ? { phoneCode: clientPhone.code, phoneDigits: clientPhone.digits } : {}),
          lifecycle: 'Active',
          hostOwnerId: hostId,
        },
      });
    }

    // ── Trainer ──
    // Handle "Arun/Anand" — treat as first name
    const trainerNameClean = row.trainerName.split('/')[0].trim();
    const trainerPhone = fmtTrainerPhone(row.trainerPhone);

    let trainer = await prisma.trainer.findFirst({
      where: { name: { equals: trainerNameClean, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!trainer) {
      trainer = await prisma.trainer.create({
        data: {
          name: trainerNameClean,
          phoneCode: trainerPhone?.code || '+91',
          phoneDigits: trainerPhone?.digits || null,
          ...(row.skill ? { skills: row.skill } : {}),
        },
        select: { id: true },
      });
    } else if (trainerPhone?.digits) {
      await prisma.trainer.update({
        where: { id: trainer.id },
        data: { phoneCode: trainerPhone.code, phoneDigits: trainerPhone.digits },
      });
    }

    // ── RegularTraining ──
    const existing = await prisma.regularTraining.findFirst({
      where: { clientId: client.id, trainerId: trainer.id, status: 'active' },
      select: { id: true },
    });

    if (!existing) {
      await prisma.regularTraining.create({
        data: {
          name: `${row.clientName} · ${trainerNameClean}`,
          clientId: client.id,
          trainerId: trainer.id,
          hostedByDefaultId: hostId,
          meetingMode: 'Zoom',
          defaultTimeIst: row.timeIst,
          status: 'active',
          ...(row.skill ? { notes: row.skill } : {}),
        },
      });
      created++;
      console.log(`✓ ${row.clientName} ← ${trainerNameClean} (${row.host}, ${row.timeIst})`);
    } else {
      // Update time + host if already exists
      await prisma.regularTraining.update({
        where: { id: existing.id },
        data: { defaultTimeIst: row.timeIst, hostedByDefaultId: hostId },
      });
      console.log(`↺ ${row.clientName} ← ${trainerNameClean} (updated)`);
      created++;
    }
  }

  console.log(`\nDone. ${created} trainings created/updated, ${skipped} skipped.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
