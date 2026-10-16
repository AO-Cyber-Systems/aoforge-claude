---
objective: 67-minutes-recalibration
trd: "09"
subsystem: estimation-calibration
tags: [calibration, freeze, installed-runtime, EST-10, EST-11, trd_level, through-66, SC-2, SC-3, SC-4, v2.15.0]

requires:
  - objective: 67-minutes-recalibration
    provides: "67-08: v2.15.0 merged and tagged (MERGE_SHA 2f01cd77f5ad70518302ad53e35f5478b704fd5d); 67-VALIDATION.md method_selected trd_level"

provides:
  - "installed plugin and ~/.claude/devflow mirror at 2.15.0, mirrored estimation libs byte-identical to the v2.15.0 tag"
  - "frozen EST-11 calibration ~/.claude/devflow/calibration.json: sha256 f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134, version 3, method {trd_level, window 10, through 66}, built by the installed runtime"
  - "frozen copy calibration-f4d1ffa9.json and the previous live file kept as calibration-9ef7d108.json, both in ~/.claude/devflow/state/backtest/"
  - "SC-2, SC-3 and SC-4 proven on the installed runtime"
  - "67-FREEZE.md (method, sha256, inputs_digest, the do-not-calibrate rule, the objective 75 check) and the STATE.md blocker"
  - "state add-blocker / resolve-blocker find a '## Blockers / Concerns' heading (spaces around the slash)"

affects: [68, 69, 70, 71, 72, 75]

tech-stack:
  added: []
  patterns:
    - "frozen calibration: built once by the installed runtime with an explicit method and cutoff, byte-identical on a rebuild, copied beside a kept previous file"
    - "synthetic-future snapshots with the same directory basename to prove a cutoff, with a no-cutoff control that must differ"

key-files:
  created:
    - .planning/objectives/67-minutes-recalibration/67-FREEZE.md
  modified:
    - plugins/devflow/devflow/bin/lib/state.cjs
    - plugins/devflow/devflow/bin/lib/state.test.cjs
    - .planning/STATE.md
    - .planning/state.json
    - .planning/ROADMAP.md

key-decisions:
  - "The Blockers section pattern was fixed in the verb (shared BLOCKERS_SECTION_RE in state.cjs) instead of editing STATE.md by hand, because STATE.md may only be written through the verbs."
  - "state.json was committed with the freeze: the verb mirrored the blocker into it, and the diff was exactly that one entry."
  - "Nothing was pushed. The release is merged and tagged (67-08); the branch carries local commits that stay unpublished until a separately approved push."

requirements-completed: [EST-10]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 14min
completed: 2026-10-08
tokens_input: 14333379
tokens_output: 69519
tokens_cache_read: 14115335
tokens_cache_write: 217798
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 67 TRD 09: Install 2.15.0, build the frozen EST-11 calibration with the installed runtime, prove SC-2, SC-3, SC-4 Summary

**The installed 2.15.0 runtime built the EST-11 calibration once (`calibrate --minutes trd_level --window 10 --through 66`), it rebuilds byte-identical, objectives 68-72 cannot reach it, `df-tools estimate` uses it and names its method, and the freeze is recorded in `67-FREEZE.md` and as a STATE.md blocker.** FROZEN_SHA `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`, PREV `9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648`, inputs_digest `sha256:90dff7e9a38f0e4b66db873f2a668270ccc8a3ff764f078e3884e540c2faaac0`. Nothing was pushed.

## Progress
- [x] Task 1: Human action: update the installed plugin to 2.15.0 and restart Claude Code — (this commit)
- [x] Task 1: Human action: update the installed plugin to 2.15.0 and restart Claude Code — 5a7a2c1e
- [x] Task 2: Verify the mirror, build the frozen calibration with the installed runtime, prove SC-2 — 9e3cc964
- [x] Task 3: Prove SC-3 and SC-4 on the installed runtime; record the freeze in 67-FREEZE.md and STATE.md — 3dc2255a (the blocker verb fix: 58ae63e5 RED, 994b93ef GREEN)

## Task 1 pre-check, first pass (2026-10-08, before the restart)

| Check | Result |
|---|---|
| `installed_plugins.json` devflow@aocyber | version 2.14.0, installPath `/Users/justin/.claude/plugins/cache/aocyber/devflow/2.14.0` |
| `~/.claude/devflow/.plugin-version` | 2.14.0 |
| `~/.claude/plugins/cache/aocyber/devflow/` | 2.7.1 2.10.1 2.11.0 2.12.0 2.13.1 2.14.0 (no 2.15.0) |

The update and restart had not happened, so Task 1 was a live checkpoint.

## Task 1 user reply and update output

Literal reply to the Task 1 checkpoint: `approved`

Commands run once each, one per Bash call (by the executor before the restart):

1. `claude plugin marketplace update aocyber`
   ```
   Updating marketplace: aocyber...Refreshing marketplace cache (timeout: 120s)…
   Cloning repository (timeout: 120s): git@github.com:AO-Cyber-Systems/devflow-claude.git
   Replacing the existing marketplace clone…
   Clone complete, validating marketplace…
   ✔ Successfully updated marketplace: aocyber
   ```
2. `claude plugin update devflow@aocyber`
   ```
   Checking for updates for plugin "devflow@aocyber"…
   ✔ Plugin "devflow" updated from 2.14.0 to 2.15.0 for scope user. Restart to apply changes.
   ```

Installed record after the update: version 2.15.0, installPath `/Users/justin/.claude/plugins/cache/aocyber/devflow/2.15.0`, lastUpdated 2026-10-08T15:14:44Z, gitCommitSha `2f01cd77f5ad70518302ad53e35f5478b704fd5d` (equals MERGE_SHA of 67-08). The user then restarted Claude Code.

## Task 1 pre-check, second pass (2026-10-08, after the approved update and restart)

Task 1: already done (found at pre-check, after the approved update and restart).

| Check | Result |
|---|---|
| `installed_plugins.json` devflow@aocyber | version 2.15.0, installPath `/Users/justin/.claude/plugins/cache/aocyber/devflow/2.15.0`, gitCommitSha `2f01cd77f5ad70518302ad53e35f5478b704fd5d` |
| `~/.claude/devflow/.plugin-version` | 2.15.0 |
| `~/.claude/plugins/cache/aocyber/devflow/` | 2.7.1 2.10.1 2.11.0 2.12.0 2.13.1 2.14.0 2.15.0 |

The SessionStart upgrade hook also committed 7e39fb67 (`chore(devflow): upgrade project to v2.15.0`, config.json stamp only), which is the base of this resumed run.

## Task 2: mirror, frozen calibration, SC-2

**Mirror check.** `bash <scratch>/mirror.sh` compared `git show v2.15.0:plugins/devflow/devflow/bin/lib/<f>` with `/Users/justin/.claude/devflow/bin/lib/<f>` for calibrator, calibration-inputs, calibrate-cli, estimate, estimate-cli, estimate-format, estimate-rollup and estimate-math: all eight EQUAL, exit 0.

**Doctor** (`node /Users/justin/.claude/devflow/bin/df-tools.cjs doctor --json`, report only): engine_version 2.15.0, status degraded, ok 13 / warn 3 / error 0 / fixable 1. Against 67-06's baseline (ok 12 / warn 4 / error 0 / fixable 1):

| Check id | 67-06 baseline | Now | Change |
|---|---|---|---|
| runtime-mirror | ok (2.14.0) | ok (mirror 2.15.0 = installed 2.15.0, digest `sha256:0174e1c6…9448bb` on installed, mirror and marker) | version moved |
| plugin-cache | warn, 5 stale | warn, 6 stale (2.7.1 2.10.1 2.11.0 2.12.0 2.13.1 2.14.0) | 2.14.0 added, as 67-06 predicted |
| hooks-registry | ok (installed 2.14.0) | ok (20 registered resolve, 2 DRAFT) reading the 2.15.0 cache | as predicted |
| skill-requires | ok | ok (gh on PATH) reading the 2.15.0 cache | as predicted |
| pending-migrations | warn (stamped 2.14.0) | ok (project up to date, v2.15.0) | cleared, as predicted |
| legacy-runtime-state | warn (fixable) | warn (fixable), same two files | unchanged |
| validate-health | warn, W006 x8 | warn, W006 x8 (objectives 68-75 have no directory yet) | unchanged |
| model-profiles, skill-markers, store-cache-tracked, gh-store-sync, checks-workflow-pin, guard-state, awareness-state, backups, decision-resolution | ok | ok | unchanged (guard-state 6 files, was 5) |

`doctor --fix` was not run.

**SELECTED.** `frontmatter get 67-VALIDATION.md --field method_selected` printed `{"method_selected": "trd_level"}`, so SELECTED = `trd_level`.

**PREV and backup.** `shasum -a 256 ~/.claude/devflow/calibration.json` before the build: `9ef7d1082c6722b6ca783d6b8d192a0999da63ba620e2780dcc67ed98b5ad648` (PREV, equal to the 64-10 value, so the live file had not changed since). Copied to `~/.claude/devflow/state/backtest/calibration-9ef7d108.json`, sha256 verified equal.

**Build** (live write 1 of 2, installed runtime):
`node /Users/justin/.claude/devflow/bin/df-tools.cjs calibrate --paths /Users/justin/dev/devflow-claude --minutes trd_level --window 10 --through 66 --raw`
```
calibration /Users/justin/.claude/devflow/calibration.json: changed · 75 TRDs, 177 tasks, 72 with tokens · classes code_tdd 86, prompt_tdd 25, other 18, test 15, doc 13, code 8, test_tdd 5, config 3, prompt 3, doc_tdd 1 · overhead verifier 41, planner 36, job-checker 32, objective-researcher 11, integration-checker 5, roadmapper 2 · window 10 objectives (dropped 384 TRDs) · minutes trd_level · through objective 66
```
FROZEN_SHA: `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`.

**SC-2 rebuild** (live write 2 of 2, identical command): printed `... unchanged · 75 TRDs, 177 tasks, 72 with tokens · ... · window 10 objectives (dropped 384 TRDs) · minutes trd_level · through objective 66`. sha256 after the rebuild: `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`, equal to FROZEN_SHA.

**Frozen copy.** `cp` to `~/.claude/devflow/state/backtest/calibration-f4d1ffa9.json`; `cmp` against the live file printed nothing (byte-identical).

**Identity read-back** (`node` script in scratch, `assert.deepStrictEqual` on the method): version 3; method `{minutes: trd_level, window_objectives: 10, through_objective: 66}`; `window.projects[0]` = project devflow-claude, first `57-estimation-data-foundation`, last `66-executor-token-stamp`, kept 10, dropped 52 objectives / 384 TRDs; `sources` lists only devflow-claude (76 TRDs, 76 summaries, 75 with minutes, 72 with tokens, 134 metric rows, 131 joined, 3 ambiguous, 1 with no outcome); `inputs_digest` `sha256:90dff7e9a38f0e4b66db873f2a668270ccc8a3ff764f078e3884e540c2faaac0`; `data_as_of` 2026-10-08; `samples` `{tasks: 177, trds: 75, with_tokens: 72}`; `trd_level.minutes` `{min: 3, p50: 10, p90: 19, max: 45, n: 73}`; the notes include the "Through objective 66" and "Minutes method trd_level" lines.

## Task 3: SC-3, SC-4 and the freeze record

**SC-3** (installed `calibrate`, scratch only, `--no-overhead --out <scratch>/…`). Snapshots `<scratch>/a/devflow-claude` and `<scratch>/b/devflow-claude` from `git archive HEAD .planning` (same basename, so the project label matches); b gained hand-built objectives 68-72 (a TRD with two `tdd="true"` tasks, a SUMMARY with `duration: 90min`, `tokens_input: 5000000`, `tokens_output: 50000`, and a `| Objective N P01 | 90min | 2 tasks | 2 files |` row each; `## Performance Metrics` confirmed as the last section, rows for 70-72 found at lines 370-372).

| Run | Result |
|---|---|
| `--through 66`, a | `changed · 75 TRDs, 177 tasks, 72 with tokens · overhead skipped · window 10 objectives (dropped 384 TRDs) · minutes trd_level · through objective 66` |
| `--through 66`, b | the same line (75 TRDs, 177 tasks, 72 with tokens) |
| `cmp a.json b.json` | no difference |
| control, no `--through`, a | 76 TRDs, 177 tasks, 73 with tokens (dropped 391) |
| control, no `--through`, b | 37 TRDs, 82 tasks, 34 with tokens (dropped 435) |
| `cmp a-all.json b-all.json` | differ (char 3636, line 199) |

Consistency of `a.json` with the live file: `samples`, `sources`, `trd_level`, `task_classes`, `objective_level`, `probabilities`, `method`, `window`, `notes`, `data_as_of` all deep-equal (also `classifier_version`, `model_aliases`, `models`, `rates_as_of`, `version`, `unpriced_models`). Only `agent_overhead`, `agent_overhead_sources` and `inputs_digest` differ (the live file scanned transcripts; `a.json` ran with `--no-overhead`). No TRD-derived block differs.

**SC-4** (installed `estimate`, run with `--cwd` at the repository):
- `estimate objective 66 --all` (JSON): `calibration.path` `/Users/justin/.claude/devflow/calibration.json`, `version` 3, `method` `{minutes: trd_level, through_objective: 66, window_objectives: 10}`.
- `estimate objective 66 --all --table --raw`: text includes `Calibration 2026-10-08, 75 TRDs, minutes trd_level (window 10, through objective 66).` Plain `--raw` prints only the one-line summary (`Objective 66 estimate: 39 min median (P90 1h 10m) wall · $13.50 (P90 $23.14) · 4 TRDs estimated in 3 waves · confidence medium`); the sentence the TRD names is in the `--table` text, where a `Note:` line follows it when `--all` is set.
- `estimate trd 66-01` (3 auto tasks, the most in objective 66): `minutes` p50 10 / p90 19 equal the live `trd_level.minutes`; `minutes_basis` `trd_level`; `minutes_samples` 73. The task sum would have been 11.7.

**Freeze record.** `67-FREEZE.md` published with `doc put` (frontmatter `calibration_sha256` `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`, equal to `shasum -a 256` of the live file; `inputs_digest`, method, frozen copy, previous copy, built_with/built_from, generated). Blocker added with `state add-blocker` (STATE.md line 229, mirrored into `state.json`).

### Deviation (Rule 3 - blocking): `state add-blocker` did not match this repo's STATE.md heading

`state add-blocker --text "EST-11 calibration frozen ..."` returned `{"added": false, "reason": "Blockers section not found in STATE.md"}`. This repo's STATE.md heading is `## Blockers / Concerns` (spaces around the slash); the verb's pattern (shared in `cmdStateAddBlocker` and `cmdStateResolveBlocker`) accepted only `Blockers`, `Blockers/Concerns` and `Concerns` (the template says `### Blockers/Concerns`). STATE.md may only be written through the verbs, so the verb was fixed rather than the file edited by hand.
- RED 58ae63e5: `plugins/devflow/devflow/bin/lib/state.test.cjs` test `2f2` (add then resolve against a `## Blockers / Concerns` heading) failed with the exact `Blockers section not found` result.
- GREEN 994b93ef: `plugins/devflow/devflow/bin/lib/state.cjs` gained one shared `BLOCKERS_SECTION_RE` (spaces or tabs allowed around the slash), used by both verbs. `state.test.cjs`: 34/34 pass.
- The re-run of the verb returned `added: true`. The fix is in the repository only; the installed 2.15.0 mirror still carries the old pattern until the next release.
- Observation, not changed: `.planning/state.json` held `"blockers": []` while STATE.md already listed one bullet under the section, so the two had drifted before this TRD.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `state add-blocker` could not find this repo's `## Blockers / Concerns` heading**
- **Found during:** Task 3, step 10
- **Issue:** the verb returned `added: false, Blockers section not found in STATE.md`, so the freeze blocker the TRD requires could not be recorded through a verb.
- **Fix:** test-first (RED then GREEN) change to a shared `BLOCKERS_SECTION_RE` in `state.cjs` that allows spaces or tabs around the slash; the verb then returned `added: true`. Detail under Task 3 above.
- **Files modified:** `plugins/devflow/devflow/bin/lib/state.cjs`, `plugins/devflow/devflow/bin/lib/state.test.cjs`
- **Commits:** 58ae63e5 (RED), 994b93ef (GREEN)

**2. [Rule 3 - Blocking] E2E1 (roadmap-reconcile self-test) failed the first `npm test` run**
- **Found during:** the task gate after Task 3
- **Issue:** with 67-09's SUMMARY on disk, ROADMAP.md still showed `- [ ] 67-09-...`; E2E1 asserts zero drift. This is the failure 67-06 documented for an in-flight checkpoint SUMMARY, not a defect in this TRD's change (it was the only failure, 1 of 11188).
- **Fix:** `sync-roadmap --dry-run` showed exactly one change (67-09 `[ ]` to `[x]`); `sync-roadmap` applied it; the 63 tests in `roadmap-reconcile.test.cjs` passed, and the full suite then passed (11188 tests, 11154 pass, 0 fail, 34 skipped). ROADMAP.md goes into the final docs commit.
- **Files modified:** `.planning/ROADMAP.md`

### Observations (no change made)

- Plain `estimate objective 66 --all --raw` prints only the one-line summary; the method sentence the TRD names comes from `--table --raw`, and with `--all` a `Note:` line follows it, so "ends with" in the TRD is loose.
- `df-tools frontmatter get` reads the nested integers in 67-FREEZE.md as strings; the FREEZE body tells objective 75 to compare numerically.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: install 2.15.0 | installed record `node -e` read (version 2.15.0, installPath `.../devflow/2.15.0`); `cat ~/.claude/devflow/.plugin-version` printed 2.15.0 | 0 | PASS |
| 2: mirror | `bash mirror.sh`: 8 of 8 libs EQUAL against `git show v2.15.0:...`; `doctor --json` runtime-mirror ok, engine 2.15.0, error 0 | 0 | PASS |
| 2: SC-2 | rebuild printed `unchanged`; `shasum -a 256` before and after `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`; `cmp` live vs frozen copy clean | 0 | PASS |
| 2: identity | `node identity.cjs` (assert.deepStrictEqual on method) printed version 3, method `{trd_level, 10, 66}`, last `66-executor-token-stamp`, sources only `devflow-claude` | 0 | PASS |
| 3: SC-3 | `cmp a.json b.json` (through 66) no difference; control `cmp a-all.json b-all.json` differ (char 3636, line 199); `consistency.cjs` 0 TRD-derived blocks differ | 0 / 1 (control, expected) | PASS |
| 3: SC-4 | `estimate objective 66 --all`: path live file, version 3, method frozen; `--table --raw` names `minutes trd_level (window 10, through objective 66)`; `estimate trd 66-01` minutes 10/19, basis `trd_level` | 0 | PASS |
| 3: freeze record | `frontmatter get 67-FREEZE.md --field calibration_sha256` equals `shasum -a 256` of the live file; `rg -n "EST-11 calibration frozen" .planning/STATE.md` found line 229 | 0 | PASS |

## Task Commits

1. Task 1 (record of the install): `5a7a2c1e` docs(67-09): record 2.15.0 install and restart (Task 1)
2. Task 2: `9e3cc964` docs(67-09): build and verify the frozen EST-11 calibration (Task 2)
3. Task 3 deviation, RED: `58ae63e5` test(67-09): add failing test for add-blocker with a spaced Blockers / Concerns heading
4. Task 3 deviation, GREEN: `994b93ef` fix(67-09): match a spaced Blockers / Concerns heading in add-blocker and resolve-blocker
5. Task 3: `3dc2255a` docs(67-09): freeze the EST-11 calibration (EST-10)
6. Final: see the docs(67-09) completion commit (SUMMARY, STATE.md, state.json, ROADMAP.md, REQUIREMENTS.md)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped, inner loop) | `node --test plugins/devflow/devflow/bin/lib/state.test.cjs` | 0 (34 pass) | PASS |
| test (task gate), first run | `npm test` | 1 (11188 tests, 11153 pass, 1 fail: E2E1) | FAIL, fixed by `sync-roadmap` (Deviation 2) |
| test (task gate), re-run | `npm test` | 0 (11188 tests, 11154 pass, 0 fail, 34 skipped, duration_ms 94942) | PASS |

## TDD Evidence

The TRD is `type: standard`; the verb fix (Deviation 1) was written test-first.

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test --test-name-pattern "2f2" plugins/devflow/devflow/bin/lib/state.test.cjs` | 1 | FAIL (correct): `added: false, Blockers section not found in STATE.md` |
| GREEN | `node --test --test-name-pattern "2e\|2f" plugins/devflow/devflow/bin/lib/state.test.cjs` | 0 | PASS (correct): 2e, 2f, 2f2 |
| full file | `node --test plugins/devflow/devflow/bin/lib/state.test.cjs` | 0 | PASS: 34 of 34 |

## Post-TRD Verification

- Auto-fix cycles used: 1 (the verb fix); the E2E1 reconcile was one `sync-roadmap` run
- Must-haves verified: 6/6 (installed record and `.plugin-version` 2.15.0 with the libs byte-identical to the tag; installed build with version 3 and the frozen method; SC-2 unchanged rebuild, frozen copy and kept previous file; SC-3 identical pair, differing control, live file last objective 66; SC-4 path, version, method, text and `trd_level` minutes; 67-FREEZE.md and the STATE.md blocker)
- Gate failures: E2E1 on the first `npm test` run (resolved, see Deviation 2); none on the re-run
- Writes outside the repository: the live calibration written exactly twice (build, identical rebuild); `calibration-9ef7d108.json` and `calibration-f4d1ffa9.json` in `~/.claude/devflow/state/backtest/`; scratch files only otherwise. No `doctor --fix`, no plugin cache directory removed, nothing pushed, port 8080 never used.

## Decisions Made

- The method is not chosen here: SELECTED = `trd_level`, read from `67-VALIDATION.md` `method_selected`.
- The freeze rule: `df-tools calibrate` is not run in any form that writes the live file until objective 75 has scored 68-72; recovery is `cp` of the frozen copy and a sha256 check (full text in `67-FREEZE.md`).
- The check objective 75 applies: for each of 68-72, the run-state history file under `~/.claude/devflow/state/estimates/history/devflow-claude-d3dccfe9/` must carry `estimate.calibration.inputs_digest` equal to the FREEZE `inputs_digest` and `estimate.calibration.method` equal to the frozen method.

## Discovered commands

None. Every command came from `.planning/STACK.md` (`test`: `npm test`, scoped `node --test {files}`).

## Next Objective Readiness

Objectives 68-72 can start: `estimate start|wave` for them will read the frozen calibration and record its `inputs_digest` and method in the run state. Objective 75 applies the check in `67-FREEZE.md` section 3. The repository changes from this TRD (and from 67-06 to 67-09) are local; `origin` has not been pushed. The `state.cjs` fix is not in the installed 2.15.0 mirror until the next release.

## Self-Check: PASSED

- FOUND: `.planning/objectives/67-minutes-recalibration/67-FREEZE.md`
- FOUND: `/Users/justin/.claude/devflow/calibration.json` (sha256 `f4d1ffa9e83276f195870fe51e39148003a8c83ceef2523a2c84847a8fc28134`)
- FOUND: `/Users/justin/.claude/devflow/state/backtest/calibration-f4d1ffa9.json` (cmp equal to the live file)
- FOUND: `/Users/justin/.claude/devflow/state/backtest/calibration-9ef7d108.json` (sha256 `9ef7d108...`)
- FOUND: commits 5a7a2c1e, 9e3cc964, 58ae63e5, 994b93ef, 3dc2255a
