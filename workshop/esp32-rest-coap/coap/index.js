const coap = require("coap");

const PORT = process.env.PORT || 5683;

const server = coap.createServer({ type: "udp4" });

function sendJson(res, code, body) {
  res.code = code;
  res.setOption("Content-Format", "application/json");
  res.end(JSON.stringify(body));
}

server.on("request", (req, res) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);

  if (req.url !== "/hello") {
    return sendJson(res, "4.04", { error: "not found" });
  }

  // GET /hello - simple check from coap-client or Node client
  if (req.method === "GET") {
    return sendJson(res, "2.05", { message: "Hello from CoAP API" });
  }

  // POST /hello - called by ESP32 (demo.ino)
  if (req.method === "POST") {
    let body;
    try {
      body = JSON.parse(req.payload.toString() || "{}");
    } catch (e) {
      return sendJson(res, "4.00", { error: "invalid JSON" });
    }
    const { message, device } = body;
    if (!message) {
      return sendJson(res, "4.00", { error: "message is required" });
    }
    console.log("Received:", body);
    // 2.01 Created is the CoAP equivalent of HTTP 201
    return sendJson(res, "2.01", {
      status: "ok",
      reply: `Hello ${device || "client"}, I got: ${message}`,
      receivedAt: new Date().toISOString(),
    });
  }

  sendJson(res, "4.05", { error: "method not allowed" });
});

// Listen on all interfaces so the ESP32 can reach it over WiFi (UDP)
server.listen(PORT, "0.0.0.0", () => {
  console.log(`CoAP API listening on UDP port ${PORT}`);
});
