---
objective: 67-minutes-recalibration
trd: "04"
type: standard
wave: 3
depends_on: ["67-02", "67-03"]
files_modified:
  - .planning/objectives/67-minutes-recalibration/67-VALIDATION.md
autonomous: true
requirements: [EST-10]
must_haves:
  truths:
    - "The protocol of DECISION-003 (V1-V5) ran exactly once, after the decision's commit (DECISION_SHA is an ancestor of HEAD and no 67-VALIDATION.md existed before this TRD), with no code change, no other method, window, cut, set or rule"
    - "Both positive controls passed before anything was scored: PC1 re-ran 64's pre-59 selection and its JSON hashes to fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516; PC2 rebuilt 64-09's five window-10 cut calibrations with `--minutes task_sum` and the rolling harness reproduced every row of 64-VALIDATION.md section 3 at its printed precision"
    - "The scored data is `git archive DECISION_SHA .planning`; its objective listing has no directory numbered 68-72, and every validation calibration has `method.through_objective` equal to N-1 (at most 65) and a last kept objective at most N-1"
    - "67-VALIDATION.md records the harness output for the old (task_sum) and new (trd_level) methods verbatim, the shipRule result and reason verbatim, `ship_default`, `method_selected` and the frozen method `{minutes: <selected>, window_objectives: 10, through_objective: 66}`; the subsets 46-58, 59-63 and 64-66 are reported as descriptive only"
    - "`~/.claude/devflow/calibration.json` still hashes to 9ef7d108… and no file under ~/.claude was written"
  artifacts:
    - path: .planning/objectives/67-minutes-recalibration/67-VALIDATION.md
      provides: "the once-only validation of DECISION-003: controls, scores, ship rule, selected method (EST-10 SC-1/SC-3 evidence)"
      contains: "ship_default"
  key_links:
    - "DECISION-003 V1-V5 -> calibrate --through N-1 --minutes task_sum|trd_level per cut -> scripts/estimate-rolling-backtest.cjs --old/--new -> shipRule -> 67-VALIDATION.md"
    - "67-VALIDATION.md ship_default / method_selected -> 67-05 (calibrate default) and 67-09 (frozen EST-11 calibration)"
---

# TRD 67-04: Positive controls, then the once-only validation of the frozen method (EST-10)

## Precondition (read first; any failure stops the TRD before anything runs)

1. DECISION_SHA: `git log -1 --format=%H -- .planning/decisions/resolved/DECISION-003.md` (the 67-01 SUMMARY records the
   same SHA). `git merge-base --is-ancestor <DECISION_SHA> HEAD` exits 0.
2. `git log --oneline -- .planning/objectives/67-minutes-recalibration/67-VALIDATION.md` prints nothing (nothing was
   scored before).
3. 67-02 and 67-03 are merged: `rg -n "CALIBRATION_VERSION = 3" plugins/devflow/devflow/bin/lib/calibrator.cjs` and
   `rg -n "KNOWN_MINUTES_METHODS" plugins/devflow/devflow/bin/lib/estimate.cjs` both find a line, and
   `node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs plugins/devflow/devflow/bin/lib/estimate.test.cjs plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs plugins/devflow/devflow/bin/lib/estimate-cli.test.cjs scripts/estimate-window-eval.test.cjs scripts/estimate-rolling-backtest.test.cjs` passes.
4. `shasum -a 256 /Users/justin/.claude/devflow/calibration.json` prints `9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648`.
5. `git status --short plugins scripts` prints nothing. It must print nothing at the end too: this TRD changes no code.

<objective>
Run DECISION-003's validation protocol once. First prove the instruments still measure what they measured for 64 (two
positive controls on the task-sum path). Then score the old method (per-task sum, window 10) against the new one
(TRD-level minutes, window 10) on leave-future-out cuts of objectives 46-66 of the decision commit's snapshot, and let
64's `shipRule` (unchanged code) choose the frozen method. Record everything in 67-VALIDATION.md.

This TRD is the only place the method is scored before EST-11. Nothing here may be re-run with different choices after
a number has been seen.

Purpose: the validation half of SC-1 and the protocol half of SC-3.
Output: 67-VALIDATION.md (via `doc put`), committed.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/decisions/resolved/DECISION-003.md
@.planning/objectives/67-minutes-recalibration/67-01-SUMMARY.md

Read narrowly, for the reproduction commands and the expected numbers:
- `.planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md` section 8 (PC1 commands)
- `.planning/objectives/64-estimate-accuracy-validation/64-VALIDATION.md` sections 1, 3 and 10 (PC2 cuts, expected rows,
  commands)

## Binding rules
- Use the repository df-tools and scripts from the repository root. One plain command per Bash call; loops go in a
  script file you write to `<scratch>` with the Write tool and run as `bash <scratch>/<name>.sh` (one command).
- `<scratch>` is one new directory from `mktemp -d`, outside the repository and outside `~/.claude`. Every `calibrate`
  has `--out <scratch>/…`; the rolling harness's `--json` goes to `<scratch>`. Never write `~/.claude/devflow/calibration.json`.
- **No code change.** If anything in plugins/ or scripts/ looks wrong, stop and report; the fix is a gap closure.
- **Once.** The scoring command (Task 2 step 5) runs once. A re-run is allowed only when the first attempt printed no
  score at all because of a mechanical error (a wrong path, a missing file); record the error and the re-run in the
  SUMMARY. No re-run after any number has been printed.
- Planning writes go through verbs: the validation doc with `planning draft` + Write + `doc put`. Commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Never use port 8080.
</context>

<embedded_context>

<codebase_examples>
64-09's per-cut commands (64-VALIDATION.md section 10), with this objective's flags added:

```
mkdir -p <scratch>/cut-N
git archive --format=tar -o <scratch>/cut-N.tar FIRST^ .planning
tar -xf <scratch>/cut-N.tar -C <scratch>/cut-N
node plugins/devflow/devflow/bin/df-tools.cjs calibrate --paths <scratch>/cut-N --no-overhead --window 10 --minutes task_sum --out <scratch>/pc2-N.json --raw
node scripts/estimate-rolling-backtest.cjs --old 59=<scratch>/pc2-59.json … --old 63=<scratch>/pc2-63.json --json <scratch>/pc2.json --raw > <scratch>/pc2.md
```

FIRST commits: 59 `401a9145`, 60 `05a5b5f4`, 61 `d7b9c938`, 62 `9ad19b1c`, 63 `26e4e57f`.

Expected PC2 rows (64-VALIDATION.md section 3, new method, full precision), per objective
`minutes p50 / P90 / actual, ratio; cost p50 / P90 / actual, ratio`:
- 59: 80.6 / 223.4 / 84, 0.959; 19.0268 / 25.7994 / 23.8786, 0.797
- 60: 91.6 / 214.4 / 74, 1.238; 19.9731 / 28.2953 / 19.7921, 1.009
- 61: 100.6 / 224.9 / 70, 1.437; 25.9458 / 37.5934 / 27.5684, 0.941
- 62: 133.8 / 285.2 / 96, 1.394; 30.3968 / 44.0281 / 45.7525, 0.664
- 63: 78.1 / 171.8 / 112, 0.697; 18.0529 / 27.8531 / 27.1594, 0.665
- summary: minutes median 1.238, pooled 1.112, in band 2, P90 covers 5 of 5 objectives and 40 of 41 TRDs; cost median
  0.797, pooled 0.787, in band 3, P90 covers 4 of 5 objectives and 32 of 41 TRDs; EST-08 `not met`.

`shipRule(oldResult, newResult)` in `scripts/estimate-rolling-backtest.cjs` (64-DIAGNOSIS section 7, unchanged):
ship_default is true when the new verdict is `met`, or when the new agent-minutes median ratio is closer to 1 than the
old (smaller |ln|) and no status (SC2, SC3 × agent minutes, cost) that passes under the old method fails under the new.
</codebase_examples>

<anti_patterns>
- Scoring "just to see" before PC1 and PC2 pass.
- Running a third method, another window, a different eval range or the subsets before the full-set score: the full set
  decides, the subsets only describe.
- Summarising the harness output by hand. Paste the markdown it printed; read JSON numbers from the JSON file.
- Treating `ship_default: false` as a failure of this TRD. Either outcome is a valid result; it selects the fallback.
- Using the repository checkout (`--repo` default) for the scoring: the scored data is the snapshot of DECISION_SHA.
</anti_patterns>

<error_recovery>
- PC1 digest differs: stop. Record both digests and `git log --oneline f02f5536..HEAD -- scripts/estimate-window-eval.cjs
  plugins/devflow/devflow/bin/lib/calibrat* plugins/devflow/devflow/bin/lib/estimate.cjs`. Return the TRD as blocked:
  the harness is defective and nothing is scored (DECISION-003 V3).
- PC2 differs in any cell: stop the same way. Record the differing cells. If only actuals differ, name the commits that
  changed those SUMMARYs (`git log --oneline 34515181..HEAD -- .planning/objectives/59-* …`); V3 still allows no
  exception, so the TRD returns blocked with that evidence for a decision.
- The harness throws `objective <N> not found` for an eval objective: the snapshot lacks it. Check the listing; exclude
  nothing by hand. Return blocked if a listed objective is missing.
- `calibrate` refuses with `no DevFlow project`: the `--paths` value points one level too deep or too shallow; the
  snapshot root is the directory that contains `.planning/`.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Positive controls PC1 and PC2 on the task-sum path (no scoring of the new method)</name>
  <files>(scratch only)</files>
  <action>
1. `mktemp -d` → `<scratch>`. Record the path.
2. PC1 (64-DIAGNOSIS.md section 8): `mkdir -p <scratch>/pre59`; `git archive --format=tar -o <scratch>/pre59.tar
   401a9145^ .planning`; `tar -xf <scratch>/pre59.tar -C <scratch>/pre59`;
   `node scripts/estimate-window-eval.cjs report --snapshot <scratch>/pre59 --eval 46-58 --grid 10,15,20,30,40 --label pre59 --json <scratch>/pc1.json --raw`
   (its markdown on stdout can be discarded); `shasum -a 256 <scratch>/pc1.json` must print
   `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516`.
3. PC2: for each N in 59-63 with its FIRST commit (codebase_examples), make `<scratch>/cut-N` from `git archive FIRST^
   .planning` and run `calibrate --paths <scratch>/cut-N --no-overhead --window 10 --minutes task_sum --out
   <scratch>/pc2-N.json --raw` (write the ten commands into `<scratch>/pc2.sh` and run `bash <scratch>/pc2.sh`). Then
   `node scripts/estimate-rolling-backtest.cjs --old 59=<scratch>/pc2-59.json --old 60=<scratch>/pc2-60.json --old 61=<scratch>/pc2-61.json --old 62=<scratch>/pc2-62.json --old 63=<scratch>/pc2-63.json --json <scratch>/pc2.json --raw`
   with stdout redirected to `<scratch>/pc2.md`.
4. Compare `<scratch>/pc2.json` (`old.objectives` rows and `old.summary`) with the expected rows at their printed
   precision (minutes to 0.1 and ratios to 0.001; cost to 0.0001 and ratios to 0.001; counts exactly). Write the
   comparison as a table in the SUMMARY: expected, got, equal.
5. Each pc2 file has `version: 3` and `method.minutes: 'task_sum'` (a short `node -e` read per file, or one node script
   in `<scratch>`).

If PC1 or PC2 fails: follow error_recovery and stop here. Do not start Task 2.
  </action>
  <verify>
- `shasum -a 256 <scratch>/pc1.json` equals fdf60e66…
- The PC2 comparison table has every cell equal
- `git status --short plugins scripts .planning` prints nothing
  </verify>
  <done>The task-sum path of the v3 calibrator and estimator reproduces 64's selection digest and 64-09's rolling rows
exactly, so any difference in Task 2 comes from the minutes method alone.</done>
</task>

<task type="auto">
  <name>Task 2: Score once: old (task_sum) against new (trd_level) on cuts of 46-66 of the decision snapshot</name>
  <files>(scratch only)</files>
  <action>
1. Snapshot (V1): `mkdir -p <scratch>/snap`; `git archive --format=tar -o <scratch>/snap.tar <DECISION_SHA> .planning`;
   `tar -xf <scratch>/snap.tar -C <scratch>/snap`; `ls <scratch>/snap/.planning/objectives > <scratch>/snap-objectives.txt`;
   leak check `rg -n "^(6[89]|7[0-2])-" <scratch>/snap-objectives.txt` must print nothing (exit 1). Record the number
   of directories and the last one.
2. Eval set: every N from 46 to 66 that has a directory `N-*` in the listing (expected all 21). Record the list.
3. Cuts (V2): write `<scratch>/cuts.sh` running, for each N, from the repository root:
   `node plugins/devflow/devflow/bin/df-tools.cjs calibrate --paths <scratch>/snap --through <N-1> --window 10 --no-overhead --minutes task_sum --out <scratch>/cal-old-N.json --raw`
   and the same with `--minutes trd_level --out <scratch>/cal-new-N.json`. Run `bash <scratch>/cuts.sh`.
4. Cut check (V2, V5): write `<scratch>/check.cjs` that reads every cal file and prints one row per file:
   N, set, `version`, `method.minutes`, `method.window_objectives`, `method.through_objective`,
   `window.projects[0].last`, `samples.trds`, `trd_level.minutes.p50` / `p90`. It exits 1 unless every file has
   version 3, window 10, `through_objective === N-1 <= 65`, the expected minutes method, and a `last` whose objective
   number is at most N-1. Old and new files of the same N must have equal `samples` and `trd_level` (only the method
   differs). Run `node <scratch>/check.cjs`; paste its table into the SUMMARY.
5. Score once (V4): write `<scratch>/score.sh` with the single command
   `node scripts/estimate-rolling-backtest.cjs --old 46=<scratch>/cal-old-46.json … --old 66=<scratch>/cal-old-66.json --new 46=<scratch>/cal-new-46.json … --new 66=<scratch>/cal-new-66.json --repo <scratch>/snap --json <scratch>/score.json --raw`
   with stdout redirected to `<scratch>/score.md`, and run `bash <scratch>/score.sh` once.
6. Read from `<scratch>/score.json` (top-level keys `old`, `new`, `ship`): `old.verdict`, `new.verdict`, `old.summary`,
   `new.summary`, the exclusions of each set, and `ship` (`ship_default`, `reason`, `minutes_median_old`,
   `minutes_median_new`, `improved`, `regressions`).
   `method_selected` is `trd_level` when `ship_default` is true, else `task_sum`.
7. Secondary, descriptive only (V4), after step 6 is recorded: the same harness and the same files over three subsets,
   each into its own markdown file: 46-58 (`<scratch>/sub-46-58.md`), 59-63 and 64-66. These never change
   `method_selected`.
8. `shasum -a 256 /Users/justin/.claude/devflow/calibration.json` is still `9ef7d108…`.
  </action>
  <verify>
- The leak check printed nothing and `node <scratch>/check.cjs` exits 0
- `<scratch>/score.md` and `<scratch>/score.json` exist; the SUMMARY records how many times score.sh ran (1, or 2 with
  the mechanical error named)
- `git status --short plugins scripts` prints nothing
  </verify>
  <done>One score of old against new exists for the full set, with the ship rule's answer, from calibrations that
provably read nothing above N-1.</done>
</task>

<task type="auto">
  <name>Task 3: Write and commit 67-VALIDATION.md</name>
  <files>.planning/objectives/67-minutes-recalibration/67-VALIDATION.md</files>
  <action>
1. `node plugins/devflow/devflow/bin/df-tools.cjs planning draft objectives/67-minutes-recalibration/67-VALIDATION.md`
   prints a draft path; fill it with the Write tool:

   Frontmatter:
   ```yaml
   objective: 67-minutes-recalibration
   type: validation
   requirement: EST-10
   decision: DECISION-003
   decision_sha: <DECISION_SHA>
   eval_objectives: [<the list from Task 2 step 2>]
   harness_control: reproduced
   est08_old: <old.verdict.est08>
   est08_new: <new.verdict.est08>
   minutes_median_old: <ship.minutes_median_old as score.json prints it (3 decimals)>
   minutes_median_new: <ship.minutes_median_new as score.json prints it>
   ship_default: <true|false>
   method_selected: <trd_level|task_sum>
   frozen_method: {minutes: <method_selected>, window_objectives: 10, through_objective: 66}
   generated: <date +%F>
   ```

   Body sections:
   1. **Result in one paragraph**: what ran, the ship rule's answer and reason (verbatim), the selected method, and that
      EST-11 on 68-72 is the real test.
   2. **What ran**: DECISION-003 V1-V5 as executed; the snapshot (DECISION_SHA, directory count, last directory, leak
      check output); the eval list; the cut-check table from Task 2 step 4.
   3. **Positive controls**: PC1 digest; PC2 comparison table (expected, got, equal).
   4. **Old method (task_sum)** and 5. **New method (trd_level)**: the harness markdown for each set from `score.md`,
      verbatim (verdict, executor table, aggregate table, classes, exclusions).
   6. **Ship rule**: the ship block verbatim, `ship_default`, `method_selected`, and the frozen method line.
   7. **Subsets (descriptive only)**: the aggregate tables of 46-58, 59-63 and 64-66, old and new, each labelled
      "descriptive; does not decide".
   8. **Limits**: DECISION-003 V6, plus how many objectives were excluded per metric and why (from the harness).
   9. **Reproduce**: every command of Tasks 1-2 with `<scratch>` placeholders.
2. `node plugins/devflow/devflow/bin/df-tools.cjs doc put objectives/67-minutes-recalibration/67-VALIDATION.md --from <draft> --raw`
3. `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(67-04): validation of the frozen minutes method (EST-10)" --files .planning/objectives/67-minutes-recalibration/67-VALIDATION.md`
  </action>
  <verify>
- `node plugins/devflow/devflow/bin/df-tools.cjs frontmatter get .planning/objectives/67-minutes-recalibration/67-VALIDATION.md --field method_selected`
  prints `trd_level` or `task_sum`, consistent with `ship_default`
- `git log --oneline -- .planning/objectives/67-minutes-recalibration/67-VALIDATION.md` shows exactly one commit, and
  DECISION_SHA is its ancestor (`git merge-base --is-ancestor <DECISION_SHA> <that commit>` exits 0)
- `shasum -a 256 /Users/justin/.claude/devflow/calibration.json` is still `9ef7d108…`
  </verify>
  <done>67-VALIDATION.md is committed with the controls, both scores, the ship rule's answer and the selected method.</done>
</task>

</tasks>

<verification>
- The decision commit precedes the only scoring artifact (SC-1).
- No validation calibration read an objective above N-1 ≤ 65, and the snapshot has no 68-72 (SC-3, protocol half).
- The selected method is the output of the pre-registered rule, not a judgement made after seeing the numbers.
</verification>

<success_criteria>
- PC1 and PC2 reproduced; one score; 67-VALIDATION.md committed with `ship_default` and `method_selected`.
- No code changed; the live calibration untouched.
</success_criteria>

<output>
`.planning/objectives/67-minutes-recalibration/67-04-SUMMARY.md` via `summary post`, `requirements-completed: []`,
with `<scratch>`, the PC tables, the cut-check table, the score run count, `ship_default` and `method_selected`.
</output>
