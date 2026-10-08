---
objective: 67-minutes-recalibration
trd: "09"
status: checkpoint
---

# Objective 67 TRD 09: Install 2.15.0 and freeze the EST-11 calibration (checkpoint, not complete)

## Progress
- [x] Task 1: Human action: update the installed plugin to 2.15.0 and restart Claude Code — (this commit)
- [ ] Task 2: Verify the mirror, build the frozen calibration with the installed runtime, prove SC-2 — next step: write `<scratch>/mirror.sh` (cmp of eight estimation libs against `git show v2.15.0:...`), run it with bash, then run `node /Users/justin/.claude/devflow/bin/df-tools.cjs calibrate --paths /Users/justin/dev/devflow-claude --minutes <method_selected from 67-VALIDATION.md> --window 10 --through 66 --raw`
- [ ] Task 3: Prove SC-3 and SC-4 on the installed runtime; record the freeze in 67-FREEZE.md and STATE.md — next step: build the two snapshots under a scratch dir with the same basename `devflow-claude`

## Task 1 pre-check, first pass (2026-10-08, before the restart)

| Check | Result |
|---|---|
| `installed_plugins.json` devflow@aocyber | version 2.14.0, installPath `/Users/justin/.claude/plugins/cache/aocyber/devflow/2.14.0` |
| `~/.claude/devflow/.plugin-version` | 2.14.0 |
| `~/.claude/plugins/cache/aocyber/devflow/` | 2.7.1 2.10.1 2.11.0 2.12.0 2.13.1 2.14.0 (no 2.15.0) |

The update and restart had not happened, so Task 1 was a live checkpoint.

## Task 1 user reply and update output

Literal reply to the Task 1 checkpoint: `approved`

Commands run once each, one per Bash call (by the executor before the restart):

1. `claude plugin marketplace update aocyber`
   ```
   Updating marketplace: aocyber...Refreshing marketplace cache (timeout: 120s)…
   Cloning repository (timeout: 120s): git@github.com:AO-Cyber-Systems/devflow-claude.git
   Replacing the existing marketplace clone…
   Clone complete, validating marketplace…
   ✔ Successfully updated marketplace: aocyber
   ```
2. `claude plugin update devflow@aocyber`
   ```
   Checking for updates for plugin "devflow@aocyber"…
   ✔ Plugin "devflow" updated from 2.14.0 to 2.15.0 for scope user. Restart to apply changes.
   ```

Installed record after the update: version 2.15.0, installPath `/Users/justin/.claude/plugins/cache/aocyber/devflow/2.15.0`, lastUpdated 2026-10-08T15:14:44Z, gitCommitSha `2f01cd77f5ad70518302ad53e35f5478b704fd5d` (equals MERGE_SHA of 67-08). The user then restarted Claude Code.

## Task 1 pre-check, second pass (2026-10-08, after the approved update and restart)

Task 1: already done (found at pre-check, after the approved update and restart).

| Check | Result |
|---|---|
| `installed_plugins.json` devflow@aocyber | version 2.15.0, installPath `/Users/justin/.claude/plugins/cache/aocyber/devflow/2.15.0`, gitCommitSha `2f01cd77f5ad70518302ad53e35f5478b704fd5d` |
| `~/.claude/devflow/.plugin-version` | 2.15.0 |
| `~/.claude/plugins/cache/aocyber/devflow/` | 2.7.1 2.10.1 2.11.0 2.12.0 2.13.1 2.14.0 2.15.0 |

The SessionStart upgrade hook also committed 7e39fb67 (`chore(devflow): upgrade project to v2.15.0`, config.json stamp only), which is the base of this resumed run.
