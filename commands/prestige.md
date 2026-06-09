---
description: Ascend — reset level/XP for a permanent XP multiplier (New Game+)
allowed-tools: Bash
---

Help the user prestige (New Game+). This **resets level and XP**, so always confirm first.

1. Run the dry-run and show its output verbatim:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/prestige.js"
   ```

2. If it says **"not yet"**, stop — they haven't reached the level requirement.
3. If it says **"ready"**, make sure the user clearly understands their level and XP
   will be reset to 0 (badges, streak and milestones are kept) and explicitly confirms.
   Only after a clear yes:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/prestige.js" --yes
   ```

4. Show the result.
