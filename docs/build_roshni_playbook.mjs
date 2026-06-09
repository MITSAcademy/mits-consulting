/**
 * One-shot script that generates a branded PDF playbook Vaibhav can hand to
 * Roshni. Mirrors the MITS engagement-letter style (Helvetica, brand palette,
 * cover page + section pages). Run with:
 *
 *   cd backend && node ../docs/build_roshni_playbook.mjs
 *
 * Output: docs/Roshni_Playbook.pdf
 */
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(new URL('.', import.meta.url).pathname, 'Roshni_Playbook.pdf');

const INK = '#1A1B1E';
const SUBTLE = '#6B6F78';
const LIGHT = '#f4f4f6';
const BORDER = '#cfcfd3';
const ACCENT = '#1A6CDF';
const GOOD = '#0F8A5F';
const WARN = '#B97400';
const BAD = '#B82A2A';

const doc = new PDFDocument({
  size: 'A4',
  margin: 56,
  info: {
    Title: 'MITS Hub — Playbook for Roshni',
    Author: 'MITS Solution Pvt Ltd',
    Subject: 'Step-by-step guide to handling RP clients in the MITS Consulting Hub',
  },
});
doc.pipe(fs.createWriteStream(OUT));

const W = doc.page.width;
const H = doc.page.height;
const LEFT = doc.page.margins.left;
const RIGHT = W - doc.page.margins.right;
const CW = RIGHT - LEFT;

// ── helpers ────────────────────────────────────────────────────────────
function h1(text) {
  doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text(text);
  doc.moveDown(0.3);
  doc.lineWidth(1).strokeColor(BORDER).moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).stroke();
  doc.moveDown(0.6);
}
function h2(text) {
  doc.moveDown(0.7);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(text);
  doc.moveDown(0.25);
}
function h3(text, color = ACCENT) {
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(color).text(text);
  doc.moveDown(0.15);
}
function p(text, opts = {}) {
  doc.font('Helvetica').fontSize(11).fillColor(INK).text(text, { width: CW, lineGap: 3, ...opts });
  doc.moveDown(0.3);
}
function bullet(text) {
  const x = doc.x;
  doc.font('Helvetica').fontSize(11).fillColor(INK)
    .text(`•  ${text}`, x, doc.y, { width: CW - (x - LEFT), lineGap: 3 });
  doc.moveDown(0.15);
}
function step(n, text) {
  const yStart = doc.y;
  doc.circle(LEFT + 8, yStart + 8, 9).fill(ACCENT);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
    .text(String(n), LEFT + 4, yStart + 4, { width: 16, align: 'center' });
  doc.fillColor(INK).font('Helvetica').fontSize(11)
    .text(text, LEFT + 26, yStart + 2, { width: CW - 26, lineGap: 3 });
  doc.moveDown(0.4);
}
function callout(title, body, color = WARN) {
  const yStart = doc.y;
  // measure
  const titleHeight = 18;
  doc.font('Helvetica').fontSize(10);
  const bodyHeight = doc.heightOfString(body, { width: CW - 24 });
  const totalHeight = titleHeight + bodyHeight + 14;
  // page-break if needed
  if (doc.y + totalHeight > H - 80) { doc.addPage(); }
  const y = doc.y;
  doc.rect(LEFT, y, CW, totalHeight).fill(LIGHT);
  doc.rect(LEFT, y, 4, totalHeight).fill(color);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(color)
    .text(title, LEFT + 14, y + 8, { width: CW - 24 });
  doc.font('Helvetica').fontSize(10).fillColor(INK)
    .text(body, LEFT + 14, y + 8 + titleHeight, { width: CW - 24, lineGap: 2 });
  doc.y = y + totalHeight + 6;
}
function tableTwo(rows) {
  const col1 = Math.floor(CW * 0.32);
  const col2 = CW - col1;
  const rowH = 22;
  for (const [k, v] of rows) {
    if (doc.y + rowH > H - 70) doc.addPage();
    const y = doc.y;
    doc.rect(LEFT, y, col1, rowH).fill(LIGHT);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10)
      .text(k, LEFT + 8, y + 6, { width: col1 - 16 });
    doc.rect(LEFT + col1, y, col2, rowH).stroke(BORDER);
    doc.font('Helvetica').fontSize(10).fillColor(INK)
      .text(v, LEFT + col1 + 8, y + 6, { width: col2 - 16 });
    doc.y = y + rowH;
  }
  doc.moveDown(0.3);
}
function pageBreak() { doc.addPage(); }
function footer() {
  const y = H - 50;
  doc.font('Helvetica').fontSize(8).fillColor(SUBTLE)
    .text('MITS Consulting · Playbook for Roshni · v1', LEFT, y, { width: CW, align: 'center' });
}

// ── COVER PAGE ─────────────────────────────────────────────────────────
doc.rect(0, 0, W, H).fill(INK);
doc.save();
doc.polygon([W, 0], [W, 140], [W - 220, 0]).fill('#3a3d44');
doc.restore();
doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(40).text('MITS', LEFT, 90);
doc.fontSize(28).text('CONSULTING HUB', LEFT, 140);
doc.font('Helvetica').fontSize(13).fillColor('#cfcfd3').text('M I T S  S o l u t i o n', LEFT, 178);

doc.font('Helvetica').fontSize(12).fillColor('#cfcfd3').text('Prepared for', LEFT, 320);
doc.font('Helvetica-Bold').fontSize(28).fillColor('#ffffff').text('Roshni Seth', LEFT, 338);
doc.font('Helvetica').fontSize(13).fillColor('#cfcfd3').text('Associate — Client Acquisition', LEFT, 378);

doc.font('Helvetica').fontSize(11).fillColor('#cfcfd3')
  .text('Step-by-step guide to using the MITS Hub for', LEFT, 460)
  .text('Ready-for-Payment (RP) clients, payment confirmation,', LEFT, 478)
  .text('handover to Mitali, and previous-client re-engagement.', LEFT, 496);

doc.font('Helvetica').fontSize(9).fillColor('#9aa0a6')
  .text('Updated June 2026 · v1 · Questions? Ping Vaibhav.', LEFT, H - 80);

pageBreak();

// ── PAGE: WELCOME + YOUR DAILY RHYTHM ──────────────────────────────────
h1('Welcome to the Hub');
p('Hi Roshni — this is a quick walk-through of how to use the MITS Consulting Hub for your daily work. Everything you used to do manually (call clients, send engagement letter, chase payment, hand over to Mitali) now has a button in the tool. This guide tells you which button to click, when, and what the system will do for you.');
p('Read this once end-to-end, then keep it open as a reference for the first few days. Once you have done the full flow on one or two real clients you will not need it anymore — it becomes muscle memory.');

callout('Your sign-in email', 'Sign in at the MITS Hub URL with your Google account: roshni.seth@mitssolution.com. The first time you sign in, the system will pop up a "Set up your App Password" modal — paste your 16-character Gmail App Password from myaccount.google.com/apppasswords. Without this, your engagement-letter emails will not go out.', ACCENT);

h2('Daily rhythm');
p('You have two shifts:');
bullet('Morning  6:00 AM – 10:00 AM IST');
bullet('Evening  6:00 PM – 11:00 PM IST');
p('Each shift, follow this loop:');
step(1, 'Open the Hub → click "My follow-ups" (under Sales in the sidebar).');
step(2, 'Work through the OVERDUE bucket first, then TODAY, then UPCOMING.');
step(3, 'For each client: tap the green WhatsApp icon or the Call icon → connect.');
step(4, 'After the call, click "Mark contacted" — it bumps the next-call date by 1 day and stamps your last-touch.');
step(5, 'For RP clients ready for payment, open the client → "Open call checklist" → tick the 10 items as you walk through them.');
step(6, 'Send the engagement letter (Email) + payment WhatsApp from the client page.');
step(7, 'When the screenshot lands → "Confirm payment received" → post in the payment-confirmation group.');
step(8, 'Once payment confirmed → "Rename group → Training / JBT" → hand the client over to Mitali.');

pageBreak();

// ── PAGE: THE FIVE SCENARIOS ───────────────────────────────────────────
h1('The five scenarios');
p('Every client you handle is one of five patterns. Pick the matching playbook below and follow it top to bottom.');

h2('A.  Happy path — client paid, ready to start');
h3('When', GOOD);
p('Demo went well. Client said yes on the call. You are now waiting for payment.');
h3('Steps', GOOD);
step(1, 'Open the client → Set sub-status to RP (Ready for Payment) with a next-call date 1-2 days out.');
step(2, 'Click "Open call checklist" → tick the 10 items live during your discussion call. Add a note per item if useful.');
step(3, 'Click "Engagement letter + handover" → choose Email. The system sends a branded email with the engagement letter PDF attached, CCs Mitali automatically, and creates a follow-up task on Mitali\'s queue for 1 day later.');
step(4, 'On WhatsApp (client\'s personal chat), paste your payment-discussion message with the bank/GPay details. The format is in the templates page below.');
step(5, 'Wait for screenshot. While you wait, the client appears in your "My follow-ups" queue with the date you set.');
step(6, 'Screenshot arrives → on the client page, click "Confirm payment received". Upload the screenshot, fill amount + bank, and the system auto-generates the message to post in the MITS payment-confirmation WhatsApp group.');
step(7, 'Click "Rename group → Training / JBT" → pick the type and confirm. The system suggests "Training {Client} {Trainer} Z" — edit if needed.');
step(8, 'Send the Mitali introduction message in the renamed group (text is pre-generated for you).');
step(9, 'Call the client to confirm handover. From here Mitali owns them.');

pageBreak();

h2('B.  Client not picking up — CP (Closure Pending)');
h3('When', WARN);
p('Client took a demo, sounded happy, but is not engaging on payment. You have tried calling, no response.');
h3('Steps', WARN);
step(1, 'Open the client → "Set sub-status" → pick CP (Closure Pending).');
step(2, 'Set "Next call on" — usually 2 days out, your choice.');
step(3, 'The system shows a Suggested WhatsApp message ("Hi {Client}, this is Roshni from MITS Solution, I tried reaching you..."). Click "Send via WhatsApp" — it opens WhatsApp with the message pre-filled.');
step(4, 'After 3 working days / 6 missed attempts (morning + evening), if still no response, leave them at CP and keep trying.');
step(5, 'If they confirm they are NOT proceeding, switch sub-status to C (see Scenario C).');
step(6, 'If they come back and want to proceed, switch sub-status to RP and follow Scenario A.');

callout('How CP differs from C', 'CP = silent client. They have not said no, they are just not responding. Keep trying.\nC = client confirmed not starting. They explicitly said no. Stop trying.', BAD);

pageBreak();

h2('C.  Client confirmed not starting');
h3('When', BAD);
p('Client explicitly told you they are not going ahead — change of plans, found another vendor, budget, whatever.');
h3('Steps', BAD);
step(1, 'Open the client → "Set sub-status" → pick C (Not starting).');
step(2, 'Add a short note in the "Reason" field (e.g. "Found another vendor", "Budget pushed to next quarter").');
step(3, 'Save. The system clears their next-call date so they drop out of your follow-up queue.');
step(4, 'No more action needed from your side. If they ever come back, you can switch sub-status back to RP.');

h2('D.  Previous client — re-engagement');
h3('When', ACCENT);
p('A client who took services from us in the past, or showed interest earlier, comes back or is worth checking on.');
h3('Steps', ACCENT);
step(1, 'Use the search bar at the top to find the client by name or phone.');
step(2, 'Open their page → check Demo History + Messages History to refresh context.');
step(3, 'WhatsApp/call them with your re-engagement message:');
p('   "Hello Sir/Ma\'am, I hope you are doing well. This is Roshni from MITS Team regarding your earlier ask for training and support. I would like to discuss our current offerings and how we work. Feel free to give me a call back at your convenience."', { width: CW, indent: 12 });
step(4, 'If they want a fresh demo: open the client and click "Pull back · re-search internal" or "Back to recruiters" so Anjali/Taran or Aman/Kanchan can re-source.');
step(5, 'If they want to skip the demo and go straight to payment, mark them RP and follow Scenario A.');

pageBreak();

h2('E.  Renewal approaching — keep existing clients on');
h3('When', GOOD);
p('Active clients whose cycle is ending in the next 14 days. Your job is to make sure they renew before the cycle ends so we do not lose them.');
h3('Steps', GOOD);
step(1, 'My follow-ups page → scroll past the RP/CP sections → "Renewals approaching" panel.');
step(2, 'Three buckets: Overdue (red, act now), Due this week (amber), Due in 7-14 days (grey).');
step(3, 'For each: tap the green WhatsApp or Call icon → confirm continuation, share next-cycle terms if anything changes.');
step(4, 'Renewal recorded as a "Renewal" payment by Aman/Areena once it lands — you just keep the conversation going.');

callout('Active clients without renewal date', 'You will sometimes see an amber-bordered section "Active clients without renewal date". This means Mitali\'s team forgot to set the next renewal date when activating. Ping Mitali to fill it in — until she does, those clients are invisible to the renewal queue.', WARN);

pageBreak();

// ── PAGE: SCREEN-BY-SCREEN ─────────────────────────────────────────────
h1('Screen-by-screen tour');

h2('Sidebar (left nav)');
tableTwo([
  ['Home', 'High-level money + ops dashboard. Founder/manager view; you can ignore.'],
  ['Sales close', 'List of every client at SaleClosing / SaleWon. Use this when you want to see the whole pipeline at once.'],
  ['Fresh payments', 'List of payments recorded today / this week. Useful for cross-checking with Areena.'],
  ['My follow-ups', 'YOUR daily queue. Open this first every shift. Has Overdue / Today / Upcoming / Renewals.'],
  ['Renewals', 'Read-only list of every active client with a renewal date. Use for forward planning.'],
  ['Templates', 'Read-only library of all the email/WhatsApp templates the system uses.'],
  ['Audit log', 'History of every action in the tool. Use to investigate "who clicked this".'],
]);

h2('Client detail page — Roshni\'s buttons');
tableTwo([
  ['Set sub-status', 'Mark the client RP, CP, or C. Required for them to show in My follow-ups.'],
  ['Open call checklist', '10-point list to walk through on your discussion call. Tick + add notes.'],
  ['Engagement letter + handover', 'Sends the branded email with PDF, CCs Mitali, creates Mitali\'s task. ONE button does all of it.'],
  ['Confirm payment received', 'Upload screenshot, auto-generates the coordination message for the payment-confirmation group.'],
  ['Rename group → Training / JBT', 'Suggests the right group name. Available only after payment is recorded.'],
  ['Fresh payment', 'Manually record the payment row (Areena usually does this). Sums into freshPaymentAmount automatically.'],
]);

callout('When a button is greyed out', 'Click it anyway. The system now shows you a popup explaining what is missing (e.g. "Add a Reason at the top OR write feedback for at least one trainer below"). No more guessing.', ACCENT);

pageBreak();

// ── PAGE: TEMPLATES CHEAT SHEET ────────────────────────────────────────
h1('Templates cheat sheet');
p('These are the messages the system auto-generates. You will see them in the relevant modal — review, edit if needed, send. You do not have to memorise the wording.');

h2('1.  Payment-discussion WhatsApp (client personal)');
p('Sent after the call where you finalize package terms. Use the bank details from the engagement letter email.', { lineGap: 2 });
p('Hi Sir,\n\nI hope this message finds you well. Here are the details for the support package:\n\n1 month support, 650 USD, 2 hours every day session, 5 days a week, Mon till Friday, Bi-weekly payment (325 USD)\n\nPls utilize sessions in next 2 weeks.\n\n[Account details follow as per the engagement letter]', { lineGap: 2 });

h2('2.  No-pickup follow-up (CP path, auto-generated)');
p('Hi {ClientName},\n\nThis is Roshni from MITS Solution. I tried reaching you today regarding the next steps on your demo with {TrainerName}.\n\nCould you please confirm a convenient time so we can finalize the schedule and payment details?\n\nI\'ll try reaching you again on {NextCallDate}.\n\nBest regards,\nRoshni\n+91 62835 05780', { lineGap: 2 });

h2('3.  Internal coordination — payment confirmation group');
p('Support: "{Client} closed at {amount} usd, {duration} support, {hours} hour, paid {paidStatus} ({paidAmount} usd), {cadence} payment, {date}."', { lineGap: 2 });
p('Training: "{Client} closed at {amount} usd for {duration} training, paid {paidStatus}, {date}."', { lineGap: 2 });

h2('4.  Mitali introduction message (in renamed group)');
p('I am pleased to introduce Miss Mitali as your primary contact for managing any issues or escalations going forward.\n\nMs. Mitali serves as our dedicated Client Service Manager and is available to assist you with inquiries or support related to our services. Please feel free to reach out to her directly for any assistance you may require.\n\nYou can contact Ms. Mitali at +91 9779530773.\n\nThank you,', { lineGap: 2 });

pageBreak();

// ── PAGE: COMMON QUESTIONS + ESCALATION ────────────────────────────────
h1('Common questions');

h3('"The system says my email failed to send."');
p('Open Settings → My email and confirm your Gmail App Password is saved. If it is, regenerate one at myaccount.google.com/apppasswords and paste the new 16-character code. If still failing, ping Vaibhav.');

h3('"I clicked Send but nothing happened."');
p('Check the toast notifications (bottom right). The button now tells you why if it is disabled — hover or click it to see the reason.');

h3('"I see a CP client but they are not on my queue."');
p('Their next-call date is probably blank. Open them → Set sub-status → fill the "Next call on" date and save. They will appear in My follow-ups instantly.');

h3('"Engagement letter went out but no PDF attached."');
p('Check the audit log entry for that send — it shows "pdf attached: yes/no". If "no", the PDF generation failed (rare). Re-send by clicking the button again — the email goes through with the PDF attached on retry. If it keeps failing, ping Vaibhav.');

h3('"Can I see all the trainers in the pool?"');
p('Yes — sidebar → Trainer pool. You will not normally use this; Aman/Kanchan and Anjali/Taran manage trainers. But you can look up phone numbers and skills if needed.');

h3('"I picked C by mistake — how do I undo?"');
p('Open the client → Set sub-status → pick "Clear sub-status" (the last radio). Then re-pick the correct one. Audit log keeps the trail.');

h2('Who to ping');
tableTwo([
  ['Tool not working', 'Vaibhav'],
  ['Trainer details / availability', 'Aman or Kanchan'],
  ['Demo went badly, need to re-source', 'Anjali or Taran'],
  ['Active-client issues, post-handover questions', 'Mitali'],
  ['Payment cross-check, bank queries', 'Areena'],
  ['App Password / login problems', 'Vaibhav'],
]);

callout('When unsure, just ask', 'Better to ask Vaibhav in 30 seconds than to guess and undo it later. The audit log captures everything so we can always trace and fix mistakes — but the cleanest path is to ask first when in doubt.', ACCENT);

footer();

doc.end();
console.log('Wrote:', OUT);
