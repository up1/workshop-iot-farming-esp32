// CoAP + JSON  (same logic as ../../coap/index.js, without logging)
const coap = require("coap");
const PORT = process.env.PORT || 5683;

const server = coap.createServer({ type: "udp4" });

function sendJson(res, code, body) {
  res.code = code;
  res.setOption("Content-Format", "application/json");
  res.end(JSON.stringify(body));
}

server.on("request", (req, res) => {
  if (req.url !== "/hello" || req.method !== "POST") return sendJson(res, "4.04", { error: "not found" });
  let body;
  try {
    body = JSON.parse(req.payload.toString() || "{}");
  } catch (e) {
    return sendJson(res, "4.00", { error: "invalid JSON" });
  }
  const { message, device } = body;
  if (!message) return sendJson(res, "4.00", { error: "message is required" });
  sendJson(res, "2.01", {
    status: "ok",
    reply: `Hello ${device || "client"}, I got: ${message}`,
    receivedAt: new Date().toISOString(),
  });
});

server.listen(PORT, "127.0.0.1", () => console.log("ready"));
