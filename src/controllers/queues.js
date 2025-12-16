const { queue: queueService } = require('../services');

async function publishMessage(req, res, next) {
  try {
    const { queue } = req.params;
    const { payload, headers, idempotencyKey, correlationId } = req.body;
    
    if (!payload) {
      return res.status(400).json({ error: 'payload is required' });
    }
    
    const result = await queueService.publish(queue, {
      payload,
      headers,
      idempotencyKey,
      correlationId,
    }, req.apiKeyId);
    
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function pullMessages(req, res, next) {
  try {
    const { queue } = req.params;
    const { maxMessages, visibilityTimeoutMs } = req.body;
    
    const result = await queueService.pull(queue, {
      maxMessages,
      visibilityTimeoutMs,
    });
    
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function ackMessage(req, res, next) {
  try {
    const { queue } = req.params;
    const { receiptId } = req.body;
    
    if (!receiptId) {
      return res.status(400).json({ error: 'receiptId is required' });
    }
    
    const result = await queueService.ack(queue, receiptId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function nackMessage(req, res, next) {
  try {
    const { queue } = req.params;
    const { receiptId, action, reason } = req.body;
    
    if (!receiptId) {
      return res.status(400).json({ error: 'receiptId is required' });
    }
    
    if (action && !['requeue', 'retry', 'dlq'].includes(action)) {
      return res.status(400).json({ error: 'action must be one of: requeue, retry, dlq' });
    }
    
    const result = await queueService.nack(queue, receiptId, { action, reason });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  publishMessage,
  pullMessages,
  ackMessage,
  nackMessage,
};
