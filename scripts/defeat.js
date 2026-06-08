#!/usr/bin/env node
const boss = require('../core/boss');
const state = require('../core/state');
const fs = require('node:fs');

const cwd = process.argv[2] || process.cwd();
try {
  if (!fs.existsSync(boss.bossPath(cwd))) {
    console.log('No boss is engaged in this realm. Start a quest first.');
    process.exit(0);
  }
  const b = boss.loadOrCreate(cwd, '');
  const total = boss.recordDefeat(cwd, b);
  const sid = state.newestSessionId();
  if (sid) state.appendEvent(sid, { t: Date.now(), kind: 'boss_down', boss: b.name, text: `⚡⚡⚡ ${b.name} — DEFEATED ⚡⚡⚡` });
  console.log([
    `⚡⚡⚡ ${b.name} — DEFEATED ⚡⚡⚡`,
    `Recorded on the Milestone Wall (${total} total).`,
    `💡 Sage: quest complete — strike camp (/clear) before the next hunt.`,
  ].join('\n'));
} catch (e) {
  console.log('The killing blow glanced off. (' + (e instanceof Error ? e.message : String(e)) + ')');
}
process.exit(0);
