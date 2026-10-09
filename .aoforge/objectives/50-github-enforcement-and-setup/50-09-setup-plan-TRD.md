---
objective: 50-github-enforcement-and-setup
trd: "09"
type: standard
wave: 2
depends_on: ["50-01", "50-03"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-setup.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup.test.cjs
autonomous: true
requirements: [GEN-04]
must_haves:
  truths:
    - "`planSetup(state)` is pure and returns an ordered action list: repo settings, labels, issue types, issue fields, workflow file, PR template, ruleset, wiki check, merge_group advisories"
    - "The ruleset action's payload targets `~DEFAULT_BRANCH` with deletion, non_fast_forward, pull_request (0 approvals, four booleans), required_status_checks (`devflow/linked-issue`, `devflow/planning-consistency`) and merge_queue (7 parameters, merge_method from `github.pr.merge_method`)"
    - "An existing ruleset that already satisfies (or is stricter than) the desired one yields `exists` and no payload; a weaker one yields `update` with the union"
    - "On a User-owned repo, issue types and fields are `skip` with the degraded reason (labels + body metadata) — never an error"
    - "`renderPlan(actions)` prints every action and, for create/update, the exact JSON payload that would be sent"
    - "`readSetupState(root)` makes only gh reads (zero writes) against the fake"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-setup.cjs
      provides: "desiredRuleset, rulesetSatisfies, planSetup, renderPlan, readSetupState, SETUP_RULESET_NAME"
  key_links:
    - "Contexts from 50-03 CONTEXTS; applied by 50-11 (applySetup + CLI); fake routes from 50-01"
---

# TRD 50-09: `gh setup` plan (GEN-04, read + plan half)

<objective>
Compute, without changing anything, exactly what a repository needs for DevFlow enforcement and how it differs from what it has. The
plan is a pure function over a state snapshot; a reader builds the snapshot with gh reads only; a renderer prints it for the dry-run.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(50-09): ...`), then implementation (`feat(50-09): ...`).
- `planSetup` and `renderPlan` are pure (table tests over hand-built state objects). `readSetupState` uses gh-client reads only and is
  tested against the 50-01 fake (`fake.writes()` must stay empty).
- Reuse, do not re-implement: `gh-capability.detectCapabilities(root, {refresh:true})`, `REQUIRED_TYPES`, `OPTIONAL_TYPES`,
  `REQUIRED_FIELDS`, `ISSUE_FIELDS_PATH`, `describeDegraded`; labels from config `github.labels.*` (defaults in gh-cache `DEFAULT_LABELS` L508).

## Decisions

- **Ruleset** name `devflow: default branch`, `target:'branch'`, `enforcement:'active'` (`evaluate` is Enterprise-only), conditions
  `ref_name.include ['~DEFAULT_BRANCH']`, `bypass_actors: []`. Rules as in the research payload. `required_approving_review_count: 0`
  (Open Question 6: one PR per objective, often a solo developer; a team raises it in GitHub and setup never lowers it).
  `strict_required_status_checks_policy:false`. Merge queue defaults 60 / ALLGREEN / 5 / 5 / method / 1 / 5, method =
  `github.pr.merge_method` upper-cased (default SQUASH).
- **App pinning** (Open Question 4): new config key `github.app_id` (added to the config template in 50-11). When it is a positive
  integer each required check carries `integration_id: app_id`; when unset, no pin and an advisory: "required checks are not pinned to an
  App; anyone with write access can post these contexts".
- **Superset idempotency**: `rulesetSatisfies(existing, desired)` is true when every desired rule type is present, approvals >= desired,
  each required context is present (extra contexts/rules allowed), and the include list contains `~DEFAULT_BRANCH`. `update` PUTs the
  UNION (existing rules kept, missing ones added), never removing a user's stricter settings.
- **Merge queue unavailable**: when the state's setup record says the plan rejected `merge_queue` (written by 50-11 after a 422), the
  desired ruleset omits it and an advisory says so (`--refresh` clears the record); this keeps a second apply write-free.
- **Issue types** (Organization only): create each missing of REQUIRED_TYPES + OPTIONAL_TYPES (colors purple, blue, yellow, red, gray),
  `update` to enable a disabled one. **Issue fields** (Open Question 3): create missing `work` / `kind` as `single_select` with inline
  `options` (work: feature, port, refactor, foundation, bugfix, prototype, spike; kind: api, app, library, ui-lib, cli, plugin) and the
  `X-GitHub-Api-Version: 2026-03-10` header. The fallback (on 422 retry as `text`) is an apply concern (50-11); an existing field of any
  type is `exists` (never retyped).
- **Repo settings**: `PATCH repos/o/r` with only the keys that differ among `{has_wiki:true, delete_branch_on_merge:true}`.
- **Local files**: workflow `.github/workflows/devflow.yml` — create when absent; `exists` when byte-equal to the rendered template;
  `update` when it carries the `# devflow:managed` header; otherwise `conflict` (reported, never overwritten). PR template
  `.github/pull_request_template.md` — create when absent; when present, manage only the `<!-- devflow:pr-template:start/end -->`
  block (append the block if missing, replace it if drifted, `exists` if equal). Template text is an INPUT to `planSetup`
  (`state.templates`), rendered by 50-11.
- **Wiki**: from capability `pages` state — `ok` → exists; `uninitialised` → `manual` "create the first wiki page in the web UI"; `disabled`
  → covered by the has_wiki setting; `unavailable` → skip with degraded note (`docs/devflow/` is used).
- **merge_group advisory**: any other `.github/workflows/*.yml` whose text names `devflow/linked-issue` or `devflow/planning-consistency`
  but has no `merge_group` → `advisory` naming the file (never rewritten).
- Action object: `{kind, target, status: create|update|exists|skip|manual|conflict|advisory, desc, payload?, request?}` where `request`
  is the gh argv + input the apply step will send (so the dry-run prints exactly what apply sends).

## Test list

1. `desiredRuleset({mergeMethod:'squash'})` deep-equals the research payload; with `appId: 42` each check has `integration_id: 42`;
   with `mergeQueue:false` there is no merge_queue rule.
2. `rulesetSatisfies`: identical → true; existing approvals 2 → true; missing `non_fast_forward` → false; extra user rule → true.
3. planSetup, empty Organization repo → create actions in the documented order; ruleset `request` is
   `['api','-X','POST','repos/o/r/rulesets','--input','-']` with the payload.
4. planSetup, everything present and satisfied → every action `exists` (or advisory), no `request` anywhere.
5. Existing weaker ruleset → `update` with PUT to `rulesets/<id>` and a union payload that keeps the user's extra rule.
6. User-owned repo → types and fields `skip` with `describeDegraded` text; labels still created.
7. Disabled `Decision` type → `update` enabling it; missing `kind` field → create with options + api-version header in `request`.
8. Workflow file present without the managed header and different → `conflict`; PR template without the block → `update` appending it.
9. Wiki `uninitialised` → `manual`; another workflow naming `devflow/linked-issue` without `merge_group` → `advisory`.
10. `renderPlan` output contains each action line and the pretty JSON payload for create/update actions.
11. `readSetupState(root)` against the fake: returns repo meta, rulesets (full body for ours), labels, types, fields, wiki state, local
    files; `fake.writes()` is empty.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: ruleset model (tests 1-2)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-setup.cjs, plugins/devflow/devflow/bin/lib/gh-setup.test.cjs</files>
  <action>
RED: tests 1-2; commit `test(50-09): setup ruleset model`.
GREEN: `SETUP_RULESET_NAME`, `desiredRuleset({mergeMethod, appId, mergeQueue})` using `gh-check.CONTEXTS`, `rulesetSatisfies`,
`unionRuleset(existing, desired)`. Commit `feat(50-09): desired default-branch ruleset and satisfaction check`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-setup.test.cjs</verify>
  <done>Tests 1-2 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: planSetup and renderPlan (tests 3-10)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-setup.cjs, plugins/devflow/devflow/bin/lib/gh-setup.test.cjs</files>
  <action>
RED: tests 3-10 over hand-built state objects (write one `baseState()` builder in the test file and override per case); commit
`test(50-09): setup plan and dry-run rendering`.
GREEN: `planSetup(state)` and `renderPlan(actions)` per Decisions. Commit `feat(50-09): plan repository setup as an action list`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-setup.test.cjs</verify>
  <done>Tests 3-10 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: readSetupState against the fake (test 11)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-setup.cjs, plugins/devflow/devflow/bin/lib/gh-setup.test.cjs</files>
  <action>
RED: test 11 (temp project with `github.enabled:true, repo:'o/r'`, `DEVFLOW_GH_CACHE_DIR` temp, fake installed); commit
`test(50-09): setup state reader`.
GREEN: `readSetupState(root, {refresh})` — reads `repos/o/r`, `repos/o/r/rulesets` (+ GET by id for `SETUP_RULESET_NAME`),
`repos/o/r/labels`, org types/fields when Organization, `detectCapabilities(root, {refresh:true})`, local files, the setup record
(`<DEVFLOW_GH_CACHE_DIR>/setup/<owner>__<repo>.json`, absent → `{}`), and config. Commit `feat(50-09): read repository setup state`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-setup.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</verify>
  <done>Test 11 passes with zero fake writes; seam test green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-capability.cjs` constants L30-41, `detectCapabilities` L391, `describeDegraded` L535, `cachePath` L213 (cache dir convention).
- `gh-outbox-flush.cjs` `ensureLabel` L407 (label create argv and color).
- `gh-cache.cjs` `DEFAULT_LABELS` L508.
- Research payload (50-RESEARCH.md "Code Examples") is the expected desiredRuleset output.
</codebase_examples>
<anti_patterns>
- Any write in this TRD (apply is 50-11).
- Lowering approvals or removing user rules/contexts on update.
- Ruleset `evaluate`, branch-name or commit-message pattern rules (Enterprise-only).
</anti_patterns>
<error_recovery>
- If the TRD runs long, task 3 can land as a follow-up commit in 50-11; record it in the SUMMARY.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-setup.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-capability.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</regression>
</validation_gates>

<verification>
- SC2 (dry-run half): renderPlan prints the exact ruleset, types and fields payloads.
</verification>

<success_criteria>
A complete, idempotent, degradation-aware setup plan exists as data before anything is applied.
</success_criteria>

<output>
After completion, create `.planning/objectives/50-github-enforcement-and-setup/50-09-SUMMARY.md`
</output>
