---
objective: 47-github-authoritative-store
trd: "11"
subsystem: github-store
tags: [github, cli, outbox, trd-spec, freeze, fold, scope, orphans, exit-codes]

requires:
  - objective: 47-github-authoritative-store
    provides: "47-03 outbox, 47-06 gh-capability, 47-07 gh-outbox-flush, 47-08 gh-comments, 47-09 gh-hierarchy.reportOrphans, 47-10 gh pull --all"
provides:
  - "lib/gh-store-cli.cjs: cmdGhOutbox, cmdGhTrd, cmdGhOrphans, EXIT"
  - "df-tools gh outbox status | flush [--no-wait] | resolve <seq> --accept-remote|--overwrite"
  - "df-tools gh trd spec|freeze|fold [--force]|scope <body|@file:path> [--n K] <trd> [--no-flush] [--no-wait]"
  - "df-tools gh orphans <objective>"
affects: [47-12-sync-store-wiring, 47-13-store-e2e, 47-14-docs-and-full-suite]

tech-stack:
  added: []
  patterns:
    - "handlers return {code, payload, prose}; one emit() prints and exits, so process.exit stubbed by tests cannot run code twice"
    - "own exit codes (EXIT 0/1/2/3) instead of helpers.output(), which always exits 0"
    - "gate() = requireEnabled with zero gh calls; enabled-but-unusable config is an error (exit 1), disabled is skipped (exit 0)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-store-cli.cjs
    - plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs

key-decisions:
  - "D-21 exit codes for gh outbox flush and the gh trd verbs that flush: flushed/skipped/running 0, error 1, halted 2, pending 3"
  - "A project with github.enabled true but no resolvable repo is exit 1 (the user asked for GitHub and gets none); github.enabled false is {ok:false, skipped:true, reason} with exit 0 and zero gh calls"
  - "gh outbox status reads the CACHED capability record only (readCachedCapabilities), so it makes zero gh calls; with no cache it says capabilities are not detected yet"
  - "Only a fixed set of tokens are flags (--raw --help --no-wait --no-flush --force --accept-remote --overwrite --n); anything else, including scope text starting with --, is a positional"
  - "gh trd freeze|fold|scope flush by default; --no-flush leaves ops queued, --no-wait is hook mode (flush wait:false)"
  - "Scope overflow is always reported with the sentence 'becomes a new TRD' (the library's single-comment overflow says 'split it into a new TRD', so the CLI appends the fixed wording)"
  - "Prose mode: errors (exit 1) to stderr, results to stdout; --raw always prints the JSON payload to stdout"

patterns-established:
  - "a halt in prose always names the issue (#N) and prints both resolve commands for the halted seq"

requirements-completed: [GST-05, GST-03, GST-01]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 1 session
completed: 2026-10-01
---

# Objective 47 TRD 11: Command surface for the store (`gh outbox`, `gh trd`, `gh orphans`) Summary

**`lib/gh-store-cli.cjs` is the thin human-facing layer over the store: inspect and flush the outbox with exit codes that separate "offline, wait" (3) from "a human must look" (2), resolve a halt, print/freeze/fold/scope a TRD's effective spec (oversize scope changes are refused as "becomes a new TRD"), and report orphans without deleting anything. `df-tools.cjs` dispatches the three new `gh` subcommands and `help.cjs` documents them. `gh.cjs` is untouched.**

## Accomplishments

- `gh outbox status`: counts, journal path, the halt with its issue number (from the mapping, else the `#N` in the detail) and both resolve commands, and one sentence per degraded capability from the cached record. Zero gh calls.
- `gh outbox flush [--no-wait]`: wraps `flush()`; `--no-wait` is hook mode (no retry back-off). Exit map flushed/skipped/running 0, error 1, halted 2, pending 3.
- `gh outbox resolve <seq> --accept-remote|--overwrite`: wraps `resolveHalt`; usage errors (missing seq, neither/both flags) exit 1 on stderr.
- `gh trd spec|freeze|fold|scope`: wraps `readEffectiveSpec | freezeTrd | foldTrd | enqueueScope`, then flushes unless `--no-flush`; the flush's exit code is the verb's exit code.
- `gh orphans <objective>`: wraps `reportOrphans`; prose or `{unlinked, missing_local}`; read-only.
- Dispatch for `outbox`, `trd`, `orphans` in `df-tools.cjs` and an extended Available list; `help.cjs` gh usage names `outbox`, `trd`, `orphans`, `pull --all [--force]` and the exit codes.

## API contract for 47-13 / 47-14

| Command | Exit codes | `--raw` payload |
|---|---|---|
| `gh outbox status` | 0 (also when halted: it reports), 1 on unusable config | `{ok, repo, pending, blocked, done, halted:{reason,seq,target,detail,issue_number}\|null, journal, writes, degraded:[sentence], capabilities_cached, recovered, queue:[...]}` |
| `gh outbox flush [--no-wait]` | 0 flushed / skipped / running, 1 error, 2 halted, 3 pending | the 47-07 flush result plus `ok` (`status`, `done`, `pending`, `halted`, `warnings`, `reason?`, `retry_after?`) |
| `gh outbox resolve <seq> --accept-remote\|--overwrite` | 0 resolved, 1 usage / unknown seq / not halted | `{ok, choice, seq, dropped\|requeued}` or `{ok:false, error}` |
| `gh trd spec <trd>` | 0, 1 | `readEffectiveSpec` result: `{ok, id, number, state, file, text, encoded, chars, applied, overflow, errors, foldedThrough}`; prose is the spec text itself (warnings on stderr) |
| `gh trd freeze <trd>` | flush exit map, 1 on error | the `freezeTrd` result plus `flush` (absent with `--no-flush`); an already-frozen TRD is a 0 no-op |
| `gh trd fold <trd> [--force]` | flush exit map, 1 on an open TRD without `--force` | the `foldTrd` result plus `flush`; `fits:false` and `noop` are exit 0 with a message |
| `gh trd scope <trd> <body\|@file:path> [--n K]` | flush exit map, 1 on overflow / bad usage | the `enqueueScope` result plus `flush`; overflow is `{ok:false, overflow:true, chars, max, error}` with "becomes a new TRD" |
| `gh orphans <objective>` | 0, 1 (unknown objective / no objective issue) | `{ok, objective, unlinked:[{id,number}], missing_local:[{id,number}]}` |

Every subcommand: `github.enabled` false gives `{ok:false, skipped:true, reason}`, exit 0, zero gh calls. Unknown subcommands exit 1 and list the available ones. For 47-14's dispatch-completeness extractor the documented forms are `gh outbox`, `gh trd`, `gh orphans` (each is one dispatch branch in `df-tools.cjs`). Note that the dispatcher answers `df-tools gh <anything> --help` itself with the `gh` usage line from `help.cjs`, so the usage string there is the user-visible help.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test correction] Test 5 ("--no-wait ... no sleep recorded") asserted too much**
- **Found during:** Task 1 GREEN
- **Issue:** the first flush of a TRD creates a milestone and labels before the issue POST, and gh-client paces consecutive writes 1 s apart through the injected sleep, so `sleeps` was `[1000, 1000]` even in hook mode. That pacing is not a back-off.
- **Fix:** the test asserts what the TRD means: every recorded sleep is at most `MIN_WRITE_INTERVAL_MS` (no back-off), the limited write is not retried (no issue created, one op still pending), and a contrast test (5a) shows the same limit without `--no-wait` IS waited out and retried (exit 0, a sleep above the pacing interval).
- **Files modified:** `gh-store-cli.test.cjs`
- **Commit:** 0f06c48

**2. [Rule 2 - Missing functionality] Unresolvable repo exits 1 at the CLI**
- **Found during:** Task 1 (test 4, "invalid config -> 1")
- **Issue:** `flush()` returns `skipped` (exit 0) for an enabled project with no repo once an op is queued, and `flushed` when nothing is queued, so the library alone never yields exit 1 for it.
- **Fix:** the CLI gate distinguishes "github.enabled false" (skipped, exit 0) from "enabled but `client.requireEnabled` refuses" (error, exit 1, reason printed). No library change.
- **Commit:** 0f06c48

**3. [Rule 2 - Missing functionality] Scope-overflow wording**
- **Found during:** Task 2 (test 10)
- **Issue:** a single oversized scope comment comes back from `gh-trd.buildScopeComment` as "split it into a new TRD", not "becomes a new TRD" as the TRD requires.
- **Fix:** the CLI keeps the library message when it already says "becomes a new TRD" and otherwise appends "this change becomes a new TRD (it cannot be a scope comment)". Both overflow paths (one big comment, effective spec over 60,000 chars) are tested.
- **Commit:** fdcee6c

### Contract notes

- The SUMMARY is named `47-11-SUMMARY.md` per the dispatch (the TRD text says `47-11-store-cli-SUMMARY.md`).
- `gh pull --all` needed no dispatch change: `pull` already forwards `args.slice(2)` to `cmdGhPull` (47-10). Only the usage line was extended.
- `gh outbox status` includes extra fields beyond the TRD's minimum (`repo`, `writes`, `queue`, `degraded`, `capabilities_cached`, `recovered`); the minimum set is unchanged.

## Auth Gates

None.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: gh outbox status\|flush\|resolve | `node --test plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs` | 0 (21 tests) | PASS |
| 2: gh trd and gh orphans | `node --test plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs` | 0 (40 tests) | PASS |
| 3: dispatch and help | `node --test gh-store-cli.test.cjs help.test.cjs dispatch-completeness.test.cjs gh-commands.test.cjs` | 0 (83 tests) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs` | 1 (module not found) | FAIL (correct) |
| GREEN (task 1) | same | 0 (21 pass) | PASS (correct) |
| RED (task 2) | same | 1 (19 of 40 fail: cmdGhTrd/cmdGhOrphans missing) | FAIL (correct) |
| GREEN (task 2) | same | 0 (40 pass) | PASS (correct) |
| RED (task 3) | same | 1 (7 of 47 fail: no dispatch, usage line) | FAIL (correct) |
| GREEN (task 3) | same plus help and dispatch-completeness | 0 (83 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs` | 0 | PASS |
| regression | `node --test help.test.cjs dispatch-completeness.test.cjs gh-commands.test.cjs` | 0 | PASS |
| full suite | `npm test` | 1 | 6915 tests, 6882 pass, 1 fail, 32 skipped; the one failure is the known pre-existing handoff-e2e MA-7 (doctl auth), not caused by this TRD |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (status report, flush exit codes, resolve, trd verbs with overflow refusal, orphans read-only, enabled gate / `--raw` / `--help` / unknown-subcommand listing)
- Gate failures: None (MA-7 pre-exists on the base)

## Commits

- 89a26de test(47-11): add failing tests for gh outbox status|flush|resolve
- 0f06c48 feat(47-11): gh outbox status|flush|resolve with exit codes 0/1/2/3
- 374fa8a test(47-11): add failing tests for gh trd spec|freeze|fold|scope and gh orphans
- fdcee6c feat(47-11): gh trd spec|freeze|fold|scope and gh orphans
- 5572169 test(47-11): add failing dispatch and help tests for gh outbox|trd|orphans
- 4a66038 feat(47-11): dispatch gh outbox|trd|orphans and extend gh help usage

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-store-cli.cjs
- FOUND: plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs
- FOUND: commits 89a26de, 0f06c48, 374fa8a, fdcee6c, 5572169, 4a66038
- `gh.cjs`, `gh-pull.cjs`, `templates/config.json`, STATE.md and ROADMAP.md were not modified.
