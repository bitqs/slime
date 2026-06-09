# Day/Night button — live theme switch (no reload)

**Date:** 2026-06-09
**Status:** Implemented (arena.js refactor + live verify via chrome-devtools)
**Scope:** `public/arena.js` (plus removal of an obsolete language button, already done)

## Problem

The day/night button (`#day-btn`, 🌙/☀️) currently toggles a `slimeDay`
localStorage flag and then **reloads the whole page** to re-render the theme.
The reload is jarring: it flashes white, drops the live SSE battle stream, and
loses in-flight arena animation. Goal: switch theme **instantly, in place, with
no page reload**, keeping the DOM chrome and the PixiJS canvas visually consistent.

## Why a reload is used today

The theme is captured once at arena-init time as `const DAY =
document.body.classList.contains('day')` (arena.js:13) and baked into the WebGL
scene in eight places:

| Site | What it themes | Persistence |
|------|----------------|-------------|
| 82 | `app.init` renderer background color | set once at init |
| 122–145 | day sky/sun/clouds/hills container — **built only if `DAY`** | persistent sprite |
| 123 | night starfield (`bgFar`/`bgNear`) hidden if `DAY` | persistent |
| 158 | night-only sci-fi sky decor that drifts across the starfield | persistent |
| 490–492 | `DAIS` stone palette | redrawn into `groundFx` **every frame** (454–456) |
| 600 | danger `vignette` radial texture | single sprite, alpha animated |
| 151, 279, 320, 347 | per-event FX color palettes | transient, created per event |

Because the sky/stars/vignette sprites are built once from `DAY`, toggling the
`body.day` CSS class only re-skins the DOM chrome (top bar, parchment frame,
CRT) — the canvas keeps its baked theme, giving a half-switched mismatch.

## Approach: centralized `applyTheme(day)`

Replace the init-captured `const DAY` with a mutable module-scope `let theme`
and a single `applyTheme(day)` function that re-skins both the DOM and the
canvas. Called once at init to sync, and on every button click.

```
let theme = document.body.classList.contains('day');  // true = day

function applyTheme(day) {
  theme = day;
  document.body.classList.toggle('day', day);              // DOM chrome — instant via CSS
  app.renderer.background.color = day ? 0xadd2ef : P.bg;   // canvas backdrop
  bgFar.visible = bgNear.visible = !day;                   // night starfield
  skyContainer.visible = day;                              // day sky/sun/clouds/hills
  nightDecor.visible   = !day;                             // sci-fi drift decor
  vignette.texture = makeRadialTex(day);                   // danger glow re-tint
  dayBtn.textContent = day ? '☀️' : '🌙';
  dayBtn.title = day ? 'switch to night (dark)' : 'switch to day (light)';
  try { if (day) localStorage.setItem('slimeDay', '1'); else localStorage.removeItem('slimeDay'); } catch {}
}
```

The dais and per-event FX palettes are **not** touched by `applyTheme`: they
read the mutable `theme` at draw time and are regenerated continuously
(`groundFx` clears + redraws every frame; FX sprites are created per event), so
they self-correct within one frame / on the next event.

## Structural changes (all `public/arena.js`)

1. **`const DAY` → `let theme`** (line 13). Every read of `DAY` becomes `theme`.
2. **Build the day sky unconditionally.** Lift the `if (DAY) { … }` sky block
   (122–145) out of the conditional; always construct it into a named
   `skyContainer`, add it to `world` at index 0, and set initial visibility via
   `applyTheme`. Keep `bgFar`/`bgNear` always built (already are).
3. **Name the night sky decor** (158). Wrap the drifting sci-fi decor in a
   `nightDecor` container kept in scope so its visibility can toggle.
4. **`DAIS` palette → lookup in `drawDais`.** Replace the `const DAIS` (490)
   with a small palette pick inside `drawDais` keyed on `theme`, so each
   per-frame redraw uses the current theme.
5. **Make the vignette texture swappable.** Split `makeRadial` so the radial
   **texture** can be produced independently (`makeRadialTex(day)`), and build
   the `vignette` sprite from it. `applyTheme` reassigns `vignette.texture`;
   alpha (animated by the ticker) is untouched.
6. **FX palette branches** (151, 279, 320, 347) read `theme` instead of `DAY`.
7. **Click handler** (1543–1546): `applyTheme(!theme)` — drop `location.reload()`.
8. **Init sync:** after the scene is built, call `applyTheme(theme)` once so the
   canvas matches the persisted flag without special-casing init.

## What does NOT change

- `index.html`: the `body.day` CSS rules and the pre-paint inline script
  (line 103, `if slimeDay==='1' add .day`) stay — the pre-paint script prevents
  a flash of the wrong theme on initial load.
- Persistence model: still a single `slimeDay` localStorage flag, two states
  (day / night), manual toggle only. No auto/system-time logic (out of scope).
- The reduced-motion / `?calm=1` flash governor is independent and unaffected.

## Risks & mitigations

- **Renderer background reassignment:** Pixi v8 exposes
  `app.renderer.background.color` as a live setter — verify it repaints without
  a resize. If it does not, fall back to a full-bleed backdrop `Graphics` behind
  `world` that `applyTheme` recolors.
- **Texture leak on vignette swap:** the old vignette texture should be
  destroyed (or both textures pre-built once and swapped between) to avoid GPU
  texture accumulation on repeated toggles. Pre-build both is simplest.
- **Sky decor double-build:** ensure the sky/decor are built exactly once
  (moving out of the `if (DAY)` must not duplicate them on re-theme — they are
  built at init, only their `.visible` flips).

## Testing

- `public/arena.js` is excluded from `tsc` (browser globals + vendored PIXI),
  so verification is manual via the demo arena:
  ```
  SLIME_ROOT=/tmp/slime-demo node scripts/demo-feed.js &
  SLIME_ROOT=/tmp/slime-demo SLIME_PORT=4118 node scripts/serve.js
  # open http://127.0.0.1:4118
  ```
- Manual checks: toggle repeatedly mid-battle — chrome + canvas switch together
  in one frame, no reload, no white flash; starfield↔sky swaps; dais restones;
  danger vignette re-tints on next low-token pulse; reload restores last theme;
  toggle 20× shows no texture/memory growth.
- Existing `node --test test/` suite must stay green (no arena.js unit coverage,
  but guard against regressions elsewhere).
