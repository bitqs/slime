#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const state = require('./lib/state');
const hud = require('./lib/hud');
const usage = require('./lib/usage');
const locale = require('./lib/locale');
try {
  const stdin = state.readStdin() || {};
  usage.cacheFromStatusline(stdin);          // relay official fields to hooks
  const id = stdin.session_id;
  const snap = id ? state.readSnapshot(id) : null;
  const lang = locale.current();
  let tips = [];
  try {
    const tipsFile = lang !== 'en'
      ? path.join(__dirname, '..', 'data', `tips.${lang}.json`)
      : null;
    if (tipsFile) {
      try {
        tips = JSON.parse(fs.readFileSync(tipsFile, 'utf8'));
      } catch {
        tips = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tips.json'), 'utf8'));
      }
    } else {
      tips = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tips.json'), 'utf8'));
    }
  } catch {}
  process.stdout.write(hud.render(snap, stdin, tips, Date.now(), usage.readCache(), lang));
} catch {
  process.stdout.write('⚔️ Questline');
}
process.exit(0);
