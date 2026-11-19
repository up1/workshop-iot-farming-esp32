const express = require("express");
const path = require("path");
const protobuf = require("protobufjs");

const PORT = process.env.PORT || 3000;
const PB = "application/x-protobuf";

const root = protobuf.loadSync(path.join(__dirname, "proto", "hello.proto"));
const HelloRequest = root.lookupType("hello.HelloRequest");
const HelloResponse = root.lookupType("hello.HelloResponse");
const ErrorResponse = root.lookupType("hello.ErrorResponse");

const app = express();

// Parse raw protobuf bodies into a Buffer
app.use(express.raw({ type: PB, limit: "64kb" }));

// Log every request
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

function send(res, status, Type, obj) {
  const buf = Type.encode(Type.create(obj)).finish();
  res.status(status).type(PB).send(Buffer.from(buf));
}

// GET /hello - returns a protobuf HelloResponse
app.get("/hello", (_req, res) => {
  send(res, 200, HelloResponse, {
    status: "ok",
    reply: "Hello from Protobuf API",
    receivedAt: new Date().toISOString(),
  });
});

// POST /hello - called by ESP32 (demo.ino)
app.post("/hello", (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return send(res, 400, ErrorResponse, {
      error: `body must be ${PB} and not empty`,
    });
  }

  let msg;
  try {
    msg = HelloRequest.decode(req.body);
  } catch (e) {
    return send(res, 400, ErrorResponse, { error: `invalid protobuf: ${e.message}` });
  }

  if (!msg.message) {
    return send(res, 400, ErrorResponse, { error: "message is required" });
  }
  console.log("Received:", HelloRequest.toObject(msg), `(${req.body.length} bytes)`);

  send(res, 201, HelloResponse, {
    status: "ok",
    reply: `Hello ${msg.device || "client"}, I got: ${msg.message}`,
    receivedAt: new Date().toISOString(),
  });
});

// Other errors
app.use((err, _req, res, _next) => {
  send(res, err.status || 500, ErrorResponse, { error: err.message });
});

// Listen on all interfaces so the ESP32 can reach it over WiFi
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Protobuf API listening on port ${PORT}`);
});
