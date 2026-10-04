---
objective: 47-github-authoritative-store
trd: "12"
subsystem: github-sync
tags: [gh-sync, store-mode, outbox, roadmap-page, offline, config, seam-guard, tdd]

requires:
  - objective: 47-github-authoritative-store
    provides: "47-04 gh-wiki, 47-06 gh-capability, 47-07 gh-outbox-flush, 47-09 gh-hierarchy, 47-10 gh-cache"
provides:
  - "gh.cjs store branch of syncObjective / syncAll behind github.store (strict boolean), exported storeEnabled"
  - "templates/config.json: github.store=false, labels.trd, labels.decision, wiki.remote"
  - "seam guard over the 8 store modules (gh-wiki is the only store-module git seam; no direct ghWrite outside the flusher)"
affects: [47-13, 47-14]

tech-stack:
  added: []
  patterns:
    - "every new sync step is reached only through `plan`, which is null unless storeEnabled(cfg): store off is objective 46 byte for byte"
    - "budget/cycle gate (planPush) runs before auth: a refusal means zero gh calls"
    - "mapping is persisted BEFORE pushHierarchy and the flush runs AFTER the last mapping write, so a stale in-memory mapping never overwrites flusher-written TRD entries"
    - "sync-state baseline (gh_updated_at) is read after the flush; a deferred flush runs it from syncAll via `finalize`"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-sync-store.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh.cjs
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
    - plugins/devflow/devflow/templates/config.json
    - plugins/devflow/devflow/bin/lib/migrations/0001-config-stamp.test.cjs

key-decisions:
  - "Roadmap page is followed by a convergence pass: re-queue only the objective patch-body op(s) and flush again, because the Roadmap wiki commit moves the clone HEAD that the objective body's `wiki` section pins. Without it every sync after a Roadmap change patches the body once more and an unchanged re-run is not zero writes (TRD test 4)"
  - "GhAuthError gains `offline` (additive); store mode treats an offline auth failure as 'queue, do not fail', every other auth failure is still thrown"
  - "OBJECTIVE.md pushed to the wiki is the local file at flush time, i.e. including the github_issue frontmatter that 46's step 9 writes before the push"

requirements-completed: [GST-01, GST-02, GST-05, GST-06, GST-07]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 3 sessions (resumed twice)
completed: 2026-10-01
---

# Objective 47 TRD 12: Wire the store into `gh sync`; config defaults; seam guard Summary

**With `github.store: true`, `gh sync <objective>` keeps 46's find-or-create, then pushes the hierarchy through the outbox (one body writer), flushes, renders the wiki `Roadmap` page from the issues and records the cache baseline; with it off, `gh sync` is objective 46 unchanged.**

## Accomplishments

- **Store branch (`gh.cjs`).** `storeEnabled(cfg)` is `cfg.github.store === true` (the string `"true"` is not store mode). In `syncObjective` an objective with a directory gets `plan = planPush(...)` right after resolution and BEFORE auth: an over-budget TRD returns `{ok:false, refused:'budget', over, message}` with zero gh calls (no `auth status`, no objective issue, no journal). After 46's find-or-create the direct `issue edit` (step 6) is skipped and `pushHierarchy(root, id, {objectiveSections: 46's sections minus trds, flush, flushOptions:{wait:true}})` is the single writer of the objective body.
- **Flush and after-flush work.** A `flushed` result refreshes the Roadmap page (`readRemoteModel` -> `renderRoadmap` -> `openStore(mode).writePage('Roadmap')` -> `push`), records the cache baseline of every pushed file (TRDs, SUMMARY, VERIFICATION, OBJECTIVE/CONTEXT/RESEARCH, PROJECT, REQUIREMENTS, codebase/*), and runs the convergence pass (see Decisions). `pending` / `halted` / `running` are `{ok:true, outbox:<status>}` with a warning (halted names `df-tools gh outbox status`) and `roadmap_page:'skipped'`. A flush ending `error` is `{ok:false, error:'outbox_flush_failed'}`.
- **`sync --all`.** Each objective only enqueues (`deferFlush`); after the loop and the final mapping write `finishStoreRun` flushes once, then Roadmap page + baseline, then each objective's sync-state baseline. Result gains `hierarchy:{outbox, objectives}` and `roadmap_page`.
- **Offline.** `requireGhAuth` failures carry `offline`. An offline objective that is already mapped skips the live 46 steps with warning `offline: state comment and Project fields not updated ...`, queues the hierarchy and returns `{ok:true, outbox:'pending', roadmap_page:'skipped'}`. An unmapped one is `{ok:false, error:'offline', message:'... cannot be created offline'}` and queues nothing. A find-or-create failure that reads as offline (mapped objective) takes the same path.
- **Config.** `templates/config.json`: `github.store:false`, `github.labels.trd`/`decision`, `github.wiki.remote:""`; `config-get github.store` answers `false`.
- **Seam guard.** GUARDED now covers `gh-trd, gh-capability, gh-outbox, gh-outbox-flush, gh-hierarchy, gh-comments, gh-wiki, gh-cache`; test 20 names the two git spawn sites, test 21 forbids `ghWrite(` in the store modules other than the flusher.

## Contract for 47-13 / 47-14

- **Config keys:** `github.store` (bool, default false), `github.labels.trd|decision`, `github.wiki.remote`. No budget knobs.
- **`syncObjective(arg, root, {runCtx?, deferFlush?})`** adds (store mode only): `hierarchy:{enqueued:N, coalesced:N, ops:N, outbox:'flushed'|'pending'|'halted'|'running'|'queued'|'skipped', degraded:[...]}`, `roadmap_page:'pushed'|'unchanged'|'skipped'` and, when the flush did not complete, top-level `outbox:'pending'|'halted'|'running'`. Failures: `{ok:false, refused:'budget'|'cycle'|'readonly', error, message, over?}`, `{ok:false, error:'offline', message}`, `{ok:false, error:'outbox_flush_failed'|'store_push_failed', message}`. With `deferFlush` the internal result also carries `_store:{plan, sections, modes, finalize}` (not in `syncAll` rows).
- **`syncAll(root)`** (store mode): rows carry `hierarchy`/`outbox`/`refused`/`over`; top level has `hierarchy`, `roadmap_page`, and `outbox` when the one flush did not complete. A refused (over-budget) objective fails only its own row.
- `roadmap_page:'pushed'` is also reported for the docs backend (page written).
- Exported: `gh.storeEnabled`. `gh-store-cli.cjs` (47-11) is not in the seam GUARDED list; 47-13 adds it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Re-run was not zero writes (TRD test 4)**
- **Found during:** Task 1 GREEN
- **Issue:** the Roadmap page is a wiki commit made after the objective body patch, so the body's `wiki` section pinned the previous clone HEAD; the next unchanged sync patched the objective body once more.
- **Fix:** after a changed wiki-mode Roadmap push, re-queue only the objective `patch-body` op(s) (rebuilt with `gh-hierarchy.buildOps`, filtered) and flush once more. Unchanged re-runs (single and `--all`) now perform zero gh writes (tests 4, 5b).
- **Consequence:** `sync --all` can call `flush` twice (the second carries only objective body patches); test 5 asserts exactly that, not a literal single call.
- **Files modified:** `gh.cjs`, `gh-sync-store.test.cjs`
- **Commit:** cd31389

**2. [Rule 1 - Bug] Migration 0001 test broke on the new nested label defaults**
- **Found during:** full suite
- **Issue:** `0001-config-stamp.test.cjs` test 5 compared the user's `github.labels` object for equality; migration 0001's deep merge now also adds `labels.trd` / `labels.decision` (template defaults).
- **Fix:** the assertion is recursive: every user key survives, every added key equals the template default (the test's stated intent). No behaviour change in the migration.
- **Files modified:** `plugins/devflow/devflow/bin/lib/migrations/0001-config-stamp.test.cjs`
- **Commit:** c575e58

### Interpretations and additions (not defects)

- **Test 12 / git seam.** `awareness.cjs` (already guarded since 46) spawns git, so "git only in gh-wiki" would fail on pre-existing code. The guard names both sites explicitly (gh-wiki, awareness) and fails on any other, rather than relaxing the pattern. Tests 12/21 were green on first run (the store modules already honoured the seam), so Task 2's RED commit is red only through test 11.
- **Wiki page content.** `Objective-7-...` on the wiki is the local OBJECTIVE.md including `github_issue:` (46's step 9 writes it before the push); test 2 asserts that, not the bare fixture.
- **`GhAuthError.offline`.** Additive property; messages and remediation unchanged for 46 callers.
- **Roadmap-only objectives** (no directory) in store mode sync as in 46 with a warning; there is nothing to push.
- **Extra tests** beyond the TRD list: 1b (strict boolean), 5b (unchanged `--all` re-run), 10a-cli, 10a-all, 8a/8b split, 11b (`config-get`).
- **SUMMARY filename** `47-12-SUMMARY.md` per the dispatch.

### Known limits

- Offline detection relies on `gh-outbox-flush.classifyFailure` plus gh's "error connecting to" wording; an unfamiliar offline message is treated as an ordinary auth failure.
- The convergence pass costs one extra flush (a no-op walk plus one PATCH) only when the Roadmap page actually changed.
- Direct writes still outside the outbox in store mode (objective 48): the objective-issue create, label/milestone bootstraps, the sticky state comment, Project v2 fields.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: store branch (tests 1-10a) | `node --test gh-sync-store.test.cjs gh-sync.test.cjs gh-e2e.test.cjs gh-commands.test.cjs gh.test.cjs execute-objective-gh-sync.test.cjs` (+ gh-hierarchy, gh-pull) | 0 (store 16/16; regression 247 tests, 0 fail) | PASS |
| 2: config defaults + seam guard (tests 11-12) | `node --test gh-seam.repo.test.cjs gh-sync-store.test.cjs awareness.test.cjs config.test.cjs` | 0 (167 tests, 0 fail) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test gh-sync-store.test.cjs` | 1 (13 of 15 fail; store-off tests 1/1b pass) | FAIL (correct) |
| GREEN (task 1) | `node --test gh-sync-store.test.cjs` | 0 (16/16) | PASS (correct) |
| RED (task 2) | `node --test gh-seam.repo.test.cjs gh-sync-store.test.cjs` | 1 (tests 11, 11b fail; seam 20/21 already green) | FAIL (correct) |
| GREEN (task 2) | same + awareness, config | 0 (167 tests) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test gh-sync-store.test.cjs gh-seam.repo.test.cjs` | 0 | PASS |
| regression | `node --test gh-sync.test.cjs gh-e2e.test.cjs gh-commands.test.cjs gh.test.cjs execute-objective-gh-sync.test.cjs` | 0 | PASS |
| full suite | `npm test` | 0 failures (6888 tests, 6855 pass, 0 fail, 33 skipped; MA-7 doctl auth is a known environment-dependent failure on the base and did not fail on the final run) | PASS |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (one body writer; Roadmap page + baseline after a complete flush; budget gate before any gh call; store off == 46; `--all` enqueues then flushes at the end; offline mapped -> pending; seam guard extended)
- Gate failures: None

## Commits

- 475d73e test(47-12): failing tests for the store branch of gh sync
- cd31389 feat(47-12): store branch in gh sync (hierarchy via outbox, Roadmap page, baseline, offline queueing)
- 581cb6e test(47-12): config defaults test and seam guard for the store modules
- d09f2e7 feat(47-12): github.store, trd/decision labels and wiki.remote config defaults
- c575e58 test(47-12): migration 0001 test accepts nested template defaults under github.labels
- f44d4bb feat(47-12): export storeEnabled from gh.cjs

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-sync-store.test.cjs, gh-seam.repo.test.cjs (modified), templates/config.json (modified), gh.cjs (modified)
- FOUND commits: 475d73e, cd31389, 581cb6e, d09f2e7, c575e58, f44d4bb
- `.planning/STATE.md` and `.planning/ROADMAP.md` untouched (parallel wave; the orchestrator updates them)
