---
objective: 52-store-mode-polish
trd: "04"
subsystem: migrations
tags: [upgrade, migration-0011, mirror-mode, github, opt-out, w040, config, tdd]

requires:
  - objective: 51-github-migration-and-docs
    provides: "migration 0011 github-store-backfill (detect, apply, migrate), useBackfillEnv fixture, Check 13 W040 harness"
provides:
  - "github.mirror_only config key (template default false; recorded with `df-tools config-set github.mirror_only true`)"
  - "0011 detect: store off + github.mirror_only true -> {applies: false, reason: MIRROR_ONLY}, checked before the planImport dry run"
  - "0011 store-off applies reason ends with the opt-out: ' To keep mirror mode instead: `df-tools config-set github.mirror_only true`.'"
  - "gh-sync migrate step 2b third option Keep mirror mode; health workflow step 4 0011 bullet (Migrate now / Not now / Keep mirror mode); health step 5 store-mode commit note"
affects: [52-06]

tech-stack:
  added: []
  patterns:
    - "a GitHub-mode opt-out lives in tracked config and gates one migration's detect, never a generic decline-any-migration mechanism"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs
    - plugins/devflow/devflow/bin/lib/validate.test.cjs
    - plugins/devflow/devflow/templates/config.json
    - plugins/devflow/skills/gh-sync/SKILL.md
    - plugins/devflow/devflow/workflows/health.md

key-decisions:
  - "The opt-out is read as `gate.config.mirror_only === true` from client.requireEnabled (the github block 0011 already reads), inside the store-off branch and before planImport, so an opted-out project pays no dry-run cost and detect stays offline with zero writes."
  - "Only boolean true opts out (a string \"true\" or false still applies). With the store on the key is ignored, so a pending journal, un-baselined cache files or the 0010 hand-off still make 0011 apply."
  - "No change to upgrade.cjs: its existing `if (!det.applies) skipped` path, which runs before the confirm selection, already blocks `--apply --confirm` and `--apply --only 0011 --confirm`, and Check 13 W040, doctor check 21 and the upgrade-project.js pending-confirm notice all read pending_confirm."
  - "config-get needs no code change: adding `mirror_only: false` to templates/config.json makes it a documented default, so `config-get github.mirror_only` prints false on a project that never set it."
  - "Health step 4 never applies 0011 inline: Migrate now hands off to /devflow:gh-sync migrate (dry run, approval, apply, drain, commit steps)."

requirements-completed: ["52-5"]

duration: 11min
completed: 2026-10-04
---

# Objective 52 TRD 04: Mirror-only opt-out Summary

**A recorded `github.mirror_only: true` in tracked config makes migration 0011 skip while the store is off, so a project that keeps GitHub in mirror mode stops seeing 0011 in pending_confirm, W040, doctor check 21 and the SessionStart nudge; with the store on the key is ignored.**

## Progress
- [x] Task 1: 0011 detect honours github.mirror_only while the store is off — 93203dab (RED), 4d30860b (GREEN)
- [x] Task 2: gh-sync migrate and the health confirm step offer "keep mirror mode" — b16f0ced

## Performance

- **Duration:** 11 min
- **Started:** 2026-10-04T14:32:33Z
- **Completed:** 2026-10-04T14:43:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- `templates/config.json` gains `github.mirror_only: false` right after `store`, so `config-get github.mirror_only` answers `false` by default and `config-set github.mirror_only true` stores a real boolean (checked in a scratch project).
- 0011 `detect` returns `{applies: false, reason: MIRROR_ONLY}` for enabled + store off + `mirror_only === true`, with the locked reason text. The store-off applies reason now ends with the locked opt-out sentence. The header detect table documents the new row.
- 9 new tests: 6 in a `0011 mirror-mode opt-out (52-04)` describe (check -> skipped and up_to_date; apply with `confirm` and with `only: ['0011']` leave the store off with zero gh calls; detect opt-out with no writes; string/false still apply; store on + pending journal still applies; store-off reason names the opt-out), plus validate.test.cjs Check 13 tests 16-18 (no W040 when opted out; the positive control without the key gives exactly one W040 "1 need confirmation"; `config-get github.mirror_only` prints false).
- gh-sync SKILL.md step 2a names the `mirror mode kept (github.mirror_only: true)` skipped reason and asks before `config-set github.mirror_only false`; step 2b offers **Keep mirror mode** ("don't ask again"), recorded with `config-set` + `df-tools commit --files .planning/config.json`.
- health.md step 4 has a 0011 bullet (Migrate now hands off to `/devflow:gh-sync migrate`, Not now, Keep mirror mode adds `.planning/config.json` to step 5's commit). The declined-migrations line now reads "except 0011 when mirror mode is kept". Step 5 has a store-mode note with the `devflow-upgrade` branch + logged-escape sequence and the `gh pr start <objective>` alternative, matching doctor check 21 (TRD 52-01).

## Task Commits

1. **Task 1 RED: failing tests for the opt-out** - `93203dab` (test)
2. **Task 1 GREEN: 0011 honours github.mirror_only** - `4d30860b` (fix)
3. **Task 2: gh-sync and health offer Keep mirror mode** - `b16f0ced` (docs)

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs` - MIRROR_ONLY / KEEP_MIRROR constants, the store-off early return, header table row
- `plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs` - test-list items 2-7
- `plugins/devflow/devflow/bin/lib/validate.test.cjs` - test-list items 1 and 8 (Check 13 tests 16-18)
- `plugins/devflow/devflow/templates/config.json` - `github.mirror_only: false`
- `plugins/devflow/skills/gh-sync/SKILL.md` - steps 2a/2b
- `plugins/devflow/devflow/workflows/health.md` - steps 4 and 5

## Decisions Made
See key-decisions in the frontmatter.

## Deviations from Plan

None. The TRD was executed as written. Notes on its contingency branches:
- Test 2b's reason assertions are regex matches, so the appended sentence did not break them (the `<recovery>` step was not needed).
- `config.test.cjs` and `0001-config-stamp.test.cjs` read the template's github keys rather than pinning a list, so neither needed an update. Migration 0001's detect applies only on missing sections, not missing keys, so the new key does not make 0001 pending anywhere.
- `gh-sync-skill.repo.test.cjs` does not pin the two-option question, so it needed no change.
- Tests 2 and 3 pass `options: { maxOps: 0 }` to `upgrade.apply` so that, in the RED state, the unguarded 0011 apply stopped `pending` right after the queue instead of draining.

## Issues Encountered
- `summary checkpoint` writes the SUMMARY into the main checkout (`/Users/justin/dev/devflow-claude/.planning/objectives/52-store-mode-polish/52-04-SUMMARY.md`) even from a worktree, by design. Each checkpoint was copied into this worktree and committed on `df/exec-52-04`. The main-checkout copy is untracked. Before merging this branch in the main checkout, remove or overwrite it: git refuses a merge that would overwrite an untracked file, even one with identical content (verified in a scratch repo). Peer TRDs 52-02, 52-03 and 52-05 left the same kind of copies.
- `requirements mark-complete 52-5` reported `REQUIREMENTS.md not found`. This repo tracks requirements in OBJECTIVE.md, so nothing was marked.
- `state advance-job` reported `last_job` (STATE.md does not track a per-objective TRD counter here) and `state update-progress` reported no Progress field. Both were no-ops; `record-metric`, `add-decision` and `record-session` were recorded.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 (RED) | `node --test --test-name-pattern="52-04\|mirror_only\|^1[678]\." 0011-github-store-backfill.test.cjs validate.test.cjs` | 1 | FAIL (correct): 6 fail (2, 3, 4, 7, 16, 18); 5, 6 and the 17 control pass by design |
| 1 (GREEN) | `node --test 0011-github-store-backfill.test.cjs validate.test.cjs config.test.cjs 0001-config-stamp.test.cjs doctor-checks/21-22-project.test.cjs` | 0 | PASS: 175/175 (baseline 166 + 9 new) |
| 1 (neighbours) | `node --test gh-capability.test.cjs gh-sync-store.test.cjs awareness.test.cjs upgrade.test.cjs 0010-store-gitignore.test.cjs` | 0 | PASS: 266 pass, 9 skipped |
| 2 | `node --test gh-sync-skill.repo.test.cjs planning-writes.repo.test.cjs doc-refs.repo.test.cjs devflow-workflows.repo.test.cjs` | 0 | PASS: 42/42 |
| 2 | `rg -n 'mirror_only' skills/gh-sync/SKILL.md workflows/health.md` | 0 | PASS: SKILL.md:40, SKILL.md:44, health.md:189 |
| verification | `df-tools --cwd <scratch> config-get github.mirror_only` (key unset) | 0 | PASS: prints `false` |
| verification | `rg -n 'mirror_only' 0011-github-store-backfill.cjs` | 0 | PASS: the constant (77-79) and the store-off check (215) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 1 | PASS apart from known failures: 8798 tests, 8737 pass, 11 fail, 50 skipped. 10 failures are in devflow-watch.test.cjs and handoff-e2e.test.cjs (`Cannot find module 'node-pty'`). They are pre-existing: a `git archive` export of WAVE_BASE 67f87a01 fails 11 tests in those same two files. The 11th failure, roadmap-reconcile E2E1, was this TRD's own checkpoint SUMMARY ahead of its ROADMAP checkbox. It passes after `roadmap update-job-progress 52` |
| roadmap self-test re-run | `node --test --test-name-pattern=E2E1 roadmap-reconcile.test.cjs` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test --test-name-pattern="52-04\|mirror_only\|^1[678]\." 0011-github-store-backfill.test.cjs validate.test.cjs` | 1 | FAIL (correct): 0011 was still in pending_confirm; the unguarded apply ran 0011 and switched the store on; config-get reported Key not found |
| GREEN | Task 1 verify command (5 files) | 0 | PASS (correct): 175/175 |
| REFACTOR | none needed | - | - |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (skipped and not pending_confirm; no W040 with the key and one W040 without it; apply --confirm and --only 0011 leave the store off; store on ignores the key; only boolean true counts and the store-off reason names `config-set github.mirror_only true`; `config-get` default false; both prose entry points record it with config-set)
- Gate failures: None attributable to this TRD (the node-pty daemon failures are pre-existing)

## Next Objective Readiness
- TRD 52-06 (docs) should replace docs/USER-GUIDE.md:763 ("there is no opt-out key yet") with `github.mirror_only`, and add the key to CHANGELOG [Unreleased].

## Self-Check: PASSED

- FOUND: all 6 modified files
- FOUND: 93203dab, 4d30860b, b16f0ced on df/exec-52-04
- Scope: `git diff --name-only 67f87a01 HEAD` lists only files_modified plus this SUMMARY
