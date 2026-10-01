---
objective: 50-github-enforcement-and-setup
trd: "09"
subsystem: github-enforcement
tags: [github, gh-setup, rulesets, merge-queue, issue-types, issue-fields, dry-run, idempotency, node-test]

requires:
  - objective: 50-01
    provides: "gh-fake routes for rulesets, repo PATCH, labels, org issue-types / issue-fields (and their 403 / 422 / 400 refusals)"
  - objective: 50-03
    provides: "gh-check CONTEXTS (devflow/linked-issue, devflow/planning-consistency)"
provides:
  - "lib/gh-setup.cjs: SETUP_RULESET_NAME, WORKFLOW_PATH, PR_TEMPLATE_PATH, desiredRuleset, rulesetSatisfies, unionRuleset, planSetup, renderPlan, setupRecordPath, readSetupState"
  - "A pure, idempotent, degradation-aware setup plan as data: an ordered action list whose `request` is exactly the gh argv and stdin the apply step sends"
affects: [50-11 setup-apply, 50-12 e2e, 50-10 templates]

tech-stack:
  added: []
  patterns:
    - "Plan as data: planSetup(state) is pure, readSetupState is the only impure edge (gh reads, local files), renderPlan prints exactly what apply will send"
    - "Superset idempotency: a ruleset that already does everything (or more) is `exists`; a weaker one is PUT the UNION, never a removal"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-setup.cjs
    - plugins/devflow/devflow/bin/lib/gh-setup.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs

key-decisions:
  - "rulesetSatisfies also requires `enforcement: 'active'` and target `branch` (beyond the TRD's four conditions): a disabled or `evaluate` ruleset enforces nothing, so it is weaker, and the union turns enforcement on"
  - "A pinned required check (github.app_id) is part of satisfaction only when the DESIRED ruleset pins; an existing pin to a different App is replaced by the configured one (the config is explicit), an unpinned config never strips a user's pin"
  - "A ruleset we found but could not read the rules of (GET by id failed) is `skip`, never overwritten; an unreadable rulesets list is `skip` with the HTTP status"
  - "Repo settings read `create` when neither setting is on yet and `update` when one already is; only the keys that differ are PATCHed"
  - "Labels are the DEFAULT_LABELS roles (objective, trd, decision, todo, debug, quick) plus any other label configured under github.labels (in_progress, gaps); config overrides win, an empty string falls back to the default"
  - "request.input is the exact compact JSON text for `--input -`; payload is the same data as an object for the dry-run; local files carry `file: {path, content}` instead of a request"

patterns-established:
  - "State snapshot keys (readSetupState -> planSetup): repo, owner, name, ownerType, meta{has_wiki, delete_branch_on_merge, default_branch, private}, github (the config github block), capabilities, rulesets|null, labels|null, types|null, fields|null, wiki, wikiDetail, local{workflow, prTemplate, otherWorkflows[{file,text}]}, record, readErrors{}; `templates{workflow, prTemplate}` is supplied by the caller"

requirements-completed: [GEN-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 55min
completed: 2026-10-01
---

# Objective 50 TRD 09: `gh setup` plan (read + plan half) Summary

**A repository's DevFlow enforcement setup is now computed as data before anything is applied: `readSetupState` snapshots it with gh reads only, `planSetup` turns the snapshot into an ordered, idempotent, degradation-aware action list (default-branch ruleset with merge queue, labels, issue types and fields, settings, workflow and PR template, wiki), and `renderPlan` prints the exact payloads for the dry-run.**

## Performance

- **Duration:** about 55 min
- **Tasks:** 3 of 3 (all TDD; 6 task commits plus 1 guard-registration commit)
- **Files:** 3 (2 created, 1 modified)

## Accomplishments

- `desiredRuleset({mergeMethod, appId, mergeQueue})` deep-equals the 50-RESEARCH payload: `devflow: default branch`, `active`, `~DEFAULT_BRANCH`, no bypass actors, deletion, non_fast_forward, pull_request (0 approvals, four booleans), required_status_checks (the two 50-03 CONTEXTS, `integration_id` when `github.app_id` is a positive integer), merge_queue (60 / ALLGREEN / 5 / 5 / METHOD / 1 / 5, method = `github.pr.merge_method` upper-cased, SQUASH when unknown). No Enterprise-only rule appears.
- `rulesetSatisfies` / `unionRuleset` give superset idempotency: extra rules, extra contexts, stricter approvals, tuned queue numbers and bypass actors never count against an existing ruleset, and an update PUTs the union (existing rules, order, strict policy and bypass actors kept; approvals only rise; missing rules appended in the desired order; `~DEFAULT_BRANCH` added; enforcement turned on).
- `planSetup(state)` is pure (proved on a deep-frozen state) and returns, in order: repo settings, labels, issue types (Objective, TRD, Decision, Debug, Quick; purple, blue, yellow, red, gray), issue fields (`work`, `kind` as `single_select` with inline options and the `X-GitHub-Api-Version: 2026-03-10` header in `request.args`), the workflow file, the PR template, the ruleset (plus its advisories), the wiki check, then one advisory per other workflow that names a required check without `merge_group`.
- Degradation never errors: a User owner, or an organization whose types / fields / rulesets endpoint did not answer, becomes a `skip` carrying the gh-capability degraded sentence (types / fields) or the HTTP status (rulesets). A recorded merge-queue rejection (`record.merge_queue === false`) drops the rule and adds an advisory, so a second apply is write-free.
- Local files: workflow `exists` when byte-equal, `update` when it carries `# devflow:managed` in its first lines, otherwise `conflict` (never overwritten); the PR template manages only the `<!-- devflow:pr-template:start/end -->` block (appended when missing, replaced in place when drifted, `exists` when equal).
- `renderPlan` prints `[status] kind target - desc` for every action and, under each create or update, the pasteable `gh ...` command, the pretty JSON payload and `write <path> (N lines)` for a file, then a status count line.
- `readSetupState(root, {refresh})` uses `ghRead` / `ghPaginate` only and reads local files with `fs`: zero fake writes in every test. It reads `repos/o/r`, rulesets (our own by id for the full body), labels, org types and fields (Organization owners only), a live `detectCapabilities(root, {refresh:true})`, the local workflow files, the setup record at `<DEVFLOW_GH_CACHE_DIR>/setup/<owner>__<repo>.json` and the github config. A failed read is a `null` plus a `readErrors` reason, never a failure; only an unreadable repository fails.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: ruleset model (tests 1-2) | `node --test .../bin/lib/gh-setup.test.cjs` | 0 (23 pass) | PASS |
| 2: planSetup and renderPlan (tests 3-10) | `node --test .../bin/lib/gh-setup.test.cjs` | 0 (67 pass) | PASS |
| 3: readSetupState against the fake (test 11) | `node --test .../bin/lib/gh-setup.test.cjs .../bin/lib/gh-seam.repo.test.cjs` | 0 (79 + 9 pass) | PASS |

All paths were run as absolute paths into the worktree `/Users/justin/dev/.df-worktrees/devflow-claude/50-09`.

## Task Commits

1. **Task 1: ruleset model** - `deb0ccc7` (test, RED), `067b52f9` (feat, GREEN)
2. **Task 2: planSetup and renderPlan** - `03eb5ace` (test, RED), `1a59bae6` (feat, GREEN)
3. **Task 3: readSetupState** - `5f786d7d` (test, RED), `4a461676` (feat, GREEN)
4. **Seam guard registration** - `d6659809` (chore; see deviation 1)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test .../bin/lib/gh-setup.test.cjs` | 0 | PASS (79 tests) |
| regression | `node --test .../bin/lib/gh-capability.test.cjs .../bin/lib/gh-seam.repo.test.cjs` | 0 | PASS (78 + 9 tests; 166 with gh-setup in one run) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test .../gh-setup.test.cjs` | 1 | FAIL (correct): `Cannot find module './gh-setup.cjs'` |
| GREEN (Task 1) | `node --test .../gh-setup.test.cjs` | 0 | PASS (correct): 23 of 23 |
| RED (Task 2) | `node --test .../gh-setup.test.cjs` | 1 | FAIL (correct): the 23 Task 1 tests passed, every planSetup / renderPlan test failed with `setup.planSetup is not a function` |
| GREEN (Task 2) | `node --test .../gh-setup.test.cjs` and the seam + capability suites | 0 | PASS (correct): 67 of 67, then 87 of 87 |
| RED (Task 3) | `node --test --test-name-pattern readSetupState .../gh-setup.test.cjs` | 1 | FAIL (correct): 12 of 12 failed, `setup.readSetupState is not a function` |
| GREEN (Task 3) | `node --test .../gh-setup.test.cjs .../gh-seam.repo.test.cjs .../gh-capability.test.cjs` | 0 | PASS (correct): 166 of 166 (one failure on the first GREEN run was a test bug, deviation 2) |

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (the Task 3 test bug, deviation 2)
- **Must-haves verified:** 6/6 (pure ordered plan; ruleset payload shape asserted in this TRD's own tests because the 50-01 fake does not validate rule `parameters`; exists-vs-update on superset / weaker; User-owner skip with the degraded reason; renderPlan prints the payloads; `readSetupState` makes zero writes)
- **Gate failures:** None

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/gh-setup.cjs` - the module described above (about 690 lines; `readSetupState` and `setupRecordPath` are the only impure functions)
- `plugins/devflow/devflow/bin/lib/gh-setup.test.cjs` - 79 tests (about 1,016 lines): ruleset model (23), plan and render (44), reader (12)
- `plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` - `gh-setup.cjs` added to `GUARDED`

## Decisions Made

See key-decisions. Open Question 6 (approvals) is settled at 0, as the TRD decided; Open Question 4 is `github.app_id` (the config template key is added by 50-11). Open Question 3 (the issue-field option shape) is still unverified against the live API: options are sent as `{name, color:'gray', priority}` and 50-11's text fallback on a 422 covers a wrong guess.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registered gh-setup.cjs in the gh seam guard**
- **Found during:** Task 1 GREEN
- **Issue:** `gh-seam.repo.test.cjs` test 23 fails for any `gh-*.cjs` module that is not in `GUARDED`.
- **Fix:** Added `'gh-setup.cjs'` to `GUARDED` only, in its own commit (`d6659809`), with a comment. It is deliberately NOT in `NO_DIRECT_WRITE`: 50-11 puts `applySetup` in this module and it writes through `gh-client.ghWrite`, like `gh-milestone-store.cjs`. This module itself makes no write call.
- **Files modified:** `plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs`
- **Commit:** `d6659809`

**2. [Rule 1 - Bug, in the test] A one-shot `failNext` was consumed by the capability probe**
- **Found during:** Task 3 GREEN (first run, 78 of 79)
- **Issue:** the "types cannot be read" test used `fake.failNext` on `orgs/o/issue-types`, but `detectCapabilities` reads that endpoint first and consumed the failure, so `readSetupState`'s own read succeeded.
- **Fix:** replaced it with a standing failure wrapping `fake.runGh`. The implementation was correct; the fix is in the same commit as the GREEN code (`4a461676`).

### Additions beyond the TRD (all inside the two owned files)

- `rulesetSatisfies` requires `enforcement: 'active'` and target `branch` (a disabled or `evaluate` ruleset is weaker); the union sets enforcement `active`.
- The repo-settings action reports `create` when both settings are missing and `update` when one is already on.
- Extra labels configured under `github.labels` (for example `in_progress`, `gaps`) are ensured as well as the six role labels.
- `setupRecordPath` is exported so 50-11 writes the record where this module reads it.

**Total deviations:** 2 (one repo-guard registration, one test bug), plus the additions above.
**Impact on plan:** none on the deliverable.

## Issues Encountered

None beyond the deviations.

## Notes for downstream TRDs (50-11 apply, 50-10 templates, 50-12 e2e)

- **Action contract:** `{kind, target, status, desc, payload?, request?, file?}`. Kinds: `repo-settings`, `label`, `issue-type`, `issue-field`, `workflow`, `pr-template`, `ruleset`, `wiki`, `advisory`. `request` is `{args, input?}`: `args` is the gh argv (`['api','-X','POST',endpoint,('-H',header)?,'--input','-']`, or `['label','create',...]` with no input) and `input` is the exact compact JSON text for `opts.input`. `payload` is the same data as an object. A local-file action has `file: {path, content}` and no `request`. Only `create` and `update` carry a request / payload / file. `conflict`, `skip`, `manual`, `advisory` and `exists` never do.
- **Grouped skips:** types and fields are one action each (`target: 'all'`) when skipped, one per name otherwise.
- **Templates are a planSetup input:** pass `{...state, templates: {workflow, prTemplate}}`. `prTemplate` may or may not include the start / end markers; `planSetup` extracts or adds them. `planSetup` throws a `TypeError` without `templates`.
- **Setup record:** `readSetupState` reads `setupRecordPath(repo)` (`{merge_queue:false}` omits the merge_queue rule and adds an advisory naming `--refresh`); `{refresh:true}` ignores it. Deleting the file on `--refresh` and writing it after a merge_queue 422 is 50-11's.
- **`github.app_id`** (number or numeric string; the template default `""` pins nothing) and **`github.pr.merge_method`** are read from `state.github`.
- **Bootstrapping hazard for 50-11 to print:** the ruleset requires `devflow/linked-issue` and `devflow/planning-consistency`, which only exist once the workflow is on the default branch. Applying the ruleset first blocks the very PR that adds the workflow (`bypass_actors` is empty). The apply summary should say to merge the workflow before or tell the admin to bypass once.
- **Fake limits (from 50-01):** rule `parameters` are not validated by the fake; this TRD's tests assert the payload shape. The issue-field option shape and the required-context naming through a reusable workflow are unverified against live GitHub.

## User Setup Required

None.

## Self-Check: PASSED

- Files exist and carry the work: `plugins/devflow/devflow/bin/lib/gh-setup.cjs`, `plugins/devflow/devflow/bin/lib/gh-setup.test.cjs`, `plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` (the tests ran against them).
- Commits exist on `df/exec-50-09` (`git log --oneline c178a723..HEAD`): `deb0ccc7`, `067b52f9`, `d6659809`, `03eb5ace`, `1a59bae6`, `5f786d7d`, `4a461676`.
