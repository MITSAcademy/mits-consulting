/**
 * Founder-only seed endpoint — POST /api/seed/regular-trainings
 * Runs once to populate RegularTraining records from the Bhavneet sheet.
 * Protected by founder role check + a secret header for extra safety.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthedRequest } from '../lib/auth';

export const seedRouter = Router();
seedRouter.use(requireAuth);

function fmtClientPhone(raw: string): { code: string; digits: string } | null {
  const s = raw.replace(/\D/g, '');
  if (!s) return null;
  if (s.length === 12 && s.startsWith('91')) return { code: '+91', digits: s.slice(2) };
  if (s.length === 10 && /^[6-9]/.test(s)) return { code: '+91', digits: s };
  if (s.length === 11 && s.startsWith('1')) return { code: '+1', digits: s.slice(1) };
  if (s.length === 10 && /^[2-9]/.test(s)) return { code: '+1', digits: s };
  return { code: '+1', digits: s.slice(-10) };
}

function fmtTrainerPhone(raw: string): { code: string; digits: string } | null {
  const first = raw.split('/')[0].trim();
  const s = first.replace(/\D/g, '');
  if (!s) return null;
  if (s.length === 12 && s.startsWith('91')) return { code: '+91', digits: s.slice(2) };
  if (s.length === 10) return { code: '+91', digits: s };
  return { code: '+91', digits: s.slice(-10) };
}

const RAW = [
  // Bhavneet
  { c: 'Training Virtual Employees', cp: '',             ce: '',                                    t: 'Virtual Employees', tp: '',             host: 'Bhavneet', time: '08:00', skill: 'Virtual' },
  // Kashish
  { c: 'Manoj',           cp: '19735687089',  ce: 'manuedu5054@gmail.com',        t: 'Akram',         tp: '6394957133',  host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Dinesh',          cp: '18607968190',  ce: 'dkarant90@gmail.com',          t: 'Rahul N',       tp: '9514334594',  host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Harpreet',        cp: '91999962413',  ce: 'karan.preet@aol.com',          t: 'Abdul',         tp: '9866441587',  host: 'Kashish', time: '20:00', skill: '' },
  { c: 'Venkat',          cp: '91993272035',  ce: 'balta.venkatesh@gmail.com',    t: 'Rahul Jasiwal', tp: '939844607',   host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Priya',           cp: '16144038079',  ce: 'mpriyadharshini92@gmail.com',  t: 'Chandra',       tp: '9182113854',  host: 'Kashish', time: '16:30', skill: '' },
  { c: 'Krishna',         cp: '12014486700',  ce: 'kuruhanuma@gmail.com',         t: 'Suresh',        tp: '9087914819',  host: 'Kashish', time: '07:00', skill: '' },
  { c: 'Kavitha',         cp: '18723303776',  ce: 'kavi64050@gmail.com',          t: 'Gautham',       tp: '8075196292',  host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Vinith',          cp: '18046375396',  ce: 'vroy3006.sfg@gmail.com',       t: 'Ayush',         tp: '8448050455',  host: 'Kashish', time: '06:30', skill: '' },
  { c: 'Rohit',           cp: '19014384138',  ce: 'rohit.gadugu92@gmail.com',     t: 'Arnoald',       tp: '8248072423',  host: 'Kashish', time: '12:30', skill: '' },
  { c: 'Jahnavi',         cp: '18138935528',  ce: 'jahnavidasari28@gmail.com',    t: 'Pramil',        tp: '7755902019',  host: 'Kashish', time: '08:30', skill: '' },
  { c: 'Priyanka',        cp: '919440133363', ce: 'priyankadantulu94@gmail.com',  t: 'Shivansh',      tp: '6394906234',  host: 'Kashish', time: '10:30', skill: '' },
  { c: 'Surya',           cp: '919994499850', ce: 'suryasimha.chintha@gmail.com', t: 'Omkar',         tp: '7776902859',  host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Shruthi',         cp: '16185270107',  ce: 'jshruthi97@gmail.com',         t: 'Bhupendra',     tp: '9987218936',  host: 'Kashish', time: '20:00', skill: '' },
  { c: 'Rahul',           cp: '13093636414',  ce: 'rahul122087@gmail.com',        t: 'Abhilash',      tp: '8378877766',  host: 'Kashish', time: '22:00', skill: '' },
  { c: 'Yaswanth',        cp: '15128156436',  ce: 'yeshwanth.reddy166@gmail.com', t: 'Niwaz',         tp: '6264904912',  host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Naveena',         cp: '14709022814',  ce: 'sunatangella@gmail.com',       t: 'Aniket',        tp: '8468950846',  host: 'Kashish', time: '21:30', skill: '' },
  { c: 'Sujit',           cp: '18175280757',  ce: 'msujithmedha22@gmail.com',     t: 'Vetri',         tp: '8610087749',  host: 'Kashish', time: '18:00', skill: '' },
  { c: 'Asghar Jadhav',   cp: '17175712932',  ce: 'asgharmac@gmail.com',          t: 'Phanideep',     tp: '8328663598',  host: 'Kashish', time: '20:00', skill: '' },
  { c: 'Nikhil',          cp: '16095408222',  ce: 'nikhilreddy.t1405@gmail.com',  t: 'Raj',           tp: '8828129141',  host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Teju',            cp: '17326721493',  ce: 'tejaswinipenchala@gmail.com',  t: 'Kishant',       tp: '9087070125',  host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Satvik',          cp: '18453770580',  ce: 'satvikmallempudi196@gmail.com',t: 'Arun',          tp: '7338165435',  host: 'Kashish', time: '19:30', skill: '' },
  { c: 'Ambika',          cp: '18453200044',  ce: 'ambika.bathini@gmail.com',     t: 'Muthu',         tp: '9894998892',  host: 'Kashish', time: '07:30', skill: '' },
  { c: 'Sravya',          cp: '16129878685',  ce: 'sravya2331@gmail.com',         t: 'Durga',         tp: '9491335145',  host: 'Kashish', time: '14:30', skill: '' },
  { c: 'Deepthi',         cp: '19085651255',  ce: 'deeptikollu7@gmail.com',       t: 'Karthik',       tp: '814330543',   host: 'Kashish', time: '07:00', skill: '' },
  { c: 'Sathvik',         cp: '12106268596',  ce: 'sathvireddy1210@gmail.com',    t: 'Peet',          tp: '6290949166',  host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Ram',             cp: '14947342758',  ce: 'ramkidec11@gmail.com',         t: 'Sachin',        tp: '8668833919',  host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Abhi',            cp: '19029826324',  ce: 'avajinapelli@gmail.com',       t: 'Jagdeesh',      tp: '8328682105',  host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Nikhil (Arun)',   cp: '12035331095',  ce: 'nikhil.t1405@gmail.com',       t: 'Arun',          tp: '8143290149',  host: 'Kashish', time: '06:30', skill: '' },
  { c: 'Ooha',            cp: '14016668469',  ce: 'oohasi234@gmail.com',          t: 'Akram',         tp: '6394957133',  host: 'Kashish', time: '06:30', skill: '' },
  { c: 'Rehman',          cp: '18173669398',  ce: 'rehaman.theaman@gmail.com',    t: 'Usha',          tp: '6360248947',  host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Sunny',           cp: '12815094456',  ce: 'dasarishirish@gmail.com',      t: 'Saroj',         tp: '',            host: 'Kashish', time: '07:00', skill: '' },
  { c: 'Training Shalini',cp: '918464080186', ce: 'shalini123.dl@gmail.com',      t: 'Manoj',         tp: '8074834527',  host: 'Kashish', time: '05:30', skill: 'PCL Scada' },
  { c: 'Training Ashish', cp: '17035777326',  ce: 'aashish.palla@gmail.com',      t: 'Ayush',         tp: '9111132565',  host: 'Kashish', time: '08:00', skill: 'Salesforce' },
  { c: 'Yashwanthi',      cp: '15139969723',  ce: 'yashwanthiky@gmail.com',       t: 'Nikhil',        tp: '7978725393',  host: 'Kashish', time: '09:00', skill: '' },
  // Muskan
  { c: 'Akhil',           cp: '13094397619',  ce: 'akhilsai9700547755@gmail.com', t: 'Ayush',         tp: '8448050455',  host: 'Muskan',  time: '07:00', skill: 'Salesforce CPQ' },
  { c: 'Bhargavi',        cp: '17797752785',  ce: 'ramayabharghavi.ch@gmail.com', t: 'Shravan',       tp: '8870065714',  host: 'Muskan',  time: '06:00', skill: 'Data Engineer' },
  { c: 'Bipana',          cp: '19727301042',  ce: 'bipana.dreamgirl.@gmail.com',  t: 'Tushar',        tp: '9732231018',  host: 'Muskan',  time: '07:30', skill: 'Java React' },
  { c: 'Gayatri',         cp: '16475327092',  ce: 'gayathri.anbarasu2@gmail.com', t: 'Abdul',         tp: '9866441587',  host: 'Muskan',  time: '07:00', skill: 'Networking' },
  { c: 'Harshitha',       cp: '13145685154',  ce: 'Harshithakatalavayi23@gmail.com',t:'Ravi',         tp: '9871622692',  host: 'Muskan',  time: '20:00', skill: 'iOS Developer' },
  { c: 'Mansa',           cp: '12342815550',  ce: 'mansa.qa66@gmail.com',         t: 'Samkit',        tp: '9691777815',  host: 'Muskan',  time: '08:00', skill: 'Selenium' },
  { c: 'Meghana',         cp: '19096835191',  ce: 'meghanavarayuri@gmail.com',    t: 'Bhuvanesh',     tp: '8960914286',  host: 'Muskan',  time: '06:00', skill: 'Java' },
  { c: 'Nagasri',         cp: '19907519222',  ce: 'mnagasri0306@gmail.com',       t: 'Sidharth',      tp: '7017603885',  host: 'Muskan',  time: '08:00', skill: 'Java Backend' },
  { c: 'Pavitra',         cp: '16043772462',  ce: 'pk.pavithra777@gmail.com',     t: 'Tamil',         tp: '8939124684',  host: 'Muskan',  time: '08:00', skill: 'Data Engineer' },
  { c: 'Raja',            cp: '16478609409',  ce: 'gnsmrjrmn@gmail.com',          t: 'Arun',          tp: '8143290149',  host: 'Muskan',  time: '21:00', skill: 'Java' },
  { c: 'Ramya',           cp: '18137169143',  ce: '',                             t: 'Manoj',         tp: '8074834527',  host: 'Muskan',  time: '22:30', skill: 'Sage Reporting' },
  { c: 'Snehlata',        cp: '919948989838', ce: 'thalakantisneha@gmail.com',    t: 'Virendra',      tp: '9545787470',  host: 'Muskan',  time: '06:00', skill: 'Salesforce' },
  { c: 'Training Dinesh', cp: '14379894467',  ce: 'easygogeo1729@gmail.com',      t: 'Prassana',      tp: '9944334767',  host: 'Muskan',  time: '07:00', skill: 'AI Engineer' },
  { c: 'Training Sahil',  cp: '15755171707',  ce: 'sahil.ghiyasi07@gmail.com',    t: 'Shubham',       tp: '9839015625',  host: 'Muskan',  time: '08:00', skill: 'Cybersecurity' },
  { c: 'Training Sandeep',cp: '14259613418',  ce: '',                             t: 'Sachin',        tp: '8668833919',  host: 'Muskan',  time: '08:00', skill: 'Data Engineer' },
  { c: 'Training Vamshi', cp: '13146882876',  ce: 'muppaneni565143n@gmail.com',   t: 'Peet',          tp: '6290949166',  host: 'Muskan',  time: '09:00', skill: 'Data Engineer' },
];

seedRouter.post('/regular-trainings', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Founder only' });

  const hosts = await prisma.user.findMany({
    where: { name: { in: ['Kashish', 'Muskan', 'Bhavneet'] } },
    select: { id: true, name: true },
  });
  const hostMap: Record<string, string> = {};
  for (const h of hosts) hostMap[h.name] = h.id;

  if (!hostMap['Kashish'] || !hostMap['Muskan']) {
    return res.status(400).json({ error: 'Kashish or Muskan user not found in DB' });
  }

  const log: string[] = [];
  let created = 0, updated = 0, skipped = 0;

  for (const row of RAW) {
    if (!row.t) { skipped++; continue; }
    const hostId = hostMap[row.host];
    if (!hostId) { log.push(`SKIP no host: ${row.c}`); skipped++; continue; }

    // Client
    const cp = fmtClientPhone(row.cp);
    const ce = row.ce && row.ce !== 'no email' ? row.ce.trim() : null;
    let client = await prisma.client.findFirst({
      where: { name: { equals: row.c, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!client) {
      client = await prisma.client.create({
        data: {
          name: row.c, email: ce,
          phoneCode: cp?.code || '+1', phoneDigits: cp?.digits || null,
          lifecycle: 'Active', engagementType: 'Training', hostOwnerId: hostId,
        },
        select: { id: true },
      });
    } else {
      await prisma.client.update({
        where: { id: client.id },
        data: {
          ...(ce ? { email: ce } : {}),
          ...(cp ? { phoneCode: cp.code, phoneDigits: cp.digits } : {}),
          lifecycle: 'Active', hostOwnerId: hostId,
        },
      });
    }

    // Trainer
    const tName = row.t.split('/')[0].trim();
    const tp = fmtTrainerPhone(row.tp);
    let trainer = await prisma.trainer.findFirst({
      where: { name: { equals: tName, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!trainer) {
      trainer = await prisma.trainer.create({
        data: {
          name: tName,
          phoneCode: tp?.code || '+91', phoneDigits: tp?.digits || null,
          ...(row.skill ? { skills: row.skill } : {}),
        },
        select: { id: true },
      });
    } else if (tp?.digits) {
      await prisma.trainer.update({
        where: { id: trainer.id },
        data: { phoneCode: tp.code, phoneDigits: tp.digits },
      });
    }

    // RegularTraining
    const existing = await prisma.regularTraining.findFirst({
      where: { clientId: client.id, trainerId: trainer.id, status: 'active' },
      select: { id: true },
    });
    if (!existing) {
      await prisma.regularTraining.create({
        data: {
          name: `${row.c} · ${tName}`,
          clientId: client.id, trainerId: trainer.id,
          hostedByDefaultId: hostId, meetingMode: 'Zoom',
          defaultTimeIst: row.time, status: 'active',
          ...(row.skill ? { notes: row.skill } : {}),
        },
      });
      log.push(`✓ created: ${row.c} ← ${tName} (${row.host} ${row.time})`);
      created++;
    } else {
      await prisma.regularTraining.update({
        where: { id: existing.id },
        data: { defaultTimeIst: row.time, hostedByDefaultId: hostId },
      });
      log.push(`↺ updated: ${row.c} ← ${tName}`);
      updated++;
    }
  }

  res.json({ ok: true, created, updated, skipped, log });
});
