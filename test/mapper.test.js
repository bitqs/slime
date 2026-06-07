const { test } = require('node:test');
const assert = require('node:assert');
const mapper = require('../scripts/lib/mapper');

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
