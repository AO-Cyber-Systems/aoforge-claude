---
objective: 72-install-and-naming-cleanup
trd: "12"
type: standard
wave: 5
depends_on: ["72-06"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-identity-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/stack-mcp.cjs
  - plugins/aoforge/aoforge/bin/lib/todo-session.cjs
  - plugins/aoforge/aoforge/bin/lib/config.cjs
  - plugins/aoforge/aoforge/bin/lib/init.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs
  - plugins/aoforge/aoforge/bin/lib/watcher-state.cjs
  - plugins/aoforge/aoforge/bin/lib/adopt.cjs
autonomous: true
requirements: [INST-03]
must_haves:
  truths:
    - "`stack mcp` treats a `.mcp.json` server entry owned through the legacy ownership env key as its own (updates or removes it like an AOForge-owned one), writes only the AOForge key, and never touches entries owned by neither"
    - "Todo sync recognises session todos carried in TaskCreate/TodoWrite metadata under the legacy metadata key as well as the AOForge key, so todos from sessions before 3.0.0 still merge"
    - "User-level files are read from `~/.aoforge/` first and `~/.devflow/` second (defaults.json, the Brave API key file, the watch allowlist, the watch daemon pid); new files are written under `~/.aoforge/` only; nothing under `~/.devflow/` is moved or deleted (that directory is shared with the separate devflowops product)"
    - "`adopt preflight` in a repo with a half-finished adopt on the legacy adopt branch resumes on that branch instead of refusing or starting a second branch; a fresh adopt uses `aoforge/adopt`"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
      provides: "legacy ownership key, metadata key, dot files and adopt branch"
    - path: plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-identity-fixtures.cjs
      provides: "legacy .mcp.json, transcript todo records, legacy dot dir, half-finished legacy adopt repo"
      exports: ["legacyMcpJson", "legacyTodoTranscript", "legacyDotHome", "legacyAdoptRepo"]
  key_links:
    - from: "config.cjs / init.cjs / watcher-*.cjs user file reads"
      to: "compat.userDotFile"
      via: "read path resolution, new dir first"
      pattern: "userDotFile"
    - from: "stack-mcp.cjs ownership test"
      to: "NAMES.envPrefix + 'MANAGED' / LEGACY.envPrefix + 'MANAGED'"
      via: "either key equal to 'stack'"
      pattern: "MANAGED"
---

# TRD 72-12: Legacy identities in user files: MCP ownership, todo metadata, `~/.devflow/` files, the adopt branch

<objective>
Some old names live in files outside the repo's code: the ownership key DevFlow wrote into users' `.mcp.json`, the
metadata key on session todos in past transcripts, user files under `~/.devflow/`, and a half-finished adopt on the
legacy branch. After 72-04 the code looks only for the AOForge names, so each of these would silently stop being
recognised. Read both for one release, write only the new form.

Purpose: INST-03 for file-level identities.
Output: four small read-side shims with one legacy test file.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md

Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures, one test at a time.

Sites (names as after 72-04): `stack-mcp.cjs` 10-20 (ownership: `env.<PREFIX>MANAGED === 'stack'`); `todo-session.cjs`
~148 (`use.input.metadata.<slug>_todo`); `config.cjs` 95-100 (`~/.<dot>/brave_api_key`, `defaults.json`); `init.cjs`
~668 (Brave key); `watcher-allowlist.cjs` ~128; `watcher-state.cjs` ~18 (`PID_DIR_NAME`); `service-installer.cjs` ~57
(log dir: new dir only, no fallback needed); `adopt.cjs` 32 (`ADOPT_BRANCH`), 120-130 (branch-exists check), 215
(refuse rule 11). `~/.devflow/` on this machine also holds `devflow.sqlite` and `sessions.json` from the devflowops
product: never move or delete that directory.
</context>

## Test list

**file-identities.legacy.test.cjs**
1. `.mcp.json` with a server whose env has the legacy ownership key `= 'stack'`: `stack mcp --write` (in-process API)
   rewrites it as an AOForge-owned entry (AOForge key, legacy key dropped) and leaves a foreign entry untouched.
2. A server with neither key: untouched; a server with the AOForge key: handled as today.
3. A transcript with a TaskCreate whose metadata carries the legacy todo key: `todo-session` extracts the todo with its
   stem, same as for the AOForge key.
4. `config` load with only `~/.devflow/defaults.json` -> its defaults apply; with both -> `~/.aoforge/` wins.
5. Brave key: only legacy file -> found; `init` reports it present.
6. Watch allowlist and pid: legacy-only files are read; a write goes to `~/.aoforge/`.
7. Nothing under the legacy dot dir is moved, renamed or deleted by any of the above (directory listing before/after).
8. `adopt preflight` on a repo with the legacy adopt branch and its in-progress marker -> route `resume`, branch = the
   legacy one; on a fresh repo -> `aoforge/adopt`; with both branches -> refuse with a message naming both.

<embedded_context>

<codebase_examples>
```js
const { NAMES, LEGACY } = require('./legacy-names.cjs');
const OWN_KEYS = [`${NAMES.envPrefix}MANAGED`, `${LEGACY.envPrefix}MANAGED`];
const isOwned = (entry) => entry && entry.env && OWN_KEYS.some((k) => entry.env[k] === 'stack');
```
`compat.userDotFile(home, name)` (72-02) returns the new path when present, else the legacy path when present, else the
new path.
</codebase_examples>

<anti_patterns>
- No legacy literals in these modules; build from LEGACY.
- Never write under `~/.devflow/`; never touch `devflow.sqlite`/`sessions.json`.
- Do not rename a user's legacy adopt branch.
</anti_patterns>

<error_recovery>
- If `stack mcp` tests compare whole files, generate the expected JSON from the fixture builder with the key swapped,
  rather than hand-typing a second copy.
- If watcher tests read `os.homedir()` directly, inject the home as the existing daemon-polish fixtures do.
</error_recovery>

</embedded_context>

<gotchas>
- Live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder: legacy identities in user files</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-identity-fixtures.cjs</files>
  <action>
Typed-out builders: `legacyMcpJson({ owned, foreign })`, `legacyTodoTranscript({ stem })` (one JSONL session with a
TaskCreate tool_use whose `input.metadata` uses the legacy key; shape copied from `todo-transcript-fixtures.cjs`),
`legacyDotHome({ files })` (fake home with `~/.devflow/<files>` plus a `devflow.sqlite` sentinel),
`legacyAdoptRepo()` (git repo with the legacy adopt branch and the adopt in-progress marker; reuse `adopt-fixtures.cjs`
helpers). Check with `node -e`. Commit (`test(72-12): legacy identity fixtures`).
  </action>
  <verify>node -e "const f=require('./plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-identity-fixtures.cjs');console.log(Object.keys(f))"</verify>
  <done>Four builders exist.</done>
  <recovery>If the adopt marker location is resolved through planningRoot, create it under the legacy planning dir to
also exercise 72-05's fallback.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: MCP ownership and todo metadata read both keys</name>
  <files>plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/stack-mcp.cjs, plugins/aoforge/aoforge/bin/lib/todo-session.cjs</files>
  <action>
RED: tests 1-3. Run: fail. Commit RED.

GREEN: `stack-mcp.cjs` ownership via both keys, write AOForge key only, drop the legacy key on an entry it rewrites;
`todo-session.cjs` reads `metadata[NAMES.slug + '_todo'] ?? metadata[LEGACY.slug + '_todo']`. Run the stack-mcp,
todo-session and todo-sync suites. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/stack-mcp.test.cjs plugins/aoforge/aoforge/bin/lib/todo-session.test.cjs</verify>
  <done>Tests 1-3 pass; existing suites pass.</done>
  <recovery>If todo-sync writes metadata back with the key it read, make it always write the AOForge key.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: User dot files and the legacy adopt branch</name>
  <files>plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/config.cjs, plugins/aoforge/aoforge/bin/lib/init.cjs, plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs, plugins/aoforge/aoforge/bin/lib/watcher-state.cjs, plugins/aoforge/aoforge/bin/lib/adopt.cjs</files>
  <action>
RED: tests 4-8. Run: fail. Commit RED.

GREEN: reads through `compat.userDotFile`; writes to `path.join(home, NAMES.userDotDir, name)`; adopt preflight checks
the new branch, then the legacy branch (resume on it when its marker says in progress), refusing when both exist.
Run the config, init, watcher, adopt suites and the full suite. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/config.test.cjs plugins/aoforge/aoforge/bin/lib/adopt.test.cjs</verify>
  <done>Tests 1-8 pass; full suite at baseline.</done>
  <recovery>If adopt's e2e assertion helper pins the branch name, read it from NAMES.adoptBranch there too.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'</test>
</validation_gates>

<verification>
- `rg -n "userDotFile" plugins/aoforge/aoforge/bin/lib/config.cjs plugins/aoforge/aoforge/bin/lib/init.cjs plugins/aoforge/aoforge/bin/lib/watcher-allowlist.cjs plugins/aoforge/aoforge/bin/lib/watcher-state.cjs`
  hits every read site.
</verification>

<success_criteria>
- Users' existing MCP entries, session todos, `~/.devflow/` settings and in-flight adopts keep working under AOForge.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-12-SUMMARY.md` through
`df-tools summary post`.
</output>
