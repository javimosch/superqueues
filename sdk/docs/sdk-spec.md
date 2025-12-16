# SuperQueues JS SDK Specification

## Overview

A lightweight JavaScript SDK for interacting with the SuperQueues gateway. Supports both HTTP (pull-based) and WebSocket (push-based) modes for flexibility across different runtime environments.

## Design Goals

1. **Dual transport**: HTTP for simple request/response, WS for real-time streaming
2. **Unified API**: Same method signatures regardless of transport
3. **Zero dependencies**: Works in Node.js (18+) and browsers
4. **TypeScript-friendly**: JSDoc types, easy to add `.d.ts` later
5. **Publishable**: Separate `package.json`, ready for npm

## Installation (future)

```bash
npm install @superqueues/sdk
```

## Usage

### HTTP Mode (Pull-based)

```javascript
const { createClient } = require('@superqueues/sdk');

const client = createClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'sqk_...',
  mode: 'http', // default
});

// Publish
const { jobId, messageId } = await client.publish('orders.created', {
  orderId: 'ORD-123',
  total: 99.99,
});

// Pull (returns array of messages with receiptId)
const messages = await client.pull('orders.created', { maxMessages: 5 });

for (const msg of messages) {
  try {
    await processOrder(msg.payload);
    await client.ack('orders.created', msg.receiptId);
  } catch (err) {
    await client.nack('orders.created', msg.receiptId, { action: 'retry', reason: err.message });
  }
}
```

### WebSocket Mode (Push-based)

```javascript
const { createClient } = require('@superqueues/sdk');

const client = createClient({
  baseUrl: 'ws://localhost:3000',
  apiKey: 'sqk_...',
  mode: 'ws',
});

await client.connect();

// Subscribe to queue (messages pushed to callback)
client.subscribe('orders.created', async (msg, { ack, nack }) => {
  try {
    await processOrder(msg.payload);
    await ack();
  } catch (err) {
    await nack({ action: 'retry', reason: err.message });
  }
});

// Publish still works (sent over WS)
await client.publish('orders.created', { orderId: 'ORD-456' });

// Graceful shutdown
await client.close();
```

### Admin Operations (HTTP only)

```javascript
// Requires admin scope
const admin = client.admin();

// List queues
const { queues } = await admin.listQueues();

// Get queue messages
const { jobs } = await admin.getQueueMessages('orders.created', { status: 'dlq' });

// Requeue from DLQ
await admin.requeueFromDlq('orders.created', ['job-id-1', 'job-id-2']);

// Purge DLQ
await admin.purgeQueue('orders.created', 'dlq');

// Start consumer (for pull mode)
await admin.startConsumer('orders.created');

// Settings
const { auditMode } = await admin.getSettings();
await admin.updateSettings({ auditMode: 'jobs_only' });
```

## API Reference

### `createClient(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | required | Gateway URL (http:// or ws://) |
| `apiKey` | `string` | required | API key with appropriate scopes |
| `mode` | `'http' \| 'ws'` | `'http'` | Transport mode |
| `timeout` | `number` | `30000` | Request timeout (ms) for HTTP |
| `reconnect` | `boolean` | `true` | Auto-reconnect for WS |
| `reconnectInterval` | `number` | `1000` | Reconnect delay (ms) |

### Client Methods

#### `publish(queue, payload, options?)`
Publish a message to a queue.

Options:
- `headers`: Custom headers object
- `correlationId`: Correlation ID for tracing
- `idempotencyKey`: Prevent duplicate processing

Returns: `{ jobId, messageId }`

#### `pull(queue, options?)`
Pull messages from a queue (HTTP mode only).

Options:
- `maxMessages`: Max messages to pull (default: 10)
- `visibilityTimeoutMs`: Lease duration (default: 30000)

Returns: `Message[]`

#### `ack(queue, receiptId)`
Acknowledge a message (mark as processed).

#### `nack(queue, receiptId, options?)`
Negative-acknowledge a message.

Options:
- `action`: `'requeue' | 'retry' | 'dlq'` (default: 'requeue')
- `reason`: Error reason string

#### `subscribe(queue, handler)` (WS mode)
Subscribe to receive messages pushed from the gateway.

Handler signature: `(message, controls) => Promise<void>`
- `controls.ack()`: Acknowledge
- `controls.nack(options?)`: Negative-acknowledge

#### `connect()` (WS mode)
Establish WebSocket connection.

#### `close()`
Close connection / cleanup.

#### `admin()`
Returns admin client for management operations.

### Message Shape

```javascript
{
  receiptId: 'uuid',      // For ack/nack
  messageId: 'uuid',      // Unique message ID
  jobId: 'uuid',          // Job ID in gateway
  payload: { ... },       // Your data
  headers: { ... },       // Custom headers
  attempt: 1,             // Delivery attempt number
  enqueuedAt: 'ISO8601',  // When originally enqueued
}
```

## Events (WS mode)

```javascript
client.on('connected', () => { });
client.on('disconnected', (reason) => { });
client.on('reconnecting', (attempt) => { });
client.on('error', (err) => { });
```

## Error Handling

All methods throw `SuperQueuesError` with:
- `message`: Human-readable error
- `code`: Error code (e.g., 'UNAUTHORIZED', 'NOT_FOUND', 'TIMEOUT')
- `status`: HTTP status code (if applicable)

```javascript
try {
  await client.publish('queue', data);
} catch (err) {
  if (err.code === 'UNAUTHORIZED') {
    // Handle auth error
  }
}
```

## File Structure

```
sdk/
├── package.json
├── index.js           # Entry point, exports createClient
├── lib/
│   ├── client.js      # Client factory
│   ├── http.js        # HTTP adapter
│   ├── ws.js          # WebSocket adapter
│   ├── admin.js       # Admin operations
│   └── errors.js      # Error classes
├── docs/
│   └── sdk-spec.md    # This file
└── README.md
```

## Implementation Notes

1. **HTTP adapter**: Uses native `fetch` (Node 18+) or `http` module fallback
2. **WS adapter**: Uses `ws` package for Node, native WebSocket for browser
3. **Browser bundle**: Can add esbuild/rollup config later for browser dist
4. **No runtime deps**: Keep it lean for easy adoption

## Future Enhancements

- TypeScript rewrite with full types
- Browser bundle (UMD/ESM)
- Retry with exponential backoff
- Batch publish
- Metrics/tracing hooks
- Connection pooling for HTTP
