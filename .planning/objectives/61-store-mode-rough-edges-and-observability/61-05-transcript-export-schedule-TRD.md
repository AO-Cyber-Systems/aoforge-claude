---
objective: 61-store-mode-rough-edges-and-observability
trd: "05"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/transcript-export-schedule.cjs
  - plugins/devflow/devflow/bin/lib/transcript-export-schedule.test.cjs
  - plugins/devflow/hooks/upgrade-project.js
  - plugins/devflow/hooks/upgrade-project.test.js
  - plugins/devflow/hooks/planning-writes.audit.test.js
autonomous: true
requirements: [OBS-03]
must_haves:
  truths:
    - "At SessionStart, upgrade-project.js starts `df-tools transcript-export` in a detached background process at most once per 24 h, in every session, DevFlow project or not, so the index at ~/.claude/devflow/transcript-index.jsonl grows without anyone running the command"
    - "DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1 skips only the export; DEVFLOW_SKIP_PRUNE=1 and DEVFLOW_SKIP_UPGRADE=1 do not skip it, and it does not skip them"
    - "The hook claims the 24 h window (stamp at ~/.claude/devflow/state/transcript-export/last-run.json) before it spawns, so concurrent sessions start one export, not several"
    - "With no ~/.claude/projects directory, nothing is spawned and nothing is written"
    - "Any failure writes one `[devflow] transcript export skipped: <msg>` line to stderr; stdout stays empty, the exit code stays 0 and the upgrade steps still run"
    - "SessionStart never waits for the export: the 3.6 GB first run happens in the child"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/transcript-export-schedule.cjs
      provides: "THROTTLE_MS, SKIP_ENV, stampPath, readStamp, decide, claim, exportArgs, runScheduled"
    - path: plugins/devflow/hooks/upgrade-project.js
      provides: "step 0b: the throttled background transcript export"
  key_links:
    - "upgrade-project.js main() step 0b -> transcript-export-schedule.runScheduled({spawnChild}) -> detached `node <bundled df-tools> transcript-export --root ~/.claude/projects --out ~/.claude/devflow/transcript-index.jsonl`"
    - "the throttle mirrors backup-prune.runThrottled (24 h, stamp, missing or unparseable stamp means run)"
---

# TRD 61-05: `transcript-export` runs at SessionStart, throttled, with its own skip env (OBS-03)

<objective>
`df-tools transcript-export` preserves a compact per-session index before Claude Code's retention deletes transcripts.
The 2026-08-18 audit lost 164 sessions that way. It only helps if someone runs it, and nobody does:
`~/.claude/devflow/transcript-index.jsonl` does not exist on this machine, while `~/.claude/projects` holds 3.6 GB.

Run it automatically, the way objective 37 runs the backup prune. **Decisions:**

1. **Where:** `hooks/upgrade-project.js`, as step 0b right after the prune. That hook runs on every SessionStart, and
   its own early returns come after step 0. sync-runtime exits at its version fast path in almost every session.
2. **How:** a detached child (`spawn(process.execPath, args, { detached: true, stdio: 'ignore' }).unref()`) running the
   bundled `df-tools.cjs transcript-export`. The prune runs inline because it is small. A first export reads every
   transcript, so it must never hold up session start. The export is incremental (it skips sessions already indexed
   at the same size), so later runs are cheap.
3. **Throttle:** at most once per 24 h, from a stamp under `~/.claude/devflow/state/transcript-export/`. That is the
   `state/` convention of progress-guard, awareness and hook markers, and it is never inside a repository. The stamp
   is written **before** the spawn, as a claim, so two sessions starting together do not both export. A child that
   dies leaves the window claimed; the next window catches up, because the export is incremental.
4. **Escapes:** `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1` skips only this step. It is checked in the hook before anything is
   required (like `DEVFLOW_SKIP_PRUNE`) and again in the library.

```
main():
  0.  prune (unchanged)
  0b. if env.DEVFLOW_SKIP_TRANSCRIPT_EXPORT !== '1':
        try { schedule.runScheduled({ userHome, now, env, dfTools: DF_TOOLS, spawnChild }) }
        catch (e) { stderr '[devflow] transcript export skipped: ' + e.message }
  1-4 upgrade (unchanged)

runScheduled:
  d = decide({ userHome, now, env })      # skip-env | no-transcripts | throttled | run
  if !d.run -> return { spawned: false, reason }
  claim({ userHome, now })                # atomic tmp+rename of last-run.json
  spawnChild(exportArgs({ dfTools, userHome }))
  return { spawned: true, args }
```

Purpose: OBS-03 and part of success criterion 5. Output: the schedule module, hook step 0b, tests.
</objective>

<file_tree>
plugins/devflow/devflow/bin/lib/
├── transcript-export-schedule.cjs        ← CREATE
└── transcript-export-schedule.test.cjs   ← CREATE
plugins/devflow/hooks/
├── upgrade-project.js                    ← MODIFY (step 0b, header comment)
├── upgrade-project.test.js               ← MODIFY (new describe block; ESCAPES list)
└── planning-writes.audit.test.js         ← MODIFY only if its upgrade-project runs need the skip env (gotchas)
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit (`test(61-05): ...`) before GREEN (`feat(61-05): ...`).
- Hand-built fixtures only. Fake homes come from `upgrade-fixtures.makeFakeHome()`. Transcripts are literal JSONL
  records written into `<home>/.claude/projects/<project-key>/<session>.jsonl` (use `transcript-fixtures.cjs`
  builders or two literal lines). No generated data, no property-based libraries, no `.feature` files.
- Nothing reads or writes the real `~/.claude`: every hook spawn sets HOME to a temp home (the existing `hookEnv`).
- A test that lets the child run must wait for it (poll the index file, at most 15 s) before its temp home is removed.
  Every other test either has no `.claude/projects` (no spawn) or injects a `spawnChild` spy.
- The SessionStart contract holds on every path: stdout empty, exit 0, never throws.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`, one plain command per Bash
  call. Never use port 8080.

## Test list

`transcript-export-schedule.test.cjs` (in-process, injected `now`, temp homes):

1. `decide` returns, in this order of precedence:
   - `env.DEVFLOW_SKIP_TRANSCRIPT_EXPORT === '1'` → `{ run: false, reason: 'skip-env' }`;
   - no `<home>/.claude/projects` → `'no-transcripts'`;
   - a stamp 1 h old → `'throttled'`;
   - a stamp 25 h old → `{ run: true }`;
   - no stamp → run;
   - an unparseable stamp → run;
   - a stamp more than 5 min in the future (clock skew) → run.
2. `claim` writes `{ "last_run_at": "<now ISO>" }` to `stampPath(home)`, creating the directory, through a temp file
   and rename (no `*.tmp` left behind). `readStamp` reads it back.
3. `exportArgs({ dfTools, userHome })` is
   `[dfTools, 'transcript-export', '--root', '<home>/.claude/projects', '--out', '<home>/.claude/devflow/transcript-index.jsonl']`.
4. `runScheduled` with a spy `spawnChild`:
   - due → the spy is called once with `exportArgs`, the stamp exists, and the result is `{ spawned: true }`;
   - throttled → the spy is not called and the stamp bytes are unchanged;
   - skip-env → not called, no stamp.
5. `runScheduled` where `spawnChild` throws → the error propagates (the hook's try/catch reports it), and the stamp was
   already written. The claim stands, so a broken spawn is retried at most daily.

`upgrade-project.test.js`, a new `describe('objective 61 — transcript export')` block, run through `runHook(cwd, home, extra)`:

6. Fake home with one transcript under `.claude/projects/-tmp-demo/s1.jsonl`, non-DevFlow cwd → stdout `''`, exit 0,
   and the stamp exists. Within 15 s, `<home>/.claude/devflow/transcript-index.jsonl` holds one row with
   `session: 's1'`.
7. Run again immediately → the stamp bytes are unchanged, and the index still has one `s1` row after a 1 s wait.
8. `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1` → no stamp and no index. The prune still writes `.last-prune.json` when backups
   are seeded (the escapes are independent).
9. `DEVFLOW_SKIP_PRUNE=1` and `DEVFLOW_SKIP_UPGRADE=1` together → the export still runs (stamp written).
10. No `.claude/projects` in the fake home → no stamp, no index and no stderr line.
11. The state path is blocked (create a FILE at `<home>/.claude/devflow/state/transcript-export`) → stderr has exactly
    one `[devflow] transcript export skipped:` line, stdout is `''`, exit 0. In a behind DevFlow fixture the upgrade
    still applies (`config.json` is stamped), as prune test 5 shows for the prune.
12. Existing tests are unchanged and green. Add `DEVFLOW_SKIP_TRANSCRIPT_EXPORT` to the file's `ESCAPES` list so a
    developer's own environment cannot leak into `hookEnv`.

<embedded_context>

<codebase_examples>
upgrade-project.js `main()` step 0 (lines 252-261). Step 0b goes directly after it, same shape:

```js
function main() {
  if (process.env.DEVFLOW_SKIP_PRUNE !== '1') {
    try {
      require(path.join(LIB, 'backup-prune.cjs')).runThrottled({ userHome: os.homedir(), now: new Date() });
    } catch (e) {
      process.stderr.write(`[devflow] backup prune skipped: ${e.message}\n`);
    }
  }

  if (process.env.DEVFLOW_SKIP_UPGRADE === '1') return;
```

Module scope already has `spawn` from child_process, plus `LIB` and `DF_TOOLS`
(`path.join(pluginRoot, 'devflow', 'bin', 'df-tools.cjs')`, the bundled engine, never the mirror).

backup-prune.cjs throttle (lines 13, 226-261, 343-349): `THROTTLE_MS = 24 * 60 * 60 * 1000`; a stamp file holding
`{ last_prune_at }`; `runThrottled` returns `{ throttled: true }` inside the window; a missing or unparseable stamp means
run.

audit-cli.cjs `runTranscriptExport` accepts `--out`, `--full`, `--limit` and `--root`. It resolves the root before
calling `exportTranscripts`, which `mkdirSync`s the index dir. The default index is
`~/.claude/devflow/transcript-index.jsonl` (`defaultIndexPath`). `exportTranscripts` is incremental: a session already
indexed at the same byte size is skipped.

upgrade-project.test.js helpers: `hookEnv(home, extra)` builds `{ ...F.gitEnv(home), CLAUDE_PLUGIN_ROOT }` and deletes
every name in `ESCAPES`; `runHook(cwd, home, extra)` spawns the hook, asserts exit 0 and empty stdout. `F` is
`upgrade-fixtures.cjs`, whose `makeFakeHome()` creates only `<home>/.claude` (no `projects/`), so existing tests never
spawn an export.
</codebase_examples>

<anti_patterns>
- Do not run the export inline in the hook. A first run on a real machine reads gigabytes.
- Do not pass `--full`. The raw copy is opt-in and large.
- Do not put the stamp, or any dotfile, under `.planning/` or anywhere in a repository. `planning-writes.audit.test.js`
  fails on runtime dotfiles in `.planning/`. The stamp lives under `~/.claude/devflow/state/`.
- Do not use the mirror's df-tools (`~/.claude/devflow/bin`). sync-runtime may be mid-swap in the same SessionStart.
  Use the bundled `DF_TOOLS`.
- Do not write to stdout. SessionStart stdout becomes model context.
- Do not let one escape imply another.
</anti_patterns>

<error_recovery>
- If test 6's index never appears, run the child command by hand with the same HOME
  (`HOME=<home> node plugins/devflow/devflow/bin/df-tools.cjs transcript-export --root <home>/.claude/projects --out <home>/.claude/devflow/transcript-index.jsonl`)
  to see its error. A detached child's stderr is ignored by design.
- If `planning-writes.audit.test.js` now reports a change for upgrade-project.js, check whether its world HOME has a
  `.claude/projects`. If it does, set `DEVFLOW_SKIP_TRANSCRIPT_EXPORT: '1'` for that RUNS entry's env (or the world's
  env), since the audit is about `.planning/` writes. Do not add an allowlist row.
- If a flaky timing shows up in test 6, raise the poll ceiling, never add a fixed sleep.
</error_recovery>

</embedded_context>

<gotchas>
- `stampPath(home) = <home>/.claude/devflow/state/transcript-export/last-run.json`. It is not a dotfile, and the literal
  lives in the lib, not the hook (the planning-writes audit scans hook sources for dotfile-shaped literals).
- `claim`: `fs.mkdirSync(dir, { recursive: true })`, write `<file>.<pid>.tmp`, then `fs.renameSync`.
- `decide` future-stamp rule: `stamp.time - now > 5 * 60 * 1000` → treat as due (a clock moved back must not freeze the
  export for days).
- `exportArgs` passes `--root` and `--out` explicitly, so the child does not depend on its own `os.homedir()`. The
  child inherits `process.env`, so HOME is the same anyway.
- `spawnChild` in the hook:
  `(args) => { const c = spawn(process.execPath, args, { detached: true, stdio: 'ignore', env: process.env }); c.unref(); }`.
  A spawn error event can be emitted asynchronously; attach `c.on('error', () => {})` so it never becomes an uncaught
  exception.
- Update the hook header comment: add step 0b (what, why a detached child, the claim-then-spawn order, the stamp
  path), and the escape list becomes `DEVFLOW_SKIP_UPGRADE=1` (steps 1-4), `DEVFLOW_SKIP_PRUNE=1` (step 0),
  `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1` (step 0b).
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: transcript-export-schedule.cjs, the throttle, claim and arguments (tests 1-5)</name>
  <files>plugins/devflow/devflow/bin/lib/transcript-export-schedule.cjs, plugins/devflow/devflow/bin/lib/transcript-export-schedule.test.cjs</files>
  <action>
RED: write tests 1-5 with temp homes and a fixed `now`. Run and watch them fail. Commit
`test(61-05): throttled transcript export schedule`.

GREEN: create the module. The header comment explains why it exists (OBS-03, the 164 lost sessions), the throttle and
claim semantics, the stamp location, and that the hook is its only caller. Commit
`feat(61-05): schedule a transcript export at most once per 24 h`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/transcript-export-schedule.test.cjs` passes.</verify>
  <done>Tests 1-5 went RED then GREEN in separate commits.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: upgrade-project.js step 0b, the SessionStart wiring (tests 6-12)</name>
  <files>plugins/devflow/hooks/upgrade-project.js, plugins/devflow/hooks/upgrade-project.test.js, plugins/devflow/hooks/planning-writes.audit.test.js</files>
  <action>
RED: add `DEVFLOW_SKIP_TRANSCRIPT_EXPORT` to `ESCAPES` and write tests 6-11 in a new describe block. Clean temp homes up
only after the poll in test 6. Run the file; 6, 7, 9 and 11 fail. Commit
`test(61-05): SessionStart starts the transcript export once a day`.

GREEN: add step 0b to `main()` and update the header comment (gotchas). Run
`node --test plugins/devflow/hooks/planning-writes.audit.test.js`, and touch it only per error_recovery. Commit
`feat(61-05): upgrade-project starts a throttled background transcript export`.
  </action>
  <verify>`node --test plugins/devflow/hooks/upgrade-project.test.js plugins/devflow/hooks/planning-writes.audit.test.js plugins/devflow/devflow/bin/lib/transcript-export-schedule.test.cjs` passes.</verify>
  <done>Every SessionStart starts at most one daily background export, independently skippable, failing open, with stdout empty.</done>
  <recovery>To back the step out without reverting code, users set `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1`. In code, delete step 0b; the module has no other caller.</recovery>
</task>

</tasks>

<validation_gates>
- Task gate (stack `gates.task` → `test`), scoped: `node --test plugins/devflow/devflow/bin/lib/transcript-export-schedule.test.cjs plugins/devflow/hooks/upgrade-project.test.js plugins/devflow/hooks/planning-writes.audit.test.js`.
</validation_gates>

<verification>
- The new tests pass, and the existing upgrade-project and planning-writes audit suites stay green.
- `rg -n "transcript-export" plugins/devflow/hooks/upgrade-project.js` shows step 0b and the header comment.
</verification>

<success_criteria>
- [ ] SessionStart runs transcript-export in the background at most once per 24 h
- [ ] `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1` is its own escape, independent of the prune and upgrade escapes
- [ ] Fails open with one stderr line, and stdout stays empty
</success_criteria>

<output>
After completion, create `.planning/objectives/61-store-mode-rough-edges-and-observability/61-05-SUMMARY.md` through
`node plugins/devflow/devflow/bin/df-tools.cjs summary post`.
</output>
