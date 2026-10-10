---
objective: 74-operations-decisions
trd: "07"
type: standard
wave: 5
depends_on: ["74-03", "74-06"]
files_modified:
  - .github/rulesets/main.json
autonomous: false
requirements: [OPS-02]
must_haves:
  truths:
    - "The user approved the exact text of `.github/rulesets/main.json` as shown verbatim in the gate. If they asked for a variant, the edited file was committed and shown again in full, and approved afresh"
    - "The ruleset was created with one `gh api --method POST .../rulesets --input .github/rulesets/main.json`, run once after that approval"
    - "`node scripts/ruleset-check.cjs compare --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json` exits 0 against the read-back"
    - "`gh api repos/AO-Cyber-Systems/aoforge-claude/rules/branches/main` lists deletion, non_fast_forward, pull_request and required_status_checks from the new ruleset, so main requires the check and rejects force-push"
  artifacts:
    - path: .github/rulesets/main.json
      provides: "The approved ruleset text (unchanged unless the user asked for a variant)"
  key_links:
    - from: .github/rulesets/main.json
      to: "GitHub ruleset 'aoforge: default branch' on AO-Cyber-Systems/aoforge-claude"
      via: "gh api --method POST repos/AO-Cyber-Systems/aoforge-claude/rulesets --input .github/rulesets/main.json"
      pattern: "rulesets"
---

# TRD 74-07: Apply the `main` ruleset after the user approves its exact text (gate)

<objective>
OPS-02. `main` has no protection today: no classic branch protection and no repository ruleset. TRD 74-03 wrote the
ruleset as a file and proved its one required check reports on every pull request into `main`. This TRD refreshes that
proof, shows the user the file verbatim, applies it once after their approval, and reads it back. It runs before the
ops PR merges, so the merge in TRD 74-08 is the first to pass through it.

Purpose: OPS-02 ("applied only after the user approves the exact ruleset"; success criterion 2's read-back match).
Output: an active ruleset on `main`, its id and URL, and a matching read-back.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/74-operations-decisions/74-03-SUMMARY.md
@.github/rulesets/main.json

## Approval protocol

The same as TRD 74-04. Every gate is `checkpoint:human-action`. Record the user's literal replies. `approved` runs the
listed command once. Anything else holds. Approval covers the exact file text shown and nothing else; any edit needs a
fresh approval of the new full text. One plain command per Bash call.

What the file does, in plain words (for the gate):
- It applies to the default branch (`main`) of this repository only. The org's "Private Repos" ruleset is separate and untouched.
- **No force-push and no deletion of `main`, for anyone.** The one bypass actor (repository admins) is in
  `pull_request` mode. That lets an admin merge a pull request without the checks (`gh pr merge --admin`), but not push
  directly, and not force-push.
- **Changes reach `main` only through a pull request** (0 approvals required: solo maintainer).
- **The unit suite must pass:** `test (npm test, gated)`, pinned to GitHub Actions (app 15368), the job `test.yml`
  built to be required ("OUT OF BAND: this job must be added to branch protection as a REQUIRED check"). It is not
  strict: a branch need not be up to date with `main` first.
- Not required, on purpose: the Agent shell harness (`harness`) and the Docs site `build`. Both are path-filtered, so they
  never report on most PRs and would block every merge. The live visual judge is the same: path-filtered, and secret-bound.
- Tags are not affected (`git push origin vX.Y.Z` still works). Release PRs merge as before.
- PR #129's unit suite is red today (E2E1 reconcile drift). After this, it merges only when that is green or through the
  admin route.
- Named `aoforge: default branch` like `aof-tools gh setup`'s ruleset, so enabling the GitHub integration later updates
  this ruleset instead of adding a second one.

Variants the user may ask for: `no-bypass` (empty `bypass_actors`: nobody can merge a PR with failing checks), or
`codeql` (also require `Analyze (actions)`, `Analyze (javascript-typescript)`, `Analyze (ruby)` @15368, which reported
on all sampled PRs in 74-03).
</context>

<embedded_context>

<anti_patterns>
- Never send PUT, PATCH or DELETE to a ruleset, and never POST twice. A wrong read-back is reported, not "fixed" without
  a new approval.
- Never add `harness`, `build`, `live visual judge` or `aoforge/*` as required contexts.
- Never change the org ruleset or the repository's merge settings.
</anti_patterns>

<error_recovery>
- POST returns 422 (validation): record the message verbatim. Fix the file only if it names a field, re-run
  `node --test scripts/ruleset-check.test.cjs`, commit, and show the full text again for a fresh approval.
- The read-back differs (a difference, not a server default): record it and STOP; offer the user the rollback
  `gh api --method DELETE repos/AO-Cyber-Systems/aoforge-claude/rulesets/<id>` as its own approval.
- A ruleset with the same name already exists (someone created it meanwhile): do not POST; run `compare` and show the user.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Refresh the read-only proof that the required check reports</name>
  <files>(none: read-only)</files>
  <action>
1. `gh pr list --repo AO-Cyber-Systems/aoforge-claude --base main --state all --limit 3 --json number`. This sample
   includes the ops PR from TRD 74-04.
2. `node scripts/ruleset-check.cjs checks --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json --prs <numbers>`. Expect exit 0.
3. `gh api repos/AO-Cyber-Systems/aoforge-claude/rulesets`. Expect only "Private Repos" (no repository ruleset with our name).
4. `gh api repos/AO-Cyber-Systems/aoforge-claude/rules/branches/main`. This is the before picture.
5. `node --test scripts/ruleset-check.test.cjs`. The record test still passes.
  </action>
  <verify>checks exits 0; no repository ruleset named "aoforge: default branch" exists yet; the before picture is recorded</verify>
  <done>The text about to be shown is still safe to apply.</done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate: the exact ruleset text, then one POST</name>
  <files>.github/rulesets/main.json</files>
  <action>
STOP and present the full output of `cat .github/rulesets/main.json` verbatim in a json block, the plain-words list
from <context>, and: "Approve applying exactly this ruleset to main? Command:
`gh api --method POST repos/AO-Cyber-Systems/aoforge-claude/rulesets --input .github/rulesets/main.json`. Reply
`approved`, `variant: no-bypass`, `variant: codeql`, a described edit, or anything else to hold."
- `approved` → run the command once and record the returned `id` and `_links.html.href`.
- A variant or edit → edit the file, run `node --test scripts/ruleset-check.test.cjs` (adjust case 11 only where the
  variant changes what it pins, e.g. an empty bypass list is still allowed), commit with
  `node ~/.claude/aoforge/bin/aof-tools.cjs commit "chore(74-07): <variant> ruleset text" --files .github/rulesets/main.json scripts/ruleset-check.test.cjs`,
  then present the new full text again and ask again. Nothing is applied until an `approved` on the text shown.
- Anything else → hold and record.
  </action>
  <instructions>Approve the exact text; I apply it once.</instructions>
  <verification>The POST returned an id; the text applied is byte-for-byte the text last shown.</verification>
  <resume-signal>Reply "approved", a variant, or anything else to hold.</resume-signal>
  <verify>gh api repos/AO-Cyber-Systems/aoforge-claude/rulesets --jq '.[] | select(.name == "aoforge: default branch") | .id'</verify>
  <done>Reply (and every intermediate reply) recorded; the ruleset id and URL recorded, or the hold recorded.</done>
</task>

<task type="auto">
  <name>Task 3: Read the ruleset back and prove it matches</name>
  <files>(none: read-only)</files>
  <action>
Skip if Task 2 held.
1. `node scripts/ruleset-check.cjs compare --repo AO-Cyber-Systems/aoforge-claude --file .github/rulesets/main.json`. Expect exit 0, and record the server defaults it lists.
2. `gh api repos/AO-Cyber-Systems/aoforge-claude/rules/branches/main --jq '[.[] | {type, ruleset_id}]'`. Expect deletion,
   non_fast_forward, pull_request and required_status_checks carrying the new id, beside the org rules.
3. `gh api repos/AO-Cyber-Systems/aoforge-claude/rulesets/<id> --jq '.current_user_can_bypass'`. Expect `pull_requests_only`
   (with the default variant).
Do not test force-push live (destructive); the rule's presence and the bypass mode are the evidence.
  </action>
  <verify>compare exits 0; rules/branches/main lists the four rule types from the new ruleset id</verify>
  <done>Success criterion 2 holds: main requires the check, rejects force-push, and the read-back matches the approved text.</done>
</task>

</tasks>

<verification>
- The SUMMARY records the text approved (or the variant chain), the reply, the ruleset id and URL, the compare output,
  and the before/after `rules/branches/main`.
</verification>

<success_criteria>
- `main` is protected exactly as approved, verified by reading it back.
</success_criteria>

<output>
After completion, write `74-07-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 74-07 --from <draft>`.
</output>
