const { test } = require('node:test');
const assert = require('node:assert');
const mapper = require('../core/mapper');

test('cast announces real tool name in brackets', () => {
  const ev = mapper.cast({ tool_name: 'Grep', tool_input: { pattern: 'authMiddleware' } }, 0);
  assert.equal(ev.kind, 'cast');
  assert.match(ev.text, /\[Grep\]/);
  assert.match(ev.text, /"authMiddleware"/);
});

test('cast verb comes from category pool, deterministic per (tool,count)', () => {
  const a = mapper.cast({ tool_name: 'Edit', tool_input: { file_path: '/x/auth.ts' } }, 1);
  const b = mapper.cast({ tool_name: 'Edit', tool_input: { file_path: '/x/auth.ts' } }, 1);
  assert.equal(a.text, b.text); // deterministic
  assert.match(a.text, /slashes|strikes|carves/i);
  assert.match(a.text, /auth\.ts/);
});

test('cast on Skill shows skill name', () => {
  const ev = mapper.cast({ tool_name: 'Skill', tool_input: { skill: 'superpowers:brainstorming' } }, 0);
  assert.match(ev.text, /superpowers:brainstorming/);
});

test('cast on unknown tool still works', () => {
  const ev = mapper.cast({ tool_name: 'mcp__github__create_pull_request', tool_input: {} }, 0);
  assert.match(ev.text, /\[mcp__github__create_pull_request\]/);
});

test('cast survives null payload and empty input', () => {
  const ev = mapper.cast(null, 0);
  assert.equal(ev.kind, 'cast');
  assert.match(ev.text, /\[Unknown\]/);
});

test('resolve Edit counts damage as changed lines and grows combo', () => {
  const ev = mapper.resolve(
    { tool_name: 'Edit', tool_input: { new_string: 'a\nb\nc' }, tool_response: {} },
    { combo: 2 }
  );
  assert.equal(ev.kind, 'resolve');
  assert.equal(ev.dmg, 3);
  assert.equal(ev.combo, 3);
  assert.match(ev.text, /3 dmg/);
  assert.match(ev.text, /combo×3/);
});

test('resolve Write counts content lines', () => {
  const ev = mapper.resolve(
    { tool_name: 'Write', tool_input: { content: 'x\ny' }, tool_response: {} },
    { combo: 0 }
  );
  assert.equal(ev.dmg, 2);
});

test('resolve test-passing Bash is a kill', () => {
  const ev = mapper.resolve(
    { tool_name: 'Bash', tool_input: { command: 'node --test test/' }, tool_response: {} },
    { combo: 0 }
  );
  assert.equal(ev.kill, true);
  assert.match(ev.text, /💀/);
});

test('codex exec_command maps to bash and test pass is a kill', () => {
  const ev = mapper.resolve(
    { tool_name: 'functions.exec_command', tool_input: { cmd: 'npm test' }, tool_response: {} },
    { combo: 0 }
  );
  assert.equal(mapper.category('functions.exec_command'), 'bash');
  assert.equal(ev.kill, true);
});

test('codex apply_patch maps to edit and counts patch changed lines', () => {
  const ev = mapper.resolve(
    { tool_name: 'functions.apply_patch', tool_input: { patch: '*** Begin Patch\n*** Update File: a.js\n@@\n-old\n+new\n+again\n*** End Patch' }, tool_response: {} },
    { combo: 1 }
  );
  assert.equal(mapper.category('functions.apply_patch'), 'edit');
  assert.equal(ev.dmg, 3);
  assert.equal(ev.combo, 2);
});

test('codex web.run maps to web and remains quiet success', () => {
  const ev = mapper.resolve(
    { tool_name: 'web.run', tool_input: { search_query: [{ q: 'slime' }] }, tool_response: {} },
    { combo: 5 }
  );
  assert.equal(mapper.category('web.run'), 'web');
  assert.equal(ev.dmg, undefined);
  assert.equal(ev.combo, 5);
});

test('resolve errored tool is a hit and breaks combo', () => {
  const ev = mapper.resolve(
    { tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { is_error: true } },
    { combo: 7 }
  );
  assert.equal(ev.hit, true);
  assert.equal(ev.kill, undefined);
  assert.equal(ev.combo, 0);
  assert.match(ev.text, /💥/);
});

test('resolve non-edit non-bash tool is quiet success', () => {
  const ev = mapper.resolve(
    { tool_name: 'Read', tool_input: {}, tool_response: {} },
    { combo: 4 }
  );
  assert.equal(ev.dmg, undefined);
  assert.equal(ev.combo, 4); // reads don't grow or break combo
});

test('zh cast uses zh verb pool, keeps real tool name', () => {
  const ev = mapper.cast({ tool_name: 'Edit', tool_input: { file_path: '/x/auth.ts' } }, 1, 'zh');
  assert.match(ev.text, /斩击|挥砍|雕琢/);
  assert.match(ev.text, /\[Edit\]/);
  assert.match(ev.text, /auth\.ts/);
  assert.doesNotMatch(ev.text, /with/);
});

test('zh resolve hit text localized', () => {
  const ev = mapper.resolve(
    { tool_name: 'Edit', tool_input: { new_string: 'a\nb' }, tool_response: {} },
    { combo: 0 }, 'zh'
  );
  assert.match(ev.text, /命中/);
  assert.match(ev.text, /连击×1/);
});

test('en cast without lang unchanged', () => {
  const ev = mapper.cast({ tool_name: 'Edit', tool_input: { file_path: '/x/a.ts' } }, 1);
  assert.match(ev.text, /Slashes|Strikes|Carves/);
  assert.match(ev.text, /with \[Edit\]/);
});
