---
objective: 59-state-and-merge-plumbing
job: "01"
trd: "01"
subsystem: state-merge
tags: [git-merge-driver, state-json, state-archive, wave-merge, fail-safe]

requires: []
provides:
  - "lib/state-merge.cjs mergeStateJson(base, ours, theirs): pure 3-way JSON merge of state.json"
  - "df-tools merge-driver state-json | install [--check] | uninstall | resolve <path>"
  - "fail-safe sh wrapper driver (driverCommand) and main-checkout bin mapping (driverBinPath)"
  - "this repository has the driver installed against the main checkout's df-tools.cjs"
affects: [59-06 execute-objective wiring, 59-07 dogfood-and-docs, wave 2 parallel merges of objective 59]

tech-stack:
  added: []
  patterns:
    - "per-clone git config: merge attributes in the common info/attributes plus repo-local config, never a tracked .gitattributes"
    - "fail-safe merge driver: missing binary degrades to git merge-file (ordinary conflict), never an aborted merge"
    - "pure merge module with no I/O; the CLI module owns every git and fs call"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/state-merge.cjs
    - plugins/devflow/devflow/bin/lib/state-merge.test.cjs
    - plugins/devflow/devflow/bin/lib/merge-driver-cli.cjs
    - plugins/devflow/devflow/bin/lib/merge-driver-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/state-merge-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs

key-decisions:
  - "Metrics counters sum both deltas even when both sides ended at the same value (two parallel +1 jobs make base + 2); a counter absent from the base is kept once"
  - "install records the realpath of the running df-tools.cjs; from a linked worktree it records the main checkout's copy or refuses"
  - "A begin marker without an end marker in info/attributes is an error, not a guess: install and uninstall refuse and ask for a hand fix"

requirements-completed: [PLMB-02]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-10-05
tokens_input: 14656242
tokens_output: 88756
tokens_cache_read: 14453212
tokens_cache_write: 202824
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 59 TRD 01: State merge driver Summary

**A JSON-aware 3-way merge for state.json plus git's union merge for STATE_ARCHIVE.md, registered per clone by `df-tools merge-driver install` behind a fail-safe sh wrapper, so parallel wave merges complete without conflict (installed and verified in this repository).**

## Progress
- [x] Task 1: Fixture builders for state.json, the archive and a hermetic wave repository — 63f5b61c
- [x] Task 2: mergeStateJson pure 3-way merge (tests 1-10) — RED 3e1b22d9, GREEN 52810aff
- [x] Task 3: df-tools merge-driver state-json | install | uninstall | resolve, then dogfood install (tests 11-20) — RED 6cc0870b, counter fix 890d6dcd/6a6b1a4f, GREEN 1fea5834, dogfood install done (this commit)

## What was built

- `lib/state-merge.cjs` `mergeStateJson(baseText, oursText, theirsText)` returns `{ok, text, notes}` or `{ok:false, reason}`; pure, never throws, output byte-identical to `writeStateJson` (`JSON.stringify(x, null, 2)`, no trailing newline).
- `lib/merge-driver-cli.cjs` `cmdMergeDriver(cwd, args, raw)` with `state-json`, `install [--check]`, `uninstall`, `resolve <path>`; exports `driverCommand(bin)` and `driverBinPath({runningBin, checkoutTop, mainRoot, exists})`.
- `df-tools.cjs` gained the `case 'merge-driver':` arm (four-space indent) and a header block; `help.cjs` gained `HELP_TABLE['merge-driver']`. No workflow prose changed (59-06 wires install and resolve into execute-objective.md).

### Merge rules (mergeStateJson)

- arrays (`decisions`, `blockers`, `session_log`): base entries, then ours' additions, then theirs' additions; an entry one side removed is dropped. Entries compare by canonical JSON (sorted keys). Only theirs' additions are deduplicated, and only against ours; repeats inside one side are kept.
- `metrics.*` counters: base + (ours - base) + (theirs - base), including the case where both sides ended equal (see Deviations). A counter with no base value and equal sides is kept once.
- other numbers changed on both sides: max. ISO dates (`YYYY-MM-DD...`) changed on both sides: the later. Anything else changed on both sides: ours, with a note naming the key path.
- objects: merged key by key, ours' key order first then theirs-only keys. A key one side deleted and the other left unchanged is deleted; a key added on one side is kept.
- empty or whitespace base is `{}`; an unparsable base is `{}` plus a note; an unparsable ours/theirs or a non-object top level is `{ok:false, reason}`.

### Driver string installed in this repository

```
{ [ -f '/Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs' ] && node '/Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs' merge-driver state-json %O %A %B; } || git merge-file -L ours -L base -L theirs %A %O %B
```

Managed block in `/Users/justin/dev/devflow-claude/.git/info/attributes` (the file did not exist before):

```
# >>> devflow merge drivers (df-tools merge-driver install)
**/.planning/state.json merge=devflow-state-json
**/.planning/STATE_ARCHIVE.md merge=union
# <<< devflow merge drivers
```

Undo: `node plugins/devflow/devflow/bin/df-tools.cjs merge-driver uninstall` (idempotent; touches only the managed block and the `merge.devflow-state-json` config section).

## Dogfood (main checkout, /Users/justin/dev/devflow-claude, branch feat/stack-profile-loader)

1. `node plugins/devflow/devflow/bin/df-tools.cjs merge-driver install`

```
{
  "installed": true,
  "changed": true,
  "attributes_path": "/Users/justin/dev/devflow-claude/.git/info/attributes",
  "driver": "{ [ -f '/Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs' ] && node '/Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs' merge-driver state-json %O %A %B; } || git merge-file -L ours -L base -L theirs %A %O %B",
  "bin": "/Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs"
}
```

2. `git check-attr merge -- .planning/state.json .planning/STATE_ARCHIVE.md`

```
.planning/state.json: merge: devflow-state-json
.planning/STATE_ARCHIVE.md: merge: union
```

3. `git config --get merge.devflow-state-json.driver`

```
{ [ -f '/Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs' ] && node '/Users/justin/dev/devflow-claude/plugins/devflow/devflow/bin/df-tools.cjs' merge-driver state-json %O %A %B; } || git merge-file -L ours -L base -L theirs %A %O %B
```

4. `git rev-parse --path-format=absolute --git-common-dir`

```
/Users/justin/dev/devflow-claude/.git
```

The parent of output 4 is `/Users/justin/dev/devflow-claude`, so the quoted `<bin>` in output 3 equals `<main checkout>/plugins/devflow/devflow/bin/df-tools.cjs`. No `.df-worktrees` path is recorded; removing a wave worktree cannot strand the driver. A follow-up `merge-driver install --check` reports `installed: true, attributes_ok: true, driver_ok: true`.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test plugins/devflow/devflow/bin/lib/state-merge.test.cjs` | 1 (module missing) | FAIL (correct) |
| GREEN (Task 2) | `node --test plugins/devflow/devflow/bin/lib/state-merge.test.cjs` | 0 (17/17) | PASS (correct) |
| RED (Task 3) | `node --test plugins/devflow/devflow/bin/lib/merge-driver-cli.test.cjs` | 1 (module missing) | FAIL (correct) |
| RED (counter fix) | `node --test plugins/devflow/devflow/bin/lib/state-merge.test.cjs` | 1 (4b: 3 !== 4) | FAIL (correct) |
| GREEN (counter fix) | `node --test plugins/devflow/devflow/bin/lib/state-merge.test.cjs` | 0 (19/19) | PASS (correct) |
| GREEN (Task 3) | `node --test` over merge-driver-cli, state-merge, help, dispatch-completeness, regex-escape.repo | 0 (58/58) | PASS (correct) |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builders | `node -e "const f=require('./plugins/devflow/devflow/bin/lib/__fixtures__/state-merge-fixtures.cjs'); const r=f.makeWaveRepo({state:f.stateDoc(),archive:f.archiveText({})}); console.log(r.git(['log','--oneline']).split('\n').length); r.cleanup()"` printed `1` | 0 | PASS |
| 2: mergeStateJson | `node --test plugins/devflow/devflow/bin/lib/state-merge.test.cjs` | 0 | PASS (19 tests; tests 1-10 plus 2b, 3b, 4b, 4c, 6b, 7b, 8b, 9b and a canonicalJson case) |
| 3: merge-driver CLI | `node --test plugins/devflow/devflow/bin/lib/merge-driver-cli.test.cjs plugins/devflow/devflow/bin/lib/state-merge.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs` | 0 | PASS (52/52 before the regex-escape fix, 58/58 with regex-escape.repo.test.cjs added) |
| 3: dogfood | `git check-attr merge -- .planning/state.json` in this repo | 0 | PASS (`devflow-state-json`; recorded bin is the main checkout's df-tools.cjs) |

Tests 11-20 of the TRD map to: 11/11b state-json, 12/12b/13/14 install, 15/16/17 wave merge and resolve, 18 uninstall, 19 fail safe, 20 driverBinPath (plus a driverCommand unit test).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task 2, before commit) | `npm test` | 1 | PASS against baseline: 3 known failures only (MA-7 doctl handoff, roadmap-reconcile E2E1, stack-drafter-fleet github-enterprise-migration) |
| test (task 3, before commit) | `npm test` | 1 | 4 failures: the 3 baseline plus `regex-escape.repo.test.cjs` test 1 (my hand-rolled dot escape); fixed in this commit by `escapeRegExp` from `text-escape.cjs` |
| test (final, driver installed) | `npm test` | 1 | PASS against baseline: 9738 tests, 9703 pass, 3 fail (the 3 known baseline failures), rest skipped |
| lint / build / typecheck | none in the stack profile | n/a | not_available |

## Discovered commands

None. The stack profile (`general`) supplied `npm test` and `node --test {files}`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Equal-valued metrics counters lost a delta**
- **Found during:** Task 3 (test 15, end to end: `metrics.jobs_completed` was 1, expected 2)
- **Issue:** The TRD pseudo-code returns `ours` whenever ours equals theirs. Two parallel branches that each add 1 to a counter leave it equal on both sides (base + 1), so the shortcut dropped one completed job, contradicting the truth "sums metrics counter deltas".
- **Fix:** `summingCounters()` in `state-merge.cjs` skips the equal-values shortcut on the way to and at a `metrics` counter whose base exists and moved. A counter absent from the base is still kept once. Unit tests 4b and 4c added (RED commit then fix commit).
- **Files modified:** `plugins/devflow/devflow/bin/lib/state-merge.cjs`, `plugins/devflow/devflow/bin/lib/state-merge.test.cjs`
- **Commits:** 890d6dcd (RED), 6a6b1a4f (fix)

**2. [Rule 3 - Blocking] Hand-rolled regex escape failed the repo guard**
- **Found during:** Task 3 full `npm test` gate (`regex-escape.repo.test.cjs`, TRD 56-01)
- **Issue:** `merge-driver-cli.cjs` escaped the config section name with `.replace(/\./g, '\\.')`.
- **Fix:** use `escapeRegExp` from `lib/text-escape.cjs`.
- **Files modified:** `plugins/devflow/devflow/bin/lib/merge-driver-cli.cjs`
- **Commit:** 1fea5834

**3. [Rule 3 - Blocking] The fixture needed node on PATH for the real driver to run**
- **Found during:** Task 3 test design
- **Issue:** git runs the driver through `sh -c` with its own environment; without node on PATH the wrapper silently falls back to `git merge-file`, which would make test 15 pass or fail for the wrong reason.
- **Fix:** `makeWaveRepo` prepends `dirname(process.execPath)` to the fixture env PATH (in `__fixtures__/state-merge-fixtures.cjs`, committed with the Task 3 RED commit 6cc0870b).

### Other notes (not deviations)

- Extra named test cases beyond the 20 in the TRD: 2b, 3b, 4b, 4c, 6b, 7b, 8b, 9b, 11b, 12b and a canonicalJson and a driverCommand unit case.
- `install` records `realpath(df-tools.cjs)` (symlink-safe inside/outside-checkout decision); the CLI tests compare against the real path.
- Test 19 used 7-character git conflict markers (`/^<{7} ours$/m`); my first draft of the regex had 8 characters, a test typo caught on the first run.

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/__fixtures__/state-merge-fixtures.cjs
- FOUND: plugins/devflow/devflow/bin/lib/state-merge.cjs
- FOUND: plugins/devflow/devflow/bin/lib/state-merge.test.cjs
- FOUND: plugins/devflow/devflow/bin/lib/merge-driver-cli.cjs
- FOUND: plugins/devflow/devflow/bin/lib/merge-driver-cli.test.cjs
- FOUND commits: 63f5b61c, 3e1b22d9, 52810aff, 6cc0870b, 890d6dcd, 6a6b1a4f, 1fea5834
- `state-merge.cjs` requires neither `fs` nor `child_process`.
- `git diff` of df-tools.cjs shows only the require line, the new arm and the header block; help.cjs only the new entry.
- Driver installed in this repository; its recorded bin is the main checkout's df-tools.cjs.

## Post-TRD Verification

- Auto-fix cycles used: 0 (two inline fixes and one fixture adjustment, listed above)
- Must-haves verified: 8/8 (merge rules, install/uninstall idempotence, fail-safe wrapper, main-checkout bin mapping, conflict-free end-to-end merge with control, resolve, dogfood path)
- Gate failures: None beyond the 3 known baseline failures
