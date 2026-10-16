---
objective: 56-objective-number-correctness
job: "02"
subsystem: df-tools objective lookups
tags: [objective-number, directory-match, regex, roadmap-headings, text-escape]

requires:
  - objective: 54-codeql-cleanup
    provides: text-escape.cjs (escapeRegExp, objectiveNumPattern) and the 54-07 follow-up on single-digit headings
provides:
  - "helpers.objectiveDirMatches: the one rule for choosing an objective directory"
  - "leading-zero-tolerant objectiveNumPattern shared by every ROADMAP heading lookup"
  - "text-escape.boldLabelPattern for **Label:** and **Label**: (consumed by 56-03 and 56-04)"
affects: [56-03, 56-04, 57-calibration, 59-milestone-stats]

tech-stack:
  added: []
  patterns:
    - "one directory-match rule (exact name or name + '-') instead of a bare prefix test"
    - "numeric ids match with 0* in the shared pattern, never zero-stripping at call sites"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/helpers.cjs
    - plugins/devflow/devflow/bin/lib/objective.cjs
    - plugins/devflow/devflow/bin/lib/misc.cjs
    - plugins/devflow/devflow/bin/lib/text-escape.cjs
    - plugins/devflow/devflow/bin/lib/objective.test.cjs
    - plugins/devflow/devflow/bin/lib/text-escape.test.cjs
    - plugins/devflow/devflow/bin/lib/novel-domain.test.cjs
    - plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs

key-decisions:
  - "The directory rule lives in helpers.cjs as objectiveDirMatches and is used at all five objective.cjs/misc.cjs sites, including the already-correct objective remove lookup, so there is one definition"
  - "Leading-zero tolerance lives in objectiveNumPattern itself (0* prefix), so novel-domain, trd-pre-check, roadmap, objective, workstreams and project-bootstrap all benefit without per-caller changes"
  - "The (?!\\.?\\d) trailing boundary is unchanged; TE-7..TE-11 pass untouched"

patterns-established:
  - "Static guard test: no production lib file may select an objective directory with a bare startsWith(normalized|padded)"

requirements-completed: [ONUM-02, ONUM-03]

verification:
  gates_defined: 2
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-10-05
tokens_input: 10978149
tokens_output: 44884
tokens_cache_read: 10831247
tokens_cache_write: 146736
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 56 TRD 02: Exact objective lookups Summary

**`find-objective 4.1` can no longer return `04.10-*`, and `objectiveNumPattern` finds `### Objective 4:` for an `04-*` directory: one `objectiveDirMatches` rule and one leading-zero-tolerant heading pattern, plus `boldLabelPattern` for TRDs 56-03 and 56-04.**

## Performance

- **Duration:** about 8 min
- **Started:** 2026-10-05T16:06:05Z
- **Completed:** 2026-10-05T16:14Z
- **Tasks:** 2
- **Files modified:** 8 (4 production, 4 test)

## Accomplishments

- ONUM-02: `searchObjectiveInDir`, `cmdFindObjective`, `cmdObjectivesList` and misc.cjs `cmdObjectiveJobIndex` picked a directory with `startsWith(normalized)`. They now go through `helpers.objectiveDirMatches`, as does `cmdObjectiveRemove`. A current `04.10-ten` no longer hides an archived `04.1-one`: `findObjectiveInternal(root, '4.1')` returns `v1.2-objectives/04.1-one` with `archived: 'v1.2'`.
- `objectives list --include-archived` strips the trailing ` [vX.Y]` before matching, so `04.1-one [v1.2]` is still selectable and `04.10-ten [v1.2]` is not.
- ONUM-03: `objectiveNumPattern` accepts leading zeros on numeric ids. novel-domain and trd-pre-check, which pass the directory's digits (`04`), now find `### Objective 4:`. The 54-07 follow-up is closed.
- `boldLabelPattern(label)` added and exported for TRDs 56-03 (Requirements) and 56-04 (Goal, Depends on).

## Final source for TRDs 56-03 and 56-04

```js
function objectiveNumPattern(n) {
  const s = String(n);
  if (!/^\d/.test(s)) return `${escapeRegExp(s)}(?!\\.?\\d)`;
  return `0*${escapeRegExp(s.replace(/^0+(?=\d)/, ''))}(?!\\.?\\d)`;
}

/** A markdown bold label as a RegExp source fragment: `**Goal:**` and `**Goal**:` both match; the label is escaped. */
function boldLabelPattern(label) {
  return `\\*\\*${escapeRegExp(label)}(?::\\*\\*|\\*\\*:)`;
}
```

Exports of text-escape.cjs: `escapeRegExp, objectiveNumPattern, boldLabelPattern, mdCell`. The file still requires nothing and `escapeRegExp`'s body is byte-identical. Typical use: `new RegExp(boldLabelPattern('Goal') + '\\s*([^\\n]+)')`.

## Task Commits

1. Task 1 RED: `09e0b026` test(56-02): objective lookups never select a longer number's directory
2. Task 1 GREEN: `2ab8a54c` fix(56-02): objective lookups match the exact directory (objectiveDirMatches)
3. Task 2 RED: `d40fb0e4` test(56-02): single-digit objectives find their ROADMAP section with or without a leading zero
4. Task 2 GREEN: `e369ce73` fix(56-02): objectiveNumPattern tolerates leading zeros; add boldLabelPattern

## Progress

- [x] Task 1: Hand-built objective-tree fixtures + objectiveDirMatches at every directory lookup (ONUM-02) — 09e0b026, 2ab8a54c
- [x] Task 2: Leading-zero-tolerant objectiveNumPattern + boldLabelPattern (ONUM-03) — d40fb0e4, e369ce73

## Deviations from Plan

None - TRD executed exactly as written. One addition inside Task 1's scope: test 6b (`--include-archived` suffix stripping) pins the `[vX.Y]` behaviour the TRD describes in prose.

### Auto-fixed Issues

None.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: objectiveDirMatches (ONUM-02) | `node --test objective.test.cjs summary-pairing.test.cjs df-tools.test.cjs` (217 tests) | 0 | PASS |
| 1: static guard | `rg -n "startsWith\((normalized\|padded)\)" plugins/devflow/devflow/bin/lib --glob '!*.test.cjs'` | 1 (no matches) | PASS |
| 2: zero-tolerant pattern (ONUM-03) | `node --test text-escape novel-domain trd-pre-check roadmap objective workstreams project-bootstrap roadmap-progress` | 0 | PASS |
| 2: exports | `node -e "console.log(Object.keys(require('./.../text-escape.cjs')))"` | 0 | PASS (escapeRegExp, objectiveNumPattern, boldLabelPattern, mdCell) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test --test-name-pattern 56-02 objective.test.cjs` | 1 (9 of 11 failed: tests 1, 3-7, 6b, 9, 10) | FAIL (correct) |
| GREEN (Task 1) | same | 0 (11/11) | PASS (correct) |
| RED (Task 2) | `node --test text-escape novel-domain trd-pre-check` | 1 (TE-18..21, TE-23, TE-24, novel-domain 27 and 28, trd-pre-check 04-test with `### Objective 4:`) | FAIL (correct) |
| GREEN (Task 2) | same plus roadmap, objective, workstreams, project-bootstrap, roadmap-progress | 0 | PASS (correct) |

TE-22, test 2, test 8 and the `### Objective 04:` trd-pre-check test are guards and passed before the change, as the TRD intends.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test objective.test.cjs text-escape.test.cjs novel-domain.test.cjs trd-pre-check.test.cjs` | 0 | PASS |
| test | `npm test` | 1 | see below |

`npm test` in this worktree: 9244 tests, 9183 pass, 11 fail, 50 skipped. None of the 11 is caused by this TRD:

- **9 failures, watcher daemon and handoff pipeline** (`devflow-watch.test.cjs`, `handoff-e2e.test.cjs`): the daemon exits 3 with `node-pty not installed ... Cannot find module 'node-pty'` (`~/.devflow/devflow-watch.log`). The worktree has no `node_modules` (gitignored); the main checkout has `node_modules/node-pty`. Environmental to the worktree. `devflow-watch.test.cjs` run alone in the main checkout at WAVE_BASE passes. `handoff-e2e.test.cjs` was not re-run at the base; its six failures (four route-results cases, LK-1, LK-2) are the same daemon start. The other three are in `devflow-watch.test.cjs`.
- **1 failure, `github-enterprise-migration: draft has no unaccepted conflict` (stack-drafter-fleet.test.cjs)**: fails identically in the main checkout at WAVE_BASE 802fc4fa. Pre-existing, depends on the real fleet on this machine.
- **1 failure, `E2E1: SELF-TEST — reconcile dry-run ... zero drift`** (roadmap-reconcile.test.cjs): the repo's ROADMAP still showed `- [ ] 56-02-...-TRD.md` while 56-02 has a SUMMARY. It is cleared by the `roadmap update-job-progress` step that follows this SUMMARY.

## Discovered commands

None. The stack profile was `general` and every command came from it (`npm test`, `node --test {files}`).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (find-objective 4.1 exact; findObjectiveInternal reaches archived 04.1-one; find-objective 4, objectives list and objective-job-index exact; static guard; zero-tolerant pattern; novel-domain and trd-pre-check find `### Objective 4:` and `4.1`; boldLabelPattern exported)
- Gate failures: the 11 `npm test` failures above, none attributable to this change

## Issues Encountered

None in the change itself. The full `npm test` gate cannot be fully green from a worktree without `node_modules`; recommend the orchestrator re-run it from the main checkout after the wave merge.

## Next Phase Readiness

TRDs 56-03 and 56-04 can import `boldLabelPattern` from `text-escape.cjs` and rely on `objectiveNumPattern` tolerating leading zeros.

## Self-Check: PASSED

- FOUND: helpers.cjs, objective.cjs, misc.cjs, text-escape.cjs, objective.test.cjs, text-escape.test.cjs, novel-domain.test.cjs, trd-pre-check.test.cjs
- FOUND commits: 09e0b026, 2ab8a54c, d40fb0e4, e369ce73
