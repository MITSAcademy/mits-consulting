const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

// GET /api/destinations
router.get('/destinations', (req, res) => {
  const db = getDb();
  const list = db.destinations.map((d) => ({
    ...d,
    packageCount: db.packages.filter((p) => p.destinationId === d.id).length,
    fromPrice: Math.min(
      ...db.packages.filter((p) => p.destinationId === d.id).map((p) => p.price),
      Infinity
    ),
  }));
  res.json({ destinations: list });
});

// GET /api/destinations/:id  -> destination + its packages
router.get('/destinations/:id', (req, res) => {
  const db = getDb();
  const destination = db.destinations.find((d) => d.id === req.params.id);
  if (!destination) return res.status(404).json({ error: 'Destination not found.' });
  const packages = db.packages.filter((p) => p.destinationId === destination.id);
  res.json({ destination, packages });
});

// GET /api/packages/:id  -> single package with full itinerary
router.get('/packages/:id', (req, res) => {
  const db = getDb();
  const pkg = db.packages.find((p) => p.id === req.params.id);
  if (!pkg) return res.status(404).json({ error: 'Package not found.' });
  const destination = db.destinations.find((d) => d.id === pkg.destinationId) || null;
  res.json({ package: pkg, destination });
});

module.exports = router;
