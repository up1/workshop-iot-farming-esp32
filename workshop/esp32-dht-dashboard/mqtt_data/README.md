# MQTT → SQLite → live dashboard (DHT)

ESP32 publishes JSON to topic `esp32/dht`:
`{"device_id":"esp32-01","temp_c":27.0,"humidity":65.0}`

The Node.js server subscribes, validates, stores in SQLite (`data/mqtt_sensor.db`)
and pushes each new reading to the browser via Server-Sent Events.

## Run with Docker (broker + dashboard)
```bash
docker compose up --build
```
Open http://localhost:3000. Broker is on port 1883.

## Run locally (Node >= 22.13, broker already running)
```bash
npm install
MQTT_URL=mqtt://localhost:1883 npm start
```
Env vars: `MQTT_URL`, `MQTT_TOPIC` (default `esp32/dht`), `MQTT_USER`, `MQTT_PASS`, `PORT`, `DB_FILE`.

## Test without hardware
```bash
docker compose exec mosquitto mosquitto_pub -t esp32/dht \
  -m '{"device_id":"esp32-01","temp_c":27.5,"humidity":62}'
```

## API
| Path | Notes |
|---|---|
| `GET /api/readings?limit=100` | oldest → newest |
| `GET /api/latest` | latest row |
| `GET /api/stats` | 24h min/avg/max |
| `GET /api/status` | MQTT connection state |
| `GET /api/stream` | SSE, one event per new reading |
