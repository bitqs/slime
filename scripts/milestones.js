#!/usr/bin/env node
const state = require('../core/state');
try {
  const prof = state.readProfile();
  const lines = ['🏛️  MILESTONE WALL', ''];
  if (!prof.milestones.length) lines.push('No bosses defeated yet. The wall awaits.');
  for (const m of prof.milestones) {
    const extra = [];
    if (m.dmg) extra.push(`${m.dmg} dmg`);
    if (m.kills) extra.push(`${m.kills} kills`);
    if (m.maxCombo) extra.push(`🔥×${m.maxCombo}`);
    const tail = extra.length ? `  [${extra.join(', ')}]` : '';
    lines.push(`${m.date}  💀 ${m.boss}  (${m.turns} turns)${tail}  — ${m.project}`);
  }
  lines.push('', `Career: ${prof.totals.turns} turns, ${prof.totals.dmg} dmg, ${prof.totals.kills} kills`);
  console.log(lines.join('\n'));
} catch (e) { console.log('The wall is unreadable: ' + (e instanceof Error ? e.message : String(e))); }
process.exit(0);
