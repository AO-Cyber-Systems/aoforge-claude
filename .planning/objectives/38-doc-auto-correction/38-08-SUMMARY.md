---
objective: 38-doc-auto-correction
trd: "08"
subsystem: infra
tags: [migration, doc-refs, claude-md, state-md, upgrade, tdd]

requires:
  - objective: 38-doc-auto-correction
    provides: "38-01: doc-refs.cjs resolver (resolveToken/scanText/rewriteText) over skill-route.cjs's DEPRECATION_MAP/REMOVED_COMMANDS"
provides:
  - "migrations/0007-doc-refs-fix.cjs: auto migration rewriting stale /df:/renamed /devflow: command references in a project's CLAUDE.md DEVFLOW block and STATE.md (outside Session Log)"
  - "13 test cases proving the two-target allowlist, idempotence, 0005 coexistence, and historical-record exemption"
affects: [38-09-ci-gate, 38-doc-auto-correction-verification]

tech-stack:
  added: []
  patterns:
    - "In-place managed-block rewrite by slicing around block.start/block.end (never managedBlock.upsert) so marker attributes and surrounding bytes are byte-preserved"
    - "Session Log exclusion by locating the '## Session Log' heading through the next '^## ' heading (or EOF) and never opening that span for rewriting"
    - "appendSessionLogLine: splice a new entry after the section's last non-blank line (heading counts when the section is otherwise empty), never touching existing bytes"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/migrations/0007-doc-refs-fix.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0007-doc-refs-fix.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs

key-decisions:
  - "since: '2.11.0' (matches must_haves truth 1 literally, corrected from an initial '2.12.0' before any commit landed)"
  - "AUTO_IDS in upgrade-cli.test.cjs stays ['0001'..'0005'] unchanged — fx.makeV1Project()'s default CLAUDE.md/STATE.md carry zero stale tokens, so 0007 is always 'skipped' (never 'pending'/'applied') on the v1 fixture; verified by running the suite (test 14), not guessed"
  - "Session Log entry appended after the section's LAST non-blank line (per this TRD's codebase_examples), not first-after-heading like 0002's withSessionLogLine — the two migrations intentionally place their notices differently"

patterns-established:
  - "Pattern: allowlisted-target migrations expose a per-target `{present, skip, count, ...}` info struct from a pure read-only function, then a separate apply<Target> function that only writes when count>0 — keeps detect/apply symmetric and dryRun trivial"

requirements-completed: ["DOC-05"]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 55min
completed: 2026-09-28
---

# Objective 38 TRD 08: Migration 0007 — fix stale command references in projects Summary

**New auto migration `0007-doc-refs-fix` rewrites stale `/df:`/renamed command references inside a project's CLAUDE.md DEVFLOW block and STATE.md (outside its Session Log), leaving every historical record and every removed command untouched.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-28T00:00:00Z (session resumed mid-Task-2 after a context-window summary boundary; wall time approximate)
- **Completed:** 2026-09-28
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `migrations/0007-doc-refs-fix.cjs`: a closed, two-target allowlist (CLAUDE.md DEVFLOW block bytes; `.planning/STATE.md` outside `## Session Log`) rewritten via `doc-refs.rewriteText`, registry-contract compliant (`upgrade.loadRegistry()` loads it cleanly)
- STATE.md target appends exactly one dated Session Log entry when it changes something, never touches the log's existing bytes, and never appends anything when STATE.md has no Session Log section
- Proven idempotent, proven to coexist with 0005 in the same `upgrade.apply` run (id order: 0005 restamps/re-rules first, 0007 sees its output and only ever touches the DevFlow-owned bytes), and proven to leave every historical-record path (SUMMARY/VERIFICATION/TRD/OBJECTIVE/CHANGELOG/milestones/todos/ROADMAP) byte-identical
- `upgrade-cli.test.cjs` test 14 confirms (by running the suite) that the v1 fixture carries no stale token, so `AUTO_IDS` needed no change — documented with a comment at the declaration

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: CLAUDE.md block target (tests 1-6, 10) | `node --test plugins/devflow/devflow/bin/lib/migrations/0007-doc-refs-fix.test.cjs` | 0 | PASS (7/7 in scope) |
| 2: STATE.md target, idempotence, exemptions, 0005 coexistence (tests 7-9, 11-14) | `node --test plugins/devflow/devflow/bin/lib/migrations/0007-doc-refs-fix.test.cjs plugins/devflow/devflow/bin/lib/upgrade.test.cjs plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs plugins/devflow/hooks/upgrade-project.test.js plugins/devflow/devflow/bin/lib/migrations/0005-claude-md-block.test.cjs` | 0 | PASS (110/110) |

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: CLAUDE.md block target (tests 1-6, 10)** - `3e31274` (test)
2. **Task 1 GREEN: CLAUDE.md target implementation** - `3d0a839` (feat)
3. **Task 2 RED: STATE.md target, idempotence, historical-record exemption (tests 7-9, 11-13) + test 14** - `fa57b9b` (test)
4. **Task 2 GREEN: STATE.md target + Session Log entry** - `8ec633a` (feat)

_TDD tasks: two test → feat pairs, one per task, matching the TRD's RED/GREEN split._

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Task 2 verify (5 files, 110 tests: 0007, upgrade, upgrade-cli, upgrade-project hook, 0005) | `node --test <5 files>` | 0 | PASS |
| Repo-level `upgrade --check` | `node plugins/devflow/devflow/bin/df-tools.cjs upgrade --check` | 0 | PASS (`up_to_date:true`, 0007 in `skipped`) |

Also ran, per the TRD gotchas, the five adopt suites that assert pending/applied lists on their own fixtures — 86/86 pass, no regression:
`node --test plugins/devflow/devflow/bin/lib/adopt-report.test.cjs plugins/devflow/devflow/bin/lib/adopt-e2e.test.cjs plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs plugins/devflow/devflow/bin/lib/adopt-scaffold.test.cjs plugins/devflow/devflow/bin/lib/adopt-preflight.test.cjs`

## TDD Evidence

### Task 1 (tests 1-6, 10)

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/migrations/0007-doc-refs-fix.test.cjs` | 1 | FAIL (correct — `Cannot find module`, module didn't exist yet) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/migrations/0007-doc-refs-fix.test.cjs` | 0 | PASS (correct — 7/7) |

### Task 2 (tests 7-9, 11-13, plus upgrade-cli test 14)

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/migrations/0007-doc-refs-fix.test.cjs` | 1 | FAIL (correct — 1 genuine failure: test 7, `1 !== 2`, the Session Log line-append feature didn't exist yet) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/migrations/0007-doc-refs-fix.test.cjs` | 0 | PASS (correct — 13/13) |

**Note on RED scope:** tests 8, 9, 11, 12 and 13 (and upgrade-cli's test 14) passed immediately against the Task-1-only implementation — they exercise plumbing (no-Session-Log rewrite, removed-token inertness, full-registry idempotence, historical-record exemption, 0005 coexistence, AUTO_IDS) that Task 1's CLAUDE.md-target code already generalized correctly to STATE.md. Only test 7 (the log-line append itself) was genuinely red, which is the one piece of new behavior Task 2 actually implements. This was confirmed by running the suite before committing RED, not assumed.

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 7/7 (contract shape incl. `since:'2.11.0'`; two-target closed allowlist; detect reason format incl. skip cases; apply shape incl. Session Log entry format and `dryRun`; idempotence; 0005 coexistence; historical-record exemption)
- **Gate failures:** None

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/migrations/0007-doc-refs-fix.cjs` - the migration: CLAUDE.md DEVFLOW-block target + STATE.md target (outside Session Log) + Session Log entry append
- `plugins/devflow/devflow/bin/lib/migrations/0007-doc-refs-fix.test.cjs` - 13 test cases (1-13) covering both targets, idempotence, 0005 coexistence, historical-record exemption
- `plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs` - test 14 (AUTO_IDS decision, verified not guessed) plus a documentation comment at the `AUTO_IDS` declaration

## Decisions Made
- Fixed `since` to `'2.11.0'` (the TRD's must_haves literal) before any GREEN commit — an earlier in-progress draft had briefly used `'2.12.0'`, caught and corrected pre-commit.
- `AUTO_IDS` left unchanged, with an explanatory comment: the default v1 fixture's CLAUDE.md (legacy block) and STATE.md carry no `/devflow:`/`/df:` token, so 0007 is always `skipped`, never `pending`/`applied`, on that fixture.
- Removed an unused `isStaleKind()` helper that had been drafted but never called, ahead of the Task 2 GREEN commit, so no dead code shipped.

## Deviations from Plan

None — TRD executed exactly as written. The `since` correction and dead-code removal above were caught and fixed before either landed in a commit, so they are not deviations from what actually shipped.

## Issues Encountered

**Full-suite regression check found one failing test not in `baseline-failures.tsv`:** `plugins/devflow/devflow/bin/lib/roadmap-reconcile.test.cjs` → `E2E1: SELF-TEST — reconcile dry-run against this repo ROADMAP shows zero drift`. Investigated and re-ran in isolation (deterministic, reproducible alone). Root cause: this self-test diffs the *actual* `.planning/ROADMAP.md` in this checkout against on-disk SUMMARY files; objective 38's wave-1 TRDs (38-03, 38-04, 38-05) already have SUMMARY.md files in this worktree's history but their ROADMAP.md checkboxes have not yet been ticked — that reconciliation is explicitly deferred to objective completion, and this TRD's `files_modified` allowlist forbids touching ROADMAP.md. Not caused by, and not fixable within, TRD 38-08's scope. Per the TRD's regression-gate instruction ("re-run anything unlisted alone, never edit the TSV"), this is reported here rather than silently absorbed or worked around.

All 10 other failures in this run match `baseline-failures.tsv` verbatim (devflow-watch daemon lifecycle x4, handoff-e2e daemon/route-results x6). No new regressions from this TRD's changes.

## Regression Tallies

Full suite (`npm test`): **4065 tests, 4004 pass, 11 fail, 0 cancelled, 50 skipped.**

- 10/11 failures match `baseline-failures.tsv` names exactly (pre-existing, environment/daemon-timing related, unrelated to this TRD).
- 1/11 failure (`E2E1: SELF-TEST`) is new versus the TSV but is a pre-existing ROADMAP-reconciliation gap in this in-flight objective's worktree (see Issues Encountered), confirmed deterministic in isolation, outside this TRD's `files_modified` allowlist, and not touched.
- 0 failures attributable to migration 0007 or its tests.

## User Setup Required

None - no external service configuration required.

## Next Objective Readiness

- `0007-doc-refs-fix.cjs` is registered and contract-complete; ready for 38-09's CI gate to scan against it.
- The `E2E1` ROADMAP-drift failure noted above should resolve naturally once objective 38's wave-1 TRD boxes are ticked at reconciliation time — flagging it here so it isn't mistaken for a regression introduced by a later TRD in this objective.

---
*Objective: 38-doc-auto-correction*
*Completed: 2026-09-28*
