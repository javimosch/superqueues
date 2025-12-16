const express = require('express');
const { requireAuth, requireQueueAccess } = require('../middleware');
const { health, queues, jobs, admin } = require('../controllers');

const router = express.Router();

router.get('/healthz', health.healthz);
router.get('/readyz', health.readyz);

router.post('/queues/:queue/messages',
  requireAuth('publish'),
  requireQueueAccess('queue'),
  queues.publishMessage
);

router.post('/queues/:queue/pull',
  requireAuth('consume'),
  requireQueueAccess('queue'),
  queues.pullMessages
);

router.post('/queues/:queue/ack',
  requireAuth('consume'),
  requireQueueAccess('queue'),
  queues.ackMessage
);

router.post('/queues/:queue/nack',
  requireAuth('consume'),
  requireQueueAccess('queue'),
  queues.nackMessage
);

router.get('/jobs/:jobId',
  requireAuth('consume'),
  jobs.getJob
);

router.get('/jobs',
  requireAuth('consume'),
  jobs.queryJobs
);

router.get('/admin/settings',
  requireAuth('admin'),
  admin.getSettings
);

router.post('/admin/settings',
  requireAuth('admin'),
  admin.updateSettings
);

router.get('/admin/api-keys',
  requireAuth('admin'),
  admin.listApiKeys
);

router.post('/admin/api-keys',
  requireAuth('admin'),
  admin.createApiKey
);

router.patch('/admin/api-keys/:id',
  requireAuth('admin'),
  admin.updateApiKey
);

router.delete('/admin/api-keys/:id',
  requireAuth('admin'),
  admin.deleteApiKey
);

router.get('/admin/queues',
  requireAuth('admin'),
  admin.listQueues
);

router.get('/admin/queues/:queue/messages',
  requireAuth('admin'),
  admin.getQueueMessages
);

router.post('/admin/queues/:queue/publish',
  requireAuth('admin'),
  admin.publishTestMessage
);

router.post('/admin/queues/:queue/requeue',
  requireAuth('admin'),
  admin.requeueFromDlq
);

router.post('/admin/queues/:queue/purge',
  requireAuth('admin'),
  admin.purgeQueue
);

router.post('/admin/queues/:queue/consumer',
  requireAuth('admin'),
  admin.startQueueConsumer
);

router.get('/admin/broker/overview',
  requireAuth('admin'),
  admin.getBrokerOverview
);

router.get('/admin/broker/queues',
  requireAuth('admin'),
  admin.getBrokerQueues
);

router.get('/admin/broker/queues/:queue',
  requireAuth('admin'),
  admin.getBrokerQueue
);

router.get('/admin/broker/connections',
  requireAuth('admin'),
  admin.getBrokerConnections
);

router.get('/admin/broker/nodes',
  requireAuth('admin'),
  admin.getBrokerNodes
);

router.get('/admin/queues/merged',
  requireAuth('admin'),
  admin.getMergedQueues
);

module.exports = router;
