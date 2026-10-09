---
objective: 69-drafts-health-and-doctor
trd: "01"
subsystem: planning-verbs
tags: [drafts, staleness, doc-put, sha256, planning-draft]
requires:
  - objective: 48-planning-verbs
    provides: "planning draft / doc put verbs, writeThrough, store-mode outbox"
provides:
  - "per-draft base records (<draft>.base.json) and the staleness rule (base hash, mtime fallback for legacy drafts)"
  - "planning draft reseeds a stale draft and keeps the replaced one at <draft>.stale"
  - "doc put refuses a stale draft before writeThrough (no write, no outbox op, no gh call)"
affects: [69-06 docs, planning-verbs, planning-verbs-cli]
tech-stack:
  added: []
  patterns: ["one sidecar record per draft, never a shared manifest", "check before writeThrough, record after a successful write"]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/planning-drafts.cjs
    - plugins/devflow/devflow/bin/lib/planning-drafts.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-drafts-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/draft-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/planning-verbs.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs
key-decisions:
  - "Staleness is decided by a sha256 base record, not mtime: the agent's own edit makes the draft newer than a live file that changed after seeding. mtime is only the fallback for a draft with no usable base."
  - "A legacy draft with no base that is newer than the live file is adopted (a base of the live text is written), not refused: this is the one undetectable case."
  - "The reseed keeps the replaced draft at <draft>.stale, so a reseed never loses an agent's edits."
  - "No --force flag and no flag-spec change: the fix for a refusal is `df-tools planning draft <rel>`."
requirements-completed: [TOOL-06]
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true
duration: 9min
completed: 2026-10-08
tokens_input: 10063500
tokens_output: 58965
tokens_cache_read: 9880646
tokens_cache_write: 182698
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 69 TRD 01: Draft staleness guard Summary

**`planning draft` now reseeds a stale draft (old copy kept at `<draft>.stale`) and `doc put` refuses one, using a per-draft sha256 base record with an mtime fallback for drafts made before it existed.**

## Progress
- [x] Task 1: Draft-project fixture builder — acd265e1
- [x] Task 2: planning-drafts.cjs (tests 7-17) — d56c54bb (RED), 357be724 (GREEN)
- [x] Task 3: Wire `planning draft` and `doc put` (tests 1-6, 18) — 75e82f1b (RED), d09e8428 (GREEN)

## What was built

- `lib/planning-drafts.cjs` (new): `draftFileFor`, `liveFileFor`, `prepareDraft`, `checkDraftBase`, `recordPublished`, plus `DRAFTS_DIR`, `BASE_SUFFIX`, `STALE_SUFFIX`. Pure apart from fs. The staleness rule is one function used by both `planning draft` and `doc put`; path comparison goes through a `realDeep` (realpath of the deepest existing ancestor) so macOS `/var` and `/private/var` compare equal even when a file does not exist yet.
- `planning-verbs.cjs`: `draftPath` delegates to `prepareDraft`; `docPut` calls `checkDraftBase` after the rel/text checks and before `writeThrough` (the only call site), and `recordPublished` after an `ok` write (a failure there is a warning: the publish already happened).
- `planning-verbs-cli.cjs`: `withInput` hands `from` to its callback; `doc put` passes it to `docPut`; `planning draft` prints only the path on stdout, a `reseeded ...` notice on stderr, and `--raw` gains `seeded`, `reseeded`, `stale_copy`. `FROM_USAGE` mentions the reseed.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: draft-project fixture | `node -e "...makeDraftProject(); p.run(['planning','draft','PROJECT.md']) ..."` printed `0 true` | 0 | PASS |
| 2: planning-drafts.cjs | `node --test plugins/devflow/devflow/bin/lib/planning-drafts.test.cjs` (13 tests, numbers 7-17) | 0 | PASS |
| 3: wiring | `node --test` over planning-drafts-cli, planning-drafts, planning-verbs, planning-verbs-cli, planning-verbs.e2e, planning-writes.repo, gh-seam.repo (88 tests) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 2) | `node --test planning-drafts.test.cjs` (module missing) | 1 | FAIL (correct) |
| GREEN (task 2) | `node --test planning-drafts.test.cjs` | 0 | PASS (correct) |
| RED (task 3, CLI) | `node --test planning-drafts-cli.test.cjs` (tests 1, 2, 5 failed; 3, 4, 6 already passed) | 1 | FAIL (correct) |
| RED (task 3, store) | `node --test --test-name-pattern "18\. " planning-verbs.test.cjs` (stale draft published: `true !== false`) | 1 | FAIL (correct) |
| GREEN (task 3) | the seven-file scoped run above | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, final) | `node --test` on the seven files above (88 tests, 0 fail) | 0 | PASS |
| test (full suite) | `node --test 'plugins/devflow/**/!(micro).test.cjs' ...` in the worktree | 1 | PASS for this change; remaining failures are worktree-environment (see Issues) |
| lint / typecheck / build | none in the stack profile | n/a | not_available |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A new `planning-*.cjs` module must be listed in the gh-seam guard**
- **Found during:** Task 3, full-suite run
- **Issue:** `gh-seam.repo.test.cjs` test 22 ("a new one cannot slip past the guard") failed with `unguarded planning-*.cjs module: planning-drafts.cjs`. The file was not in the TRD's `files_modified`.
- **Fix:** added `planning-drafts.cjs` to `PLANNING_MODULES` (the module spawns nothing and never calls `ghWrite(`, so the guard's other checks hold).
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs`
- **Commit:** d09e8428

Otherwise the TRD was executed as written.

## Issues Encountered

- The full suite, run from this worktree, shows failures that do not involve this change: the `devflow-watch` foreground-daemon tests (start, "refuses when daemon already running", C-1, C-2), LK-1, LK-2 and the four daemon-driven "handoff pipeline" tests. The daemon never writes its PID file when launched from the worktree path. The same `devflow-watch.test.cjs` passes 22/22 from the main checkout at the same HEAD, `devflow-watch.cjs` and its `watcher-*` modules require none of the files this TRD touched, and a manual `devflow-watch.cjs start --foreground` from the worktree prints its `started` line, so this is a worktree-environment failure whose cause was not pursued (out of scope), not a regression from this change. In the baseline run from the main checkout the only failures were `hook-coexistence` (test 11) and `planning-writes.audit` (test 10, `spawnSync ... EPIPE`), which did not recur in the worktree run, so they look load-flaky.
- `help.cjs` still says `planning draft <rel>` "prints a draft path seeded with the current file". It is still true but no longer complete (a stale draft is reseeded). The file is outside this TRD's `files_modified`; 69-06 (docs) can pick it up.

## Discovered commands

None: every command came from `.planning/STACK.md` / the stack profile (`npm test`, scoped `node --test {files}`).

## Post-TRD Verification

- Auto-fix cycles used: 1 (the gh-seam guard entry)
- Must-haves verified: 7/7 truths (CLI tests 1-6 and store test 18 cover them: stale refusal with the fix named and the live file byte-identical; reseed with stderr notice, path-only stdout and `.stale` copy; legacy mtime fallback and unparseable base (unit tests 12, 13); an edited draft with a current base never overwritten (test 9 and existing test 16); store-mode refusal with no outbox op and no gh call (test 18); re-publish from the same draft (test 4); stdin and a foreign file unchanged (test 6, unit tests 15, 16))
- Success criterion: `rg -n "checkDraftBase\(" planning-verbs.cjs` finds exactly one call, inside `docPut`
- Gate failures: none attributable to this change

## Self-Check: PASSED

All created files exist and all five task commits (acd265e1, d56c54bb, 357be724, 75e82f1b, d09e8428) are in the branch history.
