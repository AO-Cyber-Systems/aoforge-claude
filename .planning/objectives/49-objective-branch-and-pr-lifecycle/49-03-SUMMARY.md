---
objective: 49-objective-branch-and-pr-lifecycle
trd: "03"
subsystem: github-store
tags: [gh-trd, scope-comments, acceptance, spec-rev, pure-codec]

requires:
  - objective: 47-gh-store
    provides: gh-trd codec (parseScopeComments, effectiveSpec, parseSpecRev, appendSpecRev)
provides:
  - "parseScopeComments scopes carry author and created_at (comment_id was already present)"
  - "parseScopeConfirms / buildScopeConfirm for the <!-- devflow:scope-confirm n=K hash=H --> marker"
  - "scopeHash, scopeEvent, devflowScopesFrom for DevFlow-posted scopes bound to content by a spec-rev row"
  - "scopeAcceptance: pure (scope) => 'accepted'|'pending' predicate"
  - "effectiveSpec accept option: applies only accepted scopes, reports pending:[{n, author, comment_id}]"
affects: [49-06, 49-09, 49-12, objective 50 Action]

tech-stack:
  added: []
  patterns:
    - "content-hash binding: an approval or a DevFlow-provenance row names the hash of the scope text, so an edit drops the scope back to pending"
    - "fail closed: nothing supplied -> everything pending; ties and missing timestamps never count as 'after'"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/gh-trd.cjs
    - plugins/devflow/devflow/bin/lib/gh-trd.test.cjs

key-decisions:
  - "created_at is carried on parseScopeComments scopes and parseScopeConfirms confirms (additive); the 'confirm posted after the scope' rule needs both timestamps, with comment id as the tiebreak"
  - "Logins compare case-insensitively; assignees may be strings or {login} objects"
  - "effectiveSpec treats null the same as undefined for accept, and applies a scope only when accept returns exactly 'accepted' (a truthy non-'accepted' answer is pending)"
  - "scopeHash is contentHash of the CRLF-normalised scope text, with no trimming, so it matches what 49-06's enqueueScope will hash"

patterns-established:
  - "Pure predicate built from caller-gathered facts (assignees, spec-rev rows, confirms); I/O stays in gh-comments"

requirements-completed: [GPR-05]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 14min
completed: 2026-10-01
tokens_input: 4562568
tokens_output: 49914
tokens_cache_read: 4443920
tokens_cache_write: 118562
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 49 TRD 03: Scope-change acceptance, the pure half Summary

**gh-trd can now tell which scope comments apply and which wait for an assignee: author-aware parsing, a content-hash-bound confirm marker and spec-rev provenance, a pure `scopeAcceptance` predicate, and an `accept` option on `effectiveSpec` that lists the rest as `pending` (GPR-05).**

## Performance

- **Duration:** about 14 min
- **Started:** 2026-10-01T15:01:05Z
- **Completed:** 2026-10-01T15:14:17Z
- **Tasks:** 2/2
- **Files modified:** 2 (both inside `plugins/devflow/devflow/bin/lib/`)

## Accomplishments

- `parseScopeComments` scopes now carry `author` (`user.login` or `null`) and `created_at`; `n, text, body, comment_id` keep their order and values.
- `parseScopeConfirms(comments)` reads `<!-- devflow:scope-confirm n=K hash=H -->` from a comment's first line into `{n, hash, author, comment_id, created_at}`; a missing hash, `n=0` or non-numeric `n` is ignored. `buildScopeConfirm({n, hash, note})` writes it and round-trips; an over-long note is refused with the same `{ok:false, overflow:true}` shape as `buildScopeComment`.
- `scopeHash`, `scopeEvent(n, hash)` (`scope n=K scope_hash=H`) and `devflowScopesFrom(parseSpecRev(...))`. A legacy `scope n=K` row (no `scope_hash`) and a fold row yield nothing. The new event still starts with `scope`, so `detectDrift` keeps skipping it, and `appendSpecRev` replay stays idempotent.
- `scopeAcceptance({assignees, appLogin, devflowScopes, confirms})` returns a predicate. A scope is accepted iff its author is an assignee, or equals `appLogin`, or a spec-rev row matches its n and CURRENT text hash, or an assignee's confirm names its n and CURRENT hash and was posted after it. Edited scopes (hash mismatch) drop back to pending on every route. With no options, everything is pending.
- `effectiveSpec(text, comments, {accept})` applies only scopes for which `accept(scope) === 'accepted'`, adds `pending:[{n, author, comment_id}]`, and counts only applied scopes in `chars`. With no `accept` the return value is deep-equal to before and has no `pending` key (pinned by a characterization test).

## Task Commits

1. **Task 1 RED:** `a2f76a36` test(49-03): scope authors and acceptance (30 of the 31 new tests failed as expected)
2. **Task 1 GREEN:** `ac517c8b` feat(49-03): scope acceptance predicate
3. **Task 2 RED:** `60cba435` test(49-03): effectiveSpec pending scopes (test 10 characterization passes on old code; the test 9 family and 6a fail)
4. **Task 2 GREEN:** `376da5f6` feat(49-03): effectiveSpec applies only accepted scopes

## Deviations from Plan

### Auto-fixed Issues

None. One additive interpretation, recorded here rather than as a defect:

**1. [Interpretation] `created_at` added to scope and confirm records**
- **Found during:** Task 1 design.
- **Issue:** The TRD lists confirm records as `{n, hash, author, comment_id}`, but its Order decision ("a confirm counts only if its `created_at` (or id order when equal) is after the scope comment") cannot be evaluated without the timestamp on both records. `comment_id` was already on scopes.
- **Fix:** Added `created_at` (string or `null`) to `parseScopeComments` scopes and `parseScopeConfirms` confirms, after the listed fields. 49-06 should pass `created_at`-bearing REST comments through unchanged and may rely on the key.
- **Files modified:** `gh-trd.cjs`, `gh-trd.test.cjs`
- **Commit:** `ac517c8b`

**Behaviour change (planned, from the TRD):** a legacy spec-rev row `scope n=K` written before objective 49 no longer marks a scope as DevFlow-authored. Those scopes now need an assignee author or a confirm. This is by design (an n-only match would let anyone edit a DevFlow scope and have the edit applied).

**Out of scope, noted for 49-06:** `planFold` calls `effectiveSpec` without `accept`, so a fold still folds every scope, pending or not. Wiring `accept` into the fold path (or refusing to fold while scopes are pending) belongs with the gate in 49-06.

**Known limit:** another person editing a confirm comment on GitHub is not detected here; the confirm keeps its original `user.login`. Mitigation, if wanted, is comparing `updated_at` in the 49-06 caller.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Authors, confirm markers and the acceptance predicate | `node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs` | 0 | PASS (177 tests at that commit, 31 new) |
| 2: `accept` option on effectiveSpec | `node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs` | 0 | PASS (189 tests, 43 new in total) |
| 2: gh-* suite | `node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'` | 0 | PASS (1263 tests, 0 fail) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs` | 0 | PASS (189/189) |
| regression | `node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'` | 0 | PASS (1263/1263) |
| seam guard | `node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` | 0 | PASS (gh-trd still has no fs and no gh-client) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs` | 1 | FAIL (correct): `parseScopeConfirms`, `buildScopeConfirm`, `scopeHash` ... not functions; scope `author` undefined |
| GREEN (task 1) | same | 0 | PASS (correct) |
| RED (task 2) | same | 1 | FAIL (correct): 7 failed (test 9 family, 6a); test 10 characterization passed on old code |
| GREEN (task 2) | same | 0 | PASS (correct) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (author and comment_id on scopes; parseScopeConfirms; scopeAcceptance rules; devflowScopesFrom incl. legacy rows; effectiveSpec accept and pending, no-accept output identical; edited scopes pending)
- Gate failures: None in the TRD's gates.
- Full suite (`node --test` over the `npm test` globs, absolute paths from the worktree): 7506 tests, 7448 pass, 50 skipped, 8 fail. All 8 are in `devflow-watch.test.cjs` and the handoff pipeline end-to-end tests. They fail only in this worktree because it has no `node_modules` (the daemon needs `node-pty`, which exists only in the main checkout); `devflow-watch.test.cjs` passes when run from the main checkout. None touches `gh-trd`.

## Next Phase Readiness

49-06 can consume, from `gh-trd.cjs`: `scopeHash`, `scopeEvent` (switch `enqueueScope`'s spec-rev event to it), `devflowScopesFrom`, `parseScopeConfirms`, `buildScopeConfirm`, `scopeAcceptance` and `effectiveSpec(..., {accept})`. It supplies assignees, `github.app_login`, the spec-rev text and the REST comments (with `user` and `created_at`).

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/gh-trd.cjs`, `plugins/devflow/devflow/bin/lib/gh-trd.test.cjs`
- FOUND commits: a2f76a36, ac517c8b, 60cba435, 376da5f6
