const { SuperQueuesError, ErrorCodes, fromHttpStatus } = require('./errors');

class HttpAdapter {
  constructor(options) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 30000;
  }

  async request(method, path, body = null) {
    const url = `${this.baseUrl}/v1${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `ApiKey ${this.apiKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new SuperQueuesError('Invalid JSON response', ErrorCodes.INVALID_RESPONSE, res.status);
      }

      if (!res.ok) {
        const message = data?.error || `HTTP ${res.status}`;
        throw fromHttpStatus(res.status, message);
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        throw new SuperQueuesError('Request timeout', ErrorCodes.TIMEOUT);
      }
      if (err instanceof SuperQueuesError) {
        throw err;
      }
      throw new SuperQueuesError(err.message, ErrorCodes.CONNECTION_ERROR);
    }
  }

  async publish(queue, payload, options = {}) {
    const body = {
      payload,
      headers: options.headers,
      correlationId: options.correlationId,
      idempotencyKey: options.idempotencyKey,
    };

    const result = await this.request('POST', `/queues/${encodeURIComponent(queue)}/messages`, body);
    return { jobId: result.jobId, messageId: result.messageId };
  }

  async pull(queue, options = {}) {
    const body = {
      maxMessages: options.maxMessages || 10,
      visibilityTimeoutMs: options.visibilityTimeoutMs || 30000,
    };

    const result = await this.request('POST', `/queues/${encodeURIComponent(queue)}/pull`, body);
    return result.messages || [];
  }

  async ack(queue, receiptId) {
    await this.request('POST', `/queues/${encodeURIComponent(queue)}/ack`, { receiptId });
  }

  async nack(queue, receiptId, options = {}) {
    await this.request('POST', `/queues/${encodeURIComponent(queue)}/nack`, {
      receiptId,
      action: options.action || 'requeue',
      reason: options.reason,
    });
  }

  async getJob(jobId) {
    const result = await this.request('GET', `/jobs/${encodeURIComponent(jobId)}`);
    return result.job;
  }

  async getJobEvents(jobId) {
    const result = await this.request('GET', `/jobs/${encodeURIComponent(jobId)}/events`);
    return result.events || [];
  }

  close() {
    // No-op for HTTP
  }
}

module.exports = { HttpAdapter };
