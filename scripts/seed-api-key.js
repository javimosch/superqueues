const mongoose = require('mongoose');
const crypto = require('crypto');

const config = {
  mongo: { url: process.env.MONGO_URL || 'mongodb://localhost:27017/superqueues' },
};

const apiKeySchema = new mongoose.Schema({
  keyHash: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  scopes: { type: [String], default: [] },
  allowedQueues: { type: [String], default: ['*'] },
  enabled: { type: Boolean, default: true },
  lastUsedAt: { type: Date, default: null },
}, { timestamps: true });

const ApiKey = mongoose.model('ApiKey', apiKeySchema);

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

async function seed() {
  await mongoose.connect(config.mongo.url);
  console.log('Connected to MongoDB');

  const keys = [
    {
      name: 'admin-key',
      rawKey: 'sqk_admin_' + crypto.randomBytes(16).toString('hex'),
      scopes: ['publish', 'consume', 'admin'],
      allowedQueues: ['*'],
    },
    {
      name: 'publisher-key',
      rawKey: 'sqk_pub_' + crypto.randomBytes(16).toString('hex'),
      scopes: ['publish'],
      allowedQueues: ['*'],
    },
    {
      name: 'consumer-key',
      rawKey: 'sqk_con_' + crypto.randomBytes(16).toString('hex'),
      scopes: ['consume'],
      allowedQueues: ['*'],
    },
    {
      name: 'orders-service',
      rawKey: 'sqk_orders_' + crypto.randomBytes(16).toString('hex'),
      scopes: ['publish', 'consume'],
      allowedQueues: ['orders.*'],
    },
  ];

  console.log('\n=== API Keys Created ===\n');

  for (const key of keys) {
    const existing = await ApiKey.findOne({ name: key.name });
    if (existing) {
      console.log(`[SKIP] ${key.name} already exists`);
      continue;
    }

    await ApiKey.create({
      keyHash: hashKey(key.rawKey),
      name: key.name,
      scopes: key.scopes,
      allowedQueues: key.allowedQueues,
      enabled: true,
    });

    console.log(`[CREATED] ${key.name}`);
    console.log(`  Scopes: ${key.scopes.join(', ')}`);
    console.log(`  Queues: ${key.allowedQueues.join(', ')}`);
    console.log(`  Raw Key: ${key.rawKey}`);
    console.log('');
  }

  console.log('=== Save these keys! They cannot be retrieved later ===\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
