---
objective: 58-estimation-engine-and-surfacing
trd: "10"
type: standard
wave: 7
depends_on: ["58-09"]
files_modified:
  - CHANGELOG.md
  - CLAUDE.md
  - docs/USER-GUIDE.md
  - scripts/gen-docs-data.cjs
autonomous: true
requirements: [EST-02, EST-03, EST-04, EST-05]
must_haves:
  truths:
    - "A real `calibrate` over this repository writes a version 2 ~/.claude/devflow/calibration.json with measured agent_overhead (planner, job-checker, verifier sample counts recorded) and objective_level, and a rerun is byte-identical"
    - "`df-tools estimate task|trd|objective|milestone` run live against this repository print median/P90 minutes, tokens and dollars with sample counts and confidence, including an unplanned objective (59) and the v1.5 milestone"
    - "A live run-state smoke (start, wave --start, status line render, wave --done, finish) shows the status line segment and the actual-vs-estimate lines, using a scratch state dir and HOME"
    - "An in-sample backtest of objectives 55-57 (estimate --all against SUMMARY durations and token cost) is recorded as information for Objective 64, not as a pass/fail gate"
    - "CHANGELOG [Unreleased], CLAUDE.md, docs/USER-GUIDE.md and the status line hook doc describe the estimate commands, the composition method, the confidence labels and where estimates appear; the full npm test passes apart from the known baseline failures"
  artifacts:
    - path: docs/USER-GUIDE.md
      provides: "Estimates section: commands, method, confidence, surfacing, run state, calibration v2 keys"
    - path: CHANGELOG.md
      provides: "[Unreleased] entries for df-tools estimate, calibration v2, the status line segment and the plan/build/wave surfacing"
  key_links:
    - "CLAUDE.md Core Tool 'Estimation data' bullet -> estimate verbs (dispatch-completeness requires every documented df-tools command to dispatch)"
    - "scripts/gen-docs-data.cjs HOOK_DOCS statusline entry -> site data at the next release"
---

# TRD 58-10: Dogfood the estimates on this repository, then document them

<objective>
Prove the engine on real data and write it down:

1. **Calibrate v2 for real.** Run the repo copy of `calibrate` (the `~/.claude/devflow` mirror still holds 2.13.x code)
   twice: the file is version 2, agent overhead is measured from this repo's planner, plan-checker and verifier
   transcripts, and the rerun is byte-identical.
2. **Estimate live.** `estimate task`, `trd`, `objective` (a completed one with `--all`, the unplanned 59) and
   `milestone` (v1.5), recorded verbatim in the SUMMARY.
3. **Backtest, in-sample.** For objectives 55, 56 and 57: `estimate objective N --all` against the sum of their SUMMARY
   durations (agent minutes) and their priced SUMMARY tokens (dollars). These objectives are in the calibration, so the
   comparison is optimistic; it is information for Objective 64 (EST-08), not a gate.
4. **Run-state smoke.** `estimate start`, `wave --start`, a status line render, `wave --done`, `finish` against a
   scratch state dir and HOME.
5. **Docs.** CHANGELOG [Unreleased], the CLAUDE.md Estimation data bullet and statusline hook line, a USER-GUIDE
   "Estimates" section, the gen-docs HOOK_DOCS statusline text; full `npm test`.

Purpose: objective-level evidence for success criteria 1-4 and the user-facing documentation.
Output: four doc files changed; live evidence in the SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Use the repo copy for every live command: `node plugins/devflow/devflow/bin/df-tools.cjs ...` (the mirror lacks
  `estimate`). One plain command per Bash call.
- Writing `~/.claude/devflow/calibration.json` is intended (57-07 did the same). Nothing else under the real
  `~/.claude` is written: the run-state smoke sets `DEVFLOW_ESTIMATE_STATE_DIR` and `HOME` to scratch dirs.
- No code changes in this TRD. If a live run exposes a defect, record it in the SUMMARY as a deviation with the
  failing command and output, fix nothing here, and report it for gap closure.
- Commit docs with `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(58-10): ..." --files <paths>`. The
  calibration file and scratch output are outside the repo and are not committed.
- Never use port 8080 (nothing here needs a server).

## Test list

Doc and evidence checks (the code is tested by 58-01..58-09):

1. `calibrate --raw` twice: the second run says `unchanged`; `shasum -a 256 ~/.claude/devflow/calibration.json` is the
   same after each run; the file has `"version": 2` and `agent_overhead.planner.samples` > 0.
2. `estimate task --files plugins/devflow/devflow/bin/lib/estimate.cjs,plugins/devflow/devflow/bin/lib/estimate.test.cjs
   --tdd --raw` prints a `Task code_tdd:` line with `n=` and a confidence label.
3. `estimate objective 59 --table --raw` prints an unplanned table; `estimate milestone --table --raw` prints the v1.5
   table with 58 done (after this TRD's SUMMARY) or partial (before), 59-64 unplanned, and a total row.
4. The status line render in the smoke contains `⏱ 58`; `finish` prints `Objective 58 execution: actual`.
5. `node plugins/devflow/devflow/bin/df-tools.cjs validate docs --raw` reports no new W050-W054 finding against the
   edited docs; `node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs
   plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs`
   passes.

<embedded_context>

<codebase_examples>
CLAUDE.md Core Tool bullet today (extend it; keep it one bullet):

```markdown
- **Estimation data** (Unreleased) — `tokens trd|stamp|backfill` reads per-TRD executor token usage from transcripts
  (the backfill form is a dry run unless `--write`); `calibrate [--paths] [--out] [--rates] [--dry-run]` writes
  per-task-class p50/P90 minutes, tokens and dollars to `~/.claude/devflow/calibration.json` (override
  `DEVFLOW_CALIBRATION_PATH`), byte-identical on unchanged inputs. Rates live in `references/model-rates.json`.
  Implemented in `lib/token-usage.cjs`, ... Detail: `docs/USER-GUIDE.md` → Estimation data.
```

Add: `calibrate` also measures agent overhead (`--root`, `--no-overhead`; version 2 adds `agent_overhead` and
`objective_level`); `estimate task|trd|objective|milestone` (median/P90 minutes, tokens, dollars, sample count,
confidence; correlated-sum composition, wave max, gap-closure mixture); `estimate start|wave|finish` keep the run state
in `~/.claude/devflow/state/estimates/` (override `DEVFLOW_ESTIMATE_STATE_DIR`) that the status line reads; modules
`agent-overhead.cjs`, `estimate-math.cjs`, `estimate.cjs`, `estimate-rollup.cjs`, `estimate-milestone.cjs`,
`estimate-format.cjs`, `estimate-cli.cjs`, `estimate-run-store.cjs`.

CLAUDE.md Hooks, Observability: `statusline.js` — StatusLine (declared in plugin.json `statusLine`); renders model,
task, context usage. Append: "and, while an objective builds, estimated time remaining from the estimate run state".

gen-docs HOOK_DOCS entry (scripts/gen-docs-data.cjs line ~152):
`'statusline.js': ['Observability', 'Renders model, current task, directory, and context usage in the Claude Code status line.', null],`
— extend the sentence the same way. Do not regenerate site/data/devflow.json (the release does that).

USER-GUIDE: the existing `### Estimation data (`df-tools tokens`, `df-tools calibrate`)` section stays; update its
calibration keys bullet for version 2, then add `### Estimates (`df-tools estimate`)` right after it, and a Table of
Contents entry if the ToC lists that level.
</codebase_examples>

<anti_patterns>
- Presenting the in-sample backtest as validation. Label it in-sample and point at Objective 64.
- Inventing numbers in the docs. Every figure in CHANGELOG and USER-GUIDE comes from this TRD's live output.
- Shell composition in Bash calls (`$(...)`, pipes, `&&`). For the status line render, write a small scratch script with
  the Write tool that spawns `plugins/devflow/hooks/statusline.js` with the JSON input and env, then run `node <script>`.
- Touching the real `~/.claude/devflow/state/`.
</anti_patterns>

<error_recovery>
- If `calibrate` reports `overhead none`, the transcripts root was not scanned or nothing matched this repo: rerun with
  `--root ~/.claude/projects` explicitly and check `overhead.foreign` / `unreadable` in the JSON; record the result.
- If `estimate` says `No estimate: ... classifier`, the calibration was written by an older calibrate; rerun the repo
  copy of `calibrate`.
- If full `npm test` shows a failure outside the known baseline set, find which TRD's file it touches and report it as a
  gap (do not patch code here).
</error_recovery>

</embedded_context>

<context>
@CLAUDE.md
@docs/USER-GUIDE.md
@.planning/objectives/58-estimation-engine-and-surfacing/58-08-SUMMARY.md
@.planning/objectives/58-estimation-engine-and-surfacing/58-09-SUMMARY.md
</context>

<gotchas>
- `estimate objective 58` during this TRD sees 58-10 itself as the only remaining TRD; use `--all` for the full picture.
- The scratch dirs live under the session scratchpad (or `mktemp -d`), never inside the repo.
- Backtest actuals: agent minutes = sum of `parseDurationMinutes(duration)` over the objective's SUMMARYs; dollars =
  `calibrator.sampleCost` over each SUMMARY's token fields with model-rates.json. A small scratch node script that
  requires the repo's `calibration-inputs.cjs` and `calibrator.cjs` is fine; do not commit it.
- Known `npm test` baseline failures: handoff-e2e MA-7, stack-drafter-fleet github-enterprise-migration, roadmap-reconcile
  E2E1 while a TRD of the running objective is unticked. If micro.test.cjs hangs on signing, use the documented glob.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Calibrate v2 and estimate this repository live, with an in-sample backtest</name>
  <files>~/.claude/devflow/calibration.json (generated; outside the repo, not committed)</files>
  <action>
1. `node plugins/devflow/devflow/bin/df-tools.cjs calibrate --raw`, then `shasum -a 256 ~/.claude/devflow/calibration.json`;
   repeat both. Record the two raw lines (overhead counts per agent) and the digests.
2. Record verbatim: `estimate task ... --raw` (test 2), `estimate trd 58-05 --raw`, `estimate objective 57 --all --table
   --raw`, `estimate objective 59 --table --raw`, `estimate milestone --table --raw`, and `estimate objective 58 --all
   --line --raw`.
3. Backtest 55, 56, 57 (gotchas): a table of estimate agent-minutes p50/P90 and cost p50/P90 against actual, with
   "actual <= P90" and "median / actual" columns. Label it in-sample.
  </action>
  <verify>Test list items 1-3 hold; the SUMMARY has every command with its output.</verify>
  <done>calibration.json is version 2, deterministic, with measured overhead; live estimates and the backtest are recorded.</done>
  <recovery>If a live command fails, capture the command and full output in the SUMMARY under Deviations and continue with the remaining commands; do not modify code.</recovery>
</task>

<task type="auto">
  <name>Task 2: Run-state and status line smoke</name>
  <files>scratch state dir and scratch HOME (outside the repo, not committed)</files>
  <action>
1. Make a scratch HOME with `.claude/devflow/bin/lib/` holding copies of the repo's `estimate-run-store.cjs` and
   `upgrade.cjs`, and a scratch state dir.
2. With `DEVFLOW_ESTIMATE_STATE_DIR=<scratch state>` (inline env prefix on each command): `estimate start 58 --raw`,
   `estimate wave 58 7 --start --raw`.
3. Render the status line through a scratch spawn script (anti_patterns) with `HOME=<scratch home>`, the same state
   dir, and `workspace.current_dir` = this repo; record the stripped output.
4. `estimate wave 58 7 --done --raw`, `estimate finish 58 --raw`, `estimate finish 58 --raw` again; render the status
   line once more (no segment).
  </action>
  <verify>Test list item 4: the first render contains `⏱ 58`; the second has no `⏱`; both finish lines are identical.</verify>
  <done>The status line segment and the actual-vs-estimate lines are shown working live, with no write under the real ~/.claude/devflow/state.</done>
  <recovery>If the render shows no segment, print the state file and `remainingMinutes` from a scratch script; the usual cause is a project root mismatch (the state was written from a different cwd than the status line's `current_dir`).</recovery>
</task>

<task type="auto">
  <name>Task 3: CHANGELOG, CLAUDE.md, USER-GUIDE, hook doc; full test run</name>
  <files>CHANGELOG.md, CLAUDE.md, docs/USER-GUIDE.md, scripts/gen-docs-data.cjs</files>
  <action>
1. CHANGELOG `[Unreleased]` → Added: `df-tools estimate task|trd|objective|milestone` (with this repo's live numbers),
   `estimate start|wave|finish` and the status line segment, the estimate table in PLANNING COMPLETE and plan-objective,
   the one-line estimate in /devflow:build and actual-vs-estimate in wave reports. Changed: `calibrate` measures agent
   overhead from subagent transcripts (`--root`, `--no-overhead`), calibration.json version 2 (`agent_overhead`,
   `agent_overhead_sources`, `objective_level`).
2. CLAUDE.md: extend the Estimation data bullet and the statusline hook line per codebase_examples. Keep CLAUDE.md
   growth small (it is resident every turn).
3. docs/USER-GUIDE.md: update the calibration keys bullet; add `### Estimates (`df-tools estimate`)` with the seven
   command forms, the composition method (tasks in a TRD add quantile by quantile; TRDs, waves, overhead and objectives
   combine as a correlated sum with rho 0.5; a parallel wave takes the max; gap closure is a mixture with the calibrated
   probability), confidence labels (high >= 30, medium 10-29, low 1-9, none; fewer than 5 samples falls back to all
   tasks and is capped at low; overall = weakest component carrying at least 10% of the median), where estimates
   appear, the run state location and env overrides, and that rho 0.5 is an assumption Objective 64 tests.
4. scripts/gen-docs-data.cjs: extend the statusline HOOK_DOCS sentence.
5. Run test 5's checks, then the full suite.
Commit `docs(58-10): document df-tools estimate and calibration v2`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs` passes; `node plugins/devflow/devflow/bin/df-tools.cjs validate docs --raw` has no new finding; `npm test` shows only the known baseline failures.</verify>
  <done>Docs describe what shipped with live figures; the full suite holds.</done>
  <recovery>If dispatch-completeness flags a name taken from the new CLAUDE.md text, the prose named a df-tools word that is not a command (for example `df-tools estimate-run-store`); reword to the real command or module path.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- Success criteria 1 and 2 shown live on this repository (estimate task, trd, objective, milestone).
- Success criterion 4 shown live (run state, status line segment, wave and finish lines). Success criterion 3 is pinned
  by 58-09's repo test; quote the planner and plan-objective lines in the SUMMARY.
- calibration.json v2 is deterministic on real data.
</verification>

<success_criteria>
- Live evidence for EST-02..EST-05 recorded in the SUMMARY; the in-sample backtest table is there for Objective 64.
- CHANGELOG, CLAUDE.md, USER-GUIDE and HOOK_DOCS updated; full `npm test` shows no failures beyond the known baseline.
</success_criteria>

<output>
After completion, publish `58-10-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Include every live command with its output, the calibration digests, the overhead sample counts,
and the backtest table.
</output>
