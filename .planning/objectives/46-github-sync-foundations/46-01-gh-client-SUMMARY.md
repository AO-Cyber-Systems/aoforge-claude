---
objective: 46-github-sync-foundations
trd: "01"
subsystem: github-sync
tags: [gh-cli, rate-limit, retry, pagination, test-shim, node-test]

requires: []
provides:
  - "lib/gh-client.cjs: the single gh spawn site, with one replaceable seam (_runGh / _setRunGh)"
  - "Write pacing (>= 1000 ms between writes), a 450-write per-process budget, secondary-rate-limit retry honouring retry-after"
  - "ghPaginate (gh api --paginate --slurp, with a per_page=100&page=N fallback)"
  - "requireEnabled / resolveRepo: one github.enabled + repo gate; emitResult: one exit-code rule"
  - "__fixtures__/gh-shim.cjs: gh PATH shim for CLI-level tests"
affects: [46-05, 46-06, 46-07, 46-08, 46-10]

tech-stack:
  added: []
  patterns:
    - "Forwarding-wrapper export for an injectable seam: _runGh: (...a) => impl(...a)"
    - "Injected clock + sleep (_setNow/_setSleep) so rate-limit tests never sleep for real"
    - "Shim script generated from a real function via Function#toString, not a template string"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-client.cjs
    - plugins/devflow/devflow/bin/lib/gh-client.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-shim.cjs
    - plugins/devflow/devflow/bin/lib/gh-shim.test.cjs
  modified: []

key-decisions:
  - "ghPaginate returns {ok:true, items} (the Task 2 shape), not a bare array; downstream TRDs read .items"
  - "isWriteArgs treats any issue/label/release/pr subcommand that is not a known read (view, list, status, download, diff, checks) as a write"
  - "All computed retry delays (retry-after, rate-limit reset, exponential) are capped at MAX_RETRY_MS (900000)"
  - "The write budget counts every gh write attempt, retries included"

patterns-established:
  - "Every gh call in new modules goes through gh-client ghRead / ghWrite / ghPaginate / ghRun"
  - "Commands return requireEnabled's skipped result unchanged; emitResult turns skipped into exit 0 and other ok:false into exit 1"

requirements-completed: [GSF-08]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-09-30
---

# Objective 46: GitHub Sync Foundations, TRD 01: gh client Summary

**A single `gh` seam (`lib/gh-client.cjs`) that paces writes at >= 1 s, retries only secondary-rate-limit failures honouring `retry-after`, paginates via `--slurp`, gates on `github.enabled`, and maps results to exit codes, plus a PATH shim so CLI tests never reach GitHub.**

## Performance

- **Duration:** about 12 min
- **Started:** 2026-09-30T17:55:25Z
- **Completed:** 2026-09-30T18:06:47Z
- **Tasks:** 3 of 3 (each as a RED commit then a GREEN commit)
- **Files modified:** 4 (all new)

## Accomplishments

- `gh-client.cjs` is the only module that spawns gh. `rg "spawnSync\("` finds exactly one site (the default runner). A missing gh returns `{ok:false, status:null, stderr:'gh: command not found'}` and never throws.
- Success criterion 4 is proven at unit level on a fake clock: a mocked 403 secondary-limit is retried after exactly the `retry-after` seconds, consecutive writes are at least 1000 ms apart, and a bare 403 ("Resource not accessible by integration") is not retried.
- `requireEnabled` and `emitResult` give the downstream TRDs one enabled gate and one exit-code rule (skipped exits 0, other `ok:false` exits 1).
- `installGhShim` gives 46-10 a hermetic way to drive `df-tools gh sync`: it records argv, answers from a canned table, and `env()` isolates PATH, HOME and the gh cache dir.

## Task Commits

| Task | Phase | Commit | Message |
|---|---|---|---|
| 1 | RED | 3678aab | test(46-01): add failing tests for gh-client seam, pacing and retry |
| 1 | GREEN | 8654949 | feat(46-01): add gh-client seam with write pacing and secondary-limit retry |
| 2 | RED | f0cc58d | test(46-01): add failing tests for pagination, enabled gate and exit codes |
| 2 | GREEN | bc1783d | feat(46-01): add ghPaginate, enabled gate, repo resolution and exit-code emitter |
| 3 | RED | 35a7003 | test(46-01): add failing self-test for the gh PATH shim |
| 3 | GREEN | ab14d01 | feat(46-01): add gh PATH shim fixture for CLI-level tests |

## Deviations from Plan

### Auto-fixed Issues

None. There were no bugs or blockers in the TRD's scope.

### Judgment calls where the TRD was silent or ambiguous

**1. [Rule 2 - Missing critical functionality] Write classification uses a read allow-list**
- **Issue:** The TRD lists which subcommands are writes. A new mutating subcommand not on that list (for example `label edit`, `release delete`, `issue delete`) would have been classified as a read and skipped pacing and the budget.
- **Fix:** For `issue`, `label`, `release` and `pr`, anything other than `view|list|status|download|diff|checks` is a write. This is a strict superset of the TRD's write list, and every TRD read example (tests 3 and 4) still classifies as specified.
- **Files:** `gh-client.cjs`. **Commit:** 8654949.

**2. [Rule 2 - Missing critical functionality] Delay cap applied to every computed wait**
- **Issue:** The TRD caps only the exponential branch at 900000 ms. A reset-based wait (primary-limit exhaustion can be up to an hour) or a large `retry-after` would otherwise block the synchronous process for that long.
- **Fix:** `retryDelayMs` caps all three branches at `MAX_RETRY_MS`. The reset-based branch keeps its 1000 ms floor. Tests 8 and 10 are unaffected.
- **Files:** `gh-client.cjs`. **Commit:** 8654949.

**3. Budget counting.** The TRD says "past 450 writes". I count each gh write attempt, including retries, because each retry is itself a content-creating request against GitHub's limit.

**4. `ghPaginate` return shape.** The TRD's must_haves say it "returns one flat array", while Task 2's action specifies `{ok:true, items:[...]}` or `{ok:false, error, stderr}`. I implemented the Task 2 shape so failures are representable without throwing. Consumers (46-05 and later) must read `.items`.

**5. Additions beyond the listed artifacts.**
- Exported `MAX_PAGES` and `readConfig`.
- The shim returns `dir`, `tableFile` and `cleanup()` in addition to the listed fields.
- The shim writes `bin/package.json` (`{"type":"commonjs"}`) so an extensionless script cannot be loaded as ESM when `dir` sits under a `"type":"module"` package.
- The shim's `env()` appends the running node's directory to the end of PATH, so `#!/usr/bin/env node` resolves when node was started by absolute path.
- The shim script is generated from a real function via `Function#toString`, not a string literal. The shebang is `#!/usr/bin/env node` as specified.
- Extra test cases beyond the TRD's 21: 9b, 13b, 13c, 14b, 15b, 15c, 15d, 20b, 21b to 21f (34 tests total).

### Process notes

**6. Output filename.** The TRD's `<output>` block names `46-01-SUMMARY.md`. The coordinator asked for `46-01-gh-client-SUMMARY.md`, which matches the `46-NN-slug-TRD.md` naming used in this directory. I used the latter.

**7. Stray preflight claim (self-inflicted, released).** My first `exec-context check` ran with the shell's cwd in the main checkout, so it passed against `/Users/justin/dev/devflow-claude` and registered a claim on that checkout under my plan id. I noticed from the `checkout` field, re-ran the check with `--cwd` at the worktree (passed, `is_worktree: true`, claim registered on the worktree), and released only my own stray claim with `exec-context release --id 46-01-gh-client` on the main checkout. No files were written to the main checkout, and its HEAD stayed at `cb51578`.

**8. One diagnostic run outside the test harness.** While looking at the failures below, I ran `devflow-watch.cjs start --foreground` against a scratchpad directory, without overriding `HOME`. That CLI logs to `$HOME/.devflow/devflow-watch.log`, so it may have appended a few log lines under the real `~/.devflow/`. It exited by itself (code 3) and removed its own PID file. I did not check or clean up further, and stopped investigating when told to.

## Auth Gates

None.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Seam, write classification, pacing, retry (tests 1-13) | `node --test plugins/devflow/devflow/bin/lib/gh-client.test.cjs` | 0 | PASS (16 tests at that point) |
| 2: Pagination, enabled gate, exit codes (tests 14-20) | `node --test plugins/devflow/devflow/bin/lib/gh-client.test.cjs` | 0 | PASS (28 tests) |
| 3: gh PATH shim (test 21) | `node --test plugins/devflow/devflow/bin/lib/gh-shim.test.cjs` | 0 | PASS (6 tests) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-client.test.cjs plugins/devflow/devflow/bin/lib/gh-shim.test.cjs` | 0 | PASS (34 tests, 0 fail, run twice) |

## TDD Evidence

The TRD is `type: standard` with `tdd="true"` on all three tasks. Each RED commit precedes its GREEN commit in `git log`.

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test .../gh-client.test.cjs` | 1 | FAIL (correct): `Cannot find module './gh-client.cjs'` |
| GREEN (task 1) | `node --test .../gh-client.test.cjs` | 0 | PASS (correct): 16/16 |
| RED (task 2) | `node --test .../gh-client.test.cjs` | 1 | FAIL (correct): 12 new tests fail with `is not a function`, the 16 earlier tests pass |
| GREEN (task 2) | `node --test .../gh-client.test.cjs` | 0 | PASS (correct): 28/28 |
| RED (task 3) | `node --test .../gh-shim.test.cjs` | 1 | FAIL (correct): `Cannot find module './__fixtures__/gh-shim.cjs'` |
| GREEN (task 3) | `node --test .../gh-shim.test.cjs` | 0 | PASS (correct): 6/6 |

No separate REFACTOR commits. Two cleanups (removing unused imports before the Task 1 commit, and temp-dir cleanup in the Task 2 tests) were folded into the GREEN commits.

## Full Suite (`npm test`, run once in the worktree)

Totals: 5842 tests, 5782 pass, **10 fail**, 0 cancelled, 50 skipped. None of the failures is in a file this TRD touched.

Failing tests, all in the devflow-watch daemon CLI or the handoff pipeline:

- `devflow-watch.test.cjs`, "devflow-watch start (foreground) + stop":
  - foreground daemon writes PID file, status reports running, stop kills it
  - start refuses when daemon already running
  - start cleans up stale PID file and starts fresh
- `devflow-watch.test.cjs`, "devflow-watch multi-project CLI (TRD 20-03)":
  - C-1 start --project /p1,/p2 writes watching:[/p1, /p2]
- `handoff-e2e.test.cjs`, "handoff pipeline - end-to-end":
  - write pending -> daemon executes -> route-results emits result with stdout
  - disallowed command produces rejected done record + "Do NOT retry" guidance
  - idempotency: route-results emits once, silence on second invocation
  - multi-record: 3 queued commands appear in a single injection
  - LK-1: teardown reaps the daemon - no devflow-watch outlives withDaemon
  - LK-2: SIGTERM kills the daemon within its deadline even with a dispatch in flight

Classification: every failure is a daemon or handoff test, so I am treating them as the known baseline, as the coordinator directed. Two things to be plain about:

- I did **not** run the suite against the base commit, so "pre-existing" rests on the coordinator's statement and on this TRD adding only four new files that nothing imports.
- The named accepted failure, MA-7 (`doctl auth init`), does **not** appear in this run's failure list. The 10 failures above are a different set from MA-7, in the same daemon family. I did not determine their cause. The one observation I made before being told to stop is that `start --foreground` printed "started" and then exited with code 3, the path `devflow-watch.cjs` takes when `session.spawn()` fails.

Full output is at `/private/tmp/claude-501/-Users-justin-dev-devflow-claude/2bedd752-afe7-4347-82a5-64f0e80367c2/scratchpad/full-run-1.txt` (session scratchpad, not committed).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (seam: tests 1-2; pacing: 5-6; retry-after and backoff: 8-9; bare 403 not retried: 12; `ghPaginate` with `--slurp` and fallback: 14-15; `requireEnabled` with zero gh calls: 17-19; `emitResult` exit codes: 20; shim: 21)
- Verification step: `rg "spawnSync\("` on `gh-client.cjs` shows exactly one spawn site (the default runner)
- Gate failures: none for this TRD's gate. The full suite has the 10 daemon/handoff failures listed above.

## Self-Check: PASSED

- All four created files exist under `plugins/devflow/devflow/bin/lib/`.
- All six task commits (3678aab, 8654949, f0cc58d, bc1783d, 35a7003, ab14d01) are present on `df/exec-46-01-gh-client` between `cb51578` and HEAD.
- The worktree was clean apart from this SUMMARY before it was committed.

## Notes for downstream TRDs

- 46-06 and 46-07 should make the `_setRunGh` in `gh-pull.cjs` and `gh.cjs` delegate to `gh-client._setRunGh`. The exported `_runGh` is already a forwarding wrapper, so captured references stay valid.
- Callers must `return` immediately after `emitResult`. `output` calls `process.exit`, but tests stub it, so code after it still runs there.
- `ghPaginate` returns `{ok, items}`. Free-text bodies should use `-f` or `--body`, never `-F`, which treats a leading `@` as a file path.
