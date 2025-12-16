const http = require('http');

function getApiUrl() {
  if (process.env.API_URL) return process.env.API_URL;
  if (process.env.PORT) return `http://localhost:${process.env.PORT}`;
  return 'http://localhost:3000';
}

const API_URL = getApiUrl();
const API_KEY = process.env.API_KEY || process.argv[2];

if (!API_KEY) {
  console.error('Usage: node scripts/demo-flow.js <API_KEY>');
  console.error('  Demonstrates full publish -> consume -> ack/retry/dlq flow');
  process.exit(1);
}

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `ApiKey ${API_KEY}`,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function demo() {
  console.log('=== SuperQueues Demo Flow ===\n');
  console.log(`API_URL: ${API_URL}`);

  console.log('1. Publishing messages to demo.queue...');
  const messages = [
    { type: 'success', data: 'This will be acked' },
    { type: 'retry', data: 'This will be retried' },
    { type: 'fail', data: 'This will go to DLQ' },
  ];

  const jobIds = [];
  for (const payload of messages) {
    const result = await request('POST', '/v1/queues/demo.queue/messages', {
      payload,
      correlationId: `demo-${Date.now()}`,
    });
    if (result.status === 201) {
      console.log(`   ✓ Published: ${payload.type} -> jobId: ${result.data.jobId}`);
      jobIds.push(result.data.jobId);
    } else {
      console.log(`   ✗ Failed: ${JSON.stringify(result.data)}`);
    }
  }

  console.log('\n2. Pulling messages...');
  await sleep(500);

  const pullResult = await request('POST', '/v1/queues/demo.queue/pull', {
    maxMessages: 10,
    visibilityTimeoutMs: 60000,
  });

  if (pullResult.status !== 200) {
    console.error('Pull failed:', pullResult.data);
    return;
  }

  const pulled = pullResult.data.messages;
  console.log(`   Pulled ${pulled.length} messages\n`);

  console.log('3. Processing messages with different outcomes...');
  for (const msg of pulled) {
    const { type } = msg.payload;
    console.log(`\n   Message: ${msg.messageId} (${type})`);

    if (type === 'success') {
      const ackResult = await request('POST', '/v1/queues/demo.queue/ack', {
        receiptId: msg.receiptId,
      });
      console.log(`   → ACK: ${ackResult.status === 200 ? 'OK' : 'FAILED'}`);
    } else if (type === 'retry') {
      const nackResult = await request('POST', '/v1/queues/demo.queue/nack', {
        receiptId: msg.receiptId,
        action: 'retry',
        reason: 'Simulated transient failure',
      });
      console.log(`   → RETRY: ${nackResult.status === 200 ? 'OK (will retry later)' : 'FAILED'}`);
    } else if (type === 'fail') {
      const nackResult = await request('POST', '/v1/queues/demo.queue/nack', {
        receiptId: msg.receiptId,
        action: 'dlq',
        reason: 'Simulated permanent failure',
      });
      console.log(`   → DLQ: ${nackResult.status === 200 ? 'OK (moved to DLQ)' : 'FAILED'}`);
    }
  }

  console.log('\n4. Checking job statuses...');
  await sleep(500);

  for (const jobId of jobIds) {
    const jobResult = await request('GET', `/v1/jobs/${jobId}`);
    if (jobResult.status === 200) {
      const { job } = jobResult.data;
      console.log(`   Job ${jobId.slice(0, 8)}...: status=${job.status}, attempts=${job.attempts}`);
    }
  }

  console.log('\n=== Demo Complete ===');
  console.log('\nNext steps:');
  console.log(`  - Open ${API_URL}/admin to view the UI`);
  console.log('  - Check demo.queue.dlq for the failed message');
  console.log('  - Wait for retry queue TTL and re-pull to see retried message');
}

demo().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
