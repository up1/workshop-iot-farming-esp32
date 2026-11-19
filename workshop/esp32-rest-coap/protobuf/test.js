// Usage: npm start (in another terminal), then npm test
const path = require("path");
const assert = require("assert");
const protobuf = require("protobufjs");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PB = "application/x-protobuf";
const root = protobuf.loadSync(path.join(__dirname, "proto", "hello.proto"));
const Req = root.lookupType("hello.HelloRequest");
const Res = root.lookupType("hello.HelloResponse");
const Err = root.lookupType("hello.ErrorResponse");

async function post(body, contentType = PB) {
  const r = await fetch(`${BASE}/hello`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
  return { status: r.status, buf: Buffer.from(await r.arrayBuffer()) };
}

(async () => {
  const g = await fetch(`${BASE}/hello`);
  assert.strictEqual(g.status, 200);
  assert.strictEqual(Res.decode(Buffer.from(await g.arrayBuffer())).status, "ok");
  console.log("PASS GET /hello -> 200");

  const payload = Req.encode({ message: "Hello", device: "esp32" }).finish();
  const p = await post(payload);
  assert.strictEqual(p.status, 201);
  assert.match(Res.decode(p.buf).reply, /Hello esp32, I got: Hello/);
  console.log(`PASS POST /hello -> 201 (request ${payload.length} bytes)`);

  const e1 = await post(Req.encode({ device: "esp32" }).finish());
  assert.strictEqual(e1.status, 400);
  assert.strictEqual(Err.decode(e1.buf).error, "message is required");
  console.log("PASS POST without message -> 400");

  const e2 = await post(Buffer.from([0xff, 0xff, 0xff]));
  assert.strictEqual(e2.status, 400);
  console.log("PASS POST invalid protobuf -> 400");

  const e3 = await post("{}", "application/json");
  assert.strictEqual(e3.status, 400);
  console.log("PASS POST JSON body -> 400");
  console.log("All tests passed");
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
