---
description: Update Slime to the latest version
allowed-tools: Bash
---

Update the Slime plugin:

Claude Code only. Codex plugin updates use `codex plugin add slime@<marketplace>`
or the installed marketplace's upgrade flow once Slime is published there; do not
run `claude plugin ...` commands for Codex.

1. Run `claude plugin marketplace update slime` (refreshes the marketplace source).
2. Run `claude plugin update slime@slime` (installs the new version).
3. If either command reports what changed, summarize it for the user in their language.
4. Tell the user: restart Claude Code (or start a new session) to load the new version — running sessions keep the old code until then.
