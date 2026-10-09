---
objective: 73-handoff-gaps-and-result-injection
job: "01"
subsystem: handoff-watcher
tags: [pty, shell, zsh, bash, node-pty]
requirements-completed: []
---

# Objective 73 TRD 01: PTY dispatch script Summary

**Checkpoint, not complete: the bash/zsh PTY wrapper is being moved to a private script file sourced with one input line.**

## Progress
- [x] Task 1: RED, the gap 1 / gap 2 / Ctrl+C / comment regression tests against the current wrapper - (this commit)
- [ ] Task 2: GREEN, ptyScript/sourceLine and the one-line script-file PTY dispatch - next step: add ptyScript/sourceLine and the history guard to plugins/aoforge/aoforge/bin/lib/wrappers/bash.cjs, then the script-file branch in ShellSession.dispatch
- [ ] Task 3: the PTY daemon path end to end, and the full-suite gate
