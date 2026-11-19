// Requires library "PubSubClient" by Nick O'Leary (Library Manager)
#include <WiFi.h>
#include <PubSubClient.h>
#include <time.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqttHost = "192.168.1.100"; // IP of the machine running the broker
const int mqttPort = 1883;
const char* topic = "workshop/esp32/hello";
const char* deviceId = "esp32-123";

WiFiClient wifi;
PubSubClient mqtt(wifi);

void connectWifi() {
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
}

void syncTime() {
  configTime(0, 0, "pool.ntp.org", "time.google.com"); // UTC
  while (time(nullptr) < 1700000000) { // wait until NTP sync
    delay(200);
  }
}

void connectMqtt() {
  while (!mqtt.connected()) {
    Serial.print("Connecting MQTT...");
    if (mqtt.connect(deviceId)) {
      Serial.println("ok");
    } else {
      Serial.printf("failed rc=%d, retry in 2s\n", mqtt.state());
      delay(2000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  connectWifi();
  syncTime();
  mqtt.setServer(mqttHost, mqttPort);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWifi();
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();

  static unsigned long last = 0;
  if (millis() - last >= 5000) {
    last = millis();
    char payload[160];
    snprintf(payload, sizeof(payload),
             "{\"device_id\":\"%s\",\"message\":\"Hello with timestamp\",\"timestamp\":%lu}",
             deviceId, (unsigned long)time(nullptr));
    bool ok = mqtt.publish(topic, payload);
    Serial.printf("publish %s: %s\n", ok ? "ok" : "FAILED", payload);
  }
}
