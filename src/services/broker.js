const config = require('../config');

const managementUrl = config.rabbitmq.managementUrl.replace(/\/$/, '');
const authHeader = 'Basic ' + Buffer.from(
  `${config.rabbitmq.managementUser}:${config.rabbitmq.managementPassword}`
).toString('base64');

async function request(path) {
  const url = `${managementUrl}/api${path}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`RabbitMQ Management API error: ${res.status} ${text}`);
    }

    return res.json();
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      throw new Error('RabbitMQ Management API not reachable');
    }
    throw err;
  }
}

async function getOverview() {
  const data = await request('/overview');
  
  return {
    clusterName: data.cluster_name,
    rabbitmqVersion: data.rabbitmq_version,
    erlangVersion: data.erlang_version,
    nodeCount: data.cluster_links?.length + 1 || 1,
    queues: data.object_totals?.queues || 0,
    connections: data.object_totals?.connections || 0,
    channels: data.object_totals?.channels || 0,
    consumers: data.object_totals?.consumers || 0,
    exchanges: data.object_totals?.exchanges || 0,
    messageStats: {
      publishRate: data.message_stats?.publish_details?.rate || 0,
      deliverRate: data.message_stats?.deliver_get_details?.rate || 0,
      ackRate: data.message_stats?.ack_details?.rate || 0,
      confirmRate: data.message_stats?.confirm_details?.rate || 0,
    },
    queueTotals: {
      messages: data.queue_totals?.messages || 0,
      messagesReady: data.queue_totals?.messages_ready || 0,
      messagesUnacked: data.queue_totals?.messages_unacknowledged || 0,
    },
  };
}

async function getQueues(options = {}) {
  let path = '/queues';
  
  const params = new URLSearchParams();
  if (options.vhost) {
    path = `/queues/${encodeURIComponent(options.vhost)}`;
  }
  if (options.name) {
    params.set('name', options.name);
    params.set('use_regex', 'true');
  }
  if (options.columns) {
    params.set('columns', options.columns.join(','));
  }
  
  const qs = params.toString();
  const data = await request(`${path}${qs ? '?' + qs : ''}`);
  
  return data.map(q => ({
    name: q.name,
    vhost: q.vhost,
    durable: q.durable,
    autoDelete: q.auto_delete,
    exclusive: q.exclusive,
    state: q.state,
    consumers: q.consumers || 0,
    consumerUtilisation: q.consumer_utilisation || 0,
    messages: q.messages || 0,
    messagesReady: q.messages_ready || 0,
    messagesUnacked: q.messages_unacknowledged || 0,
    messageBytes: q.message_bytes || 0,
    messageStats: {
      publishRate: q.message_stats?.publish_details?.rate || 0,
      deliverRate: q.message_stats?.deliver_get_details?.rate || 0,
      ackRate: q.message_stats?.ack_details?.rate || 0,
      redeliverRate: q.message_stats?.redeliver_details?.rate || 0,
    },
    arguments: q.arguments || {},
    policy: q.policy || null,
    idleSince: q.idle_since || null,
  }));
}

async function getQueue(vhost, name) {
  const data = await request(`/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(name)}`);
  
  return {
    name: data.name,
    vhost: data.vhost,
    durable: data.durable,
    autoDelete: data.auto_delete,
    exclusive: data.exclusive,
    state: data.state,
    consumers: data.consumers || 0,
    consumerUtilisation: data.consumer_utilisation || 0,
    messages: data.messages || 0,
    messagesReady: data.messages_ready || 0,
    messagesUnacked: data.messages_unacknowledged || 0,
    messageBytes: data.message_bytes || 0,
    messageStats: {
      publish: data.message_stats?.publish || 0,
      publishRate: data.message_stats?.publish_details?.rate || 0,
      deliver: data.message_stats?.deliver_get || 0,
      deliverRate: data.message_stats?.deliver_get_details?.rate || 0,
      ack: data.message_stats?.ack || 0,
      ackRate: data.message_stats?.ack_details?.rate || 0,
      redeliver: data.message_stats?.redeliver || 0,
      redeliverRate: data.message_stats?.redeliver_details?.rate || 0,
    },
    arguments: data.arguments || {},
    policy: data.policy || null,
    idleSince: data.idle_since || null,
    memory: data.memory || 0,
    consumerDetails: (data.consumer_details || []).map(c => ({
      consumerTag: c.consumer_tag,
      channelDetails: c.channel_details,
      prefetchCount: c.prefetch_count,
      ackRequired: c.ack_required,
    })),
  };
}

async function getConnections() {
  const data = await request('/connections');
  
  return data.map(c => ({
    name: c.name,
    user: c.user,
    vhost: c.vhost,
    state: c.state,
    channels: c.channels,
    protocol: c.protocol,
    host: c.host,
    port: c.port,
    peerHost: c.peer_host,
    peerPort: c.peer_port,
    connectedAt: c.connected_at,
    sendRate: c.send_oct_details?.rate || 0,
    recvRate: c.recv_oct_details?.rate || 0,
  }));
}

async function getNodes() {
  const data = await request('/nodes');
  
  return data.map(n => ({
    name: n.name,
    type: n.type,
    running: n.running,
    memUsed: n.mem_used,
    memLimit: n.mem_limit,
    memAlarm: n.mem_alarm,
    diskFree: n.disk_free,
    diskFreeLimit: n.disk_free_limit,
    diskFreeAlarm: n.disk_free_alarm,
    fdUsed: n.fd_used,
    fdTotal: n.fd_total,
    socketsUsed: n.sockets_used,
    socketsTotal: n.sockets_total,
    procUsed: n.proc_used,
    procTotal: n.proc_total,
    uptimeMs: n.uptime,
  }));
}

async function ping() {
  try {
    await request('/overview');
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getOverview,
  getQueues,
  getQueue,
  getConnections,
  getNodes,
  ping,
};
