const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  jobId: { type: String, required: true, unique: true, index: true },
  messageId: { type: String, required: true, index: true },
  queue: { type: String, required: true, index: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['queued', 'delivered', 'acked', 'failed', 'dlq'],
    default: 'queued',
    index: true,
  },
  attempts: { type: Number, default: 0 },
  correlationId: { type: String, default: null, index: true },
  lastError: { type: String, default: null },
  payload: { type: mongoose.Schema.Types.Mixed, default: null },
  headers: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

jobSchema.index({ queue: 1, status: 1 });
jobSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Job', jobSchema);
