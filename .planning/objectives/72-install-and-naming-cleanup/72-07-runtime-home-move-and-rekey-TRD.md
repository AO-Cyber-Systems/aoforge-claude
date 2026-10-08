---
objective: 72-install-and-naming-cleanup
trd: "07"
type: standard
wave: 5
depends_on: ["72-06"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-runtime-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.cjs
  - plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.legacy.test.cjs
  - plugins/aoforge/hooks/sync-runtime.js
  - plugins/aoforge/hooks/sync-runtime.legacy.test.js
  - plugins/aoforge/aoforge/bin/lib/state-rekey.cjs
  - plugins/aoforge/aoforge/bin/lib/state-rekey.test.cjs
  - plugins/aoforge/aoforge/bin/aof-tools.cjs
  - plugins/aoforge/aoforge/bin/lib/help.cjs
  - plugins/aoforge/aoforge/bin/lib/flag-spec.cjs
autonomous: true
requirements: [INST-03, INST-06]
must_haves:
  truths:
    - "On the first AOForge session, runtime state under `~/.claude/devflow/` reaches `~/.claude/aoforge/`: calibration.json, audit.log, transcript-index.jsonl, stacks/ and state/** except the outbox are COPIED (the legacy copy stays as the backup); state/outbox and backups/ are MOVED (never duplicated, so no GitHub write is flushed twice); nothing that already exists under `~/.claude/aoforge/` is overwritten"
    - "The migration writes `~/.claude/aoforge/.legacy-state-migrated.json` `{ from, at, copied, moved, skipped }` and does nothing on later sessions; with no legacy runtime it writes nothing"
    - "sync-runtime mirrors the bundled runtime to `~/.claude/aoforge/` and runs the migration after a good mirror, and also before its version fast path when the marker is missing and a legacy runtime exists; any migration error is one stderr line and exit 0"
    - "`aof-tools state rekey --from <old checkout path> [--to <new path>] [--dry-run] [--raw]` copies every repo-keyed state entry (estimate run state and history, awareness cache, hook markers, outbox files, backups dir and registry entry, planning ledger/drafts state if keyed) from the old path's repo key to the new one, never overwriting, never deleting the old; the old path need not exist any more"
    - "`state rekey` is in help, flag-spec (unknown flags exit 1) and dispatch; the dispatch-completeness and flag-spec repo tests pass"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.cjs
      provides: "migrateLegacyRuntime({ userHome, now, fsImpl }) -> { ran, copied, moved, skipped, marker }"
      exports: ["migrateLegacyRuntime", "COPY_ENTRIES", "MOVE_ENTRIES"]
    - path: plugins/aoforge/aoforge/bin/lib/state-rekey.cjs
      provides: "keyForPath(p) (no realpath needed), planRekey, applyRekey, KEYED_STATE"
      exports: ["keyForPath", "planRekey", "applyRekey", "KEYED_STATE"]
    - path: plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-runtime-fixtures.cjs
      provides: "a fake home with a populated legacy runtime and keyed state"
      exports: ["legacyRuntimeHome"]
  key_links:
    - from: "hooks/sync-runtime.js"
      to: "runtime-state-migrate.cjs migrateLegacyRuntime"
      via: "after the mirror swap, and before the fast path when the marker is absent"
      pattern: "migrateLegacyRuntime"
    - from: "state-rekey.cjs keyForPath"
      to: "upgrade.cjs repoKey"
      via: "same slug+sha1 formula, computed from the path string when realpath fails"
      pattern: "sha1"
---

# TRD 72-07: The runtime home moves to `~/.claude/aoforge/`, and repo-keyed state can follow a moved checkout

<objective>
AOForge's runtime lives at `~/.claude/aoforge/`, but the user's calibration, estimate run state (the EST-11 record of
this very objective), awareness caches, backups and store-mode outbox are under `~/.claude/devflow/`. Carry them over
on the first AOForge session with a backup first, without ever flushing an outbox twice. Separately, the local checkout
moves in 72-26, and every repo-keyed state file is keyed by the checkout's path: give `aof-tools` a verb that copies
that state from the old key to the new one.

Purpose: INST-03 (runtime state shim) and the tool INST-06's checkout move needs.
Output: `runtime-state-migrate.cjs` wired into sync-runtime; `state-rekey.cjs` behind `aof-tools state rekey`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md

Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures, one test at a time.

Measured on this machine at planning: `~/.claude/devflow/` holds backups/ (448 MB, so never copy it), state/
(awareness, backtest, estimates incl. history/, gh-project, outbox, progress-guard, transcript-export), calibration.json,
audit.log (1.7 MB), transcript-index.jsonl, locks/, and the mirrored subdirs (workflows, references, templates, bin,
schemas, stack-profiles) which are NOT state. The repo key of this checkout is `devflow-claude-d3dccfe9`
(`upgrade.repoKey`: basename slug + first 8 hex of sha1(realpath)).

Read narrowly: `hooks/sync-runtime.js` 50-90 (targets), 140-175 (fast path), 255-320 (swap, digest, global upgrade);
`upgrade.cjs` 217-235 (`repoKey`, `backupDirFor`); `estimate-run-store.cjs` 100-130; `awareness-store.cjs`,
`hook-marker-store.cjs`, `gh-outbox.cjs`, `backup-prune.cjs` 353-370 (registry): each one's path function;
`flag-spec.cjs` and `help.cjs` entries for an existing small verb (e.g. `override`) as the model.
</context>

## Test list

**runtime-state-migrate.legacy.test.cjs** (fake home from the fixture; `now` injected)
1. Fresh: legacy runtime populated, no `~/.claude/aoforge/` -> after migrate, calibration.json, audit.log,
   transcript-index.jsonl, stacks/x.md, state/estimates/k.json, state/estimates/history/k/a.json, state/awareness/k.json
   exist under aoforge with identical bytes, and still exist under devflow.
2. state/outbox/k.json and backups/k/ts/ are MOVED: present under aoforge, absent under devflow.
3. An existing `~/.claude/aoforge/calibration.json` is not overwritten (listed in `skipped`).
4. Mirrored subdirs (workflows, references, templates, bin, schemas, stack-profiles) and locks/ are neither copied nor
   moved.
5. Marker JSON written with `from`, ISO `at`, sorted `copied`/`moved`/`skipped`; a second run returns `{ ran: false }`
   and changes nothing.
6. No legacy runtime: `{ ran: false }`, no marker, nothing created.
7. A move target that exists (backups/k/ already under aoforge): the source stays, entry in `skipped`.

**sync-runtime.legacy.test.js** (spawn with CLAUDE_PLUGIN_ROOT = the repo plugin, HOME = fake)
8. First run: mirror lands in `<home>/.claude/aoforge/` with `.plugin-version`; the marker exists; stdout empty, exit 0.
9. Second run with same version and digest (fast path) and the marker present: no migration call (marker mtime
   unchanged).
10. Marker deleted, legacy present, fast path: migration runs once.
11. Migration throws (unreadable legacy dir via an injected env path): one stderr line, exit 0, mirror intact.

**state-rekey.test.cjs**
12. `keyForPath('/x/devflow-claude')` equals `upgrade.repoKey` for an existing dir with the same realpath, and works for
    a non-existent path (string-based).
13. `planRekey({ from, to, userHome })` lists, for each KEYED_STATE entry present under the old key, `{ kind, src, dst }`;
    entries already present at dst are `skip`.
14. `applyRekey` copies files and dirs, never deletes src, never overwrites dst; the backups registry gains a `to` entry
    pointing at the new realpath and keeps the old one.
15. CLI: `aof-tools state rekey --from <old> --to <new> --dry-run --raw` prints the plan, writes nothing; without
    `--dry-run` applies; `--bogus` exits 1 (flag-spec); missing `--from` exits 1 with usage.

<embedded_context>

<codebase_examples>
`upgrade.repoKey` (the formula keyForPath must reproduce):
```js
function repoKey(projectRoot) {
  const real = fs.realpathSync(projectRoot);
  const slug = path.basename(real).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hash8 = crypto.createHash('sha1').update(real).digest('hex').slice(0, 8);
  return `${slug}-${hash8}`;
}
```
`keyForPath(p)`: `real = (() => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } })()`, then the
same two lines. On macOS `/Users/...` has no symlink component, so the string form equals the old realpath.
</codebase_examples>

<anti_patterns>
- Never copy backups/ (hundreds of MB) and never copy the outbox (a copy could be flushed by both plugins).
- Never delete anything under `~/.claude/devflow/`. Cleanup of the old home is a doctor fix (72-15) after the devflow
  plugin is disabled.
- Do not read `os.homedir()` inside the libs: take `userHome` as an argument (tests pass a fake home).
- No SessionStart stdout (it becomes context).
</anti_patterns>

<error_recovery>
- Cross-device rename (EXDEV) when `~/.claude` spans filesystems: fall back to copy-then-remove for MOVE entries only
  after a verified copy; record `moved_by_copy`.
- If a keyed store uses a different key formula (e.g. outbox file prefixes), model it as its own KEYED_STATE entry with
  its own matcher; do not force one shape.
</error_recovery>

</embedded_context>

<gotchas>
- The installed DevFlow 2.15.0 keeps writing to `~/.claude/devflow/` until it is disabled (72-21). The migration runs
  once; anything 2.15.0 writes later stays in the old home. That is why the outbox MOVES (2.15.0 then has nothing to
  flush) and why 72-21 disables the old plugin right after verifying the migration.
- EST-11: the 72 run state must reach `~/.claude/aoforge/state/estimates/` (test 1 covers the shape).
- Live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder: a populated legacy runtime home</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-runtime-fixtures.cjs</files>
  <action>
`legacyRuntimeHome({ repoKey = 'demo-1a2b3c4d', withAoforge = {} })` -> `{ home, legacy, aoforge, cleanup }`: mkdtemp
home; under `<home>/.claude/devflow/`: calibration.json, audit.log, transcript-index.jsonl, stacks/go.md,
state/estimates/<key>.json + history/<key>/2026-10-08T00_00_00_000Z.json, state/awareness/<key>.json,
state/hook-markers/<key>/m.json, state/outbox/<key>.json, backups/<key>/2026-10-08/x, backups/.registry.json (one repo),
locks/, and one file in each mirrored subdir (workflows/x.md, bin/aof-tools.cjs). `withAoforge` pre-creates entries
under `<home>/.claude/aoforge/`. Typed-out small contents. Check with `node -e`. Commit
(`test(72-07): legacy runtime home fixture`).
  </action>
  <verify>node -e "const f=require('./plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-runtime-fixtures.cjs');const h=f.legacyRuntimeHome();console.log(require('fs').readdirSync(h.legacy));h.cleanup()"</verify>
  <done>The builder creates the legacy home described above.</done>
  <recovery>Keep contents tiny; the tests compare bytes.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Runtime state migration and its sync-runtime wiring</name>
  <files>plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.cjs, plugins/aoforge/hooks/sync-runtime.legacy.test.js, plugins/aoforge/hooks/sync-runtime.js</files>
  <action>
RED: tests 1-7, then 8-11 (header test lists first). Run: fail. Commit RED.

GREEN: `migrateLegacyRuntime({ userHome, now = new Date(), fsImpl = fs })` with `COPY_ENTRIES` (calibration.json,
audit.log, transcript-index.jsonl, stacks, state minus state/outbox) and `MOVE_ENTRIES` (state/outbox, backups); paths
from `compat.legacyRuntimeHome/runtimeHome`; recursive copy that skips existing destinations; rename for moves with the
EXDEV fallback. sync-runtime.js: target is already `~/.claude/aoforge` after 72-04 (verify); call the migration (a)
after a good mirror and (b) before the fast-path exit when the marker is missing and the legacy home exists; wrap in
try/catch with one `[aoforge] runtime state migration skipped: <msg>` stderr line. Header comments of both files
describe the copy/move split and why. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/runtime-state-migrate.legacy.test.cjs plugins/aoforge/hooks/sync-runtime.legacy.test.js plugins/aoforge/hooks/sync-runtime.test.js</verify>
  <done>Tests 1-11 pass; the existing sync-runtime suite passes.</done>
  <recovery>If the existing sync-runtime tests assert stderr is empty on a fresh home, the migration must stay silent
when it succeeds (only failures print).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: `aof-tools state rekey`</name>
  <files>plugins/aoforge/aoforge/bin/lib/state-rekey.test.cjs, plugins/aoforge/aoforge/bin/lib/state-rekey.cjs, plugins/aoforge/aoforge/bin/aof-tools.cjs, plugins/aoforge/aoforge/bin/lib/help.cjs, plugins/aoforge/aoforge/bin/lib/flag-spec.cjs</files>
  <action>
RED: tests 12-15. Run: fail. Commit RED.

GREEN: `state-rekey.cjs` with `keyForPath`, `KEYED_STATE` (one entry per store, each with a matcher and a copier,
derived from that store's own path function rather than re-typed paths), `planRekey`, `applyRekey`. Dispatch
`state rekey` in aof-tools.cjs under the existing `state` command family; `help.cjs` entry (summary: "Copy repo-keyed
runtime state from a moved checkout's old key to its new key; never deletes"); `flag-spec.cjs` entry
(`--from`, `--to`, `--dry-run`, `--raw`). Run the flag-spec and dispatch-completeness repo tests. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/state-rekey.test.cjs plugins/aoforge/aoforge/bin/lib/flag-spec.repo.test.cjs plugins/aoforge/aoforge/bin/lib/dispatch-completeness.test.cjs</verify>
  <done>Tests 12-15 pass; flag-spec and dispatch-completeness repo tests pass; full suite at baseline.</done>
  <recovery>If `state` subcommand dispatch is in `state.cjs`, add `rekey` there instead and keep aof-tools.cjs
untouched (record the actual file in the SUMMARY).</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'</test>
</validation_gates>

<verification>
- `HOME=<fake> node plugins/aoforge/aoforge/bin/aof-tools.cjs state rekey --from /tmp/old --to /tmp/new --dry-run --raw`
  prints a plan and writes nothing.
- `rg -n "migrateLegacyRuntime" plugins/aoforge/hooks/sync-runtime.js` shows both call sites.
</verification>

<success_criteria>
- The first AOForge session carries the user's runtime state over safely; a moved checkout's state can follow it.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-07-SUMMARY.md` through
`df-tools summary post`.
</output>
