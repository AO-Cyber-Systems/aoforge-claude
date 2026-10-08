---
objective: 58-estimation-engine-and-surfacing
trd: "09"
type: standard
wave: 6
depends_on: ["58-08"]
files_modified:
  - plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs
  - plugins/devflow/agents/planner.md
  - plugins/devflow/devflow/workflows/plan-objective.md
  - plugins/devflow/devflow/workflows/build.md
  - plugins/devflow/devflow/workflows/execute-objective.md
autonomous: true
requirements: [EST-04, EST-05]
must_haves:
  truths:
    - "The planner's `## PLANNING COMPLETE` return carries an `**Estimate:**` block pasted verbatim from `df-tools estimate objective <N> --table --raw` (or the `No estimate:` line)"
    - "plan-objective shows the estimate table on PLANNING COMPLETE and re-runs it in the final OBJECTIVE PLANNED block, after any checker revisions"
    - "/devflow:build prints the one-line estimate (`estimate objective <N> --line --raw`) right after resolving the objective, and runs `estimate start <N>` before execution so the status line has a live run"
    - "execute-objective records each wave with `estimate wave <obj> <N> --start` before spawning and `--done` before the Wave Complete report, which includes the actual-vs-estimate line; aggregate_results prints `estimate finish`"
    - "Every estimate call in prose is fail-soft: a failure or `No estimate:` line is shown as is or omitted, and never blocks planning or execution"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs
      provides: "CI pin for every estimate surfacing call and its placement"
  key_links:
    - "agents/planner.md PLANNING COMPLETE -> df-tools estimate objective --table --raw (58-08)"
    - "workflows/build.md -> estimate objective --line, estimate start, estimate finish"
    - "workflows/execute-objective.md execute_waves -> estimate wave --start/--done; aggregate_results -> estimate finish"
    - "estimate start/wave -> run state -> hooks/statusline.js segment (58-04)"
---

# TRD 58-09: Estimates in plan-objective, build and wave reports (EST-04, EST-05)

<objective>
Put the estimate where people look, with the smallest prose change that does it (Objective 62 will later rework these
files for built-in progress UI, so keep every edit local and additive):

- **EST-04.** The planner's PLANNING COMPLETE return gains an `**Estimate:**` table (`df-tools estimate objective <N>
  --table --raw`, pasted verbatim). plan-objective shows it on PLANNING COMPLETE and re-runs it in `<offer_next>`, so
  the final view reflects any checker revisions.
- **EST-05.** `/devflow:build` prints the one-line estimate right after it resolves the objective (an unplanned objective
  gets the history-based line), runs `estimate start` once TRDs exist (the status line reads that run state), and shows
  `estimate finish` in its completion block. execute-objective records each wave with `estimate wave ... --start` and
  `--done`, and its Wave Complete report carries the actual-vs-estimate line; `aggregate_results` prints the objective's
  finish line.

Every call is fail-soft: an estimate never blocks planning or building. If the command fails (an older runtime without
`estimate`) or prints `No estimate: ...`, the prose shows that line or omits it and carries on.

Purpose: success criteria 3 and 4.
Output: one repo test pinning the calls, and targeted edits to one agent and three workflows.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- TDD for prose: the repo test is written first and fails on the unedited files (RED), then the prose makes it pass.
  `test(58-09): ...` then `docs(58-09): ...` (prose commits use `docs`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash
  call.
- Navigate before reading: these files are long (execute-objective.md is about 1,230 lines). Locate anchors with
  `rg -n` and read narrow ranges; make each change with a targeted Edit. No reformatting, no rewording of nearby text.
- Every new command line in prose uses the mirror path `node ~/.claude/devflow/bin/df-tools.cjs estimate ...` and is one
  plain command (no `&&`, pipes or `$(...)` needed).
- Do not edit any SKILL.md: the skills include these workflows.

## Test list

`estimate-surfacing.repo.test.cjs` (read-only; skip the file when not in a DevFlow checkout, as doc-surfaces.test.cjs
does). Each assertion names the file and the missing text on failure.

1. `agents/planner.md`: the `## PLANNING COMPLETE` template block contains `**Estimate:**` and the command
   `df-tools.cjs estimate objective` with `--table --raw`; the return-budget sentence says the estimate table is pasted
   verbatim on top of the budget.
2. `workflows/plan-objective.md`: the step 10 `## PLANNING COMPLETE` bullet mentions the Estimate; `<offer_next>`
   contains `df-tools.cjs estimate objective {X} --table --raw` under an `Estimate` heading.
3. `workflows/build.md`: `estimate objective` with `--line --raw` appears before `## 4. Research`; `estimate start`
   appears inside `## 7. Execute TRDs` before the execute-objective `Task(`; `estimate finish` appears inside `## 8.`.
4. `workflows/execute-objective.md`: inside `<step name="execute_waves">`, `estimate wave` with `--start` appears in item
   1 (before `Spawning {count} agent(s)`) and `estimate wave` with `--done` appears in item 6 before `## Wave {N}
   Complete`, whose template includes an estimate line placeholder; inside `<step name="aggregate_results">`,
   `estimate finish` appears.
5. Every `df-tools.cjs estimate <sub>` in those four files uses a subcommand named in `estimate-cli.cjs`'s `USAGE`
   (task, trd, objective, milestone, start, wave, finish), and each file that calls it also carries a fail-soft
   sentence (matches `never block`).
6. Sensitivity: the matcher used by test 5 flags an in-memory line `df-tools.cjs estimate objectives 3` (unknown
   subcommand) and passes `df-tools.cjs estimate objective 3 --line --raw`.

<embedded_context>

<codebase_examples>
Planner return template today (agents/planner.md, `<structured_returns>`):

```markdown
## PLANNING COMPLETE

**Objective:** {phase-name}
**Plans:** {N} TRDs in {M} waves at:
- {paths-list, one per line, no detail}
**Pushed:** {yes | no — `plan push` not run}

Read `{paths}` for wave/confidence/files/dependencies. Run `/devflow:execute-objective {objective}` to begin.
```

Add after `**Pushed:**`:

```markdown
**Estimate:**
{verbatim output of `node ~/.claude/devflow/bin/df-tools.cjs estimate objective {objective} --table --raw`; if the command fails, `not available ({first line of the error})`}
```

and a short `<step name="estimate">` before `<step name="offer_next">` in `<execution_flow>` that runs it after the TRDs
are published (standard mode only; gap-closure and quick returns are unchanged).

plan-objective.md `<offer_next>` today shows Research / Verification / Confidence lines after the wave table; add:

```markdown
### Estimate

{output of `node ~/.claude/devflow/bin/df-tools.cjs estimate objective {X} --table --raw`, run now (after any revisions); show a `No estimate:` line as is}
```

build.md anchors: `## 2. Resolve Objective` (one-line estimate at its end), `## 3. Present Build Plan` (replace the
`**Estimated waves:** {based on objective complexity}` bullet with `**Estimate:** {the one-line estimate}`), `## 7.
Execute TRDs` (before the `Task(` that runs execute-objective: `estimate start ${OBJECTIVE_NUMBER} --raw`, print its
line), `## 8. Auto-Verify + Complete` (in the OBJECTIVE COMPLETE block, under `Duration: {total time}`: `Estimate:
{output of estimate finish ${OBJECTIVE_NUMBER} --raw}`).

execute-objective.md anchors: `<step name="execute_waves">` item 1 (`## Wave {N}` announcement; add the line from
`estimate wave {objective} {N} --start --raw` under the header), item 6 (`## Wave {N} Complete`; run `estimate wave
{objective} {N} --done --raw` first and add `{actual vs estimate line}` to the template), and `<step
name="aggregate_results">` (`**Time:** {output of estimate finish {objective} --raw}` under the Waves/Jobs line).
</codebase_examples>

<anti_patterns>
- Turning the estimate into a gate ("stop if over budget"). It informs; it never blocks.
- Inlining estimate numbers or formatting rules in prose. The prose pastes df-tools output verbatim.
- Shell composition in the new lines (`$(...)`, `&&`, pipes). One plain command per call; note the printed line.
- Touching unrelated prose in these files (Objective 62 sweeps them next).
</anti_patterns>

<error_recovery>
- If an existing prose test fails after an edit (for example a test that pins the wave announcement or aggregate table
  text), the edit changed existing text rather than adding to it. Restore the original lines and add the new line next
  to them.
- If test 3's ordering assertion fails, the one-line estimate landed after research; it belongs at the end of step 2.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs
@.planning/objectives/58-estimation-engine-and-surfacing/58-08-SUMMARY.md
</context>

<gotchas>
- Fail-soft sentence, the same in each file (test 5 matches `never block`): "If the estimate command fails or prints
  `No estimate:`, show that line (or nothing) and carry on; an estimate never blocks planning or execution."
- execute-objective runs as a subagent under /devflow:build; its Bash calls write the run state under the user's HOME,
  which is what the main session's status line reads. `estimate wave --start` creates the run when none is live, so
  execute-objective run on its own also feeds the status line.
- The planner's return budget stays 300 tokens for its own prose; the pasted table (about 10 lines) is on top. Say so in
  the budget sentence.
- Known `npm test` baseline failures: handoff-e2e MA-7, stack-drafter-fleet github-enterprise-migration, roadmap-reconcile
  E2E1 while a TRD of the running objective is unticked.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Repo pin, planner PLANNING COMPLETE estimate, plan-objective display (EST-04)</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs, plugins/devflow/agents/planner.md, plugins/devflow/devflow/workflows/plan-objective.md</files>
  <action>
RED: write the whole repo test (tests 1-6). Tests 1, 2 and 6 fail or pass as expected now; 3-5 fail on the build and
execute-objective parts until Task 2 (that is fine: commit the test with all of them, record which failed). Commit
`test(58-09): pin estimate surfacing in plan, build and wave reports`.

GREEN (EST-04 half):
1. planner.md: the `**Estimate:**` field in the PLANNING COMPLETE template, the budget sentence, and a `<step
   name="estimate">` before `offer_next` (run the command once after `plan push`, standard mode only, fail-soft).
2. plan-objective.md: step 10's PLANNING COMPLETE bullet says to display the `**Estimate:**` block from the return;
   `<offer_next>` gains the `### Estimate` section from codebase_examples with the fail-soft sentence.
Commit `docs(58-09): estimate table in PLANNING COMPLETE and plan-objective`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs` passes tests 1, 2 and 6 (3-5 still red until Task 2).</verify>
  <done>Planner and plan-objective carry the estimate table call with fail-soft wording; the test recorded RED first.</done>
  <recovery>If the planner template edit breaks a test that pins the PLANNING COMPLETE block, keep the existing lines byte-identical and insert the Estimate field as new lines only.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Build one-line estimate, run state, wave reports and finish line (EST-05)</name>
  <files>plugins/devflow/devflow/workflows/build.md, plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>
The RED for this task is tests 3-5 from Task 1's commit (still failing). Edit:
1. build.md: one-line estimate at the end of step 2 (plus the `**Estimate:**` bullet in step 3's plan), `estimate start`
   in step 7 before the `Task(`, `estimate finish` in step 8's OBJECTIVE COMPLETE block; the fail-soft sentence once.
2. execute-objective.md: `estimate wave {objective} {N} --start --raw` in item 1 with its line under `## Wave {N}`;
   `estimate wave {objective} {N} --done --raw` in item 6 before the report and `{actual vs estimate line}` in the
   `## Wave {N} Complete` template; `**Time:** {output of estimate finish {objective} --raw}` in aggregate_results; the
   fail-soft sentence once.
Then run every prose test that reads these files.
Commit `docs(58-09): estimates in /devflow:build and execute-objective wave reports`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/df-tools-deprecations.repo.test.cjs plugins/devflow/devflow/bin/lib/rg-flag-guard.test.cjs` passes, then `rg -l "execute-objective.md|build.md" plugins/devflow --glob '*.test.*'` and run each listed test file.</verify>
  <done>Tests 1-6 pass; every existing prose test that reads build.md or execute-objective.md still passes.</done>
  <recovery>If `rg-flag-guard` or `planning-writes` flags a new line, the line used a shell construct or a write instruction; replace it with the plain df-tools command form from codebase_examples.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/estimate-surfacing.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- Success criterion 3: plan-objective's PLANNING COMPLETE output includes an estimate table (planner return and the
  OBJECTIVE PLANNED view).
- Success criterion 4: /devflow:build prints a one-line estimate at start; the status line has a live run (estimate
  start/wave); wave reports show actual against estimate; the finish line closes the run.
</verification>

<success_criteria>
- estimate-surfacing.repo.test.cjs passes 6/6; all other prose tests unchanged and green.
- `git diff --stat` touches only the five files in files_modified.
- Full `npm test` shows no failures beyond the known baseline ones.
</success_criteria>

<output>
After completion, publish `58-09-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. List each inserted line with its file and anchor so Objective 62's sweep can find them.
</output>
