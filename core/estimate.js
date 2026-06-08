'use strict';
// Gamified token-cost heuristic. NOT a real estimator — a threat assessment
// for the arena. No LLM calls (observer principle).
/** @param {unknown} text @returns {number} */
function estimateTokens(text) {
  const s = String(text || '');
  const steps = (s.match(/^\s*(?:[-*]|\d+[.)])\s+/gm) || []).length;
  let ascii = 0, cjk = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) || 0;
    // CJK unified + extensions A, compat ideographs, fullwidth punct range
    if ((cp >= 0x3000 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff)) cjk++;
    else ascii++;
  }
  // weight real content (chars) over list-formatting so a single bullet can't
  // vault a prompt into ELITE; bigger prose/CJK + more steps still escalate.
  const est = 15000 + steps * 12000 + ascii * 4 + cjk * 12;
  return Math.max(15000, Math.min(900000, est));
}
/** @param {number} n @returns {string} */
function fmtTokens(n) {
  return `≈${Math.round(n / 10000) * 10}k`;
}
/** Expected lines-changed budget for a quest, with bug-fix headroom.
 *  est tokens → lines: ~1 line per 450 est-tokens, ×1.3 margin, floor 40.
 *  @param {number | null | undefined} estTokens @returns {number} */
function estLines(estTokens) {
  const t = typeof estTokens === 'number' && estTokens > 0 ? estTokens : 25000;
  return Math.max(40, Math.round((t / 450) * 1.3));
}
module.exports = { estimateTokens, fmtTokens, estLines };
