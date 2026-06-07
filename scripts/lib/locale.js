const fs = require('node:fs');
const path = require('node:path');
const state = require('./state');

const CATALOG_DIR = path.join(__dirname, '..', '..', 'data', 'locales');
const cache = {};

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

function tally(prompt) {            // called by hook-prompt
  const lang = classify(prompt);
  if (!lang) return;
  const prof = state.readProfile();
  prof.langStats = prof.langStats || {};
  prof.langStats[lang] = (prof.langStats[lang] || 0) + 1;
  state.writeProfile(prof);
}

function current() {                // config override > majority > 'en'
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(state.ROOT, 'config.json'), 'utf8'));
    if (cfg.lang) return cfg.lang;
  } catch {}
  try {
    const stats = state.readProfile().langStats || {};
    const top = Object.entries(stats).sort((a, b) => b[1] - a[1])[0];
    if (top) return top[0];
  } catch {}
  return 'en';
}

function catalog(lang) {
  if (!cache[lang]) {
    try { cache[lang] = JSON.parse(fs.readFileSync(path.join(CATALOG_DIR, `${lang}.json`), 'utf8')); }
    catch { cache[lang] = {}; }
  }
  return cache[lang];
}

function t(key, lang) {
  const l = lang || current();
  return catalog(l)[key] ?? catalog('en')[key] ?? key;
}

function fmt(tpl, vars = {}) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}

module.exports = { classify, tally, current, t, catalog, fmt };
