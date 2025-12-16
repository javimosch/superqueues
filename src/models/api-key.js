const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  keyHash: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  scopes: { type: [String], default: [], enum: ['publish', 'consume', 'admin'] },
  allowedQueues: { type: [String], default: ['*'] },
  enabled: { type: Boolean, default: true },
  lastUsedAt: { type: Date, default: null },
}, {
  timestamps: true,
});

apiKeySchema.statics.findByHash = function(hash) {
  return this.findOne({ keyHash: hash, enabled: true });
};

apiKeySchema.methods.hasScope = function(scope) {
  return this.scopes.includes(scope);
};

apiKeySchema.methods.canAccessQueue = function(queue) {
  if (this.allowedQueues.includes('*')) return true;
  return this.allowedQueues.some(pattern => {
    if (pattern === queue) return true;
    if (pattern.endsWith('*')) {
      return queue.startsWith(pattern.slice(0, -1));
    }
    return false;
  });
};

module.exports = mongoose.model('ApiKey', apiKeySchema);
