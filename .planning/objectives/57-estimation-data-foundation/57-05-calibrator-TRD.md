---
objective: 57-estimation-data-foundation
trd: "05"
type: standard
wave: 2
depends_on: ["57-02"]
files_modified:
  - plugins/devflow/devflow/bin/lib/calibrator.cjs
  - plugins/devflow/devflow/bin/lib/calibrator.test.cjs
autonomous: true
requirements: [EST-01]
must_haves:
  truths:
    - "buildCalibration produces per-task-class median (p50) and P90 for minutes, tokens_input, tokens_output and cost_usd, each stat with its own sample count n, plus a samples count per class"
    - "For the hand-built BETA fixture, code_tdd minutes are n 5, p50 4, p90 8, min 4, max 8, and the TRD with the 140747/1370 token record costs $0.1496 at Opus 5.5 rates"
    - "Dollar cost comes only from model-rates.json via rateFor; a sample whose model has no rate is left unpriced and its model listed in unpriced_models"
    - "calibration.json has no wall-clock timestamp: data_as_of is the latest SUMMARY completed date and inputs_digest is a hash of the inputs"
    - "stableStringify sorts object keys at every depth, so two builds over unchanged inputs produce byte-identical text, even after every input file's mtime changes"
    - "writeCalibration writes only when the bytes differ, reports changed:false on an unchanged rerun, and never resolves the home directory when given an explicit path"
    - "Minutes from autonomous:false TRDs (human wait) are excluded from minutes stats but their tokens still count; checkpoint and gap-closure probabilities are reported with their n"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/calibrator.cjs
      provides: "nearestRank, statBlock, sampleCost, buildCalibration, stableStringify, writeCalibration, defaultCalibrationPath, CALIBRATION_VERSION"
  key_links:
    - "calibrator.buildCalibration -> calibration-inputs.discoverProjects/collectProject/loadRates/rateFor/classifyTask (57-02)"
    - "calibrator.writeCalibration -> ~/.claude/devflow/calibration.json by default (DEVFLOW_CALIBRATION_PATH / explicit path override)"
    - "57-06 calibrate-cli -> buildCalibration + writeCalibration; Objective 58 estimate reads calibration.json"
---

# TRD 57-05: Calibrator: per-class medians, P90s and dollars, written deterministically (EST-01)

<objective>
Turn the history from 57-02 into `calibration.json`:

- **Samples.** A TRD with a parsed duration or token data is one TRD-level sample. Its outcome is split equally across
  its auto (non-checkpoint) tasks, and each task is one task-level sample in its `classifyTask` class.
- **Stats.** For each class (plus `all`) and for the TRD level: `{n, p50, p90, min, max}` for minutes, tokens_input,
  tokens_output and cost_usd. Nearest-rank percentiles, so every value is an observed sample.
- **Dollars.** Priced from model-rates.json: fresh input, cache writes (5-minute rate), cache reads and output. A model
  without a rate stays unpriced and is listed.
- **Probabilities.** Gap closure (objectives with a `gap_closure: true` TRD) and checkpoint (TRDs with
  `autonomous: false`), each with n. Objective 58 uses them for the gap-closure factor.
- **Determinism (success criterion 4).** No `generated_at`. `data_as_of` is the latest SUMMARY `completed` date and
  `inputs_digest` hashes the normalized inputs. Keys are sorted, numbers are rounded, and the file is written only when
  its bytes change.

Purpose: EST-01, calibration.json from SUMMARY frontmatter, STATE_ARCHIVE metrics and model rates, with a sample count
per class.
Output: calibrator.cjs (+ test). The CLI lands in 57-06.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(57-05): ...` RED commit before `feat(57-05): ...`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash call.
- Fixtures: `makeCalibrationProject` from `__fixtures__/calibration-fixtures.cjs` (57-02) with the literal BETA spec
  below. No generated data, no property-based tests. **Never write the real `~/.claude/devflow/calibration.json`**: every
  write test passes an explicit temp path, and the default-path test sets `process.env.HOME` (or
  `DEVFLOW_CALIBRATION_PATH`) to a temp dir and restores it in `finally`.
- Same wave: 57-03 owns tokens-cli/df-tools/help/prose and 57-04 owns token-backfill. Touch only your two files. Use
  calibration-inputs.cjs (57-02) as it is; record a deviation if an export is wrong.

## Test list

Outermost first. calibrator.test.cjs. **BETA spec** (one project `beta`, all literal):

| TRD | auto tasks (class) | other | SUMMARY | metric row |
|---|---|---|---|---|
| 70-a/01 | `a.cjs,a.test.cjs` tdd (code_tdd); `README.md` (doc) | | `duration: 10min`, completed 2026-09-01 | |
| 70-a/02 | `b.cjs` tdd (code_tdd) | | `duration: 8min`, completed 2026-09-02 | |
| 70-a/03 | three code_tdd tasks | | `duration: 12min`, completed 2026-10-05, tokens_input 140747, tokens_output 1370, tokens_cache_read 121144, tokens_cache_write 19596, `token_model: "claude-opus-5-5"` | |
| 71-b/01 | one code_tdd task + `checkpoint:human-verify` | `autonomous: false`, `gap_closure: true` | `duration: 30min`, completed 2026-09-20 | |
| 71-b/02 | `skills/x/SKILL.md` (prompt) | | none | `\| Objective 71 P02 \| 6min \| 1 tasks \| 1 files \|` |

1. `buildCalibration({paths:[beta], ratesPath: RATES_PATH})` (no CLI) gives:
   - `samples` = `{trds:5, tasks:7, with_tokens:1}`. The 71-b/01 task carries no value (its minutes are excluded and it
     has no tokens), so it is not a task sample.
   - `task_classes.code_tdd.samples` 5; minutes `{n:5, p50:4, p90:8, min:4, max:8}` (from [5, 8, 4, 4, 4]).
   - `task_classes.doc.minutes` `{n:1, p50:5, ...}`; `task_classes.prompt.minutes` `{n:1, p50:6, ...}`.
   - `task_classes.all.minutes` `{n:7, p50:5, p90:8, min:4, max:8}`.
   - `trd_level.minutes` `{n:4, p50:8, p90:12, min:6, max:12}` (71-b/01 excluded: autonomous false).
   - `trd_level.cost_usd` `{n:1, p50:0.1496, ...}`; `task_classes.code_tdd.cost_usd` `{n:3, p50:0.0499, ...}`;
     `task_classes.code_tdd.tokens_input.p50` 46916 and `tokens_output.p50` 457.
   - `probabilities.gap_closure` `{value:0.5, n:2}`, `probabilities.checkpoint` `{value:0.2, n:5}`.
   - `data_as_of` `'2026-10-05'`, `version` 1, `classifier_version` 1, and no `generated_at` key anywhere. RED.
2. `nearestRank`: [1..10] gives p50 5 and p90 9; [7] gives 7 for both; [] gives null. `statBlock([])` gives
   `{n:0, p50:null, p90:null, min:null, max:null}`.
3. `sampleCost({tokens_input:140747, tokens_output:1370, tokens_cache_read:121144, tokens_cache_write:19596,
   token_model:'claude-opus-5-5'}, rates)` is 0.1496368 before rounding (fresh input 7). With
   `token_model:'claude-opus-5[1m]'` it prices at claude-opus-5 rates. With `'claude-unknown-9'` it gives null, and
   `unpriced_models` lists `['claude-unknown-9']`.
4. Determinism: `stableStringify(buildCalibration(x))` is identical across two builds. After `fs.utimesSync` on every
   fixture file it is still identical. Nested keys come out sorted (`JSON.parse` + key order check at 3 depths).
   `sources` is sorted by project.
5. `writeCalibration(tmp/'a/b/c.json', obj)` creates the parents and returns `{changed:true}`. A second call returns
   `{changed:false}` and the file's mtimeMs is unchanged. A changed obj gives `{changed:true}`.
6. `defaultCalibrationPath()` honours `DEVFLOW_CALIBRATION_PATH`, otherwise `<HOME>/.claude/devflow/calibration.json`
   with HOME read at call time.
7. `inputs_digest` (`sha256:<64 hex>`) is unchanged across rebuilds and changes when 70-a/02's duration becomes `9min`.
8. An empty project (no TRDs) builds without throwing: `samples` all zero, `task_classes` `{}` apart from `all` with
   samples 0, `data_as_of` null.
9. Two projects (BETA plus ALPHA_SPEC from calibration-fixtures) give two `sources` entries with per-project counts, and
   the class stats include both.

<embedded_context>

<codebase_examples>
calibration-inputs.cjs (57-02) surface:

```js
const ci = require('./calibration-inputs.cjs');
ci.discoverProjects(paths)          // sorted realpath'd project roots
ci.collectProject(root)             // {label, trds:[{id, objective_dir, trd, trd_type, autonomous, gap_closure, tasks:[{name,type,tdd,files}],
                                    //   summary:{minutes, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, token_model, completed}|null,
                                    //   metric:{minutes, tasks, files}|null, minutes, duration_source}], counts, metrics}
ci.loadRates(ratesPath)             // {ok, models, aliases, as_of} | {ok:false, error}
ci.rateFor(rates, modelId)          // {id, input, output, cache_read, cache_write_5m, cache_write_1h} | null
ci.classifyTask({files, tdd, type, trdType}), ci.TASK_CLASSES, ci.CLASSIFIER_VERSION, ci.RATES_PATH
```

Percentile, nearest rank (stated so 58 and 64 can reproduce it): `sorted[Math.ceil(p * n) - 1]` for n > 0. Note that
context-audit.percentile uses `floor(n*p)`. Do not reuse it, because its p50 is the upper middle.

Cost per sample (USD; rates per million tokens):

```js
const fresh = Math.max(0, tokens_input - tokens_cache_read - tokens_cache_write);
cost = (fresh * r.input + tokens_cache_write * r.cache_write_5m + tokens_cache_read * r.cache_read
        + tokens_output * r.output) / 1e6;
// 140747/1370/121144/19596 @ opus-5-5 (4, 5, 0.2, 20): (28 + 97980 + 24228.8 + 27400) / 1e6 = 0.1496368
```

Rounding at output (never before splitting): minutes 1 decimal, tokens integer (`Math.round`), cost_usd 4 decimals,
probabilities 4 decimals.

Target calibration.json shape (keys sorted on write; Objective 58 reads it):

```json
{
  "version": 1,
  "classifier_version": 1,
  "data_as_of": "2026-10-05",
  "inputs_digest": "sha256:<hex>",
  "notes": [
    "Task values split each TRD's outcome equally across its auto tasks and include the executor's per-TRD overhead pro rata; do not add executor overhead on top.",
    "Minutes exclude autonomous:false TRDs (human wait); their tokens still count.",
    "cost_usd prices cache writes at the 5-minute rate; percentiles are nearest-rank."
  ],
  "samples": { "trds": 5, "tasks": 7, "with_tokens": 1 },
  "sources": [ { "project": "beta", "trds": 5, "summaries": 4, "with_minutes": 5, "with_tokens": 1,
                 "no_outcome": 0, "metric_rows": 1, "metric_rows_joined": 1, "metric_rows_ambiguous": 0 } ],
  "trd_level": { "samples": 5, "minutes": {"n":4,"p50":8,"p90":12,"min":6,"max":12}, "tasks": {...},
                 "tokens_input": {...}, "tokens_output": {...}, "cost_usd": {...} },
  "task_classes": { "all": {...}, "code_tdd": { "samples": 5, "minutes": {...}, "tokens_input": {...},
                    "tokens_output": {...}, "cost_usd": {...}, "files": {...} }, "doc": {...}, "prompt": {...} },
  "probabilities": { "gap_closure": {"value": 0.5, "n": 2}, "checkpoint": {"value": 0.2, "n": 5} },
  "models": { "claude-opus-5-5": { "input": 4, "output": 20, "cache_read": 0.2, "cache_write_5m": 5,
              "cache_write_1h": 8, "source": "https://platform.claude.com/docs/en/about-claude/pricing", "as_of": "2026-10-05" } },
  "model_aliases": { "claude-haiku-4-5": "claude-haiku-4-5-20251001" },
  "rates_as_of": "2026-10-05",
  "unpriced_models": []
}
```

`inputs_digest` = `'sha256:' + sha256(stableStringify({classifier_version, rates:{models, aliases}, trds}))`, where `trds`
is the normalized TRD sample list sorted by `(project, objective_dir, id)`. It contains only values read from inputs:
no paths, no mtimes.

Existing canonical-JSON precedent: gh-mapping.cjs `canonicalJson` (key-order-independent, one line). calibration.json is
read by people too, so `stableStringify` emits 2-space indented JSON with a trailing newline: build a key-sorted deep copy,
then `JSON.stringify(copy, null, 2) + '\n'`.

Atomic write precedent (global-config.cjs writeConfig): write `<file>.tmp`, then `renameSync`.
</codebase_examples>

<anti_patterns>
- `generated_at: new Date().toISOString()` or any other wall-clock value. It breaks success criterion 4.
- Iterating `Object.keys` of a map built in file-system order and emitting it unsorted.
- Rounding per-task values before computing the percentile (rounding happens once, at output).
- Pricing from anything but model-rates.json. Never hard-code a rate in calibrator.cjs or its tests; tests read the
  shipped file through `loadRates` (the expected $0.1496 is derived from the planner-verified Opus 5.5 rates; if 57-02
  recorded different page values, recompute the expectation from them and note it).
- `os.homedir()` at module load.
</anti_patterns>

<error_recovery>
- If test 1's numbers differ, print the per-TRD samples (minutes, per-task split, class) and compare with the BETA table.
  The most likely causes are a checkpoint task counted as auto or a missing metric fallback for 71-b/02.
- `loadRates` failure (`ok:false`): `buildCalibration` throws an Error naming the rates file and the reason. The CLI turns
  it into exit 1.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/calibration-inputs.cjs
@.planning/objectives/57-estimation-data-foundation/57-02-SUMMARY.md
</context>

<gotchas>
- Two TRD records from different projects can share an `id`. The sample identity is `(project, objective_dir, id)`.
- `with_tokens` counts TRDs whose SUMMARY has both tokens_input and tokens_output. `cost_usd` n can be lower (unpriced
  model).
- Known baseline `npm test` failures: stack-drafter-fleet (real fleet) and handoff-e2e MA-7. Anything else is yours.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Sample building, stats, cost and probabilities (buildCalibration)</name>
  <files>plugins/devflow/devflow/bin/lib/calibrator.cjs, plugins/devflow/devflow/bin/lib/calibrator.test.cjs</files>
  <action>
Start with a test-local `BETA_SPEC` constant in calibrator.test.cjs (the table above, as literal `makeCalibrationProject`
input).

RED: tests 1, 2, 3, 8, 9. Commit `test(57-05): calibration medians and P90s per task class from a hand-built history`.

GREEN in calibrator.cjs. Approach:
1. `nearestRank(sorted, p)`, `statBlock(values, round)`: drop nulls, sort ascending, return `{n, p50, p90, min, max}`
   with `round` applied to each.
2. `sampleCost(s, rates)`: codebase_examples formula via `rateFor`. Null when tokens or the rate are missing.
3. `buildCalibration({paths, ratesPath = RATES_PATH})`: `loadRates` (throw on `ok:false`). For each `discoverProjects`
   root, `collectProject`. A TRD is a sample when it has minutes or both token fields. Its TRD-level minutes are null when
   `autonomous === false`. Auto tasks are those whose type does not start with `checkpoint`. Each auto task gets value/k for
   minutes, tokens and cost (k = auto task count) and `files = task.files.length`. Class via `classifyTask({files, tdd,
   type, trdType: trd_type})`. Drop task samples whose values are all null. Aggregate into `task_classes[class]` and
   `task_classes.all`, plus `trd_level` (with `tasks` = k). Probabilities: gap closure over objectives that have at least
   one sample TRD; checkpoint over sample TRDs. Add `sources`, `samples`, `models`/`model_aliases`/`rates_as_of` from the
   rates, sorted unique `unpriced_models`, `data_as_of`, `inputs_digest`, `version`, `classifier_version` and `notes`.
# CRITICAL: sort every list; round only when building stat blocks.
Commit `feat(57-05): buildCalibration aggregates per-class medians, P90s and dollars`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs` passes (tests 1, 2, 3, 8, 9).</verify>
  <done>The listed tests pass after a recorded RED, with the exact BETA numbers from the Test list.</done>
  <recovery>If 57-02's ALPHA_SPEC is not exported or has a different shape, build test 9's second project as a test-local literal spec and record the deviation.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: stableStringify, inputs_digest, writeCalibration, defaultCalibrationPath (byte-identical reruns)</name>
  <files>plugins/devflow/devflow/bin/lib/calibrator.cjs, plugins/devflow/devflow/bin/lib/calibrator.test.cjs</files>
  <action>
RED: tests 4, 5, 6, 7. Commit `test(57-05): calibration.json is byte-identical on unchanged inputs`.

GREEN:
- `stableStringify(value)`: key-sorted deep copy, then `JSON.stringify(copy, null, 2) + '\n'`.
- `inputs_digest` via `crypto.createHash('sha256')` over the stableStringify of the normalized inputs (see
  codebase_examples), computed inside buildCalibration.
- `writeCalibration(outPath, obj)` → `{path, changed, bytes}`: compare with the existing file's text. On change,
  `mkdirSync(dirname, {recursive:true})`, write `<out>.tmp`, then `renameSync`.
- `defaultCalibrationPath(env = process.env)`: `env.DEVFLOW_CALIBRATION_PATH || path.join(os.homedir(), '.claude',
  'devflow', 'calibration.json')`, evaluated per call.
- Export `CALIBRATION_VERSION = 1` and everything in must_haves.artifacts.
Commit `feat(57-05): deterministic calibration.json writer`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs` passes (all 9). `rg -n "Date\(|toISOString|Date\.now" plugins/devflow/devflow/bin/lib/calibrator.cjs` prints nothing.</verify>
  <done>Tests 1-9 pass; 4-7 went RED then GREEN. calibrator.cjs reads no clock.</done>
  <recovery>If test 4 fails only after `utimesSync`, a code path reads mtimes (statSync) to order or select files. Replace it with name-based sorting.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- Success criterion 3 (library half): calibration built from SUMMARY frontmatter, STATE_ARCHIVE metrics (metric fallback
  for 71-b/02) and model rates, with `samples` per class.
- Success criterion 4: byte-identical output on unchanged inputs (test 4), and `changed:false` on rewrite (test 5).
</verification>

<success_criteria>
- The calibration.json shape above is stable for Objective 58 (`task_classes[*].minutes.p50/p90`, `samples`,
  `probabilities`, `models`).
- Full `npm test` shows no failures beyond the two known baseline ones.
</success_criteria>

<output>
After completion, publish `57-05-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the final calibration.json schema (keys and meaning) in the SUMMARY; Objective 58 reads it.
</output>
