// Requires library "CoAP simple library" by hirotakaster (Library Manager)
#include <WiFi.h>
#include <WiFiUdp.h>
#include <coap-simple.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
IPAddress serverIp(192, 168, 1, 100); // SERVER_IP running coap/index.js
const int serverPort = 5683;
const char* path = "hello";

WiFiUDP udp;
Coap coap(udp);

// Called when the server responds
void onResponse(CoapPacket &packet, IPAddress ip, int port) {
  char body[packet.payloadlen + 1];
  memcpy(body, packet.payload, packet.payloadlen);
  body[packet.payloadlen] = '\0';
  // code = (class << 5) | detail, e.g. 2.01 -> 65
  Serial.printf("Response [%d.%02d]: %s\n", packet.code >> 5, packet.code & 0x1F, body);
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  coap.response(onResponse);
  coap.start();
  Serial.println("\nCoAP Client Ready");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // Send a JSON POST request (Content-Format 50 = application/json)
    const char* jsonBody = "{\"message\":\"Hello from CoAP Client!\",\"device\":\"esp32\"}";
    int msgid = coap.send(serverIp, serverPort, path, COAP_CON, COAP_POST,
                          NULL, 0,
                          (uint8_t*)jsonBody, strlen(jsonBody),
                          COAP_APPLICATION_JSON);
    if (msgid == 0) {
      Serial.println("Error: send failed");
    }
  }
  // Process the response; keep polling for 5 seconds
  unsigned long start = millis();
  while (millis() - start < 5000) {
    coap.loop();
    delay(10);
  }
}
