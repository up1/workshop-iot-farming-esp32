// SQLite via Node's built-in module (node:sqlite, Node >= 22.13 without flags)
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const db = new DatabaseSync(process.env.DB_FILE || path.join(__dirname, 'sensor.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS readings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT    NOT NULL DEFAULT 'esp32-01',
    temperature REAL    NOT NULL,
    humidity    REAL    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX IF NOT EXISTS idx_readings_created ON readings (created_at DESC);
`);

const insertStmt = db.prepare(
  'INSERT INTO readings (device_id, temperature, humidity) VALUES (?, ?, ?)'
);
const latestStmt = db.prepare(
  'SELECT * FROM readings ORDER BY id DESC LIMIT 1'
);
const listStmt = db.prepare(
  'SELECT * FROM readings ORDER BY id DESC LIMIT ?'
);
const statsStmt = db.prepare(`
  SELECT COUNT(*)         AS total,
         MIN(temperature) AS min_t, MAX(temperature) AS max_t, AVG(temperature) AS avg_t,
         MIN(humidity)    AS min_h, MAX(humidity)    AS max_h, AVG(humidity)    AS avg_h
  FROM readings
  WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-24 hours')
`);

module.exports = {
  insertReading(deviceId, temperature, humidity) {
    const r = insertStmt.run(deviceId, temperature, humidity);
    return Number(r.lastInsertRowid);
  },
  latest: () => latestStmt.get() || null,
  list: (limit = 100) => listStmt.all(limit),
  stats24h: () => statsStmt.get(),
};
