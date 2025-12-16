# Queue Gateway (RabbitMQ Wrapper) - V1 Specification

## Goals

- Provide a **centralized**, deployable service that wraps RabbitMQ behind an **HTTP machine-to-machine API**.
- Allow a company to run **multiple instances** for different departments/sub-companies (separate deployments, namespaces, or RabbitMQ vhosts).
- Preserve RabbitMQ-native semantics (**at-least-once**, duplicates possible).
- Provide **job status + audit/history** with the ability to **disable/scale down audit at runtime** when throughput is high.
- Be **docker-compose capable** and easy to adopt in any application that can do HTTP.

## Non-Goals (V1)

- Browser clients.
- Exactly-once delivery.
- A full workflow engine.
- WebSocket push consumption (candidate for V2).

## Terminology

- **Queue**: logical destination for messages; maps to RabbitMQ queues/exchanges per naming rules.
- **Message**: payload + headers sent to a queue.
- **Job**: application-level tracking record for a message lifecycle (status, attempts, errors).
- **Receipt**: short-lived lease token returned by HTTP pull, used for ack/nack.

## High-level Architecture

- **queue-gateway (Node.js)**
  - HTTP API (publish/pull/ack/nack, job queries)
  - Admin API + Admin UI (API keys, basic ops)
  - RabbitMQ adapter (publisher confirms, consumer runtime)
  - Audit & job tracking (Mongo)
  - Lease/receipt store (Redis)
- **rabbitmq**
  - Main queues + retry queues + DLQs
- **mongo**
  - Durable job history + audit events + API key metadata
- **redis**
  - Receipt leases + idempotency keys + optional rate limiting counters

## Delivery Semantics

- **At-least-once** delivery.
- A message may be delivered more than once (due to lease expiry, client failure, or redelivery).
- Consumers must be **idempotent**, or publishers may use idempotency keys for publish dedupe.

## Namespacing / Multi-deployment

This service is centralized per deployment. Multiple deployments can exist.

Recommended namespacing formats:

- **Deployment-level namespace**: `TENANT` and `ENV`.
- Queue names are normalized as:
  - `${TENANT}.${ENV}.${queue}`

Alternatively, separate by RabbitMQ vhost per tenant.

## Authentication & Authorization

### API keys

- Machine-to-machine calls authenticate using `Authorization: ApiKey <rawKey>`.
- Store only a hash in Mongo (never store the raw key).

### Key capabilities

Each key has:

- `enabled`: boolean
- `scopes`: `publish`, `consume`, `admin`
- `allowedQueues`: allowlist (supports patterns if needed)

Authorization rules:

- Publish requires `publish` scope.
- Pull/ack/nack requires `consume` scope.
- Admin endpoints and UI require `admin` scope.

## HTTP API (V1)

Base path: `/v1`

### Health

- `GET /healthz` -> liveness
- `GET /readyz` -> readiness (checks RabbitMQ + Redis + Mongo connectivity)

### Publish

- `POST /queues/:queue/messages`

Request:

```json
{
  "payload": {"any": "json"},
  "headers": {"optional": "string"},
  "delayMs": 0,
  "idempotencyKey": "optional-string",
  "correlationId": "optional-string"
}
```

Response:

```json
{
  "messageId": "uuid",
  "jobId": "uuid",
  "enqueuedAt": "iso-8601"
}
```

Notes:

- `delayMs` is implemented via retry/delay infrastructure (see Retry & DLQ). If not supported for a queue, return `400`.
- `idempotencyKey` enables publish dedupe (stored in Redis with TTL).

### Pull / Reserve (HTTP consumption)

- `POST /queues/:queue/pull`

Request:

```json
{
  "maxMessages": 10,
  "visibilityTimeoutMs": 30000
}
```

Response:

```json
{
  "messages": [
    {
      "receiptId": "uuid",
      "messageId": "uuid",
      "jobId": "uuid",
      "payload": {"any": "json"},
      "headers": {"any": "string"},
      "attempt": 1,
      "enqueuedAt": "iso-8601"
    }
  ]
}
```

Notes:

- `receiptId` represents a **lease** managed by the gateway.
- If the lease expires before ack, the message is requeued (at-least-once).

### Ack

- `POST /queues/:queue/ack`

Request:

```json
{ "receiptId": "uuid" }
```

Response:

```json
{ "ok": true }
```

### Nack

- `POST /queues/:queue/nack`

Request:

```json
{
  "receiptId": "uuid",
  "action": "requeue",
  "reason": "optional"
}
```

Where `action` is one of:

- `requeue` (immediate)
- `retry` (delayed, increments attempt)
- `dlq` (dead-letter)

Response:

```json
{ "ok": true }
```

### Jobs

- `GET /jobs/:jobId`
- `GET /jobs?queue=&status=&from=&to=&limit=`

Minimum job fields returned:

- `jobId`, `queue`, `status`, `attempts`, `createdAt`, `updatedAt`, `lastError`, `correlationId`, `messageId`

## Retry & DLQ

### Strategy

Use RabbitMQ DLX + TTL queues (no plugin requirement).

Per logical queue `q`:

- Main queue: `q`
- Retry queues: `q.retry.1`, `q.retry.2`, ... (each has TTL and DLX back to main)
- DLQ: `q.dlq`

### Attempt counting

- Maintain `attempt` in headers.
- On `nack` with action `retry`:
  - publish to the appropriate retry queue (based on attempt)
  - update job status

## Job Status & Audit (Mongo)

### Collections

- `api_keys`
- `jobs`
- `job_events` (optional but recommended for audit trail)

### Audit modes (runtime configurable)

Audit must be **flexible** and togglable without redeploy.

Define an `AUDIT_MODE` setting:

- `full`: write `jobs` and `job_events` for every state transition
- `jobs_only`: write only `jobs` (no event stream)
- `off`: do not write job history (still allow operational metrics)

Control plane endpoints:

- `GET /admin/settings`
- `POST /admin/settings` -> update audit mode

Storage of settings:

- Store current settings in Mongo (durable), optionally cache in Redis.

## Redis Responsibilities

- Receipt leases:
  - `receipt:{receiptId}` -> references to internal delivery token + expiry
- Idempotency:
  - `idempotency:{apiKeyId}:{queue}:{idempotencyKeyHash}` -> `messageId/jobId` with TTL

## Admin UI (V1)

Backend-only UI (served by the gateway):

- API keys:
  - create (show raw key once)
  - disable/enable
  - scopes and allowed queues
  - last used timestamp
- Settings:
  - audit mode toggle (`full` / `jobs_only` / `off`)
- Basic ops:
  - list queues and approximate stats
  - view DLQ counts; optional requeue action

UI stack:

- Vue3 CDN
- Tailwind CDN
- DaisyUI CDN
- EJS only if needed (otherwise static HTML served by Node)

## Configuration

Required:

- `RABBITMQ_URL`
- `MONGO_URL`
- `REDIS_URL`

Defaults/tuning:

- `PREFETCH_DEFAULT`
- `PULL_MAX_DEFAULT`
- `VISIBILITY_TIMEOUT_DEFAULT_MS`
- `RECEIPT_TTL_MAX_MS`
- `IDEMPOTENCY_TTL_MS`
- `AUDIT_MODE` (initial)

## Operational Notes

- Horizontal scaling:
  - Publishing scales horizontally.
  - Pull consumption must coordinate receipts. Use Redis for shared lease state.
  - Ensure the consumer runtime does not double-lease the same delivery token across replicas (implementation detail: store delivery reference per receipt and ack/nack through the owning worker, or use a design where each replica only acks deliveries it owns).
- Backpressure:
  - Control `prefetch`.
  - Cap `maxMessages` per pull.

## docker-compose (target layout)

Services:

- `rabbitmq` (with management UI)
- `mongo`
- `redis`
- `queue-gateway`

Include:

- healthchecks
- volumes for rabbitmq and mongo

## Resolved Decisions

- **Sticky receipt ownership**: confirmed. The gateway replica that leased a message is the one that must ack/nack it. This simplifies correctness and avoids cross-replica AMQP channel coordination.

## Open Questions

- Do you want per-queue schemas/validation (JSON schema) in V1?
- Should queue definitions be dynamic via admin API (declare/bind), or configured via env/config file?

## Implementation Phases

### Phase 1: Backend + Docker + Unit Tests

1. **Core structure**: config, Express app, health endpoints
2. **Mongo models**: ApiKey, Job, JobEvent, Settings
3. **Redis service**: receipt leases, idempotency
4. **RabbitMQ adapter**: connection pool, publish with confirms, consumer runtime with prefetch
5. **Services**: publish, pull/lease, ack/nack, job queries
6. **Controllers**: queues, jobs, admin settings
7. **Auth middleware**: API key validation
8. **docker-compose**: rabbitmq, mongo, redis, queue-gateway
9. **Unit tests**: services and controllers with mocks

### Phase 2: Admin UI (deferred)

- Vue3 CDN + Tailwind + DaisyUI
- API key management
- Settings (audit mode)
- Queue stats / DLQ viewer
