const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const mqtt = require('mqtt');

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
const db = require('./db');

const PORT       = Number(process.env.PORT) || 3000;
const MQTT_URL   = process.env.MQTT_URL   || 'mqtt://localhost:1883';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'esp32/dht';

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// ---------- MQTT subscriber ----------
const sseClients = new Set();
const client = mqtt.connect(MQTT_URL, {
  username: process.env.MQTT_USER || undefined,
  password: process.env.MQTT_PASS || undefined,
  reconnectPeriod: 3000,
});

client.on('connect', () => {
  console.log(`MQTT connected: ${MQTT_URL}`);
  client.subscribe(MQTT_TOPIC, err => {
    if (err) console.error('subscribe failed:', err.message);
    else console.log(`Subscribed: ${MQTT_TOPIC}`);
  });
});
client.on('error', err => console.error('MQTT error:', err.message));
client.on('close', () => console.warn('MQTT disconnected'));

client.on('message', (topic, payload) => {
  let msg;
  try { msg = JSON.parse(payload.toString()); }
  catch { return console.warn('Ignored non-JSON message:', payload.toString().slice(0, 100)); }

  const t = Number(msg.temp_c);
  const h = Number(msg.humidity);
  if (!Number.isFinite(t) || !Number.isFinite(h) || t < -40 || t > 80 || h < 0 || h > 100) {
    return console.warn('Ignored invalid reading:', msg);
  }

  const row = db.insert(String(msg.device_id || 'unknown').slice(0, 64), t, h);
  console.log(`[${row.device_id}] ${t} C  ${h} %`);
  const data = `data: ${JSON.stringify(row)}\n\n`;
  for (const res of sseClients) res.write(data);
});

// ---------- API ----------
app.get('/api/readings', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
  res.json(db.list(limit));
});
app.get('/api/latest', (req, res) => res.json(db.latest()));
app.get('/api/stats',  (req, res) => res.json(db.stats24h()));
app.get('/api/status', (req, res) => res.json({ mqtt: client.connected, url: MQTT_URL, topic: MQTT_TOPIC }));

// Live updates (Server-Sent Events)
app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(': connected\n\n');
  sseClients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Dashboard: http://localhost:${PORT}`));
