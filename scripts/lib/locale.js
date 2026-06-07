/** @typedef {import('./types').Profile} Profile */
/** @typedef {import('./types').LocaleCatalog} LocaleCatalog */
const path = require('node:path');
const state = require('./state');
const { readJson } = require('./safe-io');

const CATALOG_DIR = path.join(__dirname, '..', '..', 'data', 'locales');
/** @type {Record<string, LocaleCatalog>} */
const cache = {};

/** @param {string | null | undefined} prompt @returns {'zh' | 'en' | null} */
function classify(prompt) {
  const s = String(prompt || '');
  let cjk = 0, letters = 0;
  for (const ch of s) {
    if (/[一-鿿㐀-䶿]/.test(ch)) { cjk++; letters++; }
    else if (/[a-zA-Z]/.test(ch)) letters++;
  }
  if (!letters) return null;
  return cjk / letters > 0.3 ? 'zh' : 'en';
}

/** @param {string | null | undefined} prompt @returns {void} */
function tally(prompt) {            // called by hook-prompt
  const lang = classify(prompt);
  if (!lang) return;
  const prof = state.readProfile();
  prof.langStats = prof.langStats || {};
  prof.langStats[lang] = (prof.langStats[lang] || 0) + 1;
  state.writeProfile(prof);
}

function current() {                // config override > majority > 'en'
  // `|| {}`: a file containing literal `null` parses successfully — fallback won't fire
  const cfg = /** @type {{ lang?: string }} */ (readJson(path.join(state.ROOT, 'config.json'), {}) || {});
  if (cfg.lang) return cfg.lang;
  try {
    const stats = state.readProfile().langStats || {};
    const top = Object.entries(stats).sort((a, b) => b[1] - a[1])[0];
    if (top) return top[0];
  } catch {}
  return 'en';
}

/** @param {string} lang @returns {LocaleCatalog} */
function catalog(lang) {
  if (!cache[lang]) {
    cache[lang] = readJson(path.join(CATALOG_DIR, `${lang}.json`), /** @type {LocaleCatalog} */ ({}));
  }
  return cache[lang];
}

/** @param {string} key @param {string} [lang] @returns {string} */
function t(key, lang) {
  const l = lang || current();
  const val = catalog(l)[key] ?? catalog('en')[key] ?? key;
  return String(val);
}

/** @param {string} tpl @param {Record<string, unknown>} [vars] @returns {string} */
function fmt(tpl, vars = {}) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => String(vars[k] ?? m));
}

module.exports = { classify, tally, current, t, catalog, fmt };
