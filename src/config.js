const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    prefetchDefault: parseInt(process.env.PREFETCH_DEFAULT || '10', 10),
    managementUrl: process.env.RABBITMQ_MANAGEMENT_URL || 'http://localhost:15672',
    managementUser: process.env.RABBITMQ_MANAGEMENT_USER || 'guest',
    managementPassword: process.env.RABBITMQ_MANAGEMENT_PASSWORD || 'guest',
  },
  
  mongo: {
    url: process.env.MONGO_URL || 'mongodb://localhost:27017/superqueues',
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  queue: {
    pullMaxDefault: parseInt(process.env.PULL_MAX_DEFAULT || '10', 10),
    visibilityTimeoutDefaultMs: parseInt(process.env.VISIBILITY_TIMEOUT_DEFAULT_MS || '30000', 10),
    receiptTtlMaxMs: parseInt(process.env.RECEIPT_TTL_MAX_MS || '300000', 10),
    idempotencyTtlMs: parseInt(process.env.IDEMPOTENCY_TTL_MS || '86400000', 10),
    maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '5', 10),
    retryDelaysMs: (process.env.RETRY_DELAYS_MS || '5000,15000,60000,300000,900000').split(',').map(Number),
  },
  
  audit: {
    mode: process.env.AUDIT_MODE || 'full',
  },
  
  namespace: {
    tenant: process.env.TENANT || 'default',
    env: process.env.ENV || 'dev',
  },
};

module.exports = config;
