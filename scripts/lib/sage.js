// One line max per turn report. Priority order: rest > potion > pacing.
function advise({ usage = {}, bossHp = null } = {}) {
  const used = usage.fiveHour && usage.fiveHour.used;
  if (used != null && used >= 95) {
    return '💡 Sage: 🛌 your HP is nearly spent — rest, the window restores it.';
  }
  if (usage.contextPct != null && usage.contextPct >= 80) {
    return '💡 Sage: mana runs low — a potion (/compact) or strike camp (/clear).';
  }
  if (used != null && used >= 50 && bossHp != null && bossHp >= 80) {
    return '💡 Sage: half your HP gone, the boss barely scratched — slow your pace, sharpen each strike.';
  }
  return null;
}

module.exports = { advise };
