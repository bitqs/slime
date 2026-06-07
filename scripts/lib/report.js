function rank({ hits = 0, kills = 0 }) {
  if (hits === 0 && kills > 0) return 'S';
  if (hits <= 1) return 'A';
  if (hits <= 3) return 'B';
  return 'C';
}

function aggregate(events) {
  const lastEnd = events.map((e) => e.kind).lastIndexOf('turn_end');
  const turn = events.slice(lastEnd + 1);
  let combo = 0, maxCombo = 0;
  const a = { dmg: 0, kills: 0, hits: 0, casts: 0, maxCombo: 0 };
  for (const e of turn) {
    if (e.kind === 'cast') a.casts++;
    if (e.kind === 'resolve') {
      if (e.dmg) { a.dmg += e.dmg; combo++; maxCombo = Math.max(maxCombo, combo); }
      if (e.kill) a.kills++;
      if (e.hit) { a.hits++; combo = 0; }
    }
  }
  a.maxCombo = maxCombo;
  return a;
}

function bar(pct) {
  const full = Math.round(pct / 10);
  return '█'.repeat(full) + '░'.repeat(10 - full);
}

function render(agg, bossState, snap) {
  const r = rank(agg);
  const lines = [
    `━━━ TURN #${snap.turn || '?'} ━━━ Rank: ${r}`,
    bossState ? `🗡️ Boss: ${bossState.name}  ${bar(bossState.hp)} ${bossState.hp}% HP` : null,
    `⚔️ DMG ${agg.dmg} (lines changed) | 💀 Kills ${agg.kills} | 💥 Hits ${agg.hits} | 🔥 Max combo ×${agg.maxCombo}`,
  ].filter(Boolean);
  if (bossState && bossState.hp <= 20) {
    lines.push(`⚡ ${bossState.name} staggers — confirm the kill with /questline:defeat`);
  }
  return lines.join('\n');
}

module.exports = { rank, aggregate, render, bar };
