'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { safeWrite, safeAppend, readJson, safeMkdir } = require('../scripts/lib/safe-io');

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'slime-safeio-'));
}

test('safeWrite writes content atomically with 0600', () => {
  const d = tmpdir();
  const p = path.join(d, 'a.json');
  assert.strictEqual(safeWrite(p, '{"x":1}'), true);
  assert.strictEqual(fs.readFileSync(p, 'utf8'), '{"x":1}');
  if (process.platform !== 'win32') {
    assert.strictEqual(fs.statSync(p).mode & 0o777, 0o600);
  }
  // no temp file left behind
  assert.deepStrictEqual(fs.readdirSync(d), ['a.json']);
});

test('safeWrite refuses symlink target, victim untouched', () => {
  const d = tmpdir();
  const victim = path.join(d, 'victim.txt');
  fs.writeFileSync(victim, 'precious');
  const link = path.join(d, 'flag.json');
  fs.symlinkSync(victim, link);
  assert.strictEqual(safeWrite(link, 'evil'), false);
  assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'precious');
});

test('safeWrite refuses symlinked parent dir', () => {
  const d = tmpdir();
  const realDir = path.join(d, 'real');
  fs.mkdirSync(realDir);
  const linkDir = path.join(d, 'linkdir');
  fs.symlinkSync(realDir, linkDir);
  assert.strictEqual(safeWrite(path.join(linkDir, 'f.json'), 'x'), false);
  assert.deepStrictEqual(fs.readdirSync(realDir), []);
});

test('safeAppend appends lines, refuses symlink', () => {
  const d = tmpdir();
  const p = path.join(d, 'log.jsonl');
  assert.strictEqual(safeAppend(p, 'one\n'), true);
  assert.strictEqual(safeAppend(p, 'two\n'), true);
  assert.strictEqual(fs.readFileSync(p, 'utf8'), 'one\ntwo\n');
  const victim = path.join(d, 'v.txt');
  fs.writeFileSync(victim, '');
  const link = path.join(d, 'lnk.jsonl');
  fs.symlinkSync(victim, link);
  assert.strictEqual(safeAppend(link, 'evil\n'), false);
  assert.strictEqual(fs.readFileSync(victim, 'utf8'), '');
});

test('readJson returns parsed object or fallback, never throws', () => {
  const d = tmpdir();
  const good = path.join(d, 'good.json');
  fs.writeFileSync(good, '{"a":1}');
  assert.deepStrictEqual(readJson(good, null), { a: 1 });
  const bad = path.join(d, 'bad.json');
  fs.writeFileSync(bad, '{corrupt!!');
  assert.deepStrictEqual(readJson(bad, { fb: true }), { fb: true });
  assert.strictEqual(readJson(path.join(d, 'missing.json'), 42), 42);
});

test('safeMkdir creates nested dirs, refuses symlinked target', () => {
  const d = tmpdir();
  assert.strictEqual(safeMkdir(path.join(d, 'x', 'y')), true);
  assert.ok(fs.statSync(path.join(d, 'x', 'y')).isDirectory());
  const real = path.join(d, 'real2');
  fs.mkdirSync(real);
  const lnk = path.join(d, 'lnk2');
  fs.symlinkSync(real, lnk);
  assert.strictEqual(safeMkdir(lnk), false);
});

const { sanitize } = require('../scripts/lib/hud');

test('sanitize strips ESC/C0/C1 control chars', () => {
  assert.strictEqual(sanitize('a\x1b[31mred\x1b[0mb'), 'a[31mred[0mb');
  assert.strictEqual(sanitize('x\x00\x07\x9by'), 'xy');
  assert.strictEqual(sanitize('tab\tnewline\n'), 'tabnewline');
});

test('sanitize preserves emoji and CJK', () => {
  assert.strictEqual(sanitize('⚔️ 错虫王 🔥'), '⚔️ 错虫王 🔥');
});

test('sanitize truncates by code point with ellipsis', () => {
  assert.strictEqual(sanitize('abcdef', 3), 'abc…');
  assert.strictEqual(sanitize('错虫王九头蛇', 4), '错虫王九…');
});

test('sanitize handles null/undefined', () => {
  assert.strictEqual(sanitize(null), '');
  assert.strictEqual(sanitize(undefined), '');
});

test('readEvents skips corrupt JSONL lines instead of throwing', () => {
  const d = tmpdir();
  process.env.SLIME_ROOT = d;
  delete require.cache[require.resolve('../scripts/lib/state')];
  try {
    const state = require('../scripts/lib/state');
    fs.mkdirSync(path.join(d, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(d, 'sessions', 's1.jsonl'),
      '{"t":1,"kind":"cast"}\n{CORRUPT\n{"t":2,"kind":"resolve"}\n');
    const evs = state.readEvents('s1');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[1].t, 2);
  } finally {
    delete process.env.SLIME_ROOT;
    delete require.cache[require.resolve('../scripts/lib/state')];
  }
});

test('literal-null JSON files do not crash locale/usage', () => {
  const d = tmpdir();
  process.env.SLIME_ROOT = d;
  for (const m of ['state', 'locale', 'usage', 'safe-io']) {
    delete require.cache[require.resolve(`../scripts/lib/${m}`)];
  }
  try {
    fs.writeFileSync(path.join(d, 'config.json'), 'null');
    fs.writeFileSync(path.join(d, 'usage.json'), 'null');
    const locale = require('../scripts/lib/locale');
    const usage = require('../scripts/lib/usage');
    assert.doesNotThrow(() => locale.current());
    const cache = usage.readCache();
    assert.ok(cache && typeof cache === 'object');
    assert.doesNotThrow(() => usage.cacheFromStatusline({ rate_limits: {} }));
  } finally {
    delete process.env.SLIME_ROOT;
    for (const m of ['state', 'locale', 'usage', 'safe-io']) {
      delete require.cache[require.resolve(`../scripts/lib/${m}`)];
    }
  }
});
