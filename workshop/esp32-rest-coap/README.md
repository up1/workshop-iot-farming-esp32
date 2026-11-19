# Workshop
```
Choose `CoAP over HTTP REST` on an ESP32 when low latency, minimal packet overhead, and battery life are priorities—and stick with HTTP REST 
when integrating with standard web backends and cloud APIs
```

## Performance & Data Size Comparison

| Metric | CoAP (Constrained Application Protocol) | HTTP REST API |
| :--- | :--- | :--- |
| **Transport Layer** | UDP (connectionless, lightweight) | TCP (requires 3-way handshake + teardown) |
| **Header Overhead** | 4 bytes (binary format) | 200–800+ bytes (ASCII text headers) |
| **Typical Packet Size** | ~50–100 bytes total | ~300–1,000+ bytes total |
| **Mean Latency (ESP32)** | ~47–74 ms | ~449–1,419 ms |
| **Encryption** | DTLS (CoAPs) | TLS / HTTPS (heavy RAM/CPU spike on ESP32) |
| **Power Consumption** | Lower (shorter radio wake time) | Higher (longer active Wi-Fi transmission) |
| **Throughput (Large Data)** | Lower (best for small sensor payloads) | Higher (TCP handles large streams better) |



