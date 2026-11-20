// SQLite via Node's built-in module (node:sqlite, Node >= 22.13)
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const db = new DatabaseSync(process.env.DB_FILE || path.join(__dirname, 'data', 'mqtt_sensor.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS readings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id  TEXT NOT NULL,
    temp_c     REAL NOT NULL,
    humidity   REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_readings_created ON readings (created_at DESC);
`);

const insertStmt = db.prepare('INSERT INTO readings (device_id, temp_c, humidity) VALUES (?, ?, ?)');
const byIdStmt   = db.prepare('SELECT * FROM readings WHERE id = ?');
const listStmt   = db.prepare('SELECT * FROM readings ORDER BY id DESC LIMIT ?');
const statsStmt  = db.prepare(`
  SELECT COUNT(*) AS total,
         MIN(temp_c) AS min_t, MAX(temp_c) AS max_t, AVG(temp_c) AS avg_t,
         MIN(humidity) AS min_h, MAX(humidity) AS max_h, AVG(humidity) AS avg_h
  FROM readings
  WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-24 hours')
`);

module.exports = {
  insert(deviceId, tempC, humidity) {
    const r = insertStmt.run(deviceId, tempC, humidity);
    return byIdStmt.get(Number(r.lastInsertRowid));
  },
  list: (limit = 100) => listStmt.all(limit).reverse(), // oldest -> newest
  latest: () => listStmt.all(1)[0] || null,
  stats24h: () => statsStmt.get(),
};
