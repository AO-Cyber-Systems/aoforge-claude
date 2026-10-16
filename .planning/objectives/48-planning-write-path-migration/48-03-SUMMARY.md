---
objective: 48-planning-write-path-migration
trd: "03"
subsystem: planning-preflight
tags: [gwp-05, trd-budget, linked-bulk, job-checker, verify-trd-pre]
requires:
  - gh-trd.cjs encodeTrdBody / budget (objective 47)
provides:
  - trd-bulk.cjs (BULK_BLOCK_MAX, BULK_SHARE_MAX, BULK_SHARE_MIN_CHARS, fencedBlocks, bulkFindings, checkTrd)
  - verify trd-pre checks.trd_budget
  - job-checker Dimension 8 (TRD Size and Linked Bulk)
affects:
  - 48-04 (baselines job-checker.md after this edit)
  - 48-11 (plan put-trd calls trd-bulk.checkTrd)
tech-stack:
  added: []
  patterns: [pure measurement module shared by preflight, agent prompt and verb]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/trd-bulk.cjs
    - plugins/devflow/devflow/bin/lib/trd-bulk.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/trd-pre-check.cjs
    - plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs
    - plugins/devflow/agents/job-checker.md
decisions:
  - "Fenced content length is the content lines joined by \\n: neither fence line, nor the newline before the closing fence, counts"
  - "trd_budget rows name TRDs by trd-pre-check's trdId (04-01), like the other four checks; checkTrd's own trd is the canonical id (4-01) unless an id is passed"
  - "A TRD file name that does not parse as <objective>-<NN>[-<slug>]-TRD.md is measured by raw text.length with a note (13 such files in this repo)"
  - "The empty-objective summary is computed from checks like the main path: 1/5 dimensions passed (trd_budget passes on no TRDs, per the TRD)"
metrics:
  duration: ~10 min
  started: 2026-10-01T11:44:22Z
  completed: 2026-10-01T11:54:12Z
  tasks: 3
  files: 5
tokens_input: 7199672
tokens_output: 57128
tokens_cache_read: 7057823
tokens_cache_write: 141723
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 48 TRD 03: TRD scope budget and linked-bulk checker Summary

One pure module, `trd-bulk.cjs`, measures a TRD's encoded issue-body size against the 40,000 / 60,000 budget (D-06). It also finds inline bulk (U-2): a fenced block over 8,000 chars, or fenced content over 40% of a TRD of 40,000+ chars. `verify trd-pre` now reports this as a fifth check, `checks.trd_budget`, with both severities. The job-checker turns it into Dimension 8.

## What was built

- **`trd-bulk.cjs`** (pure, requires only `gh-trd.cjs`):
  - `fencedBlocks(text)` returns `[{line, chars, fence, closed}]`. The grammar: an opener matches `/^ {0,3}(`{3,}|~{3,})/`; the closing fence is the same character, at least as long, alone on its line; an unclosed fence runs to EOF.
  - `bulkFindings(text, encodedChars)` returns the warnings: `block`, then at most one `share`.
  - `checkTrd({id?, file, text})` returns `{trd, chars, status, bulk, passed, messages, note?}`. It measures with `encodeTrdBody` and `budget`, and `passed` is false only when the TRD is `over`. Every message names the fix and ends "never trim prose to fit".
- **`trd-pre-check.cjs`**: `checkTrdBudget(trds)` returns `{passed, trds:[{trd, chars, status, bulk}], over:[{trd, chars}], warn:[{trd, chars}], severity:{store:'blocker', local:'warning'}}`.
  - It is wired into the main path and the empty-objective early return, and the summary now counts five dimensions.
  - The module header lists the new check. The other four checks are unchanged; the characterization test pins them.
  - It does not read `github.store` (D-01).
- **`agents/job-checker.md`**:
  - Dimension 8 has the usual parts: Question, Process, a Thresholds table, Red flags, fix hints, and two example issue YAMLs.
  - Severity comes from `config-get github.enabled` and `config-get github.store`. When both are on it uses `severity.store`, otherwise `severity.local`. Bulk is always a warning.
  - U-2 and D-06 are named.
  - Added `trd_budget` to the failure-mode list at the top, as Step 8b, in the Step 10 pass criteria, and in Severity Levels.

## Calibration (all 308 TRDs in this repo)

289 `ok`, 18 `warn`, 1 `over` (`04-01`, 69,177). 8 TRDs have a block over 8,000, which matches 48-RESEARCH section 5. 8 have a share finding. Objective 47: all 14 TRDs `ok`, in 3 ms.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `verify trd-pre --raw` prints only the summary line, not JSON**
- **Found during:** Task 2 verify
- **Issue:** The TRD's Task 2 verify and Task 3 process run `verify trd-pre <objective> --raw` and read `checks.trd_budget` from it. But `helpers.output()` prints only the `valid/invalid — N/5 dimensions passed` line under `--raw`, as before this TRD.
- **Fix:** Dimension 8 and Step 8b tell the job-checker to run `verify trd-pre` without `--raw`, and say why. The live checks on objectives 47 and 4 ran without `--raw`, which shows the JSON. `--raw` semantics are unchanged.
- **Files modified:** plugins/devflow/agents/job-checker.md
- **Commit:** 27cb8a3

**2. [Rule 3 - Blocking] Committed with the worktree's df-tools**
- **Found during:** Task 1 RED commit
- **Issue:** The `~/.claude/devflow` mirror of df-tools rejects the global `--cwd` flag, and the Bash cwd is the main checkout.
- **Fix:** Every commit used `node <worktree>/plugins/devflow/devflow/bin/df-tools.cjs --cwd <worktree> commit ...`, which is the form the TRD's binding rules name. Every commit landed on `df/exec-48-03`.

### Additive beyond the test list

- More tests: the purity test (requires only `./gh-trd.cjs`), the fallback for a file name that does not parse, a CRLF case, fence-grammar edge cases, the inclusive 40,000 share floor, 11b (a warn-band TRD is listed in `warn` and still passes), and the empty-objective `trd_budget`.
- `fencedBlocks` entries carry `closed`. `checkTrd` and the `trd_budget` rows carry `note` only when a file name does not parse.

## Invariant check (github.store off)

This TRD touches no write path. With `github.store` off, every verb still writes the same local `.planning/` file, `.planning/` stays tracked, and the edit gate's cache deny stays inactive. `trd-bulk.cjs` has no fs at all, and `trd-pre-check` only reads content `loadTrds` already loaded.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: trd-bulk.cjs | `node --test plugins/devflow/devflow/bin/lib/trd-bulk.test.cjs` | 0 (31/31) | PASS |
| 2: trd_budget in verify trd-pre | `node --test plugins/devflow/devflow/bin/lib/trd-pre-check.test.cjs` and `df-tools verify trd-pre 47` | 0 (32/32); 47 shows `trd_budget` with all 14 TRDs `ok` | PASS |
| 3: job-checker Dimension 8 | `rg -n "Dimension 8: TRD Size and Linked Bulk\|trd_budget\|8,000\|40%" plugins/devflow/agents/job-checker.md` | 0 (16 matching lines) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test .../trd-bulk.test.cjs` | 1 (`Cannot find module './trd-bulk.cjs'`) | FAIL (correct) |
| GREEN (T1) | `node --test .../trd-bulk.test.cjs` | 0 (31 pass) | PASS (correct) |
| Characterization (T2, test 9) | `node --test .../trd-pre-check.test.cjs` | 0 (27 pass, on the code before the change) | PASS (correct) |
| RED (T2) | `node --test --test-name-pattern trd_budget .../trd-pre-check.test.cjs` | 1 (5 fail: `checks.trd_budget` undefined) | FAIL (correct) |
| GREEN (T2) | `node --test .../trd-pre-check.test.cjs` | 0 (32 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test + regression | `node --test trd-bulk.test.cjs trd-pre-check.test.cjs gh-trd.test.cjs` | 0 (193/193) | PASS |
| agent-markdown | `node --test doc-refs.repo agent-shell-harness model-profiles rg-flag-guard agent-tools` | 0 (112/112) | PASS |
| TRD verification | `df-tools verify trd-pre 4` | `04-01` (69,177) in `over`, `severity.local: warning` | PASS |
| full suite | `npm test` | 1: 6,926 pass, 10 fail, 50 skipped | ENV (see below) |

**Full-suite failures (environmental, not from this TRD):** all 10 are in `devflow-watch.test.cjs` (4) and `handoff-e2e.test.cjs` (6, including the known-flaky MA-7 area). These daemon tests spawn a shell through `node-pty`. The worktree has no `node_modules` (`node_modules/node-pty` exists only in the main checkout), and the daemon log says `Cannot find module 'node-pty'`. None of them touch the files changed here.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
- Gate failures: None from this TRD. The full suite has 10 environmental failures (node-pty missing in the worktree).

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/trd-bulk.cjs
- FOUND: plugins/devflow/devflow/bin/lib/trd-bulk.test.cjs
- FOUND: commits cf17942, bbae63d, 131872a, 5004735, 182c9d2, 27cb8a3 on df/exec-48-03
