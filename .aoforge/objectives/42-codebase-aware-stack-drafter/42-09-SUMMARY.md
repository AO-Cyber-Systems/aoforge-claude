---
objective: 42-codebase-aware-stack-drafter
trd: "09"
job: 42-09
subsystem: stack-drafter
tags: [stack-mcp, mcp-json, gopls, dart-mcp, health-w033, agent-grants, confirm-stack-profile]

requires:
  - objective: 42-codebase-aware-stack-drafter
    provides: "42-01 STACK_EXTENSIONS lazy dispatch (`stack mcp` -> stack-mcp.cjs), 42-02 bundled go/dart/flutter agent_tooling.mcp, 42-05 components + component views, 42-06 stack-verify.resolveBinary and `stack verify --run`"
provides:
  - "stack-mcp.buildServers(views, {which, env, userHome, fs}) -> {servers, skipped}: root + component views, deduped by name (later view wins), env exactly {DEVFLOW_MANAGED: 'stack'}"
  - "stack-mcp.mergeMcpJson(existing, servers): touches only env.DEVFLOW_MANAGED === 'stack' entries, prunes stale managed ones, keeps foreign entries and key order"
  - "stack-mcp.findPluginServers(userHome): depth-5 scan of ~/.claude/plugins for plugin.json mcpServers (object or file ref) and plugin-root .mcp.json"
  - "stack-mcp.stackMcp / cli: `df-tools stack mcp [--write]` -> {servers, skipped, action: preview|written|unchanged, path}"
  - "validate health W033 stack-mcp-binary-missing (advisory, never repaired); options.env PATH seam"
  - "mcp__gopls__* / mcp__dart__* grants on executor, verifier, debugger, adopt and map-codebase skills"
  - "confirm_stack_profile step in adopt.md (scaffold -> confirm -> health) and map-codebase.md (draft_stack_profile -> confirm)"
affects: [42-10, 42-11]

tech-stack:
  added: []
  patterns:
    - "ownership marker: only entries whose env.DEVFLOW_MANAGED === 'stack' are ever replaced or removed; everything else is carried over in place"
    - "deterministic CLI, agent-side MCP: no CLI code starts or calls an MCP server; confirmation is workflow text"
    - "injectable which/env/userHome; tests use fakeBin stubs, fake homes with hand-written plugin.json, temp-dir .mcp.json only"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-mcp.cjs
    - plugins/devflow/devflow/bin/lib/stack-mcp.test.cjs
    - plugins/devflow/devflow/bin/lib/stack-agent-mcp-contract.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/validate.cjs
    - plugins/devflow/devflow/bin/lib/validate.test.cjs
    - plugins/devflow/devflow/workflows/health.md
    - plugins/devflow/agents/executor.md
    - plugins/devflow/agents/verifier.md
    - plugins/devflow/agents/debugger.md
    - plugins/devflow/skills/adopt/SKILL.md
    - plugins/devflow/skills/map-codebase/SKILL.md
    - plugins/devflow/devflow/workflows/adopt.md
    - plugins/devflow/devflow/workflows/map-codebase.md
    - plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs

key-decisions:
  - "Migration 0008 (research's proposal to write .mcp.json on upgrade) is DROPPED: locked Q4 makes .mcp.json opt-in per repo, and the upgrade-project.js SessionStart hook auto-applies and background-commits `auto` migrations, so a migration would write .mcp.json fleet-wide. `stack mcp --write` is the only writer; `stack init` never writes it (tested); a contract test forbids any migration referencing .mcp.json"
  - "Locked Q5: a managed entry's env is exactly {DEVFLOW_MANAGED: 'stack'}; any env on a profile entry (e.g. telemetry vars) is dropped"
  - "Dedupe rule: views in precedence order (root, then components in declared order); a later view's entry of the same name replaces the earlier one, so a component's args win (root dart + component flutter -> flutter's args)"
  - "Plugin duplicate = same command basename and same first argument (`dart mcp-server`); checked before binary presence, so a plugin-declared server is reported declared_by_plugin even when the binary is also missing"
  - "Extra skip reasons beyond the TRD's two: invalid_entry (no string name/command) and foreign_entry (a non-managed .mcp.json entry already holds the name; left alone, not overwritten)"
  - "--write creates nothing when there are no servers and no file; rewrites only when the merged object differs semantically (formatting-only differences are not rewritten); writes atomically (tmp + rename)"
  - "Output is JSON in both default and --raw modes (the Test list's `--raw` -> JSON)"
  - "W033 skips an absent or unparseable .mcp.json (Claude Code reports a broken one itself); an unexpected exception is surfaced as W033 stack-mcp-check-failed, never swallowed"
  - "adopt.md forbids the literal `8080` (adopt-skill-contract test 6), so adopt's confirm step points at the existing <rules> port rule; map-codebase's step says 8091 / never 8080"

patterns-established:
  - "confirm_stack_profile is best-effort: ToolSearch probe for mcp__gopls__go_workspace / mcp__dart__analyze_files, fall back to `stack verify --run --raw`, record findings (adopt: .adopt-inferences.json medium/low rows; map-codebase: notes to the user), never edit STACK.md silently"

requirements-completed: [SDR-05]

verification:
  gates_defined: 4
  gates_passed: 4
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: ~10 min (2 sessions; resumed once after a turn limit)
completed: 2026-09-28
tokens_input: 7123293
tokens_output: 60055
tokens_cache_read: 6989912
tokens_cache_write: 133253
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 42 TRD 09: Skills + MCP wiring Summary

**`df-tools stack mcp [--write]` generates the ownership-marked gopls/dart `.mcp.json` entries from the resolved profile (opt-in, foreign entries never touched), W033 flags a managed server whose binary is gone, and adopt/map-codebase gain a best-effort `confirm_stack_profile` step that uses the gopls/dart MCP tools when present and `stack verify --run` otherwise.**

## Performance

- Start: 2026-09-29T03:31Z (preflight claim) — End: 2026-09-29T03:41Z
- Tasks: 3/3, 6 commits (RED + GREEN per task)
- Files: 3 created, 11 modified

## Accomplishments

- `stack-mcp.cjs` shipped as a `STACK_EXTENSIONS` module — stack-profile.cjs was not edited.
- Preview never writes. `--write` merges, prunes stale managed entries, preserves foreign entries
  byte-for-byte in their original position, refuses an unparseable `.mcp.json` with exit 1, and leaves it untouched.
- Skips are reported, never silent: `binary_missing`, `declared_by_plugin`, `invalid_entry`, `foreign_entry`.
- `validate health` W033 is documented in the health.md code table.
- Agents and skills are granted `mcp__gopls__*` and `mcp__dart__*`. `mcp__context7__*` is untouched.
- The `confirm_stack_profile` step is in both workflows. In map-codebase it is skipped in
  non-interactive mode, because adopt runs its own after `adopt scaffold`.

## Task Commits

| Task | Commit | Message |
|---|---|---|
| 1 RED | 0123d13 | test(42-09): add failing tests for stack mcp builder and --write merge |
| 1 GREEN | 236b651 | feat(42-09): stack mcp [--write] generates managed .mcp.json entries |
| 2 RED | a2d6552 | test(42-09): add failing W033 health tests for managed MCP binaries |
| 2 GREEN | 124b14c | feat(42-09): validate health W033 for a managed MCP server whose binary is missing |
| 3 RED | f6b0bae | test(42-09): add failing contract tests for MCP grants and confirm_stack_profile |
| 3 GREEN | ace0c33 | feat(42-09): grant gopls/dart MCP tools and add confirm_stack_profile steps |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing documentation] W033 row added to workflows/health.md**
- **Found during:** Task 2
- **Issue:** health.md holds the user-facing health code table (W030-W032, I030 …). Without a row, a new W033 would be unexplained. The file is not in `files_modified`.
- **Fix:** Added one table row: meaning, the fix, and not repairable.
- **Files modified:** plugins/devflow/devflow/workflows/health.md
- **Commit:** 124b14c

**2. [Scope note] Step item 7 wording in adopt.md**
- The TRD's item 7 says "Never use port 8080". adopt-skill-contract test 6 forbids the literal `8080` in adopt.md, so adopt's step defers to the existing `<rules>` port rule (8091). map-codebase.md states it literally.

No pinned tool-list expectations needed updating: executor-isolation, agent-shell-harness and agent-tools all stayed green unchanged.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: stack-mcp builder + CLI | `node --test plugins/devflow/devflow/bin/lib/stack-mcp.test.cjs` | 0 (22/22) | PASS |
| 2: W033 | `node --test plugins/devflow/devflow/bin/lib/validate.test.cjs` | 0 (73/73) | PASS |
| 3: grants + confirm step | `node --test stack-agent-mcp-contract adopt-skill-contract executor-isolation agent-shell-harness (+agent-tools, doc-refs.repo, skill-route)` | 0 (187/187) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| T1 RED | `node --test .../stack-mcp.test.cjs` | 1 (20 fail: module missing) | FAIL (correct) |
| T1 GREEN | same | 0 (22 pass) | PASS (correct) |
| T2 RED | `node --test --test-name-pattern "M[1-5]:" .../validate.test.cjs` | 1 (M1, M5 fail) | FAIL (correct) |
| T2 GREEN | `node --test .../validate.test.cjs` | 0 (73 pass) | PASS (correct) |
| T3 RED | `node --test .../stack-agent-mcp-contract.test.cjs .../adopt-skill-contract.test.cjs` | 1 (9 fail) | FAIL (correct) |
| T3 GREEN | same + executor-isolation, agent-shell-harness | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (the repo has no lint command) | n/a | n/a |
| test | `node --test 'stack-*.test.cjs' 'adopt-*.test.cjs' validate.test.cjs executor-isolation.test.cjs` | 0 (841/841) | PASS |
| build | `node plugins/devflow/devflow/bin/df-tools.cjs --cwd <worktree> stack mcp --raw` | 0; `servers: {}`, `skipped: []`, `action: preview`, nothing written | PASS |
| wave | `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules npm test` | tests 4853, pass 4820, fail 1, skipped 32 | PASS (the only failure is the known handoff-e2e MA-7 PTY-path mock auth; baseline 4816/4783/1/32, +37 new tests) |

Verification greps:
- `rg -n "mcp.json" plugins/devflow/devflow/bin/lib/migrations` finds nothing.
- `rg "confirm_stack_profile" plugins/devflow/devflow/workflows` finds it in adopt.md and map-codebase.md.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8
- Gate failures: None

## Self-Check: PASSED

- Created files exist: stack-mcp.cjs, stack-mcp.test.cjs, stack-agent-mcp-contract.test.cjs.
- Commits 0123d13, 236b651, a2d6552, 124b14c, f6b0bae and ace0c33 are all on df/exec-42-09.
