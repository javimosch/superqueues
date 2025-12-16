const store = new Map();
const ttls = new Map();

const mockRedis = {
  async set(key, value, mode, ttl) {
    store.set(key, value);
    if (mode === 'PX' && ttl) {
      ttls.set(key, Date.now() + ttl);
    }
    return 'OK';
  },
  
  async get(key) {
    const expiry = ttls.get(key);
    if (expiry && Date.now() > expiry) {
      store.delete(key);
      ttls.delete(key);
      return null;
    }
    return store.get(key) || null;
  },
  
  async del(key) {
    const existed = store.has(key);
    store.delete(key);
    ttls.delete(key);
    return existed ? 1 : 0;
  },
  
  async ping() {
    return 'PONG';
  },
  
  async quit() {
    store.clear();
    ttls.clear();
  },
  
  _clear() {
    store.clear();
    ttls.clear();
  },
  
  _getStore() {
    return store;
  },
};

module.exports = mockRedis;
