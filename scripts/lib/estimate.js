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
  const est = 25000 + steps * 30000 + ascii * 3 + cjk * 9;
  return Math.max(20000, Math.min(900000, est));
}
/** @param {number} n @returns {string} */
function fmtTokens(n) {
  return `≈${Math.round(n / 10000) * 10}k`;
}
module.exports = { estimateTokens, fmtTokens };
