/*
  ESP32 + DHT11 -> MQTT publish (JSON)  (FreeRTOS version, task notification)

  Two isolated FreeRTOS tasks (built into the ESP32 Arduino core):
    1. sensorDHTTask : reads the DHT11 and notifies the sender task
    2. senderTask    : wakes on notification and publishes to the MQTT broker

  The tasks share NO globals. The reading is packed into the 32-bit
  notification value (temperature x10 in the high 16 bits, humidity x10 in
  the low 16 bits), so no queue is needed. If the sender is busy/offline,
  a new notification overwrites the old one (only the latest reading is kept).

  MQTT:
    topic   = esp32/dht
    payload = {"device_id":"esp32-01","temp_c":27.0,"humidity":65.0}

  Wiring (DHT11 3-pin module):
    VCC  -> 3V3
    GND  -> GND
    DATA -> GPIO 4   (change DHT_PIN below if needed)
  If you use the bare 4-pin DHT11, add a 10k pull-up resistor between DATA and VCC.

  Libraries (Arduino IDE > Library Manager):
    - "DHT sensor library" by Adafruit
    - "Adafruit Unified Sensor" by Adafruit
    - "PubSubClient" by Nick O'Leary
  Board: "ESP32 Dev Module" (esp32 by Espressif Systems, board package)
*/

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

// ---------- CONFIG: edit these ----------
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// IP of the computer running the MQTT broker (NOT localhost!)
const char* MQTT_HOST  = "192.168.1.100";
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER  = "";               // leave empty if the broker has no auth
const char* MQTT_PASS  = "";
const char* MQTT_TOPIC = "esp32/dht";
const char* DEVICE_ID  = "esp32-01";

#define DHT_PIN   4
#define DHT_TYPE  DHT11
const uint32_t SEND_INTERVAL_MS = 10000;   // DHT11 can be read at most once per second

// FreeRTOS settings
const uint32_t SENSOR_STACK_WORDS = 4096;
const uint32_t SENDER_STACK_WORDS = 8192;
// ----------------------------------------

// Pack / unpack a reading into one 32-bit notification value
static inline uint32_t packReading(float t, float h) {
  int16_t  t10 = (int16_t)lroundf(t * 10.0f);
  uint16_t h10 = (uint16_t)lroundf(h * 10.0f);
  return ((uint32_t)(uint16_t)t10 << 16) | h10;
}

static inline void unpackReading(uint32_t v, float& t, float& h) {
  t = (int16_t)(v >> 16) / 10.0f;
  h = (uint16_t)(v & 0xFFFF) / 10.0f;
}

// ======================= Task 1: read DHT11 =======================
// pvParameters = handle of the sender task (to notify)
void sensorDHTTask(void* pvParameters) {
  TaskHandle_t senderHandle = (TaskHandle_t)pvParameters;

  DHT dht(DHT_PIN, DHT_TYPE);
  dht.begin();

  TickType_t lastWake = xTaskGetTickCount();

  for (;;) {
    float h = dht.readHumidity();
    float t = dht.readTemperature();   // Celsius

    if (isnan(h) || isnan(t)) {
      Serial.println("[sensor] Failed to read from DHT11 (check wiring)");
    } else {
      Serial.printf("[sensor] Temp: %.1f C  Humidity: %.1f %%\n", t, h);

      // Overwrite any pending (unsent) reading: keep the newest
      xTaskNotify(senderHandle, packReading(t, h), eSetValueWithOverwrite);
    }

    // Fixed-period delay (no drift)
    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(SEND_INTERVAL_MS));
  }
}

// ======================= Task 2: publish via MQTT =======================
static void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("[sender] Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  TickType_t start = xTaskGetTickCount();
  while (WiFi.status() != WL_CONNECTED &&
         (xTaskGetTickCount() - start) < pdMS_TO_TICKS(20000)) {
    vTaskDelay(pdMS_TO_TICKS(500));
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[sender] Connected, IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[sender] WiFi connect failed, will retry");
  }
}

static bool connectMQTT(PubSubClient& mqtt) {
  if (mqtt.connected()) return true;

  String clientId = String(DEVICE_ID) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  Serial.printf("[sender] Connecting to MQTT %s:%u ... ", MQTT_HOST, MQTT_PORT);

  bool ok = (MQTT_USER[0] != '\0')
              ? mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)
              : mqtt.connect(clientId.c_str());

  if (ok) {
    Serial.println("connected");
  } else {
    Serial.printf("failed, rc=%d\n", mqtt.state());
  }
  return ok;
}

static bool publishReading(PubSubClient& mqtt, float temp_c, float humidity) {
  char body[128];
  snprintf(body, sizeof(body),
           "{\"device_id\":\"%s\",\"temp_c\":%.1f,\"humidity\":%.1f}",
           DEVICE_ID, temp_c, humidity);

  bool ok = mqtt.publish(MQTT_TOPIC, body);
  Serial.printf("[sender] PUBLISH %s %s -> %s\n", MQTT_TOPIC, body, ok ? "OK" : "FAILED");
  return ok;
}

void senderTask(void* pvParameters) {
  WiFiClient   wifiClient;
  PubSubClient mqtt(wifiClient);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);

  uint32_t value;
  float t, h;
  bool havePending = false;   // a reading we failed to send yet

  for (;;) {
    connectWiFi();   // re-connects if WiFi dropped

    if (WiFi.status() != WL_CONNECTED) {
      vTaskDelay(pdMS_TO_TICKS(2000));   // latest reading stays in the notification value
      continue;
    }

    if (!connectMQTT(mqtt)) {
      vTaskDelay(pdMS_TO_TICKS(2000));
      continue;
    }

    // Block up to 1 sec waiting for a notification from the sensor task
    // (clears the notification value on exit), then loop to re-check links
    if (xTaskNotifyWait(0, 0xFFFFFFFF, &value, pdMS_TO_TICKS(1000)) == pdTRUE) {
      unpackReading(value, t, h);
      havePending = true;
    }

    if (havePending && publishReading(mqtt, t, h)) {
      havePending = false;   // on failure, retry on the next loop
    }

    mqtt.loop();   // keep-alive / incoming packets
  }
}

// ======================= Arduino entry points =======================
void setup() {
  Serial.begin(115200);
  delay(500);

  // Sender (network) on core 0 (WiFi stack core); sensor on core 1 (same as Arduino loop)
  TaskHandle_t senderHandle = NULL;
  xTaskCreatePinnedToCore(senderTask, "senderTask", SENDER_STACK_WORDS, NULL, 1, &senderHandle, 0);
  xTaskCreatePinnedToCore(sensorDHTTask, "sensorDHTTask", SENSOR_STACK_WORDS, (void*)senderHandle, 1, NULL, 1);
}

void loop() {
  // Nothing to do: all work happens in the FreeRTOS tasks.
  vTaskDelete(NULL);
}
