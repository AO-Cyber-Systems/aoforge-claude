---
objective: 55-store-live-smoke-fixes
trd: "01"
subsystem: gh-setup
tags: [github, rulesets, bypass-actors, gh-setup, workflow-pin, gh-fake]

requires:
  - objective: 50-github-enforcement
    provides: gh setup planner/applier, the fake GitHub, the managed caller workflow template
provides:
  - "gh setup ruleset grants the repository-admin role a bypass (RepositoryRole 5, always), so the workflow pull request is mergeable"
  - "rulesetSatisfies requires an admin bypass in any mode; unionRuleset appends it once and never changes the user's actors or modes"
  - "Printed guidance names gh pr merge <number> --admin --<method>, method from github.pr.merge_method"
  - "renderTemplates pins devflow-ref to the @ref of a configured github.checks_workflow"
  - "gh-fake reports a computed current_user_can_bypass on ruleset GET/POST/PUT"
affects: [55-06 live setup re-run, 55-08 docs and changelog]

tech-stack:
  added: []
  patterns:
    - "Frozen module constant plus small pure predicate (ADMIN_BYPASS / isAdminBypass); clone on every use"
    - "Fixture computes a per-viewer field on read, never stores it"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/gh-setup.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup-apply.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-fake.test.cjs

key-decisions:
  - "bypass_mode is always: the mode verified live (ruleset 24476250, with a merge_queue rule). pull_request might suffice but is unverified against merge_queue. Setup compares the actor, never the mode, so a team may tighten it in GitHub and setup leaves it alone."
  - "The merge method in the guidance is read from github.pr.merge_method by an exact match on merge|squash|rebase (as gh-pr.cjs does), squash otherwise; no case folding."
  - "devflow_ref comes from the text after the LAST @ of checks_workflow; a missing, leading or empty @ pins nothing."

patterns-established:
  - "A required DevFlow entry inside a user-owned list: satisfies checks presence, union appends once, neither compares the user-tunable field"

requirements-completed: ["55-1", "55-4"]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

started: 2026-10-05T11:56:00Z
completed: 2026-10-05T12:05:00Z
duration: 9min
---

# Objective 55 TRD 01: setup ruleset bypass and pin Summary

**`gh setup` now creates the default-branch ruleset with a repository-admin bypass (RepositoryRole 5, `always`) so its own workflow pull request can merge, prints the runnable `gh pr merge <number> --admin --<method>` step, and pins the caller's `devflow-ref` to the `@ref` of a configured `checks_workflow`.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-05T11:56:00Z
- **Completed:** 2026-10-05T12:05:00Z
- **Tasks:** 2 of 2
- **Files modified:** 7 (3 source or fixture, 4 test)

## Progress
- [x] Task 1: Admin bypass in the desired ruleset, satisfies and union; fake reports current_user_can_bypass — RED f88e283b, GREEN eb808dd3
- [x] Task 2: Printed guidance names the admin-bypass merge; devflow-ref follows a pinned checks_workflow — RED dcbd1bb3, GREEN fab671d8

## Accomplishments

- **55-1.** `desiredRuleset()` returns `bypass_actors: [{actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always'}]` (a fresh clone each call). On the fake, a fresh `--apply` now yields `current_user_can_bypass: always` for an admin token; it was `never` before the fix (RED evidence below).
- **Superset idempotency kept.** `rulesetSatisfies` requires an admin entry in any `bypass_mode`, so a team's `pull_request` is `exists` and a second apply makes zero writes. `unionRuleset` copies the user's actors in order and appends the admin entry only when none is listed; the PUT body never carries `current_user_can_bypass`.
- **Guidance.** The apply output no longer says an admin "may need to bypass"; it names the repository-admin bypass and `gh pr merge <number> --admin --<method>`.
- **55-4 (caller half).** `renderTemplates` derives `devflow_ref` from the `@<ref>` of `github.checks_workflow` (branch, tag or 40-hex SHA); unset, empty, or no `@` stays `v<plugin version>`. Test 13 confirms an existing repository picks up a fixed workflow by re-running `gh setup --apply`, which plans the managed `devflow.yml` as `update`.

### Exact guidance text (TRD 55-06 verifies it live)

Printed after the commit steps, when files were written and the ruleset outcome is created, updated or exists:

```
The ruleset requires devflow/linked-issue and devflow/planning-consistency, and those checks exist only once the workflow is on the default branch.
Merge the workflow pull request first. Its required checks cannot pass until the workflow is on the default branch, so merge it with the repository-admin bypass the ruleset grants: gh pr merge <number> --admin --squash (or "Merge without waiting for requirements to be met" in the web UI). Every later pull request goes through the checks and the merge queue.
```

`--squash` follows `github.pr.merge_method` (`--merge` or `--rebase` when set; anything else prints `--squash`).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Admin bypass in ruleset, satisfies, union; fake field | `node --test gh-setup.test.cjs gh-setup-apply.test.cjs gh-setup-cli.test.cjs` | 0 (131 pass, 0 fail) | PASS |
| 2: Guidance and devflow-ref pin | `node --test gh-setup.test.cjs gh-setup-cli.test.cjs gh-setup-apply.test.cjs devflow-workflows.repo.test.cjs` | 0 (156 pass, 0 fail) | PASS |

Related files run after the change (all under `plugins/devflow/devflow/bin/lib/`): `gh-fake.test.cjs`, `gh-enforcement.e2e.test.cjs`, `gh-seam.repo.test.cjs`, `commit-steps.test.cjs` — 119 pass, 0 fail. `rg -n "may need to bypass" gh-setup-cli.cjs` finds nothing.

## Task Commits

1. **Task 1 RED** - `f88e283b` (test) ruleset grants a repository-admin bypass
2. **Task 1 GREEN** - `eb808dd3` (fix) gh setup ruleset grants repository admins a bypass
3. **Task 2 RED** - `dcbd1bb3` (test) guidance names the admin bypass; devflow-ref follows checks_workflow
4. **Task 2 GREEN** - `fab671d8` (fix) setup guidance and caller ref pinning

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test gh-setup-apply.test.cjs` | 1 | FAIL (correct): `55-01 test 1` failed with `'never' !== 'always'`; `test 3` with `'exists' !== 'update'`; `gh-setup.test.cjs` failed on `bypass_actors: []` vs the admin entry |
| GREEN (Task 1) | `node --test gh-setup.test.cjs gh-setup-apply.test.cjs gh-setup-cli.test.cjs` | 0 | PASS (correct), 131 tests |
| RED (Task 2) | `node --test gh-setup-cli.test.cjs`, `node --test gh-setup.test.cjs` | 1 | FAIL (correct): CLI output still said "an admin may need to bypass" (tests 5, 5b, 6, 6b); `devflow-ref` stayed `v2.13.1` for `@feat/x` and a SHA (tests 10, 11, 12c) |
| GREEN (Task 2) | `node --test gh-setup.test.cjs gh-setup-cli.test.cjs gh-setup-apply.test.cjs devflow-workflows.repo.test.cjs` | 0 | PASS (correct), 156 tests |

Tests 2, 4, 6c, 12, 12b and 13 are regression guards that passed in RED by design (idempotency, the user's mode untouched, no guidance on a no-op run, the unpinned fallbacks, and the refresh-as-update path). Test 13 did not trigger the TRD's stop condition: the stale managed workflow is planned as `update`.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, task gate) | `node --test {files}` per task, see Task Evidence | 0 | PASS |
| test (objective gate) | `npm test` | not run | not_available: the dispatch forbids a full `npm test` in this wave; the targeted files above were run instead |

## Decisions Made

- `bypass_mode: 'always'` (flagged as the TRD requires). It is the mode verified live; `pull_request` is unverified against a ruleset with a `merge_queue` rule. Setup never rewrites a team's chosen mode.
- The admin entry is matched by `actor_type === 'RepositoryRole'` and `Number(actor_id) === 5`, so a numeric-string id from an API still counts and a `Team` with id 5 does not.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated one existing fixture test that pinned the old GET body**
- **Found during:** Task 1 (RED)
- **Issue:** `gh-fake.test.cjs` test "50-01 setup routes 1" deep-equals `GET rulesets/9001` against the stored body. The fake now answers the computed `current_user_can_bypass` on every full-object response, which the TRD requires, so that assertion could not stay as it was.
- **Fix:** Expect `current_user_can_bypass: 'never'` (no admin entry listed) and added an assertion that the computed field is never stored in `fake.rulesets`. `gh-fake.test.cjs` is not in the TRD's `files_modified`; the change is two lines and belongs to the fixture this TRD owns.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-fake.test.cjs`
- **Commit:** f88e283b

### Process note (not a code deviation)

My first `exec-context check` ran from the shell's default directory (the main checkout) instead of the worktree. It passed vacuously and registered a claim for 55-01 on the main checkout. I caught it from the reported `checkout`/`branch`, re-ran the check with `--cwd` against the worktree (it passed: `checkout` is the worktree, branch `df/exec-55-01`, base visible), and released only the stray claim (`exec-context release --repo <main> --id 55-01`, scoped to the main checkout and that id). No file was written in the main checkout; the worktree claim stands.

## Follow-ups for other TRDs

- `docs/USER-GUIDE.md:981` still says "an administrator may need to bypass the ruleset once for that pull request". It is outside this TRD's files; TRD 55-08 (docs and changelog) should update it to the admin-bypass merge step, and document that an existing repository picks up a fixed workflow by re-running `gh setup --apply` and merging the workflow pull request (test 13 pins this).
- TRD 55-06 (live re-run): pin the smoke repo with `github.checks_workflow: AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@<head sha>`; `devflow-ref` now follows it. An existing ruleset without an admin bypass (such as the smoke repo's, before the hand fix) is planned as `update` and gains the entry.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (fresh apply `always`; update appends once keeping the user's actors; `pull_request` mode is `exists` with zero writes on a second apply; guidance names the admin merge command with the configured method; `devflow-ref` follows a pinned `checks_workflow`)
- Gate failures: None

## Self-Check: PASSED

- Commits found: f88e283b, eb808dd3, dcbd1bb3, fab671d8 (`git log 007891c6..HEAD`).
- Files found: all 7 modified files appear in `git diff --stat 007891c6..HEAD`.
- Targeted tests: 156/156 (TRD files) and 119/119 (related files) pass.
