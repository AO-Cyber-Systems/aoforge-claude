---
objective: 73-handoff-gaps-and-result-injection
job: "04"
subsystem: handoff
tags: [handoff, hooks, posttooluse, stop, delivery, gate-interactive]

requires:
  - objective: 73-02
    provides: handoff-results.cjs (takeResults, pendingAddressedTo, watcherWatching, isAddressedTo) and the handoff fixtures
provides:
  - "inject-handoff-results.js: PostToolUse additionalContext and Stop block delivery, with a bounded Stop wait on a running command"
  - "gate-interactive.js: session_id and agent_id on every pending record, and daemon-live wording that names the aoforge-watch terminal and both delivery points"
affects: [73-06 hook registration and coexistence, 73-07 live TTY demonstration, 73-08 docs]

tech-stack:
  added: []
  patterns:
    - "decide() is pure apart from delivery and returns silent/context/block/wait; main() owns the only loop (the Stop wait)"
    - "Stop wait checks the pending record before taking the result, because the daemon writes done and then removes pending"
    - "Async spawned-hook tests with a test-owned timer that lands the done record while the hook waits"

key-files:
  created: []
  modified:
    - plugins/aoforge/hooks/inject-handoff-results.js
    - plugins/aoforge/hooks/inject-handoff-results.test.js
    - plugins/aoforge/hooks/gate-interactive.js
    - plugins/aoforge/hooks/gate-interactive.test.js

key-decisions:
  - "The hook delivers on PostToolUse and Stop only; UserPromptSubmit stays route-results' catch-all"
  - "Stop checks for an addressed pending record before it takes, so a result the daemon lands between the two is never missed and a pending record that vanishes without a result ends the wait early"
  - "The wait starts only for a main-loop pending record younger than 15 minutes, a live non-legacy daemon that lists this project, stop_hook_active false and AOFORGE_HANDOFF_STOP_WAIT_MS not 0"
  - "A `handoff complete` record with no exit_code still renders as `exit ?`; left unchanged (outside this TRD's files, see Deviations)"

patterns-established:
  - "A Stop hook that waits does so on its own bounded deadline and falls back to the next-prompt catch-all, never to an error"

requirements-completed: [HND-02]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 17min
completed: 2026-10-09
tokens_input: 7428388
tokens_output: 56693
tokens_cache_read: 7280060
tokens_cache_write: 148220
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 73 TRD 04: inject-handoff-results.js delivers results mid-turn and at the end of a turn Summary

**A finished handoff now reaches Claude after its next tool call or holds the stop until it arrives: the DRAFT hook is rewritten on 73-02's library, and gate-interactive records the session and agent and tells Claude where the command waits and how its result returns.**

## Progress
- [x] Task 1: RED, the hook's test list on the fixtures — 45900882
- [x] Task 2: GREEN, the hook rewritten on the library — 67ef1906
- [x] Task 3: gate-interactive records the address and tells Claude how the result returns — a289dbba

## Performance

- **Duration:** about 17 min
- **Started:** 2026-10-09T18:05:37Z
- **Completed:** 2026-10-09
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- `inject-handoff-results.js` (169 lines of DRAFT, replaced) exports `STOP_WAIT_DEFAULT_MS` (120000), `PENDING_MAX_AGE_MS` (15 min), `POLL_MS` (250), `stopWaitMs`, `decide` and `main`. PostToolUse prints `{hookSpecificOutput:{hookEventName:'PostToolUse',additionalContext}}`; Stop prints exactly `{decision:'block',reason}`, which `stopFamilyProblems('Stop', out)` accepts.
- Delivery goes through `takeResults({ mode: 'addressed' })`, so a subagent never takes the main loop's result, another session's record is left untouched and two hook copies over one record emit it once (4 rounds of two simultaneous copies, one emitter each).
- The Stop wait polls every 250 ms (a `setTimeout` between polls, never a spin) for up to `AOFORGE_HANDOFF_STOP_WAIT_MS`. Measured: a result landing 400 ms after spawn blocks the stop in under 4 s; with no result a 600 ms wait exits silently between 600 ms and 3 s; six no-wait cases and `stop_hook_active` return at once.
- `gate-interactive.js` writes `session_id` and `agent_id` (null for the main loop) from the PreToolUse payload into each pending record; the daemon's `makeDoneRecord` spreads it, so the done record carries both (tested). The daemon-live reason now names the aoforge-watch terminal, tells Claude to tell the user in one line where the command waits, and says the result arrives after the next tool call or when the turn ends. The daemon-absent reason is byte-identical (pinned by an exact-string test).

## Task Commits

1. **Task 1: RED tests for the hook** - `45900882` (test)
2. **Task 2: hook GREEN** - `67ef1906` (feat)
3. **Task 3: gate-interactive address and wording** - `a289dbba` (feat)

## Files Created/Modified

- `plugins/aoforge/hooks/inject-handoff-results.js` - rewritten: legacy-env guard, pure `decide`, async `main`, the bounded wait
- `plugins/aoforge/hooks/inject-handoff-results.test.js` - replaced: 37 tests (list items 1-14 plus 7b, 10b, 11b, the six-case no-wait group and the export surface)
- `plugins/aoforge/hooks/gate-interactive.js` - record fields, daemon-live wording, header paragraph
- `plugins/aoforge/hooks/gate-interactive.test.js` - list items 15-17 (7 tests added)

## Decisions Made

See `key-decisions`. For 73-06: `STOP_WAIT_DEFAULT_MS` (120 s) is below the 150 s timeout the TRD plans for the Stop registration, and the hook's test pins that relation. The hook is not in `hooks.json`.

## Deviations from Plan

### Auto-fixed Issues

None.

### Judgment calls and open items

**1. Interim red test: doctor check 12 (`11-12-install.test.cjs` test 11).** The TRD asks for no `DRAFT` marker in `inject-handoff-results.js` and forbids registering it in `hooks.json` (73-06 does that). Doctor check 12 (`doctor-checks/12-hooks-registry.cjs`) requires every hook file to be registered or to carry `DRAFT` in its first 40 lines, so its regression-guard test 11 reports `hook file(s) neither registered nor marked DRAFT: hooks/inject-handoff-results.js`. I followed the TRD's explicit criteria. The failure clears when 73-06 registers the hook, with no other change. If the orchestrator wants a green suite between the waves, the alternative is a one-line `DRAFT` comment here that 73-06 must remove; I did not do that because it contradicts the TRD's done criterion (`rg -n DRAFT` finds nothing) and leaves a stale marker risk.

**2. `✗ exit ?` for a `handoff complete` record with no `--exit-code` (73-02's observation).** Not changed. The fix belongs in `handoff.cjs` (`handoff complete` could default `exit_code` to 0 for a done status) or in the header rule of `handoff-results.cjs`; neither file is in this TRD's `files_modified`, 73-02's tests pin the current rendering, and no later TRD in objective 73 owns it. Recorded here as an open item; a small follow-up TRD or todo should take it.

**3. No-wait timing bounds widened.** The TRD's tests 11 and 12 assert "under 500 ms". The tests give the hook a 10 s wait and assert under 1,500 ms, so a loaded machine cannot fail them while a hook that did wait still fails by a wide margin. Items 9 and 10 keep the TRD's bounds exactly.

**4. Extra tests beyond the list.** 7b (record for another session does not block a stop), 10b (the wait ends early when the pending record vanishes without a result), 11b (`stop_hook_active` still delivers a finished result), a control run in each escape-hatch test (the record is delivered once the hatch is off, so the silence is proven to be the hatch), the done-record carry test and the export-surface tests.

### Requirement bookkeeping

- `HND-02` was already marked complete by 73-02; per the dispatch it was not marked again. HND-02 also needs 73-06's registration.

### Environment note (not a code deviation)

- The worktree has no `node_modules`, so the full suite and `handoff-e2e.test.cjs` ran with `NODE_PATH=/Users/justin/dev/aoforge-claude/node_modules`.

## Issues Encountered

- Until 73-06 registers the hook, gate-interactive's new wording promises delivery after the next tool call and at the end of the turn, which only route-results (next prompt) does today. Nothing in this TRD can close that window; 73-06 does.
- Full suite (12,055 tests: 12,020 pass, 2 fail, 33 skipped): `11-12-install.test.cjs` test 11 (item 1 above) and `roadmap-reconcile.test.cjs` E2E1, which reported the 73-04 ROADMAP box unchecked while the SUMMARY existed; `roadmap update-job-progress 73` ticks it.

## User Setup Required

None.

## Next Phase Readiness

73-06 registers `inject-handoff-results.js` on `PostToolUse` (`*`) and `Stop` (timeout 150), adds its coexistence entry and PostToolUse schema model, and moves its CLAUDE.md bullet out of the Draft group. Registration clears the doctor test 11 failure. 73-07's live demonstration exercises the whole path.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED tests | `node --test plugins/aoforge/hooks/inject-handoff-results.test.js` (expected RED) | 1 | PASS (37 tests, 14 pass, 23 fail against the DRAFT) |
| 2: hook GREEN | `node --test plugins/aoforge/hooks/inject-handoff-results.test.js plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs` | 0 | PASS (76/76; hook file alone run 5 more times, 37/37 each) |
| 3: gate-interactive | `node --test plugins/aoforge/hooks/gate-interactive.test.js plugins/aoforge/hooks/hook-coexistence.test.js plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs` (NODE_PATH set; run with the hook, route-results, inventory and audit suites) | 0 | PASS (452 tests, 451 pass, 1 skipped) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (hook) | `node --test plugins/aoforge/hooks/inject-handoff-results.test.js` | 1 | FAIL (correct): 37 tests, 14 pass, 23 fail. The DRAFT emitted UserPromptSubmit-shaped output from its own cwd, never read the payload, had no Stop branch, no claim and no address, and exported none of the new names |
| GREEN (hook) | `node --test plugins/aoforge/hooks/inject-handoff-results.test.js plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs` | 0 | PASS (correct): 76/76 |
| RED (gate-interactive) | `node --test plugins/aoforge/hooks/gate-interactive.test.js` | 1 | FAIL (correct): 76 tests, 70 pass, 6 fail (no session_id/agent_id on the record, the old "next turn" wording) |
| GREEN (gate-interactive) | `node --test plugins/aoforge/hooks/gate-interactive.test.js` | 0 | PASS (correct): 76/76 |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/aoforge/hooks/inject-handoff-results.test.js plugins/aoforge/hooks/gate-interactive.test.js` | 0 | PASS |
| test (hooks, e2e, inventory, audit) | `NODE_PATH=<main checkout>/node_modules node --test` on gate-interactive, hook-coexistence, handoff-e2e, inject-handoff-results, route-results, hook-inventory and planning-writes.audit | 0 | PASS (452 tests, 451 pass, 1 skipped) |
| test (full) | `NODE_PATH=<main checkout>/node_modules node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 | 12,055 tests, 12,020 pass, 2 fail, 33 skipped; both failures explained under Issues Encountered |
| lint | not_available | - | not_available (profile: none) |
| build | not_available | - | not_available (profile: none) |

## Discovered commands

None: every command came from `.aoforge/STACK.md` or the TRD.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (PostToolUse shape and consumed_by, Stop shape and `stopFamilyProblems`, bounded wait, `stop_hook_active`, silent cases and both hatches, single delivery across two copies, session_id/agent_id on pending and done records, daemon-live wording with daemon-absent unchanged)
- Gate failures: the full-suite doctor check 12 test 11 (interim, cleared by 73-06's registration) and roadmap-reconcile E2E1 (cleared by `roadmap update-job-progress 73`)

## Self-Check: PASSED

- Files exist: `inject-handoff-results.js`, `inject-handoff-results.test.js`, `gate-interactive.js`, `gate-interactive.test.js` (all FOUND).
- Commits exist: `45900882`, `67ef1906`, `a289dbba` (all FOUND).
- TRD greps: `handoff-results.cjs` required at `inject-handoff-results.js:60`; `decision: 'block'` at line 173; `session_id` in `gate-interactive.js` at the record field; `rg -n DRAFT` on the hook finds nothing; `rg -n "inject-handoff-results" hooks.json` finds nothing.
