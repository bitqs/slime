#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const state = require('./lib/state');
const hud = require('./lib/hud');
try {
  const stdin = state.readStdin() || {};
  const id = stdin.session_id;
  const snap = id ? state.readSnapshot(id) : null;
  let tips = [];
  try {
    tips = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tips.json'), 'utf8'));
  } catch {}
  process.stdout.write(hud.render(snap, stdin, tips, Date.now()));
} catch {
  process.stdout.write('⚔️ Questline');
}
process.exit(0);
