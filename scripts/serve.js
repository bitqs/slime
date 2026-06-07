'use strict';
/**
 * serve.js — local battle viewer server
 * Serves public/index.html and live session state/events over SSE.
 * READ-ONLY: never writes under ROOT.
 */

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { readSnapshot, eventsPath, newestSessionId } = require('./lib/state');
const { readCache } = require('./lib/usage');
const locale = require('./lib/locale');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.QL_PORT) || 4117;

// ── route handlers ────────────────────────────────────────────────────────────

/** @param {ServerResponse} res */
function handleIndex(res) {
  const file = path.join(PUBLIC_DIR, 'index.html');
  try {
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

/** @param {ServerResponse} res */
function handleState(res) {
  try {
    const id = newestSessionId();
    const snapshot = id ? readSnapshot(id) : null;
    const usage = readCache();
    const lang = locale.current();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ snapshot, usage, lang }));
  } catch {
    res.writeHead(500);
    res.end('{}');
  }
}

/**
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 */
function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');

  // Track byte offset for the newest jsonl at connection time
  let trackedId = newestSessionId();
  let byteOffset = 0;
  if (trackedId) {
    try {
      const st = fs.statSync(eventsPath(trackedId));
      byteOffset = st.size;
    } catch { byteOffset = 0; }
  }

  let lastHb = Date.now();

  const pollTimer = setInterval(() => {
    try {
      const now = Date.now();

      // Heartbeat every 15s
      if (now - lastHb >= 15000) {
        res.write(': hb\n\n');
        lastHb = now;
      }

      // Check for a newer session
      const currentId = newestSessionId();
      if (currentId && currentId !== trackedId) {
        trackedId = currentId;
        byteOffset = 0;
      }

      if (!trackedId) return;

      const filePath = eventsPath(trackedId);
      let stat;
      try { stat = fs.statSync(filePath); } catch { return; }

      if (stat.size <= byteOffset) return;

      // Read new bytes only
      const buf = Buffer.alloc(stat.size - byteOffset);
      const fd = fs.openSync(filePath, 'r');
      try {
        fs.readSync(fd, buf, 0, buf.length, byteOffset);
      } finally {
        fs.closeSync(fd);
      }
      byteOffset = stat.size;

      const chunk = buf.toString('utf8');
      const lines = chunk.split('\n').filter(Boolean);
      for (const line of lines) {
        res.write(`data: ${line}\n\n`);
      }
    } catch { /* fail-soft: skip tick on any error */ }
  }, 1000);

  const cleanup = () => {
    clearInterval(pollTimer);
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
}

/** @param {ServerResponse} res */
function handle404(res) {
  res.writeHead(404);
  res.end('Not found');
}

// Exact-match whitelist: no fs paths are derived from user input, so
// traversal is structurally impossible.
const STATIC_WHITELIST = new Set(['/arena.js', '/sequencer.js', '/minions.js', '/vendor/pixi.min.js']);

/**
 * @param {string} url
 * @param {ServerResponse} res
 */
function handleStatic(url, res) {
  try {
    const body = fs.readFileSync(path.join(PUBLIC_DIR, url));
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

// ── server factory ────────────────────────────────────────────────────────────

function createServer() {
  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (req.method === 'GET' && url === '/') {
      handleIndex(res);
    } else if (req.method === 'GET' && url === '/state') {
      handleState(res);
    } else if (req.method === 'GET' && url === '/events') {
      handleEvents(req, res);
    } else if (req.method === 'GET' && STATIC_WHITELIST.has(url)) {
      handleStatic(url, res);
    } else {
      handle404(res);
    }
  });
  return server;
}

module.exports = { createServer };

if (require.main === module) {
  const srv = createServer();
  srv.listen(PORT, '127.0.0.1', () => {
    console.log(`Questline Arena: http://127.0.0.1:${PORT}`);
  });
}
