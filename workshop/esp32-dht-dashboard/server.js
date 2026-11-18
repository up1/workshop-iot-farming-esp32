const express = require('express');
const path = require('node:path');
const db = require('./db');

const PORT = Number(process.env.PORT) || 3000;
// Shared secret the ESP32 must send in the "x-api-key" header.
// Set your own:  API_KEY=mysecret node server.js
const API_KEY = process.env.API_KEY || 'change-me';

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- API ----------
function requireKey(req, res, next) {
  if (req.get('x-api-key') !== API_KEY) {
    return res.status(401).json({ error: 'invalid api key' });
  }
  next();
}

// ESP32 -> server
app.post('/api/readings', requireKey, (req, res) => {
  const { device_id = 'esp32-01', temperature, humidity } = req.body || {};
  const t = Number(temperature);
  const h = Number(humidity);

  if (!Number.isFinite(t) || !Number.isFinite(h)) {
    return res.status(400).json({ error: 'temperature and humidity must be numbers' });
  }
  // DHT11 range: 0-50 C, 20-90 %RH (allow some margin)
  if (t < -40 || t > 80 || h < 0 || h > 100) {
    return res.status(422).json({ error: 'values out of range' });
  }

  const id = db.insertReading(String(device_id).slice(0, 64), t, h);
  res.status(201).json({ ok: true, id });
});

// Dashboard data
app.get('/api/readings', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
  res.json(db.list(limit).reverse()); // oldest -> newest for charts
});

app.get('/api/readings/latest', (req, res) => {
  res.json(db.latest());
});

// ---------- Dashboard ----------
app.get('/', (req, res) => {
  res.render('dashboard', {
    latest: db.latest(),
    stats: db.stats24h(),
    readings: db.list(20),
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
  if (API_KEY === 'change-me') console.warn('WARNING: using default API_KEY, set API_KEY env var');
});
