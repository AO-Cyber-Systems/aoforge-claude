---
objective: 73-handoff-gaps-and-result-injection
job: "06"
subsystem: handoff
tags: [handoff, hooks, hooks-json, posttooluse, stop, coexistence, schema-model]

requires:
  - objective: 73-04
    provides: inject-handoff-results.js (PostToolUse additionalContext, Stop block, STOP_WAIT_DEFAULT_MS)
provides:
  - "hooks.json registers inject-handoff-results.js on PostToolUse (matcher *) and on Stop (timeout 150)"
  - "coexistence matrix coverage for the hook on both events, on a world holding a completed handoff"
  - "postToolUseProblems: a cited model of the JSON a PostToolUse hook may print, applied to every PostToolUse run"
  - "CLAUDE.md lists the hook as registered; the Draft group keeps only inject-org-context.js"
affects: [73-07 live TTY demonstration, 73-08 docs and close-out]

tech-stack:
  added: []
  patterns:
    - "A registered hook joins every guard at once: coexistence RUNS, hook inventory, planning-writes audit"
    - "A hook timeout is pinned by a test against the hook's own wait constant, with 10 s of headroom"
    - "One output model per event in hook-output-schema.js, each rule carrying the sentence it implements"

key-files:
  created: []
  modified:
    - plugins/aoforge/hooks/hooks.json
    - plugins/aoforge/hooks/hook-coexistence.test.js
    - plugins/aoforge/hooks/__fixtures__/coexistence-fixtures.js
    - plugins/aoforge/hooks/__fixtures__/hook-output-schema.js
    - plugins/aoforge/hooks/planning-writes.audit.test.js
    - CLAUDE.md

key-decisions:
  - "The PostToolUse model follows the page, not the TRD's expectation: `reason` is not required with `decision: block` (it is on Stop)"
  - "The Stop registration's timeout is 150 s against a 120 s wait; a test pins timeout x 1000 >= STOP_WAIT_DEFAULT_MS + 10000"
  - "Test 14 gains a `singleDelivery` flag so the two-copies run asserts exactly one copy printed, not only that the record still parses"

patterns-established:
  - "PostToolUse registration has no timeout of its own (it never waits); a test pins that too"

requirements-completed: [HND-02]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 9min
completed: 2026-10-09
tokens_input: 9224638
tokens_output: 48469
tokens_cache_read: 9068647
tokens_cache_write: 155859
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 73 TRD 06: Register inject-handoff-results.js and prove it coexists Summary

**inject-handoff-results.js is now live: it delivers a finished handoff after the next tool call (PostToolUse `*`) or by blocking the stop (Stop, timeout 150), sits in the coexistence matrix on both events, and its PostToolUse output is validated against a model cited from the hooks reference.**

## Progress
- [x] Task 1: RED, the PostToolUse model tests, the world option, the RUNS entries and the timeout pin — 19673462
- [x] Task 2: GREEN, postToolUseProblems, the registrations and the CLAUDE.md move — 49716ea5
- [x] Task 3: The full-suite gate and the runtime smoke (smoke clean; the suite found the planning-writes audit guard, fixed here) — f1ee771b

## Performance

- **Duration:** about 9 min
- **Started:** 2026-10-09T18:22:41Z
- **Completed:** 2026-10-09
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- `hooks.json` registers the hook twice and nowhere else: PostToolUse in its own `*` group (gh-flush keeps its `Bash` group) with no timeout, and Stop inside the existing Stop group with `"timeout": 150`. A test reads the file and pins both facts, plus `timeout * 1000 >= STOP_WAIT_DEFAULT_MS + 10000` (150000 >= 130000).
- The coexistence suite has `inject-handoff-results.js@PostToolUse` (expect `context`) and `@Stop` (expect `block`) on a world seeded with one completed handoff (`makeWorld({ handoffDone: true })`, `h-coexist1`, addressed to `coexist-session`). Both pass tests 10-12 beside each of the nine user hooks, test 13 under all six degraded inputs, and test 14 with two copies at once. Test 14 now also asserts exactly one of the two copies printed, and the state scan includes `.aoforge-handoff/done/*.json`, so the shared record is checked to still parse.
- `hook-output-schema.js` exports `postToolUseProblems` and `POST_TOOL_USE_FIELDS`, with the hooks reference cited by URL, section and check date (2026-10-09). `contractProblems` applies it to every PostToolUse JSON output, so gh-flush's and the injection hook's runs are checked by it in tests 12 to 14.
- CLAUDE.md `### Hooks`: the bullet moved to the Session context group (heading widened to name PostToolUse / Stop) with the hook's behaviour, wait, timeout and both escapes; the Draft group keeps only `inject-org-context.js`. `hook-inventory.test.cjs` passes; doctor check 12's install test (`11-12-install.test.cjs` test 11, red since 73-04) is green again (18/18).
- Runtime smoke: a hand-written PostToolUse payload and a Stop payload piped into the hook in a temp project holding done records addressed to `smoke` produced the expected `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":...}}` and `{"decision":"block","reason":...}`; a repeat of the PostToolUse delivered nothing (already claimed), and a Stop from another session delivered nothing.

## Task Commits

1. **Task 1: RED tests, world option, RUNS entries, timeout pin** - `19673462` (test)
2. **Task 2: GREEN, model, registrations, CLAUDE.md** - `49716ea5` (feat)
3. **Task 3: planning-writes audit entry found by the full suite** - `f1ee771b` (test)

## Files Created/Modified

- `plugins/aoforge/hooks/hooks.json` - the two registrations
- `plugins/aoforge/hooks/hook-coexistence.test.js` - PostToolUse model tests (6, 7, 8), the timeout pin, two RUNS entries, `singleDelivery`, the done-record state scan, `contractProblems` calling the model
- `plugins/aoforge/hooks/__fixtures__/coexistence-fixtures.js` - the `handoffDone` world option
- `plugins/aoforge/hooks/__fixtures__/hook-output-schema.js` - `postToolUseProblems`, `POST_TOOL_USE_FIELDS`
- `plugins/aoforge/hooks/planning-writes.audit.test.js` - `handoffDone` world option and the hook's audit entry (Deviation 1)
- `CLAUDE.md` - the bullet moved out of the Draft group

## Decisions Made

See `key-decisions`. Reference check (2026-10-09, https://code.claude.com/docs/en/hooks): "PostToolUse decision control" table (decision, reason, additionalContext, classifierContext, updatedToolOutput, updatedMCPToolOutput), "Add context for Claude" ("Return additionalContext inside hookSpecificOutput alongside the event name"), the PreToolUse note ("Other events like PostToolUse and Stop continue to use top-level `decision` and `reason`") and the decision-pattern table ("Top-level decision: decision: "block", reason").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The planning-writes audit refused the new registration**
- **Found during:** Task 3 (full suite)
- **Issue:** `planning-writes.audit.test.js` test 10a requires an audit entry for every hook in `hooks.json`; registering `inject-handoff-results.js` failed it with "registered in hooks.json / plugin.json but not audited". The file is not in the TRD's `files_modified`.
- **Fix:** Added a `handoffDone` world option (record `h-audit1`, addressed to `audit-session`) and two audit variants (PostToolUse and Stop). Each asserts it reached its delivery branch (`expectStdout` / `expect: 'block'`), so the audit is not vacuous; the hook writes nothing under `.aoforge/` (its claim and consumed mark live in `.aoforge-handoff/`). No guard was loosened. 4 audit tests added (2 variants x 2 cwds), 65/65 pass.
- **Files modified:** `plugins/aoforge/hooks/planning-writes.audit.test.js`
- **Commit:** `f1ee771b`

### Judgment calls and open items

**2. The hooks page differs from the TRD's expectation on three points; the model follows the page.** (a) `reason` is not required with `decision: "block"` on PostToolUse (the table says only "Explanation shown to Claude when decision is "block""; Stop's table says "Required"), so `{ decision: 'block' }` is valid and a test says why; an invalid `reason` is one that is not a string. TRD list item 7's "block without reason" case therefore became "`reason: 1`". (b) The table also lists `classifierContext` (string) and `updatedToolOutput` (any, "must match the tool's output shape"), both accepted inside `hookSpecificOutput`. (c) `updatedMCPToolOutput` is accepted as any value.

**3. Test 14 gained a `singleDelivery` flag.** The TRD's must-have is "exactly one copy delivers"; the existing test 14 only checked the contract and that shared files parse. Both injection entries set the flag and the test counts copies that printed.

**4. CLAUDE.md wording.** The Draft sentence went from "these files ... fires them" to "this file ... fires it" (one entry left), and the bullet mentions the Stop registration's `"timeout": 150`. Both are inside the `### Hooks` lines the TRD named.

### Requirement bookkeeping

- `HND-02` was marked complete by 73-02 and registration completes it; `requirements mark-complete HND-02` was run again and is idempotent.

### Environment notes (not code deviations)

- The worktree has no `node_modules`; node-pty-dependent and full-suite runs used `NODE_PATH=/Users/justin/dev/aoforge-claude/node_modules`.
- The session scratchpad is shared with the parallel executor (73-05): my first RED capture was overwritten by its output. I reran into a private subdirectory; the RED numbers below come from that rerun.
- `scripts/gen-docs-data.cjs` writes `site/data/aoforge.json` directly. I ran it, confirmed it lists the hook as registered on `Stop` and `PostToolUse (*)`, then restored the file with `git checkout -- site/data` (73-08 owns it).

## Issues Encountered

- Full suite first run: 12,098 tests, 12,064 pass, 2 fail, 32 skipped. The failures were the audit guard above and `roadmap-reconcile` E2E1 (the ROADMAP box for 73-06 unticked while its SUMMARY existed; `roadmap update-job-progress 73` ticks it). After both fixes: 12,102 tests, 12,070 pass, 0 fail, 32 skipped. Baseline from 73-04 was 12,055 tests with 2 failures (doctor check 12 test 11, now green, and E2E1).

## User Setup Required

None.

## Next Phase Readiness

73-07's live demonstration can exercise the registered path end to end: queue a command through gate-interactive, let the aoforge-watch terminal run it, and see the result arrive after the next tool call or at the end of the turn. gate-interactive's wording about those two delivery points is now true. 73-08 regenerates `site/data/aoforge.json` and the docs, which will show the hook as registered.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED tests | `node --test plugins/aoforge/hooks/hook-coexistence.test.js` (expected RED) | 1 | PASS (233 tests, 226 pass, 7 fail: test 9 x3, the 4 model tests) |
| 2: GREEN | `node --test plugins/aoforge/hooks/hook-coexistence.test.js plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs plugins/aoforge/hooks/inject-handoff-results.test.js plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs` | 0 | PASS (308/308) |
| 2: doctor check 12 | `node --test plugins/aoforge/aoforge/bin/lib/doctor-checks/11-12-install.test.cjs` | 0 | PASS (18/18; was red since 73-04) |
| 3: smoke | hand-written PostToolUse and Stop payloads into `inject-handoff-results.js` in a temp project | 0 | PASS (expected JSON on both; repeat and other-session runs silent) |
| 3: audit | `node --test plugins/aoforge/hooks/planning-writes.audit.test.js` | 0 | PASS (65/65) |
| 3: full suite | `NODE_PATH=<main checkout>/node_modules node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 0 | PASS (12,102 tests, 12,070 pass, 0 fail, 32 skipped) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/aoforge/hooks/hook-coexistence.test.js` | 1 | FAIL (correct): 233 tests, 226 pass, 7 fail. Test 9 (two RUNS entries stale: not registered), test 9 copy-of-hooks.json (same stale entries), the timeout pin (no registration found: `[]` vs `['PostToolUse:*','Stop:null']`), and the four PostToolUse model tests (6, 6 reason, 7, 8: `postToolUseProblems` did not exist) |
| GREEN | `node --test plugins/aoforge/hooks/hook-coexistence.test.js plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs plugins/aoforge/hooks/inject-handoff-results.test.js plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs` | 0 | PASS (correct): 308/308, including tests 10-14 for both new entries |
| RED (inventory) | not observed separately | - | The TRD's list item 9 (inventory RED once registered, before the CLAUDE.md move) was not run in isolation: the registration and the CLAUDE.md move landed in one commit. The guard's logic (a registered script under the Draft group fails test 3) is covered by its own existing self-tests |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test plugins/aoforge/hooks/hook-coexistence.test.js plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs` | 0 | PASS (within the 308-test run) |
| test (full) | the STACK.md glob with `NODE_PATH` set | 0 | PASS (12,102 tests, 0 fail, 32 skipped) |
| lint | not_available | - | not_available (profile: none) |
| build | not_available | - | not_available (profile: none) |

## Discovered commands

None: every command came from `.aoforge/STACK.md` or the TRD.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (registrations and timeout pin; stale-entry guard green; both RUNS entries through tests 10-14; exactly-one-delivers and the done-record scan; cited PostToolUse model applied by `contractProblems`; CLAUDE.md move with inventory green)
- Gate failures: the full suite's first run (audit guard 10a, fixed in `f1ee771b`; E2E1, cleared by `roadmap update-job-progress 73`); none remain

## Self-Check: PASSED

- Files exist: `hooks.json`, `hook-coexistence.test.js`, `coexistence-fixtures.js`, `hook-output-schema.js`, `planning-writes.audit.test.js`, `CLAUDE.md` (all FOUND).
- Commits exist: `19673462`, `49716ea5`, `f1ee771b` (all FOUND).
- TRD greps: `rg -n "inject-handoff-results" plugins/aoforge/hooks/hooks.json` shows exactly two registrations (lines 66 and 175); both `inject-handoff-results.js@` RUNS entries and `postToolUseProblems` present in the suite and the schema file; `inject-handoff-results.js` is no longer under `**Draft (not registered` in CLAUDE.md.
