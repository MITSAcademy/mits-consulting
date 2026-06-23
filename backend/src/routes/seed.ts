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
  // ── Kashish ────────────────────────────────────────────────────────────────
  { c: 'Venkat',           cp: '91993272035',  ce: 'balta.venkatesh@gmail.com',       t: 'Rahul Jasiwal', tp: '939844607',    te: 'rahuljais44@outlook.com',              host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Priya',            cp: '16144038079',  ce: 'mpriyadharshini92@gmail.com',     t: 'Chandra',       tp: '9182113854',   te: 'tchandrasekhar201@gmail.com',          host: 'Kashish', time: '16:30', skill: '' },
  { c: 'Kavitha',          cp: '18723303776',  ce: 'kavi64050@gmail.com',             t: 'Gautham',       tp: '8075196292',   te: 'gautamrajr@gmail.com',                host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Vinith',           cp: '18046375396',  ce: 'vroy3006.sfg@gmail.com',          t: 'Ayush',         tp: '8448050455',   te: 'p.aayush@outlook.com',                host: 'Kashish', time: '06:30', skill: '' },
  { c: 'Rohit',            cp: '19014384138',  ce: 'rohit.gadugu92@gmail.com',        t: 'Arnoald',       tp: '8248072423',   te: 'arnoldsajjan94@gmail.com',            host: 'Kashish', time: '12:30', skill: '' },
  { c: 'Jahnavi',          cp: '18138935528',  ce: 'jahnavidasari28@gmail.com',       t: 'Pramil',        tp: '7755902019',   te: 'pramilgawande@gmail.com',             host: 'Kashish', time: '08:30', skill: '' },
  { c: 'Priyanka',         cp: '919440133363', ce: 'priyankadantulu94@gmail.com',     t: 'Shivansh',      tp: '6394906234',   te: '',                                    host: 'Kashish', time: '10:30', skill: '' },
  { c: 'Surya',            cp: '919994499850', ce: 'suryasimha.chintha@gmail.com',    t: 'Omkar',         tp: '7776902859',   te: 'shindediksha2012@gmail.com',          host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Shruthi',          cp: '16185270107',  ce: 'jshruthi97@gmail.com',            t: 'Bhupendra',     tp: '9987218936',   te: 'jiyana.bisht94@gmail.com',            host: 'Kashish', time: '20:00', skill: '' },
  { c: 'Rahul',            cp: '13093636414',  ce: 'rahul122087@gmail.com',           t: 'Abhilash',      tp: '8378877766',   te: 'abwalke19@gmail.com',                 host: 'Kashish', time: '22:00', skill: '' },
  { c: 'Yaswanth',         cp: '15128156436',  ce: 'yeshwanth.reddy166@gmail.com',    t: 'Niwaz',         tp: '6204364912',   te: 'Niwasgope2024@gmail.com',             host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Naveena',          cp: '14709022814',  ce: 'sunatangella@gmail.com',          t: 'Shivansh',      tp: '6394906234',   te: '',                                    host: 'Kashish', time: '21:30', skill: '' },
  { c: 'Sujit',            cp: '18175280757',  ce: 'msujithmedha22@gmail.com',        t: 'Zakir',         tp: '',             te: '',                                    host: 'Kashish', time: '18:00', skill: '' },
  { c: 'Asghar Jadhav',    cp: '17175712932',  ce: 'asgharmac@gmail.com',             t: 'Phanideep',     tp: '8328663598',   te: 'phanideep52@gmail.com',               host: 'Kashish', time: '20:00', skill: '' },
  { c: 'Nikhil',           cp: '16095408222',  ce: 'nikhilreddy.t1405@gmail.com',     t: 'Raj',           tp: '8148829141',   te: 'mynarocikiaraj@gmail.com',            host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Teju',             cp: '17326721493',  ce: 'tejaswinipenchala@gmail.com',     t: 'Kishant',       tp: '9087070125',   te: 'rgkishanth@gmail.com',                host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Satvik',           cp: '18453770580',  ce: 'satvikmallempudi196@gmail.com',   t: 'Arun',          tp: '7338165435',   te: 'timsupt.ready@gmail.com',             host: 'Kashish', time: '19:30', skill: '' },
  { c: 'Ambika',           cp: '18453200044',  ce: 'ambika.bathini@gmail.com',        t: 'Muthu',         tp: '9894998892',   te: 'muthu.vnathan6@gmail.com',            host: 'Kashish', time: '07:30', skill: '' },
  { c: 'Sravya',           cp: '16129878685',  ce: 'sravya2331@gmail.com',            t: 'Durga',         tp: '9491335145',   te: 'velkuru.durgaprasad007@gmail.com',    host: 'Kashish', time: '14:30', skill: '' },
  { c: 'Training Deepthi', cp: '19085651255',  ce: 'deeptikollu7@gmail.com',          t: 'Karthik',       tp: '814330543',    te: 'workmailkayy@gmail.com',              host: 'Kashish', time: '07:00', skill: '' },
  { c: 'Training Sathvik', cp: '12106268596',  ce: 'sathvireddy1210@gmail.com',       t: 'Peet',          tp: '6290949166',   te: '',                                    host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Abhi',             cp: '19029826324',  ce: 'avajinapelli@gmail.com',          t: 'Jagdeesh',      tp: '8328682105',   te: 'c.jagan2012@gmail.com',               host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Nikhil (Arun)',    cp: '12035331095',  ce: 'nikhil.t1405@gmail.com',          t: 'Arun',          tp: '8143290149',   te: '',                                    host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Ooha',             cp: '14016668469',  ce: 'oohasi234@gmail.com',             t: 'Akram',         tp: '916394957133', te: 'codingmaniac007@gmail.com',            host: 'Kashish', time: '06:30', skill: '' },
  { c: 'Sunny',            cp: '12815094456',  ce: 'dasarishirish@gmail.com',         t: 'Saroj',         tp: '918917335298', te: 'sarojekka1410@gmail.com',             host: 'Kashish', time: '07:00', skill: '' },
  { c: 'Training Shalini', cp: '918464080186', ce: 'shalini123.dl@gmail.com',         t: 'Manoj',         tp: '8074834527',   te: 'manojbharat1803@gmail.com',           host: 'Kashish', time: '05:30', skill: 'PCL Scada' },
  { c: 'Training Ashish',  cp: '17035777326',  ce: 'aashish.palla@gmail.com',         t: 'Ayush',         tp: '9111132565',   te: 'ayushgupta0426@gmail.com',            host: 'Kashish', time: '08:00', skill: 'Salesforce' },
  { c: 'Yashwanthi',       cp: '15139969723',  ce: 'yashwanthiky@gmail.com',          t: 'Nikhil',        tp: '7978725393',   te: 'niks11.thadani@gmail.com',            host: 'Kashish', time: '09:00', skill: '' },
  // New from updated PDF
  { c: 'Shaikh',           cp: '17472268679',  ce: 'irshaikh177@gmail.com',           t: 'Nayan',         tp: '6394906234',   te: 'nayanjain928@gmail.com',              host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Priya (US)',       cp: '18035670442',  ce: '',                                t: 'Nayan',         tp: '6394906234',   te: 'nayanjain928@gmail.com',              host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Rumana',           cp: '19452706969',  ce: 'Rumanas803@gmail.com',            t: 'Yaseen',        tp: '7702895081',   te: 'yaseenmohammad777@gmail.com',         host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Training Alkehya', cp: '15166525623',  ce: '',                                t: 'Chandana',      tp: '6300231992',   te: 'Chandanagajula6666@gmail.com',        host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Sathiya',          cp: '9848160551',   ce: 'sathyajit90@gmail.com',           t: 'Siddeshwar',    tp: '9011645299',   te: '',                                    host: 'Kashish', time: '09:00', skill: '' },
  // ── Muskan ────────────────────────────────────────────────────────────────
  { c: 'Akhil',            cp: '13094397619',  ce: 'akhilsai9700547755@gmail.com',    t: 'Shivam',        tp: '8294668059',   te: '',                                    host: 'Muskan',  time: '07:00', skill: 'Salesforce CPQ' },
  { c: 'Bhargavi',         cp: '17797752785',  ce: 'ramayabharghavi.ch@gmail.com',    t: 'Shravn',        tp: '8870065714',   te: '',                                    host: 'Muskan',  time: '06:00', skill: 'Data Engineer' },
  { c: 'Bipana',           cp: '19727301042',  ce: 'bipana.dreamgirl.@gmail.com',     t: 'Tushar',        tp: '9373231018',   te: 'shinde.tushar7211@gmail.com',         host: 'Muskan',  time: '07:30', skill: 'Java React' },
  { c: 'Gayatri',          cp: '16475327092',  ce: 'gayathri.anbarasu2@gmail.com',    t: 'Abdul',         tp: '6397345306',   te: 'ar310786@gmail.com',                  host: 'Muskan',  time: '07:00', skill: 'Networking' },
  { c: 'Mansa',            cp: '12342815550',  ce: 'mansa.qa66@gmail.com',            t: 'Samkit',        tp: '9691777815',   te: '',                                    host: 'Muskan',  time: '08:00', skill: 'Selenium' },
  { c: 'Meghana',          cp: '19096835191',  ce: 'meghanavarayuri@gmail.com',       t: 'Bhuvansh',      tp: '8960914286',   te: 'bhuvaneshshukla25@gmail.com',         host: 'Muskan',  time: '06:00', skill: 'Java' },
  { c: 'Nagasri',          cp: '19097519222',  ce: 'mnagasri0306@gmail.com',          t: 'Sidharth',      tp: '7017603885',   te: '',                                    host: 'Muskan',  time: '08:00', skill: 'Java Backend' },
  { c: 'Pavitra',          cp: '16043772462',  ce: 'pk.pavithra777@gmail.com',        t: 'Tamil',         tp: '8939124684',   te: 'tamilselvants@yahoo.com',             host: 'Muskan',  time: '08:00', skill: 'Data Engineer' },
  { c: 'Raja',             cp: '16478609409',  ce: 'gnsmrjrmn@gmail.com',             t: 'Arun',          tp: '7338165435',   te: 'timsupt.ready@gmail.com',             host: 'Muskan',  time: '21:00', skill: 'Java' },
  { c: 'Ramya',            cp: '18137169143',  ce: '',                                t: 'Manoj',         tp: '8074834527',   te: 'manojbharat1803@gmail.com',           host: 'Muskan',  time: '22:30', skill: 'Sage Reporting' },
  { c: 'Snehlatha',        cp: '919948989838', ce: 'thalakantisneha@gmail.com',       t: 'Virendra',      tp: '9545787470',   te: '',                                    host: 'Muskan',  time: '06:00', skill: 'Salesforce' },
  { c: 'Training Vamshi',  cp: '13146882876',  ce: 'muppaneni565143n@gmail.com',      t: 'Peet',          tp: '6290949166',   te: '',                                    host: 'Muskan',  time: '09:00', skill: 'Data Engineer' },
];

seedRouter.post('/regular-trainings', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Founder only' });

  const hosts = await prisma.user.findMany({
    where: { name: { in: ['Kashish', 'Muskan', 'Bhavneet', 'Kashish Gupta', 'Muskan Maini'] } },
    select: { id: true, name: true },
  });
  const hostMap: Record<string, string> = {};
  for (const h of hosts) {
    // Map by first name so seed rows using 'Kashish' always resolve
    const firstName = h.name.split(' ')[0];
    hostMap[h.name] = h.id;
    if (!hostMap[firstName]) hostMap[firstName] = h.id;
  }

  if (!hostMap['Kashish'] || !hostMap['Muskan']) {
    return res.status(400).json({ error: 'Kashish or Muskan user not found in DB — ensure users exist with those names' });
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
      const te = (row as any).te && (row as any).te !== 'no email' ? (row as any).te.trim() : null;
      trainer = await prisma.trainer.create({
        data: {
          name: tName,
          phoneCode: tp?.code || '+91', phoneDigits: tp?.digits || null,
          ...(te ? { email: te } : {}),
          ...(row.skill ? { skills: row.skill } : {}),
        },
        select: { id: true },
      });
    } else {
      const te = (row as any).te && (row as any).te !== 'no email' ? (row as any).te.trim() : null;
      await prisma.trainer.update({
        where: { id: trainer.id },
        data: {
          ...(tp?.digits ? { phoneCode: tp.code, phoneDigits: tp.digits } : {}),
          ...(te ? { email: te } : {}),
        },
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

// Canonical client names from the active PDF sheet (normalised lowercase for matching)
const PDF_CLIENT_NAMES = RAW.map(r => r.c.toLowerCase().trim());

// PDF client phone digits for fallback matching (last 10 digits)
const PDF_CLIENT_PHONES = RAW.map(r => r.cp.replace(/\D/g, '').slice(-10)).filter(Boolean);

// POST /api/seed/cleanup — retire clients not in the active PDF sheet → Retrospective
seedRouter.post('/cleanup', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Founder only' });

  // Fetch all active RegularTraining rows with client + trainer info
  const activeTrainings = await prisma.regularTraining.findMany({
    where: { status: 'active' },
    include: {
      client: { select: { id: true, name: true, phoneDigits: true, lifecycle: true } },
      trainer: { select: { id: true, name: true } },
      hostedByDefault: { select: { id: true, name: true } },
    },
  });

  const log: string[] = [];
  let retired = 0, kept = 0;

  for (const rt of activeTrainings) {
    const c = rt.client;
    if (!c) continue;

    const nameLower = c.name.toLowerCase().trim();
    const phone10 = (c.phoneDigits || '').replace(/\D/g, '').slice(-10);

    // Match by name or phone against PDF list
    const inPdf = PDF_CLIENT_NAMES.includes(nameLower)
      || (phone10.length >= 8 && PDF_CLIENT_PHONES.some(p => p.endsWith(phone10.slice(-8)) || phone10.endsWith(p.slice(-8))));

    if (inPdf) {
      kept++;
      continue;
    }

    // Not in PDF — archive the training and create a Retrospective entry
    await prisma.regularTraining.update({
      where: { id: rt.id },
      data: { status: 'inactive' },
    });

    // Create retrospective entry (skip if already exists for this training)
    const existing = await (prisma as any).retrospective.findFirst({
      where: { sourceType: 'RegularTraining', sourceId: rt.id },
      select: { id: true },
    });
    if (!existing) {
      await (prisma as any).retrospective.create({
        data: {
          sourceType: 'RegularTraining',
          sourceId: rt.id,
          clientName: c.name,
          trainerName: rt.trainer?.name || '',
          removedAt: new Date().toISOString().slice(0, 10),
          removedById: req.user!.id,
          reason: 'Removed from active PDF sheet — not in latest client list',
          sessionDate: rt.defaultTimeIst || null,
        },
      });
    }

    log.push(`retired: ${c.name} (trainer: ${rt.trainer?.name || '—'})`);
    retired++;
  }

  res.json({ ok: true, retired, kept, log });
});
