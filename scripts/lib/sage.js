// One line max per turn report. Priority order: rest > potion > pacing.
function advise({ usage = {}, bossHp = null, lang } = {}) {
  const locale = require('./locale');
  const l = lang || locale.current();
  const T = (key) => locale.t(key, l);
  const used = usage.fiveHour && usage.fiveHour.used;
  if (used != null && used >= 95) {
    return T('sage.rest');
  }
  if (usage.contextPct != null && usage.contextPct >= 80) {
    return T('sage.potion');
  }
  if (used != null && used >= 50 && bossHp != null && bossHp >= 80) {
    return T('sage.pacing');
  }
  return null;
}

module.exports = { advise };
