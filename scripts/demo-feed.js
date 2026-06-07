#!/usr/bin/env node
'use strict';
/* Feeds fake battle events into a throwaway CCQ_ROOT so the arena can be
   eyeballed without a real session:
     CCQ_ROOT=/tmp/ccq-demo node scripts/demo-feed.js &
     CCQ_ROOT=/tmp/ccq-demo QL_PORT=4118 node scripts/serve.js
*/
const fs = require('node:fs');
const path = require('node:path');
const ROOT = process.env.CCQ_ROOT || '/tmp/ccq-demo';
const dir = path.join(ROOT, 'sessions');
fs.mkdirSync(dir, { recursive: true });
const sid = 'demo';
const snapPath = path.join(dir, `${sid}.json`);
const evPath = path.join(dir, `${sid}.jsonl`);
fs.writeFileSync(path.join(ROOT, 'usage.json'), JSON.stringify({
  fiveHour: { used: 35, resetsAt: 0 }, sevenDay: { used: 20 }, contextPct: 45,
  cost: 0.42, model: 'Opus', lines: { added: 120, removed: 30 }, durationMs: 300000, t: Date.now(),
}));
let snap = { sessionId: sid, turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0, inTurn: true,
  boss: { name: 'The Demo Dragon', hp: 80 }, updated: Date.now() };
fs.writeFileSync(snapPath, JSON.stringify(snap));
const ev = (o) => { fs.appendFileSync(evPath, JSON.stringify({ t: Date.now(), ...o }) + '\n'); fs.writeFileSync(snapPath, JSON.stringify({ ...snap, updated: Date.now() })); };

const script = [
  () => ev({ kind: 'encounter', bossName: 'The Demo Dragon', text: '⚡ The Demo Dragon appears!' }),
  () => ev({ kind: 'cast', text: '⚔️ Carves with [Edit] → demo.ts' }),
  () => ev({ kind: 'resolve', dmg: 12, combo: 3, text: '⚔️ hit! 12 dmg 🔥combo×3' }),
  () => ev({ kind: 'resolve', dmg: 30, combo: 6, text: '⚔️ hit! 30 dmg 🔥combo×6' }),
  () => ev({ kind: 'resolve', dmg: 64, combo: 11, text: '⚔️ CRIT! 64 dmg 🔥combo×11' }),
  () => ev({ kind: 'resolve', kill: true, text: '💀 tests pass — minion slain!' }),
  () => ev({ kind: 'choice_open', questions: [{ q: 'Pick a skill', opts: ['Fireball', 'Heal', 'Flee'] }] }),
  () => ev({ kind: 'choice_made', chosen: ['Fireball'] }),
  () => ev({ kind: 'plan_scroll', plan: '1. Slay dragon\n2. Loot hoard\n3. Profit' }),
  () => ev({ kind: 'plan_approved' }),
  () => ev({ kind: 'potion', text: '🧪 potion quaffed' }),
  () => ev({ kind: 'turn_end', text: '🏆 Turn 1 complete — Rank S' }),
  () => ev({ kind: 'boss_down', boss: 'The Demo Dragon', text: '⚡⚡⚡ The Demo Dragon — DEFEATED ⚡⚡⚡' }),
];
let i = 0;
setInterval(() => { script[i % script.length](); i++; }, 2500);
console.log(`feeding ${evPath} — Ctrl-C to stop`);
