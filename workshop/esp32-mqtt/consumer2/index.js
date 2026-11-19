const mqtt = require('mqtt');

const BROKER_URL = process.env.BROKER_URL || 'mqtt://localhost:1883';
const TOPIC = process.env.TOPIC || 'workshop/esp32/hello';
const NAME = 'consumer2';

// Each consumer uses its own clientId, so the broker delivers every message to both.
const client = mqtt.connect(BROKER_URL, { clientId: NAME + '-' + process.pid });

client.on('connect', () => {
  console.log(`[${NAME}] connected to ${BROKER_URL}`);
  client.subscribe(TOPIC, { qos: 1 }, (err) => {
    if (err) return console.error(`[${NAME}] subscribe error:`, err.message);
    console.log(`[${NAME}] subscribed to ${TOPIC}`);
  });
});

client.on('message', (topic, payload) => {
  try {
    const { device_id, message, timestamp } = JSON.parse(payload.toString());
    console.log(`[${NAME}] ${new Date(timestamp * 1000).toISOString()} ${device_id}: ${message}`);
  } catch (e) {
    console.error(`[${NAME}] invalid JSON on ${topic}: ${payload}`);
  }
});

client.on('error', (e) => console.error(`[${NAME}] error:`, e.message));
