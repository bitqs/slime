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

test('/sessions lists battles; /state honors ?session= pin', async () => {
  state.writeSnapshot('sa', { sessionId: 'sa', turn: 9, cwd: '/p/alpha', boss: { name: 'A', hp: 50 } });
  state.writeSnapshot('sb', { sessionId: 'sb', turn: 1, cwd: '/p/beta' });
  const pa = path.join(process.env.SLIME_ROOT, 'sessions', 'sa.json');
  fs.utimesSync(pa, new Date(Date.now() - 60000), new Date(Date.now() - 60000)); // sb is newest
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const ls = await (await fetch(`${base}/sessions`)).json();
    assert.equal(ls.newest, 'sb');
    assert.ok(ls.sessions.length >= 2);
    const ia = ls.sessions.findIndex((s) => s.id === 'sa');
    const ib = ls.sessions.findIndex((s) => s.id === 'sb');
    assert.ok(ib >= 0 && ia >= 0 && ib < ia, 'newest first');
    assert.equal(ls.sessions[ia].project, 'alpha');
    // pin beats newest
    const pinned = await (await fetch(`${base}/state?session=sa`)).json();
    assert.equal(pinned.snapshot.turn, 9);
    // invalid id falls back to newest, still 200
    const bad = await fetch(`${base}/state?session=..%2Fetc`);
    assert.equal(bad.status, 200);
    assert.equal((await bad.json()).snapshot.sessionId, 'sb');
  } finally {
    srv.close();
  }
});

test('pinned /events keeps tailing the pinned session', async () => {
  state.writeSnapshot('p1', { sessionId: 'p1', turn: 1 });
  state.writeSnapshot('p2', { sessionId: 'p2', turn: 1 });
  state.appendEvent('p1', { t: Date.now(), kind: 'cast', text: 'seed' }); // file exists before connect
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const res = await fetch(`${base}/events?session=p1`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    // make p2 newest AND busier — an unpinned stream would jump to it
    state.appendEvent('p2', { t: Date.now(), kind: 'cast', text: 'noise-p2' });
    state.appendEvent('p1', { t: Date.now(), kind: 'cast', text: 'hello-p1' });
    let buf = '';
    const deadline = Date.now() + 5000;
    while (!buf.includes('hello-p1') && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
    }
    assert.match(buf, /hello-p1/);
    assert.doesNotMatch(buf, /noise-p2/);
    await reader.cancel();
  } finally {
    srv.close();
  }
});

test('serves /state and / and 404', async () => {
  state.writeSnapshot('s1', { sessionId: 's1', turn: 2, dmg: 10 });
  const srv = createServer();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const st = await (await fetch(`${base}/state`)).json();
    assert.equal(st.snapshot.turn, 2);
    assert.equal(st.harness, 'claude-code');
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
