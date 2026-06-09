---
description: Install the Slime statusline HUD
allowed-tools: Read, Edit, Bash
---

Help the user enable the Slime HUD:

Claude Code only.

1. Resolve the plugin root: the directory containing this command file, up one level.
2. Read `~/.claude/settings.json`. If a `statusLine` key exists, show it and ask before replacing.
3. Set:

```json
{ "statusLine": { "type": "command", "command": "node \"<PLUGIN_ROOT>/scripts/statusline.js\"", "refreshInterval": 2 } }
```

(`refreshInterval: 2` re-runs the HUD every 2s on top of event updates, so the ⏱ session clock ticks live instead of only on tool calls. If a `statusLine` already exists, preserve any `refreshInterval` the user set.)

4. Tell the user to restart Claude Code (or run /statusline) to see the HUD.
