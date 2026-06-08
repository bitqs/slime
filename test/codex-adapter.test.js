const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const adapter = require('../adapters/codex/adapter');

const fixture = (name) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'adapters', 'codex', 'fixtures', name),
  'utf8',
));

test('codex adapter normalizes hook payloads', () => {
  const ctx = adapter.parseHookEvent(fixture('post-tool-write.json'), 'PostToolUse');
  assert.deepEqual(ctx, {
    event: 'post_tool',
    sessionId: 'codex-fixture-1',
    cwd: '/tmp/slime-codex',
    prompt: undefined,
    tool: 'Edit',
    toolInput: {
      file_path: '/tmp/slime-codex/app.js',
      new_string: "console.log('slime');\n",
    },
    toolResponse: { is_error: false },
    source: undefined,
  });
});

test('codex adapter tolerates camelCase aliases', () => {
  const ctx = adapter.parseHookEvent({
    sessionId: 'camel-1',
    workspaceRoot: '/tmp/camel',
    userPrompt: 'ship it',
    toolName: 'Write',
    toolInput: { content: 'ok' },
    toolResponse: { ok: true },
  }, 'pre_tool');
  assert.equal(ctx.sessionId, 'camel-1');
  assert.equal(ctx.event, 'pre_tool');
  assert.equal(ctx.cwd, '/tmp/camel');
  assert.equal(ctx.prompt, 'ship it');
  assert.equal(ctx.tool, 'Write');
  assert.deepEqual(ctx.toolInput, { content: 'ok' });
});

test('codex adapter rejects unknown events and missing sessions', () => {
  assert.equal(adapter.parseHookEvent({ session_id: 'x' }, 'MadeUp'), null);
  assert.equal(adapter.parseHookEvent({ tool_name: 'Edit' }, 'PostToolUse'), null);
});

test('codex adapter normalizes statusline-like payloads', () => {
  const ctx = adapter.parseStatusline(fixture('statusline.json'));
  assert.equal(ctx.sessionId, 'codex-fixture-1');
  assert.equal(ctx.model, 'GPT-5');
  assert.equal(ctx.contextPct, 42);
  assert.equal(ctx.costUsd, 0.25);
  assert.deepEqual(ctx.rateLimits.fiveHour, { used: 33, resetsAt: 1780810000 });
});

test('codex harness defaults state under the Codex config dir', () => {
  const root = execFileSync('node', ['-e', "process.stdout.write(require('./core/state').ROOT)"], {
    cwd: path.join(__dirname, '..'),
    env: {
      PATH: process.env.PATH,
      HOME: '/tmp/home',
      SLIME_HARNESS: 'codex',
      CODEX_CONFIG_DIR: '/tmp/codex-config',
    },
  }).toString();
  assert.equal(root, '/tmp/codex-config/slime');
});

test('codex dispatch routes normalized events into existing hooks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-codex-dispatch-'));
  try {
    execFileSync('node', ['scripts/dispatch.js', '--harness', 'codex', '--event', 'PostToolUse'], {
      cwd: path.join(__dirname, '..'),
      input: JSON.stringify(fixture('post-tool-write.json')),
      env: { ...process.env, SLIME_ROOT: root, SLIME_HARNESS: 'codex' },
    });
    const snap = JSON.parse(fs.readFileSync(path.join(root, 'sessions', 'codex-fixture-1.json'), 'utf8'));
    assert.equal(snap.dmg, 2);
    assert.equal(snap.combo, 1);
    const events = fs.readFileSync(path.join(root, 'sessions', 'codex-fixture-1.jsonl'), 'utf8');
    assert.match(events, /"kind":"resolve"/);
    assert.match(events, /"tool":"Edit"/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('codex dispatch stop event emits light HUD arena hint', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-codex-stop-'));
  try {
    const out = execFileSync('node', ['scripts/dispatch.js', '--harness', 'codex', '--event', 'Stop'], {
      cwd: path.join(__dirname, '..'),
      input: JSON.stringify({
        session_id: 'codex-stop-1',
        cwd: '/tmp/slime-codex-stop',
      }),
      env: {
        ...process.env,
        SLIME_ROOT: root,
        SLIME_HARNESS: 'codex',
        SLIME_ARENA_MARKER: path.join(root, 'missing-arena.json'),
      },
    }).toString();
    const msg = JSON.parse(out);
    assert.match(msg.systemMessage, /TURN #/);
    assert.match(msg.systemMessage, /Pixel Arena/);
    assert.match(msg.systemMessage, /\/slime:arena/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
