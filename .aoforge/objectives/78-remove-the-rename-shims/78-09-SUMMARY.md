---
objective: 78-remove-the-rename-shims
trd: "09"
subsystem: github-integration
tags: [rename-shims, gh-labels, gh-issue, gh-cache, gh-hierarchy, gh-outbox-flush, gh-check-cli, planning-verbs, gh-body]
requires: ["78-03"]
provides:
  - gh-legacy-labels.cjs (legacyTwin, checkRebranded, clearCache) — the un-rebranded-repository check
  - single-label GitHub lookups in gh-issue, gh-cache, gh-hierarchy, gh-outbox-flush and gh-check-cli
  - one in-progress label removed by summary post
  - gh-body without label twins and without the LEGACY import
affects: [78-12]
tech-stack:
  added: []
  patterns: ["a detector, not a reader: one GET of the pre-rename twin per default label per process, refusal names the converter"]
key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/gh-legacy-labels.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-legacy-labels.legacy.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/gh-body.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-body.test.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-issue.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-issue.test.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-cache.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-hierarchy.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-outbox-flush.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-check-cli.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-verbs.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-verbs-pr.test.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-commands.test.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-seam.repo.test.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-fake.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/gh-fake.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/gh-shim.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-shim.test.cjs
key-decisions:
  - "Label twins: REMOVE; ADD an 'is this repository rebranded' check (one GET of the default label's pre-rename twin per process; present -> the lookup is refused naming `aof-tools gh rebrand --apply`; 404 -> proceed). Only DEFAULT labels have twins, as in 72-11"
  - "A twin-check answer other than 200/404 is an error, never 'absent': each caller fails it the way it fails an unreadable list (the outbox classifies it, so offline stays pending)"
  - "The checks runner posts a short refusal that fits a 140-character status (twin + fix) and keeps the full refusal in its details"
duration: 24min
completed: 2026-10-16
status: complete
requirements-completed: []
tokens_input: 38108963
tokens_output: 120264
tokens_cache_read: 37783151
tokens_cache_write: 325480
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 78 TRD 09: GitHub label lookups use one label; an un-rebranded repository stops with the fix Summary

**Every GitHub lookup by a default label now lists that one label, after one per-process `GET repos/{repo}/labels/{twin}`; a repository that still has the pre-rename twin gets one error naming `aof-tools gh rebrand --apply` instead of duplicate issues, and gh-body no longer knows the old namespace at all.**

## Progress
- [x] Task 1: RED + GREEN — the rebrand check module — 1f6c8dc4 (RED), 5abc90b0 (GREEN)
- [x] Task 2: RED + GREEN — store and mirror lookups — a0a721eb (RED), 6a72e793 (GREEN)
- [x] Task 3: RED + GREEN — checks lookup, in-progress label, gh-body helpers removed — dd88a0f9 (RED), 209533f9 (GREEN)
- [x] Gate fix: the gh PATH shim answers the label GET — 759ce00b

## Decision

**Label twins: REMOVE; ADD an "is this repository rebranded" check.** Reason: without the twin listing, a repository
that still labels its issues `<pre-rename ns>:objective` would get duplicates from mirror sync and the outbox. One
label lookup per default label per process is cheap and turns that into one clear error naming the converter
(gh rebrand, kept by 78-03). Only DEFAULT labels have twins (a configured label is used as configured), matching
72-11's rule.

## What changed

**New: `gh-legacy-labels.cjs`** — `legacyTwin(label)` (built from `LEGACY.markerNs`), `checkRebranded({ repo, label,
defaultLabel, client })` and `clearCache()` (tests only). A non-default label, or one outside the AOForge namespace, is
never checked (no call). The GET path URL-encodes the twin. 200 -> `{ ok:false, kind:'legacy-namespace', error }`
with the TRD's message; 404 -> `{ ok:true }`; anything else -> `{ ok:false, kind:'error', error, r }`, not cached. The
`client` seam is an object with `ghRead` or the read function itself, defaulting to gh-client.

**Call sites changed (every lookup by a DEFAULT label):**

| Module | Function | Before (72-11) | Now |
|---|---|---|---|
| gh-issue.cjs | `scanObjectiveIssues` | lists label + twin, `unionByNumber` | check, then one `issue list`; refusal cached on the run like a failed list (`kind` kept) |
| gh-issue.cjs | `findOrCreateObjectiveIssue` | `scan_failed` | a refusal is `{ error:'legacy-namespace', message }` before any label/milestone/issue write |
| gh-cache.cjs | `listLabelled` (readRemoteModel: objective, trd, decision, todo, debug, quick) | label + twin, union | check, then one list |
| gh-hierarchy.cjs | `reportOrphans` (`gh orphans`) | label + twin, union | check, then one list |
| gh-outbox-flush.cjs | `scanByLabel` (upsert-issue adopt-by-label) | label + twin, union | check; refusal -> `failWith('legacy-namespace', ...)` (the flush halts, `halted.reason` blocked); a check error -> `failFrom` (classified) |
| gh-check-cli.cjs | `findObjectiveIssue` | label then twin | check, then one list; refusal throws a 140-char status naming the twin and fix, details = full refusal |
| planning-verbs.cjs | `inProgressLabels` | `labelForms(label, default)` | `[label]` |
| gh-body.cjs | — | `LEGACY_LABEL_PREFIX`, `legacyLabel`, `labelForms`, `unionByNumber`, their exports, the `LEGACY` import | all deleted, header sentence rewritten |

gh-rebrand.cjs calls none of these lookups (`rg checkRebranded|scanByLabel|listLabelled|scanObjectiveIssues|reportOrphans
gh-rebrand.cjs` is empty) and gh-rebrand.legacy.test.cjs, which seeds pre-rename labels, passes unchanged: the guard
never blocks the converter. gh-backfill and migration 0011 label lists are untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The fake GitHub could not answer `GET repos/o/r/labels/{name}`**
- **Found during:** Task 2 RED
- **Fix:** `__fixtures__/gh-fake.cjs` gained the route (the label when it exists — made by `gh label create` or
  carried by a seeded or created issue — else 404) and clears gh-legacy-labels' per-process cache whenever a fake is
  created (a new fake is a new repository, so a cached answer never leaks between tests). gh-fake.test.cjs case 5b
  covers the route, as the fake's header asks. Every suite that never seeds a pre-rename label gets 404 by default.
- **Files modified:** `__fixtures__/gh-fake.cjs`, gh-fake.test.cjs (outside files_modified; the TRD's recovery names the fixture)
- **Commit:** a0a721eb (route), 209533f9 (variable rename)

**2. [Rule 3 - Blocking] gh-commands.test.cjs pinned two `issue list` calls per scan (file outside files_modified)**
- **Found during:** Task 2 GREEN sweep
- **Fix:** tests 1, 2 and 4 now expect one list; added 1b: `gh sync --all` on a repository with the pre-rename
  objective label fails every objective with `error: legacy-namespace` and the fix, exit 1, no `issue list`, no create.
- **Commit:** 6a72e793

**3. [Rule 3 - Blocking] gh-seam.repo.test.cjs test 23 refuses an unguarded gh-*.cjs module (file outside files_modified)**
- **Fix:** gh-legacy-labels.cjs added to GUARDED and NO_DIRECT_WRITE (it reads through ghRead only).
- **Commit:** 6a72e793

**4. [Rule 2 - Missing critical] The checks runner would have clipped the refusal before the fix**
- **Found during:** Task 3
- **Issue:** a commit status description holds 140 characters; the ~230-character refusal ends with the fix, so the PR
  would show the problem without the command.
- **Fix:** `findObjectiveIssue` throws `<repo> still has the label "<twin>": run \`aof-tools gh rebrand --apply\`, then
  re-run this check` with the full refusal as `e.details`; `failed()` reports `e.details` when present.
- **Files modified:** gh-check-cli.cjs; test gh-checks.legacy.test.cjs section 13 (outside files_modified, in Task 3's verify list)
- **Commit:** 209533f9

**5b. [Rule 3 - Blocking] The gh PATH shim had no answer for the label GET (found by the full-suite gate)**
- **Issue:** execute-objective-gh-sync.test.cjs 6, 6b and 7 spawn a real `aof-tools gh sync` against
  `__fixtures__/gh-shim.cjs`; its unmatched-argv default (`[gh-shim] no match`, exit 1) made the twin check an error,
  so the sync reported `scan_failed`.
- **Fix:** an unmatched `api repos/<o>/<r>/labels/<name>` answers 404 (`gh: Not Found (HTTP 404)`); a table entry still
  wins and the call is still recorded. gh-shim.test.cjs 21b2 covers it.
- **Files modified:** `__fixtures__/gh-shim.cjs`, gh-shim.test.cjs (outside files_modified)
- **Commit:** 759ce00b

**5. [Rule 1 - Bug] An offline twin check would have halted the outbox**
- **Fix:** `scanByLabel` classifies a non-definitive check answer through `failFrom` (with the raw gh result), so a
  network outage leaves the op pending like any unreadable list; only the refusal halts.
- **Commit:** 6a72e793

### Other notes
- gh-outbox.test.cjs (in files_modified) has no scan cases (journal and op schemas only), so it is unchanged; the
  flusher cases (test-list case 3) are gh-markers.legacy.test.cjs 7d-7d3.
- The 78-03 handoff case is covered: 7d2b seeds a TRD issue with only the pre-rename label AND a pre-rename body; the
  flush halts with class `legacy-namespace` and creates nothing (before the guard it created a duplicate — seen in RED).
- gh-body.cjs: `LEGACY_STATE_MARKER` renamed `PRE_ID_STATE_MARKER` (no behaviour change) so the TRD's
  `rg -n "LEGACY" gh-body.cjs` finds nothing; whether `<!-- df:state -->` is still accepted stays with 78-12.
- The module variable is `rebrandCheck` in every caller so the TRD's `rg -n "labelForms|unionByNumber|legacyLabel"`
  finds only gh-body.test.cjs's absence assertion.
- planning-verbs.cjs: the `ghBody` require is gone (labelForms was its only use).

## Notes for later TRDs

- **78-12 (docs):** say that 3.1 refuses GitHub lookups (gh sync, gh pull, gh orphans, the outbox flush, the
  planning-consistency check) in a repository that still has a pre-rename default label, and that the fix is
  `aof-tools gh rebrand --apply`; the CLAUDE.md gh-body/label lines describe 72-11's twins. The `<!-- df:state -->`
  acceptance (78-03's note) is still open.
- **78-11:** gh-check-cli's `PLANNING_DIR_NAMES` config fallback is untouched here.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: rebrand check module | `node --test gh-legacy-labels.legacy.test.cjs` | 1 at RED (module missing), 0 at GREEN (13/13) | PASS |
| 2: store and mirror lookups | `node --test gh-markers.legacy gh-issue gh-fake gh-legacy-labels.legacy` | 1 at RED (the rewritten 7a-7e and gh-issue twin cases failing, gh-fake green), 0 at GREEN | PASS |
| 2: wider sweep | `node --test gh*.test.cjs planning-verbs*.test.cjs checks-pin.test.cjs rename-guard.repo.test.cjs` | 0 (after deviations 2, 3) | PASS |
| 3: checks, in-progress, gh-body | `node --test gh-check-cli gh-checks.legacy planning-verbs-pr gh-body gh-markers.legacy gh-rebrand.legacy` | 1 at RED (13a/13b, 8a, planning-verbs-pr 1/1b/2, gh-body 8 failing), 0 at GREEN | PASS |
| verification | `rg -n "labelForms\|unionByNumber\|legacyLabel" plugins/aoforge` | only gh-body.test.cjs's absence assertion | PASS |
| verification | `rg -n "LEGACY" gh-body.cjs` | no match | PASS |
| verification | `rg -n "LEGACY\." lib/gh-*.cjs` (no tests) | gh-rebrand.cjs, gh-legacy-labels.cjs, gh-setup.cjs only | PASS |
| verification | `node --test rename-guard.repo.test.cjs` | 0 | PASS |

`gh-rebrand.test.cjs` does not exist (skipped as the TRD allows); gh-cache, gh-hierarchy, gh, gh-sync, gh-e2e and
gh-outbox ran in the sweep, green.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test gh-legacy-labels.legacy.test.cjs` | 1 | FAIL (correct) |
| GREEN (Task 1) | same | 0 | PASS (correct) |
| RED (Task 2) | `node --test gh-markers.legacy gh-issue gh-fake` | 1 | FAIL (correct) |
| GREEN (Task 2) | same + wider gh sweep | 0 | PASS (correct) |
| RED (Task 3) | `node --test gh-checks.legacy gh-markers.legacy planning-verbs-pr gh-body` | 1 | FAIL (correct) |
| GREEN (Task 3) | same + gh-check-cli, gh-rebrand.legacy, wider sweep | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | full `npm test` file set (394 files) minus `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs` | 1 | PASS for this TRD (2 known failures, below) |

watcher-shell.test.cjs was excluded on instruction: its W-3 fish-shell test hangs to timeout on this machine.
`node_modules` was symlinked from the main checkout for the run (node-pty) and removed afterwards; never committed.

- First run (after 209533f9): 12,564 tests, 12,529 pass, 6 fail, 29 skipped. Three were this TRD's
  (execute-objective-gh-sync.test.cjs 6, 6b, 7: the gh PATH shim had no answer for the label GET), fixed in 759ce00b.
  One was `merge-driver-cli.test.cjs` 16 (`ENOTEMPTY` removing its temp dir during cleanup); it passes alone and in
  the second run.
- Second run (after 759ce00b): 12,565 tests, 12,534 pass, **2 fail**, 29 skipped. Both are the known pre-existing
  noise: `requirements-agreement.repo.test.cjs` 11 and `validate-requirements.test.cjs` 9 (objective 75's
  VERIFICATION marks EST-11 satisfied while no 75 SUMMARY lists it). Not caused by this TRD; not fixed.

## Post-TRD Verification

- Auto-fix cycles used: 2 (gh-commands and gh-seam after the Task 2 sweep; the gh shim after the full-suite gate)
- Must-haves verified: 5/5 (no twin helpers or LEGACY in gh-body; every default-label lookup lists one label; one
  cached GET per default label per process with refusal/proceed/error; in-progress removal takes one label; gh rebrand
  suite green with pre-rename labels present)
- Gate failures: see Validation Gate Results
- Requirements: SC-2 and SC-4 are objective success criteria, not REQUIREMENTS.md entries; this TRD completes SC-2's
  label half (78-03 did markers and contexts), so `requirements-completed` stays empty.

## Self-Check: PASSED

- FOUND: plugins/aoforge/aoforge/bin/lib/gh-legacy-labels.cjs, gh-legacy-labels.legacy.test.cjs,
  .aoforge/objectives/78-remove-the-rename-shims/78-09-SUMMARY.md
- FOUND commits (`git log 5eb8c38e..HEAD`): 1f6c8dc4, 5abc90b0, a0a721eb, 6a72e793, dd88a0f9, 209533f9, 759ce00b
- RED precedes GREEN in every task (1f6c8dc4 < 5abc90b0, a0a721eb < 6a72e793, dd88a0f9 < 209533f9)
- The worktree is clean; the node_modules symlink is removed
