#!/usr/bin/env node
const boss = require('../core/boss');
const state = require('../core/state');
const report = require('../core/report');
const fs = require('node:fs');
const defeatFlow = require('../core/defeat-flow');

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
  if (sid) {
    state.appendEvent(sid, { t: Date.now(), kind: 'boss_down', boss: b.name, text: `⚡⚡⚡ ${b.name} — DEFEATED ⚡⚡⚡` });
    defeatFlow.emitRewards(sid, r, lang);
  }
  const out = [
    `⚡⚡⚡ ${b.name} — DEFEATED ⚡⚡⚡`,
    `Recorded on the Milestone Wall (${r.total} total).`,
    ...defeatFlow.rewardLines(r, lang), // same source as the arena events — can't drift
  ];
  out.push(`💡 Sage: quest complete — strike camp (/clear) before the next hunt.`);
  console.log(out.join('\n'));
} catch (e) {
  console.log('The killing blow glanced off. (' + (e instanceof Error ? e.message : String(e)) + ')');
}
process.exit(0);
