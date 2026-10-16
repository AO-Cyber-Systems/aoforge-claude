---
objective: 72-install-and-naming-cleanup
trd: "18"
type: standard
wave: 10
depends_on: ["72-17"]
files_modified:
  - package.json
  - package-lock.json
  - plugins/aoforge/.claude-plugin/plugin.json
  - plugins/devflow/.claude-plugin/plugin.json
  - .claude-plugin/marketplace.json
  - CHANGELOG.md
  - "plugins/{eden-ui-flutter,eden-ui-web,aosentry-mcp,monorepo-standards}/.claude-plugin/plugin.json (patch bump only if their content changed in 72)"
  - site/data/aoforge.json
autonomous: true
requirements: [INST-05]
must_haves:
  truths:
    - "package.json, plugins/aoforge/.claude-plugin/plugin.json and marketplace.json (top level and the aoforge entry) all read 3.0.0; the pointer plugin and its marketplace entry read 3.0.0; every sibling plugin whose files changed in objective 72 has a patch bump in its plugin.json and marketplace entry"
    - "CHANGELOG.md's `[Unreleased]` became `## [3.0.0] - <date>`, which opens with a 'DevFlow is now AOForge' section (breaking; name map summary; link to docs/MIGRATING-TO-AOFORGE.md; the pointer release; shims removed in the release after 3.0.0) followed by the previously unreleased entries; past entries and the file header are byte-identical; `aof-tools changelog check 3.0.0` passes"
    - "Validation is green without any live step: full suite, rename guard, doc-refs gate, `gen-pointer-skills --check`, `claude plugin validate` for every plugin and the marketplace, and the installed changelog gate accepts a dry-run `git tag -a v3.0.0`"
    - "An end-to-end rehearsal on a scratch clone of this repo with a fake HOME seeded from a copy of the real runtime state (backups excluded) shows: the mirror lands in `~/.claude/aoforge/`, the 72 run-state estimate is present there when 72-01's SUMMARY says `run_state: recorded` (on the accepted-unscored path the SUMMARY records `no run state: unscored` instead), the upgrade hook moves `.planning/` to `.aoforge/` in one rename commit with the config key renamed, `validate health` has no W066/W067, and `upgrade --global` on a copy of the real global CLAUDE.md shows the outside-block diff without writing it"
  artifacts:
    - path: CHANGELOG.md
      provides: "the 3.0.0 entry leading with the rename"
      contains: "## [3.0.0]"
    - path: plugins/aoforge/.claude-plugin/plugin.json
      provides: "aoforge 3.0.0"
      contains: "\"version\": \"3.0.0\""
  key_links:
    - from: "CHANGELOG.md ## [3.0.0]"
      to: "docs/MIGRATING-TO-AOFORGE.md"
      via: "relative link in the lead section"
      pattern: "MIGRATING-TO-AOFORGE"
    - from: "marketplace.json"
      to: "./plugins/aoforge and ./plugins/devflow"
      via: "two plugin entries at 3.0.0"
      pattern: "3.0.0"
---

# TRD 72-18: Build and validate the 3.0.0 release artifacts (no live step)

<objective>
Produce the 3.0.0 release: versions in step, the CHANGELOG entry that leads with the rename, and every validation that
can run without touching anything live, including a full rehearsal of the user's own upgrade on a scratch clone. This is
the go/no-go before the checkpointed live steps in 72-19 and 72-20.

Purpose: INST-05 (3.0.0, version sync, changelog). Per the user's rule, a generic ship request means build and validate
the artifact; the rollout stops at checkpoints.
Output: version bumps, CHANGELOG 3.0.0, a validation and rehearsal record in the SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md
@.planning/objectives/65-release-v1-5/65-01-release-artifacts-and-validation-TRD.md

Project kind `plugin`, work `feature`. Release engineering; no `tdd` tasks (the rehearsal is a verification run).

Version sync rule (CLAUDE.md): package.json, `plugins/aoforge/.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json` must match on every release. The changelog gate (`changelog-on-tag.js`, installed
DevFlow 2.15.0) blocks `git tag -a vX.Y.Z` unless CHANGELOG has `## [X.Y.Z]`. Read 65-01 for the shape of the
validation record; this TRD mirrors it.
</context>

<embedded_context>

<codebase_examples>
Changelog tools (repo copy):
```bash
node plugins/aoforge/aoforge/bin/aof-tools.cjs changelog update --version v3.0.0 --dry-run
node plugins/aoforge/aoforge/bin/aof-tools.cjs changelog check 3.0.0
```
Gate dry run against the INSTALLED hook (what will run at tag time):
```bash
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git tag -a v3.0.0 -m x HEAD"}}' | node ~/.claude/plugins/cache/aocyber/devflow/2.15.0/hooks/changelog-on-tag.js
```
(no output = allowed).
</codebase_examples>

<anti_patterns>
- No push, merge, tag, release, marketplace or repository change here: those are 72-19/72-20 checkpoints.
- Never edit past CHANGELOG entries or its header.
- The rehearsal never touches the real `~/.claude` (fake HOME only; copy, never move) and never this checkout's
  `.planning/`.
- No escape variables to get a gate to pass.
</anti_patterns>

<error_recovery>
- If the rehearsal's upgrade hook defers (dirty clone), the clone was not clean: re-clone; never force.
- Scored path (72-01 `run_state: recorded`): a 72 run state missing from the rehearsal's migrated home means 72-07's
  copy list is wrong: stop and report, it blocks the release (EST-11 depends on it). Unscored path: record
  `no run state (unscored, accepted in 72-01)` and continue.
- A validation failure blocks the release: fix in a commit with a test, or stop and report.
</error_recovery>

</embedded_context>

<gotchas>
- Rehearsal scratch dirs go under the session scratchpad; seed the fake HOME with `rsync -a --exclude backups
  ~/.claude/devflow/ <fakehome>/.claude/devflow/` and a copy of `~/.claude/CLAUDE.md` and `~/.claude/plugins/installed_plugins.json`.
- In the scratch clone: `git config commit.gpgsign false` (local only) so the hook's background commit does not prompt.
- Live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Versions and the CHANGELOG 3.0.0 entry</name>
  <files>package.json, package-lock.json, plugins/aoforge/.claude-plugin/plugin.json, plugins/devflow/.claude-plugin/plugin.json, .claude-plugin/marketplace.json, CHANGELOG.md, plugins/*/.claude-plugin/plugin.json</files>
  <action>
Bump to 3.0.0 (package.json + lock, aoforge plugin.json, marketplace top level and aoforge entry; confirm pointer at
3.0.0). For each sibling plugin, `git diff --stat <72-04 base>..HEAD -- plugins/<name>`: changed -> patch bump in its
plugin.json and marketplace entry. CHANGELOG: rename `[Unreleased]` to `## [3.0.0] - <today>` and insert the lead
section "### DevFlow is now AOForge (breaking)" (what changed, the one-release shims, the pointer release, link
`[migration guide](docs/MIGRATING-TO-AOFORGE.md)`) inside a rename-guard ignore region only if the guard scans
CHANGELOG (it does not: CHANGELOG is SKIP). Regenerate `site/data/aoforge.json` (version). Run `changelog check 3.0.0`.
Commit (`chore(72-18): release 3.0.0 artifacts`).
  </action>
  <verify>node -e "for (const f of ['package.json','plugins/aoforge/.claude-plugin/plugin.json','plugins/devflow/.claude-plugin/plugin.json','.claude-plugin/marketplace.json']) console.log(f, require('./'+f).version)" && node plugins/aoforge/aoforge/bin/aof-tools.cjs changelog check 3.0.0</verify>
  <done>All four print 3.0.0; changelog check passes; `git diff HEAD~1 -- CHANGELOG.md` adds only the 3.0.0 heading and
lead section.</done>
  <recovery>If `changelog check` wants a link reference at the bottom, add the `[3.0.0]` compare link in the existing
style.</recovery>
</task>

<task type="auto">
  <name>Task 2: Validation without live steps</name>
  <files>(none: read-only checks)</files>
  <action>
Run, each as its own Bash call, and record the result lines in the SUMMARY: full suite
(`node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`);
`npm test` once if signing does not prompt; `claude plugin validate` for `plugins/aoforge`, `plugins/devflow`, each
sibling plugin and `.`; `node scripts/gen-pointer-skills.cjs --check`; the rename guard and doc-refs gate; the installed
changelog gate dry run (codebase_examples); `node scripts/aoforge-rename.cjs --rules names --inventory | tail -1` and
`--rules planning --inventory | tail -1` (both `unclassified=0`, and on the renamed tree the rename actions should be
near zero; list any remaining in the SUMMARY).
  </action>
  <verify>claude plugin validate . && node scripts/gen-pointer-skills.cjs --check</verify>
  <done>Every check passes and its output line is in the SUMMARY.</done>
  <recovery>Any failure: fix with a test and re-run the whole list, or stop and report; do not proceed to 72-19.</recovery>
</task>

<task type="auto">
  <name>Task 3: Rehearse the user's upgrade on a scratch clone</name>
  <files>(none in the repo: scratchpad only)</files>
  <action>
1. `git clone --no-hardlinks /Users/justin/dev/devflow-claude <scratch>/rehearsal` (it carries `.planning/` and the
   legacy stamp); `git -C <scratch>/rehearsal config commit.gpgsign false`.
2. Seed a fake HOME (gotchas).
3. `HOME=<fake> CLAUDE_PLUGIN_ROOT=<scratch>/rehearsal/plugins/aoforge node <...>/hooks/sync-runtime.js`; check
   `<fake>/.claude/aoforge/.plugin-version` = 3.0.0, `.legacy-state-migrated.json`, and (scored path, per 72-01's
   `run_state:` line) the 72 run state under `<fake>/.claude/aoforge/state/estimates/`.
4. In the clone: `HOME=<fake> CLAUDE_PLUGIN_ROOT=... node <...>/hooks/upgrade-project.js`; poll up to 30 s for the
   background commit; check `git log -1 --name-status` (renames + ignore file), `.aoforge/config.json` stamp key, and
   `node plugins/aoforge/aoforge/bin/aof-tools.cjs validate health --raw` (no W066/W067).
5. `HOME=<fake> node <clone>/plugins/aoforge/aoforge/bin/aof-tools.cjs upgrade --global` prints the block change and the
   outside-block diff; confirm the fake `~/.claude/CLAUDE.md` outside text is unchanged.
6. `HOME=<fake> node ... doctor --global --json` lists the expected leftovers (devflow plugin enabled per the copied
   installed_plugins.json) and no contract errors.
Record each step's evidence in the SUMMARY; delete the scratch dirs at the end.
  </action>
  <verify>git -C /Users/justin/dev/devflow-claude status --porcelain (unchanged by the rehearsal) and the evidence lines in the SUMMARY</verify>
  <done>All six steps behave as stated; the real home and this checkout are untouched.</done>
  <recovery>A failure here blocks the release: fix it in the code with a test (in this TRD, as a deviation), then
re-run Task 2 and Task 3.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'</test>
<build>claude plugin validate .</build>
</validation_gates>

<verification>
- `rg -n "^## \[3.0.0\]" CHANGELOG.md` and the lead section links the migration guide.
- The SUMMARY records Task 2's results and Task 3's six rehearsal outcomes.
</verification>

<success_criteria>
- 3.0.0 is built, versioned and validated, and the upgrade it causes has been rehearsed end to end on a copy.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-18-SUMMARY.md` through
`df-tools summary post`.
</output>
