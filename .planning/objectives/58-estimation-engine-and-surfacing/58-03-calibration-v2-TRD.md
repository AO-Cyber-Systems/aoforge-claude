---
objective: 58-estimation-engine-and-surfacing
trd: "03"
type: standard
wave: 2
depends_on: ["58-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/calibrator.cjs
  - plugins/devflow/devflow/bin/lib/calibrator.test.cjs
  - plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
  - plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
autonomous: true
requirements: [EST-03]
must_haves:
  truths:
    - "calibration.json is version 2 and carries agent_overhead: one block per OVERHEAD_AGENTS entry with samples and n/p50/p90/min/max for minutes, tokens_input, tokens_output and cost_usd, plus agent_overhead_sources counts"
    - "Overhead cost is priced per model through sampleCost and model-rates.json; an unpriced model leaves the spawn's cost null and is listed in unpriced_models"
    - "calibration.json carries objective_level: per-objective trds/tasks counts and serial executor minutes, tokens and dollars, an objective counting for a metric only when every TRD in it has that metric"
    - "buildCalibration reads no transcripts unless given transcriptsRoot; `df-tools calibrate` defaults the root to ~/.claude/projects resolved at call time, takes --root <dir>, and --no-overhead skips the scan"
    - "Two calibrate runs over unchanged SUMMARYs and transcripts are byte-identical, and inputs_digest changes when an overhead transcript changes"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/calibrator.cjs
      provides: "CALIBRATION_VERSION 2, buildCalibration({paths, ratesPath, transcriptsRoot}) with agent_overhead and objective_level"
    - path: plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
      provides: "calibrate --root <dir> | --no-overhead, overhead counts in the JSON result and the --raw line"
  key_links:
    - "calibrator.buildCalibration -> agent-overhead.collectOverhead (58-02) -> calibrator.sampleCost per model"
    - "calibrate-cli.runCalibrate -> token-usage.defaultTranscriptRoot() when --root is absent"
    - "58-06 estimate-rollup reads agent_overhead (planner, job-checker, verifier) and objective_level (unplanned fallback)"
---

# TRD 58-03: Calibration v2: agent overhead and objective-level history (EST-03 input)

<objective>
Extend calibration.json with the two things the objective and milestone estimates need and version 1 lacks:

- **`agent_overhead`** (from 58-02's `collectOverhead`): per non-executor agent, the cost of one spawn. Objective
  estimates add the verifier (and planner, plan checker when the objective is not yet planned); gap-closure adds a
  planner and a verifier; milestone estimates add the integration checker.
- **`objective_level`**: what whole objectives cost, summed from their TRD samples. An objective that is not planned yet
  has no tasks to classify, so `/devflow:build` at start and `estimate milestone` fall back to this history.

`CALIBRATION_VERSION` becomes 2. The estimator (58-05 onward) still reads a version 1 file and reports overhead and the
unplanned fallback as missing.

Purpose: measured inputs for EST-03's "adds agent overhead" and for unplanned objectives.
Output: calibrator.cjs and calibrate-cli.cjs (+ tests), the calibrate help entry and header doc line.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: `test(58-03): ...` RED, then `feat(58-03): ...`. Changing an existing assertion (version 1 -> 2,
  the raw line) is part of the RED commit, never silently edited during GREEN.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash
  call.
- **Never write or read the real `~/.claude`.** Library tests pass `transcriptsRoot` explicitly (from `makeProjectsRoot`).
  CLI tests spawn with `HOME` set to a fresh temp dir and `DEVFLOW_CALIBRATION_PATH` stripped, as 57-06's tests do.
- Fixtures: BETA spec already in calibrator.test.cjs; overhead spawns from `transcript-fixtures.cjs`
  (`writeOverheadTranscript`, `PLANNER_SPAWN`, `VERIFIER_SPAWN`, added by 58-02). Literal data only.
- Same wave: 58-05 owns estimate.cjs and its fixtures. Do not touch them.

## Test list

Outermost first. `beta` = the existing BETA project. `troot` = `makeProjectsRoot()` holding PLANNER_SPAWN (session s1,
agent p1) and VERIFIER_SPAWN (s1/v1), both with `cwd: beta`, plus a verifier spawn with `cwd` = an unrelated temp dir
(foreign).

CLI (`calibrate-cli.test.cjs`, spawned, fake HOME):

1. No `--root`, fake HOME without `.claude/projects`: exit 0; JSON `overhead` is `{scanned: true, spawns: 0, matched: 0,
   foreign: 0, quick: 0, unreadable: 0, agents: {}}`; `--raw` ends with ` · overhead none`.
2. `--root <troot>`: `overhead.agents` is `{planner: 1, verifier: 1}`, `overhead.foreign` 1; the written file has
   `agent_overhead.planner.samples` 1; `--raw` ends with ` · overhead planner 1, verifier 1` (samples descending, then
   name).
3. Fake HOME with the PLANNER_SPAWN transcript under `<HOME>/.claude/projects/<key>/s1/subagents/` and no `--root`:
   `overhead.agents.planner` is 1 (the default root is resolved from HOME at call time).
4. `--no-overhead`: `overhead.scanned` false and the file's `agent_overhead_sources.scanned` is false.
5. `--root <troot>` twice: byte-identical files, the second reports `changed: false`.
6. `--root` with no value, and `--root x --no-overhead` together, exit 1 with the usage line.

Library (`calibrator.test.cjs`):

7. `buildCalibration({paths: [beta], ratesPath})` (no transcriptsRoot): `version` 2; `agent_overhead` has exactly the six
   `OVERHEAD_AGENTS` keys, each `{samples: 0, minutes: {n: 0, p50: null, ...}, tokens_input, tokens_output, cost_usd}`;
   `agent_overhead_sources` is `{scanned: false, spawns: 0, matched: 0, foreign: 0, quick: 0, unreadable: 0}`; `notes`
   has 5 strings. Every existing BETA number (code_tdd minutes, trd_level, probabilities, costs) is unchanged.
8. With `transcriptsRoot: troot`: `agent_overhead.planner` is samples 1, minutes p50 6, tokens_input p50 111015,
   tokens_output p50 6000, cost_usd p50 0.1471; `agent_overhead.verifier` samples 1, minutes p50 4, tokens_input p50
   20503, cost_usd p50 0.0203; `agent_overhead_sources` `{scanned: true, spawns: 3, matched: 2, foreign: 1, quick: 0,
   unreadable: 0}`. A spawn whose model is `claude-unknown-9` keeps minutes but has no cost, and `unpriced_models`
   includes `claude-unknown-9`.
9. Determinism: two builds with `troot` give identical `stableStringify` text; adding a message to the planner transcript
   changes `inputs_digest`; `CALIBRATION_VERSION` is 2.
10. `objective_level` over BETA: `samples` 2 (objectives with a sample TRD); `trds` `{n: 2, p50: 2, p90: 3, min: 2, max:
    3}`; `tasks` `{n: 2, p50: 2, p90: 6, min: 2, max: 6}`; `minutes` `{n: 1, p50: 30, p90: 30, min: 30, max: 30}` (70-a
    sums 10 + 8 + 12; 71-b is left out because 71-b/01 is autonomous:false and has no minutes); `tokens_input`,
    `tokens_output` and `cost_usd` have n 0 (only 70-a/03 has tokens, so no objective has them on every TRD).

<embedded_context>

<codebase_examples>
Where the new blocks go (calibrator.cjs, `buildCalibration` return, today):

```js
return {
  version: CALIBRATION_VERSION,
  classifier_version: ci.CLASSIFIER_VERSION,
  data_as_of: latestCompleted(projectList),
  inputs_digest: inputsDigest(projectList, rates, sources),
  notes: [...NOTES],
  samples: { trds: samples.length, tasks: tasks.length, with_tokens: ... },
  sources,
  trd_level: { samples, minutes: statBlock(..., roundMinutes), tasks, tokens_input, tokens_output, cost_usd },
  task_classes: taskClasses,
  probabilities: { gap_closure: probability(...), checkpoint: probability(...) },
  models: rates.models, model_aliases: rates.aliases, rates_as_of: rates.as_of,
  unpriced_models: sortedUnique([...unpricedModels]),
};
```

Pricing one model's share (existing `sampleCost`, unchanged):

```js
sampleCost({ tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, token_model: model }, rates)  // USD or null
```

58-02's sample: `{agent, project, session, agent_id, minutes, tokens_input, tokens_output, tokens_cache_read,
tokens_cache_write, by_model: {<model>: {tokens_input, tokens_output, tokens_cache_read, tokens_cache_write}}}` (tokens
null when the spawn has no usage). `collectOverhead({root, projects})` -> `{samples, counts: {spawns, matched, foreign,
quick, unreadable, by_agent}}`.

CLI shape (calibrate-cli.cjs): `parseArgs` handles `VALUE_FLAGS = ['paths', 'out', 'rates']` and `BOOL_FLAGS =
['dry-run']`; `runCalibrate` returns `{ok, result, text, exit}`; the one-line text is
`calibration ${out}: ${slot} · ${s.trds} TRDs, ${s.tasks} tasks, ${s.with_tokens} with tokens · classes ${classList(classes)}`.
</codebase_examples>

<anti_patterns>
- Reading `~/.claude/projects` inside `buildCalibration` by default. Only the CLI resolves the default root, at call time.
- Adding executor spawns to `agent_overhead`. Task values already include executor overhead pro rata (calibration note 1).
- A partial objective sum: an objective whose TRDs are not all measured for a metric must not count for that metric.
  Undercounted sums would bias the unplanned fallback low.
- Paths or mtimes in `inputs_digest`. Hash the normalized overhead samples (agent, project, session, agent_id, minutes,
  by_model), sorted, or `null` when no root was scanned.
</anti_patterns>

<error_recovery>
- If test 7 shows a changed BETA number, the overhead or objective-level code touched the TRD sample path. Those blocks
  are computed after, and separately from, `task_classes` and `trd_level`.
- If test 3 finds no planner, check the fake HOME layout: `<HOME>/.claude/projects/<projectKeyFor(cwd)>/s1/subagents/
  agent-p1.{jsonl,meta.json}`, and that the spawned child gets `HOME` in its env.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/calibrator.cjs
@plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
@.planning/objectives/57-estimation-data-foundation/57-05-SUMMARY.md
</context>

<gotchas>
- The two new NOTES strings, verbatim: "agent_overhead is one spawn of a non-executor DevFlow agent, measured from
  subagent transcripts (minutes from first to last record); quick-plan planner spawns are excluded." and "objective_level
  sums executor outcomes per objective and counts an objective for a metric only when every TRD in it has that metric;
  its minutes are serial executor time, not wall time."
- `projects` for `collectOverhead`: pair each `discoverProjects` root with its `collectProject(root).label`, in the same
  order the calibrator already walks them.
- calibrate's help entry must keep `usage` starting with `df-tools calibrate` (help.test.cjs) and mention `--root` and
  `--no-overhead` in usage and details. The df-tools.cjs header block under "Estimation data:" gets the same two flags.
- Known `npm test` baseline failures: handoff-e2e MA-7, stack-drafter-fleet github-enterprise-migration, roadmap-reconcile
  E2E1 while a TRD of the running objective is unticked.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: agent_overhead block, version 2, notes and digest</name>
  <files>plugins/devflow/devflow/bin/lib/calibrator.cjs, plugins/devflow/devflow/bin/lib/calibrator.test.cjs</files>
  <action>
RED: tests 7, 8 and 9 (and update the existing `exports CALIBRATION_VERSION 1` test to expect 2). Commit
`test(58-03): calibration v2 measures agent overhead per spawn`.

GREEN in calibrator.cjs:
1. `CALIBRATION_VERSION = 2`; append the two NOTES strings (gotchas).
2. `buildCalibration({paths, ratesPath = ci.RATES_PATH, transcriptsRoot = null})`. When `transcriptsRoot` is a string,
   call `collectOverhead({root: transcriptsRoot, projects})`; otherwise use no samples and zero counts.
3. Per overhead sample: cost = sum over `by_model` of `sampleCost({...share, token_model: model}, rates)`; null if any
   share is unpriced (add that normalized model to `unpricedModels`) or tokens are null.
4. `agent_overhead`: for every name in `OVERHEAD_AGENTS`, `{samples, minutes: statBlock(..., roundMinutes), tokens_input,
   tokens_output (roundTokens), cost_usd (roundCost)}`. `agent_overhead_sources`: `{scanned, spawns, matched, foreign,
   quick, unreadable}`.
5. `inputsDigest` gains an `overhead` member: the sorted normalized samples, or null when not scanned.
Commit `feat(58-03): agent_overhead in calibration.json (version 2)`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs` passes, including every pre-existing test.</verify>
  <done>Tests 7-9 pass after a recorded RED; the BETA numbers are unchanged; CALIBRATION_VERSION is 2.</done>
  <recovery>If requiring agent-overhead.cjs creates a cycle error, agent-overhead.cjs must not require calibrator.cjs (58-02's rule); remove any such require there and record the deviation.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: objective_level history</name>
  <files>plugins/devflow/devflow/bin/lib/calibrator.cjs, plugins/devflow/devflow/bin/lib/calibrator.test.cjs</files>
  <action>
RED: test 10. Commit `test(58-03): objective-level history for unplanned estimates`.

GREEN: group the project's TRDs by `(project, objective_dir)`. Keep objectives with at least one sample TRD. Per kept
objective: `trds` = its TRD count (all TRDs in `project.trds` for that dir), `tasks` = its auto-task count, and for each
of minutes, tokens_input, tokens_output, cost_usd the sum over its TRD samples only when every TRD of the objective has
that value (a TRD with no sample, or a null value, removes the objective from that metric). `objective_level` =
`{samples, trds, tasks, minutes, tokens_input, tokens_output, cost_usd}` with the existing rounding.
Commit `feat(58-03): objective_level block`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs` passes all tests.</verify>
  <done>Test 10 passes after a recorded RED with the exact numbers in the Test list.</done>
  <recovery>If `tasks` comes out 8 for 70-a, checkpoint tasks were counted; use the same auto-task filter as `trdSample` (type not starting with `checkpoint`).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: calibrate --root / --no-overhead, help and header</name>
  <files>plugins/devflow/devflow/bin/lib/calibrate-cli.cjs, plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
RED: CLI tests 1-6, and update the existing raw-line test for the new ` · overhead ...` suffix. Commit
`test(58-03): calibrate scans agent overhead from transcripts`.

GREEN:
1. parseArgs: `root` joins VALUE_FLAGS; `no-overhead` is a boolean flag (generalise BOOL_FLAGS so `dry-run` and
   `no-overhead` set separate booleans); both together is a usage error.
2. runCalibrate: `transcriptsRoot` = null with `--no-overhead`, else `path.resolve(base, flags.root)` or
   `require('./token-usage.cjs').defaultTranscriptRoot()` (called here, never at load). Pass it to buildCalibration.
3. `result.overhead` = `{scanned, spawns, matched, foreign, quick, unreadable, agents}` where `agents` maps each agent
   with samples > 0 to its samples. Text gains ` · overhead <list|none>` (samples descending, then name).
4. help.cjs `calibrate`: usage `df-tools calibrate [--paths <dir[,dir]>] [--out <file>] [--rates <file>] [--root <dir> |
   --no-overhead] [--dry-run] [--raw]`; details add the transcripts root default and that overhead is per spawn.
   df-tools.cjs header: add the two flags to the calibrate lines under "Estimation data:".
Commit `feat(58-03): calibrate reads agent overhead (--root, --no-overhead)`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs` passes.</verify>
  <done>CLI tests 1-6 pass after a recorded RED; help and dispatch tests stay green; the real ~/.claude was never touched (all spawns use a fake HOME).</done>
  <recovery>If dispatch-completeness fails, the help usage no longer starts with `df-tools calibrate`, or a COMMANDS key changed; restore the key and prefix.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- calibration.json version 2 carries `agent_overhead`, `agent_overhead_sources` and `objective_level`, documented in the
  SUMMARY with the same key table 57-05 used.
- `rg -n "Date\(|toISOString|Date\.now" plugins/devflow/devflow/bin/lib/calibrator.cjs` prints nothing (determinism kept).
</verification>

<success_criteria>
- calibrator and calibrate-cli suites pass, old and new tests alike.
- Full `npm test` shows no failures beyond the known baseline ones.
</success_criteria>

<output>
After completion, publish `58-03-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the version 2 additions (keys and meaning); 58-05..58-07 read them.
</output>
