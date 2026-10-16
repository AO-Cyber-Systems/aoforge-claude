---
objective: 54-codeql-cleanup
trd: "01"
subsystem: tooling
tags: [codeql, regex-injection, incomplete-sanitization, markdown-table, node-cjs]

requires: []
provides:
  - "lib/text-escape.cjs: escapeRegExp, objectiveNumPattern, mdCell (zero requires)"
  - "text-escape.test.cjs: 17 hand-built cases (TE-1..TE-17)"
  - "four duplicate escape helpers folded into the shared module"
affects: [54-06, 54-07, 54-08]

tech-stack:
  added: []
  patterns:
    - "One dependency-free escape module shared by lib modules and hooks (it must never require helpers.cjs, which loads model-profiles JSON at require time)"
    - "mdCell escapes backslash first, then pipe, then newlines"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/text-escape.cjs
    - plugins/devflow/devflow/bin/lib/text-escape.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/roadmap-progress.cjs
    - plugins/devflow/devflow/bin/lib/gh-wiki.cjs
    - plugins/devflow/devflow/bin/lib/watcher-shell.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
    - plugins/devflow/devflow/bin/lib/planning-verbs-cli.cjs

key-decisions:
  - "planning-verbs-cli tableCell became mdCell directly, with no wrapper: every caller passes a defined string (see Decisions Made)"
  - "objective.cjs keeps its local escapeRegExp until TRD 54-06, which owns that file"

requirements-completed: ["54-A", "54-B"]

verification:
  gates_defined: 1
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 4min
completed: 2026-10-04
tokens_input: 6084599
tokens_output: 40958
tokens_cache_read: 5940834
tokens_cache_write: 143639
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 54 TRD 01: Shared text-escape module Summary

**One dependency-free `lib/text-escape.cjs` (`escapeRegExp`, `objectiveNumPattern`, `mdCell`) now replaces four duplicate regex and table-cell escape copies, with 17 hand-built tests and every swapped module's existing tests passing unchanged.**

## Performance

- **Duration:** about 4 min
- **Started:** 2026-10-04T18:34:40Z (exec-context claim time)
- **Completed:** 2026-10-04T18:38:31Z
- **Tasks:** 2 of 2
- **Files modified:** 7 (2 created, 5 modified), 181 insertions, 27 deletions

## Progress
- [x] Task 1: Create lib/text-escape.cjs with escapeRegExp, objectiveNumPattern and mdCell — RED 86c32ae0, GREEN d3aca38d
- [x] Task 2: Replace the duplicate escape helpers with imports from text-escape.cjs — 83f5b3a4

## Accomplishments

- `text-escape.cjs` exports exactly `escapeRegExp`, `objectiveNumPattern` and `mdCell`, and contains no `require(` at all, so `hooks/changelog-on-tag.js` (TRD 54-07) can load it on every PreToolUse(Bash) call at no cost.
- The `escapeRegExp` return line is character-identical to `objective.cjs`'s (confirmed with a fixed-string match), keeping the exact sanitizer shape CodeQL recognises.
- `objectiveNumPattern` uses the lookahead `(?!\.?\d)` rather than `\b`, so `4.1` rejects `4.10`, `401` and `4.1.2` while still accepting a sentence-ending period, and `4` rejects `4.1`, `41` and `40`.
- Duplicates removed: `roadmap-progress.cjs` and `gh-wiki.cjs` `escapeRegExp`, `watcher-shell.cjs` `escapeRegex`, migration 0011 `cell`, `planning-verbs-cli.cjs` `tableCell`.
- After this TRD the only remaining non-test escape definition outside `text-escape.cjs` is `objective.cjs:1069` (removed by TRD 54-06).

## Task Commits

1. Task 1 RED: `86c32ae0` test(54-01): failing tests for shared text-escape helpers
2. Task 1 GREEN: `d3aca38d` feat(54-01): add dependency-free text-escape module (escapeRegExp, objectiveNumPattern, mdCell)
3. Task 2: `83f5b3a4` refactor(54-01): route duplicate regex and table-cell escapes through text-escape.cjs

## Decisions Made

- **`tableCell` replaced by `mdCell` directly.** The TRD said to do this only if every caller passes a defined value, since the old `tableCell(undefined)` produced `'undefined'` and `mdCell(undefined)` produces `''`. Checked: `stayLocalTable` is the only caller. Its rows come from `planning-import.cjs`, where every `kept_local` and `refused` push sets `rel` to a string (a template literal, `trdRelFor(...)` or a scanned relative path) and `reason` to a string (or `x.reason || ''`, or a template). The only direct test (`8b`) passes strings. The wrapper fallback was therefore not needed. The one theoretical behaviour change, a missing `rel` rendering as an empty cell and not the text `undefined`, is unreachable from any current producer.
- **Import placement.** `gh-wiki.cjs`, `watcher-shell.cjs`, migration 0011 and `planning-verbs-cli.cjs` take the import in their existing top-of-file require block, not at the old helper's position.
- **Comments.** The long `js/regex-injection` comment in `roadmap-progress.cjs` shrank to two lines pointing at `text-escape.cjs`, and the CodeQL alert 145 note in `gh-wiki.cjs` was kept as one line, as the TRD asked.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: text-escape module | `node --test plugins/devflow/devflow/bin/lib/text-escape.test.cjs` | 0 (17/17 pass) | PASS |
| 1: done-check, exports | `node -e "console.log(Object.keys(require('./plugins/devflow/devflow/bin/lib/text-escape.cjs')))"` | 0 (`[ 'escapeRegExp', 'objectiveNumPattern', 'mdCell' ]`) | PASS |
| 1: done-check, zero requires | `rg -n "require\(" plugins/devflow/devflow/bin/lib/text-escape.cjs` | 1 (no output, as required) | PASS |
| 2: swap duplicates | `node --test` over roadmap-progress, gh-wiki, watcher-shell, planning-verbs-cli, 0011 (check and apply) and text-escape test files | 0 (180 tests: 166 pass, 0 fail, 14 skipped) | PASS |
| 2: done-check, no stray definitions | `rg -n "function escapeRegE?x\|const (cell\|tableCell) = \(s\)" plugins/devflow/devflow/bin/lib --glob '!*.test.cjs'` | 0 (lists only `objective.cjs:1069` and the new `text-escape.cjs:8`) | PASS |

The 14 skips are PTY and shell-availability cases already conditional on the host (`node-pty unavailable`, plus W-3 and W-4 `SKIP`). None touch the edited code paths. No existing test file was edited.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/text-escape.test.cjs` | 1 (`MODULE_NOT_FOUND: ./text-escape.cjs`) | FAIL (correct) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/text-escape.test.cjs` | 0 (17/17) | PASS (correct) |
| REFACTOR | not applicable (Task 2 is a mechanical swap, covered by the existing tests above) | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test {files}` over the seven files above | 0 | PASS |
| test (full) | `npm test` | not run | not_available: deferred to TRD 54-09 by the dispatch instruction to run only tests relevant to the changed files |

The TRD's `<validation_gates>` names `npm test`. This run did not execute it, so the full suite is not claimed as passing here. `verification.gates_passed` is 0 in the frontmatter for that reason: the one defined gate (`npm test`) was not run, and the scoped run is recorded above as supporting evidence only.

## Deviations from Plan

None to the code or task scope: the TRD was executed as written.

### Process notes (not deviations)

- **Preflight ran twice.** The first `exec-context check` was issued from the session's default directory, which is the main checkout, so it proved and claimed `/Users/justin/dev/devflow-claude` (`is_worktree: false`) and not the dispatched worktree. It was re-run with `--cwd /Users/justin/dev/.df-worktrees/devflow-claude/54-01` and passed (`checkout` = the worktree, `branch` = `df/exec-54-01`, `base_visible: true`). The stray claim the first call left on the main checkout was cleared with `exec-context release --id 54-01` run against the main checkout, so it cannot raise a false SHARED INDEX for a sibling executor. Only claims held by id `54-01` were released. The main checkout's `git status` after the run matches the session-start snapshot (11 untracked files, none from this run).
- **One stray scratch write.** A mistyped path put one meaningless placeholder file under `/private/tmp/claude-501/-Users-justin/`. The file and the two empty directories that write created were removed. Nothing in the repo was affected.

## Auth Gates

None.

## Discovered commands

None. The stack profile (`general`, `.planning/STACK.md`) supplied `test` as `npm test` with scoped form `node --test {files}`, and no command had to be discovered.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (truths 1-5 in the TRD frontmatter: single module with three exports and no requires; metacharacter coverage; `objectiveNumPattern` boundaries; `mdCell` ordering and null handling; four duplicate helpers replaced with their existing tests passing unchanged)
- Gate failures: None. The full `npm test` gate was not run (deferred to TRD 54-09, see above).

## Next Phase Readiness

TRDs 54-06 (objective, roadmap, workstreams regex), 54-07 (detector, bootstrap, changelog regex and the changelog hook) and 54-08 (markdown table cells in `adopt.cjs` and `stack-report.cjs`) can now `require('./text-escape.cjs')`. Hooks should require it by relative path from `hooks/` (`../devflow/bin/lib/text-escape.cjs`), not through `helpers.cjs`.

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/text-escape.cjs`
- FOUND: `plugins/devflow/devflow/bin/lib/text-escape.test.cjs`
- FOUND: `.planning/objectives/54-codeql-cleanup/54-01-SUMMARY.md`
- FOUND: commit `86c32ae0` (test, RED)
- FOUND: commit `d3aca38d` (feat, GREEN)
- FOUND: commit `83f5b3a4` (refactor, Task 2)
- Commits are on branch `df/exec-54-01`; the main checkout carries no files from this run.
