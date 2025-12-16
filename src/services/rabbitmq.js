const amqp = require('amqplib');
const config = require('../config');

let connection = null;
let publishChannel = null;
const consumerChannels = new Map();
const deliveryStore = new Map();

function getQueueName(queue) {
  const { tenant, env } = config.namespace;
  return `${tenant}.${env}.${queue}`;
}

function getRetryQueueName(queue, attempt) {
  return `${getQueueName(queue)}.retry.${attempt}`;
}

function getDlqName(queue) {
  return `${getQueueName(queue)}.dlq`;
}

async function connect() {
  if (!connection) {
    connection = await amqp.connect(config.rabbitmq.url);
    connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err.message);
      connection = null;
      publishChannel = null;
    });
    connection.on('close', () => {
      connection = null;
      publishChannel = null;
    });
  }
  return connection;
}

async function getPublishChannel() {
  if (!publishChannel) {
    const conn = await connect();
    publishChannel = await conn.createConfirmChannel();
  }
  return publishChannel;
}

async function ensureQueue(queue) {
  const channel = await getPublishChannel();
  const queueName = getQueueName(queue);
  const dlqName = getDlqName(queue);
  
  await channel.assertQueue(dlqName, { durable: true });
  
  await channel.assertQueue(queueName, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': dlqName,
    },
  });
  
  for (let i = 1; i <= config.queue.maxRetryAttempts; i++) {
    const retryQueueName = getRetryQueueName(queue, i);
    const delayMs = config.queue.retryDelaysMs[i - 1] || config.queue.retryDelaysMs[config.queue.retryDelaysMs.length - 1];
    
    await channel.assertQueue(retryQueueName, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': queueName,
        'x-message-ttl': delayMs,
      },
    });
  }
  
  return queueName;
}

async function publish(queue, message, options = {}) {
  const channel = await getPublishChannel();
  const queueName = await ensureQueue(queue);
  
  const content = Buffer.from(JSON.stringify(message.payload));
  const publishOptions = {
    persistent: true,
    messageId: message.messageId,
    headers: {
      ...message.headers,
      'x-job-id': message.jobId,
      'x-attempt': 1,
      'x-enqueued-at': new Date().toISOString(),
    },
  };
  
  if (message.correlationId) {
    publishOptions.correlationId = message.correlationId;
  }
  
  return new Promise((resolve, reject) => {
    channel.publish('', queueName, content, publishOptions, (err) => {
      if (err) reject(err);
      else resolve({ messageId: message.messageId, jobId: message.jobId });
    });
  });
}

async function publishToRetry(queue, deliveryData, attempt) {
  const channel = await getPublishChannel();
  const retryQueueName = getRetryQueueName(queue, attempt);
  
  const content = Buffer.from(JSON.stringify(deliveryData.payload));
  const publishOptions = {
    persistent: true,
    messageId: deliveryData.messageId,
    correlationId: deliveryData.correlationId,
    headers: {
      ...deliveryData.headers,
      'x-job-id': deliveryData.jobId,
      'x-attempt': attempt,
    },
  };
  
  return new Promise((resolve, reject) => {
    channel.publish('', retryQueueName, content, publishOptions, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function publishToDlq(queue, deliveryData, reason) {
  const channel = await getPublishChannel();
  const dlqName = getDlqName(queue);
  
  const content = Buffer.from(JSON.stringify(deliveryData.payload));
  const publishOptions = {
    persistent: true,
    messageId: deliveryData.messageId,
    correlationId: deliveryData.correlationId,
    headers: {
      ...deliveryData.headers,
      'x-job-id': deliveryData.jobId,
      'x-dlq-reason': reason || 'manual',
      'x-dlq-at': new Date().toISOString(),
    },
  };
  
  return new Promise((resolve, reject) => {
    channel.publish('', dlqName, content, publishOptions, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function startConsumer(queue, prefetch = config.rabbitmq.prefetchDefault) {
  const conn = await connect();
  const channel = await conn.createChannel();
  await channel.prefetch(prefetch);
  
  const queueName = await ensureQueue(queue);
  consumerChannels.set(queue, channel);
  
  await channel.consume(queueName, (msg) => {
    if (!msg) return;
    
    const deliveryTag = msg.fields.deliveryTag;
    const headers = msg.properties.headers || {};
    
    const deliveryData = {
      deliveryTag,
      msg,
      channel,
      queue,
      messageId: msg.properties.messageId,
      jobId: headers['x-job-id'],
      correlationId: msg.properties.correlationId,
      payload: JSON.parse(msg.content.toString()),
      headers,
      attempt: headers['x-attempt'] || 1,
      enqueuedAt: headers['x-enqueued-at'],
      leased: false,
    };
    
    const deliveryId = `${queue}:${deliveryTag}`;
    deliveryStore.set(deliveryId, deliveryData);
  });
  
  return channel;
}

function getDeliveries(queue, max) {
  const deliveries = [];
  for (const [key, data] of deliveryStore.entries()) {
    if (data.queue === queue && !data.leased && deliveries.length < max) {
      deliveries.push({ key, data });
    }
  }
  return deliveries;
}

function markLeased(queue, deliveryTag) {
  const key = `${queue}:${deliveryTag}`;
  const data = deliveryStore.get(key);
  if (data) {
    data.leased = true;
  }
}

function getDelivery(queue, deliveryTag) {
  const key = `${queue}:${deliveryTag}`;
  return deliveryStore.get(key);
}

function removeDelivery(queue, deliveryTag) {
  const key = `${queue}:${deliveryTag}`;
  deliveryStore.delete(key);
}

async function ackDelivery(queue, deliveryTag) {
  const channel = consumerChannels.get(queue);
  if (!channel) throw new Error(`No consumer for queue: ${queue}`);
  const delivery = getDelivery(queue, deliveryTag);
  if (!delivery) throw new Error('Delivery not found');
  channel.ack(delivery.msg);
  removeDelivery(queue, deliveryTag);
}

async function nackDelivery(queue, deliveryTag, requeue = true) {
  const channel = consumerChannels.get(queue);
  if (!channel) throw new Error(`No consumer for queue: ${queue}`);
  const delivery = getDelivery(queue, deliveryTag);
  if (!delivery) throw new Error('Delivery not found');
  channel.nack(delivery.msg, false, requeue);
  removeDelivery(queue, deliveryTag);
}

async function ping() {
  try {
    await connect();
    return true;
  } catch {
    return false;
  }
}

async function close() {
  for (const channel of consumerChannels.values()) {
    await channel.close().catch(() => {});
  }
  consumerChannels.clear();
  deliveryStore.clear();
  
  if (publishChannel) {
    await publishChannel.close().catch(() => {});
    publishChannel = null;
  }
  if (connection) {
    await connection.close().catch(() => {});
    connection = null;
  }
}

module.exports = {
  connect,
  ensureQueue,
  publish,
  publishToRetry,
  publishToDlq,
  startConsumer,
  getDeliveries,
  getDelivery,
  removeDelivery,
  ackDelivery,
  nackDelivery,
  markLeased,
  ping,
  close,
  getQueueName,
  getRetryQueueName,
  getDlqName,
};
