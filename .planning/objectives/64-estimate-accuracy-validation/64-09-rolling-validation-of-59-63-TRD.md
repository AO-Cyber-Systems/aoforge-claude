---
objective: 64-estimate-accuracy-validation
trd: "09"
type: standard
wave: 7
depends_on: ["64-08"]
files_modified:
  - .planning/objectives/64-estimate-accuracy-validation/64-VALIDATION.md
autonomous: true
requirements: [EST-08]
gap_closure: true
must_haves:
  truths:
    - "The protocol run is exactly the one frozen in 64-DIAGNOSIS.md section 6: for each of 59-63 the data is `git archive <first commit>^ .planning`, the old method is `calibrate --no-overhead --window all`, the new method is the same with the frozen `window_objectives`, nothing else is run, and no repository code, window, cut or rule changes in this TRD"
    - "A positive control comes first: the old-method rolling rows reproduce 64-05's published rolling table to its printed digits (per-objective minutes and cost p50/P90 and ratios, and the aggregate medians and pooled ratios); if they do not, nothing is scored and the harness is reported defective"
    - "The new method is scored once through `scripts/estimate-rolling-backtest.cjs`: five objectives, each estimated from its own cut calibration, judged by `buildBacktest` with the unchanged constants; its `est08` is the EST-08 verdict of the new method, and `shipRule` decides `ship_default`"
    - "64-VALIDATION.md records the control, the verdict block, the per-objective old against new ratios, the flagged classes, the window block of each new calibration, the ship rule output, objective 63's prospective wall estimate unchanged (run state sha256 08f88f9f…), and the limits (five objectives, leave-future-out reconstruction, prospective confirmation still needed)"
    - "`~/.claude/devflow/calibration.json` is not written (hash 5cf42c4b… before and after), the frozen calibration copy and the run history are not deleted, and the extracted snapshots are removed at the end"
  artifacts:
    - path: .planning/objectives/64-estimate-accuracy-validation/64-VALIDATION.md
      provides: "the recorded result of the pre-registered validation: est08, ship_default, tables and the control"
  key_links:
    - "64-DIAGNOSIS.md (window_objectives, protocol, ship rule) -> calibrate --window per cut -> scripts/estimate-rolling-backtest.cjs --old/--new -> 64-VALIDATION.md"
    - "64-VALIDATION.md `est08` and `ship_default` -> 64-10 (ship decision, report, REQUIREMENTS status)"
---

# TRD 64-09: Run the pre-registered rolling validation on objectives 59-63 (EST-08, gap closure)

## Precondition (read first)

1. `node plugins/devflow/devflow/bin/df-tools.cjs frontmatter get .planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md --field decision`.
   `stop`: change nothing; write `64-09-SUMMARY.md` saying this TRD was skipped by the pre-registered stop rule, with
   `requirements-completed: []`. `build_window`: continue, and read `window_objectives` (call it W).
2. `git log --format=%h -- .planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md` lists exactly one commit
   and `git status --short .planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md` prints nothing: the
   frozen document has not been edited.
3. `node plugins/devflow/devflow/bin/df-tools.cjs calibrate --window 0` exits 1 (the flag from 64-08 exists) and
   `git status --short plugins scripts` prints nothing (the code is committed and will not change here).
4. Hashes: `shasum -a 256 ~/.claude/devflow/calibration.json ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`
   both print `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`; and
   `shasum -a 256 ~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/63-2026-10-06T23_55_36_062Z.json`
   prints `08f88f9f9a108e10e6804603bb900f37145258415005d858cfac131fa664fdee`. Any other value: stop and report.

<objective>
This TRD is the honest test. Everything that could be tuned was fixed before it: the window in 64-DIAGNOSIS.md (chosen on
pre-59 data), the protocol and the ship rule in the same committed document, the calibrate flag and the scoring harness in
64-08. Here the frozen protocol runs once.

For each objective N in 59-63 the calibration is built from the repository exactly as it stood before N's first commit
(leave-future-out), twice: the old method (`--window all`, which is today's calibrate) and the new method
(`--window W`). The harness estimates each objective from its own calibration and judges the five with `buildBacktest`.
Two outputs matter: the **new method's `est08`** (the EST-08 verdict) and **`ship_default`** (whether 64-10 makes the window
the default). A positive control comes first: the old method must reproduce what 64-05 printed, which proves the harness
before it scores anything new.

**A failed result is a valid outcome.** If the new method does not make EST-08 `met`, the verdict stays not met and 64-10
records it. Do not try another window, another cut or another rule. Five objectives is a small sample (see the noise floor in
64-DIAGNOSIS.md section 5); a pass is not proof and a fail is not proof of a bad window. True prospective confirmation needs
the next five objectives, which 64-02's run history now records.

Purpose: the out-of-sample answer to EST-08 for the fixed method, on evidence anyone can rerun.
Output: `64-VALIDATION.md` with `est08` and `ship_default` in its frontmatter.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Use the **repository** df-tools and scripts (`node plugins/devflow/devflow/bin/df-tools.cjs …`, `node scripts/…`); the mirror
  lacks `backtest` and `--window`. One plain command per Bash call; redirect output to files in the scratchpad (`<scratch>`).
- **No code changes.** `git status --short plugins scripts` prints nothing at the start and at the end. If something is
  wrong with the harness, stop and report; fixing it is a new TRD, and the protocol would then be re-run from the start by
  that TRD's author, with the reason on record.
- **Never write `~/.claude/devflow/calibration.json`**: every `calibrate` here has `--out <scratch>/…`. Never delete
  `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json` or anything under `~/.claude/devflow/state/estimates/history/`.
- **One shot.** Run each command of the protocol once. A command that fails for an infrastructure reason (a path, a tar error)
  is repeated unchanged after the path is fixed. Never change W, a cut, the old/new definition or the rule after seeing a result.
- Planning writes go through verbs: the doc with `planning draft` + Write + `doc put`. Never Write or Edit a file under
  `.planning/` directly. Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Never use port 8080.

<embedded_context>

<codebase_examples>
First commit per objective (cutoff = `<first>^`), from 64-05: 59 `401a9145`, 60 `05a5b5f4`, 61 `d7b9c938`, 62 `9ad19b1c`,
63 `26e4e57f`. Verify each with `git log --reverse --format=%h -- .planning/objectives/<N>-*` (first line) only if a value
looks wrong, and record any substitution.

Leak check per cut, on a listing redirected to `<scratch>/cut-N-objectives.txt`, then `rg -n "<pattern>" <that file>` must
print nothing: 59 `^(59|6[0-3])-`, 60 `^(60|6[1-3])-`, 61 `^(61|6[23])-`, 62 `^(62|63)-`, 63 `^63-`.

Positive control: 64-05's rolling table (old method, per objective, executor metrics, printed precision):

| Obj | Agent min p50 / P90 | Ratio | Cost p50 / P90 | Ratio |
|---|---|---|---|---|
| 59 | 108.4 / 334.3 | 1.291 | $20.04 / $28.48 | 0.839 |
| 60 | 99.8 / 288.0 | 1.348 | $21.19 / $29.63 | 1.071 |
| 61 | 123.0 / 383.9 | 1.758 | $27.37 / $39.61 | 0.993 |
| 62 | 141.6 / 403.9 | 1.475 | $29.13 / $41.16 | 0.637 |
| 63 | 82.8 / 294.1 | 0.739 | $19.43 / $29.51 | 0.715 |

Aggregate, old method: agent minutes median ratio 1.348, pooled 1.274, 2 of 5 in band, P90 covers 5 of 5 objectives and 40 of
41 TRDs (SC2 fail, SC3 pass); cost median 0.839, pooled 0.813, 4 of 5 in band, P90 covers 4 of 5 objectives and 32 of 41 TRDs
(SC2 pass, SC3 fail); `EST-08: not met`. The calibration sizes were 324, 331, 338, 347 and 358 TRDs.

Objective 63's wall row (from 64-ACCURACY-REPORT.md, frozen-calibration run; reported, never judged): estimate p50 / P90
1h 37m / 4h 50m, actual 1h 51m, ratio 0.87, within P90, `Reproduced yes`.

64-VALIDATION.md skeleton (fill from the runs; factual and short):

```markdown
---
objective: 64-estimate-accuracy-validation
type: validation
requirement: EST-08
window_objectives: <W>
harness_control: reproduced | failed
est08: met | not met | not scored
ship_default: true | false | not scored
generated: <YYYY-MM-DD>
---

# Objective 64: pre-registered rolling validation of the recency window (59-63)

## 1. What ran                  <the protocol V1-V5 of 64-DIAGNOSIS.md section 6, with the cuts, W and the commands run once>
## 2. Positive control          <old-method rows against 64-05's table; reproduced or failed, with the differences if any>
## 3. Result: new method        <the harness verdict block for the new set, unedited; the five per-objective rows>
## 4. Before and after          <table: objective | minutes ratio old / new | cost ratio old / new; aggregate lines for old and new; frozen-calibration primary of 64-05 for reference>
## 5. Classes                   <flagged classes of the new set against the old set>
## 6. Ship rule                 <the harness `Ship default` line and the shipRule fields: improved, regressions, reason>
## 7. Windows built             <per new calibration: samples, the `window` block (first, last, dropped TRDs)>
## 8. Prospective point         <63's wall estimate unchanged: run state sha256, the wall row, Reproduced yes>
## 9. Limits                    <five objectives and the noise floor; today's code on old data; the window was chosen on 46-58 with weak support; confirmation needs the next five objectives, run history from 64-02>
## 10. Reproduce                <commands with scratch placeholders>
```
</codebase_examples>

<anti_patterns>
- Do not run any window other than the frozen W, and do not run `--window` values "to see".
- Do not present the new run's `Reproduced` flag of the wall row: only the frozen-calibration run reproduces what was shown live.
- Do not edit 64-DIAGNOSIS.md, the harness, the library or any threshold; do not report a number the harness did not print.
- Do not delete the scratch JSON/markdown before the doc is written; do not commit scratch files.
</anti_patterns>

<error_recovery>
- `git archive` fails for a cutoff: confirm the commit with `git rev-parse <first>^`; if the first commit of an objective is
  wrong (a docs commit earlier than the one in the table), take the earliest commit touching `.planning/objectives/<N>-*`,
  record the substitution, and apply it to BOTH methods.
- `calibrate` exits non-zero on a cut ("no DevFlow project found"): the tar did not extract `.planning/objectives`; re-extract once.
- The positive control does not reproduce: `harness_control: failed`, `est08: not scored`, `ship_default: not scored`; write
  the doc (sections 1, 2, 9, 10), commit it, and report the differing rows to the orchestrator. Do not score the new set.
- `doc put` refuses: read the message, re-run `planning draft` for the exact rel path, correct the draft, run it again.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md
@.planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md
@.planning/objectives/64-estimate-accuracy-validation/64-05-SUMMARY.md
</context>

<gotchas>
- `git archive` takes a tree-ish: `git archive --format=tar -o <scratch>/cut-59.tar 401a9145^ .planning`, then
  `tar -xf <scratch>/cut-59.tar -C <scratch>/cut-59` (create the directory first). Separate commands, no pipe.
- The cuts hold only the token fields stamped at that moment (59 and 60 have none): that is part of the protocol.
- The harness estimates TRDs from the real repository (`--repo`, default cwd): the TRDs as executed, the same input 64-05 used.
- A new-method calibration whose window dropped nothing has no `window` key; for 59-63 with W below the history length it
  will have one. Record each.
- `shipRule` is code from 64-08: quote its output, do not recompute it by hand.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Build the five cuts and both calibration sets, then the positive control on the old method</name>
  <files>none (scratchpad snapshots, calibrations and JSON; numbers recorded in 64-09-SUMMARY.md)</files>
  <action>
For N in 59, 60, 61, 62, 63 with FIRST from codebase_examples (one command per Bash call):

1. `mkdir -p <scratch>/cut-N`
2. `git archive --format=tar -o <scratch>/cut-N.tar FIRST^ .planning`
3. `tar -xf <scratch>/cut-N.tar -C <scratch>/cut-N`
4. `ls <scratch>/cut-N/.planning/objectives` redirected to `<scratch>/cut-N-objectives.txt`, then the leak-check `rg` (prints nothing).
5. `node plugins/devflow/devflow/bin/df-tools.cjs calibrate --paths <scratch>/cut-N --no-overhead --window all --out <scratch>/cal-old-N.json --raw`
6. `node plugins/devflow/devflow/bin/df-tools.cjs calibrate --paths <scratch>/cut-N --no-overhead --window W --out <scratch>/cal-new-N.json --raw`

Record each calibrate summary line (TRDs, tasks, with tokens; the new one also its window) in the SUMMARY.

Positive control: `node scripts/estimate-rolling-backtest.cjs --old 59=<scratch>/cal-old-59.json --old 60=<scratch>/cal-old-60.json --old 61=<scratch>/cal-old-61.json --old 62=<scratch>/cal-old-62.json --old 63=<scratch>/cal-old-63.json --json <scratch>/roll-old.json --raw`
redirected to `<scratch>/roll-old.md`. Compare, at the printed precision of 64-05's table, every per-objective minutes and cost
p50/P90 and ratio, the calibration sizes (324, 331, 338, 347, 358 TRDs) and the aggregate figures and verdicts in codebase_examples.
Record the comparison (a small table: expected, observed, equal yes/no) and set `harness_control`. If any figure differs, follow
error_recovery and do NOT run Task 2's scoring.
  </action>
  <verify>Five `cal-old-N.json` and five `cal-new-N.json` exist; every leak check printed nothing; `roll-old.json` parses and `verdict.est08` is `not met`; the control table has no `no` rows (or `harness_control: failed` is recorded and Task 2 is not scored); `shasum -a 256 ~/.claude/devflow/calibration.json` is `5cf42c4b…`.</verify>
  <done>The harness reproduces 64-05's published old-method rolling result (or is reported defective) before the new method is scored.</done>
  <recovery>See error_recovery. The task changes no repository file.</recovery>
</task>

<task type="auto">
  <name>Task 2: Score the new method once, apply the ship rule, record 64-VALIDATION.md and commit</name>
  <files>.planning/objectives/64-estimate-accuracy-validation/64-VALIDATION.md</files>
  <action>
Only when the control reproduced.

1. Score, once: `node scripts/estimate-rolling-backtest.cjs --old 59=<scratch>/cal-old-59.json … --old 63=<scratch>/cal-old-63.json --new 59=<scratch>/cal-new-59.json … --new 63=<scratch>/cal-new-63.json --json <scratch>/roll-both.json --raw`
   redirected to `<scratch>/roll-both.md`. The new set's `verdict.est08` is the EST-08 verdict of the new method; the
   `Ship default:` line and the `ship` object are the ship rule's output. Do not re-run with any other argument.
2. Windows built: `rg -n -A 12 '"window"' <scratch>/cal-new-59.json` (and 60-63) to record each `window` block, redirected to a scratch file if long.
3. Prospective point: `shasum -a 256 ~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/63-2026-10-06T23_55_36_062Z.json`
   is `08f88f9f…`; `node plugins/devflow/devflow/bin/df-tools.cjs estimate backtest 63 --calibration ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json --raw`
   (read-only, frozen calibration) redirected to `<scratch>/wall-63.md`: its wall row equals the one in codebase_examples.
4. Write `64-VALIDATION.md` to the skeleton: `node plugins/devflow/devflow/bin/df-tools.cjs planning draft objectives/64-estimate-accuracy-validation/64-VALIDATION.md`,
   Write the printed draft path, then `doc put objectives/64-estimate-accuracy-validation/64-VALIDATION.md --from <draft>`. Frontmatter
   `est08` and `ship_default` are copied from the harness output, `window_objectives` from 64-DIAGNOSIS.md. Sections 3 and 4 quote
   `<scratch>/roll-both.md` without editing a number; section 9 states the limits in the skeleton, including the noise floor
   from 64-DIAGNOSIS.md section 5.
5. Read back: `node plugins/devflow/devflow/bin/df-tools.cjs frontmatter get .planning/objectives/64-estimate-accuracy-validation/64-VALIDATION.md --field est08`
   and `--field ship_default`.
6. Commit: `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(64-09): pre-registered rolling validation of the recency window on objectives 59-63 (EST-08 <met|not met>)" --files .planning/objectives/64-estimate-accuracy-validation/64-VALIDATION.md`.
7. Clean up: `rm -rf <scratch>/cut-59 <scratch>/cut-60 <scratch>/cut-61 <scratch>/cut-62 <scratch>/cut-63` and the five tars
   (keep the calibration, JSON and markdown files). `git status --short plugins scripts` prints nothing;
   `shasum -a 256 ~/.claude/devflow/calibration.json` is `5cf42c4b…`.
  </action>
  <verify>`frontmatter get … --field est08` prints `met` or `not met` and `--field ship_default` prints `true` or `false`; the doc has sections 1-10 and its tables quote `<scratch>/roll-both.md`; `git show --stat HEAD` lists only the doc; `git status --short plugins scripts` is empty; the live calibration hash is unchanged.</verify>
  <done>The EST-08 verdict of the new method, the ship decision input and the full before/after evidence are committed, from one command, with the control and the limits.</done>
  <recovery>If `doc put` fails, see error_recovery. If the scoring command itself errors (not a different number), repeat it unchanged after fixing the path; if it errors because the harness is wrong, stop, set `est08: not scored`, and report.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `rg -n "^est08:|^ship_default:|^harness_control:|^window_objectives:" .planning/objectives/64-estimate-accuracy-validation/64-VALIDATION.md` shows the recorded fields.
- The control table in the doc shows 64-05's old-method figures reproduced; the verdict block is the harness output, unedited.
- `~/.claude/devflow/calibration.json` and the frozen copy hash to `5cf42c4b…`; `git status --short plugins scripts` prints nothing; no scratch file is committed (`git show --stat HEAD`).
</verification>

<success_criteria>
- The fixed method has one honest, rerunnable out-of-sample score on 59-63, with its old-method control.
- `est08` and `ship_default` are recorded from tested code, not by hand.
</success_criteria>

<output>
After completion, create `.planning/objectives/64-estimate-accuracy-validation/64-09-SUMMARY.md` with
`requirements-completed: []` (64-10 decides EST-08). Quote the `est08`, `ship_default`, both medians and the control result.
</output>
