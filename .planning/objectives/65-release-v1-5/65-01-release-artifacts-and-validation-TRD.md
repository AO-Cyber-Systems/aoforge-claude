---
objective: 65-release-v1-5
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - package.json
  - plugins/devflow/.claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - CHANGELOG.md
  - site/data/devflow.json
autonomous: true
requirements: [REL-01]
must_haves:
  truths:
    - "package.json `version`, plugins/devflow/.claude-plugin/plugin.json `version`, and both .claude-plugin/marketplace.json `version` fields (top level and the `devflow` entry) read exactly 2.14.0. No other plugin entry in marketplace.json changes"
    - "CHANGELOG.md has `## [2.14.0] - <release date>` directly under an empty `## [Unreleased]` heading. All of the former [Unreleased] content now sits under 2.14.0, unchanged, and `git diff --numstat CHANGELOG.md` shows 0 deleted lines"
    - "The changelog-on-tag gate allows `git tag -a v2.14.0` against the committed tree (the hook prints nothing), and `df-tools changelog check 2.14.0` prints `present`"
    - "release.yml's own awk extraction of `## [2.14.0]` yields the release notes body. That body starts with the lead paragraph and holds the Added, Changed and Fixed sections"
    - "`npm test` passes. Any failure is shown to be pre-existing on the base commit 1525b31c, and is named and explained in the SUMMARY"
    - "feat/stack-profile-loader is not behind origin/feat/stack-profile-loader, and `git merge-tree --write-tree origin/main feat/stack-profile-loader` exits 0 (the release PR will merge cleanly)"
    - "Nothing was pushed, no PR was opened, no tag was created. This TRD is local-only"
  artifacts:
    - path: CHANGELOG.md
      provides: "the 2.14.0 release section (the former [Unreleased] content plus a lead paragraph)"
      contains: "## [2.14.0]"
    - path: package.json
      provides: "release version"
      contains: "\"version\": \"2.14.0\""
    - path: plugins/devflow/.claude-plugin/plugin.json
      provides: "plugin version Claude Code installs"
      contains: "\"version\": \"2.14.0\""
    - path: .claude-plugin/marketplace.json
      provides: "marketplace and devflow entry version, accurate skill count"
      contains: "\"version\": \"2.14.0\""
    - path: site/data/devflow.json
      provides: "docs-site data regenerated at 2.14.0"
      contains: "\"version\": \"2.14.0\""
  key_links:
    - "CHANGELOG.md `## [2.14.0]` -> .github/workflows/release.yml awk extraction -> GitHub release notes body (65-03)"
    - "package.json / plugin.json / marketplace.json versions -> plugins/devflow/hooks/changelog-on-tag.js version-sync check at `git tag -a v2.14.0 <merge-sha>` (65-03)"
    - "plugin.json version -> sync-runtime.js `.plugin-version` marker -> doctor runtime-mirror check (65-04)"
---

# TRD 65-01: Release artifacts and validation (2.14.0)

<objective>
Prepare release 2.14.0 locally and prove it is ready to go. That means bumping the three version files together,
promoting the hand-written CHANGELOG `[Unreleased]` section (objectives 56 to 64) to `## [2.14.0]`, and regenerating the
docs-site data. Then run every check that can be run before a live step: the full suite, the tag gate dry run, the
release-notes preview, manifest validation, a repo-copy health and doctor baseline, and a merge-cleanliness check
against origin/main.

Purpose: REL-01 needs the version files in step and the CHANGELOG section in place before anything is pushed. The user
approves each live step (push, PR, merge, tag) in 65-02 and 65-03. This TRD gives those approvals a validated artifact.
Output: one signed `chore(release): 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)` commit on
`feat/stack-profile-loader`, plus the validation evidence in the SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md

**Why 2.14.0 (minor), not 2.13.3 or 3.0.0.** `[Unreleased]` (CHANGELOG.md lines 7-277) has a large `### Added`
section:
- new verbs: `todo sync`, `estimate task|trd|objective|milestone|start|wave|finish|backtest`, `tokens trd|stamp|backfill`,
  `calibrate`;
- new hooks: `gate-bash-writes.js`, `gate-skill-requires.js`, `todo-sync.js`;
- new health and doctor checks: W062 / check 26 `checks-workflow-pin`, and check 14 `skill-requires`.

So this is not a patch. `### Changed` holds backward-compatible behaviour changes:
- `calibrate` windows to 10 objectives by default, and `--window all` restores the old behaviour;
- `calibration.json` moves to version 2, which only adds fields;
- the new Bash-write gate ships at `warn`, which asks and does not deny.

Nothing in the public CLI or the hook contract is removed. `### Fixed` is fixes only. Under semver that makes it a
minor bump: 2.13.2 to **2.14.0**.

**Release title** (used verbatim in the commit, PR, merge subject, tag message and GitHub release):
`v1.5 Gate & Plumbing (objectives 56–64)`. The name comes from `.planning/MILESTONES.md`
(`## v1.5 Gate & Plumbing`). Objective 55 already shipped in 2.13.2.

**Resolved intent.** The resolved intent is (plugin, feature): tdd strict, test_list_first required, fixture_strategy
generators. <!-- TDD-EXCEPTION: release objective — no production logic changes. Version strings, CHANGELOG promotion
and generated docs data are config/docs, verified by the existing changelog-on-tag gate, release.yml's extraction and the
full `npm test` suite. --> No task carries `tdd="true"`, so this TRD has no `## Test list` and no fixture-builder task.

**User hard rules that apply here** (from ~/.claude/CLAUDE.md):
- No live step in this TRD. Do not run `git push`, `gh pr create`, `gh pr merge`, `git tag` or `gh release`. A
  `git fetch` is allowed, because it only updates local refs.
- Never use port 8080. Nothing here needs a server.
</context>

<embedded_context>

<codebase_examples>
The 2.13.2 release commit (`20b75f3b`) is the pattern to copy. It changed exactly four files: marketplace.json (two
`version` lines), CHANGELOG.md (a heading and a lead paragraph inserted under `## [Unreleased]`), package.json and
plugin.json.

```diff
 ## [Unreleased]

+## [2.13.2] - 2026-10-05
+
+Store mode was tested end to end against a real GitHub repository (...). **Repositories set up with `gh setup` on 2.13.1 or earlier keep a broken checks workflow until they re-pin.** ...
+
 ### Fixed
```

marketplace.json has two version fields for this plugin. Bump both, and leave the other plugin entries
(`social-media-generator` 1.3.0 and the others) alone:
```json
  "name": "aocyber",
  "version": "2.13.2",            <- top level
  ...
      "name": "devflow",
      "description": "... 31 skills, 13 agents, ...",   <- skill count is stale: the tree has 34 skill dirs
      "version": "2.13.2",        <- devflow entry (the one changelog-on-tag checks)
```

Release commits go through the DevFlow commit verb, limited to named files (gate-commits blocks a raw `git commit`):
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "chore(release): 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)" --files package.json plugins/devflow/.claude-plugin/plugin.json .claude-plugin/marketplace.json CHANGELOG.md site/data/devflow.json
```

To dry-run the tag gate, pipe a synthetic PreToolUse payload into the hook from the repo root. The hook allows by
printing nothing and denies by printing a JSON object with `"permissionDecision":"deny"`. This was checked at planning
time: `v2.13.2` prints nothing today, and `v2.14.0` prints a deny ("CHANGELOG.md has no entry for v2.14.0").
```bash
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git tag -a v2.14.0 -m x"}}' | node plugins/devflow/hooks/changelog-on-tag.js
```

release.yml builds the release body with this awk (copy it exactly for the preview):
```bash
awk -v ver="2.14.0" '$0 ~ "^## \\[" ver "\\]" { flag=1; next } flag && /^## \[/ { flag=0 } flag { print }' CHANGELOG.md
```
</codebase_examples>

<anti_patterns>
- **Do NOT run `df-tools changelog update --version v2.14.0`.** It generates an entry from the conventional-commit log
  and inserts it after the header, and here the header includes the whole hand-written `[Unreleased]` block. The result
  is a duplicate, machine-written 2.14.0 section placed below the real content. The changelog-on-tag deny message suggests
  this command, so ignore that suggestion here. Promote the section by hand, as 2.13.2 did.
- Do not rewrite, reflow, reorder or "tidy" any existing `[Unreleased]` bullet. The promotion only inserts lines
  (deletions must be 0).
- Do not hand-edit site/data/devflow.json. Regenerate it with `npm run docs:data` and take the generator's output as it
  is.
- Do not bump the other marketplace plugin entries, and do not touch `statusLine` in plugin.json. `claude plugin
  validate` warns about `statusLine`, but that warning is pre-existing and out of scope.
- Do not commit or delete the untracked `.gitkeep` files in old objective dirs (26-31, 53-55). `--files` keeps them out.
- Do not bypass commit signing (`--no-gpg-sign`) or the commit gate (`DEVFLOW_ALLOW_RAW_COMMIT`). If signing fails,
  stop and report it.
</anti_patterns>

<error_recovery>
- Signing fails (ssh-agent or 1Password locked): stop, report the exact error, and ask the user to unlock. Do not retry
  with signing disabled.
- `npm test` has a failure: run that file alone with `node --test <file>`. Then check whether the failure is pre-existing
  on the base commit by running it in a disposable worktree at `1525b31c`. Run each of these as its own Bash call:
  `git worktree add /private/tmp/claude-501/df65-base 1525b31c`, then `node --test <file>` with
  `--cwd`/absolute path, then `git worktree remove /private/tmp/claude-501/df65-base`. If it is pre-existing and
  environmental (the historical one is MA-7 handoff-e2e, needs `doctl`), record it and continue. If the release commit
  caused it (for example a test pinned to `2.13.2` or to the marketplace description), fix the test or the artifact, put
  the fix in the same release commit (amend before anything is pushed, since nothing has been), and re-run.
- `npm run docs:data` changes more than the version fields: read the diff. Generated drift (hook, skill or command rows)
  is fine to commit, because 63-07 did the same. Local absolute paths (`/Users/…`) in the diff are not fine: stop and
  report.
- `git merge-tree --write-tree origin/main feat/stack-profile-loader` exits non-zero: do not resolve anything. Record
  the conflicting paths (`git merge-tree --write-tree --name-only origin/main feat/stack-profile-loader`) and return
  the TRD as failed. A conflict needs a decision that does not belong in a release prep TRD.
</error_recovery>

</embedded_context>

<gotchas>
- The release date is the date the commit is made: `date +%F` at execution time. Do not copy a date from this TRD or
  from STATE.md.
- `.planning/config.json` is stamped `2.13.1` (W040). Leave it alone here. After the install, the SessionStart
  upgrade-project hook stamps it (65-04).
- The worktree-isolation guard refuses compound Bash commands. Use one plain command per Bash call, with no `&&`, `;`
  or `cd x &&` chains. Use absolute paths, or `git -C /Users/justin/dev/devflow-claude …` when you are not running from
  the repo root.
- The `~/.claude/devflow/bin/df-tools.cjs` mirror is still 2.13.2. For checks that must see the new code (changelog
  check, health and doctor baseline), run the **repo copy** `node plugins/devflow/devflow/bin/df-tools.cjs …`.
- `npm test` takes several minutes (STACK.md timeout 900 s). Give the Bash call `timeout: 600000` and, if needed, run it
  in the background and poll. It is not one of the 2-minute default calls.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Bump the three version files to 2.14.0, promote [Unreleased] to [2.14.0], regenerate docs data, commit</name>
  <files>package.json, plugins/devflow/.claude-plugin/plugin.json, .claude-plugin/marketplace.json, CHANGELOG.md, site/data/devflow.json</files>
  <action>
1. Pre-flight (read-only): run `git -C /Users/justin/dev/devflow-claude status --porcelain --untracked-files=no` and
   confirm it is empty, apart from objective-65 planning files the orchestrator may have staged. Confirm the four
   version fields still read 2.13.2 (`rg -n '"version"' package.json plugins/devflow/.claude-plugin/plugin.json
   .claude-plugin/marketplace.json`). If any of them already reads 2.14.0, a previous run got partway: carry on from the
   first step that is not done, and never bump twice.
2. Versions: use Edit to change `"version": "2.13.2"` to `"version": "2.14.0"` in package.json (line 3), plugin.json
   (line 4), and in marketplace.json at the top level (line 4) and in the `devflow` plugin entry (line 14). Match each
   edit on enough surrounding text to be unique. marketplace.json has `"version": "2.13.2"` twice, so anchor on
   `"name": "aocyber",` and on `"name": "devflow",`.
3. marketplace.json `devflow` description: count the skills with `ls -d plugins/devflow/skills/*/` (34 at planning
   time) and the agents with `ls plugins/devflow/agents/*.md` (13). Replace only the numbers in
   `31 skills, 13 agents` with the measured counts. The rest of the description stays as it is.
4. CHANGELOG promotion. Insert lines and delete nothing. Right after the line `## [Unreleased]` and its following blank
   line (lines 7-8), insert:
   ```
   ## [2.14.0] - <date +%F>

   <lead paragraph>

   ```
   so the file reads `## [Unreleased]`, blank, `## [2.14.0] - …`, blank, lead, blank, `### Added`, and so on.
   The lead paragraph is one paragraph, at most 6 lines at about 120 columns, in the voice of the 2.13.2 lead. Every
   claim in it must already be stated in the [Unreleased] text or in `.planning/MILESTONES.md` `## v1.5 Gate & Plumbing`.
   Do not invent any instruction. A draft that meets that rule (tighten it, but keep it factual):
   > Milestone v1.5 Gate & Plumbing (objectives 56–64; objective 55 shipped in 2.13.2). The edit gate now covers Bash
   > writes to tracked source (`gate-bash-writes.js`, `gates.bashEditGate`, shipped default `warn`), a `/devflow:<skill>`
   > whose required tool is missing is refused (`gate-skill-requires.js`), and `/devflow:todo` keeps todos in the session
   > task list with a Stop-hook sync into the archive (`todo-sync.js`). The estimation engine prints time, token and dollar
   > estimates (`estimate`, `calibrate`, `estimate backtest`); its minutes accuracy target (EST-08) is **not met**. The new
   > hooks and libraries take effect after `/plugin update devflow@aocyber` and a new session.
   Check each named token with `rg -n -F '<token>' CHANGELOG.md` before you commit.
5. Docs data: run `npm run docs:data` (this is `node scripts/gen-docs-data.cjs`; no Hugo, no server). Read
   `git diff site/data/devflow.json`. `version` and `packageVersion` must read 2.14.0. Other changes must be generated
   rows only, with no local paths.
6. Commit through the verb, limited to the five files:
   `node ~/.claude/devflow/bin/df-tools.cjs commit "chore(release): 2.14.0 — v1.5 Gate & Plumbing (objectives 56–64)" --files package.json plugins/devflow/.claude-plugin/plugin.json .claude-plugin/marketplace.json CHANGELOG.md site/data/devflow.json`

# CRITICAL: hand promotion, never `changelog update` (see anti_patterns)
# CRITICAL: no push, no PR, no tag. This TRD is local-only
# PATTERN: release commit 20b75f3b (2.13.2)
  </action>
  <verify>
- Version sync (all four print 2.14.0, exit 0):
  `node -e 'const r=p=>require("/Users/justin/dev/devflow-claude/"+p);const m=r(".claude-plugin/marketplace.json");const v=[r("package.json").version,r("plugins/devflow/.claude-plugin/plugin.json").version,m.version,m.plugins.find(x=>x.name==="devflow").version];console.log(v.join(" "));process.exit(v.every(x=>x==="2.14.0")?0:1)'`
- Promotion is insert-only: `git show --numstat --format= HEAD -- CHANGELOG.md` shows `<N>	0	CHANGELOG.md` (0 deletions).
- Heading order: `rg -n '^## \[' CHANGELOG.md | head -3` prints `7:## [Unreleased]`, then `9:## [2.14.0] - YYYY-MM-DD`, then the `## [2.13.2]` line.
- Unreleased is empty: the first non-blank line after line 7 is the `## [2.14.0]` heading.
- `git show --stat --format=%s HEAD` lists exactly the five files, and the subject is the chore(release) line.
- `git log -1 --format=%G?` prints `G` (signed).
  </verify>
  <done>One signed release commit on feat/stack-profile-loader changes exactly the five files. All four version fields read
2.14.0, and the marketplace skill count matches the tree. CHANGELOG has an empty `[Unreleased]` followed by
`## [2.14.0] - <today>` with a factual lead and all the former Unreleased content, with 0 lines deleted.</done>
  <recovery>Before anything is pushed, a bad release commit can be corrected with
`node ~/.claude/devflow/bin/df-tools.cjs commit "<same subject>" --files <same five files> --amend`, after fixing the
files. Never reset or rebase other commits. If the CHANGELOG edit went wrong, use `git checkout HEAD~1 -- CHANGELOG.md`
(only while the release commit is HEAD and unpushed), then redo step 4 and amend.</recovery>
</task>

<task type="auto">
  <name>Task 2: Validate the release artifact without any live step (suite, tag-gate dry run, notes preview, manifests, health, merge cleanliness)</name>
  <files>(none — validation only; any fix found here goes into the Task 1 release commit with --amend)</files>
  <action>
Run each check as its own Bash call and record the exact command, the output summary and PASS/FAIL in the SUMMARY.
65-02 reads these numbers for the PR body, so record them precisely.

1. Full suite: `npm test` (timeout 600000, or background and poll). Record total, pass, fail and skipped. Any failure
   is handled per error_recovery: it is pre-existing on 1525b31c and environmental, or it gets fixed and amended.
2. Tag gate dry run against the committed release commit (commit-ish form, so the hook reads that commit's tree):
   `printf '%s' "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git tag -a v2.14.0 -m x $(git rev-parse HEAD)\"}}" | node plugins/devflow/hooks/changelog-on-tag.js`
   It must print nothing. If the `$(…)` substitution is refused by the worktree guard, run `git rev-parse HEAD` first
   and paste the literal SHA into the payload.
3. `node plugins/devflow/devflow/bin/df-tools.cjs changelog check 2.14.0 --raw` must print `present`.
4. Release-notes preview: run the release.yml awk (codebase_examples) and record its line count (`| wc -l`, about 270
   expected) and its first non-blank line, which must be the lead paragraph. A heredoc is not needed.
5. Manifests: `claude plugin validate /Users/justin/dev/devflow-claude` must print `Validation passed`. The only
   allowed warning is the pre-existing `statusLine` one.
6. Repo-copy health baseline (read-only):
   - `node plugins/devflow/devflow/bin/df-tools.cjs validate health` must report `engine_version` 2.14.0 and 0 errors.
     Record the warning codes. Expected now: W006 for 66-75, W040, and W021/I022 about the mirror and the installed
     plugin.
   - `node plugins/devflow/devflow/bin/df-tools.cjs doctor --json` (report mode, no `--fix`) must report
     `engine_version` 2.14.0 and `summary.error` 0. Record each check's id and severity. 65-04 compares against this
     list.
7. Remote state (fetch only updates local refs):
   - `git -C /Users/justin/dev/devflow-claude fetch origin`;
   - `git rev-list --count feat/stack-profile-loader..origin/feat/stack-profile-loader` must be 0;
   - `git rev-list --count origin/feat/stack-profile-loader..feat/stack-profile-loader`: record it as the number of
     commits the push will publish;
   - `git rev-parse origin/main`: record it (expected 533d2b87…);
   - `git merge-tree --write-tree origin/main feat/stack-profile-loader` must exit 0;
   - `gh pr list --head feat/stack-profile-loader --base main --state open --json number,url` must be empty, or record
     the PR it finds.
  </action>
  <verify>
- `npm test` summary line recorded. Failures are 0, or each one is proven pre-existing and environmental.
- Hook dry run printed nothing (empty stdout).
- `changelog check 2.14.0 --raw` printed `present`.
- The awk preview is non-empty, and its first non-blank line is the lead paragraph.
- `claude plugin validate` printed `Validation passed`.
- `validate health` (repo copy) reported 0 errors and engine 2.14.0. `doctor --json` (repo copy) reported 0 errors.
- Behind-count 0 and merge-tree exit 0 are recorded, along with the push commit count and the origin/main SHA.
  </verify>
  <done>Every pre-live check passed, and the evidence is in the SUMMARY: suite numbers, an empty hook dry run, `present`,
the notes preview, the manifest validation, the repo-copy health and doctor baselines, the push commit count, the
origin/main SHA, and a clean merge-tree. Nothing was pushed, opened, merged or tagged.</done>
  <recovery>Any failing check blocks 65-02. Fix the artifact and amend the release commit (Task 1 recovery), then re-run
from check 1. If the fix is out of scope (a merge conflict, or a real regression from objectives 56-64), return the TRD
as failed with the evidence. Do not paper over it.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<!-- scoped form for a single failing file: node --test {files} -->
</validation_gates>

<verification>
- Four version fields read 2.14.0 (the node one-liner exits 0).
- CHANGELOG: `## [Unreleased]` (empty) is followed by `## [2.14.0] - <date>`, and the promotion deleted 0 lines.
- The tag gate dry run against the release commit prints nothing, and `changelog check 2.14.0` prints `present`.
- `npm test` passes, or each failure is shown to be pre-existing and environmental.
- The branch is not behind its remote, and the merge into origin/main is clean.
- No live step ran: `git rev-list --count origin/feat/stack-profile-loader..feat/stack-profile-loader` > 0, there is no
  open PR, and `git ls-remote --tags origin v2.14.0` is empty.
</verification>

<success_criteria>
Roadmap criterion 1 holds locally: the three version files carry 2.14.0 and CHANGELOG has `## [2.14.0]` where
`[Unreleased]` was, with the changelog gate passing. The release artifact is validated, and every live step is left to
65-02 and 65-03 behind explicit approval.
</success_criteria>

<output>
After completion, create `.planning/objectives/65-release-v1-5/65-01-SUMMARY.md` through the summary verb. Include:
- the release commit SHA;
- the suite numbers;
- the push commit count;
- the origin/main SHA;
- the health and doctor baseline (check id to severity);
- the release-notes line count.
</output>
