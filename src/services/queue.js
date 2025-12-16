const { v4: uuidv4 } = require('uuid');
const rabbitmq = require('./rabbitmq');
const redis = require('./redis');
const audit = require('./audit');
const config = require('../config');

async function publish(queue, data, apiKeyId) {
  const messageId = uuidv4();
  const jobId = uuidv4();
  
  if (data.idempotencyKey) {
    const existing = await redis.checkIdempotency(apiKeyId, queue, data.idempotencyKey);
    if (existing) {
      return existing;
    }
  }
  
  const message = {
    messageId,
    jobId,
    payload: data.payload,
    headers: data.headers || {},
    correlationId: data.correlationId,
  };
  
  await audit.createJob({
    jobId,
    messageId,
    queue,
    correlationId: data.correlationId,
    payload: data.payload,
    headers: data.headers,
  });
  
  await rabbitmq.publish(queue, message);
  
  const result = {
    messageId,
    jobId,
    enqueuedAt: new Date().toISOString(),
  };
  
  if (data.idempotencyKey) {
    await redis.setIdempotency(apiKeyId, queue, data.idempotencyKey, result);
  }
  
  return result;
}

async function pull(queue, options = {}) {
  const maxMessages = Math.min(
    options.maxMessages || config.queue.pullMaxDefault,
    config.queue.pullMaxDefault
  );
  const visibilityTimeoutMs = Math.min(
    options.visibilityTimeoutMs || config.queue.visibilityTimeoutDefaultMs,
    config.queue.receiptTtlMaxMs
  );
  
  const deliveries = rabbitmq.getDeliveries(queue, maxMessages);
  const messages = [];
  
  for (const { key, data } of deliveries) {
    const receiptId = uuidv4();
    
    await redis.setReceipt(receiptId, {
      queue,
      deliveryTag: data.deliveryTag,
      jobId: data.jobId,
      messageId: data.messageId,
    }, visibilityTimeoutMs);
    
    await audit.updateJobStatus(data.jobId, 'delivered', { attempt: data.attempt });
    
    messages.push({
      receiptId,
      messageId: data.messageId,
      jobId: data.jobId,
      payload: data.payload,
      headers: data.headers,
      attempt: data.attempt,
      enqueuedAt: data.enqueuedAt,
    });

    rabbitmq.markLeased(queue, data.deliveryTag);
  }
  
  return { messages };
}

async function ack(queue, receiptId) {
  const receipt = await redis.getReceipt(receiptId);
  if (!receipt) {
    throw new Error('Receipt not found or expired');
  }
  
  if (receipt.queue !== queue) {
    throw new Error('Receipt does not match queue');
  }
  
  await rabbitmq.ackDelivery(queue, receipt.deliveryTag);
  await redis.deleteReceipt(receiptId);
  await audit.updateJobStatus(receipt.jobId, 'acked');
  
  return { ok: true };
}

async function nack(queue, receiptId, options = {}) {
  const receipt = await redis.getReceipt(receiptId);
  if (!receipt) {
    throw new Error('Receipt not found or expired');
  }
  
  if (receipt.queue !== queue) {
    throw new Error('Receipt does not match queue');
  }
  
  const action = options.action || 'requeue';
  const reason = options.reason || null;
  
  const delivery = rabbitmq.getDelivery(queue, receipt.deliveryTag);
  
  if (action === 'requeue') {
    await rabbitmq.nackDelivery(queue, receipt.deliveryTag, true);
    await audit.updateJobStatus(receipt.jobId, 'queued', { lastError: reason });
  } else if (action === 'retry') {
    const currentAttempt = delivery?.attempt || 1;
    const nextAttempt = currentAttempt + 1;
    
    if (nextAttempt > config.queue.maxRetryAttempts) {
      if (delivery) {
        await rabbitmq.publishToDlq(queue, delivery, reason || 'max retries exceeded');
      }
      await rabbitmq.ackDelivery(queue, receipt.deliveryTag);
      await audit.updateJobStatus(receipt.jobId, 'dlq', { lastError: reason || 'max retries exceeded' });
    } else {
      if (delivery) {
        await rabbitmq.publishToRetry(queue, delivery, nextAttempt);
      }
      await rabbitmq.ackDelivery(queue, receipt.deliveryTag);
      await audit.recordRetry(receipt.jobId, nextAttempt, reason);
    }
  } else if (action === 'dlq') {
    if (delivery) {
      await rabbitmq.publishToDlq(queue, delivery, reason || 'manual');
    }
    await rabbitmq.ackDelivery(queue, receipt.deliveryTag);
    await audit.updateJobStatus(receipt.jobId, 'dlq', { lastError: reason });
  }
  
  await redis.deleteReceipt(receiptId);
  
  return { ok: true };
}

async function startConsumer(queue) {
  return rabbitmq.startConsumer(queue);
}

module.exports = {
  publish,
  pull,
  ack,
  nack,
  startConsumer,
};
