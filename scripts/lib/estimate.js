'use strict';
// Gamified token-cost heuristic. NOT a real estimator — a threat assessment
// for the arena. No LLM calls (observer principle).
function estimateTokens(text) {
  const s = String(text || '');
  const steps = (s.match(/^\s*(?:[-*]|\d+[.)])\s+/gm) || []).length;
  const est = 25000 + steps * 30000 + s.length * 3;
  return Math.max(20000, Math.min(900000, est));
}
function fmtTokens(n) {
  return `≈${Math.round(n / 10000) * 10}k`;
}
module.exports = { estimateTokens, fmtTokens };
