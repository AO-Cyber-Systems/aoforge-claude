---
objective: 70-cli-defects-and-hook-shape
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/__fixtures__/hook-output-schema.js
  - plugins/devflow/hooks/verify-commits.js
  - plugins/devflow/hooks/verify-commits.test.js
  - plugins/devflow/hooks/hook-coexistence.test.js
  - plugins/devflow/hooks/gate-executor-stop.js
  - docs/built-in-integration-status.md
autonomous: true
requirements: [TOOL-08]
must_haves:
  truths:
    - "In autonomous mode, mid-execution, with no commit in the last 10 minutes, a SubagentStop for `agent_type: devflow:executor` makes verify-commits.js print exactly one JSON object whose keys are `decision` and `reason` (top level), with `decision: \"block\"` and a non-empty `reason`; `hookSpecificOutput` is absent"
    - "That output has no problems under `stopFamilyProblems('SubagentStop', out)`, a validator that encodes the Claude Code hooks reference (Stop decision control, the SubagentStop section and the universal JSON fields, checked 2026-10-08) and cites it"
    - "The validator rejects the pre-70 nested shape `{hookSpecificOutput:{hookEventName:'SubagentStop',decision:'block',reason:'…'}}`, a `block` without `reason`, a `decision` other than `block`, a `hookSpecificOutput.hookEventName` that is not the event, and an unknown top-level key. It accepts `{}`, `{systemMessage}` and `{hookSpecificOutput:{hookEventName:'SubagentStop',additionalContext}}`"
    - "A SubagentStop from any other agent type (`Explore`, `devflow:planner`, empty, or missing `agent_type`) never blocks and writes no retry marker, so the now-effective block cannot stop non-executor subagents"
    - "The retry-once marker behaviour is unchanged: a second stop for the same agent is allowed, markers stay in the hook-marker store, and `.planning/` gains no dotfile"
    - "hook-coexistence.test.js expects verify-commits.js@SubagentStop to compose to a block, and its output contract runs the same validator over every Stop and SubagentStop hook's JSON"
  artifacts:
    - path: plugins/devflow/hooks/__fixtures__/hook-output-schema.js
      provides: "stopFamilyProblems(event, json) -> string[]; cited model of the Stop/SubagentStop output schema"
      exports: ["STOP_FAMILY_EVENTS", "UNIVERSAL_FIELDS", "STOP_FIELDS", "stopFamilyProblems"]
    - path: plugins/devflow/hooks/verify-commits.js
      provides: "top-level {decision, reason} block, scoped to devflow:executor"
      exports: ["EXECUTOR_AGENT_TYPE", "findPlanningDir", "hasRecentCommits", "isMidExecution", "isAutonomousMode", "retryMarkerPath", "cleanStaleMarkers"]
    - path: plugins/devflow/hooks/verify-commits.test.js
      provides: "shape-pinning test (exact keys + validator), non-executor tests, validator sensitivity tests"
  key_links:
    - from: "verify-commits.test.js shape test"
      to: "__fixtures__/hook-output-schema.js stopFamilyProblems"
      via: "assert.deepEqual(stopFamilyProblems('SubagentStop', out), [])"
      pattern: "stopFamilyProblems\\("
    - from: "hook-coexistence.test.js contractProblems"
      to: "__fixtures__/hook-output-schema.js stopFamilyProblems"
      via: "Stop and SubagentStop JSON outputs validated"
      pattern: "stopFamilyProblems"
    - from: "verify-commits.js block branch"
      to: "Claude Code SubagentStop decision control"
      via: "process.stdout.write(JSON.stringify({ decision: 'block', reason }))"
      pattern: "decision: 'block'"
---

# TRD 70-02: verify-commits.js speaks the SubagentStop output schema, and a test pins it (TOOL-08)

<objective>
`verify-commits.js` blocks an executor's first stop once per agent in autonomous mode when no commit landed in the last
10 minutes. Its block is printed as
`{"hookSpecificOutput":{"hookEventName":"SubagentStop","decision":"block","reason":"…"}}`. The Claude Code hooks
reference (https://code.claude.com/docs/en/hooks, re-read 2026-10-08) defines SubagentStop decision control as the Stop
format: **top-level** `decision: "block"` with a required `reason`. Inside `hookSpecificOutput` it allows only
`hookEventName` and `additionalContext`. Under the documented model the nested block composes to nothing, or is a
schema-validation "hook error". So the retry nudge has been inert. The 63-05 finding recorded this; its tests pin the
wrong shape (`verify-commits.test.js` 176-179, 219, 287, 318, 349).

Move the block to the top level and pin the shape with a test that validates it against a cited schema model. Once the
block is real, the hook would also stop every non-executor subagent: SubagentStop has no matcher in `hooks.json`, and
planners, checkers, Explore and `/btw` commit nothing by design. So scope the block to `agent_type: devflow:executor`,
the same constant `gate-executor-stop.js` uses. Success criterion 4 of objective 70.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures (`no_llm_test_data`), no
property-based libraries, no `.feature` files. User playbook: failing test first, one test at a time.

Read narrowly (`rg -n` first):
- `plugins/devflow/hooks/verify-commits.js` (210 lines; read whole): `main` 152-198, block write 182-188, exports 202-210.
- `plugins/devflow/hooks/verify-commits.test.js`: header 1-29, harness `makeFixture` 52-112, `markerFileFor` 123,
  `runHook` 147-155, Tests 1-9 164-312, 6b/7 313-364. Every test that reads `parsed.hookSpecificOutput.*` changes.
- `plugins/devflow/hooks/hook-coexistence.test.js`: RUNS entry `verify-commits.js@SubagentStop` 487-495,
  `contractProblems` 672-720, `assertExpected` 780-806.
- `plugins/devflow/hooks/__fixtures__/hook-runner.js` 1-60: the citation style to copy (rule + quoted sentence + source
  URL + date).
- `plugins/devflow/hooks/gate-executor-stop.js` 20-29 (header comment naming verify-commits' nested form) and 346
  (`EXECUTOR_AGENT_TYPE = 'devflow:executor'`).
- `docs/built-in-integration-status.md` row `SubagentStop` (84) and the cleanup bullet (139).
- `.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-05-SUMMARY.md` 107 (the finding).
</context>

## Test list

Outermost first: the spawned hook (subprocess, fake marker dir), then the validator in-process, then the cross-hook
contract.

**verify-commits.js, spawned** (`verify-commits.test.js`):
1. Autonomous, `midExecution`, `initGit`, no commits, payload `{agent_id: 'agent-shape-1', agent_type: 'devflow:executor'}`
   -> exit 0; stdout is one JSON object; `Object.keys(out).sort()` deep-equals `['decision', 'reason']`;
   `out.decision === 'block'`; `out.reason` matches `/no commits/i` and contains `8091`;
   `stopFamilyProblems('SubagentStop', out)` deep-equals `[]`; the marker exists in the store.
2. Same world, `agent_type: 'Explore'` -> stdout empty, no marker created.
3. Same world, `agent_type: 'devflow:planner'`, then `agent_type: ''`, then no `agent_type` key -> stdout empty, no
   marker, each.
4. Existing Tests 1, 3, 8, 6b and 7 now send `agent_type: 'devflow:executor'` and read top-level `decision` / `reason`.
   Test 2 (marker exists -> no block) also sends it, so its "no block" comes from the marker and not from the agent type.

**Validator, in-process** (hand-built literal objects):
5. `{}` -> `[]`; `{ systemMessage: 'x' }` -> `[]`;
   `{ hookSpecificOutput: { hookEventName: 'SubagentStop', additionalContext: 'x' } }` -> `[]`.
6. The pre-70 nested shape -> non-empty, and one problem names `hookSpecificOutput.decision`.
7. `{ decision: 'block' }` -> a problem naming `reason`; `{ decision: 'block', reason: '' }` -> the same.
8. `{ decision: 'allow', reason: 'x' }` -> a problem naming `decision`.
9. `{ hookSpecificOutput: { hookEventName: 'Stop', additionalContext: 'x' } }` checked as `SubagentStop` -> a problem
   naming `hookEventName`.
10. `{ decision: 'block', reason: 'x', extra: 1 }` -> a problem naming `extra`; `{ continue: 'no' }` -> a type problem.
11. `stopFamilyProblems('PreToolUse', {})` throws (the model covers Stop and SubagentStop only).

**Cross-hook contract** (`hook-coexistence.test.js`):
12. RUNS `verify-commits.js@SubagentStop` has `expect: 'block'` and passes: solo composition `blocked === true`.
13. `contractProblems` adds `stopFamilyProblems(event, json)` for Stop and SubagentStop JSON. auto-continue,
    verify-completion, gh-flush, todo-sync, gate-executor-stop and verify-commits all pass it.

<embedded_context>

<codebase_examples>
The block today (`verify-commits.js` 182-188). Change only the wrapper; keep the reason text verbatim:
```js
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SubagentStop',
          decision: 'block',
          reason: 'DevFlow autonomous mode: executor produced no commits in the last 10 minutes during mid-execution work. Retry once: re-read your TRD/plan file, check git status for uncommitted work, commit completed tasks atomically, and write SUMMARY.md. If genuinely blocked, return a structured failure report instead of stopping silently. Never use port 8080 for anything — use 8091.',
        },
      }));
```
The verified shape in the sibling hook (`gate-executor-stop.js` 490-491):
```js
      // TOP-LEVEL shape — the verified SubagentStop form. Not hookSpecificOutput.
      process.stdout.write(JSON.stringify({ decision: 'block', reason: d.reason }));
```
Its agent filter (`gate-executor-stop.js` 442): `if (payload.agent_type !== EXECUTOR_AGENT_TYPE) return null;`

The documentation the validator encodes (quote these in the fixture's comments):
- Stop decision control table: "`decision` | `\"block\"` prevents Claude from stopping. Omit to allow Claude to stop";
  "`reason` | Required when `decision` is `\"block\"`"; "`hookSpecificOutput.additionalContext` | Non-error feedback
  for Claude."
- SubagentStop: "SubagentStop hooks use the same decision control format as Stop hooks, including
  `hookSpecificOutput.additionalContext` with `hookEventName` set to `\"SubagentStop\"`."
- PreToolUse note: "Other events like PostToolUse and Stop continue to use top-level `decision` and `reason` as their
  current format."
- `hookSpecificOutput` "requires a `hookEventName` field set to the event name."
- Universal fields: `continue` (boolean), `stopReason` (string), `suppressOutput` (boolean), `systemMessage` (string),
  `terminalSequence` (string).
- On exit 0, "a parsed object that fails schema validation is a non-blocking error: the action proceeds, and the
  transcript shows a `<hook name> hook error` notice".

The coexistence contract today (`hook-coexistence.test.js` 672-720) checks top-level key names and that
`hookSpecificOutput.hookEventName === event`. The nested block passed it because `hookEventName` matched. That gap is
why the new validator checks the keys inside `hookSpecificOutput` too.
</codebase_examples>

<anti_patterns>
- Do not change the retry-once logic, the marker store, the stale sweep, the 10-minute window or the non-autonomous
  stderr warning (it stays verbatim for every agent type).
- Do not add a `stop_hook_active` guard. The per-agent marker already bounds the block to one, and gate-executor-stop
  owns the `stop_hook_active` once-guard. Two different guards on the same stop would interact.
- Do not put `additionalContext` in place of the block. The hook's contract is "retry once", which is a block.
- Do not make the validator stricter than the documentation (for example, rejecting `reason` without `decision`). It
  pins Claude Code's schema, not a house style.
- Do not touch `planning-writes.audit.test.js` `decisionOf`. Its top-level read already handles the new shape, and its
  nested fallback is harmless.
</anti_patterns>

<error_recovery>
- A coexistence pairing test fails after `expect: 'block'`: a user-hook pairing now sees a DevFlow block it did not see
  before. Read the failing label. A block beside a user `deny`/`block` is expected to compose to blocked with both
  reasons. Fix the expectation only if the model (`hook-runner.js` `composeEvent`) says so, and cite the rule.
- A Stop-family hook fails the new contract check: record the hook and the problem in the SUMMARY. If it is a real
  schema violation, fix its output in this TRD only if the fix is a one-line wrapper change. Otherwise drop that hook
  from the strengthened check with a comment naming a follow-up todo (`df-tools todo add`).
- `hook-coexistence.test.js` is slow or times out in a worktree: run it alone; it spawns every hook.
</error_recovery>

</embedded_context>

<gotchas>
- `verify-commits.test.js` payloads today carry no `agent_type`. After scoping, every autonomous-path test without
  `agent_type: 'devflow:executor'` stops blocking, and a "no block" test passes vacuously. Add it to all of them, Test 2
  included.
- The coexistence and audit fixtures already send `agent_type: 'devflow:executor'` (`__fixtures__/coexistence-fixtures.js`
  221-228, `planning-writes.audit.test.js` 318-325), so they keep reaching the block branch.
- `__fixtures__/*.js` is not matched by the `*.test.js` glob. The validator is exercised through verify-commits.test.js
  (cases 5-11) and the coexistence contract.
- `docs/built-in-integration-status.md` is held to the tree by `builtin-status.repo.test.cjs`. Change only the Notes
  cell of the `SubagentStop` row and the cleanup bullet. Keep the cited paths and the `adopted` status.
- The installed plugin keeps the old hook until a release re-syncs it. This TRD cannot observe a live SubagentStop;
  70-03 records that as a post-release check.
- One plain command per Bash call. Commit with `df-tools commit`. Never use port 8080.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Cited SubagentStop schema model, a shape-pinning test, and a top-level block scoped to the executor</name>
  <files>plugins/devflow/hooks/__fixtures__/hook-output-schema.js, plugins/devflow/hooks/verify-commits.test.js, plugins/devflow/hooks/verify-commits.js</files>
  <action>
1. Create `hooks/__fixtures__/hook-output-schema.js` (`'use strict'`, node core only). The header cites
   https://code.claude.com/docs/en/hooks, "checked 2026-10-08", and the sections: Stop decision control, SubagentStop,
   JSON output universal fields. It is not a test file. Exports:
   ```
   STOP_FAMILY_EVENTS = ['Stop', 'SubagentStop']
   UNIVERSAL_FIELDS   = { continue: 'boolean', stopReason: 'string', suppressOutput: 'boolean',
                          systemMessage: 'string', terminalSequence: 'string' }
   STOP_FIELDS        = ['decision', 'reason', 'hookSpecificOutput']
   stopFamilyProblems(event, json) -> string[]
     throw if event not in STOP_FAMILY_EVENTS
     not a plain object -> ['output is not a JSON object']
     each top-level key not in UNIVERSAL_FIELDS or STOP_FIELDS -> `unknown top-level key "<k>"`
     each universal field present with the wrong typeof -> `<k> must be a <type>`
     decision present and !== 'block' -> `decision must be "block" (got <v>)`
     decision === 'block' and reason not a non-empty string -> 'reason is required when decision is "block"'
     hookSpecificOutput present:
       not a plain object -> 'hookSpecificOutput must be an object'
       hookEventName !== event -> `hookSpecificOutput.hookEventName must be "<event>"`
       each key other than hookEventName / additionalContext -> `hookSpecificOutput.<k> is not a <event> field`
       additionalContext present and not a string -> 'hookSpecificOutput.additionalContext must be a string'
   ```
   Put the quoted documentation sentence above each rule (see codebase_examples).
2. RED in `verify-commits.test.js`: add test-list cases 1-3 (new spawned tests) and 5-11 (a
   `describe('SubagentStop output schema (TRD 70-02)')` block), and update the existing tests per case 4. Extend the
   header comment's list. Run it: the shape and agent-type tests fail and the validator tests pass. Commit RED.
3. GREEN in `verify-commits.js`:
   - `const EXECUTOR_AGENT_TYPE = 'devflow:executor';` (same value as gate-executor-stop.js 346) and export it.
   - In the autonomous branch, right after `parsePayload()`:
     `if (payload.agent_type !== EXECUTOR_AGENT_TYPE) return;`. Comment: only the executor is expected to commit;
     planners, checkers, Explore and internal agents commit nothing by design, and SubagentStop has no matcher.
   - Hoist the reason into `const BLOCK_REASON = '…'` (text unchanged). Write
     `process.stdout.write(JSON.stringify({ decision: 'block', reason: BLOCK_REASON }));`.
   - Rewrite the header comment: the block is top-level per "Stop decision control" (cite the URL), scoped to
     `devflow:executor`, objective 70. It was nested in `hookSpecificOutput` before, and that shape is not read for
     SubagentStop.
  </action>
  <verify>
node --test plugins/devflow/hooks/verify-commits.test.js
  </verify>
  <done>Every verify-commits test passes. The RED commit precedes GREEN. `rg -n "hookSpecificOutput" plugins/devflow/hooks/verify-commits.js`
finds only the header comment's history note. `node -e "const s=require('./plugins/devflow/hooks/__fixtures__/hook-output-schema.js');console.log(s.stopFamilyProblems('SubagentStop',{hookSpecificOutput:{hookEventName:'SubagentStop',decision:'block',reason:'x'}}))"`
prints a non-empty array.</done>
  <recovery>If a marker test fails after scoping, check its payload has `agent_type: 'devflow:executor'` before touching the
hook. Revert the hook with `git checkout -- plugins/devflow/hooks/verify-commits.js`.</recovery>
</task>

<task type="auto">
  <name>Task 2: The cross-hook contract uses the validator; the 63-05 finding and its doc trail are closed</name>
  <files>plugins/devflow/hooks/hook-coexistence.test.js, plugins/devflow/hooks/gate-executor-stop.js, docs/built-in-integration-status.md</files>
  <action>
1. `hook-coexistence.test.js`:
   - In RUNS `'verify-commits.js@SubagentStop'`, set `expect: 'block'`. Replace the FINDING (63-05) comment with one line:
     the hook blocks with a top-level `{decision, reason}` since objective 70 (TRD 70-02).
   - `require('./__fixtures__/hook-output-schema.js')`. In `contractProblems`, after the existing
     `hookSpecificOutput` check, add
     `if (STOP_FAMILY_EVENTS.includes(event)) problems.push(...stopFamilyProblems(event, json));`. Keep
     `ALLOWED_TOP_LEVEL_KEYS` as it is; it is DevFlow's own narrower list.
   Run the file. Every Stop and SubagentStop hook must pass (test-list cases 12-13).
2. `gate-executor-stop.js` header (lines 27-28), comment only: "The block shape is TOP-LEVEL `{decision, reason}`, the
   same shape verify-commits.js uses since objective 70." No code change.
3. `docs/built-in-integration-status.md`:
   - The `SubagentStop` row Notes cell (84) becomes: "verify-commits.js and gate-executor-stop.js block with a top-level
     `decision`/`reason`; verify-commits.js nested them in `hookSpecificOutput` until objective 70 (63-05 finding,
     closed)."
   - In the cleanup bullet (139), remove the clause "fix verify-commits.js's nested `decision` once checked against a
     live SubagentStop".
   Then run `builtin-status.repo.test.cjs`.
  </action>
  <verify>
node --test plugins/devflow/hooks/hook-coexistence.test.js plugins/devflow/hooks/gate-executor-stop.test.js plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/devflow/bin/lib/builtin-status.repo.test.cjs
  </verify>
  <done>All four files pass. `rg -n "expect: 'output'" plugins/devflow/hooks/hook-coexistence.test.js` no longer
matches the verify-commits entry. `rg -n "63-05 finding, open" docs/built-in-integration-status.md` has no hit.
`git diff HEAD -- plugins/devflow/hooks/gate-executor-stop.js` touches comment lines only.</done>
  <recovery>If the strengthened contract fails for a hook other than verify-commits, follow error_recovery (record it, fix
a one-line wrapper or exclude it with a todo). Do not weaken the validator to make it pass.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test {files}   (scoped; each task's verify line names its files)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/hooks/verify-commits.test.js plugins/devflow/hooks/hook-coexistence.test.js` passes.
- `rg -n "decision: 'block'" plugins/devflow/hooks/verify-commits.js` has a hit, and `rg -n "stopFamilyProblems" plugins/devflow/hooks/verify-commits.test.js plugins/devflow/hooks/hook-coexistence.test.js` hits both files.
- The full suite shows no new failure against the 70-03 baseline.
</verification>

<success_criteria>
- A verify-commits.js SubagentStop result is valid against the documented hook output schema, and
  `verify-commits.test.js` pins both the exact keys and the validator result (SC-4).
- Only a `devflow:executor` stop can be blocked; the retry-once and marker behaviour is unchanged.
</success_criteria>

<output>
After completion, create `.planning/objectives/70-cli-defects-and-hook-shape/70-02-SUMMARY.md` through
`df-tools summary post`.
</output>
