# superqueues
                                                                                        
RabbitMQ wrapper gateway with HTTP API.

## Why

SuperQueues was created to make queue-based workflows easier to operate and easier to integrate.

- **Simple queue operations**
  Publish, pull, ack and nack via a small HTTP API instead of dealing with broker-specific protocols.
- **Operational visibility**
  A built-in admin UI to inspect queues, message/job status, DLQs, and auditing.
- **API keys & access control**
  Built-in API keys with scopes (`publish`, `consume`, `admin`) and per-queue allowlists so services can be restricted to only the queues they need.
- **Auditing**
  Job audit (jobs + job events) for message lifecycle visibility, plus API key usage audit for tracking who did what (queue ops + admin actions).
- **Decouple applications from RabbitMQ**
  Your services talk to a stable gateway API + SDK. This makes it easier to switch the underlying broker implementation in the future without rewriting every producer/consumer.
- **Developer ergonomics**
  A small JavaScript SDK that mirrors the gateway API for both pull (HTTP) and push (WebSocket) consumption patterns.

## Requirements

- Node.js (see `package.json`)
- Docker + Docker Compose (recommended for local infrastructure)

### Dependencies

- RabbitMQ
- MongoDB
- Redis

```bash
docker compose up -d rabbitmq mongo redis 
```

## Getting started

Install dependencies:

```bash
npm install
```

Start the API:

```bash
npm start
```

Run in watch mode:

```bash
npm run dev
```

## Local cluster (Docker)

There are helper scripts under `cluster/scripts/`.

- `cluster/scripts/start-cluster.sh`
- `cluster/scripts/reset-cluster.sh`
- `cluster/scripts/init-cluster.sh`

## Docs

- `docs/queue-gateway-spec.md`
- `docs/cluster-setup.md`

## SDK

JavaScript SDK lives in `sdk/`.

See:

- `sdk/README.md`

### Using the SDK

Install:

```bash
npm install @superqueues/sdk
```

Create a client and publish:

```js
const { createClient } = require('@superqueues/sdk');

const client = createClient({
  baseUrl: 'http://localhost:3000',
  apiKey: process.env.GATEWAY_API_KEY,
});

await client.publish('orders.created', { orderId: 'ORD-123' });
```

Consume (HTTP pull):

```js
const messages = await client.pull('orders.created', { maxMessages: 10 });

for (const msg of messages) {
  try {
    await processOrder(msg.payload);
    await client.ack('orders.created', msg.receiptId);
  } catch (err) {
    await client.nack('orders.created', msg.receiptId, { action: 'retry', reason: err.message });
  }
}
```

Notes:

- `baseUrl` can be `http://...` for HTTP mode (default) or `ws://...` for WebSocket mode.
- API keys are required; create one in the admin UI or via the admin endpoints.

## Examples

### Import backend (no SDK)

Source:

- `examples/import-backend/index.js`
- `examples/import-backend/index.html`

Prerequisites:

- Gateway running (default: `http://localhost:3000`)
- An **admin** API key exported as `GATEWAY_API_KEY` (or `API_KEY`)

Run:

```bash
GATEWAY_API_KEY=sqk_... node examples/import-backend/index.js
```

Then open:

- `http://localhost:3003`

Notes:

- Set `GATEWAY_URL` (or `PORT_GATEWAY`) if your gateway is not on `http://localhost:3000`.
- This example uses raw HTTP requests to the gateway (publish/pull/ack + admin start-consumer).

### Import backend (SDK)

Source:

- `examples/import-backend-sdk/index.js`
- `examples/import-backend-sdk/index.html`

Prerequisites:

- Gateway running (default: `http://localhost:3000`)
- An **admin** API key exported as `GATEWAY_API_KEY` (or `API_KEY`)

Run:

```bash
GATEWAY_API_KEY=sqk_... node examples/import-backend-sdk/index.js
```

Then open:

- `http://localhost:3003`

Notes:

- Set `GATEWAY_URL` (or `PORT_GATEWAY`) if your gateway is not on `http://localhost:3000`.
- This example uses the local SDK via `require('../../sdk')`.

## License

MIT (see `LICENSE`).
