---
objective: 47-github-authoritative-store
trd: "07"
subsystem: github-sync
tags: [outbox, flush, idempotent, remote-edit-halt, retry-policy, rate-limit, tdd]

requires:
  - objective: 47-github-authoritative-store
    provides: "47-01 gh-trd codec, 47-02 fake GitHub + store fixtures, 47-03 gh-outbox, 47-04 gh-wiki, 47-05 gh-body/gh-mapping extensions"
provides:
  - "lib/gh-outbox-flush.cjs: flush(root, opts), resolveHalt(root, seq, choice, opts), HANDLERS (one per OP_KINDS kind), classifyFailure, createContext, executeOp, deriveSections, managedHash, baseFromIssue"
  - "gh-client: withRetryPolicy({maxRetries}, fn), writeCount(), now(), sleep(ms); attemptLoop honours the active policy"
  - "gh-outbox setBase: optional managed_hash and frozen, and <id>#<kind> comment keys"
affects: [47-09, 47-10, 47-11, 47-12, 47-13]

tech-stack:
  added: []
  patterns:
    - "scoped module-level retry policy (try/finally), never a key of opts"
    - "updated_at as a pre-filter only; the body hash (managed-section hash for objectives) decides a remote edit"
    - "handlers re-resolve state before writing (marker scan, existing links, existing comments), so replay writes nothing"
    - "base stored from the body GitHub RETURNED, never a local recompute"
    - "handlers testable without the journal through executeOp(ctx, op)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-client.cjs
    - plugins/devflow/devflow/bin/lib/gh-client.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs

key-decisions:
  - "a frozen TRD body is protected from upsert-issue only; patch-body {mode:'replace'} (the fold) is the sanctioned edit and needs NO payload marker (it still halts on a remote edit)"
  - "objective remote-edit check compares a managed-section hash (criteria and trds ticks normalised); a base with no managed_hash adopts the current body with a warning instead of halting"
  - "type is sent only at create (and by patch-issue); an update never re-sends it, so a repeat push writes nothing even where the org cannot apply the type"
  - "the milestone is resolved only when a create or a milestone change needs it, so an idempotent re-run makes zero writes"
  - "classifyFailure was not in 47-03; it lives here and also treats the client's write-budget refusal as rate_limited"

patterns-established:
  - "One executor owns every GitHub issue write; enqueuers (47-08/09/12) build ops, the flusher applies them"

requirements-completed: [GST-05, GST-01, GST-04, GST-06, GST-08]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 3 sessions (resumed twice)
completed: 2026-10-01
tokens_input: 15594662
tokens_output: 166041
tokens_cache_read: 15233231
tokens_cache_write: 361297
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 47 TRD 07: Outbox flusher, op handlers, remote-edit halt, client retry policy Summary

**`lib/gh-outbox-flush.cjs` drains the outbox strictly in `seq` order through nine idempotent handlers, stops pending when offline, rate limited or over budget, halts for a human when GitHub content DevFlow manages was edited remotely, and `gh-client` gains a scoped `withRetryPolicy` so a hook-mode flush never sleeps on a limit.**

## Accomplishments

- **gh-client.** `withRetryPolicy({maxRetries}, fn)` (validated, try/finally, nests, `_resetClient` restores), `writeCount()`, and `now()`/`sleep()` forwarders so the flusher shares the client's injectable clock. `opts` still reaches the runner byte-identical (`--input -` stdin), with no policy keys.
- **classifyFailure.** offline / rate_limited / already_exists / validation / permission / not_found / error, exactly the TRD table; a rate-limit message beats network words, and the client's budget refusal (status null) is rate_limited, not an outage.
- **Handlers (all nine kinds).** upsert-issue (mapping, else marker scan, duplicates blocked; create is one REST POST storing number AND rest_id; update patches only what changed; frozen bodies never patched), patch-body (managed merge with derived wiki/trds/meta sections, or whole-body replace), patch-issue, link-sub-issue (`-F sub_issue_id=<rest_id>`, tasklist fallback writes nothing), block (`-F issue_id=<rest_id>`), set-fields (native by field id, `meta` writes nothing), upsert-comment (replace with lossless numbered parts and `-superseded` re-marking, append-spec-rev that sets `base.frozen` on a freeze), post-scope, wiki-push (wiki / docs / blocked, offline and uninitialised classified).
- **Remote-edit halt (D-24, Pitfall 2).** `updated_at` is a pre-filter only. Objective: managed-section hash differs -> halt, human text outside the sections is merged, a ticked criterion is not an edit. TRD: body hash differs -> halt. Comment replace: joined-text hash differs -> halt; append-spec-rev never halts.
- **Flush loop.** lock (O_EXCL, released in finally), cross-process budget checked before every op (minute: sleep when `wait`, else stop; hour: stop), `withRetryPolicy` per mode (`wait:false` -> `maxRetries:0`), every gh write recorded in the journal, ordered FIFO, `maxOps`, retry_after honoured (ignored by a manual `wait:true` flush).
- **resolveHalt.** accept-remote drops the op and refreshes the base from GitHub; overwrite refreshes the base and keeps the op (a blocked op becomes pending); both clear the halt.

## API contract for later TRDs (47-09 .. 12)

| Item | Contract |
|---|---|
| `flush(root, opts)` | `opts`: `wait` (default true), `modes`, `caps`, `getModes(root)`, `capability`, `wikiRemote`, `now` (fn or number), `sleep`, `maxOps`. Returns `{status, done:[seq], pending, halted, warnings:[{seq,kind,message}], reason?, retry_after?, wait_ms?, budget?, issue_number?, error?}` |
| `status` | `flushed`, `pending` (reason `offline`, `rate_limited`, `budget`, `retry_after`, `max_ops`), `halted` (`halted.reason` `remote-edit` or `blocked`; remote-edit adds `issue_number`), `running`, `skipped`, `error`. Suggested CLI exit codes for 47-11: flushed 0, running 0, skipped 0, error 1, halted 2, pending 3 |
| `resolveHalt(root, seq, 'accept-remote'\|'overwrite', opts)` | `{ok, choice, seq, dropped\|requeued}` or `{ok:false, error}` |
| modes object | `{types, fields, hierarchy, pages, writable, types_by_name?, pages_message?, field_ids?}`; field ids otherwise from `caps.issue_fields.ids`. `writable:false` blocks the op. Default `getModes` lazily requires `gh-capability.cjs` (`detectCapabilities(root,{probeIssue,refresh})`, `resolveModes(caps)`), re-detecting once when provisional or stale |
| **FOLD** | `patch-body {id} {mode:'replace', body}`. **No payload field marks a fold** and none is needed: a replace is always allowed on a frozen TRD (it halts only on a remote edit). Only `upsert-issue` refuses a frozen body. A marker field would be rejected by `OP_KINDS` (`patch-body` replace accepts only `mode`, `body`) |
| `post-scope` | `payload.text` may be the RAW scope text (the handler calls `buildScopeComment(n, text)`) or text that already opens with the scope marker (posted as is) |
| `upsert-comment` replace | `payload.text` = `<file line>\n<verbatim>`; handler adds `<!-- devflow:id=<id> kind=<kind> -->` and splits with `splitParts(text, 60000, {reserve: marker+1})`. The `verification` kind targets the objective id |
| base store (for 47-10) | `outbox.setBase` entries `{issue_number, issue_id (REST id), body_hash, updated_at, managed_hash?, frozen?}`; comment bases keyed `<id>#<kind>` (`issue_*` = the parent issue). 47-10 must build pulled bases with `flushLib.baseFromIssue(restIssueJson, prevBase)` (carries `managed_hash` and `frozen`) and may use `flushLib.managedHash(body)`. A base with no `managed_hash` is adopted without a halt |
| mapping | upsert-issue writes `trds[id] = {issue_number, rest_id, role}`; comment ids per kind (`summary`, `spec-rev`, `scope`) via `setTrd` |
| gh-client | `withRetryPolicy`, `writeCount`, `now`, `sleep` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `gh-outbox.cjs` `setBase` could not hold the base D-24 needs**
- **Found during:** Task 2 design
- **Issue:** 47-03's `setBase` stored exactly four fields and rejected any key containing `#`. D-24 needs `managed_hash` and `frozen`, and comment bases keyed `<id>#<kind>`. `gh-outbox.cjs` is not in this TRD's `files_modified`.
- **Fix:** minimal, backward compatible edit of `setBase` only: optional `managed_hash` (string or null) and `frozen` (boolean, stored only when true), and a base key `<id>` or `<id>#<kind>`. A plain entry still stores exactly the original four fields; the existing 14c/14d tests pass unchanged. `enqueue`, coalescing and every other function are untouched (47-08 changes enqueue coalescing in the same file). Three tests added to `gh-outbox.test.cjs` (14f-14h).
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-outbox.cjs`, `plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs`
- **Commits:** 6706096 (RED), 50df785 (GREEN)

**2. [Rule 3 - Blocking] gh-client exports `now()` and `sleep()`**
- The flusher must share the client's injectable clock (fake clock tests, minute-budget sleep). Two forwarding exports added with a test (24b).

### Interpretations and additions (not defects)

- **Frozen rule.** D-24 lists `patch-body replace` among the frozen-protected writes, but 47-01/47-08 make a fold a `patch-body replace` on a closed, usually frozen TRD. The protection is therefore applied to `upsert-issue` only; `patch-body replace` is the explicit edit and still halts on a remote edit. Tests 21bh (frozen upsert is a drift warning), 21ch (fold allowed), 21dh (fold halts on a remote edit).
- **Frozen detection** also reads the spec-rev comment (a read, free of budget) before a body-changing upsert, so a lost base cannot let a push overwrite a frozen body.
- **Type recorded** as a returned warning (`type TRD not applied ...`) with the op done; the journal op schema has no field to persist it.
- **Extra classification phrases** `already[ _]exists`, `already blocked` (race on a dependency).
- **Milestone resolved lazily**, and `type` sent only at create, so a repeat push is zero writes (test 7).
- **Tests.** Handler tests call `executeOp(ctx, op)` (no journal); the handler-level D-24 tests (19h-23h) are in Task 2's RED, and flush-level tests 17-26 in Task 3's. TRD tests 20/20a/21/22 are covered at handler level (20h, 20ah, 21h-21dh, 22h) plus 22f in one flush. Test count far exceeds the 26 listed (90 in `gh-outbox-flush.test.cjs`).
- **SUMMARY filename** `47-07-SUMMARY.md` per the dispatch (the TRD `<output>` names `47-07-gh-outbox-flush-SUMMARY.md`).

### Known limits

- `gh-capability.cjs` (47-06) was not in the base, so the default `getModes` path is tested through the injected `capability` seam only, against the contract in the 47-06 TRD.
- Task-list ticks for the objective `trds` section are carried forward by `#number`; closed state of a TRD is not read to tick it.
- A `wiki` section is left alone (with a warning) when no wiki clone revision exists yet or pages are blocked.
- Lock staleness remains time-only (47-03).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: retry policy + classifyFailure | `node --test gh-client.test.cjs gh-outbox-flush.test.cjs` | 0 (43 pass at that point) | PASS |
| 2: handlers + derived sections | `node --test gh-outbox-flush.test.cjs gh-outbox.test.cjs gh-client.test.cjs` | 0 (172 pass) | PASS |
| 3: flush loop, halt, resolve | `node --test gh-outbox-flush.test.cjs gh-client.test.cjs gh-e2e.test.cjs` | 0 (256 pass with regression files) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED 1 (d3cbadd) | `node --test gh-client.test.cjs gh-outbox-flush.test.cjs` | 1 (policy/now/writeCount missing; flush module missing) | FAIL (correct) |
| GREEN 1 (ca804df) | same | 0, 43 pass | PASS (correct) |
| RED 2 (6706096) | `node --test gh-outbox-flush.test.cjs gh-outbox.test.cjs` | 1, 53 + 3 fail | FAIL (correct) |
| GREEN 2 (50df785) | same | 0, 63 + 74 pass | PASS (correct) |
| RED 3 (e54581e) | `node --test gh-outbox-flush.test.cjs` | 1, 27 of 90 fail | FAIL (correct) |
| GREEN 3 (e2c08bf) | same | 0, 90 pass | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test gh-outbox-flush.test.cjs gh-client.test.cjs` | 0 | PASS |
| regression | `node --test gh-e2e gh-sync gh-shim gh-seam.repo gh-outbox gh-issue` | 0 (256 pass with the two above) | PASS |
| no spawn | `rg -n "spawnSync\|child_process" gh-outbox-flush.cjs` | 1 (no match) | PASS |
| ids not numbers | `rg -n "sub_issue_id=\$\{[^}]*number" gh-outbox-flush.cjs` | 1 (no match) | PASS |
| full suite | `npm test` | 1 | 6633 tests, 6600 pass, 1 fail, 32 skipped; the one failure is the known pre-existing `handoff-e2e.test.cjs` MA-7 (doctl auth) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (order and idempotence: tests 6-14, 17; ids not numbers: 9, 10, V2; type check: 8; offline/rate-limited pending: 17, 26; remote-edit halt and no false halt: 19, 20h, 22f; retry policy: client 21-24; budget: 24-24e; SC4 unit level: 17 and 19)
- Gate failures: None (MA-7 pre-existing)

## Commits

- d3cbadd: test(47-07): failing tests for client retry policy, writeCount and classifyFailure
- ca804df: feat(47-07): scoped retry policy in gh-client and classifyFailure
- 6706096: test(47-07): failing tests for idempotent op handlers, derived sections and remote-edit halt
- 50df785: feat(47-07): idempotent op handlers, derived sections and remote-edit halt
- e54581e: test(47-07): failing tests for the flush loop, budget, lock and halt resolution
- e2c08bf: feat(47-07): flush loop with budget, lock, offline stop and halt resolution

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs
- FOUND commits: d3cbadd, ca804df, 6706096, 50df785, e54581e, e2c08bf (verified with `git log`)
- STATE.md and ROADMAP.md deliberately not edited (parallel wave; the orchestrator updates them after merging)
