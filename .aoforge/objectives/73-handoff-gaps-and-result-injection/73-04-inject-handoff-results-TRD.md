---
objective: 73-handoff-gaps-and-result-injection
trd: "04"
type: standard
wave: 2
depends_on: ["73-02"]
files_modified:
  - plugins/aoforge/hooks/inject-handoff-results.js
  - plugins/aoforge/hooks/inject-handoff-results.test.js
  - plugins/aoforge/hooks/gate-interactive.js
  - plugins/aoforge/hooks/gate-interactive.test.js
autonomous: true
requirements: [HND-02]
must_haves:
  truths:
    - "On PostToolUse the hook delivers each fresh completed handoff addressed to the payload (same session, same agent) as `{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"## Deferred command results ...\"}}` and marks it `consumed_by: 'inject-handoff-results@PostToolUse'`; records addressed to another session or agent are left untouched"
    - "On Stop with an addressed completed handoff, the hook prints exactly `{\"decision\":\"block\",\"reason\":\"...\"}` carrying the rendered results and an instruction to continue the deferred work; `stopFamilyProblems('Stop', out)` returns []"
    - "Stop wait: with no addressed result yet, a pending handoff addressed to this session's main loop (created in the last 15 minutes), `stop_hook_active` false, and the AOForge daemon live and watching this project, the hook polls every 250 ms (never busy-spins) for up to `AOFORGE_HANDOFF_STOP_WAIT_MS` (default 120000, `0` disables) and blocks with the result the moment it lands; if the wait runs out it exits 0 silently"
    - "With `stop_hook_active: true` the hook never waits; it still delivers results that are already complete"
    - "The hook exits 0 with no output for: no `.aoforge-handoff/`, empty or malformed stdin, `null`, an array or a string payload, an event other than PostToolUse or Stop, `AOFORGE_SKIP_HANDOFF_INJECT=1`, `AOFORGE_SKIP_HANDOFF_RESULTS=1`"
    - "Two copies of the hook running at once over one record deliver it once between them"
    - "gate-interactive writes `session_id` and `agent_id` (null for the main loop) from the PreToolUse payload into the pending record, and the done record carries them"
    - "gate-interactive's daemon-live deny reason tells Claude the command waits in the user's aoforge-watch terminal, that its result is delivered automatically after the next tool call or when the turn ends, to tell the user in one line where the command is waiting, and not to ask for a paste or retry; the daemon-absent reason is unchanged"
  artifacts:
    - path: plugins/aoforge/hooks/inject-handoff-results.js
      provides: "PostToolUse and Stop delivery of handoff results through handoff-results.cjs, with a bounded Stop wait"
      exports: ["STOP_WAIT_DEFAULT_MS", "PENDING_MAX_AGE_MS", "POLL_MS", "stopWaitMs", "decide", "main"]
    - path: plugins/aoforge/hooks/inject-handoff-results.test.js
      provides: "spawned-hook tests for both events, the wait, addressing, races and degraded input"
    - path: plugins/aoforge/hooks/gate-interactive.js
      provides: "pending records carry session_id/agent_id; daemon-live wording names the delivery points"
  key_links:
    - from: "inject-handoff-results.js"
      to: "handoff-results.cjs takeResults / pendingAddressedTo / watcherWatching"
      via: "require('../aoforge/bin/lib/handoff-results.cjs')"
      pattern: "handoff-results\\.cjs"
    - from: "gate-interactive.js writePendingRecord"
      to: "handoff-results.cjs isAddressedTo"
      via: "record.session_id / record.agent_id copied from the PreToolUse payload"
      pattern: "session_id"
---

# TRD 73-04: inject-handoff-results.js delivers results mid-turn and at the end of a turn

<objective>
`route-results.js` delivers a finished handoff only when the user types their next prompt. Claude is told "the daemon
will inject the result into your next turn", so in practice Claude either keeps working without the result or ends its
turn and waits for the user to type something. That is the last manual step between a TTY command and its result.

Complete the DRAFT `inject-handoff-results.js` (HND-02 allows "completed ... or replaced"; it is completed, rewritten on
73-02's library) to deliver at the two points where Claude can act on a result without the user:

- **PostToolUse** (every tool): the result enters context as `additionalContext` right after Claude's next tool call.
- **Stop** (main loop): if a result is ready, block the stop with the result as the reason, so Claude continues. If a
  handoff this turn queued is still running in the user's aoforge-watch terminal, wait a bounded time for it first.

Addressing and the O_EXCL claim from 73-02 keep a subagent from taking the main loop's result and keep two hook copies
from delivering it twice. route-results stays the catch-all on the next prompt. gate-interactive records the session
and agent on each pending record and tells Claude the truth about where the command runs and how the result returns.

Registration in `hooks.json`, the coexistence suite and the PostToolUse schema model are 73-06.
Purpose: HND-02. Output: the completed hook, its tests, gate-interactive's record fields and wording.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures, no property-based libraries, no
`.feature` files.

Read 73-02's SUMMARY first (`73-02-SUMMARY.md`): the library's exports and the address rule as built.

Read narrowly:
- `plugins/aoforge/hooks/inject-handoff-results.js` (170 lines, the DRAFT; it is replaced) and its test file (the old
  tests go; keep any still-true behaviour test).
- `plugins/aoforge/aoforge/bin/lib/handoff-results.cjs` (73-02): `takeResults`, `pendingAddressedTo`,
  `watcherWatching`, `renderResults`, `MAX_RENDER_CHARS`.
- `plugins/aoforge/aoforge/bin/lib/__fixtures__/handoff-fixtures.cjs` (73-02): builders to reuse.
- `plugins/aoforge/hooks/__fixtures__/hook-output-schema.js`: `stopFamilyProblems` (cite it in the Stop shape test).
- `plugins/aoforge/hooks/gate-executor-stop.js` and `auto-continue.js`: house style for a Stop hook that blocks at the
  top level (`process.stdout.write(JSON.stringify({ decision: 'block', reason }))`) and honours `stop_hook_active`.
- `plugins/aoforge/hooks/gate-interactive.js`: `readStdin` 175, `writePendingRecord` 224-245, `deny` 247,
  `buildDenyReason` 259-278, `main` 280-305, exports 308. Tests: `runHook` 152, daemon-aware group 214, PTY messaging
  group 403.
- `plugins/aoforge/hooks/route-results.js` lines 1-45 (header style, `aliasLegacyEnv` guard).
</context>

## Test list

Outermost first: the spawned hook with a hand-built project, pid file and payload (`HOME` and
`AOFORGE_HANDOFF_PID_FILE` pointed into the temp dir, so the real `~/.aoforge` is never read).

**inject-handoff-results.js, PostToolUse:**
1. Main-loop payload (`session_id: 's-fixture'`, no `agent_id`), one addressed done record -> stdout parses to
   `{ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } }` (no other keys); the context contains
   `## Deferred command results`, the id and the stdout; the record is `consumed: true`,
   `consumed_by: 'inject-handoff-results@PostToolUse'`; `done/<id>.claim` exists.
2. A record for `session_id: 'other'` -> no output; the record is unchanged and has no claim.
3. Subagent payload `agent_id: 'a1'`: a main-loop record -> no output; a record with `agent_id: 'a1'` -> delivered.
4. A CLI record (no `session_id`, `output: 'logged in\n'`, no stdout) -> delivered to a main-loop payload, `logged in`
   rendered.
5. Two copies spawned together over one record -> exactly one prints it.
6. Three addressed records with 4,000-character stdout -> one `additionalContext` under 10,000 characters.

**inject-handoff-results.js, Stop:**
7. An addressed done record -> stdout keys are exactly `['decision', 'reason']`, `decision: 'block'`, the reason holds
   the rendered results and the word `continue`; `stopFamilyProblems('Stop', out)` deep-equals `[]`.
8. Nothing done, nothing pending -> no output, exits in under 1 s.
9. Wait succeeds: an addressed pending record (`created_at` now), a pid file `{ pid: process.pid, watching: [root] }`,
   `AOFORGE_HANDOFF_STOP_WAIT_MS=4000`; the test writes the done record (and removes the pending file, as the daemon
   does) 400 ms after spawning the hook -> the hook blocks with that record, elapsed between 400 and 4000 ms.
10. Wait gives up: same with `AOFORGE_HANDOFF_STOP_WAIT_MS=600` and no done record -> no output, elapsed >= 600 ms and
    < 3000 ms.
11. `stop_hook_active: true` with the same pending record and live pid file -> no output in under 500 ms.
12. No wait when: the daemon watches another root; the pid is dead; the pid file is legacy; the pending record is for
    another session; the pending record is older than 15 minutes; `AOFORGE_HANDOFF_STOP_WAIT_MS=0`. Each exits in under
    500 ms with no output.

**inject-handoff-results.js, every event:**
13. `AOFORGE_SKIP_HANDOFF_INJECT=1` and, separately, `AOFORGE_SKIP_HANDOFF_RESULTS=1` -> no output, record untouched.
14. Stdin `''`, `'{bad'`, `'null'`, `'[]'`, `'"s"'`, a payload whose `cwd` does not exist, and
    `hook_event_name: 'UserPromptSubmit'` -> exit 0, no output.

**gate-interactive.js, spawned:**
15. A main-loop PreToolUse payload for `npm login` -> the pending record has `session_id` from the payload and
    `agent_id: null`; a subagent payload (`agent_id: 'a1'`, `agent_type: 'aoforge:executor'`) -> `agent_id: 'a1'`.
16. Daemon live (pid file with `process.pid`) -> the deny reason contains `aoforge-watch terminal`,
    `after your next tool call` and `when you end your turn`, keeps `Do NOT` for paste and retry, and no longer says
    `into your next turn automatically`.
17. Daemon absent -> the reason is byte-identical to today's (the existing tests pass).

<embedded_context>

<codebase_examples>
The house Stop block (`gate-executor-stop.js` ~490):
```js
      // TOP-LEVEL shape — the verified SubagentStop form. Not hookSpecificOutput.
      process.stdout.write(JSON.stringify({ decision: 'block', reason: d.reason }));
```
The legacy-env guard every hook starts with (`route-results.js` 47-48):
```js
try { require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
```
Shape of the hook (pseudocode; keep the decision pure and testable):
```js
// decide(payload, { env, now, lib }) -> { kind: 'context'|'block'|'wait'|'silent', ... }
// main():
//   if env skip -> return
//   payload = parse stdin; if not a plain object -> return
//   event = payload.hook_event_name
//   cwd = payload.cwd if it is an existing directory, else process.cwd()
//   if event === 'PostToolUse':
//     r = lib.takeResults({ cwd, payload, mode: 'addressed', by: 'inject-handoff-results@PostToolUse' })
//     if r: print { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: r.text } }
//   else if event === 'Stop':
//     main-loop payload (Stop never has agent_id)
//     r = take(...); if r -> block(r)
//     if payload.stop_hook_active || waitMs === 0 -> return
//     handoffDir = lib.findHandoffDir(cwd); root = dirname(handoffDir)
//     if no lib.pendingAddressedTo(handoffDir, payload, { maxAgeMs: 15 min }) -> return
//     if !lib.watcherWatching(root) -> return
//     until deadline: await sleep(250); r = take(...); if r -> block(r)
//                     if no addressed pending remains and nothing was delivered -> return
// block(r): print { decision: 'block', reason: 'Handoff results arrived ... continue the work that was waiting on them.\n\n' + r.text }
```
gate-interactive's record today (`writePendingRecord` 224-245): `{ id, cmd, cwd, reason, source: 'hook', shell,
timeout_ms, created_at, status }`. Add `session_id: payload.session_id || null` and
`agent_id: payload.agent_id || null` (pass them through `opts` from `main`). `watcher-state.makeDoneRecord` spreads the
pending record, so the done record carries both with no change there.

The daemon-live reason today (`buildDenyReason` 259-266) says "the daemon will run it via a real PTY and inject the
result into your next turn automatically". New text, in substance: queued to the aoforge-watch PTY daemon (pid N); if
it prompts, the user answers in their aoforge-watch terminal; tell the user in one line that `<cmd>` is waiting there;
the result is delivered into your context automatically after your next tool call, or when you end your turn (the
Stop hook waits briefly for it); do NOT ask the user to paste anything; do NOT retry the Bash tool; the handoff id and
record path; the escape hatch. Keep it one paragraph.
</codebase_examples>

<anti_patterns>
- Do not register the hook in `hooks.json` here. Registration without a coexistence RUNS entry fails
  `hook-coexistence.test.js` test 9, and without moving its CLAUDE.md bullet out of the Draft group fails
  `hook-inventory.test.cjs` test 3; 73-06 does all three together.
- Do not deliver on UserPromptSubmit; route-results owns that event, and two deliverers on one event is what the claim
  exists to make harmless, not a design to rely on.
- Do not wait on SubagentStop, on a legacy daemon, on a daemon that does not watch this project, or when
  `stop_hook_active` is true. The wait is for one case: this turn queued a command the user is answering right now.
- Do not use `hookSpecificOutput.decision` (the pre-70 bug). Stop's decision and reason are top-level.
- Do not busy-wait. `await new Promise((r) => setTimeout(r, POLL_MS))`.
- Do not read the pending record's `inputs` or print any value from the environment.
</anti_patterns>

<error_recovery>
- The wait test is flaky on a loaded machine: widen only the upper bound (keep the lower bound at the 400 ms the test
  waited before writing), and spawn the hook with `spawn` + a promise, never `spawnSync` (which would block the test's
  own timer that writes the done record).
- Test 5 shows two emitters: the hook is calling something other than `takeResults`, or marking before claiming.
- gate-interactive's existing tests that snapshot the daemon-live text fail: update them to the new wording; the
  daemon-absent snapshots must not change.
</error_recovery>

</embedded_context>

<gotchas>
- 73-06 registers the Stop command with `"timeout": 150` (seconds). The default wait (120 s) plus the time to render
  must stay under it; export `STOP_WAIT_DEFAULT_MS` so 73-06's test can pin the relation.
- Stop payloads carry `cwd`; a hook process's own cwd is the project too, but prefer the payload's when it exists.
- Claude Code runs every Stop hook at once and composes them; `auto-continue.js` may also block. Both reasons are kept
  (the composition model in `__fixtures__/hook-runner.js` says so), so nothing here needs to coordinate with it.
- PostToolUse fires on every tool call, so the no-handoff path must stay cheap: one walk up for `.aoforge-handoff/`
  and return.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED, the hook's test list on the fixtures</name>
  <files>plugins/aoforge/hooks/inject-handoff-results.test.js</files>
  <action>
Replace the DRAFT's test file with test list items 1-14, built on `handoff-fixtures.cjs` (73-02). Spawn the hook
asynchronously with an env holding a temp `HOME`, `AOFORGE_HANDOFF_PID_FILE` and the wait setting each test needs.
Import `stopFamilyProblems` from `./__fixtures__/hook-output-schema.js` for item 7. Run it against the DRAFT: most
items fail (it reads `output` only, never reads the payload, has no Stop branch, no claim, no address). Commit the
tests alone (`test(73-04): ...`).
  </action>
  <verify>node --test plugins/aoforge/hooks/inject-handoff-results.test.js exits non-zero, failing on the DRAFT's missing behaviours</verify>
  <done>The hook's behaviour is pinned by tests that fail against the DRAFT; RED output captured.</done>
  <recovery>If a fixture builder is missing something the hook tests need (for example a pending record with `created_at` in the past), extend the call site with overrides rather than editing 73-02's builder file, which this TRD does not own.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN, the hook rewritten on the library</name>
  <files>plugins/aoforge/hooks/inject-handoff-results.js</files>
  <action>
Rewrite `inject-handoff-results.js` per the pseudocode: legacy-env guard, async `main`, a pure `decide` for the
non-waiting branches, `takeResults` with `mode: 'addressed'`, the Stop block and the bounded wait
(`STOP_WAIT_DEFAULT_MS = 120000`, `PENDING_MAX_AGE_MS = 15 * 60 * 1000`, `POLL_MS = 250`,
`stopWaitMs(env)` reading `AOFORGE_HANDOFF_STOP_WAIT_MS`, where a non-number falls back to the default and `0`
disables). Replace the DRAFT header with an accurate one: events (PostToolUse `*`, Stop), the address rule, the
wait and its conditions, both escape hatches, "route-results is the catch-all on UserPromptSubmit", and "registered
in hooks.json by 73-06". Never throw: wrap `main` so any error exits 0 silently. Make items 1-14 pass one at a time.
Commit `feat(73-04): ...`.
  </action>
  <verify>node --test plugins/aoforge/hooks/inject-handoff-results.test.js plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs exits 0</verify>
  <done>Both events deliver addressed results once; the wait blocks with a result or gives up silently within its bound; degraded inputs and escape hatches are silent; no DRAFT marker remains (`rg -n DRAFT plugins/aoforge/hooks/inject-handoff-results.js` finds nothing).</done>
  <recovery>If the Stop output fails `stopFamilyProblems`, print only `{ decision, reason }`; any extra top-level key is a schema error that Claude Code shows as a hook error.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: gate-interactive records the address and tells Claude how the result returns</name>
  <files>plugins/aoforge/hooks/gate-interactive.js, plugins/aoforge/hooks/gate-interactive.test.js</files>
  <action>
Write test list items 15-17 first and run them RED (no `session_id`/`agent_id`; the old "next turn" wording). Then pass
the payload's `session_id` and `agent_id` into `writePendingRecord` and rewrite the daemon-live branch of
`buildDenyReason` (codebase_examples). Leave detection, patterns, the daemon-absent text, the escape hatch and the
exported names unchanged. Update the header comment's Approach B paragraph to match (aoforge-watch terminal, delivery
after the next tool call or at the end of the turn, route-results on the next prompt). Run the hook's tests, the
coexistence suite (gate-interactive's RUNS entry normalizes the id and still denies) and the e2e file. Commit
`feat(73-04): ...`.
  </action>
  <verify>node --test plugins/aoforge/hooks/gate-interactive.test.js plugins/aoforge/hooks/hook-coexistence.test.js plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs exits 0</verify>
  <done>Pending records carry the address; the daemon-live wording names the aoforge-watch terminal and both delivery points; daemon-absent behaviour unchanged; coexistence and e2e still green.</done>
  <recovery>If the coexistence gate-interactive entry fails test 10 (solo vs paired output), the new wording contains run-dependent text (a pid): extend that RUNS entry's `normalize` in 73-06, not here; for now confirm the solo and paired runs share the same world settings, and note it for 73-06.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/aoforge/hooks/inject-handoff-results.test.js plugins/aoforge/hooks/gate-interactive.test.js   (scoped)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available</lint>
<build>not_available</build>
</validation_gates>

<verification>
- `rg -n "handoff-results\.cjs" plugins/aoforge/hooks/inject-handoff-results.js` finds the require; `rg -n "decision: 'block'" plugins/aoforge/hooks/inject-handoff-results.js` the top-level block.
- `rg -n "session_id" plugins/aoforge/hooks/gate-interactive.js` finds the record field.
- `rg -n "inject-handoff-results" plugins/aoforge/hooks/hooks.json` finds nothing yet (73-06 registers it).
- Full suite: no new failures.
</verification>

<success_criteria>
- A finished handoff reaches Claude after its next tool call, or holds its stop until the result arrives, with no
  user prompt and no paste.
- Each result reaches the context that queued it, once.
- gate-interactive's guidance matches what the system now does.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-04-SUMMARY.md` (through
`aof-tools summary post`) with the TDD evidence table.
</output>
