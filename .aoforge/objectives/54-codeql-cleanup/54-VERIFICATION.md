---
objective: 54-codeql-cleanup
verified: 2026-10-04T00:00:00Z
status: passed
score: 9/9 TRDs verified (54-10 pending, orchestrator-owned)
---

# Objective 54: CodeQL cleanup Verification Report

**Goal:** Clear open CodeQL alerts on main (groups A, B, C, E, F, G, H fixed; D = comment only here; dismissal of alert 95 is done by the orchestrator in 54-10).
**Status:** passed (54-10 PR scan and alert-95 dismissal pending, not a gap)

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 54-01 shared `lib/text-escape.cjs` (escapeRegExp, objectiveNumPattern, mdCell); duplicates replaced by imports | VERIFIED | text-escape.test.cjs passes; require sites in roadmap-progress, gh-wiki, watcher-shell, planning-verbs-cli, objective, roadmap, workstreams, novel-domain, trd-pre-check, project-bootstrap, changelog, adopt, stack-report, hooks/changelog-on-tag.js |
| 2 | 54-02 note comment terminators neutralised; config-set reserved-segment guard; handoff comment | VERIFIED | `RESERVED_KEY_SEGMENTS` in config.cjs:145; `(--!?)>` handling in stack-profile.cjs:902; config.test.cjs passes |
| 3 | 54-03 `contents: read` on test.yml and agent-shell-harness.yml plus repo guard; PJ-6 and doctor e2e leftovers | VERIFIED | permissions blocks present; workflow-permissions.test.cjs and ci-unit-gate.test.cjs pass (92/92) |
| 4 | 54-04/05 execFileSync in verify and CLI tests; positional-arg sh gate | VERIFIED | zero `execSync(` in all 9 listed test files; ui-spec-cli.test.cjs passes |
| 5 | 54-06 objective/roadmap/workstreams on objectiveNumPattern; Requirements lookup section-anchored and escaped; widened sites | VERIFIED | no `.replace('.', ...)` escapes left in the three files; roadmap.cjs:282 and workstreams.cjs:49 now bounded; regression tests 8 and 9 in workstreams.test.cjs pass |
| 6 | 54-07 detector, bootstrap and changelog regexes; hook uses shared escape | VERIFIED | novel-domain:333, trd-pre-check:132, project-bootstrap, changelog.cjs and hooks/changelog-on-tag.js use the shared helpers; changelog.test.cjs and changelog-on-tag.test.js pass |
| 7 | 54-08 markdown table cells escaped once via mdCell | VERIFIED | adopt.cjs and stack-report.cjs import mdCell; adopt-report and stack-report tests pass |
| 8 | 54-09 CHANGELOG `[Unreleased]` Fixed and Security | VERIFIED | CHANGELOG.md lines 7-23 |

Targeted run: 332 tests pass, 0 fail, across 13 lib test files and the hook test. Workflow and CI gate guards: 92/92.

## Notes (not gaps)

- Pre-existing bug, predates 54: `searchObjectiveInDir` (objective.cjs) was introduced 2026-04-25 (b34ccd3e). Its 4.1 vs 04.10 prefix matching is unrelated to the 54 regex work.
- Pre-existing, predates 54: leading-zero ROADMAP header lookup in trd-pre-check (introduced a16ee42e, objective 14) and novel-domain. 54-07 only swapped in the escape and did not change the zero-padding semantics.
- Remaining `.replace(/\./g, '_')` in gh-wiki.cjs are slug transforms, not regex escapes.
- Remaining `execSync(` in non-test sources (benchmark, helpers, project-hygiene, project-bootstrap) are outside the alert groups.
- Full suite per 54-09 SUMMARY: 9055 pass, MA-7 only (environmental, doctl); not re-run here.
- 54-10 (draft PR scan, 0 new alerts, dismissal of alert 95): pending, handled by the orchestrator.
