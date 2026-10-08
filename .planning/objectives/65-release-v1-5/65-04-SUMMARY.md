---
objective: 65-release-v1-5
trd: "04"
subsystem: release
tags: [release, v2.14.0, installed-runtime, mirror, verification]
---

# Objective 65 TRD 04: Installed runtime verification Summary

## Progress
- [x] Task 1: Human action: update the installed plugin to 2.14.0 and restart Claude Code — (this commit)
- [ ] Task 2: Verify the installed runtime carries the v1.5 libs and hooks, and doctor and health report no mirror lag — next step: run `ls -l` on the six v1.5 libs under /Users/justin/.claude/devflow/bin/lib, then the hooks.json registration one-liner against /Users/justin/.claude/plugins/cache/aocyber/devflow/2.14.0/hooks/hooks.json

## Task 1 pre-check (already done, found at pre-check)

The user ran `/plugin` (printed "✔ Updated devflow."), then `/reload-plugins`, then `/restart` in this session. Their replies were "updated plugin" and "restarted". SessionStart reported "DevFlow upgraded this project from v2.13.1 to v2.14.0 (stamp only)", committed as 2db21cbf (`.planning/config.json`).

| Check | Command | Output | Status |
|---|---|---|---|
| Installed record | `node -e '…installed_plugins.json…["devflow@aocyber"]'` | `[{"scope":"user","installPath":"/Users/justin/.claude/plugins/cache/aocyber/devflow/2.14.0","version":"2.14.0","installedAt":"2026-04-28T16:16:41.715Z","lastUpdated":"2026-10-08T11:37:09.838Z","gitCommitSha":"8295a169fe108c3af2d76d2480d1c0f95c1f6dcf"}]` | PASS |
| Mirror version | `cat /Users/justin/.claude/devflow/.plugin-version` | `2.14.0` | PASS |
| Mirror digest | `cat /Users/justin/.claude/devflow/.plugin-digest` | `sha256:2589d10773f588c607457720b9b444f89120769b6d5d8c8b858289b321fce65f` | recorded |
| Mirror marker mtimes | `stat -f "%Sm %N" … .plugin-version .plugin-digest` | both `2026-10-08T07:37:55-0400` (11:37:55Z), 46 s after the record's `lastUpdated` 11:37:09Z | PASS |
| Cache dirs | `ls /Users/justin/.claude/plugins/cache/aocyber/devflow/` | `2.10.1 2.11.0 2.12.0 2.13.1 2.14.0 2.7.1` | PASS (2.14.0 present) |
| Project stamp commit | `git show --stat 2db21cbf` | `chore(devflow): upgrade project to v2.14.0`, `.planning/config.json` 3+/3- | PASS |

The installed gitCommitSha 8295a169 is the 65-03 merge commit on main.
