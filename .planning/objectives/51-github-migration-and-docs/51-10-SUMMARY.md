---
objective: 51-github-migration-and-docs
trd: "10"
subsystem: docs
tags: [docs, user-guide, claude-md, changelog, proposal, store-mode, migration-0011, full-suite]

requires:
  - objective: 51-github-migration-and-docs
    provides: "51-01..51-09 (objective 26 kill, backfill fixture, gh-backfill, 0010 deferral, import estimate, migration 0011, gh-sync operator)"
provides:
  - "USER-GUIDE GitHub chapter led by `GitHub is the system of record (store mode)` with `Migrating an existing project`; mirror mode demoted to `Mirror mode (store off)`"
  - "USER-GUIDE migrations table 0001-0011 with safety; GitHub troubleshooting for backfill pending/halted, wiki first page, hourly budget, known issues"
  - "CLAUDE.md slimmed from 30,869 to 26,186 bytes (GitHub bullet ~1,000 chars, Planning verbs without module lists, Upgrade gains 0010/0011)"
  - "CHANGELOG [Unreleased] objective 51 entries; proposal status + Planning refinements (objective 51)"
affects: []

key-files:
  created: []
  modified:
    - docs/USER-GUIDE.md
    - CLAUDE.md
    - CHANGELOG.md
    - docs/PROPOSAL-github-system-of-record.md
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/skills/doctor/SKILL.md

key-decisions:
  - "The mirror subsections (Enable, What syncs and when, How a sync treats an issue, Mapping file) were moved below the store section by a one-off script and demoted one heading level, rather than re-typed through Edit"
  - "The module lists cut from CLAUDE.md moved to a new USER-GUIDE `Where the code lives` subsection (move, do not delete)"
  - "Dry-run and pending-stop examples in USER-GUIDE use placeholders (<N>, <writes>) except the measured fixture figures (770 upper bound, 639 real writes); no invented numbers"
  - "The known behaviours handed to 51-10 (W040 for mirror-only projects, --confirm selecting every confirm migration, halted journal failing on 0010 first, doctor check 24 wording, template_version not bumped, multi-line decision answer, objective 1 OBJECTIVE.md orphan) are documented, not changed"

requirements-completed: [GMD-03]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: ~45min
completed: 2026-10-01
tokens_input: 12871108
tokens_output: 62440
tokens_cache_read: 12649830
tokens_cache_write: 221136
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 51 TRD 10: docs for the GitHub model and the full suite Summary

**USER-GUIDE now presents GitHub as the system of record in store mode, with a step-by-step `Migrating an existing project` guide (plan, apply, hour-budget resume, halt, commit, `gh setup` order). CLAUDE.md is 4,683 bytes smaller and points to that guide. CHANGELOG and the proposal record objective 51. `npm test`: 8396 tests, 8363 pass, 1 fail (MA-7 only), 32 skipped.**

## What changed

- **docs/USER-GUIDE.md**
  - Chapter intro: two modes. Store mode is the system of record; mirror mode is the default one-way push. No text calls GitHub derivative any more.
  - `### GitHub is the system of record (store mode)` comes first, then `#### Migrating an existing project`:
    1. prepare (enable, `repo` scope, wiki first page);
    2. the plan (`planning import --dry-run` preview, estimate, history, will-stay-local, `upgrade --check --only 0011`);
    3. the apply and its seven phases;
    4. the hour-budget stop ("not an error: N of M ops remain"), the same-command resume, the gh-flush hook and the 0010 deferral, plus the halt;
    5. the branch + logged-escape commit;
    6. the `gh setup` order, re-run behaviour, known behaviours and the manual UAT note (first real backfill against a throwaway repository).
  - `#### What the store holds` heads the push list. The "Turning it on" manual route points to 0011. "What git tracks afterwards" now describes the store-mode commit steps 0010 and doctor check 20 print (51-04).
  - `#### Where the code lives` holds the module families and the out-of-repo state paths cut from CLAUDE.md.
  - `### Mirror mode (store off)` holds Enable, What syncs and when (new rows: `gh resolve`, migrate; new gh-sync hint), How a sync treats an issue, and Mapping file (commit it in mirror mode, cache in store mode).
  - Troubleshooting covers backfill pending, a halt (including 0010 failing first on a halted journal), the wiki first page, the hourly budget (80/min, 450/h, the 450-write per-run cap, flush exit 3), and known issues.
  - Elsewhere: the migrations table lists 0007-0011 with their safety and the `--confirm` selection rule. The Integration & Release row, the config intro and the `github.store` row, the git-branching cross-reference, a store-mode note under Project File Structure and a Recovery Quick Reference row are updated.
- **CLAUDE.md**
  - The GitHub bullet went from 5,688 to about 1,000 characters. It covers the store, the `github.store` switch, enforcement in one line, the two escapes, the module families, `/devflow:gh-sync migrate`, and a pointer to the USER-GUIDE.
  - The Planning verbs bullet keeps the D-01 invariant and the verb list, with no module lists.
  - The Upgrade bullet gains 0010 and 0011, confirm and resumable.
  - "Where we left off" now says objective 51 is done and lists the next steps. The size note now reads ~26K.
- **CHANGELOG.md** `[Unreleased]`:
  - Added: migration 0011, with the estimate and preview and the history closes.
  - Changed: `/devflow:gh-sync` repurposed; 0010 defers and prints the store-mode commit; objective 26 killed; W040 for GitHub-enabled store-off projects. The objective 50 entry is corrected.
  - Fixed: the import headline; flow's `sync-release`.
- **docs/PROPOSAL-github-system-of-record.md:**
  - The status paragraph says objective 51 is implemented.
  - The objective-50 open item on 0010 and check 20 is updated; the upgrade-project.js background commit is still refused.
  - New `### Planning refinements (objective 51)`: OQ1 closed history, OQ2 empty plan flips, OQ5 kept_local printed, G4 0010 deferral, G5 live-create bookkeeping, the phase machine and resume rule, objective 26 killed, and the UAT open item.
  - The decisions table is untouched.

## Task Commits

1. **Task 1: USER-GUIDE rewrite**: `6e5cc8f2` (docs)
2. **Follow-ups (help.cjs, doctor SKILL)**: `5be18a0d` (docs)
3. **Task 2: CLAUDE.md, CHANGELOG, proposal**: `e70a9990` (docs)
4. **Task 3: full suite**: no commit needed (no doc-test or code failure to fix)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: USER-GUIDE | `node --test doc-refs.repo.test.cjs df-tools-deprecations.repo.test.cjs planning-writes.repo.test.cjs` (28/28) + `rg -n -i "derivative\|source of truth" docs/USER-GUIDE.md` (no lines) | 0 | PASS |
| follow-ups | `node --test help.test.cjs planning-writes.repo.test.cjs doc-refs.repo.test.cjs` (37/37) | 0 | PASS |
| 2: CLAUDE.md etc. | `node --test doc-refs dispatch-completeness hook-inventory df-tools-deprecations` (30/30), then doc-refs + deprecations + changelog after the CHANGELOG/proposal edits (18/18); `wc -c CLAUDE.md` = 26186 (<= 26,869) | 0 | PASS |
| 3: full suite | `npm test` | 1 | PASS per SC3 (sole failure MA-7, below) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 1 | 8396 tests, 1352 suites: 8363 pass, 1 fail, 0 cancelled, 32 skipped, 0 todo (130 s). The sole failure is MA-7 |

**MA-7 (known, environmental, not masked):** `test at plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` reports:

```
✖ MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path
  AssertionError [ERR_ASSERTION]: stderr should match arch-gap, resolution-failure, or timeout+detector-msg path; got: {"status":"done","exit_code":0,"stderr":""}
      at .../handoff-e2e.test.cjs:858:14
```

It is already documented in `.planning/PROJECT.md` line 124 ("1 known failure (MA-7 handoff-e2e)") and in `50-13-SUMMARY.md` lines 77 and 103: a real `doctl` is installed on this machine, and with `doctl` off PATH the test skips itself. No 51-xx TRD touches the handoff files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Two follow-ups outside files_modified, fixed because each was a one-line doc change**
- `help.cjs` described `planning import` as "store mode only ... (--dry-run: count only)". It now says that `--dry-run` writes nothing, prints the plan, the estimate and the history closes, and previews the backfill with the store off when `github.enabled` is true (51-05). No test pins the string.
- `skills/doctor/SKILL.md` step 4 told the agent to run a `commit with:` line that store mode no longer prints. It now says that in store mode the notes hold a multi-line sequence: run the `git switch -c` line and the escaped commit line, and show the push and PR steps to the user (51-04).
- **Commit:** 5be18a0d

**2. [Plan] The proposal's objective-50 open item was updated, not left stale.** The item said 0010 and check 20 print a refused commit. That was fixed by 51-04, so the item now names only the remaining upgrade-project.js refusal.

### Documented, not changed (handed to 51-10)

The USER-GUIDE now documents each of these. The objective-26 kill is recorded in the CHANGELOG and the proposal.
- doctor check 24's "nothing to untrack: GitHub backfill in progress" wording during a drain; a later change could branch on `det.deferred`.
- 0011's permanent W040 / check-21 warning for GitHub-enabled projects that never want the store; there is no opt-out key.
- The global-claude-md `template_version` was not bumped, so existing installs do not get the new routing line until the next bump.
- `--only X --confirm` runs every applicable confirm migration. A halted journal therefore fails on 0010 first, and 0010's message names planning import / outbox flush rather than `gh outbox resolve`.
- A multi-line `decision answer` loses its rationale (51-01). This is a deferred bug.
- `gh pull --all` lists objective 1's OBJECTIVE.md as an orphan after an import (51-07). This is a known issue.

## Deferred Issues

- A multi-line `decision answer` does not round-trip (decision-queue `spliceFrontmatter` / line-based `extractFrontmatter`). A red test is needed first.
- An opt-out for projects that keep GitHub in mirror mode (0011 stays pending, W040).
- Bumping the global-claude-md template version (global-upgrade test 13 pins "version 2").
- The first real-repository backfill, as a manual UAT step against a throwaway repository.

## Post-TRD Verification

- Auto-fix cycles used: 0 (no verify failed)
- Must-haves verified: 6/6
  - CLAUDE.md: the GitHub bullet is replaced, the Planning verbs bullet is trimmed, the Upgrade bullet has 0011, and the file is 26,186 bytes (4,683 below 30,869)
  - USER-GUIDE leads with store mode and Migrating, mirror mode is demoted, and no text calls GitHub derivative
  - migrations table 0007-0011; troubleshooting; moved detail present; manual UAT note
  - CHANGELOG Added and Changed for objective 51
  - proposal status and refinements, with the decisions table untouched
  - the guard tests are green, and `npm test` fails only on MA-7
- Gate failures: None (MA-7 is environmental and pre-existing)

## Self-Check: PASSED

- FOUND: docs/USER-GUIDE.md, CLAUDE.md, CHANGELOG.md, docs/PROPOSAL-github-system-of-record.md, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/skills/doctor/SKILL.md
- FOUND commits: 6e5cc8f2, 5be18a0d, e70a9990 (`git log b99031a2..HEAD`)
