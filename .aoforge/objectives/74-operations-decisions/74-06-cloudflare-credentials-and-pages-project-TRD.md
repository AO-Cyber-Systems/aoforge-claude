---
objective: 74-operations-decisions
trd: "06"
type: standard
wave: 4
depends_on: ["74-04", "74-05"]
files_modified:
  - "(none: Cloudflare and GitHub settings changed by the user, and one approved preview deploy)"
autonomous: false
requirements: [OPS-03]
user_setup:
  - service: cloudflare
    why: "The docs workflow deploys site/public to the Pages project aoforge-docs"
    env_vars:
      - name: CLOUDFLARE_API_TOKEN
        source: "Cloudflare dashboard -> My Profile -> API Tokens -> Create Token: Account / Cloudflare Pages / Edit for account 'AOCyber Systems' (Account Settings / Read optional, lets the diagnostic name the account)"
      - name: CLOUDFLARE_ACCOUNT_ID
        source: "Cloudflare dashboard -> AOCyber Systems -> Account ID (right sidebar of Workers & Pages)"
    dashboard_config:
      - task: "Create Pages project aoforge-docs (Direct Upload), production branch main"
        location: "Cloudflare dashboard -> Workers & Pages -> Create -> Pages"
must_haves:
  truths:
    - "The account and token CI deploys with target the AOCyber Systems account with Pages edit access. This is either confirmed by the diagnostic as already true, or fixed by the user (repository-level overrides or corrected org secrets); AOForge never entered a token"
    - "The Pages project aoforge-docs exists in that account, created by the user, or by a single approved `wrangler pages project create` with the user's own login"
    - "After a separately approved dispatch from ops/74-ci-operations, the docs run shows `cloudflare target: ... aoforge-docs: present` and its deploy step succeeded as a preview deployment (not production)"
  artifacts: []
  key_links:
    - from: .github/workflows/docs.yml
      to: "Cloudflare Pages project aoforge-docs"
      via: "wrangler pages deploy --project-name=$PAGES_PROJECT --branch=$DEPLOY_BRANCH"
      pattern: "aoforge-docs"
---

# TRD 74-06: Point the docs deploy at the right Cloudflare account and create `aoforge-docs` (gates)

<objective>
OPS-03, the user's half. Every main docs run since 2026-09-27 failed with `Project not found [8000007]`. That
includes `devflow-docs`, which exists in the "AOCyber Systems" account, so CI's org secrets likely name another account
or a token that cannot see it. This TRD reads TRD 74-02's diagnostic from the ops PR's docs run and presents the
finding. The user then fixes the credentials if needed and creates `aoforge-docs`. Behind its own approval, one
dispatch from the ops branch proves the token and project with a preview deploy before the merge. The production deploy
on a push to `main` (success criterion 3) happens at the merge in TRD 74-08.

Purpose: OPS-03 ("the Cloudflare Pages project aoforge-docs exists, or the workflow's account and token are corrected
by the user").
Output: corrected or confirmed credentials, the Pages project, and a green preview deploy, all recorded.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/todos/pending/2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main.md
@.aoforge/objectives/74-operations-decisions/74-04-SUMMARY.md

## Approval protocol

The same as TRD 74-04. Every gate is `checkpoint:human-action`. Record the user's literal replies. `approved` runs the
listed commands once. `done` verifies only. Anything else holds. One plain command per Bash call. Never port 8080.
AOForge never enters, prints or reads a token. wrangler runs only on the user's own logged-in session, after approval.

Facts (2026-10-09/10):
- Org secrets CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (visibility ALL, set 2026-04-16); no repository secrets.
  CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL are unset.
- A repository secret overrides an organization secret of the same name for this repository only. That makes it the
  narrow fix: other repositories keep using the org values.
- AOCyber Systems (read-only API check by the orchestrator, 2026-10-09) holds aocyber-website, politihub-web,
  politihub-navigators-web, aodex-website and the old docs project that serves devflow.cloud; aoforge-docs does not exist.
- The user's wrangler session was logged out on 2026-10-09 (`Failed to fetch auth token: 400`).
- Pages projects cannot be renamed. Deleting the old docs project is the user's own decision and is not offered here.
- After TRD 74-02, a dispatch from a non-main branch deploys a preview (`--branch="$DEPLOY_BRANCH"`), never production.
</context>

<embedded_context>

<codebase_examples>
Read the diagnostic narrowly: `gh run view <id> --repo AO-Cyber-Systems/aoforge-claude --log`, then filter with
`rg 'cloudflare target:'`. Lines look like `cloudflare target: configured account "<name>" is visible to the token
(<k> other accounts)`, `cloudflare target: Pages projects (<n>): ...`, `cloudflare target: aoforge-docs: ABSENT in this account`.
</codebase_examples>

<anti_patterns>
- Never run `wrangler login`, never pass a token to wrangler, never create a token, never set a secret.
- Never deploy to production here; never dispatch docs.yml with `--ref main`.
- Never delete or rename a Pages project, and never move a custom domain here (TRD 74-08 asks about the domain).
</anti_patterns>

<error_recovery>
- The diagnostic printed "not available": the ops PR's docs run did not get secrets (only a fork's PR would not). Check
  `gh secret list` names and the run event, and record them.
- The diagnostic says the account is visible and projects list fine, yet aoforge-docs is ABSENT: the credentials are
  fine. Only the project is missing (case A).
- The preview deploy fails with 8000007 after the user says `done`: the project was created in a different account than
  the one the diagnostic names. Show both names and ask the user.
- The preview deploy fails with an authentication error (code 10000): the token lacks Pages edit. Ask the user to fix the
  token's permissions.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Read the diagnostic from the ops PR's docs run and classify the fix</name>
  <files>(none: read-only)</files>
  <action>
1. `gh run list --repo AO-Cyber-Systems/aoforge-claude --workflow docs.yml --branch ops/74-ci-operations --limit 1 --json databaseId,event,conclusion,url`
2. `gh run view <id> --repo AO-Cyber-Systems/aoforge-claude --log`, filtered with `rg 'cloudflare target:'` (codebase_examples).
3. `gh secret list --repo AO-Cyber-Systems/aoforge-claude --json name --jq '.[].name'` and
   `gh api repos/AO-Cyber-Systems/aoforge-claude/actions/organization-secrets --jq '.secrets[].name'` (names only).
Classify:
- **A**: the configured account is AOCyber Systems, visible, Pages projects list, aoforge-docs ABSENT → only the project is missing.
- **B**: the configured account is not AOCyber Systems, or is not visible, or Pages listing is denied → the credentials
  need correcting, and the project is missing.
- **C**: the account name cannot be read (Account Settings permission missing) but the projects listed include
  aocyber-website/aodex-website → treat as A. If the projects list is foreign or empty → B.
Record the lines and the class.
  </action>
  <verify>The SUMMARY quotes the "cloudflare target:" lines (no ids appear in them) and states A, B or C with the reason</verify>
  <done>The fix the user needs is known from evidence, not inference.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: The user corrects the credentials (if needed) and creates aoforge-docs</name>
  <files>(none: Cloudflare dashboard and GitHub settings, done by the user)</files>
  <action>
STOP and present the Task 1 lines, the class, and the steps for it:
"**If B:** create a Cloudflare API token with Account / Cloudflare Pages / Edit (Account Settings / Read optional, so the
check can name the account) for the AOCyber Systems account. Set it on this repository, either as repository secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (recommended: they override the org secrets for this repo only), or by
correcting the org secrets (this affects every repo that uses them). Use GitHub Settings → Secrets and variables →
Actions, or your own terminal (`gh secret set <NAME> --repo AO-Cyber-Systems/aoforge-claude` prompts with hidden input).
Please don't paste values here.
**In every case:** create the Pages project `aoforge-docs` in AOCyber Systems. In the dashboard: Workers & Pages → Create →
Pages → Direct upload, name `aoforge-docs`, production branch `main`. Or reply `approved` and I run, once, with *your*
wrangler login (run `npx wrangler login` yourself first): `npx --yes wrangler@4 whoami` to confirm the account, then
`npx --yes wrangler@4 pages project create aoforge-docs --production-branch main`.
Reply `done` (you did it all), `approved` (you set any secrets yourself and want me to create the project with your
login), or anything else to hold."
On `approved`: run `npx --yes wrangler@4 whoami`. If it is not logged in, or not into AOCyber Systems, stop and say so.
Otherwise run the create command once.
  </action>
  <instructions>Fix the deploy credentials if the check says so, and create the aoforge-docs Pages project.</instructions>
  <verification>Secret names present when B (values unreadable); the project is confirmed by Task 3's diagnostic.</verification>
  <resume-signal>Reply "done", "approved", or anything else to hold.</resume-signal>
  <verify>gh secret list --repo AO-Cyber-Systems/aoforge-claude --json name --jq '.[].name' (names only)</verify>
  <done>Reply recorded; whichever of secrets and project the user handled is recorded.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Approval gate: one preview deploy from the ops branch</name>
  <files>(none: one workflow dispatch)</files>
  <action>
Skip if Task 2 held. STOP and present: "Approve one docs run from the ops branch? It builds the site, prints the
Cloudflare target, and deploys a PREVIEW to aoforge-docs (branch ops/74-ci-operations, not production). Command:
`gh workflow run docs.yml --repo AO-Cyber-Systems/aoforge-claude --ref ops/74-ci-operations`. Reply `approved`, `done`,
or anything else to hold."
On `approved` run it once. Then find the run with
`gh run list --repo AO-Cyber-Systems/aoforge-claude --workflow docs.yml --branch ops/74-ci-operations --event workflow_dispatch --limit 1 --json databaseId`,
watch it with `gh run watch <id> --repo AO-Cyber-Systems/aoforge-claude --exit-status`, and read `cloudflare target:` and
`pages.dev` from the log with rg. Record the preview URL and `curl -sS -o /dev/null -w '%{http_code}' <preview URL>`.
  </action>
  <instructions>Prove token and project together with a preview, before the merge deploys production.</instructions>
  <verification>The run concluded success, the log shows "aoforge-docs: present", and the deploy step printed a *.aoforge-docs.pages.dev preview URL that answers 200.</verification>
  <resume-signal>Reply "approved", "done", or anything else to hold.</resume-signal>
  <verify>gh run view <id> --repo AO-Cyber-Systems/aoforge-claude --json conclusion,url</verify>
  <done>Reply recorded; a green preview deploy with its URL and HTTP status in the SUMMARY (or the failure and the error_recovery path taken).</done>
</task>

</tasks>

<verification>
- The SUMMARY records the diagnostic lines (before and after), the class, both replies, secret names (never values),
  the project's existence, and the preview run URL and HTTP status.
</verification>

<success_criteria>
- CI can deploy to aoforge-docs in the right account; the production deploy waits only for the merge.
</success_criteria>

<output>
After completion, write `74-06-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 74-06 --from <draft>`.
</output>
