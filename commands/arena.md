---
description: Open the Pixel Arena — live battle viewer in your browser
allowed-tools: Bash
---

Start the viewer server in the background if not already running, then tell the user to open the URL:

Use `${CLAUDE_PLUGIN_ROOT}` to resolve the Slime plugin root.

```
(lsof -ti :4117 >/dev/null 2>&1 || nohup node "${CLAUDE_PLUGIN_ROOT}/scripts/serve.js" >/dev/null 2>&1 &) ; echo "Arena live at http://127.0.0.1:4117"
```

Show the user: "⚔️ Arena live — open http://127.0.0.1:4117 (stop it later with: kill $(lsof -ti :4117))"

Flash-sensitive? Open `http://127.0.0.1:4117/?calm=1` — flashes become fades, shake turns off.
