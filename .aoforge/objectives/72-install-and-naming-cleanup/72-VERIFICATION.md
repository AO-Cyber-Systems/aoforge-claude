---
objective: 72-install-and-naming-cleanup
verified: 2026-10-09T19:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "INST-04: gh-client maxBuffer/ENOBUFS defect fixed (72-27); read-only dry run completes on eden-biz; tracker ticked"
  gaps_remaining: []
  regressions: []
---

# Objective 72: Rename to AOForge and naming cleanup Verification Report

**Goal:** DevFlow becomes AOForge everywhere it is a name, old names keep working for one release, projects and the user's setup move over in place, and the legacy df-* install is gone and stays gone.
**Verified:** 2026-10-09T19:00:00Z
**Status:** passed
**Re-verification:** Yes, after gap closure cycle 1 (TRD 72-27)

## Gap Closure Check (INST-04)

| Claim (72-27 SUMMARY) | Check | Result |
|---|---|---|
| 256 MiB maxBuffer at the single spawn site | `gh-client.cjs` lines 43-100: `GH_MAX_BUFFER`, `maxBuffer: GH_MAX_BUFFER` in spawnOptions, named ENOBUFS and ETIMEDOUT causes with `stdout: ''` | VERIFIED |
| RED/GREEN tests | `git log 51f334d3..HEAD`: f9d41715 RED, 46f5e23e GREEN, 3077a1b8 RED, 539b4386 GREEN; `gh-client.test.cjs` 48/48 pass, including R1-R4 (real spawn runner, >1 MiB and >2 MiB answers, ENOBUFS, ETIMEDOUT) and U1-U4; test 23 (opts unchanged) still passes | VERIFIED |
| No regression | rename-guard, doc-refs and gh-rebrand.legacy suites: 56/56 pass | VERIFIED |
| Tracker | REQUIREMENTS.md line 50 `[x] INST-04`, line 99 `Complete`; 72-27-SUMMARY `requirements-completed: [INST-04]`; todo moved to completed | VERIFIED |
| eden-biz read-only `gh rebrand --dry-run` exit 0, ok:true, 0 ops | Taken from the SUMMARY (command, timing, section table, before/after porcelain recorded); not re-run here (live GitHub read of a third-party repo, and the repro is covered hermetically by R1/R2) | ACCEPTED on SUMMARY, corroborated by tests |

### Is INST-04 met? Yes, on this basis

INST-04's store-mode clause asks for a verb that previews with a dry run and applies one repository at a time after approval. That verb (`gh rebrand`, 72-16) exists with dry-run default, `--apply` refused together with `--dry-run`, a fixed op order, stop-at-first-failure with resume, idempotent second apply, and outbox-base refresh. Its suites exercise apply, idempotence, resume, rate-limit stop, and a real-client wiki rename and push against a local bare remote. The only defect that stopped it on a real repository (ENOBUFS on a 6 MiB issues read) is fixed and proven by tests, and the dry run then completed on a 876-issue live repository. A live `--apply` could not be exercised because no fleet repository is in store mode (recorded in 72-25 and 72-27), and a live apply needs the repository owner's own approval. I treat the requirement as met on the strength of fixture-level apply coverage plus a live large-repository dry run, not on a live apply. That limit is an advisory, not a gap: it should be run the first time a repository enters store mode.

## Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | No df-* under ~/.claude/skills or agents; doctor flags reappearance | VERIFIED | Earlier pass (no df-* on disk; doctor check 15); unchanged |
| 2 | Repo tests fail on legacy command forms and names | VERIFIED | rename-guard and doc-refs re-run: pass |
| 3 | Old names still work, no duplication | VERIFIED (static) | compat shims, dual readers, migrations 0012-0014; unchanged |
| 4 | .planning to .aoforge via git mv, dirty tree skipped, config/CLAUDE.md renamed, store-mode artefacts renamed after dry run | VERIFIED | Migrations by tests and this repo's own move; `gh rebrand` now readable on large repos (see above) |
| 5 | 3.0.0 tagged, versions in step, CHANGELOG, pointer plugin, coexistence flag | VERIFIED | Unchanged; 72-27 added only an Unreleased CHANGELOG entry |
| 6 | Live steps after approval | VERIFIED with deferrals | Unchanged |

Deferrals by decision (not gaps): vanity PR (todo 2026-10-09-add-aoforge-claude-to-the-vanity-mapping-once-git-aocyber-ai-is-configured), `aoforge-docs` Pages project (objective 74 OPS-03), marketplace re-point skipped (GitHub redirect), some fleet repos held by the user.

## Requirements Coverage

| Req | Status | Evidence |
|-----|--------|----------|
| INST-01 | SATISFIED | no df-* on disk; command-form guard tests pass |
| INST-02 | SATISFIED | rename guard passes |
| INST-03 | SATISFIED | compat shims and dual readers |
| INST-04 | SATISFIED | see Gap Closure Check; tracker and SUMMARY agree |
| INST-05 | SATISFIED | tag, version triple, CHANGELOG, pointer plugin |
| INST-06 | SATISFIED (deferrals recorded) | see SC-6 |

No orphaned requirement IDs.

## Advisories

- No live `gh rebrand --apply` has run on any repository; run it, one repository at a time with approval, when one enters store mode.
- `doctor` reports 5 warnings (legacy-plugin-runtime, legacy-runtime-state, validate-health, awareness-state, backups); no errors. Moving the old runtime home is the user's call (`doctor --global --fix`).
- The installed 3.0.0 mirror still carries the ENOBUFS bug until the next release; the fix is in this checkout only.
- 72-27 proposes a STACK.md layout correction (still names the pre-rename paths); not applied.
- Objective is unscored for EST-11 per 72-01. Deployment verification: not_available.

## Human Verification

None required beyond the user's already-deferred live steps.

_Verifier: Claude (verifier)_
