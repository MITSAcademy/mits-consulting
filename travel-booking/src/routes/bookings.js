const express = require('express');
const crypto = require('crypto');
const { getDb, save } = require('../db');
const { requireAuth } = require('../auth');
const { sendMail } = require('../mailer');

const router = express.Router();

// All booking routes require login.
router.use(requireAuth);

function bookingReference() {
  return 'WL-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function formatMoney(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Decorates a stored booking with package + destination details for the client.
function expand(db, booking) {
  const pkg = db.packages.find((p) => p.id === booking.packageId) || null;
  const destination = pkg ? db.destinations.find((d) => d.id === pkg.destinationId) || null : null;
  const now = new Date();
  const travel = new Date(booking.travelDate);
  const status = travel >= new Date(now.toDateString()) ? 'upcoming' : 'completed';
  return { ...booking, status, package: pkg, destination };
}

// GET /api/bookings  -> current + previous bookings for the logged-in user
router.get('/', (req, res) => {
  const db = getDb();
  const mine = db.bookings
    .filter((b) => b.userId === req.user.id)
    .map((b) => expand(db, b))
    .sort((a, b) => new Date(b.bookingDate) - new Date(a.bookingDate));

  const current = mine.filter((b) => b.status === 'upcoming');
  const previous = mine.filter((b) => b.status === 'completed');
  res.json({ current, previous, all: mine });
});

// GET /api/bookings/:id  -> single booking / receipt
router.get('/:id', (req, res) => {
  const db = getDb();
  const booking = db.bookings.find((b) => b.id === req.params.id && b.userId === req.user.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  res.json({ booking: expand(db, booking) });
});

// POST /api/bookings  -> mock payment + create booking + send confirmation email
router.post('/', (req, res) => {
  const { packageId, travelers, travelDate, payment } = req.body || {};
  const db = getDb();

  const pkg = db.packages.find((p) => p.id === packageId);
  if (!pkg) return res.status(404).json({ error: 'Selected package no longer exists.' });

  const numTravelers = Math.max(1, parseInt(travelers, 10) || 1);
  if (!travelDate) return res.status(400).json({ error: 'Please choose a travel date.' });

  // ---- Mock payment validation (NOT a real charge) ----
  const p = payment || {};
  const cardNumber = String(p.cardNumber || '').replace(/\s+/g, '');
  const cvv = String(p.cvv || '');
  if (!p.cardName || !/^\d{12,19}$/.test(cardNumber) || !/^\d{3,4}$/.test(cvv) || !p.expiry) {
    return res.status(400).json({ error: 'Please enter valid (test) card details to simulate payment.' });
  }

  const total = pkg.price * numTravelers;
  const destination = db.destinations.find((d) => d.id === pkg.destinationId) || null;

  const booking = {
    id: crypto.randomUUID(),
    reference: bookingReference(),
    userId: req.user.id,
    packageId: pkg.id,
    packageTitle: pkg.title,
    destinationName: destination ? destination.name : '',
    travelers: numTravelers,
    pricePerPerson: pkg.price,
    total,
    currency: 'USD',
    travelDate,
    bookingDate: new Date().toISOString(),
    payment: {
      method: 'Card',
      cardName: p.cardName,
      last4: cardNumber.slice(-4),
      status: 'paid',
    },
  };

  db.bookings.push(booking);
  save();

  // ---- Mock confirmation email ----
  const emailBody = [
    `Hi ${req.user.name},`,
    '',
    `Your booking is confirmed! Here are your details:`,
    '',
    `Booking reference: ${booking.reference}`,
    `Package: ${pkg.title} (${destination ? destination.name : ''})`,
    `Duration: ${pkg.nights} nights / ${pkg.days} days`,
    `Travellers: ${numTravelers}`,
    `Travel date: ${new Date(travelDate).toDateString()}`,
    `Amount paid: ${formatMoney(total)} (card ending ${booking.payment.last4})`,
    '',
    `Your receipt is available anytime in your profile under "My Bookings".`,
    '',
    'Bon voyage!',
    'The Wanderlust Travel Team',
  ].join('\n');

  const email = sendMail({
    userId: req.user.id,
    to: req.user.email,
    subject: `Booking Confirmed \u2013 ${pkg.title} (${booking.reference})`,
    body: emailBody,
    meta: { bookingId: booking.id, reference: booking.reference },
  });

  res.status(201).json({
    booking: expand(db, booking),
    emailSentTo: email.to,
  });
});

module.exports = router;
