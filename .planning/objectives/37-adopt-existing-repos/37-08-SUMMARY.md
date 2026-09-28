---
objective: 37-adopt-existing-repos
trd: "08"
subsystem: adopt
tags: [adopt, report, redaction, e2e, structural-checker, tdd]
requirements: [ADP-03, ADP-06]
dependency-graph:
  requires: [37-07]
  provides: [adopt-report, adopt-e2e-assert]
  affects: [adopt-cli, adopt.cjs, 37-09-workflow, 37-11, 37-12, 37-13]
tech-stack:
  added: []
  patterns:
    - "report() redacts owned files (codebase docs, PROJECT.md, CLAUDE.md DEVFLOW block only) before rendering, so a secret is never quoted"
    - "adopt-e2e-assert.cjs is a standalone fixture helper (library runChecks() + CLI check/snapshot/compare), reused verbatim by 37-11/12/13's simulated agent runs"
    - "checker reuses upgrade-fixtures.cjs's content-hash snapshot()/diffSnapshots() rather than re-implementing tree diffing"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/adopt-report.test.cjs
    - plugins/devflow/devflow/bin/lib/adopt-e2e.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/adopt-e2e-assert.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/adopt.cjs
    - plugins/devflow/devflow/bin/lib/adopt-cli.cjs
decisions:
  - "begin() now mkdir's .planning/ (recursive) before writing the out-of-tree marker. The scripted DoD pipeline runs `skill-active --start adopt` immediately after begin() and before any stand-in maps, but skill-active refuses when .planning/ doesn't exist yet; scaffold() is the only other place .planning/ gets created, and it runs much later. Fixing this in begin() (not skill-active.cjs, which this TRD does not own) keeps the TRD-specified pipeline order (must_haves DoD) intact."
  - "no_secrets scans only the redaction-owned surface (codebase docs, PROJECT.md, ADOPT-REPORT.md, and the CLAUDE.md DEVFLOW block CONTENT) rather than the whole CLAUDE.md file — text outside the block is deliberately left untouched by adopt report (see adopt-report.test.cjs test 8), so it is intentionally outside this checker's contract too."
metrics:
  duration: "~35 turns (continuation from a prior run that left Task 1 committed and Task 2's test file drafted)"
  completed: 2026-09-28
---

# Objective 37 TRD 08: `adopt report` + the E2E structural checker Summary

`adopt report` turns the LLM's low/medium-confidence inferences and the scaffold's own
deterministic findings into `.planning/ADOPT-REPORT.md`, redacting any secret found in the
owned surface and handing the workflow the exact commit file list. `adopt-e2e-assert.cjs`
is the reusable structural checker that proves the whole deterministic pipeline — preflight →
begin → skill-active start → stand-in maps → inferences → scaffold → report → skill-active end →
commit — end to end on three real-shaped fixtures (Go, Flutter, Node), and that 37-11/12/13's
simulated agent runs will reuse for the same assertions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `begin()` did not create `.planning/` before `skill-active --start`**
- **Found during:** Task 2, first RED run of `adopt-e2e.test.cjs` (test 15, all three fixtures)
- **Issue:** The TRD's own DoD pipeline order is `preflight → begin → skill-active start → stand-in
  maps → PROJECT.md → inferences → scaffold → ...`. `begin()` only writes the out-of-tree marker
  (`git rev-parse --git-path`), never `.planning/` itself; `.planning/` isn't created until
  `scaffold()` writes STATE.md. So `skill-active --start adopt`, called per spec right after
  `begin()`, failed with `No .planning/ directory found in cwd or ancestors` before the checker
  was ever reached.
- **Fix:** `begin()` now does `fs.mkdirSync(path.join(target, '.planning'), { recursive: true })`
  immediately after switching to `devflow/adopt`, inside the `pf.route === 'adopt'` branch only —
  so the no-op `upgrade`/`resume` routes (test 16) still write nothing.
- **Files modified:** `plugins/devflow/devflow/bin/lib/adopt.cjs`
- **Commit:** 70d79cb (bundled with the checker GREEN commit; the fix has no test of its own
  because it's exercised — and would regress visibly — every time `adopt-e2e.test.cjs` test 15
  runs on any of the three fixtures)

None else — `adopt-report.test.cjs` (Task 1) and `adopt-e2e.test.cjs`'s checker (Task 2) both
passed GREEN with no further defects surfaced in `adopt.cjs`.

## TDD Evidence

### Task 1 — `adopt report` (tests 1-14)

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/adopt-report.test.cjs` | 1 | FAIL (correct — no `report()`) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/adopt-report.test.cjs` | 0 | PASS (14/14) |

(Task 1 was completed and committed by the prior executor run — 7aec8d4 RED, 7cd743f GREEN —
re-verified clean in this run's final gate, not re-executed.)

### Task 2 — E2E structural checker (tests 15-18)

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (1st) | `node --test plugins/devflow/devflow/bin/lib/adopt-e2e.test.cjs` | 1 | FAIL — `No .planning/ directory found` (begin() gap, not the checker) |
| RED (2nd, after the `begin()` fix) | `node --test plugins/devflow/devflow/bin/lib/adopt-e2e.test.cjs` | 1 | FAIL (correct) — `Cannot find module '.../adopt-e2e-assert.cjs'` on all 6 tests |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/adopt-e2e.test.cjs` | 0 | PASS (6/6) |

The first RED run exposed a genuine pipeline defect (the `begin()` gap above) rather than the
expected "checker missing" signal. It was fixed in place (Rule 3) and RED was re-confirmed for
the right reason before the test file was committed.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: adopt report | `node --test plugins/devflow/devflow/bin/lib/adopt-report.test.cjs` | 0 | PASS (14/14) |
| 2: E2E structural checker | `node --test plugins/devflow/devflow/bin/lib/adopt-e2e.test.cjs` | 0 | PASS (6/6) |
| 2 (verify): all four adopt suites | `node --test adopt-e2e.test.cjs adopt-report.test.cjs adopt-scaffold.test.cjs adopt-preflight.test.cjs` | 0 | PASS (74/74) |
| checker CLI (no args/--help) | `node .../adopt-e2e-assert.cjs --help` | 1 | PASS — usage on stderr, nothing written |

## Commits

| Commit | Message |
|---|---|
| 7aec8d4 | `test(37-08): adopt report cases` (prior run) |
| 7cd743f | `feat(37-08): adopt report with needs-review, redaction and commit file list` (prior run) |
| 34b0291 | `test(37-08): deterministic adopt pipeline E2E cases` |
| 70d79cb | `feat(37-08): adopt E2E structural checker` (bundles the `begin()` mkdir fix) |

## Per-Fixture Results (test 15 — full deterministic pipeline)

Pipeline run per fixture: `adopt preflight` → `adopt begin` → `skill-active --start adopt` →
stand-in maps (`writeMappedDocs` + `writeProjectMd`) → [flutter-app only: pre-write a `v=2
src=claude-md` CLAUDE.md block, as map-codebase would] → `writeInferences` (one high/one
low/one medium) → `adopt scaffold` → `adopt report` → `skill-active --end` → `df-tools commit
--files <commit_files>` → `adopt-e2e-assert.cjs check <root> --home <fakeHome>`.

| Fixture | Outcome | Checker result | Artifacts asserted |
|---|---|---|---|
| go-service (kind: api) | adopted | exit 0, `ok: true`, 13/13 checks `ok: true` | `devflow/adopt` branch, exactly 1 commit since `base_sha`, clean tree, no upstream/remote ref, `validate health` 0 errors, `stack_valid`, 0 entries under `.planning/objectives`, one versioned DEVFLOW block (scaffold-inserted), `config.json` stamp == checkout plugin version, `## Needs review` lists `default_work` + `validated:Core flow`, PROJECT.md `kind`/`default_work` valid, commit diff touches only `.planning/**`+`CLAUDE.md`, no secret-pattern matches |
| flutter-app (kind: app) | adopted | exit 0, `ok: true`, 13/13 checks `ok: true` | same 13 checks; CLAUDE.md block pre-written by the test (`v=2 src=claude-md`) rather than scaffold-inserted — `claude_block_versioned` still passes against the pre-existing versioned block |
| node-cli (kind: cli) | adopted | exit 0, `ok: true`, 13/13 checks `ok: true` | same 13 checks, scaffold-inserted block |
| go-service (reused, test 16) | already adopted → route `upgrade` | `snapshot`/`compare` around a second `preflight`+`begin` call: `ok: true`, `changed: []` | `preflight.route === 'upgrade'`, `begin.route === 'upgrade'`, and the second `begin()` call writes nothing (content-hash snapshot before/after is byte-identical — confirms the `.planning/` mkdir fix is scoped to the `adopt` route only) |
| node-cli (reused ×3, test 17 negatives) | (a) extra fixture commit on `devflow/adopt`, (b) untracked file added, (c) a second DEVFLOW block appended | exit 1 each time | (a) `one_commit: false` (count is 2, not 1); (b) `tree_clean: false` (untracked file listed); (c) `claude_block_versioned: false` (`managed-block.read` throws "multiple DEVFLOW blocks"); the other 12 checks in each run are unasserted by the test but were `ok: true` |
| node-cli (reused, test 18) | adopted, then touched | `snapshot` exit 0; `compare` (no change) exit 0 `{ok:true, changed:[]}`; `compare` (after appending to README.md) exit 1 `{ok:false, changed:["README.md"]}` | content-hash snapshot/compare round-trip, and that a single touched file is both detected and named |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| adopt-e2e.test.cjs | `node --test plugins/devflow/devflow/bin/lib/adopt-e2e.test.cjs` | 0 | PASS (6/6) |
| all four adopt suites | see Task Evidence | 0 | PASS (74/74) |
| checker usage | `node .../adopt-e2e-assert.cjs --help` | 1 | PASS (usage printed, nothing touched) |

## Regression Gate (baseline-relative)

Ran once, from the repo root:

```
node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'
```

**Observed totals:** tests 3955, suites 566, pass 3922, fail 1, cancelled 0, skipped 32, todo 0.

**Failures and classification:**

| File:line | Name | Classification |
|---|---|---|
| `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path` | **Pre-existing** — line 16 of `baseline-failures.tsv`, verbatim name match. Not re-run individually; no further action needed. |

Only one failure total, and it is the sole baseline entry that fired. No candidate regressions.
No test touched by this TRD's diff (`adopt.cjs`, `adopt-cli.cjs`, the two `adopt-*.test.cjs`
files, `adopt-e2e-assert.cjs`) appears among the 21 baseline lines or as a new failure.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the `begin()` `.planning/` mkdir — Rule 3, documented above)
- Must-haves verified: all bullets under `must_haves.truths` for this TRD (report ordering/
  redaction/idempotency/guards; DoD pipeline on 3 fixtures; post-pipeline `upgrade` routing) — 8/8
- Gate failures: None beyond the single pre-existing baseline entry (`MA-7`)

## Self-Check: PASSED

- `plugins/devflow/devflow/bin/lib/adopt-e2e.test.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/__fixtures__/adopt-e2e-assert.cjs` — FOUND
- Commit `34b0291` — FOUND in `git log`
- Commit `70d79cb` — FOUND in `git log`
