---
objective: 47-github-authoritative-store
trd: "11"
type: tdd
wave: 4
depends_on: ["47-03", "47-06", "47-07", "47-08", "47-09", "47-10"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-store-cli.cjs
  - plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs
  - plugins/devflow/devflow/bin/df-tools.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
autonomous: true
requirements: [GST-05, GST-03, GST-01]
must_haves:
  truths:
    - "`df-tools gh outbox status` reports pending/blocked/done counts, the halt (if any) with the issue it names, the journal path, and degraded capabilities in one sentence each"
    - "`df-tools gh outbox flush [--no-wait]` exits 0 when everything flushed, 1 on error, 2 when halted for a human (remote edit or blocked op), 3 when ops remain pending (offline or rate-limited)"
    - "`df-tools gh outbox resolve <seq> --accept-remote|--overwrite` clears a halt as defined in 47-07"
    - "`df-tools gh trd spec|freeze|fold|scope <trd>` print the effective spec, log a freeze, fold on close, or post a scope change (refusing overflow with a message that it becomes a new TRD)"
    - "`df-tools gh orphans <objective>` lists unlinked TRD issues and linked TRDs without a local file, deleting nothing"
    - "Every new subcommand honours `github.enabled` (zero gh calls when off), `--raw` JSON, and `--help`; unknown subcommands list the available ones"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-store-cli.cjs
      provides: "cmdGhOutbox, cmdGhTrd, cmdGhOrphans, EXIT"
    - path: plugins/devflow/devflow/bin/df-tools.cjs
      provides: "dispatch for gh outbox | gh trd | gh orphans"
  key_links:
    - "Thin wrappers over gh-outbox (47-03), gh-outbox-flush (47-07), gh-comments (47-08), gh-hierarchy.reportOrphans (47-09), gh-capability.describeDegraded (47-06); 47-14 documents each as `gh <sub>` in CLAUDE.md for the dispatch-completeness extractor"
---

# TRD 47-11: Command surface — `gh outbox`, `gh trd`, `gh orphans` (GST-05, GST-03)

<objective>
Create `lib/gh-store-cli.cjs` and wire it into `df-tools.cjs`: the minimal human-facing commands for the store — inspect and
flush the outbox, resolve a halt, work with a TRD's effective spec (freeze, fold, scope), and report orphans. Keep `gh.cjs`
untouched (47-12 owns it this wave) and keep dispatch thin.

Purpose: makes GST-05's "stops for a human" actionable and GST-03's freeze/fold/scope reachable. Output: CLI module + tests,
dispatch, help text.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Do not modify `gh.cjs`, `gh-pull.cjs` or `templates/config.json` (other TRDs own them in this wave / earlier).
- Tests call the `cmd*` functions in-process with the `capture()` harness from `gh-e2e.test.cjs` (copy it), the fake via `_setRunGh`,
  `hermeticEnv()`, `makeStoreProject()`. One dispatch test spawns `node df-tools.cjs gh outbox status --raw` with `HOME`/`DEVFLOW_OUTBOX_DIR`
  set to temp dirs and `github.enabled:false` (so no gh is needed).
- `help.test.cjs` and `dispatch-completeness.test.cjs` must stay green.
- No property-based tests, no generated data, never port 8080.

## Decisions taken in planning

- **D-21 Exit codes** (`EXIT = {OK:0, ERROR:1, HALTED:2, PENDING:3}`) for `gh outbox flush` and for the `gh trd` verbs that flush. `emitResult`
  maps any `ok:false` to 1, so this module emits its own codes with `output()` + `process.exit(code)`.
- **Verbs flush by default.** `gh trd freeze|fold|scope` enqueue then call `flush(root, {wait:true})`; `--no-flush` leaves ops queued (for
  hooks/batching). `gh outbox flush --no-wait` = hook mode (`maxRetries:0`, never sleeps).
- **D-27 Freeze wiring.** `gh trd freeze <trd>` is the reachable form of "frozen at execute start" in 47; calling it from the execute-start
  lifecycle (linked branch, draft PR) is objective 49. `gh decision open|answer` and `plan put-trd` remain objective 48 — not added here.
- **Scope input.** `gh trd scope <trd> @file:<path>` or `gh trd scope <trd> "<text>"`, optional `--n K` (same `@file:` convention as `gh comment`).

<embedded_context>

<codebase_examples>
Dispatch block to extend (`df-tools.cjs:1066-1095`):
```js
case 'gh': {
  const subcommand = args[1];
  if (subcommand === 'status') { cmdGhStatus(cwd, raw); }
  ...
  } else if (subcommand === 'pull') {
    const { cmdGhPull } = require('./lib/gh-pull.cjs');
    cmdGhPull(cwd, args.slice(2), raw);
  } else {
    error('Unknown gh subcommand. Available: status, sync, pull, resolve, comment, close-issue, sync-release (sync-objectives: deprecated alias)');
  }
```
Add `outbox`, `trd`, `orphans` branches that lazily `require('./lib/gh-store-cli.cjs')`, and extend the Available list.
Help usage string (`help.cjs:260`) — extend with `outbox <status|flush [--no-wait]|resolve <seq> --accept-remote|--overwrite>`,
`trd <spec|freeze|fold [--force]|scope <body|@file:path> [--n K]> <trd>`, `orphans <objective>`, and `pull --all [--force]`.
Enabled gate: `client.requireEnabled(cwd)` → `{skipped, reason}` with zero gh calls.
</codebase_examples>

<anti_patterns>
- Business logic in the CLI layer: parse args, call one library function, format, exit.
- Exiting 1 for "pending" (offline is not an error) or 0 for "halted" (a human must act).
- Adding `decision`/`put-trd` verbs (objective 48).
</anti_patterns>

<error_recovery>
- Missing `<seq>` or both/neither of `--accept-remote`/`--overwrite` → usage on stderr, exit 1.
- `gh outbox resolve` on a seq that is not the halted one → `{ok:false, error:'op <seq> is not halted'}`, exit 1.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/47-github-authoritative-store/47-07-gh-outbox-flush-TRD.md
@.planning/objectives/47-github-authoritative-store/47-08-gh-comments-TRD.md
</context>

<gotchas>
- `--raw` means JSON on stdout; prose otherwise (mirror `cmdGhPull`).
- `describeDegraded` needs capabilities: `gh outbox status` uses the CACHED record only (`readCachedCapabilities`) so status makes zero gh calls.
- TRD ids accept any spelling (`07-01`, `7-01`, `07-01-alpha`) via `gh-mapping.toTrdId` on the prefix.
</gotchas>

## Test list

1. `gh outbox status --raw` on an empty journal → `{ok:true, pending:0, blocked:0, done:0, halted:null, journal:<path under DEVFLOW_OUTBOX_DIR>}`; zero gh calls.
2. With a halted remote-edit op → prose names the issue number and both resolution commands; `--raw` includes `halted`.
3. Degraded cached capabilities → status lists one sentence per degraded capability.
4. `gh outbox flush` exit mapping: all ok → 0; offline (`fake.setOffline(true)`) → 3 with "pending"; remote edit → 2; a 500 on an op (classified `error` → blocked + halted) → 2; lock held by another flusher → 0 with "flush already running"; invalid config (e.g. unresolvable repo) → 1.
5. `gh outbox flush --no-wait` with a secondary limit → exit 3, no sleep recorded.
6. `gh outbox resolve <seq> --accept-remote` / `--overwrite` clear the halt (exit 0); wrong seq → exit 1; missing flag → exit 1 with usage.
7. `gh trd spec 07-01 --raw` → `{text, applied:[1,2], chars}` for seeded scope comments.
8. `gh trd freeze 07-01` → spec-rev freeze entry on GitHub after the implicit flush; `--no-flush` → queued only.
9. `gh trd fold 07-01` on a closed TRD → body replaced, spec-rev `fold`; open TRD → exit 1 with message; `--force` proceeds.
10. `gh trd scope 07-01 @file:<tmp>` → scope comment `n=next` posted; oversized → exit 1 with "becomes a new TRD".
11. `gh orphans 7 --raw` → `{unlinked, missing_local}`; zero writes.
12. `github.enabled:false` → every subcommand returns `skipped` with zero gh calls.
13. Dispatch (spawned df-tools): `gh outbox status --raw` works; `gh nope` lists outbox, trd, orphans in the Available message.
14. `help.cjs` usage line names `outbox`, `trd`, `orphans`, `pull --all`; `help.test.cjs` and `dispatch-completeness.test.cjs` green.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: `gh outbox status|flush|resolve` with exit codes (tests 1-6, 12)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-store-cli.cjs, plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs</files>
  <action>
RED: tests 1-6, 12. Commit RED.
GREEN: `EXIT`, `cmdGhOutbox(cwd, args, raw)` dispatching `status` / `flush [--no-wait]` / `resolve <seq> --accept-remote|--overwrite`, mapping
flush statuses: flushed→0, skipped→0, running→0 ("flush already running"), pending→3, halted→2, error→1.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs</verify>
  <done>Tests 1-6 and 12 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: `gh trd spec|freeze|fold|scope` and `gh orphans` (tests 7-11)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-store-cli.cjs, plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs</files>
  <action>
RED: tests 7-11. Commit RED.
GREEN: `cmdGhTrd(cwd, args, raw)` → `gh-comments.readEffectiveSpec | freezeTrd | foldTrd | enqueueScope`, then flush unless `--no-flush`;
`cmdGhOrphans(cwd, args, raw)` → `gh-hierarchy.reportOrphans`. Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs</verify>
  <done>Tests 1-12 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: df-tools dispatch and help text (tests 13-14)</name>
  <files>plugins/devflow/devflow/bin/df-tools.cjs, plugins/devflow/devflow/bin/lib/help.cjs, plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs</files>
  <action>
RED: tests 13-14 (spawn `node plugins/devflow/devflow/bin/df-tools.cjs` with an env whose `HOME`, `DEVFLOW_OUTBOX_DIR`, `DEVFLOW_GH_CACHE_DIR` are temp dirs,
cwd = a temp project with `github.enabled:false`). Commit RED.
GREEN: add the three branches to the `case 'gh'` block, extend the Available list, extend the `help.cjs` gh usage string. Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs</verify>
  <done>Tests 1-14 pass; help and dispatch-completeness suites green.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/gh-commands.test.cjs</regression>
</validation_gates>

<verification>
- `node plugins/devflow/devflow/bin/df-tools.cjs gh nope` (in a temp project) lists outbox, trd and orphans.
- Exit-code table covered by test 4.
</verification>

<success_criteria>
A human can see, flush, and unblock the outbox and work with a TRD's effective spec from the command line, with exit codes
that distinguish "offline, wait" from "a human must look".
</success_criteria>

<output>
After completion, create `.planning/objectives/47-github-authoritative-store/47-11-store-cli-SUMMARY.md`
</output>
