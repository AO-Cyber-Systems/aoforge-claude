---
objective: 60-edit-gate-enforces-the-action
job: "01"
subsystem: hooks
tags: [shell-parsing, gate-commits, session-audit, heredoc, bash-write-detector]

requires:
  - objective: 27-gate-correctness
    provides: invocation-aware command parsing in gate-commits (TRD 27-04)
  - objective: 44
    provides: per-invocation parsing primitives (maskQuoted, unquoteWord, resolvePathWord)
provides:
  - "lib/shell-words.cjs: one home for the shell-text primitives, plus extractHeredocs, scanShell, maskTests, parseCommand"
  - "__fixtures__/bash-write-cases.cjs: WRITE_CASES, MENTION_CASES, PATH_CASES, TRACKED, DIRS shared by 60-02..60-05"
affects: [60-02, 60-03, 60-04, 60-05]

tech-stack:
  added: []
  patterns:
    - "Length-preserving masking: every masked string has exactly the input length, so raw words are read back by offset"
    - "Fail-open lib require from a hook: a failed require makes run() a no-op"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/shell-words.cjs
    - plugins/devflow/devflow/bin/lib/shell-words.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/bash-write-cases.cjs
  modified:
    - plugins/devflow/hooks/gate-commits.js
    - plugins/devflow/devflow/bin/lib/session-audit.cjs

key-decisions:
  - "scanShell finishes with maskTests itself, so arithmetic and [[ ]] masking is part of scanShell (the TRD pseudocode ran it in parseCommand; maskTests is idempotent, so the result is identical)"
  - "The separator splitter and the word scanner honour a backslash escape, so `find ... -exec rm {} \\;` stays one simple command and `cp a\\ b d` keeps `a\\ b` whole"
  - "gate-commits destructures four primitives, not five: unquoteWord was used only inside resolvePathWord"

patterns-established:
  - "Primitives under devflow/bin/lib/ are the shared home for shell-text parsing; hooks require them by path.join(__dirname, '..', 'devflow', 'bin', 'lib', ...)"

requirements-completed: [GATE-02]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 10min
completed: 2026-10-06
---

# Objective 60 TRD 01: Shared shell-text primitives and hand-built command cases Summary

**The commit gate's heredoc and quote primitives now live in `lib/shell-words.cjs`, next to a new left-to-right `scanShell` and a heredoc-aware `parseCommand`, with the 68-case hand-built table 60-02 to 60-05 will share.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-10-06T00:38:47Z
- **Completed:** 2026-10-06T00:49:07Z
- **Tasks:** 3/3 (four task commits: Task 2 is RED then GREEN)
- **Files modified:** 5 (3 created, 2 modified)

## Progress
- [x] Task 1: Hand-built command cases shared by 60-02 to 60-05 — 5def9a64
- [x] Task 2: lib/shell-words.cjs (moved primitives plus extractHeredocs, scanShell, parseCommand) — 7074f5f9 (RED), 00c3c84e (GREEN)
- [x] Task 3: gate-commits.js and session-audit.cjs require shell-words — 515dd660

## Accomplishments

- One definition of `stripHeredocs`, `stripQuoted`, `maskQuoted`, `unquoteWord`, `resolvePathWord` and `stripHeredocBodies`. The five hook functions were removed by a script that first proved each body and doc comment appears character-for-character in `shell-words.cjs`.
- `extractHeredocs` returns bodies as well as the stripped text (`delimiter`, `quoted`, `body`, `opener` as an offset into `text`), so an interpreter heredoc can later be read as code while every other heredoc stays data.
- `scanShell` masks quotes, comments, `$(( ))`/`(( ))` and `[[ ]]` in one pass without moving an offset, and reports `ok: false` on an unterminated quote. An apostrophe in a comment opens no quote.
- `parseCommand` splits on `&& || ; | & ( )` and newline, never splits a redirection (`2>&1`, `&>`, `>&2`, `>|`), and attaches each heredoc to the segment whose line opened it (`cd sub && python3 - <<'EOF'` gives the body to `python3`).
- `bash-write-cases.cjs`: 32 write, 22 mention and 14 path cases, all names unique, deep-frozen.
- gate-commits behaviour is unchanged: `gate-commits.test.js` and `gate-commits-merge-sequence.test.js` pass unedited, and `gate.stripHeredocs === shellWords.stripHeredocs`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Hand-built command cases | `node -e "const c=require('.../bash-write-cases.cjs'); console.log(c.WRITE_CASES.length, c.MENTION_CASES.length, c.PATH_CASES.length, new Set([...]).size)"` printed `32 22 14 68` | 0 | PASS |
| 2: shell-words module (tests 2-10) | `node --test plugins/devflow/devflow/bin/lib/shell-words.test.cjs` | 0 | PASS (50 pass, 2 todo for Task 3) |
| 3: gate-commits and session-audit share the module | the six test files in the TRD (350 tests plus 41 suites, all green); `rg -n "function (stripHeredocs\|stripQuoted\|maskQuoted\|unquoteWord\|resolvePathWord)\|HEREDOC_BODY_RE"` outside tests | 0 | PASS |

Final `shell-words.test.cjs`: 52 tests, 52 pass, 0 todo. Baseline before the Task 3 edits: the five existing test files had 298 tests, 298 pass.

## Task Commits

1. **Task 1: hand-built bash write cases** - `5def9a64` (test)
2. **Task 2: shell-words primitives and parseCommand, RED** - `7074f5f9` (test). `node --test` exited 1: `Cannot find module './shell-words.cjs'`.
3. **Task 2: shell-words scanner and parseCommand, GREEN** - `00c3c84e` (feat)
4. **Task 3: gate-commits and session-audit share lib/shell-words** - `515dd660` (refactor)

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/shell-words.test.cjs` (module missing) | 1 | FAIL (correct) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/shell-words.test.cjs` | 0 | PASS (correct), tests 2-10 green, test 1 `todo` |
| REFACTOR (Task 3) | six test files, existing ones unedited | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| task: test (scoped) | `node --test` over the six files named in the TRD, plus `changelog-on-tag.test.js` (consumer of the re-exports) | 0 | PASS |
| objective: test (full) | `npm test` | 1 | 3 failures, none caused by this TRD (see Deviations). The objective gate is owned by 60-07 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Backslash-escaped separators and spaces**
- **Found during:** Task 2 (designing the splitter)
- **Issue:** The TRD's separator list would split `find . -exec rm {} \;` at the escaped `;` and split `cp a\ b d` at the escaped space, giving a detector wrong simple commands and wrong operands.
- **Fix:** `splitBounds` skips the character after a backslash, and the word scanner is `(?:\\[\s\S]|\S)+`. Two named tests pin it.
- **Files modified:** `shell-words.cjs`, `shell-words.test.cjs`
- **Commit:** `00c3c84e` (code), `7074f5f9` (tests)

**2. [Rule 3 - Blocking/consistency] `scanShell` calls `maskTests` itself**
- **Found during:** Task 2
- **Issue:** The TRD's truths say `scanShell` masks arithmetic and `[[ ]]`, but its `parseCommand` pseudocode applies `maskTests` after `scanShell`, so a direct `scanShell('$(( 3 > 2 ))')` would not have masked it.
- **Fix:** `scanShell` ends with `maskTests`. `parseCommand` does not repeat it. `maskTests` stays exported and is idempotent, so both call shapes agree.
- **Commit:** `00c3c84e`

**3. [Rule 3 - Blocking] gate-commits drops the `os` require and `unquoteWord` binding**
- **Found during:** Task 3
- **Issue:** The TRD said to check `os` before deleting it. `os` was used only by `resolvePathWord`, and `unquoteWord` only inside `resolvePathWord`, so keeping either would leave an unused binding.
- **Fix:** removed the `os` require and destructure four primitives, not five.
- **Commit:** `515dd660`

### Notes (not deviations)

- `rg "function maskQuoted"` outside tests also matches `lib/yaml-lite.cjs`. That is an unrelated YAML masker with its own signature, not a copy of the shell primitive, and was left alone.
- `changelog-on-tag.js` imports `stripHeredocs`/`stripQuoted` from `gate-commits.js`. They are still re-exported, and `changelog-on-tag.test.js` passes. On a broken install where `shell-words.cjs` cannot load, those two would be `undefined`, so that hook would throw (a non-blocking hook error), while `gate-commits.js` itself fails open. Same broken-install-only condition the TRD names.
- Known limits of the shared scanner are recorded in the `shell-words.cjs` header (a quote nested inside `$( )` inside double quotes, a `<<WORD` inside a quoted string, `<<<` followed by a word line). All three fail toward "no write detected".

### Full-suite failures (3), none caused by this TRD

| Test | Cause |
|---|---|
| `roadmap-reconcile` E2E1 "zero drift against this repo ROADMAP" | Expected mid-objective: it reports `60-01` as `[ ]` in ROADMAP while its SUMMARY now exists. The `roadmap update-job-progress 60` step that closes this TRD is what ticks it. |
| `stack-drafter-fleet` "github-enterprise-migration: draft has no unaccepted conflict" | Pre-existing. Fails identically at base commit `05a5b5f4` (run in a throwaway detached worktree, since removed). Depends on `~/dev/github-enterprise-migration`'s committed STACK.md. |
| `handoff-e2e` MA-7 "doctl auth init with unset DIGITALOCEAN_TOKEN" | Environmental: `doctl` is installed and resolves auth on this machine, so the command succeeds where the test expects a failure. The test references none of the modules this TRD touched. Not compared at base: the base-commit run from the scratch worktree failed differently (the daemon never started there), so it proves nothing either way. |

## Discovered commands

None. The stack profile (`general`) names `npm test` and `node --test {files}`, and both were used as given.

## Flutter UI Evidence

Not applicable (non-UI TRD).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - single home for the primitives, `gate-commits.js` and `session-audit.cjs` define none of them (confirmed by `rg`)
  - gate-commits tests unedited and green, `gate.stripHeredocs === shellWords.stripHeredocs`
  - `scanShell` masks without moving offsets, `ok: false` on an unterminated quote (smoke-checked across all 68 fixture cases: 0 offset errors, only `m-unbalanced` reports `ok: false`)
  - `parseCommand` segmentation, redirection handling and heredoc ownership per tests 8-9
  - the WRITE/MENTION/PATH tables exist
- Gate failures: the objective gate is not yet green for reasons outside this TRD (table above)

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/shell-words.cjs`
- FOUND: `plugins/devflow/devflow/bin/lib/shell-words.test.cjs`
- FOUND: `plugins/devflow/devflow/bin/lib/__fixtures__/bash-write-cases.cjs`
- FOUND commits: `5def9a64`, `7074f5f9`, `00c3c84e`, `515dd660`
