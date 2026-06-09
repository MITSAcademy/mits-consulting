// Simple JSON-file backed data store. No external DB needed.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_DB = {
  users: [],
  destinations: [],
  packages: [],
  bookings: [],
  emails: [], // mock "sent" emails (outbox)
};

let cache = null;

function load() {
  if (cache) return cache;
  ensureDir();
  if (fs.existsSync(DB_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      // make sure all collections exist
      for (const key of Object.keys(DEFAULT_DB)) {
        if (!cache[key]) cache[key] = [];
      }
    } catch (e) {
      cache = JSON.parse(JSON.stringify(DEFAULT_DB));
    }
  } else {
    cache = JSON.parse(JSON.stringify(DEFAULT_DB));
    save();
  }
  return cache;
}

function save() {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(cache, null, 2));
}

function getDb() {
  return load();
}

module.exports = { getDb, save, DB_FILE };
