const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const multer = require('multer');
const WebSocket = require('ws');
const { randomUUID } = require('crypto');

const { createClient } = require('../../sdk');

function getGatewayUrl() {
  if (process.env.GATEWAY_URL) return process.env.GATEWAY_URL;
  if (process.env.PORT_GATEWAY) return `http://localhost:${process.env.PORT_GATEWAY}`;
  return 'http://localhost:3000';
}

const GATEWAY_URL = getGatewayUrl();
const PORT = parseInt(process.env.PORT || '3003', 10);

const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || process.env.API_KEY;
if (!GATEWAY_API_KEY) {
  console.error('Missing GATEWAY_API_KEY (or API_KEY) env var. Must be an admin key.');
  process.exit(1);
}

const sqClient = createClient({
  baseUrl: GATEWAY_URL,
  apiKey: GATEWAY_API_KEY,
  mode: 'http',
});

const storageDir = path.join(__dirname, 'storage');
fs.mkdirSync(storageDir, { recursive: true });

const upload = multer({ dest: path.join(storageDir, 'uploads') });

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const imports = new Map();

const wsServer = new WebSocket.Server({ noServer: true });
const wsClientsByImport = new Map();

function addWsClient(importId, ws) {
  if (!wsClientsByImport.has(importId)) wsClientsByImport.set(importId, new Set());
  wsClientsByImport.get(importId).add(ws);
}

function removeWsClient(importId, ws) {
  const set = wsClientsByImport.get(importId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) wsClientsByImport.delete(importId);
}

function broadcast(importId, event) {
  const set = wsClientsByImport.get(importId);
  if (!set) return;
  const msg = JSON.stringify(event);
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

function normalizeQueue(importId) {
  return `imports.${importId}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processImport(importId, intervalMs) {
  const imp = imports.get(importId);
  if (!imp) return;

  broadcast(importId, { type: 'status', status: 'processing', processed: imp.processedChunks, total: imp.totalChunks });

  while (true) {
    const current = imports.get(importId);
    if (!current) return;
    if (current.status !== 'processing') return;

    const messages = await sqClient.pull(current.queue, {
      maxMessages: 5,
      visibilityTimeoutMs: 60000,
    });

    if (messages.length === 0) {
      if (current.processedChunks >= current.totalChunks) {
        break;
      }
      await sleep(intervalMs);
      continue;
    }

    for (const msg of messages) {
      await sleep(intervalMs);

      current.processedChunks += 1;
      current.lastEventAt = new Date().toISOString();

      await sqClient.ack(current.queue, msg.receiptId);

      broadcast(importId, {
        type: 'progress',
        processed: current.processedChunks,
        total: current.totalChunks,
        percent: Math.round((current.processedChunks / current.totalChunks) * 100),
      });

      if (current.processedChunks >= current.totalChunks) {
        break;
      }
    }
  }

  const finished = imports.get(importId);
  if (!finished) return;

  finished.status = 'ready';
  finished.lastEventAt = new Date().toISOString();

  const outputPath = path.join(storageDir, `output-${importId}.txt`);
  finished.outputPath = outputPath;

  const content = [
    'SuperQueues Import Demo Output (SDK version)',
    `importId=${importId}`,
    `createdAt=${finished.createdAt}`,
    `processedChunks=${finished.processedChunks}`,
    '',
    'This file was generated using the @superqueues/sdk.',
  ].join('\n');

  fs.writeFileSync(outputPath, content, 'utf8');

  broadcast(importId, {
    type: 'ready',
    downloadUrl: `/download/${importId}`,
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/import', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'file is required (multipart field name: file)' });
    }

    const importId = randomUUID();
    const queue = normalizeQueue(importId);

    const intervalMs = parseInt(req.body?.intervalMs || process.env.IMPORT_INTERVAL_MS || '400', 10);

    const fileContent = fs.readFileSync(file.path, 'utf8');
    const lines = fileContent.split(/\r?\n/).filter(Boolean);
    const totalChunks = Math.max(lines.length, 1);

    imports.set(importId, {
      importId,
      queue,
      createdAt: new Date().toISOString(),
      status: 'queued',
      totalChunks,
      processedChunks: 0,
      uploadPath: file.path,
      outputPath: null,
      lastEventAt: new Date().toISOString(),
    });

    // Use SDK admin to start consumer
    const admin = sqClient.admin();
    await admin.startConsumer(queue);

    // Publish work items using SDK
    if (lines.length === 0) {
      await sqClient.publish(queue, { importId, idx: 0, line: '(empty file)' });
    } else {
      let idx = 0;
      for (const line of lines) {
        await sqClient.publish(queue, { importId, idx, line });
        idx += 1;
      }
    }

    const imp = imports.get(importId);
    imp.status = 'processing';

    processImport(importId, intervalMs).catch((err) => {
      const failed = imports.get(importId);
      if (failed) {
        failed.status = 'failed';
        failed.lastEventAt = new Date().toISOString();
      }
      broadcast(importId, { type: 'error', message: err.message });
    });

    res.status(201).json({
      importId,
      queue,
      statusUrl: `/status/${importId}`,
      wsUrl: `/ws?importId=${importId}`,
      downloadUrl: `/download/${importId}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/status/:importId', (req, res) => {
  const imp = imports.get(req.params.importId);
  if (!imp) return res.status(404).json({ error: 'import not found' });
  res.json({
    importId: imp.importId,
    queue: imp.queue,
    status: imp.status,
    totalChunks: imp.totalChunks,
    processedChunks: imp.processedChunks,
    lastEventAt: imp.lastEventAt,
  });
});

app.get('/download/:importId', (req, res) => {
  const imp = imports.get(req.params.importId);
  if (!imp) return res.status(404).json({ error: 'import not found' });
  if (imp.status !== 'ready' || !imp.outputPath) {
    return res.status(425).json({ error: 'file not ready' });
  }

  res.download(imp.outputPath, `output-${imp.importId}.txt`);
});

const server = http.createServer(app);

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wsServer.handleUpgrade(req, socket, head, (ws) => {
    wsServer.emit('connection', ws, req);
  });
});

wsServer.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const importId = url.searchParams.get('importId');

  if (!importId || !imports.has(importId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'invalid importId' }));
    ws.close();
    return;
  }

  addWsClient(importId, ws);

  const imp = imports.get(importId);
  ws.send(JSON.stringify({
    type: 'hello',
    importId,
    status: imp.status,
    processed: imp.processedChunks,
    total: imp.totalChunks,
    downloadUrl: imp.outputPath ? `/download/${importId}` : null,
  }));

  ws.on('close', () => removeWsClient(importId, ws));
});

server.listen(PORT, () => {
  console.log(`Import backend example (SDK) running at http://localhost:${PORT}`);
  console.log(`Gateway URL: ${GATEWAY_URL}`);
  console.log(`Using @superqueues/sdk`);
  console.log('Endpoints:');
  console.log('  POST /import  (multipart field: file)');
  console.log('  GET  /status/:importId');
  console.log('  GET  /download/:importId');
  console.log('  WS   /ws?importId=...');
});
