const mongoose = require('mongoose');

const apiKeyUsageEventSchema = new mongoose.Schema({
  apiKeyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  apiKeyName: { type: String, required: true },
  scope: { type: String, required: true, enum: ['publish', 'consume', 'admin'] },
  action: { type: String, required: true, index: true },
  queue: { type: String, default: null, sparse: true, index: true },
  http: {
    method: { type: String, required: true },
    path: { type: String, required: true },
    statusCode: { type: Number, required: true },
  },
  latencyMs: { type: Number, required: true },
  ip: { type: String, default: null },
  userAgent: { type: String, default: null },
  error: {
    message: { type: String },
    code: { type: String },
  },
}, {
  timestamps: { createdAt: 'at', updatedAt: false },
});

apiKeyUsageEventSchema.index({ apiKeyId: 1, at: -1 });
apiKeyUsageEventSchema.index({ at: -1 });
apiKeyUsageEventSchema.index({ queue: 1, at: -1 }, { sparse: true });
apiKeyUsageEventSchema.index({ action: 1, at: -1 });

apiKeyUsageEventSchema.index({ at: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

module.exports = mongoose.model('ApiKeyUsageEvent', apiKeyUsageEventSchema);
