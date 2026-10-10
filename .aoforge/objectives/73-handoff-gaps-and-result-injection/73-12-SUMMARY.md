---
objective: 73-handoff-gaps-and-result-injection
trd: "12"
subsystem: watcher
tags: [watcher, aoforge-watch, runtime-home, watcher-allowlist, gap-closure, G5]
---

# Objective 73 TRD 12: The watch daemon's pid file and log live in the watch state directory Summary

## Progress

- [x] Task 1: RED, the daemon's files in the watch directory, the 3.0.0 read, and hook/daemon agreement — c2121c3f
- [ ] Task 2: GREEN, watcher-state and aoforge-watch on the watch directory; the allowlist on the shared matcher — pid file and log moved (this commit); next step: in plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs replace the rx() built-ins with interactive-commands.INTERACTIVE_PATTERNS marked builtin, route validateCommand's built-ins through matchInvocations (user entries keep the whole-command loop), take CMD_POS from the shared module, rewrite the header NOTE, then run node --test watcher-allowlist.test.cjs
- [ ] Task 3: neighbours follow the layout; gate-interactive pinned on it
