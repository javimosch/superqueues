const { SuperQueuesError, ErrorCodes } = require('./errors');

let WebSocketImpl;
if (typeof WebSocket !== 'undefined') {
  WebSocketImpl = WebSocket;
} else {
  try {
    WebSocketImpl = require('ws');
  } catch {
    WebSocketImpl = null;
  }
}

class WsAdapter {
  constructor(options) {
    this.baseUrl = options.baseUrl.replace(/^http/, 'ws').replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.reconnect = options.reconnect !== false;
    this.reconnectInterval = options.reconnectInterval || 1000;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;

    this.ws = null;
    this.connected = false;
    this.reconnectAttempt = 0;
    this.subscriptions = new Map();
    this.pendingRequests = new Map();
    this.requestId = 0;
    this.eventHandlers = new Map();
  }

  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event).add(handler);
    return () => this.eventHandlers.get(event).delete(handler);
  }

  emit(event, ...args) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (err) {
          console.error(`Event handler error (${event}):`, err);
        }
      }
    }
  }

  async connect() {
    if (!WebSocketImpl) {
      throw new SuperQueuesError('WebSocket not available', ErrorCodes.UNSUPPORTED);
    }

    return new Promise((resolve, reject) => {
      const wsUrl = `${this.baseUrl}/v1/ws?apiKey=${encodeURIComponent(this.apiKey)}`;

      this.ws = new WebSocketImpl(wsUrl);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempt = 0;
        this.emit('connected');
        resolve();
      };

      this.ws.onclose = (event) => {
        this.connected = false;
        this.emit('disconnected', event.reason || 'Connection closed');

        if (this.reconnect && this.reconnectAttempt < this.maxReconnectAttempts) {
          this.reconnectAttempt++;
          this.emit('reconnecting', this.reconnectAttempt);
          setTimeout(() => this.connect().catch(() => {}), this.reconnectInterval);
        }
      };

      this.ws.onerror = (err) => {
        this.emit('error', err);
        if (!this.connected) {
          reject(new SuperQueuesError('WebSocket connection failed', ErrorCodes.CONNECTION_ERROR));
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.emit('error', new SuperQueuesError('Invalid message from server', ErrorCodes.INVALID_RESPONSE));
      return;
    }

    if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
      const { resolve, reject } = this.pendingRequests.get(msg.requestId);
      this.pendingRequests.delete(msg.requestId);

      if (msg.error) {
        reject(new SuperQueuesError(msg.error, msg.code || 'SERVER_ERROR'));
      } else {
        resolve(msg.data);
      }
      return;
    }

    if (msg.type === 'message' && msg.queue) {
      const handler = this.subscriptions.get(msg.queue);
      if (handler) {
        const controls = {
          ack: () => this.ack(msg.queue, msg.receiptId),
          nack: (opts) => this.nack(msg.queue, msg.receiptId, opts),
        };
        Promise.resolve(handler(msg, controls)).catch((err) => {
          this.emit('error', err);
        });
      }
    }
  }

  send(type, data) {
    if (!this.connected || !this.ws) {
      throw new SuperQueuesError('Not connected', ErrorCodes.NOT_CONNECTED);
    }

    const requestId = ++this.requestId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      const msg = JSON.stringify({ type, requestId, ...data });
      this.ws.send(msg);

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new SuperQueuesError('Request timeout', ErrorCodes.TIMEOUT));
        }
      }, 30000);
    });
  }

  async publish(queue, payload, options = {}) {
    return this.send('publish', {
      queue,
      payload,
      headers: options.headers,
      correlationId: options.correlationId,
      idempotencyKey: options.idempotencyKey,
    });
  }

  subscribe(queue, handler) {
    this.subscriptions.set(queue, handler);

    if (this.connected) {
      this.send('subscribe', { queue }).catch((err) => this.emit('error', err));
    }

    return () => {
      this.subscriptions.delete(queue);
      if (this.connected) {
        this.send('unsubscribe', { queue }).catch(() => {});
      }
    };
  }

  async ack(queue, receiptId) {
    return this.send('ack', { queue, receiptId });
  }

  async nack(queue, receiptId, options = {}) {
    return this.send('nack', {
      queue,
      receiptId,
      action: options.action || 'requeue',
      reason: options.reason,
    });
  }

  async pull() {
    throw new SuperQueuesError('pull() not supported in WS mode, use subscribe()', ErrorCodes.UNSUPPORTED);
  }

  async getJob(jobId) {
    return this.send('getJob', { jobId });
  }

  async getJobEvents(jobId) {
    return this.send('getJobEvents', { jobId });
  }

  close() {
    this.reconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.subscriptions.clear();
    this.pendingRequests.clear();
  }
}

module.exports = { WsAdapter };
