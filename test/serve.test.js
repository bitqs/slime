const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.CCQ_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ccq-'));
after(() => fs.rmSync(process.env.CCQ_ROOT, { recursive: true, force: true }));
const { createServer } = require('../scripts/serve');
const state = require('../scripts/lib/state');

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
