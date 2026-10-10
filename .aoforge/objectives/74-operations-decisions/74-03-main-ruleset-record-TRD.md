---
objective: 74-operations-decisions
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - scripts/__fixtures__/ruleset-fixtures.cjs
  - .github/rulesets/main.json
  - scripts/ruleset-check.cjs
  - scripts/ruleset-check.test.cjs
autonomous: true
requirements: [OPS-02]
must_haves:
  truths:
    - "`.github/rulesets/main.json` is the exact ruleset text the user will be asked to approve: name `aoforge: default branch`, branch target `~DEFAULT_BRANCH`, active, rules deletion + non_fast_forward + pull_request (0 approvals) + required_status_checks [`test (npm test, gated)` pinned to integration_id 15368], and one bypass actor (repository admin, bypass_mode pull_request) so nobody can force-push"
    - "`node scripts/ruleset-check.cjs checks --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json --prs <N,...>` exits 0 only when every required context was reported, by the pinned app, on every sampled pull request into main"
    - "`node scripts/ruleset-check.cjs compare --repo ... --file ...` reads the applied ruleset back by name and exits 0 only when it matches the file (server metadata and server-added defaults reported, not counted)"
    - "Before any approval the live read-only inventory is recorded: rulesets on the repo (only the org 'Private Repos' one), no classic protection on main, and the checks reported on the three most recent pull requests into main"
  artifacts:
    - path: .github/rulesets/main.json
      provides: "The approvable ruleset text"
    - path: scripts/ruleset-check.cjs
      provides: "compareRuleset, missingContexts (pure) + compare/checks CLI with an injected gh runner"
      exports: ["compareRuleset", "missingContexts", "main"]
    - path: scripts/ruleset-check.test.cjs
      provides: "Test list cases 1-11, no network"
  key_links:
    - from: .github/rulesets/main.json
      to: plugins/aoforge/aoforge/bin/lib/gh-setup.cjs
      via: "name equals SETUP_RULESET_NAME, bypass actor is ADMIN_BYPASS's role (a later `gh setup --apply` unions into it instead of adding a second ruleset)"
      pattern: "aoforge: default branch"
    - from: scripts/ruleset-check.cjs
      to: "GitHub REST rulesets + check-runs"
      via: "gh api repos/<repo>/rulesets, repos/<repo>/rulesets/<id>, repos/<repo>/commits/<sha>/check-runs"
      pattern: "rulesets"
---

# TRD 74-03: The `main` ruleset as a reviewable file, and the tool that proves it matches

<objective>
OPS-02 needs branch protection on `main`, applied only after the user approves the exact ruleset text. Success
criterion 2 also needs `gh` to read the ruleset back and match what was approved. This TRD writes that text as a file,
checks against live read-only GitHub data that every required check really reports on pull requests into `main`, and
builds the comparison the read-back uses. Nothing is applied here (TRD 74-07 does that, behind its own approval).

Purpose: OPS-02 (artifact and verification tool).
Output: `.github/rulesets/main.json`, `scripts/ruleset-check.cjs` (+ tests, fixtures), and a recorded inventory.
</objective>

<file_tree>
.github/rulesets/
└── main.json                        ← CREATE
scripts/
├── ruleset-check.cjs                ← CREATE
├── ruleset-check.test.cjs           ← CREATE
└── __fixtures__/
    └── ruleset-fixtures.cjs         ← CREATE
</file_tree>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Resolved intent: kind plugin, work feature, tdd strict, test_list_first required, fixture_strategy generators.
Constraints: no_llm_test_data, no_property_based_default, no_gherkin_layer. One failing test at a time.

Hard rules: read-only GitHub calls only (`gh api` GET, `gh pr view`, `gh pr list`). No POST/PUT/DELETE, no ruleset
created. These files stay on this branch and reach `main` with the next release PR; they are NOT cherry-picked by
TRD 74-04.

Facts read during planning (2026-10-10, `gh` as a repository admin):
- `gh api repos/AO-Cyber-Systems/aoforge-claude/branches/main/protection` → 404 "Branch not protected".
- `gh api repos/AO-Cyber-Systems/aoforge-claude/rulesets` → only id 11490149 "Private Repos" (source_type
  Organization, target repository: visibility/delete/transfer rules, no branch rules).
- Check runs, all from app id 15368 (github-actions): PR #128 and #127 reported `harness`, `build`, `test (npm test, gated)`,
  `Analyze (actions)`, `Analyze (javascript-typescript)`, `Analyze (ruby)`, plus a `CodeQL` run. PR #129 (no site or
  agent paths) reported only `test (npm test, gated)` and the CodeQL ones. So `harness` (Agent shell harness) and `build`
  (Docs site) are path-filtered and must NOT be required: a required check that never reports hangs the merge.
- Repo merge settings allow merge, squash and rebase. No AOForge checks (`aoforge/linked-issue`, `aoforge/planning-consistency`)
  run here (`github.enabled: false`).
- `plugins/aoforge/aoforge/bin/lib/gh-setup.cjs` exports `SETUP_RULESET_NAME = 'aoforge: default branch'`,
  `ADMIN_BYPASS = { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }` and `rulesetSatisfies`, whose
  `isAdminBypass` accepts the admin role in any bypass_mode. Its `desiredRuleset()` hard-codes the AOForge contexts, so
  it is reused for the name and bypass role, not for the rule list.
- **Why bypass_mode `pull_request`, not gh-setup's `always`:** a bypass actor in `always` mode may also force-push, which
  breaks "rejects force-push". In `pull_request` mode the admin can merge a PR whose checks failed, and every direct push,
  force-push included, is subject to the rules. PR #129's unit suite is red today (E2E1 reconcile drift), so the admin
  route is the escape for it.
</context>

<embedded_context>

<codebase_examples>
The shape setup builds (gh-setup.cjs `desiredRuleset`, objective 50):
```js
{ name: SETUP_RULESET_NAME, target: 'branch', enforcement: 'active',
  bypass_actors: [ADMIN_BYPASS],
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  rules: [ { type: 'deletion' }, { type: 'non_fast_forward' },
           { type: 'pull_request', parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: false,
             require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: false } },
           { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: false, required_status_checks: [...] } } ] }
```
CLI shape: `scripts/ci-unit-gate.cjs` (pure exports, `main`, `process.exitCode`, `require.main === module`). Inject a
`gh(args) -> { status, stdout }` runner (default `spawnSync('gh', args, { encoding: 'utf-8' })`).
</codebase_examples>

<anti_patterns>
- Never call a writing `gh api` method in this TRD (`--method POST|PUT|PATCH|DELETE`, `-X`, `-f`/`-F` fields that imply POST).
- Do not require a path-filtered check (`harness`, `build`) or a check that does not run here (`aoforge/*`).
- Do not compare the read-back by raw JSON equality: GitHub adds `id`, `node_id`, `source`, `source_type`, `_links`,
  `created_at`, `updated_at`, `current_user_can_bypass`, and may add parameter defaults.
- No legacy product word in new files (rename guard).
</anti_patterns>

<error_recovery>
- `gh` returns 403 on rulesets or check-runs: record it; the inventory needs repository admin (the planning account had it).
- The live `checks` run finds a required context missing on a sampled PR: drop that context from main.json (or sample a
  different PR if the missing one predates the check), record why, and re-run.
</error_recovery>

</embedded_context>

## Test list

`scripts/ruleset-check.test.cjs`, outermost first; the gh runner is injected, no network.

CLI `main(argv, { gh, readFile, out, err })`:
1. `compare`: the named ruleset exists and equals the file, while the server adds metadata and a parameter default
   (`allowed_merge_methods` absent from the file but present in the reply) → exitCode 0, "matches", the server default listed.
2. `compare`: only the org "Private Repos" ruleset exists → exitCode 1, "no ruleset named 'aoforge: default branch'".
3. `compare`: the applied ruleset requires an extra context → exitCode 1 naming it.
4. `compare`: bypass_mode `always` where the file says `pull_request` → exitCode 1 naming the actor.
5. `compare`: enforcement `disabled` → exitCode 1.
6. `checks`: every required context reported by app 15368 on each sampled PR → exitCode 0, a per-PR table.
7. `checks`: a required context missing on one PR (the path-filtered case) → exitCode 1 naming the PR and the context.
8. `checks`: the context is reported but by another app id → exitCode 1 ("pinned to 15368, reported by <id>").

Pure:
9. `compareRuleset` ignores order (rules, contexts, bypass actors, include list).
10. `compareRuleset` reports a missing rule type (non_fast_forward removed) as a difference.

The record itself:
11. `.github/rulesets/main.json` parses; `name === SETUP_RULESET_NAME` (required from gh-setup.cjs); it has `deletion`
    and `non_fast_forward`; every bypass actor is the repository-admin role (`ADMIN_BYPASS.actor_id`) in `pull_request`
    mode; every required check carries `integration_id: 15368`; no required context is `harness` or `build`.

<tasks>

<task type="auto">
  <name>Task 1: Fixture builders and the ruleset record</name>
  <files>scripts/__fixtures__/ruleset-fixtures.cjs, .github/rulesets/main.json</files>
  <action>
Write `.github/rulesets/main.json`, 2-space indented, with a trailing newline:
```json
{
  "name": "aoforge: default branch",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }
  ],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge", "squash", "rebase"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [ { "context": "test (npm test, gated)", "integration_id": 15368 } ]
      }
    }
  ]
}
```
Write `scripts/__fixtures__/ruleset-fixtures.cjs` (hand-written builders): `approvedRuleset()` (reads the file),
`appliedRuleset(overrides)` (the approved one plus server metadata: `id: 900001`, `node_id`, `source_type: 'Repository'`,
`source: 'AO-Cyber-Systems/aoforge-claude'`, `_links`, `created_at`, `updated_at`, `current_user_can_bypass: 'pull_requests_only'`),
`orgRulesetSummary()` (the "Private Repos" summary, source_type Organization), `checkRuns(list)` building
`{ total_count, check_runs: [{ name, app: { id } }] }`, and `fakeGh(routes)` mapping an args string (e.g.
`api repos/O/R/rulesets`) to `{ status, stdout }` and recording calls.
Commit `test(74-03): add the main ruleset record and its fixture builders` with both files.
  </action>
  <verify>node -e "JSON.parse(require('fs').readFileSync('.github/rulesets/main.json','utf8')); console.log('ok')"; node -e "console.log(Object.keys(require('./scripts/__fixtures__/ruleset-fixtures.cjs')))"</verify>
  <done>The approvable text exists as a file, and the builders exist.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: scripts/ruleset-check.cjs, compare and checks</name>
  <files>scripts/ruleset-check.cjs, scripts/ruleset-check.test.cjs</files>
  <action>
Strict TDD through the Test list (1-11), RED then GREEN commits (`test(74-03): ...`, `feat(74-03): ...`).
```
SERVER_FIELDS = id, node_id, source, source_type, _links, created_at, updated_at, current_user_can_bypass
compareRuleset(applied, approved) -> { match, differences: [{ path, approved, applied }], serverDefaults: [path] }
  name/target/enforcement: equal
  conditions.ref_name.include/exclude: equal as sets
  bypass_actors: equal as sets of `${actor_type}:${actor_id}:${bypass_mode}`
  rules: equal sets of type; per rule, every approved parameter deep-equals the applied one; applied-only keys -> serverDefaults
  required_status_checks: equal sets of `${context}@${integration_id}`
missingContexts(ruleset, prChecks) -> [{ pr, context, reason: 'not reported' | 'reported by app <id>' }]
  prChecks: [{ pr, runs: [{ name, appId }] }]
main(argv, deps):
  compare --repo O/R --file F [--raw]:
    gh api repos/O/R/rulesets -> summaries; pick name === file.name && source_type === 'Repository'
    none -> exitCode 1; else gh api repos/O/R/rulesets/<id> -> compareRuleset -> print; exitCode match ? 0 : 1
  checks --repo O/R --file F --prs 1,2,3 [--raw]:
    per PR: gh pr view <n> --repo O/R --json headRefOid --jq .headRefOid
            gh api repos/O/R/commits/<sha>/check-runs --paginate
    missingContexts -> print a PR x context table; exitCode missing.length ? 1 : 0
```
Import `SETUP_RULESET_NAME` and `ADMIN_BYPASS` from `../plugins/aoforge/aoforge/bin/lib/gh-setup.cjs` in the test for case 11.
  </action>
  <verify>node --test scripts/ruleset-check.test.cjs (11 pass); node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs (passes)</verify>
  <done>Both modes work against hand-built fixtures; the record test pins the file's safety properties.</done>
</task>

<task type="auto">
  <name>Task 3: Record the live read-only inventory against the real repository</name>
  <files>(none: read-only GitHub reads; findings go to the SUMMARY)</files>
  <action>
One plain command per Bash call:
1. `gh pr list --repo AO-Cyber-Systems/aoforge-claude --base main --state all --limit 3 --json number,state,title`
2. `node scripts/ruleset-check.cjs checks --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json --prs <the three numbers>`
   (expect exit 0: `test (npm test, gated)` on each, app 15368).
3. `gh api repos/AO-Cyber-Systems/aoforge-claude/rulesets` (expect only "Private Repos").
4. `gh api repos/AO-Cyber-Systems/aoforge-claude/branches/main/protection` (expect 404).
5. `node scripts/ruleset-check.cjs compare --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json`
   (expect exit 1, "no ruleset named ..."; this is the pre-apply baseline).
Record outputs and the exact command TRD 74-07 will run after approval:
`gh api --method POST repos/AO-Cyber-Systems/aoforge-claude/rulesets --input .github/rulesets/main.json`. Do NOT run it.
If step 2 finds a missing context, follow error_recovery, amend main.json, and commit `fix(74-03): ...`.
  </action>
  <verify>The SUMMARY holds the five outputs; `git log -1 --format=%s -- .github/rulesets/main.json` is a 74-03 commit; no write request was sent (no `--method` other than GET appears in the session's commands)</verify>
  <done>The required check is proven to report on every sampled PR, and the pre-apply baseline is recorded.</done>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test scripts/ruleset-check.test.cjs` passes; `checks` exits 0 on live data; `compare` exits 1 (absent) before the apply.
- `npm test` passes, apart from the failures already known on this branch, which the SUMMARY names.
</verification>

<success_criteria>
- The user can be shown one exact file to approve, and its read-back match is mechanical.
- No setting on GitHub changed.
</success_criteria>

<output>
After completion, write `74-03-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 74-03 --from <draft>`.
</output>
