# Arena FX & Cutscenes — Design

Date: 2026-06-07
Status: approved

## Goal

Make the Pixel Arena (`/questline:arena`) dramatically more alive: cinematic
cutscenes at key battle moments plus continuous screen effects (flash bursts,
screen shake, chromatic aberration), rebuilt on PixiJS/WebGL.

Follow-up decided in the same session: after this feature ships, harden the
codebase with JSDoc + `tsc --noEmit --checkJs` (no TS build step — the plugin
must keep running raw JS straight from the marketplace clone).

## Dependency & Distribution

- Vendor `public/vendor/pixi.min.js` (PixiJS v8, latest stable, MIT) into the
  repo. Pin the version; record version + license in a comment at the top of
  the vendored file (or an adjacent `VERSION` note).
- No CDN, no npm install for users. Node-side `package.json` stays
  zero-dependency; README's "Zero Dependencies" badge gets a footnote: browser
  viewer vendors PixiJS, the Node runtime remains dependency-free.
- `serve.js` gains a static route with an explicit **whitelist** — only
  `/vendor/pixi.min.js` and `/arena.js`. Normalize paths; anything else 404s
  (no directory traversal).

## Architecture

```
public/index.html  → shell: top bar, log DOM, <script> tags (pixi → arena.js)
public/arena.js    → all game code, layered:
  ├ stage layer:   parallax dungeon background (2–3 scrolling layers), torches, floor
  ├ sprite layer:  knight/boss — existing pixel matrices → offscreen canvas →
  │                Pixi textures (reuse current art, no redraw)
  ├ fx layer:      particles (ParticleContainer), floating damage, combo pop
  ├ post layer:    full-screen filters — white/red flash, RGB-split chromatic
  │                aberration (custom shader), vignette, zoom punch
  └ sequencer:     ~40-line timeline player; cutscenes are declarative data
```

Cutscene = array of `{ at: <frame>, do: <primitive>, ...params }` steps. New
cutscenes are data, not code. SSE (`/events`) and `/state` polling logic is
ported unchanged from the current inline script.

FX primitives: `flash`, `shake`, `hitstop`, `zoom`, `letterbox`, `typewriter`,
`particles`, `vignette`, `slowmo`, `slam`, `chroma`.

## Moments → Effects

| Moment | Trigger | Effects |
|---|---|---|
| Boss intro | `encounter` event | letterbox → boss name typewriter → double white flash → boss slams down: screen shake + dust particles |
| Kill / victory | new `boss_down` event — `defeat.js` appends it on confirmed kill | 8-frame hitstop → 0.3× slow-mo boss shatters into particles → white flash → VICTORY banner + gold-coin particle rain + confetti |
| Battle escalation | `resolve` events (`combo`, `dmg`) | combo ≥5: breathing flame screen edges; combo ≥10: chromatic shake + zoom punch per hit; big dmg: radial speed lines |
| Danger state | `/state` `playerHp`; `potion` event | HP<30: red vignette heartbeat pulse + low-frequency shake; HP=0: grayscale filter + sleeping Zzz; potion: gulp cutscene (green flash + bubble particles) |

## Choice & Info Gamification

When Claude presents choices or plans, the arena renders them as game UI.
**Display-only**: the arena cannot answer for the user (no input channel back
into the interactive CLI) — answering stays in the terminal; the arena mirrors
and celebrates the result.

| Surface | Source | Arena rendering |
|---|---|---|
| Skill select | PreToolUse hook on `AskUserQuestion` → `choice_open` event (question + option labels) | battle visually pauses (dim + letterbox — arena animation only, nothing real is blocked), options appear as pixel skill cards fanned at screen bottom, idle pulse animation |
| Skill cast | PostToolUse on `AskUserQuestion` → `choice_made` event (chosen labels) | chosen card flips gold + flies to knight, knight cast animation + white flash; others burn away |
| Quest scroll | PreToolUse on `ExitPlanMode` → `plan_scroll` event (plan text) | parchment scroll unrolls with typewriter plan summary; approval (`choice_made`) stamps a wax seal |

New hook script `hook-pretool.js` (and a PostToolUse twin or a flag on the
same script) appends these events to the session jsonl — same observer
pattern as existing hooks, never blocks, exits 0 always. All text passes
through the existing sanitize + escHtml paths before rendering.

## Flash Safety

- Respect `prefers-reduced-motion`; manual `?calm=1` URL param.
- Calm mode: flashes become fades, shake off, chromatic aberration off.
- Hard cap: ≤3 flashes/second; forced gap between consecutive bursts.

## Server / Data Changes

- `serve.js`: whitelist static route (above).
- `defeat.js`: one line — `appendEvent { kind: 'boss_down' }` on confirmed kill.
- `hook-pretool.js` (new): PreToolUse/PostToolUse observer for
  `AskUserQuestion` / `ExitPlanMode` → `choice_open` / `choice_made` /
  `plan_scroll` events. Registered in the plugin hooks config alongside the
  existing hooks.
- No other writers change. Observer principle intact: arena stays read-only.

## Error Handling

- WebGL unavailable → show plain-text overlay ("arena needs WebGL"); no
  canvas-2d fallback path (double maintenance not worth it).
- SSE reconnect and fail-soft polling behavior carried over as-is.

## Testing

- Sequencer timeline advance is a pure function → `node:test` unit tests.
- `serve.js` static route: whitelisted files 200, traversal/other paths 404.
- Pixi rendering: not unit-tested; manual acceptance via `/questline:arena`.

## Out of Scope

- Sound effects (zero-impact principle: no audio without explicit opt-in design).
- JSDoc/checkJs hardening (next round, separate plan).
- watch.js / statusline: unchanged — effects are arena-only.
