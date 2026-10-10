---
work: feature
status: verifying
---

# Prospective estimate retest and todo sweep

## Goal

EST-08's criterion is re-tested on five objectives that ran after recalibration, with the honest verdict reported, and no todo is left pending without a reason. It can close only after Objectives 68-72 have executed, the way Objective 64 depended on 59-63.

Requirements: EST-11 (the retest), TODO-01 (the sweep). EST-09 (forward-stamp coverage, Pending since 66 at 6/8) is
re-measured here over every v1.6 TRD and ticked only if the measured number meets 95%.

## Success criteria (ROADMAP)

1. A report compares the pre-recorded run-state estimate with the actual for each of 68-72, with the median ratio and
   the P90 coverage, and states the verdict (met or not met) either way. Nothing is tuned to pass.
2. If the median is outside ±30% or P90 covers under 80%, the report names the classes and the follow-up; it is not
   rounded into a pass.
3. Forward-stamp coverage (EST-09's 95% target) is re-measured over all v1.6 TRDs and reported beside the verdict.
4. `todo list` shows no pending todo from v1.6 start without a recorded reason: each is completed through
   `todo complete` or explicitly re-scoped.

## Findings at planning time (2026-10-10)

**Objective 72 has no pre-recorded estimate.** Its original run state
(`~/.claude/aoforge/state/estimates/devflow-claude-d3dccfe9.json`, started 2026-10-08T22:24:56Z by the orchestrator's
`estimate wave 72 1 --start`) reads `No estimate: objective 72 has no minutes data in the calibration`. TRD 72-01 tried
the frozen-method recalibration into a scratch file, which also gave no estimate, and the user replied `unscored`
(72-01-SUMMARY: `run_state: unscored (accepted: unscored)`). The only archived 72 file under the current repo key
(`history/aoforge-claude-df646fc2/72-2026-10-09T15_51_08_860Z.json`) is a later `estimate start 72` made when one TRD
(72-26) was left; it is not a pre-execution estimate. The ROADMAP sentence "72 is scored in full" (2026-10-08) predates
that acceptance and is superseded by it.

**68-71 have pre-recorded estimates.** One archived history file each under `history/aoforge-claude-df646fc2/`,
byte-identical to the copies under the pre-rename key `history/devflow-claude-d3dccfe9/` (cmp, 2026-10-10). The planner
read the 68 file's wall estimate and wave actuals while locating the data. No agent-minutes or cost actual was computed
and no backtest was run before the rule below was written.

**The frozen calibration is intact.** `~/.claude/aoforge/calibration.json` and the frozen copy
`~/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json` both hash to
`f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134` (67-FREEZE.md).

**Runtime copy.** The installed runtime is 3.0.0. Its estimation and token libraries (estimate*, calibrat*,
calibration-inputs, trd-identify, token-coverage, token-usage, tokens-cli) and `references/model-rates.json` are
byte-identical to the repository copy, and none changed since `v3.0.0`. Scoring and the coverage measurement use the
installed runtime, as 67-FREEZE did. Roadmap, state and objective commands use the repository copy
(`node plugins/aoforge/aoforge/bin/aof-tools.cjs`), because the installed 3.0.0 lacks the deferred/checkpoint SUMMARY
fix (CLAUDE.md).

**`estimate backtest` already judges the pre-recorded estimate.** For an objective with a finished run state it judges
the run state's persisted `estimate.execution` (`source: prospective`) rather than a reconstruction. It takes each
objective's latest finished run, so 72 must not be passed to it: the latest 72 run is the one-TRD estimate above. No
code change is needed for the retest.

**Todos.** 13 pending at planning time: 2 from before v1.6 (2026-05-23 dual install; 2026-10-07 recalibrate and token
stamp), the rest created during v1.6 (2026-10-08/09). There is no `todo list` subcommand (`list-todos` and
`/aoforge:todo list` exist) and no re-scope verb. A re-scope is recorded with the existing verbs: `planning draft
todos/pending/<stem>.md`, add the disposition fields and a `## Disposition` section, then `todo add --stem <stem> --from
<draft>` (local mode overwrites the file in place).

**Objectives 73 and 74.** 73 is complete. 74 is open only on OPS-03, which the user deferred on 2026-10-10 (TRD 74-06,
"Skip this for now - we aren't doing this right now."). That deferral is the settlement this objective depends on; its
todo is re-scoped, not completed.

## The EST-11 scoring rule (pre-registered 2026-10-10, before any scoring run)

1. Candidates: 68, 69, 70, 71, 72, the first five objectives executed after EST-10 shipped. No substitute is drawn from
   73, 74 or 75: the ROADMAP sequencing keeps them out of the scored five because human wait dominates their minutes.
2. A candidate is scored only if it has a run state meeting every check:
   - E1: archived under `~/.claude/aoforge/state/estimates/history/aoforge-claude-df646fc2/`.
   - E2: `finished_at` is set.
   - E3: `estimate.calibration.inputs_digest` is
     `sha256:90dff7e9a38f0e4b66db873f2a668270ccc8a3ff764f078e3884e540c2faaac0`, and `estimate.calibration.method` is
     `{minutes: trd_level, window_objectives: 10, through_objective: 66}`, compared field by field and numerically.
   - E4: `estimate.execution.agent_minutes.p50` and `estimate.execution.cost_usd.p50` are finite numbers, so an
     objective-level estimate exists.
   - E5: `started_at` is earlier than the first commit that added any `<N>-*-SUMMARY.md` under either planning
     directory name, so the estimate was recorded before execution.
3. The scored set S is scored once by the installed runtime:
   `estimate backtest <S> --calibration ~/.claude/aoforge/state/backtest/calibration-f4d1ffa9.json`, run once in JSON
   form and once in `--raw` form with identical inputs. The verb's pinned constants (64-01) decide each metric
   (agent_minutes, cost_usd). SC2 passes when the median of p50/actual is within 0.70-1.30. SC3 passes when P90 covers
   at least 80% of the compared objectives and of the compared TRDs. `est08` is met only when SC2 and SC3 pass for both
   metrics.
4. EST-11 is **met** only if S has all five candidates and `est08` is `met`. Otherwise it is **not met**, and the
   report lists every reason: each unscored candidate with the check it failed, and each failing SC per metric.
5. These are reported but never decide the verdict: the verb's verdict on S alone, labelled "on the N scored
   objectives"; the prospective wall time per objective and per wave; anything about 73 or 74.
6. Nothing is tuned. This objective makes no live `calibrate` write and changes no estimator, backtest or rates code,
   calibration, run-state or history file, or SUMMARY duration or token value. Nothing is re-scored with another
   calibration, method, set or rule after the result is seen. A crashed process may be re-run once with identical inputs,
   and that is recorded.

By check E4, and by E5 for the later file, 72 is unscored. Under rule 4, EST-11 therefore cannot be met as written. The
report still measures 68-71, gives the verb's verdict on them, and names the classes and the follow-up.

## Scope decisions

- Small, well-specified todo fixes are made here, test first: migration 0008 covers `.dup-detect-log.jsonl`, migration
  0012 survives 0002 renaming tracked JOB.md files in the same run, and reconcile treats a SUMMARY with an unticked
  `## Progress` task and no `## Self-Check` as in progress. Larger items (untracked planning files in the upgrade
  commit, nested planning directories, worktree branches after the move) and anything that needs the user or another
  repository (vanity mapping, `aoforge-docs` Pages, fleet STACK.md refresh, fleet redo after a release) are re-scoped
  with a recorded reason and target.
- `tokens coverage` and its in-progress rule are not changed. The EST-09 measurement method stays as 66 built it.
- No live step: no push, merge, tag, release, secret or repository setting. Every commit goes through `aof-tools commit`.
- Re-scope record (every todo left pending): frontmatter `disposition` (`re-scoped` or `follow-up`), `disposition_reason`,
  `disposition_target`, `disposition_date`, `disposition_by: objective 75 (TODO-01)`, plus a `## Disposition` section.
  SC-4 is checked mechanically: every file in `.aoforge/todos/pending/` has a non-empty `disposition_reason`.

---
*Created: 2026-10-10 (auto-scaffold via bootstrapObjectiveMd); findings, scoring rule and scope added at planning, 2026-10-10*
