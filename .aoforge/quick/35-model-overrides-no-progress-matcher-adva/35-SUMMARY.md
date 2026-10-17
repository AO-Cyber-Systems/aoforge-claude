---
objective: quick-35
trd: 01
subsystem: aof-tools (models, state, stack packs) and hooks
tags: [model-profiles, agent_models, model_overrides, guard-no-progress, hooks-matcher, advance-job, state-archive, stack-packs, stack-verify]
requires: []
provides:
  - "resolveAgentModel(cwd, agentType, {objective, focus, escalateFrom}): the one model resolver for resolve-model and every init command"
  - "hooks/__fixtures__/claude-matcher.js matcherFires(matcher, value): Claude Code's tool-event matcher rule"
  - "state advance-job JSON: files_changed + archive_updated; STATE_ARCHIVE.md seeded whenever STATE.md is written"
  - "stack-packs.cjs unavailableSelectedPacks({projectRoot, userHome, active})"
affects: [resolve-model, init execute-objective, init quick, guard-no-progress registration, execute-trd.md, execute-objective.md, stack verify, stack doctor]
tech-stack:
  added: []
  patterns: ["one resolver with a tier_source provenance key", "repo test over fenced prompt commands"]
key-files:
  created:
    - plugins/aoforge/hooks/__fixtures__/claude-matcher.js
    - plugins/aoforge/aoforge/bin/lib/state-archive-commit.repo.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/config.cjs
    - plugins/aoforge/aoforge/bin/lib/config.test.cjs
    - plugins/aoforge/aoforge/bin/lib/init.cjs
    - plugins/aoforge/aoforge/bin/lib/model-profiles.test.cjs
    - plugins/aoforge/aoforge/references/model-profiles.md
    - plugins/aoforge/hooks/hooks.json
    - plugins/aoforge/hooks/pre-bash.test.js
    - plugins/aoforge/hooks/hook-coexistence.test.js
    - plugins/aoforge/aoforge/bin/lib/state.cjs
    - plugins/aoforge/aoforge/bin/lib/state.test.cjs
    - plugins/aoforge/aoforge/bin/lib/state-advance-job.test.cjs
    - plugins/aoforge/aoforge/workflows/execute-trd.md
    - plugins/aoforge/aoforge/workflows/execute-objective.md
    - plugins/aoforge/aoforge/bin/lib/stack-packs.cjs
    - plugins/aoforge/aoforge/bin/lib/stack-packs-cli.cjs
    - plugins/aoforge/aoforge/bin/lib/stack-packs.test.cjs
    - site/data/aoforge.json
    - CHANGELOG.md
decisions:
  - "Model precedence (D1) is implemented in one function, resolveAgentModel; resolveModelInternal returns its .model and cmdResolveModel prints it, so the CLI and init cannot disagree"
  - "The archive-commit repo test treats an inline code span inside a fence as prose (a spawn prompt naming a command does not run it)"
  - "advance-job lists STATE.md in files_changed when a decision rotation rewrote it, even if no position field changed"
metrics:
  duration: 18min
  completed: 2026-10-16
  tasks: 3
  commits: 6
status: complete
---

# Quick 35: model overrides, no-progress matcher, advance-job archive, stack verify path and broken packs Summary

Project `agent_models` and `model_overrides` now bind through one resolver with a reported `tier_source`; the
no-progress guard matches every tool except exactly Bash (`^(?!Bash$).*`); advance-job reports `files_changed` and
seeds STATE_ARCHIVE.md, and both workflows commit it; `stack verify --task` rejects path-like ids, and a pack selected
in `stacks.enabled` that cannot run blocks `stack verify` (exit 2) and `stack doctor` (exit 1).

## Progress
- [x] Task 1: agent_models and model_overrides bind — f3ae0a67 (RED), 61cdf545 (GREEN)
- [x] Task 2: no-progress matcher and advance-job archive — 161e5475 (RED), ce8700f4 (GREEN)
- [x] Task 3: stack verify --task validation and unavailable selected packs — df4ab694 (RED), 64fbcb11 (GREEN)

## Commits

| Hash | Message |
|---|---|
| f3ae0a67 | test(models): project agent_models and model_overrides must bind (RED) |
| 61cdf545 | fix(models): honour agent_models and model_overrides in resolve-model and init |
| 161e5475 | test(hooks,state): guard matcher under Claude Code's rule; archive in STATE commits (RED) |
| ce8700f4 | fix(hooks,state): no-progress guard on every non-Bash tool; commit the decision archive after advance-job |
| df4ab694 | test(stack): --task path escape and unavailable selected packs (RED) |
| 64fbcb11 | fix(stack): validate --task ids; selected packs that cannot run block stack verify and doctor |

All six were made with the worktree's `aof-tools commit` (`--cwd` the worktree). Nothing pushed, tagged or released.

## D1 precedence as implemented (`resolveAgentModel`, `lib/init.cjs`)

Profile first (unchanged): OBJECTIVE.md/TRD override > config `model_profile` > `"auto"` → defaults-table cell > `balanced`.
Then the tier, highest first:

1. `--escalate-from <m>`: one rung above `m` (via `escalationRung`), whatever supplied the tier, an override included. `tier_source: escalation`. A bad value keeps the old `--escalate-from needs a tier …` error (exit 1).
2. `model_overrides[agent]` (bare key, then `df-` key; a non-empty string): a tier or `inherit` sets `tier` and `model_id = MODEL_IDS[tier]`; a concrete model id runs as written (`model = model_id = <id>`, `tier` from `escalationRung`). Applies on every profile and focus and to agents missing from the table (no unknown-agent warning). Not floored. `tier_source: model_overrides`.
3. Project `agent_models[agent][profile]` (bare key wins over `df-`). `tier_source: agent_models`.
4. `focus{}` tier for `--focus`. `tier_source: focus`.
5. Package table row, then its `balanced` entry, then `sonnet`. `tier_source: table`.

Over 3-5, `profileTier` raises `verifier`/`job-checker` to `verdict_floor.tier`; when it does, `tier_source: verdict_floor`.
`opus` still maps to `model: 'inherit'`. Output keeps every prior key and adds `tier_source`. An unknown agent with no
override returns `{model: 'sonnet', profile, profile_source, unknown_agent: true, requested}`; only `cmdResolveModel`
prints the stderr warning. `config.cjs loadConfig` now returns `agent_models` and `model_overrides` (plain objects,
`{}` for a string, array, null, missing key or unreadable config).

## RED failure messages

**Task 1** (model-profiles + config, 12 of 65 failed):
- config `both objects come through as written`: `actual: undefined, expected: { planner: { quality: 'haiku' }, 'df-executor': { budget: 'sonnet' } }`
- config `a string, an array, null or a missing key gives {}`: `{"agent_models":"haiku","model_overrides":"haiku"} actual: undefined, expected: {}`
- config `unreadable config gives the defaults`: `actual: undefined, expected: {}`
- 76-06 `verdict agents resolve at or above the floor … agent_models included`: `actual: undefined, expected: 'verdict_floor'` (the floor check itself still held; the planner half could not be reached)
- 1 agent_models binds: `actual: 'opus', expected: 'haiku'`
- 2 model_overrides binds: `actual: 'sonnet', expected: 'haiku'`
- 3 init agrees with the CLI: `actual: 'inherit', expected: 'haiku'`
- 4 override unfloored: `actual: 'sonnet', expected: 'haiku'`
- 6 agent_models beats focus: `actual: 'sonnet', expected: 'haiku'`
- 7 `df-` key: `actual: 'opus', expected: 'haiku'`
- 8 escalation beats override: failed on `tier_source` (`actual: undefined, expected: 'escalation'`; the tier was already `sonnet`)
- table/focus `tier_source`: `actual: undefined`

**Task 2** (2 + 7 failures):
- pre-bash 9: `matcher "Edit|Write|…|mcp__" gives these tools no guard` — `actual: [ 'BashOutput', 'Monitor', 'ToolSearch', 'SendMessage', 'mcp__gopls__x', 'mcp__plugin_p_s__t' ]`. Test 8 (the helper table) passed.
- state-archive-commit 4b: `these commits name .aoforge/STATE.md after an archive-writing command but not .aoforge/STATE_ARCHIVE.md: plugins/aoforge/aoforge/workflows/execute-objective.md:610, plugins/aoforge/aoforge/workflows/execute-trd.md:235` (after the detector fix below; the first run also listed execute-objective.md:1401)
- state-advance-job 1, 13, 13b: `deepEqual` without `files_changed`/`archive_updated`; 15a/15b/15d: `Expected values to be strictly equal` / `deep-equal` on the missing keys; 15c: the store-mode JSON had no `files_changed` (`{"advanced":true,…,"state_md_updated":false,"target":"state.json",…}`)

**Task 3** (6 of 32 failed):
- `--task ../../escaped`: `actual: 0, expected: 1` (the pack ran and the record was written)
- path/`..`/dot/missing/flag ids: `--all --task a/b wrote .aoforge/verify/ actual: true, expected: false`
- 4 ghost: `actual: 0, expected: 2`; 5 broken: `actual: 0, expected: 2`; 6 plugin not in registry: `actual: 0, expected: 2`
- 8: `typeof packs.unavailableSelectedPacks` `actual: 'undefined', expected: 'function'`

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: models bind | `node --test …/model-profiles.test.cjs …/config.test.cjs` (+ model-profile-binding, dispatch-completeness, stack-packs, init*.test) | 0 (102/102, 235/235) | PASS |
| 1: repro | config `{model_profile: quality, agent_models: {planner: {quality: haiku}}, model_overrides: {debugger: haiku}}` → `resolve-model planner --raw` = `haiku`, `resolve-model debugger --raw` = `haiku` (`tier_source: model_overrides`) | 0 | PASS |
| 2: matcher + archive | the TRD's verify set plus gate-commits-merge-sequence, state-digest, mechanical-verbs, planning-audit, agent-shell-harness, misc-commit, roadmap | 0 (474/474; hook-coexistence 198/198) | PASS |
| 3: stack | `node --test …/stack-packs.test.cjs …/flag-spec.repo.test.cjs` (+ 12 stack-* files and the aoforge-stack-* pack tests, 641/641) | 0 (46/46) | PASS |
| 3: repro | `stacks.enabled: ["ghost"]`, empty AOFORGE_STACKS_DIR, temp HOME: `stack verify --all` exit 2 (`missing: ghost missing (selected in config stacks.enabled but it has no mirror: …)`), `stack doctor` exit 1 naming ghost, `--task ../../escaped` exit 1, no `escaped.json` anywhere, no `.aoforge/verify/` | 2 / 1 / 1 | PASS |

Repro projects live under `/private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/q35/` (repro1, repro2).

## Validation Gate Results

The full suite was run with HOME at the scratch dir and **excluding `watcher-shell.test.cjs`** (the known W-3 fish-shell hang), using the package.json globs minus that file (`scratchpad/q35/run-suite.sh`).

| Gate | Command | Tests | Pass | Fail | Skipped | Status |
|---|---|---|---|---|---|---|
| test (baseline, 5e26f7c0) | npm test globs minus watcher-shell | 12005 | 11975 | 0 | 30 | PASS |
| test (final, 64fbcb11) | same | 12038 | 12008 | 0 | 30 | PASS |

+33 tests, +33 pass, skipped unchanged: exactly the tests added here (model-profiles +8, config +3, pre-bash +2,
state-archive-commit +8, state-advance-job +4, stack-packs +8).

### Per-file counts (tests/fail)

| File | 5e26f7c0 (from TRD) | Final |
|---|---|---|
| model-profiles.test.cjs | 24/0 | 32/0 |
| config.test.cjs | 30/0 | 33/0 |
| pre-bash.test.js | 7/0 | 9/0 |
| guard-no-progress.test.js | 19/0 | 19/0 |
| hook-coexistence.test.js | 198/0 | 198/0 |
| state-advance-job.test.cjs | 17/0 | 21/0 |
| state.test.cjs | 34/0 | 34/0 |
| misc-commit.test.cjs | 28/0 | 28/0 |
| state-merge-wiring.repo.test.cjs | 12/0 | 12/0 |
| context-budget.repo.test.cjs | 6/0 | 6/0 |
| flag-spec.repo.test.cjs | 14/0 | 14/0 |
| stack-packs.test.cjs | 24/0 | 32/0 |
| state-archive-commit.repo.test.cjs | (new) | 8/0 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Archive-commit detector flagged a spurious site (execute-objective.md:1401)**
- **Found during:** Task 2 RED
- **Issue:** The spawn prompt fenced at execute-objective.md:1014-1099 says "change them only through `aof-tools state advance-job --objective …`" in an inline code span. The detector read that as a writer, so the objective-complete commit at :1401 (after `objective complete`, which does not write the archive) was flagged.
- **Fix:** Inline code spans inside a fence are dropped before matching (prose, not a command), with an inline fixture for that shape (`an inline code span inside a fence (a spawn prompt) is prose, not a writer`). :1401 is not changed. After the fix the RED run flagged exactly execute-trd.md:235 and execute-objective.md:610.
- **Files modified:** state-archive-commit.repo.test.cjs (in the RED commit) — **Commit:** 161e5475

**2. [Rule 3 - Blocking] state.test.cjs 2b compared the exact advance-job JSON**
- **Found during:** Task 2 GREEN
- **Issue:** The 48-13 characterization `assert.deepEqual(r.json, {advanced, previous_job, current_job, total_jobs})` failed on the new keys. state.test.cjs is not in `files_modified`.
- **Fix:** Per error_recovery, the assertion now lists the old keys and values plus `files_changed` and `archive_updated`; no old key dropped. This is the only file in `git diff 5e26f7c0 --stat` outside `files_modified`.
- **Commit:** ce8700f4

**3. Small additions beyond the letter of D3/D4**
- `files_changed` / `archive_updated` are also on the `no_trds` (empty, false) and legacy `no_position` outputs (non-empty only when a rotation moved entries), so the keys are always present in local and store mode.
- STATE.md is named in `files_changed` when a decision rotation rewrote it even if no position field changed (the rotation is a STATE.md write).
- The now-unused `flagValue` helper in stack-packs-cli.cjs was removed; `--task` goes through `taskIdArg`.
- `unavailableSelectedPacks` accepts an optional `active` list (verify and doctor pass theirs) and does not resolve the profile, since a config selection does not depend on it.

### Not done as specified

- The SUMMARY was not published with `aof-tools quick summary` / `summary checkpoint`: the dispatch forbids the planning verbs (they write into the main checkout). This draft is the deliverable at the path the dispatch named. ROADMAP.md and STATE.md were not touched.

## Extra commit sites and site data

- Extra site flagged by the repo test: execute-objective.md:1401 — spurious (see deviation 1); resolved by tightening the detector, not by editing the workflow.
- Checked sites after GREEN: execute-trd.md (record-metric guarantees the archive exists), execute-objective.md:610 (advance-job guarantees it under D3), agents/executor.md final_commit (already named the archive).
- **site/data/aoforge.json was committed** (ce8700f4): apart from `generatedAt`, its diff was only the guard-no-progress `events` entry (`PreToolUse (^(?!Bash$).*)`).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 9/9 (models bind via one function; precedence documented and tested; 76-06 proves agent_models is read; matcher `^(?!Bash$).*` under the shared rule; advance-job `files_changed`/`archive_updated` and archive seeding; workflow commits name the archive with a repo test; `--task` validation; unavailable selected packs block; suite 0 failures)
- Gate failures: None
- Nothing written under ~/.claude (every test and repro ran with a scratch HOME); no push, tag or release.

## Self-Check: PASSED

- FOUND: plugins/aoforge/hooks/__fixtures__/claude-matcher.js
- FOUND: plugins/aoforge/aoforge/bin/lib/state-archive-commit.repo.test.cjs
- FOUND commits: f3ae0a67, 61cdf545, 161e5475, ce8700f4, df4ab694, 64fbcb11 (`git log --oneline 5e26f7c0..HEAD` shows exactly these six)
