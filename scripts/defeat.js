#!/usr/bin/env node
const state = require('./lib/state');
const boss = require('./lib/boss');
const fs = require('node:fs');

const cwd = process.argv[2] || process.cwd();
try {
  if (!fs.existsSync(boss.bossPath(cwd))) {
    console.log('No boss is engaged in this realm. Start a quest first.');
    process.exit(0);
  }
  const b = boss.loadOrCreate(cwd, '');
  const prof = state.readProfile();
  prof.milestones.push({
    boss: b.name, date: new Date().toISOString().slice(0, 10),
    turns: b.turns || 0, project: cwd,
  });
  state.writeProfile(prof);
  boss.clear(cwd);
  const sid = state.newestSessionId();
  if (sid) state.appendEvent(sid, { t: Date.now(), kind: 'boss_down', boss: b.name, text: `⚡⚡⚡ ${b.name} — DEFEATED ⚡⚡⚡` });
  console.log([
    `⚡⚡⚡ ${b.name} — DEFEATED ⚡⚡⚡`,
    `Recorded on the Milestone Wall (${prof.milestones.length} total).`,
    `💡 Sage: quest complete — strike camp (/clear) before the next hunt.`,
  ].join('\n'));
} catch (e) {
  console.log('The killing blow glanced off. (' + (e instanceof Error ? e.message : String(e)) + ')');
}
process.exit(0);
