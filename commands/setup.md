---
description: Install the Slime statusline HUD
allowed-tools: Read, Edit, Bash
---

Help the user enable the Slime HUD:

1. Resolve the plugin root: the directory containing this command file, up one level.
2. Read `~/.claude/settings.json`. If a `statusLine` key exists, show it and ask before replacing.
3. Set:

```json
{ "statusLine": { "type": "command", "command": "node \"<PLUGIN_ROOT>/scripts/statusline.js\"" } }
```

4. Tell the user to restart Claude Code (or run /statusline) to see the HUD.
