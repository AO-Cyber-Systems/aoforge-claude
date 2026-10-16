---
objective: 57-estimation-data-foundation
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/references/model-rates.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/calibration-fixtures.cjs
  - plugins/devflow/devflow/bin/lib/calibration-inputs.cjs
  - plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs
autonomous: true
requirements: [EST-01]
must_haves:
  truths:
    - "model-rates.json is the one place model dollar rates live; every entry has input, output, cache_read, cache_write_5m, cache_write_1h, an https source and an as_of date"
    - "The rates for claude-opus-5-5, claude-sonnet-5-5, claude-haiku-4-5-20251001 and claude-fable-5-1 match Anthropic's published pricing page as of the recorded date"
    - "rateFor resolves claude-opus-5[1m] to claude-opus-5 and claude-haiku-4-5 to claude-haiku-4-5-20251001, and returns null for <synthetic> and unknown ids"
    - "parseDurationMinutes reads 8min, ~45min, about 50 min, 1h 15m and 90s, and returns null for bare numbers and 'one session'"
    - "STATE_ARCHIVE Performance Metrics rows join to their TRD by objective directory and TRD number; a row whose objective number has two directories is counted as ambiguous, never guessed"
    - "classifyTask maps a task's files and TDD flag to one class from a fixed list (CLASSIFIER_VERSION 1), the same function Objective 58's estimator will call"
    - "collectProject returns one record per TRD, sorted by objective directory then TRD number, joining TRD frontmatter and tasks, SUMMARY frontmatter (duration, tokens_*) and the metric row"
  artifacts:
    - path: plugins/devflow/devflow/references/model-rates.json
      provides: "per-model USD/MTok rates with source + as_of"
    - path: plugins/devflow/devflow/bin/lib/calibration-inputs.cjs
      provides: "RATES_PATH, loadRates, normalizeModelId, rateFor, parseDurationMinutes, parseMetricsTable, readTrdTasks, classifyTask, TASK_CLASSES, CLASSIFIER_VERSION, discoverProjects, collectProject"
    - path: plugins/devflow/devflow/bin/lib/__fixtures__/calibration-fixtures.cjs
      provides: "makeCalibrationProject: hand-built .planning trees with TRDs, SUMMARYs, STATE_ARCHIVE rows"
  key_links:
    - "calibration-inputs.readTrdTasks -> trd-tdd.parseTrdTasks + resolveEffectiveTddFlag (export-locked; not modified)"
    - "calibration-inputs.collectProject -> helpers.findPlanFiles / trdKey / normalizeObjectiveName / objectiveDirMatches"
    - "calibration-inputs -> 57-05 calibrator.buildCalibration (consumer) and Objective 58 estimate (classifyTask, rateFor)"
---

# TRD 57-02: Calibration inputs: model rates, history readers and the task classifier (EST-01)

<objective>
Give `df-tools calibrate` (57-05/57-06) clean, deterministic inputs:

1. **Model rates, once.** A new `references/model-rates.json` holds per-model USD per million tokens, each entry with its
   `source` URL and `as_of` date. Keep it separate from `model-profiles.json`: Objective 61 (OBS-01) owns that file's
   model ids. Rates come from Anthropic's published pricing page, never from memory.
2. **History readers.** Parse SUMMARY frontmatter (`duration`, `tokens_*`, `token_model`, `completed`), TRD frontmatter
   (`type`, `autonomous`, `gap_closure`) and tasks (`<files>`, `tdd`), and the STATE_ARCHIVE.md Performance Metrics
   table (plus `state.json` `metrics_log` in store mode). Join them per TRD.
3. **Task classifier.** `classifyTask({files, tdd, type, trdType})` returns a class such as `code_tdd`, `prompt` or `doc`.
   Calibration buckets samples by it, and Objective 58's `estimate task` must classify a new task the same way.

Purpose: EST-01, `calibrate` builds calibration.json from SUMMARY frontmatter, STATE_ARCHIVE metrics and model rates.
Output: model-rates.json, calibration-inputs.cjs (+ test) and calibration-fixtures.cjs.
</objective>

<file_tree>
plugins/devflow/devflow/
├── references/model-rates.json                         ← CREATE
└── bin/lib/
    ├── __fixtures__/calibration-fixtures.cjs           ← CREATE
    ├── calibration-inputs.cjs                          ← CREATE
    └── calibration-inputs.test.cjs                     ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: a `test(57-02): ...` RED commit before the `feat(57-02): ...` commit.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash call.
- Fixtures are hand-built by `calibration-fixtures.cjs` with literal TRD/SUMMARY/table text in mkdtemp directories. No
  generated data, no property-based tests, no `.feature` files.
- **Rates are never typed from memory.** Task 1 re-reads the published page. The planner verified the values in
  codebase_examples against https://platform.claude.com/docs/en/about-claude/pricing on 2026-10-05 (docs.claude.com
  redirects there). If you cannot fetch the page, use those values with `as_of: "2026-10-05"` and say so in the SUMMARY.
- Parallel wave: TRD 57-01 owns token-usage.cjs, trd-identify.cjs, context-audit.cjs, transcript-fixtures.cjs and the
  gate-executor-stop hook. Do not touch them. Do not touch `model-profiles.json` (Objective 61), `df-tools.cjs` or
  `help.cjs` (57-03/57-06).
- `trd-tdd.cjs` exports are locked by TRD 12-05. Call `parseTrdTasks` / `resolveEffectiveTddFlag` and do not change them.

## Test list

Outermost first. calibration-inputs.test.cjs.

collectProject (`describe('57-02 collectProject')`):
1. Fixture `alpha` with objectives `55-old` (TRDs 01-02, SUMMARYs with `duration: 9min` / `duration: ~45min`), `56-new`
   (TRD 01 with SUMMARY carrying tokens_input 140747, tokens_output 1370, tokens_cache_read 121144, tokens_cache_write
   19596, `token_model: "claude-opus-5-5"`, `completed: 2026-10-05`; TRD 02 with no SUMMARY) and STATE_ARCHIVE rows.
   `collectProject(root)` returns four TRD records sorted `55-old/01, 55-old/02, 56-new/01, 56-new/02`. Each carries `id`,
   `objective_dir`, `trd_type`, `autonomous`, `gap_closure`, `tasks` and `summary`/`metric` (or null). The tokens are
   numbers and `label` is `'alpha'`. RED.
2. A SUMMARY `duration` wins over the metric row. A SUMMARY with `duration: one session` falls back to the metric row
   `| Objective 55 P02 | 12min | 2 tasks | 3 files |`, so minutes = 12 and `duration_source:'metric'`.
3. Metric rows: `Objective 56 P01` joins `56-new`. `Objective 55-old P55-01` joins by exact dir name and TRD `01`.
   `Objective 10 P03` with dirs `10-a` and `10-b` counts in `metrics.ambiguous` and joins nothing.
   `Objective 10-a P10-04a` counts in `metrics.unparsed_trd`. `| Objective 56 P02 | 360 | - tasks | - files |` joins with
   `minutes:null` and counts in `metrics.unparsed_duration`. A repeated key takes the last row.
4. Store mode: `.planning/state.json` `metrics_log: [{objective:'56', job:'02', duration:'7min', tasks:'2', files:'3'}]`
   is read like a table row.
5. TRD frontmatter `gap_closure: true` and `autonomous: false` surface as booleans; absent → `false` / `true`.
6. A SUMMARY whose TRD file is missing counts in `summaries_without_trd` and yields no record.

parseDurationMinutes (table test):
7. `'8min'`→8, `'3 min'`→3, `'~45min'`→45, `'about 50 min'`→50, `'65 min'`→65, `'1h 15m'`→75, `'2h'`→120, `'90s'`→1.5,
   `'12.5min'`→12.5, `'~1h'`→60; null for `'6'`, `'360'`, `'one session'`, `'3 sessions (resumed twice)'`, `''`, `undefined`.

readTrdTasks / classifyTask:
8. A literal TRD with three task elements gives per-task `files` arrays of bare paths. The elements: an auto task with
   attribute tdd="true" whose files element lists `a/x.cjs, a/x.test.cjs`; a task typed `checkpoint:human-verify`; and a
   task whose files element is a multi-line list with backticks and `- ` bullets. `tdd` is the effective flag: TRD
   `type: tdd` with no task attribute → true.
9. classifyTask table (CLASSIFIER_VERSION 1):
   `['lib/x.cjs','lib/x.test.cjs']`+tdd → `code_tdd`; `['lib/x.cjs']` → `code`; `['hooks/gate.js']` → `code`;
   `['skills/build/SKILL.md']` → `prompt`; `['agents/executor.md','lib/y.cjs']` → `code`; `['workflows/a.md']` → `prompt`;
   `['docs/USER-GUIDE.md','CHANGELOG.md']` → `doc`; `['lib/x.test.cjs']`+tdd → `test_tdd`;
   `['lib/__fixtures__/f.cjs']` → `test`; `['src/App.tsx']` → `ui`; `['lib/screens/home.dart']`+trdType `ui` → `ui`;
   `['lib/screens/home.dart']` → `code`; `['db/migrations/001_init.sql']` → `schema`; `['package.json']` → `config`;
   `[]` → `other`; type `checkpoint:decision` → `checkpoint`. Every result is in `TASK_CLASSES`.

Rates:
10. `loadRates()` (the shipped file): every model has numeric `input, output, cache_read, cache_write_5m, cache_write_1h`,
    an `https://` source and a `YYYY-MM-DD` as_of. `rateFor` resolves the four current ids `claude-opus-5-5`,
    `claude-sonnet-5-5`, `claude-haiku-4-5-20251001` and `claude-fable-5-1`, plus `claude-opus-5[1m]` → `claude-opus-5`
    and `claude-haiku-4-5` → the dated id. It returns null for `<synthetic>`, `''` and `claude-unknown-9`.
11. `loadRates(fixturePath)` with a model missing `source` returns `{ok:false}` with an error naming that model. An alias
    pointing at a missing model is an error too.

discoverProjects:
12. A path that is a project returns itself. A parent holding `p1/.planning/objectives`, `p2/.planning/objectives`,
    `.hidden/.planning/objectives` and a plain `notes/` dir returns `[p1, p2]` (realpath'd, sorted). Passing both the
    parent and `p1` dedupes. A missing path is skipped.

<embedded_context>

<codebase_examples>
Published rates (planner-verified 2026-10-05, https://platform.claude.com/docs/en/about-claude/pricing, USD per MTok,
first-party global, standard, not batch, not fast mode):

| API id | input | cache_write_5m | cache_write_1h | cache_read | output |
|---|---|---|---|---|---|
| claude-fable-5-1 | 10 | 12.50 | 20 | 0.25 | 50 |
| claude-opus-5-5 | 4 | 5 | 8 | 0.20 | 20 |
| claude-opus-5 | 5 | 6.25 | 10 | 0.50 | 25 |
| claude-opus-4-8 | 5 | 6.25 | 10 | 0.50 | 25 |
| claude-sonnet-5-5 | 2 | 2.50 | 4 | 0.20 | 10 |
| claude-sonnet-5 | 2 | 2.50 | 4 | 0.20 | 10 |
| claude-haiku-4-5-20251001 | 1 | 1.25 | 2 | 0.10 | 5 |

These seven are every model id seen in this machine's subagent transcripts (claude-opus-5, claude-opus-5-5,
claude-sonnet-5, claude-sonnet-5-5, claude-fable-5-1, claude-opus-4-8, claude-haiku-4-5-20251001; some with a `[1m]`
suffix, which the page prices at standard rates). Note: Opus 5.5 cache hits are 0.05x input and Fable 5.1 0.025x;
everything else 0.1x. Shape:

```json
{
  "_comment": ["USD per million tokens. Claude API first-party, global routing, standard (not batch, not fast mode).",
               "Every entry carries its own source and as_of. Update by re-reading the source page, never from memory.",
               "Read by lib/calibration-inputs.cjs (loadRates/rateFor); copied into calibration.json by df-tools calibrate."],
  "currency": "USD",
  "unit": "per_million_tokens",
  "models": {
    "claude-opus-5-5": { "input": 4, "cache_write_5m": 5, "cache_write_1h": 8, "cache_read": 0.2, "output": 20,
                         "source": "https://platform.claude.com/docs/en/about-claude/pricing", "as_of": "2026-10-05" }
  },
  "aliases": { "claude-haiku-4-5": "claude-haiku-4-5-20251001" }
}
```

Real history this reads (this repo, 391 TRDs / 914 tasks / 390 SUMMARYs). SUMMARY frontmatter tail:

```yaml
duration: 8min
completed: 2026-10-05
```

Durations in the wild: `6min`, `~45min`, `about 50 min`, `3 min`, `one session`, `3 sessions (resumed twice)`.
STATE_ARCHIVE.md (written by state.cjs cmdStateRecordMetric):

```text
## Performance Metrics
| Objective | Duration | Tasks | Files |
| Objective 09-roadmap-disk-reconciliation P09-01 | 6min | - tasks | - files |
| Objective 08 P08-01 | 360 | 3 tasks | 13 files |      <- bare number: unit unknown (seconds in some old rows)
| Objective 10 P10-04a | 7min | 2 tasks | 3 files |
| Objective 56 P01 | 11min | 3 tasks | 16 files |
```

This repo has three `10-*` objective directories (10-autonomous-mode-overhaul, 10-flutter-ui-verification-process,
10-phase-e-agent-audit), so `Objective 10 P03` is genuinely ambiguous.

Task-kind survey of this repo's 914 tasks (draft heuristic): code+tdd 393, code 120, prompt 94, doc 90, hook+tdd 48,
test 46, test+tdd 45, prompt+tdd 41, other 20. The classifier folds hooks into `code`.

Classifier rules (CLASSIFIER_VERSION = 1). Per file, first match wins:
1. `schema`: `/(^|\/)(migrations?|schema)(\/|\.)|\.sql$|\.prisma$/i`
2. `test`: `/\.(test|spec)\.|_test\.(go|dart|py)$|(^|\/)test_[^/]*\.py$|(^|\/)(__tests__|__fixtures__|tests?|integration_test)\//`
3. `ui`: `/\.(tsx|jsx|vue|svelte|css|scss|html)$/i`, or a `.dart` file when `trdType === 'ui'`
4. `code`: `/\.(c?js|mjs|ts|go|dart|py|rs|rb|java|kt|swift|sh)$/i`
5. `prompt`: `/(^|\/)(skills\/[^/]+\/SKILL\.md|(agents|workflows|references|templates)\/[^/]+\.md)$/`
6. `doc`: `/\.(md|mdx|txt|rst)$/i`
7. `config`: `/\.(json|ya?ml|toml|ini)$|(^|\/)(Dockerfile|Makefile)$/`
8. `other`
Task kind = highest-precedence file kind: `schema > ui > code > prompt > test > doc > config > other`. A task whose
`type` starts with `checkpoint` is `checkpoint`. Otherwise class = kind + (`_tdd` when the effective tdd flag is true).
Path cleanup before matching: split `<files>` on commas and newlines, trim, drop a leading `- ` or `* `, strip
backticks/quotes, keep the first whitespace-delimited token (drops `(new)`, `← CREATE` annotations).

trd-tdd.cjs (export-locked) gives name/type/tdd_attr only:

```js
const { parseTrdTasks, resolveEffectiveTddFlag } = require('./trd-tdd.cjs');
// parseTrdTasks(text) -> { frontmatter, tasks: [{ name, type, tdd_attr }] }
// task regex: /<(?:TASK-EX|task)\s+([^>]+?)>([\s\S]*?)<\/(?:TASK-EX|task)>/gi
```

Use the identical regex to pull `<files>([\s\S]*?)</files>` per task and zip by index. If the counts differ, count
`task_files_misaligned` and give every task `files: []`.

helpers.cjs: `findPlanFiles(dirFiles)` (TRD files, or JOB files for legacy dirs), `trdKey(filename)` (`NN-MM` from
TRD/JOB/SUMMARY names), `normalizeObjectiveName`, `objectiveDirMatches(dirName, normalized)`. frontmatter.cjs:
`extractFrontmatter(text)` (values come back as strings; convert with `Number()`; treat `''`/NaN as null).
planning-mode.cjs: `resolveMainRoot(path)` (used for the project label, so a worktree checkout labels as its repo).
</codebase_examples>

<anti_patterns>
- Guessing a unit for bare-number durations. Old `record-metric` rows mix seconds and minutes; null is the honest value.
- Joining metric rows by objective number alone when the number has several directories.
- Returning object maps keyed by insertion order and relying on it. Every list this module returns is explicitly sorted;
  57-05 depends on that for a byte-identical calibration.json.
- Reading `~/.claude` or the real repo in tests. Fixtures only.
</anti_patterns>

<error_recovery>
- If the pricing page cannot be fetched (no network in the executor), use the planner-verified table above, keep
  `as_of: "2026-10-05"` and the source URL, and record the fetch failure in the SUMMARY.
- If the page shows different numbers than the table, the page wins. Record the differences in the SUMMARY so 57-05's
  expected cost (computed with Opus 5.5 at 4/5/0.2/20) can be adjusted.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/trd-tdd.cjs
@plugins/devflow/devflow/bin/lib/helpers.cjs
</context>

<gotchas>
- `trdKey` returns the legacy suffix-strip for names without `NN-MM`; such files are skipped (count `unkeyed`).
- TRD numbers in records are the zero-padded second half of the key (`'01'`); the `id` is the full key (`'56-01'`).
- `extractFrontmatter` returns `job: "02"` quoted or bare depending on the file; never rely on SUMMARY `job`/`trd`
  fields. Pair SUMMARY to TRD by `trdKey` within the same directory.
- Known baseline `npm test` failures: stack-drafter-fleet (real fleet) and handoff-e2e MA-7. Anything else is yours.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fixture builder + model-rates.json (re-verified from the pricing page) + loadRates/rateFor</name>
  <files>plugins/devflow/devflow/bin/lib/__fixtures__/calibration-fixtures.cjs, plugins/devflow/devflow/references/model-rates.json, plugins/devflow/devflow/bin/lib/calibration-inputs.cjs, plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs</files>
  <action>
Fixture builder first. calibration-fixtures.cjs exports `makeCalibrationProject(spec)` → realpath'd root, where
`spec = {name, objectives: [{dir, trds: [{nn, slug, frontmatter: {type, autonomous, gap_closure}, tasks: [{name, type,
tdd, files}], summary: {duration, completed, tokens_input, ...} | null, summaryName}]}], stateArchiveRows: ['| Objective
... |'], stateJson: {metrics_log: [...]}}`. It writes literal TRD text (frontmatter plus one task element per task, each
with name, files and action children), SUMMARY frontmatter and a STATE_ARCHIVE.md with a `## Performance Metrics` table
header and the given rows. Also export `ALPHA_SPEC`, the literal spec used by tests 1-6, so 57-05 can reuse it.

Rates: fetch the page with two plain commands (save, then search):
`curl -sL -o <scratchpad>/pricing.md https://platform.claude.com/docs/en/about-claude/pricing.md`, then
`rg -n "Opus 5|Sonnet 5|Haiku 4.5|Fable 5.1|Opus 4.8" <scratchpad>/pricing.md`. If the `.md` URL returns HTML or
nothing, try without `.md`. Write model-rates.json with the seven models (codebase_examples) using the page's numbers,
each with `source` and `as_of` = the date you read it.

RED: tests 10-11. Commit `test(57-02): model rates carry a source and resolve current model ids`.
GREEN: `RATES_PATH` (`path.join(__dirname, '..', '..', 'references', 'model-rates.json')`), `loadRates(file = RATES_PATH)`
→ `{ok:true, models, aliases, currency, unit, as_of}` (as_of = latest entry date) or `{ok:false, error}`.
`normalizeModelId(id)` (trim, strip a trailing `[...]`, `<synthetic>`/empty → null).
`rateFor(rates, id)`: direct, then alias, then without a trailing `-YYYYMMDD` (direct, alias), else null. It returns
`{id, input, output, cache_read, cache_write_5m, cache_write_1h}`.
Commit `feat(57-02): model-rates.json and rate lookup for calibration`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs` passes. `node -e "const r=require('./plugins/devflow/devflow/bin/lib/calibration-inputs.cjs');console.log(r.rateFor(r.loadRates(),'claude-opus-5-5'))"` prints the page's Opus 5.5 rates.</verify>
  <done>Tests 10-11 pass after a recorded RED. model-rates.json has seven entries, each with source + as_of, and its numbers match the page that day (or the planner-verified table, with the fetch failure noted).</done>
  <recovery>If the page lists a model under a different API id, keep the transcript-observed id as the key and add the page's id as an alias. Do not drop a model seen in transcripts.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Duration and metrics-table parsers, TRD task reader and classifyTask</name>
  <files>plugins/devflow/devflow/bin/lib/calibration-inputs.cjs, plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs</files>
  <action>
RED: tests 7, 8, 9. Commit `test(57-02): durations, TRD tasks and task classes parse deterministically`.

GREEN:
- `parseDurationMinutes(text)`: strip a leading `~` or `about `. Accept `<n>h`, `<n>h <m>m`, `<n> ?min`, `<n>m`, `<n>s`
  (s/60). Anything without a unit → null.
- `parseMetricsTable(markdown)` → rows `{objective, trdToken, duration_raw, minutes, tasks, files}` from lines matching
  `| Objective <obj> P<trd> | <dur> | <n|-> tasks | <n|-> files |` inside the `## Performance Metrics` section.
- `readTrdTasks(text)` → `{frontmatter, tasks:[{name, type, tdd, files}], task_files_misaligned}` (codebase_examples).
- `classifyTask({files, tdd, type, trdType})`, `TASK_CLASSES` (sorted list of every possible class), `CLASSIFIER_VERSION = 1`.
Commit `feat(57-02): duration, metrics-table and task-class parsing`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs plugins/devflow/devflow/bin/lib/trd-tdd.test.cjs` passes.</verify>
  <done>Tests 7-9 pass after a recorded RED. trd-tdd.cjs is unchanged (`git diff --stat plugins/devflow/devflow/bin/lib/trd-tdd.cjs` is empty).</done>
  <recovery>If a real TRD's `<files>` format defeats the cleanup (check with a read-only `readTrdTasks` over a few `.planning/objectives/*/*-TRD.md`), add that shape as a literal case to test 8 before changing the parser.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: discoverProjects + collectProject (TRD x SUMMARY x metric join)</name>
  <files>plugins/devflow/devflow/bin/lib/calibration-inputs.cjs, plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs</files>
  <action>
RED: tests 1-6 and 12. Commit `test(57-02): collectProject joins TRDs, SUMMARYs and metric rows per project`.

GREEN:
- `discoverProjects(paths)`: for each path, a dir with `.planning/objectives` is a project; otherwise its non-dot child
  dirs that have one. Realpath, dedupe, sort.
- `collectProject(root)` → `{root, label, objectives, trds:[...], counts:{summaries, summaries_without_trd, unkeyed,
  task_files_misaligned}, metrics:{rows, joined, ambiguous, unparsed_trd, unparsed_duration, unmatched}}`.
  `label = path.basename(resolveMainRoot(root) || root)`. Walk `.planning/objectives/*` (sorted). Use `findPlanFiles` and
  `trdKey` for TRDs and pair `*-SUMMARY.md` by key in the same directory (first sorted wins). Each record is
  `{id, objective_dir, trd, trd_type, autonomous, gap_closure, tasks, summary, metric, minutes, duration_source}`.
  `minutes` is the SUMMARY's parsed duration, else the metric's, else null; `duration_source` is `summary|metric|null`.
  SUMMARY numbers become Numbers (null when absent).
  Metric rows come from STATE_ARCHIVE.md, then `state.json` `metrics_log`. Resolve the objective token: exact dir name,
  else a numeric token (or the token's numeric prefix) matched with `objectiveDirMatches` must name exactly one dir. The
  TRD token is the last `-` segment after `P`, digits only, zero-padded to 2. The last row for a key wins.
# CRITICAL: every array is sorted before it is returned (dirs, files, records, rows).
Commit `feat(57-02): collect calibration samples from a project's planning history`.

Then a read-only check against this repo:
`node -e "const c=require('./plugins/devflow/devflow/bin/lib/calibration-inputs.cjs');const p=c.collectProject(process.cwd());console.log(p.trds.length,p.counts,p.metrics)"`
Record the output in the SUMMARY (expect roughly 390 TRDs; metrics.ambiguous > 0 because of the three 10-* dirs).
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs` passes, and the read-only repo check prints a TRD count near 390 without throwing.</verify>
  <done>Tests 1-6 and 12 pass after a recorded RED. Running collectProject twice on the same tree gives deep-equal output.</done>
  <recovery>If the repo check throws on a real file, reproduce that file's shape as a literal fixture case first, then fix the reader. Never special-case a path.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs plugins/devflow/devflow/bin/lib/trd-tdd.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- Model rates live only in references/model-rates.json, each with source + as_of (constraint from the objective context).
- calibration inputs come from SUMMARY frontmatter and STATE_ARCHIVE metrics (EST-01 inputs), joined per TRD.
- classifyTask is exported with CLASSIFIER_VERSION for Objective 58.
</verification>

<success_criteria>
- 57-05 can build calibration.json from `collectProject` + `loadRates` without re-reading any planning file itself.
- Full `npm test` shows no failures beyond the two known baseline ones.
</success_criteria>

<output>
After completion, publish `57-02-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the rates actually written (and the as_of / fetch outcome) and the repo-check output.
</output>
