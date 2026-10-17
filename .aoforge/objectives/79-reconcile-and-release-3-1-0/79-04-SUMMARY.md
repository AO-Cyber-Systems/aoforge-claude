---
objective: 79-reconcile-and-release-3-1-0
trd: "04"
subsystem: planning-verbs
tags: [worktree, planning-mode, legacy-layout, sc-4, model-resolution]
requires:
  - 79-01 (merge afbe19a4, triage rows 3-8)
provides:
  - "quick 36's worktree contract proven on the .aoforge/ layout 3.1 supports (cases 25-29, 31, s1)"
  - "planning-verbs-worktree.legacy.test.cjs: the pre-rename worktree refused with nothing written (32, 33), the reverse layout writes the worktree (30)"
  - "the SC-4 coexistence table: quick 36, quick 35, objective 76, objective 78 on the merged tree"
affects: [79-06, 79-08]
tech-stack:
  added: []
  patterns: ["shared git worktree fixture module under __fixtures__/, the pre-rename directory passed in by the .legacy test through LEGACY", "byte snapshots (base64 per file) for 'nothing written' assertions"]
key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/worktree-verb-fixtures.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs
key-decisions:
  - "Quick 36's cases changed, not the code: the cross-layout worktree is refused by objective 78's guard by design, so 25-29 and s1 now run on a same-layout worktree diverged by a commit on its own branch; no resolver or compat change."
  - "The helpers both worktree test files need live in __fixtures__/worktree-verb-fixtures.cjs, which never names the pre-rename directory (the .legacy test passes it in through LEGACY.planningDir)."
  - "s1 now also gives the worktree its own config saying store false, so it proves the mode is read from MAIN's config, not just that store mode writes main."
metrics:
  duration: 10min
  started: 2026-10-17T03:18:34Z
  completed: 2026-10-17T03:28:00Z
  tasks: 2
  files: 4
---

# Objective 79 TRD 04: Quick 36's worktree resolver on single-name compat, and the SC-4 coexistence proof Summary

**Quick 36's six failing worktree cases now prove the same contract on the `.aoforge/` layout 3.1 supports, the pre-rename worktree is proven refused with every byte unchanged, and quick 36, quick 35, objective 76 and objective 78 each pass their own suites on the merged tree (400 tests, 0 failures) with a matching `resolve-model` / `planning mode` CLI smoke. No source code changed.**

## Progress
- [x] Task 1: Rework quick 36's worktree cases onto the supported layout; move the pre-rename cases to a legacy test — 5ee40964
- [x] Task 2: SC-4 coexistence — the four features' suites and a CLI smoke on this repo — (this commit)

## What changed

- `planning-verbs-worktree.test.cjs`: `crossLayout()` replaced by `sameLayout()` (main tracks `.aoforge/`, the worktree checks out its own copy and commits `objectives/08-wt-only/08-01-x-TRD.md` on `exec/wt`). Cases 25-29 and s1 keep their numbers and intent; 31 unchanged in intent (its "nor a legacy dir" check became "the worktree holds only `.git`, `.gitignore`, `src`", which needs no legacy name). The `LEGACY` import and every OLD reference are gone; the header records the objective 79 change.
- s1 is stronger than before: the worktree's own `config.json` says `store: false`; the run still reports `mode: store`, writes MAIN's `.aoforge/.trd-progress/7-01.md`, and leaves the worktree's `.aoforge/` byte-identical (D-14).
- 29 also asserts the draft is not keyed on the worktree's repo key.
- `planning-verbs-worktree.legacy.test.cjs` (new): 32 (`quick put` and `quick put --raw` exit 1 with `legacyLayoutMessage(<wt>)`; the worktree's legacy dir, the worktree's (absent) `.aoforge/`, main's `.aoforge/`, main's (absent) legacy dir and the test TMPDIR are byte-identical before and after), 33 (`planning draft PROJECT.md` prints nothing and creates no draft; `doc put PROJECT.md` refuses the same way), 30 (reverse layout: `quick put` writes `<wt>/.aoforge/quick/34-demo/34-JOB.md`, main's pre-rename dir byte-identical, main gains no `.aoforge/`).
- `__fixtures__/worktree-verb-fixtures.cjs` (new, listed per the TRD): `createWorktreeFixtures()` (project, addWorktree, commitInWorktree, aof, gitOk, cleanup) plus write/read/exists/under/snapshot and the shared texts. Both test files need it.
- `planning-verbs-cli.test.cjs` builds no pre-rename layout (`rg "LEGACY|OLD|planningDir"` prints nothing), so it needed no split.

## Mutation checks (the reworked tests discriminate)

The rework passed on first run because the code was already right, so each guarded behaviour was broken on purpose, run, and restored (`git diff --stat` afterwards: only the test file):

| Mutation (reverted) | Tests that went red |
|---|---|
| `resolveVerbRoot` returns MAIN in local mode | 25, 26, 27, 28, 29 (31, s1, 30, 32, 33 stay green, as they should) |
| `legacyLayoutGuard` never refuses | 32 (`quick put` exit 0, `wrote .aoforge/quick/34-demo/34-JOB.md`: the second planning tree 78's SC-4 forbids), 33 (`planning draft` printed a draft path) |
| `resolveVerbRoot` ignores store mode | s1 (MAIN's `.trd-progress/7-01.md` missing) |

## SC-4 coexistence

Each group ran in its own Bash call with a fresh empty scratch HOME (`mktemp -d` under the session scratchpad).

| Feature | Tests | Result | CLI evidence (`aof-tools --cwd <checkout> ...`, all exit 0) |
|---|---|---|---|
| Quick 36: one verb root resolver (`resolveVerbRoot`) | planning-mode.test.cjs, planning-verbs-worktree.test.cjs, planning-verbs-worktree.legacy.test.cjs, planning-verbs-cli.test.cjs | 69/69 pass | `planning mode --raw` -> `{"mode":"local","reason":"github.enabled is not true","root":"/Users/justin/dev/aoforge-claude"}` (the mode is read from MAIN, as resolveVerbRoot requires) |
| Quick 35: model precedence (agent_models, model_overrides, `auto`, unset stays balanced, `df-` key, escalation beats override) | model-profiles.test.cjs, model-profile-binding.test.cjs, config.test.cjs, doctor-checks/13-model-profiles.test.cjs | 95/95 pass (with 76 below) | `resolve-model executor` -> `{"model":"sonnet","profile":"balanced","profile_source":"default","tier":"sonnet","model_id":"claude-sonnet-5-5","tier_source":"table"}`; `--raw` -> `sonnet` |
| Quick 35: pack-manifest tiers | stack-packs.test.cjs ("resolve-model takes a pack agent's tiers from its manifest") | 46/46 pass | (no pack agent in this repo's config) |
| Objective 76: 76-01 profile precedence, 76-06 focus tiers + verdict floor, 76-07 escalation ladder | same four files (suites "TRD 76-01", "TRD 76-06", "TRD 76-07") | included in 95/95 | `resolve-model executor --objective 79` -> same as plain, `profile_source: default` (objective 79 has no override, config has no model_profile); `resolve-model codebase-mapper --focus concerns` -> `tier: sonnet`, `tier_source: focus` (table balanced is haiku); `resolve-model executor --escalate-from sonnet` -> `model: inherit`, `tier: opus`, `model_id: claude-opus-5-5`, `tier_source: escalation`, `ceiling: false` |
| Objective 78: single-name compat + legacy-layout guard | compat.legacy.test.cjs, compat.home.test.cjs, compat-entry.repo.test.cjs, old-layout.legacy.test.cjs, legacy-layout-guard.legacy.test.cjs, planning-layout.legacy.test.cjs, planning-layout-detect.legacy.test.cjs | 190/190 pass | the guard refusing a pre-rename worktree is test 32/33 above |

Total across the groups: 69 + 95 + 46 + 190 = 400 tests, 0 failures. No merge damage found, so no source file was edited.

CLI note: the TRD's example agent name `aoforge-executor` is not a CLI agent type. `resolve-model aoforge-executor` exits 0 with the unknown-agent warning (`unknown_agent: true`, sonnet fallback); the canonical key is the bare `executor`, which is what every skill and workflow passes (`rg "resolve-model [a-z-]+"` over skills/ and workflows/ lists only bare names). The smoke uses `executor`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 (RED, before the rework) | `env HOME=<scratch> node --test planning-verbs-worktree.test.cjs planning-verbs-cli.test.cjs` | 1 | 6 fail as expected (25, 26, 27, 28, 29, s1: exit 1, the legacy-layout message); 30 and 31 passed; planning-verbs-cli 18/18 pass |
| 1 (GREEN) | `env HOME=<scratch> node --test planning-verbs-worktree.test.cjs planning-verbs-worktree.legacy.test.cjs planning-verbs-cli.test.cjs planning-mode.test.cjs` | 0 | PASS (69/69 tests, 26 suites) |
| 1 | `rg -n "LEGACY" planning-verbs-worktree.test.cjs` | 1 (no match) | PASS (prints nothing) |
| 1 | `node --test rename-guard.repo.test.cjs planning-writes.repo.test.cjs compat-entry.repo.test.cjs` | 0 | PASS (58/58) |
| 2 | the four groups above, one empty HOME each | 0 each | PASS (69, 95 + 46, 190) |
| 2 | `resolve-model executor [--raw]`, `--objective 79`, `codebase-mapper --focus concerns`, `executor --escalate-from sonnet`, `planning mode [--raw]` | 0 each | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test planning-verbs-worktree.test.cjs planning-verbs-cli.test.cjs` (merged tree, before the rework) | 1 | FAIL (correct): 25-29 and s1 refused by the legacy-layout guard |
| GREEN | `node --test planning-verbs-worktree*.test.cjs planning-verbs-cli.test.cjs planning-mode.test.cjs` | 0 | PASS (correct) |
| (mutation) | the three mutations above, each reverted | 1 each | FAIL (correct): the new cases are not vacuous |

Task 2 is test-run only (edit only on a failure): no failure, so no RED/GREEN pair.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `env HOME=<scratch> node scratchpad/run-suite.cjs <checkout>`: npm test's four globs (409 files), **`watcher-shell.test.cjs` excluded** (the W-3 fish-shell hang), node_modules symlinked for the run and removed after | 1 | 12,772 tests, 12,741 pass, **4 fail**, 27 skipped. All 4 are 79-01 triage rows routed elsewhere: #1 context-budget.repo (CLAUDE.md char cap) and #2 doc-refs.repo (`ui-eval` in CLAUDE.md) -> 79-07; #9 requirements-agreement.repo and #10 validate-requirements (75 EST-11) -> 79-05. Against 79-01's baseline (12,770 / 12,733 / 10 fail / 27 skipped): +2 tests (10 cases replace 8), +8 pass, the 6 routed to 79-04 gone, nothing new failing. |

## Deviations from Plan

None in behaviour. Two notes:
- The new `__fixtures__/worktree-verb-fixtures.cjs` is outside `files_modified`; the TRD allows it when both files need the helpers ("put it under `__fixtures__/` and list it in the SUMMARY").
- The CLI smoke uses the agent type `executor`, not the TRD's example `aoforge-executor` (see CLI note).

## Findings handed to other TRDs

- **for 79-02 (observation, no failure):** the pre-rename `df-` agent-key spelling survives objective 78 in model resolution: `plugins/aoforge/aoforge/bin/lib/init.cjs` normalises `df-<agent>` (line 278), looks up `MODEL_PROFILES['df-'+key]` and `agent_models['df-'+key]` (lines 290, 304, 409, 423), and calls `resolveModelInternal(cwd, 'df-executor' | 'df-planner' | ...)` internally (lines 386, 602-603, 727-729, 878-882, 919-922, 963-966, 1033-1034, 1249-1252, 1280, 1394-1395); `model-profiles.test.cjs` 86-93 ("both key spellings resolve identically") and quick 35's "a df- prefixed agent_models key (the documented spelling) binds" pin it. Every SC-4 test passes with it and the rename guard accepts it. Suggested: in the bin/** sweep, either call `resolveModelInternal` with bare names (the `df-` input is normalised away anyway) and keep `df-` acceptance as a documented alias, or record it as a 3.1 keeper; do not drop the `agent_models['df-'+key]` read without a migration, since quick 35 documents that spelling for users.
- None for 79-03 or 79-05.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (worktree contract on `.aoforge/`; pre-rename worktree refused, nothing written; reverse layout writes the worktree, main byte-identical; no LEGACY in the worktree test, pre-rename cases in the .legacy test; four features pass their own tests plus the CLI smoke)
- Gate failures: the full suite's 4 remaining failures belong to 79-05 (#9, #10) and 79-07 (#1, #2) per 79-01's triage; none in this TRD's domain
