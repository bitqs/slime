#!/usr/bin/env node
const state = require('./lib/state');
try {
  const prof = state.readProfile();
  const lines = ['🏛️  MILESTONE WALL', ''];
  if (!prof.milestones.length) lines.push('No bosses defeated yet. The wall awaits.');
  for (const m of prof.milestones) {
    lines.push(`${m.date}  💀 ${m.boss}  (${m.turns} turns)  — ${m.project}`);
  }
  lines.push('', `Career: ${prof.totals.turns} turns, ${prof.totals.dmg} dmg, ${prof.totals.kills} kills`);
  console.log(lines.join('\n'));
} catch (e) { console.log('The wall is unreadable: ' + (e instanceof Error ? e.message : String(e))); }
process.exit(0);
