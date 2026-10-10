---
objective: 73-handoff-gaps-and-result-injection
trd: "10"
---

# Objective 73 TRD 10: gate-interactive reads invocations, not mentions Summary

## Progress
- [x] Task 1: RED, the shared case table and invocation-aware detection tests — (this commit)
- [ ] Task 2: GREEN, the shared matcher on parseCommand segments — next step: create plugins/aoforge/aoforge/bin/lib/interactive-commands.cjs (23 labelled patterns re-anchored at a simple command, sshKeygenFlags, matchInvocations over shell-words.parseCommand, detectInteractive), then switch hooks/gate-interactive.js to a fail-open require and re-exports and name the call in buildDenyReason for compound hits; run node --test on the hook and lib test files
- [ ] Task 3: the daemon is read through watcher-state
