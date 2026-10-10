---
objective: 75-prospective-estimate-retest-and-todo-sweep
trd: "75-05"
subsystem: estimation
tags: [est-09, est-11, todo-01, close-out, coverage, requirements]
requires:
  - objective: 75-prospective-estimate-retest-and-todo-sweep
    provides: "75-01 verdict (EST-11 not met), 75-02 upgrade fixes, 75-03 reconcile fix, 75-04 todo sweep"
provides:
  - "75-RETEST-REPORT.md carries `tokens coverage` for v1.6 verbatim beside the EST-11 verdict (90/92 = 0.97826, target met)"
  - "REQUIREMENTS: EST-09 and TODO-01 ticked on evidence; EST-11 left [ ] with Not met and the report path, as EST-08 was in v1.5"
  - "STATE: the 67 freeze blocker resolved, one decision recording the EST-11 verdict, the EST-09 number and the todo counts"
  - "CHANGELOG, CLAUDE.md and USER-GUIDE describe the 75-02 and 75-03 fixes; CLAUDE.md names objective 75's outcome"
affects: [objective-75-verification]
key-files:
  modified:
    - .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-RETEST-REPORT.md
    - .aoforge/REQUIREMENTS.md
    - .aoforge/STATE.md
    - .aoforge/STATE_ARCHIVE.md
    - .aoforge/state.json
    - CHANGELOG.md
    - CLAUDE.md
    - docs/USER-GUIDE.md
decisions:
  - "EST-09 is ticked on the verb's integer check (`target 95%: met`) at 90/92 = 0.97826; nothing was backfilled and `tokens backfill --write` was not run"
  - "EST-11 stays `[ ]`: the report's frontmatter says `verdict: not met` (72 unscored), so a four-objective result is not EST-11"
  - "TODO-01 is ticked after the SC-4 check passed again (10 pending, 0 without a disposition_reason)"
  - "The 0008 file list in CLAUDE.md, USER-GUIDE and CHANGELOG names all six basenames, not only the dup-detect log: 75-02's audit added three more"
metrics:
  duration: "about 8 minutes (2026-10-10T08:00Z to 08:08Z), most of it the 180 s full suite"
  completed: 2026-10-10
requirements-completed: [EST-09, TODO-01]
tokens_input: 7806206
tokens_output: 32662
tokens_cache_read: 7673242
tokens_cache_write: 132842
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 75 TRD 05: Re-measure EST-09 beside the verdict, record outcomes, close out Summary

One-liner: forward-stamp coverage over v1.6 measured 90/92 = 0.97826 (target 95% met) and sits beside the EST-11 not-met verdict in the report; EST-09 and TODO-01 are ticked on that evidence, EST-11 is not, the freeze blocker is resolved, the 75-02 and 75-03 fixes are documented, and the full suite passes (12583 tests, 0 fail).

## Progress
- [x] Task 1: Re-measure EST-09 over v1.6 and report it beside the verdict — c483d8dd
- [x] Task 2: REQUIREMENTS and STATE from the evidence — 2e89944b
- [x] Task 3: CHANGELOG, CLAUDE.md, USER-GUIDE, full suite — 17b5ffcd (CLAUDE.md), 408e0150 (CHANGELOG, USER-GUIDE)

## Measured coverage (EST-09)

From the installed 3.0.0 runtime, `tokens coverage --milestone v1.6 --raw`, run after 75-01..75-04 had published:

```
v1.6 forward-stamped 90/92 = 0.97826 (target 95%: met) · live 90 · backfill 0 · unlabeled 0 · missing 2 · in progress 0 (not counted)
  65-02 missing (no_transcript)
  65-03 missing (no_transcript)
```

The unrounded ratio in the JSON is 0.9782608695652174. `tokens coverage` with no scope printed the same headline (the current milestone is v1.6). `tokens coverage --objective 75` printed `objective 75 forward-stamped 4/4 = 1 (target 95%: met)` for 75-01..75-04. 75-05's own SUMMARY did not exist at that measurement, so it is not in the 92; its stamp is checked in the self-check below. The two misses are the inline-run 65-02 and 65-03, which no executor transcript exists for (recorded by objective 66); they cannot move.

## Requirement outcomes

| Requirement | Result | Evidence |
|---|---|---|
| EST-09 | ticked `[x]`, status Complete; traceability cell `Objective 66 (built); coverage 90/92 = 0.97826 measured by 75-05` | `target 95%: met` from the verb's integer check, in `75-RETEST-REPORT.md` (`est09_coverage`, `est09_target: met`) |
| EST-11 | left `[ ]`; line extended with `(re-tested prospectively in objective 75 on objectives 68, 69, 70 and 71; 72 unscored: not met, see 75-RETEST-REPORT.md)`; cell `Not met: see objectives/75-.../75-RETEST-REPORT.md; follow-up todo est-11-follow-up-objective-75` | report frontmatter `verdict: not met` |
| TODO-01 | ticked `[x]`, status Complete; cell names `75-TODO-SWEEP.md` | SC-4 check re-run in this TRD: 10 pending, missing disposition_reason 0, lacking any of the five fields 0 |

STATE: `state resolve-blocker --text "EST-11 calibration frozen"` removed the freeze blocker (the calibration was not rebuilt; sha256 `f4d1ffa9` unchanged, no `calibrate` run). One decision was added: EST-11 not met on 68-71 (72 unscored); EST-09 met at 90/92 = 0.97826; 4 todos completed, 9 re-scoped, 1 follow-up opened. The pre-registered rule decided it; nothing was tuned.

## Deviations from Plan

None - the TRD was executed as written, with these notes:

1. **Wider 0008 file list in the docs.** The TRD asked to add the dup-detect log. 75-02's audit added three more basenames to migration 0008 (`.check-todos-cache.json`, `.deprecation-log.jsonl`, `.override-log.jsonl`), and the TRD itself said to add any further basename the audit added, so CLAUDE.md, USER-GUIDE and CHANGELOG name all six.
2. **Order inside Task 3.** The guards and the full suite ran before the two commits, so the suite ran against the final tree rather than after the CLAUDE.md commit alone. The commits and their content are as specified.
3. **Task 1 step 3 not applicable.** EST-09 was met, so no `est-09-coverage-follow-up-objective-75` todo was created.
4. **SC-4 script is not committed.** As in 75-04, it is a read-only scratch script; its output is quoted here.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: coverage in the report | `rg -n -e '^est09_coverage: ' -e '^est09_target: ' -e 'forward-stamped' -e 'Measured in TRD 75-05' 75-RETEST-REPORT.md` | 0 | PASS (frontmatter lines 7-8 and the verbatim line match; the placeholder sentence is gone) |
| 2: requirements and state | `git diff -U0 .aoforge/REQUIREMENTS.md`; `rg -n -e 'EST-11 calibration frozen' .aoforge/STATE.md`; SC-4 script | 0 | PASS (EST-09 and TODO-01 `[x]`, EST-11 `[ ]`; no match in STATE.md Blockers; SC-4: `pending: 10; missing disposition_reason: 0; lacking any of the five fields: 0`) |
| 3: docs and suite | `rg -n -e 'objective 75' CHANGELOG.md`; `rg -n -F '.dup-detect-log.jsonl' CLAUDE.md docs/USER-GUIDE.md`; the three guard tests; `npm test` | 0 | PASS (three new [Unreleased] ### Fixed entries; both docs match; 54 guard tests pass; suite below) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL npm test` | 0 | PASS: tests 12583, suites 2041, pass 12551, fail 0, cancelled 0, skipped 32, todo 0 (180.6 s) |
| guards | `node --test rename-guard.repo.test.cjs doc-refs.repo.test.cjs rg-flag-guard.test.cjs` | 0 | PASS: 54 tests, 0 fail |

## Discovered commands

None. The stack profile (general) names `npm test`, and CI runs the same command.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (coverage section verbatim beside the verdict; ticks follow the evidence; blocker resolved and decision recorded; CHANGELOG, CLAUDE.md and USER-GUIDE updated; `npm test` and the rename, doc-refs and rg-flag guards pass)
- Gate failures: None
- Untracked `amp` at the repository root was left alone and never staged.

## Self-Check: PASSED

- Files: `75-RETEST-REPORT.md`, `75-TODO-SWEEP.md`, `.aoforge/REQUIREMENTS.md`, `CHANGELOG.md` found.
- Commits found in `git log`: c483d8dd, 2e89944b, 17b5ffcd, 408e0150.
- Own stamp, after the first `summary post`: `tokens coverage --objective 75 --raw` printed `objective 75 forward-stamped 5/5 = 1 (target 95%: met) · live 5 · backfill 0 · unlabeled 0 · missing 0 · in progress 0 (not counted)`, so 75-05 is stamped live.
- Milestone with 75-05 counted: `v1.6 forward-stamped 91/93 = 0.978494 (target 95%: met) · live 91 · backfill 0 · unlabeled 0 · missing 2 · in progress 0 (not counted)`. The figure recorded in REQUIREMENTS and the report stays the pre-75-05 measurement, 90/92 = 0.97826, as Task 2 recorded it; this later one does not change that decision.
