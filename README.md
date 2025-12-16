# superqueues
                                                                                        
RabbitMQ wrapper gateway with HTTP API.

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
