'use strict';
const state = require('./state');
const locale = require('./locale');
const progression = require('./progression');

/** Emit the post-defeat reward events (level_up if crossed, one badge_unlocked
 *  per newly-earned badge) to a session. Shared by the Stop hook, /defeat, and
 *  the auto-down-on-break path so the event shape stays in one place.
 *  @param {string} sid session id @param {{leveledUp:boolean,level:number,titleKey:string,newBadges:string[]}} r recordDefeat result @param {string} lang @returns {void} */
function emitRewards(sid, r, lang) {
  if (!sid || !r) return;
  if (r.leveledUp) {
    state.appendEvent(sid, { t: Date.now(), kind: 'level_up',
      text: locale.fmt(locale.t('boss.levelup', lang), { level: r.level, title: locale.t(r.titleKey, lang) }) });
  }
  for (const bid of (r.newBadges || [])) {
    state.appendEvent(sid, { t: Date.now(), kind: 'badge_unlocked', badge: bid,
      text: locale.fmt(locale.t('badge.unlocked', lang), { name: locale.t(progression.nameKeyFor(bid) || bid, lang) }) });
  }
}

module.exports = { emitRewards };
