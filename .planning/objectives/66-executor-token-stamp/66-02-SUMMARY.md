---
objective: 66-executor-token-stamp
trd: "02"
subsystem: hooks
tags: [subagent-stop, executor, token-stamp, est-09, fail-open]

requires:
  - objective: 57-token-usage
    provides: "tokens stamp / tokens trd readers and the EST-06 token frontmatter fields"
  - objective: 44-autonomous-executor
    provides: "the SubagentStop gate-executor-stop hook and its stop_hook_active once-guard"
provides:
  - "gate-executor-stop blocks a devflow:executor once when its final SUMMARY has no tokens_input/tokens_output"
  - "summaryFiles, hasTokenFields, isFinalSummary, tokenBlockReason exports"
  - "executor.md self_check tells the executor about the gate"
affects: [66-03, 66-04, execute-objective]

tech-stack:
  added: []
  patterns: ["line-regex frontmatter check in a dependency-free hook", "fail-open on every read error"]

key-files:
  created: []
  modified:
    - plugins/devflow/hooks/gate-executor-stop.js
    - plugins/devflow/hooks/gate-executor-stop.test.js
    - plugins/devflow/hooks/__fixtures__/subagent-stop-fixtures.js
    - plugins/devflow/agents/executor.md

key-decisions:
  - "The gate checks token field presence in the first frontmatter block only; the source (live or backfill) is not inspected"
  - "Any stamped final SUMMARY of the TRD passes; the block names the first unstamped final in candidate-root order"
  - "No marker file: stop_hook_active stays the only once-guard (44-04 decision kept)"

patterns-established:
  - "Fixture summaryKinds: one literal text per SUMMARY state (checkpoint, final_stamped, final_backfill, final_unstamped, final_template_comments, final_input_only)"

# EST-09 is addressed here (the skipped-stamp cause) but completes only when 66-01 (coverage command), 66-03 and 66-04 land and the coverage is measured.
requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 11min
completed: 2026-10-08
tokens_input: 15954399
tokens_output: 59355
tokens_cache_read: 15596263
tokens_cache_write: 357926
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 66 TRD 02: The executor stop gate sends an unstamped final SUMMARY back once Summary

**SubagentStop gate-executor-stop now blocks a `devflow:executor` once when its TRD's final SUMMARY (a `## Self-Check` heading) has no `tokens_input`/`tokens_output`, naming the exact `planning draft`, `tokens stamp` and `summary post` commands; checkpoints, stamped or backfilled finals, `stop_hook_active` and read errors stay silent.**

## Progress
- [x] Task 1: Fixture kinds for final, stamped and unstamped SUMMARYs - 9d2629ff
- [x] Task 2: Token branch in decide() (tests 1-14) - 8a077390 (RED), c3d59a7a (GREEN)
- [x] Task 3: executor.md sentence and prose test 15 - cf3dd5ae (RED), b87477c2 (GREEN)

## Performance

- Duration: 11 min
- Tasks: 3 of 3, five commits (two RED, two GREEN, one fixtures)
- Files changed: 4 (3 hook-side, 1 agent prompt)

## Accomplishments

- `hooks/gate-executor-stop.js`: new `summaryFiles(id, roots)` (absolute, de-duplicated, whole-id, exact and slugged names), `hasTokenFields(text)`, `isFinalSummary(text)`, `tokenBlockReason(id, summaryRel, draftRel)` and the token branch in `decide()`. `summaryExists` now delegates to `summaryFiles` and keeps its behavior. The decision order is `... SUMMARY missing -> block (44-04) -> unreadable SUMMARY -> null -> no final -> null -> any stamped final -> null -> block (66-02)`.
- The hook still requires only `fs`, `path`, `child_process`, `text-escape.cjs` and `trd-identify.cjs`, reads no transcript and spawns no df-tools.
- `hooks/__fixtures__/subagent-stop-fixtures.js`: `summaryText(kind, id)` with six literal kinds and a `summaryKinds` option on `makePlanningRepo`. The default output is byte-identical to before.
- `agents/executor.md` `<self_check>` step 3: one sentence saying the SubagentStop gate sends the executor back once if the stamp was skipped. Commands and their order are unchanged.
- Test count in `gate-executor-stop.test.js`: 71 before, 91 now (20 new: tests 1-15 plus a decimal-id e2e case and the split helper cases 14a-14e).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture kinds | `node --test plugins/devflow/hooks/gate-executor-stop.test.js` (71 pass) and the `summaryText(...).includes('## Self-Check')` one-liner printed `false,true,true,true,true,true` | 0 | PASS |
| 2: Token branch | `node --test plugins/devflow/hooks/gate-executor-stop.test.js` (90 pass at the time) | 0 | PASS |
| 3: executor.md sentence | `node --test` on gate-executor-stop, tokens-cli, planning-writes.repo, doc-refs.repo (138 pass); `node --test --test-name-pattern "11\. executor.md" tokens-cli.test.cjs` (1 pass) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 2) | `node --test --test-name-pattern "66-02" plugins/devflow/hooks/gate-executor-stop.test.js` | 1 (14 of 19 fail: unstamped finals returned null, helpers missing) | FAIL (correct) |
| GREEN (task 2) | `node --test plugins/devflow/hooks/gate-executor-stop.test.js` | 0 (90 pass) | PASS (correct) |
| RED (task 3) | `node --test --test-name-pattern "66-02 prose" plugins/devflow/hooks/gate-executor-stop.test.js` | 1 (no SubagentStop in self_check) | FAIL (correct) |
| GREEN (task 3) | `node --test` on the four files listed above | 0 (138 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/devflow/hooks/gate-executor-stop.test.js` | 0 | PASS |
| test (full, first run, no node_modules in the worktree) | `npm --prefix <checkout> test` | 1 (11 fail: 10 daemon tests, 1 roadmap-reconcile self-test; see Deviations 2 and 3) | FAIL, both causes outside this TRD's code |
| test (full, after `roadmap update-job-progress 66`, `node_modules` linked) | `npm --prefix <checkout> test` | 0 (11095 tests, 11061 pass, 0 fail, 34 skipped) | PASS |

## Discovered commands

None. `npm test` and `node --test {files}` came from the bundled general profile and `package.json`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] CRLF-safe frontmatter check**
- **Found during:** Task 2
- **Issue:** `hasTokenFields` as specified (`^---\n...`) would read a CRLF SUMMARY as having no frontmatter and block a stamped SUMMARY.
- **Fix:** normalise `\r\n` before matching, with a test (14a). A false block is the costly direction for a once-only gate.
- **Files modified:** plugins/devflow/hooks/gate-executor-stop.js, gate-executor-stop.test.js
- **Commit:** c3d59a7a

**2. [Rule 3 - Blocking] The worktree has no node_modules, so the daemon tests cannot start**
- **Found during:** Task 3 full-suite run
- **Issue:** `npm test` from the worktree showed 10 failures in `devflow-watch.test.cjs` and `handoff-e2e.test.cjs` (the daemon needs `node-pty` from `node_modules`, which a provisioned worktree does not have). They pass at the base checkout.
- **Fix:** none in the repo. With a temporary symlink to the main checkout's `node_modules`, both files pass (33 pass, 2 skipped as designed) and so does the full suite. The symlink was removed afterwards and was never committed. This is a property of worktree provisioning, not of this TRD. Any wave that runs `npm test` from a fresh worktree will see the same 10 failures until `node_modules` is available there.

**3. [Rule 3 - Blocking] `roadmap-reconcile` E2E1 self-test fails while a SUMMARY exists and the ROADMAP box is unticked**
- **Found during:** Task 3 full-suite run
- **Issue:** the checkpoint SUMMARY made `66-02-stop-gate-token-check-TRD.md` read as done while its ROADMAP box was `[ ]`.
- **Fix:** `roadmap update-job-progress 66` ticked the box. The full suite then passed (gate table, second row).

### Other notes (not defects)

- The extra e2e test "a decimal objective id (12.1-03)" is beyond the 15 specified tests.
- Test 15 ties `once` to the gate's own sentence (`/SubagentStop[^.\n]*\bonce\b/`) because step 3's heading already contains "post it once"; the specified bare `/once/` would pass without the new sentence.
- `requirements mark-complete EST-09` was NOT run. EST-09 is the objective's requirement: it needs the coverage command (66-01) and the measured coverage (66-04). Marking it from one of four TRDs would overstate it, and the dispatch listed only `state` and `roadmap` verbs. `requirements-completed` is left empty for the same reason.

## Orchestrator finding on `identifyTrd` (bears on this gate)

`identifyTrd` returns `null` when `PLAN_ID:` carries the slug form (`66-02-stop-gate-token-check`) because `ID_END` forbids a following `-`. Checked against this TRD's own dispatch shape: short `PLAN_ID: 66-02` plus a slug `--id` gives `{"id":"66-02"}`; slug `PLAN_ID` plus slug `--id` gives `null`. For the stop gate that means a slug-form dispatch fails open: the executor is never checked, for the missing-SUMMARY block (44-04) and the token block alike. I did not change `trd-identify.cjs` (out of this TRD's scope). 66-03's continuation prompt and the execute-objective `PLAN_ID` line must use the short id, or `identifyTrd` needs to accept a trailing slug.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (block once with exact commands and path; silent on stamped, backfilled, checkpoint, guard, deliberate stop, escape and read error; commented template lines do not count; reason carries `stamped: false`, never type numbers by hand and 8080; executor.md sentence with test 11 green)
- Gate failures: None in this TRD's code. Environment/state notes in Deviations 2 and 3.

## Self-Check: PASSED

- FOUND: plugins/devflow/hooks/gate-executor-stop.js, gate-executor-stop.test.js, __fixtures__/subagent-stop-fixtures.js, plugins/devflow/agents/executor.md
- FOUND commits: 9d2629ff, 8a077390, c3d59a7a, cf3dd5ae, b87477c2
