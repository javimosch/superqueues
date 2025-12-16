class AdminClient {
  constructor(httpAdapter) {
    this.http = httpAdapter;
  }

  async listQueues() {
    return this.http.request('GET', '/admin/queues');
  }

  async getQueueMessages(queue, options = {}) {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.limit) params.set('limit', String(options.limit));

    const qs = params.toString();
    const path = `/admin/queues/${encodeURIComponent(queue)}/messages${qs ? '?' + qs : ''}`;
    return this.http.request('GET', path);
  }

  async publishTestMessage(queue, payload, options = {}) {
    return this.http.request('POST', `/admin/queues/${encodeURIComponent(queue)}/publish`, {
      payload,
      headers: options.headers,
      correlationId: options.correlationId,
    });
  }

  async requeueFromDlq(queue, jobIds) {
    return this.http.request('POST', `/admin/queues/${encodeURIComponent(queue)}/requeue`, {
      jobIds,
    });
  }

  async purgeQueue(queue, status = 'dlq') {
    return this.http.request('POST', `/admin/queues/${encodeURIComponent(queue)}/purge`, {
      status,
    });
  }

  async startConsumer(queue) {
    return this.http.request('POST', `/admin/queues/${encodeURIComponent(queue)}/consumer`);
  }

  async getSettings() {
    return this.http.request('GET', '/admin/settings');
  }

  async updateSettings(settings) {
    return this.http.request('POST', '/admin/settings', settings);
  }

  async listApiKeys() {
    return this.http.request('GET', '/admin/api-keys');
  }

  async createApiKey(options) {
    return this.http.request('POST', '/admin/api-keys', {
      name: options.name,
      scopes: options.scopes,
      allowedQueues: options.allowedQueues,
    });
  }

  async updateApiKey(id, updates) {
    return this.http.request('PATCH', `/admin/api-keys/${encodeURIComponent(id)}`, updates);
  }

  async deleteApiKey(id) {
    return this.http.request('DELETE', `/admin/api-keys/${encodeURIComponent(id)}`);
  }
}

module.exports = { AdminClient };
