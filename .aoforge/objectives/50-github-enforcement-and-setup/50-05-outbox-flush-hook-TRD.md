---
objective: 50-github-enforcement-and-setup
trd: "05"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/hooks/gh-flush.js
  - plugins/devflow/hooks/gh-flush.test.js
  - plugins/devflow/hooks/hooks.json
  - CLAUDE.md
autonomous: true
requirements: [GEN-02]
must_haves:
  truths:
    - "After a Bash tool call whose command runs `df-tools commit` in a store-mode project with queued ops, the hook flushes the outbox and reports the result as additionalContext"
    - "On Stop in a store-mode project with queued ops or cache drift, the hook flushes and reports via systemMessage; it never emits `decision: block` and always exits 0"
    - "Offline, rate-limited, a held lock, a timeout or any thrown error → a one-line notice (or nothing), exit 0"
    - "In local mode, with an empty queue and no drift, or for an unrelated Bash command, the hook exits 0 silently with zero gh calls and no child process"
    - "The hook writes nothing under `.planning/`; `DEVFLOW_SKIP_GH_FLUSH_HOOK=1` disables it"
    - "hooks.json registers it under PostToolUse (matcher Bash) and Stop, and CLAUDE.md lists it (hook-inventory test green)"
  artifacts:
    - path: plugins/devflow/hooks/gh-flush.js
      provides: "PostToolUse(Bash) + Stop hook: store-mode outbox flush and drift report, warn-only"
    - path: plugins/devflow/hooks/hooks.json
      provides: "new PostToolUse group (matcher Bash) and a Stop entry"
  key_links:
    - "Spawns `df-tools gh outbox flush --no-wait --raw` (47) bounded by a timeout; reads `gh-outbox.status` and `planning-drift.findCacheDrift` in-process to decide whether to spawn at all; covered again by 50-12 parity"
---

# TRD 50-05: post-commit and Stop outbox flush hook (GEN-02)

<objective>
Make queued GitHub writes leave the machine soon after they are made, and make drift visible, without ever blocking the developer.
One hook script registered on two events: PostToolUse for Bash (only when the command was `df-tools commit`) and Stop.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(50-05): ...`), then implementation (`feat(50-05): ...`).
- Hook rules (CLAUDE.md Hooks): warn-only, exit 0 always, fail open on any error, never write a runtime dotfile into `.planning/`
  (`planning-writes.audit.test.js`), state (if any) only through `hook-marker-store` (`DEVFLOW_HOOK_MARKER_DIR`).
- Tests: spawn the hook with a JSON payload on stdin (pattern: `hooks/gate-executor-stop.test.js`), `CLAUDE_PLUGIN_ROOT` pointing at
  `plugins/devflow`, `HOME` / `DEVFLOW_OUTBOX_DIR` / `DEVFLOW_GH_CACHE_DIR` / `DEVFLOW_HOOK_MARKER_DIR` at temp dirs, and the gh PATH
  shim (`__fixtures__/gh-shim.cjs` `installGhShim`) so the child df-tools never reaches the real `gh`. Never the real `~/.claude`.

## Decisions

- **One script, two events**, branching on `hook_event_name`. Post-commit trigger: `tool_input.command` matches
  `/df-tools(\.cjs)?\s+(--cwd\s+\S+\s+)?commit\b/`; any other Bash command returns immediately (PostToolUse fires for every Bash call).
- **Cheap pre-check in-process** (no spawn, no gh): resolve `cwd` from the payload, `planningMode.isStoreMode(cwd)` else exit;
  `root = resolveMainRoot(cwd) || cwd`; `outbox.status(root)`; `findCacheDrift(root)`. Spawn the flush only when `pending + blocked > 0`
  and not halted. Libraries load from `${CLAUDE_PLUGIN_ROOT}/devflow/bin/lib` (as `upgrade-project.js` L46 does); if that fails, exit 0.
- **Flush** = `spawnSync(process.execPath, [DF_TOOLS, '--cwd', root, 'gh', 'outbox', 'flush', '--no-wait', '--raw'], {timeout})`,
  timeout 20 s (PostToolUse) / 30 s (Stop), override `DEVFLOW_GH_FLUSH_TIMEOUT_MS`. Exit 0 flushed (silent unless ops were sent: "synced N
  GitHub writes"), 3 pending ("N GitHub writes queued (offline); they will retry"), 2 halted ("outbox halted: <reason> — run df-tools gh
  outbox status"), 1 or timeout ("GitHub sync failed: <first line>; queued writes are kept"). Never retried inside the hook.
- **Report channel**: PostToolUse → `{hookSpecificOutput:{hookEventName:'PostToolUse', additionalContext}}` (Claude sees it);
  Stop → `{systemMessage}` (the user sees it). Stop never emits `decision`, so it cannot fight `auto-continue.js`'s one block.
- **Drift report**: `findCacheDrift(root).drift.length > 0` adds "N planning cache files changed outside a verb (W055) — run df-tools
  validate health". Halted outbox is reported even when nothing is spawned.
- Escape: `DEVFLOW_SKIP_GH_FLUSH_HOOK=1`, consistent with the other hook escapes.

## Test list

1. Local-mode project, payload with `df-tools commit` → exit 0, empty stdout, shim records zero calls.
2. Store mode, queue empty, no drift → exit 0, silent, no child spawned (shim zero calls).
3. Store mode, PostToolUse with `git status` command → silent, zero calls even with pending ops.
4. Store mode, 1 pending op, shim answers the flush writes → exit 0, additionalContext "synced 1 GitHub write"; queue empty afterwards.
5. Store mode, 1 pending op, shim simulates offline (non-zero, network error text) → exit 0, notice "queued (offline)"; op still pending.
6. Stop event with pending ops → stdout JSON has `systemMessage`, has no `decision`; exit 0.
7. A cache file edited outside a verb → Stop reports the W055 drift line.
8. Malformed stdin, missing `CLAUDE_PLUGIN_ROOT` lib, or a throwing lib → exit 0, no output.
9. `DEVFLOW_SKIP_GH_FLUSH_HOOK=1` → silent, zero calls.
10. `planning-writes.audit.test.js` and `hook-inventory.test.cjs` pass with the new hook registered and documented.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: hook behaviour (tests 1-9)</name>
  <files>plugins/devflow/hooks/gh-flush.js, plugins/devflow/hooks/gh-flush.test.js</files>
  <action>
RED: tests 1-9; build store projects with `makeStoreProject` and enqueue an op through `gh-outbox.enqueue` (or the verb that queues one)
into the temp `DEVFLOW_OUTBOX_DIR`. Commit `test(50-05): outbox flush hook`.
GREEN: `gh-flush.js` with a top-of-file header (purpose, events, escape, never blocks), a `main()` wrapped in try/catch that always
`process.exit(0)`. Commit `feat(50-05): flush the outbox after df-tools commit and on Stop`.
# CRITICAL: no `decision` key in any output; no write under `.planning/`.
  </action>
  <verify>node --test plugins/devflow/hooks/gh-flush.test.js</verify>
  <done>Tests 1-9 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: registration and inventory (test 10)</name>
  <files>plugins/devflow/hooks/hooks.json, CLAUDE.md</files>
  <action>
RED: run `node --test plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs` after adding ONLY the hooks.json entries (it must fail:
registered but undocumented); commit hooks.json with `test(50-05): register gh-flush (inventory red)`.
GREEN: add a `- \`gh-flush.js\` — PostToolUse(Bash) + Stop; store mode only: flushes the outbox after `df-tools commit` and at Stop,
reports pending/halted/drift (W055); never blocks, fails open. Escape: `DEVFLOW_SKIP_GH_FLUSH_HOOK=1`` bullet under **Observability
(warn-only)** in CLAUDE.md `### Hooks`. hooks.json: a new `"PostToolUse": [{"matcher":"Bash","hooks":[{type:'command', command:'node
${CLAUDE_PLUGIN_ROOT}/hooks/gh-flush.js'}]}]` group and a third entry in the existing Stop group (after auto-continue). Commit
`docs(50-05): document the gh-flush hook`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/devflow/bin/lib/doctor-checks/11-12-install.test.cjs</verify>
  <done>Inventory, audit and hooks-registry doctor tests pass.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `hooks/upgrade-project.js` L39-47: `pluginRoot`, `LIB`, `DF_TOOLS` resolution and lazy `require(path.join(LIB, ...))` with fallback.
- `hooks/gate-executor-stop.js` + test: stdin payload handling, fail-open shape, spawned-hook tests.
- `gh-outbox-flush.flush` returns `pending` (offline / rate-limited) rather than throwing; `gh outbox flush` exits 0/1/2/3 (CLAUDE.md).
- `planning-drift.findCacheDrift(root)` L159; `planning-mode.isStoreMode`, `resolveMainRoot`.
- `__fixtures__/gh-shim.cjs` `installGhShim({dir, table, defaultCode})` L79 and its `env()` helper.
</codebase_examples>
<anti_patterns>
- Calling `flush` in-process without a timeout (a slow network would stall every Bash call).
- Emitting `decision: "block"` on Stop or PostToolUse.
- Flushing on every Bash call.
</anti_patterns>
<error_recovery>
- If the shim cannot model the full flush write sequence, seed a single cheap op kind (e.g. a label/comment op) and record which in the SUMMARY.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/hooks/gh-flush.test.js plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs</test>
<regression>node --test plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/hooks/auto-continue.test.js</regression>
</validation_gates>

<verification>
- D-01: tests 1-3 prove zero gh calls in local mode and for unrelated commands.
</verification>

<success_criteria>
Store-mode writes flush right after a DevFlow commit and at Stop, and problems are reported, with no path that blocks.
</success_criteria>

<output>
After completion, create `.planning/objectives/50-github-enforcement-and-setup/50-05-SUMMARY.md`
</output>
