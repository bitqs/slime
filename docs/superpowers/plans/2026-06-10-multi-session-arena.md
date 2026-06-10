# Multi-Session Arena (Session Picker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the arena viewer list live sessions and pin one via `?session=<id>`, instead of being hard-bound to the newest session.

**Architecture:** Data layer already multi-session (`SLIME_ROOT/sessions/<id>.json|.jsonl` per session). Add a read-only `listSessions()` to core/state, a `/sessions` route + `?session=` pin to serve.js, and a top-bar `<select>` in the arena that rewrites the URL and reconnects SSE. Server stays stateless; observer principle untouched.

**Tech Stack:** Node stdlib (http/fs), node:test, vanilla DOM in `public/arena.js`. No deps, no build.

**Spec:** `docs/superpowers/specs/2026-06-10-multi-session-arena-design.md`

---

### Task 1: `core/state.js` — `listSessions()`

**Files:**
- Modify: `core/state.js` (after `newestSessionId`, ~line 84)
- Test: `test/state.test.js` (append)

- [ ] **Step 1: Write the failing test** — append to `test/state.test.js` (it already sets `SLIME_ROOT` to a tmpdir at the top; reuse its `state` import):

```js
test('listSessions lists snapshots newest-first with labels', () => {
  state.writeSnapshot('old1', { sessionId: 'old1', turn: 3, cwd: '/p/alpha', boss: { name: 'The Grim Alpha Trial Slime', hp: 40 } });
  state.writeSnapshot('new1', { sessionId: 'new1', turn: 1, cwd: '/p/beta' });
  // force distinct mtimes (fs mtime resolution can swallow same-ms writes)
  const old = require('node:path').join(process.env.SLIME_ROOT, 'sessions', 'old1.json');
  fs.utimesSync(old, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  const ls = state.listSessions();
  assert.equal(ls[0].id, 'new1');
  assert.equal(ls[0].project, 'beta');
  assert.equal(ls[0].boss, null);
  assert.equal(ls[1].id, 'old1');
  assert.equal(ls[1].boss, 'The Grim Alpha Trial Slime');
  assert.equal(ls[1].turn, 3);
  assert.equal(typeof ls[0].updated, 'number');
  assert.equal(ls[0].active, true);
});
```

- [ ] **Step 2: Run** `node --test test/state.test.js` — expect FAIL: `state.listSessions is not a function`.

- [ ] **Step 3: Implement** in `core/state.js` after `newestSessionId()`:

```js
const ACTIVE_MS = 10 * 60 * 1000;

/** Live-session directory listing for the arena picker: newest-first,
 *  capped, tolerant of evicted/corrupt snapshots.
 *  @param {number} [limit]
 *  @returns {Array<{id: string, project: string|null, boss: string|null, turn: number, updated: number, active: boolean}>} */
function listSessions(limit = 12) {
  const dir = path.join(ROOT, 'sessions');
  const out = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const id = f.slice(0, -5);
      try {
        const st = fs.statSync(path.join(dir, f));
        const snap = readSnapshot(id);
        if (!snap) continue;
        out.push({
          id,
          project: snap.cwd ? (String(snap.cwd).split(/[\\/]/).filter(Boolean).pop() || null) : null,
          boss: (snap.boss && snap.boss.name) ? snap.boss.name : null,
          turn: Number(snap.turn) || 0,
          updated: st.mtimeMs,
          active: Date.now() - st.mtimeMs < ACTIVE_MS,
        });
      } catch { /* evicted mid-scan */ }
    }
  } catch { /* sessions dir missing */ }
  out.sort((a, b) => b.updated - a.updated);
  return out.slice(0, limit);
}
```

Add `listSessions` to `module.exports`.

- [ ] **Step 4: Run** `node --test test/state.test.js` — expect PASS. Also `npm run typecheck`.

- [ ] **Step 5: Commit** `git add core/state.js test/state.test.js && git commit -m "feat(state): listSessions for arena picker"`

---

### Task 2: snapshots carry `cwd` (picker label source)

`Snapshot` has no `cwd` today — `listSessions().project` would always be null for real sessions. One-line write in the prompt hook (the snapshot creator).

**Files:**
- Modify: `scripts/hook-prompt.js` (~line 44, before `snap.updated = Date.now()`)
- Modify: `core/types.d.ts` (Snapshot interface)
- Test: `test/hooks.test.js` (existing prompt-hook test)

- [ ] **Step 1: Extend the existing prompt-hook assertion** in `test/hooks.test.js` — in the test that checks `snap.boss.name` (~line 41), add right after it:

```js
  assert.equal(snap.cwd, '/tmp/myapp');
```

(Use whatever cwd that test already passes in its payload — read the test first; if it passes `cwd: '/tmp/myapp'` keep it, otherwise match the actual value.)

- [ ] **Step 2: Run** `node --test test/hooks.test.js` — expect FAIL: `undefined !== '/tmp/myapp'`.

- [ ] **Step 3: Implement** — `scripts/hook-prompt.js`, next to `snap.est = est;`:

```js
    snap.cwd = p.cwd || ''; // picker label; snapshots are per-session so this is stable
```

And in `core/types.d.ts` add to `Snapshot`:

```ts
  cwd?: string;
```

- [ ] **Step 4: Run** `node --test test/hooks.test.js && npm run typecheck` — expect PASS.

- [ ] **Step 5: Commit** `git add scripts/hook-prompt.js core/types.d.ts test/hooks.test.js && git commit -m "feat(hooks): record cwd in snapshot for session picker"`

---

### Task 3: serve.js — `/sessions` route + `?session=` pin

**Files:**
- Modify: `scripts/serve.js`
- Test: `test/serve.test.js` (append)

- [ ] **Step 1: Write failing tests** — append to `test/serve.test.js`:

```js
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
    assert.equal(ls.sessions[0].id, 'sb');
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
    let buf = '', deadline = Date.now() + 5000;
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
```

- [ ] **Step 2: Run** `node --test test/serve.test.js` — expect FAIL (404 on `/sessions`; pin ignored).

- [ ] **Step 3: Implement** in `scripts/serve.js`:

Import: add `listSessions` to the `core/state` destructure on line 15.

Below `SSE_MAX`:

```js
// Pin id: the regex is the whole guard — no slashes/dots, so building
// eventsPath(id) from it can never traverse (same pattern as AUDIO_RE).
const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** @param {string | undefined} reqUrl @returns {string | null} */
function pinnedId(reqUrl) {
  try {
    const v = new URL(reqUrl || '', 'http://localhost').searchParams.get('session');
    return v && SESSION_ID_RE.test(v) ? v : null; // invalid → null → fall back to newest
  } catch { return null; }
}
```

`handleState` — change signature to `(req, res)` and the id line to:

```js
    const id = pinnedId(req.url) || newestSessionId();
```

(update the call site in `createServer` to `handleState(req, res)`).

`handleEvents` — replace the tracking init with:

```js
  const pinned = pinnedId(req.url);
  let trackedId = pinned || newestSessionId();
```

and guard the auto-jump block:

```js
      // Check for a newer session (auto-follow mode only; a pinned viewer stays put)
      if (!pinned) {
        const currentId = newestSessionId();
        if (currentId && currentId !== trackedId) {
          trackedId = currentId;
          byteOffset = 0;
        }
      }
```

New handler + route:

```js
/** @param {ServerResponse} res */
function handleSessions(res) {
  try {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessions: listSessions(), newest: newestSessionId() }));
  } catch { res.writeHead(500); res.end('{}'); }
}
```

```js
    } else if (req.method === 'GET' && url === '/sessions') {
      handleSessions(res);
```

- [ ] **Step 4: Run** `node --test test/serve.test.js && npm run typecheck` — expect PASS.

- [ ] **Step 5: Commit** `git add scripts/serve.js test/serve.test.js && git commit -m "feat(serve): /sessions list + ?session= pin for multi-terminal viewing"`

---

### Task 4: viewer — picker element + behavior

No unit harness for `public/` (excluded from tsc; browser-only) — verified manually in Task 5.

**Files:**
- Modify: `public/index.html` (top bar, before `<span style="flex:1">`; CSS block)
- Modify: `public/arena.js` (SSE wiring ~1399-1490; UI catalog ~1233-1276; `applyLang`)

- [ ] **Step 1: index.html** — in the top bar, right before `<span style="flex:1"></span>`:

```html
  <select id="session-picker" hidden aria-label="Watch session"></select>
```

CSS (next to other top-bar rules):

```css
#session-picker{background:var(--panel-bg);color:var(--ink);border:1px solid var(--rule);font:inherit;font-size:10px;max-width:200px;margin-left:6px}
```

- [ ] **Step 2: arena.js — pin state + parameterized connections.** Near the `pollState` block (~line 1399):

```js
  // ── session picker (multi-session) ────────────────────────────────────────────
  // Pin lives in the URL (?session=) so refresh / shared links keep the channel.
  let pinnedSession = (() => {
    try { return new URLSearchParams(location.search).get('session'); } catch (e) { return null; }
  })();
  const sessQS = () => pinnedSession ? `?session=${encodeURIComponent(pinnedSession)}` : '';
```

Change `pollState`'s fetch to:

```js
    try { const r = await fetch('/state' + sessQS()); if (r.ok) applyState(await r.json()); } catch {}
```

Change `connectEvents` to keep the EventSource reachable for reconnects:

```js
  let esRef = null;
  function connectEvents() {
    try {
      esRef = new EventSource('/events' + sessQS());
      esRef.onmessage = handleEvent;
      esRef.onerror = () => { esRef.close(); setTimeout(connectEvents, 3000); };
    } catch {}
  }
  connectEvents();
```

- [ ] **Step 3: arena.js — picker population + switching.** After `connectEvents()`:

```js
  const sessionPicker = document.getElementById('session-picker');
  function setPinned(id) {
    pinnedSession = id || null;
    try {
      const u = new URL(location.href);
      if (pinnedSession) u.searchParams.set('session', pinnedSession);
      else u.searchParams.delete('session');
      history.replaceState(null, '', u);
    } catch (e) {}
    if (esRef) { try { esRef.close(); } catch (e) {} }
    connectEvents();
    pollState();
  }
  async function refreshSessions() {
    if (!sessionPicker) return;
    if (document.activeElement === sessionPicker) return; // don't rebuild under an open dropdown
    let data = null;
    try { const r = await fetch('/sessions'); if (r.ok) data = await r.json(); } catch (e) {}
    if (!data || !Array.isArray(data.sessions)) { sessionPicker.hidden = true; return; } // demo worker has no /sessions
    const live = data.sessions.filter((s) => s.active);
    const show = live.length >= 2 || !!pinnedSession; // zero chrome for single-terminal users
    sessionPicker.hidden = !show;
    if (!show) return;
    const U = UI[lang];
    sessionPicker.textContent = '';
    const auto = document.createElement('option');
    auto.value = '';
    auto.text = U.sessAuto;
    sessionPicker.appendChild(auto);
    for (const s of data.sessions) {
      const o = document.createElement('option'); // option.text is text-only — session strings never touch innerHTML
      o.value = s.id;
      o.text = (s.active ? '' : '⏸ ') + `${s.project || s.id.slice(0, 8)} · ${s.boss || '—'} (T${s.turn})`;
      sessionPicker.appendChild(o);
    }
    sessionPicker.value = pinnedSession || '';
    if (sessionPicker.selectedIndex < 0) sessionPicker.value = ''; // pinned session vanished from the list
  }
  if (sessionPicker) sessionPicker.addEventListener('change', () => setPinned(sessionPicker.value || null));
  refreshSessions();
  setInterval(refreshSessions, 10000);
```

- [ ] **Step 4: i18n.** In the `UI` catalog add to **both** `en.tip` and `zh.tip`: `sessions: 'Watch another session'` / `sessions: '切换观战会话'`; and top-level `sessAuto: '📡 auto-follow'` / `sessAuto: '📡 自动跟随'`. In `applyLang` add:

```js
    tip('session-picker', U.tip.sessions);
    const sp = document.getElementById('session-picker');
    if (sp && sp.options.length) sp.options[0].text = U.sessAuto;
```

- [ ] **Step 5: Quick static sanity** `node --test test/ && npm run typecheck` (arena.js excluded from tsc but the suite guards everything else). Expect PASS.

- [ ] **Step 6: Commit** `git add public/index.html public/arena.js && git commit -m "feat(arena): session picker — pin a battle via ?session="`

---

### Task 5: manual verify + ship

- [ ] **Step 1: Two-session demo.** Demo feed writes one session; fake a second:

```bash
SLIME_ROOT=/tmp/slime-demo node scripts/demo-feed.js &
node -e "process.env.SLIME_ROOT='/tmp/slime-demo'; const s=require('./core/state'); s.ensureDirs(); s.writeSnapshot('second', { sessionId: 'second', turn: 5, cwd: '/p/otherproj', boss: { name: 'The Pale Otherproj Trial Slime', hp: 70 } });"
SLIME_ROOT=/tmp/slime-demo SLIME_PORT=4118 node scripts/serve.js
```

Open `http://127.0.0.1:4118`. Check: picker visible with 2 entries + auto-follow; selecting `otherproj` updates URL to `?session=second` and `/state` shows its boss; selecting auto-follow drops the param and the live demo battle resumes; refresh keeps the pin; lang toggle relabels the auto option.

- [ ] **Step 2: Demo-worker regression.** `cd demo && npx wrangler dev` (or open the deployed page) — no picker, no console errors (404 on `/sessions` is swallowed).

- [ ] **Step 3: Full suite** `node --test test/ && npm run typecheck` — all green.

- [ ] **Step 4: Push** `git push`.
