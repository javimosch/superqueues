const mongoose = require('mongoose');

const jobEventSchema = new mongoose.Schema({
  jobId: { type: String, required: true, index: true },
  type: { 
    type: String, 
    required: true, 
    enum: ['created', 'delivered', 'acked', 'nacked', 'retried', 'dlq', 'requeued'],
  },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: { createdAt: 'at', updatedAt: false },
});

jobEventSchema.index({ jobId: 1, at: 1 });

module.exports = mongoose.model('JobEvent', jobEventSchema);
