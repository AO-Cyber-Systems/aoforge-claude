---
objective: 55-store-live-smoke-fixes
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-setup.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-setup-apply.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
autonomous: true
requirements: ["55-1", "55-4"]
must_haves:
  truths:
    - "A fresh `gh setup --apply` creates the `devflow: default branch` ruleset with bypass_actors containing {actor_id: 5, actor_type: RepositoryRole, bypass_mode: always}, and the fake GitHub then reports current_user_can_bypass `always` for an admin token (it reported `never` before the fix)"
    - "An existing ruleset with every DevFlow rule but no repository-admin bypass is planned as `update`; the PUT body keeps every bypass actor the user had and appends the admin entry exactly once"
    - "An existing ruleset whose admin bypass uses bypass_mode `pull_request` is `exists`: setup never changes the user's chosen mode, and a second `--apply` makes zero GitHub writes"
    - "The apply output no longer says an admin `may need to bypass`; it names the repository-admin bypass the ruleset grants and the command `gh pr merge <number> --admin --<method>` (method from github.pr.merge_method, squash by default)"
    - "With github.checks_workflow set to `<owner>/<repo>/.github/workflows/devflow-checks.yml@<ref>`, the rendered caller pins `devflow-ref: <ref>` too, so the runner script and the reusable workflow come from the same ref; with it unset or without `@`, both stay `v<plugin version>`"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-setup.cjs
      provides: "ADMIN_BYPASS in desiredRuleset; rulesetSatisfies requires an admin bypass; unionRuleset adds it; renderTemplates derives devflow_ref from a pinned checks_workflow"
    - path: plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs
      provides: "filesLines guidance naming the admin bypass merge command"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs
      provides: "GET rulesets/{id} answers current_user_can_bypass computed from bypass_actors and isAdmin"
  key_links:
    - "gh setup --apply -> planSetup -> desiredRuleset/unionRuleset -> POST|PUT repos/o/r/rulesets -> ruleset with admin bypass"
    - "github.checks_workflow `...@<ref>` -> renderTemplates -> .github/workflows/devflow.yml `uses: ...@<ref>` + `devflow-ref: <ref>`"
---

# TRD 55-01: `gh setup` ruleset admin bypass, and a caller that pins one ref (items 55-1, 55-4 caller half)

<objective>
Make the ruleset `gh setup` creates mergeable for its own workflow pull request, and make the caller workflow pin the runner
script and the reusable workflow to the same ref.

**55-1.** `desiredRuleset()` (gh-setup.cjs:66-114) ships `bypass_actors: []` next to a `merge_queue` rule and two required
checks that exist only once the workflow is on the default branch. On the live smoke (`AO-Cyber-Systems/devflow-store-smoke`,
2026-10-05) GitHub reported `current_user_can_bypass: never`, so the printed "an admin may need to bypass the ruleset once"
step was impossible. It was fixed by hand with
`bypass_actors: [{actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always"}]` (ruleset 24476250), after which the
admin could merge. Ship that entry, keep the superset-idempotency semantics, and make the printed guidance match.

**55-4 (caller half).** `renderTemplates` (gh-setup.cjs:700-711) honours `github.checks_workflow` for the `uses:` line but always
writes `devflow-ref: v<plugin version>`. A repository pointed at a fixed reusable workflow on a branch or SHA would still check out
the runner script at the old tag. Derive `devflow_ref` from the `@<ref>` suffix of a configured `checks_workflow`. The live
re-run (TRD 55-06) depends on this: it pins the smoke repo to the pushed head SHA of this branch. How an existing repository
picks up a fixed workflow does not change: after a plugin upgrade, re-run `gh setup --apply`, which plans the managed
`devflow.yml` as `update` ("refresh the managed DevFlow checks workflow", gh-setup.cjs:354), and merge that workflow pull request.
Test 13 pins that behaviour; TRD 55-08 documents it.

Decision taken here (flag it in the SUMMARY): `bypass_mode: 'always'`. That is the mode verified live. `pull_request` might be
enough, but nobody has checked it against a ruleset with a `merge_queue` rule. Setup accepts any mode on an existing admin entry
(`satisfies` checks the actor, not the mode), so a team can tighten it in GitHub and setup leaves it alone.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: a failing `test(55-01): ...` commit before each `fix(55-01): ...` commit.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>` (repo checkout df-tools; the home
  mirror is 2.12.0 and stale).
- Hand-built fixtures only. No property-based testing. No `.feature` files.
- No GitHub calls: the fake GitHub (`__fixtures__/gh-fake.cjs`) is the only GitHub in tests.
- TRDs 55-02, 55-03 and 55-04 run in parallel and do not touch `gh-fake.cjs`. Only this TRD edits it. Keep the change additive:
  a computed field on GET, nothing stored.

## Test list

Outermost first: the CLI apply against the fake, then the pure planners.

Apply (gh-setup-apply.test.cjs, or gh-setup-cli.test.cjs where the `--apply` harness lives; reuse the existing harness):
1. Fresh fake repo (no rulesets, `isAdmin: true`). After `gh setup --apply`, `GET repos/o/r/rulesets/<id>` returns
   `bypass_actors` containing `{actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always'}` and
   `current_user_can_bypass: 'always'`. RED today: `[]` and `'never'`.
2. A second `--apply` makes zero GitHub writes: `fake.writes()` has the same length before and after.
3. Seeded ruleset `devflow: default branch` with every desired rule and `bypass_actors: [{actor_id: 7, actor_type: 'Team',
   bypass_mode: 'always'}]`: apply PUTs a body whose `bypass_actors` is `[Team 7, RepositoryRole 5 always]` in that order.
4. Seeded ruleset with every rule and `[{actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request'}]`: the plan
   action is `exists`, apply makes zero writes, and GET reports `current_user_can_bypass: 'pull_requests_only'`.

Guidance (gh-setup-cli.test.cjs):
5. Apply that created the ruleset prints a line naming the repository-admin bypass and the command
   `gh pr merge <number> --admin --squash`. No line contains `may need to bypass`.
6. With `github.pr.merge_method: 'rebase'` the printed command is `--admin --rebase`. An unknown method prints `--squash`.

Pure planners (gh-setup.test.cjs):
7. `desiredRuleset().bypass_actors` deep-equals `[{actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always'}]`, with and
   without `appId` / `mergeQueue:false`.
8. `rulesetSatisfies(existing, desired)` is false for an otherwise complete ruleset with `bypass_actors: []` or with the field
   absent. It is true when the admin entry is present in any `bypass_mode`.
9. `unionRuleset(null, desired)` deep-equals `desired`. `unionRuleset(existingWithAdminPullRequest, desired).bypass_actors` holds
   exactly one RepositoryRole 5 entry, still `pull_request`. The existing test at gh-setup.test.cjs:224-243, where the user's
   actors stay, keeps passing.
10. `renderTemplates({checks_workflow: 'AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@feat/x'}, '2.13.1')`:
    the workflow contains `devflow-checks.yml@feat/x` and `devflow-ref: feat/x`.
11. Same with a 40-hex SHA after `@`: `devflow-ref: <that sha>`.
12. `checks_workflow` without `@`, or empty/unset: `devflow-ref: v2.13.1`. A `uses:` line without `@` keeps today's value.
13. Regression guard: `planSetup` with a local managed `devflow.yml` rendered for `2.13.0` while the version is `2.13.1` plans the
    workflow action `update`. Re-running setup picks up a fixed workflow.

<embedded_context>

<codebase_examples>
Today's desired ruleset and union (gh-setup.cjs):

```js
  return {
    name: SETUP_RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],                       // <- 55-1: becomes [ADMIN_BYPASS] (clone it, never share the object)
    conditions: { ref_name: { include: [DEFAULT_BRANCH_REF], exclude: [] } },
    rules,
  };
...
    bypass_actors: Array.isArray(existing.bypass_actors) ? clone(existing.bypass_actors) : clone(desired.bypass_actors),
```

Pattern for the new constant and helper (keep the module's style: frozen constants, small pure helpers):

```js
/** Repository admins may bypass the ruleset: the workflow pull request cannot pass checks that only exist after it merges. */
const ADMIN_BYPASS = Object.freeze({ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' });
const isAdminBypass = (a) => isObject(a) && a.actor_type === 'RepositoryRole' && Number(a.actor_id) === 5;
```

`rulesetSatisfies` adds `if (!(existing.bypass_actors || []).some(isAdminBypass)) return false;`. `unionRuleset` copies the
existing actors and appends `clone(ADMIN_BYPASS)` only when none `isAdminBypass`. Update both doc comments: bypass actors are
still the user's and are never removed, but the admin entry is now something DevFlow needs.

Printed guidance today (gh-setup-cli.cjs:110-114):

```js
    lines.push('The ruleset requires devflow/linked-issue and devflow/planning-consistency, and those checks exist only once the workflow is on the default branch.',
      'Merge the workflow pull request first: until it is merged nothing can merge into the default branch, so an admin may need to bypass the ruleset once for that pull request.');
```

Read the merge method the way gh-pr.cjs `mergeMethodFromConfig` does (`client.readConfig(cwd).github.pr.merge_method`, one of
merge|squash|rebase, else squash). Do not import gh-pr.cjs into gh-setup-cli.cjs for this. A three-line local helper is fine.

renderTemplates today (gh-setup.cjs:700-706):

```js
  const ref = `v${version.trim().replace(/^v/, '')}`;
  const configured = typeof github.checks_workflow === 'string' ? github.checks_workflow.trim() : '';
  const values = { checks_workflow: configured !== '' ? configured : `${DEFAULT_CHECKS_WORKFLOW}@${ref}`, devflow_ref: ref };
```

Change: `const at = configured.lastIndexOf('@'); const pinned = at > 0 ? configured.slice(at + 1).trim() : '';` and
`devflow_ref: pinned !== '' ? pinned : ref`. Update the JSDoc (`{{devflow_ref}}` is the configured workflow's `@ref`, else
`v<version>`).

Fake GitHub ruleset GET (gh-fake.cjs:1142-1166) returns the stored object. Add the computed field on GET only (and on the PUT/POST
echo, the way GitHub does). Never store it and never add it to `RULESET_FIELDS`:

```js
  /** GitHub's per-viewer answer: an admin token bypasses when an admin RepositoryRole actor is listed. */
  function canBypass(r) {
    const admin = (r.bypass_actors || []).find((a) => a && a.actor_type === 'RepositoryRole' && Number(a.actor_id) === 5);
    if (!isAdmin || !admin) return 'never';
    return admin.bypass_mode === 'pull_request' ? 'pull_requests_only' : 'always';
  }
  // GET: return ok(JSON.stringify({ ...found, current_user_can_bypass: canBypass(found) }));
```

Document the field in the fake's header comment block (lines 61-66, 173-179).
</codebase_examples>

<anti_patterns>
- Do not make `rulesetSatisfies` compare `bypass_mode`. That would turn a team's deliberate `pull_request` into an `update` on
  every run, which breaks idempotency (test 4).
- Do not remove or reorder the user's bypass actors. The union only appends.
- Do not let `current_user_can_bypass` leak into a PUT body. `unionRuleset` returns only writable fields; keep it that way
  (gh-setup.test.cjs:268 pins the key set).
- Do not hard-code `--squash` in the guidance. It follows `github.pr.merge_method`, the same setting the merge_queue rule uses.
</anti_patterns>

<error_recovery>
- Existing tests that deep-equal `desiredRuleset()` or a POST payload with `bypass_actors: []` will fail: update them to the admin
  entry. They pinned the bug.
- If a CLI test snapshots the whole apply output, update the snapshot to the new guidance line and nothing else.
</error_recovery>

</embedded_context>

<context>
- Live evidence: ruleset created with `bypass_actors: []` and `current_user_can_bypass: never`. A hand PUT of
  `[{actor_id:5, actor_type:"RepositoryRole", bypass_mode:"always"}]` made the workflow PR mergeable.
- `github.checks_workflow` is an existing config key (`templates/config.json`, empty by default). No new key is added.
- Repo CLAUDE.md: Node native test runner, CommonJS, synchronous fs, test files next to the source.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Admin bypass in the desired ruleset, satisfies and union; fake reports current_user_can_bypass</name>
  <files>plugins/devflow/devflow/bin/lib/gh-setup.cjs, plugins/devflow/devflow/bin/lib/gh-setup.test.cjs, plugins/devflow/devflow/bin/lib/gh-setup-apply.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/gh-fake.cjs</files>
  <action>
RED: add tests 1-4 (apply against the fake) and 7-9 (pure) from the Test list. Add the fake's computed
`current_user_can_bypass` first, in the same RED commit, because tests 1 and 4 read it. Commit
`test(55-01): ruleset grants a repository-admin bypass`.

GREEN: add `ADMIN_BYPASS` and `isAdminBypass` to gh-setup.cjs. `desiredRuleset` returns `bypass_actors: [clone(ADMIN_BYPASS)]`.
`rulesetSatisfies` requires an admin entry, in any mode. `unionRuleset` appends the admin entry only when it is missing. Update the
two doc comments, and the `update` action description at gh-setup.cjs:408 so it still says the user's bypass actors are kept.
Export `ADMIN_BYPASS` if a test needs it. Commit `fix(55-01): gh setup ruleset grants repository admins a bypass`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-setup.test.cjs plugins/devflow/devflow/bin/lib/gh-setup-apply.test.cjs plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs</verify>
  <done>Tests 1-4 and 7-9 pass; test 1 failed before the fix with `never`; every pre-existing setup test passes (updated only where it pinned `bypass_actors: []`).</done>
  <recovery>If an apply test cannot reach the ruleset id, list `GET repos/o/r/rulesets` and pick by name, as the existing apply tests do. Revert with `git checkout -- <file>` per file if the union change breaks unrelated rule merging.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Printed guidance names the admin-bypass merge; devflow-ref follows a pinned checks_workflow</name>
  <files>plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs, plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs, plugins/devflow/devflow/bin/lib/gh-setup.cjs, plugins/devflow/devflow/bin/lib/gh-setup.test.cjs</files>
  <action>
RED: tests 5-6 (guidance) and 10-13 (renderTemplates and planSetup refresh). Commit
`test(55-01): guidance names the admin bypass; devflow-ref follows checks_workflow`.

GREEN:
- `filesLines` (gh-setup-cli.cjs:103): replace the second guidance string. Suggested text, adjust wording but keep the facts:
  `Merge the workflow pull request first. Its required checks cannot pass until the workflow is on the default branch, so merge it
  with the repository-admin bypass the ruleset grants: gh pr merge <number> --admin --<method> (or "Merge without waiting for
  requirements to be met" in the web UI). Every later pull request goes through the checks and the merge queue.`
  `<method>` comes from `github.pr.merge_method` (merge|squash|rebase, default squash).
- `renderTemplates`: derive `devflow_ref` from the configured `checks_workflow`'s `@<ref>` (code example above).
Commit `fix(55-01): setup guidance and caller ref pinning`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-setup.test.cjs plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs plugins/devflow/devflow/bin/lib/gh-setup-apply.test.cjs plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs</verify>
  <done>Tests 5-6 and 10-13 pass; `rg -n "may need to bypass" plugins/devflow/devflow/bin/lib/gh-setup-cli.cjs` finds nothing; the caller-template repo test (5e, only documented placeholders) still passes.</done>
  <recovery>If test 13 shows the refresh is NOT planned (`exists`), stop and report it: the live re-run in 55-06 needs that path, so it is a finding, not something to patch around in the test.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/gh-setup.test.cjs plugins/devflow/devflow/bin/lib/gh-setup-cli.test.cjs plugins/devflow/devflow/bin/lib/gh-setup-apply.test.cjs</test_scoped>
</validation_gates>

<verification>
- `node --test plugins/devflow/devflow/bin/lib/gh-setup*.test.cjs plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs` passes.
- `npm test`: no new failures (MA-7 doctl is the known environmental failure).
- `git log --oneline` shows a `test(55-01)` commit before each `fix(55-01)` commit.
</verification>

<success_criteria>
- A fresh setup creates a ruleset the repository admin can bypass (fake: `current_user_can_bypass: always`).
- Setup stays superset-idempotent: the user's actors and modes are kept, and the second apply makes zero writes.
- The printed step is runnable: it names `gh pr merge <n> --admin --<method>`.
- A pinned `checks_workflow@<ref>` pins `devflow-ref` to the same ref.
</success_criteria>

<output>
After completion, publish `55-01-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the `bypass_mode: always` decision and the exact guidance text. TRD 55-06 verifies it live.
</output>
