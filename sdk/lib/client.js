const { HttpAdapter } = require('./http');
const { WsAdapter } = require('./ws');
const { AdminClient } = require('./admin');
const { SuperQueuesError, ErrorCodes } = require('./errors');

class SuperQueuesClient {
  constructor(options) {
    if (!options.baseUrl) {
      throw new SuperQueuesError('baseUrl is required', ErrorCodes.BAD_REQUEST);
    }
    if (!options.apiKey) {
      throw new SuperQueuesError('apiKey is required', ErrorCodes.BAD_REQUEST);
    }

    this.options = options;
    this.mode = options.mode || 'http';

    if (this.mode === 'http') {
      this.adapter = new HttpAdapter(options);
    } else if (this.mode === 'ws') {
      this.adapter = new WsAdapter(options);
    } else {
      throw new SuperQueuesError(`Invalid mode: ${this.mode}`, ErrorCodes.BAD_REQUEST);
    }

    this._adminClient = null;
    this._httpAdapter = null;
  }

  async connect() {
    if (this.mode === 'ws') {
      return this.adapter.connect();
    }
  }

  on(event, handler) {
    if (this.mode === 'ws') {
      return this.adapter.on(event, handler);
    }
    return () => {};
  }

  async publish(queue, payload, options = {}) {
    return this.adapter.publish(queue, payload, options);
  }

  async pull(queue, options = {}) {
    return this.adapter.pull(queue, options);
  }

  async ack(queue, receiptId) {
    return this.adapter.ack(queue, receiptId);
  }

  async nack(queue, receiptId, options = {}) {
    return this.adapter.nack(queue, receiptId, options);
  }

  subscribe(queue, handler) {
    if (this.mode !== 'ws') {
      throw new SuperQueuesError('subscribe() only available in WS mode', ErrorCodes.UNSUPPORTED);
    }
    return this.adapter.subscribe(queue, handler);
  }

  async getJob(jobId) {
    return this.adapter.getJob(jobId);
  }

  async getJobEvents(jobId) {
    return this.adapter.getJobEvents(jobId);
  }

  admin() {
    if (!this._adminClient) {
      if (this.mode === 'http') {
        this._adminClient = new AdminClient(this.adapter);
      } else {
        if (!this._httpAdapter) {
          this._httpAdapter = new HttpAdapter({
            baseUrl: this.options.baseUrl.replace(/^ws/, 'http'),
            apiKey: this.options.apiKey,
            timeout: this.options.timeout,
          });
        }
        this._adminClient = new AdminClient(this._httpAdapter);
      }
    }
    return this._adminClient;
  }

  close() {
    this.adapter.close();
  }
}

function createClient(options) {
  return new SuperQueuesClient(options);
}

module.exports = {
  createClient,
  SuperQueuesClient,
};
