---
objective: 58-estimation-engine-and-surfacing
job: "04"
subsystem: estimation
tags: [statusline, run-state, estimate, hooks, out-of-repo-state]

requires:
  - objective: 57-estimation-data
    provides: the estimation data model the run state will be filled from (by 58-08)
provides:
  - "estimate-run-store.cjs: schema-v1 run state, out-of-repo store (read/write/clear), remainingMinutes, formatStatusSegment, findProjectRoot"
  - "status line segment `⏱ <objective> W<current>/<total> ~<time> left` read from cached state only"
affects: [58-08 estimate CLI (the only writer of the run state), 58-09 planning and build surfacing, 58-10 docs]

tech-stack:
  added: []
  patterns:
    - "out-of-repo runtime state keyed by upgrade.repoKey (hook-marker-store lineage), atomic write via <file>.tmp + rename"
    - "fail-open synced-lib load in a hook (existsSync + require inside try/catch)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/estimate-run-store.cjs
    - plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs
    - plugins/devflow/hooks/statusline-estimate.test.js
  modified:
    - plugins/devflow/hooks/statusline.js

key-decisions:
  - "Run state schema is version 1; readRunState returns null for any other version, a missing objective or non-array waves, and never throws"
  - "The wave denominator is the highest wave number in the state, so a resumed run holding only waves 6 and 7 shows W6/7"
  - "Remaining minutes are rounded up with Math.ceil on the sum, so a live wave never reads ~0m while time remains"
  - "writeRunState/clearRunState throw on real filesystem errors (the 58-08 CLI is the only caller); readRunState and the status line never throw"
  - "The objective text is stripped of control characters before it reaches the terminal"

patterns-established:
  - "Status line segments are text from a lib (formatStatusSegment), colour added by the hook"

requirements-completed: [EST-05]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 9min
completed: 2026-10-05
---

# Objective 58 TRD 04: Estimate run state and the status line Summary

**A schema-v1 estimate run state kept outside the repo (`~/.claude/devflow/state/estimates/<repo-key>.json`), a pure remaining-time rule, and a fail-open status line segment `⏱ 58 W2/3 ~18m left` that reads only that cached file.**

## Run state schema and store API (for 58-08)

58-08's `df-tools estimate start|wave|finish` is the only writer. Schema version 1:

```json
{
  "version": 1,
  "objective": "58",
  "started_at": "ISO", "updated_at": "ISO", "finished_at": null,
  "estimate": { "line": "...", "wall_minutes": { "p50": 70, "p90": 145 }, "confidence": "medium" },
  "waves": [
    { "wave": 1, "trds": ["58-01"], "p50": 12, "p90": 36,
      "started_at": "ISO", "finished_at": "ISO", "actual_minutes": 14 }
  ]
}
```

`estimate` and a wave's `p50`/`p90` may be null; the run still records timings and the segment shows the wave without a time.
Bump `updated_at` on every write: a run not updated for `STALE_MS` (12 h) shows nothing.

Store API (`estimate-run-store.cjs`, node builtins plus `./upgrade.cjs` only), opts are `{env, home}`:

| Export | Behaviour |
|---|---|
| `STATE_VERSION`, `STALE_MS` | `1`, 12 hours in ms |
| `stateRoot(env, home)` | `$DEVFLOW_ESTIMATE_STATE_DIR`, else `<home>/.claude/devflow/state/estimates` |
| `statePath(root, opts)` | `<stateRoot>/<repoKey>.json` (repoKey = `upgrade.repoKey`, else sanitized basename) |
| `findProjectRoot(start, maxUp=8)` | walks up for a `.planning` directory; null when none |
| `readRunState(root, opts)` | parsed state or null (missing, malformed, wrong version, no objective/waves); never throws |
| `writeRunState(root, state, opts)` | mkdir -p, `<file>.tmp` then rename; returns `{path}`; throws on real fs errors |
| `clearRunState(root, opts)` | rm -f of the file and a stranded `.tmp` |
| `remainingMinutes(state, now)` | null or `{minutes, wave, waves, done, over}` |
| `formatStatusSegment(state, now)` | `⏱ 58 W2/3 ~18m left`, `... over P90`, `⏱ 58 W2/3` (no estimate), or `''` |

## Progress
- [x] Task 1: estimate-run-store: schema, out-of-repo storage, remaining time, segment text — 919c040d (RED 444aa2a4)
- [x] Task 2: Status line estimate segment — 66d4bb31 (RED f2fe27a9)

## Deviations from Plan

None - TRD executed exactly as written.

Additions inside the TRD's scope (extra tests beyond tests 1-13): status line colour (gold `\x1b[38;5;178m`, red `\x1b[31m` for over P90), placement after the watcher block, stale run, no-estimate wave and read-only guard in `statusline-estimate.test.js`; module-hygiene tests (allowed requires, no `os.homedir()` at load) in `estimate-run-store.test.cjs`. `remainingMinutes` also returns null for a state with no valid waves (nothing to show), which the TRD left unspecified.

## Auth gates

None.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: estimate-run-store | `node --test plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs` | 0 (43 tests pass) | PASS |
| 2: status line segment | `node --test plugins/devflow/hooks/statusline-estimate.test.js plugins/devflow/hooks/statusline.test.js plugins/devflow/hooks/planning-writes.audit.test.js` | 0 (86 tests pass) | PASS |
| 2: no transcript reads | `rg -n -e '\.jsonl\|projects' plugins/devflow/hooks/statusline.js` | 1 (no match, prints nothing) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs` | 1 (`Cannot find module './estimate-run-store.cjs'`) | FAIL (correct) |
| GREEN (task 1) | same | 0 (43/43) | PASS (correct) |
| RED (task 2) | `node --test plugins/devflow/hooks/statusline-estimate.test.js` | 1 (tests 1, 6, 7, 8, 10 fail: no segment rendered; the negative tests 2-5, 9, 11, 12 already passed as expected guards) | FAIL (correct) |
| GREEN (task 2) | same plus statusline.test.js and planning-writes.audit.test.js | 0 (86/86) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test estimate-run-store.test.cjs statusline-estimate.test.js statusline.test.js planning-writes.audit.test.js` | 0 | PASS |
| test (task gate) | `npm test` | 1 (9550 tests, 9487 pass, 13 fail, 50 skipped) | PASS for this TRD: 0 failures in files this TRD touches; the 13 failures are all baseline (below) |

Baseline failures in the full run, none touching this TRD:
- `devflow-watch.test.cjs` start/multi-project (5 tests): the daemon never writes its PID file in this worktree, which has no `node_modules`. The pristine base commit 7b5adaca, extracted outside any repo, fails the same 5 tests; the main checkout (which has `node_modules`) passes them.
- `handoff-e2e.test.cjs` (6 tests, incl. the known MA-7 family): the end-to-end suite that drives that same daemon; listed as a known baseline failure in the TRD. Not re-verified separately against the base.
- `roadmap-reconcile.test.cjs` E2E1: known, while a TRD of the running objective is unticked.
- `stack-drafter-fleet.test.cjs` github-enterprise-migration: known.

## Discovered commands

None. The profile's `test` command (`npm test`, scoped `node --test {files}`) was used as given.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - state outside the project, atomic write: `7a`, `7b`, `7c`
  - `remainingMinutes` sums unfinished medians, less elapsed time, flags past P90: `9a`-`9f`
  - finished, stale, malformed or missing shows nothing: `8a`-`8h`, `10a`-`10e`, status line tests 2, 4, 5, 9
  - segment text and colour from cached state only: status line tests 1, 6, 7, 8, 10, 11
  - fail-open (no lib, no state, broken state): status line tests 2, 3, 4 (exit 0, empty stderr)
- Gate failures: None attributable to this TRD

## Notes for later TRDs

- CLAUDE.md's hook list still describes `statusline.js` as rendering "model, task, context usage"; the doc update belongs to 58-10 (kept out of this wave-1 TRD to avoid merge conflicts on shared docs).
- The state is keyed by the realpath of the directory that contains `.planning`, so a run started in a git worktree is only visible to a status line rendering from that same worktree. 58-08 should write from the checkout the orchestrating session runs in.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/estimate-run-store.cjs
- FOUND: plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs
- FOUND: plugins/devflow/hooks/statusline-estimate.test.js
- FOUND: plugins/devflow/hooks/statusline.js (modified)
- FOUND commits: 444aa2a4, 919c040d, f2fe27a9, 66d4bb31
