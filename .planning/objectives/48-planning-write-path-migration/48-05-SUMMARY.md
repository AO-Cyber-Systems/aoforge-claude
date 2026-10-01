---
objective: 48-planning-write-path-migration
trd: "05"
subsystem: github-store
tags: [wiki, page-mapping, milestones, native-milestones, gh-fake, tdd, hermetic]
requires:
  - gh-wiki PAGE_TABLE / objectivePage / parseObjectiveDir (47-04)
  - gh-client ghRead / ghWrite / ghPaginate / requireEnabled / readConfig (46)
  - gh-milestone normaliseVersion / milestoneTitle (46-05, pure local I/O, unmodified)
  - __fixtures__/gh-fake.cjs, gh-store-fixtures makeStoreProject / hermeticEnv (47)
provides:
  - "gh-wiki PAGE_TABLE rules: research (research/<stem>.md <-> Research-<stem>), milestone (milestones/vX.Y.md <-> Milestone-vX_Y), milestone-archive (milestones/vX.Y-<KIND>.md <-> Milestone-vX_Y-<Kind>), objective-doc (objectives/<dir>/<N>-<SUFFIX>.md <-> <ObjectivePage>-<Suffix>)"
  - "gh-wiki exports validPage"
  - "gh-milestone-store.cjs: MILESTONE_DESC_MAX, milestoneDescription, milestonePage, milestonePageUrl, milestoneTitleFor, findMilestone, upsertMilestone, closeMilestone, listMilestones"
  - "gh-fake: GET + PATCH repos/o/r/milestones/<n> (title, description, state, due_on; closed_at stamped on close, cleared on reopen); POST honours state/due_on; milestone records carry due_on/closed_at"
affects:
  - 48-07 gh-cache (renders MILESTONES.md from listMilestones; pulls the new wiki page classes)
  - 48-11 doc put (accepts any rel with pageForCachePath(rel) !== null)
  - 48-12 milestone put|complete (milestoneDescription + upsertMilestone + closeMilestone; milestonePageUrl for the link)
  - 48-15 seam guard (adds gh-milestone-store.cjs as an allowed direct milestone writer)
tech-stack:
  added: []
  patterns:
    - "UPPER-CASE kind title-cased per hyphen part in the page name and upper-cased back, so every page inverts to exactly one cache path"
    - "find-or-create by title, PATCH by number with only the differing fields; 422 on create resolved by re-list (copied from gh-issue.ensureMilestone)"
    - "list-first operations: a failed (offline) list returns before any write is attempted"
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-milestone-store.cjs
    - plugins/devflow/devflow/bin/lib/gh-milestone-store.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-wiki.cjs
    - plugins/devflow/devflow/bin/lib/gh-wiki.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
    - plugins/devflow/devflow/bin/lib/gh-fake.test.cjs
key-decisions:
  - "Milestone title = gh-milestone.milestoneTitle(github.milestone_prefix || 'v', version), the exact title 47's hierarchy sync creates (D-05 '<milestone_prefix><version>'); default gives v1.3, prefix M- gives M-1.3"
  - "The generic objective-doc rule needs N to equal the directory's own objective prefix (string equality), and refuses TRD/SUMMARY/VERIFICATION/CONTEXT/RESEARCH, so NN-MM-...-TRD.md and issue-backed files stay null"
  - "upsertMilestone refuses a description over 1,000 characters, an invalid version and a state other than open|closed before any gh call (callers use milestoneDescription)"
  - "closeMilestone on a missing milestone is {ok:false, notFound:true}, never a create"
  - "Offline (gh 'error connecting to' / dial tcp / could not resolve host, or status null) is {ok:false, offline:true, error:'offline: ...'}; a missing gh binary is not classified offline"
metrics:
  duration: "~15 min"
  completed: "2026-10-01"
  tasks: 3
  files: 6
---

# Objective 48 TRD 05: Wiki page rules and native milestone store Summary

Research notes, milestone entries/archives and the remaining objective docs (UAT, EVIDENCE, ROLLOUT, DISCOVERY...) now have wiki pages in 47's single PAGE_TABLE. A new `gh-milestone-store.cjs` writes native GitHub milestones idempotently: find-or-create by title, one PATCH by number carrying only the fields that differ, a 422 resolved by re-listing, and offline exiting before any write. All of it goes through gh-client.

## What was built

**Task 1, PAGE_TABLE rules (gh-wiki.cjs).** I added four rules, each with `match`/`invert`, round-tripping through `cachePathForPage`:

| Rule | Cache path | Page |
|---|---|---|
| `research` (before the objective rules) | `research/tdd-scope-summary.md` | `Research-tdd-scope-summary` |
| `milestone` | `milestones/v1.3.md` | `Milestone-v1_3` |
| `milestone-archive` | `milestones/v1.3-MILESTONE-AUDIT.md` | `Milestone-v1_3-Milestone-Audit` |
| `objective-doc` (after CONTEXT/RESEARCH/objective) | `objectives/42-codebase-aware-stack-drafter/42-ROLLOUT.md` | `Objective-42-codebase-aware-stack-drafter-Rollout` |

All existing mappings are unchanged, which the characterization test pins. TRD, SUMMARY and VERIFICATION files and STATE.md still map to null. The doc comment above PAGE_TABLE now lists every class in order. `validPage` is exported so tests can check page names against PAGE_NAME_RE.

**Task 2, fake GitHub.** `repos/o/r/milestones/<n>` now handles GET and PATCH. PATCH accepts `-f`/`-F` or `--input -` and can change title, description, state and due_on. A 422 is returned for an invalid state or a duplicate title, and nothing changes when it is. Closing sets `closed_at`, reopening clears it, and an unknown number returns 404. Writes show up in `fake.writes()`. Milestone records now carry `due_on: null, closed_at: null`, and POST honours `state` and `due_on`.

**Task 3, gh-milestone-store.cjs.** This covers D-05. It provides `milestoneDescription(entryText, pageUrl)` (at most 1,000 characters: the first paragraph after an optional `## ` heading, cut on a word boundary with `…`, followed by `\n\nFull notes: <url>`) and `milestonePage` / `milestonePageUrl`, which resolve through the gh-wiki table. It also provides `findMilestone`, `upsertMilestone`, `closeMilestone` and `listMilestones`. `listMilestones` is paginated with `state=all` and returns `{number,title,state,description,due_on,closed_at}`. The header comment documents the direct-write exception, which is the same as 47's `ensureMilestone`, and the offline-before-write guarantee. `gh-milestone.cjs` is untouched, and a source test asserts that it stays pure local I/O.

## Deviations from Plan

### Auto-fixed Issues

None. The TRD was executed as written, with these interpretations:

1. **[Interpretation] Milestone title.** The TRD says "`<github.milestone_prefix or ''><version>`" and also "same prefix gh-hierarchy.configuredMilestonePrefix reads" (`|| 'v'`). I used `milestoneTitle(prefix || 'v', version)`, which produces exactly the title 47's sync creates. That means `v1.3`, not `vv1.3`, so upsert finds milestones that already exist.
2. **[Addition] Extra exports.** `milestonePageUrl(repo, version)` and `milestoneTitleFor(root, version)` were added for 48-12, which needs the page URL, and for 48-07. `gh-wiki` now exports `validPage`, which test 5 needs.
3. **[Addition] Fake POST** honours `state` and `due_on`, so an upsert that creates an already-closed milestone is modelled faithfully.
4. **[Process] Preflight claim.** The first `exec-context check` ran from the main checkout before switching to the worktree and claimed it for 48-05. I released that claim right away (`exec-context release --id 48-05` in the main checkout) and re-ran the check from the worktree, which passed (`is_worktree: true`, base visible).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: PAGE_TABLE rules | `node --test .../gh-wiki.test.cjs .../gh-cache.test.cjs` | 0 (113/113) | PASS |
| 2: fake milestone PATCH/GET | `node --test .../gh-fake.test.cjs` | 0 (46/46) | PASS |
| 3: gh-milestone-store | `node --test .../gh-milestone-store.test.cjs .../gh-milestone.test.cjs` | 0 (26/26) | PASS |

TRD verification snippet: `pageForCachePath` prints `Research-tdd-scope-summary`, `Milestone-v1_3-Milestone-Audit`, `Milestone-v1_2-Roadmap`.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| characterization (test 1) | `node --test --test-name-pattern 48-05 gh-wiki.test.cjs` | 0 | PASS on existing code (correct) |
| RED tests 2-5 | same | 1 (4 failing) | FAIL (correct) |
| GREEN tests 1-5 | `node --test gh-wiki.test.cjs gh-cache.test.cjs` | 0 | PASS (correct) |
| RED test 13 | `node --test --test-name-pattern 48-05 gh-fake.test.cjs` | 1 | FAIL (correct) |
| GREEN test 13 | `node --test gh-fake.test.cjs gh-issue.test.cjs` | 0 (142/142) | PASS (correct) |
| RED tests 6-12 | `node --test gh-milestone-store.test.cjs` | 1 (module missing) | FAIL (correct) |
| GREEN tests 6-12 | `node --test gh-milestone-store.test.cjs gh-milestone.test.cjs` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test gh-wiki.test.cjs gh-milestone-store.test.cjs gh-fake.test.cjs` | 0 | PASS |
| regression | `node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'` | 0 | PASS |
| full suite | `npm test` | 1 | PASS except the known pre-existing flaky MA-7 (6968 tests: 6935 pass, 1 fail, 32 skipped) |

## Invariant check (github.store off)

None of these changes touch a write path. The PAGE_TABLE rules are pure mappings, and nothing consults them on the local path until 48-11. `gh-milestone-store` is a library with no caller yet. With `github.enabled` not true, every operation returns `{skipped:true}` with zero gh calls (test 12). `.planning/` tracking and the edit gate are untouched.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (page table rules + round trip; existing mappings unchanged; milestone store upsert/patch/list/close via gh-client only; milestoneDescription <= 1,000; fake PATCH + single GET)
- Gate failures: none caused by this TRD. `npm test` exits 1 on the known flaky MA-7 (`handoff-e2e.test.cjs`, doctl auth init PTY race, TRD 19-05). It is pre-existing, unrelated to these files, and was left unfixed as instructed.

## Commits

- f054334 test(48-05): pin current wiki page mappings before adding rules
- e8ade5d test(48-05): wiki rules for research, milestones, objective docs
- 97dd185 feat(48-05): wiki page rules for research and milestones
- 0005f5b test(48-05): fake milestone patch route
- 38324bf feat(48-05): fake milestone patch route
- 844a2fa test(48-05): native milestone store
- 0e92b88 feat(48-05): native milestone store

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-milestone-store.cjs, gh-milestone-store.test.cjs, 48-05-SUMMARY.md
- FOUND: all 7 task commits on df/exec-48-05 (git log baad394..HEAD)
- STATE.md / ROADMAP.md not edited (the orchestrator updates them after the wave merges)
