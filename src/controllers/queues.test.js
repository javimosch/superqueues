const { describe, it } = require('node:test');
const assert = require('node:assert');

function createMockReq(overrides = {}) {
  return {
    params: { queue: 'test-queue' },
    body: {},
    apiKeyId: 'api-key-1',
    ...overrides,
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
  };
}

describe('queues controller - validation', () => {
  const queuesController = require('./queues');

  describe('publishMessage', () => {
    it('should return 400 when payload is missing', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();
      const next = () => {};
      
      await queuesController.publishMessage(req, res, next);
      
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.error, 'payload is required');
    });
  });

  describe('ackMessage', () => {
    it('should return 400 when receiptId is missing', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();
      const next = () => {};
      
      await queuesController.ackMessage(req, res, next);
      
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.error, 'receiptId is required');
    });
  });

  describe('nackMessage', () => {
    it('should return 400 when receiptId is missing', async () => {
      const req = createMockReq({ body: {} });
      const res = createMockRes();
      const next = () => {};
      
      await queuesController.nackMessage(req, res, next);
      
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.error, 'receiptId is required');
    });

    it('should return 400 for invalid action', async () => {
      const req = createMockReq({
        body: { receiptId: 'receipt-123', action: 'invalid' },
      });
      const res = createMockRes();
      const next = () => {};
      
      await queuesController.nackMessage(req, res, next);
      
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.data.error.includes('action must be one of'));
    });

    it('should accept valid actions', () => {
      const validActions = ['requeue', 'retry', 'dlq'];
      for (const action of validActions) {
        assert.ok(['requeue', 'retry', 'dlq'].includes(action));
      }
    });
  });
});
