# @superqueues/sdk

JavaScript SDK for the SuperQueues gateway. Supports both HTTP (pull-based) and WebSocket (push-based) modes.

## Installation

```bash
npm install @superqueues/sdk
```

For WebSocket support in Node.js, also install `ws`:

```bash
npm install ws
```

## Quick Start

### HTTP Mode (Pull-based)

```javascript
const { createClient } = require('@superqueues/sdk');

const client = createClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'sqk_your_api_key',
});

// Publish a message
const { jobId } = await client.publish('orders.created', {
  orderId: 'ORD-123',
  total: 99.99,
});

// Pull messages
const messages = await client.pull('orders.created', { maxMessages: 5 });

for (const msg of messages) {
  try {
    await processOrder(msg.payload);
    await client.ack('orders.created', msg.receiptId);
  } catch (err) {
    await client.nack('orders.created', msg.receiptId, {
      action: 'retry',
      reason: err.message,
    });
  }
}
```

### WebSocket Mode (Push-based)

```javascript
const { createClient } = require('@superqueues/sdk');

const client = createClient({
  baseUrl: 'ws://localhost:3000',
  apiKey: 'sqk_your_api_key',
  mode: 'ws',
});

await client.connect();

// Subscribe to receive messages
client.subscribe('orders.created', async (msg, { ack, nack }) => {
  try {
    await processOrder(msg.payload);
    await ack();
  } catch (err) {
    await nack({ action: 'retry', reason: err.message });
  }
});

// Publish still works
await client.publish('orders.created', { orderId: 'ORD-456' });
```

## API Reference

### `createClient(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | required | Gateway URL |
| `apiKey` | `string` | required | API key |
| `mode` | `'http' \| 'ws'` | `'http'` | Transport mode |
| `timeout` | `number` | `30000` | Request timeout (ms) |
| `reconnect` | `boolean` | `true` | Auto-reconnect (WS) |

### Methods

#### `publish(queue, payload, options?)`

Publish a message to a queue.

```javascript
const { jobId, messageId } = await client.publish('my-queue', { data: 'value' }, {
  correlationId: 'req-123',
  headers: { 'x-custom': 'header' },
});
```

#### `pull(queue, options?)` (HTTP only)

Pull messages from a queue.

```javascript
const messages = await client.pull('my-queue', {
  maxMessages: 10,
  visibilityTimeoutMs: 30000,
});
```

#### `ack(queue, receiptId)`

Acknowledge a message.

```javascript
await client.ack('my-queue', msg.receiptId);
```

#### `nack(queue, receiptId, options?)`

Negative-acknowledge a message.

```javascript
await client.nack('my-queue', msg.receiptId, {
  action: 'retry', // 'requeue' | 'retry' | 'dlq'
  reason: 'Processing failed',
});
```

#### `subscribe(queue, handler)` (WS only)

Subscribe to receive messages.

```javascript
const unsubscribe = client.subscribe('my-queue', async (msg, { ack, nack }) => {
  // Process message
  await ack();
});

// Later: unsubscribe();
```

#### `admin()`

Get admin client for management operations (requires admin scope).

```javascript
const admin = client.admin();

// List queues with stats
const { queues } = await admin.listQueues();

// Start a consumer
await admin.startConsumer('my-queue');

// Requeue from DLQ
await admin.requeueFromDlq('my-queue', ['job-id-1', 'job-id-2']);
```

### Events (WS mode)

```javascript
client.on('connected', () => console.log('Connected'));
client.on('disconnected', (reason) => console.log('Disconnected:', reason));
client.on('reconnecting', (attempt) => console.log('Reconnecting...', attempt));
client.on('error', (err) => console.error('Error:', err));
```

### Error Handling

```javascript
const { SuperQueuesError, ErrorCodes } = require('@superqueues/sdk');

try {
  await client.publish('queue', data);
} catch (err) {
  if (err instanceof SuperQueuesError) {
    console.log(err.code);   // e.g., 'UNAUTHORIZED'
    console.log(err.status); // e.g., 401
  }
}
```

## Message Shape

```javascript
{
  receiptId: 'uuid',       // For ack/nack
  messageId: 'uuid',       // Unique message ID
  jobId: 'uuid',           // Job ID in gateway
  payload: { ... },        // Your data
  headers: { ... },        // Custom headers
  attempt: 1,              // Delivery attempt
  enqueuedAt: 'ISO8601',   // Enqueue timestamp
}
```

## License

MIT
