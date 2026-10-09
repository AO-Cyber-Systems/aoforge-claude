---
objective: 68-milestone-and-objective-verbs
trd: "03"
subsystem: tooling
tags: [df-tools, dispatcher, flag-guard, unknown-flag, TOOL-01]

requires:
  - objective: 68-milestone-and-objective-verbs
    provides: "help.cjs COMMANDS[name].mutates (the writing-command list) and the --help pre-switch precedent (issue #87)"
provides:
  - "lib/flag-guard.cjs: pure checkFlags(args, spec) and formatUnknownFlag(result)"
  - "lib/flag-spec.cjs: FLAG_SPEC for the 22 planning and state writers (group 1)"
  - "Dispatcher guard: a writing command rejects an unknown --flag with exit 1 before anything runs"
  - "flag-guard-fixtures.cjs: probe project, PROBES, specEntries() for TRD 68-05 to extend"
affects: [68-04, 68-05, 68-07]

tech-stack:
  added: []
  patterns:
    - "Declarative flag spec checked once in the dispatcher (the issue #87 shape), not per-arm args.includes checks"
    - "Spawn-every-entry probe test: one PROBES argv per spec entry, tree snapshot and gh shim log unchanged"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/flag-guard.cjs
    - plugins/devflow/devflow/bin/lib/flag-guard.test.cjs
    - plugins/devflow/devflow/bin/lib/flag-spec.cjs
    - plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/flag-guard-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs

key-decisions:
  - "The guard runs in main() after the --help pre-switch and the no-command check, before switch (command), only for HELP_TABLE mutates:true commands that have a FLAG_SPEC entry"
  - "A value flag consumes exactly one token (or =value); the words after it are positionals to the checker, so multi-word --name / --files values need no special case"
  - "Command and subcommand lookups use hasOwn, so an inherited key (constructor, toString) is never read as a spec entry"
  - "milestone complete lists --dry-run from the start; 68-01 implements it in the same wave"

patterns-established:
  - "Adding a flag to a guarded writer means adding it to its FLAG_SPEC entry in the same change that makes the command read it"
  - "A new subcommand needs a PROBES key; flag-guard-cli.test.cjs fails when PROBES and FLAG_SPEC drift apart"

requirements-completed: [TOOL-01]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 15min
completed: 2026-10-08
tokens_input: 22752589
tokens_output: 89019
tokens_cache_read: 22544742
tokens_cache_write: 207575
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 68 TRD 03: Writing commands reject an unknown flag (guard and the planning writers) Summary

**A declarative FLAG_SPEC plus a pure checker, run once in the dispatcher, makes `df-tools milestone complete v1.0 --zz-unknown` (and every other planning and state writer) exit 1 naming the flag before anything runs, with no file written and no gh call.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-10-08T16:21:14Z
- **Completed:** 2026-10-08T16:36:00Z
- **Tasks:** 3
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments

- `lib/flag-guard.cjs` (pure, no fs, no `process.exit`): `checkFlags` walks argv, consumes the value of a value flag (including `--flag=value` and a value that looks like a flag), skips positionals, single-dash tokens, the globals `--raw/--help/--cwd` and everything after a literal `--`, and reports the first unknown `--flag` with its label and the sorted accepted list. `anyFlags`, `ownParser` and `tailFrom` rules switch the check off (in whole or in part) and are documented as needing a `reason`.
- `lib/flag-spec.cjs`: `FLAG_SPEC` (deeply frozen) for state, commit, template, frontmatter, config-ensure-section, config-set, roadmap, requirements, objective, milestone, plan, summary, verification, doc, decision, debug, quick, todo, scaffold, validate, skill-active and micro; 57 probe-able entries, `state patch` being the one `anyFlags` entry.
- `df-tools.cjs` `main()`: one `checkFlags(args, FLAG_SPEC)` call between the no-command block and `switch (command)`, gated on `HELP_TABLE[command].mutates`.
- Measured before the wiring (RED run of tests 14/15): with an unknown flag appended, most of the 56 non-`anyFlags` probes exited 0 and many wrote into the temp project. After the wiring all 56 exit 1 with `unknown flag --zz-unknown for \`<label>\``, tree unchanged, zero gh calls.

## Task Commits

1. **Task 1: probe project and PROBES** - `74ff61f7` (test)
2. **Task 2: pure checker** - `a660c2bb` (test, RED), `b6d1be6d` (feat, GREEN)
3. **Task 3: group-1 spec and dispatcher wiring** - `4912a722` (test, RED), `566e7fc3` (feat, GREEN)

## Decisions Made

- The guard sits after the `--help` pre-switch, so `milestone complete --help --zz-unknown` still prints usage and exits 0 (test 17), and after the no-command block.
- `checkFlags` checks `hasOwn(spec, command)` and `hasOwn(entry.subcommands, sub)` rather than `spec[args[0]]`, so `constructor` or `toString` as a command or subcommand is never read as an entry (test 10). The TRD pseudocode indexed directly.
- `state` carries a `default: {}` rule so `state --zz` is reported against `state` (test 11); its probe key is `state`.
- The CLI test loops over `PROBES` (minus the `anyFlags` skip list) and test 15b asserts the PROBES keys equal the FLAG_SPEC entries and that every `anyFlags`/`ownParser`/`tailFrom` rule has a `reason`. The loop therefore covers every spec entry while still failing for the right reason (exit 0, a write) before `flag-spec.cjs` exists.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A comment in flag-spec.cjs named the fixtures directory**
- **Found during:** Task 3, full-suite run
- **Issue:** `gh-project.test.cjs` X2 ("no lib/ module outside tests reads `__fixtures__`") scans non-test lib sources for the literal and flagged `flag-spec.cjs`, whose header comment pointed at `__fixtures__/flag-guard-fixtures.cjs`.
- **Fix:** reworded the comment to "flag-guard-fixtures.cjs (the test fixtures)". X2 passes.
- **Files modified:** plugins/devflow/devflow/bin/lib/flag-spec.cjs
- **Commit:** 566e7fc3 (fixed before the commit; the failure was seen in the first full run)

**2. [Rule 2 - Missing critical] Inherited object keys must not be spec entries**
- **Found during:** Task 2, while writing test 10
- **Issue:** `spec[args[0]]` (the TRD pseudocode) returns `Object` for a command named `constructor`, which the checker would then read as a rule.
- **Fix:** `hasOwn` lookups for both the command and the subcommand; test 10 covers `constructor` and `toString`.
- **Files modified:** plugins/devflow/devflow/bin/lib/flag-guard.cjs
- **Commit:** b6d1be6d

### Additions within the TRD's files

- `specEntries(spec)` in `flag-guard-fixtures.cjs` (not listed in the TRD): derives the probe-able `{label, rule}` entries of a spec, used by test 15b; 68-05 can reuse it to make the sets equal for the full table.
- Test 15b (PROBES vs FLAG_SPEC equality and `reason` presence) in `flag-guard-cli.test.cjs`.
- The fixture project also carries `OBJECTIVE.md`, a pending todo, a debug session and a quick task directory, so the "complete / resolve / summarise" probes can actually write before the guard exists.

## Spec rows that differ from the starting table

None. Every row of the TRD's starting table was checked against its dispatcher arm and module (`df-tools.cjs` state/commit/template/frontmatter/roadmap/requirements/objective/validate/scaffold arms, `planning-verbs-cli.cjs`, `skill-active.cjs`, `micro.cjs`), and against every `df-tools <cmd> ... --flag` invocation in the plugin prose, hooks and libs (a scan found no flag missing from the table; its two stray hits were a `git ls-files --exclude-standard` in new-project.md and `summary-extract --fields`). The full suite showed no `unknown flag` failure.

Observations for later TRDs, none acted on here:

- 68-04 changes `objective remove` / `objective complete`; if it adds a flag, it must add it to those two FLAG_SPEC entries in the same change (`remove: --force --confirm`, `complete: none` today).
- `agents/executor.md` (`state_updates`) shows `state add-blocker "Blocker description"` with a positional, while the arm reads `--text`. The guard does not touch this (no flag is involved); the prose and the arm disagree.
- `roadmap-reconcile.test.cjs` E2E1 reports drift between the first `summary checkpoint` of a TRD (a SUMMARY now exists) and `roadmap update-job-progress` (which ticks the TRD line). It is transient and cleared by the roadmap update at the end of the TRD.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: probe project and PROBES | `node -e "const f=require('.../flag-guard-fixtures.cjs'); const p=f.flagProbeProject(); const r=p.run(['find-objective','1']); console.log(r.status, p.ghCalls().length); p.cleanup()"` printed `0 0` | 0 | PASS |
| 2: pure checker | `node --test plugins/devflow/devflow/bin/lib/flag-guard.test.cjs` (15 tests) | 0 | PASS |
| 3: spec and wiring | `node --test plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs plugins/devflow/devflow/bin/lib/flag-guard.test.cjs` (26 tests); `df-tools --cwd <scratch dir> milestone complete v1.0 --zz-unknown` printed `Error: unknown flag --zz-unknown for \`milestone complete\`; nothing was written (accepted: --archive-objectives, --dry-run, --name, --no-flush, --no-wait)` | 0 / 1 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 2) | `node --test plugins/devflow/devflow/bin/lib/flag-guard.test.cjs` (`Cannot find module './flag-guard.cjs'`) | 1 | FAIL (correct) |
| GREEN (task 2) | `node --test plugins/devflow/devflow/bin/lib/flag-guard.test.cjs` (15 pass) | 0 | PASS (correct) |
| RED (task 3) | `node --test plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs` (14 and 15 fail with exit 0 and writes; 15b fails on the missing `flag-spec.cjs`; 16-18 pass as controls) | 1 | FAIL (correct) |
| GREEN (task 3) | `node --test plugins/devflow/devflow/bin/lib/flag-guard-cli.test.cjs plugins/devflow/devflow/bin/lib/flag-guard.test.cjs` (26 pass) | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test flag-guard.test.cjs flag-guard-cli.test.cjs help.test.cjs dispatch-completeness.test.cjs gh-project.test.cjs` (81 tests) | 0 | PASS |
| test (full) | `npm test` | 1 | PASS at baseline (see below) |

Full suite: 11214 tests, 11155 pass, 9 fail, 50 skipped. The 9 failures are the `devflow-watch` daemon start/stop and multi-project CLI tests and the `handoff pipeline end-to-end` tests, the same suites that fail in the baseline run on a pristine `git archive` copy of WAVE_BASE (11187 tests, 11 fail, 17 cancelled; the copy had no `.git` and also failed the `changelog-on-tag` suite, which passes in the worktree). The failure count of these suites varies between runs (11 in the baseline, 11 in the first post-change run, 9 in the last). No other test fails: the first full run after the wiring showed two more (`gh-project` X2, fixed as deviation 1, and `roadmap-reconcile` E2E1, cleared by `roadmap update-job-progress`); the final run shows neither. `lint`, `typecheck` and `build` are `none` in the stack profile.

## Discovered commands

None. The profile (`general`) names `npm test` and `node --test {files}`.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (`milestone complete v1.0 --zz-unknown` exits 1 naming the flag with the tree unchanged: test 14; every FLAG_SPEC entry does the same with zero gh calls: tests 15/15b; known flags, `--flag=value`, multi-word values, `--raw`/`--help`, `--` and `state patch --<field>` still work: unit tests 1-12 and CLI test 16; the guard sits after the `--help` pre-switch and before the switch, gated on `mutates`: `rg -n "checkFlags\(args, FLAG_SPEC\)" df-tools.cjs` finds exactly one call, line 369, before `switch (command)` at line 373)
- Gate failures: None caused by this TRD (the 9 remaining failures are the baseline daemon/handoff suites)

## Progress
- [x] Task 1: Probe-project fixture and PROBES table — 74ff61f7
- [x] Task 2: The pure checker (tests 1-13) — a660c2bb (RED), b6d1be6d (GREEN)
- [x] Task 3: Group-1 spec and dispatcher wiring (tests 14-18) — 4912a722 (RED), 566e7fc3 (GREEN)

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/flag-guard.cjs, flag-guard.test.cjs, flag-spec.cjs, flag-guard-cli.test.cjs, __fixtures__/flag-guard-fixtures.cjs
- FOUND commits: 74ff61f7, a660c2bb, b6d1be6d, 4912a722, 566e7fc3
