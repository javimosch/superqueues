const queues = new Map();
const deliveryStore = new Map();
let deliveryCounter = 0;

const mockRabbitmq = {
  async connect() {
    return true;
  },
  
  async ensureQueue(queue) {
    if (!queues.has(queue)) {
      queues.set(queue, []);
    }
    return `default.dev.${queue}`;
  },
  
  async publish(queue, message) {
    await this.ensureQueue(queue);
    const messages = queues.get(queue);
    
    deliveryCounter++;
    const deliveryTag = deliveryCounter;
    
    const deliveryData = {
      deliveryTag,
      queue,
      messageId: message.messageId,
      jobId: message.jobId,
      correlationId: message.correlationId,
      payload: message.payload,
      headers: message.headers || {},
      attempt: 1,
      enqueuedAt: new Date().toISOString(),
    };
    
    messages.push(deliveryData);
    const key = `${queue}:${deliveryTag}`;
    deliveryStore.set(key, deliveryData);
    
    return { messageId: message.messageId, jobId: message.jobId };
  },
  
  async publishToRetry(queue, deliveryData, attempt) {
    const retryQueue = `${queue}.retry.${attempt}`;
    await this.ensureQueue(retryQueue);
    
    deliveryCounter++;
    const newDeliveryData = {
      ...deliveryData,
      deliveryTag: deliveryCounter,
      attempt,
    };
    
    queues.get(retryQueue).push(newDeliveryData);
    return true;
  },
  
  async publishToDlq(queue, deliveryData, reason) {
    const dlqQueue = `${queue}.dlq`;
    await this.ensureQueue(dlqQueue);
    
    deliveryCounter++;
    const newDeliveryData = {
      ...deliveryData,
      deliveryTag: deliveryCounter,
      dlqReason: reason,
    };
    
    queues.get(dlqQueue).push(newDeliveryData);
    return true;
  },
  
  async startConsumer(queue) {
    await this.ensureQueue(queue);
    return { consumerTag: `consumer-${queue}` };
  },
  
  getDeliveries(queue, max) {
    const messages = queues.get(queue) || [];
    const result = [];
    
    for (let i = 0; i < Math.min(messages.length, max); i++) {
      const data = messages[i];
      result.push({ key: `${queue}:${data.deliveryTag}`, data });
    }
    
    return result;
  },
  
  getDelivery(queue, deliveryTag) {
    const key = `${queue}:${deliveryTag}`;
    return deliveryStore.get(key);
  },
  
  removeDelivery(queue, deliveryTag) {
    const key = `${queue}:${deliveryTag}`;
    const delivery = deliveryStore.get(key);
    
    if (delivery) {
      const messages = queues.get(queue) || [];
      const idx = messages.findIndex(m => m.deliveryTag === deliveryTag);
      if (idx !== -1) {
        messages.splice(idx, 1);
      }
    }
    
    deliveryStore.delete(key);
  },
  
  async ackDelivery(queue, deliveryTag) {
    this.removeDelivery(queue, deliveryTag);
  },
  
  async nackDelivery(queue, deliveryTag, requeue = true) {
    if (requeue) {
      const delivery = this.getDelivery(queue, deliveryTag);
      if (delivery) {
        const messages = queues.get(queue) || [];
        messages.push(delivery);
      }
    }
    this.removeDelivery(queue, deliveryTag);
  },
  
  async ping() {
    return true;
  },
  
  async close() {
    queues.clear();
    deliveryStore.clear();
    deliveryCounter = 0;
  },
  
  getQueueName(queue) {
    return `default.dev.${queue}`;
  },
  
  getRetryQueueName(queue, attempt) {
    return `default.dev.${queue}.retry.${attempt}`;
  },
  
  getDlqName(queue) {
    return `default.dev.${queue}.dlq`;
  },
  
  _clear() {
    queues.clear();
    deliveryStore.clear();
    deliveryCounter = 0;
  },
  
  _getQueues() {
    return queues;
  },
};

module.exports = mockRabbitmq;
