# Slime — Arena UI Layout

Canonical names for every visible module of the browser arena
(`public/index.html` + `public/arena.js`). Use these names in code comments,
commits, and when reporting bugs ("the Stats Bar overflows", not "the bottom
row"). Markup is in `public/index.html`; all live updates are driven by
`public/arena.js` from the SSE `/events` + `/state` feeds.

## Layout (top → bottom)

```
┌──────────────────────────────────────────────────────┐
│ 🟢 SLIME            ▮▮▮▮▮▮▯▯▯▯  🌐 ✨ ?               │  1. Title Bar
├──────────────────────────────────────────────────────┤
│ PLAYER  awaiting action…        ⚡ Token ▮▮▮▮ 87%     │  2. Status Bar
│                                 🧠 Ctx   ▮▮   32%      │
├──────────────────────────────────────────────────────┤
│                     «Boss Name»                        │  3a. Boss Nameplate
│                                                        │
│              [  PixiJS  Battle  Stage  ]               │  3b. Arena Canvas
│           knight · boss · minions · FX                 │      (+ overlays 3c–3h)
│                                                        │
├──────────────────────────────────────────────────────┤
│ 🟢   🟢   🟢   🟢   🟢                                 │  4. Minion Rail
├──────────────────────────────────────────────────────┤
│ 💰 $0.42  ⚔️ opus  🗡️ +120/−8  ⏳ 5m  🏕️ 88%          │  5. Stats Bar
├──────────────────────────────────────────────────────┤
│ ⚔️ knight strikes for 240…                             │  6. Battle Log
└──────────────────────────────────────────────────────┘
```

## Modules

| # | Standard name | 中文名 | DOM id | What it shows |
|---|---|---|---|---|
| 1 | **Title Bar** | 顶栏 | `#top-bar` | App logo + Boss HP Pips + control buttons |
| 2 | **Status Bar** | 玩家状态栏 | `#user-status` | Actor badge, current action, resource meters |
| 3a | **Boss Nameplate** | Boss 名牌 | `#boss-name` | Current boss name, centered over the stage |
| 3b | **Arena Canvas** | 战斗舞台 | `<canvas>` (in `#canvas-wrap`) | PixiJS render: knight, boss, minions, FX, HP bars |
| 3c | **CRT Overlay** | CRT 扫描线 | `#crt` | Static scanline texture over the canvas |
| 3d | **Status Overlay** | 状态遮罩 | `#overlay` | Full-stage message ("waiting for a session…") |
| 3e | **Choice Cards** | 技能选牌 | `#choice-overlay` | Skill-choice cards on `choice_open` |
| 3f | **Plan Scroll** | 计划卷轴 | `#plan-overlay` | Plan text on `plan_scroll` / `plan_approved` |
| 3g | **Feed Counter** | 喂食计数 | `#feed-counter` | Plan-feeding tally while the boss grows |
| 3h | **Guide Modal** | 帮助说明 | `#guide-overlay` / `#guide-box` | Bilingual "how to read the battle" (`?` / `h`) |
| 4 | **Minion Rail** | 小怪栏 | `#minion-rail` | One slime per todo (pending / in_progress / done) |
| 5 | **Stats Bar** | 数据栏 | `#stats` | Gold, Weapon, ATK, Timer, Camp |
| 6 | **Battle Log** | 战斗日志 | `#log` | Scrolling feed of recent battle events |

### Title Bar parts (`#top-bar`)

| Standard name | 中文名 | id / class | Meaning |
|---|---|---|---|
| **App Logo** | 标志 | `#title` | `🟢 SLIME` |
| **Boss HP Pips** | Boss 血格 | `#hp-bar` (10× `.hp-seg#seg0..9`) | Boss HP as 10 lit/unlit segments |
| **Language Button** | 语言键 | `#lang-btn` | 🌐 — toggle en / zh |
| **Calm Button** | 静默键 | `#calm-btn` | ✨ — flash / calm toggle |
| **Help Button** | 帮助键 | `#help-btn` | ? — open the Guide Modal |

### Status Bar parts (`#user-status`)

| Standard name | 中文名 | id / class | Meaning |
|---|---|---|---|
| **Actor Badge** | 角色徽章 | `#us-badge` | `PLAYER` or `CODEX` (current harness) |
| **Action Line** | 行动提示 | `#us-action` | Compacted last action / "awaiting action" |
| **Token Meter** | Token 计量 | `#us-token` + `#us-token-fill` | 5h rate-window left (%); hover = reset time |
| **Context Meter** | 上下文计量 | `#us-ctx` + `#us-ctx-fill` | Context window used (%) |

### Stats Bar parts (`#stats`)

| Standard name | 中文名 | id | Icon · Meaning |
|---|---|---|---|
| **Gold** | 金币 | `#gold` | 💰 real session cost (USD) |
| **Weapon** | 武器 | `#weapon` | ⚔️ active model |
| **ATK** | 攻击 | `#atk` | 🗡️ lines added / removed |
| **Timer** | 计时 | `#timer` | ⏳ session duration |
| **Camp** | 营地 | `#stamina` | 🏕️ weekly quota left |

## Notes

- **No overhead text on the knight.** Player name + resource numbers were
  removed from above the knight sprite (illegible against sprites); that data
  lives only in the **Status Bar**.
- **Token is shown once.** The old Title-Bar token readout was removed; the
  **Token Meter** is the single source. Its window-reset time is a hover
  tooltip, not a second on-screen number.
- **Overlays (3c–3h) stack on the Arena Canvas** inside `#canvas-wrap` and are
  `display:none` until their event fires.
- The same battle is also rendered by the **statusline HUD** (`core/hud.js`) and
  the **tmux pane** (`scripts/watch.js`); those are separate surfaces, not part
  of this layout.
