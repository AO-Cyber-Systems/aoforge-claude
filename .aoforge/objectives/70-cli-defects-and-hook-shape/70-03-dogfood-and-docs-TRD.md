---
objective: 70-cli-defects-and-hook-shape
trd: "03"
type: standard
wave: 2
depends_on: ["70-01", "70-02"]
files_modified:
  - CHANGELOG.md
  - CLAUDE.md
  - docs/USER-GUIDE.md
  - plugins/devflow/agents/job-checker.md
autonomous: true
requirements: [TOOL-07, TOOL-08]
must_haves:
  truths:
    - "On a scratch copy of this repository's `.planning/`, the repository df-tools `state update-progress` exits 0 with `updated: true, inserted: true` and the copy's STATE.md differs from the live one by exactly one added `**Progress:**` line; a second run exits 0 without `inserted` and leaves one Progress line; a scratch STATE.md with no `## Current Position` exits 1 and gets no state.json; the live `.planning/STATE.md` is unchanged"
    - "`df-tools --cwd .planning/objectives/70-cli-defects-and-hook-shape verify trd-pre 70` (repository df-tools) resolves objective 70 where the installed runtime prints `Objective not found`; a path argument resolves from a scratch cwd; a missing objective exits 1"
    - "Repository `df-tools objective-job-index 64` reports `gap_closure: true` for 64-07..64-10 and `false` for 64-01..64-06"
    - "verify-commits.js run in a scratch autonomous project as `devflow:executor` prints a top-level `{decision, reason}` object for which `stopFamilyProblems('SubagentStop', …)` returns `[]`; as `Explore` it prints nothing"
    - "70-01 and 70-02 have landed on this branch (last commits are ancestors of HEAD; created files exist at HEAD)"
    - "CHANGELOG [Unreleased], CLAUDE.md, docs/USER-GUIDE.md and agents/job-checker.md describe the new behaviour; a todo records the post-release live SubagentStop check"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] objective 70 paragraph and four Fixed entries"
      contains: "objective 70"
    - path: CLAUDE.md
      provides: "State operations and verify-commits.js bullets updated"
      contains: "update-progress"
    - path: docs/USER-GUIDE.md
      provides: "verify-commits.js hooks-table row"
      contains: "devflow:executor"
    - path: plugins/devflow/agents/job-checker.md
      provides: "Dimension 8: trd-pre resolves from anywhere; non-zero exit means not found"
      contains: "non-zero"
  key_links:
    - from: "70-03-SUMMARY.md evidence table"
      to: "objective 70 success criteria 1-4"
      via: "one command per criterion with its output, before (installed runtime) and after (repository df-tools)"
      pattern: "SC-"
---

# TRD 70-03: Dogfood the four fixes on this repository and scratch copies, then document (TOOL-07, TOOL-08)

<!-- TDD-EXCEPTION: dogfood and documentation only; no source logic changes in this TRD -->

<objective>
Prove each success criterion of objective 70 with the repository df-tools and hook, against this repository (read-only
commands) or scratch copies (anything that writes). Where the installed runtime still has the defect, show it next to
the fix as the before/after pair. Then update the CHANGELOG, CLAUDE.md, the USER-GUIDE hooks table and the job-checker's
trd-pre instructions. Run the full suite as the objective gate.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
Read `.planning/objectives/70-cli-defects-and-hook-shape/70-01-SUMMARY.md` and `70-02-SUMMARY.md` first: commits,
created files, deviations. Document what landed, not what was planned.

Docs to edit (`rg -n` first, then `offset`/`limit`):
- `CHANGELOG.md` `## [Unreleased]` (line 7): objective lead paragraphs (69, then 68) above `### Added` (20),
  `### Changed` (64) and `### Fixed` (83). Add an objective 70 paragraph above the objective 69 one, and four entries at
  the top of `### Fixed`.
- `CLAUDE.md`: **State operations** bullet (51) and the `verify-commits.js` hooks bullet (120). CLAUDE.md is resident on
  every turn: one clause per change.
- `docs/USER-GUIDE.md` hooks table row `verify-commits.js` (823).
- `plugins/devflow/agents/job-checker.md` Dimension 8 step 1 (around 297-301).

## Binding rules
- No test or source change in this TRD. If dogfood finds a defect, record the exact command and output in the SUMMARY,
  stop that criterion, and file a todo (`df-tools todo add`); do not patch code here.
- Commands that write target a scratch path from `mktemp -d` (call it S; reuse the literal path, because shell variables
  do not survive between calls) via `--cwd`. Never run a writing command against the live `.planning/`.
- `DF` = `node plugins/devflow/devflow/bin/df-tools.cjs` (repository, the fix). `OLD` =
  `node ~/.claude/devflow/bin/df-tools.cjs` (installed runtime, used only for the "before" column). If `OLD` already
  carries objective 70, say so and skip the before column.
- One plain command per Bash call (the worktree guard refuses compound commands); the Bash tool reports the exit code.
- Planning writes go through verbs: the todo is added with `df-tools todo add --from <file>`.
</context>

<embedded_context>

<codebase_examples>
Dogfood command shapes (`<R>` = this checkout's absolute path):
```
SC-1  mkdir -p <S>/copy
      cp -R <R>/.planning <S>/copy/.planning
      OLD --cwd <S>/copy state update-progress            -> before: {"updated": false, ...}, exit 0
      DF  --cwd <S>/copy state update-progress            -> {"updated": true, "inserted": true, ...}, exit 0
      diff <R>/.planning/STATE.md <S>/copy/.planning/STATE.md   -> one added "**Progress:** [...] N%" line
      DF  --cwd <S>/copy state update-progress            -> no "inserted"; rg -c "Progress:" -> 1
      (Write tool) <S>/nopos/.planning/STATE.md = "# Project State\n\n## Notes\n\nnothing\n"
      DF  --cwd <S>/nopos state update-progress           -> exit 1, stderr "Error: ... ## Current Position ..."
      ls -a <S>/nopos/.planning                           -> no state.json
      git status --porcelain -- .planning/STATE.md .planning/state.json   -> empty
SC-2  OLD --cwd .planning/objectives/70-cli-defects-and-hook-shape verify trd-pre 70 --raw   -> before: Objective not found
      DF  --cwd .planning/objectives/70-cli-defects-and-hook-shape verify trd-pre 70 --raw   -> "valid — 5/5 ..." or the real result
      DF  --cwd <S> verify trd-pre <R>/.planning/objectives/64-estimate-accuracy-validation --raw   -> valid
      DF  verify trd-pre 99                               -> exit 1, "error": "Objective not found", "project_root"
SC-3  OLD objective-job-index 64                          -> before: no gap_closure key
      DF  objective-job-index 64                          -> gap_closure per job
SC-4  mkdir -p <S>/hook/.planning
      (Write tool) <S>/hook/.planning/config.json = {"mode":"autonomous"}
      (Write tool) <S>/hook/.planning/STATE.md    = "# State\n\nStatus: Executing\n"
      git init -q <S>/hook
      node -e "<spawnSync verify-commits.js, cwd <S>/hook, env DEVFLOW_HOOK_MARKER_DIR=<S>/markers,
               input {agent_id:'dogfood-1', agent_type:'devflow:executor', hook_event_name:'SubagentStop'};
               print stdout and stopFamilyProblems('SubagentStop', JSON.parse(stdout))>"   -> top-level block, []
      same with agent_id 'dogfood-2', agent_type 'Explore'                                     -> empty stdout
      node --test plugins/devflow/hooks/verify-commits.test.js plugins/devflow/hooks/hook-coexistence.test.js
```
An empty repository (`git init`, no commit) counts as "no recent commits" (`hasRecentCommits` returns false on a
non-zero `git log` that is not "not a git repository"), so SC-4 needs no commit.

CHANGELOG lead-paragraph style (the objective 69 paragraph, lines 9-13): the objective number and requirement IDs in
parentheses, one sentence of outcome, one of mechanics, and "Entries that need an installed plugin take effect once the
installed plugin carries objective N."
</codebase_examples>

<anti_patterns>
- Do not run `DF state update-progress` without `--cwd <S>/…`: it would insert the Progress line into the live STATE.md.
- Do not copy scratch results back into the repository.
- Do not describe internal function names (`setProgressLine`, `resolveTarget`, `stopFamilyProblems`) in USER-GUIDE or
  CLAUDE.md. Describe commands, exit codes and behaviour. The CHANGELOG may name files.
- Do not repeat the CHANGELOG text in CLAUDE.md.
- Do not tell readers to edit `.planning/` files by hand (`planning-writes.repo.test.cjs` fails CI on that).
</anti_patterns>

<error_recovery>
- `cp -R` copies this session's live `.planning/.skill-active`: harmless for these commands. Remove it from the copy
  (`rm -f <S>/copy/.planning/.skill-active`) if a check reads it.
- `OLD --cwd` is rejected (installed runtime too old for the global flag): run the before command with the Bash tool's
  working directory set by the command's own `--cwd`-free form from the repository root, and note it.
- The full suite fails outside the baseline: rerun the failing file alone. If it is one of 70-01/70-02's files, record
  it and stop; this TRD does not patch code.
</error_recovery>

</embedded_context>

<gotchas>
- Baseline from 69-06 (2026-10-08, main checkout): `npm test` 11406 tests, 1 fail. The failure is
  `roadmap-reconcile.test.cjs` E2E1 (a checkpoint SUMMARY beside an unticked ROADMAP checkbox; transient, clears after
  `roadmap update-job-progress`). The `devflow-watch` and handoff daemon tests fail in worktrees only.
- `micro.test.cjs` hangs when git commit signing prompts. Use
  `node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` then.
- `verify trd-pre 70` checks objective 70's own TRDs. Its dimensions may legitimately report a warning. The criterion is
  that it resolves (no `Objective not found`), not that every dimension passes.
- The live SubagentStop path cannot be observed from an executor: the installed plugin runs the old hook until release.
  Record it as a todo, not as a pass.
- Never use port 8080. Commit with `df-tools commit`, never raw `git commit`.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Dogfood SC-1..SC-4 (before on the installed runtime, after on the repository) and record landed state</name>
  <files>(no repository files; evidence goes in 70-03-SUMMARY.md)</files>
  <action>
1. `mktemp -d` and note S. Run the SC-1 to SC-4 command shapes from codebase_examples, one per Bash call, with literal
   paths. Capture each command, its exit code and the decisive output line(s).
2. Landed state: for 70-01 and 70-02, take the last commit hash from each SUMMARY and run
   `git merge-base --is-ancestor <hash> HEAD`, plus `git cat-file -e HEAD:<path>` for each created file
   (`plugins/devflow/devflow/bin/lib/__fixtures__/cli-defects-fixtures.cjs`,
   `plugins/devflow/devflow/bin/lib/state-update-progress.test.cjs`,
   `plugins/devflow/devflow/bin/lib/misc-job-index.test.cjs`, `plugins/devflow/hooks/__fixtures__/hook-output-schema.js`).
3. Build the SUMMARY evidence table now (in your notes; the SUMMARY is written at the end of the TRD). Columns:
   criterion, command, before (OLD), after (DF), verdict.
  </action>
  <verify>
Every row of the evidence table has an exact command and output. `git status --porcelain -- .planning/STATE.md .planning/state.json` is empty.
  </verify>
  <done>SC-1..SC-4 each have an "after" result matching the must_haves truths, landed-state checks pass, and the live
STATE.md and state.json are unchanged.</done>
  <recovery>A criterion that fails is recorded with its command and output and filed as a todo; continue with the others
and with Task 2 (the docs describe what landed).</recovery>
</task>

<task type="auto">
  <name>Task 2: CHANGELOG, CLAUDE.md, USER-GUIDE, job-checker and the follow-up todo; full suite</name>
  <files>CHANGELOG.md, CLAUDE.md, docs/USER-GUIDE.md, plugins/devflow/agents/job-checker.md</files>
  <action>
1. `CHANGELOG.md` `[Unreleased]`:
   - Lead paragraph above objective 69's: "Objective 70 (TOOL-07, TOOL-08): three df-tools commands that reported success
     while doing nothing now do their job or fail, and verify-commits.js blocks in the shape Claude Code reads." Follow
     it with one mechanics sentence and the installed-plugin sentence.
   - `### Fixed`, at the top, four entries. Each names the command or hook, the old behaviour, the new behaviour and the
     TRD:
     (a) `state update-progress` rewrites a plain template `Progress:` line, adds a `**Progress:**` line under
     `## Current Position` when there is none, and exits 1 when neither is possible or STATE.md is missing. It used to
     print `updated: false` and exit 0 (70-01).
     (b) `verify trd-pre <N|path>` finds the project root from any directory inside it and accepts an objective directory
     path; not-found exits 1 with `project_root`. It used to resolve against the cwd only and exit 0 (70-01).
     (c) `objective-job-index` reports `gap_closure` (boolean) from TRD frontmatter, which `--gaps-only` filters on;
     the execute-objective step names the `jobs[]` key (70-01).
     (d) verify-commits.js prints its SubagentStop block as top-level `{decision, reason}`; it was nested in
     `hookSpecificOutput`, which Claude Code does not read for SubagentStop, so the retry never fired. It now blocks only
     `devflow:executor`. `hooks/__fixtures__/hook-output-schema.js` models the documented schema, and verify-commits and
     the coexistence contract test against it (70-02).
2. `CLAUDE.md`: append to the **State operations** bullet: "; `state update-progress` rewrites or adds the Progress line
   under `## Current Position`, else exits 1". Replace the hooks bullet with: "`verify-commits.js` — SubagentStop; warns
   on no commits in last 10min, and in autonomous mode blocks a `devflow:executor` stop once per agent (top-level
   `{decision, reason}`, objective 70)".
3. `docs/USER-GUIDE.md` row 823: the description says it warns when a subagent finishes with no commit in the last
   10 minutes, and in autonomous mode blocks a `devflow:executor` stop once per agent so the executor commits its work.
   The escape column becomes "n/a (one block per agent)".
4. `plugins/devflow/agents/job-checker.md` Dimension 8 step 1, after the command block: "It finds the objective from any
   directory inside the project, and accepts the objective directory's path. A non-zero exit with `Objective not found`
   means the objective does not exist: report the command and its output instead of measuring file sizes yourself."
5. Follow-up todo: write a short todo body in the scratch dir ("Confirm verify-commits.js's top-level SubagentStop block
   on a live Claude Code SubagentStop after the next release re-syncs the plugin (objective 70, 63-05 follow-up)") and
   run `node ~/.claude/devflow/bin/df-tools.cjs todo add --from <S>/todo.md`. Use `DF` if `OLD` lacks `todo add`.
6. Full suite (see gotchas for the micro exclusion). Compare with the baseline.
  </action>
  <verify>
node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs
  </verify>
  <done>The four doc-guard files pass. `rg -n "objective 70" CHANGELOG.md` hits the paragraph and Fixed entries.
`rg -n "update-progress" CLAUDE.md` and `rg -n "devflow:executor" docs/USER-GUIDE.md` hit. The todo exists under
`.planning/todos/pending/`. The full suite shows no failure outside the baseline.</done>
  <recovery>If `doc-refs.repo.test.cjs` or `planning-writes.repo.test.cjs` flags new prose, reword it (command names from
the current skill set; describe verbs, not direct `.planning/` edits) and rerun.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test {files}   (scoped; Task 2's verify line)</test>
<test>npm test   (objective gate; micro exclusion form if signing prompts)</test>
</validation_gates>

<verification>
- The SUMMARY evidence table covers SC-1..SC-4 with before and after outputs.
- `git status --porcelain -- .planning/STATE.md .planning/state.json` is empty after dogfood.
- The full suite has no failure outside the 69-06 baseline.
</verification>

<success_criteria>
- Objective 70 success criteria 1-4 are each demonstrated by a command and its output.
- The user-facing docs describe the shipped behaviour, and the live-SubagentStop check is tracked as a todo.
</success_criteria>

<output>
After completion, create `.planning/objectives/70-cli-defects-and-hook-shape/70-03-SUMMARY.md` through
`df-tools summary post`, with the evidence table (rows labelled `SC-1`..`SC-4`).
</output>
