---
objective: 67-minutes-recalibration
trd: "05"
type: standard
wave: 4
depends_on: ["67-04"]
files_modified:
  - plugins/devflow/devflow/bin/lib/calibrator.cjs
  - plugins/devflow/devflow/bin/lib/calibrator.test.cjs
  - plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
  - plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - CLAUDE.md
autonomous: true
requirements: [EST-10]
must_haves:
  truths:
    - "`DEFAULT_MINUTES_METHOD` equals 67-VALIDATION.md's `method_selected`: `trd_level` only when `ship_default` is true, otherwise it stays `task_sum`, and a test pins the value to the validation's answer"
    - "A test asserts `estimate.KNOWN_MINUTES_METHODS` deep-equals `calibrator.MINUTES_METHODS`, so the calibrator and the estimator cannot disagree on the methods"
    - "After any default change, 64's pre-59 selection still hashes to fdf60e66… (the selection script is pinned to task_sum)"
    - "CHANGELOG [Unreleased], docs/USER-GUIDE.md (Estimation data, Estimates) and CLAUDE.md (Estimation data bullet) describe `calibrate --minutes` and `--through`, calibration version 3 and its `method` block, how `estimate` names the method, the validation result with its numbers taken from 67-VALIDATION.md, and the rule that the EST-11 calibration is frozen until objective 75; help.cjs `estimate` details mention trd_level minutes"
    - "`npm test` passes apart from failures shown to be pre-existing, and the doc reference tests pass"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/calibrator.cjs
      provides: "DEFAULT_MINUTES_METHOD set by the pre-registered ship rule"
      contains: "DEFAULT_MINUTES_METHOD"
    - path: CHANGELOG.md
      provides: "objective 67 entries under [Unreleased]"
      contains: "--through"
    - path: docs/USER-GUIDE.md
      provides: "the method, the cutoff and the frozen EST-11 calibration, documented"
      contains: "through_objective"
  key_links:
    - "67-VALIDATION.md ship_default -> DEFAULT_MINUTES_METHOD -> calibrate with no --minutes"
    - "CHANGELOG [Unreleased] -> 67-06 promotes it to [2.15.0]"
---

# TRD 67-05: Act on the ship rule, then document the method (EST-10)

## Precondition (read first)

- `node plugins/devflow/devflow/bin/df-tools.cjs frontmatter get .planning/objectives/67-minutes-recalibration/67-VALIDATION.md --field ship_default`
  prints `true` or `false` (SHIP), and `--field method_selected` prints `trd_level` or `task_sum` (SELECTED). They must
  agree (true ↔ trd_level). If the file is missing, stop: 67-04 did not finish.
- `git log --oneline -- .planning/objectives/67-minutes-recalibration/67-VALIDATION.md` shows exactly one commit. Read
  the validation's numbers from the file; do not recompute anything.

<objective>
Apply the validation's answer and nothing else: if the pre-registered ship rule returned `ship_default: true`, the
`calibrate` default minutes method becomes `trd_level` (as 64-10 made the window the default); if it returned false, the
default stays `task_sum` and `--minutes trd_level` stays opt-in. Either way, add the cross-module test that keeps the
estimator's and the calibrator's method lists equal, and document the objective so the release (67-06) can promote it.

Purpose: SC-2's default behaviour and the documentation the release carries.
Output: at most a one-constant code change with its tests; CHANGELOG, USER-GUIDE, CLAUDE.md and help text.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/67-minutes-recalibration/67-VALIDATION.md
@.planning/decisions/resolved/DECISION-003.md

## Binding rules
- Use the repository df-tools. One plain command per Bash call.
- Change nothing that 67-VALIDATION.md did not decide. No new validation run, no re-scoring, no other method.
- Never write `~/.claude/devflow/calibration.json` (67-09 builds the frozen one with the installed runtime).
- Strict TDD for the code change (RED, then GREEN). Hand-built fixtures only.
- Every number in the docs comes from 67-VALIDATION.md or DECISION-003, quoted at the precision they print.
- CLAUDE.md is resident on every turn: add at most two sentences to its Estimation data bullet, no new section.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Never use port 8080.
</context>

<embedded_context>

<codebase_examples>
64-10 made the window the default the same way: one constant, a test pinning it to the frozen value, and the selection
script kept on the old behaviour:

```js
// calibrator.cjs (64-10)
const DEFAULT_WINDOW_OBJECTIVES = 10;
// calibrator.test.cjs
test('1: DEFAULT_WINDOW_OBJECTIVES is the window frozen in 64-DIAGNOSIS.md', () => {
  assert.equal(DEFAULT_WINDOW_OBJECTIVES, 10);
});
```

Doc anchors:
- `docs/USER-GUIDE.md` `### Estimation data (`df-tools tokens`, `df-tools calibrate`)` (about line 257: the command
  block lists `calibrate --window <N|all>`; the `calibrate` bullet about line 275) and `### Estimates (`df-tools
  estimate`)` (the **Method.** bullet about line 305 and **What is assumed.** about line 313).
- `CLAUDE.md` line ~64, the `- **Estimation data** (Unreleased)` bullet: it lists `calibrate [--paths] [--out] [--rates]
  [--window <N|all>] [--dry-run]` and ends the EST-08 sentence with "not prospective".
- `CHANGELOG.md` `## [Unreleased]` opens with "Objective 66 (EST-09, forward-stamp coverage). Entries that need an
  installed plugin take effect once the installed plugin carries objective 66; the 2.14.0 runtime has none of them."
</codebase_examples>

<anti_patterns>
- Flipping the default when `ship_default` is false "because trd_level looks better" in the subsets. The subsets never
  decide.
- Writing "fixed" or "met" about EST-08 or EST-11. EST-10 is the method; EST-11 is scored by objective 75.
- Rewriting the 64 paragraphs in USER-GUIDE "What is assumed." Append the 67 result after them; the history stays.
- Removing the 66 entries from [Unreleased]: 67's entries are added beside them.
</anti_patterns>

<error_recovery>
- After a default flip, `scripts/estimate-window-eval.test.cjs` or PC1 changes: the 67-02 pin is missing at a call site.
  Add `minutes: 'task_sum'` there (it is a pin, not a behaviour change) and re-run PC1.
- `doc-refs.repo.test.cjs` flags a new command reference: the reference must be a real `df-tools` form; fix the doc text.
</error_recovery>

</embedded_context>

## Test list (Task 1)

1. `estimate.KNOWN_MINUTES_METHODS` deep-equals `calibrator.MINUTES_METHODS` (new test in `calibrator.test.cjs`, requiring
   `./estimate.cjs`). Passes in both branches.
2. SHIP true only: `DEFAULT_MINUTES_METHOD` is `'trd_level'`, "the method DECISION-003 froze and 67-VALIDATION.md
   shipped"; a default build of the 67-02 `pastSpec()` fixture has `method.minutes` `trd_level`; the spawned
   `calibrate --no-overhead --out <tmp>` with no `--minutes` writes `method.minutes` `trd_level`, byte-identical to
   `--minutes trd_level`, and `--minutes task_sum` differs. The 67-02 tests that asserted the `task_sum` default
   (test 7's default identity, test 13's constant, test 17's byte-identity) change to the new default: list each.
2'. SHIP false only: a test pins `DEFAULT_MINUTES_METHOD` to `'task_sum'` with the message "67-VALIDATION.md
   ship_default false: trd_level stays opt-in".

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Set the calibrate default from the ship rule and pin the method lists together</name>
  <files>plugins/devflow/devflow/bin/lib/calibrator.cjs, plugins/devflow/devflow/bin/lib/calibrator.test.cjs, plugins/devflow/devflow/bin/lib/calibrate-cli.cjs, plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs</files>
  <action>
Write test 1 and run it (it should pass already if 67-02 and 67-03 agree; if it fails, the two lists differ: stop and
report, because 67-04 scored with them).

SHIP true: write test 2 (RED: the default is still `task_sum`), change `DEFAULT_MINUTES_METHOD` to `'trd_level'` with the
comment "set by 67-VALIDATION.md (ship_default true, DECISION-003 V4)", update the calibrate-cli header comment
("default `task_sum`" → "default `trd_level` since objective 67"), make the deliberate test changes, GREEN. Then re-run
PC1 from the repository root: `git archive --format=tar -o <scratch>/pre59.tar 401a9145^ .planning`, extract to
`<scratch>/pre59`, `node scripts/estimate-window-eval.cjs report --snapshot <scratch>/pre59 --eval 46-58 --grid 10,15,20,30,40 --label pre59 --json <scratch>/pc1.json --raw`,
`shasum -a 256 <scratch>/pc1.json` = `fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516`.

SHIP false: write test 2' (it passes at once: say so in the SUMMARY; it is a pin, not a RED/GREEN pair). Change no
constant.

Run `node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs scripts/estimate-window-eval.test.cjs`.
  </action>
  <verify>
- `rg -n "DEFAULT_MINUTES_METHOD = '(trd_level|task_sum)'" plugins/devflow/devflow/bin/lib/calibrator.cjs` shows the value SELECTED
- The three test files pass; under SHIP true the PC1 digest equals fdf60e66…
- `shasum -a 256 /Users/justin/.claude/devflow/calibration.json` is still `9ef7d108…`
  </verify>
  <done>The default is what the pre-registered rule chose, and the two method lists are tied by a test.</done>
</task>

<task type="auto">
  <name>Task 2: CHANGELOG, USER-GUIDE, CLAUDE.md and help text; full suite</name>
  <files>CHANGELOG.md, docs/USER-GUIDE.md, CLAUDE.md, plugins/devflow/devflow/bin/lib/help.cjs</files>
  <action>
1. CHANGELOG `## [Unreleased]`: extend the opening paragraph to name objective 67 ("Objectives 66 (EST-09,
   forward-stamp coverage) and 67 (EST-10, minutes recalibration). …the 2.14.0 runtime has none of them, and it refuses
   a version 3 calibration.") and add, beside the 66 entries:
   - Added: `calibrate --minutes <task_sum|trd_level>` and `--through <N>` (objective 67, EST-10): the method block of
     calibration version 3 (`method: {minutes, window_objectives, through_objective}`, the requested parameters, inside
     `inputs_digest`); `--through` drops objectives numbered above N, and their STATE_ARCHIVE and state.json metric
     rows, before anything is read or counted.
   - Changed: the estimator reads calibration versions 1-3; with `method.minutes: trd_level` a TRD's minutes are the
     calibration's `trd_level.minutes` distribution whatever its task count (tokens and cost stay the per-task sum);
     every `estimate` result, the run state and the text name the minutes method; the default minutes method is
     SELECTED (one sentence on the ship rule's answer with the two medians from 67-VALIDATION.md).
2. USER-GUIDE Estimation data: add `calibrate --minutes <task_sum|trd_level>` and `calibrate --through <N>` lines to
   the command block, and to the `calibrate` bullet a sentence on version 3 and the `method` block. Estimates: in
   **Method.**, one sentence on trd_level minutes; after **What is assumed.**'s last sentence, a short paragraph
   "**Objective 67 (EST-10).**" with: the method and why (DECISION-003, one sentence), the validation (eval set, the
   two medians, `ship_default`, the selected method, from 67-VALIDATION.md), the limits (not blind to ≤63; EST-11 on
   68-72 is the prospective test), and the freeze rule: "The EST-11 calibration is built once by the installed
   runtime with `--through 66` (objective 67) and must not be rebuilt until objective 75 has scored 68-72; 75 compares
   each run state's `calibration.inputs_digest` with it." Also replace the sentence "The window needs a release and a
   runtime re-sync before the installed … has `--window` and `estimate backtest`." with a true one (2.14.0 has them).
3. CLAUDE.md Estimation data bullet: add `--minutes <task_sum|trd_level>` and `--through <N>` to the `calibrate`
   flag list, change "calibration version 2 adds `agent_overhead` and `objective_level`" to also say "version 3 adds
   the `method` block", and append one sentence: "Objective 67 froze the minutes method for EST-11 (DECISION-003:
   <SELECTED>, window 10, through 66; validation in `67-VALIDATION.md`)."
4. help.cjs `estimate` details: one sentence: "A version 3 calibration names its minutes method; with `trd_level` a
   TRD's minutes come from the calibration's TRD-level history, not the sum of its tasks, and every result carries
   `calibration.method`."
5. Checks: `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs`;
   `node plugins/devflow/devflow/bin/df-tools.cjs validate docs --raw`; then `npm test` (this TRD runs alone in its wave,
   in the main checkout). Record total/pass/fail/skipped. Allowed failures: `roadmap-reconcile.test.cjs` E2E1 while
   this TRD's SUMMARY exists and its ROADMAP box is unticked; anything else must be fixed or shown failing identically
   at the wave base commit.
6. Commit the docs: `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(67-05): document the minutes method, the cutoff and the EST-11 freeze" --files CHANGELOG.md docs/USER-GUIDE.md CLAUDE.md plugins/devflow/devflow/bin/lib/help.cjs`
  </action>
  <verify>
- `rg -n -- "--through" CHANGELOG.md docs/USER-GUIDE.md CLAUDE.md` finds each file
- `rg -n "through_objective" docs/USER-GUIDE.md` finds the method block description
- Each number in the new doc text is present in 67-VALIDATION.md (`rg -n -F '<number>' .planning/objectives/67-minutes-recalibration/67-VALIDATION.md` per number; list them in the SUMMARY)
- The doc tests pass, `validate docs` reports no issue, `npm test` passes apart from the allowed failure
  </verify>
  <done>The release carries accurate documentation of the method, the cutoff, the validation and the freeze rule.</done>
</task>

</tasks>

<verification>
- The default equals the pre-registered rule's answer (SC-2 default behaviour); the method lists are tied.
- Docs state the validation honestly and the freeze rule 67-09 and 75 rely on.
</verification>

<success_criteria>
- One commit per task (code under SHIP true, or the pin test under SHIP false; docs).
- Full suite green apart from the allowed failure.
</success_criteria>

<output>
`.planning/objectives/67-minutes-recalibration/67-05-SUMMARY.md` via `summary post`, `requirements-completed: []`, with
SHIP, SELECTED, the changed tests and the suite numbers.
</output>
