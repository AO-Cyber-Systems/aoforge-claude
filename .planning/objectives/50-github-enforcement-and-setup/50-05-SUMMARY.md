---
objective: 50-github-enforcement-and-setup
trd: "05"
subsystem: hooks
tags: [hook, outbox, flush, store-mode, post-tool-use, stop, drift, w055, gen-02, warn-only]

requires:
  - objective: 47-github-authoritative-store
    provides: "gh-outbox.status, `df-tools gh outbox flush --no-wait --raw` (exit 0/1/2/3), the single-flusher lock"
  - objective: 48-planning-write-path-migration
    provides: "planning-mode.isStoreMode / resolveMainRoot, planning-drift.findCacheDrift (W055)"
provides:
  - "hooks/gh-flush.js: one script on PostToolUse(Bash, `df-tools commit` only) and Stop; flushes the outbox and reports pending / halted / drift"
  - "hooks.json: a new PostToolUse group (matcher Bash) and a third Stop entry after auto-continue"
  - "isDfToolsCommit(command) export (trigger predicate)"
affects: [50-12, 50-13]

tech-stack:
  added: []
  patterns:
    - "cheap in-process pre-check (store mode, outbox counts, drift) decides whether to spawn anything; the spawn is bounded by a timeout and never retried"
    - "fail-open hook: top-level try/catch, process.exitCode = 0, no `decision` key on any path"
    - "tests swap CLAUDE_PLUGIN_ROOT for a fake plugin whose df-tools.cjs only records argv, to prove 'no child spawned' and pin the exit-code mapping"

key-files:
  created:
    - plugins/devflow/hooks/gh-flush.js
    - plugins/devflow/hooks/gh-flush.test.js
  modified:
    - plugins/devflow/hooks/hooks.json
    - plugins/devflow/hooks/planning-writes.audit.test.js
    - CLAUDE.md

key-decisions:
  - "Drift (W055) is checked and reported at Stop only. findCacheDrift hashes every cache file, so running it after every `df-tools commit` would add that cost to each commit; the TRD named the drift line without naming the event, and truth 2 puts it on Stop."
  - "A halted outbox is reported on both events and is never flushed (the pre-check sees `status.halted`, so nothing is spawned). A blocked head op surfaces as halted through gh-outbox.status."
  - "The spawned flush is killed with SIGKILL on timeout so the hook is strictly bounded. A killed flush cannot release the outbox lock, so the next flush reports `running` (silent) until the lock goes stale (LOCK_STALE_MS, 10 min)."
  - "The commit-trigger regex is the TRD's, tightened to `commit(?=\\s|$)` with an optional closing quote after `df-tools[.cjs]`, so `df-tools commit-<something>` does not count."
  - "Report text is prefixed `DevFlow: ` and kept to one line per condition."

patterns-established:
  - "A store-mode hook returns before loading any gh-* lib in local mode: only planning-mode.cjs is required first"

requirements-completed: [GEN-02]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: ~10min
completed: 2026-10-01
---

# Objective 50 TRD 05: post-commit and Stop outbox flush hook Summary

**One hook script, registered on PostToolUse(Bash) and Stop, sends queued store-mode GitHub writes soon after `df-tools commit` and at Stop, reports pending, halted and cache-drift (W055) states, and never blocks: no `decision` key, exit 0 on every path, nothing written under `.planning/`.**

## Performance

- **Duration:** about 10 min (17:11Z claim to 17:21Z; the machine was loaded by parallel wave-1 executors, which made some real-flush tests run 5-8 s instead of 0.3 s)
- **Completed:** 2026-10-01T17:20Z
- **Tasks:** 2/2
- **Files:** 5 (2 new, 3 modified)

## Accomplishments

- `gh-flush.js` branches on `hook_event_name`. PostToolUse acts only when the Bash command matches `df-tools commit`; Stop always runs the pre-check. Both return silently in local mode, for an unrelated command, with an empty queue and no drift, or with `DEVFLOW_SKIP_GH_FLUSH_HOOK=1`.
- Pre-check in-process, no spawn and no gh: `planning-mode.isStoreMode`, then `resolveMainRoot`, then `gh-outbox.status`. The flush is spawned only when `pending + blocked > 0` and the outbox is not halted:
  `df-tools --cwd <root> gh outbox flush --no-wait --raw`, 20 s on PostToolUse and 30 s on Stop, override `DEVFLOW_GH_FLUSH_TIMEOUT_MS`.
- Exit mapping: 0 and ops sent -> "synced N GitHub write(s)" (silent otherwise, including `running` and `skipped`); 3 -> "N GitHub write(s) queued (offline|rate limited|...); they will retry"; 2 -> "outbox halted: <reason> - run df-tools gh outbox status"; 1 or a timeout -> "GitHub sync failed: <first line>; queued writes are kept".
- Report channel: PostToolUse -> `hookSpecificOutput.additionalContext` (Claude sees it); Stop -> `systemMessage` (the user sees it).
- hooks.json registers it in a new PostToolUse group (matcher Bash) and as the third Stop entry; CLAUDE.md lists it under **Observability (warn-only)**.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: hook behaviour (tests 1-9) | `node --test plugins/devflow/hooks/gh-flush.test.js` (27 pass) | 0 | PASS |
| 2: registration and inventory (test 10) | `node --test hook-inventory.test.cjs planning-writes.audit.test.js doctor-checks/11-12-install.test.cjs` (72 pass) | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test hooks/gh-flush.test.js bin/lib/hook-inventory.test.cjs` | 0 | PASS |
| regression | `node --test hooks/planning-writes.audit.test.js hooks/auto-continue.test.js` (all four files together: 169 pass, 0 fail) | 0 | PASS |
| repo guards | `node --test doc-refs.repo.test.cjs doc-staleness.test.cjs planning-writes.repo.test.cjs gh-seam.repo.test.cjs doctor-checks/11-12-install.test.cjs` (75 pass) | 0 | PASS |

All runs used absolute worktree paths. Full `npm test` was not run, as instructed.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test hooks/gh-flush.test.js` | 1 | FAIL (27 of 27: hook file absent) |
| GREEN (Task 1) | `node --test hooks/gh-flush.test.js` | 0 | PASS (27 pass) |
| RED (Task 2) | `node --test hook-inventory.test.cjs planning-writes.audit.test.js 11-12-install.test.cjs` | 1 | FAIL (inventory 1: "missing: gh-flush.js"; audit 10a: not audited) |
| GREEN (Task 2) | the same three files | 0 | PASS (72 pass) |

Commit order is test then implementation for both tasks.

## Commits

| Commit | Message |
|---|---|
| 28a1ad33 | test(50-05): outbox flush hook |
| 20291209 | feat(50-05): flush the outbox after df-tools commit and on Stop |
| d96bb549 | test(50-05): register gh-flush (inventory red) |
| bb6ae337 | docs(50-05): document the gh-flush hook |

## Test coverage against the TRD list

- 1-3, 9 (silent, zero gh calls): the shim's call log is empty, and a recording fake `df-tools.cjs` shows no child was spawned.
- 4 (flushed): a queued `upsert-comment` (replace) on a mapped TRD, the shim answering the comment list and the comment POST; the notice is "synced 1 GitHub write" and the queue is empty afterwards. This is the single cheap op kind the TRD's error_recovery asked to record.
- 5 (offline): the shim's offline table; "1 GitHub write queued (offline); they will retry", one line, op still pending, `.planning/` byte-identical.
- 6 (Stop): `systemMessage` only, no `decision`, no `hookSpecificOutput`.
- 7 (drift): a cache index seeded with a file's hash, no report; after a hand edit, "1 planning cache file changed outside a verb (W055) - run df-tools validate health"; the hook does not repair it and a Stop alone spawns nothing.
- 8 (fail open): malformed, empty, `[]`, `null` and numeric stdin; no or unknown `hook_event_name`; a missing plugin lib; a lib that throws on load; a cwd that does not exist; a corrupt journal.
- 10: hook-inventory, the planning-writes audit and the hooks-registry doctor check all pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The planning-writes audit requires an entry for every registered hook**
- **Found during:** Task 2 RED run
- **Issue:** `planning-writes.audit.test.js` test 10a fails for any script registered in hooks.json that has no `RUNS` entry. That file is not in this TRD's `files_modified`, yet Task 2's verify command includes it, so Task 2 could not go green without touching it.
- **Fix:** added a `postTool` payload helper and a `'gh-flush.js'` RUNS entry (a `df-tools commit` PostToolUse and a Stop). The audit world is a local-mode project, so both variants exercise the silent path; the entry pins that the hook writes no dotfile.
- **Files modified:** plugins/devflow/hooks/planning-writes.audit.test.js
- **Commit:** bb6ae337 (the TRD's RED commit d96bb549 therefore leaves the audit red as well as the inventory)

### Additions beyond the TRD's test list (no behaviour contradicts the TRD)

- `isDfToolsCommit` unit tests; 1b (local mode with the real plugin, both events); 3b (a non-Bash PostToolUse is ignored); 6b (Stop flushes when reachable).
- Exit-code mapping and bound tests against a fake `df-tools.cjs`: exact argv, nothing-sent silence, a held lock (`running`) silence, rate limited, halted, exit 1 first-line, timeout kill, a halted outbox reported without a spawn.
- Test fixture note: gh-mapping keys a TRD by its normalised id (`7-01`, no leading zero). The first fixture used `07-01`, so the real flush correctly halted ("TRD 7-01 has no issue yet") and the hook reported it; the fixture was fixed, the hook was right.

## Process note

The first `exec-context check` ran with the Bash tool's default cwd (the main checkout) and reported SHARED INDEX against 50-04. The dispatch said to run it from the worktree, so I re-ran it through df-tools' documented global `--cwd <worktree>` flag. It then reported `checkout` = the worktree, `base_visible: true`, and claimed it for 50-05. 50-04's claim was not touched or released.

## Known limits

- A flush killed on timeout leaves the outbox lock held until it goes stale (10 minutes); in between, flushes report `running` and the hook stays silent.
- Drift is not reported after a commit, only at Stop, by design (see key-decisions).
- The hook's offline cost is one `gh api` read per flush attempt (a single call in the test); it is bounded by the 20 s / 30 s timeout either way.
- No test drives the hook through Claude Code itself; the registration shape (`PostToolUse` + `matcher: Bash`) follows the existing PreToolUse group and is checked by hook-inventory and the hooks-registry doctor check.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (post-commit flush with additionalContext; Stop systemMessage with no `decision` and exit 0; offline / rate-limited / lock / timeout / throw -> notice or nothing; local mode, empty queue and unrelated commands silent with zero gh calls and no child; nothing under `.planning/` and `DEVFLOW_SKIP_GH_FLUSH_HOOK=1`; hooks.json registration plus CLAUDE.md listing)
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/hooks/gh-flush.js
- FOUND: plugins/devflow/hooks/gh-flush.test.js
- FOUND: plugins/devflow/hooks/hooks.json (PostToolUse group and Stop entry)
- FOUND: CLAUDE.md bullet; planning-writes.audit.test.js RUNS entry
- FOUND commits on df/exec-50-05: 28a1ad33, 20291209, d96bb549, bb6ae337
