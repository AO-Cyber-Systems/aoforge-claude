---
objective: 50-github-enforcement-and-setup
trd: "10"
type: standard
wave: 2
depends_on: ["50-03"]
files_modified:
  - .github/workflows/devflow-checks.yml
  - plugins/devflow/devflow/templates/github/devflow.yml
  - plugins/devflow/devflow/templates/github/pull_request_template.md
  - plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs
autonomous: true
requirements: [GEN-05, GEN-04]
must_haves:
  truths:
    - "This repo ships a reusable workflow (`on: workflow_call`) with jobs that run `gh-check-cli.cjs linked-issue`, `planning-consistency` and `reconcile`"
    - "The caller template every set-up repo receives triggers on `pull_request` (opened, edited, synchronize, reopened, ready_for_review, closed) and `merge_group`, with no `paths`/`branches` filters, and carries `# devflow:managed`"
    - "App authentication uses `actions/create-github-app-token@v3` with `client-id` (never `app-id`), only when the client id input is set; otherwise `github.token`"
    - "The PR template's managed block asks for `Closes #<objective issue>` and is delimited by `<!-- devflow:pr-template:start -->` / `end`"
    - "A repo test pins all of the above as text assertions (no YAML dependency)"
  artifacts:
    - path: .github/workflows/devflow-checks.yml
      provides: "reusable workflow: two status-posting check jobs + merge-time reconcile job"
    - path: plugins/devflow/devflow/templates/github/devflow.yml
      provides: "caller workflow template with {{checks_workflow}} and {{devflow_ref}} placeholders"
    - path: plugins/devflow/devflow/templates/github/pull_request_template.md
      provides: "managed PR-template block"
  key_links:
    - "Runs the 50-08 script; rendered and written into target repos by 50-11; script-path existence asserted in 50-12"
---

# TRD 50-10: the reusable Actions workflow and repo templates (GEN-05)

<objective>
Ship the GitHub side of enforcement: a reusable workflow in this repo that runs the two required checks and the merge-time
reconcile, a thin caller template `gh setup` writes into each repository, and a managed PR-template block.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: the failing repo test first (`test(50-10): ...`), then the files (`feat(50-10): ...`).
- No YAML parser dependency: assert on text (line regexes). No real Actions run is possible offline; the live check is recorded as an
  open item in 50-13 (research Open Question 2, LOW confidence on runner details).
- Never port 8080 (no servers here anyway).

## Decisions

- **Where the script comes from** (Open Question 5): the reusable workflow lives in this repo (`.github/workflows/devflow-checks.yml`)
  and checks out the DevFlow repo itself (`inputs.devflow-repo`, default `AO-Cyber-Systems/devflow-claude`, at `inputs.devflow-ref`,
  sparse `plugins/devflow/devflow/bin`, path `.devflow`) and runs `node .devflow/plugins/devflow/devflow/bin/lib/gh-check-cli.cjs
  <check>`. `gh` is preinstalled on `ubuntu-latest`. Platform/ops can mirror it into AOCyberAI-Ops and point `github.checks_workflow`
  (50-11) at the mirror; nothing in the plugin hard-codes the caller's `uses:` target.
- **Tokens**: step `app` (only `if: inputs.app-client-id != ''`) mints a token for the caller repo's owner; step `app-src` (same
  condition) mints one for the DevFlow repo's owner, used only for the checkout. Status posting and reconcile use
  `steps.app.outputs.token || github.token`. Explicit `permission-*` inputs: statuses write, issues write, pull-requests read,
  contents read. With no App, the caller's GITHUB_TOKEN permissions (template: `contents: read, pull-requests: read, issues: write,
  statuses: write`) suffice for checks and for closing issues.
- **Context naming** is not the job name: the script posts statuses `devflow/linked-issue` and `devflow/planning-consistency` itself (50-08).
  Jobs are named `linked-issue`, `planning-consistency`, `reconcile`.
- **Job conditions**: checks run when `github.event_name == 'merge_group'` or (`pull_request` and action != `closed`); reconcile runs
  when `pull_request`, action `closed`, and `github.event.pull_request.merged == true`.
- **Env**: `GH_TOKEN`, `DEVFLOW_GH_CACHE_DIR: ${{ runner.temp }}/devflow` (keeps gh-client state off the runner home).
- **Caller template** (`templates/github/devflow.yml`): first line `# devflow:managed — written by df-tools gh setup; edits are overwritten`,
  `name: DevFlow`, triggers above, top-level `permissions`, one job `devflow: uses: {{checks_workflow}}` with `with: {devflow-ref:
  {{devflow_ref}}, app-client-id: ${{ vars.DEVFLOW_APP_CLIENT_ID }}}` and `secrets: {app-private-key: ${{ secrets.DEVFLOW_APP_PRIVATE_KEY }}}`.
  Placeholders are double-brace tokens 50-11 substitutes; `${{ }}` expressions are left alone.
- **PR template block**: a short checklist: "Closes #<objective issue> (and one `Closes #` per TRD — `df-tools gh pr start` writes these
  for DevFlow objectives)", "Base branch is the default branch". Only `df-tools` commands that exist today (doc-refs test).

## Test list

1. Reusable workflow has `workflow_call:` with inputs `devflow-ref` (required), `devflow-repo`, `app-client-id` and secret `app-private-key`.
2. It has jobs `linked-issue`, `planning-consistency`, `reconcile`, each with a `run:` line invoking `gh-check-cli.cjs <same name>`.
3. It uses `actions/create-github-app-token@v3` with `client-id:` and contains no `app-id:` line; every App step is conditional on the input.
4. Reconcile's `if:` contains `merged == true`; check jobs' `if:` mention `merge_group`.
5. Caller template: first line `# devflow:managed`, contains `merge_group:`, the six pull_request types, `{{checks_workflow}}`,
   `{{devflow_ref}}`, `statuses: write`, and no `paths:` / `paths-ignore:` / `branches:` keys.
6. PR template: start/end markers present exactly once each; no stale command (run doc-refs repo test).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: reusable workflow (tests 1-4)</name>
  <files>.github/workflows/devflow-checks.yml, plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs</files>
  <action>
RED: tests 1-4 reading `.github/workflows/devflow-checks.yml` from the repo root (resolve via `path.resolve(__dirname, '../../../../..')`
— confirm against how other `*.repo.test.cjs` find the root); commit `test(50-10): reusable DevFlow checks workflow`.
GREEN: write the workflow per Decisions with a header comment naming objective 50, the status-context decision and the token rules.
Commit `feat(50-10): reusable workflow for the required checks and reconcile`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs</verify>
  <done>Tests 1-4 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: caller and PR templates (tests 5-6)</name>
  <files>plugins/devflow/devflow/templates/github/devflow.yml, plugins/devflow/devflow/templates/github/pull_request_template.md, plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs</files>
  <action>
RED: tests 5-6; commit `test(50-10): caller workflow and PR templates`.
GREEN: the two templates. Commit `feat(50-10): caller workflow and PR template for gh setup`. Run the template-scanning repo tests
(planning-writes, doc-refs) since `templates/` is scanned.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>Tests 5-6 pass; template scanners green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `.github/workflows/test.yml` (this repo's runner/node setup conventions).
- `gh-check.cjs` `CONTEXTS` (50-03); runner argv contract (50-08): `gh-check-cli.cjs <linked-issue|planning-consistency|reconcile>`.
- `pr-lifecycle-prose.repo.test.cjs` for the repo-test style (text assertions over shipped files).
</codebase_examples>
<anti_patterns>
- `paths`/`branches` filters on the required-check workflow (the check never reports and merges hang).
- `pull_request_target` (not needed; checks read only).
- Requiring the App for the checks themselves (smaller blast radius without it).
</anti_patterns>
<error_recovery>
- If `sync-runtime` mirroring skips nested template dirs, note it for 50-11 (setup can read templates via `__dirname`-relative paths instead of the home mirror).
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</regression>
</validation_gates>

<verification>
- `merge_group` present on the caller; required contexts are posted by the script, not inferred from job names.
</verification>

<success_criteria>
Every set-up repository gets one small managed workflow that runs DevFlow's checks on PRs and in the merge queue, and reconciles on merge.
</success_criteria>

<output>
After completion, create `.planning/objectives/50-github-enforcement-and-setup/50-10-SUMMARY.md`
</output>
