---
objective: 58-estimation-engine-and-surfacing
trd: "02"
subsystem: telemetry
tags: [transcripts, agent-overhead, estimation, claude-code, subagents]

# Dependency graph
requires:
  - objective: 57-estimation-data-foundation
    provides: token-usage.sumUsage (usage counted once per API message), repo matching, trd-identify.readFirstUserRecord, context-audit.forEachRecord
provides:
  - "agent-overhead.cjs: OVERHEAD_AGENTS, normalizeAgentType, isQuickSpawn, transcriptSpanMinutes, spawnSample, indexOverheadTranscripts, collectOverhead"
  - "token-usage.cjs exports repoMatcher and repoMatch"
  - "__fixtures__/transcript-fixtures.cjs: timestamp-aware writers, writeOverheadTranscript, PLANNER_SPAWN, VERIFIER_SPAWN"
affects: [58-03 calibration v2 (agent_overhead block), 58-06 objective rollup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One subagent transcript = one overhead spawn = one sample (minutes from first to last record timestamp, tokens from sumUsage, per-model split)"
    - "Repository membership by the executor rule (REPO_ROOT, first-record cwd, .planning path), never by the lossy project-key directory name"
    - "Transcripts root is a required argument: no os.homedir() anywhere in the module"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/agent-overhead.cjs
    - plugins/devflow/devflow/bin/lib/agent-overhead.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/token-usage.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/transcript-fixtures.cjs

key-decisions:
  - "normalizeAgentType requires the devflow: or df- prefix: a bare 'planner' agentType is not a DevFlow agent and is ignored"
  - "A spawn with no assistant usage keeps its minutes and gets tokens_input/tokens_output/tokens_cache_read/tokens_cache_write null and by_model {}"
  - "Quick exclusion applies to planner spawns only (description starts with Quick); quick spawns count as spawns and as quick, are never read, and never reach matched/foreign"
  - "Samples carry no file path; indexOverheadTranscripts entries do"

patterns-established:
  - "Overhead sample shape: {agent, project, session, agent_id, minutes, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, by_model: {<model>: {tokens_input, tokens_output, tokens_cache_read, tokens_cache_write}}}"
  - "tokens_input = input + cache_creation + cache_read (SUMMARY convention, same as the executor index)"

requirements-completed: [EST-03]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 10min
completed: 2026-10-05
tokens_input: 6668815
tokens_output: 40354
tokens_cache_read: 6548953
tokens_cache_write: 119744
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 58 TRD 02: Agent overhead reader Summary

**Per-spawn overhead samples (wall minutes, tokens counted once per API message, per-model split) for the non-executor DevFlow agents, read from Claude Code subagent transcripts and scoped to one repository by the executor matching rule.**

## Progress
- [x] Task 1: Fixture builder, agent-type rules, span and per-spawn sample — 3a67e375 (RED 7142a44d)
- [x] Task 2: Index overhead transcripts and collect samples per repository — 9cfb10ca (RED 84369922)

## What was built

`agent-overhead.cjs` turns every subagent transcript whose `meta.json` `agentType` is `devflow:` / `df-` prefixed and one of planner, job-checker, verifier, objective-researcher, integration-checker, roadmapper into one sample. Executors, the debugger and non-DevFlow agents are ignored and not counted.

- `indexOverheadTranscripts({root, projects})` walks `<root>/<key>/<session>/subagents/agent-*.meta.json` (sorted at each level) and returns `{entries, counts}`. `counts` is `{spawns, matched, foreign, quick, unreadable, by_agent}`; every spawn is exactly one of quick, unreadable, foreign or matched.
- `collectOverhead({root, projects})` returns `{samples, counts}`; samples sorted by agent, project, session, agent_id (code-unit order), so two calls are deep-equal.
- Both throw `Error('<fn>: root is required')` without a root. There is no default root and no `os.homedir()` in the module.

**Sample shape (58-03 aggregates this):**

```
{agent, project, session, agent_id, minutes,
 tokens_input, tokens_output, tokens_cache_read, tokens_cache_write,
 by_model: {<model>: {tokens_input, tokens_output, tokens_cache_read, tokens_cache_write}}}
```

`minutes` is `(last - first parseable record timestamp) / 60000` (null below two timestamps). Token fields are null and `by_model` is `{}` when the spawn has no assistant usage.

**Fixture constants added** to `__fixtures__/transcript-fixtures.cjs` (all literal, additive; `timestamp` defaults to `FIXED_TIMESTAMP` in `assistantRecords` and `writeSubagentTranscript`, so the 57-x suites are byte-identical):
- `writeOverheadTranscript(projectsRoot, {projectKey, session, agentId, spawn, cwd, prompt})`
- `PLANNER_SPAWN`: `devflow:planner`, "Plan Objective 80", 10:00 to 10:06 (6 min), msg_P1 + msg_P2, claude-opus-5-5: tokens_input 111015, tokens_output 6000, cache_read 110000, cache_write 1000.
- `VERIFIER_SPAWN`: `devflow:verifier`, "Verify objective 80", 10:10 to 10:14 (4 min), msg_V1, claude-sonnet-5-5: tokens_input 20503, tokens_output 1500.

## Deviations from Plan

### Auto-fixed Issues

None - TRD executed exactly as written for code and tests.

### Judgement calls (not Rules 1-4)

1. **`requirements mark-complete EST-03` was NOT run.** The TRD frontmatter lists EST-03, but REQUIREMENTS.md defines it as "`df-tools estimate trd|objective|milestone` composes task estimates and adds agent overhead and the gap-closure factor". This TRD builds only the measured input; the requirement is satisfied by the rollups and CLI (58-06, 58-07, 58-08). Ticking it now would claim a capability that does not exist yet. `requirements-completed` is `[]`. The orchestrator or a later TRD should tick it.
2. **`normalizeAgentType` requires the prefix.** The action text says "strip a leading devflow: or df-, keep the name only if it is in the list"; a bare `planner` string would survive that literally. The must-have truth says "DevFlow agent (devflow: or df- prefix)" and "non-DevFlow agents are ignored", so a bare name returns null.
3. **`tokens stamp` was run from the worktree's df-tools source**, because the installed `~/.claude/devflow` mirror predates 57 and has no `tokens` command.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture builder, agent-type rules, span and per-spawn sample | `node --test lib/agent-overhead.test.cjs lib/token-usage.test.cjs lib/token-backfill.test.cjs lib/tokens-cli.test.cjs` (53 tests) | 0 | PASS |
| 2: Index overhead transcripts and collect samples per repository | `node --test lib/agent-overhead.test.cjs` (5 tests); the four suites together: 55 tests | 0 | PASS |

`rg -n "homedir" plugins/devflow/devflow/bin/lib/agent-overhead.cjs` prints nothing.

Smoke check, read-only, against the real `~/.claude/projects` for this repository (root passed explicitly, not part of any test): 474 overhead-typed spawns, 95 matched (planner 26, verifier 31, job-checker 22, objective-researcher 11, integration-checker 4, roadmapper 1), 35 quick, 344 other repositories, 0 unreadable. Median wall minutes: planner 20.1, objective-researcher 6.7, verifier 3.1, integration-checker 2.4, roadmapper 1.5, job-checker 0.8.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1, tests 1-3) | `node --test lib/agent-overhead.test.cjs` | 1 (`Cannot find module './agent-overhead.cjs'`) | FAIL (correct) |
| GREEN (Task 1) | `node --test lib/agent-overhead.test.cjs` + three token suites | 0 | PASS (correct) |
| RED (Task 2, tests 4-5) | `node --test lib/agent-overhead.test.cjs` | 1 (`ao.indexOverheadTranscripts is not a function`, `ao.collectOverhead is not a function`; tests 1-3 still pass) | FAIL (correct) |
| GREEN (Task 2) | `node --test lib/agent-overhead.test.cjs` | 0 (5/5) | PASS (correct) |

Commits: RED 7142a44d (with the fixture builder), GREEN 3a67e375; RED 84369922, GREEN 9cfb10ca.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | `node --test agent-overhead.test.cjs token-usage.test.cjs token-backfill.test.cjs tokens-cli.test.cjs` | 0 (55/55) | PASS |
| test (Task 2) | `npm test` (9500 tests) | 1 | PASS for this TRD: 0 failures attributable to it, see below |

`npm test` baseline: the 12 to 13 failures are none of this TRD's files.
- `devflow-watch.test.cjs` (5) and `handoff-e2e` (5): the daemon needs `node_modules/node-pty`, which this worktree does not have (the main checkout has it; `devflow-watch.test.cjs` passes 22/22 there and fails 4 here).
- `stack-drafter-fleet` github-enterprise-migration (1): known baseline.
- `roadmap-reconcile` E2E1 failed on the Task 1 run and passed on the Task 2 run (known to flip while a TRD of the running objective is unticked).
- `planning-writes.audit.test.js` classify-session cwd=flutter (1, Task 2 run only): `spawnSync ... EPIPE` under suite load; the file passes 49/49 alone.

## Discovered commands

None. `test` and `test_scoped` come from `.planning/STACK.md`.

## Known limits

A resumed agent (SendMessage) keeps one transcript, so its span includes the idle gap. That is recorded wall time and is kept; it overstates active minutes for resumed spawns.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (agent-type rule and exclusions; repository matching by the executor rule with foreign counted; Quick planners excluded and counted; minutes and once-per-message tokens split by model; deterministic order and no `~/.claude` read without an explicit root)
- Gate failures: none attributable to this TRD

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/agent-overhead.cjs, agent-overhead.test.cjs, token-usage.cjs (repoMatcher, repoMatch exported), __fixtures__/transcript-fixtures.cjs
- FOUND commits: 7142a44d, 3a67e375, 84369922, 9cfb10ca
