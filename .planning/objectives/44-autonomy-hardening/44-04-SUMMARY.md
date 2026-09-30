---
objective: 44-autonomy-hardening
trd: "04"
job: 44-04
subsystem: hooks
tags: [subagent-stop, hook, executor, completion-gate, fail-open, tdd]

requires:
  - objective: 44-autonomy-hardening (44-01)
    provides: "executor `## Progress` checkpoint in SUMMARY.md; execute-objective keeps `PLAN_ID: {plan_id}` in the spawn prompt"
provides:
  - "plugins/devflow/hooks/gate-executor-stop.js — SubagentStop gate: a devflow:executor stopping naturally with no <id>-SUMMARY.md is blocked once (top-level {decision:'block', reason})"
  - "Exported helpers: identifyTrd, readFirstUserPrompt, candidateRoots, summaryExists, isDeliberateStop, decide, gitWorktrees, parseWorktreePorcelain"
  - "plugins/devflow/hooks/__fixtures__/subagent-stop-fixtures.js — hand-built SubagentStop payload / spawn prompt / transcript / planning-repo builders"
affects: [44-09 (registers the hook under SubagentStop in hooks.json and documents it in CLAUDE.md), 44-01]

tech-stack:
  added: []
  patterns:
    - "SubagentStop once-guard is the payload's stop_hook_active flag, never a marker file"
    - "TRD identification from the FIRST user record of agent_transcript_path only, bounded to 1 MiB"
    - "Every I/O dependency injectable (fsImpl, gitWorktrees, env, cwd); main() wires the real ones"

key-files:
  created:
    - plugins/devflow/hooks/gate-executor-stop.js
    - plugins/devflow/hooks/gate-executor-stop.test.js
    - plugins/devflow/hooks/__fixtures__/subagent-stop-fixtures.js
  modified: []

key-decisions:
  - "PLAN_ID lines and exec-context --id together form ONE explicit tier: a disagreement between them is ambiguous (null), which is what test 9 requires"
  - "PLAN_ID is line-anchored and --id only counts inside an `exec-context check` line, so an embedded TRD quoting ids in prose never makes a real prompt ambiguous"
  - "stop_hook_active is checked for truthiness, not === true (the fail-open direction)"
  - "gitWorktrees is called once, for REPO_ROOT, or for cwd's git checkout when the prompt names no REPO_ROOT"

patterns-established:
  - "Hook fixtures live in plugins/devflow/hooks/__fixtures__/ (not *.test.js, so npm test does not run them as suites)"

requirements-completed: [AUT-02]

verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 7min
completed: 2026-09-29
---

# Objective 44 TRD 04: SubagentStop completion gate Summary

**A SubagentStop hook blocks a `devflow:executor` exactly once when it stops naturally and no `<id>-SUMMARY.md` for its TRD exists in any checkout. It identifies the TRD from the first user prompt of `agent_transcript_path` (bounded to 1 MiB) and uses `stop_hook_active` as the once-guard. Every other path fails open.**

## Progress

- [x] Task 1: fixture builders (`be54c03`)
- [x] Task 2: helpers. RED `0316d36` (exit 1, MODULE_NOT_FOUND) → GREEN `ce4d1b0` (35/35)
- [x] Task 3: decide() + main(). RED `287b82e` (43 pass / 12 fail) → GREEN `66aaa81` (55/55; verify-commits 16/16)
- [x] Manual pipe verification, real-transcript probe, `npm test`
- [x] Full SUMMARY + Self-Check

## Performance

- Started 2026-09-29T14:26:06Z; tasks finished 2026-09-29T14:32Z; SUMMARY finalized after `npm test`
- 3 tasks, 5 task commits, 3 files created

## What was built

`plugins/devflow/hooks/gate-executor-stop.js`:

- `decide(payload, deps)` returns `{block:true, reason}` or null. The checks run in this order, each failing open: env skip (`DEVFLOW_SKIP_EXECUTOR_STOP_GATE=1`), `agent_type !== 'devflow:executor'`, `stop_hook_active`, no `.planning/` up from `payload.cwd || cwd`, a deliberate stop in `last_assistant_message`, an unreadable transcript, an unidentifiable TRD, and a SUMMARY found in any candidate root.
- `identifyTrd(text)` works through three tiers:
  1. The explicit dispatch declaration: `PLAN_ID:` lines together with `exec-context check … --id`.
  2. `<id>-TRD.md` paths.
  3. Embedded frontmatter `objective: NN-slug` + `trd: "MM"`.

  The first tier that yields an id wins. If that tier yields more than one distinct id, the result is ambiguous and the function returns null. It also returns `REPO_ROOT:`. The id regex is `\d+(?:\.\d+)?-\d+`.
- `readFirstUserPrompt(path, {maxBytes=1 MiB, fsImpl})` reads with `openSync`/`readSync` in 64 KiB chunks and never requests more than `maxBytes`. It parses only complete lines, skips garbage lines and leading non-user records, joins the text parts of array content, and stops at the first `type:'user'` record.
- `candidateRoots({cwd, repoRoot, gitWorktrees})` collects the project roots, the git checkouts and their main checkouts (resolved fs-only from the `.git` file), `repoRoot` itself, and the result of one `gitWorktrees` call. Entries are de-duplicated by real path.
- `summaryExists(id, roots)` checks `<root>/.planning/objectives/*/<id>-SUMMARY.md`. It skips roots that are missing or unreadable, and it does not inspect content, so a `## Progress`-only SUMMARY counts as present.
- `gitWorktrees(repoRoot)` returns `[]` immediately when `<repoRoot>/.git` is absent. Otherwise it runs `spawnSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], {timeout: 3000})` and parses the `worktree <path>` lines. Any failure returns `[]`.
- `main()` reads stdin JSON and prints the top-level `{"decision":"block","reason":…}`. Any error exits 0 with no output.

The hook is **not registered**. TRD 44-09 adds it to hooks.json, and hooks.json was not touched here.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture builders | `node -e "…require('<worktree>/plugins/devflow/hooks/__fixtures__/subagent-stop-fixtures.js')…"` prints `subagentStopPayload,executorPrompt,writeAgentTranscript,makePlanningRepo` | 0 | PASS |
| 2: Pure helpers | `node --test plugins/devflow/hooks/gate-executor-stop.test.js` (35 tests) | 0 | PASS |
| 3: decide() + main() | `node --test plugins/devflow/hooks/gate-executor-stop.test.js plugins/devflow/hooks/verify-commits.test.js` (71 tests: 55 + 16) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test plugins/devflow/hooks/gate-executor-stop.test.js`: MODULE_NOT_FOUND | 1 | FAIL (correct) |
| GREEN (Task 2) | same: 35/35 pass | 0 | PASS (correct) |
| RED (Task 3) | same: 55 tests, 43 pass / 12 fail (`decide`/`gitWorktrees` not functions; block paths silent) | 1 | FAIL (correct) |
| GREEN (Task 3) | same + verify-commits.test.js: 71/71 pass | 0 | PASS (correct) |
| REFACTOR | none needed | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (repo has no lint command) | n/a | n/a |
| test | `node --test plugins/devflow/hooks/gate-executor-stop.test.js` (55/55) | 0 | PASS |
| wave | `npm test`: 5165 tests, 5106 pass, **9 fail**, 50 skipped | 1 | PASS (only known pre-existing failures) |

The 9 `npm test` failures are all on the known pre-existing list, and none of them is in `plugins/devflow/hooks/`:

- `devflow-watch.test.cjs` ×2 and `handoff-e2e.test.cjs` ×6: node-pty is missing in worktrees, so the daemon never writes its PID file.
- `roadmap-reconcile.test.cjs` E2E1 ×1: in this worktree, its reported drift is exactly `44-04-TRD.md` having a SUMMARY while the ROADMAP row is still `[ ]`. That tick is the orchestrator's ROADMAP update, which this TRD was told not to make.

## Verification

- **Manual pipe:** the payload files were built with the fixture module in the session scratchpad.
  - `node plugins/devflow/hooks/gate-executor-stop.js < payload-natural.json` printed `{"decision":"block","reason":"DevFlow: you are stopping, but TRD 77-02 has no 77-02-SUMMARY.md. …"}`.
  - `< payload-active.json` (`stop_hook_active:true`) printed nothing.
- **Real-transcript probe:** this was read-only; nothing was copied into fixtures. I ran `readFirstUserPrompt` + `identifyTrd` over this session's 10 subagent transcripts.
  - All 7 execute-objective executor dispatches resolved to their own id (44-01 … 44-07) with `repoRoot=/Users/justin/dev/devflow-claude`.
  - The two general question/checker prompts returned null.
  - One planner prompt resolved `42-14` through a path mention. That is harmless because the `agent_type` check filters planners out first.

## Deviations from Plan

**1. [Rule 1 - Spec conflict] PLAN_ID and `--id` form one explicit tier**
- **Found during:** Task 2
- **Issue:** The task text says "take the FIRST source that yields any id". Test 9 requires `PLAN_ID: 77-02` plus `--id 77-03` to be ambiguous (null). Those two statements conflict when PLAN_ID and `--id` are separate tiers.
- **Fix:** I made PLAN_ID and `exec-context --id` one tier, because both declare the dispatched plan. After that come `-TRD.md` paths, then frontmatter. A lower tier is only consulted when every higher tier is empty. A test covers PLAN_ID winning over a different `-TRD.md` path used as context.
- **Commit:** `ce4d1b0`

**2. [Rule 2 - Correctness] Line-anchored PLAN_ID; `--id` counted only inside `exec-context check`**
- **Found during:** Task 2
- **Issue:** Embedded TRDs quote ids in prose. This very TRD's test list contains "`PLAN_ID: 77-02` plus a `--id 77-03`". Unanchored matching would make real prompts ambiguous and quietly disable the gate.
- **Fix:** PLAN_ID must start its line. `--id` counts only after `exec-context check` on the same line. A test embeds that prose inside a real prompt and asserts the id still resolves.
- **Commit:** `ce4d1b0`

**3. [Rule 3 - Path] The Task 1 verify command pointed at the main checkout**
- The `<verify>` path was `/Users/justin/dev/devflow-claude/...`, which I was told not to touch, so I ran the same command against the worktree path.

**Additional tests beyond the list:** real-git `gitWorktrees` (lists linked worktrees; `[]` for a non-repo), an e2e where the SUMMARY exists only in a real `git worktree add` checkout, `payload.cwd` fallback, bad stdin, and an unidentifiable (quick-style) or ambiguous prompt.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (block-once reason; every never-block condition; first-prompt-only identification with the ambiguity rule; SUMMARY lookup over cwd root, REPO_ROOT, main checkouts and one worktree listing; fail-open on error)
- Gate failures: None attributable to this TRD (see npm test note)

## Next Objective Readiness

- 44-09 registers `node ${CLAUDE_PLUGIN_ROOT}/hooks/gate-executor-stop.js` under `SubagentStop` and adds it to the CLAUDE.md hook inventory, including the `DEVFLOW_SKIP_EXECUTOR_STOP_GATE=1` escape hatch.
- The gate stops blocking as soon as 44-01's `## Progress` checkpoint creates the SUMMARY.

## Self-Check: PASSED

- FOUND: plugins/devflow/hooks/gate-executor-stop.js
- FOUND: plugins/devflow/hooks/gate-executor-stop.test.js
- FOUND: plugins/devflow/hooks/__fixtures__/subagent-stop-fixtures.js
- FOUND: .planning/objectives/44-autonomy-hardening/44-04-SUMMARY.md
- FOUND commits on df/exec-44-04 (`git log c88f3472..HEAD`): be54c03, 0316d36, ce4d1b0, 287b82e, 66aaa81
- Untouched as instructed: hooks.json, verify-commits.js, gate-edits.js, STATE.md, ROADMAP.md (`git diff --stat c88f3472 HEAD` lists only the 4 files above)
