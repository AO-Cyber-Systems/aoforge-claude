---
objective: 74-operations-decisions
trd: "05"
type: standard
wave: 3
depends_on: ["74-04"]
files_modified:
  - "(none: a GitHub Actions secret set by the user, and one approved workflow re-run)"
autonomous: false
requirements: [OPS-01]
user_setup:
  - service: anthropic
    why: "The live visual judge in CI calls the Anthropic Messages API"
    env_vars:
      - name: ANTHROPIC_API_KEY
        source: "Anthropic Console -> API keys (or a gateway token as ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL); set as a GitHub Actions secret on AO-Cyber-Systems/aoforge-claude"
must_haves:
  truths:
    - "The user set the credential themselves; AOForge confirmed only that a secret named ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) is available to the repository, by name, and never saw, typed or read its value"
    - "After a separately approved re-run, the `live visual judge` job on the ops pull request concluded success, and its log shows gate=binding, evidence=vision for both states, docs-home-broken judged broken, and a non-zero token count"
  artifacts: []
  key_links:
    - from: "repository secret ANTHROPIC_API_KEY"
      to: .github/workflows/visual-judge.yml
      via: "env: ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}"
      pattern: "secrets.ANTHROPIC_API_KEY"
---

# TRD 74-05: The user sets the ANTHROPIC secret; the live judge runs on the pull request (gates)

<objective>
OPS-01, first half. The secret has been "pending" since v1.3 (32-03 Task 3, 32-VERIFICATION D1). This TRD stops for the
user to set it, then confirms it exists by name only. Behind a second approval it re-runs the ops PR's visual-judge job,
so the live model is proven on the fixtures before anything reaches `main`. The push-to-main run, which closes success
criterion 1, happens at the merge in TRD 74-08.

Purpose: OPS-01 ("the user has set the ANTHROPIC secret (AOForge never sees the value)").
Output: the secret's existence (by name) and a green live-judge run on the PR, both recorded.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/74-operations-decisions/74-04-SUMMARY.md

## Approval protocol

The same as TRD 74-04. All gates are `checkpoint:human-action` (the config runs yolo with auto_advance, where a decision
auto-selects its first option). Record the user's literal replies. `approved` runs the listed commands once. `done`
verifies only. Anything else holds. One plain command per Bash call. Never port 8080.

**Secret handling (locked):** AOForge never sees, types, pastes or reads a secret value. The user sets it through the
GitHub UI or their own terminal. Verification checks only that the name exists. Never suggest `gh secret set ... --body <value>`
or any command line that would carry the value into this session, and never ask the user to paste it into chat.

Facts read during planning (2026-10-10): `gh secret list --repo AO-Cyber-Systems/aoforge-claude` is empty;
`gh api repos/AO-Cyber-Systems/aoforge-claude/actions/organization-secrets` lists CLOUDFLARE_*, DATADOG_*,
DIGITALOCEAN_ACCESS_TOKEN, and no ANTHROPIC_*. The workflow (74-01) reads `secrets.ANTHROPIC_API_KEY`,
`secrets.ANTHROPIC_AUTH_TOKEN` and `secrets.ANTHROPIC_BASE_URL || vars.ANTHROPIC_BASE_URL`; the judge needs either
the API key, or an auth token plus a base URL (an AOSentry-style gateway).
</context>

<embedded_context>

<codebase_examples>
Reading a run's summary narrowly (no full log dump into context):
`gh run view <id> --repo AO-Cyber-Systems/aoforge-claude --log`, then filter with
`rg -e 'live visual judge:' -e 'docs-home' -e 'tokens:' -e '^.*(PASS|FAIL|WARN)'`.
</codebase_examples>

<anti_patterns>
- Never print an env var, never run `gh secret set`, never read a secret.
- Never weaken `scripts/ci-visual-judge.cjs` to make a run pass. A disagreement with the labels is a finding, not a bug
  to hide.
- Never trigger a run on `main` here; the push-to-main run happens at the merge (TRD 74-08).
</anti_patterns>

<error_recovery>
- The run fails with "is not available to this run": the secret is missing or named differently, or it is an org secret
  not granted to this repository. Re-check the names (Task 1 verify) and ask the user; nothing else changes.
- The run fails on `api error` (401, 403, model not found): record the error line (it never contains the key). With a
  gateway, the model id from `references/model-profiles.json` (ui-evaluator, balanced tier) must be routable there. Ask the user.
- The run fails because the judge disagrees with a label. "docs-home-broken: the judge missed the known defect" means
  the broken fixture is too subtle. Make it more blatant in TRD 74-01's files on this branch, commit `fix(74-01): ...`,
  cherry-pick onto the ops worktree, and ask for a new push approval (the Task 2 gate shape of TRD 74-04). A HIGH defect
  on docs-home means a real rendering problem may exist; record the defects and ask the user.
- The user declines to set the secret: record "OPS-01 declined by the user". In that case the visual-judge commits must
  leave the ops branch before the merge (a `git -C <wt> revert` of those commits, behind a new push approval), or `main`
  would turn red on every push. Record it, and TRD 74-08 merges without them.
</error_recovery>

</embedded_context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: The user sets the ANTHROPIC credential as a GitHub Actions secret</name>
  <files>(none: GitHub repository settings, done by the user)</files>
  <action>
STOP and present: "The live visual judge in CI needs an Anthropic credential. Please set it yourself; I never see it.
- Name: `ANTHROPIC_API_KEY`. For a gateway instead: `ANTHROPIC_AUTH_TOKEN` as a secret plus `ANTHROPIC_BASE_URL` as a
  secret or an Actions variable.
- Scope (your choice): a repository secret on AO-Cyber-Systems/aoforge-claude (recommended: only this repo gets it),
  or an organization secret granted to this repository.
- How: GitHub → the repository → Settings → Secrets and variables → Actions → New repository secret. Or, in your own
  terminal: `gh secret set ANTHROPIC_API_KEY --repo AO-Cyber-Systems/aoforge-claude`, which prompts for the value with
  hidden input. Please do not paste the value here or pass it with `--body`.
- Cost: each run makes 6 vision calls (two screenshots, three samples each), a few cents, on every push to main and on
  PRs that touch the judge.
Reply `done` when it is set, `declined` to leave OPS-01 open, or anything else to hold."
  </action>
  <instructions>Set ANTHROPIC_API_KEY (or the gateway pair) as an Actions secret yourself.</instructions>
  <verification>The secret name is visible to the repository (values are never readable).</verification>
  <resume-signal>Reply "done", "declined", or anything else to hold.</resume-signal>
  <verify>gh secret list --repo AO-Cyber-Systems/aoforge-claude --json name --jq '.[].name' (and, for an org secret, gh api repos/AO-Cyber-Systems/aoforge-claude/actions/organization-secrets --jq '.secrets[].name') lists ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN</verify>
  <done>Reply recorded; the secret name is confirmed present (or the decline/hold is recorded with error_recovery's consequence).</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate: re-run the live visual judge on the ops pull request</name>
  <files>(none: one GitHub Actions re-run)</files>
  <action>
Skip if Task 1 did not end in `done`. Read-only first: `gh run list --repo AO-Cyber-Systems/aoforge-claude --workflow visual-judge.yml --branch ops/74-ci-operations --limit 1 --json databaseId,conclusion,url`.
STOP and present: "Approve re-running the live visual judge on the PR (6 vision calls)? Command:
`gh run rerun <id> --repo AO-Cyber-Systems/aoforge-claude`. Reply `approved`, `done`, or anything else to hold."
On `approved` run it once. Then `gh run watch <id> --repo AO-Cyber-Systems/aoforge-claude --exit-status`, and read the
summary lines from the log (codebase_examples). Record the model, the per-state verdict, is_broken, votes and evidence,
the token totals, and any WARN lines.
  </action>
  <instructions>Let CI make its first real vision calls, on the PR, before anything merges.</instructions>
  <verification>The re-run concluded `success`, and its log shows gate=binding, two states with evidence=vision, docs-home-broken is_broken=true, and tokens input greater than 0.</verification>
  <resume-signal>Reply "approved", "done", or anything else to hold.</resume-signal>
  <verify>gh run view <id> --repo AO-Cyber-Systems/aoforge-claude --json conclusion,url</verify>
  <done>Reply recorded; a green live-judge run on the PR with its summary lines in the SUMMARY (or the failure and the error_recovery path taken).</done>
</task>

</tasks>

<verification>
- The SUMMARY records both replies, the secret name and scope (never a value), the run URL, and the judge's summary lines.
</verification>

<success_criteria>
- The credential exists where CI can use it, AOForge never handled it, and the live model has judged the fixtures green on the PR.
</success_criteria>

<output>
After completion, write `74-05-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 74-05 --from <draft>`.
</output>
