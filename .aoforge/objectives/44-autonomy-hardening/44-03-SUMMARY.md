---
objective: 44-autonomy-hardening
trd: "03"
job: 44-03
subsystem: hooks
tags: [gate-edits, gate-commits, pretooluse, agent_type, git-worktree, merge, rebase]

requires: []
provides:
  - "gate-edits allows Edit/Write/MultiEdit for PreToolUse payloads whose agent_type is devflow:<name> (isDevflowAgent)"
  - "gate-commits allows commits whose every target git dir has MERGE_HEAD / REBASE_HEAD / rebase-merge / rebase-apply / CHERRY_PICK_HEAD (fs-only, worktree-aware)"
  - "gate-commits allows commands where every git-commit invocation carries an inline DEVFLOW_ALLOW_RAW_COMMIT=1 prefix"
  - "gate-commits DENY_MESSAGE with no export suggestion, naming the inline prefix as the only in-command form"
  - "hooks/__fixtures__/gate-fixtures.js hand-built PreToolUse payload + fake git-dir/worktree builders"
affects: [44-05, gate-edits, gate-commits, df-tools commit merge_in_progress remedy]

tech-stack:
  added: []
  patterns:
    - "Offset-preserving quote masking (maskQuoted) so words are located in masked text and read back verbatim"
    - "Per-simple-command parsing of git-commit invocations shared by the prefix check and the target-repo check"
    - "Hand-built git state fixtures (marker files in a fake .git, .git FILE for worktrees) instead of real git"

key-files:
  created:
    - plugins/devflow/hooks/__fixtures__/gate-fixtures.js
  modified:
    - plugins/devflow/hooks/gate-edits.js
    - plugins/devflow/hooks/gate-edits.test.js
    - plugins/devflow/hooks/gate-commits.js
    - plugins/devflow/hooks/gate-commits.test.js

key-decisions:
  - "Only the exact case-sensitive devflow: prefix with a non-empty name is trusted; agent_id alone is not"
  - "Every git-commit invocation must independently qualify, for the inline prefix and for the git-op-in-progress allow"
  - "The last DEVFLOW_ALLOW_RAW_COMMIT assignment in a prefix wins (X=1 X=0 git commit is denied)"
  - "Quoted prefix values (DEVFLOW_ALLOW_RAW_COMMIT=\"1\") are denied, the conservative reading of the TRD's cleaned-command rule"
  - "An unresolvable git -C target ($VAR, backtick, missing path) is 'no op in progress', never an allow"

patterns-established:
  - "Gate tests build git state by hand through hooks/__fixtures__/gate-fixtures.js"

requirements-completed: [AUT-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-09-29
tokens_input: 7224249
tokens_output: 76325
tokens_cache_read: 7074367
tokens_cache_write: 149766
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 44 TRD 03: Gates stop blocking DevFlow's own agents and merge completions Summary

**The edit gate now trusts the PreToolUse `agent_type` `devflow:*`. The commit gate now allows merge, rebase and cherry-pick completions, which it resolves fs-only through worktree `.git` files and `git -C`. It also accepts an inline `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit` prefix, and its deny text no longer suggests an `export` escape that could never work.**

## Progress

- Started: 2026-09-29T14:11:46Z (worktree `/Users/justin/dev/.df-worktrees/devflow-claude/44-03`, branch `df/exec-44-03`, base `c88f347`)
- [x] Task 1: fixture builders — `0cd538e`
- [x] Task 2: gate-edits `devflow:*` agent_type allow — RED `5cd5075`, GREEN `f4ecb9e`
- [x] Task 3: gate-commits git-op allow + inline prefix + deny text — RED `f49fc4a`, GREEN `b749df6`
- Next step: none. The TRD is complete.

## Performance

- Duration: about 12 min (14:11:46Z to about 14:24Z)
- Tasks: 3/3
- Files: 1 created, 4 modified

## What changed

### gate-edits.js (DF-03, 114 denials)
- `isDevflowAgent(agentType)` is exported. It is true only for a string that starts with `devflow:` and has a non-empty name after it.
- `shouldGate` takes `agentType`. The new allow step (`reason: 'devflow agent'`) sits after the outside-project check and before the skill-active check, so the planning, markdown, noop and outside-project results are unchanged.
- `main()` passes `input.agent_type`. Because `shouldGate` allows before the mode switch, warn mode never turns a DevFlow agent's edit into `ask`, and off mode is unchanged.
- The header's escape-hatch list gains item 5. The exports `hasSkillActiveMarker`, `findPlanningDir` and `sharedPlanningDir` keep their names and arity, and a test pins them for 44-05.

### gate-commits.js (DF-02(b) 32 cases, DF-02(c) 23 cases)
- New exports: `resolveGitDir`, `gitOpInProgress`, `gitCPath`, `hasInlineAllowPrefix` and `DENY_MESSAGE`.
- The internal `commitInvocations(cmd)` does the parsing:
  - It removes heredoc bodies, then masks quoted text. The masking keeps character offsets, so a `-C "/path with space"` operand can be read back verbatim.
  - It splits the command on `&&`, `||`, `;`, `&`, `|`, `(`, `)` and newline. A backslash-newline stays inside one simple command.
  - For each invocation it records the words before `git`, the `-C` operands and any `--git-dir=`.
- `main()` order:
  1. hook env
  2. invocation check
  3. df-tools wrapper
  4. inline prefix: every invocation must carry it
  5. git op in progress: every invocation's target git dir must have one
  6. planning-dir deny
- The whole run is wrapped so that any error fails open (exit 0, no output).
- The deny text drops "Escape hatch: set DEVFLOW_ALLOW_RAW_COMMIT=1 …". It now says that merge, rebase and cherry-pick completions are allowed automatically, and that the inline `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit …` prefix is the only in-command form the hook can see.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builders | `node -e "…require('<worktree>/plugins/devflow/hooks/__fixtures__/gate-fixtures.js')…"` → `FAKE_SHA,GIT_STATE_MARKERS,preToolUsePayload,makeDevflowProject,makeGitDir,makeWorktree,applyGitState` | 0 | PASS |
| 2: gate-edits devflow agents | `node --test plugins/devflow/hooks/gate-edits.test.js plugins/devflow/hooks/lib/edit-override.test.js` | 0 | PASS |
| 3: gate-commits | `node --test plugins/devflow/hooks/gate-commits.test.js plugins/devflow/hooks/gate-edits.test.js` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 2 RED (`5cd5075`) | `node --test plugins/devflow/hooks/gate-edits.test.js` | 1 | FAIL (correct): tests 1, 1b, 3, 4a, the `isDevflowAgent` export and the placement test fail. All deny and regression rows pass. |
| Task 2 GREEN (`f4ecb9e`) | `node --test plugins/devflow/hooks/gate-edits.test.js plugins/devflow/hooks/lib/edit-override.test.js` | 0 | PASS (correct) |
| Task 3 RED (`f49fc4a`) | `node --test plugins/devflow/hooks/gate-commits.test.js` | 1 | FAIL (correct): the test-5 states, worktree, `-C`, inline-allowed, deny-message and unit rows fail. The test-9 denied forms, controls and hook-env passthrough pass. |
| Task 3 GREEN (`b749df6`) | `node --test plugins/devflow/hooks/gate-commits.test.js plugins/devflow/hooks/gate-edits.test.js plugins/devflow/hooks/lib/edit-override.test.js` | 0 | PASS (correct): 195/195 |
| REFACTOR | none needed | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/hooks/gate-edits.test.js plugins/devflow/hooks/gate-commits.test.js plugins/devflow/hooks/lib/edit-override.test.js` | 0 | PASS: 195 tests, 0 fail |
| wave | `npm test` (worktree) | 1 | PASS with only known/unrelated failures: 5188 tests, 5128 pass, 10 fail, 50 skipped |

Wave-gate failures, all outside `plugins/devflow/hooks/`. None of these suites imports gate-edits, gate-commits or gate-fixtures.
- **handoff pipeline end-to-end (5):** write-pending, disallowed-command, idempotency, multi-record, and LK-2 SIGTERM. These are the known pre-existing handoff-e2e daemon timeouts, each about 15s.
- **devflow-watch (4):** start foreground + stop (2) and multi-project CLI C-1/C-2. All four are 3s daemon-start timeouts. They fired early in the run, before anything else was running concurrently, and the code involved was not touched here.
- **roadmap-reconcile E2E1 (1):** the self-test reports ROADMAP drift because `44-03-SUMMARY.md` now exists while the ROADMAP row `44-03-TRD.md` is still `[ ]`. This is expected: this executor is barred from editing ROADMAP.md, and the orchestrator ticks the row on merge.

A second, foreground `npm test` run by the coordinator's instruction overlapped the first. Its tail also ended on the same roadmap-reconcile E2E1 failure.

Manual verification (TRD `<verification>`) used a scratch script that spawns the worktree's hooks with cwd set to the worktree root:
- gate-edits: a `devflow:executor` Write to `<worktree>/x.js` printed nothing (allowed), and so did the TRD's literal main-checkout path.
- gate-commits: plain `git commit -m x` was denied with `export-free=true`. `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m x` was allowed. `export DEVFLOW_ALLOW_RAW_COMMIT=1; git commit -m x` was denied.
- The no-`agent_type` control was also allowed in the live worktree. The cause is the main checkout's live `.planning/.skill-active` (dated 09:52, from the concurrent session), which TRD 27-01 honours from worktrees. It has nothing to do with this change. The isolated tmp-dir e2e tests (2a, 2b, 2c) prove the deny.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Every commit invocation must target a mid-operation repo**
- **Found during:** Task 3
- **Issue:** The TRD's `gitCPath(cmd) || cwd` checks one target. With it, `git -C <merging> commit --no-edit && git commit -m x` would have let the second, unrelated commit through.
- **Fix:** `allTargetsMidOperation` resolves every invocation's git dir: its chained `-C` operands, or `--git-dir=`. `gitCPath` is still exported as specified and returns the first commit invocation's resolved `-C`.
- **Files:** plugins/devflow/hooks/gate-commits.js (test: "every commit invocation must target an in-progress operation")
- **Commit:** b749df6

**2. [Rule 2 - Correctness] An unresolvable `-C` never falls back to cwd**
- **Found during:** Task 3
- **Issue:** A `-C` that is missing, contains `$`/backtick, or is otherwise unresolvable would have fallen back to cwd under `gitCPath(cmd) || cwd`. If cwd were mid-merge, the commit would be allowed for the wrong repo.
- **Fix:** Resolution failure is treated as "no op in progress", as the TRD's error_recovery requires.
- **Commit:** b749df6

**3. [Rule 1 - Bug] gate-commits had no fail-open wrapper**
- **Found during:** Task 3
- **Fix:** `main()` wraps `run()` in try/catch, as the binding rule "fail open on any error" requires.
- **Commit:** b749df6

The test file also gained more cases than the TRD listed: an operator table (recovery note), a heredoc/quote table, and a test that `runHook` scrubs an inherited `DEVFLOW_ALLOW_RAW_COMMIT`. The `runHook` scrub itself already existed (as `undefined` plus a cleanup pass). It is now an explicit `delete`.

## Deferred Issues / Follow-ups

- `docs/USER-GUIDE.md:635-643` still shows `export DEVFLOW_ALLOW_RAW_COMMIT=1` as "Persistent for a session". That form works only when run in the user's own terminal before Claude Code starts; it never works from the agent's Bash tool. The hooks table row for `gate-commits` could also mention the merge/rebase/cherry-pick allow. Docs are outside this TRD's `files_modified`, and parallel TRDs may touch USER-GUIDE, so this was not edited here.
- `REVERT_HEAD` (revert in progress) is not treated as an operation. The spec did not ask for it, so it was left out.
- A quoted prefix value (`DEVFLOW_ALLOW_RAW_COMMIT="1" git commit`) is denied. This is deliberate and conservative, and the deny text names the exact accepted form.
- `cd <other> && git commit` is judged against the hook's cwd, not `<other>`. Only `git -C` / `--git-dir=` retarget the check.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - devflow agent allow and the untrusted-type denies: tests 1-4
  - git op in progress, with worktree and `-C` resolution: tests 5-7
  - inline prefix allowed and the denied forms: tests 8-9
  - deny text: test 10
  - hook env passthrough: test 11
- Gate failures: None in the TRD's test gate (195/195). The wave gate had 10 failures, all in known or unrelated suites (handoff-e2e 5, devflow-watch 4, roadmap-reconcile E2E1 1). None is in hooks.

## Self-Check: PASSED

- Files present: `plugins/devflow/hooks/__fixtures__/gate-fixtures.js`, `gate-edits.js`, `gate-edits.test.js`, `gate-commits.js`, `gate-commits.test.js`.
- Commits present on `df/exec-44-03` (`git log --no-walk`): 0cd538e, 5cd5075, f4ecb9e, f49fc4a, b749df6.
- `gate-commits.js` mentions `export` only in comments (lines 18 and 249) and in `module.exports`. `DENY_MESSAGE` contains no `export`, as test 10 asserts.
- STATE.md and ROADMAP.md were not edited, per the dispatch rules.
