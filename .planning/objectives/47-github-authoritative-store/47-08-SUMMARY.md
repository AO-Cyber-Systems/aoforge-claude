---
objective: 47-github-authoritative-store
trd: "08"
subsystem: github-store
tags: [github, comments, summary, verification, scope-budget, spec-rev, freeze, fold, outbox, tdd]

requires:
  - objective: 47-github-authoritative-store
    provides: "47-01 gh-trd codec, 47-02 fake GitHub + store fixtures, 47-03 outbox, 47-05 findCommentsByMarker + trds mapping"
provides:
  - "lib/gh-comments.cjs: fileCommentText, decodeFileComment, enqueueSummary, enqueueVerification, readTrdState, readEffectiveSpec, enqueueScope, freezeTrd, foldTrd, detectTrdDrift"
  - "Byte-exact SUMMARY / VERIFICATION comment protocol (marker, file line, verbatim text; numbered parts joined in part order)"
  - "Scope-change budget: a comment over 60,000 chars, or one that pushes the effective spec over 60,000, is refused with overflow:true and a new-TRD message"
  - "freeze / fold / drift of a TRD's spec as outbox ops; every write is queued, this module only reads"
  - "gh-outbox: append-spec-rev ops no longer coalesce unless they are the same row (event + hash)"
affects: [47-07-gh-outbox-flush, 47-10-gh-cache-pull-all, 47-11-store-cli, 47-12-sync-store-wiring, 47-13-store-e2e]

tech-stack:
  added: []
  patterns:
    - "reads only through gh-client (ghRead / ghPaginate); every change is a logical outbox op"
    - "queued-but-unposted state is read from the outbox journal so a second call before a flush cannot reuse an n or overwrite a log row"
    - "problems are returned ({ok:false, error}), never thrown; a disabled project returns the outbox's {ok:true, skipped:true}"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-comments.cjs
    - plugins/devflow/devflow/bin/lib/gh-comments.test.cjs
    - .planning/objectives/47-github-authoritative-store/47-08-SUMMARY.md
  modified:
    - plugins/devflow/devflow/bin/lib/gh-outbox.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs

key-decisions:
  - "post-scope payload.text is the RAW scope text (no marker): the flusher must build the comment with gh-trd.buildScopeComment(n, text), the same way it adds the marker line to an upsert-comment replace text"
  - "readTrdState returns ok:true with decoded.ok:false for a human-written issue; effectiveFromState / freeze / fold / drift refuse it with 'issue #N (TRD x) is not a devflow TRD body', and refuse a body whose id is another TRD (stale mapping)"
  - "default scope n = max(n on GitHub, n queued in the outbox) + 1; an n already used is a no-op for the same text (compared with trailing whitespace ignored) and refused for different text; gaps are allowed at enqueue (out of order is legal) and refused only by fold"
  - "the effective-spec budget check counts queued scope comments as if posted, so two scopes queued before a flush cannot together exceed 60,000"
  - "freeze is idempotent: an already-logged freeze is a no-op that reports drift; a freeze queued twice is one row that keeps the first time"
  - "fold is refused on an open TRD unless force:true, and never deletes scope comments; fits:false queues nothing"
  - "a missing spec-rev comment is an empty log (specRevText ''), not an error; a TRD missing from the mapping is found by scanning issue bodies for its devflow:id header (a read, never a mapping write)"

patterns-established:
  - "One place (gh-comments) knows how a TRD's comments, scope log and freeze/fold lifecycle read back from GitHub; sync, the cache and the CLI call it"

requirements-completed: [GST-03, GST-04]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-10-01
---

# Objective 47 TRD 08: SUMMARY / VERIFICATION comments, scope changes, freeze and fold Summary

**`lib/gh-comments.cjs`: the comment protocol over the 47-01 codec. SUMMARY and VERIFICATION files go to GitHub as marker + file-line + verbatim comments that read back byte-exactly (numbered parts joined in part order); a scope change is queued as `post-scope` plus a spec-rev row under the 60,000-char budget; `freezeTrd` / `foldTrd` / `detectTrdDrift` run the spec lifecycle. All writes are outbox ops; the module only reads.**

## Accomplishments

- **File comments (GST-04).** `fileCommentText(file, text)` is the `devflow:file` line, a newline, then the text verbatim. `decodeFileComment(comments, id, kind)` finds the comments with `findCommentsByMarker`, strips each marker line (CRLF-safe), joins them with `joinParts` in part order, and reads the file line. A missing part gives `{ok:false, missing:[2]}` and never partial text; `<kind>-superseded` parts, other kinds, other ids and human comments are ignored. Round trips are exact for empty text, no trailing newline, leading blank lines, unicode and a text that itself opens with a part line.
- **`enqueueSummary` / `enqueueVerification`.** One `upsert-comment {mode:'replace'}` op each: `{id:'7-01', kind:'summary'}` on the TRD issue, `{id:'7', kind:'verification'}` on the objective issue. Ids are canonicalised (`07-01` becomes `7-01`, `07-store-demo` becomes `7`), a Decision id, a junk id, an unsafe file name and a non-string text are refused, and a long text is queued untrimmed (splitting is the flusher's job). Zero gh calls.
- **TRD state reads.** `readTrdState` makes ONE issue GET and ONE paginated comments read (the mapping names the issue; an unmapped TRD is found by scanning issue bodies) and returns body, decoded header, comments, scopes ordered by `n`, the spec-rev text, `frozen` and `foldedThrough`. `readEffectiveSpec` returns body plus scope comments in `n` order honouring `folded_through`, with the encoded body and its length (the 60,000 figure).
- **Scope changes (GST-03).** `enqueueScope` picks `n`, handles replays, refuses overflow (comment alone over 60,000, or effective spec over 60,000, boundary tested at exactly 60,000 and 60,001) with `overflow:true` and a message that the overflow becomes a new TRD, then enqueues `post-scope` and a `scope n=K` spec-rev row (hash = encoded effective spec after the comment) in ONE `enqueue` call.
- **Freeze / fold / drift.** `freezeTrd` logs a `freeze` row with the body hash. `foldTrd` on a closed TRD queues `patch-body {mode:'replace'}` with the encoded effective spec plus a `fold folded_through=K from=<hash>` row, only when it fits; `fits:false` and `noop` queue nothing; scope gaps and duplicates refuse. `detectTrdDrift` compares the live body with the last non-scope row.
- Tests 10 and 14 demonstrate SC3 (fold logged, effective spec ordered) at unit level.

## API contract for 47-07, 47-10, 47-11, 47-12

| Function | Returns |
|---|---|
| `enqueueSummary(root, {trdId, file, text, now})` | outbox enqueue result plus `{id, kind}`; or `{ok:false, error}` |
| `enqueueVerification(root, {objectiveId, file, text, now})` | same, `id` is the objective id |
| `decodeFileComment(comments, id, kind)` | `{ok:true, file, text, comment_ids}` / `{ok:false, notFound:true}` / `{ok:false, missing:[i], error}` |
| `readTrdState(root, trdId)` | `{ok:true, id, repo, number, rest_id, state:'open'\|'closed', body, decoded, comments, scopes, scopeErrors, specRevText, specRevCommentId, frozen, foldedThrough}` / `{ok:false, error}` / `{ok:false, skipped:true, reason, error}` |
| `readEffectiveSpec(root, trdId)` | `{ok:true, id, number, state, file, text, encoded, chars, applied, overflow, errors, foldedThrough}` or the read failure |
| `enqueueScope(root, {trdId, n?, text, now})` | `{ok:true, id, n, chars, hash, enqueued, coalesced}` / `{ok:true, noop:true}` / `{ok:false, overflow:true, chars, max, error, message}` / `{ok:false, error}` |
| `freezeTrd(root, trdId, {now})` | `{ok:true, id, hash, chars, ...}` / `{ok:true, noop:true, frozen:true, drift}` |
| `foldTrd(root, trdId, {now, force})` | `{ok:true, fits:true, folded_through, entry, ...}` / `{ok:true, fits:true, noop:true}` / `{ok:true, fits:false, message}` / `{ok:false, reason:'open'}` / `{ok:false, error}` |
| `detectTrdDrift(root, trdId)` | `{ok:true, drift:false}` / `{ok:true, drift:false, unlogged:true}` / `{ok:true, drift:true, expected, actual}` |

Op payloads the flusher (47-07) receives: `upsert-comment {id, kind} {mode:'replace', text}` where `text` = file line + `\n` + file (flusher adds the marker line and splits); `upsert-comment {id, kind:'spec-rev'} {mode:'append-spec-rev', entry:{at, event, hash, chars}}`; **`post-scope {id, n} {text}` where `text` is the raw scope text, with no marker (the flusher must call `buildScopeComment(n, text)`)**; `patch-body {id} {mode:'replace', body}` for a fold.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The outbox coalesced spec-rev appends and would have lost log rows**
- **Found during:** Task 2 (designing `enqueueScope` / `freezeTrd`)
- **Issue:** `gh-outbox.enqueue` replaces a pending op with the same kind and target ("latest payload wins"). Every spec-rev append targets `{id, kind:'spec-rev'}`, so a freeze followed by a scope, or two scopes, queued before a flush would overwrite the earlier row in an append-only audit log.
- **Fix:** `coalescible()` in `gh-outbox.cjs`: an `append-spec-rev` op coalesces only with a pending append of the same row (event + hash, the flusher's idempotency key), keeping the first entry (and its time); a different row is its own op; an append never folds into a replace. All other ops coalesce exactly as before. Four tests (6f-6i) in `gh-outbox.test.cjs`; the 71 existing outbox tests are untouched and pass.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-outbox.cjs`, `plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs`
- **Commits:** 846f1c5 (RED), d9d042f (GREEN). Accepted by the orchestrator as a Rule-1 deviation.

**2. [Rule 2 - Missing critical functionality] Queued scopes are part of `n` allocation and the budget**
- **Found during:** Task 2
- **Issue:** The TRD computes `n` and the effective spec from GitHub alone. Two `enqueueScope` calls before a flush would both get the same `n` (the second `post-scope` coalesces over the first, losing a scope) and their combined size would never be checked.
- **Fix:** `queuedScopes()` reads pending and blocked `post-scope` ops for the TRD from the outbox journal (a local read); they count towards the default `n`, the replay / conflict check and the effective-spec overflow check. Tests 5c, 8c.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-comments.cjs`, `plugins/devflow/devflow/bin/lib/gh-comments.test.cjs`
- **Commit:** a9fa515

### Notes

- The TRD's approach text writes `c.body` for the comment, but `buildScopeComment` returns a string (47-01); the string is used directly.
- `post-scope` payload semantics (raw text, no marker) are not stated by the TRD or by 47-03's op table; this module fixes them (see API contract). 47-07 was running in parallel, so it must conform or the two must be reconciled at merge.
- SUMMARY file name follows the dispatch (`47-08-SUMMARY.md`), not the TRD's longer `<output>` name.
- Test counts exceed the numbered list (69 in `gh-comments.test.cjs` against 16 numbered cases) because each case has sibling cases (CRLF, boundaries, replay, validation, disabled).

## Authentication Gates

None.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: File comments (tests 1-4, 16) | `node --test plugins/devflow/devflow/bin/lib/gh-comments.test.cjs` | 0 (22 pass) | PASS |
| 2: State reads, scope, freeze, fold, drift (tests 5-15) | `node --test plugins/devflow/devflow/bin/lib/gh-comments.test.cjs` | 0 (69 pass) | PASS |
| Outbox coalescing fix | `node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs` | 0 (75 pass) | PASS |
| Static: no client write path | `rg -n "ghWrite" plugins/devflow/devflow/bin/lib/gh-comments.cjs` | 1 (no match, as required) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED 1 (94f5abe) | `node --test plugins/devflow/devflow/bin/lib/gh-comments.test.cjs` | 1 (module not found) | FAIL (correct) |
| GREEN 1 (ad3119d) | same | 0 (22 pass) | PASS (correct) |
| RED 2 (638bd36) | same | 1 (46 of 68 fail) | FAIL (correct) |
| RED outbox (846f1c5) | `node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs` | 1 (4 of 75 fail) | FAIL (correct) |
| GREEN outbox (d9d042f) | same | 0 (75 pass) | PASS (correct) |
| GREEN 2 (a9fa515) | `node --test plugins/devflow/devflow/bin/lib/gh-comments.test.cjs` | 0 (69 pass) | PASS (correct) |

Test 7b was split into 7b (exactly 60,000 accepted) and 7c (60,001 refused) in the GREEN 2 commit, so the boundary is tested without a queued scope also pushing it over.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-comments.test.cjs` | 0 (69/69) | PASS |
| regression | `node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs` | 0 (75/75) | PASS |
| full suite | `npm test` | 1 | 6606 tests, 6573 pass, 1 fail, 32 skipped; the one failure is the known pre-existing MA-7 doctl-auth test in `handoff-e2e.test.cjs` (its parent suite line is the same failure) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (summary and verification comments with marker, file line and verbatim text; byte-exact `decodeFileComment` in part order; `post-scope` plus `scope n=K` row with overflow refusal; freeze logs the body hash and fold fits / does-not-fit; `readEffectiveSpec` order and `folded_through`; writes only through the outbox, zero fake writes across the suite)
- Gate failures: None attributable to this TRD

## Issues Encountered

- Cross-TRD risk for 47-07 / 47-13: 47-07's plan says a frozen TRD's body is never patched (`base.frozen`), but a fold is a `patch-body {mode:'replace'}` on a closed, usually frozen, TRD. The flusher has to let that op through (fold is the one sanctioned edit of a frozen body) or SC3's fold will be skipped as drift. `OP_KINDS` has no field to mark a fold, so the flusher can only recognise it by the op itself.

## Commits

- 94f5abe: test(47-08): add failing tests for SUMMARY and VERIFICATION file comments
- ad3119d: feat(47-08): SUMMARY and VERIFICATION file comments through the outbox
- 638bd36: test(47-08): add failing tests for TRD state reads, scope changes, freeze, fold and drift
- 846f1c5: test(47-08): add failing tests for outbox coalescing of spec-rev appends
- d9d042f: fix(47-08): outbox must not coalesce different spec-rev append rows
- a9fa515: feat(47-08): TRD state reads, scope changes, freeze, fold and drift through the outbox

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-comments.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-comments.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-outbox.cjs (modified), gh-outbox.test.cjs (modified)
- FOUND: commits 94f5abe, ad3119d, 638bd36, 846f1c5, d9d042f, a9fa515 (verified with `git log`)
- `rg -n "ghWrite" gh-comments.cjs` finds nothing
