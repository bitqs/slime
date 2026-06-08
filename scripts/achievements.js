#!/usr/bin/env node
/** @typedef {import('../core/types').Profile} Profile */
const state = require('../core/state');
const locale = require('../core/locale');
const prog = require('../core/progression');

/** Render the achievements screen: level/title line + badge grid (owned vs locked).
 *  Pure given (profile, lang). @param {Profile} profile @param {string} lang @returns {string} */
function render(profile, lang) {
  const lv = prog.levelFor(profile.xp || 0);
  const owned = new Set((profile.badges || []).map((b) => b.id));
  const lines = [locale.t('ach.title', lang), ''];
  lines.push(locale.fmt(locale.t('ach.level', lang), {
    level: lv.level,
    title: locale.t(lv.titleKey, lang),
    into: lv.intoLevel,
    span: lv.span,
  }));
  lines.push('');
  lines.push(locale.fmt(locale.t('ach.badgesHeader', lang), { owned: owned.size, total: prog.BADGES.length }));
  for (const d of prog.BADGES) {
    const name = locale.t(d.nameKey, lang);
    if (owned.has(d.id)) lines.push(`  ✅ ${name}`);
    else lines.push(`  🔒 ${name}  (${locale.t('ach.locked', lang)})`);
  }
  lines.push('');
  lines.push(locale.t('ach.questsHeader', lang));
  for (const def of prog.QUEST_DEFS) {
    const q = (profile.quests || []).find((x) => x.kind === def.kind && !x.doneAt);
    lines.push(locale.fmt(locale.t('ach.questLine', lang), {
      name: locale.t(def.nameKey, lang),
      progress: q ? q.progress : 0,
      target: q ? q.target : def.target,
    }));
  }
  return lines.join('\n');
}

module.exports = { render };

if (require.main === module) {
  try {
    const prof = state.readProfile();
    console.log(render(prof, locale.current()));
  } catch (e) {
    console.log('The hall of fame is sealed: ' + (e instanceof Error ? e.message : String(e)));
  }
  process.exit(0);
}
