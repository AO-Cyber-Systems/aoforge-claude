---
objective: 54-codeql-cleanup
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - .github/workflows/test.yml
  - .github/workflows/agent-shell-harness.yml
  - scripts/workflow-permissions.test.cjs
  - scripts/ci-unit-gate.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs
autonomous: true
requirements: ["54-F", "54-H"]
codeql_alerts: [125, 137, 124, 134]
must_haves:
  truths:
    - "test.yml and agent-shell-harness.yml each declare a top-level `permissions:` block granting only `contents: read` (alerts 125, 137)"
    - "A repo test fails if any workflow under .github/workflows/ has neither a top-level `permissions:` block nor one in every job"
    - "PJ-6 in scripts/ci-unit-gate.test.cjs builds its `<error>` testcase through the fixture builder, with no identity `.replace(x, x)` left (alert 124), and still proves an `<error>` child counts as a failure"
    - "doctor.e2e.test.cjs checks the `stamped v<version>` note without building a regex from the version (alert 134)"
  artifacts:
    - path: scripts/workflow-permissions.test.cjs
      provides: "text-level guard that every workflow declares token permissions"
  key_links:
    - "npm test glob 'scripts/**/*.test.cjs' -> scripts/workflow-permissions.test.cjs (runs in the Unit suite job)"
---

# TRD 54-03: Workflow token permissions and two test leftovers (groups F, H)

<objective>
- **F, alerts 125 (`test.yml:57`) and 137 (`agent-shell-harness.yml:25`), `actions/missing-workflow-permissions`.** Neither workflow
  declares `permissions:`, so each job gets the repository's default `GITHUB_TOKEN` grant. Both jobs only check out, set up Node and
  run tests. Neither reads a secret, calls the GitHub API, pushes, comments or uploads. The unit suite strips `GITHUB_TOKEN`/`GH_TOKEN`
  where it spawns git (gh-backfill.e2e.test.cjs:99) and makes no API calls. `actions/setup-node`'s `cache: npm` uses the Actions cache
  service (runtime token), not a `GITHUB_TOKEN` scope. Least privilege is `contents: read` for both.
- **H1, alert 124, `scripts/ci-unit-gate.test.cjs:219`, `js/identity-replacement`.** PJ-6 does
  `.replace('<testcase name="E" time="0.001" classname="test"', '<testcase name="E" time="0.001" classname="test"')`, a no-op, then a
  second `.replace(/\/>\n\t<\/testsuite>/, ...)` that opens the self-closed testcase and nests `<error .../>` in it. The intent of the
  pair was "a testcase that contains an `<error>` child". The first call is a leftover from an earlier draft that opened the tag in two
  steps. Fix the intent: give `buildTestCase` a `status: 'error'` shape and build PJ-6 from it, so no string surgery is needed.
- **H2, alert 134, `doctor.e2e.test.cjs:273`, `js/incomplete-sanitization`.** `new RegExp(\`stamped v${ENGINE_VERSION.replace(/\./g, '\\.')}\`)`
  escapes dots only. The assertion is a plain substring check, so use `includes`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Task 1 is test-first: `test(54-03): ...` (the guard fails on the two workflows) before `ci(54-03): ...`.
- Task 2 changes tests only, with no production code. Assertions keep their meaning. Commit as `test(54-03): ...`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- No YAML dependency. The repo has none, and agent-shell-harness.test.cjs (Case C1) already checks workflows at the text level.
- Do not edit release.yml, docs.yml, devflow-checks.yml or auto-label-issues.yml. They already declare permissions (top-level in
  docs.yml, per job in the others) and must keep passing the new guard as they are.

## Test list

Repo-level (outermost: the workflow files themselves):
1. Every `.github/workflows/*.yml` has a top-level `^permissions:` line OR every job (a `^  <name>:$` line under `^jobs:$`) has a
   `^    permissions:` line inside its block. Today this fails for test.yml and agent-shell-harness.yml only.
2. test.yml and agent-shell-harness.yml: the top-level block is exactly `permissions:\n  contents: read` (next line is blank or a
   comment or a new top-level key) and neither file contains `: write`.
3. Agent-shell-harness Case C1/C2 (existing, agent-shell-harness.test.cjs:965-1006) still pass.

Unit (scripts/ci-unit-gate.test.cjs):
4. PJ-6 rebuilt: `parseJunit(buildJunit([{ name: 'E', file: 'plugins/devflow/e.test.cjs', status: 'error' }]))` gives `failures === 1`,
   and the built XML contains `<error type="harness" message="load failed"/>` inside the `<testcase name="E"` element.

E2E (doctor.e2e.test.cjs):
5. The pending-migrations note check passes with `includes`, same meaning as before.

<embedded_context>

<codebase_examples>
Placement in test.yml: after the `concurrency:` block (lines 50-53), before `jobs:` (line 55):

```yaml
# Least privilege (CodeQL actions/missing-workflow-permissions): this job checks out the tree and runs
# the suite. It writes nothing through GITHUB_TOKEN, and setup-node's npm cache uses the Actions cache
# service, not a token scope.
permissions:
  contents: read
```

Placement in agent-shell-harness.yml: after the `on:` block (ends line 21), before `jobs:` (line 23). Same block, same comment
adjusted to "runs the harness". Keep the existing header comments; Case C1 asserts `^on:$`, `^jobs:$` and the path filter strings.

How agent-shell-harness.test.cjs reads workflows (pattern for the new guard):

```js
const WORKFLOW = path.resolve(__dirname, '..', '..', '..', '..', '..', '.github', 'workflows', 'agent-shell-harness.yml');
const yml = fs.readFileSync(WORKFLOW, 'utf-8');
assert.match(yml, /^jobs:$/m);
```

For scripts/workflow-permissions.test.cjs the root is `path.resolve(__dirname, '..')`. Job detection for item 1: after the `jobs:`
line, a job starts at `/^  ([A-Za-z0-9_-]+):\s*$/` and runs until the next such line or EOF; look for `/^    permissions:/m` inside it.
Planner-observed current state (all must pass item 1 after the fix): auto-label-issues (1 job, has perms), devflow-checks (3 jobs,
all have perms), docs (top-level), release (1 job, has perms), test and agent-shell-harness (fixed by this TRD).

Current PJ-6 (scripts/ci-unit-gate.test.cjs:217-225):

```js
test('PJ-6 an <error> child counts as a failure, same as <failure>', () => {
  const xml = buildJunit([{ name: 'E', file: 'plugins/devflow/e.test.cjs' }])
    .replace('<testcase name="E" time="0.001" classname="test"',
             '<testcase name="E" time="0.001" classname="test"');
  const withError = xml.replace(/\/>\n\t<\/testsuite>/,
    '>\n\t\t\t<error type="harness" message="load failed"/>\n\t\t</testcase>\n\t</testsuite>');
  const r = parseJunit(withError);
  assert.strictEqual(r.failures, 1, `expected the <error> case to count; got ${JSON.stringify(r)}`);
});
```

buildTestCase (scripts/ci-unit-gate.test.cjs:47-70) returns per status; add, next to the `skip` branch:

```js
  if (status === 'error') {
    return `\t\t<testcase ${attrs}>\n\t\t\t<error type="harness" message="load failed"/>\n\t\t</testcase>`;
  }
```

Current doctor check (doctor.e2e.test.cjs:273):

```js
assert.match(fixes['pending-migrations'].notes, new RegExp(`stamped v${ENGINE_VERSION.replace(/\./g, '\\.')}`));
```

Target:

```js
assert.ok(fixes['pending-migrations'].notes.includes(`stamped v${ENGINE_VERSION}`),
  `pending-migrations notes name the stamped version; got: ${fixes['pending-migrations'].notes}`);
```
</codebase_examples>

<anti_patterns>
- Do not grant `pull-requests`, `checks`, `statuses` or any `write` scope "just in case". Neither job uses them.
- Do not use `permissions: {}`/`read-all`. `{}` removes `contents: read` and actions/checkout cannot read a private repository;
  `read-all` is broader than needed.
- Do not delete PJ-6 or weaken it to pass. It is the only test proving `<error>` children count, and the gate depends on that.
- Do not import a YAML parser into the new test.
</anti_patterns>

<error_recovery>
- If agent-shell-harness Case C1 fails after the edit, check that `^on:$` and `^jobs:$` are still bare lines and that the new block
  did not land inside the `on:` mapping (it must be at column 0).
- If PJ-6 fails with failures 0 after the rewrite, `buildJunit` header says `failures="0"`; parseJunit counts children, not the header.
  Print the built XML and compare with the old string-surgery output; they must be identical apart from whitespace.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Least-privilege permissions for the two workflows, guarded by a repo test (alerts 125, 137)</name>
  <files>scripts/workflow-permissions.test.cjs, .github/workflows/test.yml, .github/workflows/agent-shell-harness.yml</files>
  <action>
RED: create `scripts/workflow-permissions.test.cjs` (node:test, node:assert/strict, fs, path; no other deps) with test-list items 1-2.
Item 1 iterates `fs.readdirSync(path.resolve(__dirname, '..', '.github', 'workflows')).filter(f => /\.ya?ml$/.test(f))` and names
the offending file and job in the failure message. Run it: it fails naming test.yml (job `test`) and agent-shell-harness.yml
(job `harness`). Commit `test(54-03): guard that every workflow declares GITHUB_TOKEN permissions`.

GREEN: add the top-level `permissions: contents: read` block with its comment to both workflows at the placements in
codebase_examples. Commit `ci(54-03): least-privilege GITHUB_TOKEN permissions for unit suite and agent shell harness`.
  </action>
  <verify>node --test scripts/workflow-permissions.test.cjs plugins/devflow/devflow/bin/lib/agent-shell-harness.test.cjs</verify>
  <done>The guard passes for all six workflows; agent-shell-harness Cases C1/C2 pass; `rg -n "^permissions:" .github/workflows/test.yml .github/workflows/agent-shell-harness.yml` prints two lines.</done>
  <recovery>If a workflow other than the two targets fails item 1, the job-block detection is wrong (e.g. a job key with a trailing comment); fix the detector, never edit that workflow.</recovery>
</task>

<task type="auto">
  <name>Task 2: Fix the PJ-6 identity replace by intent and the doctor e2e regex (alerts 124, 134)</name>
  <files>scripts/ci-unit-gate.test.cjs, plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs</files>
  <action>
1. scripts/ci-unit-gate.test.cjs: add the `status: 'error'` branch to `buildTestCase` (codebase_examples). Rewrite PJ-6 as
   `const xml = buildJunit([{ name: 'E', file: 'plugins/devflow/e.test.cjs', status: 'error' }]);`, assert
   `xml.includes('<error type="harness" message="load failed"/>')` (the fixture really carries the child), then keep the existing
   `parseJunit(xml)` + `failures === 1` assertion and message. Remove both `.replace` calls.
2. doctor.e2e.test.cjs:273: replace the regex with the `includes` assertion in codebase_examples.

Commit `test(54-03): build PJ-6 error case via fixture builder; drop regex built from version in doctor e2e`.
  </action>
  <verify>node --test scripts/ci-unit-gate.test.cjs plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs</verify>
  <done>Both files pass. `rg -n "\.replace\('<testcase name=\"E\"" scripts/ci-unit-gate.test.cjs` and `rg -n "ENGINE_VERSION\.replace" plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs` print nothing.</done>
  <recovery>If doctor.e2e.test.cjs is skipped locally (environment-gated), confirm with `node --test --test-reporter=spec` that the edited test is reported as skipped rather than failed, and record it in the SUMMARY; CI runs it.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- Both task verify commands pass.
- `node --test scripts/ci-unit-gate.test.cjs` (the CI gate self-test step) passes on its own.
- `git diff --stat` touches exactly the five files in files_modified.
</verification>

<success_criteria>
Both workflows run with a read-only token, a repo test keeps every future workflow from regressing to default permissions, PJ-6
expresses its intent through the fixture builder, and no test builds a regex from a version string.
</success_criteria>

<output>
After completion, create `.planning/objectives/54-codeql-cleanup/54-03-SUMMARY.md` via `df-tools summary post`.
</output>
