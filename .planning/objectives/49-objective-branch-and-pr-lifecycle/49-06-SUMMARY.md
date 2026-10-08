---
objective: 49-objective-branch-and-pr-lifecycle
trd: "06"
subsystem: github-store
tags: [scope-gate, confirm-scope, trd-start, store-mode, assignees, override]
requires:
  - objective: 49-01
    provides: fake GitHub viewer, assignees, seedComment {login}, humanEditComment
  - objective: 49-03
    provides: scopeAcceptance, scopeEvent, scopeHash, devflowScopesFrom, parseScopeConfirms, buildScopeConfirm, effectiveSpec accept
provides:
  - "store mode: readEffectiveSpec applies only accepted scopes and returns pending:[{n, author, comment_id}] and assignees"
  - "store mode: foldTrd never folds past a pending scope and lists pending"
  - "store mode: enqueueScope writes the hash-bound spec-rev event `scope n=K scope_hash=H`; store off keeps `scope n=K`"
  - "gh trd confirm-scope <trd> <n> [--force --reason <why>] and gh trd start <trd> (both store-gated)"
  - "gh-comments: readViewerLogin, readScopeForConfirm, enqueueScopeConfirm, enqueueTrdStart, scopeConfirmKind"
  - "override gate scope-confirm; github.app_login documented in templates/config.json"
affects: [49-09, 49-11, 49-13, 49-14]
key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/gh-comments.cjs
    - plugins/devflow/devflow/bin/lib/gh-comments.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-store-cli.cjs
    - plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/override.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/templates/config.json
key-decisions:
  - "The confirm sticky comment kind spells n in letters (`scope-confirm-two`): gh-body's comment kind is [a-z-]+, so `scope-confirm-2` is rejected by commentMarker and the flusher could never post it"
  - "readTrdState reads the objective issue only with {acceptance:true} (readEffectiveSpec, foldTrd, readScopeForConfirm); freeze, drift and enqueueScope keep their two reads"
  - "enqueueScope's size check and row hash count every scope, accepted or pending, so a pending scope that is later confirmed cannot push the spec over 60,000"
  - "Scope and confirm hashes bind the text with trailing whitespace dropped (boundText), because GitHub may strip it and a scope must not stay pending for that"
requirements-completed: [GPR-05, GPR-03]
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true
duration: about 50 min
completed: 2026-10-01
tokens_input: 11887520
tokens_output: 98211
tokens_cache_read: 11643519
tokens_cache_write: 243869
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 49 TRD 06: Scope-change gate, confirm-scope and trd start Summary

**In store mode a scope comment from a non-assignee is visible but not applied to `gh trd spec` or a fold until an assignee confirms it with `gh trd confirm-scope`, and `gh trd start` marks a TRD in progress at spawn with a label.**

## Accomplishments

- `readTrdState(root, trd, {acceptance:true})`, store mode only: one extra read (the objective issue's assignees from the mapping's `issue_id`), the `github.app_login` config value, the spec-rev DevFlow scope rows and the scope confirms (both a plain comment opening with the marker and the sticky `scope-confirm-<n>` comment, whose marker sits on the line after DevFlow's own). It builds a 49-03 `scopeAcceptance` predicate. A failed objective read is an error naming the objective, never a silent "no assignee"; an objective with no issue in the mapping gives `assignees: null` and no read.
- `readEffectiveSpec` passes the predicate as `accept` (store mode): pending scopes are absent from `text`, `encoded` and `chars`, and the result has `pending` and `assignees`. With the store off the shape is unchanged (no `pending` key, no objective read).
- `foldTrd` (store mode) leaves out the scope comments from the first pending unfolded scope on, so it folds through the highest n whose predecessors are all accepted. A pending scope at n=1 is a no-op. Every result lists `pending`.
- `enqueueScope` writes `scopeEvent(n, scopeHash(text))` in store mode and `scope n=K` with the store off, byte for byte.
- `gh trd confirm-scope <trd> <n>`: the caller's login comes from `gh api user`; only an objective-issue assignee (case-insensitive) may confirm. A non-assignee gets exit 1 naming the assignees, with nothing queued and nothing logged (`--force` does not get around it). With no assignee, `--force --reason <why>` is required and `override.recordOverride({gate:'scope-confirm'})` runs before the op is queued. An unknown n is exit 1, an already accepted one is exit 0 "already accepted" with no op. The queued op is the sticky `upsert-comment {id, kind: scopeConfirmKind(n)}` holding `<!-- devflow:scope-confirm n=K hash=H -->`; re-confirming after an edit replaces the same comment.
- `gh trd start <trd>`: queues `patch-issue {id} {labels_add:[github.labels.in_progress]}` (default `devflow:in-progress`). No reads, so it queues offline and exits 3 when pending.
- `gh trd spec` prints the pending block (author, n, the confirm verb) to stderr so stdout stays the pure effective spec; the JSON payload carries `pending`. With `assignees: null` it hints at `gh sync <objective>`.
- Both new verbs are skipped (exit 0, zero gh calls) with the store off; `spec|freeze|fold|scope` keep their `github.enabled`-only gating. `override.GATES['scope-confirm'] = null`, `"app_login": ""` in `templates/config.json`, help usage updated.

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | `6e8d73cc` | test(49-06): pending scopes (14 new failing, 3 updated events) |
| 1 | GREEN | `485310fa` | feat(49-06): only accepted scopes change a TRD |
| 2 | RED | `5ba5381f` | test(49-06): confirm-scope and trd start verbs (16 of 19 new failing) |
| 2 | GREEN | `99dddde6` | feat(49-06): confirm-scope and trd start |

## Deviations from Plan

**1. [Rule 3 - Blocking] The confirm comment kind cannot contain a digit**
- **Found during:** Task 1 design (verified with `commentMarker('49-02','scope-confirm-2')`, which throws).
- **Issue:** The TRD names the sticky kind `scope-confirm-<n>`. gh-body's comment kind grammar is `[a-z-]+` (`KIND_RE`, `MARKER_SOURCE`), so the flusher's `commentMarker` would reject it and the confirm could never be posted. gh-body.cjs belongs to the parallel TRD 49-05, so I did not touch it.
- **Fix:** `scopeConfirmKind(n)` spells the digits: `scope-confirm-two`, `scope-confirm-one-zero`. It is the one place to change if gh-body later allows digits in a kind. The reader looks the comments up by that kind.
- **Files:** `gh-comments.cjs` (`scopeConfirmKind`). **Commits:** `485310fa`.

**2. [Rule 1 - Test fixture] Store-mode fixtures that seeded raw scope comments**
- **Found during:** Task 1 GREEN. The store-mode gate sees a raw scope comment (default author, no row) as pending, so the existing 14a/14b, fold tests and CLI tests 7, 9, 9b no longer applied their scopes.
- **Fix:** as the TRD's gotcha directs, those fixtures now use `seedDevflowScope`, which adds the `scope n=K scope_hash=H` row (it models a DevFlow scope). `seedSpecRev` now merges into the TRD's one spec-rev comment. The rule was not weakened. The CLI fixture change shipped in `485310fa` with the GREEN that caused it. Event assertions at 5a, 5c and 9e (the TRD named ~L520 and ~L702; 5a also had a `scope n=3` event) now expect the hash-bound event.
- **Commits:** `6e8d73cc`, `485310fa`.

**3. [Interpretation] Hash-bound text drops trailing whitespace**
- `scopeHash` (49-03) is unhashed-trim, but `sameText` in this module already assumes GitHub may strip trailing whitespace, and `@file:` scopes usually end in a newline. A DevFlow scope would otherwise stay pending forever. The row hash, the confirm hash and the predicate all use `boundText` (CRLF-normalised, `trimEnd`), so they agree. Cost: a trailing-whitespace-only edit does not invalidate an approval.

**4. [Interpretation] enqueueScope is not gated**
- The TRD gates `readEffectiveSpec` and `foldTrd`. `enqueueScope`'s overflow check and row hash still cover every scope, so a pending scope later confirmed cannot overflow the 60,000-char body, and the row hash is unchanged from today.

**5. [Interpretation] `readTrdState` reads assignees only on request**
- The TRD says `readTrdState` reads them. It does so with `{acceptance:true}`; freeze, drift and `enqueueScope` keep their two-read cost (test R1 pins it).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `node --test plugins/devflow/devflow/bin/lib/gh-comments.test.cjs` | 0 (86 tests: 69 existing, 17 new) | PASS |
| 2 | `node --test plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` | 0 (gh-store-cli: 69 tests, 19 new) | PASS |
| 2 | `node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'` | 0 (1350 tests) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test gh-comments.test.cjs gh-store-cli.test.cjs` | 0 (155 tests) | PASS |
| regression | `node --test 'gh-*.test.cjs' help.test.cjs dispatch-completeness.test.cjs override.test.cjs gitignore-markers.test.cjs audit-cli.test.cjs` | 0 (1426 tests) | PASS |
| seam | `node --test gh-seam.repo.test.cjs` and all `*.repo.test.cjs` | 0 (35 tests) | PASS |

Wider run (`bin/lib/*.test.cjs` and `bin/*.test.cjs`): 6321 tests, 6268 pass, 8 fail. All 8 are `devflow-watch.test.cjs` and `handoff-e2e.test.cjs` daemon tests that fail in any worktree (no `node_modules`/`node-pty`); none imports a file this TRD changed.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test gh-comments.test.cjs` | 1 (17 failed: 14 new, 3 updated events) | FAIL (correct) |
| GREEN (task 1) | same | 0 (86 pass) | PASS (correct) |
| RED (task 2) | `node --test gh-store-cli.test.cjs` | 1 (16 failed of 69) | FAIL (correct) |
| GREEN (task 2) | same | 0 (69 pass) | PASS (correct) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 9/9 (assignee read and pending in store mode only; store-off byte parity pinned by 2b/2c/12a; hash-bound event; spec shows pending apart; fold stops before pending; confirm assignee-only; `--force --reason` with override log; sticky confirm with the current hash; `trd start` label; new verbs skipped with the store off)
- Gate failures: None

## Notes for dependents

- **49-09 / 49-14:** `gh trd start` and `confirm-scope` exit codes follow `queuedResult`: 0 done, 2 halted, 3 pending, 1 error. Test with the fake `viewer` option (`alice` assignee, `mallory` not) and `seedObjective(assignees)`-style fixtures; the objective must be in the mapping (`setEntry`) for the assignee read to happen.
- **49-11:** `summary post` removes the in-progress label that `gh trd start` adds. The label is `github.labels.in_progress` (default `devflow:in-progress`). `patch-issue` only has `labels_add`, so the removal needs a new op or flusher support (49-05 owns the outbox schema).
- **49-13:** call `df-tools gh trd start <trd>` at TRD spawn. With the store off it prints skipped and exits 0, so the prose can run it unconditionally. Executors read the spec with `gh trd spec <trd>`: stdout is the effective spec, stderr lists pending scopes.
- **Anyone building a confirm by hand:** the kind comes from `scopeConfirmKind(n)` (letters, not digits); the confirm hash is `scopeHash` of the scope text with trailing whitespace dropped.
- **Known limit (49-03):** another person editing a confirm comment on GitHub is not detected.

## Self-Check: PASSED

- FOUND: gh-comments.cjs, gh-comments.test.cjs, gh-store-cli.cjs, gh-store-cli.test.cjs, override.cjs, help.cjs, templates/config.json (all in `plugins/devflow/devflow/...`)
- FOUND commits: 6e8d73cc, 485310fa, 5ba5381f, 99dddde6
