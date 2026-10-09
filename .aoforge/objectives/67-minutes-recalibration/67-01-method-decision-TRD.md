---
objective: 67-minutes-recalibration
trd: "01"
type: standard
wave: 1
depends_on: []
files_modified:
  - .planning/decisions/resolved/DECISION-003.md
autonomous: true
requirements: [EST-10]
must_haves:
  truths:
    - "A resolved decision (expected id DECISION-003; the id the verb prints is the one used) names the frozen minutes method `{minutes: trd_level, window_objectives: 10, through_objective: 66}`, its pre-registered fallback `{minutes: task_sum, window_objectives: 10, through_objective: 66}`, its provenance and the validation protocol V1-V6, written with `decision open` and `decision answer`"
    - "The decision is committed by `df-tools commit` before any scoring run: no `67-VALIDATION.md`, no calibration with a `method` block and no rolling-backtest output of objective 67 exists when it is committed, and its commit SHA is recorded in the SUMMARY as DECISION_SHA"
    - "Every number the decision cites was checked against its source document; a mismatch is corrected to the source's value and listed in the SUMMARY, never silently kept"
    - "The decision states plainly that the objective-67 planner (an agent) made the choice under the orchestrator's instruction, not the user"
    - "No code, calibration, test or live state changed in this TRD"
  artifacts:
    - path: .planning/decisions/resolved/DECISION-003.md
      provides: "the method, its provenance and the validation protocol (EST-10, SC-1)"
      contains: "trd_level"
  key_links:
    - "DECISION-003 V1-V6 -> 67-04 runs the protocol once, on the snapshot of DECISION_SHA"
    - "DECISION-003 method + fallback -> 67-05 sets the calibrate default; 67-09 builds the frozen EST-11 calibration"
---

# TRD 67-01: Record the minutes method, its provenance and its validation protocol (EST-10 SC-1)

<!-- TDD-EXCEPTION: decision record only; no source file with logic is created or changed -->

<objective>
Record, through the planning verbs, the decision that EST-10 asks for: which minutes method is frozen for EST-11, why,
on what evidence, and how it will be validated, before anything scores it. The decision was made at planning time on
objective 64's evidence; this TRD checks the cited numbers against their sources and records the text below, then
commits it so that every later TRD can prove the decision came first.

Purpose: SC-1 ("a recorded decision names the method, its provenance and its validation protocol, and is committed
before any scoring run").
Output: `.planning/decisions/resolved/DECISION-NNN.md` (expected DECISION-003) in one commit, DECISION_SHA in the
SUMMARY.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/67-minutes-recalibration/OBJECTIVE.md
@.planning/decisions/resolved/DECISION-001.md

Sources the decision cites (read the cited sections, not the whole files):
- `.planning/objectives/64-estimate-accuracy-validation/64-DIAGNOSIS.md` — section 3 (suspects S1-S7), sections 4.2 and
  4.4 (window table, weak support), section 5 (noise floor)
- `.planning/objectives/64-estimate-accuracy-validation/64-ACCURACY-REPORT.md` — "Verdict", "Gap closure" (before and
  after table), "Miscalibrated classes and follow-up" items 1-3
- `.planning/objectives/64-estimate-accuracy-validation/64-VALIDATION.md` — section 3 (new-method rows)
- `.planning/todos/pending/recalibrate-estimate-minutes-est-08-not-met.md` — "Solution"

## Binding rules
- Planning writes go through verbs only: `decision open` and `decision answer` write the decision files. Never Write or
  Edit a file under `.planning/`. The question and answer texts are drafted in a scratch directory outside the repository
  (`mktemp -d`), never under `.planning/` or `~/.claude`.
- Use the repository df-tools: `node plugins/devflow/devflow/bin/df-tools.cjs …`. One plain command per Bash call.
- Score nothing. Do not run `calibrate`, `estimate backtest`, either `scripts/estimate-*.cjs` or any estimate of an
  objective. Do not read any SUMMARY of objectives 64-66 for estimation purposes.
- Do not change the method, the fallback, the cutoff or the protocol. If a cited number is wrong, correct the number to
  the source's value. If a correction would reverse an argument (for example the S5 ratios no longer rise with task
  count), stop and return the TRD as blocked with both values: the decision then goes back to planning.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Never use port 8080.
</context>

<embedded_context>

<codebase_examples>
The CLI forms (local mode; `plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs` `cmdDecision`):

```
node plugins/devflow/devflow/bin/df-tools.cjs decision open 67-01 --question @<scratch>/question.md --raw
node plugins/devflow/devflow/bin/df-tools.cjs decision answer DECISION-003 --from <scratch>/answer.md --raw
```

`decision open` writes `.planning/decisions/pending/DECISION-NNN.md` (title = the first line of the question, context =
the whole question). `decision answer` moves it to `resolved/` with `status: resolved`, `resolution: |-` (the whole
answer, multi-line safe since objective 52) and `resolved_at`. DECISION-001 is the model for a long resolution.
</codebase_examples>

<anti_patterns>
- Writing `DECISION-003.md` with the Write tool. The verbs own the file and its frontmatter.
- Shortening the answer to a summary. The protocol V1-V6 must be in the resolution verbatim: 67-04 executes it.
- Adding a scoring step "to check the method looks good" before recording. That is exactly what SC-1 forbids.
- Wording the provenance as if the user chose. The planner chose; the user can stop the release at 67-07 and 67-08.
</anti_patterns>

<error_recovery>
- `decision open` prints an id other than DECISION-003: use that id everywhere below and in the SUMMARY.
- `decision answer` fails with a parse or id error: read the message; re-run `decision answer <id>` with the corrected
  path. Do not hand-edit the pending file.
- `frontmatter get … --field resolution` reads back only the first line: the answer was mangled. Run
  `node plugins/devflow/devflow/bin/df-tools.cjs doctor --json` and read check 33 (`decision-resolution`); report it and
  stop rather than editing the file.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Check every cited number against its source and draft the question and answer texts</name>
  <files>(scratch only: &lt;scratch&gt;/question.md, &lt;scratch&gt;/answer.md)</files>
  <action>
Read-only pre-checks, each its own Bash call:
- `ls .planning/decisions/pending .planning/decisions/resolved` (expect DECISION-001 and DECISION-002 resolved, pending
  empty, so the next id is DECISION-003)
- `git log --oneline -- .planning/objectives/67-minutes-recalibration/67-VALIDATION.md` prints nothing
- `shasum -a 256 /Users/justin/.claude/devflow/calibration.json` prints `9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648`
  (the 64-10 live file; if it differs, record the value seen and continue: the decision only cites it)

Then check each row of the evidence table in the question text below against the named section (use `rg -n` and read
narrow ranges). Record a table "cited / source / equal?" in the SUMMARY. Correct any cited value to the source.

Create a scratch directory (`mktemp -d`) and write two files with the Write tool:

`<scratch>/question.md` (the first line becomes the decision title):

```markdown
Objective 67 (EST-10): which minutes method is frozen for EST-11 (objectives 68-72), on what evidence, and how is it validated before anything scores it?

## Context

EST-08 is not met (objective 64): agent minutes run high on 59-63 and the 10-objective recency window that 64 shipped
as the `calibrate` default did not fix it. EST-10 asks for a method chosen and frozen before it is scored; EST-11 then
scores it prospectively on 68-72, and tuning the estimator to pass EST-11 is out of scope (REQUIREMENTS.md).

## Evidence (objectives <= 63 only)

| # | Finding | Source |
|---|---|---|
| E1 | Frozen all-history calibration on 59-63: minutes median ratio 1.51, 2 of 5 in band, pooled 1.45 | 64-ACCURACY-REPORT, Verdict |
| E2 | Rolling leave-future-out: all history 1.348, 10-objective window 1.238; both 2 of 5 in band; EST-08 not met either way | 64-ACCURACY-REPORT, Gap closure |
| E3 | The window's support was weak: S 0.047 at W=10, 0.210-0.216 at 15-30, 0.130 at 40, against 0.113 for all history (not monotone) | 64-DIAGNOSIS 4.2, 4.4 |
| E4 | Pre-59 in sample, median ratio by auto tasks per TRD: 0.62 (1 task, 12 TRDs), 0.91 (2, 160), 1.29 (3, 85) | 64-DIAGNOSIS S5 |
| E5 | 59-63: actual TRD minutes correlate 0.00 with task count over 41 TRDs, the estimate 0.76; 3-task TRDs 10 actual vs 15 estimated (1.80), 2-task 8 vs 10 (1.21); code_tdd median actual share 3.3 min vs calibration p50 6.0 | 64-ACCURACY-REPORT, Miscalibrated classes item 1 |
| E6 | A 42-58 window gives median 1.27 but code_tdd 1.65, prompt_tdd 2.63 and test 0.41 stay flagged: recency is not the whole story | 64-ACCURACY-REPORT, item 3 |
| E7 | Composition (rho 0.5) is centred in sample (F/A 0.99); rolling F/P 1.14 is what a median of a sum of skewed parts shows | 64-DIAGNOSIS S6 |
| E8 | Noise floor: a five-objective SC2 sample passes 58.7% (all-history spread) to 75.1% (window-10 spread) of the time by spread alone | 64-DIAGNOSIS 5 |
| E9 | The follow-up todo ranks "estimate a TRD's minutes from TRD-level history" first; 64 never tried it | todo recalibrate-estimate-minutes-est-08-not-met; 64-ACCURACY-REPORT, Follow-ups |

## Options

- option-a — Status quo plus a cutoff: per-task sum, window 10, through objective 66. Already scored on 59-63 (E2): not met.
- option-b — TRD-level minutes: a TRD's minutes are the calibration's `trd_level.minutes` distribution whatever its task
  count; window 10 (kept as 64 froze it); through objective 66. Untried. No tuned parameter.
- option-c — Recency weighting (exponential decay): needs a decay parameter; E3 gives no support for any smooth value.
- option-d — TRD-level minutes stratified by task count or dominant class: the strata would be chosen on data, most class
  strata hold under 5 TRDs at window 10, and task count predicted nothing on 59-63 (E5).
- option-e — Change the composition rho: E7 shows no defect.

## Recommendation

option-b, with option-a as the pre-registered fallback if the validation's ship rule rejects option-b.
```

`<scratch>/answer.md`:

```markdown
option-b: TRD-level minutes, window 10, through objective 66; option-a is the pre-registered fallback.

Method (named in the calibration identity, calibration version 3):
  method: {minutes: trd_level, window_objectives: 10, through_objective: 66}
A TRD with at least one auto task gets the calibration's trd_level.minutes distribution (p50, P90) as its minutes,
whatever its task count or classes; a TRD with no auto task has no minutes, as today. Objectives compose TRDs as today
(correlated sum, rho 0.5; the maximum within a parallel wave). Tokens and cost stay the per-task sum. Nothing is tuned:
10 is the window 64 froze on pre-59 history, kept and not re-chosen; 66 is the last objective before this one.

Fallback: if the ship rule (V4) returns ship_default false, the frozen method is
  method: {minutes: task_sum, window_objectives: 10, through_objective: 66}
and trd_level stays an opt-in calibrate flag.

Provenance:
- Chosen by the objective-67 planner (an agent), under the build orchestrator's instruction to decide when the
  objective-64 evidence separates the candidates and to record the rationale. It is not a user decision. The user sees
  it at the release checkpoints (67-07, 67-08) and can stop the release there.
- Read: 64-DIAGNOSIS.md, 64-ACCURACY-REPORT.md, 64-VALIDATION.md, the todo recalibrate-estimate-minutes-est-08-not-met,
  and the identity block of the live calibration (sha256 9ef7d108…, version 2, window objectives 55-64, trd_level
  minutes p50 10 / P90 20 over 79 TRDs; aggregate figures only).
- Also seen: the SUMMARY durations of 64-66, to check which TRDs carry minutes. No estimate of any objective after 63
  was computed or read before this decision.
- Why option-b: the per-task split makes the estimate grow with the task count while actual TRD time does not (E4, E5),
  measured on two separate sets; it is the todo's first option (E9) and the one 64 never tried; it adds no parameter.
- Why not the others: option-a was scored on 59-63 and is not met (E2); option-c needs a decay parameter with no
  support (E3); option-d would fit strata on data, with too few samples per stratum (E5); option-e fixes no shown
  defect (E7). Cost P90 width is outside EST-10.
- Not blind: the family was suggested by data from objectives <= 63, which are in the validation set below. That is
  acceptable only because option-b has no free parameter; EST-11 on 68-72 is the honest test.

Validation protocol (run once, by TRD 67-04; nothing else scores the method):
V1 Snapshot: git archive <the commit that records this decision> .planning, extracted to a scratch directory. Leak
   check: its objectives listing has no directory numbered 68 to 72.
V2 Cuts: for every objective N from 46 to 66 with a directory in the snapshot, two calibrations of the snapshot with
   --through N-1 --window 10 --no-overhead: old --minutes task_sum, new --minutes trd_level. Every calibration's
   method.through_objective is at most 65.
V3 Positive controls, before any score (either failing means nothing is scored and the harness is reported
   defective): PC1, 64's pre-59 selection (64-DIAGNOSIS.md section 8) reproduces selection_output_sha256
   fdf60e661fc5776514793e83c094c4d47967508b6614416cc1f46dae3b42e516; PC2, 64-09's new-method rolling rows (git-archive
   cuts of 59-63, --window 10, now with --minutes task_sum) reproduce 64-VALIDATION.md section 3 to its printed digits.
V4 Score once: scripts/estimate-rolling-backtest.cjs with every old and new file over the full set, --repo <snapshot>.
   Its verdict and shipRule (64's code, unchanged) decide: ship_default true -> the frozen method is option-b and
   calibrate's default minutes method becomes trd_level; false -> the frozen method is option-a and the default stays
   task_sum. No other method, window, cut, set or rule after the result. Secondary, descriptive only, never deciding:
   the same files over 46-58, 59-63 and 64-66.
V5 EST-11 exclusion: EST-11 scores 68-72, and no calibration of this protocol reads an objective above 65. The EST-11
   calibration is built once, with through_objective 66, by the installed runtime after the release (67-09), copied to
   ~/.claude/devflow/state/backtest/, and not rebuilt until objective 75 has scored 68-72; 75 checks each 68-72 run
   state's calibration.inputs_digest against it. Checks: a fixture test that objectives 67-72 (with SUMMARYs and
   STATE_ARCHIVE rows) leave a through-66 calibration byte-identical (67-02), and the same check on a snapshot of this
   repository with synthetic 68-72 directories (67-09).
V6 Limits: a leave-future-out reconstruction with today's code; the method family is not blind to objectives <= 63;
   per-objective spread is wide (E8). EST-11 on 68-72 with the frozen calibration is the prospective test, and nothing
   is tuned to pass it.
```
  </action>
  <verify>
- The SUMMARY's evidence-check table has one row per cited number (E1-E9 and the protocol constants: the fdf60e66 digest,
  the 1.238 median, the 9ef7d108 hash), each with its source value
- `<scratch>/question.md` and `<scratch>/answer.md` exist outside the repository, and `git status --short .planning` is
  unchanged by this task
  </verify>
  <done>Both texts are drafted with every cited number equal to its source (or corrected to it and listed), and nothing
was scored.</done>
</task>

<task type="auto">
  <name>Task 2: Open and answer the decision through the verbs, verify it reads back whole, commit it</name>
  <files>.planning/decisions/resolved/DECISION-003.md</files>
  <action>
1. `node plugins/devflow/devflow/bin/df-tools.cjs decision open 67-01 --question @<scratch>/question.md --raw`. Note the
   printed `id` (expected DECISION-003).
2. `node plugins/devflow/devflow/bin/df-tools.cjs decision answer <id> --from <scratch>/answer.md --raw`.
3. Read it back: `node plugins/devflow/devflow/bin/df-tools.cjs frontmatter get .planning/decisions/resolved/<id>.md --field status`
   prints `resolved`; `… --field resolution` prints the whole answer (its last line starts `V6 Limits` … `nothing is
   tuned to pass it.`); `rg -n "through_objective: 66" .planning/decisions/resolved/<id>.md` finds both the method and
   the fallback lines.
4. `git ls-files .planning/decisions/pending/<id>.md` — if it prints the path (tracked), add it to the commit below as a
   deletion; normally it prints nothing.
5. Commit: `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(67-01): record the minutes method, its provenance and its validation protocol (EST-10)" --files .planning/decisions/resolved/<id>.md`
6. DECISION_SHA: `git log -1 --format=%H -- .planning/decisions/resolved/<id>.md`. Record it in the SUMMARY's
   `provides` and body; 67-04 snapshots exactly this commit.
  </action>
  <verify>
- `git log -1 --format=%H -- .planning/decisions/resolved/<id>.md` equals DECISION_SHA and `git show --stat DECISION_SHA`
  lists only the decision file (plus the pending deletion if step 4 applied)
- `git log --oneline -- .planning/objectives/67-minutes-recalibration/67-VALIDATION.md` still prints nothing
- `git status --short plugins scripts` prints nothing (no code changed)
  </verify>
  <done>The resolved decision exists, reads back whole, is committed at DECISION_SHA, and precedes any scoring artifact.</done>
</task>

</tasks>

<verification>
- SC-1 evidence: the resolved decision names the method and its parameters, the fallback, the provenance (planner, not
  user; what was read and seen) and the protocol V1-V6, and its commit precedes any validation artifact.
- Nothing scored, no code or calibration changed, no live step.
</verification>

<success_criteria>
- DECISION-003 (or the printed id) resolved and committed; DECISION_SHA recorded.
- Evidence table in the SUMMARY with every cited number checked.
</success_criteria>

<output>
`.planning/objectives/67-minutes-recalibration/67-01-SUMMARY.md` via `summary post` (execute-trd.md), with
`requirements-completed: []` (EST-10 completes with 67-09), DECISION_SHA, the decision id and the evidence-check table.
</output>
