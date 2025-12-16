const express = require('express');
const { requireAuth, requireQueueAccess, trackApiKeyUsage } = require('../middleware');
const { health, queues, jobs, admin } = require('../controllers');

const router = express.Router();

router.get('/healthz', health.healthz);
router.get('/readyz', health.readyz);

router.post('/queues/:queue/messages',
  requireAuth('publish'),
  requireQueueAccess('queue'),
  trackApiKeyUsage('queues.publish', 'publish', 'queue'),
  queues.publishMessage
);

router.post('/queues/:queue/pull',
  requireAuth('consume'),
  requireQueueAccess('queue'),
  trackApiKeyUsage('queues.pull', 'consume', 'queue'),
  queues.pullMessages
);

router.post('/queues/:queue/ack',
  requireAuth('consume'),
  requireQueueAccess('queue'),
  trackApiKeyUsage('queues.ack', 'consume', 'queue'),
  queues.ackMessage
);

router.post('/queues/:queue/nack',
  requireAuth('consume'),
  requireQueueAccess('queue'),
  trackApiKeyUsage('queues.nack', 'consume', 'queue'),
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
  trackApiKeyUsage('admin.getSettings', 'admin'),
  admin.getSettings
);

router.post('/admin/settings',
  requireAuth('admin'),
  trackApiKeyUsage('admin.updateSettings', 'admin'),
  admin.updateSettings
);

router.get('/admin/audit/storage',
  requireAuth('admin'),
  trackApiKeyUsage('admin.getAuditStorage', 'admin'),
  admin.getAuditStorage
);

router.post('/admin/audit/clear',
  requireAuth('admin'),
  trackApiKeyUsage('admin.clearAuditLogs', 'admin'),
  admin.clearAuditLogs
);

router.get('/admin/system/totals',
  requireAuth('admin'),
  trackApiKeyUsage('admin.getSystemTotals', 'admin'),
  admin.getSystemTotals
);

router.get('/admin/api-keys',
  requireAuth('admin'),
  trackApiKeyUsage('admin.listApiKeys', 'admin'),
  admin.listApiKeys
);

router.post('/admin/api-keys',
  requireAuth('admin'),
  trackApiKeyUsage('admin.createApiKey', 'admin'),
  admin.createApiKey
);

router.patch('/admin/api-keys/:id',
  requireAuth('admin'),
  trackApiKeyUsage('admin.updateApiKey', 'admin'),
  admin.updateApiKey
);

router.delete('/admin/api-keys/:id',
  requireAuth('admin'),
  trackApiKeyUsage('admin.deleteApiKey', 'admin'),
  admin.deleteApiKey
);

router.get('/admin/api-keys/:id/usage',
  requireAuth('admin'),
  trackApiKeyUsage('admin.getApiKeyUsage', 'admin'),
  admin.getApiKeyUsage
);

router.get('/admin/api-keys/:id/usage/summary',
  requireAuth('admin'),
  trackApiKeyUsage('admin.getApiKeyUsageSummary', 'admin'),
  admin.getApiKeyUsageSummary
);

router.get('/admin/queues',
  requireAuth('admin'),
  trackApiKeyUsage('admin.listQueues', 'admin'),
  admin.listQueues
);

router.get('/admin/queues/:queue/messages',
  requireAuth('admin'),
  trackApiKeyUsage('admin.getQueueMessages', 'admin', 'queue'),
  admin.getQueueMessages
);

router.post('/admin/queues/:queue/publish',
  requireAuth('admin'),
  trackApiKeyUsage('admin.publishTestMessage', 'admin', 'queue'),
  admin.publishTestMessage
);

router.post('/admin/queues/:queue/requeue',
  requireAuth('admin'),
  trackApiKeyUsage('admin.requeueFromDlq', 'admin', 'queue'),
  admin.requeueFromDlq
);

router.post('/admin/queues/:queue/purge',
  requireAuth('admin'),
  trackApiKeyUsage('admin.purgeQueue', 'admin', 'queue'),
  admin.purgeQueue
);

router.post('/admin/queues/:queue/consumer',
  requireAuth('admin'),
  trackApiKeyUsage('admin.startQueueConsumer', 'admin', 'queue'),
  admin.startQueueConsumer
);

router.get('/admin/broker/overview',
  requireAuth('admin'),
  trackApiKeyUsage('admin.getBrokerOverview', 'admin'),
  admin.getBrokerOverview
);

router.get('/admin/broker/queues',
  requireAuth('admin'),
  trackApiKeyUsage('admin.getBrokerQueues', 'admin'),
  admin.getBrokerQueues
);

router.get('/admin/broker/queues/:queue',
  requireAuth('admin'),
  trackApiKeyUsage('admin.getBrokerQueue', 'admin', 'queue'),
  admin.getBrokerQueue
);

router.get('/admin/broker/connections',
  requireAuth('admin'),
  trackApiKeyUsage('admin.getBrokerConnections', 'admin'),
  admin.getBrokerConnections
);

router.get('/admin/broker/nodes',
  requireAuth('admin'),
  trackApiKeyUsage('admin.getBrokerNodes', 'admin'),
  admin.getBrokerNodes
);

router.get('/admin/broker/cluster',
  requireAuth('admin'),
  trackApiKeyUsage('admin.getBrokerClusterInfo', 'admin'),
  admin.getBrokerClusterInfo
);

router.get('/admin/queues/merged',
  requireAuth('admin'),
  trackApiKeyUsage('admin.getMergedQueues', 'admin'),
  admin.getMergedQueues
);

module.exports = router;
