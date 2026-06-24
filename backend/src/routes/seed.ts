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
  // cg = client WhatsApp group link, tg = trainer WhatsApp group link
  { c: 'Venkat',           cp: '91993272035',  ce: 'balta.venkatesh@gmail.com',       cg: 'https://chat.whatsapp.com/K0EUVaVAyr82S804prl3sq', t: 'Rahul Jasiwal', tp: '939844607',    te: 'rahuljais44@outlook.com',           tg: 'https://chat.whatsapp.com/BUpbnI1lKpcAAfRJCfxea9', host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Priya',            cp: '16144038079',  ce: 'mpriyadharshini92@gmail.com',     cg: 'https://chat.whatsapp.com/DsAglBSYpPP0fpTiZta1jx', t: 'Chandra',       tp: '9182113854',   te: 'tchandrasekhar201@gmail.com',       tg: 'https://chat.whatsapp.com/BBXtgSAq1F8DUhy2OKFRjw', host: 'Kashish', time: '16:30', skill: '' },
  { c: 'Kavitha',          cp: '18723303776',  ce: 'kavi64050@gmail.com',             cg: 'https://chat.whatsapp.com/CBq8QiBWi6FIa8ybqnNSSZ', t: 'Gautham',       tp: '8075196292',   te: 'gautamrajr@gmail.com',              tg: 'https://chat.whatsapp.com/IceoBksqEyGHYDPDuUQCE5', host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Vinith',           cp: '18046375396',  ce: 'vroy3006.sfg@gmail.com',          cg: '',                                                 t: 'Akhil',         tp: '8522943664',   te: '',                                  tg: 'https://chat.whatsapp.com/Io94RLwNR3jEwDm12XUmu4', host: 'Kashish', time: '06:30', skill: '' },
  { c: 'Rohit',            cp: '19014384138',  ce: 'rohit.gadugu92@gmail.com',        cg: 'https://chat.whatsapp.com/F9exCt0IAxW7wLpsG8SorJ', t: 'Arnoald',       tp: '8248072423',   te: 'arnoldsajjan94@gmail.com',          tg: 'https://chat.whatsapp.com/FkH9x6MobuSBgHVVTiOhU0', host: 'Kashish', time: '12:30', skill: '' },
  { c: 'Jahnavi',          cp: '18138935528',  ce: 'jahnavidasari28@gmail.com',       cg: 'https://chat.whatsapp.com/K4L5OcsQLLE41RO2qTNq0E', t: 'Pramil',        tp: '7755902019',   te: 'pramilgawande@gmail.com',           tg: 'https://chat.whatsapp.com/HQ3V22L5fYs1QDUBoW3TuG', host: 'Kashish', time: '08:30', skill: '' },
  { c: 'Priyanka',         cp: '919440133363', ce: 'priyankadantulu94@gmail.com',     cg: '',                                                 t: 'Shivansh',      tp: '6394906234',   te: '',                                  tg: 'https://chat.whatsapp.com/Gs4BXTZ60Ur7HflVeDxMVk', host: 'Kashish', time: '10:30', skill: '' },
  { c: 'Surya',            cp: '919994499850', ce: 'suryasimha.chintha@gmail.com',    cg: 'https://chat.whatsapp.com/ByfKOSMZ92bEJRfGBhEwtZ', t: 'Omkar',         tp: '7776902859',   te: 'shindediksha2012@gmail.com',        tg: '',                                                 host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Shruthi',          cp: '16185270107',  ce: 'jshruthi97@gmail.com',            cg: 'https://chat.whatsapp.com/E72jtcOrAYvJFAK1gqbvVG', t: 'Bhupendra',     tp: '9987218936',   te: 'jiyana.bisht94@gmail.com',          tg: 'https://chat.whatsapp.com/JI1xfRiM5N09Zqw7JzRnxa', host: 'Kashish', time: '20:00', skill: '' },
  { c: 'Rahul',            cp: '13093636414',  ce: 'rahul122087@gmail.com',           cg: 'https://chat.whatsapp.com/LSb09YUgc3MFwBQLyd7H9w', t: 'Abhilash',      tp: '8378877766',   te: 'abwalke19@gmail.com',               tg: 'https://chat.whatsapp.com/ED5S8CLKjE767Os0ngM0oB', host: 'Kashish', time: '22:00', skill: '' },
  { c: 'Yaswanth',         cp: '15128156436',  ce: 'yeshwanth.reddy166@gmail.com',    cg: 'https://chat.whatsapp.com/IFjoGbGrEs45i23i4u5d3k', t: 'Niwaz',         tp: '6204364912',   te: 'Niwasgope2024@GMAIL.COM',           tg: 'https://chat.whatsapp.com/BCQBqL9RZob2dc4WLVF2s4', host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Naveena',          cp: '14709022814',  ce: 'sunatangella@gmail.com',          cg: 'https://chat.whatsapp.com/EOX3cqLsVQj1o6vgXd5xEs', t: 'Shivansh',      tp: '6394906234',   te: '',                                  tg: 'https://chat.whatsapp.com/Gs4BXTZ60Ur7HflVeDxMVk', host: 'Kashish', time: '21:30', skill: '' },
  { c: 'Sujit',            cp: '18175280757',  ce: 'msujithmedha22@gmail.com',        cg: 'https://chat.whatsapp.com/BtgCaHzG8Xw4cZYtbCfuEa', t: 'Zakir',         tp: '',             te: '',                                  tg: 'https://chat.whatsapp.com/KO8PKLYCI8K824ifZxZtWv', host: 'Kashish', time: '18:00', skill: '' },
  { c: 'Asghar Jadhav',    cp: '17175712932',  ce: 'asgharmac@gmail.com',             cg: 'https://chat.whatsapp.com/HRCSzI2saesIZ3Gi7a5f0E', t: 'Phanideep',     tp: '8328663598',   te: 'phanideep52@gmail.com',             tg: '',                                                 host: 'Kashish', time: '20:00', skill: '' },
  { c: 'Nikhil',           cp: '16095408222',  ce: 'nikhilreddy.t1405@gmail.com',     cg: 'https://chat.whatsapp.com/D5If7m1nrCt3yk5V8gx3Vc', t: 'Raj',           tp: '8148829141',   te: 'mynarocikiaraj@gmail.com',          tg: 'https://chat.whatsapp.com/D8unZjNqLiC66WKizpfZjv', host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Teju',             cp: '17326721493',  ce: 'tejaswinipenchala@gmail.com',     cg: 'https://chat.whatsapp.com/KQxkJREQohZ6Th4mknk3Yg', t: 'Kishant',       tp: '9087070125',   te: 'rgkishanth@gmail.com',              tg: 'https://chat.whatsapp.com/FK8Ct2qzGUDLb0qYf8hOEd', host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Satvik',           cp: '18453770580',  ce: 'satvikmallempudi196@gmail.com',   cg: 'https://chat.whatsapp.com/BkM9SgSdTtKGzbavbBghpb', t: 'Arun/Anand',    tp: '7338165435',   te: 'timsupt.ready@gmail.com',           tg: 'https://chat.whatsapp.com/GhQkovPX9E3KUYZbc591lt', host: 'Kashish', time: '19:30', skill: '' },
  { c: 'Ambika',           cp: '18453200044',  ce: 'ambika.bathini@gmail.com',        cg: 'https://chat.whatsapp.com/KcUwJ2VMji0Gpq08XdMHJV', t: 'Muthu',         tp: '9894998892',   te: 'muthu.vnathan6@gmail.com',          tg: 'https://chat.whatsapp.com/LZ8miGCg6F7CQNZD7auz6s', host: 'Kashish', time: '07:30', skill: '' },
  { c: 'Sravya',           cp: '16129878685',  ce: 'sravya2331@gmail.com',            cg: 'https://chat.whatsapp.com/IG1hoYqzCYF7LIix7Z6Rjq?s=cl&p=a&ilr=2&amv=1', t: 'Durga', tp: '9491335145',   te: 'velkuru.durgaprasad007@gmail.com',  tg: 'https://chat.whatsapp.com/KXZjEPRarg04qsCuch3lZA', host: 'Kashish', time: '14:30', skill: '' },
  { c: 'Training Deepthi', cp: '19085651255',  ce: 'deeptikollu7@gmail.com',          cg: '',                                                 t: 'Karthik',       tp: '814330543',    te: 'workmailkayy@gmail.com',            tg: 'https://chat.whatsapp.com/F2F9Kgaj8mVHp1JXBCxXbG', host: 'Kashish', time: '07:00', skill: '' },
  { c: 'Training Sathvik', cp: '12106268596',  ce: 'sathvireddy1210@gmail.com',       cg: 'https://chat.whatsapp.com/FUqUhMajETv0FkW3wCsFSA', t: 'Peet',          tp: '6290949166',   te: '',                                  tg: '',                                                 host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Abhi',             cp: '19029826324',  ce: 'avajinapelli@gmail.com',          cg: 'https://chat.whatsapp.com/GSlmT2X1i3ZGNuw3eNkTKf', t: 'Jagdeesh',      tp: '8328682105',   te: 'c.jagan2012@gmail.com',             tg: '',                                                 host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Nikhil',           cp: '12035331095',  ce: 'nikhil.t1405@gmail.com',          cg: 'https://chat.whatsapp.com/HvzQ7Krwrug1JIcwOfn9MO', t: 'Arun',          tp: '8143290149',   te: '',                                  tg: 'https://chat.whatsapp.com/HHFesHSZxWi7OBjpJOiqJq', host: 'Kashish', time: '08:00', skill: '' },
  { c: 'Ooha',             cp: '14016668469',  ce: 'oohasi234@gmail.com',             cg: 'https://chat.whatsapp.com/LLPRgFIsIfDFj9XtDGW9IZ', t: 'Akram',         tp: '916394957133', te: 'codingmaniac007@gmail.com',         tg: 'https://chat.whatsapp.com/DvYzgIBZeiu2wXA684zrlJ', host: 'Kashish', time: '06:30', skill: '' },
  { c: 'Sunny',            cp: '12815094456',  ce: 'dasarishirish@gmail.com',         cg: 'https://chat.whatsapp.com/EAehTbcKxhC8ifSG9PZFPv', t: 'Saroj',         tp: '918917335298', te: 'sarojekka1410@gmail.com',           tg: 'https://chat.whatsapp.com/F2hGcbfkowy5MbzlcbEFA6', host: 'Kashish', time: '07:00', skill: '' },
  { c: 'Training Shalini', cp: '918464080186', ce: 'shalini123.dl@gmail.com',         cg: 'https://chat.whatsapp.com/FqQlySn5ikh90ADVGBuz1S', t: 'Manoj',         tp: '8074834527',   te: 'manojbharat1803@gmail.com',         tg: 'https://chat.whatsapp.com/HPhzqPjDg51CI0hUlAY9zE', host: 'Kashish', time: '05:30', skill: 'PCL Scada' },
  { c: 'Training Ashish',  cp: '17035777326',  ce: 'aashish.palla@gmail.com',         cg: 'https://chat.whatsapp.com/C9lfJ4hteTv9E1yWXxSi95', t: 'Ayush',         tp: '9111132565',   te: 'ayushgupta0426@gmail.com',          tg: '',                                                 host: 'Kashish', time: '08:00', skill: 'Salesforce' },
  { c: 'Yashwanthi',       cp: '15139969723',  ce: 'yashwanthiky@gmail.com',          cg: 'https://chat.whatsapp.com/KAsUJWzYr3qC7HEcqLxyKt', t: 'Nikhil',        tp: '7978725393',   te: 'niks11.thadani@gmail.com',          tg: 'https://chat.whatsapp.com/CGdqUKBIdWrHbceJJsCm9j', host: 'Kashish', time: '09:00', skill: '' },
  // New clients from updated PDF
  { c: 'Shaikh',           cp: '17472268679',  ce: 'irshaikh177@gmail.com',           cg: 'https://chat.whatsapp.com/KujymdCzDOw1mdYJizQbNO', t: 'Amit',          tp: '',             te: '',                                  tg: 'https://chat.whatsapp.com/IzJ6BYHzzD39LDExSe7p1D', host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Priya (US)',       cp: '18035670442',  ce: '',                                cg: 'https://chat.whatsapp.com/H8Mf8Xcx8Ox3fI4TRg5v51', t: 'Nayan',         tp: '6394906234',   te: 'nayanjain928@gmail.com',            tg: 'https://chat.whatsapp.com/Jqc1KcFxq92C6s2Fy3h1Sm', host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Rumana',           cp: '19452706969',  ce: 'Rumanas803@gmail.com',            cg: 'https://chat.whatsapp.com/H8Mf8Xcx8Ox3fI4TRg5v51', t: 'Yaseen',        tp: '7702895081',   te: 'yaseenmohammad777@gmail.com',       tg: 'https://chat.whatsapp.com/D9vtlhU9Lke38pu7DnH1rq', host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Training Alkehya', cp: '15166525623',  ce: '',                                cg: 'https://chat.whatsapp.com/CWbIErJ37Yr2olq9rgLcmG', t: '',              tp: '',             te: '',                                  tg: '',                                                 host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Chandana',         cp: '6300231992',   ce: 'Chandanagajula6666@gmail.com',    cg: 'https://chat.whatsapp.com/I5jqnuFMNVO6dncQfzwg1Z', t: 'Anitha',        tp: '7023741763',   te: 'Anita1singh2choudhary3@gmail.com',  tg: 'https://chat.whatsapp.com/LZeXlrEcZhI9xe4m0sprws', host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Saiteja',          cp: '9348548056',   ce: 'Saitejats88@gmail.com',           cg: 'https://chat.whatsapp.com/EInW8q2Ej749tuoI7AivM7', t: 'Siddeshwar',    tp: '9011645299',   te: '',                                  tg: 'https://chat.whatsapp.com/IcWnoHk26ji6GxWTNeAOSZ', host: 'Kashish', time: '09:00', skill: '' },
  { c: 'Mehraaz',          cp: '16039305488',  ce: 'mehraazmeaaz50@gmail.com',        cg: 'https://chat.whatsapp.com/HzrKKOsO3pK8UxSb2OxXUI', t: 'Arun',          tp: '8919708804',   te: 'arunkondasrikanth79@gmail.com',     tg: 'https://chat.whatsapp.com/CbU1djtR5YbDigacezAJhX', host: 'Kashish', time: '09:00', skill: '' },
  // ── Muskan ────────────────────────────────────────────────────────────────
  { c: 'Akhil',            cp: '13094397619',  ce: 'akhilsai9700547755@gmail.com',    cg: 'https://chat.whatsapp.com/Hn9zXrNJTJM2n9sEWwtVkB', t: 'Shivam',        tp: '8294668059',   te: '',                                  tg: 'https://chat.whatsapp.com/FF5bny6CZP87nL9ExJTbag', host: 'Muskan',  time: '07:00', skill: 'Salesforce CPQ' },
  { c: 'Bhargavi',         cp: '17797752785',  ce: 'ramayabharghavi.ch@gmail.com',    cg: 'https://chat.whatsapp.com/KjwVvBZVwUE33vEY7HQDoL', t: 'Shravn',        tp: '8870065714',   te: '',                                  tg: 'https://chat.whatsapp.com/C1rxU45L3VJFqaHfLU6wL6', host: 'Muskan',  time: '06:00', skill: 'Data Engineer' },
  { c: 'Bipana',           cp: '19727301042',  ce: 'wagles840@gmail.com',             cg: 'https://chat.whatsapp.com/LTiNiZx1jqs1aGmOKsGodw', t: 'Tushar',        tp: '9373231018',   te: '',                                  tg: 'https://chat.whatsapp.com/HdMFMMxLT33BYZwh6IeLyv', host: 'Muskan',  time: '07:30', skill: 'Java React' },
  { c: 'Gayatri',          cp: '16475327092',  ce: 'gayathri.anbarasu2gmailyahoo.com', cg: 'https://chat.whatsapp.com/L2ZECiONfrj6czQFQVjPs8', t: 'Abdul',        tp: '6397345306',   te: 'ar310786@gmail.com',                tg: 'https://chat.whatsapp.com/Faw7PiuMjDwEX9hjLo3Xd7', host: 'Muskan',  time: '07:00', skill: 'Networking' },
  { c: 'Mansa',            cp: '12342815550',  ce: 'mansa.qa66@gmail.com',            cg: 'https://chat.whatsapp.com/FdfmMibhseLDxq53vU1vVy', t: 'Samkit',        tp: '9691777815',   te: '',                                  tg: 'https://chat.whatsapp.com/HPhzqPjDg51CI0hUlAY9zE', host: 'Muskan',  time: '08:00', skill: 'Selenium' },
  { c: 'Meghna',           cp: '19096835191',  ce: 'meghanavarayuri@gmail.com',       cg: 'https://chat.whatsapp.com/Fgqd5lJkdULFqgW7ubTM1W', t: 'Bhuvansh',      tp: '8960914286',   te: 'bhuvaneshshukla25@gmail.com',       tg: '',                                                 host: 'Muskan',  time: '06:00', skill: 'Java' },
  { c: 'Nagasri',          cp: '19097519222',  ce: 'mnagasri0306@gmail.com',          cg: 'https://chat.whatsapp.com/JacoV2h0P7uJvnfQnpukOw', t: 'Sidharth',      tp: '7017603885',   te: '',                                  tg: 'https://chat.whatsapp.com/JRwbPa3N4bG868mMetrgR9', host: 'Muskan',  time: '08:00', skill: 'Java Backend' },
  { c: 'Pavitra',          cp: '16043772462',  ce: 'pk.pavithra777@gmail.com',        cg: 'https://chat.whatsapp.com/Iq4GnOk0BRw3vt6Wue5sCN', t: 'Tamil',         tp: '8939124684',   te: 'tamilselvants@yahoo.com',           tg: 'https://chat.whatsapp.com/EAd4L4D4WSE5GolwLHWVaN', host: 'Muskan',  time: '08:00', skill: 'Data Engineer' },
  { c: 'Raja',             cp: '16478609409',  ce: 'gnsmrjrmn@gmail.com',             cg: 'https://chat.whatsapp.com/EwgGQEMLjkXJZoOudmfuNA', t: 'Arun',          tp: '7338165435',   te: 'timsupt.ready@gmail.com',           tg: '',                                                 host: 'Muskan',  time: '21:00', skill: 'Java' },
  { c: 'Ramya',            cp: '18137169143',  ce: '',                                cg: 'https://chat.whatsapp.com/CWBag1KUket7t3HmHmo2kl', t: 'Manoj',         tp: '8074834527',   te: 'manojbharat1803@gmail.com',         tg: 'https://chat.whatsapp.com/HPhzqPjDg51CI0hUlAY9zE', host: 'Muskan',  time: '22:30', skill: 'Sage Reporting' },
  { c: 'Snehlatha',        cp: '919948989838', ce: 'thalakantisneha@gmail.com',       cg: 'https://chat.whatsapp.com/EfWmRbGwSmSFGc1sI1JhFr', t: 'Virendra',      tp: '9545787470',   te: '',                                  tg: 'https://chat.whatsapp.com/GVyvWoxkog14izy8o4eBSm', host: 'Muskan',  time: '06:00', skill: 'Salesforce' },
  { c: 'Training Vamshi',  cp: '13146882876',  ce: 'muppaneni565143n@gmail.com',      cg: 'https://chat.whatsapp.com/Jzpuqt7arkdIhlOzvuy7nw', t: 'Peet',          tp: '6290949166',   te: '',                                  tg: '',                                                 host: 'Muskan',  time: '09:00', skill: 'Data Engineer' },
];

seedRouter.post('/regular-trainings', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Founder only' });

  // ?dry=true → read-only preview — NO writes to DB
  const dryRun = req.query.dry === 'true';

  const hosts = await prisma.user.findMany({
    where: { name: { in: ['Kashish', 'Muskan', 'Bhavneet', 'Kashish Gupta', 'Muskan Maini'] } },
    select: { id: true, name: true },
  });
  const hostMap: Record<string, string> = {};
  for (const h of hosts) {
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
    const hostId = hostMap[row.host];
    if (!hostId) { log.push(`SKIP no host: ${row.c}`); skipped++; continue; }

    // Client
    const cp = fmtClientPhone(row.cp);
    const ce = row.ce && row.ce !== 'no email' ? row.ce.trim() : null;
    // Match by phone first (unique), then email, then name — prevents same-name clients from colliding
    let client = cp?.digits
      ? await prisma.client.findFirst({
          where: { phoneDigits: cp.digits },
          select: { id: true, name: true, email: true, phoneDigits: true, whatsappGroupLink: true },
        })
      : null;
    if (!client && ce) {
      client = await prisma.client.findFirst({
        where: { email: { equals: ce, mode: 'insensitive' } },
        select: { id: true, name: true, email: true, phoneDigits: true, whatsappGroupLink: true },
      });
    }
    if (!client) {
      client = await prisma.client.findFirst({
        where: { name: { equals: row.c, mode: 'insensitive' } },
        select: { id: true, name: true, email: true, phoneDigits: true, whatsappGroupLink: true },
      });
    }
    const cg = (row as any).cg || null;
    if (!client) {
      if (dryRun) {
        log.push(`[DRY] would CREATE client: ${row.c} | email: ${ce || '—'} | phone: ${cp?.digits || '—'} | group: ${cg || '—'}`);
        created++;
        // Use a placeholder so trainer/session checks below can still log
        client = { id: '__dry__', name: row.c, email: ce, phoneDigits: cp?.digits || null, whatsappGroupLink: cg } as any;
      } else {
        client = await prisma.client.create({
          data: {
            name: row.c, email: ce,
            phoneCode: cp?.code || '+1', phoneDigits: cp?.digits || null,
            lifecycle: 'Active', engagementType: 'Training', hostOwnerId: hostId,
            ...(cg ? { whatsappGroupLink: cg } : {}),
          },
          select: { id: true, name: true, email: true, phoneDigits: true, whatsappGroupLink: true },
        });
      }
    } else {
      const changes: string[] = [];
      if (ce && ce !== client.email) changes.push(`email: ${client.email || '—'} → ${ce}`);
      if (cp?.digits && cp.digits !== client.phoneDigits) changes.push(`phone: ${client.phoneDigits || '—'} → ${cp.digits}`);
      if (cg && cg !== client.whatsappGroupLink) changes.push(`group link: updated`);
      if (dryRun) {
        log.push(`[DRY] would UPDATE client: ${row.c}${changes.length ? ` | ${changes.join(' | ')}` : ' | no field changes'}`);
        updated++;
      } else {
        await prisma.client.update({
          where: { id: client.id },
          data: {
            ...(ce ? { email: ce } : {}),
            ...(cp ? { phoneCode: cp.code, phoneDigits: cp.digits } : {}),
            lifecycle: 'Active', hostOwnerId: hostId,
            ...(cg ? { whatsappGroupLink: cg } : {}),
          },
        });
        if (changes.length) log.push(`↺ updated client: ${row.c} | ${changes.join(' | ')}`);
      }
    }

    // Skip trainer + RegularTraining if no trainer assigned
    if (!row.t) { log.push(`${dryRun ? '[DRY] ' : ''}↺ client-only: ${row.c} (no trainer in sheet)`); if (!dryRun) updated++; continue; }

    // Trainer
    const tName = row.t.split('/')[0].trim();
    const tp = fmtTrainerPhone(row.tp);
    let trainer = await prisma.trainer.findFirst({
      where: { name: { equals: tName, mode: 'insensitive' } },
      select: { id: true, name: true, email: true, phoneDigits: true, whatsappGroupLink: true },
    });
    const tg = (row as any).tg || null;
    const te = (row as any).te && (row as any).te !== 'no email' ? (row as any).te.trim() : null;
    if (!trainer) {
      const phoneConflict = tp?.digits ? await prisma.trainer.findFirst({
        where: { phoneDigits: tp.digits },
        select: { id: true },
      }) : null;
      if (dryRun) {
        log.push(`[DRY] would CREATE trainer: ${tName} | email: ${te || '—'} | phone: ${!phoneConflict ? (tp?.digits || '—') : '⚠ phone conflict, skipped'} | group: ${tg || '—'}`);
        trainer = { id: '__dry__', name: tName, email: te, phoneDigits: tp?.digits || null, whatsappGroupLink: tg } as any;
      } else {
        trainer = await prisma.trainer.create({
          data: {
            name: tName,
            phoneCode: !phoneConflict ? (tp?.code || '+91') : '+91',
            phoneDigits: !phoneConflict ? (tp?.digits || null) : null,
            ...(te ? { email: te } : {}),
            ...(row.skill ? { skills: row.skill } : {}),
            ...(tg ? { whatsappGroupLink: tg } : {}),
          },
          select: { id: true, name: true, email: true, phoneDigits: true, whatsappGroupLink: true },
        });
      }
    } else {
      let phoneUpdate: { phoneCode?: string; phoneDigits?: string } = {};
      if (tp?.digits) {
        const phoneConflict = await prisma.trainer.findFirst({
          where: { phoneDigits: tp.digits, id: { not: trainer.id } },
          select: { id: true },
        });
        if (!phoneConflict) phoneUpdate = { phoneCode: tp.code, phoneDigits: tp.digits };
      }
      const tChanges: string[] = [];
      if (te && te !== trainer.email) tChanges.push(`email: ${trainer.email || '—'} → ${te}`);
      if (phoneUpdate.phoneDigits && phoneUpdate.phoneDigits !== trainer.phoneDigits) tChanges.push(`phone: ${trainer.phoneDigits || '—'} → ${phoneUpdate.phoneDigits}`);
      if (tg && tg !== trainer.whatsappGroupLink) tChanges.push(`group link: updated`);
      if (dryRun) {
        log.push(`[DRY] would UPDATE trainer: ${tName}${tChanges.length ? ` | ${tChanges.join(' | ')}` : ' | no field changes'}`);
      } else {
        await prisma.trainer.update({
          where: { id: trainer.id },
          data: {
            ...phoneUpdate,
            ...(te ? { email: te } : {}),
            ...(tg ? { whatsappGroupLink: tg } : {}),
          },
        });
      }
    }

    // RegularTraining — find by exact match first, then any active row for this client
    const clientId = client!.id;
    const trainerId = trainer!.id;
    // First try exact client+trainer match
    let existing = await prisma.regularTraining.findFirst({
      where: { clientId, trainerId, status: 'active' },
      select: { id: true },
    });
    // If no exact match, check if client already has ANY active RT (avoid creating duplicates on re-seed)
    if (!existing) {
      existing = await prisma.regularTraining.findFirst({
        where: { clientId, status: 'active' },
        select: { id: true },
      });
      if (existing) {
        // Client has an active session with a different trainer — update it to the new trainer
        if (dryRun) {
          log.push(`[DRY] would UPDATE session trainer: ${row.c} → ${tName} (${row.host} ${row.time})`);
          updated++;
        } else {
          await prisma.regularTraining.update({
            where: { id: existing.id },
            data: { trainerId, name: `${row.c} · ${tName}`, defaultTimeIst: row.time, hostedByDefaultId: hostId,
              ...(row.skill ? { notes: row.skill } : {}) },
          });
          log.push(`↺ updated session trainer: ${row.c} → ${tName}`);
          updated++;
        }
        continue;
      }
    }
    if (!existing) {
      if (dryRun) {
        log.push(`[DRY] would CREATE session: ${row.c} ← ${tName} (${row.host} ${row.time})`);
        created++;
      } else {
        await prisma.regularTraining.create({
          data: {
            name: `${row.c} · ${tName}`,
            clientId, trainerId,
            hostedByDefaultId: hostId, meetingMode: 'Zoom',
            defaultTimeIst: row.time, status: 'active',
            ...(row.skill ? { notes: row.skill } : {}),
          },
        });
        log.push(`✓ created: ${row.c} ← ${tName} (${row.host} ${row.time})`);
        created++;
      }
    } else {
      if (dryRun) {
        log.push(`[DRY] session exists: ${row.c} ← ${tName} (no changes needed)`);
        updated++;
      } else {
        await prisma.regularTraining.update({
          where: { id: existing.id },
          data: { defaultTimeIst: row.time, hostedByDefaultId: hostId },
        });
        log.push(`↺ updated: ${row.c} ← ${tName}`);
        updated++;
      }
    }
  }

  res.json({ ok: true, dryRun, created, updated, skipped, log });
});

// POST /api/seed/dedup — fix all duplicate data:
//   1. Sathiya → Saiteja name/phone/email fix
//   2. Merge spelling-variant client records (Meghana→Meghna, Snehlatha→Snehlata)
//   3. Remove duplicate active RegularTraining rows per client+trainer pair (keep oldest)
seedRouter.post('/dedup', async (req: AuthedRequest, res) => {
  if (req.user!.role !== 'founder') return res.status(403).json({ error: 'Founder only' });

  const log: string[] = [];
  let deleted = 0, fixed = 0;

  // 1. Fix Sathiya → Saiteja
  const sathiya = await prisma.client.findFirst({
    where: { name: { equals: 'Sathiya', mode: 'insensitive' } },
    select: { id: true, name: true },
  });
  if (sathiya) {
    await prisma.client.update({
      where: { id: sathiya.id },
      data: {
        name: 'Saiteja',
        email: 'Saitejats88@gmail.com',
        phoneCode: '+91',
        phoneDigits: '9348548056',
        whatsappGroupLink: 'https://chat.whatsapp.com/EInW8q2Ej749tuoI7AivM7',
      },
    });
    log.push(`✓ renamed client: Sathiya → Saiteja (phone + email + group link updated)`);
    fixed++;
  } else {
    log.push(`— Sathiya not found (already fixed or never existed)`);
  }

  // 2. Merge spelling-variant duplicate client records
  // These are separate DB rows that represent the same real person (typo in name)
  const SPELLING_MERGES: Array<{ keep: string; drop: string }> = [
    { keep: 'Meghna',    drop: 'Meghana' },
    { keep: 'Snehlata',  drop: 'Snehlatha' },
  ];
  for (const { keep, drop } of SPELLING_MERGES) {
    const keepClient = await prisma.client.findFirst({
      where: { name: { equals: keep, mode: 'insensitive' } },
      select: { id: true },
    });
    const dropClient = await prisma.client.findFirst({
      where: { name: { equals: drop, mode: 'insensitive' } },
      select: { id: true },
    });
    if (keepClient && dropClient) {
      // Move all RegularTraining rows from the duplicate to the canonical client
      await prisma.regularTraining.updateMany({
        where: { clientId: dropClient.id },
        data: { clientId: keepClient.id },
      });
      // Set the duplicate client dormant
      await prisma.client.update({ where: { id: dropClient.id }, data: { lifecycle: 'Dormant' as any } });
      log.push(`✓ merged "${drop}" → "${keep}" (sessions moved, duplicate set Dormant)`);
      fixed++;
    } else if (!keepClient && dropClient) {
      // Canonical name doesn't exist — just rename the typo version
      await prisma.client.update({ where: { id: dropClient.id }, data: { name: keep } });
      log.push(`✓ renamed client: "${drop}" → "${keep}"`);
      fixed++;
    } else {
      log.push(`— "${drop}" not found (already fixed or never existed)`);
    }
  }

  // 3. Merge duplicate Client records with the same name (same-name dedup)
  // When the seed ran multiple times, clients like "Bhargavi" got created twice.
  // Keep the oldest record, move all RegularTraining from newer duplicates to it, set extras Dormant.
  const allActiveClients = await prisma.client.findMany({
    where: { lifecycle: { in: ['Active', 'LeverageGranted'] } },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const clientsByName = new Map<string, typeof allActiveClients>();
  for (const c of allActiveClients) {
    const key = c.name.toLowerCase().trim();
    const group = clientsByName.get(key) || [];
    group.push(c);
    clientsByName.set(key, group);
  }
  for (const [, clients] of clientsByName) {
    if (clients.length <= 1) continue;
    // Keep oldest, merge rest into it
    const [keep, ...extras] = clients;
    for (const dup of extras) {
      await prisma.regularTraining.updateMany({
        where: { clientId: dup.id },
        data: { clientId: keep.id },
      });
      await prisma.client.update({ where: { id: dup.id }, data: { lifecycle: 'Dormant' as any } });
      log.push(`✓ merged duplicate client "${dup.name}" (${dup.id}) → kept ${keep.id}, set duplicate Dormant`);
      fixed++;
    }
  }

  // 4. Find and remove duplicate active RegularTraining rows per CLIENT+TRAINER pair
  // Each client should have at most ONE active session per trainer.
  // (Multiple trainers per client is valid — e.g. Nikhil with Raj AND Nikhil with Arun are two different clients)
  const allActive = await prisma.regularTraining.findMany({
    where: { status: 'active' },
    select: {
      id: true, clientId: true, trainerId: true, notes: true, createdAt: true,
      client: { select: { name: true } },
      trainer: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Group by clientId+trainerId — keep the oldest row (most likely to have session history), delete newer duplicates
  const byPair = new Map<string, typeof allActive>();
  for (const rt of allActive) {
    if (!rt.clientId) continue;
    const key = `${rt.clientId}::${rt.trainerId || 'none'}`;
    const group = byPair.get(key) || [];
    group.push(rt);
    byPair.set(key, group);
  }

  const toDelete: string[] = [];
  for (const [, rows] of byPair) {
    if (rows.length <= 1) continue;
    // Keep oldest (createdAt asc — already sorted), delete rest
    const [, ...rest] = rows;
    for (const r of rest) {
      toDelete.push(r.id);
      log.push(`✗ removed duplicate: ${r.client?.name} ← ${r.trainer?.name || '(no trainer)'} (keeping oldest)`);
      deleted++;
    }
  }
  if (toDelete.length > 0) {
    await prisma.regularTraining.deleteMany({ where: { id: { in: toDelete } } });
  }
  if (deleted === 0) log.push('— no duplicate sessions found');

  // 5. Re-sync hostOwnerId on clients + hostedByDefaultId on RT rows from RAW
  // After merging duplicates the oldest client record may have a stale/null hostOwnerId.
  // Walk RAW and patch every matched client + its active RT rows to the correct host.
  const hostUsers = await prisma.user.findMany({
    where: { role: { in: ['account_manager', 'lead', 'manager', 'founder'] } },
    select: { id: true, name: true },
  });
  const hostMapSync: Record<string, string> = {};
  for (const h of hostUsers) {
    const firstName = h.name.split(' ')[0];
    if (!hostMapSync[firstName]) hostMapSync[firstName] = h.id;
  }

  let synced = 0;
  for (const row of RAW) {
    const hostId = hostMapSync[row.host];
    if (!hostId) continue;
    const cp = fmtClientPhone(row.cp);
    const ce = row.ce && row.ce !== 'no email' ? row.ce.trim() : null;
    // Find the canonical client by phone → email → name
    let client = cp?.digits
      ? await prisma.client.findFirst({ where: { phoneDigits: cp.digits }, select: { id: true, name: true } })
      : null;
    if (!client && ce) {
      client = await prisma.client.findFirst({ where: { email: { equals: ce, mode: 'insensitive' } }, select: { id: true, name: true } });
    }
    if (!client) {
      client = await prisma.client.findFirst({ where: { name: { equals: row.c, mode: 'insensitive' } }, select: { id: true, name: true } });
    }
    if (!client) continue;

    // Patch client hostOwnerId + lifecycle
    await prisma.client.update({
      where: { id: client.id },
      data: { hostOwnerId: hostId, lifecycle: 'Active' },
    });
    // Patch all active RT rows for this client to correct hostedByDefaultId
    await prisma.regularTraining.updateMany({
      where: { clientId: client.id, status: 'active' },
      data: { hostedByDefaultId: hostId },
    });
    synced++;
  }
  log.push(`✓ re-synced host assignments for ${synced} clients`);

  res.json({ ok: true, deleted, fixed, synced, log });
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
      where: { sourceType: 'training', sourceId: rt.id },
      select: { id: true },
    });
    if (!existing) {
      await (prisma as any).retrospective.create({
        data: {
          sourceType: 'training',
          sourceId: rt.id,
          clientName: c.name,
          trainerName: rt.trainer?.name || '',
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
