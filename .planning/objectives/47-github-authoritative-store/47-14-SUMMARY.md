---
objective: 47-github-authoritative-store
trd: "14"
subsystem: documentation
tags: [docs, claude-md, changelog, user-guide, gh-sync, proposal, full-suite, sc6]

requires:
  - objective: 47-github-authoritative-store
    provides: "47-01..13: the store modules, 47-11 command surface, 47-12 sync wiring, 47-13 e2e"
provides:
  - "CLAUDE.md GitHub bullet extended for store mode (gh outbox, gh trd, gh orphans, gh pull --all)"
  - "CHANGELOG [Unreleased] Added entry for the authoritative store"
  - "USER-GUIDE Store mode section, config rows and command rows"
  - "gh-sync skill store-mode paragraph"
  - "Proposal status line and planning refinements for objective 47"
  - "SC6: full npm test green (6948 tests, 0 failures)"
affects: [objective-48, objective-49, objective-50, objective-51]

tech-stack:
  added: []
  patterns:
    - "the dispatch-completeness extractor takes the first word of every backtick span after the first em dash of a Core Tool bullet, so a bare backticked word such as `meta` reads as a command name; prose says 'body metadata' instead"

key-files:
  created: []
  modified:
    - CLAUDE.md
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - docs/PROPOSAL-github-system-of-record.md
    - plugins/devflow/skills/gh-sync/SKILL.md

key-decisions:
  - "The offline limitation of gh trd freeze|scope|fold is documented as an OPEN DECISION (they read GitHub first, exit 1 offline, queue nothing); nothing claims they queue offline"
  - "Decision issues (library openDecision in gh-hierarchy) are not described as a user-facing feature: no verb creates them yet, so CLAUDE.md and the guide omit them"
  - "The docs say planning files remain the working copy until objectives 48-51; the store is a push target plus a rebuildable cache"

requirements-completed: [GST-01, GST-02, GST-03, GST-04, GST-05, GST-06, GST-07, GST-08]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: false
  test_pairing: false

duration: 1 session
completed: 2026-10-01
---

# Objective 47 TRD 14: Documentation and full test suite (SC6) Summary

**The authoritative store is documented where users and agents look (CLAUDE.md, CHANGELOG `[Unreleased]`, USER-GUIDE Store mode, the gh-sync skill, the proposal's status), with the exit codes, halt resolution, overwrite rules and the offline limitation of the `gh trd` verbs stated plainly; `npm test` is green at 6,948 tests with 0 failures.**

## Accomplishments

- **CLAUDE.md** (one bullet extension, no new section): store mode and its default (`github.store`, false), the hierarchy pushed through the outbox, `gh pull --all [--force]` with exits 0/1/2 and the never-overwritten hand-maintained ROADMAP.md, `gh outbox status|flush [--no-wait]|resolve <seq> --accept-remote|--overwrite` with the flush exit codes, `gh trd spec|freeze|fold|scope <trd>`, `gh orphans <objective>`, the nine modules, the state locations (`DEVFLOW_OUTBOX_DIR`, `.planning/wiki/`, `github.wiki.remote` / `DEVFLOW_WIKI_REMOTE`, `<DEVFLOW_GH_CACHE_DIR>/capabilities/`), degraded mode, and the open decision.
- **CHANGELOG `[Unreleased]` / Added**: hierarchy, TRD codec and budget (40,000 warn / 60,000 refuse), comments, outbox, wiki store, `gh pull --all`, `gh orphans`, degraded mode, module list, and the known limitation; states that `github.store` defaults to false.
- **USER-GUIDE**: three config rows (`github.store`, `github.labels.trd|decision`, `github.wiki.remote`), four command rows, and a Store mode section (what is pushed, the outbox, the 0/1/2/3 exit-code table, resolving a halt, the TRD verbs, `pull --all` overwrite rules, degraded mode). The "planning files are truth" and "does NOT sync" sentences are qualified for store mode.
- **gh-sync skill**: a Store mode paragraph with `gh outbox status`, `gh outbox flush`, `gh pull --all` and the instruction not to pick a resolve option on the user's behalf.
- **Proposal**: a status line recording objectives 46 and 47 as implemented, and a "Planning refinements (objective 47)" list (D-01, D-15, D-17, D-24). The locked decisions table is untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] dispatch-completeness failed on the first CLAUDE.md draft**
- **Found during:** Task 1 verify
- **Issue:** `5: every extracted name is a dispatching COMMANDS key` failed with `meta: not a COMMANDS key`. The narrow Core Tool parse takes the first word of every backtick span after the bullet's first em dash, and the draft wrote body `meta` in backticks.
- **Fix:** reworded to "body metadata" (the USER-GUIDE keeps `meta` in backticks; only the CLAUDE.md Core Tool bullets are parsed). Guards re-run green.
- **Files modified:** `CLAUDE.md`
- **Commit:** 0cf66d2 (fixed before commit)

### Scope decisions

- **"Decision issues block TRDs" left out of the docs.** The TRD's example text lists it, but `gh-hierarchy.openDecision` is library-only: no `gh` verb opens a Decision issue (deferred work). Documenting it as a feature would overstate what ships.
- **Open decision stated, not settled.** `gh trd freeze|scope|fold` need connectivity (47-13 deviation 1). CLAUDE.md, CHANGELOG, USER-GUIDE, the skill and the proposal say so; none claims they queue offline.
- **Task 2 needed no CHANGELOG change.** The suite was green on the first run, so the module list written in Task 1 stood.
- **SUMMARY filename** `47-14-SUMMARY.md` per the dispatch (the TRD text names the longer `47-14-docs-and-full-suite-SUMMARY.md`).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: docs (CLAUDE.md, CHANGELOG, USER-GUIDE, gh-sync skill, proposal) | `node --test dispatch-completeness.test.cjs doc-refs.repo.test.cjs help.test.cjs df-tools-deprecations.repo.test.cjs` | 0 (38 tests, 0 fail) | PASS |
| 2: full suite (SC6) | `npm test` | 0 (6948 tests, 6915 pass, 0 fail, 33 skipped) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 0 | PASS |
| docs grep | `rg -n "gh outbox\|gh trd\|gh pull --all\|gh orphans" CLAUDE.md docs/USER-GUIDE.md` | 0 (matches in both files) | PASS |

## Full suite (SC6)

| | 46 baseline | 47-14 |
|---|---|---|
| tests | 6,187 | 6,948 (+761) |
| pass | (not recorded) | 6,915 |
| fail | 0 | 0 |
| skipped | (not recorded) | 33 |
| cancelled | 0 | 0 |
| duration | | 183 s |

The known flaky handoff-e2e MA-7 (doctl auth) did not fail on this run.

## Post-TRD Verification

- Auto-fix cycles used: 1 (the `meta` wording, before the commit)
- Must-haves verified: 6/6 (CLAUDE.md names `gh outbox`, `gh trd`, `gh orphans`, `gh pull --all`, `github.store` and the state locations; CHANGELOG entry notes default false; USER-GUIDE covers store mode, exit codes 0/1/2/3, halt resolution, TRD verbs, pull overwrite rules, degraded mode; gh-sync skill documents store mode and `gh outbox status|flush`; proposal records objective 47; `npm test` green)
- Gate failures: None
- Process note: the edit gate did not deny any write, so no `skill-active` marker was started.

## Commits

- 0cf66d2 docs(47-14): document the GitHub authoritative store

## Self-Check: PASSED

- FOUND: CLAUDE.md, CHANGELOG.md, docs/USER-GUIDE.md, docs/PROPOSAL-github-system-of-record.md, plugins/devflow/skills/gh-sync/SKILL.md (all modified in 0cf66d2)
- FOUND: commit 0cf66d2
- No version bump, no tag, no push; STATE.md untouched by this TRD.
