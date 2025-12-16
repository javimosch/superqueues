const { describe, it } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('events');

function createMockReq(overrides = {}) {
  return {
    method: 'POST',
    originalUrl: '/v1/queues/test-queue/messages',
    params: { queue: 'test-queue' },
    ip: '127.0.0.1',
    get: (header) => {
      if (header.toLowerCase() === 'user-agent') return 'test-agent';
      return null;
    },
    apiKey: {
      _id: 'key123',
      name: 'test-key',
    },
    apiKeyId: 'key123',
    ...overrides,
  };
}

function createMockRes() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.locals = {};
  return res;
}

describe('usage middleware', () => {
  describe('trackApiKeyUsage', () => {
    it('should call next immediately', () => {
      const { trackApiKeyUsage } = require('./usage');
      const middleware = trackApiKeyUsage('queues.publish', 'publish', 'queue');
      const req = createMockReq();
      const res = createMockRes();
      let nextCalled = false;

      middleware(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, true);
    });

    it('should set up finish listener on response', () => {
      const { trackApiKeyUsage } = require('./usage');
      const middleware = trackApiKeyUsage('queues.publish', 'publish', 'queue');
      const req = createMockReq();
      const res = createMockRes();

      const listenerCountBefore = res.listenerCount('finish');
      middleware(req, res, () => {});
      const listenerCountAfter = res.listenerCount('finish');

      assert.strictEqual(listenerCountAfter, listenerCountBefore + 1);
    });

    it('should not throw when apiKey is missing', () => {
      const { trackApiKeyUsage } = require('./usage');
      const middleware = trackApiKeyUsage('queues.publish', 'publish', 'queue');
      const req = createMockReq({ apiKey: null, apiKeyId: null });
      const res = createMockRes();

      middleware(req, res, () => {});

      assert.doesNotThrow(() => {
        res.emit('finish');
      });
    });

    it('should handle null queueParam gracefully', () => {
      const { trackApiKeyUsage } = require('./usage');
      const middleware = trackApiKeyUsage('admin.listQueues', 'admin');
      const req = createMockReq({ params: {} });
      const res = createMockRes();
      let nextCalled = false;

      middleware(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, true);
    });

    it('should not throw on finish with error status', () => {
      const { trackApiKeyUsage } = require('./usage');
      const middleware = trackApiKeyUsage('queues.publish', 'publish', 'queue');
      const req = createMockReq();
      const res = createMockRes();
      res.statusCode = 400;
      res.locals.errorMessage = 'Bad request';
      res.locals.errorCode = 'VALIDATION_ERROR';

      middleware(req, res, () => {});

      assert.doesNotThrow(() => {
        res.emit('finish');
      });
    });
  });
});
