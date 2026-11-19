#include <WiFi.h>
#include <HTTPClient.h>

const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";
const char *serverUrl = "http://192.168.1.100:3000/hello"; // IP of the machine running the server

// ---------------------------------------------------------------------------
// Minimal protobuf codec (wire format) for proto/hello.proto.
// All fields are strings => wire type 2 (length-delimited).
// For larger schemas use nanopb: https://github.com/nanopb/nanopb
// ---------------------------------------------------------------------------

// Append a string field (field number 1..15, length < 128 handled via varint)
size_t pbWriteString(uint8_t *buf, size_t pos, size_t cap, uint8_t field, const char *s)
{
  size_t len = strlen(s);
  if (pos + 1 + 5 + len > cap)
    return pos;                  // would overflow: skip field
  buf[pos++] = (field << 3) | 2; // tag
  size_t v = len;                // varint length
  while (v >= 0x80)
  {
    buf[pos++] = (v & 0x7F) | 0x80;
    v >>= 7;
  }
  buf[pos++] = v;
  memcpy(buf + pos, s, len);
  return pos + len;
}

// Read a varint, returns false on malformed input
bool pbReadVarint(const uint8_t *buf, size_t len, size_t &pos, uint32_t &out)
{
  out = 0;
  for (int shift = 0; shift < 35 && pos < len; shift += 7)
  {
    uint8_t b = buf[pos++];
    out |= (uint32_t)(b & 0x7F) << shift;
    if (!(b & 0x80))
      return true;
  }
  return false;
}

// Decode a message of string fields: dst[field-1] receives the value
bool pbDecodeStrings(const uint8_t *buf, size_t len, String *dst, uint8_t maxField)
{
  size_t pos = 0;
  while (pos < len)
  {
    uint32_t tag, n;
    if (!pbReadVarint(buf, len, pos, tag))
      return false;
    uint8_t field = tag >> 3, wire = tag & 7;
    if (wire == 2)
    {
      if (!pbReadVarint(buf, len, pos, n) || pos + n > len)
        return false;
      if (field >= 1 && field <= maxField)
      {
        dst[field - 1] = String();
        dst[field - 1].concat((const char *)(buf + pos), n);
      }
      pos += n;
    }
    else if (wire == 0)
    { // skip unknown varint
      if (!pbReadVarint(buf, len, pos, n))
        return false;
    }
    else
    {
      return false;
    }
  }
  return true;
}

void setup()
{
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nProtobuf Client Ready");
}

void loop()
{
  if (WiFi.status() == WL_CONNECTED)
  {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/x-protobuf");
    http.addHeader("Accept", "application/x-protobuf");

    // HelloRequest { message = 1; device = 2; }
    uint8_t body[128];
    size_t n = 0;
    n = pbWriteString(body, n, sizeof(body), 1, "Hello from Protobuf Client!");
    n = pbWriteString(body, n, sizeof(body), 2, "esp32");

    int httpCode = http.POST(body, n);

    if (httpCode > 0)
    {
      String payload = http.getString(); // raw bytes held in a String
      Serial.printf("Sent %u bytes, response [%d], %u bytes\n", (unsigned)n, httpCode, payload.length());

      String f[3];
      if (httpCode == 201 && pbDecodeStrings((const uint8_t *)payload.c_str(), payload.length(), f, 3))
      {
        // HelloResponse { status = 1; reply = 2; received_at = 3; }
        Serial.printf("status=%s\nreply=%s\nreceived_at=%s\n", f[0].c_str(), f[1].c_str(), f[2].c_str());
      }
      else
      {
        // ErrorResponse { error = 1; }
        if (pbDecodeStrings((const uint8_t *)payload.c_str(), payload.length(), f, 1))
          Serial.printf("error=%s\n", f[0].c_str());
      }
    }
    else
    {
      Serial.printf("Error: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }
  delay(5000);
}
