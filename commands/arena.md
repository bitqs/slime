---
description: Open the Pixel Arena — live battle viewer in your browser
allowed-tools: Bash
---

Start the viewer server in the background if not already running, then tell the user to open the URL:

Resolve the Slime plugin root first:
- Claude Code: use `${CLAUDE_PLUGIN_ROOT}`.
- Codex: use the plugin root that contains this command file and `.codex-plugin/plugin.json`; set `SLIME_HARNESS=codex` for the command.

Claude Code:
```
(lsof -ti :4117 >/dev/null 2>&1 || nohup node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.js" >/dev/null 2>&1 &) ; echo "Arena live at http://127.0.0.1:4117"
```

Codex:
```
(lsof -ti :4117 >/dev/null 2>&1 || SLIME_HARNESS=codex nohup node "<PLUGIN_ROOT>/scripts/serve.js" >/dev/null 2>&1 &) ; echo "Arena live at http://127.0.0.1:4117"
```

Show the user: "⚔️ Arena live — open http://127.0.0.1:4117 (stop it later with: kill $(lsof -ti :4117))"

Flash-sensitive? Open `http://127.0.0.1:4117/?calm=1` — flashes become fades, shake turns off.
