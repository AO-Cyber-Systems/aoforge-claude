---
objective: 40-tooling-correctness
trd: "05"
subsystem: tooling
tags: [ripgrep, ci-guard, gitignore, override, remove-objective, doc-correctness]

# Dependency graph
requires: []
provides:
  - "`bin/lib/rg-flag-guard.test.cjs`: a CI guard over live plugin prose (agents, skills, workflows, references, templates; 166 files). It fails with `file:line: text` on any rg invocation whose arguments contain a single-dash short-flag token with `E`"
  - "The ripgrep rule (`-E` is `--encoding`; use `rg -n -e PATTERN` / `rg -nP PATTERN`) is stated in trd-spec.md, which the planner reads, and in verification-patterns.md, which the executor and verifier read"
  - "`bin/lib/gitignore-markers.test.cjs`: every non-null override.cjs `GATES` marker plus a bare `LOG_FILE` must have a `.planning/<name>` line in the repo `.gitignore`"
  - "`.planning/.edit-override` is gitignored"
  - "remove-objective.md takes integer objective numbers; legacy (pre-v1.2) decimal directories are accepted for removal only"
affects: [planner TRD verify/done commands, executor/verifier search checks, override gate markers, /devflow:objective remove]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prose guard as a test file: the detector lives in the test and walks the scan set with doc-refs.cjs `walkFiles` (read-only reuse). The scan set uses the same glob strings as doc-refs.repo.test.cjs"
    - "Sensitivity controls as inline strings in the test, never as files in the scanned tree, so the guard's own fixtures cannot trip it"
    - "A config-derived guard: the gitignore check reads `GATES`/`LOG_FILE` from override.cjs, so a new file-backed gate marker is checked with no test edit"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs
    - plugins/devflow/devflow/bin/lib/gitignore-markers.test.cjs
    - .planning/objectives/40-tooling-correctness/40-05-SUMMARY.md
  modified:
    - plugins/devflow/devflow/references/trd-spec.md
    - plugins/devflow/devflow/references/verification-patterns.md
    - .gitignore
    - plugins/devflow/devflow/workflows/remove-objective.md

key-decisions:
  - "The detector is defined in the test file. No new lib module, and doc-refs.cjs is not edited"
  - "The guidance never writes an rg command word directly before a short-flag cluster containing E. The bad form appears only as the backticked `-nE` cluster, and the backtick ends the detector's argument capture"
  - "In trd-spec.md the rule sits directly after the TRD template block, next to the `<verify>`/`<done>` lines it governs. In verification-patterns.md it is a new `<search_commands>` section (`## Search commands in verify blocks`) between `</core_principle>` and `<stub_detection>`, so it stays outside the stub-pattern tag rather than nested inside it"
  - "The verification-patterns wording names the real failure mode, which was checked live: rg exits 2 with `unknown encoding: a|b` and prints nothing to stdout, so a 'prints nothing' check passes for the wrong reason"
  - "missingMarkers accepts only an exact `.planning/<name>` or `/.planning/<name>` line. Comments and `!` negations never count as coverage"

patterns-established:
  - "Tie every file-backed runtime marker to a gitignore line through a test that reads the marker registry, not a hand-kept list"

requirements-completed: [TOOL-03, TOOL-04, TOOL-08]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 4min
completed: 2026-09-28
---

# Objective 40 TRD 05: ripgrep flag rule + CI guard, remove-objective integer wording, `.edit-override` gitignore + guard Summary

**This TRD fixes three file-disjoint defects and adds a cheap guard for two of them. The ripgrep rule (in `rg`, `-E` is `--encoding`; use `rg -n -e` / `rg -nP`) is now written where planners (trd-spec.md) and executors/verifiers (verification-patterns.md) read it. A new CI guard fails on any rg short-flag cluster containing `E` across the 166 live plugin-prose files. `.planning/.edit-override` is gitignored, and a second guard derives the required gitignore lines from override.cjs `GATES`/`LOG_FILE`. remove-objective.md no longer presents decimal objective numbers as a live scheme.**

## Performance

- Start: 2026-09-28T16:11:02Z
- End: 2026-09-28T16:15:30Z
- Tasks: 3/3 (5 code commits: RED+GREEN, RED+GREEN, docs; plus this docs commit)
- Files: 6 (+281/−1): 2 new test files, 2 references, `.gitignore`, 1 workflow line

## Accomplishments

1. **`rg-flag-guard.test.cjs`** (16 tests):
   - `findRgFlagMisuse(text)` finds an `rg` command word (at line start or after whitespace, a backtick, `|`, `;`, `&` or `(`). It takes the argument run up to the next separator or backtick and flags the first single-dash token matching `^-[A-Za-z]*E[A-Za-z]*$`. It records `{line, text, token}`, with at most one finding per line.
   - Sensitivity cases:
     - 5 hits: the `-nE` cluster, a bare `-E`, the `-inE` cluster, a hit after a pipe, and a multi-line text that checks the 1-based line number.
     - 7 no-hits: `-n -e`, `-nP`, grep/egrep with `-E`, `--encoding`, `-n -e 'foo -E'`, and ripgrep prose with no command word.
   - Repo cases: the scan set has 166 files, includes planner.md and trd-spec.md, and has 0 `.planning/` paths. The main gate finds 0 findings. The guidance check passes in both references.
2. **The rule text** was added to trd-spec.md (1 paragraph after the template) and verification-patterns.md (a new `<search_commands>` section). Both pass the guard.
3. **`gitignore-markers.test.cjs`** (5 tests):
   - `fileBackedMarkers(GATES, LOG_FILE)` returns `['.edit-override', '.override-log.jsonl']`.
   - `missingMarkers(text, markers)` passes 4 sensitivity/unit cases.
   - The repo gate passes.
4. **`.gitignore`** now has `.planning/.edit-override` at line 50, directly after `.planning/.override-log.jsonl`. `git check-ignore -v` confirms `.gitignore:50`.
5. **remove-objective.md:16** now uses the TRD's exact integer wording. The diff is 1 line (+1/−1). Legacy decimal removal is still real (objective.cjs:386/496).

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | 61f9c53 | test(40-05): failing rg flag guard sensitivity + guidance cases |
| 1 | GREEN | 74d2dc3 | fix(40-05): state the ripgrep -E rule and guard plugin prose against it |
| 2 | RED | f94da67 | test(40-05): failing gitignore guard for override markers |
| 2 | GREEN | f5dd06e | fix(40-05): gitignore .planning/.edit-override |
| 3 | — | 0c58a3f | docs(40-05): remove-objective takes integer objective numbers |

## Deviations from Plan

**None in scope or files.** The TRD executed as written, and only the 6 files in `files_modified` were touched. The main gate found 0 live hits, so the error-recovery path was not needed. No EXEMPT list exists.

The additions below go beyond the Test list. They add coverage only and do not change scope:

- **Case 1**: each hit also asserts the reported `token` and `line`. A multi-line case proves line numbering, so the `file:line` in the failure message is correct.
- **Case 5**: the check uses `assert.ok(regex.test(text))` instead of `assert.match`. On failure, `assert.match` dumps the whole reference file into the output. This was found in the first RED run and changed before the RED commit.
- **Case 6**: also asserts that a commented-out or `!`-negated line is not coverage.
- **Case 6b**: unit-checks `fileBackedMarkers`. Null gates are dropped and a non-bare LOG_FILE is dropped. The live exports yield `.edit-override`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED | `node --test plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs` | 1 | PASS (7/16 fail as intended: case 1 ×5, case 5 ×2; cases 2-4 pass against the stub) |
| 1: GREEN | `node --test plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS (26/26) |
| 1: done | `rg -n -e '--encoding' plugins/devflow/devflow/references/trd-spec.md plugins/devflow/devflow/references/verification-patterns.md` | 0 | PASS (2 lines: trd-spec.md:116, verification-patterns.md:27) |
| 1: done | `git diff --stat HEAD~2 -- .planning` | 0 | PASS (empty) |
| 1: fact check | ripgrep with the `-nE` cluster and pattern `'a|b'` against `.gitignore` | 2 | Confirms `unknown encoding: a|b` (the rule's premise) |
| 2: RED | `node --test plugins/devflow/devflow/bin/lib/gitignore-markers.test.cjs` | 1 | PASS (case 7 fails naming `.edit-override`; 4 helper cases pass) |
| 2: GREEN | `node --test plugins/devflow/devflow/bin/lib/gitignore-markers.test.cjs` | 0 | PASS (5/5) |
| 2: done | `rg -n -e '^\.planning/\.edit-override$' .gitignore` | 0 | PASS (1 line: 50) |
| 2: done | `git check-ignore -v .planning/.edit-override` | 0 | PASS (`.gitignore:50`) |
| 3 | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs` | 0 | PASS (26/26) |
| 3: done | `rg -n -e 'integer or decimal' …/remove-objective.md` / `rg -n -e 'no longer created' …/remove-objective.md` | 1 / 0 | PASS (0 lines / 1 line) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs` | 1 | FAIL (correct): cases 1 and 5 |
| GREEN (T1) | `node --test plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS (correct): 26/26 |
| RED (T2) | `node --test plugins/devflow/devflow/bin/lib/gitignore-markers.test.cjs` | 1 | FAIL (correct): case 7, `actual: ['.edit-override']` |
| GREEN (T2) | `node --test plugins/devflow/devflow/bin/lib/gitignore-markers.test.cjs` | 0 | PASS (correct): 5/5 |
| REFACTOR | n/a | — | none needed |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| TRD verification | `node --test …/rg-flag-guard.test.cjs …/gitignore-markers.test.cjs …/doc-refs.repo.test.cjs` | 0 | PASS (31/31) |
| Historical records | `git status --short .planning/objectives/38-doc-auto-correction` | 0 | PASS (empty) |
| Related suites | `node --test hooks/gate-edits.test.js bin/lib/{awareness,override,telemetry,skill-route}.test.cjs` | 0 | PASS (all) |
| Full suite (regression) | `node --test 'plugins/devflow/**/*.test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 | 4234 tests / 4200 pass / 2 fail / 32 skipped. Neither failure comes from this TRD (below) |

**Full-suite failures, both outside this TRD:**
1. `bin/handoff-e2e.test.cjs:795` is the pre-existing MA-7 failure in the baseline.
2. `bin/lib/roadmap-reconcile.test.cjs:984`, E2E1 SELF-TEST, is a self-test of this repo's ROADMAP.md. It reports `trd_summary_exists` drift for 40-01..40-04: those SUMMARYs exist, but their ROADMAP checkboxes are still `[ ]`. This is in-flight drift from wave 1, and after this SUMMARY lands it will list 40-05 too. ROADMAP.md is owned by TRD 40-06, and this TRD is barred from editing it. None of the 6 files this TRD changes is read by the reconciler.

Test count delta vs the dispatch baseline (4168): +21 from this TRD (16 + 5). The rest comes from 40-01..40-04.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 truths:
  - the scan set covers the 5 trees via `walkFiles` (166 files) and never touches `.planning/`
  - the sensitivity hits and no-hits exactly match the TRD list
  - the rule text is in both references and passes the guard
  - the `.gitignore` line is present, the guard is derived from GATES/LOG_FILE, and the `.edit-override` sensitivity case passes
  - remove-objective.md:16 uses the integer wording
  - doc-refs.repo.test.cjs passes
- Wiring: rg-flag-guard requires `walkFiles` from ./doc-refs.cjs (unedited). gitignore-markers requires `GATES`, `LOG_FILE` from ./override.cjs.
- Gate failures: None
- Repo `.planning/STATE.md` / `.planning/ROADMAP.md`: untouched.

## Follow-ups

1. **No gitignore scaffolding for markers.** adopt and new-project write no `.planning/.*` marker gitignore entries, so user projects do not get `.planning/.edit-override`, `.skill-active`, `.override-log.jsonl` and the rest. The line `- No additional gitignore entries needed` in `workflows/new-project.md:491` is stale.
2. **adopt.cjs `TRANSIENT_COMMIT_EXCLUDES`** (adopt.cjs:691) lists `.skill-active`, the inferences file and `.devflow-notices.json`. It could also include `.planning/.edit-override`.
3. **Narrower scan set than doc-refs.** The rg guard's scan set is narrower than doc-refs.repo.test.cjs's. It skips `plugins/devflow/devflow/bin/**/*.cjs`, `plugins/devflow/hooks/**/*.js`, README.md, CLAUDE.md, docs/USER-GUIDE.md, site/content and .github. This is deliberate per the TRD: bin holds the guard's own fixtures, so bin/*.test.cjs cannot be scanned. A later widening could add hooks, README, CLAUDE.md, USER-GUIDE and site/content, with bin limited to non-test `.cjs`.
4. **ROADMAP drift.** The E2E1 roadmap-reconcile self-test stays red until TRD 40-06 ticks the objective-40 TRD checkboxes in ROADMAP.md.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs, plugins/devflow/devflow/bin/lib/gitignore-markers.test.cjs, references/trd-spec.md (rule at :116), references/verification-patterns.md (rule at :27), .gitignore (:50), workflows/remove-objective.md (:16)
- FOUND commits: 61f9c53, 74d2dc3, f94da67, f5dd06e, 0c58a3f on feat/stack-profile-loader above base 7a645f4
