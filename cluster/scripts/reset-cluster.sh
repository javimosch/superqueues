#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$ROOT_DIR"

echo "Stopping and removing SuperQueues cluster (including volumes)..."
docker compose -f docker-compose.cluster.yml down -v

echo "Cluster reset complete. All data removed."
