---
objective: 54-codeql-cleanup
trd: "07"
subsystem: tooling
tags: [codeql, regex-injection, incomplete-sanitization, semver, node-cjs, hooks]

requires:
  - "54-01: lib/text-escape.cjs (escapeRegExp, objectiveNumPattern)"
provides:
  - "novel-domain, trd-pre-check and project-bootstrap build their ROADMAP header regexes with objectiveNumPattern"
  - "bootstrapObjectiveMd takes name and goal from its own section only"
  - "changelog hasVersionEntry and hooks/changelog-on-tag.js escape the version with escapeRegExp"
  - "changelog.test.cjs (new), plus regression and RED tests in the three detector/bootstrap test files"
affects: [54-09]

tech-stack:
  added: []
  patterns:
    - "A hook requires text-escape.cjs by relative path (../devflow/bin/lib/text-escape.cjs), never changelog.cjs or helpers.cjs"
    - "Goal lookup is bounded to the objective's section (next objective or milestone heading) before the **Goal:** match"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/changelog.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/novel-domain.cjs
    - plugins/devflow/devflow/bin/lib/novel-domain.test.cjs
    - plugins/devflow/devflow/bin/lib/trd-pre-check.cjs
    - plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs
    - plugins/devflow/devflow/bin/lib/project-bootstrap.cjs
    - plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs
    - plugins/devflow/devflow/bin/lib/changelog.cjs
    - plugins/devflow/hooks/changelog-on-tag.js

key-decisions:
  - "Metacharacter fixtures for novel-domain and trd-pre-check use a non-numeric directory name (a(-thing), because findObjectiveInternal normalises 1( to the 01- directory and the raw argument never reaches the regex (see Deviations)"
  - "Decimal guard tests use 14.1 (with 141 and 14.10) and not 4.1, because objective_number is the directory's own digits, leading zero included"

requirements-completed: ["54-A"]

verification:
  gates_defined: 1
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 5min
completed: 2026-10-04
---

# Objective 54 TRD 07: Objective and version regexes in detectors, bootstrap, changelog and the tag hook Summary

**Every remaining objective or version regex in group A now goes through `text-escape.cjs`: `bootstrapObjectiveMd` stops matching `### Objective 401:` for objective 4.1 and stops borrowing the next section's goal, `changelog check` finds `1.0.0+build.1`, and the novel-domain and trd-pre-check headers can no longer throw on a metacharacter.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-10-04T18:43:03Z (exec-context claim time)
- **Completed:** 2026-10-04T18:48:16Z
- **Tasks:** 3 of 3
- **Files modified:** 9 (1 created, 8 modified), 280 insertions, 15 deletions (code and tests; SUMMARY excluded)

## Progress
- [x] Task 1: novel-domain and trd-pre-check header regexes on objectiveNumPattern — RED c3e0075d, GREEN 0294c935
- [x] Task 2: project-bootstrap heading and section-bounded Goal lookup — RED b15737d5, GREEN 4348fdb6
- [x] Task 3: changelog version match via escapeRegExp, plus the tag hook — RED 49c31df5, GREEN a93abb62

## Accomplishments

- `novel-domain.cjs` and `trd-pre-check.cjs` replace their `escapedNum` construction with `objectiveNumPattern(objectiveNum)`. `numStr` and `escapedNum` are gone from both files (alerts 91-94). The existing `[:\s]` boundary and section scan are untouched.
- `project-bootstrap.cjs` interpolates `objectiveNumPattern(objectiveNum)` into the heading regex and finds the **Goal:** inside the slice that runs from the heading to the next `#{2,4} Objective <digit>` or `## ` heading (alerts 110, 111). Leading-zero normalisation and the exact-three-hash `### ` convention are unchanged.
- `changelog.cjs` `hasVersionEntry` uses `escapeRegExp(version)` (alerts 64, 83). `1.0.0+build.1` now finds its own entry.
- `hooks/changelog-on-tag.js` requires `escapeRegExp` from `../devflow/bin/lib/text-escape.cjs` (the same relative pattern as `classify-session.js`) and uses it at the version regex (alert 101). `TAG_RE` was not widened.
- `rg "replace\(/\\\.\/g|replace\('\.'"` over the five source files prints nothing.

## Task Commits

1. Task 1 RED: `c3e0075d` test(54-07): failing tests for metacharacter objective args in novel-domain and trd-pre-check
2. Task 1 GREEN: `0294c935` fix(54-07): shared objective-number escape in novel-domain and trd-pre-check
3. Task 2 RED: `b15737d5` test(54-07): failing tests for decimal heading and goal bleed in bootstrapObjectiveMd
4. Task 2 GREEN: `4348fdb6` fix(54-07): escape objective number and bound goal lookup to its section in bootstrapObjectiveMd
5. Task 3 RED: `49c31df5` test(54-07): failing test for +build versions in changelog hasVersionEntry
6. Task 3 GREEN: `a93abb62` fix(54-07): escape versions with the shared escapeRegExp in changelog and the tag gate

## Decisions Made

- **Metacharacter fixtures use a non-numeric directory.** See Deviations 1. This is the only way to put a raw `(` into the header regex through the public command, so it is the only way to get a genuine RED.
- **Decimal guards use 14.1, not 4.1.** `objective_number` comes from the directory name's own digits (`04.1` for a `04.1-` directory), so a single-digit decimal never lines up with a `### Objective 4.1:` ROADMAP heading in novel-domain or trd-pre-check. `14.1` against `141` and `14.10` exercises the same boundary. `project-bootstrap` strips leading zeros itself, so its tests use `04.1-right` and `4.1` exactly as the TRD specified.
- **The hook swap carries no new test.** Its only reachable input is `v\d+\.\d+\.\d+`, so the existing `changelog-on-tag.test.js` (28 tests, unchanged and passing) is the gate, as the TRD's binding rules said.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: detector header regexes | `node --test plugins/devflow/devflow/bin/lib/novel-domain.test.cjs plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs` | 0 (64/64 pass) | PASS |
| 1: done-check | `rg -n "escapedNum" novel-domain.cjs trd-pre-check.cjs` | 1 (no output, as required) | PASS |
| 2: bootstrap heading and goal bound | `node --test plugins/devflow/devflow/bin/lib/project-bootstrap.test.cjs` | 0 (24/24 pass) | PASS |
| 2: dependent migration | `node --test plugins/devflow/devflow/bin/lib/migrations/0004-objective-md-backfill.test.cjs` | 0 (5/5 pass) | PASS |
| 3: changelog and tag hook | `node --test plugins/devflow/devflow/bin/lib/changelog.test.cjs plugins/devflow/hooks/changelog-on-tag.test.js` | 0 (28/28 pass) | PASS |
| 3: df-tools changelog cases | `node --test --test-name-pattern=changelog plugins/devflow/devflow/bin/df-tools.test.cjs` | 0 (7/7 pass) | PASS |
| 3: hook audit | `node --test plugins/devflow/hooks/planning-writes.audit.test.js` | 0 (65/65 pass with ui-metrics) | PASS |
| 3: done-check | `rg -n "replace\(/\\\.\/g\|replace\('\.'" <five source files>` | 1 (no output, as required) | PASS |
| all: combined | the six relevant test files above plus `text-escape.test.cjs` | 0 (133/133 pass) | PASS |
| all: real CHANGELOG | `node -e "...hasVersionEntry(<repo>, '2.13.0')"` | 0 (prints `true`) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test novel-domain.test.cjs trd-pre-check.test.cjs` | 1 (2 fail: `SyntaxError: Invalid regular expression ... Unterminated group`) | FAIL (correct) |
| GREEN (Task 1) | same | 0 (64/64) | PASS (correct) |
| RED (Task 2) | `node --test project-bootstrap.test.cjs` | 1 (O14 read `# Wrong`/`wrong goal`; O15 read goal `three`) | FAIL (correct) |
| GREEN (Task 2) | same | 0 (24/24) | PASS (correct) |
| RED (Task 3) | `node --test changelog.test.cjs` | 1 (item 8: `false !== true`) | FAIL (correct) |
| GREEN (Task 3) | `node --test changelog.test.cjs changelog-on-tag.test.js` | 0 (28/28) | PASS (correct) |
| REFACTOR | not applicable (each GREEN is a direct swap) | n/a | n/a |

### Tests that passed on unmodified code (kept as regression guards)

| Test | Why it passed before the fix |
|---|---|
| novel-domain 25 (`1(`) and trd-pre-check `1(` | `normalizeObjectiveName('1(')` is `01`, so the CLI resolves the `01-` directory and `objective_number` is `01`; the raw `(` never reaches the regex |
| novel-domain 26, trd-pre-check decimal (14.1 vs 141 and 14.10) | the old code already escaped dots and had the `[:\s]` boundary |
| changelog 9, 10, 11, 12 (bare version, `-rc`, 401 vs 4.1.0, missing file) | `-` is not special outside a character class and dots were already escaped |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test {files}` over the seven files above | 0 | PASS |
| test (full) | `npm test` | not run | not_available: deferred to TRD 54-09 by the dispatch instruction to run only tests relevant to the changed files |

The TRD's `<validation_gates>` names `npm test`. This run did not execute it, so the full suite is not claimed as passing here. `verification.gates_passed` is 0 in the frontmatter for that reason.

## Deviations from Plan

**1. [Rule 3 - Blocking] Test items 1 and 3 could not be built as written**
- **Found during:** Task 1 (RED)
- **Issue:** The TRD fixture for items 1 and 3 is a ROADMAP with `### Objective 1:` and no objective directory, run with `1(`, expecting exit 0 and JSON. Without a directory `findObjectiveInternal` returns null and both commands report "Objective not found" and exit non-zero (novel-domain) or return an error object (trd-pre-check). With a directory, `1(` normalises to `01`, so the argument is never interpolated.
- **Fix:** Kept the `1(` case as a guard (with an `01-something` directory, so it reaches exit 0 and JSON), and added the genuine RED: a directory named `a(-thing` (non-numeric, so `objective_number` stays the raw argument `a(`), with a ROADMAP heading `### Objective a(:`. Today this throws `SyntaxError: Unterminated group`. After the fix the literal heading is found, and the test asserts on that outcome (the `left-pad` token from the section, and a passing requirement coverage), not only on the absence of a throw. This is the TRD's own `<error_recovery>` path for items 1 and 3.
- **Files modified:** novel-domain.test.cjs, trd-pre-check.test.cjs
- **Commit:** c3e0075d

**2. [Rule 3 - Blocking] Decimal guard tests use 14.1, not 4.1 (items 2 and 4)**
- **Found during:** Task 1 (RED)
- **Issue:** `objective_number` is the directory's own digits, so a `04.1-` directory gives `04.1`, which never matches a `### Objective 4.1:` heading in novel-domain or trd-pre-check regardless of escaping.
- **Fix:** Used `14.1-` with `141` and `14.10` competitors. Same boundary, reachable fixture. project-bootstrap (item 5) keeps `04.1-right` and `4.1` as the TRD wrote it, because that module strips leading zeros itself.
- **Commit:** c3e0075d

### Observation (not changed, outside this TRD)

novel-domain and trd-pre-check pass `objective_number` with its leading zero (`01`, `04.1`) into a header regex, while ROADMAP headings in this repo are written without padding for single-digit objectives (`### Objective 1:`). For single-digit objectives the ROADMAP lookup in those two modules therefore never matches (it did not before this TRD either, and the TRD forbids changing the boundary). Two-digit objectives (this repo's current range) are unaffected. Worth a follow-up if single-digit objectives matter.

### Process notes (not deviations)

- **One stray scratch write, cleaned up.** A mistyped path put one placeholder file under `/private/tmp/claude-501/-Users-justin/`. The file and the empty directories that write created were removed. Nothing in the repo was affected.
- **`summary checkpoint` wrote into the worktree.** Confirmed from the verb's reported `path`, which sits under `.df-worktrees/devflow-claude/54-07`. Nothing was written into the main checkout.

## Auth Gates

None.

## Discovered commands

None. The stack profile (`general`) supplied `test` as `npm test` with scoped form `node --test {files}`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (truths 1-5: the three modules build header regexes with `objectiveNumPattern` and `1(` never throws; `04.1-one` takes name and goal from `### Objective 4.1:` ahead of `401`; no goal borrowed from the next section; `hasVersionEntry(cwd, '1.0.0+build.1')` is true; the hook uses the shared `escapeRegExp` with its tests passing unchanged)
- Gate failures: None. The full `npm test` gate was not run (deferred to TRD 54-09, see above).

## Next Phase Readiness

CodeQL group A is complete across TRDs 54-01 and 54-07 as far as these sites go: alerts 64, 83, 91-94, 101, 110 and 111 have no remaining source pattern. TRD 54-06 still owns `objective.cjs`'s local `escapeRegExp`, the one remaining definition outside `text-escape.cjs`. TRD 54-09 runs the full suite.

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/changelog.test.cjs`
- FOUND: `plugins/devflow/devflow/bin/lib/novel-domain.cjs` (imports `objectiveNumPattern`)
- FOUND: `plugins/devflow/devflow/bin/lib/trd-pre-check.cjs` (imports `objectiveNumPattern`)
- FOUND: `plugins/devflow/devflow/bin/lib/project-bootstrap.cjs` (imports `objectiveNumPattern`)
- FOUND: `plugins/devflow/devflow/bin/lib/changelog.cjs` and `plugins/devflow/hooks/changelog-on-tag.js` (import `escapeRegExp`)
- FOUND: commits `c3e0075d`, `0294c935`, `b15737d5`, `4348fdb6`, `49c31df5`, `a93abb62`
- Commits are on branch `df/exec-54-07`; the main checkout carries no files from this run.
