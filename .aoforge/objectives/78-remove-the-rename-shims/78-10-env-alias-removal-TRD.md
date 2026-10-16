---
objective: 78-remove-the-rename-shims
trd: "10"
type: standard
wave: 3
depends_on: ["78-02", "78-04", "78-05", "78-06", "78-07"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs
  - plugins/aoforge/aoforge/bin/aof-tools.cjs
  - plugins/aoforge/aoforge/bin/aoforge-watch.cjs
  - plugins/aoforge/hooks/auto-continue.js
  - plugins/aoforge/hooks/awareness-cache-populate.js
  - plugins/aoforge/hooks/changelog-on-tag.js
  - plugins/aoforge/hooks/classify-session.js
  - plugins/aoforge/hooks/coexistence-guard.js
  - plugins/aoforge/hooks/gate-bash-writes.js
  - plugins/aoforge/hooks/gate-commits.js
  - plugins/aoforge/hooks/gate-edits.js
  - plugins/aoforge/hooks/gate-edits.test.js
  - plugins/aoforge/hooks/gate-executor-stop.js
  - plugins/aoforge/hooks/gate-interactive.js
  - plugins/aoforge/hooks/gate-skill-requires.js
  - plugins/aoforge/hooks/gh-flush.js
  - plugins/aoforge/hooks/guard-no-progress.js
  - plugins/aoforge/hooks/inject-handoff-results.js
  - plugins/aoforge/hooks/inject-org-context.js
  - plugins/aoforge/hooks/route-intent.js
  - plugins/aoforge/hooks/route-results.js
  - plugins/aoforge/hooks/statusline.js
  - plugins/aoforge/hooks/sync-runtime.js
  - plugins/aoforge/hooks/todo-sync.js
  - plugins/aoforge/hooks/upgrade-project.js
  - plugins/aoforge/hooks/verify-commits.js
  - plugins/aoforge/hooks/verify-completion.js
autonomous: true
requirements: [SC-1]
must_haves:
  truths:
    - "No file under plugins/aoforge calls `aliasLegacyEnv(` (aof-tools.cjs, aoforge-watch.cjs, every hook in hooks.json, the statusLine script)"
    - "A process started with only `DEVFLOW_SKIP_EDIT_GATE=1` is gated by gate-edits exactly like one with no variable; `AOFORGE_SKIP_EDIT_GATE=1` still skips"
    - "gate-edits treats only `.aoforge/` paths as store-mode planning paths (no pre-rename directory segment) and no hook comment says the planning directory may be a legacy one or that the pre-rename agent namespace is trusted"
    - "compat.cjs is not edited here: the aliasLegacyEnv definition is deleted in 78-12 once no caller exists"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs
      provides: "repo contract: no entry point aliases the pre-rename environment"
  key_links:
    - from: plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs
      to: hooks/hooks.json + plugin.json statusLine + both bins
      via: "the entry-point list is derived from the manifests, so a new hook is covered automatically"
      pattern: "aliasLegacyEnv"
---

# TRD 78-10: No entry point aliases the pre-rename environment; hooks spell AOForge names only

<objective>
Remove the `aliasLegacyEnv()` call from every process AOForge starts (the CLI, the watch daemon, every hook and the
status line), drop gate-edits' pre-rename planning-directory segment, and rewrite the hook comments that still describe
the one-release fallbacks. Invert the 72-04 repo contract so it now fails if any entry point aliases the old prefix.

Purpose: SC-1 (no `aliasLegacyEnv` or `DEVFLOW_*` alias). Users are told about their old variables by 78-06's
SessionStart notice and doctor check 16. The definition in compat.cjs goes in 78-12 (after this TRD and 78-11 merge).
Output: a one-line removal per entry point, one gate-edits regex, comments, the inverted contract.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/ROADMAP.md (Objective 78 section only)
@plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs
@plugins/aoforge/hooks/gate-edits.js (lines 40-90, 260-280, 470-490)

Objective-wide rules (apply to every task):
- Use the repo copy of the CLI: `node plugins/aoforge/aoforge/bin/aof-tools.cjs ...`. Never the installed runtime.
- Commit only through `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "<type>(78-10): <desc>" --files <paths>`.
  RED commit before GREEN.
- Tests spawn hooks with an environment stripped of both prefixes and a scratch HOME; never the real `~/.claude`.
  Never port 8080. Never push, tag or release.
- Merge note: `main` changed several hooks (one-process Bash hooks, objective 76/77). Keep each hook edit to the alias
  line and the stale comment lines so the reconcile is mechanical; do not reformat or reorder anything else.
- This TRD runs in parallel with 78-11 (compat.cjs). Do NOT edit compat.cjs or any `*.legacy.test.*` that 78-11 owns
  (hooks/agent-types.legacy.test.js, hooks/planning-layout.legacy.test.js, hooks/home-project-detection.test.js).
</context>

<embedded_context>

<codebase_examples>
The line to delete, in this exact shape in every hook (some with a preceding comment line):
```js
// Objective 72: honour the legacy env prefix for one release. A stub plugin tree without the libs fails open.
try { require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
```
aof-tools.cjs (line ~229-232) and aoforge-watch.cjs (line ~53):
```js
// Objective 72: the legacy environment prefix keeps working for one release ...
require('./lib/compat.cjs').aliasLegacyEnv();
```
coexistence-guard.js also calls `compat.aliasLegacyEnv(env)` inside `run()`; remove that call and the `compat` entry
of `libs()` if nothing else uses it.
gate-edits.js:
```js
const PLANNING_DIR_NAMES = [NAMES.planningDir, LEGACY.planningDir];
const PLANNING_SEGMENT_RE = new RegExp(`/(?:${escapeRegExp(NAMES.planningDir)}|${escapeRegExp(LEGACY.planningDir)})/`);
...
const isAoforgeAgent = isOwnAgentType; // comment says the pre-rename namespace is trusted for one release
```
Stale comment found in many hooks: `// TRD 72-06: the planning directory is \`.aoforge/\`, or for one release a legacy
one (compat.cjs resolves which).` -> `// The planning directory is \`.aoforge/\` (compat.cjs).`
</codebase_examples>

<anti_patterns>
- Do not replace the alias with another fallback (no "read DEVFLOW_X if AOFORGE_X unset" anywhere).
- Do not touch doctor check 16 or coexistence.cjs detection of `DEVFLOW_*` variables: detecting is allowed, aliasing
  is not.
- Do not delete `isAoforgeAgent` / `isOwnExecutor` usage: 78-11 makes compat's functions single-namespace; here only
  the comments change.
- `rg` flags: never fold `-E` into a cluster (in rg `-E` is `--encoding`); use `-e` per alternative.
</anti_patterns>

<error_recovery>
- If a hook test asserted the legacy-prefixed skip variable works (e.g. `<legacy>SKIP_COEXISTENCE`), flip it to "does
  not skip" when the test is a `*.legacy.test.*` this TRD owns, otherwise delete just that case and list it.
- If `statusline.js`'s alias line is inside a try that also guards another require, keep the try for the other require.
</error_recovery>

</embedded_context>

<gotchas>
- `compat-entry.repo.test.cjs` derives the entry points from hooks.json and plugin.json; keep that derivation and invert
  the assertion: no entry point source contains `aliasLegacyEnv(` (comments included are fine to forbid too).
- `inject-org-context.js` (a draft hook, not registered) carries the stale planning-directory comment; update the
  comment only.
- After this TRD, a user who still exports `DEVFLOW_SKIP_EDIT_GATE=1` gets the edit gate: that is the promised 3.1
  behaviour, reported by 78-06's notice.
</gotchas>

## Test list

1. Repo contract: none of `aof-tools.cjs`, `aoforge-watch.cjs`, the hooks named in hooks.json and the statusLine
   script contains `aliasLegacyEnv(`.
2. Behaviour: gate-edits spawned in a scratch AOForge project (ambient, no skill marker) on a Write to a tracked file
   with only `<LEGACY.envPrefix>SKIP_EDIT_GATE=1` set -> denied; with `AOFORGE_SKIP_EDIT_GATE=1` -> allowed.
3. Behaviour: aof-tools with only a legacy-prefixed variable set does not see its AOForge twin (e.g. spawn
   `aof-tools config-get` or a tiny `node -e` through aof-tools' module load path and assert `process.env.AOFORGE_X`
   is undefined in a child it reports) — choose the cheapest observable; if none exists, assert test 1 for the CLI and
   say so.
4. gate-edits store-mode rule: an Edit to `<root>/<LEGACY.planningDir>/STATE.md` in a store-mode project is not treated
   as a store-mode planning path (the segment regex matches `.aoforge/` only).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — invert the entry-point contract</name>
  <files>plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs, plugins/aoforge/hooks/gate-edits.test.js</files>
  <action>
Rewrite compat-entry.repo.test.cjs's header and tests 7-8 to cases 1-3; add case 4 to gate-edits.test.js (build the
legacy segment from LEGACY; the test file is not `*.legacy.test.*`, so never spell it). Commit failing.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs plugins/aoforge/hooks/gate-edits.test.js` fails on cases 1, 2 and 4.</verify>
  <done>RED commit.</done>
  <recovery>If case 4 is not observable through gate-edits' exported `shouldGate`, test `PLANNING_SEGMENT_RE` via its export (export it if needed).</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — remove every alias call; single planning segment; comments</name>
  <files>plugins/aoforge/aoforge/bin/aof-tools.cjs, plugins/aoforge/aoforge/bin/aoforge-watch.cjs, plugins/aoforge/hooks/auto-continue.js, plugins/aoforge/hooks/awareness-cache-populate.js, plugins/aoforge/hooks/changelog-on-tag.js, plugins/aoforge/hooks/classify-session.js, plugins/aoforge/hooks/coexistence-guard.js, plugins/aoforge/hooks/gate-bash-writes.js, plugins/aoforge/hooks/gate-commits.js, plugins/aoforge/hooks/gate-edits.js, plugins/aoforge/hooks/gate-executor-stop.js, plugins/aoforge/hooks/gate-interactive.js, plugins/aoforge/hooks/gate-skill-requires.js, plugins/aoforge/hooks/gh-flush.js, plugins/aoforge/hooks/guard-no-progress.js, plugins/aoforge/hooks/inject-handoff-results.js, plugins/aoforge/hooks/inject-org-context.js, plugins/aoforge/hooks/route-intent.js, plugins/aoforge/hooks/route-results.js, plugins/aoforge/hooks/statusline.js, plugins/aoforge/hooks/sync-runtime.js, plugins/aoforge/hooks/todo-sync.js, plugins/aoforge/hooks/upgrade-project.js, plugins/aoforge/hooks/verify-commits.js, plugins/aoforge/hooks/verify-completion.js</files>
  <action>
Mechanical sweep, one file at a time (locate with `rg -n "aliasLegacyEnv|for one release|pre-rename|legacy one" <file>`,
edit with a targeted Edit, never rewrite a whole file):
1. Delete the `aliasLegacyEnv` call and its "Objective 72: honour the legacy env prefix" comment.
2. Replace the "TRD 72-06 ... or for one release a legacy one" comment with the single-directory wording.
3. gate-edits.js: `PLANNING_DIR_NAMES = [NAMES.planningDir]` (or inline), `PLANNING_SEGMENT_RE` for `.aoforge/` only,
   drop LEGACY from the import; rewrite the `isAoforgeAgent` comment (the agent namespace is `aoforge:`; compat decides).
4. verify-commits.js, gate-executor-stop.js, gate-edits.js headers: drop "for one release also the pre-rename
   namespace's executor".
5. coexistence-guard.js: remove `compat.aliasLegacyEnv(env)` in `run()` and the comment "(the legacy env prefix is
   aliased first, as in every hook)".
Run the hook suites after every few files.
  </action>
  <verify>`rg -n "aliasLegacyEnv" plugins/aoforge --glob '!**/compat.cjs' --glob '!**/compat*.test.cjs'` finds nothing; `node --test plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs 'plugins/aoforge/hooks/*.test.js'` passes.</verify>
  <done>Cases 1-4 green; every hook still exits 0 and keeps its contract.</done>
  <recovery>If a hook test fails because it relied on the alias to pass a legacy-prefixed escape (e.g. in a fixture env), change the fixture env to the AOForge prefix.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped while iterating: node --test 'plugins/aoforge/hooks/*.test.js' plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs)</test>
</validation_gates>

<verification>
- Cases 1-4 green; RED before GREEN.
- `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/hook-inventory.test.cjs` passes (skip absent).
- `git diff --stat` for each hook shows only a few lines changed.
</verification>

<success_criteria>
- No AOForge process reads the pre-rename environment prefix; the contract test keeps it that way.
</success_criteria>

<output>
After completion, write `78-10-SUMMARY.md` through `node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post 78-10 --from <draft>`
(after `tokens stamp 78-10 --draft <draft>`). List every file touched and any test case removed.
</output>
