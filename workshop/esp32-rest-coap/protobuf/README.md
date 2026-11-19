# ESP32 + REST API with Protocol Buffers

| File | Purpose |
|------|---------|
| `proto/hello.proto` | Shared message schema |
| `index.js` | Express server (protobufjs) |
| `test.js` | Automated tests (needs server running) |
| `demo.ino` | ESP32 client (Arduino) |

## Schema

```proto
message HelloRequest  { string message = 1; string device = 2; }
message HelloResponse { string status = 1; string reply = 2; string received_at = 3; }
message ErrorResponse { string error = 1; }
```

| Endpoint | Request | Response |
|----------|---------|----------|
| `GET /hello` | – | `200` HelloResponse |
| `POST /hello` | HelloRequest | `201` HelloResponse, or `400` ErrorResponse |

All requests/responses use `Content-Type: application/x-protobuf`.

## 1. Run the server

Requires Node.js 18+.

```bash
cd protobuf
npm install
npm start          # listens on 0.0.0.0:3000 (override with PORT=4000)
```

## 2. Test the server

Automated (server must be running in another terminal):

```bash
npm test                                  # or BASE_URL=http://host:3000 npm test
```

Manual with curl (`protoc` required: `brew install protobuf`):

```bash
# GET: decode the response
curl -s localhost:3000/hello | protoc --decode=hello.HelloResponse proto/hello.proto

# POST: encode request, send, decode response
echo 'message: "Hello" device: "curl"' \
  | protoc --encode=hello.HelloRequest proto/hello.proto \
  | curl -s -X POST -H 'Content-Type: application/x-protobuf' --data-binary @- localhost:3000/hello \
  | protoc --decode=hello.HelloResponse proto/hello.proto

# 400 error: missing message
echo 'device: "curl"' \
  | protoc --encode=hello.HelloRequest proto/hello.proto \
  | curl -s -X POST -H 'Content-Type: application/x-protobuf' --data-binary @- localhost:3000/hello \
  | protoc --decode=hello.ErrorResponse proto/hello.proto
```

## 3. Run the ESP32 client

1. Find your computer's LAN IP (`ipconfig getifaddr en0` on macOS). The ESP32 and computer must be on the same WiFi.
2. Edit `ssid`, `password`, `serverUrl` at the top of `demo.ino`.
3. Open in Arduino IDE, select your ESP32 board, upload.
4. Open Serial Monitor at **115200** baud. Every 5 s you should see:

```
Sent 36 bytes, response [201], 79 bytes
status=ok
reply=Hello esp32, I got: Hello from Protobuf Client!
received_at=2026-...
```

The server log shows `Received: { message: ..., device: 'esp32' } (36 bytes)`.
The equivalent JSON request was 53 bytes.

## Notes

- `demo.ino` contains a tiny hand-written protobuf encoder/decoder (strings
  only) so no extra library is needed. If you change `hello.proto` to use
  other types, switch to [nanopb](https://github.com/nanopb/nanopb) and generate
  code from the same `.proto`.
- If the ESP32 can't connect, check the firewall allows port 3000 and that
  `serverUrl` uses the LAN IP, not `localhost`.
