/*
  ESP32 + DHT11 -> HTTP POST (JSON) to Node.js REST API  (FreeRTOS version)

  Two isolated FreeRTOS tasks (built into the ESP32 Arduino core):
    1. sensorDHTTask : reads the DHT11 and pushes readings into a queue
    2. senderTask : takes readings from the queue and POSTs them over WiFi

  The tasks share NO globals; the only link between them is the queue.

  Wiring (DHT11 3-pin module):
    VCC  -> 3V3
    GND  -> GND
    DATA -> GPIO 4   (change DHT_PIN below if needed)
  If you use the bare 4-pin DHT11, add a 10k pull-up resistor between DATA and VCC.

  Libraries (Arduino IDE > Library Manager):
    - "DHT sensor library" by Adafruit
    - "Adafruit Unified Sensor" by Adafruit
  Board: "ESP32 Dev Module" (esp32 by Espressif Systems, board package)
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

// ---------- CONFIG: edit these ----------
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// IP of the computer running the Node.js server (NOT localhost!)
// Find it with `ipconfig` (Windows) or `ip a` / `ifconfig` (Linux/macOS)
const char* SERVER_URL = "http://192.168.1.100:3000/api/readings";
const char* API_KEY    = "change-me";      // must match API_KEY env var on the server
const char* DEVICE_ID  = "esp32-01";

#define DHT_PIN   4
#define DHT_TYPE  DHT11
const uint32_t SEND_INTERVAL_MS = 10000;   // DHT11 can be read at most once per second

// FreeRTOS settings
const uint32_t SENSOR_STACK_WORDS = 4096;
const uint32_t SENDER_STACK_WORDS = 8192;  // HTTPClient needs more stack
const UBaseType_t QUEUE_LENGTH    = 5;     // buffered readings while WiFi is down
// ----------------------------------------

struct Reading {
  float temperature;
  float humidity;
};

static QueueHandle_t readingQueue = NULL;

// ======================= Task 1: read DHT11 =======================
void sensorDHTTask(void* pvParameters) {
  DHT dht(DHT_PIN, DHT_TYPE);
  dht.begin();

  TickType_t lastWake = xTaskGetTickCount();

  for (;;) {
    float h = dht.readHumidity();
    float t = dht.readTemperature();   // Celsius

    if (isnan(h) || isnan(t)) {
      Serial.println("[sensor] Failed to read from DHT11 (check wiring)");
    } else {
      Reading r = { t, h };
      Serial.printf("[sensor] Temp: %.1f C  Humidity: %.1f %%\n", t, h);

      // Queue full (WiFi down for a while): drop the oldest, keep the newest
      if (xQueueSend(readingQueue, &r, 0) != pdTRUE) {
        Reading dropped;
        xQueueReceive(readingQueue, &dropped, 0);
        xQueueSend(readingQueue, &r, 0);
        Serial.println("[sensor] queue full, dropped oldest reading");
      }
    }

    // Fixed-period delay (no drift)
    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(SEND_INTERVAL_MS));
  }
}

// ======================= Task 2: send via WiFi =======================
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

static bool sendReading(const Reading& r) {
  char body[128];
  snprintf(body, sizeof(body),
           "{\"device_id\":\"%s\",\"temperature\":%.1f,\"humidity\":%.1f}",
           DEVICE_ID, r.temperature, r.humidity);

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);

  int code = http.POST((uint8_t*)body, strlen(body));
  if (code > 0) {
    Serial.printf("[sender] POST %s -> HTTP %d  %s\n", body, code, http.getString().c_str());
  } else {
    Serial.printf("[sender] POST failed: %s\n", http.errorToString(code).c_str());
  }
  http.end();
  return code == 201;
}

void senderTask(void* pvParameters) {
  Reading r;

  for (;;) {
    connectWiFi();   // re-connects if WiFi dropped

    if (WiFi.status() != WL_CONNECTED) {
      vTaskDelay(pdMS_TO_TICKS(2000));   // readings stay buffered in the queue
      continue;
    }

    // Block up to 1 sec waiting for data, then loop to re-check WiFi
    if (xQueueReceive(readingQueue, &r, pdMS_TO_TICKS(1000)) == pdTRUE) {
      sendReading(r);
    }
  }
}

// ======================= Arduino entry points =======================
void setup() {
  Serial.begin(115200);
  delay(500);

  readingQueue = xQueueCreate(QUEUE_LENGTH, sizeof(Reading));
  if (readingQueue == NULL) {
    Serial.println("Failed to create queue");
    while (true) delay(1000);
  }

  // Sensor on core 1 (same as Arduino loop), WiFi/network on core 0 (WiFi stack core)
  xTaskCreatePinnedToCore(sensorDHTTask, "sensorDHTTask", SENSOR_STACK_WORDS, NULL, 1, NULL, 1);
  xTaskCreatePinnedToCore(senderTask, "senderTask", SENDER_STACK_WORDS, NULL, 1, NULL, 0);
}

void loop() {
  // Nothing to do: all work happens in the FreeRTOS tasks.
  vTaskDelete(NULL);
}
