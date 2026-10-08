---
objective: 67-minutes-recalibration
trd: "09"
type: standard
wave: 8
depends_on: ["67-08"]
files_modified:
  - .planning/objectives/67-minutes-recalibration/67-FREEZE.md
  - .planning/STATE.md
autonomous: false
requirements: [EST-10]
must_haves:
  truths:
    - "The installed plugin record and `~/.claude/devflow/.plugin-version` read 2.15.0 after the user's update and restart, and the mirrored estimation libs are byte-identical to the v2.15.0 tag"
    - "The live `~/.claude/devflow/calibration.json` was built by the INSTALLED runtime with `calibrate --paths <repo> --minutes <SELECTED> --window 10 --through 66`; it is version 3 and its `method` is `{minutes: <SELECTED>, window_objectives: 10, through_objective: 66}`, SELECTED being 67-VALIDATION.md's `method_selected`"
    - "SC-2: the same command run again prints `unchanged` and the sha256 does not change; a frozen copy `~/.claude/devflow/state/backtest/calibration-<sha8>.json` is byte-identical to it; the previous live file (9ef7d108…) is kept as `calibration-9ef7d108.json` beside it"
    - "SC-3: with the installed runtime, a snapshot of this repository and the same snapshot plus hand-built objectives 68-72 (TRDs, SUMMARYs with minutes and tokens, STATE_ARCHIVE rows) give byte-identical through-66 calibrations, while without `--through` they differ; the live file's last kept objective is numbered at most 66"
    - "SC-4: `df-tools estimate` run from `~/.claude/devflow/bin/df-tools.cjs` reports `calibration.path` = the live file, `version` 3 and the frozen `method`, its text names the method, and under trd_level a TRD's minutes equal the live `trd_level.minutes`"
    - "67-FREEZE.md records the method, the sha256, the inputs_digest and the frozen copy, the rule that `calibrate` is not run until objective 75 has scored 68-72, and the check 75 applies to every 68-72 run state; STATE.md carries the same rule as a blocker"
  artifacts:
    - path: .planning/objectives/67-minutes-recalibration/67-FREEZE.md
      provides: "the frozen EST-11 calibration's identity and the SC-2/SC-3/SC-4 evidence"
      contains: "through_objective"
  key_links:
    - "installed 2.15.0 calibrate --minutes SELECTED --window 10 --through 66 -> ~/.claude/devflow/calibration.json (frozen) -> installed estimate (start/wave for 68-72) -> run state calibration.inputs_digest -> objective 75 check"
    - "67-FREEZE.md + STATE.md blocker -> nobody rebuilds the calibration during 68-72"
---

# TRD 67-09: Install 2.15.0, build the frozen EST-11 calibration with the installed runtime, prove SC-2, SC-3, SC-4

<objective>
Get 2.15.0 installed and mirrored (one human action: update and restart), then build the calibration EST-11 will be
estimated with, once, by the installed runtime, using the method 67-VALIDATION.md selected and the cutoff at objective
66. Prove on the installed runtime that the calibration names its method and is byte-identical on a rebuild (SC-2),
that objectives 68-72 cannot reach it (SC-3), and that `df-tools estimate` uses it (SC-4). Record the freeze.

Purpose: SC-2, SC-3 and SC-4 on the real runtime; EST-10 completes here.
Output: the live and frozen calibration files (outside the repository), 67-FREEZE.md, a STATE.md blocker.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/67-minutes-recalibration/67-08-SUMMARY.md
@.planning/objectives/67-minutes-recalibration/67-VALIDATION.md
@.planning/objectives/65-release-v1-5/65-04-installed-runtime-verification-TRD.md

65-04 is the model for Task 1 and the install checks (plugin manager commands, reading `installed_plugins.json`, doctor
and health from the mirror, error recovery when the mirror lags), with 2.14.0 read as 2.15.0.

**Why a human-action checkpoint.** A running session cannot restart itself and the plugin swap takes effect only in a
new session. `human-action` is the only checkpoint type that stops in yolo mode.

**Resumption across the restart.** The restart ends this executor and the orchestrator. The user resumes with
`/devflow:execute-objective 67`; 67-09 has no SUMMARY, so it starts at Task 1, whose pre-check finds the install done
and continues without asking. The orchestrator spawns an executor for this TRD (never inline).

## Binding rules
- Every df-tools command that proves the installed runtime uses `node /Users/justin/.claude/devflow/bin/df-tools.cjs`.
  The repository copy is used only for planning verbs and the commit.
- The live calibration is written exactly twice, both by Task 2 step 4's command (the build, then the identical
  rebuild). Every other `calibrate` in this TRD has `--out <scratch>/…` and `--no-overhead`.
- Writes outside the repository are limited to: `~/.claude/devflow/calibration.json` (the build),
  `~/.claude/devflow/state/backtest/calibration-9ef7d108.json` (backup of the previous live file) and
  `~/.claude/devflow/state/backtest/calibration-<sha8>.json` (the frozen copy), and `<scratch>` (`mktemp -d`).
- Never `doctor --fix`; never `rm -rf` a plugin cache directory. Never use port 8080.
- Planning writes through verbs (`planning draft` + Write + `doc put`; `state add-blocker`). Commit with
  `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
</context>

<embedded_context>

<codebase_examples>
```
claude plugin marketplace update aocyber     # refresh the aocyber marketplace clone from GitHub main
claude plugin update devflow@aocyber          # update to the latest version (restart required to apply)
```
Installed record: `node -e 'const j=require(process.env.HOME+"/.claude/plugins/installed_plugins.json");const e=(j.plugins||j)["devflow@aocyber"];console.log(JSON.stringify(e))'`

The collectProject label of a project is the basename of its root, so the two SC-3 snapshots must have the SAME
directory name under different parents (`<scratch>/a/devflow-claude` and `<scratch>/b/devflow-claude`); otherwise
`sources`, `window` and the digest differ by label alone and the comparison proves nothing.

A hand-built future objective for SC-3 (one per N in 68-72, literal text written with the Write tool or a small script):
`<root>/.planning/objectives/N-future/N-01-work-TRD.md` with frontmatter `objective: N-future`, `trd: "01"`,
`type: standard`, `wave: 1`, `depends_on: []` and two `<task type="auto" tdd="true">` elements whose `<files>` are
`lib/x.cjs, lib/x.test.cjs`; `N-01-SUMMARY.md` with frontmatter `duration: 90min`, `completed: 2026-11-01`,
`tokens_input: 5000000`, `tokens_output: 50000`, `token_model: "claude-opus-5-5"`; and one row per N appended to the
copy's `.planning/STATE_ARCHIVE.md` Performance Metrics table: `| Objective N P01 | 90min | 2 tasks | 2 files |`.
`parseMetricsTable` reads only rows under the `## Performance Metrics` heading; at planning time that section is the
last in the file (its last row is `| Objective 66 P04 | 9min | 2 tasks | 4 files |`), so appending at the end lands
inside it. Check with `rg -n "^## " <copy>/.planning/STATE_ARCHIVE.md` that no heading follows it.
</codebase_examples>

<anti_patterns>
- Building the frozen calibration with the repository df-tools: SC-4 is about the installed runtime, and building with
  it also proves the installed calibrator matches.
- Rebuilding the live file to "refresh" it after the freeze. The rebuild in Task 2 is the SC-2 check, run immediately.
- Comparing snapshots whose root directories have different names (see codebase_examples).
- Choosing the method here. SELECTED is read from 67-VALIDATION.md.
</anti_patterns>

<error_recovery>
- The installed record is still 2.14.0 after `claude plugin update`: the marketplace clone is stale; run
  `claude plugin marketplace update aocyber` first, then update again (65-04).
- `.plugin-version` still 2.14.0 after the restart: sync-runtime did not mirror; check
  `ls ~/.claude/plugins/cache/aocyber/devflow/` for 2.15.0, report doctor `runtime-mirror`, and re-present Task 1 asking
  for one more restart.
- The installed `calibrate` rejects `--minutes`/`--through` (unknown flag): the mirror is not 2.15.0; stop and report.
- The rebuild prints `changed`: something read differs between runs (a new overhead spawn mid-run, or a planning file
  changed). Record both sha256 values and the summary lines, find the difference (`diff <(jq -S . a) <(jq -S . b)` is a
  compound command: write both files to `<scratch>` and diff them as two plain commands), and return blocked; SC-2 is
  not met until a rebuild is unchanged.
- The SC-3 snapshots differ under `--through 66`: stop and report the differing keys; that is a calibrator defect.
</error_recovery>

</embedded_context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Human action: update the installed plugin to 2.15.0 and restart Claude Code</name>
  <files>(none in the repo — ~/.claude/plugins install state and the ~/.claude/devflow mirror)</files>
  <action>
Pre-check (read-only, each its own Bash call): the installed record (codebase_examples);
`cat /Users/justin/.claude/devflow/.plugin-version`; `ls /Users/justin/.claude/plugins/cache/aocyber/devflow/`.

Idempotency: record 2.15.0 AND `.plugin-version` 2.15.0 → the update and restart already happened; record
`already done (found at pre-check)` and go to Task 2.

Otherwise STOP and present: "2.15.0 is merged and tagged (67-08). Please update the installed plugin and restart:
run `claude plugin marketplace update aocyber` and `claude plugin update devflow@aocyber` (or `/plugin` → aocyber →
devflow → Update), then quit and restart Claude Code and resume with `/devflow:execute-objective 67`. Reply `approved`
if you want me to run the two update commands now (you still restart), `done` once you have updated and restarted, or
anything else to hold."

On `approved`: run the two commands, each its own Bash call, and record their output; then ask the user to restart and
resume (this executor ends there).
  </action>
  <instructions>The release is on main. The installed plugin must be updated and Claude Code restarted so the mirror at
~/.claude/devflow carries 2.15.0; only you can restart the session.</instructions>
  <verification>After the restart: installed record 2.15.0 and `.plugin-version` 2.15.0.</verification>
  <resume-signal>Reply "approved" (I run the update commands, then you restart), "done" (updated and restarted), or anything else to hold.</resume-signal>
  <verify>
- The installed record's version is 2.15.0 and its installPath ends `/devflow/2.15.0`
- `cat /Users/justin/.claude/devflow/.plugin-version` prints 2.15.0
  </verify>
  <done>The literal reply is recorded; the installed runtime is 2.15.0 in the current session.</done>
</task>

<task type="auto">
  <name>Task 2: Verify the mirror, build the frozen calibration with the installed runtime, prove SC-2</name>
  <files>(outside the repository: ~/.claude/devflow/calibration.json and ~/.claude/devflow/state/backtest/)</files>
  <action>
1. Mirror check: for each of `calibrator.cjs calibration-inputs.cjs calibrate-cli.cjs estimate.cjs estimate-cli.cjs
   estimate-format.cjs estimate-rollup.cjs estimate-math.cjs`, `git show v2.15.0:plugins/devflow/devflow/bin/lib/<f>`
   redirected to `<scratch>/tag-<f>` and `cmp <scratch>/tag-<f> /Users/justin/.claude/devflow/bin/lib/<f>` (write the
   loop as `<scratch>/mirror.sh`, run with `bash`). All equal. Then
   `node /Users/justin/.claude/devflow/bin/df-tools.cjs doctor --json` (report only): `runtime-mirror` ok and
   `engine_version` 2.15.0; record each check's id and severity against 67-06's baseline.
2. SELECTED: `node plugins/devflow/devflow/bin/df-tools.cjs frontmatter get .planning/objectives/67-minutes-recalibration/67-VALIDATION.md --field method_selected`.
3. Backup: `shasum -a 256 /Users/justin/.claude/devflow/calibration.json` (PREV). If PREV is `9ef7d108…`,
   `cp /Users/justin/.claude/devflow/calibration.json /Users/justin/.claude/devflow/state/backtest/calibration-9ef7d108.json`;
   otherwise name the copy by PREV's first 8 hex digits and record that the live file had changed since 64-10.
4. Build (the first of the two allowed live writes):
   `node /Users/justin/.claude/devflow/bin/df-tools.cjs calibrate --paths /Users/justin/dev/devflow-claude --minutes <SELECTED> --window 10 --through 66 --raw`
   Record the summary line. Then `shasum -a 256 /Users/justin/.claude/devflow/calibration.json` → FROZEN_SHA.
5. SC-2: run exactly the same command again. It must print `unchanged`, and the sha256 must still be FROZEN_SHA.
6. Frozen copy: `cp /Users/justin/.claude/devflow/calibration.json /Users/justin/.claude/devflow/state/backtest/calibration-<FROZEN_SHA first 8>.json`;
   `cmp` the two files.
7. Identity read-back (`node -e` on the live file): `version` 3; `method` deep-equals
   `{minutes: SELECTED, window_objectives: 10, through_objective: 66}`; `window.projects[0].last` is an objective
   directory numbered at most 66; `sources` lists only `devflow-claude`; record `inputs_digest`, `data_as_of`,
   `samples`, `trd_level.minutes` and the notes.
  </action>
  <verify>
- The mirror `cmp` loop reports no difference and doctor `runtime-mirror` is ok
- The rebuild printed `unchanged`; FROZEN_SHA is the same before and after; the frozen copy `cmp`s equal
- The identity read-back matches SELECTED, window 10, through 66
  </verify>
  <done>The EST-11 calibration exists, built by the installed runtime with the frozen method, byte-identical on a rebuild,
with a frozen copy and the previous file kept.</done>
</task>

<task type="auto">
  <name>Task 3: Prove SC-3 and SC-4 on the installed runtime; record the freeze in 67-FREEZE.md and STATE.md</name>
  <files>.planning/objectives/67-minutes-recalibration/67-FREEZE.md, .planning/STATE.md</files>
  <action>
SC-3 (synthetic future, installed calibrate, scratch only):
1. `mkdir -p <scratch>/a/devflow-claude <scratch>/b/devflow-claude`; `git archive --format=tar -o <scratch>/head.tar HEAD .planning`;
   extract into both. In `<scratch>/b/devflow-claude` add objectives 68-72 as codebase_examples describes (a script in
   `<scratch>` that writes the literal files and appends the five archive rows is fine; check
   `rg -n "^\| Objective 7[0-2] P01" <scratch>/b/devflow-claude/.planning/STATE_ARCHIVE.md` finds the rows).
2. With `node /Users/justin/.claude/devflow/bin/df-tools.cjs calibrate --paths <root> --minutes <SELECTED> --window 10 --through 66 --no-overhead --out <scratch>/<a|b>.json --raw`
   for both roots: `cmp <scratch>/a.json <scratch>/b.json` reports no difference.
3. Control: the same two runs without `--through` (`--out <scratch>/a-all.json`, `b-all.json`): `cmp` reports a
   difference (the 68-72 data would reach a calibration without the cutoff).
4. Consistency with the live file: `node -e` comparing `<scratch>/a.json` with the live file on `samples`, `sources`,
   `trd_level`, `task_classes`, `objective_level`, `probabilities`, `method`, `window`, `notes` and `data_as_of`: all
   deep-equal (only `agent_overhead`, `agent_overhead_sources`, `unpriced_models` and `inputs_digest` may differ,
   because the live file scanned transcripts). Record any difference and stop if a TRD-derived block differs.

SC-4 (installed estimator):
5. `node /Users/justin/.claude/devflow/bin/df-tools.cjs estimate objective 66 --all` (JSON; a large result prints
   `@file:<path>`, read that file): `calibration.path` is `/Users/justin/.claude/devflow/calibration.json`,
   `calibration.version` 3, `calibration.method` equals the frozen method.
6. `node /Users/justin/.claude/devflow/bin/df-tools.cjs estimate objective 66 --all --raw` ends with
   `minutes <SELECTED> (window 10, through objective 66).`
7. SELECTED trd_level only: pick the 66 TRD with the most auto tasks; `estimate trd <66-NN>` (JSON) has `minutes.p50`
   and `minutes.p90` equal to the live `trd_level.minutes.p50`/`p90` (as rounded at output) and `minutes_basis`
   `trd_level`. SELECTED task_sum: `minutes_basis` is `task_sum` instead.

Record:
8. `node plugins/devflow/devflow/bin/df-tools.cjs planning draft objectives/67-minutes-recalibration/67-FREEZE.md`; fill
   with the Write tool. Frontmatter: `objective`, `type: freeze`, `requirement: EST-10`, `decision: DECISION-003`,
   `validation: 67-VALIDATION.md`, `method` (the block), `calibration_sha256: <FROZEN_SHA>`, `inputs_digest`,
   `data_as_of`, `samples`, `frozen_copy: ~/.claude/devflow/state/backtest/calibration-<sha8>.json`,
   `previous_live_sha256: <PREV>`, `previous_copy`, `built_with: installed 2.15.0`, `built_from: <git rev-parse HEAD>`,
   `generated: <date +%F>`. Body: (1) what this calibration is and the exact build command; (2) **The rule**: do not
   run `df-tools calibrate` (any form that writes the live file) until objective 75 has scored 68-72; if it happens,
   restore with `cp <frozen_copy> ~/.claude/devflow/calibration.json` and check the sha256; (3) **The check for
   objective 75**: for each of 68-72, its run-state history file under
   `~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/` has `estimate.calibration.inputs_digest` equal to
   this `inputs_digest` and `estimate.calibration.method` equal to this method; a mismatch is reported, never ignored;
   (4) SC-2, SC-3 and SC-4 evidence: commands and outputs from Tasks 2-3.
9. `node plugins/devflow/devflow/bin/df-tools.cjs doc put objectives/67-minutes-recalibration/67-FREEZE.md --from <draft> --raw`
10. `node plugins/devflow/devflow/bin/df-tools.cjs state add-blocker --text "EST-11 calibration frozen (67-FREEZE.md, sha256 <sha8>): do not run df-tools calibrate until objective 75 has scored 68-72"`
11. `node plugins/devflow/devflow/bin/df-tools.cjs commit "docs(67-09): freeze the EST-11 calibration (EST-10)" --files .planning/objectives/67-minutes-recalibration/67-FREEZE.md .planning/STATE.md`
  </action>
  <verify>
- `cmp <scratch>/a.json <scratch>/b.json` reports no difference and the control pair differs
- The installed `estimate` JSON names the live path, version 3 and the frozen method; the text names the method
- `node plugins/devflow/devflow/bin/df-tools.cjs frontmatter get .planning/objectives/67-minutes-recalibration/67-FREEZE.md --field calibration_sha256`
  equals `shasum -a 256 /Users/justin/.claude/devflow/calibration.json`
- `rg -n "EST-11 calibration frozen" .planning/STATE.md` finds the blocker
  </verify>
  <done>SC-3 and SC-4 are proven on the installed runtime, and the freeze and its check are recorded where objective 75
and every later session will see them.</done>
</task>

</tasks>

<verification>
- SC-2: identity names the method and parameters; rebuild unchanged (Task 2 steps 4-7).
- SC-3: no input from 68-72 can reach the through-66 calibration (Task 3 steps 1-4), plus 67-02's fixture test and
  67-04's protocol.
- SC-4: the installed `df-tools estimate` reads the new calibration and names its method (Task 3 steps 5-7).
</verification>

<success_criteria>
- EST-10 complete: `requirements-completed: [EST-10]` in this TRD's SUMMARY.
- 67-FREEZE.md and the STATE.md blocker committed; live, frozen and previous calibration files in place.
</success_criteria>

<output>
`.planning/objectives/67-minutes-recalibration/67-09-SUMMARY.md` via `summary post`, `requirements-completed: [EST-10]`,
with the literal reply of Task 1, PREV, FROZEN_SHA, inputs_digest, the SC-2/3/4 evidence and the doctor comparison.
</output>
