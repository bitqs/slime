#!/usr/bin/env node
const path = require('node:path');
const state = require('./lib/state');
const hud = require('./lib/hud');
const usage = require('./lib/usage');
const locale = require('./lib/locale');
const arenaStatus = require('./lib/arena-status');
try {
  const stdin = state.readStdin() || {};
  usage.cacheFromStatusline(stdin);          // relay official fields to hooks
  const id = stdin.session_id;
  const snap = id ? state.readSnapshot(id) : null;
  const lang = locale.current();
  const { readJson } = require('./lib/safe-io');
  /** @type {string[]} */
  let tips = [];
  const fallbackTips = path.join(__dirname, '..', 'data', 'tips.json');
  if (lang !== 'en') {
    tips = readJson(path.join(__dirname, '..', 'data', `tips.${lang}.json`), null)
        || readJson(fallbackTips, []);
  } else {
    tips = readJson(fallbackTips, []);
  }
  if (!Array.isArray(tips)) tips = [];
  process.stdout.write(hud.render(snap, stdin, tips, Date.now(), usage.readCache(), lang, arenaStatus.readLive()));
} catch {
  process.stdout.write('🟢 Slime');
}
process.exit(0);
