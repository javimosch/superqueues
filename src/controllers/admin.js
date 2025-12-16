const crypto = require('crypto');
const { ApiKey, Job } = require('../models');
const { audit, rabbitmq, queue: queueService, broker } = require('../services');
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

async function getBrokerOverview(req, res, next) {
  try {
    const overview = await broker.getOverview();
    res.json(overview);
  } catch (err) {
    next(err);
  }
}

async function getBrokerQueues(req, res, next) {
  try {
    const { name, vhost } = req.query;
    const queues = await broker.getQueues({ name, vhost });
    res.json({ queues });
  } catch (err) {
    next(err);
  }
}

async function getBrokerQueue(req, res, next) {
  try {
    const { queue } = req.params;
    const { vhost = '/' } = req.query;
    const queueInfo = await broker.getQueue(vhost, queue);
    res.json(queueInfo);
  } catch (err) {
    next(err);
  }
}

async function getBrokerConnections(req, res, next) {
  try {
    const connections = await broker.getConnections();
    res.json({ connections });
  } catch (err) {
    next(err);
  }
}

async function getBrokerNodes(req, res, next) {
  try {
    const nodes = await broker.getNodes();
    res.json({ nodes });
  } catch (err) {
    next(err);
  }
}

async function getBrokerClusterInfo(req, res, next) {
  try {
    const clusterInfo = await broker.getClusterInfo();
    res.json(clusterInfo);
  } catch (err) {
    next(err);
  }
}

async function getMergedQueues(req, res, next) {
  try {
    const [brokerQueues, jobStats] = await Promise.all([
      broker.getQueues().catch(() => []),
      Job.aggregate([
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
      ]),
    ]);

    const jobStatsMap = new Map(jobStats.map(s => [s._id, s]));
    const brokerQueueMap = new Map(brokerQueues.map(q => [q.name, q]));

    const allQueueNames = new Set([
      ...brokerQueues.map(q => q.name),
      ...jobStats.map(s => s._id),
    ]);

    const queues = Array.from(allQueueNames).map(name => {
      const brokerQ = brokerQueueMap.get(name) || null;
      const jobS = jobStatsMap.get(name) || null;

      return {
        name,
        broker: brokerQ ? {
          messages: brokerQ.messages,
          messagesReady: brokerQ.messagesReady,
          messagesUnacked: brokerQ.messagesUnacked,
          consumers: brokerQ.consumers,
          state: brokerQ.state,
          messageStats: brokerQ.messageStats,
        } : null,
        jobs: jobS ? {
          total: jobS.total,
          queued: jobS.queued,
          delivered: jobS.delivered,
          acked: jobS.acked,
          failed: jobS.failed,
          dlq: jobS.dlq,
          lastActivity: jobS.lastActivity,
        } : null,
      };
    });

    queues.sort((a, b) => {
      const aTime = a.jobs?.lastActivity || new Date(0);
      const bTime = b.jobs?.lastActivity || new Date(0);
      return new Date(bTime) - new Date(aTime);
    });

    res.json({ queues });
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
  getBrokerOverview,
  getBrokerQueues,
  getBrokerQueue,
  getBrokerConnections,
  getBrokerNodes,
  getBrokerClusterInfo,
  getMergedQueues,
};
