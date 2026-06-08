const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const badges = require('../data/badges.json');
const read = (lang) => JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'data', 'locales', `${lang}.json`), 'utf8'));

test('badges.json: ids unique, shape valid', () => {
  const ids = badges.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate badge id');
  for (const b of badges) {
    assert.ok(b.id && b.nameKey && b.stat, `badge missing field: ${JSON.stringify(b)}`);
    assert.equal(typeof b.gte, 'number');
  }
});

test('every badge nameKey resolves in en and zh', () => {
  const en = read('en');
  const zh = read('zh');
  for (const b of badges) {
    assert.ok(en[b.nameKey], `en missing ${b.nameKey}`);
    assert.ok(zh[b.nameKey], `zh missing ${b.nameKey}`);
  }
});

test('badge.unlocked + ach.* keys exist in both catalogs', () => {
  const en = read('en');
  const zh = read('zh');
  for (const k of ['badge.unlocked', 'ach.title', 'ach.level', 'ach.badgesHeader', 'ach.locked']) {
    assert.ok(en[k], `en missing ${k}`);
    assert.ok(zh[k], `zh missing ${k}`);
  }
});
