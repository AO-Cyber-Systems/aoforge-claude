---
objective: 44-autonomy-hardening
verified: 2026-09-29T00:00:00Z
status: gaps_found
score: 6/7 success criteria fully verified (1 partial)
gaps:
  - truth: "gate-commits allows merge/rebase/cherry-pick completion (SC4) without opening a standing bypass"
    status: partial
    reason: >
      gitOpInProgress() treats a bare `REBASE_HEAD` file as "rebase in progress". Git can leave
      REBASE_HEAD behind after a rebase has finished. This checkout has one right now
      (`.git/REBASE_HEAD`, dated 2026-09-26; no `rebase-merge/` or `rebase-apply/`; `git status`
      shows no rebase). As a result, gate-commits allows EVERY raw `git commit` in the main
      devflow-claude checkout, which silently disables the gate. Reproduced in a scratch
      DevFlow repo: with a clean `.git` the hook denies; after `echo x > .git/REBASE_HEAD` it allows.
      git's own status code detects an in-progress rebase from the `rebase-merge/` and
      `rebase-apply/` directories, not from REBASE_HEAD. Both rebase backends keep one of those
      directories while stopped. MERGE_HEAD and CHERRY_PICK_HEAD are removed reliably and are fine.
    artifacts:
      - path: "plugins/devflow/hooks/gate-commits.js"
        issue: "gitOpInProgress(): `has('REBASE_HEAD') ||` makes a stale marker a standing bypass (line ~336)"
      - path: "plugins/devflow/hooks/gate-commits.test.js"
        issue: "OP_STATES includes 'rebase-head' (REBASE_HEAD alone), which asserts allow and so locks in the bypass"
    missing:
      - "Detect rebase only from rebase-merge/ or rebase-apply/. Drop REBASE_HEAD as a standalone signal, or require it to appear together with one of those directories."
      - "Change the 'rebase-head' fixture case to expect DENY, with a regression test named for the stale-REBASE_HEAD scenario"
---

# Objective 44: Autonomy hardening — Verification Report

**Objective Goal:** Executors and orchestrators run to completion without human nudges. That means no self-imposed turn caps, and truncation handled as a resumable INCOMPLETE outcome (never a failure). Gates stop blocking DevFlow's own agents and merge completions. Runtime state files stop dirtying repos. Premature main-loop stops auto-continue.
**Verified:** 2026-09-29
**Status:** gaps_found
**Re-verification:** No (initial)

## Goal Achievement: Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | No `maxTurns` in executor/verifier. execute-objective has an INCOMPLETE outcome, resumed via SendMessage (≤3), that never skips dependents | VERIFIED | `grep -rn maxTurns plugins/devflow/agents/` finds 0 hits. `workflows/execute-objective.md` 5c covers classification ("turn limit"/"partial result", or SUMMARY missing/without Self-Check with COMMITS < TRD_TASKS). 5d resumes via `SendMessage(to=<task id>)` up to 3 times with numbered remaining steps and "do NOT re-research". Item 7: "A truncation is not a failure ... never puts its dependents in the skipped set". Dependents are reported as `waiting on {id}`. |
| 2 | SubagentStop blocks a `devflow:executor` natural stop once when the TRD has no SUMMARY, and never when `stop_hook_active` is set | VERIFIED | `hooks/gate-executor-stop.js` `decide()` checks agent_type, then `stop_hook_active`, then fail-open paths. Smoke run: blocks with top-level `{decision:block}` when no SUMMARY; no output when `stop_hook_active:true`; no output when SUMMARY is present. |
| 3 | No shipped workflow or skill says to read `~/.claude/agents/*.md`, and the doc-refs CI test fails if one returns | VERIFIED | `grep -rn "claude/agents"` over plugins/devflow finds only global-upgrade.cjs, doc-refs.cjs, doc-refs.repo.test.cjs, upgrade.test.cjs and the upgrade fixtures, all of which are legitimate. `doc-refs.repo.test.cjs` test 11 (LEGACY gate) scans agents/skills/workflows/references/templates and passes. |
| 4 | gate-edits allows `devflow:*`. gate-commits allows merge/rebase/cherry-pick completion and an inline prefix, with no `export` advice | PARTIAL | gate-edits `isDevflowAgent()` uses an exact `devflow:` prefix, is wired in `shouldGate`, and reads `input.agent_type`. gate-commits: `hasInlineAllowPrefix` works; DENY_MESSAGE names the inline prefix as the only in-command form and contains no `export`. **Gap:** a stale `REBASE_HEAD` counts as a rebase in progress, so the gate is currently disabled in this checkout (see gaps). |
| 5 | Migration 0008 gitignores and untracks `.progress-guard.json` / `.awareness-cache.json`, idempotently | VERIFIED | `migrations/0008-runtime-state-untrack.cjs` is `safety: 'auto'`, runs `git rm --cached --force`, and appends to .gitignore. `upgrade --check` lists 0008 (skipped, no tracked files here). The 0008 test suite passes, and `commit-staged-removal.test.cjs` passes. |
| 6 | Stop hook auto-continues once (live marker, no running bg tasks, no question). yolo counts as autonomous. `DEVFLOW_SKIP_AUTOCONTINUE=1` disables it | VERIFIED | `hooks/auto-continue.js` `decide()` checks skip env, then `stop_hook_active`, then planning dir, then live marker (shared with gate-edits), then `hasRunningBackground`, then `announcedAction` (question, handoff and wait exclusions). execute-objective `AUTONOMOUS_CONTINUE` = autonomous or yolo, applied to items 6 and 9 only. |
| 7 | Synthesizer returns text, planner has Edit, executor forbids sleep-poll, config-get defaults; npm test green | VERIFIED (npm test delegated) | research-synthesizer `tools: Read, Bash` ("You write no files"), and new-project/new-milestone write SUMMARY from markers. Planner tools include Edit. executor.md:879 says "Never `sleep N` then poll". Scratch probe: `config-get workflow.auto_advance` and `workflow.parallelization` both return `true`, exit 0; `bogus.key` exits 1. The full `npm test` is run by the orchestrator. |

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `plugins/devflow/hooks/gate-executor-stop.js` (+ test) | VERIFIED | Substantive and registered in SubagentStop |
| `plugins/devflow/hooks/auto-continue.js` (+ test) | VERIFIED | Substantive and registered in Stop |
| `plugins/devflow/hooks/gate-edits.js` | VERIFIED | agent_type allow is wired |
| `plugins/devflow/hooks/gate-commits.js` | PARTIAL | Stale REBASE_HEAD bypass |
| `devflow/bin/lib/migrations/0008-runtime-state-untrack.cjs` (+ test) | VERIFIED | Discovered by the registry |
| `devflow/bin/lib/doc-refs.cjs` `LEGACY_AGENT_PATH_RE` + repo test | VERIFIED | |
| `devflow/workflows/execute-objective.md` 5c/5d/7/9 | VERIFIED | |
| `agents/executor.md`, `verifier.md`, `planner.md`, `research-synthesizer.md` | VERIFIED | |

## Key Links

| From | To | Status |
|------|----|--------|
| hooks.json Stop | `node ${CLAUDE_PLUGIN_ROOT}/hooks/auto-continue.js` | WIRED |
| hooks.json SubagentStop | `node ${CLAUDE_PLUGIN_ROOT}/hooks/gate-executor-stop.js` | WIRED |
| auto-continue | gate-edits `hasSkillActiveMarker`/`sharedPlanningDir` | WIRED |
| upgrade registry | migrations/0008 | WIRED (`upgrade --check` lists it) |
| CLAUDE.md / CHANGELOG | new hooks documented | WIRED (both name auto-continue and gate-executor-stop) |

## Requirements Coverage

| Req | Status | Note |
|-----|--------|------|
| AUT-01 | SATISFIED | |
| AUT-02 | SATISFIED | |
| AUT-03 | SATISFIED | |
| AUT-04 | PARTIAL | The REBASE_HEAD part of the spec is itself the defect |
| AUT-05 | SATISFIED | |
| AUT-06 | SATISFIED | |
| AUT-07 | SATISFIED | |

## Tests Run (targeted)

- `node --test` on gate-edits, gate-commits, gate-executor-stop, auto-continue, upgrade-project, 0008 migration, config, doc-refs (repo and unit) and commit-staged-removal: **415/415 pass**.
- `node --test plugins/devflow/devflow/bin/df-tools.test.cjs`: **145/145 pass**. This includes the 44-08 objective-job-index cases.
- Full `npm test` (orchestrator, main checkout): 5374 tests, 5341 pass, 1 fail. The one failure is MA-7 in handoff-e2e (`doctl auth init`). It is environmental: doctl is already authenticated on this machine, and no objective-44 commit touches that code. The 32 tests not counted as pass or fail (5374 − 5341 − 1) are presumably skipped/todo; the orchestrator did not break them down.

## Live E2E Evidence (orchestrator, Claude Code 2.1.284)

- gate-executor-stop blocked a real `devflow:executor`'s natural stop once while its TRD had no SUMMARY. The re-stop, with `stop_hook_active: true`, went through. This supports AUT-02.
- auto-continue blocked "Now running the build step." once, and the model then completed the step. It did not block "Should I start wave 4 now?". This supports AUT-06.

## Functional Verification

_Skipped (browser): this is not a UI objective._ Instead, hooks were smoke-tested over stdin in scratch DevFlow repos under the session scratchpad. No server was started and port 8080 was never used.

## Gaps Summary

There is one gap, with one root cause. `gate-commits.js` counts a bare `.git/REBASE_HEAD` as "rebase in progress". Git can leave that file behind after a rebase ends, and the main checkout has one from 2026-09-26. So the raw-commit gate currently allows every `git commit` here, and it will do the same in any repo with a leftover REBASE_HEAD. The fix is small: detect rebase from `rebase-merge/` or `rebase-apply/` only, and flip the `rebase-head` test case to expect deny. Everything else in the objective is present, substantive, wired and tested.

---

_Verifier: Claude (verifier)_
