---
objective: quick-33
trd: 01
subsystem: estimate, skill-requires, hooks (CodeQL cleanup)
tags: [codeql, escaping, tests]
requires: [54-01 mdCell, 54-04 Case V1]
provides: "13 CodeQL source patterns removed from release PR #126"
key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/estimate-format.cjs
    - plugins/devflow/devflow/bin/lib/estimate-format.test.cjs
    - plugins/devflow/devflow/bin/lib/skill-requires.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/14-skill-requires.test.cjs
    - plugins/devflow/hooks/gate-commits-merge-sequence.test.js
decisions:
  - "No CHANGELOG entry: estimate-format.cjs and both table renderers are new in the untagged 2.14.0, so the bug never shipped"
metrics:
  completed: 2026-10-08
---

# Quick 33: clear the 13 new CodeQL alerts on release PR #126 Summary

The milestone and backtest table cells now escape through the shared `mdCell` (backslash before pipe), the skill-requires tests assert install hints by exact equality, and the merge-sequence replay spawns argv with no shell.

## Progress
- [x] Task 1: estimate-format escapes table cells with the shared mdCell (RED 52160f6b, GREEN 5b810565)
- [x] Task 2: exact install-hint assertions in the skill-requires tests (4d55995b)
- [x] Task 3: merge-sequence replay spawns argv with no shell (8d4396af)

## Commits

| Task | Hash | Message |
|---|---|---|
| 1 RED | 52160f6b | test(estimate): table cells with backslash-pipe split into extra columns (RED) |
| 1 GREEN | 5b810565 | fix(estimate): escape milestone and backtest table cells with mdCell (backslash before pipe) |
| 2 | 4d55995b | test(skill-requires): assert install hints exactly, not by URL substring |
| 3 | 8d4396af | test(hooks): merge-sequence replay runs documented commands as argv, no shell |

All four went through `df-tools commit`. Nothing was pushed. `git diff 66f64a2d --stat` lists exactly the 5 files in `files_modified` (94 insertions, 27 deletions).

## What changed

**Task 1 (js/incomplete-sanitization, 2 alerts).** `estimate-format.cjs` had two pipe-only escapers, `cell` in `milestoneTable` and module-level `cellText`. Both are gone. `milestoneTable`, `objectiveLabel` (backtest objective rows) and the backtest class table (`mdCell(c.class)`) now call `mdCell` from `text-escape.cjs`. No alias was kept. A value containing backslash+pipe used to render `a\\|b`, which GFM reads as an escaped backslash plus a real pipe, so the row grew an extra cell.

**Task 2 (js/incomplete-url-substring-sanitization, 10 alerts).** `doctor-checks/14-skill-requires.test.cjs` asserts `fix_command` with `assert.equal` at tests 9, 9c, 10, 10b and 12b, against `INSTALL_HINTS.<tool>` or the exact composed string. In `skill-requires.test.cjs`, 6a uses `sr.INSTALL_HINTS.gh` (the whole hint, stricter than the URL), 6b asserts `not installed: gh: <hint>; docker: <hint>. ` exactly, and 6f compares the flutter and go hints with `assert.equal`. Test names and counts are unchanged. Every replaced assertion is at least as strict as before (9c now proves the whole `fix_command` equals the docker hint, which subsumes "gh's hint is absent").

**Task 3 (js/shell-command-constructed-from-input, 1 alert).** `sh(cmd, cwd)` (`spawnSync('sh', ['-c', cmd])`) is replaced by `argvOf(cmd)` plus `runArgv(argv, cwd)`. `argvOf` splits on whitespace and fails the test loudly if any word falls outside `SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/` or the first word looks like an env assignment. `step` computes argv only when it runs, so the `run: false` df-tools lines (which contain `~`) are never turned into argv. The resolve step passes an explicit argv, `[process.execPath, REPO_BIN, 'merge-driver', 'resolve', p]`, so the `JSON.stringify` quoting is gone. The planning-conflict, abort and clean paths and the resolve step still run for real.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 RED | `node --test .../estimate-format.test.cjs` | 1 (2 new tests fail, 54 pass) | PASS (correct RED) |
| 1 GREEN | `node --test .../estimate-format.test.cjs` | 0 (56/56) | PASS |
| 1 | `node --test .../text-escape.test.cjs` | 0 (24/24, untouched) | PASS |
| 2 | `node --test .../skill-requires.test.cjs` | 0 (42/42) | PASS |
| 2 | `node --test .../doctor-checks/14-skill-requires.test.cjs` | 0 (17/17) | PASS |
| 3 | `node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js` | 0 (21/21, 0 skipped) | PASS |

## TDD Evidence (Task 1)

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/estimate-format.test.cjs` | 1 | FAIL (correct) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/estimate-format.test.cjs` | 0 | PASS (correct) |

RED failure messages (both on cell count, the intended failure):
- milestone: `| 80 a\\|b | partial, 3 of 4 TRDs left | 26 min | 1h 09m | $6.80 | medium |` ... `7 !== 6`
- backtest: `| 90 a\\|b | 1 | reconstructed | 2h 09m / 6h 40m | 1h 40m | 1.29 | yes | $1.68 / $6.72 | $1.68 | 1.00 | yes |` ... `12 !== 11`

## Per-file counts

| File | Before (66f64a2d) | After |
|---|---|---|
| estimate-format.test.cjs | 54/54 | 56/56 (N = 2) |
| skill-requires.test.cjs | 42/42 | 42/42 |
| doctor-checks/14-skill-requires.test.cjs | 17/17 | 17/17 |
| gate-commits-merge-sequence.test.js | 21/21 | 21/21 |
| text-escape.test.cjs | 24/24 | 24/24 |

## Validation Gate Results

`npm test` (the stack's task gate) ran before each of the three task commits.

| Gate | Command | tests | pass | fail | skipped | Status |
|---|---|---|---|---|---|---|
| baseline at 66f64a2d | `npm test` | 11073 | 11039 | 0 | 34 | (given) |
| after Task 1 | `npm test` | 11075 | 11041 | 0 | 34 | PASS |
| after Task 2 | `npm test` | 11075 | 11041 | 0 | 34 | PASS |
| after Task 3 (final) | `npm test` | 11075 | 11041 | 0 | 34 | PASS |

Final totals are 11073 + 2 tests, 11039 + 2 pass, 0 fail, 34 skipped, as required. Other gates in the stack profile (build, lint, format, typecheck, codegen) are `none`.

## Post-condition greps

- `rg -n -F "replace(/\|/g" plugins/devflow --glob '!*.test.*' --glob '!*.md'` prints only `plugins/devflow/devflow/bin/lib/text-escape.cjs:36`.
- `rg -n "cellText|const cell = " plugins/devflow/devflow/bin/lib/estimate-format.cjs` prints nothing.
- `rg -n "includes\('[^']*\.(com|dev|org|io)"` over the two skill-requires test files prints nothing.
- `rg -n "https://"` over the same two files prints only the two 6f `assert.equal` lines (`skill-requires.test.cjs:334-335`). The `'https://` form in the job's verify line (with the leading quote) matches nothing, because those literals start with `'install ...`. The check was run without the leading quote.
- `rg -n "'sh'|'-c'|shell:" plugins/devflow/hooks/gate-commits-merge-sequence.test.js` prints one line, 256: `const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', ''])`. That is the set of markdown fence languages the test reads out of the workflow doc, not a spawn. No `sh`, `-c` or `shell:` option reaches `spawnSync`.
- Guard sanity: `SAFE_WORD` rejects `;`, `~`, `"`, `'`, `$`, backslash, backtick, `|`, `&`, `<`, `>`, `(`, `)`, `*`, `?` and whitespace (checked directly with node). It accepts the documented words (`git`, `df/exec-07-01`, `--ours`, `--`, `.planning/STATE_ARCHIVE.md`, `merge-driver`). No test for `argvOf` itself was added (a test helper, not shipped code).

## No CHANGELOG change (locked decision)

CHANGELOG.md is not modified. The escaping bug never shipped: `estimate-format.cjs` and both affected renderers (`estimate milestone`'s table, objective 58; `estimate backtest`'s report, objective 64) are new in 2.14.0, which is untagged (`git tag -l 'v2.14*'` prints nothing). The 2.14.0 `### Added` entries describe these features as they will ship, with correct escaping. A `### Fixed` line would describe a defect no released version had. Tasks 2 and 3 change tests only.

## Deviations from Plan

None. The TRD executed as written. Two notes, neither a behavior change:
- The first draft of the Task 1 backtest test located the table header as `lines[from + 1]`, which is the blank line after the heading, so it failed on `0 !== 11` rather than the intended cell-count mismatch. It was corrected before the RED commit to find the header by its `| Objective |` first cell; the committed RED fails on `12 !== 11`.
- The `SHELL_LANGS` hit in the Task 3 grep and the `'https://` pattern in the Task 2 grep are described above.

## Alert closure

The 13 alerts are cleared in the sense the job defines: each flagged source pattern is gone and every test passes. There is no local CodeQL CLI, so closure on release PR #126 is confirmed only when the PR's CodeQL job re-runs after the user pushes. Nothing was pushed.

## Discovered commands

None. `npm test` and `node --test {files}` came from the stack profile.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (mdCell at every former site; `\|` round-trip tests pass; no hostname `includes(` in the two files; no shell spawned; npm test 11075/11041/0/34; CHANGELOG untouched and nothing pushed)
- Gate failures: None

## Self-Check: PASSED

- Commits 52160f6b, 5b810565, 4d55995b and 8d4396af are in `git log 66f64a2d..HEAD`.
- The 5 modified files exist, and `git diff 66f64a2d --stat` lists only those 5.
