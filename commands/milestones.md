---
description: Show the Milestone Wall — every boss you have slain
allowed-tools: Bash
---

Run this command and show its full output to the user verbatim, nothing else:

Resolve the Slime plugin root first:
- Claude Code: use `${CLAUDE_PLUGIN_ROOT}`.
- Codex: use the plugin root that contains this command file and `.codex-plugin/plugin.json`; set `SLIME_HARNESS=codex`.

Claude Code:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/milestones.js"
```

Codex:
```
SLIME_HARNESS=codex node "<PLUGIN_ROOT>/scripts/milestones.js"
```
