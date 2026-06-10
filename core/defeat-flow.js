'use strict';
const state = require('./state');
const locale = require('./locale');
const progression = require('./progression');

/** @param {{level:number,titleKey:string}} r @param {string} lang @returns {string} */
function levelupText(r, lang) {
  return locale.fmt(locale.t('boss.levelup', lang), { level: r.level, title: locale.t(r.titleKey, lang) });
}
/** @param {string} bid @param {string} lang @returns {string} */
function badgeText(bid, lang) {
  return locale.fmt(locale.t('badge.unlocked', lang), { name: locale.t(progression.nameKeyFor(bid) || bid, lang) });
}
/** @param {string} qid quest kind/id @param {string} lang @returns {string} */
function questText(qid, lang) {
  const def = progression.QUEST_DEFS.find((d) => d.kind === qid);
  return locale.fmt(locale.t('quest.done', lang), { name: locale.t(def ? def.nameKey : qid, lang) });
}
/** Human-readable reward lines (levelup, then one per new badge, then one per quest) for a
 *  recordDefeat result. Single source so the /defeat console output and the
 *  arena event text can never drift.
 *  @param {{leveledUp:boolean,level:number,titleKey:string,newBadges:string[],newQuests?:string[]}} r @param {string} lang @returns {string[]} */
function rewardLines(r, lang) {
  const out = [];
  if (r && r.leveledUp) out.push(levelupText(r, lang));
  for (const bid of (r && r.newBadges) || []) out.push(badgeText(bid, lang));
  for (const qid of (r && r.newQuests) || []) out.push(questText(qid, lang));
  return out;
}

/** Emit the post-defeat reward events (level_up if crossed, one badge_unlocked
 *  per newly-earned badge, one quest_done per completed quest) to a session.
 *  Shared by the Stop hook, /defeat, and the auto-down-on-break path so the
 *  event shape stays in one place.
 *  @param {string} sid session id @param {{leveledUp:boolean,level:number,titleKey:string,newBadges:string[],newQuests?:string[]}} r recordDefeat result @param {string} lang @returns {void} */
function emitRewards(sid, r, lang) {
  if (!sid || !r) return;
  if (r.leveledUp) {
    state.appendEvent(sid, { t: Date.now(), kind: 'level_up', text: levelupText(r, lang) });
  }
  for (const bid of (r.newBadges || [])) {
    state.appendEvent(sid, { t: Date.now(), kind: 'badge_unlocked', badge: bid, text: badgeText(bid, lang) });
  }
  emitQuests(sid, r.newQuests || [], lang);
}

/** Emit one `quest_done` event per completed quest id. Shared by the defeat
 *  path (via emitRewards) and the per-turn activity tick in hook-stop.
 *  @param {string} sid @param {string[]} ids @param {string} lang @returns {void} */
function emitQuests(sid, ids, lang) {
  if (!sid) return;
  for (const qid of (ids || [])) {
    state.appendEvent(sid, { t: Date.now(), kind: 'quest_done', quest: qid, text: questText(qid, lang) });
  }
}

module.exports = { emitRewards, rewardLines, emitQuests, levelupText };
