---
objective: 63-todo-store-hook-coexistence-and-built-in-inventory
trd: "05"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/__fixtures__/hook-runner.js
  - plugins/devflow/hooks/__fixtures__/coexistence-fixtures.js
  - plugins/devflow/hooks/hook-coexistence.test.js
  - plugins/devflow/hooks/route-intent.js
  - plugins/devflow/hooks/changelog-on-tag.js
  - plugins/devflow/hooks/gate-interactive.js
  - plugins/devflow/hooks/gate-edits.js
  - plugins/devflow/hooks/guard-no-progress.js
autonomous: true
requirements: [BLTN-05]
must_haves:
  truths:
    - "For every hook registered in hooks.json, running it alongside a user-level hook on the same event (one that adds context, allows, denies or blocks, prints plain text, exits 1, exits 2, prints malformed JSON, is slow, or never reads stdin) leaves the DevFlow hook's own exit code and output identical to running it alone"
    - "Composed under Claude Code's documented rules (all matching hooks run in parallel; deny > defer > ask > allow; any block blocks; exit 2 blocks; other non-zero exits and unparseable JSON are non-blocking errors), the result keeps both hooks' contributions, and a DevFlow deny/block is never lifted by a user allow, nor a user deny/block by DevFlow"
    - "Every DevFlow hook exits 0 and prints nothing, or exactly one JSON object whose hookSpecificOutput.hookEventName matches the event, with no `continue` or `stopReason` key and every string under 10,000 characters; plain text only on SessionStart, UserPromptSubmit and UserPromptExpansion"
    - "Every DevFlow hook script degrades gracefully on bad input (empty stdin, malformed JSON, `null`, an array, a string, a payload whose cwd does not exist): exit 0 and no output or one valid JSON object. The five scripts that crashed on a `null` payload (route-intent, changelog-on-tag, gate-interactive, gate-edits, guard-no-progress) are fixed"
    - "Two copies of the same DevFlow hook firing at once (a leftover user-level copy of a DevFlow hook) both exit 0 with valid output, and any state file they share still parses afterwards"
    - "A hook registered in hooks.json with no entry in the suite's table fails the suite, so the next hook (63-03's todo-sync) must add one"
  artifacts:
    - path: plugins/devflow/hooks/__fixtures__/hook-runner.js
      provides: "runParallel (spawns handlers concurrently on one stdin payload), classifyOutput and composeEvent (Claude Code's documented composition rules, cited)"
    - path: plugins/devflow/hooks/__fixtures__/coexistence-fixtures.js
      provides: "template DevFlow world, hermetic hook env, per-event payload builders, USER_HOOKS stub sources and writeUserHooks"
    - path: plugins/devflow/hooks/hook-coexistence.test.js
      provides: "BLTN-05: the model's own tests, then the coexistence matrix over every registered hook"
  key_links:
    - "hook-coexistence.test.js reads plugins/devflow/hooks/hooks.json, as planning-writes.audit.test.js does, so a new registration without a RUNS entry fails"
    - "Composition rules cite https://code.claude.com/docs/en/hooks: 'All matching hooks run in parallel', the Exit code output section, the JSON output section, 'precedence is deny > defer > ask > allow' (PreToolUse), Stop decision control"
---

# TRD 63-05: Hook coexistence harness and suite (BLTN-05)

<objective>
Show, in CI, that DevFlow's hooks coexist with a user's own hooks on the same events: they degrade gracefully, their
output composes, and errors stay isolated.

Claude Code runs every matching hook for an event in parallel (plugin hooks and `~/.claude/settings.json` hooks alike;
"A plugin's or skill's copy of the same handler stays separate") and then combines the results by documented rules.
This machine already has one: a user-level `PreToolUse` (`Bash`) hook, `~/.claude/hooks/guard-kube-context.py`, fires
beside DevFlow's four Bash gates and `guard-no-progress`.

There is no way to run Claude Code's own hook runner in a unit test, so the suite has two halves:
1. A small, cited **model** of the documented composition (`hook-runner.js`), tested on its own.
2. A **matrix**: every registered DevFlow hook, run solo and then in parallel with each of nine user-hook stubs, through
   the model. The DevFlow side must be independent of the user side, well formed, and never override the user's
   decision. Plus degraded input and duplicate-copy runs.

A pre-check during planning already found five scripts that exit 1 with a TypeError when stdin is the JSON `null`
(`route-intent.js:422`, `changelog-on-tag.js:201`, `gate-interactive.js:283`, `gate-edits.js:453`,
`guard-no-progress.js:79`). Exit 1 is a non-blocking hook error in Claude Code (a `hook error` notice in the
transcript). This TRD fixes them.

Purpose: SC2. Output: the model, the fixtures, the suite, five one-line guards.
</objective>

<file_tree>
plugins/devflow/hooks/
├── hook-coexistence.test.js                    ← CREATE
├── __fixtures__/
│   ├── hook-runner.js                          ← CREATE
│   └── coexistence-fixtures.js                 ← CREATE
├── route-intent.js                             ← MODIFY (non-object payload guard)
├── changelog-on-tag.js                         ← MODIFY (same)
├── gate-interactive.js                         ← MODIFY (same)
├── gate-edits.js                               ← MODIFY (same)
└── guard-no-progress.js                        ← MODIFY (same)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Nothing touches the real `~/.claude`: every run gets a temp HOME, TMPDIR and every DevFlow store override
  (`DEVFLOW_HOOK_MARKER_DIR`, `DEVFLOW_PROGRESS_GUARD_DIR`, `DEVFLOW_AWARENESS_DIR`, `DEVFLOW_AUDIT_LOG_PATH`,
  `DEVFLOW_HANDOFF_PID_FILE`, `DEVFLOW_OUTBOX_DIR`), as planning-writes.audit.test.js's `hookEnv` does. Also set
  `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1` and `DEVFLOW_SKIP_PRUNE=1`: those are detached side jobs of upgrade-project with
  nothing to compose, and they would outlive the test. Set no other `DEVFLOW_SKIP_*`.
- The user-hook stubs are hand-written Node scripts (string constants in the fixture, written to the temp world).
  Do not copy or run the user's real `guard-kube-context.py`.
- Hook fixes are minimal: a guard that returns (exit 0, no output) when the parsed payload is not a plain object. No
  other behaviour change; each hook's own test file must stay green.
- Keep the suite's wall time under 60 s on this machine (measure it; use `describe(..., { concurrency: 4 })`).
- One plain command per Bash call. Never use port 8080.

<embedded_context>

<research_context>
Claude Code hooks reference (https://code.claude.com/docs/en/hooks, fetched 2026-10-06, v2.1.292), the rules the model encodes:

- "All matching hooks run in parallel. If you define the same handler in more than one settings file, it runs once.
  A plugin's or skill's copy of the same handler stays separate."
- Exit 0: stdout is parsed as JSON when, ignoring surrounding whitespace, it "Starts with `{` and ends with `}`".
  "When the output is two or more lines that each parse as JSON on their own, and no line is a JSON output object that
  sets a field, Claude Code treats the whole output as plain text. When one of those lines does set a field, the whole
  output is a parse failure." Starts with `{` but does not end with `}`, or starts with anything else: plain text.
  Plain-text stdout becomes context only on `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart`, `PostModelSwitch`.
  For standard-decision events, unparseable JSON is a non-blocking error ("`<hook name> hook error`") on any code but 2.
- Exit 2: a blocking error on events that can block; "even a JSON `permissionDecision` of `"allow"` can't override it".
  The reason is the JSON blocking reason if any, else stderr.
- Other codes: valid JSON decides alone; otherwise a non-blocking error, the action proceeds.
- Timeout: the hook is cancelled and its output discarded (on most events no decision).
- PreToolUse: "When multiple PreToolUse hooks return different decisions, precedence is `deny` > `defer` > `ask` > `allow`."
- Stop/SubagentStop: `decision: "block"` prevents stopping; `hookSpecificOutput.additionalContext` continues with feedback.
- Universal fields: `continue` ("If `false`, Claude stops processing entirely after the hook runs. Takes precedence over
  any event-specific decision fields"), `stopReason`, `suppressOutput`, `systemMessage`, `terminalSequence`.
  `additionalContext`, `systemMessage` and plain stdout are capped at 10,000 characters each.
- `hookSpecificOutput` "requires a `hookEventName` field set to the event name".
</research_context>

<codebase_examples>
DevFlow hook outputs today (no hook uses `continue`, `stopReason` or exit 2):
```js
// gate-commits.js / changelog-on-tag.js / gate-interactive.js / gate-edits.js / gate-skill-requires.js (PreToolUse)
{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
// guard-no-progress.js: permissionDecision 'ask'; gate-edits.js: 'ask' in warn mode
// auto-continue.js, verify-completion.js, gate-executor-stop.js (Stop/SubagentStop)
process.stdout.write(JSON.stringify({ decision: 'block', reason }));
// gate-skill-requires.js (UserPromptExpansion): { decision: 'block', reason }
// gh-flush.js: Stop -> { systemMessage }, PostToolUse -> { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } }
```
The crash being fixed (route-intent.js:422 and the four like it):
```js
const input = JSON.parse(raw);          // 'null' parses to null
const prompt = (input.prompt || '');    // TypeError: Cannot read properties of null
```
The guard (add right after the parse, in each of the five):
```js
if (!input || typeof input !== 'object' || Array.isArray(input)) return;   // or process.exit(0) where main is not a function
```
World and payload precedent to mirror (copy, do not import from the audit test file):
`planning-writes.audit.test.js` `ensureTemplate()` (temp git repo, `.planning/config.json` stamped with the plugin
version so upgrade-project takes its fast path, an old commit date), `makeWorld(opts)` (cpSync the template plus a
fresh home), `hookEnv(world)`, `envelope(event, ctx, extra)`, and its `RUNS` table's payloads that reach each hook's
decision branch (raw `git commit` for gate-commits, `git tag -a v9.9.9` for changelog-on-tag, `npm login` for
gate-interactive, an ambient Edit of `src/x.js` for gate-edits and `sed -i` for gate-bash-writes, the live skill
marker + announcement for auto-continue, autonomous mid-execution for verify-completion and verify-commits, the
executor transcript for gate-executor-stop, `build a login page for the app` for route-intent, the notices world for
route-results, `/devflow:gh-sync` for gate-skill-requires, a repeated Read for guard-no-progress, a df-tools commit
PostToolUse and a Stop for gh-flush). awareness-cache-populate is called in-process with a stubbed spawn:
```js
const hook = require(path.join(HOOKS_DIR, 'awareness-cache-populate.js'));
hook._main({ cwd: ctx.cwd, env: hookEnv(ctx.world), _spawn: (cmd, args) => { spawned.push({ cmd, args }); return { unref() {} }; } });
```
</codebase_examples>

<anti_patterns>
- Do not compare DevFlow output across runs that share mutable state (guard-no-progress counts repeats per session;
  route-intent writes `.edit-override`; gate-edits consumes it). Solo and every paired run each get a fresh world
  copy and the same payload; only the duplicate-copy scenario shares a world on purpose.
- Do not let the runner wait forever on a stub that never reads stdin: handle `EPIPE` on the child's stdin and bound
  every handler with a timeout (SIGKILL).
- Do not make the model more permissive than the docs (for example treating exit 1 as blocking). The model is the
  documented contract; if Claude Code changes, the doc citation is what gets updated.
- statusline.js is not a hook event (plugin.json `statusLine`) and is out of this suite.
</anti_patterns>

<error_recovery>
- A hook whose output differs between its solo and paired runs: first check for time- or path-dependent text (a
  timestamp, the temp dir). If so, give its RUNS entry a `normalize(stdout)` function and say why in a comment. If it
  really depends on the co-running hook, that is a coexistence bug: fix the hook (Rule 1) and record it in the SUMMARY.
- sync-runtime's first run in a fresh HOME mirrors 14 MB of runtime: mark its entry `sharedHome: true, warmup: true`
  (one unscored warm-up run, then solo and paired runs on the warm HOME hit the fast path).
- A degraded-input failure in a hook other than the five listed: apply the same guard and list it in the SUMMARY
  under Deviations (Rule 1).
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/hooks/hooks.json
@plugins/devflow/hooks/planning-writes.audit.test.js
@plugins/devflow/hooks/__fixtures__/stop-fixtures.js
@plugins/devflow/hooks/__fixtures__/gate-fixtures.js
</context>

## Test list

Model first (pure, no spawn), then the matrix over the real hooks.

Model (`classifyOutput`, `composeEvent`):
1. exit 0 + `{"systemMessage":"a"}` → ok with json; exit 0 + `plain` → text; exit 0 + `{not json}` → non-blocking
   error (parse); exit 0 + `{"a":1}\n{"b":2}` (two JSON lines, no known field) → text; with a known field on one line →
   parse error; exit 0 + `{"x": 1` (no closing brace) → text.
2. exit 2 + stderr `no` → blocking with reason `no`; exit 2 + JSON `permissionDecision: allow` → still blocking.
3. exit 1 + empty stdout → non-blocking error; exit 1 + valid JSON deny → the JSON decides (deny), not an error.
4. timed out → output discarded, no decision.
5. PreToolUse precedence: allow+deny → deny; ask+allow → ask; defer+ask → defer; deny+exit2 → blocked.
6. Stop: one `decision: block` among silent hooks → blocked, reasons collected; `continue: false` anywhere → continue false.
7. additionalContext and systemMessage from several hooks are all kept, in handler order; plain text kept only on
   SessionStart/UserPromptSubmit/UserPromptExpansion.
8. `runParallel` starts handlers concurrently (two 300 ms sleepers finish in well under 600 ms), feeds each the same
   stdin, survives a child that never reads stdin, and kills one past its timeout.

Matrix (every `{script, event}` registration in hooks.json, each with its RUNS payload):
9.  Table completeness: every registration has a RUNS entry, and every RUNS entry is a registration.
10. Independence: for each of the nine user stubs, the DevFlow hook's exit code and (normalized) stdout in the paired
    run equal its solo run.
11. Composition: the composed result keeps every DevFlow contribution (its decision, permissionDecision,
    additionalContext, systemMessage) unless a documented precedence supersedes it, and the user stub's contribution
    too; a DevFlow deny/block stays deny/block beside `user-allow`; `user-deny` and `user-exit2` stay deny/block beside
    any DevFlow output; `user-fail`, `user-garbage`, `user-slow` and `user-no-stdin` add at most a non-blocking error
    entry and never remove DevFlow's contribution.
12. Output contract on every DevFlow run in the matrix: exit 0; stdout empty, or one JSON object (whole-string parse)
    with top-level keys within `systemMessage, decision, reason, hookSpecificOutput, suppressOutput`,
    `hookSpecificOutput.hookEventName === event`, every string field shorter than 10,000 characters; plain text only on
    SessionStart, UserPromptSubmit, UserPromptExpansion.
13. Degraded input, per script that reads stdin: `''`, `'{bad json'`, `'null'`, `'[]'`, `'"str"'`, and
    `{hook_event_name: <event>, cwd: '/nonexistent/x'}` → exit 0 and output valid per 12. (RED on the five today.)
14. Duplicate copy: the same hook twice at once in one shared world → both exit 0, both outputs valid per 12, and
    every JSON state file under the world's HOME store dirs still parses.

<tasks>

<task type="auto">
  <name>Task 1: Coexistence fixtures (world, payloads, user-hook stubs)</name>
  <files>plugins/devflow/hooks/__fixtures__/coexistence-fixtures.js</files>
  <action>
Hand-built, deterministic:
```
ensureTemplate() / makeWorld(opts) / disposeWorld(world)   // mirror the audit: temp git repo, src/x.js, .planning (and
                                                           // flutter/.planning) stamped with the plugin version;
                                                           // opts: skillActive, routeRecommendation, notices, editOverride, sharedHomeFrom
hookEnv(world)          // PATH, HOME, TMPDIR, CLAUDE_PLUGIN_ROOT and every store override, plus
                        // DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1, DEVFLOW_SKIP_PRUNE=1; nothing else inherited
envelope / sessionStart / stop / subagentStop / prompt / expansion / preTool / postTool   // payload builders
executorTranscript(world) // the executor transcript gate-executor-stop reads (as the audit builds it)
USER_HOOKS = { 'user-context', 'user-allow', 'user-deny', 'user-plain', 'user-fail', 'user-exit2',
               'user-garbage', 'user-slow', 'user-no-stdin' }   // name -> Node source string
writeUserHooks(dir) -> { name: absPath }
```
Stub behaviour (each reads stdin JSON except user-no-stdin, branches on `hook_event_name`):
- user-context: exit 0, `{systemMessage: 'user: <event>'}` plus `hookSpecificOutput: {hookEventName, additionalContext:
  'user context'}` on SessionStart, UserPromptSubmit, PostToolUse.
- user-allow: PreToolUse `permissionDecision: 'allow'`; silent elsewhere.
- user-deny (shaped like a kube-context guard): PreToolUse `deny` with a reason; Stop/SubagentStop and
  UserPromptSubmit/UserPromptExpansion `decision: 'block'`; silent elsewhere.
- user-plain: prints `user plain text`. user-fail: stderr `user hook failed`, exit 1. user-exit2: stderr
  `user hook blocked`, exit 2. user-garbage: prints `{not json}`. user-slow: waits 1500 ms, then user-context's output.
  user-no-stdin: exits 0 at once without reading stdin.
  </action>
  <verify>`node -e "const f=require('./plugins/devflow/hooks/__fixtures__/coexistence-fixtures.js'); const w=f.makeWorld(); console.log(Object.keys(f.writeUserHooks(w.base)).length); f.disposeWorld(w)"` prints `9`.</verify>
  <done>Fixtures build an isolated DevFlow world, its env and every payload the matrix needs, and write nine stub hooks.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: The composition model, hook-runner.js (RED then GREEN)</name>
  <files>plugins/devflow/hooks/hook-coexistence.test.js, plugins/devflow/hooks/__fixtures__/hook-runner.js</files>
  <action>
RED: model tests 1-8 in `hook-coexistence.test.js` (`describe('composition model', ...)`), committed failing.

GREEN, `hook-runner.js` (every rule carries a one-line comment quoting the doc sentence it implements):
```
CONTEXT_EVENTS = ['SessionStart', 'UserPromptSubmit', 'UserPromptExpansion', 'PostModelSwitch']
KNOWN_FIELDS = ['continue','stopReason','suppressOutput','systemMessage','terminalSequence','decision','reason','hookSpecificOutput']
classifyOutput(event, {code, stdout, stderr, timedOut}) ->
   {kind: 'ok'|'blocking'|'error'|'timeout', json, text, reason, error}
runParallel(handlers, payload, {cwd, env, timeoutMs = 10000}) -> Promise<[{name, code, stdout, stderr, timedOut, ms}]>
   // spawn every handler at once (process.execPath + script for .js stubs and DevFlow hooks); write
   // JSON.stringify(payload) to each stdin, then end; child.stdin.on('error', () => {}) for EPIPE;
   // in-process handlers {name, inProcess: async () => ({code, stdout, stderr})} run concurrently too
composeEvent(event, classified[]) ->
   {blocked, reasons, permissionDecision, additionalContext: [], systemMessages: [], context: [], continue, errors: []}
```
Commit RED and GREEN separately.
  </action>
  <verify>`node --test --test-name-pattern "composition model" plugins/devflow/hooks/hook-coexistence.test.js` passes.</verify>
  <done>The model encodes each cited rule, and tests 1-8 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: The coexistence matrix over every registered hook, and the five guards (RED then GREEN)</name>
  <files>plugins/devflow/hooks/hook-coexistence.test.js, plugins/devflow/hooks/route-intent.js, plugins/devflow/hooks/changelog-on-tag.js, plugins/devflow/hooks/gate-interactive.js, plugins/devflow/hooks/gate-edits.js, plugins/devflow/hooks/guard-no-progress.js</files>
  <action>
RED: in `hook-coexistence.test.js` add `registrations()` (read hooks.json; one `{script, event, matcher}` per
registration) and a `RUNS` table keyed `'<script>@<event>'` (gate-skill-requires and gh-flush have two events each):
`{ label, payload: (ctx) => payload, world?: opts, inProcess?: 'awareness-populate', sharedHome?, warmup?,
normalize?, readsStdin: true }`. Then tests 9-14. Run: expect test 13 to fail on exactly the five scripts named in the
objective (any other failure is a finding: investigate before going GREEN). Commit RED.

GREEN: add the non-object guard to the five scripts right after their `JSON.parse` of stdin (exit 0, no output),
keeping each script's existing structure. Re-run the suite and each touched hook's own test file. Commit GREEN
(`fix(63-05): ...`). If any other hook fails 10-14, fix it the same minimal way and list it in the SUMMARY.

Record in the SUMMARY: registrations covered, stubs, total runs, wall time, and every hook changed.
  </action>
  <verify>`node --test plugins/devflow/hooks/hook-coexistence.test.js` passes in under 60 s; `node --test plugins/devflow/hooks/route-intent.test.js plugins/devflow/hooks/changelog-on-tag.test.js plugins/devflow/hooks/gate-interactive.test.js plugins/devflow/hooks/gate-edits.test.js plugins/devflow/hooks/guard-no-progress.test.js plugins/devflow/hooks/planning-writes.audit.test.js` passes.</verify>
  <done>Tests 9-14 pass for every registered hook; the five scripts survive a `null` payload; no hook test regressed.</done>
  <recovery>If the suite is too slow, run the nine paired scenarios of one registration concurrently (`Promise.all`) and registrations with `concurrency: 4`; never drop a stub or a registration to save time.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/hooks/hook-coexistence.test.js</test>
<test>npm test</test>
</validation_gates>

<verification>
- `node --test plugins/devflow/hooks/hook-coexistence.test.js` green, wall time recorded.
- Test 9 fails when a registration is added to a copy of hooks.json without a RUNS entry (sensitivity check run by
  hand once and noted in the SUMMARY; the suite reads the real file).
- `npm test` shows no hook test regression.
</verification>

<success_criteria>
- BLTN-05 holds for every registered DevFlow hook against nine user-hook behaviours, under a cited model of Claude
  Code's composition, and the next hook cannot be registered without joining the suite.
</success_criteria>

<output>
After completion, create `.planning/objectives/63-todo-store-hook-coexistence-and-built-in-inventory/63-05-SUMMARY.md`
</output>
