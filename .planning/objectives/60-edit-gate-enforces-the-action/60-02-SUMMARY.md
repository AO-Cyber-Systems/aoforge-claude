---
objective: 60-edit-gate-enforces-the-action
job: "02"
subsystem: hooks
tags: [bash-write-detector, shell-parsing, edit-gate, heredoc, interpreter-code]

requires:
  - objective: 60-edit-gate-enforces-the-action
    provides: "lib/shell-words.cjs (parseCommand, unquoteWord, resolvePathWord) and the shared WRITE/MENTION cases (60-01)"
provides:
  - "lib/bash-write-detect.cjs: detectBashWrites(cmd, {cwd, home, depth}), mayWrite(cmd), inlineWrites(lang, code, base)"
affects: [60-03, 60-04, 60-05]

tech-stack:
  added: []
  patterns:
    - "Operators are read from masked words only, so quoted text and heredoc bodies can never match"
    - "Ambiguity resolves to path null or no write, never to a guess"
    - "Executed text (bash -c, interpreter -c/-e, a heredoc on an interpreter's stdin) is parsed; every other heredoc is data"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/bash-write-detect.cjs
    - plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs
  modified: []

key-decisions:
  - "pushd with no argument swaps directories, so the base becomes unknown (null), unlike cd with no argument, which goes home"
  - "A cp/mv destination of `.` or `..` counts as a directory (into: true), alongside a trailing slash and -t"
  - "A python name bound to two different literals, or rebound to a non-literal, or a for/as target, is unresolvable (path null)"
  - "A heredoc piped into an interpreter (`cat <<EOF | python3 -`) belongs to cat, so it is data: an accepted false negative, documented in the header"

requirements-completed: [GATE-01, GATE-02]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 25min
completed: 2026-10-06
---

# Objective 60 TRD 02: Bash write detector Summary

**`lib/bash-write-detect.cjs` reads a Bash command and reports every file it writes (redirect, tee, sed -i, perl -i, cp/mv, inline python and node) with an absolute path or `null`, and reports nothing for commands that only mention a write.**

## Performance

- **Duration:** 25 min
- **Completed:** 2026-10-06
- **Tasks:** 2/2 (four commits: each task is RED then GREEN)
- **Files modified:** 2 (both created)

## Progress
- [x] Task 1: Shell forms (redirect, tee, sed -i, perl -i, cp/mv, cd tracking, wrappers, shell recursion, mayWrite) — 08b48c13 (RED), 8fc1d82b (GREEN)
- [x] Task 2: Inline python and node writes — 15614664 (RED), 2047a20c (GREEN)

## Accomplishments

- `detectBashWrites` returns `[{ form, path, raw, segment, sources?, into? }]`. Forms: `redirect | tee | sed-i | perl-i | cp | mv | python | node`.
- Redirects are read from masked words only (`/^(\d+|&)?(>>|>\||>)(.*)$/`), so a `>` inside quotes, a heredoc body, `[[ ]]` or `(( ))` never matches. `2>&1`, `>&2`, `/dev/*` targets, input redirects, here-strings and process substitution are skipped.
- `cd`/`pushd`/`popd` track the working directory for later segments only. `$VAR`, backticks, `cd -`, `popd` and an unknown cwd give `path: null`; an absolute target still resolves.
- Wrappers `env`, `command`, `sudo`, `nohup`, `time` and leading `NAME=value` words are skipped. `command -v` has no command word.
- `bash|sh|zsh|dash -c CODE` and a heredoc fed to a shell recurse (depth 3). A script operand makes the heredoc that script's stdin, which is data.
- `inlineWrites` reads python `open(ARG, MODE)` (positional or `mode=`, only `w a x +`), `Path(ARG).write_text/write_bytes` and `NAME.write_text/write_bytes`, and node `writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream`. ARG is a literal or a name bound to exactly one literal; anything else is a write with `path: null`.
- `mayWrite` is a cheap superset prefilter for the hook (60-04): false for `ls`, `git status`, `npm test`, `rg`; true for every WRITE case.
- The module is pure: no `fs`, no `child_process` (a test reads its own source to prove it).
- Transcript-shaped commands from the TRD (`cd ~/dev/aocore/go; python3 - <<'EOF' ...`, `sed -i '' ...`, `perl -pi -e ...`) resolve to the right absolute paths.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Shell forms | `node --test plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs` (only the 7 python/node table rows were todo) | 0 | PASS |
| 2: Inline python and node | `node --test plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs` (no todo left) | 0 | PASS |

Final test file: 96 tests, 96 pass, 0 todo. That covers all 32 WRITE_CASES, all 22 MENTION_CASES, the named unit cases 3-15 and a set of extra edge cases (python mode matrix, name rebinding, node `-p`/`--eval`, `command -v`, `mv -t`, `cp a .`, an interpreter inside `bash -c`).

## Task Commits

1. **Task 1 RED** - `08b48c13` (test): `node --test` exited 1 with `Cannot find module './bash-write-detect.cjs'`
2. **Task 1 GREEN** - `8fc1d82b` (feat)
3. **Task 2 RED** - `15614664` (test): 20 tests failing (the 7 python/node table rows plus 13 of the 14 new inline cases)
4. **Task 2 GREEN** - `2047a20c` (feat)

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs` (module missing) | 1 | FAIL (correct) |
| GREEN (Task 1) | same | 0 | PASS (correct), 7 python/node rows todo |
| RED (Task 2) | same, `todo` removed, tests 11-12 and inline cases added | 1 | FAIL (correct) |
| GREEN (Task 2) | same | 0 | PASS (correct), 0 todo |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| task: test | `node --test plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs plugins/devflow/devflow/bin/lib/shell-words.test.cjs` | 0 | PASS (148 tests, 148 pass, 0 todo) |
| purity | `rg -n "require\('(fs\|child_process)'\)" plugins/devflow/devflow/bin/lib/bash-write-detect.cjs` | 1 (no match) | PASS |
| objective: test (full) | `npm test` | 1 | 3 failures, none in this TRD's modules (see below). The objective gate is owned by 60-07 |

### Full-suite failures (3), none caused by this TRD

The run was 9956 tests, 9921 pass, 3 fail, 32 skipped. This TRD adds one new module and its test file and edits nothing else.

| Test | Cause |
|---|---|
| `handoff-e2e` MA-7 "doctl auth init with unset DIGITALOCEAN_TOKEN" | Environmental: `doctl` resolves auth on this machine. Already recorded in the 60-01 SUMMARY. |
| `stack-drafter-fleet` "github-enterprise-migration: draft has no unaccepted conflict" | Pre-existing, depends on `~/dev/github-enterprise-migration`'s committed STACK.md. Already recorded in the 60-01 SUMMARY. |
| `gh-pr-cli` 13j "reconcile of a PR closed without merging is exit 1" | Timing or environment dependent: it took 266 s in the full run, and `gh-pr-cli.test.cjs` passes when run alone. Nothing requires the module this TRD created, so it cannot affect that test. |

## Deviations from Plan

None for the TRD's own scope: the module and its tests were built as specified.

Two small differences from the TRD's pseudocode, both inside the stated contract:

- **Test 6b** exercises the depth limit with two nested shells reaching the write and a third level not reaching it. `bash -c` at depth 0 recurses into depth 1, a nested `bash -c` into depth 2, and a third into depth 3, which returns `[]`. A first draft of the test assumed three nested shells would still reach the write, and was corrected before the RED commit.
- **`pushd` with no argument** gives `null`, not `home` as the TRD's gotchas wrote for any `cd`/`pushd` with no argument. `pushd` with no argument swaps the top two stack entries, so the new directory is unknown. `cd` with no argument still goes home (test 3).

## Notes

- Accepted false negatives are listed in the module header: a mid-word `>`, git operations, `patch`, `rm`, `dd`, `install`, awk/xargs/`find -exec` writes, and a heredoc piped into an interpreter (`cat <<EOF | python3 -`, where the heredoc belongs to `cat`).
- The subshell `(cd x; ...)` approximation is documented in the header: `cd` leaks to later segments, and the error direction is a wrong path that 60-03's tracked-file check absorbs.
- `shell-words.cjs` needed no change: every MENTION case passed on first run.
- `cp`/`mv` `into` is decided from syntax only (trailing `/`, `.`, `..`, `-t`). Whether `cp a b` lands in an existing directory `b` is left to 60-03 through an injected `isDirectory`.

## Discovered commands

None. The stack profile (`general`) names `npm test` and `node --test {files}`, and both were used as given.

## Flutter UI Evidence

Not applicable (non-UI TRD).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - every WRITE_CASES entry reports the expected form and absolute path
  - every MENTION_CASES entry returns `[]`
  - relative targets resolve against cwd as changed by `cd`/`pushd`; unresolvable targets give `path: null`
  - `bash|sh|zsh|dash -c` and heredocs fed to a shell are parsed, depth 3
  - the module is pure (no `fs`, no `child_process`)
- Gate failures: the full-suite objective gate has 3 failures outside this TRD (table above)

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/bash-write-detect.cjs`
- FOUND: `plugins/devflow/devflow/bin/lib/bash-write-detect.test.cjs`
- FOUND commits: `08b48c13`, `8fc1d82b`, `15614664`, `2047a20c`
