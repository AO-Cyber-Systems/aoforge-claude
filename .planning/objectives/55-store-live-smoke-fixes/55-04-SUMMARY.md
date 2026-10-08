---
objective: 55-store-live-smoke-fixes
trd: "04"
subsystem: github-store
tags: [gh, store-mode, issue-title, issue-footer, naming]
requires: []
provides:
  - "readObjectiveState name fallback: ROADMAP name, then OBJECTIVE.md title heading, then the directory slug without its number prefix"
  - "store-mode objective issue footer (buildObjectiveSections and buildIssueBody take state.store)"
affects: [55-06, 55-08]
tech-stack:
  added: []
  patterns: ["strict boolean store flag on a pure body builder; mirror bytes unchanged (D-01)"]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-store-naming.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh.cjs
    - plugins/devflow/devflow/bin/lib/gh-body.cjs
    - plugins/devflow/devflow/bin/lib/gh-body.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-sync.test.cjs
key-decisions:
  - "The footer depends on `state.store === true` and nothing else, so the managed-section hash only changes when the mode does."
  - "Any other value of `state.store` (absent, false, a string) is mirror mode, so the D-01 invariant holds for issue bodies."
  - "Issues that already exist are not renamed: the title is set on create only (out of scope per the TRD)."
metrics:
  duration: ~20min
  completed: 2026-10-05
requirements-completed: ["55-6"]
tokens_input: 7388482
tokens_output: 39419
tokens_cache_read: 7250320
tokens_cache_write: 138040
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 55 TRD 04: Store issue naming Summary

**A new store-mode objective issue is titled after the objective (ROADMAP name, then OBJECTIVE.md heading, then the bare slug) and its footer says the issue is the source of truth with `.planning/` as a local cache; mirror mode is byte-identical.**

## Progress
- [x] Task 1: Objective issue title falls back to the OBJECTIVE.md heading, then the bare slug — 433a9dd5 (RED), 08bcd1a7 (GREEN)
- [x] Task 2: Store-mode footer on objective issue bodies — 2defb490 (RED), e5104f36 (GREEN)

## What changed

**Title (Task 1).** `readObjectiveState` named an objective `found ? found.name : objectiveId`, and `objectiveId` is the
directory name. A fresh store has no ROADMAP entry (the view is generated from the issues), so `objective add "Hello CLI"`
created `[Objective 1] 01-hello-cli`. The name is now `(found && found.name) || objectiveHeadingName(objDir) ||
String(objectiveId).replace(/^[\d.]+-/, '')`. `objectiveHeadingName` reads OBJECTIVE.md's first `# ` heading (after the
frontmatter) and strips an `Objective N:`, `—`, `–` or `-` prefix. `objective add` writes `# Objective N: <description>`, so the
description becomes the title.

**Footer (Task 2).** `buildObjectiveSections` and `buildIssueBody` take `state.store`; `syncObjective` passes
`store: storeMode`. The store footer reads:

> _Tracked by [DevFlow](https://github.com/AO-Cyber-Systems/devflow-claude). This issue is the source of truth (store mode); `.planning/` in a checkout is a local cache rebuilt from it._

Mirror mode keeps `Source of truth: \`.planning/objectives/<dir>/\` in this repo._` exactly.

## Deviations from Plan

### Auto-fixed Issues

None - TRD executed as written. Notes on scope, none of which changed behaviour:

- **Test 6 had no existing assertion to leave unchanged.** `gh-sync.test.cjs` had no `Source of truth` assertion, so test 2
  there gained one pinning the mirror footer bytes (and that `store mode` does not leak into a mirror body). `gh-sync.test.cjs`
  is in the TRD's Task 2 file list.
- **Test 4b added** (not in the TRD's list): `buildIssueBody` takes the same flag, and the two builders must agree on the text.
  `buildIssueBody` has no caller outside tests, so this keeps the two copies from drifting.
- **Test 2 (ROADMAP wins) and 3 (bare slug) drive `planning-verbs.objectivePut` directly, not `objective add`.** `objective add`
  numbers from the ROADMAP headings, so a ROADMAP entry at the number the add assigns cannot exist. Test 1 and test 4 use the
  real `cmdObjectiveAdd` store branch (in-process, with `process.exit` and stdout captured for the call).
- **Preflight (dispatch note, not a TRD deviation).** The first `exec-context check` ran with the Bash cwd in the main
  checkout and reported SHARED INDEX against 55-01's claim on `/Users/justin/dev/devflow-claude`. Re-run with `df-tools --cwd
  <worktree>` it passed for the worktree. 55-01's claim is on the main checkout, not its own worktree; the orchestrator may want
  to check where 55-01 is actually writing. I did not release that claim.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: title fallback | `node --test gh-store-naming.test.cjs gh-sync.test.cjs gh-issue.test.cjs` | 0 | PASS (77 tests; tests 1 and 3 failed before with `[Objective 1] 01-hello-cli`) |
| 2: store footer | `node --test gh-body.test.cjs gh-sync.test.cjs gh-store-naming.test.cjs gh-hierarchy.test.cjs gh-cache.test.cjs` | 0 | PASS (250 tests; 4g2, 4 and 4b failed before with the `in this repo` footer) |

Done-criteria check: `rg -n "in this repo" gh-body.cjs gh.cjs` matches only the mirror-mode branch (gh-body.cjs:267, gh.cjs:964).

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test gh-store-naming.test.cjs` | 1 | FAIL (correct): tests 1 and 3, actual `[Objective 1] 01-hello-cli`; test 2 passes (pins today's ROADMAP-wins behaviour) |
| GREEN (task 1) | `node --test gh-store-naming.test.cjs gh-sync.test.cjs gh-issue.test.cjs` | 0 | PASS (correct) |
| RED (task 2) | `node --test gh-body.test.cjs gh-sync.test.cjs gh-store-naming.test.cjs` | 1 | FAIL (correct): 4g2, 4, 4b; the gh-sync mirror pin passes |
| GREEN (task 2) | `node --test gh-body.test.cjs gh-sync.test.cjs gh-store-naming.test.cjs gh-hierarchy.test.cjs gh-cache.test.cjs` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test gh-store-naming.test.cjs gh-body.test.cjs gh-sync.test.cjs` | 0 | PASS (144 tests, 144 pass, 0 fail) |
| regression sweep | `node --test lib/gh*.test.cjs lib/planning-verbs*.test.cjs lib/objective.test.cjs` | 0 | PASS (2108 tests, 2104 pass, 0 fail, 4 skipped, all pre-existing) |
| test (`npm test`) | full suite | - | not_available: the dispatch said not to run the full suite; the sweep above covers every module that reads the objective name or builds the footer |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (title from `objective add`; ROADMAP name still wins and bare-slug fallback; store footer text; mirror footer byte-identical)
- Gate failures: None

## Notes for later TRDs

- Changing the store footer changes the managed-section hash, so the next sync of an existing store objective sends one body
  patch. Expected; the second sync already carries the new footer and sends nothing.
- A generated ROADMAP line can carry a suffix (`### Objective 1: 01-hello-cli  (#3, closed)`). Not touched here.
- The fresh-store `state.json` and stamp minor needs no code (TRD 55-06 confirms it live, 55-08 documents it).

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-store-naming.test.cjs
- FOUND: commits 433a9dd5, 08bcd1a7, 2defb490, e5104f36 on df/exec-55-04
