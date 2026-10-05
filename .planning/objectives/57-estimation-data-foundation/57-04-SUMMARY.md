---
objective: 57-estimation-data-foundation
trd: "04"
subsystem: telemetry
tags: [transcripts, token-usage, backfill, summary-frontmatter, estimation]

# Dependency graph
requires:
  - objective: 57-estimation-data-foundation
    provides: "57-01 token-usage.cjs (indexExecutorTranscripts, tokensForTrd, stampTokenFields)"
  - objective: 46-github-store
    provides: "planning-verbs.summaryPost (store-aware SUMMARY write)"
provides:
  - "token-backfill.cjs: planBackfill (dry run), applyBackfill (writes through summary post), formatBackfillReport"
affects: [57-06 tokens backfill CLI, 57-07 live backfill]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One transcript index per plan; each SUMMARY classified from it, never a rescan per SUMMARY"
    - "Stamp a temp copy, publish the new text through the summary post verb: the module never writes under .planning/"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/token-backfill.cjs
    - plugins/devflow/devflow/bin/lib/token-backfill.test.cjs
  modified: []

key-decisions:
  - "A recoverable SUMMARY with no frontmatter block is unrecovered/no_frontmatter at plan time, so recovered always means apply can stamp it"
  - "A conflicting existing token value without force is skipped (token_conflict), never half-written"
  - "skipped and write_failed entries carry objective_dir, because ids repeat across shared objective numbers (10-alpha/10-01, 10-beta/10-01)"

patterns-established:
  - "formatBackfillReport returns one string, lines joined with newline, no trailing newline"

requirements-completed: []

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 12min
completed: 2026-10-05
---

# Objective 57 TRD 04: Token backfill Summary

**Retroactive token backfill library: one transcript index, every historical SUMMARY classified as already_stamped / recovered / unrecovered with counts by reason, and the six token fields written only through the `summary post` verb, so local and store mode both keep the D-01 invariant.**

## Progress
- [x] Task 1: planBackfill (dry run) + formatBackfillReport — 8de9341c (RED 15ace4a0)
- [x] Task 2: applyBackfill through summaryPost, with the directory guard and worktree semantics — 2a1b9983 (RED 00a78d0a)

## Performance

- Started: 2026-10-05T17:32:26Z
- Completed: 2026-10-05T17:44:25Z (12 min)
- Tasks: 2 of 2
- Commits: 4 code commits (2 RED, 2 GREEN), plus this metadata commit
- Real-history dry run: 2.9 s for 393 SUMMARYs and 859 executor transcripts

## Accomplishments

- `planBackfill` builds the executor index once (57-01), walks `.planning/objectives/*/*-SUMMARY.md` in sorted order and classifies each SUMMARY. It writes nothing: test 2 snapshots every file's bytes and mtime under the repo and the projects root before and after.
- `applyBackfill` stamps a temp copy, then calls `planning-verbs.summaryPost(checkoutRoot, {trd, text, file})` with the existing file name, so `99-01-demo-SUMMARY.md` is rewritten in place and no `99-01-SUMMARY.md` appears. `rg writeFileSync|appendFileSync|renameSync token-backfill.cjs` finds only the temp-copy write.
- The directory guard compares `ghMapping.resolveObjective(main, <objective>).dir` with the entry's directory before posting. With `10-alpha` and `10-beta` the resolver picks `10-alpha`, so a recovered `10-beta/10-01` is skipped with `ambiguous_objective_dir` and its file is untouched.
- Worktree semantics hold: transcripts match the main checkout (`repoRoot`), SUMMARYs are read from and written to the worktree (`checkoutRoot`). Test 8 uses a real `git worktree add`: the worktree shows exactly one modified file, main shows none.
- An unrecoverable SUMMARY is an outcome in the counts, never an error: `planBackfill` and `applyBackfill` do not throw for any classification.

### Exported signatures (token-backfill.cjs)

```
BACKFILL_SOURCE = 'backfill'
planBackfill({checkoutRoot, repoRoot, root?, force = false}) ->
  {checkout, repo, transcripts_root,
   index_counts: {executor_transcripts, identified, unidentified, ambiguous, foreign},
   entries: [{objective_dir, file, id: 'NN-MM'|null,
              status: 'already_stamped'|'recovered'|'unrecovered',
              reason?: 'unkeyed'|'no_transcript'|'ambiguous_objective'|'zero_usage'|'no_frontmatter',
              fields?: [[key, serialisedValue], ...]}],        // sorted by objective_dir, then file
   counts: {summaries, already_stamped, recovered, unrecovered, by_reason: {<reason>: n}}}   // by_reason keys sorted, zero omitted
  // throws without checkoutRoot or repoRoot; root defaults to ~/.claude/projects
applyBackfill(plan, {checkoutRoot = plan.checkout, force = false}) ->
  {written: ['99-01', ...],                 // TRD ids, plan order
   unchanged: ['99-01', ...],               // stamp produced identical text
   skipped: [{id, file, objective_dir, reason: 'token_conflict'|'ambiguous_objective_dir'}],
   write_failed: [{id, file, objective_dir, error}]}
formatBackfillReport(plan, applied?) -> string, lines joined by "\n", no trailing newline
```

### Report format (57-06 prints it unchanged)

```
summaries 6 · already stamped 1 · recovered 1 · unrecovered 4 (ambiguous_objective 2, no_transcript 1, unkeyed 1)
executor transcripts 2 (identified 2, unidentified 0, ambiguous 0, foreign 0)
written 1 · unchanged 0 · skipped 0 · failed 0          <- third line only with `applied`
```

Reasons are in sorted key order and zero counts are omitted. With nothing unrecovered the line ends at `unrecovered 0` (no parenthesis). The CLI should exit 0 for unrecovered and skipped entries and exit 1 when `write_failed` is non-empty, after printing every failure.

### Real-history dry run (read-only, `planBackfill` only, nothing applied)

From this worktree against the real projects root, as a one-off diagnostic before 57-07:

```
summaries 393 · already stamped 0 · recovered 229 · unrecovered 164 (no_frontmatter 1, no_transcript 156, unkeyed 7)
executor transcripts 859 (identified 239, unidentified 74, ambiguous 3, foreign 543)
```

So about 58 percent of historical SUMMARYs can be backfilled; the rest were lost to retention or were never executor runs. No `ambiguous_objective` case occurs in this repo's history. 57-07 owns the live write and its gate.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: planBackfill + formatBackfillReport | `node --test plugins/devflow/devflow/bin/lib/token-backfill.test.cjs` (tests 1, 2, 6, 9, 10, 11) | 0 | PASS (6/6) |
| 2: applyBackfill | `node --test token-backfill.test.cjs planning-verbs.test.cjs` | 0 | PASS (33/33: 12 backfill, 21 planning-verbs) |
| 2: write audit | `rg -n "writeFileSync\|appendFileSync\|renameSync" token-backfill.cjs` | 0 | PASS (one match: the temp-copy write, line 167) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test plugins/devflow/devflow/bin/lib/token-backfill.test.cjs` | 0 | PASS (12/12) |
| test | `npm --prefix /Users/justin/dev/.df-worktrees/devflow-claude/57-04 test` | 1 | PASS modulo baseline: 9422 tests, 9387 pass, 3 fail, 32 skipped (182 s). The 3 failures are the known baseline: handoff-e2e MA-7 (PTY mock auth), stack-drafter-fleet github-enterprise-migration (real fleet), roadmap-reconcile E2E1 (clears once `roadmap update-job-progress 57` ticks the TRDs) |
| lint / build | none in the stack profile | n/a | not_available |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| T1 RED (15ace4a0) | `node --test token-backfill.test.cjs` | 1 | FAIL: `Cannot find module './token-backfill.cjs'` |
| T1 GREEN (8de9341c) | same | 0 | PASS 6/6 |
| T2 RED (00a78d0a) | same | 1 | FAIL 6/12: `backfill.applyBackfill is not a function` (tests 3, 4, 5, 5b, 7, 8); the six plan tests stay green |
| T2 GREEN (2a1b9983) | same | 0 | PASS 12/12 |

One test-only correction after the T2 RED commit: `git()` in test 8 trims output, which drops the leading space of the porcelain status line, so the expectation became `M <path>`. No production code changed for it. REFACTOR: none needed.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (classification with counts; plan writes nothing; apply adds exactly the six fields through summary post; no rewrite of a stamped SUMMARY or a conflicting value without force; plan + apply twice gives recovered 0; worktree reads/writes the worktree and matches transcripts against main; unrecoverable is a count, not an error)
- Gate failures: none of this TRD's. Full suite: 3 known baseline failures only

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/token-backfill.cjs`: planBackfill, applyBackfill, formatBackfillReport (created)
- `plugins/devflow/devflow/bin/lib/token-backfill.test.cjs`: tests 1-11 plus 5b (created)

## Decisions Made

- **`no_frontmatter` is decided at plan time.** `setFrontmatterField` refuses a file with no `---` block, and 12 of 393 SUMMARYs in this repo have none. Classifying them at plan time keeps the dry run honest: `recovered` means apply can stamp it, so the plan's counts predict the apply's `written`. A file with no frontmatter and no transcript stays `no_transcript`, so the new reason never hides the real one.
- **`token_conflict`.** The TRD says a conflicting existing value is never overwritten without force. `stampTokenFields` would still append the non-conflicting keys, which could leave `tokens_input: 5` beside a recovered `tokens_output`. Apply skips the whole SUMMARY instead, so it is never half-written. A re-apply with `force` writes it.
- **`objective_dir` on `skipped` and `write_failed` entries.** `written` and `unchanged` hold bare TRD ids as specified, but `10-alpha/10-01` and `10-beta/10-01` share an id, so a skip or failure needs the directory to be actionable.
- **Order inside apply:** stamp, conflict check, unchanged check, directory guard, post. An already-identical file therefore reports `unchanged` without needing the guard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing correctness] SUMMARY without a frontmatter block was classified recovered but could never be stamped**
- **Found during:** planning Task 1 (a read-only count showed 12 of 393 real SUMMARYs have no frontmatter block)
- **Issue:** `planBackfill` as specified would report such a SUMMARY as `recovered`; `applyBackfill` would then fail on it (`stampTokenFields` returns ok:false), making the dry run's `recovered` count disagree with the apply and a CLI exit 1 on a non-error.
- **Fix:** added reason `no_frontmatter` (plan time, only when a transcript was recovered) and test 11. Apply still treats a stamp refusal as `write_failed` defensively.
- **Files modified:** token-backfill.cjs, token-backfill.test.cjs
- **Commit:** 8de9341c (with its test in 15ace4a0)

**2. [Rule 2 - Missing correctness] Partial token stamps could be left inconsistent**
- **Found during:** designing Task 2 against `stampTokenFields`' conflict semantics
- **Issue:** a SUMMARY carrying only `tokens_input: 5` is not "already stamped" (no `tokens_output`), so it is recovered; a non-forced stamp would keep the 5 and append the rest.
- **Fix:** skip with `token_conflict` and cover it with test 5b (skip, then force re-apply writes it and reports the already-identical 99-01 as `unchanged`).
- **Files modified:** token-backfill.cjs, token-backfill.test.cjs
- **Commit:** 2a1b9983 (test in 00a78d0a)

## Issues Encountered

- `npm test` output exceeded the tool's capture limit (it truncated both the middle and the tail), so the second run redirected output to the session scratchpad and read the totals from there.
- No upstream defect in token-usage.cjs: every export worked as 57-01 documented, so no re-implementation or workaround was needed.

## Next Objective Readiness

57-06 can expose `tokens backfill [--write] [--force]` with these calls and nothing else:

```js
const plan = planBackfill({ checkoutRoot, repoRoot, root, force });
const applied = write ? applyBackfill(plan, { checkoutRoot, force }) : undefined;
console.log(formatBackfillReport(plan, applied));      // exit 1 only when applied && applied.write_failed.length > 0
```

`checkoutRoot` is `resolveCheckoutRoot(cwd)` and `repoRoot` is `resolveMainRoot(cwd)`; the module never reads `process.cwd()`. Store mode queues one outbox write per written SUMMARY, so the plan's `recovered` count is the number of writes to expect. 57-07 should run the dry run first and apply from the checkout that will commit the change.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/token-backfill.cjs, plugins/devflow/devflow/bin/lib/token-backfill.test.cjs (both tracked)
- FOUND commits on df/exec-57-04 (1b7642b6..HEAD): 15ace4a0, 8de9341c, 00a78d0a, 2a1b9983
- Working tree clean before the final metadata commit
