const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb, save } = require('../db');
const { signToken, requireAuth, publicUser } = require('../auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/signup  -> create a profile
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are all required.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const db = getDb();
  const normalizedEmail = String(email).trim().toLowerCase();
  if (db.users.some((u) => u.email === normalizedEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  save();

  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const db = getDb();
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db.users.find((u) => u.email === normalizedEmail);
  if (!user) {
    return res.status(401).json({ error: 'No account found with that email. Please sign up first.' });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Incorrect password. Please try again.' });
  }
  const token = signToken(user);
  res.json({ token, user: publicUser(user) });
});

// GET /api/auth/me  -> current profile
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
