import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const TEMPLATES = [
  // ─── Trainer templates ────────────────────────────────────────────────────
  {
    id: 'trainer-reminder',
    kind: 'WhatsApp',
    stage: 'trainer',
    name: 'Trainer — Reminder (30 min)',
    subject: null,
    body: `Reminder:\n\nJust a quick reminder that we will be connecting with you in 30 minutes for our planned meeting.`,
  },
  {
    id: 'trainer-next-slot',
    kind: 'WhatsApp',
    stage: 'trainer',
    name: 'Trainer — Next Slot',
    subject: null,
    body: `Next Slot:\n\nYour upcoming session is confirmed for {{session_date}} at {{session_time}} IST. Please be ready to join.`,
  },
  {
    id: 'trainer-payment-sheet',
    kind: 'WhatsApp',
    stage: 'trainer',
    name: 'Trainer — Payment Sheet',
    subject: null,
    body: `Payment Sheet:\n\nHi,\n\nI hope you're doing well.\n\nBefore we proceed with the payments, could you please provide a summary of the total number of sessions conducted last week? This information will help us ensure accurate payment processing.\n\nAdditionally, due to some recent restrictions with UPI payments, we're transitioning to processing all payments directly into bank accounts. In light of this, could you please provide the following details at your earliest convenience:\n\nName:\nBank Account Number:\nIFSC Code:\nEmail ID:\nPhone Number:\nPAN (Optional):\n\nYour prompt response would be greatly appreciated as we aim to expedite the payment process. Additionally, please note that payments for the previous week's sessions will be disbursed every Wednesday by the end of the day.\n\nThank you for your cooperation and understanding.\n\nBest regards,`,
  },
  {
    id: 'trainer-overview',
    kind: 'WhatsApp',
    stage: 'trainer',
    name: 'Trainer — Session Overview',
    subject: null,
    body: `Overview:\n\nHi,\n\nPlease provide today's session summary along with the work completed in the session.\n\nThanks.`,
  },

  // ─── Client WhatsApp templates ────────────────────────────────────────────
  {
    id: 'client-wa-reminder',
    kind: 'WhatsApp',
    stage: 'client',
    name: 'Client — Reminder (30 min)',
    subject: null,
    body: `Hi,\n\nJust a quick reminder that we will be connecting with you in 30 minutes for our planned meeting.\n\nThank you.\n— Team MITS Solution`,
  },
  {
    id: 'client-wa-next-slot',
    kind: 'WhatsApp',
    stage: 'client',
    name: 'Client — Next Slot',
    subject: null,
    body: `Hi,\n\nYour upcoming session is confirmed for {{session_date}} at {{session_time}} IST. Please be ready to join the session at the scheduled time.\n\nThank you.\n— Team MITS Solution`,
  },
  {
    id: 'client-wa-feedback',
    kind: 'WhatsApp',
    stage: 'client',
    name: 'Client — Feedback Request',
    subject: null,
    body: `Hi,\n\nWe hope you found today's session valuable.\n\nYour feedback is important to us. Kindly share your review here:\nhttps://share.google/Rw2Nn8fwUGBJhGYdr\n\nIf any follow-up is required, please let us know.\n\nFor escalations:\nLevel 1 – Bhavneet: +91 62833 324835\nLevel 2 – Mitali: +91 97795 30773\n\nThank you.\n— Team MITS Solution`,
  },
  {
    id: 'client-wa-session-summary',
    kind: 'WhatsApp',
    stage: 'client',
    name: 'Client — Session Summary',
    subject: null,
    body: `Hi,\n\nHere's an overview of what we worked on in today's session:\n\n{{session_summary}}\n\nThank you.\n— Team MITS Solution`,
  },

  // ─── Client Email template ────────────────────────────────────────────────
  {
    id: 'client-email-onboarding',
    kind: 'Email',
    stage: 'client',
    name: 'Client — Meeting Invitation',
    subject: 'Meeting Invitation and Support Information',
    body: `Greetings from MITS Solution!!\n\nDear Sir/Madam,\n\nI hope this email finds you well. We are excited to schedule your upcoming meeting.\n\nMeeting Details:\nThe meeting details will be shared in the group at the time of the call.\n\nPlease click on the meeting link at the scheduled time to join the virtual meeting. We will be using Zoom/WebEx/Google Meet for our conversation.\n\nIf you encounter any issues, please contact the respective teams:\n1. For general assistance or issues, send an email to supportl1@mitssolution.com.\n2. If you have any complaints, reach out to our customer support manager at supportl2@mitssolution.com.\n3. For payment-related enquiries or problems, you can contact our payment team at payment@mitssolution.com.\n\nRegards,\nDelivery Team\nMITS Solution`,
  },
];

async function main() {
  console.log('Seeding templates…');
  for (const tpl of TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where: { id: tpl.id },
      update: { kind: tpl.kind, stage: tpl.stage, name: tpl.name, subject: tpl.subject, body: tpl.body, variables: extractVars(tpl.body + ' ' + (tpl.subject || '')) },
      create: { id: tpl.id, kind: tpl.kind, stage: tpl.stage, name: tpl.name, subject: tpl.subject, body: tpl.body, variables: extractVars(tpl.body + ' ' + (tpl.subject || '')) },
    });
    console.log(`  ✓ ${tpl.name}`);
  }
  console.log('Done.');
}

function extractVars(s: string): string[] {
  const set = new Set<string>();
  const re = /\{\{(\w+)\}\}/g;
  let m;
  while ((m = re.exec(s))) set.add(`{{${m[1]}}}`);
  return Array.from(set);
}

main().catch(console.error).finally(() => prisma.$disconnect());
