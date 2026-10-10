---
objective: 73-handoff-gaps-and-result-injection
trd: "10"
subsystem: hooks
tags: [gate-interactive, shell-words, handoff, ssh-keygen, tdd]

requires:
  - objective: 60-bash-write-gate
    provides: shell-words.parseCommand (masked and raw words per simple command, heredocs attached to their segment)
  - objective: 73-handoff-gaps-and-result-injection
    provides: watcher-state.cjs readPidFile with `legacy` marking (72/73-02), handoff-fixtures.writePidFile
provides:
  - "aoforge/bin/lib/interactive-commands.cjs: the one per-invocation matcher (23 labelled patterns, sshKeygenFlags, matchInvocations, detectInteractive)"
  - "__fixtures__/interactive-command-cases.cjs: frozen GATED_CASES / NOT_GATED_CASES shared with 73-12's daemon allowlist tests"
  - "gate-interactive.js: fail-open load and re-export of the shared matcher; deny reason names the matching call for compound commands; daemon read through watcher-state"
affects: [73-12-watch-daemon-state-dir, 73-14-gap-closure-docs, watcher-allowlist]

tech-stack:
  added: []
  patterns:
    - "Detection on shell-words.parseCommand segments: quoted text and heredoc bodies are data, a heredoc fed to a shell is code (depth 1)"
    - "Per-call skip rules: skipIf on the call's raw text, skipArgs on its unquoted words"
    - "Hook loads a shared lib fail-open and re-exports the module's own objects"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/interactive-commands.cjs
    - plugins/aoforge/aoforge/bin/lib/interactive-commands.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/interactive-command-cases.cjs
  modified:
    - plugins/aoforge/hooks/gate-interactive.js
    - plugins/aoforge/hooks/gate-interactive.test.js
    - plugins/aoforge/hooks/planning-writes.audit.test.js

key-decisions:
  - "A hit found in a shell heredoc's body is marked compound, so the deny reason names the body call (the outer command is never a single call)"
  - "buildDenyReason names the call only when hit.compound and the segment differs from the trimmed command; every single-call reason is byte-identical to before"
  - "The ssh-keygen reason text gains the -y/-P clause the TRD specified; the other 22 reasons are pinned unchanged by a new regression table"

patterns-established:
  - "Shared case table for hook and daemon: one frozen fixture both consumers assert against"

requirements-completed: [HND-02]

verification:
  gates_defined: 4
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-10-09
tokens_input: 10711700
tokens_output: 75101
tokens_cache_read: 10539196
tokens_cache_write: 172370
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 73 TRD 10: gate-interactive reads invocations, not mentions Summary

**gate-interactive now matches each simple command from shell-words.parseCommand through a shared, labelled matcher (`interactive-commands.cjs`): quoted mentions and heredoc data are never gated, flags and reasons are per call, read-only ssh-keygen forms pass, and the daemon is read through watcher-state.**

## Progress
- [x] Task 1: RED, the shared case table and invocation-aware detection tests — 8944efc4
- [x] Task 2: GREEN, the shared matcher on parseCommand segments — 80e160e7
- [x] Task 3: the daemon is read through watcher-state — 771ef319

## What changed

- **G3 (mentions):** detection runs on `parseCommand` segments, so `rg -n "a|ssh-keygen" notes.md`, `echo 'gh auth login'`, a commit message and `cat > notes.md <<'EOF'` bodies are data. A heredoc fed to `bash`/`sh`/`zsh`/`dash`/`ksh` (basename, so `/bin/bash` too) is read as commands, one level deep.
- **G1 (read-only key forms):** `sshKeygenFlags` reads getopt-style clusters (an argument-taking letter consumes the rest of its cluster or the next word). `-l`, `-F` and `-R` pass; `-y` is gated unless `-P` is given (`-N` does not cover it); otherwise `-N` exempts.
- **G2 (per-call flags):** each call is matched on its own; `skipIf` is tested on the call's raw text and `skipArgs` on its own words. The hit carries `segment` and `compound`; for a compound command the parenthesis reads ``(`<segment>`: <reason>; category: <category>)`` in both wordings. The `` `${cmd}` `` / `` `! ${cmd}` `` instructions still carry the whole command.
- **Shared module:** `interactive-commands.cjs` holds the 23 patterns, each with the daemon allowlist's `label`, plus `CMD_POS` (kept for 73-12's deny list). `matchInvocations` also reports the first skipped call (`skipped.label`), which 73-12 needs for its "non-interactive form" rejection.
- **Hook:** requires the module in a try/catch and re-exports `detectInteractive`, `INTERACTIVE_PATTERNS`, `CMD_POS` and `sshKeygenFlags` (the module's own objects). If the module is missing it gates nothing. `pidFilePath`/`readWatcherInfo`/`isWatcherLive` now go through `watcher-state.cjs`. A `legacy` record counts as no daemon, and without watcher-state the hook behaves as daemon-absent. The unused `os` import and the private `~/.aoforge` pid path are gone. The audit's duplicate `'.aoforge'` entry was deleted.

## Remaining detection limits (for 73-14's docs)

All of these fail open (not gated):
- A command substitution inside double quotes, `echo "$(gh auth login)"`. shell-words does not track a quote inside `$( )` inside double quotes, so the inner call is masked.
- Prefixes before the command name: `env FOO=1 npm login`, `FOO=1 npm login`, `time …`, `command …`, `exec …`, `sudo …`, and shell keywords (`then npm login`, `do …`, `{ …`, `! …`). This is unchanged from before; the TRD forbids widening coverage.
- Backtick substitution and `bash -c '…'` / `sh -c "…"` string bodies are quoted data. The old raw-text regex gated `bash -c 'x; npm login'` by accident of the `;`; the new matcher does not.
- A shell heredoc nested inside a shell heredoc is read one level deep only, as the TRD specified.
- A path-qualified command (`/usr/bin/ssh-keygen`) is not matched, as before.

## Neighbour tests changed from a mention to an invocation

None. hook-coexistence, handoff.test.cjs and handoff-e2e.test.cjs spawn the hook only with real invocations, and all of them pass unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The shared module's header named the fixtures directory**
- **Found during:** Task 3 (full-suite run)
- **Issue:** the repo guard `X2: no lib/ module outside tests reads __fixtures__` (gh-project.test.cjs) does a substring check. The header comment of `interactive-commands.cjs`, added in 80e160e7, named the case table by its fixtures path.
- **Fix:** the comment now names the case table by file name only ("beside the tests"). No code change.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/interactive-commands.cjs
- **Commit:** the Task 3 commit

The TRD was otherwise executed as written, with two additions:
- **[Rule 2 - test coverage] Extra pins beyond the test list:** a spawned `ssh-keygen -lf key.pub` pass-through test (G1 at the hook), a spawned heredoc-data test (G3 at the hook), a reasons-and-categories regression table for the 22 unchanged patterns (item 12's "reason and category unchanged" made explicit), and a stub-tree test proving that without `watcher-state.cjs` the hook gives the daemon-absent reason. That last one is the only Task 3 test that failed before the change.
- **Task 3 RED note:** items 4 and 5 and the `pidFilePath` equality test passed before the change, because the hook's private path equalled watcher-state's. The TRD anticipated this, and they stay as wiring pins for 73-12.

### Process notes

- **Preflight:** the worktree was created on the default branch tip (b4a9d870), so `exec-context check` reported BASE NOT VISIBLE. The dispatch told the executor to create `df/exec-73-10-gate-interactive-reads-invocations` from c0e6550b. That was done in the clean worktree, and the re-run check passed.
- **Stray pending record:** one early `rg` call put gated command names inside a quoted argument, and the installed 3.0.0 gate wrote `.aoforge-handoff/pending/h-22abd6dd.json` in the worktree. This is exactly G3. The record and its directory were deleted at once. Later searches read their patterns from a scratchpad file (`rg -f`). No handoff directory remains.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Tasks 1) | `node --test hooks/gate-interactive.test.js bin/lib/interactive-commands.test.cjs` | 1 | FAIL (correct): 171 tests, 20 fail. The lib file fails at load (module missing). In the hook, items 1, 3, 6b, 20 and 21 fail (21 on the quoted `\|` mention, the heredoc data, the read-only key forms, `-y -N`, the per-call rows and module identity), plus the spawned `-lf` and heredoc tests. All 151 existing and pin tests pass |
| GREEN (Task 2) | same two files | 0 | PASS (correct): 258/258 |
| GREEN neighbours (Task 2) | + hook-coexistence, handoff.test.cjs, handoff-e2e.test.cjs, watcher-allowlist.test.cjs | 0 | PASS: 597/597 |
| RED (Task 3) | `node --test hooks/gate-interactive.test.js` | 1 | FAIL (correct): 174 tests, 1 fail (stub tree without watcher-state still saw the live daemon); items 4, 5 and path equality pass (wiring pins) |
| GREEN (Task 3) | gate-interactive, planning-writes.audit, hook-coexistence, interactive-commands | 0 | PASS: 580/580 |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED case table and tests | `node --test plugins/aoforge/hooks/gate-interactive.test.js plugins/aoforge/aoforge/bin/lib/interactive-commands.test.cjs` | 1 (expected) | PASS (RED reproduced) |
| 2: GREEN shared matcher | `node --test` on the hook, lib, hook-coexistence, handoff, handoff-e2e and watcher-allowlist tests | 0 | PASS |
| 3: daemon through watcher-state | `node --test` on the hook, planning-writes.audit and hook-coexistence tests, then the full suite | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` hook + lib + hook-coexistence + handoff tests | 0 | PASS |
| test (full) | `node --test` with the `npm test` globs | 1, then 0 on the two re-runs | PASS. 12,373 tests: 12,339 pass, 32 skipped, 2 fail. One failure was X2 (fixed above; gh-project.test.cjs re-run passes). The other was E2E1 in roadmap-reconcile.test.cjs: ROADMAP drift because this TRD's progress checkpoint SUMMARY exists while its ROADMAP line is still unticked. The end-of-TRD roadmap update clears it, and the re-run after that update passes. No other failures |
| lint | — | — | not_available |
| build | — | — | not_available |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 9/9 truths. Mentions and heredoc data are null. Every command position and `$( )` is gated. Shell heredocs are gated. ssh-keygen forms behave as specified. Flags and the reason's parenthesis are per call. Single-call wording is unchanged. The daemon is read through watcher-state (legacy record means absent, a missing module means absent). The shared module carries labels and is re-exported. Missing libs and unterminated quotes fail open.
- Structural: `rg "match: "` and `rg "aoforge-watch\.pid"` find nothing in gate-interactive.js. `interactive-commands.cjs` and `watcher-state` are both loaded there. No `.aoforge-handoff/` remains in the worktree.
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/aoforge/aoforge/bin/lib/interactive-commands.cjs
- FOUND: plugins/aoforge/aoforge/bin/lib/interactive-commands.test.cjs
- FOUND: plugins/aoforge/aoforge/bin/lib/__fixtures__/interactive-command-cases.cjs
- FOUND: 8944efc4 (RED), 80e160e7 (GREEN), 771ef319 (watcher-state) on df/exec-73-10-gate-interactive-reads-invocations
