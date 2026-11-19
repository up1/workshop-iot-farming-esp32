# ESP32 → MQTT broker ← 2 consumers
* https://github.com/eclipse-mosquitto/mosquitto/

```
esp32 ──publish──▶ mosquitto (1883) ──▶ consumer1
                    topic: workshop/esp32/hello ──▶ consumer2
```

Message (JSON, `timestamp` = Unix epoch seconds from NTP):

```json
{"device_id": "esp32-123", "message": "Hello with timestamp", "timestamp": 1763549000}
```

## Run
1. Broker: `docker compose up -d`
2. Consumers: `npm install` then, in two terminals, `npm start -w consumer1` and `npm start -w consumer2`
   (set `BROKER_URL=mqtt://host:1883` if the broker is remote)
3. ESP32: install the **PubSubClient** library, edit WiFi + `mqttHost` in [esp32/esp32.ino](esp32/esp32.ino), upload.

Quick test without hardware:
`docker compose exec mosquitto mosquitto_pub -t workshop/esp32/hello -m '{"device_id":"esp32-123","message":"Hello with timestamp","timestamp":1763549000}'`
