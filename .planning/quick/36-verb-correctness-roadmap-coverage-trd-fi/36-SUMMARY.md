---
objective: quick-36
trd: 01
subsystem: aof-tools (verify, state, planning verbs)
tags: [roadmap-coverage, requirement-ids, objective-evidence, objective-completeness, trd-finalize, state-archive, planning-verbs, worktree, resolveVerbRoot]
requires: []
provides:
  - "planning-mode.cjs resolveVerbRoot(cwd): MAIN in store mode; in local mode the checkout holding cwd when it has a planning dir, else MAIN; null when there is none"
  - "requirement-ids.cjs REQUIREMENT_ID_SRC: the shared id source (hyphenated ids may carry one lowercase suffix)"
  - "roadmap-coverage.cjs objectiveSections + roadmapMapping on roadmapRequirementIds; heading-start v1 rule; no-v1 failure"
  - "trd-finalize.cjs splitDecision(text) -> {summary, rationale?}; padded TRD ids; checkpoint refusal; strict --duration"
  - "state record-metric upsert by first cell (+ store metrics_log); add-decision duplicate no-op ({added:false, duplicate:true})"
  - "objective-evidence summary.checkpoint + rollup.checkpoints/no_self_check; objective-completeness checkpoint_summaries"
affects: [validate roadmap-coverage, verify trd-pre, objective complete, verify objective-evidence, verify objective-completeness, trd finalize, state record-metric, state add-decision, every planning verb in local mode, planning draft]
tech-stack:
  added: []
  patterns: ["one resolver decides the read/write root for every planning verb", "idempotence lives in the verbs, so a hand-run retry is safe too"]
key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/planning-verbs-worktree.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/roadmap-coverage.cjs
    - plugins/aoforge/aoforge/bin/lib/requirement-ids.cjs
    - plugins/aoforge/aoforge/bin/lib/requirement-ids.test.cjs
    - plugins/aoforge/aoforge/bin/lib/objective-evidence.cjs
    - plugins/aoforge/aoforge/bin/lib/verify.cjs
    - plugins/aoforge/aoforge/bin/lib/mechanical-verbs.test.cjs
    - plugins/aoforge/aoforge/bin/lib/trd-finalize.cjs
    - plugins/aoforge/aoforge/bin/lib/state.cjs
    - plugins/aoforge/aoforge/bin/lib/state.test.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-mode.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-mode.test.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-verbs.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-entity-verbs.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-drafts.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-verbs-cli.cjs
    - docs/USER-GUIDE.md
    - CLAUDE.md
    - CHANGELOG.md
decisions:
  - "The requirement-id suffix (D1) changes the shared contract: ONUM-01x is now an ID, so requirement-ids test 16d's longer-word case moved to ONUM-01xy"
  - "record-metric also normalises the end of the archive to one trailing newline when the metrics table ends the file, so a retry is byte-stable (it used to add a blank line per write)"
  - "objective-completeness reports a plan with only checkpoint SUMMARYs under the new 'Plans with only a checkpoint SUMMARY' error and leaves it out of 'Plans without summaries'; incomplete_jobs lists both"
  - "The trailing newline was added to the raw output of validate roadmap-coverage and verify objective-evidence only; verify objective-completeness raw stays 'complete'/'incomplete' with no newline (the anti-pattern list limits the newline to the two verbs named)"
metrics:
  duration: 17min
  completed: 2026-10-16
  tasks: 3
  commits: 6
status: complete
---

# Quick 36: verb correctness (roadmap-coverage, trd finalize, objective-evidence, planning verbs in a worktree) Summary

`validate roadmap-coverage` now reads ROADMAP ids only through the shared `roadmapRequirementIds`, one level-bounded
objective section at a time. A checkpoint SUMMARY no longer counts as a finished TRD in `verify objective-evidence`
or `verify objective-completeness`. `trd finalize` is a safe retry: `record-metric` upserts its row and
`add-decision` treats an identical entry as a no-op. Decisions keep their rationale, `--duration` is parsed strictly,
checkpoint SUMMARYs are refused and `01-1` resolves to `01-01`. In local mode every planning verb reads and writes the
checkout that runs it, through `planning-mode.resolveVerbRoot`.

## Progress
- [x] Task 1: roadmap-coverage on the shared parser; checkpoint SUMMARYs are not done — b065407f (RED), 00bc2e58 (GREEN)
- [x] Task 2: trd finalize is a safe retry — 20bc58e0 (RED), f1d097c1 (GREEN)
- [x] Task 3: planning verbs write the checkout that runs them in local mode — af567551 (RED), 98948a16 (GREEN)

## Commits

| Hash | Message |
|---|---|
| b065407f | test(verify): roadmap-coverage parity and checkpoint SUMMARYs (RED) |
| 00bc2e58 | fix(verify): roadmap-coverage uses the shared requirement parser; checkpoint SUMMARYs are not done |
| 20bc58e0 | test(state): trd finalize retry, decision rationale, duration flag, checkpoint and padded id (RED) |
| f1d097c1 | fix(state): trd finalize is a safe retry; decisions keep their rationale |
| af567551 | test(planning): verbs from a linked worktree write that worktree in local mode (RED) |
| 98948a16 | fix(planning): verbs write the checkout that runs them in local mode |

All six were made with `aof-tools commit`. `git diff 563d2388 --stat` lists exactly the 19 files in `files_modified`.

## RED failures (each for the defect's reason)

Task 1 (`b065407f`). Tests 5 (deeper heading stays inside) and 8 (`AUTH-01a`) passed at RED as guards: the old
regexes already handled both. They protect against copying trd-pre-check's `#{2,4}` close rule and against dropping
the suffix.
- 1 `- **Requirements**: API-01`: exit `actual: 1, expected: 0` (API-01 a false orphan)
- 2 label + bullet lines: exit `actual: 1, expected: 0` (false orphans)
- 3 `none (tech debt; AUTH-03 deferred)`: exit `actual: 0, expected: 1` (AUTH-03 counted as mapped)
- 4 `## Progress` Requirements line: exit `actual: 0, expected: 1` (DATA-01 credited to objective 2)
- 6 v1 scope: orphans `actual: [ 'VTEN-01' ], expected: [ 'INT-01' ]` (`(OAuth v2)` section dropped, `v10` counted)
- 7 no v1 definitions: exit `actual: 0, expected: 1` (`0/0 ✓`)
- 9 raw newline: `actual: 'Coverage: 1/1 v1 requirements mapped ✓'` (no `\n`)
- 12 evidence: `rollup.summaries` `actual: 2, expected: 1`
- 13 raw evidence: `actual: 'Objective 01: 2/2 TRDs have a SUMMARY'`
- 14 completeness: `complete` `actual: true, expected: false`
- 23 (Test list 11) `extractRequirementIds('AUTH-01a, AUTH-02')`: `actual: [ 'AUTH-02' ]`

Task 2 (`20bc58e0`):
- existing dry-run test (updated per D3): add-decision argv tail `[ '--objective', '01', '--summary', 'Cookie sessions' ]`
- 16 real run twice: STATE_ARCHIVE.md held each decision twice and two `| Objective 01 P01 |` rows (`2 !== 1`)
- 17 rationale: argv tail ended `'Cookie sessions'`, no `--rationale`
- 18 `--duration=99min`: `'12min' !== '99min'` (the flag was ignored)
- 19 `--duration --dry-run`: exit `actual: 0, expected: 1` (`--dry-run` taken as the value)
- 20 checkpoint SUMMARY: exit `actual: 0, expected: 1` (accepted)
- 21 `01-1`: `Error: no TRD for 01-1 in .aoforge/objectives/01-auth`
- 22a record-metric twice: two `Objective 7 P02` rows (5min and 7min) plus an extra blank line
- 22b different job: correct rows, but a trailing blank line (`...files |\n\n`)
- 22c store mode: two `metrics_log` entries
- 23 identical add-decision: `actual: { added: true, ... }`, expected `{ added: false, duplicate: true, ... }`

Task 3 (`af567551`). Guards 31 (gitignored planning dir falls back to main) and s1 (store mode writes main's
`.trd-progress/`) passed at RED, as intended.
- 6a-6e (Test list 32): `TypeError: mode.resolveVerbRoot is not a function`
- 25 quick put: `ENOENT ... /wt/<legacy dir>/quick/34-demo/34-JOB.md` (the JOB went to main)
- 26 quick summary: `ENOENT ... /wt/<legacy dir>/quick/34-demo/34-SUMMARY.md`
- 27 summary checkpoint 08-01: exit 1, `objective 8 is not known (no ROADMAP entry or directory under .aoforge/objectives)`
- 28 doc put PROJECT.md: the worktree copy unchanged (`'# Project (main copy)\n'`), main overwritten
- 29 planning draft: seeded from main (`'... Stale main copy.\n'`)
- 30 reverse layout: `ENOENT ... /wt/.aoforge/quick/34-demo/34-JOB.md`

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `node --test mechanical-verbs requirement-ids summary-pairing trd-pre-check` (lib/*.test.cjs) | 0 (116/116) | PASS |
| 1 | related: `flutter-ui-eval-resolve objective verify rename-guard.repo` | 0 (98/98) | PASS |
| 2 | `node --test mechanical-verbs state state-advance-job flag-spec.repo` | 0 (100/100) | PASS |
| 3 | `node --test planning-verbs-worktree planning-mode summary-worktree planning-verbs planning-verbs-cli planning-entity-verbs planning-drafts planning-drafts-cli todo-sync rename-guard.repo planning-writes.repo` | 0 (220/220) | PASS |
| 3 | `node -e "...resolveVerbRoot('<repo>')"` | 0 | PASS: prints `<repo>`'s realpath (`resolveMainRoot` prints `/Users/justin/dev/aoforge-claude`) |

`validate roadmap-coverage --raw` on this repo after Task 1 (evidence, not a gate):

```
Coverage: 41/41 v1 requirements mapped ✓
```
exit 0, newline-terminated.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | full suite (npm test globs minus watcher-shell.test.cjs, HOME at scratch) | 0 | PASS |

Baseline at 563d2388: tests 12038, pass 12008, fail 0, skipped 30 (EXIT 0).
Final at 98948a16: tests 12074, pass 12044, fail 0, skipped 30 (EXIT 0). The +36 tests and +36 passes are exactly the
tests added here (mechanical-verbs +18, requirement-ids +1, state +4, planning-mode +5, planning-verbs-worktree +8);
skipped is unchanged. Logs:
/private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/agent36/baseline.log and
/private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/agent36/final.log.

Per-file tests/fail/skipped, before -> after:

| File | Before | After |
|---|---|---|
| mechanical-verbs | 9/0/0 | 27/0/0 |
| requirement-ids | 30/0/0 | 31/0/0 |
| summary-worktree | 6/0/0 | 6/0/0 |
| summary-pairing | 14/0/0 | 14/0/0 |
| planning-verbs | 22/0/0 | 22/0/0 |
| planning-verbs-cli | 18/0/0 | 18/0/0 |
| planning-mode | 34/0/0 | 39/0/0 |
| planning-drafts | 13/0/0 | 13/0/0 |
| planning-drafts-cli | 6/0/0 | 6/0/0 |
| planning-entity-verbs | 20/0/0 | 20/0/0 |
| state | 34/0/0 | 38/0/0 |
| todo-sync | 57/0/0 | 57/0/0 |
| trd-pre-check | 50/0/0 | 50/0/0 |
| state-advance-job | 21/0/0 | 21/0/0 |
| flag-spec.repo | 14/0/0 | 14/0/0 |
| rename-guard.repo | 20/0/0 | 20/0/0 |
| planning-writes.repo | 11/0/0 | 11/0/0 |
| planning-verbs-worktree | (absent) | 8/0/0 |

## Existing tests whose expectation changed

- **requirement-ids test 16d** (`a token that is only a prefix of a longer word is not an ID`). It asserted
  `ONUM-01x` is not an ID. D1's locked suffix (`[a-z]?`, needed so `AUTH-01a` stays mapped) makes `ONUM-01x` an ID,
  and Test list item 11 requires `AUTH-01a`, which has the same shape. The longer-word case now uses `ONUM-01xy` (two
  lowercase letters), which is still not an ID. This is a contract change from the decision, not a defect the test
  encoded.
- **mechanical-verbs `--dry-run plans the bookkeeping`**: the add-decision assertion expected `Cookie sessions` last.
  It now expects `--summary Cookie sessions --rationale simpler than JWT here` (D3; the old assertion pinned the
  colon cut).
- No summary-pairing, objective-completeness, state pinned (2d, 3, 6d, 7), summary-worktree, planning-verbs (incl.
  store D-14 test 15), entity-verbs, drafts or todo-sync test changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] record-metric added a blank line to STATE_ARCHIVE.md on every write after the first**
- **Found during:** Task 2 (test 22b, a different job, pinned exact bytes)
- **Issue:** the metrics regex stops before the file's final `\n`, and the replacement added its own `\n`, so each
  later write left `...files |\n\n` and a retry was not byte-stable.
- **Fix:** when the table ends the file, the rewrite ends with exactly one newline. A table followed by another
  section keeps its blank line. The seeded first write (pinned tests 2d and 6d) is byte-identical to before.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/state.cjs
- **Commit:** f1d097c1

### Notes

- `help.cjs` was not edited. Its trd finalize text ("add-decision per decision", `[--duration <d>]`) is still
  accurate, and the file is outside `files_modified`.
- Raw newline: added to `validate roadmap-coverage` (success) and `verify objective-evidence`. `verify
  objective-completeness --raw` stays `complete`/`incomplete` with no newline. The anti-patterns limit the newline to
  the two verbs named, and the third must-have truth reads most naturally as those two.

## Out of scope: callers left on the main root

- `todo-sync.cjs:337` resolves `resolveMainRoot(cwd)` and passes it to the entity verbs explicitly, because its plan
  reads main's todo archive. `contextOf(main)` then returns main (the main checkout holds itself), so the Stop hook's
  todo merge is unchanged.
- Store-only callers are untouched: the objective.cjs store paths, gh-* modules, tokens and estimate. In store mode
  `resolveVerbRoot` returns main, so every planning-verbs store path (outbox, ledger, mapping, `.trd-progress/`)
  still gets main.
- `planning-drafts.draftFileFor` keeps `repoKey(resolveMainRoot(root))`, so draft paths already handed out (including
  this JOB's and this SUMMARY's) stay valid. Test 29 asserts the draft path carries main's repo key.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (truths 1-7 by the tests above; truth 8 by the suite, the commit log and the checks below)
- Gate failures: None
- `ls /Users/justin/dev/aoforge-claude/.aoforge/quick | grep '^36-'` printed nothing (exit 1). The main checkout's
  `git status --short` shows only the pre-existing `?? amp`.
- Nothing pushed, tagged or released. Nothing written under ~/.claude or /Users/justin/dev/aoforge-claude. Fixtures
  lived under the OS temp dir (removed by the tests) and
  /private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/agent36/.
- Not published: per the orchestrator's override, no `quick summary`/`summary checkpoint`/planning verb was run
  against the repository. The orchestrator saves this SUMMARY.

## Self-Check: PASSED

- FOUND: planning-verbs-worktree.test.cjs, roadmap-coverage.cjs, trd-finalize.cjs, planning-mode.cjs
- FOUND: b065407f, 00bc2e58, 20bc58e0, f1d097c1, af567551, 98948a16
