---
objective: 57-estimation-data-foundation
trd: "06"
type: standard
wave: 3
depends_on: ["57-03", "57-04", "57-05"]
files_modified:
  - plugins/devflow/devflow/bin/lib/tokens-cli.cjs
  - plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
  - plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
autonomous: true
requirements: [EST-07, EST-01]
must_haves:
  truths:
    - "`df-tools tokens backfill` is a dry run by default: it prints recovered and unrecovered counts (by reason) and changes no file"
    - "`df-tools tokens backfill --write` stamps recovered SUMMARYs through summary post; a second --write writes nothing"
    - "`df-tools calibrate` writes ~/.claude/devflow/calibration.json by default; --out and DEVFLOW_CALIBRATION_PATH override it (--out wins)"
    - "Running `df-tools calibrate` twice on unchanged inputs produces byte-identical files and the second run reports changed:false"
    - "`df-tools calibrate --dry-run` builds and reports but writes nothing"
    - "No test writes the real ~/.claude/devflow/calibration.json: spawned runs use a fake HOME or an explicit --out"
    - "Both commands have help entries and dispatch (help.test.cjs and dispatch-completeness.test.cjs pass)"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
      provides: "runCalibrate({argv, cwd, env}) -> {ok, result, text, exit}"
    - path: plugins/devflow/devflow/bin/lib/tokens-cli.cjs
      provides: "runTokens gains the `backfill` subcommand (--write, --force)"
    - path: plugins/devflow/devflow/bin/df-tools.cjs
      provides: "case 'calibrate' + header doc for tokens backfill and calibrate"
  key_links:
    - "df-tools tokens backfill -> tokens-cli.runTokens -> token-backfill.planBackfill/applyBackfill/formatBackfillReport (57-04)"
    - "df-tools calibrate -> calibrate-cli.runCalibrate -> calibrator.buildCalibration/writeCalibration/defaultCalibrationPath (57-05)"
---

# TRD 57-06: CLI: `df-tools tokens backfill` and `df-tools calibrate` (EST-07, EST-01)

<objective>
Expose the two wave-2 libraries as commands:

1. **`df-tools tokens backfill [--write] [--force] [--repo <path>] [--root <dir>] [--raw]`.** Dry run by default.
   `--write` applies. Transcripts are matched against the main checkout (`--repo`, default `resolveMainRoot(cwd)`), and
   SUMMARYs are read and written in the checkout holding cwd (`resolveCheckoutRoot(cwd)`). Exit 0 even when most history
   is unrecoverable; exit 1 only on usage errors or failed writes.
2. **`df-tools calibrate [--paths <dir,dir>] [--out <file>] [--rates <file>] [--dry-run] [--raw]`.** Builds and writes
   calibration.json. The default paths are the checkout holding cwd (or `DEVFLOW_CALIBRATE_PATHS`, `path.delimiter`
   separated). The default output is `DEVFLOW_CALIBRATION_PATH`, else `~/.claude/devflow/calibration.json`.

Purpose: success criteria 2-4 become runnable commands; 57-07 runs them against this repo.
Output: calibrate-cli.cjs (+ test), the backfill subcommand in tokens-cli.cjs, `case 'calibrate'` and two help entries.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(57-06): ...` RED commit before `feat(57-06): ...`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash call.
- Fixtures: `transcript-fixtures.cjs` (57-01) and `calibration-fixtures.cjs` (57-02), plus the literal repos from
  57-03/57-04 tests (copy the builders into these test files if they are not exported; do not import from another
  `*.test.cjs`). No generated data.
- **Every spawned df-tools run sets `HOME` to a fresh temp dir.** Calibrate tests pass `--out` or rely on the fake HOME.
  Never let a test resolve the real home directory.
- Libraries are used as they are: token-backfill.cjs, calibrator.cjs, token-usage.cjs, calibration-inputs.cjs.

## Test list

Outermost first.

calibrate-cli.test.cjs (spawn `df-tools --cwd <dir> calibrate ...`, `HOME=<fakeHome>`):
1. `calibrate --paths <beta> --out <tmp>/c.json` exits 0. The file exists and parses. JSON stdout has `changed:true`,
   `samples.trds` 5 and `out` equal to the path. RED (unknown command).
2. The same command again: the file bytes are identical (Buffer.equals) and stdout has `changed:false`.
3. With no `--out`: the file lands at `<fakeHome>/.claude/devflow/calibration.json`.
4. `DEVFLOW_CALIBRATION_PATH=<tmp>/env.json` with no `--out` writes there. With both, `--out` wins and env.json is not
   created.
5. `--dry-run` exits 0, reports `dry_run:true` and creates no file.
6. With cwd = the beta project and no `--paths`, it calibrates that project (`sources[0].project` = `'beta'`). With cwd =
   an empty temp dir and no `--paths` or `DEVFLOW_CALIBRATE_PATHS`, it exits 1 and stderr names `--paths`.
7. `--rates <fixture rates without claude-opus-5-5>` makes `unpriced_models` include `claude-opus-5-5`. A rates file
   missing `source` exits 1 naming the model.
8. `--raw` prints exactly one line:
   `calibration <out>: changed · 5 TRDs, 7 tasks, 1 with tokens · classes code_tdd 5, doc 1, prompt 1`
   (classes by samples desc, then name; `unchanged` / `dry run` in the second slot as appropriate).
9. `calibrate --help` exits 0, and `calibrate --bogus` exits 1 with the usage line.

tokens-cli.test.cjs (extend; spawn with fake HOME):
10. Fixture repo with one recoverable `99-01` and one `98-01` without a transcript. `tokens backfill --root <projects>`
    exits 0, prints counts (`recovered:1`, `unrecovered:1`, `by_reason.no_transcript:1`) and changes no file.
11. `tokens backfill --write` gives `applied.written` `['99-01']`, and the SUMMARY carries `tokens_source: "backfill"`. A
    second `--write` gives `written: []` and `already_stamped:1`.
12. `--raw` prints the formatBackfillReport lines (2 for a dry run, 3 with `--write`).
13. `tokens backfill --write` where the summary post verb fails (make the objective dir unresolvable, e.g. a SUMMARY
    whose TRD id has no ROADMAP/dir mapping) exits 1 and lists the failure. If this cannot be set up, cover it in-process
    with an injected failing applyBackfill and note it.
14. `--force` is accepted only by `backfill` (`tokens stamp 99-01 --draft x --force` is a usage error), and `--write`
    likewise.
15. help.test.cjs, dispatch-completeness.test.cjs and doc-surfaces.test.cjs pass. The `tokens` help usage now lists
    `backfill`.

<embedded_context>

<codebase_examples>
Dispatcher shape (from 57-03's `case 'tokens'`; mirror it):

```js
case 'calibrate': {
  // df-tools calibrate [--paths a,b] [--out file] [--rates file] [--dry-run] — TRD 57-06
  const { output: outputCalibrate } = require('./lib/helpers.cjs');
  const { runCalibrate } = require('./lib/calibrate-cli.cjs');
  const r = runCalibrate({ argv: args.slice(1), cwd, env: process.env });
  if (!r.ok) error(r.message);
  outputCalibrate(r.result, raw, r.text, r.exit || 0);
  break;
}
```

Library calls:

```js
const cal = require('./calibrator.cjs');
const obj = cal.buildCalibration({ paths, ratesPath });            // throws on a bad rates file
const w = dryRun ? null : cal.writeCalibration(out, obj);          // {path, changed, bytes}
cal.defaultCalibrationPath(env)                                    // env.DEVFLOW_CALIBRATION_PATH || ~/.claude/devflow/calibration.json

const bf = require('./token-backfill.cjs');
const plan = bf.planBackfill({ checkoutRoot, repoRoot, root, force });
const applied = write ? bf.applyBackfill(plan, { checkoutRoot, force }) : null;
bf.formatBackfillReport(plan, applied);
```

calibrate result JSON (keep it small; never the whole calibration object):
`{out, dry_run, changed, samples, classes: {<class>: samples}, sources, data_as_of, inputs_digest, unpriced_models}`.

backfill result JSON: `{checkout, repo, transcripts_root, counts, index_counts, recovered: [ids],
unrecovered: [{id, objective_dir, reason}], applied?: {written, unchanged, skipped, write_failed}}`.
`helpers.output` sends JSON over 50,000 chars to an `@file:` path; with ~390 SUMMARYs this shape stays under that. Do
not add per-entry `fields`.

help.cjs entry shape:

```js
'calibrate': {
  usage: 'df-tools calibrate [--paths <dir[,dir]>] [--out <file>] [--rates <file>] [--dry-run] [--raw]',
  summary: 'Build per-task-class medians/P90s (minutes, tokens, dollars) from SUMMARY frontmatter, STATE_ARCHIVE metrics and model-rates.json into ~/.claude/devflow/calibration.json.',
  mutates: true,
  details: 'Default paths: the checkout holding cwd (or DEVFLOW_CALIBRATE_PATHS). Default out: DEVFLOW_CALIBRATION_PATH, else ~/.claude/devflow/calibration.json. Deterministic: unchanged inputs give a byte-identical file and changed:false.',
},
```
</codebase_examples>

<anti_patterns>
- Resolving `--paths` relative to anything but `cwd`. Spawned tests pass `--cwd`; the dispatcher has already chdir'd.
- Printing the full calibration object to stdout. The file is the artifact; stdout is a summary.
- Making `tokens backfill` exit non-zero because something was unrecoverable.
</anti_patterns>

<error_recovery>
- dispatch-completeness spawns `calibrate` with no args in an empty temp cwd and fake HOME. That must exit 1 with a
  usage-style message ("no DevFlow project ... pass --paths"), not `Unknown command`, and must not write anything.
  Check: it never creates `<fakeHome>/.claude/devflow/calibration.json` when no project resolves.
- help.test.cjs "each usage line starts with df-tools <command>" covers the updated `tokens` usage string too.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/devflow/bin/lib/tokens-cli.cjs
@plugins/devflow/devflow/bin/lib/token-backfill.cjs
@plugins/devflow/devflow/bin/lib/calibrator.cjs
@.planning/objectives/57-estimation-data-foundation/57-05-SUMMARY.md
</context>

<gotchas>
- `DEVFLOW_CALIBRATE_PATHS` uses `path.delimiter` (`:` on macOS/Linux); `--paths` uses commas.
- `resolveCheckoutRoot(cwd)` returns null outside a DevFlow project. Treat null as "no project" for calibrate's default
  paths, and for backfill as a usage error naming `--repo`.
- Known baseline `npm test` failures: stack-drafter-fleet (real fleet) and handoff-e2e MA-7. Anything else is yours.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: `df-tools calibrate` (calibrate-cli.cjs, dispatch, help) with spawn-level determinism tests</name>
  <files>plugins/devflow/devflow/bin/lib/calibrate-cli.cjs, plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs, plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/help.cjs</files>
  <action>
RED: tests 1-9. Commit `test(57-06): df-tools calibrate writes a deterministic calibration.json`.

GREEN: calibrate-cli.cjs `runCalibrate({argv, cwd, env})`. Parse the value flags `--paths`, `--out`, `--rates` and the
bool `--dry-run`; unknown flags and stray positionals are errors with the usage line. Resolve paths (flag, env, or
`[resolveCheckoutRoot(cwd)]`; none → `{ok:false, message:'no DevFlow project at <cwd>; pass --paths <dir[,dir]>'}`)
and out (`--out` relative to cwd > `defaultCalibrationPath(env)`). Build; a thrown rates error becomes `{ok:false}`.
Write unless dry run. Return `{ok:true, result, text}` with the test-8 line as text. Add `case 'calibrate'`, a header-doc
entry under "Estimation data:", and `COMMANDS.calibrate` (codebase_examples).
Commit `feat(57-06): df-tools calibrate`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` passes.</verify>
  <done>Tests 1-9 pass after a recorded RED. Test 2 proves success criterion 4 at the command level.</done>
  <recovery>If test 2 fails, diff the two files: a differing value pinpoints the nondeterministic field; fix it in calibrator.cjs only with a deviation note (57-05 owned it) and a failing calibrator test first.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: `df-tools tokens backfill [--write] [--force]`</name>
  <files>plugins/devflow/devflow/bin/lib/tokens-cli.cjs, plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
RED: tests 10-15. Commit `test(57-06): tokens backfill is a dry run unless --write`.

GREEN: in runTokens add the `backfill` subcommand, with bool flags `--write` and `--force` (rejected for `trd` and
`stamp`). `checkoutRoot = resolveCheckoutRoot(cwd)`; `repoRoot = --repo || resolveMainRoot(cwd)`;
`root = --root || defaultTranscriptRoot()`. Plan, apply on `--write`, and return the compact JSON from codebase_examples
with `formatBackfillReport` as text. `exit: 1` when `applied.write_failed.length`. Update `COMMANDS.tokens` usage to
`df-tools tokens <trd <trd-id> | stamp <trd-id> --draft <path> | backfill [--write] [--force]> [--objective-dir <dir>] [--repo <path>] [--root <dir>] [--raw]`
and its details (backfill is a dry run by default). Add `tokens backfill` to the df-tools.cjs header doc.
Commit `feat(57-06): df-tools tokens backfill`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs` passes.</verify>
  <done>Tests 10-15 pass after a recorded RED; the 57-03 tokens tests still pass.</done>
  <recovery>If test 13's failure setup is impossible through the real verb, inject: export a `_deps` object from tokens-cli (`{applyBackfill}`) that the in-process test swaps, mirroring the `_setRunFs` test-hook convention in trd-tdd.cjs; restore it in `finally`.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs plugins/devflow/devflow/bin/lib/tokens-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- Success criterion 2 (command): `tokens backfill` reports recovered/unrecovered counts, dry run by default.
- Success criterion 3 (command): `calibrate` writes `~/.claude/devflow/calibration.json` (proven against a fake HOME).
- Success criterion 4 (command): two runs, identical bytes, `changed:false`.
</verification>

<success_criteria>
- Both commands are dispatched, documented in help, and covered by spawn-level tests that never touch the real home.
- Full `npm test` shows no failures beyond the two known baseline ones.
</success_criteria>

<output>
After completion, publish `57-06-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record both usage lines and the `--raw` formats. Before posting, stamp your own draft with the
repo copy (the runtime mirror predates `tokens`):
`node plugins/devflow/devflow/bin/df-tools.cjs tokens stamp 57-06 --draft <your draft path>`.
</output>
