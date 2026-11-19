// HTTP REST + JSON  (same logic as ../../http_rest/index.js, without logging)
const express = require("express");
const PORT = process.env.PORT || 3001;

const app = express();
app.use(express.json());

app.post("/hello", (req, res) => {
  const { message, device } = req.body || {};
  if (!message) return res.status(400).json({ error: "message is required" });
  res.status(201).json({
    status: "ok",
    reply: `Hello ${device || "client"}, I got: ${message}`,
    receivedAt: new Date().toISOString(),
  });
});

app.listen(PORT, "127.0.0.1", () => console.log("ready"));
