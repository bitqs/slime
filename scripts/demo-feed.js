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
  fiveHour: { used: 35, resetsAt: Math.floor(Date.now() / 1000) + 2 * 3600 + 1080 }, sevenDay: { used: 20, resetsAt: Math.floor(Date.now() / 1000) + 3 * 86400 }, contextPct: 45,
  cost: 0.42, model: 'Opus', lines: { added: 120, removed: 30 }, durationMs: 300000, t: Date.now(),
}));
const BOSS = 'The Demo Dragon';

// Todos: shape matches exactly what hook-posttool writes (content/status/label/activeForm/form)
const TODOS_INITIAL = [
  { content: 'sharpen the demo', status: 'in_progress', label: 'QL mob 1', activeForm: '打磨演示节奏', form: 0 },
  { content: 'slay the dragon', status: 'pending',     label: 'QL mob 2', activeForm: '',     form: 1 },
  { content: 'loot the hoard',  status: 'pending',     label: 'QL mob 3', activeForm: '',     form: 2 },
];
const TODOS_FIRST_KILL = [
  { content: 'sharpen the demo', status: 'completed',  label: 'QL mob 1', activeForm: '',     form: 0 },
  { content: 'slay the dragon', status: 'in_progress', label: 'QL mob 2', activeForm: '猎杀巨龙', form: 1 },
  { content: 'loot the hoard',  status: 'pending',     label: 'QL mob 3', activeForm: '',     form: 2 },
];
const TODOS_ALL_DONE = [
  { content: 'sharpen the demo', status: 'completed', label: 'QL mob 1', activeForm: '', form: 0 },
  { content: 'slay the dragon', status: 'completed',  label: 'QL mob 2', activeForm: '', form: 1 },
  { content: 'loot the hoard',  status: 'completed',  label: 'QL mob 3', activeForm: '', form: 2 },
];

/** @type {import('./lib/types').Snapshot} */
let snap = { sessionId: sid, turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0, inTurn: true,
  boss: { name: BOSS, hp: 80 }, est: 180000, todos: TODOS_INITIAL, updated: Date.now() };
fs.writeFileSync(snapPath, JSON.stringify(snap));
/** @param {Record<string, unknown>} o */
const ev = (o) => { fs.appendFileSync(evPath, JSON.stringify({ t: Date.now(), ...o }) + '\n'); fs.writeFileSync(snapPath, JSON.stringify({ ...snap, updated: Date.now() })); };

const script = [
  // ── encounter + early casts ───────────────────────────────────────────────
  () => {
    snap = { sessionId: sid, turn: 1, combo: 0, kills: 0, dmg: 0, summons: 0, inTurn: true,
      boss: { name: BOSS, hp: 80 }, est: 180000, todos: TODOS_INITIAL, updated: Date.now() };
    ev({ kind: 'encounter', bossName: BOSS, text: '⚡ The Demo Dragon appears!', est: 180000 });
  },
  () => ev({ kind: 'cast', text: '⚔️ Carves with [Edit] → demo.ts' }),
  () => ev({ kind: 'resolve', dmg: 12, combo: 3, text: '⚔️ hit! 12 dmg 🔥combo×3' }),
  () => ev({ kind: 'resolve', dmg: 30, combo: 6, text: '⚔️ hit! 30 dmg 🔥combo×6' }),
  () => ev({ kind: 'resolve', dmg: 64, combo: 11, text: '⚔️ CRIT! 64 dmg 🔥combo×11' }),
  () => ev({ kind: 'resolve', kill: true, text: '💀 tests pass — minion slain!' }),
  // ── choice arc ───────────────────────────────────────────────────────────
  () => ev({ kind: 'choice_open', questions: [{ q: 'Pick a skill', opts: ['Fireball', 'Heal', 'Flee'] }] }),
  () => ev({ kind: 'choice_made', chosen: ['Fireball'] }),
  // ── plan arc ─────────────────────────────────────────────────────────────
  () => ev({ kind: 'plan_scroll', plan: '1. Slay dragon\n2. Loot hoard\n3. Profit', est: 330000 }),
  () => ev({ kind: 'plan_approved' }),
  // ── summon: Agent cast spawns an investigator minion ─────────────────────
  () => {
    snap.summons = (snap.summons || 0) + 1;
    ev({ kind: 'cast', tool: 'Agent', text: '🐺 召唤:investigator' });
  },
  // ── first minion kill (mob 1 → completed) ────────────────────────────────
  () => {
    snap.todos = TODOS_FIRST_KILL;
    snap.boss = { name: BOSS, hp: 50 };
    ev({ kind: 'minion_down', minion: 'QL mob 1', text: '✄ slain: sharpen the demo' });
  },
  () => ev({ kind: 'potion', text: '🧪 potion quaffed' }),
  () => ev({ kind: 'resolve', dmg: 18, combo: 2, text: '⚔️ hit! 18 dmg 🔥combo×2' }),
  // ── second minion kill (mob 2 → completed) ───────────────────────────────
  () => {
    snap.todos = TODOS_ALL_DONE.map((t, i) =>
      i === 2 ? { ...t, status: 'pending' } : t);   // mob 3 still pending
    snap.boss = { name: BOSS, hp: 20 };
    ev({ kind: 'minion_down', minion: 'QL mob 2', text: '✄ slain: slay the dragon' });
  },
  () => ev({ kind: 'resolve', dmg: 20, combo: 4, text: '⚔️ hit! 20 dmg 🔥combo×4' }),
  // ── all todos done → boss hp 0 → broken ──────────────────────────────────
  () => {
    snap.todos = TODOS_ALL_DONE;
    snap.boss = { name: BOSS, hp: 0, broken: true };
    ev({ kind: 'boss_broken', boss: BOSS, text: '☠ broken — finish it!' });
  },
  () => ev({ kind: 'resolve', dmg: 5, combo: 1, text: '⚔️ weakened blow — finish now!' }),
  // ── auto-kill finale ──────────────────────────────────────────────────────
  () => {
    snap.kills = (snap.kills || 0) + 1;
    ev({ kind: 'turn_end', text: '🏆 Turn 1 complete — Rank S' });
  },
  () => ev({ kind: 'boss_down', boss: BOSS, text: `⚡⚡⚡ ${BOSS} — DEFEATED ⚡⚡⚡` }),
];
let i = 0;
setInterval(() => { script[i % script.length](); i++; }, 2500);
console.log(`feeding ${evPath} — Ctrl-C to stop`);
