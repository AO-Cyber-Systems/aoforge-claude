---
objective: 56-objective-number-correctness
trd: "01"
subsystem: testing
tags: [regex, escape, repo-guard, text-escape, node-test]

# Dependency graph
requires:
  - objective: 54-codeql-cleanup
    provides: lib/text-escape.cjs (escapeRegExp, objectiveNumPattern, mdCell)
provides:
  - regex-escape.repo.test.cjs, a repo guard that fails CI on a hand-rolled regex escape in production df-tools or hooks
  - every production regex escape routed through text-escape.cjs escapeRegExp (12 hand-rolled sites removed)
  - 5 formerly unescaped regex-source interpolations wrapped in escapeRegExp
affects: [56-02-exact-objective-lookups, 56-03-id-shaped-requirements, 56-04-roadmap-field-labels]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Regex sources built from data go through require('./text-escape.cjs').escapeRegExp; hooks use '../devflow/bin/lib/text-escape.cjs'"
    - "Repo guard: static line scan with comment skip, path-exact exemption and planted mkdtemp self-tests"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/state.cjs
    - plugins/devflow/devflow/bin/lib/gh-hierarchy.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs.cjs
    - plugins/devflow/devflow/bin/lib/planning-entity-verbs.cjs
    - plugins/devflow/devflow/bin/lib/frontmatter.cjs
    - plugins/devflow/devflow/bin/lib/stack-verify.cjs
    - plugins/devflow/devflow/bin/lib/watcher-daemon.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.cjs
    - plugins/devflow/devflow/bin/lib/planning-import.cjs
    - plugins/devflow/hooks/gate-executor-stop.js
    - plugins/devflow/devflow/bin/lib/state.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-ci.test.cjs
    - plugins/devflow/devflow/bin/lib/watcher-daemon.test.cjs
    - plugins/devflow/devflow/bin/lib/frontmatter.test.cjs
    - plugins/devflow/hooks/gate-executor-stop.test.js

key-decisions:
  - "The regex-escape guard exempts lib/text-escape.cjs by its path relative to the scanned root, not by basename, so a copy of the canonical escape elsewhere is still reported"
  - "The guard scans both .cjs and .js under devflow/bin and hooks/, and prunes __fixtures__ and node_modules; test files keep their own local escapes"

patterns-established:
  - "Regex escape: one helper (text-escape.cjs escapeRegExp), enforced by regex-escape.repo.test.cjs"

requirements-completed: [ONUM-01]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 11min
completed: 2026-10-05
---

# Objective 56 TRD 01: One regex escape, guarded in CI Summary

**All 12 hand-rolled regex escapes in df-tools and the hooks now go through `text-escape.cjs` `escapeRegExp`. Five unescaped regex-source interpolations are wrapped. `regex-escape.repo.test.cjs` fails CI, naming `file:line kind`, when a new hand-rolled escape appears.**

## Progress
- [x] Task 1: Hand-built planted fixtures + the regex-escape repo guard (RED) — 8b78d6bc
- [x] Task 2: Delete the five module-level escapeRe lambdas — e7be9639
- [x] Task 3: Inline escapes and unescaped interpolations to GREEN — RED e9b04e31, GREEN 530aeef4

## Performance

- **Started:** 2026-10-05T16:06:03Z
- **Completed:** 2026-10-05T16:16:35Z
- **Duration:** about 11 min
- **Tasks:** 3/3
- **Files modified:** 16, 1 of them created

## Accomplishments

### Repo guard (new)
`plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs` walks every production `.cjs` / `.js` file under `devflow/bin` and `hooks/`. It flags two shapes:
- `meta-escape`: a `'\\$&'` replacement in any quote style.
- `dot-escape`: `.replace('.', '\\.')` or `.replace(/\./g, '\\.')`.

It skips test files, `__fixtures__/`, `node_modules/`, comment lines and `lib/text-escape.cjs`. The exemption is by path. Its tests:
- **0**: the hand-written planted lines are the source text they claim to be, checked against `String.raw`.
- **1**: the live tree is clean.
- **2**: the walk is not vacuous. It covers at least 100 files, including `hooks/`, `lib/migrations/`, `state.cjs` and the gate hook, and no test or fixture file is scanned.
- **3**: `text-escape.cjs` holds the canonical escape and is skipped.
- **4**: planted positives are reported with file, line and kind. The cases are both quote styles, both dot forms, a `.js` hook, and `lib/migrations/text-escape.cjs`, which proves the exemption is path-exact.
- **5**: planted negatives are not reported. These are test files, fixtures, `lib/text-escape.cjs`, a `.md` file, `//`, `/* */` and ` * ` comment lines, `slug.replace(/\./g, '_')`, `version.replace('.', '_')` and `escapeRegExp(s)`.

### 12 hand-rolled sites removed (pre-change file:line)
| # | Site | Change |
|---|---|---|
| 1 | `lib/state.cjs:106` (stateReplaceField) | `escapeRegExp(fieldName)` |
| 2 | `lib/state.cjs:129` (sessionReplacePlainField) | `escapeRegExp(label)` |
| 3 | `lib/state.cjs:200` (cmdStateGet) | `escapeRegExp(section)` |
| 4 | `lib/state.cjs:241` (cmdStatePatch) | `escapeRegExp(field)` |
| 5 | `lib/state.cjs:276` (cmdStateUpdate) | `escapeRegExp(field)` |
| 6 | `lib/gh-hierarchy.cjs:267` | `escapeRe` lambda deleted; call at :276 uses `escapeRegExp` |
| 7 | `lib/planning-verbs.cjs:567` | `escapeRe` lambda deleted; call at :600 uses `escapeRegExp` |
| 8 | `lib/planning-entity-verbs.cjs:511` | `escapeRe` lambda deleted; calls at :528 and :551 use `escapeRegExp` |
| 9 | `lib/frontmatter.cjs:222` | `escapeRe` lambda deleted; call at :269 uses `escapeRegExp` |
| 10 | `lib/watcher-daemon.cjs:187` (_redactSecrets) | `escapeRegExp(sec.value)` |
| 11 | `lib/stack-verify.cjs:655` | `escapeRe` lambda deleted; calls at :676 and :688 (x3) use `escapeRegExp` |
| 12 | `hooks/gate-executor-stop.js:300` (summaryExists) | `escapeRegExp(id)` via `require('../devflow/bin/lib/text-escape.cjs')` |

### 5 unescaped interpolations wrapped (pre-change file:line)
| # | Site | Before | After |
|---|---|---|---|
| 1 | `lib/state.cjs:100` stateExtractField | `${fieldName}` | `${escapeRegExp(fieldName)}` |
| 2 | `lib/state.cjs:607` cmdStateSnapshot extractField | `${fieldName}` | `${escapeRegExp(fieldName)}` |
| 3 | `lib/stack-ci.cjs:304` expandsAny | `${n}` twice | `n` escaped once per name, used in both alternatives |
| 4 | `lib/planning-import.cjs:111` frontmatterField | `${key}` | `${escapeRegExp(key)}` |
| 5 | `lib/frontmatter.cjs:332` parseMustHavesBlock | `${blockName}` | `${escapeRegExp(blockName)}` (`childIndent` unchanged) |

The replacement semantics of state.cjs's `content.replace(pattern, `$1${value}`)` were left alone, as the TRD required.

## Task Commits

1. **Task 1: repo guard (RED)**: `8b78d6bc` (test)
2. **Task 2: module-level escapeRe lambdas**: `e7be9639` (refactor)
3. **Task 3 RED: literal-match tests**: `e9b04e31` (test)
4. **Task 3 GREEN: inline escapes + interpolations**: `530aeef4` (fix)

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs`: new repo guard (scanner, planted self-tests, live-tree assertion)
- `plugins/devflow/devflow/bin/lib/state.cjs`: 5 inline escapes plus 2 interpolations through `escapeRegExp`
- `plugins/devflow/devflow/bin/lib/{gh-hierarchy,planning-verbs,planning-entity-verbs,frontmatter,stack-verify}.cjs`: local `escapeRe` deleted, `escapeRegExp` imported
- `plugins/devflow/devflow/bin/lib/{watcher-daemon,stack-ci,planning-import}.cjs`: escape through `escapeRegExp`
- `plugins/devflow/hooks/gate-executor-stop.js`: shared escape. The doc comment now says it requires only the dependency-free `text-escape.cjs`.
- Tests: `state.test.cjs` (56-01 #6), `stack-ci.test.cjs` (C17a/b), `watcher-daemon.test.cjs` (TP-11), `frontmatter.test.cjs` (56-01 #9), `hooks/gate-executor-stop.test.js` (56-01 #10)

## Decisions Made
- **Path-exact exemption.** The TRD sketch exempted by basename. I made it stricter: only `lib/text-escape.cjs`, relative to the scanned root, is exempt. A planted positive (`lib/migrations/text-escape.cjs`) proves a copy is still reported.
- **Both extensions everywhere.** The guard scans `.cjs` and `.js` under both roots, which is a superset of the sketch. `hooks/lib/` is covered.
- **Test 3 survives 56-02.** It asserts that `text-escape.cjs` contains *at least one* `meta-escape`, not exactly one. TRD 56-02 adds `boldLabelPattern` to that file in the same wave.
- **Extra pins beyond the test list.** frontmatter #9 adds `'artifact.'` and `'key_link.'`, which both return `[]`. The unescaped pattern compiled `.` as a wildcard and read `artifacts:`; that was checked with `node -e` (`old pattern matches artifacts: true`). TP-11 adds a near-miss string that differs only at the `.` and must survive redaction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] node-pty unavailable in the worktree**
- **Found during:** the Task 2 full-suite gate
- **Issue:** `lib/watcher-shell.cjs` loads `node-pty`, which is installed only in the main checkout's untracked `node_modules`. The worktree had none, so 10 PTY daemon tests (devflow-watch, handoff-e2e) could not start, and Task 3 changes `watcher-daemon.cjs`. Differential: the same devflow-watch test passes on the base checkout.
- **Fix:** an untracked symlink `node_modules -> /Users/justin/dev/devflow-claude/node_modules` in the worktree root. It is gitignored through `.git/info/exclude` and is never committed. With it, the daemon tests run, and all of them pass except MA-7 (pre-existing, see below).
- **Files modified:** none tracked
- **Commit:** none (environment only)

Nothing else deviated. The TRD was otherwise executed as written.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: repo guard (RED) | `node --test plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs` | 1 | PASS: only test 1 fails, listing exactly the 12 sites; tests 0, 2-5 pass |
| 2: escapeRe lambdas | `node --test gh-hierarchy.test.cjs planning-verbs.test.cjs planning-entity-verbs.test.cjs frontmatter.test.cjs stack-verify.test.cjs` | 0 | PASS: 226/226. `rg "\bescapeRe\b" lib --glob "!*.test.cjs"` prints nothing, and the guard lists 7 sites |
| 3: GREEN | `node --test regex-escape.repo.test.cjs state.test.cjs stack-ci.test.cjs watcher-daemon.test.cjs planning-import.test.cjs hooks/gate-executor-stop.test.js frontmatter.test.cjs` | 0 | PASS: 278/278, repo guard test 1 green |
| 3: hook loads | `node -e "require('<worktree>/plugins/devflow/hooks/gate-executor-stop.js')"` | 0 | PASS: no output |
| Verification: residual escapes | `rg -n -F "'\\$&'" devflow/bin hooks --glob '!*.test.*' --glob '!**/__fixtures__/**'` | 0 | PASS: only `lib/text-escape.cjs:9` |
| Verification: plant | planted `lib/zz-plant.cjs`, ran guard test 1, then removed it | 1 | PASS: reported `devflow/bin/lib/zz-plant.cjs:2 meta-escape` |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test .../regex-escape.repo.test.cjs` | 1 | FAIL (correct): test 1 lists 12 sites |
| RED (Task 3) | `node --test --test-name-pattern "56-01\|C17\|TP-11" state.test.cjs stack-ci.test.cjs watcher-daemon.test.cjs hooks/gate-executor-stop.test.js` | 1 | FAIL (correct): #6 `null !== '40'`, C17a `true !== false`; TP-11 and #10 pass as guards |
| GREEN (Task 3) | the Task 3 verify command | 0 | PASS (correct): 278/278 |
| REFACTOR (Task 2) | the five module suites | 0 | PASS (correct): 226/226, behaviour-preserving |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test regex-escape.repo state stack-ci watcher-daemon frontmatter hooks/gate-executor-stop (+planning-import)` | 0 | PASS: 278/278 |
| test | `npm test` | 1 | FAIL (3 of 9234, none caused by this TRD): 9199 pass, 32 skipped |

The three `npm test` failures:
- `handoff-e2e.test.cjs:795` MA-7 (`doctl auth init` returns done/exit 0 on this machine). It fails identically on the base checkout at 802fc4fa, so it predates this TRD and depends on the environment.
- `stack-drafter-fleet.test.cjs:165` github-enterprise-migration (2 conflicts against an external repo's STACK.md). It fails identically on the base checkout, so it predates this TRD and depends on the environment.
- `roadmap-reconcile.test.cjs:984` E2E1 self-test. It fails while this TRD's checkpoint SUMMARY exists and ROADMAP still shows `- [ ] 56-01-...`. That is a transient in-flight state, and `roadmap update-job-progress` at completion clears it (re-checked after the state updates).

## Discovered commands

None. `npm test` and `node --test {files}` come from the stack profile.

## Issues Encountered
- A worktree has no `node_modules`, so PTY tests cannot run there unless it is linked. See the deviation above. Worth adding to the orchestrator's worktree provisioning.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7
  - No production hand-rolled escape outside text-escape.cjs (guard test 1, rg check)
  - Guard reports planted escapes with file:line and skips tests, fixtures, comments and text-escape.cjs (tests 4, 5, plant check)
  - The 12 former sites go through escapeRegExp, the hook through `../devflow/bin/lib/text-escape.cjs`
  - `stateExtractField(..., 'Progress (%)')` reads `'40'` (56-01 #6)
  - `expandsAny('x $AxB', ['A.B'])` is false (C17a)
  - A metacharacter secret is redacted from the done record (TP-11)
  - Pre-existing tests of the touched modules pass unchanged (226 + 278 runs)
- Gate failures: `npm test` has 3 failures. Two fail identically on base, and one is the transient roadmap self-test.

## Next Objective Readiness
- TRDs 56-02 to 56-04 can rely on `escapeRegExp` being the single, CI-enforced escape. A new hand-rolled escape in any production module fails `regex-escape.repo.test.cjs`.
- After the wave merge, the guard also scans 56-02's changes to `helpers.cjs`, `objective.cjs`, `misc.cjs` and `roadmap*.cjs`.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/regex-escape.repo.test.cjs
- FOUND: .planning/objectives/56-objective-number-correctness/56-01-SUMMARY.md
- FOUND commits: 8b78d6bc, e7be9639, e9b04e31, 530aeef4 (`git log 802fc4fa..HEAD`)
- Changed files are all within the TRD's files_modified; 56-02-owned files untouched
