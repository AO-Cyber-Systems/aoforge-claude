---
objective: 47-github-authoritative-store
trd: "03"
subsystem: github-sync
tags: [outbox, journal, queue, lock, rate-limit, hook-safe, node-test, tdd]

requires: []
provides:
  - "lib/gh-outbox.cjs: durable per-repo outbox journal of LOGICAL GitHub write ops (kind + target + payload), validated against one OP_KINDS table"
  - "enqueue (all-or-nothing, coalesces pending ops in place, skipped when github.enabled is not true), nextOp (strict FIFO, halt-aware), markDone/markPending/markBlocked/dropOp/setHalted/clearHalted, status"
  - "acquireLock (O_EXCL single flusher, 10-minute stale takeover), budgetCheck/recordWrite (80/min wait, 450/h stop, across processes)"
  - "Per-issue base store (<repoKey>.base.json) and cache index (<repoKey>.cache.json)"
affects: [47-07, 47-08, 47-09, 47-10, 47-11, 47-12]

tech-stack:
  added: []
  patterns:
    - "Hook-safe module: node builtins + sync-state.atomicWrite only; repoKey copied (not imported) and pinned by a test"
    - "Out-of-tree per-repo state in $DEVFLOW_OUTBOX_DIR / ~/.claude/devflow/state/outbox, never inside the project"
    - "Corrupt state files are renamed to <file>.corrupt-<ts> and reported, never silently replaced; quarantine failure throws"
    - "Injected time: every function takes `now` in its options, Date.now() only as a default"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-outbox.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs
  modified: []

key-decisions:
  - "nextOp returns {op, halted, reason, wait_ms?} rather than a bare op or null, so a blocked head op and a retry_after wait are distinguishable from an empty queue"
  - "enqueue on a disabled project returns {ok:true, skipped:true, reason} (ok:true: disabled is not a failure; callers check .skipped)"
  - "retry_after is epoch milliseconds; nextOp withholds a pending head op until then unless ignoreRetryAfter (a manual flush)"
  - "setBase validates and stores exactly {issue_number, issue_id, body_hash, updated_at}; both numbers must be positive integers"
  - "Lock takeover moves a stale lock aside by rename (atomic), re-checks what it moved, and puts a live lock back if it grabbed one"
  - "status().recovered keeps naming the newest .corrupt-* journal on disk until a human deletes it"

patterns-established:
  - "One op contract: 47-08/09/12 enqueue ops built to OP_KINDS, 47-07 executes them; ids are DevFlow ids, never issue numbers"
  - "Mutators are short read-modify-writes; the flusher re-reads between ops rather than holding one journal across a gh call"

requirements-completed: [GST-05]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 14min
completed: 2026-10-01
tokens_input: 3552140
tokens_output: 81062
tokens_cache_read: 3425097
tokens_cache_write: 126981
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 47 TRD 03: Outbox journal store Summary

**Durable, hook-safe per-repo outbox of logical GitHub write ops: one OP_KINDS contract, strict FIFO with in-place coalescing, a single-flusher O_EXCL lock, a cross-process 80/min and 450/h write budget, and the base-hash and cache-index stores. No gh calls here; execution is 47-07.**

## Performance

- **Duration:** about 14 min
- **Started:** 2026-10-01T00:54:57Z
- **Completed:** 2026-10-01T01:09:00Z
- **Tasks:** 2 of 2
- **Files created:** 2

## Accomplishments

- `OP_KINDS` holds the nine D-13 op kinds with an exact target field set and a payload check each. `validateOp` refuses an unknown kind, a missing or extra target field, a numeric id, an empty `patch-issue`, a malformed `patch-body`/`upsert-comment` mode and unsafe `wiki-push` paths (absolute or containing `..`).
- `enqueue` validates every op before writing any (all-or-nothing), appends with a monotonic `seq`, coalesces a `pending` op with the same kind and target in place (latest payload wins, `seq` and `queued_at` kept), never touches a `blocked` or `done` op, and is a no-op returning `skipped` when `github.enabled` is not `true`.
- `nextOp` is strict FIFO: never past an earlier `pending` or `blocked` op, nothing while `halted` is set, and it honours `retry_after`.
- The journal lives at `$DEVFLOW_OUTBOX_DIR/<repoKey>.json` (else `~/.claude/devflow/state/outbox/`). A journal that fails to parse or has the wrong shape is renamed `.corrupt-<ts>` and reported through `readJournal().recovered` and `status().recovered`. Done ops are pruned to the newest 200 on write.
- `acquireLock` (O_EXCL, `{pid, at, token}`, stale after 10 min, atomic takeover), `budgetCheck`/`recordWrite` (80 per 60 s waits for the oldest to age out, 450 per hour stops, the hour wins when both are full), `readBase/getBase/setBase` and `readCacheIndex/writeCacheIndex`.

## API notes for 47-07, 47-08, 47-09, 47-10 and 47-11

All disk functions take the project root first and an options object last (`{now, env, home}`); `now` is epoch ms.

| Function | Returns |
|---|---|
| `enqueue(root, ops, {now})` | `{ok, enqueued:[seq], coalesced:[seq], skipped?, reason?, error?, invalid?:[{index,error}], recovered?}` |
| `nextOp(root, {now, ignoreRetryAfter})` | `{op, halted, reason, wait_ms?}`; `op` set only when `reason` is null; reasons `halted`, `blocked`, `retry_after`, `empty` |
| `markDone(root, seq)` / `markBlocked(root, seq, reason)` / `dropOp(root, seq)` | `{ok:true, op}` or `{ok:false, error}` |
| `markPending(root, seq, {error, retry_after})` | attempts + 1; `retry_after` is epoch ms or null |
| `setHalted(root, {reason:'remote-edit'\|'blocked', seq, target, detail})` / `clearHalted(root)` | `{ok}` |
| `status(root, {now})` | `{path, repo, pending, blocked, done, halted, recovered, next_seq, writes:{minute,hour}, queue:[...]}`; `halted` is derived as `{reason:'blocked'}` when the head op is blocked |
| `acquireLock(root, {now, staleMs, pid})` | `{ok:true, release(), stale_replaced}` or `{ok:false, running:true, owner:{pid,at}}` |
| `budgetCheck(journal, now)` | `{ok:true, minute, hour}` or `{ok:false, reason:'minute'\|'hour', wait_ms, minute, hour}` |
| `recordWrite(journal, at)` | the same journal, mutated; persist with `writeJournal(root, journal)` |
| `setBase(root, id, {issue_number, issue_id, body_hash, updated_at})` | `{ok, base}` or `{ok:false, error}`; `getBase(root, id)` is the entry or null; `readBase(root)` is the map or `{}` |
| `writeCacheIndex(root, {relPath: hash})` / `readCacheIndex(root)` | `{ok}`; the map or `{}` |

Also exported: `OP_KINDS`, `BUDGET`, `LOCK_STALE_MS`, `MAX_DONE_OPS`, `validateOp`, `targetKey`, `opKey`, `stateDir`, `repoKey`, `journalPath`, `lockPath`, `isEnabled`, `readJournal`, `writeJournal`.

## Task Commits

1. **Task 1 RED** - `6b3458b` `test(47-03): add failing tests for outbox op schema, journal and enqueue`
2. **Task 1 GREEN** - `75cfe72` `feat(47-03): add outbox op schema, journal store, enqueue and FIFO queue`
3. **Task 2 RED** - `3bbdad3` `test(47-03): add failing tests for outbox lock, write budget, base store and cache index`
4. **Task 2 GREEN** - `16623a0` `feat(47-03): add outbox flush lock, cross-process write budget, base store and cache index`

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Op schema, keys, journal store, enqueue/coalesce/FIFO (tests 1-11) | `node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs` | 0 (43/43) | PASS |
| 2: Lock, cross-process budget, base store, cache index, hygiene (tests 12-17) | `node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs` | 0 (71/71, 5 repeat runs stable) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs` | 1 (module not found) | FAIL (correct) |
| GREEN (task 1) | `node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs` | 0 (43 pass) | PASS (correct) |
| RED (task 2) | `node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs` | 1 (25 fail, 46 pass) | FAIL (correct) |
| GREEN (task 2) | `node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs` | 0 (71 pass) | PASS (correct) |

The three hygiene tests (16, 17a, 17b) pass in the task 2 RED run on purpose: they guard properties that already held (nothing leaks into the real `~/.claude`, the module requires only the allowed builtins) and keep guarding as code is added.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs` | 0 | PASS |
| static requires | `rg -n "require\(" plugins/devflow/devflow/bin/lib/gh-outbox.cjs` | 0 | PASS (fs, os, path, crypto, ./sync-state.cjs only) |
| full suite | `npm test` | 1 | 6198 pass, 10 fail, 50 skipped of 6258; the 10 failures are pre-existing daemon tests (see below) |

## Deviations from Plan

### Auto-fixed Issues

None - the TRD was executed as written. Choices the TRD left open are recorded under key-decisions above.

### Additions beyond the numbered test list (small, stay inside the TRD scope)

- `nextOp` honours `retry_after` (the TRD journal shape carries the field and `markPending` accepts it, so something has to consume it). Tests 8d.
- `lockPath`, `BUDGET`, `LOCK_STALE_MS`, `MAX_DONE_OPS` are exported; `status()` also reports a `queue` list and `writes` counts for 47-11.
- `validateOp` checks `wiki-push` page paths (no absolute paths, no `..`) and `writeCacheIndex` checks its keys the same way, since 47-04 and 47-10 will turn those strings into file paths.
- Extra tests: 12g (five real processes race for the lock; exactly one wins) and 17b (a child process loads the module and asserts `gh-client`, `helpers`, `upgrade`, `awareness-store` and `gh-mapping` are not pulled in).

### Not done (named in the research, not in this TRD)

- `classifyFailure(r)` appears in 47-RESEARCH's module breakdown for 47-03, but this TRD's artifact list, decisions and tests exclude it. It belongs with the executor in 47-07, which owns failure handling.

## Known limitations

- Each mutator is its own read-modify-write with an atomic rename, so a file is never torn, but two processes mutating at the same instant (a hook `enqueue` while a flusher calls `markDone`) can lose one update. The window is milliseconds. 47-07 must re-read through the mutators between ops and not hold a journal across a gh call, which the module header states. A per-journal mutation mutex is deliberately not added; it would introduce its own stale-lock failure mode.
- Lock staleness is time-only (10 minutes), as specified. A crashed flusher blocks the next one for up to 10 minutes; there is no pid-liveness probe.
- `status().recovered` keeps naming the newest `.corrupt-*` journal until a human deletes that file.
- The TRD's `<output>` names `47-03-gh-outbox-store-SUMMARY.md`; this file is at `47-03-SUMMARY.md` because the dispatch specified that path. Rename if the orchestrator expects the TRD name.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 9/9 (journal location and nothing in the project: tests 4, 4c; logical ops validated against OP_KINDS: tests 1, 1f; coalesce and disabled no-op: tests 6, 7; FIFO nextOp: tests 8; corrupt journal quarantine: tests 10; O_EXCL lock and stale replacement: tests 12; budget: tests 13; base store: tests 14; hook-safe requires: tests 17)
- Gate failures: none for this TRD. `npm test` reports 10 failures, all in `devflow-watch.test.cjs` and `handoff-e2e.test.cjs`, none touching files this TRD changed.

### Full-suite baseline check

The worktree has no `node_modules`, so the handoff daemon cannot load `node-pty` ("node-pty not installed ... Cannot find module 'node-pty'" in the daemon log). Running the same two test files against a `git archive` snapshot of WAVE_BASE `882e3b7` (outside the repo, in the scratchpad) failed 11 tests, including all 10 seen in the worktree run (the base run also failed C-2 and the `handoff pipeline` parent, which passed or were flaky in the worktree run). These failures are environmental and pre-existing; MA-7 (doctl auth) is among the known ones. None were touched or fixed here.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-outbox.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs
- FOUND commits: 6b3458b, 75cfe72, 3bbdad3, 16623a0
- `node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs`: 71/71 pass
- The real `~/.claude/devflow/state/outbox` listing is unchanged by the suite (test 16)
