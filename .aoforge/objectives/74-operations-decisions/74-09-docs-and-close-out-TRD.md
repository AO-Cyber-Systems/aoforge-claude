---
objective: 74-operations-decisions
trd: "09"
type: standard
wave: 7
depends_on: ["74-08"]
files_modified:
  - CHANGELOG.md
  - CLAUDE.md
  - docs/USER-GUIDE.md
  - site/content/docs/guides/ui-eval.md
  - site/content/docs/guides/releases.md
  - .github/workflows/test.yml
  - .github/workflows/agent-shell-harness.yml
  - .aoforge/REQUIREMENTS.md
  - .aoforge/todos/pending/2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main.md
autonomous: true
requirements: [OPS-01, OPS-02, OPS-03]
must_haves:
  truths:
    - "CHANGELOG [Unreleased] records the live visual judge job, the Cloudflare deploy-target step and preview-safe deploy, the main ruleset record and ruleset-check, and the operational outcomes (secret set by the user, ruleset applied, aoforge-docs deploying), each with its objective 74 reference"
    - "The site's ui-eval guide says CI now runs the live judge on every push to main, against the docs-site fixtures, and fails without a credential; the releases guide says main takes changes only through a pull request with the unit suite green (tags unaffected)"
    - "test.yml and agent-shell-harness.yml comments no longer say the required-check setting is missing: the unit suite is required by `aoforge: default branch`, and the harness is deliberately not required (path-filtered)"
    - "CLAUDE.md's 'Where we left off' and 'Next' lines describe objective 74's outcome and drop it from the open list; REQUIREMENTS ticks exactly the OPS IDs whose 74-08 evidence is green; the Pages todo is completed through `todo complete` when OPS-03 is met, and a domain-move todo exists if the user deferred it"
    - "npm test passes, apart from the failures already known on this branch, and the doc and rename guards pass"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] entries for objective 74"
    - path: site/content/docs/guides/ui-eval.md
      provides: "Live judge in CI section"
  key_links:
    - from: .aoforge/REQUIREMENTS.md
      to: ".aoforge/objectives/74-operations-decisions/74-08-SUMMARY.md"
      via: "requirements mark-complete only for criteria with recorded evidence"
      pattern: "OPS-0"
---

# TRD 74-09: Document objective 74 and close it out

<objective>
Record what changed and what is now true: CHANGELOG, the two site guides it affects, the workflow comments that claimed
the protection was missing, CLAUDE.md's resident status, REQUIREMENTS and the todos. Only what TRD 74-08 actually
verified is ticked.

Purpose: the close-out the objective's constraints require (CHANGELOG [Unreleased], USER-GUIDE where relevant,
CLAUDE.md, REQUIREMENTS OPS checkboxes, `todo complete` for the Pages todo when OPS-03 lands).
Output: documentation commits and the planning-state updates through aof-tools verbs.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/74-operations-decisions/74-05-SUMMARY.md
@.aoforge/objectives/74-operations-decisions/74-06-SUMMARY.md
@.aoforge/objectives/74-operations-decisions/74-07-SUMMARY.md
@.aoforge/objectives/74-operations-decisions/74-08-SUMMARY.md

These edits stay on `feat/stack-profile-loader` and reach `main` with the next release PR. The two workflow files here
get comment-only changes, so `main`'s copies stay behaviourally identical.

Where things are (read narrowly with `rg -n`, then `offset`/`limit`):
- CHANGELOG.md: `## [Unreleased]` at line 7 with `### Added` and `### Changed` (Keep a Changelog; one bold lead
  sentence per entry, then detail and an "(objective 74, OPS-0N)" reference).
- CLAUDE.md: `## Where we left off (2026-10-09, ...)` at about line 215, `**Next:**` at about 227. Keep it short; this
  file is resident on every turn. Update the date and branch line. Replace objective 74 in **Next** with its outcome in one
  sentence, and leave 75.
- site/content/docs/guides/ui-eval.md: sections Running it, The pipeline, Setup, Verification hooks, Scoping, Why offline
  scoring. Add a short "The live judge in this repository's CI" section after "Why offline scoring".
- site/content/docs/guides/releases.md: "A release, end to end", step 4 says "push with `--follow-tags`". Under the
  ruleset, the release commit reaches `main` by a pull request, and the tag is pushed after the merge.
- docs/USER-GUIDE.md: a user guide for the plugin. Add a line only where it speaks about this repository's CI or the
  visual judge's binding standing (`rg -n -e 'judge live' -e 'binding' -e 'ANTHROPIC' docs/USER-GUIDE.md`). If nothing
  applies, change nothing there and say so in the SUMMARY.
- .github/workflows/test.yml line 27 ("OUT OF BAND: this job must be added to branch protection as a REQUIRED check ...")
  and agent-shell-harness.yml lines 9-10 ("the job must be added to branch protection as a REQUIRED check").
</context>

<embedded_context>

<anti_patterns>
- Do not tick an OPS requirement or complete the Pages todo on intent. Tick only what 74-08 recorded as green.
  A deferred or declined item stays open, with its reason written down.
- Do not write planning files directly. Use `node ~/.claude/aoforge/bin/aof-tools.cjs requirements mark-complete`,
  `todo complete` and `todo add --from`.
- No legacy product word outside preserved forms (rename guard). No stale command names (doc-refs guard).
- Do not change workflow behaviour here: comments only.
</anti_patterns>

<error_recovery>
- `doc-refs.repo.test.cjs` or `rename-guard.repo.test.cjs` fails: fix the wording you added; do not add ALLOW entries.
- `workflow-permissions.test.cjs` fails after a comment edit: the comment touched the `permissions:` block's shape; restore it.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: CHANGELOG, site guides, USER-GUIDE and workflow comments</name>
  <files>CHANGELOG.md, site/content/docs/guides/ui-eval.md, site/content/docs/guides/releases.md, docs/USER-GUIDE.md, .github/workflows/test.yml, .github/workflows/agent-shell-harness.yml</files>
  <action>
CHANGELOG [Unreleased]:
- Added: the **live visual judge in CI**. `.github/workflows/visual-judge.yml` and `scripts/ci-visual-judge.cjs` judge
  two real docs-site screenshots on every push to main. The job fails unless every state carries vision evidence and the
  known-broken one is judged broken; a credential-less run fails instead of passing (OPS-01). Also added: the **Cloudflare
  deploy target** step (`scripts/ci-cloudflare-target.cjs`, names the account and projects without printing ids, OPS-03),
  and **`.github/rulesets/main.json` + `scripts/ruleset-check.cjs`** (the approved ruleset text and its read-back
  comparison, OPS-02).
- Changed: docs.yml deploys `--branch="$DEPLOY_BRANCH"`, so a dispatch from a non-main branch makes a preview, not a
  production deploy. **`main` is protected** by the ruleset `aoforge: default branch` (no force-push or deletion; pull
  request required; unit suite required). The docs site deploys to `aoforge-docs`.
Each entry gives the real outcome from the 74-05..08 SUMMARYs, including anything deferred.
Site ui-eval guide: the new section explains the job, what it proves (binding standing, vision evidence, label agreement),
that it is not a required check and why, and the cost (6 vision calls per run).
Site releases guide: step 4 becomes "merge the release PR (main accepts changes only through a pull request with the unit
suite green), then create the annotated tag on the merge commit and push the tag". Add one sentence naming the ruleset.
USER-GUIDE: only as described in <context>.
test.yml line 27 comment → the job is required by the ruleset `aoforge: default branch` (`.github/rulesets/main.json`,
objective 74). agent-shell-harness.yml lines 9-10 → the job is deliberately not required: it is path-filtered, and a
required check that does not run hangs every other PR (objective 74). Keep mitigation 1.
Commit `docs(74-09): changelog, guides and workflow comments for objective 74` with these files.
  </action>
  <verify>rg -n -e 'objective 74' CHANGELOG.md (entries under [Unreleased]); rg -n -e 'aoforge: default branch' .github/workflows/test.yml site/content/docs/guides/releases.md; node --test scripts/workflow-permissions.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs (pass)</verify>
  <done>Every user-visible change and outcome of objective 74 is documented, and no comment claims the protection is missing.</done>
</task>

<task type="auto">
  <name>Task 2: CLAUDE.md status, REQUIREMENTS and todos through the verbs</name>
  <files>CLAUDE.md, .aoforge/REQUIREMENTS.md, .aoforge/todos/pending/2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main.md</files>
  <action>
1. CLAUDE.md: update "Where we left off" (date, objective 74 outcome in one or two sentences: the secret set by the user,
   the live judge green on main, the ruleset id applied, aoforge-docs deploying, and the domain state). Rewrite **Next:**
   so that 74 is no longer listed as open and 75 remains. Remove nothing unrelated. Commit with
   `aof-tools commit "docs(74-09): CLAUDE.md status after objective 74" --files CLAUDE.md`.
2. For each OPS ID whose criterion 74-08 recorded green:
   `node ~/.claude/aoforge/bin/aof-tools.cjs requirements mark-complete OPS-01,OPS-02,OPS-03` (only the green ones).
3. If OPS-03 is met: `node ~/.claude/aoforge/bin/aof-tools.cjs todo complete 2026-10-09-create-the-aoforge-docs-pages-project-and-deploy-the-docs-from-main.md`.
4. If the user replied `later` to the domain move in 74-08: write a todo draft (frontmatter `title: move devflow.cloud to the aoforge-docs Pages project`,
   `area: docs-deploy`; body with Problem and Solution taken from 74-08 Task 3's text) in the scratchpad, then
   `node ~/.claude/aoforge/bin/aof-tools.cjs todo add --from <draft>`.
5. If any OPS item was declined or held, write down in the SUMMARY which one and why. Its checkbox stays open.
  </action>
  <verify>rg -n -e 'OPS-0' .aoforge/REQUIREMENTS.md (ticks match the 74-08 evidence); ls .aoforge/todos/completed | rg 'aoforge-docs-pages-project' (when OPS-03 met); rg -n -e 'Objective 74' -e 'objective 74' CLAUDE.md</verify>
  <done>Resident status, requirements and todos reflect exactly what was verified.</done>
</task>

<task type="auto">
  <name>Task 3: Full suite</name>
  <files>(none)</files>
  <action>
Run `npm test` once. With credentials stripped: `env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN -u ANTHROPIC_BASE_URL npm test`.
Compare failures against those already known on this branch (named in the 73 and 74-0x SUMMARYs). A new failure caused
by objective 74 gets fixed in this TRD with a `fix(74-09): ...` commit. A pre-existing one is listed, not fixed.
  </action>
  <verify>npm test summary line recorded; no new failure attributable to objective 74</verify>
  <done>The suite is green apart from the failures already known on this branch, which the SUMMARY lists.</done>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- CHANGELOG, guides, comments, CLAUDE.md, REQUIREMENTS and todos agree with the 74-08 evidence.
- Doc, rename and permissions guards pass; `npm test` shows no new failure.
</verification>

<success_criteria>
- A reader of the CHANGELOG, the site or CLAUDE.md learns that the three operational decisions are closed and how.
</success_criteria>

<output>
After completion, write `74-09-SUMMARY.md` through `node ~/.claude/aoforge/bin/aof-tools.cjs summary post 74-09 --from <draft>`.
</output>
