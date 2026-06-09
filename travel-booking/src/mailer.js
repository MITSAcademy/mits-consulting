// Mock mailer: instead of sending real email, it records the message in the
// DB "outbox" and logs it to the console. The frontend reads these to show the
// user that a confirmation email was "sent".
const crypto = require('crypto');
const { getDb, save } = require('./db');

function sendMail({ userId, to, subject, body, meta }) {
  const db = getDb();
  const email = {
    id: crypto.randomUUID(),
    userId,
    to,
    subject,
    body,
    meta: meta || null,
    sentAt: new Date().toISOString(),
  };
  db.emails.push(email);
  save();
  // eslint-disable-next-line no-console
  console.log(`\n[MOCK EMAIL] To: ${to}\nSubject: ${subject}\n${body}\n`);
  return email;
}

module.exports = { sendMail };
