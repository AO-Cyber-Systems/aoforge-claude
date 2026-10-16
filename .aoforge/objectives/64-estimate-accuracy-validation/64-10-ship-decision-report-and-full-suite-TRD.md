---
objective: 64-estimate-accuracy-validation
trd: "10"
type: standard
wave: 8
depends_on: ["64-09"]
files_modified:
  - plugins/devflow/devflow/bin/lib/calibrator.cjs
  - plugins/devflow/devflow/bin/lib/calibrator.test.cjs
  - plugins/devflow/devflow/bin/lib/calibrate-cli.cjs
  - plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - .planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md
  - .planning/REQUIREMENTS.md
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - CLAUDE.md
autonomous: true
requirements: [EST-08]
gap_closure: true
must_haves:
  truths:
    - "The ship decision is `ship_default` from 64-VALIDATION.md (the output of the pre-registered ship rule). When true, `DEFAULT_WINDOW_OBJECTIVES` in calibrator.cjs becomes the frozen `window_objectives`, `calibrate` without a flag windows and `--window all` opts out, with tests first; when false (or the control failed, or the decision was `stop`) no estimator code changes and the window stays opt-in"
    - "The live ~/.claude/devflow/calibration.json is regenerated ONLY when the default flipped, only after 64-VALIDATION.md is committed, with the repository df-tools, and the SUMMARY, the report and the CHANGELOG all say that it was regenerated (hash before and after); otherwise its hash stays 5cf42c4b… and the SUMMARY says it was not touched. The frozen copy and the run history are never deleted"
    - "64-ACCURACY-REPORT.md keeps the 64-05 results and adds the gap-closure result beside them: a before/after table (frozen-calibration primary, rolling old method, rolling new method), the diagnosis verdicts, the frozen window and the evidence strength, the noise floor, the ship decision, and the statement that true prospective confirmation needs the next five objectives, which 64-02's run history now records"
    - "EST-08 is recorded exactly as the honest result says: `requirements mark-complete EST-08` and a traceability row of Complete only when 64-VALIDATION.md `est08` is met; otherwise it stays unchecked and the todo `recalibrate-estimate-minutes-est-08-not-met` stays open. No threshold, input or actual is changed to get there"
    - "CHANGELOG [Unreleased], the USER-GUIDE Estimates section (the calibrate command block and 'What is assumed') and the CLAUDE.md Estimation data bullet describe `calibrate --window`, the result and whether the default changed; `doc-refs.repo.test.cjs` and `dispatch-completeness.test.cjs` pass"
    - "The full `npm test` run passes, or every failure is shown to be pre-existing on the objective's base commit"
  artifacts:
    - path: .planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md
      provides: "the original and the gap-closure result, before and after"
    - path: .planning/REQUIREMENTS.md
      provides: "EST-08 status per the honest result"
    - path: CHANGELOG.md
      provides: "[Unreleased] entries for the window and the re-validation"
    - path: docs/USER-GUIDE.md
      provides: "Estimates: calibrate --window and the measured result"
  key_links:
    - "64-VALIDATION.md (est08, ship_default, window_objectives) -> Task 1 (default flip, live regeneration) and Task 2 (report, REQUIREMENTS, docs)"
    - "est08 met -> requirements mark-complete EST-08 + todo complete; not met -> EST-08 unchecked + todo open"
---

# TRD 64-10: Ship decision, accuracy report, requirement status, docs and the full suite (EST-08, gap closure)

## Precondition (read first)

Read `.planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md` (`decision`, `window_objectives`) and, when it
exists, `64-VALIDATION.md` (`harness_control`, `est08`, `ship_default`) with
`node plugins/devflow/devflow/bin/df-tools.cjs frontmatter get <file> --field <name>`. They select the branch:

| Situation | Task 1 | Task 2 |
|---|---|---|
| `decision: stop` (64-08, 64-09 skipped) | skipped | report records the diagnosis and that no candidate beat all-history on pre-59 evidence; EST-08 stays not met; no code ever changed |
| `harness_control: failed` | skipped | report says the validation was not scored and why; EST-08 stays not met; ask the orchestrator for a harness-fix TRD |
| `ship_default: true` | flip the default, regenerate the live calibration | report, requirement per `est08` |
| `ship_default: false` | no code; window stays opt-in; live not touched | report, requirement per `est08` |

Check `git log --format=%h -- .planning/objectives/64-estimate-accuracy-validation/64-VALIDATION.md` lists exactly one
commit: the result is frozen. Check the hashes: `shasum -a 256 ~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`
is `5cf42c4bc6141962329b1a1ac5bfdbda64ca78689dcc871c5d41352ff5a1fbea`.

<objective>
Close the gap-closure loop. 64-07 diagnosed and froze the method, 64-08 built it, 64-09 scored it once, honestly. This TRD
acts on that result and writes it down, whatever it is:

1. **Ship or not, by the pre-registered rule** (`ship_default`, computed by `shipRule` in 64-09 from the unrounded results:
   ship when the new method's rolling verdict is met, or when its minutes median is closer to 1 and no passing verdict
   regressed). Shipping means the window becomes the default of `calibrate` and the live calibration is regenerated, said
   plainly. Not shipping means nothing in the estimator changes.
2. **The report, the requirement and the docs** say what was measured: the old result stays, the new result sits beside it,
   the evidence is described with its limits, and EST-08 is recorded exactly as `est08` says.
3. **The full suite** runs.

The result is the result. If EST-08 is still not met, the report says so, the requirement stays open, and the follow-up todo
stays open with the new evidence; do not change a threshold, a window, a cut or an actual. If it is met, say that it is met on
five leave-future-out objectives with weak support for the window on pre-59 history, and that a prospective confirmation on
the next five objectives (run history from 64-02) is the real test.

Purpose: act on the honest result and leave the repository, the requirement and the docs consistent with it.
Output: (conditionally) the window default and the regenerated live calibration; the report update; EST-08 status; docs; a green suite.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Use the **repository** df-tools, `node plugins/devflow/devflow/bin/df-tools.cjs …` (the mirror lacks `--window` and `backtest`
  until a release and runtime re-sync). One plain command per Bash call.
- **Live calibration**: write `~/.claude/devflow/calibration.json` only in Task 1, only when `ship_default` is true, only after
  the VALIDATION commit exists, and say so. Never delete `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json` or
  anything under `~/.claude/devflow/state/estimates/history/`.
- No threshold, input or actual changes: `git diff --stat` for this TRD names no `estimate-backtest.cjs`.
- Strict TDD in Task 1: test first, hand-built fixtures; no generated data, no property-based library, no `.feature` files.
- Planning writes go through verbs: the report and REQUIREMENTS.md with `planning draft` + Edit (a targeted hunk on the
  seeded draft) + `doc put`; EST-08 with `requirements mark-complete` only when `est08` is met; todos with `todo complete`.
  Never Write or Edit a file under `.planning/` directly. CHANGELOG.md, USER-GUIDE.md and CLAUDE.md are repository files
  (Edit directly). Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Never use port 8080.

## Test list

Task 1 only, and only when `ship_default` is `true`. W is `window_objectives` from the doc (write the literal number in the
test). Files `calibrator.test.cjs`, `calibrate-cli.test.cjs`. Fixture: `makeCalibrationProject` with W+2 objectives
(`1-a` and `2-b` at `40min` per TRD, the rest at `10min`), each with one TRD of two auto `code_tdd` tasks.

1. `calibrator.DEFAULT_WINDOW_OBJECTIVES === <W>`.
2. `buildCalibration({paths})` (no `window`) on the W+2 fixture drops the two oldest objectives: `window.projects[0].dropped_objectives`
   is 2, `samples.trds` is W, and `task_classes.code_tdd.minutes.max` is 5 (the unwindowed build has 20: the two old
   objectives' shares; the median would not tell them apart).
3. `buildCalibration({paths, window: null})` keeps all W+2 objectives, has no `window` key, and its `stableStringify` equals
   that of `{window: W + 5}` (a window that drops nothing leaves no trace).
4. Spawned `calibrate --paths <fixture> --no-overhead --out <tmp>/a.json` (no flag) windows and names the window in the summary;
   `--window all` does not; `--window 3` overrides the default.
5. A fixture with at most W objectives is byte-identical with and without the default (no `window` key): existing tests that
   use small fixtures stay green untouched. Any existing test that needs more than W objectives of history gets
   `window: null` passed explicitly; list those tests in the SUMMARY.

<embedded_context>

<codebase_examples>
Task 1 implementation (when shipping):

```js
// calibrator.cjs
const DEFAULT_WINDOW_OBJECTIVES = <W>;   // frozen in 64-DIAGNOSIS.md; chosen on pre-59 data; null (all history) is still reachable with `window: null`
// buildCalibration already reads `window === undefined ? DEFAULT_WINDOW_OBJECTIVES : window` (64-08)
```

`calibrate-cli.cjs`: no change to parsing (absent flag is `undefined` -> the library default; `all` is `null`); update the header
comment and the USAGE/help/df-tools header sentence: "default: the most recent <W> objectives with samples per project;
`--window all` keeps all history".

Regenerating the live calibration (Task 1, shipping only), in this order, one command per call:

1. `shasum -a 256 ~/.claude/devflow/calibration.json` (record as BEFORE; it should still be `5cf42c4b…`).
2. `node plugins/devflow/devflow/bin/df-tools.cjs calibrate --raw` (default paths = this checkout, default out = the live file,
   default transcripts root, so the agent-overhead block is rebuilt as before).
3. `shasum -a 256 ~/.claude/devflow/calibration.json` (AFTER), and `rg -n -A 14 '"window"' ~/.claude/devflow/calibration.json`
   redirected to a scratch file; record `data_as_of`, `samples` and the window block.
4. Smoke: `node plugins/devflow/devflow/bin/df-tools.cjs estimate trd 64-10 --raw` prints an estimate line (the regenerated
   file loads).

Report update (draft seeded from the current file; targeted hunks only):

```markdown
frontmatter:  verdict: met | not met                       <- the final EST-08 status per 64-VALIDATION.md est08
              verdict_before: not met (frozen calibration, 64-05)
              validation: 64-VALIDATION.md
              diagnosis: 64-DIAGNOSIS.md
              window_objectives: <W | none>

## Gap closure: why minutes ran high and the recency window (plans 64-07 to 64-10)     <new section, right after "## Verdict">
<4-6 sentences: the user decision, the two locked rules, the diagnosis verdicts (S1-S7) in one line each with the deciding number,
 the frozen window and how strong its pre-59 support was (non-monotone sweep; the S advantage against the spread), the noise floor>
<before/after table>
| Run | Calibration | Agent minutes median ratio / in band | P90 objectives / TRDs | Cost median ratio / in band | P90 objectives / TRDs | EST-08 |
|---|---|---|---|---|---|---|
| 64-05 primary (reconstructed) | frozen 5cf42c4b, all history | 1.51 / 2 of 5 | 5 of 5 / 40 of 41 | 0.86 / 4 of 5 | 4 of 5 / 34 of 41 | not met |
| Rolling, old method (64-09 control) | per-cut, --window all | 1.348 / 2 of 5 | 5 of 5 / 40 of 41 | 0.839 / 4 of 5 | 4 of 5 / 32 of 41 | not met |
| Rolling, new method | per-cut, --window <W> | <from 64-VALIDATION.md> | | | | <est08> |
<per-objective old vs new ratios; flagged classes before and after>
<ship decision and what it changed (default flipped? live calibration regenerated, hash before -> after)>
<what would confirm: `estimate backtest` on the next five objectives; the run history from 64-02 records their estimates prospectively>

## Status                                                                                <replace: EST-08 per est08; the objective-complete checkbox note>
```

REQUIREMENTS.md hunks (draft + Edit + `doc put`; run `requirements mark-complete EST-08` first when `est08` is met, then
re-draft so the draft is seeded from the ticked file):

- checklist line, met: replace the trailing annotation with ` (validated 2026-10-07 against objectives 59-63: not met on the frozen calibration; met with a recency window of <W> objectives, rolling out of sample, see 64-ACCURACY-REPORT.md and 64-VALIDATION.md)`.
- checklist line, not met: append ` Re-validated with a recency window of <W> objectives (rolling, out of sample): still not met, see 64-VALIDATION.md.`
- traceability row, met: `| EST-08 | Objective 64 | Complete (rolling out-of-sample on 59-63 with a recency window; prospective confirmation pending): see objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md |`.
- traceability row, not met: `| EST-08 | Objective 64 | Not met: see objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md and 64-VALIDATION.md; follow-up todo recalibrate-estimate-minutes-est-08-not-met |`.

CHANGELOG [Unreleased] (match the style of the surrounding entries):

- `### Added`: `df-tools calibrate --window <N|all>` (`lib/calibrator.cjs`, `lib/calibration-inputs.cjs`): keeps the N most recent
  objectives that have samples per project and drops older TRDs before every statistic; records a `window` block; off unless
  the default changed (below). And one entry for the re-validation: the diagnosis (pre-59 evidence), the frozen window, the
  rolling out-of-sample result for 59-63 with both medians, EST-08 met/not met, the report path.
- `### Changed` (only when the default flipped): `calibrate` windows to the most recent <W> objectives by default (`--window all`
  restores all history) and the live calibration was regenerated by objective 64.

USER-GUIDE hunks: the `calibrate` command block near line 266 gains `--window <N|all>`; the 'What is assumed' bullet ends with the
re-validation result and whether the default changed. CLAUDE.md: in the Estimation data bullet, `calibrate` gains `--window`
and one clause on the result; add no bare backticked word that is not a COMMANDS key.
</codebase_examples>

<anti_patterns>
- Do not flip the default unless `ship_default` is `true` in the committed 64-VALIDATION.md; do not recompute it by hand.
- Do not regenerate the live calibration when not shipping, and do not regenerate it before the VALIDATION commit.
- Do not describe a rolling result as prospective, and do not describe `est08: met` as proof: state the limits.
- Do not drop the 64-05 results from the report; the old method's numbers stay beside the new ones.
- Do not tick EST-08 by any route other than `requirements mark-complete` after `est08` is `met`.
- Do not write a file under `.planning/` with Write or Edit directly.
</anti_patterns>

<error_recovery>
- A calibrator or CLI test breaks after the default flips: a test built a history longer than W and expected all of it; pass
  `window: null` in that test (do not change the behavior) and list it.
- `calibrate --raw` (live regeneration) is slow or the transcripts root is large: let it finish; do not kill it. If it fails,
  the live file is unchanged (`writeCalibration` writes atomically); record the error, set the SUMMARY to "regeneration failed,
  live calibration untouched", and leave the default flipped only if its tests passed.
- `requirements mark-complete` or `doc put` refuses: read the message, re-run `planning draft` for the exact rel path, retry.
- `doc-refs.repo.test.cjs` or `dispatch-completeness.test.cjs` fails on CLAUDE.md or the USER-GUIDE: reword the prose (a
  bare backticked name that is not a command was added), do not change the test.
- `roadmap-reconcile.test.cjs` E2E1 fails only on `trd_summary_exists` for 64-10 (its SUMMARY checkpoint exists before the
  ROADMAP box is ticked): run `node plugins/devflow/devflow/bin/df-tools.cjs roadmap update-job-progress 64` and re-run the suite
  once; record both runs.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md
@.planning/objectives/64-estimate-accuracy-validation/64-VALIDATION.md
@.planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md
@.planning/objectives/64-estimate-accuracy-validation/64-06-SUMMARY.md
</context>

<gotchas>
- `df-tools objective complete 64` ticks `- [ ] **EST-08**` for every requirement on the objective's ROADMAP line regardless of a
  verdict; when `est08` is not met, whoever completes the objective must re-open that checkbox. Say so in the SUMMARY.
- The installed mirror reads the regenerated live file fine (the `window` key is ignored) but has no `--window` and no
  `estimate backtest` until a release and runtime re-sync; the USER-GUIDE commands that use them dispatch only after that.
- The report's `calibration_sha256` frontmatter names the frozen calibration, which stays the baseline of the 64-05 numbers;
  after a regeneration the live file no longer equals it. Say that where the report says "identical to the live file".
- The forward token stamp todo (`ship-executor-token-stamp-forward-stamp-8-of-41`) needs a plugin release and a runtime
  re-sync, not code. It stays open; name it under the report's follow-ups. Do not fold it in here.
- `scripts/estimate-*.cjs` are objective-64 evaluation tools; the CHANGELOG mentions them in one clause at most.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Apply the ship rule — flip the default and regenerate the live calibration, or change nothing (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/calibrator.cjs, plugins/devflow/devflow/bin/lib/calibrator.test.cjs, plugins/devflow/devflow/bin/lib/calibrate-cli.cjs, plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/df-tools.cjs</files>
  <action>
Branch on the precondition table.

- Skipped branches (`stop`, `harness_control: failed`) and `ship_default: false`: change no file and no calibration. In the SUMMARY
  write "default unchanged, live calibration not touched" with `shasum -a 256 ~/.claude/devflow/calibration.json` (still
  `5cf42c4b…`) and the reason. Skip the rest of this task.
- `ship_default: true`: test-list items 1-5 outermost first (4, then 2, 3, 5, 1), RED then GREEN, then the doc comments/help,
  then the regeneration steps in codebase_examples (in that order, one command per call), then record in the SUMMARY
  "the live calibration was regenerated by TRD 64-10 Task 1 after 64-VALIDATION.md was committed (commit <hash>)", the hash
  before and after, `data_as_of`, `samples` and the window block. Commit the code with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "feat(64-10): calibrate windows to the most recent <W> objectives by default (EST-08)" --files <the six files>`.

# CRITICAL: W is the literal `window_objectives` from the committed doc; never a value chosen here.
# GOTCHA: the frozen calibration copy keeps the old method; do not regenerate it.
  </action>
  <verify>Shipping: `node --test plugins/devflow/devflow/bin/lib/calibrator.test.cjs plugins/devflow/devflow/bin/lib/calibrate-cli.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` passes; the live file's hash changed and `estimate trd 64-10 --raw` prints an estimate; the frozen copy still hashes to `5cf42c4b…`. Not shipping: the live hash is `5cf42c4b…` and `git status --short plugins scripts` prints nothing.</verify>
  <done>The estimator and the live calibration match the pre-registered ship decision, and the SUMMARY states plainly whether the live calibration was regenerated.</done>
  <recovery>See error_recovery. If a test of the default fails for a reason other than a long fixture, stop and report rather than loosening it.</recovery>
</task>

<task type="auto">
  <name>Task 2: Report, EST-08 status, CHANGELOG, USER-GUIDE and CLAUDE.md, then commit</name>
  <files>.planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md, .planning/REQUIREMENTS.md, CHANGELOG.md, docs/USER-GUIDE.md, CLAUDE.md</files>
  <action>
1. Report: `node plugins/devflow/devflow/bin/df-tools.cjs planning draft objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md`
   (seeded from the current file). With the Edit tool apply the hunks in codebase_examples (frontmatter, the new section after
   `## Verdict`, `## Status`, and one line under `## Reproduce` pointing at 64-VALIDATION.md section 10 and 64-DIAGNOSIS.md
   section 8), quoting numbers from 64-VALIDATION.md and 64-DIAGNOSIS.md only. In the skipped branches the new section states the
   diagnosis result and that EST-08 stays not met. Where the report says the frozen calibration is identical to the live file,
   add the regeneration note when Task 1 regenerated it. Then `doc put objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md --from <draft>`.
2. EST-08: `est08: met` -> `node plugins/devflow/devflow/bin/df-tools.cjs requirements mark-complete EST-08`, then
   `planning draft REQUIREMENTS.md`, apply the met hunks, `doc put REQUIREMENTS.md --from <draft>`, then
   `node plugins/devflow/devflow/bin/df-tools.cjs todo complete recalibrate-estimate-minutes-est-08-not-met`.
   Otherwise (not met, not scored, skipped): no mark-complete; `planning draft REQUIREMENTS.md`, apply the not-met hunks,
   `doc put`; the todo stays open.
3. CHANGELOG.md, docs/USER-GUIDE.md and CLAUDE.md: Edit the hunks in codebase_examples. State the result with its limits (five
   leave-future-out objectives, weak pre-59 support, prospective confirmation pending) and whether the default changed.
4. Check: `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs`.
5. Commit: `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(64-10): EST-08 re-validated with the recency window (<met|not met>), report and docs" --files .planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md .planning/REQUIREMENTS.md CHANGELOG.md docs/USER-GUIDE.md CLAUDE.md`
   (plus the completed todo's files if `todo complete` left them uncommitted).
  </action>
  <verify>`rg -n "^verdict:|^verdict_before:|^## Gap closure" .planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md` finds the new frontmatter and section; `rg -n "EST-08" .planning/REQUIREMENTS.md` shows the status matching 64-VALIDATION.md `est08`; `rg -n "calibrate --window|--window" CHANGELOG.md docs/USER-GUIDE.md CLAUDE.md` finds each file; the three repo tests in step 4 pass.</verify>
  <done>The report holds the original and the new result side by side; EST-08's status, the todo and the docs match the honest result and say whether the default and the live calibration changed.</done>
  <recovery>See error_recovery. If another TRD changed REQUIREMENTS.md since the draft was made, re-draft from the current file and redo the hunk.</recovery>
</task>

<task type="auto">
  <name>Task 3: Full test suite</name>
  <files>none (evidence only)</files>
  <action>
Run `npm test` from the repository root (one command, redirect to `<scratch>/npm-test.txt`; it takes about 2.5 minutes). Record the
totals (tests, pass, fail, skipped) in the SUMMARY. A failure: read it, fix only what this objective broke (a test of the
default, a doc reference), re-run once, and record both runs. A failure that exists on the base commit is pre-existing: show
that by naming the test and its failing assertion from a run at the objective's base commit, and leave it. For the known
transient on `roadmap-reconcile.test.cjs` E2E1 see error_recovery. Finally `shasum -a 256 ~/.claude/devflow/calibration.json`
and `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json`: the first matches the SUMMARY's account (unchanged, or
regenerated in Task 1 only), the second is `5cf42c4b…`.
  </action>
  <verify>`npm test` exits 0, or each failure is shown pre-existing.</verify>
  <done>The whole suite passes with the objective's changes.</done>
  <recovery>If `micro.test.cjs` hangs on commit signing, run it separately with the signing escape that the previous full-suite runs of this objective used, and record that.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `64-ACCURACY-REPORT.md` shows the 64-05 numbers and the new numbers side by side, the diagnosis verdicts, the frozen window, the limits and the ship decision.
- `.planning/REQUIREMENTS.md` EST-08 status matches `est08` in 64-VALIDATION.md; the todo is completed only for `met`.
- The SUMMARY states whether the live calibration was regenerated (with both hashes) or untouched; `~/.claude/devflow/state/backtest/calibration-5cf42c4b.json` is still `5cf42c4b…`.
- `git diff --stat` across the TRD names no `estimate-backtest.cjs`; `npm test` is green.
</verification>

<success_criteria>
- The ship decision of the pre-registered rule is applied without discretion, and its effect on the default and the live calibration is stated.
- EST-08 is recorded exactly as the honest out-of-sample result says, with the old and new evidence in one report and the limits stated.
- The suite is green.
</success_criteria>

<output>
After completion, create `.planning/objectives/64-estimate-accuracy-validation/64-10-SUMMARY.md` with
`requirements-completed: [EST-08]` only when `est08` is met, `[]` otherwise. Under `## Issues for the orchestrator`: the
`objective complete 64` checkbox note when not met; whether the live calibration was regenerated; that `--window` and
`estimate backtest` reach the installed mirror only after a release and runtime re-sync; the open token-stamp todo; and that
true prospective confirmation needs the next five objectives.
</output>
