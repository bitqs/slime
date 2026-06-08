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
