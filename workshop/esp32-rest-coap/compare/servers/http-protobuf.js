// HTTP REST + Protobuf  (same logic as ../../protobuf/index.js, without logging)
const express = require("express");
const path = require("path");
const protobuf = require("protobufjs");

const PORT = process.env.PORT || 3002;
const PB = "application/x-protobuf";

const root = protobuf.loadSync(path.join(__dirname, "..", "proto", "hello.proto"));
const HelloRequest = root.lookupType("hello.HelloRequest");
const HelloResponse = root.lookupType("hello.HelloResponse");
const ErrorResponse = root.lookupType("hello.ErrorResponse");

const app = express();
app.use(express.raw({ type: PB, limit: "64kb" }));

function send(res, status, Type, obj) {
  res.status(status).type(PB).send(Buffer.from(Type.encode(Type.create(obj)).finish()));
}

app.post("/hello", (req, res) => {
  let msg;
  try {
    msg = HelloRequest.decode(req.body);
  } catch (e) {
    return send(res, 400, ErrorResponse, { error: "invalid protobuf" });
  }
  if (!msg.message) return send(res, 400, ErrorResponse, { error: "message is required" });
  send(res, 201, HelloResponse, {
    status: "ok",
    reply: `Hello ${msg.device || "client"}, I got: ${msg.message}`,
    receivedAt: new Date().toISOString(),
  });
});

app.listen(PORT, "127.0.0.1", () => console.log("ready"));
