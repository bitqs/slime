# Slime — Arena UI Layout

Canonical names for every visible module of the browser arena
(`public/index.html` + `public/arena.js`). Use these names in code comments,
commits, and when reporting bugs ("the Stats line overflows", not "the bottom
row"). Markup is in `public/index.html`; all live updates are driven by
`public/arena.js` from the SSE `/events` + `/state` feeds.

## Layout (top → bottom)

```
┌──────────────────────────────────────────────────────┐
│ 🟢 SLIME                              🌐 ✨ ?          │  1. Title Bar
├──────────────────────────────────────────────────────┤
│ ⚡ Dtk  ▮▮▮▮ 87%   💰 $0.42         🔄 3              │  2. Status Bar (3 columns)
│ ⏱ DtkCD▮▮  142m   ⚔️ opus          🔥 ×4             │   col1: meters (icon left)
│ 🏕️ Wtk  ▮▮▮ 61%    🗡️ +120/−8       💀 2              │   col2: stats
│ ⏱ WtkCD▮▮▮▮96h    ⏳ 5m            💥 240            │   col3: 游戏进程 (right)
│ 🧠 Ctx  ▮▮   32%                    🐺 ×1             │
├──────────────────────────────────────────────────────┤
│                     «Boss Name»                        │  3a. Boss Nameplate
│                                                        │
│              [  PixiJS  Battle  Stage  ]               │  3b. Arena Canvas
│           knight · boss · minions · FX                 │      (+ overlays 3c–3h)
│                                                        │
├──────────────────────────────────────────────────────┤
│ 🟢   🟢   🟢   🟢   🟢                                 │  4. Minion Rail
├──────────────────────────────────────────────────────┤
│ ⚔️ knight strikes for 240…                             │  5. Battle Log
└──────────────────────────────────────────────────────┘
```

## Modules

| # | Standard name | 中文名 | DOM id | What it shows |
|---|---|---|---|---|
| 1 | **Title Bar** | 顶栏 | `#top-bar` | App logo + control buttons |
| 2 | **Status Bar** | 玩家状态栏 | `#user-status` | 3 columns: meters (`.us-meters`), Stats (`#stats`), Game Progress (`#progress`) |
| 3a | **Boss Nameplate** | Boss 名牌 | `#boss-name` | Current boss name, centered over the stage |
| 3b | **Arena Canvas** | 战斗舞台 | `<canvas>` (in `#canvas-wrap`) | PixiJS render: knight, boss, minions, FX, HP bars |
| 3c | **CRT Overlay** | CRT 扫描线 | `#crt` | Static scanline texture over the canvas |
| 3d | **Status Overlay** | 状态遮罩 | `#overlay` | Full-stage message ("waiting for a session…") |
| 3e | **Choice Cards** | 技能选牌 | `#choice-overlay` | Skill-choice cards on `choice_open` |
| 3f | **Plan Scroll** | 计划卷轴 | `#plan-overlay` | Plan text on `plan_scroll` / `plan_approved` |
| 3g | **Feed Counter** | 喂食计数 | `#feed-counter` | Plan-feeding tally while the boss grows |
| 3h | **Guide Modal** | 帮助说明 | `#guide-overlay` / `#guide-box` | Bilingual "how to read the battle" (`?` / `h`) |
| 4 | **Minion Rail** | 小怪栏 | `#minion-rail` | One slime per todo (pending / in_progress / done) |
| 5 | **Battle Log** | 战斗日志 | `#log` | Scrolling feed of recent battle events |

### Title Bar parts (`#top-bar`)

| Standard name | 中文名 | id / class | Meaning |
|---|---|---|---|
| **App Logo** | 标志 | `#title` | `🟢 SLIME` |
| **Language Button** | 语言键 | `#lang-btn` | 🌐 — toggle en / zh |
| **Calm Button** | 静默键 | `#calm-btn` | ✨ — flash / calm toggle |
| **Help Button** | 帮助键 | `#help-btn` | ? — open the Guide Modal |

### Status Bar parts (`#user-status`) — 3 columns

**Column 1 — Meters** (`.us-meters`), icon in the leftmost cell:

| Standard name | 中文名 | id / class | Meaning |
|---|---|---|---|
| **Dtk Meter** | 日 Token | `#us-dtk` (+`-fill`) | ⚡ daily (5h) token left % |
| **Dtk CD Meter** | 日 Token 冷却 | `#us-dtkcd` (+`-fill`) | ⏱ minutes to 5h reset; bar = fraction of 300m left |
| **Wtk Meter** | 周 Token | `#us-wtk` (+`-fill`) | 🏕️ weekly (7-day) token left % |
| **Wtk CD Meter** | 周 Token 冷却 | `#us-wtkcd` (+`-fill`) | ⏱ hours to weekly reset; bar = fraction of 168h left |
| **Context Meter** | 上下文计量 | `#us-ctx` (+`-fill`) | 🧠 context window used % |

**Column 2 — Stats** (`#stats`):

| Standard name | 中文名 | id | Icon · Meaning |
|---|---|---|---|
| **Gold** | 金币 | `#gold` | 💰 real session cost (USD) |
| **Weapon** | 武器 | `#weapon` | ⚔️ active model |
| **ATK** | 攻击 | `#atk` | 🗡️ lines added / removed |
| **Timer** | 计时 | `#timer` | ⏳ session duration |

**Column 3 — Game Progress** (`#progress`, right-aligned) — live RPG counters from the snapshot:

| Standard name | 中文名 | id | Icon · Meaning |
|---|---|---|---|
| **Turn** | 回合 | `#pg-turn` | 🔄 turn number |
| **Combo** | 连击 | `#pg-combo` | 🔥 ×combo |
| **Kills** | 击杀 | `#pg-kills` | 💀 tests passed |
| **Dmg** | 伤害 | `#pg-dmg` | 💥 lines changed this session |
| **Summons** | 召唤 | `#pg-summons` | 🐺 ×subagents |

## Notes

- **No overhead text on the knight.** Player name + resource numbers were
  removed from above the knight sprite (illegible); that data lives in the
  **Status Bar**.
- **Token is shown once** — the **Token Meter**; its window-reset time is a hover
  tooltip, not a second number.
- **Boss HP lives on the canvas**, not the Title Bar. The old title-bar pip
  strip was removed; HP shows as the pip bar over the boss sprite plus the
  **Boss Nameplate**.
- **The boss slime renders ≥ 2× the knight** (`SLIME_MIN_SCALE` in `arena.js`;
  KNIGHT and BOSS matrices share a 14px height, so scale maps 1:1 to "× the
  knight"). Pack/mini minions stay smaller for hierarchy.
- **Overlays (3c–3h) stack on the Arena Canvas** inside `#canvas-wrap` and are
  `display:none` until their event fires.
- The same battle is also rendered by the **statusline HUD** (`core/hud.js`,
  whose `[HUD]` link opens this arena) and the **tmux pane**
  (`scripts/watch.js`); those are separate surfaces, not part of this layout.
