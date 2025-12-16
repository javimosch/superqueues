#!/bin/bash
set -e

# Wait for rabbit1 to be available
wait_for_rabbit1() {
  echo "Waiting for rabbit1 to be ready..."
  until rabbitmqctl -n rabbit@rabbit1 status >/dev/null 2>&1; do
    sleep 2
  done
  echo "rabbit1 is ready"
}

# Join cluster if not rabbit1
join_cluster() {
  local node_name=$(rabbitmqctl eval 'node().' | tr -d "'")
  
  if [ "$node_name" != "rabbit@rabbit1" ]; then
    echo "Checking if already in cluster..."
    
    # Check if already clustered
    if rabbitmqctl cluster_status | grep -q "rabbit@rabbit1"; then
      echo "Already in cluster with rabbit1"
      return 0
    fi
    
    echo "Joining cluster as $node_name..."
    wait_for_rabbit1
    
    rabbitmqctl stop_app
    rabbitmqctl reset
    rabbitmqctl join_cluster rabbit@rabbit1
    rabbitmqctl start_app
    
    echo "Successfully joined cluster!"
  else
    echo "This is rabbit1 (primary node), not joining anyone"
  fi
}

# Start RabbitMQ in background, then join cluster
echo "Starting RabbitMQ server..."
rabbitmq-server &
RABBIT_PID=$!

# Wait for local node to be ready
sleep 10
until rabbitmqctl status >/dev/null 2>&1; do
  echo "Waiting for local RabbitMQ to start..."
  sleep 2
done

# Join cluster
join_cluster

# Wait for RabbitMQ process
wait $RABBIT_PID
