'use strict';
/**
 * Questline Arena — public demo worker.
 * Serves the real arena assets (../public) and synthesizes the battle:
 *   /state  — fixed showcase snapshot + usage
 *   /events — SSE replay of the demo script, one full show per connection
 * Same event shapes as scripts/demo-feed.js; the arena code is byte-identical
 * to what the plugin ships.
 */

const STEP_MS = 2500;
const LOOPS_PER_CONNECTION = 3; // then close; EventSource auto-reconnects

const SCRIPT = [
  { kind: 'encounter', bossName: 'The Demo Dragon', est: 180000, text: '⚡ The Demo Dragon appears!' },
  { kind: 'cast', text: '⚔️ Carves with [Edit] → demo.ts' },
  { kind: 'resolve', dmg: 12, combo: 3, text: '⚔️ hit! 12 dmg 🔥combo×3' },
  { kind: 'resolve', dmg: 30, combo: 6, text: '⚔️ hit! 30 dmg 🔥combo×6' },
  { kind: 'resolve', dmg: 64, combo: 11, text: '⚔️ CRIT! 64 dmg 🔥combo×11' },
  { kind: 'resolve', kill: true, text: '💀 tests pass — minion slain!' },
  { kind: 'choice_open', questions: [{ q: 'Pick a skill', opts: ['Fireball', 'Heal', 'Flee'] }] },
  { kind: 'choice_made', chosen: ['Fireball'] },
  { kind: 'plan_scroll', plan: '1. Slay dragon\n2. Loot hoard\n3. Profit', est: 330000 },
  { kind: 'plan_approved' },
  { kind: 'potion', text: '🧪 potion quaffed' },
  { kind: 'turn_end', text: '🏆 Turn 1 complete — Rank S' },
  { kind: 'boss_down', boss: 'The Demo Dragon', text: '⚡⚡⚡ The Demo Dragon — DEFEATED ⚡⚡⚡' },
];

function stateJson() {
  return {
    snapshot: {
      sessionId: 'demo', turn: 1, combo: 6, kills: 1, dmg: 106, summons: 0, inTurn: true,
      boss: { name: 'The Demo Dragon', hp: 64 }, updated: Date.now(),
    },
    usage: {
      fiveHour: { used: 35, resetsAt: 0 }, sevenDay: { used: 20 }, contextPct: 45,
      cost: 0.42, model: 'Opus', lines: { added: 120, removed: 30 }, durationMs: 300000,
      t: Date.now(),
    },
    lang: 'en',
  };
}

function sseResponse() {
  const enc = new TextEncoder();
  let timer = null;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(': connected\n\n'));
      let i = 0;
      const total = SCRIPT.length * LOOPS_PER_CONNECTION;
      timer = setInterval(() => {
        try {
          const ev = { t: Date.now(), ...SCRIPT[i % SCRIPT.length] };
          controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
          i++;
          if (i >= total) {
            clearInterval(timer);
            timer = null;
            controller.close();
          }
        } catch {
          // client gone mid-enqueue
          if (timer) { clearInterval(timer); timer = null; }
        }
      }, STEP_MS);
    },
    cancel() {
      if (timer) { clearInterval(timer); timer = null; }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/state') {
      return Response.json(stateJson(), { headers: { 'Cache-Control': 'no-cache' } });
    }
    if (url.pathname === '/events') {
      return sseResponse();
    }
    return env.ASSETS.fetch(request);
  },
};
