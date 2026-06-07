const { bar } = require('./report');

function render(snap, stdinJson, tips, now) {
  if (!snap) return '⚔️ Questline — awaiting first encounter';
  const idleMs = now - (snap.updated || 0);

  if (snap.inTurn && idleMs > 20000 && tips.length) {
    return tips[Math.floor(now / 20000) % tips.length];
  }

  if (!snap.inTurn) return snap.lastText || '⚔️ Questline — your turn, commander';

  const parts = [];
  if (snap.boss) parts.push(`🗡️ ${snap.boss.name} ${bar(snap.boss.hp)} ${snap.boss.hp}%`);
  if (snap.combo > 1) parts.push(`🔥combo×${snap.combo}`);
  if (snap.summons > 0) parts.push(`🐺×${snap.summons}`);
  parts.push(`💀${snap.kills || 0} ⚔️${snap.dmg || 0}`);
  const cost = stdinJson && stdinJson.cost && stdinJson.cost.total_cost_usd;
  if (cost) parts.push(`💰$${cost.toFixed(2)}`);
  if (snap.lastText) parts.push(snap.lastText);
  return parts.join(' | ');
}

module.exports = { render };
