const crypto = require('crypto');
const { ApiKey, Job } = require('../models');
const { audit, rabbitmq, queue: queueService } = require('../services');
const { hashKey } = require('../middleware/auth');

async function getSettings(req, res, next) {
  try {
    const auditMode = await audit.getAuditMode();
    res.json({ auditMode });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const { auditMode } = req.body;
    
    if (auditMode) {
      await audit.setAuditMode(auditMode);
    }
    
    const currentMode = await audit.getAuditMode();
    res.json({ auditMode: currentMode });
  } catch (err) {
    next(err);
  }
}

async function listApiKeys(req, res, next) {
  try {
    const keys = await ApiKey.find({}, '-keyHash').sort({ createdAt: -1 }).lean();
    res.json({ keys });
  } catch (err) {
    next(err);
  }
}

async function createApiKey(req, res, next) {
  try {
    const { name, scopes, allowedQueues } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    const rawKey = `sqk_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = hashKey(rawKey);
    
    const apiKey = await ApiKey.create({
      keyHash,
      name,
      scopes: scopes || ['publish', 'consume'],
      allowedQueues: allowedQueues || ['*'],
      enabled: true,
    });
    
    res.status(201).json({
      id: apiKey._id,
      name: apiKey.name,
      scopes: apiKey.scopes,
      allowedQueues: apiKey.allowedQueues,
      enabled: apiKey.enabled,
      createdAt: apiKey.createdAt,
      rawKey,
    });
  } catch (err) {
    next(err);
  }
}

async function updateApiKey(req, res, next) {
  try {
    const { id } = req.params;
    const { name, scopes, allowedQueues, enabled } = req.body;
    
    const update = {};
    if (name !== undefined) update.name = name;
    if (scopes !== undefined) update.scopes = scopes;
    if (allowedQueues !== undefined) update.allowedQueues = allowedQueues;
    if (enabled !== undefined) update.enabled = enabled;
    
    const apiKey = await ApiKey.findByIdAndUpdate(id, update, { new: true, select: '-keyHash' });
    
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    res.json({ key: apiKey });
  } catch (err) {
    next(err);
  }
}

async function deleteApiKey(req, res, next) {
  try {
    const { id } = req.params;
    
    const apiKey = await ApiKey.findByIdAndDelete(id);
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function listQueues(req, res, next) {
  try {
    const queueStats = await Job.aggregate([
      {
        $group: {
          _id: '$queue',
          total: { $sum: 1 },
          queued: { $sum: { $cond: [{ $eq: ['$status', 'queued'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          acked: { $sum: { $cond: [{ $eq: ['$status', 'acked'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          dlq: { $sum: { $cond: [{ $eq: ['$status', 'dlq'] }, 1, 0] } },
          lastActivity: { $max: '$updatedAt' },
        },
      },
      { $sort: { lastActivity: -1 } },
    ]);

    const queues = queueStats.map(q => ({
      name: q._id,
      stats: {
        total: q.total,
        queued: q.queued,
        delivered: q.delivered,
        acked: q.acked,
        failed: q.failed,
        dlq: q.dlq,
      },
      lastActivity: q.lastActivity,
    }));

    res.json({ queues });
  } catch (err) {
    next(err);
  }
}

async function getQueueMessages(req, res, next) {
  try {
    const { queue } = req.params;
    const { status, limit = 50 } = req.query;

    const filter = { queue };
    if (status) filter.status = status;

    const jobs = await Job.find(filter)
      .sort({ updatedAt: -1 })
      .limit(Math.min(parseInt(limit, 10), 100))
      .lean();

    res.json({ jobs });
  } catch (err) {
    next(err);
  }
}

async function publishTestMessage(req, res, next) {
  try {
    const { queue } = req.params;
    const { payload, headers, correlationId } = req.body;

    if (!payload) {
      return res.status(400).json({ error: 'payload is required' });
    }

    const result = await queueService.publish(queue, {
      payload,
      headers: { ...headers, 'x-source': 'admin-ui' },
      correlationId,
    }, 'admin');

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function requeueFromDlq(req, res, next) {
  try {
    const { queue } = req.params;
    const { jobIds } = req.body;

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return res.status(400).json({ error: 'jobIds array is required' });
    }

    const results = [];
    for (const jobId of jobIds) {
      const job = await Job.findOne({ jobId, queue, status: 'dlq' });
      if (!job) {
        results.push({ jobId, success: false, error: 'Not found or not in DLQ' });
        continue;
      }

      await queueService.publish(queue, {
        payload: job.payload,
        headers: { ...job.headers, 'x-requeued-from-dlq': 'true', 'x-original-job-id': jobId },
        correlationId: job.correlationId,
      }, 'admin');

      await Job.updateOne({ jobId }, { $set: { status: 'queued', lastError: null } });

      results.push({ jobId, success: true });
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
}

async function purgeQueue(req, res, next) {
  try {
    const { queue } = req.params;
    const { status } = req.body;

    if (!status || !['dlq', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'status must be dlq or failed' });
    }

    const result = await Job.deleteMany({ queue, status });

    res.json({ deleted: result.deletedCount });
  } catch (err) {
    next(err);
  }
}

async function startQueueConsumer(req, res, next) {
  try {
    const { queue } = req.params;
    await queueService.startConsumer(queue);
    res.json({ ok: true, message: `Consumer started for ${queue}` });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSettings,
  updateSettings,
  listApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  listQueues,
  getQueueMessages,
  publishTestMessage,
  requeueFromDlq,
  purgeQueue,
  startQueueConsumer,
};
