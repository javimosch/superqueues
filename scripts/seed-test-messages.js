const http = require('http');

function getApiUrl() {
  if (process.env.API_URL) return process.env.API_URL;
  if (process.env.PORT) return `http://localhost:${process.env.PORT}`;
  return 'http://localhost:3000';
}

const API_URL = getApiUrl();
const API_KEY = process.env.API_KEY || process.argv[2];

if (!API_KEY) {
  console.error('Usage: node scripts/seed-test-messages.js <API_KEY>');
  console.error('  or set API_KEY environment variable');
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

async function seedMessages() {
  console.log(`API_URL: ${API_URL}`);
  console.log('Seeding test messages...\n');

  const queues = [
    {
      name: 'orders.created',
      messages: [
        { orderId: 'ORD-001', customer: 'alice@example.com', total: 99.99 },
        { orderId: 'ORD-002', customer: 'bob@example.com', total: 149.50 },
        { orderId: 'ORD-003', customer: 'carol@example.com', total: 75.00 },
      ],
    },
    {
      name: 'orders.updated',
      messages: [
        { orderId: 'ORD-001', status: 'shipped', trackingNumber: 'TRK123' },
        { orderId: 'ORD-002', status: 'processing' },
      ],
    },
    {
      name: 'notifications.email',
      messages: [
        { to: 'user1@example.com', subject: 'Welcome!', template: 'welcome' },
        { to: 'user2@example.com', subject: 'Order Confirmed', template: 'order-confirm' },
        { to: 'user3@example.com', subject: 'Password Reset', template: 'password-reset' },
        { to: 'user4@example.com', subject: 'Weekly Digest', template: 'digest' },
      ],
    },
    {
      name: 'notifications.sms',
      messages: [
        { phone: '+1234567890', message: 'Your code is 123456' },
        { phone: '+0987654321', message: 'Order shipped!' },
      ],
    },
    {
      name: 'analytics.events',
      messages: [
        { event: 'page_view', page: '/home', userId: 'u1' },
        { event: 'button_click', button: 'signup', userId: 'u2' },
        { event: 'purchase', amount: 50, userId: 'u3' },
      ],
    },
  ];

  let totalSent = 0;

  for (const queue of queues) {
    console.log(`Queue: ${queue.name}`);
    
    for (const payload of queue.messages) {
      const result = await request('POST', `/v1/queues/${queue.name}/messages`, {
        payload,
        headers: { source: 'seed-script' },
        correlationId: `seed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      if (result.status === 201) {
        console.log(`  ✓ Published: ${JSON.stringify(payload).slice(0, 50)}...`);
        totalSent++;
      } else {
        console.log(`  ✗ Failed: ${result.status} - ${JSON.stringify(result.data)}`);
      }
    }
    console.log('');
  }

  console.log(`\n=== Done: ${totalSent} messages published ===\n`);
}

seedMessages().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
