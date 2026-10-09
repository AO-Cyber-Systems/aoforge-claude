---
objective: 73-handoff-gaps-and-result-injection
trd: "06"
type: standard
wave: 3
depends_on: ["73-04"]
files_modified:
  - plugins/aoforge/hooks/hooks.json
  - plugins/aoforge/hooks/hook-coexistence.test.js
  - plugins/aoforge/hooks/__fixtures__/coexistence-fixtures.js
  - plugins/aoforge/hooks/__fixtures__/hook-output-schema.js
  - CLAUDE.md
autonomous: true
requirements: [HND-02]
must_haves:
  truths:
    - "hooks.json registers `inject-handoff-results.js` on PostToolUse with matcher `*` (its own group; gh-flush keeps its `Bash` group) and on Stop inside the existing Stop group with `\"timeout\": 150`"
    - "A test pins that the Stop registration's timeout (seconds x 1000) exceeds the hook's `STOP_WAIT_DEFAULT_MS` by at least 10 s, so the bounded wait can never be cut off by Claude Code"
    - "The coexistence suite has RUNS entries `inject-handoff-results.js@PostToolUse` (expect `context`) and `inject-handoff-results.js@Stop` (expect `block`) on a world seeded with one completed handoff, and both pass tests 10-14: beside each of the nine user hooks, under every degraded input, and as two copies at once"
    - "In the two-copies run exactly one copy delivers, and the shared done record still parses (the suite's state-file scan now includes the world's `.aoforge-handoff/done/*.json`)"
    - "hook-output-schema.js models PostToolUse output from the Claude Code hooks reference, cited by URL, section and check date, and contractProblems applies it to every PostToolUse JSON output (gh-flush and inject-handoff-results)"
    - "CLAUDE.md's `### Hooks` section lists `inject-handoff-results.js` as registered (PostToolUse `*` and Stop), and the Draft group keeps only `inject-org-context.js`; hook-inventory.test.cjs passes"
  artifacts:
    - path: plugins/aoforge/hooks/hooks.json
      provides: "the two registrations"
    - path: plugins/aoforge/hooks/__fixtures__/hook-output-schema.js
      provides: "postToolUseProblems(json) -> string[]"
      exports: ["STOP_FAMILY_EVENTS", "UNIVERSAL_FIELDS", "STOP_FIELDS", "SESSION_START_FIELDS", "POST_TOOL_USE_FIELDS", "stopFamilyProblems", "sessionStartProblems", "postToolUseProblems"]
    - path: plugins/aoforge/hooks/__fixtures__/coexistence-fixtures.js
      provides: "makeWorld({ handoffDone: true }) seeds .aoforge-handoff/done/h-coexist1.json addressed to coexist-session"
    - path: plugins/aoforge/hooks/hook-coexistence.test.js
      provides: "RUNS entries, the timeout pin, the PostToolUse model tests, the done-record state scan"
  key_links:
    - from: "hooks.json PostToolUse matcher *"
      to: "hooks/inject-handoff-results.js"
      via: "node ${CLAUDE_PLUGIN_ROOT}/hooks/inject-handoff-results.js"
      pattern: "inject-handoff-results\\.js"
    - from: "hook-coexistence.test.js contractProblems"
      to: "hook-output-schema.js postToolUseProblems"
      via: "PostToolUse JSON outputs validated against the cited model"
      pattern: "postToolUseProblems\\("
---

# TRD 73-06: Register inject-handoff-results.js and prove it coexists

<objective>
HND-02 and SC-2 ask for three things about the injection hook: it is registered in `hooks.json`, it delivers a
completed handoff into the session (73-04 proves the behaviour), and it appears in the hook coexistence suite. Two CI
guards make these one change: `hook-coexistence.test.js` test 9 fails on a registration without a RUNS entry, and
`hook-inventory.test.cjs` test 3 fails on a registered script still listed under CLAUDE.md's "Draft (not registered)"
group.

So this TRD, together: registers the hook on PostToolUse (`*`) and Stop (with a hook timeout that outlasts its bounded
wait), adds both RUNS entries on a world holding a completed handoff, extends the suite's state scan to the handoff
done directory so the two-copies test checks the record survives, adds a cited PostToolUse output model next to the
Stop and SessionStart ones (objective 70's pattern) and applies it in the output contract, and moves the CLAUDE.md
bullet out of the Draft group.

Purpose: HND-02 / SC-2. Output: the registration and its coexistence coverage.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures, no property-based libraries, no
`.feature` files.

Read 73-04's SUMMARY first (`73-04-SUMMARY.md`): the hook's events, outputs and `STOP_WAIT_DEFAULT_MS` export.

Read narrowly:
- `plugins/aoforge/hooks/hooks.json` (whole, ~170 lines): the Stop group, the PostToolUse `Bash` group (gh-flush), the
  PreToolUse `*` group (guard-no-progress, the precedent for matcher `*`).
- `plugins/aoforge/hooks/hook-coexistence.test.js`: header 1-17, RUNS doc comment 397-410, entries
  `route-results.js@UserPromptSubmit` 512 and `gate-interactive.js@PreToolUse` (normalize example) and
  `gh-flush.js@PostToolUse` 567, `contractProblems` 690-720, `stateFilesOf` 843, test 9 892-923, tests 10-12 925-993,
  13 995, 14 1025.
- `plugins/aoforge/hooks/__fixtures__/coexistence-fixtures.js`: `makeWorld` 110-180 (the `notices` option is the model
  to copy), `envelope` 212 (`session_id: 'coexist-session'`), `stop` 225, `postTool` 259, exports 372.
- `plugins/aoforge/hooks/__fixtures__/hook-output-schema.js` (whole): the citation style; `stopFamilyProblems`,
  `sessionStartProblems`, exports.
- `plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs` 1-120 (what test 3 checks).
- `CLAUDE.md` lines 107-142 (the `### Hooks` section; Draft group at 139-141).
</context>

## Test list

**Table and registration** (`hook-coexistence.test.js`):
1. Test 9 passes with `inject-handoff-results.js@PostToolUse` and `inject-handoff-results.js@Stop` in RUNS and in
   `hooks.json`.
2. New test: the Stop registration of `inject-handoff-results.js` has a numeric `timeout` and
   `timeout * 1000 >= require('./inject-handoff-results.js').STOP_WAIT_DEFAULT_MS + 10000`; it has no other
   registrations than PostToolUse `*` and Stop.

**RUNS entries through the matrix** (tests 10-14, existing machinery):
3. `inject-handoff-results.js@PostToolUse`: world `{ handoffDone: true }`, payload `fx.postTool('Bash', { command: 'ls'
   })`, `expect: 'context'`, `writesState: true`, `normalize` replacing the `*completed <ISO>*` line with
   `*completed <T>*`.
4. `inject-handoff-results.js@Stop`: same world, payload `fx.stop()`, `expect: 'block'`, `writesState: true`, same
   normalize.
5. Both survive the six degraded inputs (test 13) and two copies at once (test 14), where the done record must still
   parse.

**PostToolUse output model** (`hook-coexistence.test.js`, a new describe beside the composition model):
6. Valid: `{}`, `{ systemMessage: 'x' }`, `{ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext:
   'x' } }`, `{ decision: 'block', reason: 'x' }` -> `[]`.
7. Invalid, each naming the problem: `hookEventName: 'Stop'`; `hookSpecificOutput.permissionDecision`;
   `additionalContext: 1`; `decision: 'allow'`; `{ decision: 'block' }` without reason; an unknown top-level key.
   (Adjust 6-7 to what the reference actually says; see codebase_examples.)
8. `contractProblems('PostToolUse', run)` includes `postToolUseProblems` for JSON output; gh-flush's and the injection
   hook's runs pass it.

**Inventory** (`hook-inventory.test.cjs`, unchanged file):
9. Passes after the CLAUDE.md move (RED before it, once the hook is registered).

<embedded_context>

<codebase_examples>
Registrations (shape to add; keep every other entry and the order of the existing ones):
```json
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/verify-completion.js" },
          ...
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/todo-sync.js" },
          { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/inject-handoff-results.js", "timeout": 150 }
        ]
      }
    ],
    "PostToolUse": [
      { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/gh-flush.js" } ] },
      { "matcher": "*",    "hooks": [ { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/inject-handoff-results.js" } ] }
    ]
```
The world option, modelled on `notices` (`coexistence-fixtures.js` 167-178):
```js
  if (opts.handoffDone) {
    const done = path.join(root, '.aoforge-handoff', 'done');
    fs.mkdirSync(done, { recursive: true });
    fs.writeFileSync(path.join(done, 'h-coexist1.json'), JSON.stringify({
      id: 'h-coexist1', cmd: 'npm login', cwd: root, status: 'done', exit_code: 0,
      stdout: 'coexist ok\n', stderr: '', session_id: 'coexist-session', agent_id: null,
      created_at: new Date().toISOString(), completed_at: new Date().toISOString(), consumed: false,
    }, null, 2));
  }
```
Every scenario (solo and each pairing) builds its own world, so each run claims its own copy of the record: solo and
paired outputs match after `normalize`. Test 14 puts two copies in one world: one delivers, one is silent, both follow
the contract.

The citation style to copy (`hook-output-schema.js` header): every rule carries the sentence it implements, the source
is https://code.claude.com/docs/en/hooks with the date checked. Re-read the reference (WebFetch) for the PostToolUse
section ("PostToolUse decision control") and encode exactly what it says, no stricter and no looser. Expected, to be
confirmed against the page: top-level `decision` (`"block"` only) and `reason` (required with block);
`hookSpecificOutput` with `hookEventName: "PostToolUse"`, `additionalContext` (string) and `updatedMCPToolOutput` (MCP
tools only); plus the universal fields. If the page differs, follow the page and say so in the SUMMARY.

The CLAUDE.md move (lines 112-116 and 139-141): put a bullet under the Session context group and widen the group's
heading to name the events (for example `**Session context (SessionStart / UserPromptSubmit; handoff delivery on
PostToolUse / Stop):**`), with: `inject-handoff-results.js` — PostToolUse(`*`) + Stop; delivers completed handoff
results addressed to the session and agent that queued them (after the next tool call, or by blocking the stop, waiting
up to `AOFORGE_HANDOFF_STOP_WAIT_MS` (120 s) while a queued command is still running) through
`lib/handoff-results.cjs`, exactly once (O_EXCL claim); route-results stays the catch-all on the next prompt. Escapes:
`AOFORGE_SKIP_HANDOFF_INJECT=1`, `AOFORGE_SKIP_HANDOFF_RESULTS=1`. Remove it from the Draft group, whose sentence then
covers only `inject-org-context.js`.
</codebase_examples>

<anti_patterns>
- Do not register the hook on UserPromptSubmit (route-results owns it) or on SubagentStop.
- Do not give the PostToolUse registration a timeout; it never waits.
- Do not add `inject-handoff-results.js` to the RUNS table with a world that has no handoff record: `expect` must reach
  the hook's decision branch, or the matrix passes vacuously (the RUNS doc comment says why).
- Do not loosen `contractProblems` to make a run pass. If the injection hook's output fails the model, the hook is wrong
  (fix it in a follow-up commit to 73-04's file only if the model is right per the cited page, and say so).
- Do not edit CLAUDE.md beyond the `### Hooks` lines named here; 73-08 owns the rest of the docs.
</anti_patterns>

<error_recovery>
- Test 10 fails with outputs differing between solo and paired runs: a run-dependent string survived `normalize`
  (a timestamp, a pid, a temp path). Print both outputs, extend `normalize` for that string only.
- Test 14 fails on "a state file the two copies share no longer parses": the done record was written non-atomically.
  `markConsumed` in 73-02 writes tmp + rename; check the hook calls it and nothing else writes the record.
- The PostToolUse `user-deny` pairing composes to `blocked` and the injection hook's context is dropped: that is the
  documented composition for PostToolUse (`hook-runner.js` rules); assert what the model says, citing it.
</error_recovery>

</embedded_context>

<gotchas>
- `matcherFires('*', 'Bash')` already works (guard-no-progress uses `*`).
- The suite runs four registrations at a time (`{ concurrency: 4 }`) and builds a world per scenario; seeding one small
  JSON file adds nothing measurable.
- `hook-inventory.test.cjs` reads CLAUDE.md from the repo root; the move must keep the bullet format
  `` - `inject-handoff-results.js` — ... ``.
- `scripts/gen-docs-data.cjs` and `site/data/aoforge.json` also describe hooks; 73-08 regenerates them, not this TRD.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED, the PostToolUse model tests, the world option, the RUNS entries and the timeout pin</name>
  <files>plugins/aoforge/hooks/hook-coexistence.test.js, plugins/aoforge/hooks/__fixtures__/coexistence-fixtures.js</files>
  <action>
Fetch the hooks reference and note the PostToolUse rules with the date. Add the `handoffDone` world option, test list
items 2 and 6-8 (against a `postToolUseProblems` that does not exist yet), the two RUNS entries, and extend
`stateFilesOf` to include `<world.root>/.aoforge-handoff/done/*.json`. Run the suite: test 9 reports both RUNS entries
as stale (not registered), item 2 finds no registration, items 6-8 fail on the missing function. Commit the tests alone
(`test(73-06): ...`).
  </action>
  <verify>node --test plugins/aoforge/hooks/hook-coexistence.test.js exits non-zero, failing on test 9 (stale entries), the timeout pin and the missing postToolUseProblems</verify>
  <done>The coverage for the new registration exists and is RED for the right reasons; the reference sentences and check date are noted for Task 2.</done>
  <recovery>If WebFetch cannot reach the reference, use the sentences already quoted in `hook-output-schema.js` and `hook-runner.js` for the shared rules, mark the PostToolUse-specific ones "not re-checked" in the comment, and flag it in the SUMMARY.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN, postToolUseProblems, the registrations and the CLAUDE.md move</name>
  <files>plugins/aoforge/hooks/__fixtures__/hook-output-schema.js, plugins/aoforge/hooks/hook-coexistence.test.js, plugins/aoforge/hooks/hooks.json, CLAUDE.md</files>
  <action>
Implement `postToolUseProblems(json)` with a citation per rule and export it (and `POST_TOOL_USE_FIELDS`); call it from
`contractProblems` for PostToolUse JSON. Add the two registrations to `hooks.json` (codebase_examples). Move the
CLAUDE.md bullet (codebase_examples). Run the coexistence suite until tests 1-8 pass, then `hook-inventory.test.cjs`,
the injection hook's own tests and the e2e file. Commit `feat(73-06): ...`.
  </action>
  <verify>node --test plugins/aoforge/hooks/hook-coexistence.test.js plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs plugins/aoforge/hooks/inject-handoff-results.test.js plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs exits 0</verify>
  <done>The hook is registered on PostToolUse `*` and Stop (timeout 150), covered by the coexistence matrix in both events, validated by a cited PostToolUse model, and documented as registered in CLAUDE.md.</done>
  <recovery>If another hook's PostToolUse output (gh-flush) fails the new model, read the cited rule again; if the rule is right, gh-flush has a latent schema bug: fix it in a separate commit with its own test, and record it in the SUMMARY as a deviation.</recovery>
</task>

<task type="auto">
  <name>Task 3: The full-suite gate and the runtime smoke</name>
  <files>plugins/aoforge/hooks/hooks.json</files>
  <action>
Smoke the registered hook the way Claude Code runs it: pipe a hand-written PostToolUse payload
(`{"session_id":"smoke","hook_event_name":"PostToolUse","cwd":"<tmp project>","tool_name":"Bash","tool_input":{"command":"ls"}}`)
into `node plugins/aoforge/hooks/inject-handoff-results.js` in a temp project holding one done record addressed to
`smoke`, and confirm the JSON on stdout; then the same with a Stop payload. Confirm `hooks.json` still parses and that
`node scripts/gen-docs-data.cjs` (run into a temp copy, or with its output discarded with `git checkout -- site/data`)
reports the hook as registered on both events, without committing generated data (73-08 does that). Run the full suite
and record the delta against the baseline. If the smoke finds nothing to change, this task makes no commit.
  </action>
  <verify>both smokes print the expected JSON; npm test (or the STACK.md glob) shows no new failures</verify>
  <done>The registered command works outside the test harness; the full suite is green apart from known transients.</done>
  <recovery>If `gen-docs-data.cjs` writes into `site/data/aoforge.json` directly, restore it with `git checkout -- site/data/aoforge.json` after reading the output; 73-08 owns that file.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/aoforge/hooks/hook-coexistence.test.js plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs   (scoped)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available</lint>
<build>not_available</build>
</validation_gates>

<verification>
- `rg -n "inject-handoff-results" plugins/aoforge/hooks/hooks.json` shows exactly two registrations.
- `rg -n "inject-handoff-results.js@" plugins/aoforge/hooks/hook-coexistence.test.js` shows both RUNS entries.
- `rg -n "postToolUseProblems" plugins/aoforge/hooks/__fixtures__/hook-output-schema.js plugins/aoforge/hooks/hook-coexistence.test.js` shows the model and its use.
- In CLAUDE.md, `inject-handoff-results.js` is no longer under `**Draft (not registered`.
</verification>

<success_criteria>
- SC-2: registered, delivering (73-04's tests plus the smoke), and in the coexistence suite.
- No CI guard (coexistence table, hook inventory) is weakened to get there.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-06-SUMMARY.md` (through
`aof-tools summary post`) with the TDD evidence table and the reference check date.
</output>
