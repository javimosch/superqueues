const http = require('http');

function getApiUrl() {
  if (process.env.API_URL) return process.env.API_URL;
  if (process.env.PORT) return `http://localhost:${process.env.PORT}`;
  return 'http://localhost:3000';
}

const API_URL = getApiUrl();
const API_KEY = process.env.API_KEY || process.argv[2];
const QUEUE = process.argv[3] || 'orders.created';
const ACTION = process.argv[4] || 'ack';

if (!API_KEY) {
  console.error('Usage: node scripts/consume-test.js <API_KEY> [queue] [action]');
  console.error('  queue: queue name (default: orders.created)');
  console.error('  action: ack | nack | retry | dlq (default: ack)');
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

async function consume() {
  console.log(`API_URL: ${API_URL}`);
  console.log(`Consuming from queue: ${QUEUE}`);
  console.log(`Action on messages: ${ACTION}\n`);

  const pullResult = await request('POST', `/v1/queues/${QUEUE}/pull`, {
    maxMessages: 5,
    visibilityTimeoutMs: 30000,
  });

  if (pullResult.status !== 200) {
    console.error('Pull failed:', pullResult);
    process.exit(1);
  }

  const { messages } = pullResult.data;
  console.log(`Pulled ${messages.length} messages\n`);

  for (const msg of messages) {
    console.log(`Message: ${msg.messageId}`);
    console.log(`  Job ID: ${msg.jobId}`);
    console.log(`  Attempt: ${msg.attempt}`);
    console.log(`  Payload: ${JSON.stringify(msg.payload)}`);

    let ackResult;
    if (ACTION === 'ack') {
      ackResult = await request('POST', `/v1/queues/${QUEUE}/ack`, {
        receiptId: msg.receiptId,
      });
      console.log(`  → ACK: ${ackResult.status === 200 ? 'OK' : 'FAILED'}`);
    } else {
      const nackAction = ACTION === 'nack' ? 'requeue' : ACTION;
      ackResult = await request('POST', `/v1/queues/${QUEUE}/nack`, {
        receiptId: msg.receiptId,
        action: nackAction,
        reason: `Test ${nackAction} from consume script`,
      });
      console.log(`  → NACK (${nackAction}): ${ackResult.status === 200 ? 'OK' : 'FAILED'}`);
    }
    console.log('');
  }

  if (messages.length === 0) {
    console.log('No messages available in queue.');
  }
}

consume().catch((err) => {
  console.error('Consume failed:', err);
  process.exit(1);
});
