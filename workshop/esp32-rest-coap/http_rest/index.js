const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Log every request
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// GET /hello - simple check from browser or curl
app.get("/hello", (_req, res) => {
  res.json({ message: "Hello from REST API" });
});

// POST /hello - called by ESP32 (demo.ino)
app.post("/hello", (req, res) => {
  const { message, device } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }
  console.log("Received:", req.body);
  res.status(201).json({
    status: "ok",
    reply: `Hello ${device || "client"}, I got: ${message}`,
    receivedAt: new Date().toISOString(),
  });
});

// Invalid JSON body and other errors
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message });
});

// Listen on all interfaces so the ESP32 can reach it over WiFi
app.listen(PORT, "0.0.0.0", () => {
  console.log(`REST API listening on port ${PORT}`);
});
