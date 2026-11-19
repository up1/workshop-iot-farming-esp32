#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "http://SERVER_IP:3000/hello"; // e.g., http://192.168.1.100:3000/hello

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nHTTP Client Ready");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Accept", "application/json");

    // Send a JSON POST request
    const char* jsonBody = "{\"message\":\"Hello from HTTP Client!\",\"device\":\"esp32\"}";
    int httpCode = http.POST(jsonBody);

    if (httpCode > 0) {
      Serial.printf("Response [%d]: %s\n", httpCode, http.getString().c_str());
    } else {
      Serial.printf("Error: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }
  delay(5000);
}
