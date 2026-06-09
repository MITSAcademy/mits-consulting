const express = require('express');
const path = require('path');
const { seed } = require('./src/seed');

const authRoutes = require('./src/routes/auth');
const catalogRoutes = require('./src/routes/catalog');
const bookingRoutes = require('./src/routes/bookings');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// Seed sample destinations/packages on boot (only if empty).
const stats = seed();
// eslint-disable-next-line no-console
console.log(`Seed ready: ${stats.destinations} destinations, ${stats.packages} packages.`);

// API
app.use('/api/auth', authRoutes);
app.use('/api', catalogRoutes);
app.use('/api/bookings', bookingRoutes);

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to login page for unknown non-API routes.
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`\nWanderlust Travel running at http://localhost:${PORT}\n`);
});
