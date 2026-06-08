const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolate the marker to a throwaway file — never touch a real arena's marker.
const MARKER = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'slime-am-')), 'marker.json');
process.env.SLIME_ARENA_MARKER = MARKER;
after(() => fs.rmSync(path.dirname(MARKER), { recursive: true, force: true }));

const arena = require('../core/arena-status');

test('no marker → readLive is null', () => {
  arena.clearMarker();
  assert.strictEqual(arena.readLive(), null);
});

test('writeMarker by the current (live) process → readLive returns its port', () => {
  // process.pid is alive by definition, so this marker is live.
  assert.ok(arena.writeMarker(4117));
  assert.deepStrictEqual(arena.readLive(), { port: 4117 });
});

test('port is preserved verbatim (tracks SLIME_PORT)', () => {
  arena.writeMarker(4118);
  assert.deepStrictEqual(arena.readLive(), { port: 4118 });
});

test('stale marker (dead pid) reads as null', () => {
  // pid 2^31-1 is effectively never a live process.
  fs.writeFileSync(MARKER, JSON.stringify({ port: 4117, pid: 2147483647 }));
  assert.strictEqual(arena.readLive(), null);
});

test('corrupt marker reads as null, never throws', () => {
  fs.writeFileSync(MARKER, 'not json');
  assert.strictEqual(arena.readLive(), null);
});

test('clearMarker removes the file and is idempotent', () => {
  arena.writeMarker(4117);
  arena.clearMarker();
  assert.strictEqual(fs.existsSync(MARKER), false);
  arena.clearMarker(); // second call must not throw
});

test('clearMarker leaves a foreign-pid marker intact (no link-wipe on re-launch)', () => {
  // A second serve.js that hits EADDRINUSE exits → its clearMarker() must NOT
  // delete the live server's marker. Foreign pid → left untouched.
  fs.writeFileSync(MARKER, JSON.stringify({ port: 4117, pid: 2147483647 }));
  arena.clearMarker();
  assert.strictEqual(fs.existsSync(MARKER), true);
});

test('default marker filename is namespaced by SLIME_ROOT — a debug arena under a different ROOT cannot hijack the real HUD link', () => {
  // Load arena-status fresh with NO override and a chosen SLIME_ROOT, read its
  // default markerPath, repeat for a second root. They must differ; same root
  // must be stable. (This is the bug: a fixed temp marker let the demo/debug
  // server overwrite the real session's arena-live marker.)
  const savedMarker = process.env.SLIME_ARENA_MARKER;
  const savedRoot = process.env.SLIME_ROOT;
  delete process.env.SLIME_ARENA_MARKER;
  /** @param {string} root @returns {string} */
  const markerFor = (root) => {
    process.env.SLIME_ROOT = root;
    delete require.cache[require.resolve('../core/state')];
    delete require.cache[require.resolve('../core/arena-status')];
    return require('../core/arena-status').markerPath();
  };
  try {
    const real = markerFor('/Users/x/.claude/slime');
    const demo = markerFor('/tmp/slime-demo');
    const realAgain = markerFor('/Users/x/.claude/slime');
    assert.notStrictEqual(real, demo, 'distinct roots must map to distinct markers');
    assert.strictEqual(real, realAgain, 'same root must be stable');
    assert.ok(real.startsWith(path.join(os.tmpdir(), 'slime-arena-')), 'stays in tmpdir');
  } finally {
    if (savedMarker === undefined) delete process.env.SLIME_ARENA_MARKER; else process.env.SLIME_ARENA_MARKER = savedMarker;
    if (savedRoot === undefined) delete process.env.SLIME_ROOT; else process.env.SLIME_ROOT = savedRoot;
    delete require.cache[require.resolve('../core/state')];
    delete require.cache[require.resolve('../core/arena-status')];
  }
});
