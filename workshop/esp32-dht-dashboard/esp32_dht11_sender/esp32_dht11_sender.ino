/*
  ESP32 + DHT11 -> HTTP POST (JSON) to Node.js REST API

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
const unsigned long SEND_INTERVAL_MS = 10000;   // DHT11 can be read at most once per second
// ----------------------------------------

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastSend = 0;

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nConnected, IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\nWiFi connect failed, will retry");
  }
}

bool sendReading(float temperature, float humidity) {
  char body[128];
  snprintf(body, sizeof(body),
           "{\"device_id\":\"%s\",\"temperature\":%.1f,\"humidity\":%.1f}",
           DEVICE_ID, temperature, humidity);

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);

  int code = http.POST((uint8_t*)body, strlen(body));
  if (code > 0) {
    Serial.printf("POST %s -> HTTP %d  %s\n", body, code, http.getString().c_str());
  } else {
    Serial.printf("POST failed: %s\n", http.errorToString(code).c_str());
  }
  http.end();
  return code == 201;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  dht.begin();
  connectWiFi();
}

void loop() {
  connectWiFi();   // re-connects if WiFi dropped

  if (millis() - lastSend >= SEND_INTERVAL_MS || lastSend == 0) {
    lastSend = millis();

    float h = dht.readHumidity();
    float t = dht.readTemperature();   // Celsius

    if (isnan(h) || isnan(t)) {
      Serial.println("Failed to read from DHT11 (check wiring)");
    } else if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("Temp: %.1f C  Humidity: %.1f %%\n", t, h);
      sendReading(t, h);
    }
  }
}
