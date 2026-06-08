---
description: Show this session's turn reports
allowed-tools: Bash
---

Run this command and show its full output to the user verbatim, nothing else
(no argument = the most recent session's reports):

Resolve the Slime plugin root first:
- Claude Code: use `${CLAUDE_PLUGIN_ROOT}`.
- Codex: use the plugin root that contains this command file and `.codex-plugin/plugin.json`; set `SLIME_HARNESS=codex`.

Claude Code:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/battlelog.js"
```

Codex:
```
SLIME_HARNESS=codex node "<PLUGIN_ROOT>/scripts/battlelog.js"
```
