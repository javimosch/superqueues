const mongoose = require('mongoose');
const { rabbitmq, redis } = require('../services');

async function healthz(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}

async function readyz(req, res) {
  const checks = {
    mongo: false,
    redis: false,
    rabbitmq: false,
  };
  
  try {
    checks.mongo = mongoose.connection.readyState === 1;
  } catch {
    checks.mongo = false;
  }
  
  try {
    checks.redis = await redis.ping();
  } catch {
    checks.redis = false;
  }
  
  try {
    checks.rabbitmq = await rabbitmq.ping();
  } catch {
    checks.rabbitmq = false;
  }
  
  const allHealthy = Object.values(checks).every(Boolean);
  const status = allHealthy ? 200 : 503;
  
  res.status(status).json({
    status: allHealthy ? 'ready' : 'not ready',
    checks,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  healthz,
  readyz,
};
