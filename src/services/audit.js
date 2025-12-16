const { Job, JobEvent, Settings } = require('../models');
const config = require('../config');

let cachedMode = null;

async function getAuditMode() {
  if (!cachedMode) {
    cachedMode = await Settings.get('auditMode', config.audit.mode);
  }
  return cachedMode;
}

async function setAuditMode(mode) {
  if (!['full', 'jobs_only', 'off'].includes(mode)) {
    throw new Error('Invalid audit mode');
  }
  await Settings.set('auditMode', mode);
  cachedMode = mode;
  return mode;
}

async function createJob(data) {
  const mode = await getAuditMode();
  if (mode === 'off') return null;
  
  const job = await Job.create({
    jobId: data.jobId,
    messageId: data.messageId,
    queue: data.queue,
    status: 'queued',
    attempts: 0,
    correlationId: data.correlationId,
    payload: data.payload,
    headers: data.headers,
  });
  
  if (mode === 'full') {
    await JobEvent.create({
      jobId: data.jobId,
      type: 'created',
      meta: { queue: data.queue },
    });
  }
  
  return job;
}

async function updateJobStatus(jobId, status, meta = {}) {
  const mode = await getAuditMode();
  if (mode === 'off') return null;
  
  const update = { status, ...meta };
  if (meta.attempt !== undefined) {
    update.attempts = meta.attempt;
  }
  
  const job = await Job.findOneAndUpdate(
    { jobId },
    { $set: update },
    { new: true }
  );
  
  if (mode === 'full' && job) {
    await JobEvent.create({
      jobId,
      type: status === 'acked' ? 'acked' : 
            status === 'dlq' ? 'dlq' :
            status === 'delivered' ? 'delivered' : 'nacked',
      meta,
    });
  }
  
  return job;
}

async function recordRetry(jobId, attempt, reason) {
  const mode = await getAuditMode();
  if (mode === 'off') return null;
  
  const job = await Job.findOneAndUpdate(
    { jobId },
    { $set: { status: 'queued', attempts: attempt, lastError: reason } },
    { new: true }
  );
  
  if (mode === 'full' && job) {
    await JobEvent.create({
      jobId,
      type: 'retried',
      meta: { attempt, reason },
    });
  }
  
  return job;
}

async function getJob(jobId) {
  return Job.findOne({ jobId });
}

async function queryJobs(filter = {}, options = {}) {
  const query = {};
  
  if (filter.queue) query.queue = filter.queue;
  if (filter.status) query.status = filter.status;
  if (filter.from || filter.to) {
    query.createdAt = {};
    if (filter.from) query.createdAt.$gte = new Date(filter.from);
    if (filter.to) query.createdAt.$lte = new Date(filter.to);
  }
  
  const limit = Math.min(options.limit || 50, 100);
  
  return Job.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

async function getJobEvents(jobId) {
  return JobEvent.find({ jobId }).sort({ at: 1 }).lean();
}

function clearCache() {
  cachedMode = null;
}

module.exports = {
  getAuditMode,
  setAuditMode,
  createJob,
  updateJobStatus,
  recordRetry,
  getJob,
  queryJobs,
  getJobEvents,
  clearCache,
};
