---
objective: 73-handoff-gaps-and-result-injection
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/bin/lib/handoff-results.cjs
  - plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/handoff-fixtures.cjs
  - plugins/aoforge/hooks/route-results.js
  - plugins/aoforge/hooks/route-results.test.js
autonomous: true
requirements: [HND-02]
must_haves:
  truths:
    - "A completed handoff record is delivered at most once even when two hook processes read it at the same moment: delivery first claims the record by creating `done/<id>.claim` with O_EXCL, and a process that loses the claim renders nothing for that record"
    - "A record is addressed to a hook payload when it has no session_id (the main loop of any session), or when its session_id equals the payload's and its agent_id (absent = main loop) equals the payload's agent_id (absent = main loop)"
    - "route-results.js (UserPromptSubmit) stays the catch-all: it delivers every fresh, unconsumed, unclaimed record whatever its address, and its rendered text for done, failed, rejected, timeout and error records is unchanged"
    - "A record written by `aof-tools handoff complete` (an `output` field, no stdout) renders its output instead of `(no output captured)`"
    - "The whole rendered block stays under 9,000 characters; a record cut short names `node ~/.claude/aoforge/bin/aof-tools.cjs handoff get <id>`"
    - "pendingAddressedTo() lists fresh pending records addressed to a payload, and watcherWatching(root) is true only when the AOForge daemon's pid file is live, not legacy, and lists that project root"
    - "Two route-results processes started together over one record emit it once between them"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/handoff-results.cjs
      provides: "shared handoff-result delivery: find, select, address, claim, mark consumed, render; pending lookup; watcher check"
      exports: ["HANDOFF_DIR", "DEFAULT_TTL_MS", "MAX_OUTPUT_CHARS", "MAX_RENDER_CHARS", "findHandoffDir", "ttlMs", "isStale", "selectUnconsumed", "isAddressedTo", "claimRecord", "markConsumed", "truncate", "renderRecord", "renderResults", "takeResults", "pendingAddressedTo", "watcherWatching"]
    - path: plugins/aoforge/aoforge/bin/lib/__fixtures__/handoff-fixtures.cjs
      provides: "hand-built builders: handoff project, done/pending records, pid file, hook payload"
      exports: ["makeHandoffProject", "doneRecord", "pendingRecord", "writeDone", "writePending", "writePidFile", "hookPayload"]
    - path: plugins/aoforge/hooks/route-results.js
      provides: "UserPromptSubmit catch-all delivery on the shared library; notices unchanged"
  key_links:
    - from: "route-results.js collectHandoff"
      to: "handoff-results.cjs takeResults({ mode: 'all' })"
      via: "require('../aoforge/bin/lib/handoff-results.cjs')"
      pattern: "handoff-results\\.cjs"
    - from: "handoff-results.cjs claimRecord"
      to: "done/<id>.claim"
      via: "fs.openSync(claimPath, 'wx')"
      pattern: "'wx'"
---

# TRD 73-02: One delivery library for handoff results, exactly once and addressed

<objective>
Today two hook files know how to deliver a completed handoff: `route-results.js` (registered, UserPromptSubmit) and
the DRAFT `inject-handoff-results.js` (unregistered, reads an `output` field the daemon never writes). 73-04 completes
the second one and 73-06 registers it on PostToolUse and Stop, so three hook events will compete for the same
`done/<id>.json` files. Two things go wrong unless delivery is shared:

1. **Double delivery.** Claude Code runs hooks in parallel (parallel tool calls fire concurrent PostToolUse hooks).
   Both read a record as unconsumed and both inject it. A read-then-write `consumed: true` flag cannot stop that.
2. **Misdelivery.** An AOForge executor subagent's tool calls fire PostToolUse in the same project. Without an
   address, a subagent takes the main loop's result and the main loop never sees it.

This TRD extracts route-results' selection and rendering into `bin/lib/handoff-results.cjs`, adds an atomic claim
(O_EXCL `done/<id>.claim`), an address rule (session and agent), a pending lookup and a watcher check for 73-04's Stop
wait, and moves route-results onto it. route-results stays the catch-all: the user's next prompt still delivers anything
nobody else delivered.

Purpose: HND-02, the shared, race-safe core the injection hook (73-04) and its registration (73-06) need.
Output: the library, hand-built fixtures, route-results on the library with unchanged output.
</objective>

<file_tree>
plugins/aoforge/
├── aoforge/bin/lib/
│   ├── handoff-results.cjs            ← CREATE
│   ├── handoff-results.test.cjs       ← CREATE
│   └── __fixtures__/handoff-fixtures.cjs  ← CREATE
└── hooks/
    ├── route-results.js               ← MODIFY
    └── route-results.test.js          ← MODIFY
</file_tree>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
Project kind `plugin`, work `feature`: TDD strict (failing test first, one test at a time), test list first,
hand-built fixtures only (`no_llm_test_data`), no property-based libraries, no `.feature` files.

Read narrowly:
- `plugins/aoforge/hooks/route-results.js` (281 lines; read whole): `findHandoffDir` 56, `ttlMs` 65, `selectUnconsumed`
  92, `renderRecord` 114, `renderResults` 175, `markConsumed` 190, `emit` 207, notices 218-243, `collectHandoff` 245,
  `main` 253, exports 270.
- `plugins/aoforge/hooks/route-results.test.js`: `seedDoneRecord` 27, groups at 55-215, subprocess group 217.
- `plugins/aoforge/hooks/inject-handoff-results.js` 1-170: the draft, for the `output` field it expected (do not edit;
  73-04 owns it).
- `plugins/aoforge/aoforge/bin/lib/watcher-state.cjs`: `pidFilePath` 36 (honours `AOFORGE_HANDOFF_PID_FILE`),
  `readablePidFile` 45, `readPidFile`, `isWatcherLive` 106, `makeDoneRecord` 124 (spreads the pending record, so a
  `session_id`/`agent_id` written at queue time survives into the done record).
- `plugins/aoforge/aoforge/bin/lib/handoff.cjs` `cmdHandoffComplete` 160 (writes `output`, `exit_code`, no stdout).
- `plugins/aoforge/hooks/gate-interactive.js` `writePendingRecord` 224 (record shape; 73-04 adds `session_id` and
  `agent_id` from the PreToolUse payload).
</context>

## Test list

Outermost first: the spawned route-results hook, then the library in-process.

**route-results.js, spawned** (`route-results.test.js`):
1. Every existing test passes unchanged (rendering, TTL, malformed, escape hatch, ancestor lookup).
2. Two copies started together (`spawn` both, then await both) over one seeded record -> exactly one stdout contains
   the record id; the record ends `consumed: true` and `done/<id>.claim` exists.
3. A record whose `session_id` is `'other-session'` and `agent_id` `'a-9'` is still delivered (catch-all) and marked
   `consumed_by: 'route-results'`.
4. A record that already has a `.claim` file but `consumed: false` (a crash between claim and mark) is not delivered.

**Library, in-process** (`handoff-results.test.cjs`, builders from `handoff-fixtures.cjs`):
5. `selectUnconsumed(doneDir, { now, ttl })` skips `consumed: true`, records older than the TTL, malformed JSON,
   records with a `.claim` beside them, and non-`.json` files; the rest come back sorted by `completed_at`.
6. `isAddressedTo(record, payload)`: no `session_id` + main-loop payload -> true; no `session_id` + subagent payload
   (`agent_id: 'a1'`) -> false; same session, both main loop -> true; same session, record `agent_id: 'a1'`, payload
   `agent_id: 'a1'` -> true; same session, record main loop, payload `'a1'` -> false; other session -> false.
7. `claimRecord(doneDir, id, { by })`: first call `true`, second `false`; the claim file parses as JSON
   `{ claimed_at, pid, by }`; an error other than EEXIST (a read-only dir) returns `false` and never throws.
8. Claim race: two `node -e` children that each `require` the library and claim the same id after waiting for a shared
   start file to appear -> exactly one prints `true`.
9. `markConsumed(records, { by })` writes `consumed: true`, `consumed_at`, `consumed_by` through tmp + rename, drops
   the in-memory `_path`, and the file still parses.
10. `renderRecord`: the existing done / failed (`✗ exit N`) / rejected ("Do NOT retry") / timeout / error / no-output
    strings are byte-identical to today's route-results output; a record with `output: 'logged in\n'` and no stdout
    renders a fenced `logged in`.
11. `renderResults` over three records of 4,000-character stdout returns under 9,000 characters, and each record cut
    short ends with the `handoff get <id>` pointer.
12. `takeResults({ cwd, payload, mode: 'addressed', by })` walks up from a nested cwd to `.aoforge-handoff/`, returns
    `{ records, text }` for addressed records only, claims and marks them, and returns `null` when there is nothing;
    `mode: 'all'` ignores addressing.
13. `pendingAddressedTo(handoffDir, payload, { now, maxAgeMs })` returns fresh pending records addressed to the payload
    and drops other sessions, other agents, records older than `maxAgeMs`, and malformed files.
14. `watcherWatching(root, { env })`: no pid file -> false; pid file with `pid: process.pid` and `watching: [root]` ->
    true; `watching: ['/elsewhere']` -> false; a dead pid -> false; a legacy pid file -> false; `root` given through a
    symlink (macOS `/var` -> `/private/var`) still matches (realpath both sides).

<embedded_context>

<codebase_examples>
The selection and claim-free consume path being replaced (`route-results.js` 92-106, 190-205):
```js
function selectUnconsumed(doneDir) {
  const now = Date.now();
  const ttl = ttlMs();
  const records = [];
  for (const filePath of listDoneFiles(doneDir)) {
    const rec = readRecord(filePath);
    if (!rec) continue;
    if (rec.consumed === true) continue;
    if (isStale(rec, now, ttl)) continue;
    rec._path = filePath;
    records.push(rec);
  }
  ...
}
function markConsumed(records) {
  ... rec.consumed = true; rec.consumed_at = now; ... writeFileSync(tmp) + renameSync(tmp, rec._path) ...
}
```
The claim, the only new primitive that matters for "exactly once":
```js
function claimRecord(doneDir, id, { by } = {}) {
  const claimPath = path.join(doneDir, `${id}.claim`);
  try {
    const fd = fs.openSync(claimPath, 'wx'); // O_CREAT | O_EXCL: one winner across processes
    fs.writeSync(fd, JSON.stringify({ claimed_at: new Date().toISOString(), pid: process.pid, by: by || null }));
    fs.closeSync(fd);
    return true;
  } catch (e) {
    return false; // EEXIST: someone else has it. Anything else: fail open, deliver nothing from here.
  }
}
```
Order inside `takeResults`: select -> filter by address (unless `mode: 'all'`) -> claim each (keep only won claims)
-> render -> mark consumed. Render before marking so a render bug cannot leave a record consumed but never shown; a
record claimed but never marked (a crash in between) stays claimed and is not re-delivered, which is the safe side for
a result that may hold command output.

Handoff ids are minted as `h-<8 hex>` (`handoff.cjs` `newId`, `gate-interactive.js` 225). Validate an id against
`/^[A-Za-z0-9_-]+$/` before using it in a path (the record file is user-writable input).

The watcher pid file (written by `aoforge-watch.cjs` `runForeground`): `{ pid, version, shell, watching: [abs paths],
started_at }`; `watcher-state.readPidFile()` adds `legacy: true` when it fell back to the pre-rename daemon's file.
</codebase_examples>

<anti_patterns>
- Do not deliver on a read-then-write flag alone (the current `consumed` check). That is exactly the race this TRD
  closes.
- Do not change route-results' rendered text, its notices half, its escape hatches (`AOFORGE_SKIP_HANDOFF_RESULTS=1`
  handoff only, `AOFORGE_SKIP_NOTICES=1` notices only) or its TTL env (`AOFORGE_HANDOFF_RESULT_TTL_MS`).
- Do not make route-results read the payload to filter by address: the user's prompt is the delivery of last resort for
  a result whose queuing context is gone.
- Do not delete claim files or done records here. Records already age out of delivery through the TTL.
- Do not hand-write record ids or timestamps in tests with generated-looking data; use the fixture builders with fixed
  ids (`h-fixture1`, `h-fixture2`) and `new Date(now - n).toISOString()`.
</anti_patterns>

<error_recovery>
- The claim-race test is flaky: make both children block on the start file (`while (!fs.existsSync(start)) {}` with a
  short `Atomics.wait` sleep), create the file after both have spawned, and assert on the set of outputs, not on order.
- macOS `os.tmpdir()` is under `/var/folders`, a symlink to `/private/var`: `fs.realpathSync` every path the fixture
  hands out, and realpath both sides in `watcherWatching`.
- A route-results test that compares whole stdout breaks on a new trailing field: the rendered text must not change;
  only the record file gains `consumed_by`.
</error_recovery>

</embedded_context>

<gotchas>
- `route-results.js` requires `../aoforge/bin/lib/compat.cjs` at load (line 50). Require `handoff-results.cjs` the same
  way. The hooks run from `${CLAUDE_PLUGIN_ROOT}/hooks/`, so the relative path holds for the installed plugin too.
- `listDoneFiles` filters `.json`; claim files end `.claim`, so `aoforge-watch status` counts and `watcher-state`
  helpers never see them.
- The coexistence suite (73-06) will run two copies of each hook at once (its test 14). The claim is what makes those
  two copies agree.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fixture builders and the RED test list for the library</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/handoff-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs</files>
  <action>
Write `handoff-fixtures.cjs` with hand-built factories (no generated data): `makeHandoffProject()` -> realpath'd
mkdtemp root with `.aoforge-handoff/{pending,done}` and a `cleanup()`; `doneRecord(overrides)` with fixed defaults
(`id: 'h-fixture1'`, `cmd: 'echo fixture'`, `status: 'done'`, `exit_code: 0`, `stdout: 'fixture\n'`, `stderr: ''`,
timestamps from an injected `now`, `consumed: false`); `pendingRecord(overrides)`; `writeDone(project, rec)` and
`writePending(project, rec)` returning paths; `writePidFile(dir, { pid, watching, legacy })` returning the file path
(tests point `AOFORGE_HANDOFF_PID_FILE` at it); `hookPayload(event, overrides)` with `session_id: 's-fixture'`,
`hook_event_name`, `cwd`. Then write test list items 5-14 in `handoff-results.test.cjs` against a module that does not
exist yet. Run it: every test fails with `Cannot find module` or `is not a function`. Commit tests and fixtures as
`test(73-02): ...`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs exits non-zero, all failures being the missing module or functions</verify>
  <done>Fixtures exist and are hand-built; the library tests are written and RED; the failing output is captured for the SUMMARY.</done>
  <recovery>If a builder needs a value you are tempted to generate, write it out literally; the constraint is no generated test data.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN, handoff-results.cjs</name>
  <files>plugins/aoforge/aoforge/bin/lib/handoff-results.cjs</files>
  <action>
Implement the library. Move (do not copy-and-diverge) `findHandoffDir`, `ttlMs`, `isStale`, `selectUnconsumed`,
`truncate`, `renderRecord`, `renderResults`, `markConsumed` out of route-results, keeping rendered strings
byte-identical. Add:
- `selectUnconsumed(doneDir, { now, ttl })` also skips records with a `.claim` file and ids that fail
  `/^[A-Za-z0-9_-]+$/`.
- `isAddressedTo(record, payload)` per the truths (`agent_id` absent or empty = main loop on both sides).
- `claimRecord(doneDir, id, { by })` (codebase_examples).
- `markConsumed(records, { by })` adds `consumed_by`.
- `renderRecord` falls back to `rec.output` when `stdout` and `stderr` are empty; `renderResults` caps the total at
  `MAX_RENDER_CHARS = 9000` by shrinking each record's share and appending the `handoff get <id>` pointer to a record it
  cut.
- `takeResults({ cwd, payload, mode, by, now, env })` -> `{ records, text } | null` in the order select, address,
  claim, render, mark.
- `pendingAddressedTo(handoffDir, payload, { now, maxAgeMs })`.
- `watcherWatching(projectRoot, { env })` via `watcher-state.readPidFile()` + a `process.kill(pid, 0)` check, refusing
  `legacy`, realpath on both sides.
Every exported function fails open (no throw on bad input or fs errors). Make tests 5-14 pass one at a time. Commit
`feat(73-02): ...`.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs exits 0</verify>
  <done>All library tests pass, including the two-process claim race; no function throws on malformed input.</done>
  <recovery>If the race test still shows two winners, check that nothing calls `existsSync` before `openSync(..., 'wx')` as a pre-check that could short-circuit differently; the O_EXCL open must be the only arbiter.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: route-results on the library, the concurrency tests, and the scoped gate</name>
  <files>plugins/aoforge/hooks/route-results.js, plugins/aoforge/hooks/route-results.test.js</files>
  <action>
Write route-results test list items 2-4 first and run them RED (item 2 shows two emitters, item 4 delivers a claimed
record). Then rewrite route-results' handoff half as a thin caller:
`collectHandoff()` -> `takeResults({ cwd: process.cwd(), mode: 'all', by: 'route-results' })`, and `main` emits the
text and the notices exactly as today (no separate `markConsumed` call; `takeResults` marked them). Keep the module's
exports for back-compat by re-exporting the library functions under the same names (`findHandoffDir`,
`selectUnconsumed`, `renderRecord`, `renderResults`, `markConsumed`, `truncate`, `isStale`, `DEFAULT_TTL_MS`,
`MAX_OUTPUT_CHARS`) plus its own `findPlanningDir`. Update the header comment: delivery is shared with
inject-handoff-results.js (73-04), exactly once through the claim, and route-results is the catch-all. Make the three
new tests pass, then run the scoped suites and the e2e file (its route-results assertions must hold). Commit
`feat(73-02): ...`.
  </action>
  <verify>node --test plugins/aoforge/hooks/route-results.test.js plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs plugins/aoforge/aoforge/bin/handoff-e2e.test.cjs exits 0, and node --test plugins/aoforge/hooks/hook-coexistence.test.js exits 0 (route-results' RUNS entry still composes to context)</verify>
  <done>route-results delivers through the library, once across concurrent copies, with unchanged rendered text and notices; the coexistence suite and the e2e pipeline still pass.</done>
  <recovery>If the coexistence route-results entry starts failing test 10 (solo vs paired output differs), the hook has become order- or timing-dependent; the notices half must not depend on the handoff half.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/aoforge/aoforge/bin/lib/handoff-results.test.cjs plugins/aoforge/hooks/route-results.test.js   (scoped, per task)</test>
<test>npm test   (full suite before the last commit; if micro.test.cjs hangs on commit signing, use node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs')</test>
<lint>not_available</lint>
<build>not_available</build>
</validation_gates>

<verification>
- `rg -n "'wx'" plugins/aoforge/aoforge/bin/lib/handoff-results.cjs` finds the O_EXCL claim.
- `rg -n "handoff-results\.cjs" plugins/aoforge/hooks/route-results.js` finds the require; `rg -n "function renderRecord" plugins/aoforge/hooks/route-results.js` finds nothing (moved, not duplicated).
- The two-copies route-results test and the claim-race test pass.
- Full suite: no new failures against the baseline (11,955 tests, 11,919 pass, 35 skipped).
</verification>

<success_criteria>
- One library delivers handoff results, exactly once across processes, with a session and agent address.
- route-results is unchanged from the user's point of view and remains the catch-all.
- 73-04 can import `takeResults`, `pendingAddressedTo` and `watcherWatching` without touching route-results.
</success_criteria>

<output>
After completion, create `.aoforge/objectives/73-handoff-gaps-and-result-injection/73-02-SUMMARY.md` (through
`aof-tools summary post`) with the TDD evidence table.
</output>
