---
description: Update Questline to the latest version
allowed-tools: Bash
---

Update the Questline plugin:

1. Run `claude plugin marketplace update questline` (refreshes the marketplace source).
2. Run `claude plugin update questline@questline` (installs the new version).
3. If either command reports what changed, summarize it for the user in their language.
4. Tell the user: restart Claude Code (or start a new session) to load the new version — running sessions keep the old code until then.
