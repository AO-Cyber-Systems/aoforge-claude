---
objective: 64-estimate-accuracy-validation
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - ".planning/objectives/58-estimation-engine-and-surfacing/*-SUMMARY.md"
  - ".planning/objectives/59-state-and-merge-plumbing/*-SUMMARY.md"
  - ".planning/objectives/60-edit-gate-enforces-the-action/*-SUMMARY.md"
  - ".planning/objectives/61-store-mode-rough-edges-and-observability/*-SUMMARY.md"
  - ".planning/objectives/62-built-in-sweep/*-SUMMARY.md"
  - ".planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/*-SUMMARY.md"
autonomous: true
requirements: [EST-08]
must_haves:
  truths:
    - "The calibration every 59-63 estimate was made from is identified and preserved: sha256 5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea (the hash 58-10 recorded), written before 59's first commit, copied to ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json and never rebuilt"
    - "Objective 63's prospective run state is preserved in the run history (sha256 08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee) and the current estimator reproduces its wall estimate (p50 96.6, P90 290.4) and every wave's p50/P90 from the frozen calibration, so reconstructed 59-62 estimates are what the engine would have printed at the time"
    - "The estimator code drift between 58's completion (cce70b30) and now is listed file by file, with the objective-estimate path shown unchanged or each change named"
    - "Every one of the 41 SUMMARYs of objectives 59-63 carries tokens_input/tokens_output after a diff-guarded `tokens backfill --write` (only token lines added, only SUMMARY files), and a second dry run recovers 0"
    - "The actuals are audited: for each of the 41 TRDs the SUMMARY minutes (and their source, summary or metric row) are set beside the executor transcript span, with the median ratio and the outliers recorded, and the forward-stamp gap (how many of the 41 were stamped live vs backfilled) is counted"
  artifacts:
    - path: ".planning/objectives/59-state-and-merge-plumbing/*-SUMMARY.md"
      provides: "token fields (tokens_source: backfill) for the 33 unstamped TRDs of 59-63, and 7 of 58's"
    - path: .planning/objectives/64-estimate-accuracy-validation/64-03-SUMMARY.md
      provides: "provenance evidence, drift list, reproduction table, backfill counts and guard JSON, actuals-audit table for 64-05"
  key_links:
    - "frozen calibration copy -> 64-05 `estimate backtest --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`"
    - "tokens backfill --write -> token-backfill.applyBackfill -> summary post -> SUMMARY token fields -> 64-01 objectiveActuals cost"
    - "history/devflow-claude-d3dccfe9/63-2026-10-06T23_55_36_062Z.json -> 64-02 latestRun -> 64-04 prospective wall comparison"
---

# TRD 64-03: Freeze the inputs, recover the token data, audit the actuals (EST-08)

<objective>
An accuracy report is only as good as the two sides it compares. This TRD pins both before anything is computed.

**The estimate side.** `~/.claude/devflow/calibration.json` has not been rebuilt since 58-10: its sha256 is still
`5cf42c4b…`, the hash 58-10's SUMMARY records, its mtime (2026-10-05 15:48 local, epoch 1791229680) is earlier than
Objective 59's first commit (`401a9145`, epoch 1791236515), `data_as_of` is 2026-10-05 and it holds 323 TRDs.
So every estimate shown while 59-63 were planned and built came from this one file, and it contains none of their
data: it is out of sample for all five. The estimates themselves were not persisted (one run-state file per repo,
overwritten), except Objective 63's, which the planner copied into the run history. Re-running today's estimator on
the frozen calibration and the TRDs as executed reconstructs them exactly, provided the estimator code on the
objective path has not drifted; 63's persisted run state is the check.

**The actual side.** Executor minutes come from SUMMARY `duration` (else the STATE_ARCHIVE metric row; four of the 41
TRDs have a nested or missing `duration` and rely on the row). Cost comes from SUMMARY token fields, but only 8 of the
41 SUMMARYs of 59-63 were stamped by the forward stamp (EST-06); the other 33 are recoverable from transcripts with
the existing EST-07 backfill. Transcript retention will delete them, so stamping now also preserves the evidence.
Finally, SUMMARY durations are the executor's own report: set them beside the measured transcript span so the report
can say how far the "actual" itself can be trusted.

No production code changes here. The only repository change is the backfilled SUMMARY token lines.

Purpose: 64-05's report can state exactly what was compared with what, and why the reconstructed estimates count.
Output: SUMMARY token fields for 58-63, and a 64-03 SUMMARY holding the provenance, drift, reproduction, backfill and
audit evidence.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Use the **repository** df-tools, `node plugins/devflow/devflow/bin/df-tools.cjs …`, not the mirror. One plain command
  per Bash call (no `&&`, no `cd x && …`, no pipes where a flag does the job).
- **Never write `~/.claude/devflow/calibration.json`**, never run `calibrate` without `--out` into the scratchpad, and
  never set `DEVFLOW_CALIBRATION_PATH` to the frozen copy for a calibrate run. Estimates read the frozen copy with
  `--calibration`.
- Scratch files (the audit script, JSON dumps) go in the session scratchpad from your environment, never in the repo
  or `.planning/`.
- The backfill may change **only** `*-SUMMARY.md` token lines. If the diff guard finds anything else, run
  `git restore -- .planning/objectives`, do not commit, and record the guard output as a deviation.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- `requirements: [EST-08]` names the requirement this TRD serves. **Do not run `requirements mark-complete EST-08`**;
  record `requirements-completed: []` (64-05 decides EST-08).
- Never use port 8080.

<embedded_context>

<codebase_examples>
Known values to check against (measured at planning time, 2026-10-07):

| Item | Expected |
|---|---|
| `shasum -a 256 ~/.claude/devflow/calibration.json` | `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea` |
| frozen copy `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json` (planner copied with `cp -p`) | same sha256, mtime epoch 1791229680 |
| `git log -1 --format=%ct 401a9145` (59: `docs(59): create objective TRDs`) | 1791236515 |
| calibration `version`, `data_as_of`, `samples` | 2, `2026-10-05`, `{trds: 323, tasks: 746, with_tokens: 236}` |
| 63 run state in history: `~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/63-2026-10-06T23_55_36_062Z.json` | sha256 `08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee` |
| 63 run state `estimate.wall_minutes` | p50 96.61616043566684, p90 290.40059551531397 |
| 63 waves p50 / P90 | W1 19.738 / 67.316, W2 14.5 / 54.1, W3 16.218 / 42.600, W4 9.5 / 36.6, W5 25.0 / 102.5 |
| `tokens backfill` dry run (planning time) | recovered 40: 58-01, 58-04..58-09 and all 33 unstamped TRDs of 59-63 |
| First commit of each objective dir | 59 `401a9145`, 60 `05a5b5f4`, 61 `d7b9c938`, 62 `9ad19b1c`, 63 `26e4e57f`; 58 completed at `cce70b30` |

Objective 63's run state verbatim, to restore the history copy if it is missing (write
`JSON.stringify(JSON.parse(<this>), null, 2) + '\n'` to the history path, then re-check the sha256):

```json
{"version":1,"objective":"63","started_at":"2026-10-06T23:55:36.062Z","updated_at":"2026-10-07T01:46:41.099Z","finished_at":"2026-10-07T01:46:41.099Z","estimate":{"line":"Objective 63 estimate: 1h 43m median (P90 5h 04m) wall · $22.08 (P90 $34.02) · 7 TRDs left in 5 waves · confidence low","wall_minutes":{"p50":96.61616043566684,"p90":290.40059551531397},"confidence":"low"},"waves":[{"wave":1,"trds":["63-01","63-05"],"p50":19.738206139394915,"p90":67.31643574086333,"started_at":"2026-10-06T23:56:09.280Z","finished_at":"2026-10-07T00:14:43.608Z","actual_minutes":18.572133333333333},{"wave":2,"trds":["63-02"],"p50":14.5,"p90":54.100000000000016,"started_at":"2026-10-07T00:15:05.024Z","finished_at":"2026-10-07T00:27:16.835Z","actual_minutes":12.19685},{"wave":3,"trds":["63-03","63-04"],"p50":16.21765152054369,"p90":42.59996074545397,"started_at":"2026-10-07T00:27:17.554Z","finished_at":"2026-10-07T00:35:44.197Z","actual_minutes":8.44405},{"wave":4,"trds":["63-06"],"p50":9.500000000000002,"p90":36.60000000000001,"started_at":"2026-10-07T00:35:54.113Z","finished_at":"2026-10-07T01:26:30.878Z","actual_minutes":50.61275},{"wave":5,"trds":["63-07"],"p50":25.000000000000007,"p90":102.50000000000001,"started_at":"2026-10-07T01:26:34.071Z","finished_at":"2026-10-07T01:45:52.070Z","actual_minutes":19.299983333333333}]}
```

The objective-estimate code path (what `estimate objective N --all` executes) for the drift check:

```
plugins/devflow/devflow/bin/lib/estimate.cjs
plugins/devflow/devflow/bin/lib/estimate-rollup.cjs
plugins/devflow/devflow/bin/lib/estimate-math.cjs
plugins/devflow/devflow/bin/lib/calibration-inputs.cjs
plugins/devflow/devflow/bin/lib/calibrator.cjs
plugins/devflow/devflow/bin/lib/objective.cjs
plugins/devflow/devflow/bin/lib/roadmap.cjs
plugins/devflow/devflow/bin/lib/misc.cjs
plugins/devflow/devflow/bin/lib/config.cjs
plugins/devflow/devflow/bin/lib/helpers.cjs
plugins/devflow/devflow/references/model-rates.json
```
(At planning time only 59-04/59-05 commits touched any of them — milestone scope and `roadmap_updated` — so the
objective path is expected to be unaffected; the reproduction below is the proof, not this expectation.)

Diff guard from 57-07, one command (prints JSON; expect `bad_count: 0` and `non_summary: []`):

```bash
node -e "const {execFileSync}=require('child_process');const run=(a)=>execFileSync('git',a,{encoding:'utf8',maxBuffer:1<<28});const names=run(['diff','--name-only','--','.planning/objectives']).split('\n').filter(Boolean);const bad=[];for(const l of run(['diff','-U0','--','.planning/objectives']).split('\n')){if(l.startsWith('--- a/')||l.startsWith('+++ b/')||l.startsWith('--- /dev/null'))continue;if(l.startsWith('-'))bad.push(l);else if(l.startsWith('+')&&!/^\+(tokens_(input|output|cache_read|cache_write|source)|token_model): /.test(l))bad.push(l);}console.log(JSON.stringify({files:names.length,non_summary:names.filter(n=>!/-SUMMARY\.md$/.test(n)),outside_58_63:names.filter(n=>!/^\.planning\/objectives\/(5[89]|6[0-3])-/.test(n)),bad_count:bad.length,bad:bad.slice(0,10)}))"
```

Exports the audit script uses (all read-only):

```js
const ci = require('<repo>/plugins/devflow/devflow/bin/lib/calibration-inputs.cjs');   // collectProject(root)
const tu = require('<repo>/plugins/devflow/devflow/bin/lib/token-usage.cjs');          // indexExecutorTranscripts({root, repoRoot}), tokensForTrd(index, {id, dir}), defaultTranscriptRoot()
const ao = require('<repo>/plugins/devflow/devflow/bin/lib/agent-overhead.cjs');       // transcriptSpanMinutes(file): first-to-last record timestamp, null when < 2 usable
```
`tokensForTrd` returns `{status: 'recovered', transcripts: [{file, session, agent_id}], totals}` or
`{status: 'unrecovered', reason, transcripts}`. A TRD resumed after an INCOMPLETE stop has more than one transcript:
sum their spans.
</codebase_examples>

<anti_patterns>
- Do not "fix" a drifted estimator to reproduce 63; a mismatch is a finding for the report (record it, and 64-05 labels
  every reconstructed number with the caveat).
- Do not run `calibrate` here at all; this TRD freezes the calibration, it does not rebuild it.
- Do not stamp tokens by hand or with `tokens stamp` on a `.planning/` file; the backfill goes through `summary post`.
- Do not replace SUMMARY minutes with transcript spans in the data: calibration is built from SUMMARY minutes, so the
  like-for-like comparison uses them; the span audit is a fidelity check reported beside them.
</anti_patterns>

<error_recovery>
- Live calibration sha differs but the frozen copy matches: use the copy, record that something rebuilt the live file
  (and when, from its mtime). Frozen copy missing and live matches: `cp -p` it to the backtest path. Neither matches:
  stop this task and record a deviation; 64-05 cannot claim an out-of-sample estimate without the frozen file.
- History copy of 63's run state missing or a different sha: restore it from the verbatim JSON above; if the live run
  file still holds objective 63 (`objective` field), copy that instead and compare both hashes.
- Reproduction mismatch beyond 0.05 minutes on any p50/P90: record the per-wave table with both values; do not stop.
- `tokens backfill --write` exits 1 (write_failed): record the failures, then run the diff guard on what was written.
- The diff guard fails: `git restore -- .planning/objectives`, record the guard JSON, and stop Task 2 as a deviation.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/58-estimation-engine-and-surfacing/58-10-SUMMARY.md
@.planning/objectives/57-estimation-data-foundation/57-07-backfill-dogfood-and-docs-TRD.md
</context>

<gotchas>
- macOS `stat`: `stat -f '%m' <file>` prints the epoch mtime (not GNU `stat -c`).
- `estimate objective 63 --all` without `--raw` prints JSON; read `execution.wall_minutes` and `waves[].wall_minutes`
  (rounded to 0.1 at output) and compare with the run state rounded to 0.1. The `line` text form on a done objective
  says `all TRDs done` until 64-02 lands in your checkout; use the JSON.
- Run the backfill from the checkout this TRD executes in; it matches transcripts against the main checkout itself
  (`--repo` default) and writes SUMMARYs in your checkout, so the wave merge carries them.
- Read SUMMARY frontmatter narrowly (`rg -n '^(duration|tokens_source|tokens_input):' <file>`), not whole files.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Provenance of the frozen calibration and 63's run state, the drift list, and the 63 reproduction</name>
  <files>none (evidence recorded in 64-03-SUMMARY.md)</files>
  <action>
1. `shasum -a 256 ~/.claude/devflow/calibration.json` and `shasum -a 256 ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`;
   `stat -f '%m' ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`; `git log -1 --format='%ct %cI %s' 401a9145`.
   Apply error_recovery if a hash differs.
2. One `node -e` printing the frozen copy's `version`, `data_as_of`, `samples`, `inputs_digest`, `classifier_version`.
3. `shasum -a 256 ~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/63-2026-10-06T23_55_36_062Z.json`;
   restore per error_recovery if needed.
4. Drift: `git log --format='%h %cI %s' cce70b30..HEAD -- <the objective-path files>` and
   `git diff --stat cce70b30 HEAD -- <the same files>`. Name each change and whether it can affect
   `estimateObjective` (read the hunk only when unsure).
5. Reproduce 63: `node plugins/devflow/devflow/bin/df-tools.cjs estimate objective 63 --all --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`
   to a scratchpad JSON file (redirect, one command); then one `node -e` that prints a table of run-state vs
   reconstructed p50/P90 for the objective wall time and each wave, with `|diff| <= 0.05` per cell
   (the reconstructed JSON is rounded to 0.1, so compare after rounding the run state to 0.1).
6. Record all of it in the SUMMARY under `## Provenance`, `## Estimator drift` and `## Reproduction of 63`.
  </action>
  <verify>The SUMMARY shows both sha256 values equal to 5cf42c4b…, the mtime earlier than 1791236515, the 63 history sha 08f88f9f…, the drift list, and a reproduction table with a `reproduced: yes|no` verdict per cell.</verify>
  <done>The frozen calibration and 63's prospective run state are preserved and identified, and the report has a stated basis for treating reconstructed 59-62 estimates as what was shown at the time.</done>
  <recovery>See error_recovery. Nothing in this task changes the repository; a failed step is re-run, not rolled back.</recovery>
</task>

<task type="auto">
  <name>Task 2: Backfill the token history of 58-63 (dry run, write, guard, commit, idempotence)</name>
  <files>.planning/objectives/5[89]-*/*-SUMMARY.md, .planning/objectives/6[0-3]-*/*-SUMMARY.md</files>
  <action>
1. Dry run: `node plugins/devflow/devflow/bin/df-tools.cjs tokens backfill --raw` and the JSON form
   (`… tokens backfill` redirected to a scratchpad file). Record recovered/unrecovered counts by reason and the
   recovered ids; expect 40 (58-01, 58-04..09, and the 33 unstamped TRDs of 59-63).
2. Write: `node plugins/devflow/devflow/bin/df-tools.cjs tokens backfill --write --raw`. Record the lines.
3. Diff guard (codebase_examples). Require `bad_count: 0` and `non_summary: []`; record `outside_58_63` (expected
   `[]`; if not empty, list those ids in the SUMMARY, they are harmless recoveries but must be named).
4. Commit: `node plugins/devflow/devflow/bin/df-tools.cjs commit "chore(64-03): backfill executor token usage for objectives 58-63 SUMMARYs" --files <every changed SUMMARY path>`
   (take the list from `git diff --name-only -- .planning/objectives`).
5. Idempotence: the dry run again reports `recovered 0`; `git status --short -- .planning/objectives` is empty.
6. Count, over the 41 SUMMARYs of 59-63, `tokens_source: "live"` vs `"backfill"` (one `rg -c` per value over the five
   dirs). Expected 8 live, 33 backfill: record it under `## Forward-stamp gap` as a defect finding (EST-06 stamped 8 of
   41 executor SUMMARYs in the five objectives after the engine shipped).
  </action>
  <verify>The guard printed `bad_count: 0` and `non_summary: []` before the commit; the post-commit dry run reports `recovered 0`; every SUMMARY of 59-63 matches `rg -l '^tokens_input:'` (41 files).</verify>
  <done>All 41 SUMMARYs of 59-63 carry priced-able token data; the backfill commit contains only SUMMARY token lines; the live/backfill split is recorded.</done>
  <recovery>Guard failure: `git restore -- .planning/objectives`, record the guard JSON, stop the task. A SUMMARY of 59-63 still unrecovered after the write: record its id and reason; 64-01 excludes that objective from the cost metric with the id named, so the report stays honest.</recovery>
</task>

<task type="auto">
  <name>Task 3: Audit the actuals — SUMMARY minutes against measured executor transcript spans for 59-63</name>
  <files>none (scratch script in the session scratchpad; evidence recorded in 64-03-SUMMARY.md)</files>
  <action>
Write a scratch script (session scratchpad, not committed) that, for each TRD of objectives 59-63:

```
project = ci.collectProject(repoRoot)                      // SUMMARY minutes, metric fallback, duration_source
index   = tu.indexExecutorTranscripts({root: tu.defaultTranscriptRoot(), repoRoot})
for trd in project.trds where objective_dir starts with 59-..63-:
  t = tu.tokensForTrd(index, {id: trd.id, dir: trd.objective_dir})
  span = t.status === 'recovered' ? sum(ao.transcriptSpanMinutes(x.file) for x in t.transcripts) : null
  row: id, summary_minutes = trd.minutes, duration_source, transcripts = t.transcripts.length, span_minutes = span,
       ratio = summary_minutes / span_minutes
print JSON rows + {trds, with_span, median_ratio, sum_summary, sum_span, outliers: rows with |ratio - 1| > 0.5}
```
Run it with `node <scratchpad>/actuals-audit.cjs /Users/justin/dev/devflow-claude` (pass the main checkout path).
Also compare 63's per-wave measured `actual_minutes` (run state) with the max of the SUMMARY minutes of the TRDs in
that wave.

Record in the SUMMARY under `## Actuals audit`: the 41-row table (id, SUMMARY minutes, source, transcript minutes,
ratio), the totals, the median ratio, the outliers, and the 63 wave comparison. State plainly what it means: a median
ratio near 1 says SUMMARY durations are a fair actual; far from 1 says the minutes comparison (and the calibration
built from the same field) shares that bias.
  </action>
  <verify>The SUMMARY's `## Actuals audit` has 41 rows (or names every TRD without a transcript), a median ratio, an outlier list and the 63 wave comparison; no repository file changed (`git status --short` shows only the SUMMARY being written by the workflow).</verify>
  <done>64-05 can quote how far the SUMMARY durations agree with measured executor time.</done>
  <recovery>If the transcript index cannot identify a TRD (renamed or retention-deleted transcript), record it as `no transcript` and keep going; the audit reports coverage, it does not gate.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- Frozen calibration and 63 run-state hashes recorded and matching; drift listed; 63 reproduction table present.
- `git log -1 --stat` for the backfill commit lists only `*-SUMMARY.md` files; the guard JSON is in the SUMMARY.
- `rg -L '^tokens_input:' .planning/objectives/59-*/*-SUMMARY.md .planning/objectives/6[0-3]-*/*-SUMMARY.md` prints
  nothing (or only ids named as unrecoverable).
- `~/.claude/devflow/calibration.json` sha256 is unchanged at the end (`5cf42c4b…`).
</verification>

<success_criteria>
- The out-of-sample basis is evidenced, not asserted: one frozen calibration older than 59, a reproduced prospective
  estimate for 63, and a named drift list.
- Every executed TRD of 59-63 has the token data its cost actual needs, and the forward-stamp gap is counted.
- The fidelity of the minute actuals is measured.
</success_criteria>

<output>
After completion, create `.planning/objectives/64-estimate-accuracy-validation/64-03-SUMMARY.md` with
`requirements-completed: []` and the sections named in the tasks.
</output>
