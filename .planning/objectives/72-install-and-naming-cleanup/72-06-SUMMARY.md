---
objective: 72-install-and-naming-cleanup
trd: "06"
subsystem: hooks
tags: [aoforge-rename, planning-dir, hooks, legacy-fallback, rename-guard, prose]

requires:
  - phase: 72-02
    provides: "compat.cjs planningRoot/planningDirName/findProjectRoot; legacy-names.cjs NAMES/LEGACY"
  - phase: 72-03
    provides: "scripts/aoforge-rename.cjs --rules planning"
  - phase: 72-05
    provides: "libs on the resolver; legacy-layout-fixtures planningProject; the hook-test pins this TRD removes"
provides:
  - "Every hook resolves .aoforge/ first and a legacy .planning/ second (root lookups via compat.findProjectRoot, marker lookup via planningRoot locally and in the main checkout)"
  - "gate-edits: the planning-artifact path test and the store-mode precheck name both directories (PLANNING_SEGMENT_RE built from NAMES/LEGACY.planningDir)"
  - "hooks/planning-layout.legacy.test.js: 25-test hook contract over layouts aoforge, legacy, both and none"
  - "__fixtures__/legacy-layout-fixtures.cjs worktreePair({ layout, marker }) and markerText()"
  - "Every skill, agent, workflow, reference, template, the user guide, README, CLAUDE.md, site content and the live built-in inventories name .aoforge/"
  - ".gitignore: an .aoforge/ twin after each legacy .planning/ line"
  - "rename-guard.repo.test.cjs: a planningDir token (directory occurrences only, via the codemod's occurrenceKind) and two ALLOW entries"
  - "scripts/aoforge-rename.cjs: rename-guard ignore regions are kept by both passes"
affects: [72-08, 72-10, 72-12, 72-17, 72-21, 72-22]

tech-stack:
  added: []
  patterns:
    - "A hook's project lookup is compat.findProjectRoot(start, { maxUp: Infinity }) and its planning directory compat.planningRoot(root); a hook that needs the name for a message or a relative path uses the resolved directory's basename"
    - "A path test in a hook names both directories, built once from legacy-names.cjs (never from the filesystem)"
    - "The compat require sits after the aliasLegacyEnv line, so the env alias still runs first"
    - "The codemod and the rename guard share one notion of an ignore region"

key-files:
  created:
    - plugins/aoforge/hooks/planning-layout.legacy.test.js
  modified:
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs
    - plugins/aoforge/hooks/gate-edits.js
    - plugins/aoforge/hooks/gate-executor-stop.js
    - plugins/aoforge/hooks/upgrade-project.js
    - plugins/aoforge/hooks/route-intent.js
    - plugins/aoforge/hooks/verify-completion.js
    - "plugins/aoforge/hooks/{classify-session,gate-commits,guard-no-progress,inject-org-context,route-results,verify-commits,awareness-cache-populate,statusline}.js"
    - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
    - scripts/aoforge-rename.cjs
    - scripts/aoforge-rename.legacy.test.cjs
    - .gitignore
    - "plugins/aoforge/{skills,agents}/**, plugins/aoforge/aoforge/{workflows,references,templates,schemas}/** (prose, 159 + 5 files)"
    - "docs/USER-GUIDE.md, docs/built-in-sweep.md, docs/built-in-integration-status.md, README.md, CLAUDE.md, site/content/**, site/layouts/index.html, site/data/aoforge.json"

key-decisions:
  - "Hooks require compat.cjs directly (after the alias line) instead of a guarded require: the libraries always ship beside the hooks, and a stub tree without them now ends that hook with a non-blocking error instead of a silent no-op. gate-bash-writes' fail-open test still passes (its loadLibs catches)"
  - "Messages and relative paths a hook prints name the RESOLVED directory (route-intent directive, verify-completion resume reason, gate-executor-stop SUMMARY path, upgrade-project's info/exclude line), so a legacy project is told `.planning/` and a new one `.aoforge/`"
  - "The rename guard counts the legacy directory only where the codemod's occurrenceKind says `path` or `regex`; member access such as a config key is not the directory"
  - "The codemod gained ignore-region support (the TRD's recovery path) rather than a hand revert of CLAUDE.md, so a re-run is safe"
  - "The .gitignore twin is added for every legacy line, including the legacy-runtime notices name"

requirements-completed: [INST-02, INST-03]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 2
  tdd_evidence: true
  test_pairing: true

duration: 19min
completed: 2026-10-09
tokens_input: 38324435
tokens_output: 111276
tokens_cache_read: 38010418
tokens_cache_write: 313671
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 06: Hooks and prose speak `.aoforge/`, with the legacy fallback in the hooks Summary

**Every hook finds a project's planning tree at `.aoforge/` or, for one release, a legacy `.planning/` (gate-edits' artifact and store-mode tests and its marker lookup, locally and from a worktree, name both), every piece of prose names `.aoforge/`, and the rename guard now fails on the legacy directory name outside its allowlist.**

## Progress
- [x] Task 1: Fixture builder: main checkout plus worktree in each layout — 6afc9662
- [x] Task 2: Hooks resolve both layouts — e8ab54ec (RED), e5f40291 (GREEN)
- [x] Task 3: Prose pass and the guard's planning token — 9c2e8d4e (RED), 8e6424d3 (GREEN)

## What was built

- **`worktreePair({ layout, marker })`** in `legacy-layout-fixtures.cjs`: a git `planningProject`, a `git worktree add -b wt-branch`, and a live marker (the JSON shape `skill-active --start` writes, 8 h `expires_at`) in the main checkout's (`main`) or the worktree's (`local`) planning directory, or none. The marker line goes into the shared `info/exclude`, so both checkouts stay clean. Returns `{ main, worktree, home, tmp, env, markerPath, mainDir, worktreeDir, git, cleanup }`. Layout `none` with a marker throws.
- **Hook contract** `hooks/planning-layout.legacy.test.js` (25 tests). Each test spawns the real hook with a JSON payload, a fake HOME and state directories inside the fixture:
  - gate-edits 1-4d: ambient deny; a live marker allows; a worktree whose only marker is in the main checkout is allowed; Writes under the planning directory are artifacts, in layout `both` under either directory; `shouldGate` names both; store mode denies the generated STATE.md even with a marker.
  - gate-executor-stop 5/5b: absent SUMMARY gives one block, present gives none, and the reason names `<dir>/objectives/02-second/02-01-SUMMARY.md`.
  - route-intent 6: the directive names the resolved directory, layout `none` gets nothing.
  - upgrade-project + route-results 7: notices land in the resolved directory, the other name is never created, `info/exclude` names `<dir>/.aoforge-notices.json`, and route-results emits the notice.
  - verify-completion 8: the resume reason names `<dir>/STATE.md`. classify-session 8: the ambient preamble.
- **Hooks planning pass**: `aoforge-rename.cjs --rules planning --only plugins/aoforge/hooks --write` gave `rewrites=44 residuals=8`, the same as its dry run. The residuals and the walk-ups were then fixed by hand:
  - **Project lookups** go through `compat.findProjectRoot(start, { maxUp: Infinity })`: gate-edits, gate-commits, classify-session, guard-no-progress, inject-org-context, route-intent, route-results, verify-commits, verify-completion and upgrade-project. gate-executor-stop wraps it so an fs error still fails open.
  - **gate-edits**: `PLANNING_SEGMENT_RE`, built from `NAMES.planningDir`/`LEGACY.planningDir` with `escapeRegExp`, replaces the literal artifact regex. The store-mode precheck tests both names. The main checkout's marker directory is `planningRoot(mainRoot)`.
  - **gate-executor-stop**: `summaryFiles`/`trdDirFor` read `planningRoot(root, fsImpl)/objectives` inside their try. `summaryRelPath` and `summaryLocation` take the directory name from the found path.
  - **upgrade-project**: `noticesRel(root)` is `${planningDirName(root)}/${NAMES.notices}`, which feeds `ensureExcluded`.
  - **route-intent**: `renderDirective(matches, prompt, planningDirName = NAMES.planningDir)`. main passes the resolved basename.
  - **verify-completion**: the resume reason reads `${path.basename(planningDir)}/STATE.md`.
- **72-05 pins removed**: the `setPlanningDir(LEGACY.planningDir)` lines in five hook tests; `legacyLayoutCopy` in planning-verbs.e2e test 6, which now runs on `R.root`; `PLANNING = LEGACY.planningDir` in summary-pairing; the legacy project in summary-worktree test 2; the legacy scratch directory in compat-entry test 8. state-merge-wiring tests 8 and 9 are tightened to `NAMES.planningDir`.
- **Prose pass**: the TRD's `--only` list gave `rewrites=159 residuals=2` (the monorepo doctor skip lists, which are already right). A second run over `docs/built-in-sweep.md`, `docs/built-in-integration-status.md`, `plugins/aoforge/aoforge/schemas`, `site/layouts` and `scripts/gen-docs-data.cjs` gave `rewrites=5 residuals=3` (description strings, renamed as intended). `site/data/aoforge.json` was regenerated with `node scripts/gen-docs-data.cjs`.
- **CLAUDE.md**: the transition note (the ignore region) is byte-identical. `git diff HEAD~1 -- CLAUDE.md` touches no line of it.
- **.gitignore**: each of the 12 legacy `.planning/...` lines now has its `.aoforge/...` twin directly after it, under a one-line header comment.
- **Rename guard**: a `planningDir` token (`LEGACY.planningDir` not followed by an identifier character, counted only for codemod `occurrenceKind` `path`/`regex`). New ALLOW entry for the monorepo doctor (`.gitignore` was already allowed). Test 5c builds both directory names (the 72-05 pass had made both `.aoforge`). Test 6 also scans the guard's own source. New tests 8a-8d: token present, `cat <legacy>/STATE.md` gives one finding, member access gives none, a regex gives one. The tree passes.
- **Codemod ignore regions**: `maskIgnoreRegions` swaps each line from an ignore-start marker through the next ignore-end for a placeholder, one per line so residual line numbers stay true. `restoreIgnoreRegions` swaps them back. An unclosed region throws. It applies to both passes. Tests 14 (3 cases).

## Hand-off

- **72-08 (migrations)**: the legacy case of hook contract test 7 expects the upgrade hook's notices in `.planning/`. Once migration 0012 (auto) moves the directory inside that same hook run, the notices land in `.aoforge/`. Update the expectation in 72-08, or keep 0012 out of that case.
- **72-10**: gate-executor-stop still matches only `aoforge:executor` (`EXECUTOR_AGENT_TYPE`). Legacy agent types are 72-10's.
- **72-07/72-12**: `hooks/gate-interactive.js` joins `home/.aoforge/aoforge-watch.pid`. That is the user dot directory, not the planning directory, so it was left alone.
- **72-17**: the user guide does not describe the `.planning/` fallback or W066 yet. The migration guide should.
- **72-21**: this repository's own `.planning/` tree is SKIP'd by the codemod and the guard (planning-tree), so the move needs no guard change.
- **Deferred (pre-existing, not in scope)**: `gate-executor-stop.trdDirFor` locates only an exact `<id>-TRD.md`. For a named TRD (`<id>-<slug>-TRD.md`, this repository's convention), the block reason falls back to the generic "the TRD's SUMMARY.md" wording instead of naming the path. Hook contract test 5b uses an exact-name TRD for that reason.
- `summary-worktree.test.cjs` `project()` keeps its `planningDir` option (default `.aoforge`). No test passes it any more.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: worktree pair fixture | `node -e "…worktreePair({layout:'legacy'})…existsSync(p.worktree)…"` (prints `true`), plus a matrix check over layouts aoforge/legacy/both × marker main/local/none (marker where asked, both checkouts `git status` clean, no leak after cleanup) and `planning-layout.legacy.test.cjs` 48/48 | 0 | PASS |
| 2: hooks resolve both layouts | `node --test plugins/aoforge/hooks/planning-layout.legacy.test.js 'plugins/aoforge/hooks/*.test.js'` | 0 (1,354 pass, 0 fail) | PASS |
| 2: done grep | `rg -n "'\.planning'\|\\\\\.planning" plugins/aoforge/hooks -g '!*.test.js'` | 1 (no output) | PASS |
| 3: guard and repo gates | `node --test rename-guard.repo.test.cjs doc-refs.repo.test.cjs planning-writes.repo.test.cjs` (+ builtin-sweep.repo.test.cjs, state-merge-wiring.repo.test.cjs) | 0 (39/39; with the two extra, 56/56 and 12/12) | PASS |
| 3: CLAUDE.md note | `git diff HEAD~1 -- CLAUDE.md` | only lines outside the ignore region | PASS |
| 3: codemod regions | `node --test scripts/aoforge-rename.legacy.test.cjs` | 0 (54/54) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test plugins/aoforge/hooks/planning-layout.legacy.test.js` | 1 (25 tests: 13 fail = every `aoforge` layout case plus 4b and 4c; 12 pass = the legacy and `none` cases) | FAIL (correct) |
| GREEN (Task 2) | same | 0 (25 pass) | PASS (correct) |
| RED (codemod regions) | `node --test --test-name-pattern "^14\." scripts/aoforge-rename.legacy.test.cjs` | 1 (3 fail) | FAIL (correct) |
| GREEN (codemod regions) | `node --test scripts/aoforge-rename.legacy.test.cjs` | 0 (54 pass) | PASS (correct) |
| RED (Task 3) | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` | 1 (test 2: 1,008 findings; 8a-8d pass) | FAIL (correct) |
| GREEN (Task 3) | same + doc-refs + planning-writes | 0 (39 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (after Task 2) | `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'` | 1: 11,642 tests, 11,606 pass, 35 skipped, 1 fail = E2E1 (baseline) | PASS (baseline) |
| test (after Task 3) | same | 1: 11,649 tests, 11,612 pass, 35 skipped, 2 fail = E2E1 (baseline) and awareness G2 (fixed in 8e6424d3, awareness.test.cjs 0 fail) | PASS (baseline) |
| test (final tree, 8e6424d3) | same | 1: 11,649 tests, 11,614 pass, 34 skipped (one fewer than the 35 baseline), 1 fail = E2E1 (baseline) | PASS (baseline) |

`npm test` itself was not run: it includes `micro.test.cjs`, which hangs on commit signing (72-04 and 72-05 ran the suite the same way). E2E1 clears after `roadmap update-job-progress` (state update below).

## Discovered commands

None. The test command came from the stack profile and the TRD; `node scripts/gen-docs-data.cjs` is the package's `docs:data` script.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The codemod had no notion of the ignore region**
- **Found during:** Task 3 (TRD recovery path)
- **Fix:** `maskIgnoreRegions`/`restoreIgnoreRegions` in `processFile` (both passes), with 3 tests (RED first). CLAUDE.md's transition note came through the prose pass unchanged.
- **Commit:** 9c2e8d4e (tests), 8e6424d3 (implementation)

**2. [Rule 1 - Bug] planning-writes.audit scanner self-checks**
- **Issue:** the self-check pinned the old sort position of the planning token and expected gate-edits to hold a planning-directory literal, which it no longer does (the names come from legacy-names.cjs).
- **Fix:** the expected order follows the new token; the real-hook check asserts `.git` (still a literal there).
- **Commit:** e5f40291

**3. [Rule 3 - Blocking] Guard findings outside the TRD's `--only` list**
- **Issue:** after the prose pass the guard still found 25 lines. They were in the two live built-in inventories, the stack-profile schema description, `site/layouts/index.html`, `scripts/gen-docs-data.cjs` and the generated `site/data/aoforge.json`, plus comments in five bin tests (72-05's "`.planning/` until 72-21") and two scripts.
- **Fix:** a second codemod run over the prose files. `site/data/aoforge.json` was regenerated; that also picked up two items of earlier source drift, the doctor skill's description line and the `validate` subcommand `requirements`. The comments were reworded to "the legacy name" / "a planning directory".
- **Commit:** 8e6424d3

**4. [Rule 1 - Bug] A one-character-shorter name made a codebase-mapper line a write directive**
- **Issue:** `.aoforge/` is one character shorter than the legacy name. That brought `codebase/` within the audit's 80-character gap of "Write", and the `planning draft` call that satisfies the directive sat 4 lines away (window 3).
- **Fix:** the blank line before the code fence was removed, so the verb call is 3 lines below.
- **Commit:** 8e6424d3

**5. [Rule 1 - Bug] awareness G2 counted one `.awareness-cache.json` line in .gitignore**
- **Fix:** it now expects exactly one line per planning-directory name.
- **Commit:** 8e6424d3

### Choices the TRD left open, or where it was inexact

- **The contract has 25 tests, not 7.** Cases 1-7 run per layout. Besides those it has layout `both` (4b), a `shouldGate` unit (4c), store mode (4d), the block-reason path (5b) and case 8 (verify-completion and classify-session), which the must-haves name.
- **Case 5** uses the TRD's named `01-01-x-TRD.md` for block/no-block. The path in the reason is checked on an exact-name TRD (`02-01-TRD.md`) because the hook's `trdDirFor` does not locate named TRDs (deferred, see Hand-off).
- **Case 4** adds a non-markdown `x.json`. Markdown is allowed anyway, so only a non-markdown file shows the artifact test.
- **The guard's doctor exemption is an ALLOW entry, as the TRD says.** A per-token mask of the codemod's planning manual preserve would keep the doctor scanned for the product word. That would be a narrower alternative for later.
- **The estimate gate**: the orchestrator had already recorded wave 5's start (00:55:44Z), so `estimate start` was not re-run, because that would rewrite the run state. `estimate trd 72-06` = 10 min (P90 19 min), $4.29 (P90 $6.79), confidence low.

## Post-TRD Verification

- Auto-fix cycles used: 2 (planning-writes audit self-check after the hooks pass; awareness G2 after the prose pass)
- Must-haves verified: 6/6
  - gate-edits in both layouts: artifact rules, store-mode denial and the marker, locally and from a worktree (cases 1-4d).
  - gate-executor-stop, verify-completion, route-intent, classify-session and the upgrade-project notices in both layouts (cases 5-8).
  - The prose names `.aoforge/`. `rg -n '\.planning' plugins/aoforge -g '!*legacy*'` shows only member access (`calls.planning`, `p.planning(...)`, `cfg.planning`).
  - The `.gitignore` twins are in place.
  - The guard catches the legacy name and passes on the tree.
  - The full suite is at the 72-05 baseline.
- Gate failures: none beyond the E2E1 baseline.

## Self-Check: PASSED

- Files found: hooks/planning-layout.legacy.test.js, __fixtures__/legacy-layout-fixtures.cjs (worktreePair), rename-guard.repo.test.cjs (contains `planningDir`), scripts/aoforge-rename.cjs (ignore regions), .gitignore (twins); hooks/gate-edits.js builds its path test from `planningDir`.
- Commits found: 6afc9662, e8ab54ec, e5f40291, 9c2e8d4e, 8e6424d3.
- `git status --porcelain --untracked-files=no` empty after the last task commit.
