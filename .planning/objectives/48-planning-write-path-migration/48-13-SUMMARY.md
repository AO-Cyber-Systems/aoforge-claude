---
objective: 48-planning-write-path-migration
trd: "13"
subsystem: github-sync
tags: [store-mode, generated-views, state, roadmap, sync-roadmap, characterization, tdd]

requires:
  - objective: 48-planning-write-path-migration
    provides: "48-01 planning-mode.isStoreMode (main-checkout config, strict booleans)"
provides:
  - "state.cjs: store-mode branch for every STATE.md mutator (state.json only, target/note), add-decision `decision open` hint; exports STORE_NOTE, DECISION_HINT"
  - "roadmap.cjs: store-mode no-op for `roadmap update-job-progress`; exports ROADMAP_STORE_SKIP"
  - "roadmap-reconcile-cli.cjs: store-mode no-op for writing `sync-roadmap` modes (write, --interactive); --dry-run unchanged"
affects: [48-08, 48-09, 48-15]

tech-stack:
  added: []
  patterns:
    - "Characterization first: local-mode bytes pinned and committed green before any production change"
    - "Mode read once per command via planning-mode.isStoreMode(cwd); no module reads github.store itself"
    - "Generated-view writers no-op with exit 0 and a regenerate hint (never error: workflows call them unconditionally)"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/state.cjs
    - plugins/devflow/devflow/bin/lib/state.test.cjs
    - plugins/devflow/devflow/bin/lib/roadmap.cjs
    - plugins/devflow/devflow/bin/lib/roadmap.test.cjs
    - plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.cjs
    - plugins/devflow/devflow/bin/lib/roadmap-reconcile-cli.test.cjs

key-decisions:
  - "Store-mode `state record-metric` appends {objective, job, duration, tasks, files} to a new state.json `metrics_log` (it never maintained state.json before); STATE_ARCHIVE.md (runtime) is still written"
  - "Store-mode mutators do not require STATE.md to exist (the view may not be rendered yet); advance-job reads a rendered STATE.md only as the counters' fallback"
  - "add-decision hint: JSON `hint` key; under --raw stdout stays `true` and the hint goes to stderr"
  - "sync-roadmap: default write and --interactive (TTY or non-TTY fallback) no-op in store mode; --dry-run runs unchanged"

patterns-established:
  - "Later 48 TRDs reuse ROADMAP_STORE_SKIP / STORE_NOTE rather than restating the store-mode messages"

requirements-completed: [GWP-01, GWP-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 14min
completed: 2026-10-01
---

# Objective 48 TRD 13: Generated-view writers in store mode Summary

**In store mode the STATE.md mutators record into the per-clone `state.json` and say `target: 'state.json'`.
`roadmap update-job-progress` and the writing `sync-roadmap` modes are exit-0 no-ops that point at `df-tools gh pull --all`.
Local mode is pinned byte-for-byte by characterization tests that were committed before any change.**

## Performance

- Started 2026-10-01T12:18Z, finished 2026-10-01T12:32Z (about 14 min)
- 2 tasks, 6 commits (characterization, RED and GREEN for each task), 6 files modified

## Accomplishments

- **state.cjs.** `storeMode(cwd)` delegates to `planning-mode.isStoreMode` and is read once per command. In store mode:
  - `update` and `patch` write to `fields[<field>]`. Patch reports every pair as updated, because there is no STATE.md that could lack a field.
  - `advance-job` and `update-progress` keep their state.json half and skip STATE.md.
  - `add-blocker` and `resolve-blocker` write to `blockers`.
  - `record-session` writes to `session_log` as `{at, stopped_at, resume_file}`.
  - `record-metric` writes to `metrics_log`.
  - Each of these outputs today's keys plus `target: 'state.json'` and `note: 'STATE.md is a generated view in store mode'`.
  - `add-decision` still appends to STATE_ARCHIVE.md and to state.json, and adds the hint `durable decisions belong in GitHub: df-tools decision open <trd> --question <text>`.
  - `writeStateJson` is still the only writer of state.json.
- **roadmap.cjs.** `cmdRoadmapUpdateJobProgress` returns early in store mode with
  `{updated:false, skipped:'store-mode', message:'ROADMAP.md is generated in store mode; run \`df-tools gh pull --all\`'}`. Under `--raw` it prints `skipped`.
- **roadmap-reconcile-cli.cjs.** Store mode is checked before the TTY handling, so `--interactive` no-ops instead of falling back to a write.

### sync-roadmap subcommand list (cmdSyncRoadmapRoute)

| Mode | Writes ROADMAP.md (local) | Store mode |
|---|---|---|
| default (`write`) | yes, via reconcile write mode | no-op, exit 0, `gh pull --all` message |
| `--interactive` (TTY: applies accepted changes; non-TTY: falls back to write) | yes | no-op (checked before the TTY handling, so there is no fallback warning) |
| `--dry-run` | no | runs unchanged (output identical to local mode apart from the temp path) |
| `--raw` | output flag only | `skipped` in place of the drift summary in writing modes |

Untouched as the TRD requires: `cmdMilestoneComplete` (48-15), `state load|get|snapshot`, `roadmap get-objective|analyze`, `progress`.
Test 8c checks that `roadmap get-objective` and `roadmap analyze` give the same output in store mode as in local mode.

## Task Commits

| Task | Characterization | RED | GREEN |
|---|---|---|---|
| 1: state.cjs store mode | 07702d4 test(48-13): characterize local-mode STATE.md mutators | 1c62a3d test(48-13): state mutators in store mode | 2907252 feat(48-13): state mutators write state.json only in store mode |
| 2: roadmap no-ops | 18d031d test(48-13): characterize local-mode roadmap writers | 97d3507 test(48-13): roadmap writers are no-ops in store mode | 8308532 feat(48-13): roadmap writers defer to gh pull --all in store mode |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: state.cjs | `node --test plugins/devflow/devflow/bin/lib/state.test.cjs` | 0 | PASS (37/37) |
| 2: roadmap | `node --test .../roadmap.test.cjs .../roadmap-reconcile-cli.test.cjs .../roadmap-reconcile.test.cjs` | 0 | PASS (125/125) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| CHAR 1 (tests 1-3) | `node --test .../state.test.cjs` | 0 | PASS on unchanged code (correct) |
| RED 1 (tests 5-7, 10) | `node --test .../state.test.cjs` | 1 (11 fail: no `target`/`hint`; test 10 guard passes) | FAIL (correct) |
| GREEN 1 | `node --test .../state.test.cjs` | 0 | PASS (correct) |
| CHAR 2 (test 4) | `node --test .../roadmap.test.cjs .../roadmap-reconcile-cli.test.cjs` | 0 | PASS on unchanged code (correct) |
| RED 2 (tests 8-9, 10) | same | 1 (8, 8b, 9a-9c fail; 8c/9d read-only and 10 local guards pass) | FAIL (correct) |
| GREEN 2 | same + `roadmap-reconcile.test.cjs` | 0 | PASS (correct) |

No REFACTOR commits were needed.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test state.test.cjs roadmap.test.cjs roadmap-reconcile-cli.test.cjs` | 0 | PASS (102/102) |
| regression | `node --test df-tools.test.cjs roadmap-progress.test.cjs` | 0 | PASS (161/161) |
| full suite | `node --test` over the three `npm test` globs (worktree, absolute paths) | 0 | PASS: 7211 tests, 7178 pass, 0 fail, 33 skipped |

### Store-off invariant (this repo)

- `planning-mode.planningMode(<worktree>)` gives `{"mode":"local","reason":"github.enabled is not true","root":"/Users/justin/dev/devflow-claude"}`.
- `df-tools --cwd <worktree> state load --raw` produced the same output before the change and after it (12 lines, `model_profile=balanced`
  … `state_exists=true`).
- Local-mode bytes are pinned by characterization tests 1-4. Test 10 (`github.enabled` without `store`) passes in all three test files.

## Deviations from Plan

**1. [Rule 2 - Missing functionality] `record-metric` gets a state.json record in store mode.** The TRD's field mapping says
`record-metric` "already maintains state.json counters". It does not: today it writes only STATE_ARCHIVE.md. Reporting
`target:'state.json'` without writing state.json would be false. Store mode therefore appends to a new `metrics_log` array.
`readStateJson` consumers ignore unknown keys, the same rule the TRD gives for `fields`. The archive row is still written
because 48-01 classes STATE_ARCHIVE.md as runtime. Commit 2907252.

Within the TRD's latitude:
- In store mode the mutators no longer error when STATE.md is missing, because the generated view may not be rendered yet (test 6h).
- Under `--raw`, add-decision's hint goes to stderr, so scripts that read the `true` on stdout keep working.

## Observations (pre-existing, pinned, not changed)

- **`add-decision` on a freshly seeded STATE_ARCHIVE.md leaves `- *()*`.** The `None yet` scrub runs before the `*(none yet)*`
  scrub and removes the inner text. Characterization test 3 pins this, so a fix belongs in its own change, with that test updated.
- **`roadmap update-job-progress` on a complete objective keeps the existing verb.** The result reads `2/2 jobs executed`, not
  `jobs complete`. Test 4b pins this.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5. These cover: local bytes pinned; store-mode STATE.md mutators target state.json with the note;
  add-decision archive + hint; roadmap writers exit 0 with the `gh pull --all` message and ROADMAP.md untouched, with read-only
  commands unchanged; mode read only through planning-mode.
- Gate failures: None

## Self-Check: PASSED

- FOUND: all 6 modified files (each ran under `node --test` above)
- FOUND: commits 07702d4, 1c62a3d, 2907252, 18d031d, 97d3507, 8308532 (`git log fdfb4b4..HEAD`)
- STATE.md / ROADMAP.md deliberately not edited: the orchestrator updates them after merging the wave
