# SuperQueues Cluster Setup

Production-like deployment with RabbitMQ cluster, multiple gateway instances, and load balancing.

## Architecture

```
                    ┌─────────┐
                    │  nginx  │ :3000 (gateway LB)
                    └────┬────┘
               ┌─────────┼─────────┐
               ▼         ▼         ▼
          ┌────────┐ ┌────────┐ ┌────────┐
          │gateway1│ │gateway2│ │gateway3│
          └────┬───┘ └────┬───┘ └────┬───┘
               └─────────┬─────────┘
                    ┌────▼────┐
                    │ HAProxy │ :5672 (AMQP) + :15672 (mgmt)
                    └────┬────┘
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     ┌─────────┐   ┌─────────┐   ┌─────────┐
     │ rabbit1 │◄──│ rabbit2 │──►│ rabbit3 │  (clustered)
     └─────────┘   └─────────┘   └─────────┘
               
     ┌─────────┐         ┌─────────┐
     │  mongo  │         │  redis  │ (shared state)
     └─────────┘         └─────────┘
```

## Components

| Component | Count | Purpose |
|-----------|-------|---------|
| RabbitMQ | 3 | Message broker cluster (disc nodes) |
| HAProxy | 1 | Load balancer for AMQP + Management API |
| Gateway | 3 | SuperQueues API servers |
| Nginx | 1 | Load balancer for Gateway HTTP |
| MongoDB | 1 | Job persistence |
| Redis | 1 | Receipt/lease tracking |

## Quick Start

```bash
# Start the cluster
./cluster/scripts/start-cluster.sh

# Or manually:
docker compose -f docker-compose.cluster.yml up -d
./cluster/scripts/init-cluster.sh
```

## Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| Gateway API | http://localhost:3000 | API Key |
| Gateway Admin UI | http://localhost:3000/admin | API Key |
| RabbitMQ Management | http://localhost:15672 | guest/guest |
| HAProxy Stats | http://localhost:1936 | - |

## Scripts

| Script | Description |
|--------|-------------|
| `cluster/scripts/start-cluster.sh` | Start all services and init cluster |
| `cluster/scripts/stop-cluster.sh` | Stop all services |
| `cluster/scripts/reset-cluster.sh` | Stop and remove all data (volumes) |
| `cluster/scripts/init-cluster.sh` | Join RabbitMQ nodes into cluster |

## Configuration Files

```
cluster/
├── haproxy/
│   └── haproxy.cfg          # HAProxy configuration
├── nginx/
│   └── nginx.conf           # Nginx configuration
├── rabbitmq/
│   ├── enabled_plugins      # RabbitMQ plugins
│   └── cluster-entrypoint.sh
└── scripts/
    ├── start-cluster.sh
    ├── stop-cluster.sh
    ├── reset-cluster.sh
    └── init-cluster.sh
```

## HAProxy Configuration

HAProxy provides:
- **AMQP load balancing** (port 5672): Round-robin across RabbitMQ nodes
- **Management API load balancing** (port 15672): HTTP health checks
- **Stats dashboard** (port 1936): Real-time backend status

## Nginx Configuration

Nginx provides:
- **Gateway load balancing**: Least-connections algorithm
- **WebSocket support**: For real-time features
- **Health endpoint**: `/nginx-health`

## Testing with SDK

```bash
# Start cluster
./cluster/scripts/start-cluster.sh

# Create an admin API key (use RabbitMQ UI or seed script)
node scripts/seed-api-keys.js

# Run SDK example against cluster
GATEWAY_URL=http://localhost:3000 \
GATEWAY_API_KEY=sqk_admin_... \
node examples/import-backend-sdk/index.js
```

## Admin UI Cluster Features

The Admin UI (`/admin`) now shows:
- **Cluster topology**: Visual representation of all nodes
- **Node status**: Running/stopped, disc/ram type
- **Resource alerts**: Memory and disk alarms
- **Network partitions**: Warning if cluster is split

## Monitoring

### HAProxy Stats
Visit http://localhost:1936 to see:
- Backend server health
- Request rates
- Connection counts

### RabbitMQ Management
Visit http://localhost:15672 to see:
- Cluster overview
- Queue distribution across nodes
- Connection distribution

## Troubleshooting

### Cluster not forming
```bash
# Check if all nodes are healthy
docker exec sq-rabbit1 rabbitmqctl cluster_status

# Re-run cluster init
./cluster/scripts/init-cluster.sh
```

### Gateway can't connect to RabbitMQ
```bash
# Check HAProxy is routing correctly
curl http://localhost:1936

# Check RabbitMQ is accessible through HAProxy
curl -u guest:guest http://localhost:15672/api/overview
```

### Reset everything
```bash
./cluster/scripts/reset-cluster.sh
./cluster/scripts/start-cluster.sh
```

## Production Considerations

For actual production deployments:

1. **Use quorum queues**: For queue replication across nodes
2. **Persistent volumes**: Back up MongoDB and RabbitMQ data
3. **TLS**: Enable TLS for all connections
4. **Secrets management**: Don't use default credentials
5. **Resource limits**: Set CPU/memory limits in compose
6. **Monitoring**: Add Prometheus + Grafana
7. **Logging**: Centralize logs with ELK or similar
