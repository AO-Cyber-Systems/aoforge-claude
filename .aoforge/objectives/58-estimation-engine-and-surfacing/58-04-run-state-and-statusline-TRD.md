---
objective: 58-estimation-engine-and-surfacing
trd: "04"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/estimate-run-store.cjs
  - plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs
  - plugins/devflow/hooks/statusline.js
  - plugins/devflow/hooks/statusline-estimate.test.js
autonomous: true
requirements: [EST-05]
must_haves:
  truths:
    - "The estimate run state lives at $DEVFLOW_ESTIMATE_STATE_DIR or ~/.claude/devflow/state/estimates/<repo-key>.json, never inside the project, and is written atomically"
    - "remainingMinutes(state, now) sums the median of every unfinished wave, less the elapsed time of the wave in progress, and flags a wave that has run past its P90"
    - "A finished run, a run not updated for 12 hours, a malformed file or a missing file shows nothing"
    - "While a run is live the status line shows `⏱ <objective> W<current>/<total> ~<time> left` (or `over P90`, or no time when the estimate is missing), read from the cached run state only"
    - "The status line stays fail-open: no run-store lib, no state or a broken state leaves the rest of the line unchanged and exits 0"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/estimate-run-store.cjs
      provides: "STALE_MS, stateRoot, statePath, findProjectRoot, readRunState, writeRunState, clearRunState, remainingMinutes, formatStatusSegment"
    - path: plugins/devflow/hooks/statusline.js
      provides: "estimate segment read from the synced estimate-run-store lib"
  key_links:
    - "statusline.js -> ~/.claude/devflow/bin/lib/estimate-run-store.cjs (synced runtime) -> <state dir>/<repo-key>.json"
    - "58-08 `df-tools estimate start|wave|finish` -> writeRunState / readRunState (the only writer)"
---

# TRD 58-04: Estimate run state and the status line (EST-05)

<objective>
EST-05 asks the status line to show estimated time remaining while an objective builds. The status line renders on
every turn, so it must not compute anything: it reads one small JSON file that `df-tools estimate start|wave|finish`
(58-08) keeps up to date, and turns it into one segment.

This TRD defines that file (schema version 1), the store that reads and writes it outside the repository, the pure
remaining-time rule, and the status line segment. It is independent of the estimator: the CLI that fills the file
lands in 58-08.

Run state schema (version 1), documented in the module header:

```json
{
  "version": 1,
  "objective": "58",
  "started_at": "2026-10-05T18:00:00.000Z",
  "updated_at": "2026-10-05T18:15:00.000Z",
  "finished_at": null,
  "estimate": { "line": "Objective 58 estimate: ...", "wall_minutes": { "p50": 70, "p90": 145 }, "confidence": "medium" },
  "waves": [
    { "wave": 1, "trds": ["58-01", "58-02"], "p50": 12, "p90": 36,
      "started_at": "2026-10-05T18:00:00.000Z", "finished_at": "2026-10-05T18:14:00.000Z", "actual_minutes": 14 },
    { "wave": 2, "trds": ["58-03"], "p50": 20, "p90": 50, "started_at": "2026-10-05T18:15:00.000Z", "finished_at": null, "actual_minutes": null },
    { "wave": 3, "trds": ["58-04"], "p50": 8, "p90": 20, "started_at": null, "finished_at": null, "actual_minutes": null }
  ]
}
```

`estimate` and a wave's `p50`/`p90` may be null (no calibration): the run still records timings.

Purpose: the cached, out-of-repo source for "the status line shows estimated time remaining".
Output: estimate-run-store.cjs (+ test), the statusline segment (+ a new spawn test file).
</objective>

<file_tree>
plugins/devflow/
├── devflow/bin/lib/estimate-run-store.cjs        ← CREATE
├── devflow/bin/lib/estimate-run-store.test.cjs   ← CREATE
├── hooks/statusline.js                           ← MODIFY (estimate segment)
└── hooks/statusline-estimate.test.js             ← CREATE
</file_tree>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD per task: `test(58-04): ...` RED, then `feat(58-04): ...`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. One plain command per Bash
  call.
- **Runtime state never goes in `.planning/` or the repo** (hooks/planning-writes.audit.test.js fails CI otherwise). The
  store follows hook-marker-store.cjs: an env override, else `<home>/.claude/devflow/state/<name>/`, one file per repo key.
- Tests never touch the real `~/.claude`: unit tests inject `env.DEVFLOW_ESTIMATE_STATE_DIR` and `home`; spawn tests set
  `HOME` to a temp dir and install the libs there.
- The store is loaded by a hook, so node builtins plus `./upgrade.cjs` only (upgrade.cjs loads fs/path/crypto and reads
  nothing at load). No other lib requires.
- Same wave: 58-01 owns estimate-math, 58-02 owns agent-overhead and transcript fixtures. Do not modify
  `statusline.test.js` or `daemon-polish-fixtures.cjs`; reuse the fixture helpers read-only.

## Test list

Outermost first.

`hooks/statusline-estimate.test.js` (spawned statusline, fake HOME with `estimate-run-store.cjs` and `upgrade.cjs` copied
into `<HOME>/.claude/devflow/bin/lib/`, `DEVFLOW_ESTIMATE_STATE_DIR=<HOME>/est`, a project dir with `.planning/`; the
state is written through the store module from the repo source; times relative to the real clock):

1. Live run, wave 2 of 3 started 5 minutes ago (p50 20, p90 50), wave 3 p50 8: the stripped output contains
   `⏱ 58 W2/3 ~2` followed by `m left` (22 or 23 minutes, allow both).
2. No state file: no `⏱` in the output; model and directory still render; exit 0.
3. Lib not installed in the fake HOME: no `⏱`; the rest of the line renders; exit 0.
4. Malformed state JSON: no `⏱`, empty stderr, exit 0.
5. `finished_at` set: no `⏱`.
6. `workspace.current_dir` is `<project>/sub/dir`: the segment still shows (the project root is found upward).

`estimate-run-store.test.cjs` (unit; `now` injected as epoch ms):

7. `writeRunState(root, state, opts)` then `readRunState(root, opts)` round-trips; the file is
   `<stateDir>/<repoKey>.json`, not under `root`; no `.tmp` file remains. `clearRunState` removes it.
8. `readRunState` gives null for a missing file, malformed JSON, `version: 2`, or a state without `objective` / `waves`;
   it never throws.
9. `remainingMinutes` on the schema example with now = 18:25Z: `{minutes: 18, wave: 2, waves: 3, done: 1, over: false}`
   (wave 2: 20 - 10; wave 3: 8). At now = 19:20Z (wave 2 elapsed 65 > P90 50): `{minutes: 8, wave: 2, over: true}`.
10. Null when `finished_at` is set, or `updated_at` is more than `STALE_MS` (12 h) before now. All waves finished gives
    `{minutes: 0, wave: null, ...}`.
11. A null `p50` on an unfinished wave gives `minutes: null`.
12. `formatStatusSegment`: `⏱ 58 W2/3 ~18m left` (now 18:25Z); `⏱ 58 W2/3 over P90` (19:20Z); 75 remaining minutes gives
    `~1h 15m left`; null minutes gives `⏱ 58 W2/3`; all waves finished, finished, stale or null state gives `''`. A
    resumed run whose state holds only waves 6 and 7 (wave 6 in progress) shows `W6/7`: the number after the slash is
    the highest wave number in the state, not the count of waves.
13. `findProjectRoot(<root>/a/b)` is `<root>`; a temp dir with no `.planning` above it gives null (cap 8 levels).
    `stateRoot(env, home)` honours `DEVFLOW_ESTIMATE_STATE_DIR`, else `<home>/.claude/devflow/state/estimates`.

<embedded_context>

<codebase_examples>
Out-of-repo store pattern (hook-marker-store.cjs, objective 45):

```js
function markerRoot(env = process.env, home) {
  const override = env && env.DEVFLOW_HOOK_MARKER_DIR;
  if (override) return override;
  return path.join(home || os.homedir(), '.claude', 'devflow', 'state', 'hook-markers');
}
/** upgrade.repoKey, falling back to the sanitized directory name when the path cannot be resolved. */
function repoKeyOf(projectRoot) {
  try {
    return require('./upgrade.cjs').repoKey(projectRoot);
  } catch {
    return sanitize(path.basename(String(projectRoot)));
  }
}
```

How statusline.js loads a synced lib today (20-04 watcher segment), fail-open:

```js
let watcherStatus = '';
try {
  ...
  if (_stateLibPath === null) {
    _stateLibPath = path.join(homeDir, '.claude', 'devflow', 'bin', 'lib', 'watcher-state.cjs');
  }
  if (_stateLib === null && fs.existsSync(_stateLibPath)) {
    _stateLib = require(_stateLibPath);
  }
  ...
} catch (e) {
  // statusline must NEVER crash on watcher state errors
}
...
const wsBlock = watcherStatus ? ` │ ${watcherStatus}` : '';
process.stdout.write(`\x1b[2m${model}\x1b[0m │ \x1b[2m${dirname}\x1b[0m${wsBlock}${ctx}`);
```

Spawn helpers to reuse read-only (`__fixtures__/daemon-polish-fixtures.cjs`): `buildStatuslineInput({workspace_dir,
session_id, remaining_pct})`, `runStatuslineSubprocess({input, env})` (5 s timeout), `stripAnsi(s)`.
</codebase_examples>

<anti_patterns>
- Any transcript, TRD or calibration read in the status line. It reads the one state file; everything else happens in
  `df-tools estimate` when a wave starts or ends.
- Writing from the status line. It only reads; 58-08's CLI is the only writer.
- Throwing from `readRunState`. A corrupt or half-written file must look like "no run".
- `os.homedir()` at module load, or caching the state between renders (each render is a fresh process anyway).
</anti_patterns>

<error_recovery>
- If test 1 is flaky by a minute, the remaining time is rounded with `Math.ceil` on a value computed from the real
  clock; accept both neighbours (the test already allows 22 or 23).
- If the existing `statusline.test.js` or `planning-writes.audit.test.js` changes output, the segment rendered without a
  live run. It must be the empty string unless a valid, unfinished, fresh state exists.
</error_recovery>

</embedded_context>

<context>
@plugins/devflow/hooks/statusline.js
@plugins/devflow/devflow/bin/lib/hook-marker-store.cjs
</context>

<gotchas>
- Time format: under 60 minutes `~18m left`; 60 or more `~1h 15m left` (minutes two digits: `~2h 05m left`). Round the
  remaining minutes up (`Math.ceil`), so a live wave never shows `~0m` while time remains.
- Segment colour: ANSI 256 gold `\x1b[38;5;178m` for the normal segment, red `\x1b[31m` for `over P90`. Place it after
  the watcher block and before the context bar: `...${wsBlock}${estBlock}${ctx}` with `estBlock = seg ? ` │ ${...}` : ''`.
- `findProjectRoot` looks for a `.planning` directory walking up from `workspace.current_dir`, at most 8 levels.
- Known `npm test` baseline failures: handoff-e2e MA-7, stack-drafter-fleet github-enterprise-migration, roadmap-reconcile
  E2E1 while a TRD of the running objective is unticked.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: estimate-run-store: schema, out-of-repo storage, remaining time, segment text</name>
  <files>plugins/devflow/devflow/bin/lib/estimate-run-store.cjs, plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs</files>
  <action>
RED: tests 7-13 with literal states (the schema example in the objective). Commit
`test(58-04): estimate run state and remaining time`.

GREEN:
1. `STALE_MS = 12 * 60 * 60 * 1000`, `STATE_VERSION = 1`.
2. `stateRoot(env = process.env, home)`, `repoKeyOf(root)` (hook-marker-store pattern), `statePath(root, {env, home})`.
3. `findProjectRoot(start, maxUp = 8)`.
4. `readRunState(root, opts)`: parse; return null unless `version === 1`, `objective` is a non-empty string and `waves` is
   an array. Wrap everything in try/catch.
5. `writeRunState(root, state, opts)`: mkdir -p the state root, write `<file>.tmp`, `renameSync`; return `{path}`.
   `clearRunState(root, opts)`: rm -f.
6. `remainingMinutes(state, now)`: null for a null/finished state or `now - Date.parse(updated_at) > STALE_MS` (or an
   unparsable updated_at). Sort waves by `wave`. `waves` = the highest wave number in the state (a resumed run may
   start at wave 6); `done` = finished waves. Current = first wave without `finished_at`. If none:
   `{minutes: 0, wave: null, waves, done, over: false}`. Otherwise minutes is null if any unfinished wave has a null p50,
   else the sum of `p50 - elapsed` (floored at 0) for the started one and `p50` for the rest. `over` = the current wave
   started and its elapsed exceeds a non-null p90.
7. `formatStatusSegment(state, now)` per test 12 (text only, no ANSI; the hook adds colour).
Write the schema and the "only 58-08's CLI writes this file" rule in the header comment.
Commit `feat(58-04): estimate run state store`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs` passes tests 7-13.</verify>
  <done>Tests 7-13 pass after a recorded RED; the module requires only node builtins and ./upgrade.cjs.</done>
  <recovery>If `upgrade.repoKey` throws for a temp dir (not realpath-able), the fallback to the sanitized basename applies; assert the path ends with `.json` rather than an exact key in that case.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Status line estimate segment</name>
  <files>plugins/devflow/hooks/statusline.js, plugins/devflow/hooks/statusline-estimate.test.js</files>
  <action>
RED: tests 1-6 in the new `statusline-estimate.test.js` (build the fake HOME per test, `t.after` cleans up). Commit
`test(58-04): status line shows estimated time remaining`.

GREEN in statusline.js, after the watcher block, in its own try/catch:
1. Resolve `~/.claude/devflow/bin/lib/estimate-run-store.cjs` from `os.homedir()`; skip unless it exists.
2. `root = store.findProjectRoot(dir)`; `seg = root ? store.formatStatusSegment(store.readRunState(root), Date.now()) : ''`.
3. Colour per gotchas and append before `${ctx}` in both output branches.
Update the header comment line ("Shows: ...") to mention the estimate segment.
Commit `feat(58-04): estimate segment in the status line`.
  </action>
  <verify>`node --test plugins/devflow/hooks/statusline-estimate.test.js plugins/devflow/hooks/statusline.test.js plugins/devflow/hooks/planning-writes.audit.test.js` passes. `rg -n -e '\.jsonl|projects' plugins/devflow/hooks/statusline.js` prints nothing.</verify>
  <done>Tests 1-6 pass after a recorded RED; the existing statusline and planning-writes audit suites are unchanged and green.</done>
  <recovery>If the existing statusline tests break, the segment leaked into output without a live state; check that `formatStatusSegment(null)` returns '' and the block is skipped when the lib is absent.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/estimate-run-store.test.cjs plugins/devflow/hooks/statusline-estimate.test.js plugins/devflow/hooks/statusline.test.js plugins/devflow/hooks/planning-writes.audit.test.js</test_scoped>
<!-- lint/build: none in the stack profile. If micro.test.cjs hangs on commit signing, run the suite without it:
     node --test 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs' -->
</validation_gates>

<verification>
- EST-05 (status line half): the segment renders from cached state only and disappears when no run is live.
- The state file is outside the repository (test 7) and the planning-writes audit still passes.
</verification>

<success_criteria>
- Both new suites pass; statusline.test.js and planning-writes.audit.test.js unchanged and green.
- Full `npm test` shows no failures beyond the known baseline ones.
</success_criteria>

<output>
After completion, publish `58-04-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Record the run state schema and the store API; 58-08 writes the file.
</output>
