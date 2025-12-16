const { describe, it } = require('node:test');
const assert = require('node:assert');
const { hashKey, requireQueueAccess } = require('./auth');

function createMockApiKey(overrides = {}) {
  return {
    _id: { toString: () => 'key-id-1' },
    scopes: ['publish', 'consume'],
    allowedQueues: ['*'],
    hasScope(scope) {
      return this.scopes.includes(scope);
    },
    canAccessQueue(queue) {
      if (this.allowedQueues.includes('*')) return true;
      return this.allowedQueues.some(pattern => {
        if (pattern === queue) return true;
        if (pattern.endsWith('*')) {
          return queue.startsWith(pattern.slice(0, -1));
        }
        return false;
      });
    },
    save: async () => {},
    ...overrides,
  };
}

function createMockReq(overrides = {}) {
  return {
    headers: {},
    params: {},
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

describe('auth middleware', () => {
  describe('hashKey', () => {
    it('should produce consistent hash', () => {
      const hash1 = hashKey('test-key');
      const hash2 = hashKey('test-key');
      assert.strictEqual(hash1, hash2);
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = hashKey('key-1');
      const hash2 = hashKey('key-2');
      assert.notStrictEqual(hash1, hash2);
    });

    it('should produce 64 character hex hash (sha256)', () => {
      const hash = hashKey('any-key');
      assert.strictEqual(hash.length, 64);
      assert.match(hash, /^[a-f0-9]+$/);
    });
  });

  describe('requireQueueAccess', () => {
    it('should return 400 when queue param is missing', () => {
      const middleware = requireQueueAccess();
      const req = createMockReq({ params: {} });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };
      
      middleware(req, res, next);
      
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.data.error.includes('Queue'));
      assert.strictEqual(nextCalled, false);
    });

    it('should return 403 when queue access is denied', () => {
      const apiKey = createMockApiKey({ allowedQueues: ['allowed-queue'] });
      const middleware = requireQueueAccess();
      const req = createMockReq({
        params: { queue: 'denied-queue' },
        apiKey,
      });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };
      
      middleware(req, res, next);
      
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.data.error.includes('Access denied'));
      assert.strictEqual(nextCalled, false);
    });

    it('should call next() when queue access is allowed with wildcard', () => {
      const apiKey = createMockApiKey({ allowedQueues: ['*'] });
      const middleware = requireQueueAccess();
      const req = createMockReq({
        params: { queue: 'any-queue' },
        apiKey,
      });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };
      
      middleware(req, res, next);
      
      assert.strictEqual(nextCalled, true);
    });

    it('should call next() when queue matches exact name', () => {
      const apiKey = createMockApiKey({ allowedQueues: ['my-queue'] });
      const middleware = requireQueueAccess();
      const req = createMockReq({
        params: { queue: 'my-queue' },
        apiKey,
      });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };
      
      middleware(req, res, next);
      
      assert.strictEqual(nextCalled, true);
    });

    it('should call next() when queue matches prefix pattern', () => {
      const apiKey = createMockApiKey({ allowedQueues: ['orders.*'] });
      const middleware = requireQueueAccess();
      const req = createMockReq({
        params: { queue: 'orders.created' },
        apiKey,
      });
      const res = createMockRes();
      let nextCalled = false;
      const next = () => { nextCalled = true; };
      
      middleware(req, res, next);
      
      assert.strictEqual(nextCalled, true);
    });
  });

  describe('ApiKey model methods', () => {
    it('hasScope should check scope membership', () => {
      const apiKey = createMockApiKey({ scopes: ['publish', 'consume'] });
      
      assert.strictEqual(apiKey.hasScope('publish'), true);
      assert.strictEqual(apiKey.hasScope('consume'), true);
      assert.strictEqual(apiKey.hasScope('admin'), false);
    });

    it('canAccessQueue should handle wildcard', () => {
      const apiKey = createMockApiKey({ allowedQueues: ['*'] });
      
      assert.strictEqual(apiKey.canAccessQueue('any-queue'), true);
      assert.strictEqual(apiKey.canAccessQueue('another.queue'), true);
    });

    it('canAccessQueue should handle exact match', () => {
      const apiKey = createMockApiKey({ allowedQueues: ['queue-1', 'queue-2'] });
      
      assert.strictEqual(apiKey.canAccessQueue('queue-1'), true);
      assert.strictEqual(apiKey.canAccessQueue('queue-2'), true);
      assert.strictEqual(apiKey.canAccessQueue('queue-3'), false);
    });

    it('canAccessQueue should handle prefix patterns', () => {
      const apiKey = createMockApiKey({ allowedQueues: ['orders.*', 'payments.*'] });
      
      assert.strictEqual(apiKey.canAccessQueue('orders.created'), true);
      assert.strictEqual(apiKey.canAccessQueue('orders.updated'), true);
      assert.strictEqual(apiKey.canAccessQueue('payments.received'), true);
      assert.strictEqual(apiKey.canAccessQueue('users.created'), false);
    });
  });
});
