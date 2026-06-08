const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-'));
after(() => fs.rmSync(process.env.SLIME_ROOT, { recursive: true, force: true }));
const { createServer } = require('../scripts/serve');
const state = require('../core/state');

test('serves whitelisted static assets with JS mime', async () => {
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  for (const p of ['/arena.js', '/sequencer.js', '/vendor/pixi.min.js']) {
    const res = await fetch(`http://127.0.0.1:${port}${p}`);
    assert.equal(res.status, 200, p);
    assert.match(res.headers.get('content-type'), /javascript/, p);
  }
  await new Promise(r => srv.close(r));
});

test('serves /minions.js with JS mime', async () => {
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/minions.js`);
  assert.equal(res.status, 200, '/minions.js');
  assert.match(res.headers.get('content-type'), /javascript/, '/minions.js');
  await new Promise(r => srv.close(r));
});

test('404s anything not whitelisted', async () => {
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  // Note: fetch() (WHATWG URL) normalises /arena.js/../arena.js → /arena.js before
  // sending, so that traversal variant is indistinguishable from a legitimate request.
  // Security is provided by the exact-match whitelist itself.
  for (const p of ['/vendor/../../../etc/passwd', '/lib/state.js', '/vendor/other.js']) {
    const res = await fetch(`http://127.0.0.1:${port}${p}`);
    assert.equal(res.status, 404, p);
  }
  await new Promise(r => srv.close(r));
});

test('serves /state and / and 404', async () => {
  state.writeSnapshot('s1', { sessionId: 's1', turn: 2, dmg: 10 });
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const st = await (await fetch(`${base}/state`)).json();
    assert.equal(st.snapshot.turn, 2);
    assert.equal(st.harness, process.env.SLIME_HARNESS || 'claude-code');
    const home = await fetch(base);
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /Slime/i); // brand — a failed assert must still close srv (finally)
    assert.match(html, /id="user-status"/);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  } finally {
    srv.close();
  }
});
