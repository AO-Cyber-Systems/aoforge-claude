---
objective: 47-github-authoritative-store
trd: "01"
subsystem: github-store
tags: [github, codec, trd, scope-budget, spec-rev, fold, pure-module]

requires:
  - objective: none
    provides: wave 1, no dependencies
provides:
  - "lib/gh-trd.cjs: encodeTrdBody/decodeTrdBody, a byte-exact two-header-line TRD issue body codec"
  - "budget/checkObjectiveBudgets: 40,000 warn / 60,000 refuse measured on the FINAL encoded body; refuses a whole objective and names every offender"
  - "scopeMarker/buildScopeComment/parseScopeComments/effectiveSpec: scope comments ordered strictly by n, gaps and duplicates reported, effective spec honouring folded_through"
  - "specRevLine/parseSpecRev/appendSpecRev/isFrozen/assertEditable/detectDrift: append-only idempotent spec-rev log"
  - "planFold: fold decision (fits / does not fit / noop / refused) plus the spec-rev entry to append"
  - "partLine/splitParts/joinParts: lossless numbered-parts splitter for oversized SUMMARY and VERIFICATION comments"
affects: [47-07-gh-outbox-flush, 47-08-gh-comments, 47-09-gh-hierarchy, 47-10-gh-cache-pull-all, 47-13-store-e2e]

tech-stack:
  added: []
  patterns:
    - "pure module whose only require is crypto; id canonicalisation duplicated from gh-body on purpose and pinned to it by a test"
    - "size limits measured on the string that is actually posted (encoded body), never on the file"
    - "problems are returned (errors[], invalid[], ok:false), not thrown, so the caller decides; TypeError only for programmer error"
    - "lossless splitting: refusal is explicit, nothing is ever trimmed or re-flowed"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-trd.cjs
    - plugins/devflow/devflow/bin/lib/gh-trd.test.cjs
  modified: []

key-decisions:
  - "spec-rev hash semantics: freeze and fold rows hash the encoded issue BODY; scope rows hash the encoded EFFECTIVE spec (as 47-08 specifies), so detectDrift compares the live body with the last NON-scope row"
  - "buildScopeComment returns the comment string on success and {ok:false, overflow:true, chars, max, error} on overflow (callers test typeof result === 'string'); the limit applies to the whole comment, marker line included"
  - "a duplicate scope n keeps the lowest comment id (Infinity = a comment not posted yet sorts last); the effective spec applies only the kept comment and surfaces the error"
  - "splitParts counts the part line at its widest for the number of digits in n and widens until the split agrees with itself, so a rollover from 9 to 10 parts cannot push a part over the limit"
  - "a hard split backs off one UTF-16 unit rather than cut a surrogate pair, so no comment ever holds a lone surrogate"
  - "a text that itself opens with a part line is always given a part header, keeping joinParts(splitParts(x)) === x for every input"
  - "joinParts never returns a partial text: any problem gives {ok:false, text:null, missing, error}"

patterns-established:
  - "One codec for TRD bodies and the comment protocol; hierarchy, comments, cache and flush all import it instead of re-deriving the format"

requirements-completed: [GST-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 13min
completed: 2026-10-01
---

# Objective 47 TRD 01: TRD codec, scope budget, scope comments, fold, spec-rev Summary

**`lib/gh-trd.cjs`: the single pure codec that turns a TRD file into a GitHub issue body and back byte-exactly, enforces the 40K/60K budget on the posted string, orders scope comments by `n`, decides a fold, keeps an append-only spec-rev log, and splits oversized comments into lossless numbered parts.**

## Performance

- **Duration:** about 13 min (claim 00:54Z, finished 01:07Z)
- **Tasks:** 3 of 3, each RED then GREEN
- **Files:** 2 created (`gh-trd.cjs`, `gh-trd.test.cjs`), 0 modified
- **Tests:** 130 in `gh-trd.test.cjs`, all passing (TRD list 1-24 plus extras for boundaries, error paths and edge cases)

## Accomplishments

- **Body codec.** `encodeTrdBody({id,file,text})` writes `<!-- devflow:id=<id> -->`, `<!-- devflow:file=<name> -->`, then the verbatim text (CRLF folded to LF, nothing else touched). `decodeTrdBody` verifies BOTH header lines in order and returns `{ok:false, error:'not a devflow TRD body'}` for anything else (a human-created issue, a comment marker, an unsafe file name, a non-string); it never throws. Round trips are exact for text with and without a trailing newline, with frontmatter, empty text, leading blank lines and CRLF input. A test pins line 1 to `gh-body.markerLine`.
- **Budget (SC2, unit level).** `budget` is `ok` at 39,999, `warn` at 40,000 and 60,000, `over` at 60,001, measured on the encoded body. `checkObjectiveBudgets` returns every over-budget TRD (not the first), collects warn-band TRDs separately, refuses more than 100 TRDs, and reports an un-encodable TRD as `invalid`.
- **Scope comments (SC3, unit level).** `parseScopeComments` orders strictly by `n` regardless of input order or comment id, ignores non-scope comments, and reports `gap before n=K`, `duplicate n=K (...)` and `invalid scope n=0 (...)`. `effectiveSpec` is the decoded text plus `"\n\n" + <full comment body>` per applied scope, skipping `n <= folded_through`, and flags `overflow` when the ENCODED effective body exceeds 60,000.
- **spec-rev.** Append-only, idempotent on `event`+`hash`, new rows land directly under the last row so a human note below the table survives, the caller's marker line above the table is preserved, and a log whose trailing newline was stripped in transit still appends. `isFrozen`, `assertEditable`, `detectDrift` as specified.
- **Fold.** `planFold` decodes, refuses scope errors, computes the effective spec against `folded_through` from the log, and returns a `fold folded_through=K from=<old body hash>` entry whose `hash` is the new body hash. It is a no-op when nothing is unfolded, `fits:false` (no `newBody`) when the encoded result is over 60,000, and works on a frozen TRD (fold is the one sanctioned post-close edit). A second fold on top of a first folds only the new scopes.
- **Parts.** `splitParts(text, max, {reserve})` packs blank-line-separated paragraphs greedily, counts the part line (at its widest for the digit count) and the caller's reserve against `max`, splits an oversized paragraph at the last newline that fits and otherwise at the limit, never cuts a surrogate pair, and never trims. `joinParts` reverses it exactly, orders by part index, and reports a missing, duplicate or inconsistent part without returning partial text.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] detectDrift would report false drift once a scope comment exists**
- **Found during:** Task 2 (designing `detectDrift`)
- **Issue:** The TRD says drift compares the current body hash with "the last logged hash". But 47-08 specifies that `scope n=K` rows log the hash of the encoded EFFECTIVE spec after the scope comment, not the body. Comparing the live body with a scope row's hash would flag drift on every TRD that had received a scope comment.
- **Fix:** `detectDrift` compares with the last row whose event is not `scope ...` (`freeze` and `fold` rows hash the body). A log holding only scope rows is reported `unlogged`. Covered by three extra tests (scope rows never cause false drift; scope-only log is unlogged; after a fold the fold row is the reference). Test 19 as written in the TRD still passes unchanged.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-trd.cjs`, `plugins/devflow/devflow/bin/lib/gh-trd.test.cjs`
- **Commit:** be24451 (with RED in 31f67bc)

**2. [Rule 2 - Missing critical functionality] Lossless-split guards the TRD did not name**
- **Found during:** Task 3
- **Issue:** Three ways `splitParts`/`joinParts` could silently lose or corrupt data: a hard split cutting a UTF-16 surrogate pair (each comment would then carry a lone surrogate), a part-count rollover from 9 to 10 widening the part line past the limit, and a text that itself starts with a `devflow:part=` line being mistaken for a header on join.
- **Fix:** hard cut backs off one unit before a high surrogate; the header width is computed for the digit count of `n` and the split repeats until it agrees; a text that opens with a part line is always emitted with a part header. Each has its own test.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-trd.cjs`, `plugins/devflow/devflow/bin/lib/gh-trd.test.cjs`
- **Commit:** 39a19f5 (with RED in 6b38052)

**3. [Rule 2 - Missing critical functionality] Input validation beyond the list**
- `fileLine`/`encodeTrdBody` throw `TypeError` for an unsafe file name (separators, `..`, leading dot, whitespace, `-->`); `parseFileLine` and `decodeTrdBody` reject the same, so a `devflow:file=` line cannot steer a pull outside the objective directory.
- `specRevLine` rejects a cell containing `|` or a newline, a non-`sha256:` hash and a non-integer `chars`, so a malformed entry cannot corrupt the table.
- `buildScopeComment`'s overflow result also carries `chars`, `max` and an `error` string.

### Notes

- SUMMARY file name follows the dispatch (`47-01-SUMMARY.md`), which is also the name `gate-executor-stop.js` looks for (`<id>-SUMMARY.md`), rather than the longer name the TRD's `<output>` block gives.

## Authentication Gates

None.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Encoding, hashing, budget (tests 1-8) | `node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs` | 0 (43 pass at that point) | PASS |
| 2: Scope comments, effective spec, spec-rev, fold (tests 9-21) | `node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs` | 0 (105 pass at that point) | PASS |
| 3: Numbered-parts splitter (tests 22-24) | `node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs` and `rg -n "require\('(fs\|child_process)'\)" gh-trd.cjs` (no match) | 0 (130 pass); rg exit 1 (no match, as required) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED 1 (60b5ca1) | `node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs` | 1 (module not found) | FAIL (correct) |
| GREEN 1 (484109f) | same | 0, 43 pass | PASS (correct) |
| RED 2 (31f67bc) | same | 1, 47 of 95 fail | FAIL (correct) |
| GREEN 2 (be24451) | same | 0, 105 pass | PASS (correct) |
| RED 3 (6b38052) | same | 1, 22 of 130 fail | FAIL (correct) |
| GREEN 3 (39a19f5) | same | 0, 130 pass | PASS (correct) |

Git history shows each `test(47-01)` commit before its `feat(47-01)` commit. A few `assert.throws(..., TypeError)` cases pass at RED only because calling a missing function also throws a `TypeError`; they are re-verified against the real implementation at GREEN.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs` | 0 (130/130) | PASS |
| regression | `node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs` | 0 (57/57) | PASS |
| purity | `rg -n "require\(" plugins/devflow/devflow/bin/lib/gh-trd.cjs` | only `require('crypto')` | PASS |

## Full Suite

`npm test`: 6317 tests, 6257 pass, 10 fail, 50 skipped, 0 cancelled.

All 10 failures are in the devflow-watch / handoff end-to-end tests (`handoff-e2e.test.cjs`, the devflow-watch CLI tests: daemon start/stop, multi-project start, LK-1, LK-2, dispatch and route-results cases). Their log shows `node-pty not installed ... Cannot find module 'node-pty'`: this worktree has no `node_modules` of its own (`node-pty` exists only in the main checkout). They are unrelated to this TRD: `git diff 882e3b7 HEAD` changes only `gh-trd.cjs` and `gh-trd.test.cjs`, which nothing else requires, so the same tests fail identically on the base in this worktree. Not fixed, per instructions. (The known MA-7 doctl-auth test is reported as skipped here, "node-pty unavailable", so it is not among the ten failures in this run.)

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (round trip; budget boundaries on the encoded body; whole-objective refusal naming every offender and the 100-TRD cap; `n` ordering with gap and duplicate reporting and `folded_through`; fold plan with before/after hashes; append-only idempotent spec-rev with freeze/drift; lossless splitParts/joinParts)
- Gate failures: None

## Issues Encountered

None in this TRD's scope.

## Next Phase Readiness

47-07 (flush), 47-08 (comments), 47-09 (hierarchy) and 47-10 (cache) can import `gh-trd.cjs` as specified in the TRD's `key_links`. Two contract points worth knowing: `buildScopeComment` returns a string OR an overflow object, and `effectiveSpec` only measures the header-inclusive length when given `{id, file}` (47-08 passes both).

## Commits

- 60b5ca1: test(47-01): failing tests for TRD codec encoding and budget
- 484109f: feat(47-01): TRD body codec and scope budget
- 31f67bc: test(47-01): failing tests for scope comments, effective spec, spec-rev and fold
- be24451: feat(47-01): scope comments, effective spec, spec-rev log and fold
- 6b38052: test(47-01): failing tests for numbered-parts splitter
- 39a19f5: feat(47-01): numbered-parts splitter for oversized comments

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-trd.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-trd.test.cjs
- FOUND: commits 60b5ca1, 484109f, 31f67bc, be24451, 6b38052, 39a19f5 (verified with `git log`)
