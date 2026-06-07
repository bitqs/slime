const { bar } = require('./report');
const usage = require('./usage');

function render(snap, stdinJson, tips, now, usageCache, lang) {
  const locale = require('./locale');
  const l = lang || locale.current();
  const T = (key, vars) => locale.fmt(locale.t(key, l), vars);
  const hpVal = usage.hp(usageCache);
  if (hpVal === 0) {
    const t = usage.restTime(usageCache);
    return t ? T('hud.restAt', { time: t }) : T('hud.restSoon');
  }
  if (!snap) return T('hud.idle');
  const idleMs = now - (snap.updated || 0);

  if (snap.inTurn && idleMs > 20000 && tips.length) {
    return tips[Math.floor(now / 20000) % tips.length];
  }

  if (!snap.inTurn) return snap.lastText || T('hud.yourTurn');

  const parts = [];
  if (hpVal != null) parts.push(`⚡HP ${hpVal}%`);
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
