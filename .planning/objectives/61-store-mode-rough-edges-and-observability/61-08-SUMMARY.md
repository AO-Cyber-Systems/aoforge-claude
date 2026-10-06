---
objective: 61-store-mode-rough-edges-and-observability
job: "08"
subsystem: hooks
tags: [hook, UserPromptExpansion, PreToolUse, skill-requires, fail-open, store-mode]

requires: ["61-02"]
provides:
  - "hooks/gate-skill-requires.js: UserPromptExpansion + PreToolUse(Skill) gate; exports run(input, {env, skillsDir}) -> output object | null"
  - "hooks.json: a UserPromptExpansion group (no matcher) and a PreToolUse group with matcher Skill, both running gate-skill-requires.js"
  - "CLAUDE.md Enforcement inventory bullet and planning-writes audit RUNS entries for the hook"
affects: [61-09 dogfood and docs (finalises the CLAUDE.md wording)]

tech-stack:
  added: []
  patterns:
    - "one hook script on two events, with the output shape chosen by hook_event_name"
    - "lazy lib load inside try/catch so a partial install is a fail-open allow, with the escape variable read from the lib when it loads and from a literal when it does not"

key-files:
  created:
    - plugins/devflow/hooks/gate-skill-requires.js
    - plugins/devflow/hooks/gate-skill-requires.test.js
  modified:
    - plugins/devflow/hooks/hooks.json
    - plugins/devflow/hooks/planning-writes.audit.test.js
    - CLAUDE.md

key-decisions:
  - "No matcher on UserPromptExpansion: the command_name format for plugin skills is not documented, so the filtering is skillNameFromInvocation in code; the cost is one short node process per slash command"
  - "The gate is not project-scoped (no .planning/ lookup): a missing gh breaks /devflow:gh-sync in any directory"
  - "UserPromptExpansion is registered (not held back): the installed Claude Code 2.1.292 knows the event and claude plugin validate accepts it, so PreToolUse(Skill) is a complement, not a fallback"
  - "A UserPromptExpansion payload whose expansion_type is present and is not slash_command (an MCP prompt) is not gated, even when its name is devflow:<skill>"

requirements-completed: [STOR-04]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 8min
completed: 2026-10-06
---

# Objective 61 TRD 08: The `requires:` gate hook Summary

`gate-skill-requires.js` refuses a `/devflow:<skill>` whose SKILL.md `requires:` names a tool that is not on PATH: `decision: block` for a typed command (UserPromptExpansion), `permissionDecision: deny` for a Skill-tool call (PreToolUse), with the same reason text naming the install hint, `/devflow:doctor` and `DEVFLOW_SKIP_SKILL_REQUIRES=1`. Combined with 61-02 this completes STOR-04.

## Progress
- [x] Task 1: gate-skill-requires.js with subprocess and in-process tests (tests 1-12) — 50646283 (RED), 0c372e78 (GREEN)
- [x] Task 2: Register on UserPromptExpansion and PreToolUse(Skill), inventory and audit (tests 13-14) — 5fc19f84

## Evidence: is `UserPromptExpansion` accepted by the installed Claude Code?

Yes. Installed: Claude Code 2.1.292 (`claude --version`). Four independent pieces of evidence:

1. **`claude plugin validate` accepts the registration.** On this checkout, before and after the change, the last line is `✔ Validation passed with warnings`. Hook warnings went from 18 to 20, and the two new lines are the same unquoted-`${CLAUDE_PLUGIN_ROOT}` warning every existing hook has (`hooks.UserPromptExpansion: ...gate-skill-requires.js` and the new `hooks.PreToolUse: ...gate-skill-requires.js`). Nothing mentions an unknown event or the `Skill` matcher.
2. **Control: the validator does reject unknown events.** A scratch plugin whose hooks.json holds both `UserPromptExpansionX` and `UserPromptExpansion` is validated with the single warning `hooks.UserPromptExpansionX: unknown hook event; entry ignored at runtime`. `UserPromptExpansion` is not flagged, so its acceptance is real and not a validator that checks nothing.
3. **The binary's own event table lists it.** `strings` on `/Users/justin/.local/share/claude/versions/2.1.292` shows the event with the description "When a user-typed slash command expands into a prompt" and "Input to command is JSON with expansion_type, command_name, command_args, command_source, and original prompt." (the TRD's payload), a default timeout of 30 s (`UserPromptExpansion:30`), membership in the set of events whose hooks can block (`PreToolUse, PermissionRequest, UserPromptSubmit, UserPromptExpansion, TaskCompleted, TeammateIdle`), and the block path text `UserPromptExpansion operation blocked by hook:` / ` blocked by UserPromptExpansion hook`.
4. **The input is built as the TRD assumes.** The input builder is `{hook_event_name:"UserPromptExpansion", expansion_type, command_name, command_args, command_source, prompt}`, called with `expansion_type` `"mcp_prompt"` for an MCP command and `"slash_command"` otherwise, and the typed `prompt` is built as `` `/${command.name} ${args}` `` — the same `/devflow:<skill>` shape `skillNameFromInvocation` reads. So the hook's `expansion_type` guard and its `prompt` fallback both match what Claude Code sends.

Not exercised: a live typed `/devflow:gh-sync` in a real session. Spawning `claude` with `--plugin-dir` for this checkout would run its SessionStart `sync-runtime` hook and overwrite the shared `~/.claude/devflow/` mirror other agents are using, so it was not done. The hook is covered by subprocess tests against the real payload shape, and registration by the validator and audit. The `PreToolUse(Skill)` registration is kept either way, as the TRD requires.

## Deviations from Plan

None - TRD executed as written. Two small additions inside the TRD's scope:

- The test file adds controls beyond tests 1-12: 5b (`DEVFLOW_SKIP_SKILL_REQUIRES=0` still blocks), 11b-11g (both tools named when neither is installed; skill without `requires:`; escape wins; default `skillsDir` is this plugin's own; non-object input). Test 7's `expansion_type: 'mcp_prompt'` payload carries `command_name: 'devflow:gh-sync'` so it would block if the `expansion_type` guard were missing.
- A first draft of the file had a test 10b ("escape honoured when libs are missing") that could not fail either way, so it was removed rather than kept as a vacuous control.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: hook and tests 1-12 | `node --test plugins/devflow/hooks/gate-skill-requires.test.js plugins/devflow/devflow/bin/lib/skill-requires.test.cjs` (19 + 42 tests) | 0 | PASS |
| 2: registrations present | `node -e "const h=require('./plugins/devflow/hooks/hooks.json').hooks; ..."` prints `[{"hooks":[{"type":"command","command":"node ${CLAUDE_PLUGIN_ROOT}/hooks/gate-skill-requires.js"}]}]` and `{"matcher":"Skill","hooks":[...same command...]}` | 0 | PASS |
| 2: inventory, audit, install check | `node --test .../hook-inventory.test.cjs .../planning-writes.audit.test.js .../doctor-checks/11-12-install.test.cjs` (80 tests; the audit runs the new hook in two variants at two cwds and finds no changed dotfile) | 0 | PASS |
| 2: other readers of hooks.json | `node --test classify-session.test.js auto-continue.test.js awareness-cache-populate.test.js doctor-cli.test.cjs` (153 tests) | 0 | PASS |
| 2: repo guards | `node --test doc-refs.repo.test.cjs planning-writes.repo.test.cjs skill-requires.repo.test.cjs` (29 tests) | 0 | PASS |
| 2: plugin validation | `claude plugin validate plugins/devflow` | 0 | `Validation passed with warnings` (20 hook warnings, all unquoted `${CLAUDE_PLUGIN_ROOT}`) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test plugins/devflow/hooks/gate-skill-requires.test.js` | 1 | FAIL (20 of 20, `Cannot find module .../gate-skill-requires.js`), correct |
| GREEN (task 1) | `node --test plugins/devflow/hooks/gate-skill-requires.test.js plugins/devflow/devflow/bin/lib/skill-requires.test.cjs` | 0 | PASS (62 tests before the vacuous 10b was trimmed; 19 + 42 after), correct |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (task, scoped) | `node --test plugins/devflow/hooks/gate-skill-requires.test.js plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs` | 0 | PASS (19 + 80 tests, the audit and inventory files counted once) |
| test (full suite, informational) | `npm test` | 1 | 10,269 pass, 11 fail, 50 skipped; none caused by this TRD (see below) |

### Full-suite failures (none touch files this TRD changed)

The same 11 that 61-02 recorded on its worktree, none involving hooks, skills or CLAUDE.md:

- `E2E1` in `roadmap-reconcile.test.cjs`: zero-drift self-test against this repo's ROADMAP. Cleared by `roadmap update-job-progress`, run in the state step.
- `github-enterprise-migration` in `stack-drafter-fleet.test.cjs` and `stack init against the real fleet`: depend on the local fleet of repos and node_modules, a known worktree failure.
- `devflow-watch.test.cjs` (daemon start/stop, multi-project CLI) and `handoff-e2e.test.cjs` (route-results, daemon teardown): the daemon does not write its PID file from a worktree path, a known worktree failure.

## Discovered commands

None. `npm test` (scoped form `node --test {files}`) came from the general stack profile.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (typed command blocked with the reason naming gh, its hint, `/devflow:doctor` and the escape; Skill call denied with the identical reason; silent with the tool present, for skills without `requires:`, for non-DevFlow commands and skills, and with the escape; fails open on malformed input, a missing lib and an invalid `requires:`; registered on UserPromptExpansion with no matcher and on PreToolUse with matcher Skill, inventoried in CLAUDE.md and covered by the audit)
- Gate failures: none attributable to this TRD

## Notes for 61-09

- The CLAUDE.md bullet is the TRD's wording; 61-09 finalises it.
- The doctor `skill-requires` check and the hook read the same declarations (`skill-requires.cjs`), so the report and the refusal cannot disagree.
- To back the gate out without reverting code: delete its two registrations from hooks.json, or set `DEVFLOW_SKIP_SKILL_REQUIRES=1` in the environment Claude Code is launched from.

## Self-Check: PASSED

All five created or modified source files exist, and commits 50646283, 0c372e78 and 5fc19f84 are present on `df/exec-61-08-skill-requires-hook`.
