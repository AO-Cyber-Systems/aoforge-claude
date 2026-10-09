---
objective: 47-github-authoritative-store
verified: 2026-09-30T00:00:00Z
status: passed
score: 6/6 success criteria verified (GST-01..GST-08 all covered)
deployment_verification: not_available
notes:
  - kind: open_decision
    note: "`gh trd freeze|scope|fold` need connectivity (exit 1 offline, queue nothing). Documented as an open decision in CLAUDE.md, CHANGELOG, USER-GUIDE, gh-sync skill and proposal. Classified acceptable, not a gap: SC3/GST-05 govern the outbox-journaled writes (issue/body/comment/wiki via gh sync), which are tested offline (e2e test 7/8). The trd verbs are read-modify-write against GitHub spec comments and are refused offline, tested explicitly (e2e 7). Follow-up for objective 49 (freeze wiring to execute start)."
  - kind: scope
    note: "Decision issues are library-only (gh-hierarchy.openDecision, no gh verb). GST-01 requires Decision issues that block their TRD; the library path and tests satisfy it. A CLI verb is not required by any requirement."
  - kind: flaky
    note: "handoff-e2e MA-7 did not fail in this run."
---

# Objective 47: GitHub authoritative store - Verification

**Goal:** GitHub holds the full planning hierarchy and content; DevFlow round-trips it through an outbox and local cache.
**Status:** passed

## Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Fixture objective (3 TRDs, 2 waves) pushes issues, sub-issues, blocked-by, wiki pages; `pull --all` regenerates byte-identical cache | VERIFIED | gh-store-e2e tests 2, 3, 4 pass |
| 2 | TRD over 60K refused before any issue exists; exactly 60K warns | VERIFIED | e2e 5a (zero gh calls, no journal), 5b; `TRD_MAX_CHARS=60000` in gh-trd.cjs |
| 3 | Scope comments form effective spec in order; fold logged | VERIFIED | e2e 6 |
| 4 | Offline writes queue, flush in order; remote edit halts flush | VERIFIED | e2e 7, 8, 9 |
| 5 | Degraded mode (labels+meta, docs/devflow, wiki-less) works | VERIFIED | e2e 10, 11, 12 |
| 6 | Store-mode sync wiring (gh.cjs -> pushHierarchy / flush / cache), default off | VERIFIED | gh.cjs lines ~1230-1360; gh-sync-store.test.cjs passes |
| 7 | `npm test` green | VERIFIED | 6948 tests, 6915 pass, 0 fail (rest skipped/todo); gh-* tests 1107/1107 |

## Requirements coverage

All GST-01..GST-08 appear in TRD frontmatter across 47-01..47-14 and are defined in OBJECTIVE.md; none orphaned.
GST-01 gh-hierarchy; GST-02/04 gh-body/gh-comments (summary and verification comments planned at gh-hierarchy.cjs:428); GST-03 gh-trd; GST-05 gh-outbox/gh-outbox-flush; GST-06 gh-wiki; GST-07 gh-cache (single renderRoadmap used for ROADMAP and wiki Roadmap page); GST-08 gh-capability plus degraded e2e.

## Anti-patterns

None blocking found in spot checks. Working tree changes are unrelated to objective 47 (untracked .gitkeep, docs).

## Human verification

1. Against a real GitHub org repo with Issue Types/fields and a wiki: run `gh sync` in store mode and `gh pull --all`. Why human: all tests use the fake; issue-field definition path (D-07) and wiki revision URL (D-09) are LOW-confidence assumptions about the live API.
2. Decide the offline `gh trd` verb question before objective 49 wires freeze to execute start.

Not run against real GitHub by constraint; these are advisory and do not change status.
