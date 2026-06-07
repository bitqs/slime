# Questline P3-Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Finish localization (zh verb pools + zh boss names) and the usage.json dirty-check deferred from P2.

**Tech:** unchanged. All existing 56 tests must stay green (en default untouched).

### Task 1: zh verb pools — cast() speaks the user's language

- Verb pools move per-locale: keep `VERBS` in mapper.js as the en built-in; zh pools live in `data/locales/zh.json` under array keys `"verbs.read"`, `"verbs.grep"`, `"verbs.edit"`, `"verbs.write"`, `"verbs.bash"`, `"verbs.agent"`, `"verbs.web"`, `"verbs.skill"`, `"verbs.other"`:
  - read: ["窥探", "勘察", "研读"] / grep: ["追踪", "狩猎", "嗅探"] / edit: ["斩击", "挥砍", "雕琢"] / write: ["锻造", "凝铸"] / bash: ["引爆", "释放"] / agent: ["召唤", "派遣"] / web: ["占卜", "窥视天机"] / skill: ["发动", "引导"] / other: ["挥舞", "亮出"]
- `mapper.cast(payload, count, lang)`: when lang given and locale catalog has `verbs.<cat>` array, use it; zh text format: `${icon} ${verb} [${tool}]${tgt ? ` → ${tgt}` : ''}…` (no "with", no capitalization)
- resolve() zh strings: add catalog keys `"resolve.hit"`: "⚔️ 命中! {dmg} 伤害 🔥连击×{combo}", `"resolve.backfire"`: "💥 [{tool}] 反噬 — 受击!连击中断", `"resolve.kill"`: "💀 测试通过 — 小怪击杀!" (en equivalents added to en.json mirroring current literals); resolve(payload, snap, lang) uses locale.t+fmt when lang given, else current literals
- hook-pretool/hook-posttool pass `locale.current()`
- Tests: zh cast contains 斩击|挥砍|雕琢 and `[Edit]`; zh resolve hit contains 连击×; en calls without lang byte-identical

### Task 2: zh boss names

- `boss.nameBoss(prompt, cwd, lang)`: zh format `「{Base}」{TypeZh}` with TypeZh map: Bugbear→错虫王, Colossus→重构巨像, Hydra→九头蛇, Wraith→试炼怨灵, Sphinx→文档斯芬克斯, Golem→魔像
- `loadOrCreate(cwd, prompt, lang)` threads lang; hook-prompt passes `locale.current()`
- namer.js already asks Haiku in zh — unchanged
- Tests: nameBoss('修复登录bug', '/p/web', 'zh') === '「Web」错虫王'; en unchanged

### Task 3: usage.json dirty-check

- `cacheFromStatusline`: skip write when next equals prev on {fiveHour, sevenDay, contextPct, source} (ignore t). Compare via JSON.stringify of those four fields.
- Test: two identical calls → file mtime unchanged (or write-count via wrapping fs not needed — assert file content `t` unchanged after second call with same data)

Each task: TDD, run full suite, commit.
