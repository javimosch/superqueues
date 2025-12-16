const Redis = require('ioredis');
const config = require('../config');

let client = null;

function getClient() {
  if (!client) {
    client = new Redis(config.redis.url);
  }
  return client;
}

async function setReceipt(receiptId, data, ttlMs) {
  const redis = getClient();
  const key = `receipt:${receiptId}`;
  await redis.set(key, JSON.stringify(data), 'PX', ttlMs);
}

async function getReceipt(receiptId) {
  const redis = getClient();
  const key = `receipt:${receiptId}`;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

async function deleteReceipt(receiptId) {
  const redis = getClient();
  const key = `receipt:${receiptId}`;
  return redis.del(key);
}

async function checkIdempotency(apiKeyId, queue, idempotencyKey) {
  const redis = getClient();
  const key = `idempotency:${apiKeyId}:${queue}:${idempotencyKey}`;
  const existing = await redis.get(key);
  return existing ? JSON.parse(existing) : null;
}

async function setIdempotency(apiKeyId, queue, idempotencyKey, data) {
  const redis = getClient();
  const key = `idempotency:${apiKeyId}:${queue}:${idempotencyKey}`;
  await redis.set(key, JSON.stringify(data), 'PX', config.queue.idempotencyTtlMs);
}

async function ping() {
  const redis = getClient();
  const result = await redis.ping();
  return result === 'PONG';
}

async function close() {
  if (client) {
    await client.quit();
    client = null;
  }
}

function setClient(mockClient) {
  client = mockClient;
}

module.exports = {
  getClient,
  setReceipt,
  getReceipt,
  deleteReceipt,
  checkIdempotency,
  setIdempotency,
  ping,
  close,
  setClient,
};
