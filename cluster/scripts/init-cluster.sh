#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}SuperQueues RabbitMQ Cluster Init${NC}"
echo "=================================="

# Wait for all rabbit nodes to be healthy
wait_for_node() {
  local node=$1
  local max_attempts=30
  local attempt=0
  
  echo -n "Waiting for $node to be ready..."
  while [ $attempt -lt $max_attempts ]; do
    if docker exec $node rabbitmq-diagnostics -q ping >/dev/null 2>&1; then
      echo -e " ${GREEN}OK${NC}"
      return 0
    fi
    echo -n "."
    sleep 2
    attempt=$((attempt + 1))
  done
  
  echo -e " ${RED}FAILED${NC}"
  return 1
}

expected_running_nodes() {
  local expected=$1
  local max_attempts=60
  local attempt=0

  echo ""
  echo "Step 2: Waiting for cluster to form (expected running nodes: $expected)..."
  while [ $attempt -lt $max_attempts ]; do
    local status
    status=$(docker exec sq-rabbit1 rabbitmqctl cluster_status 2>/dev/null || true)

    if echo "$status" | grep -q "running_nodes"; then
      local running_nodes_token
      local running_nodes
      local count

      running_nodes_token=$(echo "$status" | tr -d ' ' | grep -oE 'running_nodes,\[[^\]]*\]' | head -n 1)
      running_nodes=${running_nodes_token#running_nodes,[}
      running_nodes=${running_nodes%]}

      if [ -n "$running_nodes" ]; then
        count=$(echo "$running_nodes" | awk -F',' '{print NF}')
      else
        count=0
      fi

      if [ "$count" -ge "$expected" ]; then
        echo -e "${GREEN}Cluster formed with $count running nodes${NC}"
        return 0
      fi
    fi
    echo -n "."
    sleep 2
    attempt=$((attempt + 1))
  done

  echo ""
  echo -e "${RED}Cluster did not reach $expected running nodes in time${NC}"
  return 1
}

# Main
echo ""
echo "Step 1: Waiting for RabbitMQ nodes..."
wait_for_node "sq-rabbit1"
wait_for_node "sq-rabbit2"
wait_for_node "sq-rabbit3"

expected_running_nodes 3

echo ""
echo "Step 3: Verifying cluster status..."
docker exec sq-rabbit1 rabbitmqctl cluster_status

echo ""
echo -e "${GREEN}Cluster initialization complete!${NC}"
echo ""
echo "Access points:"
echo "  - RabbitMQ Management: http://localhost:15672 (guest/guest)"
echo "  - HAProxy Stats:       http://localhost:1936"
echo "  - Gateway API:         http://localhost:3000"
echo "  - Gateway Admin UI:    http://localhost:3000/admin"
