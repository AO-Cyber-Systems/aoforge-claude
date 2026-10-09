---
mode: quick
id: 25-move-progress-guard-state-out-of-project
title: "Move no-progress guard state out of the project tree (per-session files under ~/.claude/devflow/state/progress-guard/)"
type: standard
tasks: 3
context_target: ~30%
files_modified:
  - plugins/devflow/devflow/bin/lib/progress-guard-store.cjs
  - plugins/devflow/devflow/bin/lib/progress-guard-store.test.cjs
  - plugins/devflow/hooks/guard-no-progress.js
  - plugins/devflow/hooks/guard-no-progress.test.js
  - plugins/devflow/devflow/bin/lib/telemetry.cjs
  - plugins/devflow/devflow/bin/lib/telemetry.test.cjs
  - CHANGELOG.md
  - CLAUDE.md
must_haves:
  observable_truths:
    - "Running the hook in a DevFlow project never creates or modifies `<project>/.planning/.progress-guard.json`."
    - "State lands in `$DEVFLOW_PROGRESS_GUARD_DIR/<sanitized session_id>.json` when the env var is set. Otherwise it goes to `~/.claude/devflow/state/progress-guard/<sanitized session_id>.json` (via `os.homedir()`)."
    - "Each session file holds only that session's `{guard, updated, project}`. Two sessions produce two files, and neither file contains the other's data."
    - "A session_id with unsafe characters (`../x`, `a/b`, spaces) maps to a filename made of `[A-Za-z0-9_-]` only. An empty or missing id maps to `unknown`. Nothing is ever written outside the state dir."
    - "Sibling files whose mtime is older than SESSION_TTL_MS (24h) are deleted at most once per session (on that session's first write). Fresh siblings survive."
    - "The escalation ladder is unchanged: warn on the 3rd identical call, `ask` on the 5th, no re-fire on the 6th."
    - "Fail-open: an unwritable or unreadable state dir, or a corrupt session file, produces exit 0, no stdout decision, and no throw."
    - "`df-tools telemetry` progress_guard still reports worst_streak and the stuck-loop advisory. It reads the new per-session files, filtered to the current project."
    - "`progress-guard.cjs` and migration 0008 are byte-for-byte unchanged."
  artifacts:
    - "progress-guard-store.cjs: node builtins only (fs, os, path). Exports stateDir, sanitizeSessionId, sessionFile, readSession, writeSession, pruneStale, listSessions."
    - "guard-no-progress.js: uses the store and no longer references the STATE_FILE constant."
    - "telemetry.cjs: progress-guard section reads through `listSessions`."
    - "CHANGELOG.md: one `### Fixed` line under `## [Unreleased]`."
  key_links:
    - "The hook requires `../devflow/bin/lib/progress-guard-store.cjs`. The store must not require helpers.cjs or anything that reads JSON at module load, same rule as progress-guard.cjs."
    - "The hook writes `project` = the realpath of the directory containing `.planning`. Telemetry filters by `project === realpath(dirname(planningDir))`, so a project's telemetry only counts its own sessions."
---

<objective>
`guard-no-progress.js` runs on every tool call and rewrites `<project>/.planning/.progress-guard.json`, one JSON file shared by every session. Claude Code's file watcher then attaches the whole file (~2.5KB, ~800 tokens) to the next tool result as "Updated .planning/.progress-guard.json (+1 -1)", on every call. Concurrent sessions also race on read-modify-write.

Move the state to per-session files under `~/.claude/devflow/state/progress-guard/` (env-overridable), prune stale siblings cheaply, stay fail-open, and repoint telemetry at the new location. Existing repos keep migration 0008 unchanged, since it already untracks the legacy file.
</objective>

<context>
Project kind is `plugin` (the DevFlow repo). TDD is strict: commit each failing test (RED) in its own `test(quick-25): ...` commit before the implementation (GREEN, `fix(quick-25): ...`). Commit only through `node ~/.claude/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`. Raw git commit is gated.

Test runner: `npm test` runs the full suite. For single files, use `node --test plugins/devflow/hooks/guard-no-progress.test.js`, `node --test plugins/devflow/devflow/bin/lib/progress-guard-store.test.cjs`, or `node --test plugins/devflow/devflow/bin/lib/telemetry.test.cjs`.

Every test MUST set `DEVFLOW_PROGRESS_GUARD_DIR` to a `fs.mkdtempSync` dir. No test may write to the real `~/.claude`.

Do NOT change these references to `.progress-guard.json`. They test migration 0008 or commit behaviour for the legacy file, and they stay valid:
- `df-tools.test.cjs:3791, :3891`
- `upgrade-project.test.js:401-431`
- `migrations/0008-*.cjs` and its test
- `commit-staged-removal.test.cjs`
- `__fixtures__/upgrade-fixtures.cjs`

Do NOT modify `bin/lib/progress-guard.cjs` (the record/message logic, DEFAULT_WINDOW = 40).

Keep the existing gating: the hook still returns early when there is no `.planning/` above cwd. The guard stays DevFlow-scoped, and the planning dir is how `project` gets derived. It just never writes there.

Constraints: hand-built fixtures only (no generated data, no property-based tests, no .feature files). Never use port 8080. Nothing here needs a port.
</context>

<embedded_context>
<codebase_examples>
Current hook core (guard-no-progress.js:84-97). This is the part to replace:
```js
const planningDir = findPlanningDir(process.cwd());
if (!planningDir) return; // not a DevFlow project
const sessionId = String(input.session_id || 'unknown');
const file = path.join(planningDir, STATE_FILE);
const now = Date.now();
const all = prune(loadState(file), now);
const prior = (all[sessionId] && all[sessionId].guard) || null;
const result = record(prior, { tool, args: input.tool_input || {} });
all[sessionId] = { guard: result.state, updated: now };
saveState(file, all);
```
Current exports: `module.exports = { findPlanningDir, prune, IGNORED_TOOLS, SESSION_TTL_MS };`. Keep `findPlanningDir`, `IGNORED_TOOLS`, and `SESSION_TTL_MS`. Drop `prune` because the object-prune is gone, and remove its test.

Current telemetry reader (telemetry.cjs ~45-58):
```js
try {
  const raw = fs.readFileSync(path.join(planningDir, '.progress-guard.json'), 'utf8');
  const all = JSON.parse(raw);
  const sessions = Object.entries(all).map(([sid, e]) => ({ session: sid, streak: (e && e.guard && e.guard.streak) || 0, updated: e && e.updated })).sort(...);
  out.progress_guard = { sessions_tracked: sessions.length, worst_streak: ... };
  if (worst_streak >= 3) out.advisories.push(`a session repeated the same call ${n}x — check for a stuck loop`);
} catch { out.progress_guard = { sessions_tracked: 0, worst_streak: 0 }; }
```
Its tests (telemetry.test.cjs:50-90) write `pd/.progress-guard.json` directly. Rewrite them to write per-session files into a temp `progressGuardDir` with `project` set to the realpath of `dir`.

Hook subprocess test harness (guard-no-progress.test.js): `run(cwd, body, env)` spawns the hook with `{...process.env, ...env}`, and `mkProject()` makes a tmp dir containing `.planning/`.
</codebase_examples>

<anti_patterns>
- Do not sanitize with a denylist. Use an allowlist: `String(id).replace(/[^A-Za-z0-9_-]/g, '_')`. If the result is empty, or only `_`/`-` characters, use `unknown`. Cap the length at 128 characters.
- Do not prune on every call, and do not use `Math.random`. Prune exactly when the session file did not exist before this write (the session's first call). That is deterministic, testable, and bounded to one readdir per session.
- Do not let prune touch non-`.json` files, subdirectories, or the current session's file.
- Do not add a `try` that swallows errors around `record()`/`message()` output logic in a way that changes the ladder. Only fs operations are wrapped.
- Do not write with a tmp-file-then-rename unless it is trivial. A plain `writeFileSync` of a per-session file has no cross-session race.
- Do not keep a fallback read of `.planning/.progress-guard.json` in telemetry. After migration 0008 that file is dead and stale, and reading it would report ghost streaks.
</anti_patterns>

<error_recovery>
- macOS tmp dirs resolve `/var/...` to `/private/var/...`. If the telemetry project filter misses, compare `fs.realpathSync` on both sides. In the hook, `process.cwd()` in a subprocess is already a realpath. Still, realpath `dirname(planningDir)` inside a try and fall back to the raw path.
- If a fail-open test is flaky, make the state dir unwritable by pointing `DEVFLOW_PROGRESS_GUARD_DIR` at an existing regular FILE, not at a chmod'd dir. chmod behaves differently when running as root.
- If `mkdirSync(dir, {recursive:true})` throws, return silently, but only for the persistence part. The trip decision for this call still uses `prior = null`.
</error_recovery>
</embedded_context>

## Test list

Hook (outermost: subprocess with real payloads, `guard-no-progress.test.js`):
1. Six identical calls with `DEVFLOW_PROGRESS_GUARD_DIR=<tmp>`: warn on call 3, ask on call 5, silent on call 6. This is the existing ladder test, now with the env set.
2. After a call, `<project>/.planning/.progress-guard.json` does not exist, and `<stateDir>/s1.json` exists and parses to `{guard, updated, project}`.
3. Sessions `s1` and `s2` produce two files. `s1.json` contains no `s2` data.
4. Two sessions interleaved (s1, s2, s1, s2, s1, ...) each trip independently at their own 3rd/5th call.
5. Session id `../evil/x y` writes a file whose basename matches `^[A-Za-z0-9_-]+\.json$` inside the state dir. Nothing is created outside it.
6. Stale prune: pre-create `old.json` with mtime set 25h back (`fs.utimesSync`), plus `fresh.json` (now), plus `note.txt` (25h back). The first call of a new session removes `old.json` and keeps `fresh.json` and `note.txt`.
7. Fail-open: `DEVFLOW_PROGRESS_GUARD_DIR` points at a regular file. Exit 0, no decision, no throw on stderr.
8. Corrupt session file (`s1.json` = `{{{ broken`): exit 0, no decision. This replaces the old corrupt-`.planning`-file test.
9. Unchanged behaviour: malformed stdin, `DEVFLOW_SKIP_PROGRESS_GUARD=1`, ignored bookkeeping tools, and no `.planning/` above cwd give a no-op with no file written.

Store unit (`progress-guard-store.test.cjs`):
10. `stateDir({DEVFLOW_PROGRESS_GUARD_DIR:'/x'})` returns `/x`. `stateDir({})` returns `path.join(os.homedir(), '.claude','devflow','state','progress-guard')`.
11. `sanitizeSessionId`: `'abc-123_X'` stays unchanged. `'../a/b'` is safe. `''`/`undefined`/`null`/`'..'` return `'unknown'`. A 500-character input is capped at 128.
12. `listSessions(dir)` returns `[{session, guard, updated, project}]`, skips corrupt and non-json files, and returns `[]` for a missing dir.

Telemetry (`telemetry.test.cjs`):
13. A per-session file with streak 6 and `project` = this project gives `worst_streak` 6 and the stuck-loop advisory.
14. A streak-6 file whose `project` is a DIFFERENT path is ignored, so `worst_streak` is 0.
15. A missing or empty guard dir gives `{sessions_tracked:0, worst_streak:0}`, with no throw.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: progress-guard-store.cjs — per-session state primitives (RED then GREEN)</name>
  <files>plugins/devflow/devflow/bin/lib/progress-guard-store.cjs, plugins/devflow/devflow/bin/lib/progress-guard-store.test.cjs</files>
  <action>
RED: create `progress-guard-store.test.cjs` covering test-list cases 10-12, plus direct unit cases for `pruneStale`: stale .json removed, fresh kept, non-json kept, `keep` file kept even if stale, missing dir returns 0. Use `fs.mkdtempSync(path.join(os.tmpdir(), 'pgs-'))` and hand-built JSON. Commit: `test(quick-25): progress-guard per-session store (RED)`.

GREEN: create the module. Use only `fs`, `os`, `path` (it is loaded from a hook, so no helpers.cjs):
- `stateDir(env = process.env)` returns `env.DEVFLOW_PROGRESS_GUARD_DIR` if non-empty, else `path.join(os.homedir(), '.claude', 'devflow', 'state', 'progress-guard')`.
- `sanitizeSessionId(id)` works as described in anti_patterns.
- `sessionFile(dir, id)` returns `path.join(dir, sanitizeSessionId(id) + '.json')`.
- `readSession(file)` returns the parsed object or `null`, never throwing.
- `writeSession(file, obj)` runs `mkdirSync(dirname, {recursive:true})` then `writeFileSync`. It returns true or false and never throws.
- `pruneStale(dir, nowMs, ttlMs, keepFile)` reads the dir, and for each `*.json` entry that is a file, not `keepFile`, and has `nowMs - mtimeMs > ttlMs`, runs `unlinkSync`. It returns the removed count and wraps each entry in its own try.
- `listSessions(dir)` returns `[{session: basename without .json, guard, updated, project}]` for readable json files only.

Header comment: say why this exists. Per-call rewrites of an in-repo file were attached to every tool result by the file watcher, and the shared file raced across sessions.

Commit: `fix(quick-25): add per-session progress-guard store`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/progress-guard-store.test.cjs` passes, and `rg -n "require\(" plugins/devflow/devflow/bin/lib/progress-guard-store.cjs` shows only fs/os/path.</verify>
  <done>Store module and tests committed as RED then GREEN. All store cases pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: rewire guard-no-progress hook + telemetry to the store (RED then GREEN)</name>
  <files>plugins/devflow/hooks/guard-no-progress.test.js, plugins/devflow/hooks/guard-no-progress.js, plugins/devflow/devflow/bin/lib/telemetry.test.cjs, plugins/devflow/devflow/bin/lib/telemetry.cjs</files>
  <action>
RED:
- In `guard-no-progress.test.js`, create a per-test state dir and pass `DEVFLOW_PROGRESS_GUARD_DIR` in every `run()`. Change `run` so it defaults `env` to include it, and have the helper return both the project and the state dir. Add test-list cases 2-9. Replace the `.planning/.progress-guard.json` corrupt-file test (line ~109) with case 8. Replace the `prune()` unit test and the "single small JSON object" test (lines ~141-163) with case 3 (per-session isolation) and case 6 (stale prune). Remove `prune` from the require.
- In `telemetry.test.cjs`, rewrite the progress-guard cases (~50-90) to cases 13-15. Pass `progressGuardDir: <tmp>` into `collect()`, and write files with `project: fs.realpathSync(dir)`.

Commit: `test(quick-25): guard state leaves .planning; telemetry reads per-session files (RED)`.

GREEN, hook (see the codebase_examples block for the current code):
```
planningDir = findPlanningDir(cwd); if (!planningDir) return
project = realpath(dirname(planningDir)) || dirname(planningDir)
dir = store.stateDir(); file = store.sessionFile(dir, input.session_id)
existed = fs.existsSync(file)  (in try; false on error)
prior = (store.readSession(file) || {}).guard || null
result = record(prior, {tool, args})
store.writeSession(file, { guard: result.state, updated: now, project })
if (!existed) try { store.pruneStale(dir, now, SESSION_TTL_MS, file) } catch {}
...unchanged trip/message/output logic
```
- Delete `STATE_FILE`, `loadState`, `saveState`, and `prune`.
- Update the header comment with the state location, the env override, and why it moved.
- Exports become `{ findPlanningDir, IGNORED_TOOLS, SESSION_TTL_MS }`.

GREEN, telemetry:
- `collect({ planningDir, progressGuardDir = store.stateDir(), ... })`.
- `project = realpath(dirname(planningDir))`.
- `sessions = store.listSessions(progressGuardDir).filter(s => s.project === project)`.
- Keep the same output shape and advisory text.
- Update the Sources header line to the new path.
- Before editing, check the `collect` destructuring to see which options it takes, and add `progressGuardDir` without disturbing the others.

Commit: `fix(quick-25): progress-guard state out of the repo; telemetry follows`.
  </action>
  <verify>Run `node --test plugins/devflow/hooks/guard-no-progress.test.js plugins/devflow/devflow/bin/lib/telemetry.test.cjs`; it passes. Then `git diff --stat HEAD~4 -- plugins/devflow/devflow/bin/lib/progress-guard.cjs plugins/devflow/devflow/bin/lib/migrations/` should be empty. Then `rg -n "progress-guard.json" plugins/devflow/hooks/guard-no-progress.js plugins/devflow/devflow/bin/lib/telemetry.cjs` should only hit comments explaining the move, if anything.</verify>
  <done>The hook writes only to the state dir. Per-session isolation, stale prune, and fail-open are covered by passing tests. Telemetry reports streaks from the new files, scoped to the project.</done>
  <recovery>If the ladder test regresses, diff the trip/output block against HEAD; it must be byte-identical below the `writeSession` call. If telemetry filtering fails only on macOS, see error_recovery (realpath).</recovery>
</task>

<task type="auto">
  <name>Task 3: docs, full suite, awareness-cache investigation</name>
  <files>CHANGELOG.md, CLAUDE.md</files>
  <action>
- CHANGELOG.md: under `## [Unreleased]`, add a `### Fixed` section if none exists (Keep-a-Changelog order: Added, Changed, Fixed). Add one entry: the no-progress guard kept its state in `.planning/.progress-guard.json`, which it rewrote on every tool call. The file watcher attached it to every tool result (~800 tokens per call), and concurrent sessions raced on it. State now lives per session in `~/.claude/devflow/state/progress-guard/<session>.json` (override: `DEVFLOW_PROGRESS_GUARD_DIR`), stale files are pruned after 24h, and `df-tools telemetry` reads from there. Migration 0008 still untracks the legacy file.
- CLAUDE.md line ~122 (the `guard-no-progress.js` bullet): append one short sentence before "Escape:": "State is per-session under `~/.claude/devflow/state/progress-guard/` (never in the repo; override `DEVFLOW_PROGRESS_GUARD_DIR`)." Also, if the telemetry bullet (~line 38) names `.progress-guard.json`, fix it. It currently does not, so verify with rg.
- Run `npm test`. The full suite must pass.
- Investigation, read-only unless trivial: read `plugins/devflow/hooks/awareness-cache-populate.js` and `hooks.json` and confirm when `.planning/.awareness-cache.json` is written. Check the event registration, whether any PreToolUse/PostToolUse/UserPromptSubmit path writes it, and whether the TTL (10 min) causes rewrites mid-session. Report in the SUMMARY: events that write it, expected writes per session, and whether it shows the per-call churn problem. Do not change it.

Commit: `docs(quick-25): changelog + CLAUDE.md for progress-guard state move`.
  </action>
  <verify>`npm test` exits 0. `rg -n "progress-guard" CLAUDE.md CHANGELOG.md` shows the new notes.</verify>
  <done>Docs updated, the full suite is green, and the SUMMARY records the awareness-cache finding.</done>
</task>

</tasks>

<verification>
- `npm test` is green.
- Manual smoke, in a scratch dir containing `.planning/`: `echo '{"session_id":"smoke","tool_name":"Bash","tool_input":{"command":"x"}}' | DEVFLOW_PROGRESS_GUARD_DIR=<scratch>/pg node plugins/devflow/hooks/guard-no-progress.js`. It should create `<scratch>/pg/smoke.json` and leave `<scratch>/.planning/` empty.
- `progress-guard.cjs` and `migrations/0008-*` are unchanged.
</verification>

<success_criteria>
- No tool call in a DevFlow project writes into `.planning/` from this hook, which removes the per-call file-watcher attachment.
- Per-session files remove the cross-session read-modify-write race.
- The ladder, escape hatch, ignored tools, and fail-open behaviour are all preserved.
- Telemetry stuck-loop advisory still works.
</success_criteria>

<output>
Write `.planning/quick/25-move-progress-guard-state-out-of-project/25-SUMMARY.md`. Include the commits, what changed, and the awareness-cache investigation result.
</output>
