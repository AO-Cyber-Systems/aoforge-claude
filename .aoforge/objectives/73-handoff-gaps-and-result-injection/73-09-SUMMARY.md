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

duration: 9min
completed: 2026-10-10
tokens_input: 12578466
tokens_output: 57506
tokens_cache_read: 12366631
tokens_cache_write: 211671
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 73 TRD 09: $HOME is never an AOForge project root Summary

**compat.findProjectRoot stops at $HOME (basename-gated stop plus a one-realpath candidate check, symlink-aware), planning-mode delegates to it and refuses a $HOME git holder, so aoforge-watch's `~/.aoforge/` no longer turns every repository below $HOME into an AOForge project.**

## Progress
- [x] Task 1: Fixture builders for temp homes — 074deb4a
- [x] Task 2: RED, the $HOME regression tests — b5cb5e15
- [x] Task 3: GREEN, the $HOME stop in compat and planning-mode — 822ba676

## Performance

- Started: 2026-10-10T01:20:28Z (preflight claim), finished 2026-10-10T01:29:25Z
- Tasks: 3, all committed individually (RED b5cb5e15 precedes GREEN 822ba676)
- Files: 3 created, 4 modified

## What changed

- `compat.cjs`: `userHomeDir(env)` (env.HOME, else os.homedir(), else ''; read per call, never cached),
  internal `realOr` and `homeMatcher(home, fsImpl)` (the cheap `stopsAt` on every directory of a walk: exact path,
  or a realpath comparison only when the basename equals home's; the candidate `isHome` right before a found
  directory is returned: exact path, else one realpath compared with home's lazily computed realpath), the exported
  `isUserHome(dir, { home, fsImpl })`, and a `home` option on `findProjectRoot` with both checks. A candidate that
  IS $HOME ends the walk (null), so nothing above $HOME is searched. Header list and JSDoc updated.
- `planning-mode.cjs`: `nearestPlanningRoot` delegates to `findProjectRoot(start, { maxUp: Infinity })` (one walker,
  one $HOME rule; wrapped in try/catch to keep the module's never-throws contract). `resolveMainRoot` and
  `resolveCheckoutRoot` refuse a git-holder candidate for which `isUserHome` is true and fall through to the walk,
  which cannot return $HOME either.
- `gate-edits.test.js` `runStoreHook`: HOME is a per-call sibling temp dir (removed in `finally`) instead of the
  project root. What the tests assert is unchanged. Without this, 6 of the 48-08 store-mode subprocess tests fail
  under the fix (`'none' !== 'deny'`), because their project root was their $HOME; checked by running the pre-fix
  copy of the file against the new compat.
- `planning-mode.test.cjs`: a new describe for items 17-18 and a header line; the hygiene test's comment now says
  compat requires fs, os, path and legacy-names.cjs.

## Walker survey (re-checked at execution time)

`rg -n "findProjectRoot|nearestPlanningRoot|resolveMainRoot|resolveCheckoutRoot" plugins/aoforge/hooks plugins/aoforge/aoforge/bin`
matches the planning-time survey:

- Through `compat.findProjectRoot` (now stops at $HOME): classify-session, gate-edits, gate-commits, gate-executor-stop,
  verify-completion, verify-commits, guard-no-progress, route-results, route-intent, inject-org-context,
  upgrade-project, statusline (via estimate-run-store, also trd-pre-check and estimate-cli), doctor-cli, skill-active,
  state-rekey, gh-rebrand.
- Through planning-mode (`resolveMainRoot` / `resolveCheckoutRoot`, now delegating and refusing a $HOME holder):
  gh-flush, todo-sync (hook and lib), token-backfill, misc (commit), migration 0011, templates, frontmatter,
  planning-drafts, planning-import, planning-verbs, planning-entity-verbs, gh-backfill, gh-gate, objective,
  calibration-inputs, calibrate-cli, tokens-cli, estimate-cli, commit-trailer.
- Not project detection, left untouched: the `.git` walkers (findRepoRoot, findGitDir, findGitHolder, gate-commits'
  git dir), `handoff-results.findHandoffDir` (`.aoforge-handoff/`), realpath helpers, and gate-edits/skill-active
  `sharedPlanningDir` (reads a skill marker only to ALLOW an edit after a project was already detected).
- `session-audit.findPlanningRoot` (`session-audit.cjs` 406-420) runs its own upward loop and calls
  `findProjectRoot(dir, { maxUp: 0 })` once per directory. After this change $HOME reads as not-a-project there, but
  that loop continues above $HOME (`/Users`, `/`). Left as is on purpose: it is offline telemetry over recorded cwds,
  never a gate, and nothing above $HOME holds a planning directory in practice.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture builders | `node -e "...mkHome({dotDir:{'x.log':'a'}})...existsSync(<home>/.aoforge/x.log)..."` | 0 (prints `true`; exit 1 MODULE_NOT_FOUND before the file existed) | PASS |
| 2: RED tests | `node --test plugins/aoforge/hooks/home-project-detection.test.js plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs` | 1 (13 failures, all $HOME cases) | PASS (red as required) |
| 3: GREEN | `node --test plugins/aoforge/hooks/home-project-detection.test.js plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs plugins/aoforge/hooks/gate-edits.test.js plugins/aoforge/hooks/classify-session.test.js` | 0 | PASS |

## TDD Evidence

| Phase | Commit | Command | Exit Code | Expected |
|---|---|---|---|---|
| RED | b5cb5e15 | the three new/extended test files (Task 2 verify) | 1 | FAIL (correct) |
| GREEN | 822ba676 | the same three plus gate-edits and classify-session tests (Task 3 verify) | 0 | PASS (correct) |
| REFACTOR | none | not needed | n/a | n/a |

RED, on c0e6550b + 074deb4a, 13 of the 20 new tests failed, each for the $HOME reason:
- Spawned hooks: 1 classify-session emitted `AOFORGE PROJECT DETECTED` under the watcher's home and nothing under the
  control home; 2 gate-edits denied the ambient Write in the repo below $HOME; 4 route-intent injected the
  `/aoforge:build` directive; 6 gate-edits denied a Write to `<home>/notes.txt` in a session started in $HOME.
- compat: 7, 8, 10 (legacy planning directory at $HOME), 11 in both symlink directions (findProjectRoot returned
  `<base>/real` and `<base>/link`), 13 (returned the temp home from `process.env.HOME`), 16 (`isUserHome` is not a
  function).
- planning-mode: 17 and 18 (`resolveMainRoot` returned the realpath of the temp home).
- Passing on the old code, as planned: 3 (gate-commits never gated: the watcher's dot directory holds no ROADMAP.md
  or objectives/), 5, 9, 11 no-over-refusal, 12, 14, 15 and the existing planning-mode tests 1-5 (item 19).

GREEN: all 20 new tests and every existing test in the five files pass.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/aoforge/hooks/home-project-detection.test.js plugins/aoforge/aoforge/bin/lib/compat.home.test.cjs plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs` | 0 | PASS |
| test (full) | `node --test 'plugins/aoforge/**/*.test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` (the `npm test` globs) | 1 | PASS (no new failures, see below) |
| lint | not_available | n/a | not_available |
| build | not_available | n/a | not_available |

Full suite: before the fix 12,187 tests, 12,154 pass, 1 fail, 32 skipped; after it 12,207 tests (+20 new), 12,174
pass, 1 fail, 32 skipped. The one failure is the same in both runs and is not this TRD's code:
`roadmap-reconcile.test.cjs` E2E1 (zero drift in this repo's ROADMAP) reports `trd_summary_exists` for 73-09,
because the in-progress `## Progress` checkpoint SUMMARY exists while ROADMAP.md still shows `- [ ] 73-09`. The
state-update step (`roadmap update-job-progress 73`) ticks that line and clears it.

## Deviations from Plan

None in behaviour. Two small notes:
- The comment in `planning-mode.test.cjs`'s hygiene test was updated to name `os` among compat's requires. The
  same stale comment ("compat.cjs requires only fs, path and legacy-names.cjs") remains in `gh-outbox.test.cjs`,
  `estimate-run-store.test.cjs` and `planning-ledger.test.cjs`. They are comments, not assertions (`os` is a Node
  builtin and every such test accepts builtins), and the files are outside this TRD's `files_modified`, so they were
  left alone.
- Truth 4 says "with HOME unset or empty there is no $HOME stop at all". As the TRD's own pseudocode and test 14
  specify, an unset or empty HOME falls back to `os.homedir()`; the stop is off only when that is empty too, or with
  `home: ''`. Test 14 pins both forms.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (truths 1-3 and 4 by compat.home tests 7-15; truth 5 by planning-mode 17-18; truths 6-7 by
  the spawned-hook tests 1-6; truth 8 by the full run and the runStoreHook fix)
- Gate failures: None
- `rg -n "isUserHome"` finds the compat export and both planning-mode uses; `nearestPlanningRoot` delegates to
  `findProjectRoot`; RED b5cb5e15 precedes GREEN 822ba676.

## Self-Check: PASSED

- FOUND: plugins/aoforge/aoforge/bin/lib/__fixtures__/home-dot-dir-fixtures.cjs, compat.home.test.cjs,
  hooks/home-project-detection.test.js, compat.cjs, planning-mode.cjs
- FOUND: 074deb4a, b5cb5e15, 822ba676 (`git log --oneline -4`)
