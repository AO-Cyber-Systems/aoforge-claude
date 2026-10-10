---
objective: 73-handoff-gaps-and-result-injection
trd: "09"
subsystem: hooks
tags: [project-detection, home, compat, planning-mode, hooks, gap-closure, G5]

requires:
  - objective: 72
    provides: compat.findProjectRoot (the one project-root walker, both planning-directory names) and planning-mode's main-checkout resolution
provides:
  - "compat.findProjectRoot never returns $HOME and does not search above it: a cheap stop check on every directory, a realpath candidate check before a found directory is returned"
  - "compat.userHomeDir and compat.isUserHome (exported, read per call, symlink-aware)"
  - "planning-mode.nearestPlanningRoot delegates to findProjectRoot; resolveMainRoot and resolveCheckoutRoot refuse a $HOME git-holder candidate"
  - "bin/lib/__fixtures__/home-dot-dir-fixtures.cjs: hand-built temp homes with the watcher's dot directory, repos and projects below them, and a two-name symlinked home (for 73-09, 73-11, 73-13)"
  - "hooks/home-project-detection.test.js: the verifier's regression test, spawned hooks under a temp HOME holding the watcher's log"
affects: [73-11 user files in runtime home, 73-13 doctor check, every hook that detects a project]

tech-stack:
  added: []
  patterns:
    - "homeMatcher: one matcher per walk, two checks of different cost (exact/basename-gated stop on every directory, one realpath per candidate), home's realpath computed lazily once"
    - "$HOME read per call (env.HOME, else os.homedir(), else ''), never cached at module load"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs
    - plugins/aoforge/hooks/home-project-detection.test.js
  modified:
    - plugins/aoforge/aoforge/bin/lib/compat.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-mode.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs
    - plugins/aoforge/hooks/gate-edits.test.js

key-decisions:
  - "A planning directory exactly at $HOME (either name) is never a project, whatever it holds, and a walk that reaches $HOME returns null instead of continuing above it"
  - "The stop check realpaths a directory only when its basename equals home's; a home reached under a symlink with a different name is caught by the candidate check (one realpath per found planning directory, never one per directory walked)"
  - "home: '' (and HOME unset with os.homedir() empty) disables the stop entirely; a start outside $HOME walks to the filesystem root as before"
  - "planning-mode.nearestPlanningRoot keeps its never-throws contract by wrapping the findProjectRoot delegation in try/catch (compat's stat rethrows errors other than ENOENT/ENOTDIR)"

patterns-established:
  - "Spawned-hook regression by control comparison: the same repo under a temp HOME with the watcher's footprint and under a clean control HOME must give byte-identical stdout (home paths normalised to <HOME>, decision fields never)"

requirements-completed: [HND-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 0min
completed: 2026-10-10
---

# Objective 73 TRD 09: $HOME is never an AOForge project root Summary

**compat.findProjectRoot stops at $HOME (basename-gated stop plus a one-realpath candidate check, symlink-aware), planning-mode delegates to it and refuses a $HOME git holder, so aoforge-watch's `~/.aoforge/` no longer turns every repository below $HOME into an AOForge project.**

## Progress
- [x] Task 1: Fixture builders for temp homes — 074deb4a
- [x] Task 2: RED, the $HOME regression tests — b5cb5e15
- [x] Task 3: GREEN, the $HOME stop in compat and planning-mode — (this commit)
