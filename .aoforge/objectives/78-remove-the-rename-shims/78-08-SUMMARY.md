---
objective: 78-remove-the-rename-shims
trd: "08"
subsystem: managed-block
status: checkpoint
---

# Objective 78 TRD 08: CLAUDE.md managed blocks under the AOFORGE markers only Summary

## Progress
- [x] Task 1: Fixtures and RED tests — 26d2d22c
- [x] Task 2: GREEN — managed-block one tag + refusal; 0014 deleted; 0005/0007 skip — (this commit)
- [ ] Task 3: GREEN — global upgrade: no pre-rename move, no outside rewrite, one notice — next step: in plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs make ROUTING_RE AOForge-only, add LEGACY_ROUTING_RE, return action 'pre_rename' from planBlock on ELEGACYBLOCK (read with label ~/.claude/CLAUDE.md) or a pre-rename routing heading, queue one `action` notice under key global-claude-md-pre-rename, delete planOutside / KEYS.outside / the outside notices and the legacy-rewrite import; then drop the `outside` rendering in upgrade-cli.cjs; verify with `node --test global-upgrade.legacy.test.cjs global-upgrade.test.cjs upgrade-cli.test.cjs ../../hooks/sync-runtime.test.js`.
