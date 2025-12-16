const mongoose = require('mongoose');
const createApp = require('./app');
const config = require('./config');
const { rabbitmq, redis } = require('./services');

async function start() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(config.mongo.url);
  console.log('MongoDB connected');
  
  console.log('Connecting to RabbitMQ...');
  await rabbitmq.connect();
  console.log('RabbitMQ connected');
  
  console.log('Testing Redis connection...');
  await redis.ping();
  console.log('Redis connected');
  
  const app = createApp();
  
  app.listen(config.port, () => {
    console.log(`Queue Gateway listening on http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
