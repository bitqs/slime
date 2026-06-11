const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SLIME_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-'));
const boss = require('../core/boss');
const state = require('../core/state');

test('nameBoss: epithet + compressed base + type, deterministic per prompt', () => {
  const a = boss.nameBoss('fix the login crash', '/p/slime');
  assert.match(a, /^The [A-Za-z-]+ Slime Glitch Slime$/);
  assert.equal(boss.nameBoss('fix the login crash', '/p/slime'), a); // deterministic
  assert.match(boss.nameBoss('refactor auth', '/p/my-survivor-game'), /^The [A-Za-z-]+ MSG Forge Slime$/);
  assert.match(boss.nameBoss('whatever else', '/p/web'), /^The [A-Za-z-]+ Web Rock Slime$/);
});

test('boss store persists per cwd', () => {
  const b = boss.loadOrCreate('/p/web', 'add dark mode');
  assert.match(b.name, /^The [A-Za-z-]+ Web Hydra Slime$/);
  b.hp = 40;
  boss.save('/p/web', b);
  assert.equal(boss.loadOrCreate('/p/web', 'ignored').hp, 40);
});

test('nameBoss zh: 「形容词・base」slime-form type', () => {
  assert.match(boss.nameBoss('修复登录bug', '/p/web', 'zh'), /^「.+・Web」错虫史莱姆$/);
  assert.match(boss.nameBoss('重构认证模块', '/p/2d-three-kindom', 'zh'), /^「.+・2TK」重构史莱姆$/);
  assert.match(boss.nameBoss('随便什么', '/p/web', 'zh'), /^「.+・Web」岩石史莱姆$/);
});

test('nameBoss: different prompts of same type can draw different epithets', () => {
  const names = new Set(['a', 'fix b', 'fix cc', 'fix ddd', 'fix eeee', 'fix one more', 'fix again', 'fix x']
    .map((p) => boss.nameBoss('fix ' + p, '/p/web')));
  assert.ok(names.size > 1);
});

test('compressName: multi-word → initials with digits; single word kept or truncated', () => {
  assert.equal(boss.compressName('/p/my-survivor-game'), 'MSG');
  assert.equal(boss.compressName('/p/2d-three-kindom'), '2TK');
  assert.equal(boss.compressName('/p/slime'), 'Slime');
  assert.equal(boss.compressName('/p/supercalifragilistic'), 'Supercal');
  assert.equal(boss.compressName(''), 'Unknown');
});

test('loadOrCreate with no lang arg defaults to locale.current()', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'slime-locale-'));
  // Set locale to 'zh' via config.json
  fs.mkdirSync(path.join(tmpRoot, 'bosses'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'config.json'), JSON.stringify({ lang: 'zh' }));

  const stateModule = require('../core/state');
  const origRoot = stateModule.ROOT;

  try {
    // Monkeypatch state.ROOT for this test
    Object.defineProperty(stateModule, 'ROOT', { value: tmpRoot, configurable: true });

    // Now load the boss module fresh with the new ROOT
    delete require.cache[require.resolve('../core/boss')];
    delete require.cache[require.resolve('../core/locale')];
    const freshBoss = require('../core/boss');

    const b = freshBoss.loadOrCreate('/p/freshzh', '修复崩溃');
    assert.match(b.name, /史莱姆$/, `Expected zh slime name, got: ${b.name}`);
  } finally {
    // Restore state.ROOT
    Object.defineProperty(stateModule, 'ROOT', { value: origRoot, configurable: true });
    delete require.cache[require.resolve('../core/boss')];
    delete require.cache[require.resolve('../core/locale')];

    // Cleanup
    fs.rmSync(tmpRoot, { recursive: true });
  }
});

test('minionLabel: compressed base + numbered mob, per lang', () => {
  assert.equal(boss.minionLabel('/p/my-survivor-game', 0, 'en'), 'MSG mob 1');
  assert.equal(boss.minionLabel('/p/my-survivor-game', 2, 'zh'), 'MSG·小兵 3');
});

test('recordDefeat: milestone pushed, boss file cleared, count returned', () => {
  const b = boss.loadOrCreate('/p/defeatme', 'fix it');
  boss.save('/p/defeatme', b);
  const r = boss.recordDefeat('/p/defeatme', b);
  assert.ok(r.total >= 1);
  assert.equal(fs.existsSync(boss.bossPath('/p/defeatme')), false);
  const state = require('../core/state');
  const prof = state.readProfile();
  assert.equal(prof.milestones[prof.milestones.length - 1].boss, b.name);
});

test('recordDefeat: captures at + fight stats from the stats arg', () => {
  const state = require('../core/state');
  const b = boss.loadOrCreate('/p/stats', 'do work');
  b.turns = 4; b.dmgTaken = 30;
  const before = Date.now();
  boss.recordDefeat('/p/stats', b, { dmg: 42, kills: 3, maxCombo: 7 });
  const prof = state.readProfile();
  const m = prof.milestones[prof.milestones.length - 1];
  assert.equal(m.dmg, 42);
  assert.equal(m.kills, 3);
  assert.equal(m.maxCombo, 7);
  assert.ok(typeof m.at === 'number' && m.at >= before);
});

test('recordDefeat: stats optional — dmg falls back to boss.dmgTaken, others to 0', () => {
  const state = require('../core/state');
  const b = boss.loadOrCreate('/p/nostats', 'do work');
  b.dmgTaken = 15;
  boss.recordDefeat('/p/nostats', b);
  const prof = state.readProfile();
  const m = prof.milestones[prof.milestones.length - 1];
  assert.equal(m.dmg, 15);
  assert.equal(m.kills, 0);
  assert.equal(m.maxCombo, 0);
});

test('recordDefeat: unlocks first-blood on the first kill and returns it', () => {
  // Reset badges so this test starts from a clean slate (prior tests may have earned them)
  const pReset = state.readProfile(); pReset.badges = []; state.writeProfile(pReset);
  const b = boss.loadOrCreate('/p/badge1', 'do work');
  const r = boss.recordDefeat('/p/badge1', b, { dmg: 5, kills: 1, maxCombo: 2 });
  assert.ok(Array.isArray(r.newBadges));
  assert.ok(r.newBadges.includes('first-blood'));
  const prof = state.readProfile();
  assert.ok((prof.badges || []).some((x) => x.id === 'first-blood'));
  assert.ok(prof.badges.find((x) => x.id === 'first-blood').unlockedAt > 0);
});

test('recordDefeat: badge unlock is idempotent — not re-awarded next kill', () => {
  const b1 = boss.loadOrCreate('/p/badge2', 'do work');
  boss.recordDefeat('/p/badge2', b1, { dmg: 1, kills: 0, maxCombo: 0 });
  const b2 = boss.loadOrCreate('/p/badge2', 'more work');
  const r2 = boss.recordDefeat('/p/badge2', b2, { dmg: 1, kills: 0, maxCombo: 0 });
  assert.ok(!r2.newBadges.includes('first-blood'), 'first-blood re-awarded');
  const prof = state.readProfile();
  assert.equal(prof.badges.filter((x) => x.id === 'first-blood').length, 1);
});

test('recordDefeat: combo-king unlocks when maxCombo ≥ 10', () => {
  const b = boss.loadOrCreate('/p/badge3', 'do work');
  const r = boss.recordDefeat('/p/badge3', b, { dmg: 0, kills: 0, maxCombo: 10 });
  assert.ok(r.newBadges.includes('combo-king'));
});

test('recordDefeat: returns xpGained covering kill + badge XP, and level reflects it', () => {
  const prog = require('../core/progression');
  const eggsMod = require('../core/eggs');
  // Reset badges, milestones, xp, prestige, and totals so exactly one badge
  // (first-blood) unlocks. Leave chestCount and eggs untouched so the test
  // exercises the live egg xpMult path and does not tamper shared file state.
  const pReset = state.readProfile();
  pReset.badges = []; pReset.milestones = []; pReset.xp = 0; pReset.prestige = 0;
  pReset.totals = { turns: 0, dmg: 0, kills: 0 };
  state.writeProfile(pReset);
  // Capture live profile AFTER legitimate setup writes, immediately before defeat.
  const prof0 = require('../core/state').readProfile();
  const fromLevel = prog.levelFor(prof0.xp || 0).level;
  const b = boss.loadOrCreate('/p/xpgain', 'do work');
  const r = boss.recordDefeat('/p/xpgain', b, { dmg: 42, kills: 1, maxCombo: 2 });
  const killXp = prog.xpForDefeat({ dmg: 42, kills: 1, maxCombo: 2 });
  // first kill from a clean-badge slate unlocks first-blood → +BADGE_XP
  assert.ok(r.newBadges.includes('first-blood'));
  const killPart = Math.round(killXp * prog.levelScale(fromLevel) * prog.prestigeMult(prof0) * eggsMod.xpMult(prof0));
  const chestPart = Math.round(r.chest.rewardXp * prog.prestigeMult(prof0) * eggsMod.xpMult(prof0));
  const badgePart = Math.round(prog.BADGE_XP * prog.prestigeMult(prof0));
  // evaluateQuests may complete a quest and pay XP; derive questPart from the
  // result so the assertion stays correct regardless of prior test state.
  const questPart = r.newQuests.reduce((sum, qid) => {
    const def = prog.QUEST_DEFS.find((d) => d.kind === qid);
    return sum + (def ? Math.round(def.xp * prog.prestigeMult(prof0)) : 0);
  }, 0);
  assert.equal(r.xpGained, killPart + chestPart + badgePart + questPart);
  const prof = state.readProfile();
  assert.equal(prof.xp, r.xpGained);
  assert.equal(prof.level, prog.levelFor(prof.xp).level);
  assert.equal(r.level, prof.level);
});

test('recordDefeat: opens a chest — tier follows the newbie sequence slot, counter advances', () => {
  const state = require('../core/state');
  const chest = require('../core/chest');
  const before = state.readProfile().chestCount || 0;
  const b = boss.loadOrCreate('/p/chest1', 'fix chest bug');
  b.dmgTaken = 5;
  const r = boss.recordDefeat('/p/chest1', b, { dmg: 5, kills: 0, maxCombo: 0 });
  assert.ok(r.chest, 'defeat result carries chest info');
  if (before < chest.NEWBIE_SEQ.length) {
    assert.equal(r.chest.tier, chest.NEWBIE_SEQ[before]); // scripted sweetener slot
  } else {
    assert.ok(['silver', 'gold', 'jackpot'].includes(r.chest.tier));
  }
  assert.ok(r.chest.rewardXp > 0);
  assert.equal(state.readProfile().chestCount, before + 1);
});

test('recordDefeat: newbie sequence pays gold + jackpot, jackpot guarantees an egg', () => {
  const state = require('../core/state');
  const chest = require('../core/chest');
  const tiers = [];
  // burn through the rest of the newbie window (wherever this file left it)
  while ((state.readProfile().chestCount || 0) < chest.NEWBIE_SEQ.length) {
    const i = state.readProfile().chestCount || 0;
    const eggsBefore = require('../core/eggs').total(state.readProfile());
    const b = boss.loadOrCreate('/p/seq' + i, 'fix seq');
    b.dmgTaken = 1;
    const r = boss.recordDefeat('/p/seq' + i, b, { dmg: 1 });
    tiers.push(r.chest.tier);
    if (r.chest.tier === 'jackpot') {
      assert.ok(r.chest.eggPerk, 'jackpot always carries an egg');
      assert.equal(require('../core/eggs').total(state.readProfile()), eggsBefore + 1);
    }
  }
  // the tail we just opened must match the scripted sequence
  const seqTail = chest.NEWBIE_SEQ.slice(chest.NEWBIE_SEQ.length - tiers.length);
  assert.deepEqual(tiers, seqTail);
});

test('recordDefeat: kill XP scales with the level at kill time', () => {
  const state = require('../core/state');
  const prog = require('../core/progression');
  const eggsMod = require('../core/eggs');
  const prof = state.readProfile();
  prof.xp = prog.xpToReach(10); // park the player at L10
  state.writeProfile(prof);
  const prof0 = state.readProfile(); // multipliers as of kill time
  const b = boss.loadOrCreate('/p/scale', 'fix scale');
  b.dmgTaken = 42;
  const r = boss.recordDefeat('/p/scale', b, { dmg: 42, kills: 0, maxCombo: 0 });
  const base = prog.xpForDefeat({ dmg: 42, kills: 0, maxCombo: 0 });
  const expectKill = Math.round(base * prog.levelScale(10) * prog.prestigeMult(prof0) * eggsMod.xpMult(prof0));
  // xpGained = scaled kill + chest reward (+ any badge/quest XP)
  assert.ok(r.xpGained >= expectKill, `xpGained ${r.xpGained} < scaled kill ${expectKill}`);
});
