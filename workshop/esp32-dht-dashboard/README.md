# ESP32 + DHT11 → Node.js + SQLite dashboard

## 1. Run the server (Node.js >= 22.13)
```bash
npm install
API_KEY=mysecret npm start        # Windows PowerShell: $env:API_KEY="mysecret"; npm start
```
Open http://localhost:3000

## 2. Flash the ESP32
1. Arduino IDE → install the **esp32** board package, plus libraries **DHT sensor library** and **Adafruit Unified Sensor**.
2. Open `esp32_dht11_sender/esp32_dht11_sender.ino`.
3. Edit `WIFI_SSID`, `WIFI_PASS`, `SERVER_URL` (your PC's LAN IP, e.g. `http://192.168.1.100:3000/api/readings`), and `API_KEY` (same as the server).
4. Wiring: DHT11 VCC→3V3, GND→GND, DATA→GPIO4.
5. Upload, open Serial Monitor at 115200.

## API
| Method | Path | Notes |
|---|---|---|
| POST | `/api/readings` | Header `x-api-key`. Body `{"device_id":"esp32-01","temperature":25.3,"humidity":60}` → `201 {ok,id}` |
| GET | `/api/readings?limit=100` | Oldest → newest |
| GET | `/api/readings/latest` | Latest row |

Test without hardware:
```bash
curl -X POST http://localhost:3000/api/readings -H "Content-Type: application/json" \
  -H "x-api-key: mysecret" -d '{"temperature":27.5,"humidity":62}'
```

If the ESP32 can't connect: make sure PC and ESP32 are on the same network and the PC firewall allows port 3000.
