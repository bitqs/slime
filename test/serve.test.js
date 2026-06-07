const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.CCQ_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
after(() => fs.rmSync(process.env.CCQ_ROOT, { recursive: true, force: true }));
const { createServer } = require('../scripts/serve');
const state = require('../scripts/lib/state');

test('serves whitelisted static assets with JS mime', async () => {
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  for (const p of ['/arena.js', '/sequencer.js', '/vendor/pixi.min.js']) {
    const res = await fetch(`http://127.0.0.1:${port}${p}`);
    assert.equal(res.status, 200, p);
    assert.match(res.headers.get('content-type'), /javascript/, p);
  }
  srv.close();
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
  srv.close();
});

test('serves /state and / and 404', async () => {
  state.writeSnapshot('s1', { sessionId: 's1', turn: 2, dmg: 10 });
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const st = await (await fetch(`${base}/state`)).json();
  assert.equal(st.snapshot.turn, 2);
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Questline/);
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  srv.close();
});
