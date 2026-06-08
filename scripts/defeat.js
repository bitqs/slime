#!/usr/bin/env node
const boss = require('../core/boss');
const state = require('../core/state');
const report = require('../core/report');
const fs = require('node:fs');

const cwd = process.argv[2] || process.cwd();
try {
  if (!fs.existsSync(boss.bossPath(cwd))) {
    console.log('No boss is engaged in this realm. Start a quest first.');
    process.exit(0);
  }
  const b = boss.loadOrCreate(cwd, '');
  const sid = state.newestSessionId();
  const agg = sid ? report.aggregate(state.readEvents(sid)) : { dmg: 0, kills: 0, maxCombo: 0 };
  const r = boss.recordDefeat(cwd, b, { dmg: agg.dmg, kills: agg.kills, maxCombo: agg.maxCombo });
  const locale = require('../core/locale');
  const lang = locale.current();
  const levelUp = r.leveledUp
    ? locale.fmt(locale.t('boss.levelup', lang), { level: r.level, title: locale.t(r.titleKey, lang) })
    : null;
  if (sid) {
    state.appendEvent(sid, { t: Date.now(), kind: 'boss_down', boss: b.name, text: `⚡⚡⚡ ${b.name} — DEFEATED ⚡⚡⚡` });
    if (levelUp) state.appendEvent(sid, { t: Date.now(), kind: 'level_up', text: levelUp });
  }
  const out = [
    `⚡⚡⚡ ${b.name} — DEFEATED ⚡⚡⚡`,
    `Recorded on the Milestone Wall (${r.total} total).`,
  ];
  if (levelUp) out.push(levelUp);
  out.push(`💡 Sage: quest complete — strike camp (/clear) before the next hunt.`);
  console.log(out.join('\n'));
} catch (e) {
  console.log('The killing blow glanced off. (' + (e instanceof Error ? e.message : String(e)) + ')');
}
process.exit(0);
