---
objective: 69-drafts-health-and-doctor
trd: "02"
subsystem: validate-health
tags: [skill-active, edit-gate, validate-health, doctor-git, check-ignore, repair]
requires: []
provides:
  - "lib/skill-marker-health.cjs: inspect / planRepair / findings / repair for .planning/.skill-active, shared by validate health and (69-04) doctor check 23"
  - "doctor-git.checkIgnored(root, paths, opts): the repository's own ignore rules, global excludes off"
  - "validate health Check 19: E006 skill-marker-tracked (error), W064 skill-marker-stale (warning), W064 skill-marker-check-failed"
  - "validate health --repair untracks and/or removes only the marker, behind the DOC-06 index guard"
  - "__fixtures__/skill-marker-fixtures.cjs makeMarkerProject: every row of the decision table in one call"
affects: [69-04 doctor check 23 and check 22 deferral, 69-05 validate wiring, 69-06 docs]
tech-stack:
  added: []
  patterns: [inspect-plan-repair split (read-only plan object the repair executes after re-inspecting), fail-closed staleness, guarded index change]
key-files:
  created:
    - plugins/devflow/devflow/bin/lib/skill-marker-health.cjs
    - plugins/devflow/devflow/bin/lib/skill-marker-health.test.cjs
    - plugins/devflow/devflow/bin/lib/validate-skill-marker.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/skill-marker-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/doctor-git.cjs
    - plugins/devflow/devflow/bin/lib/doctor-git.test.cjs
    - plugins/devflow/devflow/bin/lib/validate.cjs
key-decisions:
  - "A tracked marker that is live and NOT ignored is not repairable: untracking it would leave it one `git add -A` from being tracked again, and the repair never edits .gitignore. planRepair checks this before the DOC-06 guard because it is a permanent condition, while a staged file is transient."
  - "A tracked stale marker is ONE finding (E006 carrying the stale reason), never E006 plus W064."
  - "repair() re-inspects, then untracks before it unlinks, so a refused or failed `git rm --cached` can never leave a tracked file deleted from the working tree."
  - "doctor-git git() gained an opts.input (stdin) so checkIgnored can feed check-ignore --stdin -z; every other caller still sends an empty stdin."
requirements-completed: [TOOL-09]
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true
duration: 10min
completed: 2026-10-08
tokens_input: 7312314
tokens_output: 58749
tokens_cache_read: 7151569
tokens_cache_write: 160635
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 69 TRD 02: Skill marker health check Summary

`validate health` now reports a tracked `.planning/.skill-active` as E006 (an error) and a stale untracked one as W064, and `--repair` untracks and/or removes that one file behind the DOC-06 guard and nothing else.

## Progress
- [x] Task 1: Marker-project fixture builder — 4887590a
- [x] Task 2: skill-marker-health.cjs and doctor-git.checkIgnored (tests 11-17) — 5ba8ec70 (RED 92ec212b)
- [x] Task 3: validate health Check 19 and its repair (tests 1-10) — 10afa68e (RED a42eeb73)

## What was built

- `lib/skill-marker-health.cjs` (new): `MARKER_REL`, `CODES`, `classifySkillActive` (copied verbatim from doctor check 23, header notes 69-04 deletes that copy), `inspect`, `planRepair`, `findings`, `repair`. It never prints, exits or reads the home directory.
- `doctor-git.checkIgnored`: `git -c core.excludesFile=<os.devNull> check-ignore --no-index --stdin -z`, so a tracked file still reports its rule and the user's global excludes never answer for the repository.
- `validate.cjs` Check 19 after Check 18: renders the findings with `addIssue`, queues `repairSkillMarker` at most once, and reports a check that cannot run as W064 `skill-marker-check-failed`. The repair case emits `untrackSkillMarker` / `removeStaleSkillMarker` (`path: '.skill-active'`, relative to `.planning/` as doctor check 22 expects) or a failed `repairSkillMarker` carrying the refusal. `options.nowMs` and `options.skillMarkerHealth` are test seams; the dispatcher still passes only `{ repair }`.
- `__fixtures__/skill-marker-fixtures.cjs`: `makeMarkerProject({git, marker, tracked, ignored, stagedOther, now})` with `MARKERS(now)` literal bodies.

Decision table as built (see the module header): untracked live none; untracked stale W064 and unlink; tracked stale E006 and untrack plus unlink; tracked missing E006 and untrack; tracked live ignored E006 and untrack keeping the file; tracked live not ignored E006 and refused (fix names `.gitignore`); any tracked with an unrelated staged change or dirty `.gitignore` E006 and refused with the guard's reason.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Marker-project fixture builder | `node -e "const f=require('.../skill-marker-fixtures.cjs'); const p=f.makeMarkerProject({marker:'expired', tracked:true}); console.log(JSON.stringify(p.tracked()), p.porcelain()===''); p.cleanup()"` printed `[".planning/.skill-active"] true` | 0 | PASS |
| 2: skill-marker-health + checkIgnored | `node --test lib/skill-marker-health.test.cjs lib/doctor-git.test.cjs` (61 tests) | 0 | PASS |
| 3: validate health Check 19 | `node --test lib/validate-skill-marker.test.cjs lib/validate.test.cjs lib/validate-model-ids.test.cjs lib/doctor-checks/21-22-project.test.cjs lib/skill-marker-health.test.cjs lib/doctor-git.test.cjs` (151 tests) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 2) | `node --test lib/skill-marker-health.test.cjs lib/doctor-git.test.cjs` (module missing; `dg.checkIgnored is not a function`) | 1 | FAIL (correct) |
| GREEN (task 2) | same | 0 | PASS (correct) |
| RED (task 3) | `node --test lib/validate-skill-marker.test.cjs` (12 of 14 fail: no Check 19) | 1 | FAIL (correct) |
| GREEN (task 3) | same | 0 | PASS (correct) |

REFACTOR: none needed.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` over the six files above | 0 | PASS |
| test (full) | `npm test` | 1 | known failures only, see below |
| lint / typecheck / build | none in the stack profile | n/a | not_available |

Full suite after Task 3: 11343 tests, 14 failures.
- 10 are `devflow-watch` / `handoff-e2e` daemon tests that also fail on the untouched base (environment: the daemon never writes its PID file; the TRD's MA-7 note). The base run showed 11 of them; one (C-1) is timing-flaky.
- 3 are new and caused by this TRD, by design of the wave order: `doctor.e2e.test.cjs` tests 1, 3 and 6. Their fixture really does hold a stale marker (`expires_at: 2026-01-01T00:00:00.000Z`), so doctor check 22 (`validate-health`) now reports the new W064 as an ordinary health issue, and check 23 also reports it. The TRD forbids editing check 22 here; 69-04 (wave 2, `depends_on: ["69-02"]`) adds E006 and W064 to its `DEFERRED` list and adjusts the e2e assertions. Until 69-04 lands those three fail.
- 1 is `roadmap-reconcile.test.cjs` E2E1 (self-test: this repo's ROADMAP shows zero drift). It failed from the first SUMMARY checkpoint on, because a TRD had a SUMMARY while its ROADMAP checkbox was unticked. `roadmap update-job-progress 69` ticked 69-02 and the file's 63 tests then passed (E2E1 included).

## Discovered commands

None. Every command came from the stack profile (`npm test`, scoped `node --test {files}`).

## Deviations from Plan

None to the TRD's behavior. Additions inside the TRD's scope:

- **[Test coverage] Two extra Check 19 tests** beyond the listed ten: a repair the module refuses surfaces as a failed `repairSkillMarker` action, and `repairSkillMarker` is queued at most once. Both exercise the wiring through an injected `skillMarkerHealth`.
- **[Test seam] In-process validate tests point git at the fake HOME** by setting `HOME`, `XDG_CONFIG_HOME` and `GIT_CONFIG_NOSYSTEM` for the duration of a run (restored after), because Check 19 passes `process.env` to doctor-git. The spawned test 1 gets the same through `gitEnv(home)`.
- **[Known interim failure] doctor.e2e.test.cjs 1, 3, 6** (above). Not a defect of this TRD and not edited here, per the TRD's own recovery note; owned by 69-04.

## Auth gates

None.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (E006/W064 reporting; live untracked quiet; tracked stale repair leaves exactly `D  .planning/.skill-active` with HEAD unmoved and every other file byte-identical (test 1, spawned CLI); tracked live ignored untracks and keeps the file byte-identical, tracked live not ignored changes nothing and names `.gitignore` (tests 6, 7); DOC-06 guard refuses with an unrelated staged change and removes nothing (test 8); a failing check is reported as W064 `skill-marker-check-failed` (test 10))
- Success criteria: `rg -n "E006|W064" validate.cjs` finds only the Check 19 block (lines 789 and 803 at commit time)
- Gate failures: the three doctor e2e tests described above (owned by 69-04) and the environment daemon failures; the ROADMAP self-test was fixed by the roadmap update
- Not run: `df-tools validate health` against this repository itself (the TRD forbids using this repository's `.planning/.skill-active`); every case ran against a temp fixture, plus the spawned CLI in test 1

## Self-Check: PASSED

- Created files found: `skill-marker-health.cjs`, `skill-marker-health.test.cjs`, `validate-skill-marker.test.cjs`, `__fixtures__/skill-marker-fixtures.cjs`.
- Commits found in `git log`: 4887590a, 92ec212b, 5ba8ec70, a42eeb73, 10afa68e.
- The module calls neither `output()`/`error()` nor `os.homedir()` (`rg` found none).
