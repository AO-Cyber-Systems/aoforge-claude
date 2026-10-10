---
objective: 74-operations-decisions
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - scripts/__fixtures__/cloudflare-api-fixtures.cjs
  - scripts/ci-cloudflare-target.cjs
  - scripts/ci-cloudflare-target.test.cjs
  - .github/workflows/docs.yml
autonomous: true
requirements: [OPS-03]
must_haves:
  truths:
    - "`node scripts/ci-cloudflare-target.cjs --project aoforge-docs` reports, from the Cloudflare API, whether the token can see the configured account, that account's name, its Pages project names, and whether aoforge-docs is present, and never prints an account id, a token or any 32-hex string"
    - "With no CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID it prints that the secrets are not available and exits 0 without calling the API; an API or network error is reported and also exits 0 (the deploy step stays the gate)"
    - "docs.yml runs that diagnostic before the deploy (on pushes, dispatches and same-repository pull requests), deploys to `--branch=$DEPLOY_BRANCH` from `github.ref_name` so a dispatch from a non-main branch makes a preview, and names the project once in a workflow-level PAGES_PROJECT"
    - "No test calls the network: fetch is injected"
  artifacts:
    - path: scripts/ci-cloudflare-target.cjs
      provides: "scrub, summarizeTarget (pure), main with injected env/fetch"
      exports: ["scrub", "summarizeTarget", "main"]
    - path: scripts/ci-cloudflare-target.test.cjs
      provides: "Test list cases 1-10, no network"
    - path: .github/workflows/docs.yml
      provides: "Deploy-target diagnostic step; preview-safe deploy branch"
  key_links:
    - from: .github/workflows/docs.yml
      to: scripts/ci-cloudflare-target.cjs
      via: "run: node scripts/ci-cloudflare-target.cjs --project \"$PAGES_PROJECT\""
      pattern: "ci-cloudflare-target.cjs"
    - from: .github/workflows/docs.yml
      to: "Cloudflare Pages project aoforge-docs"
      via: "wrangler pages deploy --project-name=$PAGES_PROJECT --branch=$DEPLOY_BRANCH"
      pattern: "PAGES_PROJECT"
---

# TRD 74-02: Name the Cloudflare deploy target in the docs workflow (diagnostic + preview-safe deploy)

<objective>
Every docs deploy from `main` since 2026-09-27 has failed with `Project not found [code: 8000007]`. That includes
`devflow-docs`, a project that exists in the "AOCyber Systems" account. The lead (todo
`2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main`) is that the org secret
`CLOUDFLARE_ACCOUNT_ID` names another account, or the org `CLOUDFLARE_API_TOKEN` cannot see this one. Nobody can read a
secret back, so this TRD adds a read-only step that makes CI say which account it deploys to, by name, without printing
ids or tokens. It also makes a dispatch from a non-main branch deploy a preview, not production. Without that, the
pre-merge check in TRD 74-06 would overwrite production.

Purpose: OPS-03. The diagnostic decides whether the user must correct credentials (TRD 74-06). The workflow edit reaches
`main` through TRD 74-04/74-08.
Output: `scripts/ci-cloudflare-target.cjs` (+ tests, fixtures) and the docs.yml edit. Nothing live.
</objective>

<file_tree>
scripts/
├── ci-cloudflare-target.cjs            ← CREATE
├── ci-cloudflare-target.test.cjs       ← CREATE
└── __fixtures__/
    └── cloudflare-api-fixtures.cjs     ← CREATE
.github/workflows/
└── docs.yml                            ← MODIFY
</file_tree>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/todos/pending/2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main.md

Resolved intent: kind plugin, work feature, tdd strict, test_list_first required, fixture_strategy generators (Task 1
builds the fixture builders). Constraints: no_llm_test_data, no_property_based_default, no_gherkin_layer. One failing
test at a time.

Hard rules: no live step in this TRD (no workflow run, no Cloudflare call with real credentials, no push). AOForge never
reads, prints or types a token. Never port 8080.

**Commit discipline (TRD 74-04 cherry-picks these commits onto a branch off `origin/main`):** each code commit holds only
files from `files_modified`; never an `.aoforge/` file. Use `node ~/.claude/aoforge/bin/aof-tools.cjs commit "<type>(74-02): <msg>" --files <paths>`.

Facts read during planning (2026-10-10):
- docs.yml today: `on: push (main, path-filtered) | pull_request (site/**, scripts/gen-docs-data.cjs, .github/workflows/docs.yml) | workflow_dispatch`;
  `permissions: contents: read, deployments: write`; Node 20; the deploy step runs when
  `github.event_name != 'pull_request' && github.repository == 'AO-Cyber-Systems/aoforge-claude'` with env
  CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / CLOUDFLARE_API_KEY / CLOUDFLARE_EMAIL from secrets, and runs
  `npx --yes wrangler@4 pages deploy site/public --project-name=aoforge-docs --branch=main --commit-dirty=true`.
  `--branch=main` is hard-coded, so a dispatch from any branch deploys production.
- Repo secrets: none. Org secrets visible to this repo: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (both 2026-04-16),
  DATADOG_*, DIGITALOCEAN_ACCESS_TOKEN. CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL are not set anywhere (they resolve empty).
- Last main run 37937471480: wrangler 4.86.0, `/accounts/***/pages/projects/aoforge-docs` → 8000007. The token authenticates.
- The repository is public, so Actions logs are public. Print account and project names only; never ids (the 72-24
  SUMMARY truncated the account id for the same reason).
- Keep `--baseURL "https://devflow.cloud/"` (a preserved domain; moving it is TRD 74-08's decision).
- Cloudflare API v4 envelope: `{ success, errors: [{code, message}], messages, result }`. Endpoints:
  `GET /client/v4/accounts/{id}` (name), `GET /client/v4/accounts?per_page=50` (accounts the token can see),
  `GET /client/v4/accounts/{id}/pages/projects` (projects: `name`, `subdomain`, `domains[]`, `production_branch`).
  Header `Authorization: Bearer <token>`. Node 20 has global `fetch`.
</context>

<embedded_context>

<codebase_examples>
CLI shape from `scripts/ci-unit-gate.cjs`: pure exported functions, `main()`, `process.exitCode`, `module.exports`,
`if (require.main === module)`. Here `main` is async (fetch); call it with
`main().catch((e) => { console.error(e.message); process.exitCode = 0; })` so a diagnostic never fails the job.

Same-repository guard already used in this objective (TRD 74-01):
`github.repository == 'AO-Cyber-Systems/aoforge-claude' && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository)`.
</codebase_examples>

<anti_patterns>
- Never print an account id (32 lowercase hex), the token, an email, or the name of any account other than the
  configured one (print only a count of the others).
- Never interpolate `${{ github.ref_name }}` or any `${{ }}` expression straight into a `run:` script (CodeQL
  actions/code-injection, objective 54 cleaned these up). Pass it through `env:` and quote the variable.
- Do not make the diagnostic fail the job; the deploy step is the gate.
- Do not remove CLOUDFLARE_API_KEY/CLOUDFLARE_EMAIL from the deploy env (out of scope; harmless when empty).
- No real project or account names from the Cloudflare account in test fixtures, and never the legacy product word (the
  rename guard scans every tracked file). Use neutral names: `example-site`, `aoforge-docs`, `Example Account`.
</anti_patterns>

<error_recovery>
- actionlint reports a shellcheck finding in a changed `run:` block: fix it in place.
- `node --test scripts/workflow-permissions.test.cjs` fails after the edit: the top-level `permissions:` block must stay
  exactly as it is (`contents: read`, `deployments: write`).
</error_recovery>

</embedded_context>

## Test list

`scripts/ci-cloudflare-target.test.cjs`, outermost first. `main(argv, { env, fetch, out, err })` with a fake `fetch`
built from the fixture module; no case touches the network.

CLI `main`:
1. No CLOUDFLARE_API_TOKEN or no CLOUDFLARE_ACCOUNT_ID → prints "Cloudflare secrets are not available to this run (a
   fork's pull request, or unset): nothing to check", exitCode 0, fetch never called.
2. Account visible, projects listed, aoforge-docs present → lines name the configured account, the count of other
   visible accounts, the project names, and "aoforge-docs: present"; exitCode 0.
3. aoforge-docs absent → "aoforge-docs: ABSENT in this account" plus the creation hint (Pages, Create, Direct upload,
   production branch main).
4. The configured account is not among the accounts the token can see → "the token cannot see the configured account"
   and the projects call's error code.
5. The projects call returns `success: false` with `errors: [{ code: 10000, message: 'Authentication error' }]` → "Pages
   projects could not be listed: code 10000 Authentication error"; exitCode 0.
6. fetch throws (network down) → "Cloudflare API unreachable: <message>"; exitCode 0.
7. In every case above, the combined stdout+stderr contains neither the fixture account id, nor the fixture token, nor
   any `/[0-9a-f]{32}/` match.
8. Missing `--project` → usage on stderr, exitCode 1.
9. Each request carries `Authorization: Bearer <token>` and targets the three documented endpoints (assert on the
   fake fetch's recorded calls).

Pure:
10. `scrub(text, secrets)` replaces every 32-hex run with `<id>` and every given secret string with `<redacted>`,
    including inside a Cloudflare error message that echoes the URL.

<tasks>

<task type="auto">
  <name>Task 1: Fixture builders for Cloudflare API responses</name>
  <files>scripts/__fixtures__/cloudflare-api-fixtures.cjs</files>
  <action>
Hand-written builder functions (no randomness, no recorded real responses):
`ACCOUNT_ID = 'a'.repeat(32)` style constants for the configured and an other account (distinct 32-hex strings),
`TOKEN = 'cf-test-token-not-real'`;
`envelope(result, { success = true, errors = [] } = {})`;
`accountResponse(name = 'Example Account')`; `accountsResponse(list)` from `[{ id, name }]`;
`projectsResponse(names)` building `{ name, subdomain: name + '.pages.dev', domains: [], production_branch: 'main' }`;
`errorResponse(code, message)`;
`fakeFetch(routes)`: returns an async function `(url, init) => ({ ok, status, json: async () => body })` that looks up
the path in `routes` (an object keyed by `/client/v4/...` path without query) and records `{ url, headers }` in `.calls`;
an unrouted path returns a 404 envelope; a route value `Error` makes it throw.
Commit `test(74-02): add Cloudflare API fixture builders`.
  </action>
  <verify>node -e "const f=require('./scripts/__fixtures__/cloudflare-api-fixtures.cjs'); console.log(Object.keys(f).join(','))" lists the builders</verify>
  <done>The builder module exists, is deterministic, and is committed alone.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: scripts/ci-cloudflare-target.cjs, the read-only deploy-target report</name>
  <files>scripts/ci-cloudflare-target.cjs, scripts/ci-cloudflare-target.test.cjs</files>
  <action>
Strict TDD through the Test list (cases 1-10), RED commit then GREEN commit (`test(74-02): ...`, `feat(74-02): ...`).

```
scrub(text, secrets=[]) -> text with /[0-9a-f]{32}/g -> '<id>' and each non-empty secret -> '<redacted>'
summarizeTarget({ account, accounts, projects }, { accountId, project }) -> { lines[], accountVisible, projectPresent }
  account:  envelope of GET accounts/{id}            (name, or error code)
  accounts: envelope of GET accounts?per_page=50      (visible = result.some(a => a.id === accountId); others = count - 1)
  projects: envelope of GET accounts/{id}/pages/projects (names; present = names.includes(project))
  every line passes through scrub(…, [accountId, token]) before it is returned
main(argv, { env, fetch, out, err }) async
  --project <name> required (usage -> exitCode 1)
  token/accountId absent -> "not available" line, exitCode 0, no fetch
  fetch the three endpoints (each wrapped: a throw becomes { error }); print "cloudflare target:" header + lines
  exitCode 0 always (diagnostic); the deploy step is the gate
# CRITICAL: compare ids internally; never print them. Unit test 7 asserts it.
```
Output prefix every line with `cloudflare target: ` so TRD 74-06 can grep the run log for it.
  </action>
  <verify>node --test scripts/ci-cloudflare-target.test.cjs (10 pass); env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID node scripts/ci-cloudflare-target.cjs --project aoforge-docs; echo "exit=$?" (not-available line, exit=0)</verify>
  <done>All cases pass with an injected fetch; no id or token can reach the output.</done>
</task>

<task type="auto">
  <name>Task 3: docs.yml runs the diagnostic and deploys preview-safe</name>
  <files>.github/workflows/docs.yml</files>
  <action>
Edit `.github/workflows/docs.yml` (keep everything else, including the header, permissions and baseURL):
1. Add `scripts/ci-cloudflare-target.cjs` to both the `push.paths` and `pull_request.paths` lists.
2. Add `PAGES_PROJECT: 'aoforge-docs'` under the top-level `env:` (beside HUGO_VERSION).
3. After "Build", before "Deploy to Cloudflare Pages", add:
```yaml
      # Names the Cloudflare account and Pages projects this deploy targets, by name only:
      # no account id and no token reach the (public) log (objective 74, OPS-03). Read-only,
      # and it never fails the job; the deploy step below is the gate.
      - name: Show the Cloudflare deploy target
        if: github.repository == 'AO-Cyber-Systems/aoforge-claude' && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository)
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        run: node scripts/ci-cloudflare-target.cjs --project "$PAGES_PROJECT"
```
4. In the deploy step: add `DEPLOY_BRANCH: ${{ github.ref_name }}` to its `env:`, change the command to
   `--project-name="$PAGES_PROJECT" --branch="$DEPLOY_BRANCH" --commit-dirty=true`, and rewrite its comment: deploys run
   from pushes to main (production) and from manual dispatches (production on main, a preview deployment on any other
   branch); a pull request only builds.
Commit `ci(74-02): name the Cloudflare deploy target and deploy previews from non-main branches`.
  </action>
  <verify>actionlint .github/workflows/docs.yml (clean); node --test scripts/workflow-permissions.test.cjs (passes); rg -n -e 'PAGES_PROJECT' -e 'DEPLOY_BRANCH' -e 'ci-cloudflare-target' .github/workflows/docs.yml (all present); rg -n -F 'github.ref_name }}' .github/workflows/docs.yml (only on an env line)</verify>
  <done>docs.yml carries the diagnostic, the preview-safe branch, and one project-name source; lint and the permissions guard pass.</done>
  <recovery>If the edit breaks the YAML, `git checkout -- .github/workflows/docs.yml` and redo it with targeted Edit calls.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test scripts/ci-cloudflare-target.test.cjs scripts/workflow-permissions.test.cjs` passes; `actionlint .github/workflows/docs.yml` clean.
- `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` passes (no legacy word in new files).
- Every `(74-02)` code commit touches only `files_modified` paths (`git show --name-only --format= <sha>`).
- `npm test` passes, apart from the failures already known on this branch, which the SUMMARY names.
</verification>

<success_criteria>
- The next docs run (TRD 74-04's pull request, TRD 74-06's dispatch) will say which account the secrets point at, by name.
- A dispatch from the ops branch can no longer overwrite production.
</success_criteria>

<output>
After completion, write `74-02-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 74-02 --from <draft>`,
listing every code commit SHA (TRD 74-04 cherry-picks exactly those).
</output>
