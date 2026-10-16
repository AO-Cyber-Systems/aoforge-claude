---
objective: 44-autonomy-hardening
trd: "07"
job: 44-07
subsystem: df-tools
tags: [config, config-get, defaults, cli, tdd]

requires: []
provides:
  - "documentedDefault(keyPath, templatePath?) -> {known, value}: templates/config.json leaves + ALIAS_DEFAULTS pointers"
  - "resolveConfigValue(config, keyPath) -> {found, value}: set value > alias/legacy form the user set > mode-derived > documented default"
  - "config-get exits 0 with the documented default for known-but-unset keys; unknown keys still `Key not found`"
affects: [execute-objective, plan-objective, discuss-objective, executor, unattended-operation]

tech-stack:
  added: []
  patterns:
    - "Defaults derived from templates/config.json at call time; alias/legacy tables are key-path pointers only, never values"
    - "Own-property dot-path walk (prototype names are never found)"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/config.cjs
    - plugins/devflow/devflow/bin/lib/config.test.cjs

key-decisions:
  - "A default never overrides a value the user set in a form loadConfig reads (alias target, legacy flat key, `parallelization: bool`); verifier_checkpoints/decision_queue follow mode when unset, as in loadConfig"
  - "Arrays and null are leaves; sections and array elements are not documented keys"
  - "Unknown keys, sections and prototype names (`constructor`, `toString`) error with `Key not found`"

patterns-established:
  - "config-get and loadConfig must agree for every field loadConfig resolves (pinned by config.test.cjs test 10)"

requirements-completed: [AUT-07]

verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-09-29
tokens_input: 5327163
tokens_output: 52845
tokens_cache_read: 5219199
tokens_cache_write: 107852
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 44 TRD 07: config-get documented defaults Summary

**`df-tools config-get` now answers a known-but-unset key with its templates/config.json default and exit 0 (`workflow.auto_advance` -> `true`, `workflow.parallelization` -> `true`, `gates.editGate` -> `strict`). It never contradicts a value the user set in a legacy form, and unknown keys still fail with `Key not found`.**

## Progress

- [x] Preflight: `exec-context check` ok (worktree `/Users/justin/dev/.df-worktrees/devflow-claude/44-07`, base c88f347 visible)
- [x] Baseline: config.test.cjs + df-tools.test.cjs 153/153 pass
- [x] RED: `describe('config-get documented defaults')` tests 1-10 added; 8 fail for the expected reasons, 2 (set value, missing config.json) pass as regression guards (17441ea)
- [x] GREEN: documentedDefault + resolveConfigValue + cmdConfigGet fallback; config.test.cjs 23/23, config + df-tools 163/163 (b424d8a)
- [x] Gates: build gate (`config-get workflow.parallelization --raw` -> `true`, exit 0); npm test (see Validation Gate Results)
- [x] SUMMARY complete + Self-Check

## Performance

- Started: 2026-09-29T14:27Z
- Tasks: 1/1 (TDD: RED, GREEN; no refactor needed)
- Files modified: 2 source/test + this SUMMARY

## What changed

`plugins/devflow/devflow/bin/lib/config.cjs`:

- `documentedDefault(keyPath, templatePath = templates/config.json)`: reads the template at call time and resolves an `ALIAS_DEFAULTS` key to its target (`workflow.parallelization` -> `parallelization.enabled`, `workflow.mode` -> `mode`). It walks own properties only and returns `{known: true, value}` for a leaf (primitive, null or array), otherwise `{known: false}`. An unreadable or malformed template gives `{known: false}`, which is today's `Key not found`.
- `resolveConfigValue(config, keyPath)` resolves in this order:
  1. the configured value at `keyPath` (unchanged);
  2. a value the user set at the alias target or a `LEGACY_FORMS` location (the flat keys loadConfig still reads, and `parallelization: bool`);
  3. for `workflow.verifier_checkpoints` / `workflow.decision_queue`, `mode === 'autonomous'`;
  4. the documented default.
- `cmdConfigGet` uses `resolveConfigValue` in place of the inline traversal. Both paths share one `output(value, raw, String(value))` call, so a default prints byte-for-byte what the same set value prints, in JSON and in `--raw`.
- `documentedDefault` and `resolveConfigValue` are exported.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Template defaults would have contradicted values the user set in legacy forms**
- **Found during:** Task 1 (design, before RED)
- **Issue:** The TRD's fallback returns the template default whenever the dot path is unset. But the configs that `new-project` and `config-ensure-section` actually write use `"parallelization": true|false` (a boolean, so `parallelization.enabled` is never set) and flat `commit_docs`. loadConfig also reads flat `auto_advance`, `research` and so on, and `workflow.mode`. Under the plain design, `config-get workflow.parallelization` on a `"parallelization": false` project would print `true`. `config-get workflow.auto_advance` on a legacy `{"auto_advance": false}` config would also print `true`, which turns auto-approve on for a user who turned it off. And in autonomous mode, `workflow.decision_queue` / `verifier_checkpoints` would print the template's `false`, while loadConfig derives `true`.
- **Fix:** Before falling back to the template, `resolveConfigValue` checks the alias target and a `LEGACY_FORMS` pointer table that mirrors loadConfig's `get(key, nested)` pairs, then the mode-derived rule. Both tables hold key paths only, never values, so the template stays the single source of defaults. Test 9 (CLI) and test 10 pin this: test 10 checks that config-get agrees with `loadConfig()` on all 11 overlapping fields across 9 config shapes.
- **Files modified:** plugins/devflow/devflow/bin/lib/config.cjs, plugins/devflow/devflow/bin/lib/config.test.cjs
- **Commits:** 17441ea (tests), b424d8a (fix)

**2. [Rule 1 - Bug] Prototype names resolved as config keys**
- **Found during:** Task 1 (RED)
- **Issue:** The old traversal used plain `obj[key]`, so `config-get constructor --raw` printed `function Object() { [native code] }` with exit 0. The JSON mode crashed with a TypeError. A template walk with the same traversal would also have treated `constructor` as a "known" key.
- **Fix:** Dot-path walks now use own properties only. `constructor` and `toString` return `Key not found` (test 3).
- **Commit:** b424d8a

### Behaviour change to note (by design, per TRD must-haves)

Workflows call `config-get workflow.auto_advance 2>/dev/null || echo "false"`. On a config.json that predates the key, they used to hit the error branch and get `false`. Now they get the documented default, `true` (the template and loadConfig both default it to true). So older projects that never set `auto_advance` will auto-advance, and in executor auto mode they will auto-approve `human-verify` checkpoints. That is what AUT-07 asks for. It is still flagged here because it changes checkpoint behaviour for those projects. Projects that set `workflow.auto_advance` or flat `auto_advance` keep their value.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: documentedDefault + config-get fallback | `node --test plugins/devflow/devflow/bin/lib/config.test.cjs plugins/devflow/devflow/bin/df-tools.test.cjs` | 0 (163/163) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test --test-name-pattern "config-get documented defaults" plugins/devflow/devflow/bin/lib/config.test.cjs` | 1 (8 fail / 2 pass) | FAIL (correct): `Key not found: workflow.auto_advance`, `documentedDefault is not a function`, `constructor` printed a function body |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/config.test.cjs` | 0 (23/23) | PASS (correct) |
| REFACTOR | n/a (no cleanup needed) | - | - |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (repo has no lint command) | - | n/a |
| test | `node --test plugins/devflow/devflow/bin/lib/config.test.cjs` | 0 (23/23) | PASS |
| build | `node plugins/devflow/devflow/bin/df-tools.cjs config-get workflow.parallelization --raw` | 0 (`true`) | PASS |
| wave | `npm test` | 1 (5120 tests: 5058 pass, 12 fail, 0 cancelled) | PASS: all 12 failures are the known pre-existing ones. devflow-watch.test.cjs (5) and handoff-e2e.test.cjs (6) fail because node-pty is unavailable in the worktree; roadmap-reconcile.test.cjs E2E1 is the third (1). None are in config code. |

Extra checks: `config-get workflow.typo --raw` exits 1 with `Error: Key not found: workflow.typo`. The mirror layout `~/.claude/devflow/bin/lib/` + `~/.claude/devflow/templates/config.json` matches the `__dirname/../../templates/config.json` resolution.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4
  - known unset keys print the documented default, exit 0 (tests 1, 9)
  - known keys = template leaves + alias pointers, values from the template (tests 6, 7)
  - unknown keys error, set keys unchanged, missing config.json unchanged (tests 2, 3, 4)
  - `--raw` and JSON output for a default match the set-value output (test 5, including array and null leaves)
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/config.cjs (`documentedDefault` at line 251, `resolveConfigValue` at line 274, both exported)
- FOUND: plugins/devflow/devflow/bin/lib/config.test.cjs (`describe('config-get documented defaults')`, tests 1-10)
- FOUND: .planning/objectives/44-autonomy-hardening/44-07-SUMMARY.md
- FOUND: commit 17441ea (`test(44-07): config-get documented defaults (RED)`)
- FOUND: commit b424d8a (`feat(44-07): config-get returns documented defaults for known unset keys`)
- STATE.md and ROADMAP.md not edited (per dispatch rules)
