---
objective: 78-remove-the-rename-shims
trd: "10"
subsystem: hooks
tags: [rename-shims, env-alias, hooks, gate-edits, entry-points, coexistence-guard]
requires: ["78-02", "78-04", "78-05", "78-06", "78-07"]
provides:
  - no entry point (aof-tools.cjs, aoforge-watch.cjs, every registered hook, the status line) calls aliasLegacyEnv
  - gate-edits PLANNING_DIR_NAMES / PLANNING_SEGMENT_RE name `.aoforge` only (no LEGACY import)
  - compat-entry.repo.test.cjs inverted: the manifest-derived entry points never mention aliasLegacyEnv
affects: [78-11, 78-12]
tech-stack:
  added: []
  patterns: ["entry-point list derived from hooks.json + plugin.json statusLine, so a new hook is covered automatically"]
key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs
    - plugins/aoforge/hooks/gate-edits.test.js
    - plugins/aoforge/hooks/coexistence-guard.legacy.test.js
    - plugins/aoforge/aoforge/bin/aof-tools.cjs
    - plugins/aoforge/aoforge/bin/aoforge-watch.cjs
    - plugins/aoforge/hooks/auto-continue.js
    - plugins/aoforge/hooks/awareness-cache-populate.js
    - plugins/aoforge/hooks/changelog-on-tag.js
    - plugins/aoforge/hooks/classify-session.js
    - plugins/aoforge/hooks/coexistence-guard.js
    - plugins/aoforge/hooks/gate-bash-writes.js
    - plugins/aoforge/hooks/gate-commits.js
    - plugins/aoforge/hooks/gate-edits.js
    - plugins/aoforge/hooks/gate-executor-stop.js
    - plugins/aoforge/hooks/gate-interactive.js
    - plugins/aoforge/hooks/gate-skill-requires.js
    - plugins/aoforge/hooks/gh-flush.js
    - plugins/aoforge/hooks/guard-no-progress.js
    - plugins/aoforge/hooks/inject-handoff-results.js
    - plugins/aoforge/hooks/inject-org-context.js
    - plugins/aoforge/hooks/route-intent.js
    - plugins/aoforge/hooks/route-results.js
    - plugins/aoforge/hooks/statusline.js
    - plugins/aoforge/hooks/sync-runtime.js
    - plugins/aoforge/hooks/todo-sync.js
    - plugins/aoforge/hooks/upgrade-project.js
    - plugins/aoforge/hooks/verify-commits.js
    - plugins/aoforge/hooks/verify-completion.js
key-decisions:
  - "The CLI's observable for 'a legacy-prefixed variable is not read' is `estimate task --class code --raw`: with no calibration it names the calibration path it resolved, so a legacy CALIBRATION_PATH is visibly ignored (scratch HOME default named instead). Cheapest observable; no new CLI surface"
  - "coexistence-guard.legacy.test.js case 9 is flipped, not deleted: the legacy-prefixed skip variable no longer skips, and the queued notice names it (78-06's legacy-env finding). No other TRD owns the file, and the flipped case keeps coverage of the 3.1 behaviour"
  - "planning-layout.legacy.test.js (owned by 78-11) is left untouched although four of its gate-edits cases now fail: 78-11 rewrites that file to 'a legacy-only project is not a project', so flipping them here to 'planning artifact -> deny' would be wrong one TRD later"
duration: 10min
completed: 2026-10-16
status: complete
requirements-completed: []
tokens_input: 14401248
tokens_output: 55282
tokens_cache_read: 14226671
tokens_cache_write: 174383
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 78 TRD 10: Env Alias Removal Summary

**No AOForge process copies the pre-rename env prefix any more: the alias call is gone from the CLI, the watch daemon, all 21 registered hooks and the status line; gate-edits recognises only `.aoforge/` as a planning segment; and the inverted compat-entry contract keeps it that way.**

## Progress
- [x] Task 1: RED — invert the entry-point contract — 3ed49991
- [x] Task 2: GREEN — remove every alias call; single planning segment; comments — f282ea93

## What changed

- **Alias calls removed (one line plus its "Objective 72" comment each):** `aof-tools.cjs` (its 3-line comment and the call), `aoforge-watch.cjs`, and the hooks auto-continue, awareness-cache-populate, changelog-on-tag, classify-session, coexistence-guard, gate-bash-writes, gate-commits, gate-edits, gate-executor-stop, gate-interactive, gate-skill-requires, gh-flush, guard-no-progress, inject-handoff-results, route-intent, route-results, statusline, sync-runtime, todo-sync, upgrade-project, verify-commits and verify-completion. The statusline alias had its own `try`, so no other require was affected.
- **coexistence-guard.js:** `compat.aliasLegacyEnv(env)` removed from `run()`, and the `compat` entry dropped from `libs()` because nothing else used it. The header escape line no longer says the prefix is aliased.
- **gate-edits.js:** `PLANNING_DIR_NAMES = [NAMES.planningDir]`, and `PLANNING_SEGMENT_RE = /\/\.aoforge\//` (built from NAMES). `LEGACY` is no longer imported. The main() store-mode trigger and the planning-artifact allow now match `.aoforge/` only. The header, findPlanningDir, sharedPlanningDir and isAoforgeAgent comments no longer say the directory may be a legacy one or that the pre-rename agent namespace is trusted. `isAoforgeAgent = isOwnAgentType` is unchanged; 78-11 makes compat single-namespace.
- **Comments:** the "TRD 72-06 ... or for one release a legacy one" line became `// The planning directory is \`.aoforge/\` (compat.cjs).` in 13 hooks, including the unregistered draft `inject-org-context.js`, where only the comment changed. Also updated: verify-commits.js (2 comments) and gate-executor-stop.js (header), which no longer mention the pre-rename executor; upgrade-project.js findProjectRoot and noticesRel docs; and route-intent.js's renderDirective comment.
- **Left as they are (detection, not fallback):** the coexistence-guard header bullets that describe what it detects, the sync-runtime note that 78-06 removed the carry-over, the todo-sync and upgrade-project lines describing 78-04/78-07 detectors, and upgrade-project's legacyLayoutRoot comment, which 78-07 wrote to stay true before and after 78-11.
- **compat.cjs:** not edited. `aliasLegacyEnv` keeps its definition, and 78-12 deletes it.

## Test cases

- `compat-entry.repo.test.cjs` was rewritten. Old tests 7 (alias before the first `process.env` read) and 8b (the legacy skip variable allows) were replaced by:
  - 1: the entry-point list derivation (kept) and, for each entry point, no line mentions `aliasLegacyEnv`
  - 2a/2b/2c: gate-edits, ambient Write. With no variable it is denied. With only the legacy SKIP_EDIT_GATE it is still denied. With AOFORGE_SKIP_EDIT_GATE it is allowed.
  - 3a/3b: aof-tools with only a legacy CALIBRATION_PATH names the scratch HOME default, never that path. With AOFORGE_CALIBRATION_PATH it names that path (control).
  - Every spawn strips both prefixes and uses a scratch HOME.
- `gate-edits.test.js`: new describe "78-10 — only .aoforge/ is a planning segment" (case 4). It checks four things:
  - `<root>/<legacy>/STATE.md` is a markdown doc, not a planning artifact, with store mode on and off.
  - `<root>/<legacy>/config.json` is ambient-denied.
  - Control: the same paths under `.aoforge/` are still planning artifacts.
  - Subprocess: in a store-mode project, an ambient Write to `<root>/<legacy>/config.json` is denied, and `.aoforge/config.json` is allowed.
  - The legacy segment is built from `LEGACY.planningDir` and never spelled out.
- `coexistence-guard.legacy.test.js` case 9 was flipped (no cases deleted):
  - Spawned: `AOFORGE_SKIP_COEXISTENCE=1` still writes nothing. `<legacy>SKIP_COEXISTENCE=1` now queues one notice that names the variable.
  - In process: the legacy skip variable no longer returns `skip`, and the detector runs.
- **Removed cases:** compat-entry old 7 (per-entry-point "calls aliasLegacyEnv before process.env") and old 8b. Both were replaced by their inversions above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] coexistence-guard.legacy.test.js case 9 flipped (file not in files_modified)**
- **Found during:** Task 2
- **Issue:** 78-06 had handed this off: case 9 expected `<legacy>SKIP_COEXISTENCE=1` to skip, which held only while the alias ran.
- **Fix:** Flipped the case to "does not skip; the notice names the variable". Error recovery says to delete a case in a file this TRD does not own. No TRD owns this file (78-11's list does not include it), so flipping keeps the coverage and causes no conflict.
- **Files modified:** plugins/aoforge/hooks/coexistence-guard.legacy.test.js
- **Commit:** f282ea93

**2. Extra stale comments beyond the TRD's list**
- The TRD named the "TRD 72-06" planning comment and the gate-edits, verify-commits and gate-executor-stop namespace comments. The must-have ("no hook comment says the planning directory may be a legacy one") also required these:
  - gate-edits: the header rule 1 and the "Non-AOForge projects" line
  - upgrade-project: the findProjectRoot and noticesRel docs
  - route-intent: the renderDirective comment
- **Commit:** f282ea93

### Known failing (handed to 78-11, not fixed here by design)

`plugins/aoforge/hooks/planning-layout.legacy.test.js` is owned by 78-11, and both this TRD and the dispatch say not to edit it. Four of its gate-edits cases now fail, because a legacy-segment path is no longer a planning artifact or store-mode path:
- `4: layout legacy, a Write under .planning/ is a planning artifact`: the `x.json` write is now denied (compat still finds the legacy-only project until 78-11)
- `4b: layout both, a Write under either directory is a planning artifact`
- `4c: shouldGate names a path under either directory a planning artifact`
- `4d: layout legacy, store mode denies a Write to the generated STATE.md even with a marker`: the result is now `allow` (a markdown doc)

78-11's TRD already rewrites this file so that a legacy-only project is "not a project" for every hook. After that, these cases become "no ambient gate".

### Baseline integration check (merged waves 1-2)

The baseline full suite on 334db133 had no integration failures. The only failures were the 2 known requirements-agreement items (EST-11 / objective 75). No `fix(78-10)` commit was needed.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED | `node --test plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs plugins/aoforge/hooks/gate-edits.test.js` | 1 (148 tests, 29 fail: case 1 x24, 2b, 3a and 3 case-4 tests; every control passes) | PASS (fails for the right reason) |
| 2: GREEN | `rg -n "aliasLegacyEnv" plugins/aoforge --glob '!**/compat.cjs' --glob '!**/compat*.test.cjs'` | 1 (no match) | PASS |
| 2: GREEN | `node --test plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs 'plugins/aoforge/hooks/*.test.js'` | 1 (1605 tests, 1600 pass, 4 fail, all in 78-11's planning-layout.legacy.test.js, 1 skipped) | PASS for cases 1-4; 4 known handoff failures |
| verification | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test compat-entry.repo.test.cjs gate-edits.test.js` | 1 | FAIL (correct): 3a reported "the CLI read the legacy-prefixed variable: No estimate: no calibration file at .../legacy-prefix-calibration.json" |
| GREEN | `node --test compat-entry.repo.test.cjs 'hooks/*.test.js'` | 1 | Cases 1-4 PASS; the only failures are the 4 planning-layout.legacy cases handed to 78-11 |
| REFACTOR | none | - | - |

## Validation Gate Results

The full suite ran through `node --test` over `plugins/aoforge/**/*.test.cjs`, `plugins/aoforge/**/*.test.js` and `scripts/**/*.test.cjs`. It excluded `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs`, because its W-3 fish-shell test hangs until timeout on this machine.

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (baseline, 334db133) | full suite (392 files) | 1 | 12588 tests / 12535 pass / 2 fail (known requirements-agreement noise) / 51 skipped |
| test (final, f282ea93) | full suite (392 files) | 1 | 12596 tests / 12539 pass / 6 fail (2 known noise + 4 planning-layout.legacy cases handed to 78-11) / 51 skipped |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4
  - No `aliasLegacyEnv(` in any entry point.
  - Legacy SKIP_EDIT_GATE is ignored.
  - Only `.aoforge/` is a planning segment, and no hook comment claims a legacy fallback.
  - compat.cjs is untouched.
- Gate failures: the 4 planning-layout.legacy.test.js cases (78-11) and the 2 known requirements-agreement items.

## Left for later TRDs

- **78-11:**
  - Rewrite `hooks/planning-layout.legacy.test.js` cases 4, 4b, 4c and 4d. They fail now, as listed above.
  - `agent-types.legacy.test.js` still passes: only comments changed here.
- **78-12:**
  - Delete `aliasLegacyEnv` from compat.cjs. It now has no caller outside `compat.cjs` and `compat.legacy.test.cjs`.
  - Update the docs that still describe the alias:
    - `CLAUDE.md` line 69 (the compat bullet: "every hook and the CLI call it first")
    - `docs/USER-GUIDE.md` line 35
    - `docs/handoff-watcher-guide.md`, `docs/PROPOSAL-handoff-watcher.md` and `docs/PROPOSAL-github-system-of-record.md`, which mention legacy-prefixed skip variables

## Self-Check: PASSED

- FOUND: plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs
- FOUND: plugins/aoforge/hooks/gate-edits.test.js (78-10 describe block)
- FOUND: 3ed49991 (RED), f282ea93 (GREEN)
- Working tree clean apart from the untracked `amp`, which was never staged.
