---
objective: 72-install-and-naming-cleanup
trd: "24"
type: standard
wave: 16
depends_on: ["72-23"]
files_modified:
  - "AOCyberAI-Ops/vanity modules.yaml (in a scratch clone, outside this repo)"
autonomous: false
requirements: [INST-06]
must_haves:
  truths:
    - "A branch in a scratch clone of `AOCyberAI-Ops/vanity` adds an `aoforge-claude` entry to `modules.yaml` in the file's own format (visibility `public`, upstream `AO-Cyber-Systems/aoforge-claude` on the current legacy host), keeps any existing `devflow-claude` entry, and passes the repository's own tests if it has any"
    - "The branch was pushed and a DRAFT pull request opened only after the user's explicit approval; the PR is left for the user to review and merge (supply-chain sensitive: never merged, never marked ready by AOForge); if the vanity repository does not exist or is not accessible, that is recorded and a todo is filed instead"
    - "The Cloudflare Pages project `aoforge-docs` exists (created by the user, or by a command the user approved using the user's own authenticated wrangler; AOForge never enters a token), and after a separately listed, approved docs workflow run on main the deploy result is recorded"
  artifacts: []
  key_links:
    - from: ".github/workflows/docs.yml (project-name aoforge-docs)"
      to: "Cloudflare Pages project aoforge-docs"
      via: "wrangler pages deploy on push to main"
      pattern: "aoforge-docs"
---

# TRD 72-24: Draft the vanity-mapping PR and stand up the `aoforge-docs` Pages project (approval gates)

<objective>
Two external surfaces outside this repository: the git.aocyber.ai vanity mapping (the Worker's `modules.yaml` in
`AOCyberAI-Ops/vanity`) needs an `aoforge-claude` entry, drafted as a PR for the user to review and merge; and the docs
workflow now deploys to the Pages project `aoforge-docs`, which the user creates (Pages projects cannot be renamed).

Purpose: INST-06 (vanity mapping PR; Pages project).
Output: a draft PR in the vanity repo (or a recorded blocker and todo); the Pages project and a recorded deploy.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Facts (from `~/dev/github-enterprise-migration/VANITY-IMPORTS.md`, decided 2026-09-28, "not yet deployed"): one
Cloudflare Worker serves go.aocyber.ai and git.aocyber.ai from `modules.yaml` in `AOCyberAI-Ops/vanity`, format
`<name>: <visibility> <host> <owner>/<repo>  # comment`; `host` defaults to github.com; the repo requires PR review
(CODEOWNERS = founders/architects). devflow-claude is a public repo. The user's global rule: the mapping is supply-chain
sensitive and needs PR review; do not mass-rewrite import paths.

## Approval protocol

Human-action checkpoints; literal replies recorded; `approved` runs the exact listed commands once; `done` verifies
only; anything else holds. One plain command per Bash call. Never port 8080. Never enter, echo or store a Cloudflare
token or any secret.
</context>

<embedded_context>

<codebase_examples>
A commit in a repository that is not an AOForge project uses the inline escape the commit gate documents:
`AOFORGE_ALLOW_RAW_COMMIT=1 git -C <scratch>/vanity commit -m "feat(mapping): add aoforge-claude"`.
</codebase_examples>

<anti_patterns>
- Never merge the vanity PR, mark it ready, or push to its default branch.
- Never remove the devflow-claude entry (a separate decision).
- Never create a repository named devflow-claude anywhere.
- Never run wrangler with a token you supply; only the user's own authenticated session, and only after approval.
</anti_patterns>

<error_recovery>
- `gh repo view AOCyberAI-Ops/vanity` fails (missing or no access): record it, run
  `aof-tools todo add "Add aoforge-claude to the vanity modules.yaml (git.aocyber.ai) once AOCyberAI-Ops/vanity exists"`,
  skip Task 2, continue to Task 3.
- The repo's tests need tooling not installed: record that; the PR description says the tests were not run locally.
- `wrangler whoami` shows no login: the user creates the project in the dashboard and replies `done`.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Prepare the vanity-mapping change in a scratch clone</name>
  <files>(scratch clone only)</files>
  <action>
`gh repo view AOCyberAI-Ops/vanity --json nameWithOwner,defaultBranchRef` (error_recovery if it fails);
`gh repo clone AOCyberAI-Ops/vanity <scratch>/vanity`; `git -C <scratch>/vanity switch -c add-aoforge-claude`; read
`modules.yaml` and its README/tests narrowly; add `aoforge-claude: public github.com AO-Cyber-Systems/aoforge-claude`
in the file's alignment and order (next to a devflow-claude entry if present, with a comment
`# renamed from devflow-claude (AOForge 3.0.0)`); run its tests if any; commit with the inline escape
(codebase_examples). Record `git -C <scratch>/vanity show --stat HEAD` and the diff for Task 2.
  </action>
  <verify>git -C <scratch>/vanity diff HEAD~1 -- modules.yaml shows exactly one added entry (and its comment)</verify>
  <done>The change is ready locally (or the blocker and todo are recorded).</done>
  <recovery>If the format differs from the documented one, follow the file, not the doc; say so in the PR body.</recovery>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate: push the branch and open a DRAFT PR in AOCyberAI-Ops/vanity</name>
  <files>(none: live GitHub operations)</files>
  <action>
Skip with `blocked: vanity repo unavailable` if Task 1 recorded the blocker. Otherwise STOP and present the diff and:
"Approve publishing a draft PR? Commands (both, in order): `git -C <scratch>/vanity push origin add-aoforge-claude` then
`gh pr create --repo AOCyberAI-Ops/vanity --draft --base <default> --head add-aoforge-claude --title "Add aoforge-claude
to the vanity mapping" --body-file <path>`. The PR stays a draft for your review; I never merge it. Reply `approved`,
`done`, or anything else to hold." (The body: what and why, the rename, that devflow-claude keeps redirecting, tests run
or not; ends with the attribution line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.)
  </action>
  <instructions>A draft PR for the git.aocyber.ai mapping; you review and merge it.</instructions>
  <verification>`gh pr view --repo AOCyberAI-Ops/vanity add-aoforge-claude --json isDraft,state` shows a draft, OPEN.</verification>
  <resume-signal>Reply "approved" (I push and open the draft), "done", or anything else to hold.</resume-signal>
  <verify>gh pr view --repo AOCyberAI-Ops/vanity add-aoforge-claude --json isDraft,state,url</verify>
  <done>Reply recorded; draft PR URL in the SUMMARY (or held/blocked).</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Approval gate: the aoforge-docs Pages project and one docs deploy</name>
  <files>(none: Cloudflare and GitHub Actions)</files>
  <action>
Pre-checks: `rg -n "project-name" .github/workflows/docs.yml` (aoforge-docs); `npx --yes wrangler@4 whoami` (whether the
user's own session is logged in; never pass a token). STOP and present: "The docs workflow deploys to the Pages project
aoforge-docs, which does not exist yet (Pages projects cannot be renamed; devflow-docs, if it exists, is left for you to
delete). Either create it yourself in the Cloudflare dashboard (Pages -> Create -> Direct upload, name aoforge-docs,
production branch main) and reply `done`, or approve me running, with your logged-in wrangler: `npx --yes wrangler@4
pages project create aoforge-docs --production-branch main`, followed by one docs deploy: `gh workflow run docs.yml --repo
AO-Cyber-Systems/aoforge-claude --ref main`. Reply `approved`, `done`, or anything else to hold." After `done`, ask
separately before triggering the deploy.
  </action>
  <instructions>Create the aoforge-docs Pages project (or let me, with your own wrangler login), then run one deploy.</instructions>
  <verification>The project exists; the docs run on main concluded (success recorded, or the failure tail recorded for objective 74).</verification>
  <resume-signal>Reply "approved", "done", or anything else to hold.</resume-signal>
  <verify>gh run list --repo AO-Cyber-Systems/aoforge-claude --workflow docs.yml --limit 1 --json conclusion,status,url</verify>
  <done>Reply recorded; project exists; deploy outcome recorded (a token or account problem is objective 74's OPS-03).</done>
</task>

</tasks>

<verification>
- The SUMMARY records the vanity PR URL (or blocker + todo), the Pages project state and the docs run.
</verification>

<success_criteria>
- The vanity mapping change awaits the user's review, and the docs site has its AOForge Pages project.
</success_criteria>

<output>
After completion, create `72-24-SUMMARY.md` in the objective directory through `aof-tools summary post`.
</output>
