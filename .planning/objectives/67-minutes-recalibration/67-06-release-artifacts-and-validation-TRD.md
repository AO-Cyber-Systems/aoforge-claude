---
objective: 67-minutes-recalibration
trd: "06"
type: standard
wave: 5
depends_on: ["67-05"]
files_modified:
  - package.json
  - plugins/devflow/.claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - CHANGELOG.md
  - site/data/devflow.json
autonomous: true
requirements: [EST-10]
must_haves:
  truths:
    - "package.json, plugins/devflow/.claude-plugin/plugin.json and both version fields of .claude-plugin/marketplace.json (top level and the `devflow` entry) read exactly 2.15.0; no other plugin entry changes; the marketplace description's skill and agent counts match the tree"
    - "CHANGELOG.md has `## [2.15.0] - <release date>` directly under an empty `## [Unreleased]`, holding all former [Unreleased] content (objectives 66 and 67) unchanged plus a factual lead paragraph; `git show --numstat` reports 0 deleted lines for CHANGELOG.md"
    - "The changelog-on-tag gate allows `git tag -a v2.15.0` against the committed release commit, `df-tools changelog check 2.15.0` prints `present`, and release.yml's awk extraction yields a body that starts with the lead paragraph"
    - "`npm test` passes apart from failures shown to be pre-existing; `claude plugin validate` passes; feat/stack-profile-loader is not behind its origin and `git merge-tree --write-tree origin/main feat/stack-profile-loader` exits 0"
    - "Nothing was pushed, no PR opened, no tag created: this TRD is local only"
  artifacts:
    - path: CHANGELOG.md
      provides: "the 2.15.0 release section"
      contains: "## [2.15.0]"
    - path: package.json
      provides: "release version"
      contains: "\"version\": \"2.15.0\""
    - path: plugins/devflow/.claude-plugin/plugin.json
      provides: "the plugin version Claude Code installs"
      contains: "\"version\": \"2.15.0\""
    - path: .claude-plugin/marketplace.json
      provides: "marketplace and devflow entry version"
      contains: "\"version\": \"2.15.0\""
    - path: site/data/devflow.json
      provides: "docs-site data regenerated at 2.15.0"
      contains: "\"version\": \"2.15.0\""
  key_links:
    - "release commit (local) -> 67-07 push and PR -> 67-08 merge and tag -> 67-09 installed runtime"
---

# TRD 67-06: Release artifacts for 2.15.0, validated locally (EST-10 SC-4 path)

<objective>
SC-4 needs the installed estimator to read the new calibration, and that code reaches `~/.claude/devflow/` only through
a plugin release. Build and validate the 2.15.0 release commit locally: version bump in the three manifests, the
CHANGELOG [Unreleased] (objectives 66 and 67) promoted to `## [2.15.0]`, docs data regenerated, then the full suite,
the tag-gate dry run, the release-notes preview, the manifest check and merge cleanliness. No live step.

2.15.0 is a minor release: new flags (`calibrate --minutes`, `--through`, `tokens coverage`) and a new calibration
version. It also delivers objective 66's stop-gate token check and every-TRD-in-an-executor rule to the installed
runtime before objectives 68-72 run.

Purpose: the release artifact 67-07 and 67-08 publish on approval.
Output: one signed `chore(release): 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)` commit and
the validation record in the SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/65-release-v1-5/65-01-release-artifacts-and-validation-TRD.md
@.planning/objectives/65-release-v1-5/65-01-SUMMARY.md
@.planning/objectives/67-minutes-recalibration/67-05-SUMMARY.md

65-01 is the model: follow its two tasks step for step with the values below. Where this TRD and 65-01 differ, this
TRD wins: version 2.13.2 → 2.14.0 becomes 2.14.0 → 2.15.0, the subject and lead paragraph are this release's, the
base commit for "pre-existing" failures is this objective's wave base, and origin/main is the 2.14.0 merge
`8295a169fe108c3af2d76d2480d1c0f95c1f6dcf` (or later, if the user merged something since: record it).

## Hard rules
- Local only: no `git push`, no `gh pr create`, no `git tag`, no `gh release`.
- Hand promotion of the CHANGELOG (insert lines, delete none). Never `df-tools changelog update`: it regenerates from
  commit history and would replace the curated text.
- Do not hand-edit site/data/devflow.json: regenerate it with `npm run docs:data` (no Hugo, no server).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<subject>" --files <the five files>`; the
  repository's signing config signs it. Never use port 8080.
</context>

<embedded_context>

<codebase_examples>
Release-notes extraction release.yml runs on the tag (preview it locally; 65-01 Task 2 step 4):
`awk '/^## \[2.15.0\]/{f=1;next} /^## \[/{if(f)exit} f' CHANGELOG.md`

Version-sync check (all four must print 2.15.0):
`node -e 'const r=p=>require("/Users/justin/dev/devflow-claude/"+p);const m=r(".claude-plugin/marketplace.json");const v=[r("package.json").version,r("plugins/devflow/.claude-plugin/plugin.json").version,m.version,m.plugins.find(x=>x.name==="devflow").version];console.log(v.join(" "));process.exit(v.every(x=>x==="2.15.0")?0:1)'`

Lead paragraph draft (tighten it; every claim must already be in the [Unreleased] text, in 67-VALIDATION.md or in
DECISION-003; no invented instruction):
> Milestone v1.6, objectives 66 and 67 (objective 65 shipped 2.14.0). Executor SUMMARYs stamp their own token usage:
> the SubagentStop gate sends an executor back once when its final SUMMARY has no token fields, execute-objective runs
> every TRD in an executor, and `tokens coverage` reports forward-stamp coverage (EST-09). Minutes estimates use a method
> frozen before it is scored (EST-10): `calibrate --minutes` and `--through`, calibration version 3 with a `method`
> block, and <one clause with the selected method from 67-VALIDATION.md>. The 2.14.0 runtime refuses a version 3
> calibration; the hooks and libraries take effect after `/plugin update devflow@aocyber` and a new session.
</codebase_examples>

<anti_patterns>
- `changelog update`, or retyping the [Unreleased] entries: promotion moves them under the new heading untouched.
- Claiming EST-09 or EST-11 met: EST-09 coverage is below target (66-04) and EST-11 is objective 75's.
- Bumping twice on a re-run: check the version fields first (65-01 Task 1 step 1).
</anti_patterns>

<error_recovery>
- `git merge-tree --write-tree origin/main feat/stack-profile-loader` exits non-zero: resolve nothing; record
  `--name-only` output and return blocked.
- The branch is behind its origin: do not pull or rebase silently; record the commits and return blocked.
- A suite failure that is not pre-existing: fix it in a separate `fix(67-06): …` commit before the release commit, or
  return blocked if the fix belongs to another TRD.
- A bad release commit before anything is pushed: fix the files and re-run the same commit with `--amend`.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Bump to 2.15.0, promote [Unreleased] to [2.15.0], regenerate docs data, commit</name>
  <files>package.json, plugins/devflow/.claude-plugin/plugin.json, .claude-plugin/marketplace.json, CHANGELOG.md, site/data/devflow.json</files>
  <action>
Follow 65-01 Task 1 steps 1-6 with these values:
1. Pre-flight: `git status --porcelain --untracked-files=no` is empty apart from objective-67 planning files; the four
   version fields read 2.14.0 (`rg -n '"version"' package.json plugins/devflow/.claude-plugin/plugin.json .claude-plugin/marketplace.json`).
2. Edit the four fields to 2.15.0 (anchor the two marketplace.json edits on `"name": "aocyber",` and `"name": "devflow",`).
3. Re-measure `ls -d plugins/devflow/skills/*/` and `ls plugins/devflow/agents/*.md`; update only the numbers in the
   devflow description if they changed.
4. CHANGELOG: after `## [Unreleased]` and its blank line insert `## [2.15.0] - <date +%F>`, a blank line, the lead
   paragraph (codebase_examples), a blank line. Delete nothing. Check each named token of the lead with
   `rg -n -F '<token>' CHANGELOG.md`.
5. `npm run docs:data`; `git diff site/data/devflow.json` shows `version`/`packageVersion` 2.15.0 and only generated rows.
6. `node plugins/devflow/devflow/bin/df-tools.cjs commit "chore(release): 2.15.0 — v1.6 token stamp and minutes recalibration (objectives 66–67)" --files package.json plugins/devflow/.claude-plugin/plugin.json .claude-plugin/marketplace.json CHANGELOG.md site/data/devflow.json`

# CRITICAL: no push, no PR, no tag.
  </action>
  <verify>
- The version-sync one-liner prints `2.15.0 2.15.0 2.15.0 2.15.0` and exits 0
- `git show --numstat --format= HEAD -- CHANGELOG.md` shows 0 deletions
- `rg -n '^## \[' CHANGELOG.md` lists `## [Unreleased]`, then `## [2.15.0] - …`, then `## [2.14.0] - 2026-10-07`, and
  the first non-blank line after `## [Unreleased]` is the 2.15.0 heading
- `git show --stat --format=%s HEAD` lists exactly the five files with the release subject
- `git cat-file -p HEAD` output contains one `gpgsig` header (pipe to `rg -c '^gpgsig'`, prints 1)
  </verify>
  <done>One signed release commit changes exactly the five files to 2.15.0 with the promoted CHANGELOG.</done>
  <recovery>Before any push, fix the files and re-run the same commit command with `--amend`. Never reset or rebase
other commits.</recovery>
</task>

<task type="auto">
  <name>Task 2: Validate the release artifact without any live step</name>
  <files>(none — validation only; a fix goes into the release commit with --amend)</files>
  <action>
Each check its own Bash call; record command, result and PASS/FAIL in the SUMMARY (67-07 quotes these numbers in the PR).
1. `npm test` (timeout 600000). Total, pass, fail, skipped. Each failure is shown pre-existing and environmental or
   fixed (error_recovery).
2. Tag-gate dry run: `git rev-parse HEAD` (RELEASE_SHA), then
   `printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git tag -a v2.15.0 -m x <RELEASE_SHA>"}}' | node plugins/devflow/hooks/changelog-on-tag.js`
   with the literal SHA: prints nothing.
3. `node plugins/devflow/devflow/bin/df-tools.cjs changelog check 2.15.0 --raw` prints `present`.
4. Release-notes preview: the awk in codebase_examples; record its line count and its first non-blank line (the lead).
5. `claude plugin validate /Users/justin/dev/devflow-claude` prints `Validation passed` (the pre-existing `statusLine`
   warning is the only allowed warning).
6. Repo-copy baseline (read-only): `node plugins/devflow/devflow/bin/df-tools.cjs validate health` reports
   `engine_version` 2.15.0 and 0 errors (record the warning codes); `node plugins/devflow/devflow/bin/df-tools.cjs doctor --json`
   (no `--fix`) reports `engine_version` 2.15.0 and `summary.error` 0 (record each check's id and severity for 67-09).
7. Remote state: `git -C /Users/justin/dev/devflow-claude fetch origin`;
   `git rev-list --count feat/stack-profile-loader..origin/feat/stack-profile-loader` is 0;
   `git rev-list --count origin/feat/stack-profile-loader..feat/stack-profile-loader` (record: commits to publish);
   `git rev-parse origin/main` (record);
   `git merge-tree --write-tree origin/main feat/stack-profile-loader` exits 0;
   `gh pr list --head feat/stack-profile-loader --base main --state open --json number,url` is empty (or record it).
  </action>
  <verify>
- Hook dry run printed nothing; `changelog check` printed `present`; `claude plugin validate` passed
- merge-tree exit 0 and behind-count 0 recorded with origin/main's SHA
- `npm test` numbers recorded; no unexplained failure
  </verify>
  <done>The 2.15.0 release commit is validated locally; 67-07 can publish it on approval.</done>
</task>

</tasks>

<verification>
- Release commit with four 2.15.0 version fields, a promoted CHANGELOG (0 deletions) and regenerated docs data.
- All local release gates pass; nothing live happened.
</verification>

<success_criteria>
- RELEASE_SHA, suite numbers, merge-tree result and push count recorded in the SUMMARY.
</success_criteria>

<output>
`.planning/objectives/67-minutes-recalibration/67-06-SUMMARY.md` via `summary post`, `requirements-completed: []`.
</output>
