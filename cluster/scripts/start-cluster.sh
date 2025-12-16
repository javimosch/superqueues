#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$ROOT_DIR"

echo "Starting SuperQueues cluster..."
echo ""

# Start infrastructure first (rabbits, mongo, redis, haproxy)
echo "Step 1: Starting infrastructure services..."
COMPOSE_FLAGS=""
if [ "${REMOVE_ORPHANS}" = "1" ]; then
  COMPOSE_FLAGS="--remove-orphans"
fi

docker compose -f docker-compose.cluster.yml up -d $COMPOSE_FLAGS rabbit1 rabbit2 rabbit3 mongo redis

echo ""
echo "Step 2: Waiting for RabbitMQ nodes to be healthy..."
sleep 10

# Initialize cluster
echo ""
echo "Step 3: Initializing RabbitMQ cluster..."
"$SCRIPT_DIR/init-cluster.sh"

# Start HAProxy (needs healthy rabbits)
echo ""
echo "Step 4: Starting HAProxy..."
docker compose -f docker-compose.cluster.yml up -d haproxy
sleep 3

# Start gateways
echo ""
echo "Step 5: Starting gateway instances..."
docker compose -f docker-compose.cluster.yml up -d gateway1 gateway2 gateway3
sleep 5

# Start nginx
echo ""
echo "Step 6: Starting nginx load balancer..."
docker compose -f docker-compose.cluster.yml up -d nginx

echo ""
echo "============================================"
echo "SuperQueues cluster is ready!"
echo "============================================"
echo ""
echo "Services:"
echo "  - Gateway API:         http://localhost:3000"
echo "  - Gateway Admin UI:    http://localhost:3000/admin"
echo "  - RabbitMQ Management: http://localhost:15672"
echo "  - HAProxy Stats:       http://localhost:1936"
echo ""
echo "To view logs:"
echo "  docker compose -f docker-compose.cluster.yml logs -f"
echo ""
echo "To stop:"
echo "  docker compose -f docker-compose.cluster.yml down"
