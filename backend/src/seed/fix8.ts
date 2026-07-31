import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixByEmail(email: string, pd1: string | null, pd2: string | null, freq: string, label: string) {
  const c = await prisma.client.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, name: true } });
  if (!c) { console.log(`✗ NOT FOUND by email: ${email} (${label})`); return; }
  await prisma.client.update({ where: { id: c.id }, data: { payDate1: pd1, payDate2: pd2, paymentFrequency: freq } });
  console.log(`✓ ${label} / ${c.name}: → ${pd1||'null'} / ${pd2||'null'} [${freq}]`);
}

async function fixByPhone(phone: string, pd1: string | null, pd2: string | null, freq: string, label: string) {
  // phone digits only, match against phoneCode+phoneDigits or stored formats
  const digits = phone.replace(/\D/g, '');
  const all = await prisma.client.findMany({ select: { id: true, name: true, phoneCode: true, phoneDigits: true } });
  const match = all.find(c => {
    const full = ((c.phoneCode || '') + (c.phoneDigits || '')).replace(/\D/g, '');
    return full === digits || full.endsWith(digits) || digits.endsWith(full);
  });
  if (!match) { console.log(`✗ NOT FOUND by phone: ${phone} (${label})`); return; }
  await prisma.client.update({ where: { id: match.id }, data: { payDate1: pd1, payDate2: pd2, paymentFrequency: freq } });
  console.log(`✓ ${label} / ${match.name}: → ${pd1||'null'} / ${pd2||'null'} [${freq}]`);
}

async function main() {
  console.log('=== fix8: email/phone-based exact Excel sync ===\n');

  // Row 2: Nikhil Amit
  await fixByEmail('nikhil.t1405@gmail.com',          '2026-06-30', '2026-07-14', 'biweekly', 'Nikhil Amit');
  // Row 3: Saiteja
  await fixByEmail('masvolks2@gmail.com',              '2026-07-10', '2026-07-26', 'biweekly', 'Saiteja');
  // Row 4: Akhil Cerner (monthly)
  await fixByEmail('akhilsai9700547755@gmail.com',     '2026-07-21', null,          'monthly',  'Akhil Cerner');
  // Row 5: Methan
  await fixByEmail('mathan2bala@gmail.com',            '2026-07-21', '2026-07-28', 'biweekly', 'Methan');
  // Row 6: Harshita
  await fixByEmail('harshithabarupati7@gmail.com',     '2026-07-26', '2026-08-09', 'biweekly', 'Harshita');
  // Row 7: Bipana
  await fixByEmail('bipana.dreamgirl@gmail.com',       '2026-07-29', '2026-08-12', 'biweekly', 'Bipana');
  // Row 8: Rahul
  await fixByEmail('rahul122087@gmail.com',            '2026-07-29', '2026-08-12', 'biweekly', 'Rahul');
  // Row 9: Sunny
  await fixByEmail('dasarishrish@gmail.com',           '2026-07-29', '2026-08-12', 'biweekly', 'Sunny');
  // Row 10: Bhavik (30 Jul / 14 Aug)
  await fixByEmail('bhavik88m@gmail.com',              '2026-07-30', '2026-08-14', 'biweekly', 'Bhavik[1st]');
  // Row 11: Sai Shivani
  await fixByEmail('saishivanireddy8660@gmail.com',    '2026-07-30', '2026-08-13', 'biweekly', 'Sai Shivani');
  // Row 12: Naveena
  await fixByEmail('sunatangella@gmail.com',           '2026-08-01', '2026-08-15', 'biweekly', 'Naveena');
  // Row 13: Nikhit
  await fixByEmail('nikithrao734@gmail.com',           '2026-08-01', '2026-08-05', 'biweekly', 'Nikhit');
  // Row 14: Shiva
  await fixByEmail('chaykolla@gmail.com',              '2026-08-01', '2026-08-08', 'biweekly', 'Shiva');
  // Row 15: Saipriya/Ganesh
  await fixByEmail('priyachw06@gmail.com',             '2026-08-02', '2026-08-16', 'biweekly', 'Saipriya/Ganesh');
  // Row 16: Chandrika
  await fixByEmail('cmaccha11gmail.com',               '2026-08-03', '2026-08-10', 'biweekly', 'Chandrika');
  // Row 17: Naman
  await fixByEmail('namanmodi39@gmail.com',            '2026-08-03', '2026-08-17', 'biweekly', 'Naman');
  // Row 18: Nikhil / Greeshu
  await fixByEmail('nikhilreddyt1@gmail.com',          '2026-08-04', '2026-08-18', 'biweekly', 'Nikhil/Greeshu');
  // Row 19: Pradeep
  await fixByEmail('pradeepm22886150@gmail.com',       '2026-08-04', '2026-08-18', 'biweekly', 'Pradeep');
  // Row 20: Raj
  await fixByEmail('venraj353@gmail.com',              '2026-08-04', '2026-08-18', 'biweekly', 'Raj');
  // Row 21: Sujath
  await fixByEmail('shuja644@gmail.com',               '2026-08-04', '2026-08-11', 'biweekly', 'Sujath');
  // Row 22: Sirisha testing
  await fixByEmail('jarpala.sirisha@gmail.com',        '2026-08-05', '2026-08-19', 'biweekly', 'Sirisha testing');
  // Row 23: Training Pravallika
  await fixByEmail('pravallika560@gmail.com',          '2026-08-05', '2026-08-12', 'biweekly', 'Pravallika');
  // Row 24: Bhavik (6 Aug / 20 Aug) — same email as row 10, use phone
  await fixByPhone('+16268880257',                     '2026-08-06', '2026-08-20', 'biweekly', 'Bhavik[2nd]');
  // Row 25: Indu
  await fixByEmail('velivelliindupriya2002@gmail.com', '2026-08-06', '2026-08-20', 'biweekly', 'Indu');
  // Row 26: Ashrith
  await fixByEmail('kalki3055@gmail.com',              '2026-08-07', '2026-08-21', 'biweekly', 'Ashrith');
  // Row 27: Meghna (7 Aug / 21 Aug)
  await fixByEmail('meghanavarayuri@gmail.com',        '2026-08-07', '2026-08-21', 'biweekly', 'Meghna[1st]');
  // Row 28: Satvik arun (monthly)
  await fixByEmail('satvikmallempudi196@gmail.com',    '2026-08-07', null,          'monthly',  'Satvik arun');
  // Row 29: Yashwanthi
  await fixByEmail('yashwanthiky@gmail.com',           '2026-08-07', '2026-08-21', 'biweekly', 'Yashwanthi');
  // Row 30: Lallitha Jadhav (monthly)
  await fixByEmail('lalithaazure18@gmail.com',         '2026-08-09', null,          'monthly',  'Lallitha Jadhav');
  // Row 31: Yaswanth
  await fixByEmail('yeshwanth.reddy166@gmail.com',    '2026-08-09', '2026-08-23', 'biweekly', 'Yaswanth');
  // Row 32: Sirija
  await fixByEmail('srijamaramgantireddy@gmail.com',  '2026-08-10', '2026-08-24', 'biweekly', 'Sirija');
  // Row 33: Sruthi (monthly)
  await fixByEmail('jshruthi97@gmail.com',             '2026-08-10', null,          'monthly',  'Sruthi');
  // Row 34: Veer
  await fixByEmail('veeranji0023@gmail.com',           '2026-08-10', '2026-08-24', 'biweekly', 'Veer');
  // Row 35: Ambika (monthly)
  await fixByEmail('ambika.bathini@gmail.com',         '2026-08-11', null,          'monthly',  'Ambika');
  // Row 36: Amrutha
  await fixByEmail('aamrithac29@gmail.com',            '2026-08-11', '2026-08-25', 'biweekly', 'Amrutha');
  // Row 37: Raja (monthly, CAD)
  await fixByEmail('gnsnrjrmn@gmail.com',              '2026-08-11', null,          'monthly',  'Raja');
  // Row 38: Pawan
  await fixByEmail('pawansaikolagani211@gmail.com',    '2026-08-12', '2026-08-24', 'biweekly', 'Pawan');
  // Row 39: Vandhana
  await fixByEmail('vandhana2329@gmail.com',           '2026-08-12', '2026-08-26', 'biweekly', 'Vandhana');
  // Row 40: Teju (monthly)
  await fixByEmail('tejaswinipenchala@gmail.com',      '2026-08-15', null,          'monthly',  'Teju');
  // Row 41: Rohit (monthly)
  await fixByEmail('rohit.godugu92@gmail.com',         '2026-08-17', null,          'monthly',  'Rohit');
  // Row 42: Priyanka shivansh (monthly)
  await fixByEmail('priyankadantuluri94@gmail.com',    '2026-08-20', null,          'monthly',  'Priyanka shivansh');
  // Row 43: Meghna (23 Aug, monthly)
  await fixByEmail('meghnakatta26@gmail.com',          '2026-08-23', null,          'monthly',  'Meghna[2nd]');
  // Row 44: Sharon Gforce (monthly)
  await fixByEmail('sharonamalan2707@gmail.com',       '2026-08-27', null,          'monthly',  'Sharon Gforce');
  // Row 45: Anurag Jadhav (monthly)
  await fixByEmail('anuragmandapati@gmail.com',        '2026-08-31', null,          'monthly',  'Anurag Jadhav');
  // Row 46: Training Pramod (monthly)
  await fixByEmail('pramodchamlingrai@gmail.com',      '2026-08-31', null,          'monthly',  'Training Pramod');
  // Row 47: Training Sathvik (NA)
  await fixByEmail('sathvikreddy1210@gmail.com',       null,          null,          'na',       'Training Sathvik');
  // Row 48: Training Scada Shalini (NA)
  await fixByEmail('shalini123.dl@gmail.com',          null,          null,          'na',       'Training Shalini');
  // Row 49: Training Testing Deepthi (NA)
  await fixByEmail('deeptikollu7@gmail.com',           null,          null,          'na',       'Training Deepthi');

  console.log('\n=== Done ===');
}
main().catch(console.error).finally(() => prisma.$disconnect());
