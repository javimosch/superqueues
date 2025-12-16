const crypto = require('crypto');
const { ApiKey } = require('../models');

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function parseAuthHeader(header) {
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'ApiKey') return null;
  return parts[1];
}

function requireAuth(requiredScope = null) {
  return async (req, res, next) => {
    try {
      const rawKey = parseAuthHeader(req.headers.authorization);
      if (!rawKey) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
      }
      
      const keyHash = hashKey(rawKey);
      const apiKey = await ApiKey.findByHash(keyHash);
      
      if (!apiKey) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      
      if (requiredScope && !apiKey.hasScope(requiredScope)) {
        return res.status(403).json({ error: `Missing required scope: ${requiredScope}` });
      }
      
      req.apiKey = apiKey;
      req.apiKeyId = apiKey._id.toString();
      
      apiKey.lastUsedAt = new Date();
      await apiKey.save();
      
      next();
    } catch (err) {
      next(err);
    }
  };
}

function requireQueueAccess(queueParam = 'queue') {
  return (req, res, next) => {
    const queue = req.params[queueParam];
    if (!queue) {
      return res.status(400).json({ error: 'Queue parameter required' });
    }
    
    if (!req.apiKey.canAccessQueue(queue)) {
      return res.status(403).json({ error: `Access denied to queue: ${queue}` });
    }
    
    next();
  };
}

module.exports = {
  hashKey,
  requireAuth,
  requireQueueAccess,
};
