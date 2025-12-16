const { ApiKeyUsageEvent } = require('../models');

function trackApiKeyUsage(action, scope, queueParam = null) {
  return (req, res, next) => {
    const start = Date.now();

    res.on('finish', async () => {
      try {
        if (!req.apiKey || !req.apiKeyId) {
          return;
        }

        const latencyMs = Date.now() - start;
        const queue = queueParam ? req.params[queueParam] : null;

        const eventData = {
          apiKeyId: req.apiKeyId,
          apiKeyName: req.apiKey.name,
          scope,
          action,
          queue,
          http: {
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
          },
          latencyMs,
          ip: req.ip || req.connection?.remoteAddress || null,
          userAgent: req.get('user-agent') || null,
        };

        if (res.statusCode >= 400 && res.locals.errorMessage) {
          eventData.error = {
            message: res.locals.errorMessage,
            code: res.locals.errorCode || null,
          };
        }

        await ApiKeyUsageEvent.create(eventData);
      } catch (err) {
        console.error('Failed to record API key usage event:', err.message);
      }
    });

    next();
  };
}

module.exports = {
  trackApiKeyUsage,
};
