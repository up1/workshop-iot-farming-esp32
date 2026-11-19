# Compare: HTTP REST (JSON) vs CoAP vs Protobuf

Benchmark of **data size on the wire** and **speed** for the same `POST /hello` call used in the ESP32 demos.

| Name in results | Transport | Encoding | Source demo |
|---|---|---|---|
| `HTTP REST + JSON` | HTTP/1.1 over TCP | JSON | `../http_rest` |
| `CoAP + JSON` | CoAP over UDP (confirmable) | JSON | `../coap` |
| `HTTP + Protobuf` | HTTP/1.1 over TCP | Protobuf (`proto/hello.proto`) | `../protobuf` |

Request: `{ message, device }` → Response: `{ status, reply, receivedAt }` (HTTP 201 / CoAP 2.01).

## Requirements

- Node.js 18+ (tested on v25)

## Run

```bash
cd compare
npm install
npm run bench                 # defaults: 2000 requests, 200 warmup, 20 concurrent

# options
node bench.js --n 5000 --warmup 500 --concurrency 50
```

`bench.js` starts the three servers itself (child processes on ports 3001, 3002, 5683, bound to 127.0.0.1) and stops them at the end. Make sure those ports are free.

Servers can also be started by hand: `node servers/http-json.js`, `node servers/http-protobuf.js`, `node servers/coap.js` (override port with `PORT=...`).

## What is measured

1. **Size** - exact bytes for one request + one response, for 3 payload sizes (message of 5, 100 and 500 chars).
   - HTTP: `socket.bytesWritten/bytesRead` on a keep-alive connection (headers + body).
   - CoAP: length of the UDP datagrams (request + piggybacked ACK response).
   - Not counted: TCP/IP/UDP/IP headers, TCP handshake, TLS/DTLS.
2. **Latency** - N sequential requests (small payload), reports avg / p50 / p95 / p99 and req/s.
3. **Throughput** - N requests with C concurrent in-flight requests.

## Results

Sample run (macOS, localhost, Node v25.1.0, 2000 requests). Your numbers will differ; the *ratios* matter.

### Size on the wire (bytes)

| Payload | Protocol | Req payload | Res payload | Req total | Res total | **Total** | vs REST |
|---|---|---:|---:|---:|---:|---:|---:|
| small | HTTP REST + JSON | 36 | 91 | 158 | 331 | **489** | 100% |
| small | CoAP + JSON | 36 | 91 | 51 | 100 | **151** | 31% |
| small | HTTP + Protobuf | 14 | 57 | 142 | 288 | **430** | 88% |
| medium (100 chars) | HTTP REST + JSON | 134 | 189 | 257 | 430 | **687** | 100% |
| medium (100 chars) | CoAP + JSON | 134 | 189 | 149 | 198 | **347** | 51% |
| medium (100 chars) | HTTP + Protobuf | 112 | 155 | 241 | 387 | **628** | 91% |
| large (500 chars) | HTTP REST + JSON | 534 | 589 | 657 | 831 | **1488** | 100% |
| large (500 chars) | CoAP + JSON | 534 | 589 | 549 | 598 | **1147** | 77% |
| large (500 chars) | HTTP + Protobuf | 513 | 556 | 642 | 789 | **1431** | 96% |

### Speed (small payload)

| Protocol | avg (ms) | p50 | p95 | p99 | sequential req/s | 20 concurrent req/s |
|---|---:|---:|---:|---:|---:|---:|
| HTTP REST + JSON | 0.116 | 0.098 | 0.189 | 0.256 | 8,629 | 26,830 |
| CoAP + JSON | 0.097 | 0.084 | 0.148 | 0.304 | 10,282 | 25,919 |
| HTTP + Protobuf | 0.105 | 0.097 | 0.152 | 0.198 | 9,525 | 28,229 |

## Summary

- **Size - CoAP wins by a lot for small messages.** The saving comes from the protocol, not the payload: a CoAP header is 4 bytes + a few option bytes, while HTTP sends ~120 bytes of request headers and ~240 bytes of response headers (`Host`, `Content-Type`, `ETag`, `Date`, `X-Powered-By`, ...). Small payload: **CoAP is ~31% of HTTP+JSON**. The gap shrinks as the payload grows (77% at 500 chars) because the fixed header cost is amortised.
- **Size - Protobuf only shrinks the payload.** Body is 14 vs 36 bytes (request) and 57 vs 91 bytes (response), roughly 40-60% smaller for structured data. For this demo it is dominated by HTTP headers, so the total is only ~9-12% smaller. For a free-text `message` the saving vanishes (500 chars: 513 vs 534), because protobuf cannot compress string content; it saves field names and quotes/braces.
- **Speed - all three are in the same range on localhost** (~0.1 ms per request). CoAP is slightly faster sequentially (no TCP, tiny parsing); concurrent throughput is dominated by the Node.js server (Express vs the `coap` library), so differences there are noise-level. Do not read this as "CoAP is not faster": the real differences show up on constrained / lossy networks, which localhost does not model.
- **What localhost hides:** TCP handshake (3 packets) and teardown, TLS handshake, packet loss/retransmission on WiFi/LoRa/NB-IoT, radio-on time and battery. Fewer and smaller packets (CoAP, protobuf) matter much more there; the byte table is the best predictor of that benefit.
- **Best of both:** CoAP + Protobuf (not benchmarked here) would give roughly 4 (CoAP header) + ~14 + ~57 bytes, i.e. the smallest possible message for this payload.

### When to use which

| Need | Choice |
|---|---|
| Easy to debug, browser/curl friendly, existing tooling | HTTP REST + JSON |
| Battery powered / constrained devices, small packets, UDP-friendly networks | CoAP |
| Strict schema, typed fields, smaller payloads, many numeric fields | Protobuf (over HTTP or CoAP) |

## Caveats

- Everything runs on one machine, server and client on loopback; the Node HTTP client sends more headers than an ESP32 `HTTPClient`, so real HTTP sizes may be somewhat smaller.
- Servers are the demo logic with logging removed (logging would dominate timing).
- CoAP client is a minimal hand-written one (`dgram` + `coap-packet`): confirmable POST, no retransmission, no block-wise transfer. Payloads over ~1 KB would need block-wise transfer.
- Results vary run to run; use a larger `--n` and repeat for stable numbers.

## Files

```
compare/
├── bench.js                 # benchmark runner + report
├── proto/hello.proto        # protobuf schema (copy of ../protobuf/proto)
└── servers/
    ├── http-json.js         # Express + JSON
    ├── http-protobuf.js     # Express + protobufjs
    └── coap.js              # CoAP server (JSON)
```
