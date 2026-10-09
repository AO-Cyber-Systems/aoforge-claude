---
objective: 61-store-mode-rough-edges-and-observability
trd: "07"
subsystem: health
tags: [model-profiles, model-rates, doctor, validate-health, w063, obs-01]

requires:
  - "61-01: validate health Check 17 (W062) and the one-line-per-owner DEFERRED list in doctor check 22"
provides:
  - "lib/model-currency.cjs: parseModelId(id), compareModelVersions(a, b), currentByFamily(rates), staleModelIds(models, rates) -> [{tier, id, reason: superseded|unpriced, current}], sorted by tier"
  - "references/model-profiles.json pins opus = claude-opus-5-5 and sonnet = claude-sonnet-5-5 (haiku stays claude-haiku-4-5)"
  - "doctor check 13 (model-profiles) warns on a superseded or unpriced pinned id; details.stale and details.rates_source (mirror | installed | engine)"
  - "validate health Check 18: W063 model-id-stale / model-id-unknown / model-id-check-failed, never repairable; options modelProfilesPath / modelRatesPath; doctor check 22 defers W063 to check 13"
  - "Repo guard: model-currency.test.cjs test 6 fails CI when the shipped pins fall behind the shipped model-rates.json"
  - "doctor-fixtures exports a literal MODEL_RATES_JSON; MODEL_PROFILES_JSON carries the current ids"
affects: [61-09]

tech-stack:
  added: []
  patterns:
    - "Currency from data: the priced rate table is the only list of models; a pin is current when no newer version of its family is priced there"
    - "One pure judge (model-currency.staleModelIds), two renderers (doctor check 13, validate Check 18), and check 22 defers the code check 13 owns"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/model-currency.cjs
    - plugins/devflow/devflow/bin/lib/model-currency.test.cjs
    - plugins/devflow/devflow/bin/lib/validate-model-ids.test.cjs
  modified:
    - plugins/devflow/devflow/references/model-profiles.json
    - plugins/devflow/devflow/references/model-profiles.md
    - plugins/devflow/devflow/bin/lib/doctor-checks/13-model-profiles.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/13-model-profiles.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/doctor-fixtures.cjs
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs

key-decisions:
  - "Model id currency is derived from references/model-rates.json (newest priced version per family), never from a hard-coded list; an equal version with a different snapshot or alias is current"
  - "Doctor check 13 judges only well-formed ids for currency, so a malformed id is reported once (structurally), not again as unpriced"
  - "Doctor check 13 reads the rate table beside the profiles copy in use (mirror, else installed), else the engine's own; a rate file that exists but does not load is a warning and the next copy is tried"

requirements-completed: [OBS-01]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0

duration: 10min
completed: 2026-10-06
tokens_input: 13840046
tokens_output: 63758
tokens_cache_read: 13630247
tokens_cache_write: 209613
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 61 TRD 07: Current model ids, and stale-id detection from data Summary

**model-profiles.json now pins claude-opus-5-5 and claude-sonnet-5-5, and a new model-currency module judges every pin against model-rates.json, so doctor check 13, validate health W063 and a CI repo guard all flag a pin the rate table shows superseded.**

## Progress
- [x] Task 1: model-currency.cjs and the current pins — RED 3c1c15e7, GREEN 0f154068
- [x] Task 2: Doctor check 13 flags stale and unpriced pinned ids — RED 2daa7e94, GREEN 82c51e04
- [x] Task 3: validate health Check 18 (W063) and its deferral — RED b470c2ca, GREEN 1e3078db

## Performance

- **Started:** 2026-10-06T19:39:22Z
- **Completed:** 2026-10-06T19:48:55Z
- **Tasks:** 3 (6 commits, strict RED then GREEN)
- **Files:** 3 created, 8 modified

## Accomplishments

- `references/model-profiles.json` and the tier table in `model-profiles.md` pin `claude-opus-5-5` and `claude-sonnet-5-5`. `df-tools resolve-model planner` reports `model_id: claude-opus-5-5`.
- `lib/model-currency.cjs` parses ids into family, numeric version and date snapshot (after `calibration-inputs.normalizeModelId`). It takes the newest priced version per family from `rates.models`, where aliases never count. `staleModelIds` reports `superseded` (a newer version of the family is priced) or `unpriced` (`rateFor` is null).
- Doctor check 13 appends `<copy> model-profiles.json: models.<tier> = <id> is superseded by <current> (model-rates.json)` or `... is not in model-rates.json, so its currency cannot be checked`. It does this after the structural and drift findings, and the `+N more` cap still applies. The check takes its rate table from the same copy as the profiles, else the installed plugin's, else the engine's `RATES_PATH`. It never reads `os.homedir()`.
- Validate health Check 18 comes directly after 61-01's Check 17. It emits W063 as a warning that is never repairable, and a failure to run is reported as W063 `model-id-check-failed`, never silently. Doctor check 22 defers W063 to check 13, with a one-line owner entry.
- The repo guard (model-currency test 6) fails CI the day `model-rates.json` gains a newer model while the pins stay put.

## Task Commits

1. **Task 1: model-currency.cjs and the current pins**: `3c1c15e7` (test), `0f154068` (feat)
2. **Task 2: Doctor check 13 flags stale and unpriced pinned ids**: `2daa7e94` (test), `82c51e04` (feat)
3. **Task 3: validate health Check 18 (W063) and its deferral**: `b470c2ca` (test), `1e3078db` (feat)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `node --test plugins/devflow/devflow/bin/lib/model-currency.test.cjs plugins/devflow/devflow/bin/lib/model-profiles.test.cjs plugins/devflow/devflow/bin/lib/calibration-inputs.test.cjs` (110/110) | 0 | PASS |
| 1 | `node plugins/devflow/devflow/bin/df-tools.cjs resolve-model planner` → `model_id: claude-opus-5-5` (balanced profile, opus tier) | 0 | PASS |
| 2 | `node --test .../doctor-checks/13-model-profiles.test.cjs .../doctor-checks/11-12-install.test.cjs` (42/42) and `node --test .../doctor.e2e.test.cjs` (8/8) | 0 | PASS |
| 3 | `node --test .../validate-model-ids.test.cjs .../validate.test.cjs .../validate-checks-pin.test.cjs .../doctor-checks/21-22-project.test.cjs` (138/138) | 0 | PASS |
| 3 | `node plugins/devflow/devflow/bin/df-tools.cjs validate health --raw` in the checkout: no W063 (only the pre-existing W006 x3, W021, W040) | 0 | PASS |

Also run: `doctor-cli.test.cjs`, `doctor.test.cjs`, `10-runtime-mirror.test.cjs`, `14-skill-requires.test.cjs` (83/83), plus `ui-sheet.test.cjs`, `devflow-workflows.repo.test.cjs` and `gh-enforcement.e2e.test.cjs` (48/48). These are the other suites that read model-profiles.json, or that load validate.cjs from the workflow's sparse checkout.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED 1 | `node --test .../model-currency.test.cjs` (module missing) | 1 | FAIL (correct) |
| GREEN 1 | same + model-profiles + calibration-inputs | 0 | PASS (correct) |
| RED 2 | `node --test .../doctor-checks/13-model-profiles.test.cjs` (11 new fail, 13 existing pass) | 1 | FAIL (correct) |
| GREEN 2 | same + 11-12-install + doctor.e2e | 0 | PASS (correct) |
| RED 3 | `node --test .../validate-model-ids.test.cjs .../doctor-checks/21-22-project.test.cjs` (6 fail: 4 W063 render, DEFERRED pin, W063 deferral) | 1 | FAIL (correct) |
| GREEN 3 | same + validate.test + validate-checks-pin | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task, scoped) | `node --test model-currency.test.cjs doctor-checks/13-model-profiles.test.cjs validate-model-ids.test.cjs doctor-checks/21-22-project.test.cjs` (67/67) | 0 | PASS |
| test (full, `npm test`) | `npm test` in the worktree: 10338 tests, 10277 pass, 11 fail, 50 skipped | 1 | PASS for this TRD (see note) |

None of the 11 full-suite failures is in a suite this TRD touched. Ten are the known worktree-environment failures: `devflow-watch.test.cjs` x3, `handoff-e2e.test.cjs` x6 and `stack-drafter-fleet.test.cjs` x1. The eleventh is `roadmap-reconcile.test.cjs` E2E1. That self-test flags the ROADMAP line `- [ ] 61-07-...` because this TRD's checkpointed SUMMARY already exists. It is the expected state between the checkpoint and `roadmap update-job-progress`, which runs right after this SUMMARY is posted, and it is re-checked there.

## Files Created/Modified

- `plugins/devflow/devflow/bin/lib/model-currency.cjs`: parse, compare, current-by-family, stale pins
- `plugins/devflow/devflow/bin/lib/model-currency.test.cjs`: tests 1-6, including the repo guard
- `plugins/devflow/devflow/bin/lib/validate-model-ids.test.cjs`: tests 12-15 (Check 18 rendering)
- `plugins/devflow/devflow/references/model-profiles.json` / `.md`: current pins, and a sentence on doctor check 13 / W063
- `plugins/devflow/devflow/bin/lib/doctor-checks/13-model-profiles.cjs`: rate-table resolution, stale findings, rewritten header
- `plugins/devflow/devflow/bin/lib/doctor-checks/13-model-profiles.test.cjs`: tests 7-11; 12d now supplies its own rate table
- `plugins/devflow/devflow/bin/lib/__fixtures__/doctor-fixtures.cjs`: current ids in `MODEL_PROFILES_JSON`, new literal `MODEL_RATES_JSON`
- `plugins/devflow/devflow/bin/lib/validate.cjs`: Check 18 (W063)
- `plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs` / `21-22-project.test.cjs`: W063 deferred to check 13

## Decisions Made

- Doctor check 13 sends only well-formed ids (those matching its `MODEL_ID_RE`) to `staleModelIds`. Without this, `opus-latest` would be reported twice: once as malformed and again as unpriced.
- When a rate file exists in a copy but does not load, doctor check 13 warns (`<copy> model-rates.json could not be read (...)`) and tries the next copy. A missing file is skipped silently. `details.rates_source` names the table actually used.
- When an id is unpriced, `current` still carries the family's current id where the family parses (`claude-opus-9` → `claude-opus-5-5`), and is `null` otherwise.
- The W063 message text lives in validate.cjs and the doctor fragment text lives in check 13. That is two short copies, below the extract-on-the-third threshold.

## Deviations from Plan

### Adjusted existing test

**1. 13-model-profiles test 12d now writes its own mirror rate table**
- **Found during:** Task 2
- **Issue:** 12d pins `claude-opus-4-7[1m]` and `claude-sonnet-4-5-20250929` to prove the id shape is valid. With stale detection in place and no rate table beside the copy, the check falls back to the engine's table, where opus-4-7 is superseded and sonnet-4-5-20250929 is unpriced, so the test would warn.
- **Fix:** 12d writes a literal mirror `model-rates.json` in which those ids are the newest, so the test still checks only the shape and still expects `ok`. Its assertion is unchanged.
- **Commit:** 2daa7e94

Otherwise the TRD was executed as written. No `MODEL_PROFILES_JSON` consumer outside check 13's tests pinned the old ids, and `model-profiles.test.cjs` already read `model_id` from the JSON.

## Issues Encountered

None.

## Follow-ups

- `plugins/devflow/devflow/bin/lib/doctor-checks/README.md` lists W057-W061 and W062 deferrals in its `20-29` row, but its `10-19` row does not say that check 13 owns W063. This TRD does not name the README, and a sibling wave TRD may edit it, so the note is left for 61-09 (docs).
- The home runtime mirror (`~/.claude/devflow`) still pins `claude-opus-5` / `claude-sonnet-5` until the release is mirrored. Once a mirror carries this code, `df-tools doctor` check 13 will warn on any mirror still behind its own rate table. That is the intended behaviour.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (pins current; currency derived from model-rates.json; check 13 warns naming tier, pinned id and current id; W063 plus check 22 deferral; repo guard)
- Gate failures: None in the touched suites. Full-suite failures are listed in Validation Gate Results.

## Next Objective Readiness

61-09 (dogfood and docs) can document W063 and the check 13 currency rule.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/model-currency.cjs
- FOUND: plugins/devflow/devflow/bin/lib/model-currency.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/validate-model-ids.test.cjs
- FOUND commits on df/exec-61-07-current-model-ids: 3c1c15e7, 0f154068, 2daa7e94, 82c51e04, b470c2ca, 1e3078db
- Working tree clean after the last task commit; the scoped task gate passes 67/67
