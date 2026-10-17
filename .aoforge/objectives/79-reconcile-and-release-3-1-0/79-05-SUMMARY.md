---
objective: 79-reconcile-and-release-3-1-0
trd: "05"
subsystem: planning-records
tags: [requirements-agreement, W065, EST-11, stack-profile, STACK.md, stack-packs]
requires:
  - 79-01 (merged integrate/3.1.0 tree, its suite triage routing two failures here)
provides:
  - "75-VERIFICATION.md reports EST-11 NOT SATISFIED, agreeing with 75-01-SUMMARY and REQUIREMENTS.md"
  - ".aoforge/STACK.md under the AOForge names (id aoforge-claude, current layout and test globs)"
  - "Flutter and Dart pack profiles that name the aoforge-stack-flutter pack as their home"
affects: [79-08]
tech-stack:
  added: []
  patterns: ["fix the record, not the checker: requirements-agreement.cjs was right, 75-VERIFICATION.md was wrong"]
key-files:
  created: []
  modified:
    - .aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-VERIFICATION.md
    - .aoforge/STACK.md
    - plugins/aoforge-stack-flutter/profiles/flutter.md
    - plugins/aoforge-stack-flutter/profiles/dart.md
key-decisions:
  - "EST-11 is corrected in 75-VERIFICATION.md (the row that was wrong), never ticked and never listed in a SUMMARY's requirements-completed: the prospective retest's verdict is not met (75-RETEST-REPORT.md)."
  - "stack-profiles-content.test.cjs is unchanged: its 'bundled with AOForge' assertion is about the go profile, which still ships in core."
requirements-completed: []
metrics:
  duration: 3min
  started: 2026-10-17T03:18:50Z
  completed: 2026-10-17T03:21:13Z
  tasks: 2
  files: 4
tokens_input: 4619919
tokens_output: 24208
tokens_cache_read: 4513468
tokens_cache_write: 106365
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 79 TRD 05: Objective 75 records and stack text Summary

**75-VERIFICATION.md now says EST-11 is NOT SATISFIED (the retest's verdict is not met), so the two repo tests that failed since objective 75 pass with no code or test change, and `.aoforge/STACK.md` and the Flutter and Dart pack profiles describe the 3.1.0 tree.**

## Progress
- [x] Task 1: Correct the EST-11 coverage row through the planning verb — 5d8cf936
- [x] Task 2: STACK.md under the AOForge names, and the pack profiles' home — d0e68b80

## What changed

**Task 1.** `75-VERIFICATION.md`'s Requirements Coverage row for EST-11 read `SATISFIED (as an honest report; verdict not
met)`. The checker (`requirements-agreement.cjs`) counts a row only when it says SATISFIED and not NOT SATISFIED, so it
asked for EST-11 in some SUMMARY's `requirements-completed`. 75-01-SUMMARY correctly lists none and REQUIREMENTS.md leaves
EST-11 unticked ("Not met"), so the VERIFICATION row was the wrong record. The row now reads `NOT SATISFIED (reported
honestly: the prospective retest's verdict is not met; see 75-RETEST-REPORT.md and todo est-11-follow-up-objective-75)`,
with one dated correction line under the table naming objective 79 and TRD 79-05. Published with
`verification post 75 --from <draft> --file 75-VERIFICATION.md`; the diff is 3 insertions and 1 deletion in that one
file (no formatter side effects). No other row, score or verdict changed.

**Task 2.** `.aoforge/STACK.md`: `id: aoforge-claude`, `provenance.reviewed: "2026-10-16"`, title, Layout (the 78-12
proposal: `plugins/aoforge/`, `aoforge/bin/aof-tools.cjs`, `aoforge/bin/lib/*.cjs`, the `~/.claude/aoforge` mirror, plus the
stack packs `plugins/aoforge-stack-flutter/` and `plugins/aoforge-stack-web/`) and Testing (fixtures under
`aoforge/bin/lib/__fixtures__/` and `hooks/__fixtures__/`, the four current `npm test` globs, and the named
`watcher-shell.test.cjs` exclusion in place of the old micro.test.cjs one). The commands block is untouched. The pack
profiles `flutter.md` and `dart.md` no longer say "bundled with AOForge (`aoforge/stack-profiles/...`)": they name the
`aoforge-stack-flutter` pack and the mirror path read from `hooks/sync-pack.cjs`
(`~/.claude/aoforge/stacks/aoforge-stack-flutter/profiles/<name>.md`).

## Findings handed to other TRDs

- **for 79-07:** `doc-refs.repo.test.cjs` test 2 still fails on `CLAUDE.md:163  ui-eval -> unknown` (already routed by
  79-01, failure #2). My edits add no finding there: that is the only finding in the run.
- **for 79-02 or 79-08 (comment only, no failure):** `plugins/aoforge-stack-flutter/hooks/sync-pack.cjs` lines 7-8 say
  `pack-mirror.repo.test.cjs` fails CI on hook drift, but no such file is tracked. The byte-for-byte check lives in
  `stack-packs.test.cjs` ("depends on aoforge and vendors the mirror hook byte for byte", passing). The comment names a
  file that does not exist; suggested fix: point it at `stack-packs.test.cjs`. Left alone: the hook is byte-identical
  in `aoforge-stack-web` and the test enforces that, so a one-sided edit would fail CI.
- Nothing else outside my domain.

## Deviations from Plan

None - TRD executed exactly as written.

The TRD allowed `stack-profiles-content.test.cjs` to change "only if the profile wording change needs it". It did not:
its one `bundled with AOForge` assertion (line 234) is about `go.md`, which still ships in core
(`plugins/aoforge/aoforge/stack-profiles/go.md`), so the test and `go.md` are unchanged.

`requirements mark-complete` was not run: the TRD's `requirements: [SC-3]` is objective 79's success criterion, not a
REQUIREMENTS.md id, so `requirements-completed` is `[]` (and EST-11 must never appear in it).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: EST-11 row (RED) | `env HOME=<scratch> node --test requirements-agreement.repo.test.cjs validate-requirements.test.cjs` | 1 (2 fail: test 11 and test 9, both EST-11) | RED as expected |
| 1: EST-11 row (GREEN) | the same command after `verification post` | 0 (10 pass, 0 fail) | PASS |
| 1 | `aof-tools validate requirements --raw` | 0 ("requirements-completed agrees with VERIFICATION (67 objectives, 41 requirements checked)") | PASS |
| 1 | `git diff --stat` after the verb | 0 (only 75-VERIFICATION.md, 3+/1-) | PASS |
| 2: STACK.md and profiles | `aof-tools stack validate` | 0 (ok, no errors, no warnings) | PASS |
| 2 | `aof-tools stack resolve` before and after | 0 (only `id` and `provenance.reviewed` differ; commands, loop, gates, generated, verification identical) | PASS |
| 2 | `rg -n -e "devflow" -e "df-tools" .aoforge/STACK.md` | 1 (no match) | PASS |
| 2 | `rg -n "bundled with" plugins/aoforge-stack-flutter/profiles` | 1 (no match) | PASS |
| 2 | `env HOME=<scratch> node --test stack-profiles-content.test.cjs stack-profile.test.cjs stack-neutrality.repo.test.cjs` | 0 (83 pass) | PASS |
| 2 | `env HOME=<scratch> node --test rename-guard.repo.test.cjs` | 0 (20 pass) | PASS |
| 2 | `env HOME=<scratch> node --test stack-packs.test.cjs` | 0 (46 pass, hook mirror byte-for-byte included) | PASS |
| 2 | `env HOME=<scratch> node --test 'plugins/aoforge-stack-flutter/**/*.test.cjs'` | 0 (268 pass) | PASS |
| 2 | `env HOME=<scratch> node --test doc-refs.repo.test.cjs` | 1 (only the known `CLAUDE.md:163 ui-eval`, routed to 79-07) | PASS for this TRD |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task gate, scoped per the TRD) | `env HOME=<scratch> node --test requirements-agreement.repo.test.cjs validate-requirements.test.cjs stack-profiles-content.test.cjs` | 0 (33 pass, 0 fail) | PASS |
| test (full `npm test`) | not run here | n/a | not_available: the full suite is 79-08's; this TRD ran the scoped gate plus the neighbours above. Any full-suite run excludes `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs` (its W-3 fish-shell test hangs on this machine) |

All test runs used a scratch `HOME` (`mktemp -d`); the real `~/.claude` was not touched. No `node_modules` symlink was
needed or created.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 4/4 (EST-11 row NOT SATISFIED with the reason and a dated correction note; both repo tests pass
  with no code change and `validate requirements --raw` reports no finding; STACK.md carries the adopted 78-12 text and
  `stack validate` passes; the Flutter and Dart profiles name the pack)
- `validate health --raw` on the worktree: no errors, W065 gone; remaining warning W040 (stamped v3.0.0) is 79-08's
  upgrade, and the I001 entries are the TRDs of this objective that have no SUMMARY yet
- Gate failures: None

## Discovered commands

None. The commands block of STACK.md was read as is (`npm test`, scoped `node --test {files}`).

## Self-Check: PASSED

- FOUND: `.aoforge/objectives/75-prospective-estimate-retest-and-todo-sweep/75-VERIFICATION.md` contains `NOT SATISFIED`
- FOUND: `.aoforge/STACK.md` contains `aoforge-claude`, no `devflow` or `df-tools`
- FOUND: `plugins/aoforge-stack-flutter/profiles/flutter.md` and `dart.md`, no `bundled with`
- FOUND: 5d8cf936 and d0e68b80 in `git log`
