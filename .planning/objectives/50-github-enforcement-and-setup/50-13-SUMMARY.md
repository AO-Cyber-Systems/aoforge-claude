---
objective: 50-github-enforcement-and-setup
trd: "13"
subsystem: docs
tags: [docs, changelog, user-guide, proposal, full-suite, store-mode]

requires:
  - objective: 50-github-enforcement-and-setup
    provides: "50-01..50-12: commit gate, gh-flush hook, W057-W061 / doctor 25, check runner, gh setup, reusable workflow, e2e and parity"
provides:
  - "CLAUDE.md GitHub-integration bullet documents the commit gate and escape, gh setup, the required checks as commit statuses, the config keys, Check 16 / doctor 25 and the open items; the gh-flush hook bullet states that drift is reported at Stop only"
  - "CHANGELOG [Unreleased]: Added entry for objective 50 and two Changed entries (store-mode commits need a linked branch; required checks are statuses)"
  - "USER-GUIDE: Enforcement and setup subsection, W057-W061 table beside W055, two config rows, migration 0010 commit note"
  - "Proposal status block and Planning refinements (objective 50) plus open items, decisions table untouched"
  - "gh-sync skill lists `gh setup`"
affects: [51 GitHub migration and docs]

key-files:
  modified:
    - CLAUDE.md
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - docs/PROPOSAL-github-system-of-record.md
    - plugins/devflow/skills/gh-sync/SKILL.md

key-decisions:
  - "Documented what shipped, not what was planned: planning-consistency requires a closing reference for the objective issue and every linked TRD (the 50-03 SUMMARY's 'closed' means closed by the PR); drift (W055) is reported at Stop only (50-05); an escape is logged after the commit lands (50-06)"
  - "CLAUDE.md prose avoids backtick spans whose first word looks like a command (`reason`, `prs`, `planning-consistency`, `gh-store-sync`): dispatch-completeness.test.cjs reads them as df-tools command names"
  - "help SKILL.md is a 25-line loader that enumerates no gh verb, so it was not changed; df-tools's own help usage string already lists `gh setup` (50-11)"
  - "gh-sync gains a `setup [--apply]` mode (argument-hint, mode list, fallback sentence) so the skill does not read `setup` as an objective"

requirements-completed: [GEN-01, GEN-02, GEN-03, GEN-04, GEN-05]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: false
  test_pairing: true

duration: ~35min
completed: 2026-10-01
---

# Objective 50: GitHub Enforcement and Setup, TRD 13: Docs and the full suite Summary

**CLAUDE.md, CHANGELOG, USER-GUIDE, the proposal and the gh-sync skill now describe the commit gate, `gh setup`, the two required checks and W057-W061 as shipped, and the full suite is green apart from one environmental failure (MA-7, a real `doctl` on this machine).**

## Accomplishments

- **CLAUDE.md:** the GitHub-integration bullet gained an "Enforcement and setup" run (gate reasons, linked-branch rule, `df/exec-*` inheritance, merge/rebase skip, `DEVFLOW_SKIP_GH_GATE=1` logged as gate `gh`, `gh setup [--apply] [--refresh] [--require-wiki]`, the statuses `devflow/linked-issue` and `devflow/planning-consistency`, `github.app_id` / `github.checks_workflow`, Check 16 / doctor 25 with W057-W061, modules, open items). No new section. The `gh-flush.js` hook bullet now says drift (W055) is reported at Stop only, which is what 50-05 shipped.
- **CHANGELOG:** one Added entry (gate and escape, hook, W057-W061 and doctor 25, `gh setup`, required checks, reusable workflow and caller template, config keys, tests) and two Changed entries (store-mode commits are refused on the default or an unlinked branch, including the follow-up commits printed by migration 0010 / doctor check 20 and the `upgrade-project.js` background commit; required checks are statuses, the App optional).
- **USER-GUIDE:** a new "Enforcement and setup (objective 50)" subsection (why a commit is refused and what to do, the escape and its log, the flush hook, `gh setup` dry-run then apply with what it creates and its degraded cases, committing the written files through a pull request with the bootstrap hazard, the optional App via `DEVFLOW_APP_CLIENT_ID` / `DEVFLOW_APP_PRIVATE_KEY` and `github.app_id`, the two checks and what each verifies, what is not yet verified live); a W057-W061 table beside W055; two config-table rows; a note on migration 0010's refused commit; two sentences that said "the App arrives with objective 50" corrected.
- **Proposal:** status block says objective 50 is implemented; "Planning refinements (objective 50)" lists the decisions of 50-02, 50-03, 50-08, 50-09, 50-10 and 50-11; "Open items" lists the unverified live behaviour, the issue-field option shape, the ops-owned workflow location, the bootstrap hazard and the refused follow-up commits. The locked decisions table is unchanged.
- **gh-sync skill:** `gh setup` added to the argument hint, the mode list, the fallback sentence and the verb examples, with the instruction to show the dry-run before `--apply`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: CLAUDE.md, CHANGELOG, proposal | `node --test .../doc-refs.repo.test.cjs .../hook-inventory.test.cjs .../planning-writes.repo.test.cjs` | 0 (29 pass) | PASS |
| 2: USER-GUIDE, skills | `node --test .../doc-refs.repo.test.cjs .../planning-writes.repo.test.cjs .../df-tools-deprecations.repo.test.cjs` | 0 (28 pass) | PASS |
| 2: full suite | `npm test` | 1 (8266 pass, 1 fail, 32 skipped of 8299) | PASS for objective 50; 1 environmental failure (below) |

## Task Commits

1. **Task 1** - `a36a8190` docs(50-13): document commit gate, gh setup and required checks
2. **Task 1 follow-up** - `be9bd473` docs(50-13): state planning-consistency as the code implements it
3. **Task 2** - `c38a3e65` docs(50-13): user guide for enforcement and setup
4. **Fix** - `84d8dfca` fix(50-13): keep CLAUDE.md prose clear of false command names

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (first run) | `npm test` | 1 | 8265 pass, 2 fail: `dispatch-completeness` test 5 (caused by this TRD's CLAUDE.md text) and MA-7 (environmental) |
| test (after fix) | `npm test` | 1 | 8266 pass, 1 fail (MA-7 only), 32 skipped, 0 cancelled, 8299 tests |
| dispatch-completeness, hook-inventory | `node --test .../dispatch-completeness.test.cjs .../hook-inventory.test.cjs` | 0 | PASS (12) |
| MA-7 with `doctl` off PATH | `env PATH=/usr/bin:/bin node --test --test-name-pattern=MA-7 .../handoff-e2e.test.cjs` | 0 | skipped, "doctl unavailable" |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CLAUDE.md prose made `dispatch-completeness` test 5 fail**
- **Found during:** Task 2 full suite
- **Issue:** the test reads the first word of each backtick span after the first ` — ` of a `- **` bullet as a df-tools command name. My new text had `reason`, `prs`, `planning-consistency` and `gh-store-sync`, none a command.
- **Fix:** `reason: default_branch|...`, `mapping.prs`, `devflow/planning-consistency`, and "id gh-store-sync" without backticks. The guard stays as it is.
- **Files modified:** CLAUDE.md
- **Commit:** `84d8dfca`

**2. [Interpretation] help SKILL.md not changed**
- The TRD lists it "only where verbs are enumerated". `skills/help/SKILL.md` is a 25-line loader and `workflows/help.md` names no gh verb, so there was nothing to add. The df-tools help usage string already lists `gh setup` (50-11).

**3. [Interpretation] gh-sync gained a `setup` mode**
- Beyond listing the verb, `setup [--apply]` is a mode of the skill, so `/devflow:gh-sync setup` is not parsed as an objective named "setup".

**4. [Process] A second proposal commit**
- `be9bd473` corrects a sentence I wrote in Task 1: the 50-03 SUMMARY says planning-consistency requires the issues "closed", but the code (`gh-check.cjs`, `planningConsistency`) requires them to be closed by the PR. The docs state the code's behaviour.

## Pre-existing / environmental failure

**`handoff-e2e.test.cjs` MA-7** ("doctl auth init with unset DIGITALOCEAN_TOKEN"): fails on this machine because a real `doctl` (`/opt/homebrew/bin/doctl`) is installed and returns `{"status":"done","exit_code":0,"stderr":""}`, which the test does not expect. With `doctl` off PATH the test skips itself. Objective 50 did not touch the handoff files (no 50-xx TRD lists them). Not fixed and not masked.

## Open items and follow-ups for the orchestrator (outside this TRD's scope)

- **Printed follow-up commits are refused (50-06).** `migrations/0010-store-gitignore.cjs` (`COMMIT_COMMAND`) and `doctor-checks/20-legacy-runtime-state.cjs` print a `df-tools commit` line that exits 1 (`default_branch`) on a store-mode default branch. Documented in the USER-GUIDE, CHANGELOG and proposal; the printed notes themselves are unchanged (code, outside `files_modified`). `gh setup --apply`'s own notice also tells the user to `df-tools commit` the two written files "on a branch", which the gate refuses on an unlinked branch; the USER-GUIDE says to use the escape or `git commit`.
- **Not verified on live GitHub:** the reusable workflow through `workflow_call` (sparse checkout of `plugins/devflow/devflow/bin`, `create-github-app-token@v3` with `permission-*`, `github.event.repository.name` on `merge_group`), the required-context match, the issue-field option shape `{name, color, priority}`, and that GitHub answers a refused merge queue with a 422 on the ruleset POST/PUT. `gh setup` was never run against a real repository.
- **Central workflow location** is owned by platform/ops (`github.checks_workflow`).
- STATE.md and ROADMAP.md were not edited, as instructed.

## Post-TRD Verification

- Auto-fix cycles used: 1
- Must-haves verified: 6/6 (CLAUDE.md bullet; CHANGELOG entry; USER-GUIDE section; proposal status and refinements; gh-sync lists `gh setup`; SC4 with the one environmental failure documented)
- Gate failures: none caused by objective 50 remain; MA-7 is environmental

## Self-Check: PASSED

- FOUND: CLAUDE.md, CHANGELOG.md, docs/USER-GUIDE.md, docs/PROPOSAL-github-system-of-record.md, plugins/devflow/skills/gh-sync/SKILL.md (all modified)
- FOUND commits on `feat/stack-profile-loader`: `a36a8190`, `be9bd473`, `c38a3e65`, `84d8dfca`
