---
objective: 64-estimate-accuracy-validation
trd: "06"
type: standard
wave: 4
depends_on: ["64-05"]
files_modified:
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - CLAUDE.md
autonomous: true
requirements: [EST-08]
must_haves:
  truths:
    - "CHANGELOG [Unreleased] names `df-tools estimate backtest`, the run history and the richer run state as Added, the done-objective `--all` text as Fixed, and the Objective 64 out-of-sample result (EST-08 met or not met, with the two median ratios and the coverage) in one entry"
    - "docs/USER-GUIDE.md's Estimates section documents `estimate backtest` (what it compares, the fixed rules, prospective vs reconstructed), the run history under <state dir>/history/<repo-key>/, and replaces the 'Objective 64 tests the method out of sample' sentence with the measured out-of-sample result and the report path; the `all TRDs done` caveat for `--all` is removed"
    - "CLAUDE.md's Estimation data bullet names `estimate backtest`, the run history and `lib/estimate-backtest.cjs`"
    - "The full `npm test` run passes, or every failure is shown to be pre-existing on the objective's base commit"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] entries for objective 64"
    - path: docs/USER-GUIDE.md
      provides: "Estimates section: backtest, run history, out-of-sample result"
    - path: CLAUDE.md
      provides: "Estimation data bullet updated"
  key_links:
    - "USER-GUIDE Estimates -> .planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md"
    - "doc-refs.repo.test.cjs and dispatch-completeness.test.cjs -> every documented `df-tools estimate backtest` reference dispatches"
---

# TRD 64-06: Document the backtest and the out-of-sample result, then run the full suite (EST-08)

<objective>
Close Objective 64 the way 57-07 and 58-10 closed theirs: the user-facing docs describe what shipped and what was
measured, and the whole suite runs.

What changed in this objective, for the docs:
- `df-tools estimate backtest <N[,N...]> [--calibration <file>] [--raw]` (64-04, over `lib/estimate-backtest.cjs`,
  64-01): compares each objective's estimate with its measured executor minutes and priced tokens, uses a persisted
  run state when one exists, and prints the EST-08 verdict from fixed rules (median ratio within ±30%; P90 covering at
  least 80% of objectives and of TRDs; agent minutes and cost).
- Run history (64-02): `estimate finish` archives a finished run to
  `~/.claude/devflow/state/estimates/history/<repo-key>/<objective>-<started_at>.json`, and `start` archives a finished
  previous run before replacing it; a new run also records the execution and total estimates and the calibration
  identity. Never in the repository.
- Fixed (64-02): `estimate objective N --all --line|--table` on a done objective prints the estimate.
- Data (64-03): the token history of objectives 58-63 was backfilled; only 8 of 41 executor SUMMARYs of 59-63 had been
  stamped live.
- Result (64-05): read the verdict, the agent-minute and cost median ratios, the P90 coverage and the follow-up todo
  (if any) from `.planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md` and 64-05's SUMMARY. Quote
  them; do not recompute.

Purpose: a reader of the USER-GUIDE knows how far to trust an estimate, measured, and how to recheck it.
Output: CHANGELOG, USER-GUIDE and CLAUDE.md updates; full-suite evidence.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per
  Bash call.
- Edit the three files with targeted `Edit` calls; read only the sections you change (`rg -n` to locate, then `Read`
  with `offset`/`limit`).
- Prose style: plain declaratives, no hype; follow the surrounding paragraphs (the USER-GUIDE Estimates bullets are
  `- **Label.** sentence...`).
- `requirements: [EST-08]` names the requirement this TRD serves. **Do not run `requirements mark-complete EST-08`**;
  record `requirements-completed: []` (64-05 decided EST-08).
- The full suite includes `micro.test.cjs`, which hangs when git commit signing prompts. Run `npm test`; if it hangs
  on signing, run the documented exclusion form and say so in the SUMMARY.
- Never use port 8080.

<embedded_context>

<codebase_examples>
CHANGELOG [Unreleased] entries are wrapped at about 120 columns, under `### Added` / `### Fixed`, each starting with
the command or file in backticks and naming the objective, for example:

```markdown
- `df-tools todo sync (--transcript <path>... | --session <id>) [--projects-root dir] [--dry-run] [--no-flush] [--raw]`
  (`lib/todo-session.cjs`, `lib/todo-sync.cjs`): replays a session transcript's task-list calls and merges its todos into
  the archive through `todo add` and `todo complete`. ...
```

USER-GUIDE lines to change (docs/USER-GUIDE.md, `### Estimates (df-tools estimate)`, about lines 278-307):

- the command block (add `node ~/.claude/devflow/bin/df-tools.cjs estimate backtest 59,60,61,62,63   # estimate vs actual, EST-08 verdict`);
- `- **\`objective\`.**` bullet: drop "For an objective whose TRDs are all done the text forms print `all TRDs done`,
  so read a completed objective's backtest from the JSON." and say `--all` text forms show the estimate;
- `- **Run state.**` bullet: add the history directory and that `finish` / a replacing `start` archive finished runs;
- `- **What is assumed.**` bullet: keep the in-sample sentence, replace "Objective 64 tests the method out of sample."
  with the measured result and the report path;
- a new `- **\`backtest\`.**` bullet after `milestone`: what it compares (executor minutes from SUMMARY durations or
  the STATE_ARCHIVE row, priced SUMMARY tokens), prospective vs reconstructed, the fixed rules, exclusions named with
  TRD ids, `--raw` for the markdown report.

CLAUDE.md, the `**Estimation data**` bullet (line ~64): add `estimate backtest <N[,N...]>` beside
`estimate task|trd|objective|milestone`, mention that `estimate finish` archives runs to
`~/.claude/devflow/state/estimates/history/`, and add `estimate-backtest.cjs` to the "Implemented in" list. Keep it one
bullet; CLAUDE.md is resident on every turn, so add only what a future session needs to find the code.
</codebase_examples>

<anti_patterns>
- Do not restate the whole accuracy report in the USER-GUIDE: one or two sentences with the numbers and the path.
- Do not claim EST-08 is met unless 64-05's verdict says so.
- Do not document `estimate backtest` with the mirror path unless the release ships it; the USER-GUIDE uses
  `~/.claude/devflow/bin/df-tools.cjs` everywhere and that is correct after release, which is how the existing
  estimate lines read.
</anti_patterns>

<error_recovery>
- `doc-refs.repo.test.cjs` or `dispatch-completeness.test.cjs` fails on a new reference: the reference names a command
  form that does not dispatch; correct the prose (not the test).
- A full-suite failure outside this objective's files: check it on the objective's base commit in a disposable worktree
  (`git worktree add <scratch>/base <base sha>`, run the one test file there, then `git worktree remove`), and record it
  as pre-existing with the evidence. Known environmental one: MA-7 handoff-e2e with `DIGITALOCEAN_ACCESS_TOKEN` set was
  made hermetic in 63-07.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md
@.planning/objectives/64-estimate-accuracy-validation/64-05-SUMMARY.md
</context>

<gotchas>
- The USER-GUIDE is long; never read it whole. `rg -n -e '### Estimates' -e 'What is assumed' -e 'Run state' -e 'all TRDs done' docs/USER-GUIDE.md`
  locates every line to change.
- CHANGELOG `## [Unreleased]` already has `### Added` with objective 63 entries; append under the existing headings
  (create `### Fixed` only if it is missing).
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: CHANGELOG, USER-GUIDE and CLAUDE.md describe the backtest, the run history and the measured result</name>
  <files>CHANGELOG.md, docs/USER-GUIDE.md, CLAUDE.md</files>
  <action>
1. Read 64-05's SUMMARY `## Primary result` and the report's `## Verdict` for the numbers.
2. CHANGELOG [Unreleased]: under `### Added`, one entry for `df-tools estimate backtest` (+ `lib/estimate-backtest.cjs`)
   and one for the run history and richer run state; under `### Fixed`, the done-objective `--all` text; one entry
   (under `### Added` or a `### Validation` note if the file already uses one; otherwise `### Added`) stating the
   Objective 64 out-of-sample result with both median ratios, the coverage, EST-08 met or not met, and the report path.
3. USER-GUIDE: the five edits listed in codebase_examples.
4. CLAUDE.md: the Estimation data bullet edit.
5. Commit: `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(64-06): document estimate backtest, run history and the EST-08 result" --files CHANGELOG.md docs/USER-GUIDE.md CLAUDE.md`.
  </action>
  <verify>`rg -n "estimate backtest" CHANGELOG.md docs/USER-GUIDE.md CLAUDE.md` finds each file; `rg -n "Objective 64 tests the method out of sample" docs/USER-GUIDE.md` finds nothing; `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` passes.</verify>
  <done>The three documents describe what Objective 64 shipped and measured, with numbers that match the report.</done>
  <recovery>If a repo test rejects a reference, fix the prose; `git restore -- <file>` and redo the edit if a change went wrong.</recovery>
</task>

<task type="auto">
  <name>Task 2: Full test suite</name>
  <files>none (evidence recorded in 64-06-SUMMARY.md)</files>
  <action>
Run `npm test` from the repository root (timeout 900 s). Record totals (tests, pass, fail, skipped). For every
failure, decide pre-existing vs regression per error_recovery and record the evidence. A regression in a file this
objective touched is fixed here with a `fix(64-06): ...` commit (and a test if the fix is logic), then the suite is
re-run.
  </action>
  <verify>The SUMMARY records the `npm test` totals; zero failures, or each failure shown pre-existing on the base commit.</verify>
  <done>The objective ends on a green (or explained) full suite.</done>
  <recovery>If `npm test` hangs on commit signing (micro.test.cjs), stop it and run `node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`, then run `node --test plugins/devflow/devflow/bin/lib/micro.test.cjs` separately once signing is available, and record both.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- CHANGELOG, USER-GUIDE and CLAUDE.md name `estimate backtest`; the USER-GUIDE states the out-of-sample result and
  links the report; no `all TRDs done` caveat for `--all` remains.
- Full suite totals recorded with every failure classified.
</verification>

<success_criteria>
- A reader can find the backtest command, the run history and the measured accuracy from the docs alone.
- The objective's code is covered by a passing full suite.
</success_criteria>

<output>
After completion, create `.planning/objectives/64-estimate-accuracy-validation/64-06-SUMMARY.md` with
`requirements-completed: []`.
</output>
