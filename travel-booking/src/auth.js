const jwt = require('jsonwebtoken');
const { getDb } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'wanderlust-dev-secret-change-me';
const TOKEN_TTL = '7d';

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Strips sensitive fields before returning a user to the client.
function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

// Express middleware: requires a valid bearer token.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = db.users.find((u) => u.id === payload.sub);
    if (!user) return res.status(401).json({ error: 'Session invalid. Please log in again.' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

module.exports = { signToken, requireAuth, publicUser, JWT_SECRET };
