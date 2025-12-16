const { describe, it } = require('node:test');
const assert = require('node:assert');
const { v4: uuidv4 } = require('uuid');

describe('queue service - unit logic', () => {
  describe('uuid generation', () => {
    it('should generate valid UUIDs', () => {
      const id1 = uuidv4();
      const id2 = uuidv4();
      
      assert.ok(id1);
      assert.ok(id2);
      assert.notStrictEqual(id1, id2);
      assert.match(id1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  });

  describe('config defaults', () => {
    it('should have valid default config', () => {
      const config = require('../config');
      
      assert.ok(config.queue.pullMaxDefault > 0);
      assert.ok(config.queue.visibilityTimeoutDefaultMs > 0);
      assert.ok(config.queue.receiptTtlMaxMs > 0);
      assert.ok(config.queue.maxRetryAttempts > 0);
      assert.ok(Array.isArray(config.queue.retryDelaysMs));
    });
  });
});

describe('queue service - mock integration', () => {
  describe('mock rabbitmq', () => {
    it('should track published messages', async () => {
      const mockRabbitmq = require('../mocks/rabbitmq');
      mockRabbitmq._clear();
      
      await mockRabbitmq.publish('test-queue', {
        messageId: 'msg-1',
        jobId: 'job-1',
        payload: { test: true },
      });
      
      const deliveries = mockRabbitmq.getDeliveries('test-queue', 10);
      assert.strictEqual(deliveries.length, 1);
      assert.strictEqual(deliveries[0].data.messageId, 'msg-1');
    });

    it('should remove delivery on ack', async () => {
      const mockRabbitmq = require('../mocks/rabbitmq');
      mockRabbitmq._clear();
      
      await mockRabbitmq.publish('test-queue', {
        messageId: 'msg-1',
        jobId: 'job-1',
        payload: { test: true },
      });
      
      const deliveries = mockRabbitmq.getDeliveries('test-queue', 10);
      const deliveryTag = deliveries[0].data.deliveryTag;
      
      await mockRabbitmq.ackDelivery('test-queue', deliveryTag);
      
      const afterAck = mockRabbitmq.getDeliveries('test-queue', 10);
      assert.strictEqual(afterAck.length, 0);
    });
  });

  describe('mock redis', () => {
    it('should store and retrieve receipts', async () => {
      const mockRedis = require('../mocks/redis');
      mockRedis._clear();
      
      const receiptData = { queue: 'test', deliveryTag: 1 };
      await mockRedis.set('receipt:r-1', JSON.stringify(receiptData), 'PX', 30000);
      
      const retrieved = await mockRedis.get('receipt:r-1');
      assert.deepStrictEqual(JSON.parse(retrieved), receiptData);
    });

    it('should delete receipts', async () => {
      const mockRedis = require('../mocks/redis');
      mockRedis._clear();
      
      await mockRedis.set('receipt:r-2', 'data', 'PX', 30000);
      await mockRedis.del('receipt:r-2');
      
      const retrieved = await mockRedis.get('receipt:r-2');
      assert.strictEqual(retrieved, null);
    });
  });
});
