// Compare HTTP REST (JSON) vs CoAP (JSON) vs HTTP + Protobuf
//   - wire size: exact bytes sent/received on the socket (request + response)
//   - speed: sequential latency (avg/p50/p95/p99) and concurrent throughput
//
// Usage: node bench.js [--n 2000] [--concurrency 20] [--warmup 200]
const { spawn } = require("child_process");
const http = require("http");
const dgram = require("dgram");
const path = require("path");
const coapPacket = require("coap-packet");
const protobuf = require("protobufjs");

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : def;
};
const N = arg("n", 2000);
const CONCURRENCY = arg("concurrency", 20);
const WARMUP = arg("warmup", 200);

const PORTS = { rest: 3001, protobuf: 3002, coap: 5683 };

// ---- payload scenarios (same logical data for every protocol) -------------
const SCENARIOS = [
  { name: "small", message: "hello", device: "esp32" },
  { name: "medium (100 chars)", message: "x".repeat(100), device: "esp32-01" },
  { name: "large (500 chars)", message: "x".repeat(500), device: "esp32-01" },
];

const root = protobuf.loadSync(path.join(__dirname, "proto", "hello.proto"));
const HelloRequest = root.lookupType("hello.HelloRequest");

// ---- clients: each returns { send(sc) -> {reqBytes,resBytes,...}, close() } -----
// Sequential HTTP client: one keep-alive socket, exact byte accounting via socket counters
function httpSeqClient(port, contentType, encode) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  let sock = null;
  function send(sc) {
    return new Promise((resolve, reject) => {
      const body = encode(sc);
      const req = http.request(
        { host: "127.0.0.1", port, path: "/hello", method: "POST", agent,
          headers: { "Content-Type": contentType, "Content-Length": body.length } },
        (res) => {
          let len = 0;
          res.on("data", (c) => (len += c.length));
          res.on("end", () => {
            resolve({
              status: res.statusCode,
              reqBytes: sock.bytesWritten - w0,
              resBytes: sock.bytesRead - r0,
              payloadReq: body.length,
              payloadRes: len,
            });
          });
        }
      );
      let w0, r0;
      req.on("socket", (s) => { sock = s; w0 = s.bytesWritten; r0 = s.bytesRead; });
      req.on("error", reject);
      req.end(body);
    });
  }
  return { send, close: () => agent.destroy() };
}

function coapClient(port) {
  const sock = dgram.createSocket("udp4");
  const pending = new Map(); // messageId -> {resolve, bytesOut}
  let mid = Math.floor(Math.random() * 65535);
  sock.on("message", (msg) => {
    const p = coapPacket.parse(msg);
    const entry = pending.get(p.messageId);
    if (!entry) return;
    pending.delete(p.messageId);
    entry.resolve({
      status: `${p.code}`,
      reqBytes: entry.bytesOut,
      resBytes: msg.length,
      payloadReq: entry.payloadLen,
      payloadRes: p.payload.length,
    });
  });
  const ready = new Promise((r) => sock.bind(0, "127.0.0.1", r));
  async function send(sc) {
    await ready;
    return new Promise((resolve) => {
      const payload = Buffer.from(JSON.stringify({ message: sc.message, device: sc.device }));
      mid = (mid + 1) & 0xffff;
      const buf = coapPacket.generate({
        confirmable: true,
        code: "0.02", // POST
        messageId: mid,
        token: Buffer.from([mid & 0xff, mid >> 8]),
        options: [
          { name: "Uri-Path", value: Buffer.from("hello") },
          { name: "Content-Format", value: Buffer.from([50]) }, // application/json
        ],
        payload,
      });
      pending.set(mid, { resolve, bytesOut: buf.length, payloadLen: payload.length });
      sock.send(buf, port, "127.0.0.1");
    });
  }
  return { send, close: () => sock.close() };
}

const clients = {
  "HTTP REST + JSON": () =>
    httpSeqClient(PORTS.rest, "application/json", (sc) =>
      Buffer.from(JSON.stringify({ message: sc.message, device: sc.device }))),
  "CoAP + JSON": () => coapClient(PORTS.coap),
  "HTTP + Protobuf": () =>
    httpSeqClient(PORTS.protobuf, "application/x-protobuf", (sc) =>
      Buffer.from(HelloRequest.encode(HelloRequest.create({ message: sc.message, device: sc.device })).finish())),
};

// Concurrent clients (no byte accounting): HTTP uses many sockets, CoAP one socket
function concurrentSend(name) {
  if (name === "CoAP + JSON") return coapClient(PORTS.coap);
  const ct = name === "HTTP + Protobuf" ? "application/x-protobuf" : "application/json";
  const port = name === "HTTP + Protobuf" ? PORTS.protobuf : PORTS.rest;
  const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY });
  const enc = name === "HTTP + Protobuf"
    ? (sc) => Buffer.from(HelloRequest.encode(HelloRequest.create({ message: sc.message, device: sc.device })).finish())
    : (sc) => Buffer.from(JSON.stringify({ message: sc.message, device: sc.device }));
  return {
    send: (sc) => new Promise((resolve, reject) => {
      const body = enc(sc);
      const req = http.request({ host: "127.0.0.1", port, path: "/hello", method: "POST", agent,
        headers: { "Content-Type": ct, "Content-Length": body.length } }, (res) => {
        res.resume(); res.on("end", () => resolve({ status: res.statusCode }));
      });
      req.on("error", reject);
      req.end(body);
    }),
    close: () => agent.destroy(),
  };
}

// ---- helpers ---------------------------------------------------------------
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const ms = (ns) => ns / 1e6;

function startServer(file, port) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, "servers", file)], {
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "inherit"],
    });
    p.stdout.on("data", (d) => { if (String(d).includes("ready")) resolve(p); });
    p.on("error", reject);
    p.on("exit", (c) => c && reject(new Error(`${file} exited ${c}`)));
  });
}

async function main() {
  const servers = await Promise.all([
    startServer("http-json.js", PORTS.rest),
    startServer("http-protobuf.js", PORTS.protobuf),
    startServer("coap.js", PORTS.coap),
  ]);
  const names = Object.keys(clients);
  const sizes = {};   // [scenario][name]
  const speed = {};   // [name]
  const tput = {};    // [name]

  try {
    // 1) wire size (one request per scenario, after a warmup to avoid first-request effects)
    for (const sc of SCENARIOS) {
      sizes[sc.name] = {};
      for (const name of names) {
        const c = clients[name]();
        await c.send(sc);
        const r = await c.send(sc);
        sizes[sc.name][name] = r;
        c.close();
      }
    }

    // 2) sequential latency with the small payload
    const small = SCENARIOS[0];
    for (const name of names) {
      const c = clients[name]();
      for (let i = 0; i < WARMUP; i++) await c.send(small);
      const lat = [];
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < N; i++) {
        const s = process.hrtime.bigint();
        await c.send(small);
        lat.push(Number(process.hrtime.bigint() - s));
      }
      const total = Number(process.hrtime.bigint() - t0);
      lat.sort((a, b) => a - b);
      speed[name] = {
        avg: ms(lat.reduce((a, b) => a + b, 0) / lat.length),
        p50: ms(pct(lat, 50)), p95: ms(pct(lat, 95)), p99: ms(pct(lat, 99)),
        rps: N / (total / 1e9),
      };
      c.close();
    }

    // 3) concurrent throughput with the small payload
    for (const name of names) {
      const c = concurrentSend(name);
      for (let i = 0; i < WARMUP; i++) await c.send(small);
      let issued = 0;
      const t0 = process.hrtime.bigint();
      await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        while (issued < N) { issued++; await c.send(small); }
      }));
      tput[name] = N / (Number(process.hrtime.bigint() - t0) / 1e9);
      c.close();
    }
  } finally {
    servers.forEach((s) => s.kill());
  }

  // ---- report --------------------------------------------------------------
  console.log(`\nnode ${process.version} | requests=${N} warmup=${WARMUP} concurrency=${CONCURRENCY}\n`);

  for (const sc of SCENARIOS) {
    console.log(`## Size on the wire - ${sc.name}  (bytes, request + response, TCP/UDP payload only)`);
    const base = sizes[sc.name]["HTTP REST + JSON"];
    const baseTotal = base.reqBytes + base.resBytes;
    console.table(Object.fromEntries(names.map((n) => {
      const r = sizes[sc.name][n];
      const total = r.reqBytes + r.resBytes;
      return [n, {
        "req payload": r.payloadReq, "res payload": r.payloadRes,
        "req total": r.reqBytes, "res total": r.resBytes, "total": total,
        "vs REST": `${((total / baseTotal) * 100).toFixed(0)}%`,
      }];
    })));
  }

  console.log("## Speed - sequential latency, small payload (ms)");
  console.table(Object.fromEntries(names.map((n) => [n, {
    avg: +speed[n].avg.toFixed(3), p50: +speed[n].p50.toFixed(3),
    p95: +speed[n].p95.toFixed(3), p99: +speed[n].p99.toFixed(3),
    "req/s": Math.round(speed[n].rps),
  }])));

  console.log(`## Speed - throughput with ${CONCURRENCY} concurrent requests (req/s)`);
  console.table(Object.fromEntries(names.map((n) => [n, { "req/s": Math.round(tput[n]) }])));
}

main().catch((e) => { console.error(e); process.exit(1); });
