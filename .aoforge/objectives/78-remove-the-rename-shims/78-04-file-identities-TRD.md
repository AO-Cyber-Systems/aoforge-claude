---
objective: 78-remove-the-rename-shims
trd: "04"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/bin/lib/stack-mcp.cjs
  - plugins/aoforge/aoforge/bin/lib/stack-mcp.test.cjs
  - plugins/aoforge/aoforge/bin/lib/todo-session.cjs
  - plugins/aoforge/aoforge/bin/lib/todo-session.test.cjs
  - plugins/aoforge/hooks/todo-sync.js
  - plugins/aoforge/hooks/todo-sync.test.js
  - plugins/aoforge/aoforge/bin/lib/adopt.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.test.cjs
  - plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-identity-fixtures.cjs
autonomous: true
requirements: [SC-1, SC-2]
must_haves:
  truths:
    - "stack-mcp owns an `.mcp.json` entry only through `AOFORGE_MANAGED === 'stack'`; an entry carrying the pre-rename owner key is left untouched and `stack mcp` reports it in one line naming the fix (rename the key to AOFORGE_MANAGED or delete the entry)"
    - "todo-session.TODO_META_KEYS is `['aoforge_todo']`; a TaskCreate carrying only the pre-rename metadata key is not a todo; the todo-sync Stop hook's prefilter looks for the AOForge key only"
    - "adopt no longer reads the pre-rename adopt branch or marker: no `legacy_branch_exists` fact, no `adopt-branch-conflict` route; a repo with only the old branch adopts on `aoforge/adopt` and never touches the old branch"
    - "migration 0010 recognises its .gitignore block only under the AOForge marker slug"
    - "file-identities.legacy.test.cjs asserts the new behaviour for the .mcp.json, todo and adopt sections; its user-dot-file and watch-daemon sections (4-7) are left for 78-05/78-11"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
      provides: "pre-rename identities in users' files are ignored or reported"
  key_links:
    - from: plugins/aoforge/hooks/todo-sync.js prefilter
      to: plugins/aoforge/aoforge/bin/lib/todo-session.cjs TODO_META_KEYS
      via: "the hook and the library agree on one key"
      pattern: "aoforge_todo"
---

# TRD 78-04: Identities in users' files — `.mcp.json` owner key, todo metadata key, adopt branch, ignore block

<objective>
Remove the read-side shims TRD 72-12 (and 72-08 for 0010) added for pre-rename identities stored in users' files:
the legacy `.mcp.json` owner key, the legacy session-todo metadata key, an adopt begun on the pre-rename branch, and
0010's recognition of its ignore block under the old slug. A stale `.mcp.json` entry is reported, not silently
abandoned.

Purpose: SC-1/SC-2 (no pre-rename reader remains). User files under the dot directories are 78-05 (watch daemon) and
78-11 (compat.userDotFile).
Output: single-name ownership and identity checks with tests.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/ROADMAP.md (Objective 78 section only)
@.aoforge/objectives/72-install-and-naming-cleanup/72-12-SUMMARY.md
@plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs

Objective-wide rules (apply to every task):
- Use the repo copy of the CLI: `node plugins/aoforge/aoforge/bin/aof-tools.cjs ...`. Never the installed runtime.
- Commit only through `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "<type>(78-04): <desc>" --files <paths>`.
  RED commit before GREEN.
- Tests use mkdtemp repos and a scratch HOME; never the real `~/.claude`. Never port 8080. Never push, tag or release.
- Rename guard: legacy names only in `legacy-names.cjs`, `__fixtures__/legacy-*`, `*.legacy.test.*`.

Decisions this TRD records (copy each, with its reason, into the SUMMARY):
- **Pre-rename `.mcp.json` owner key: REMOVE the read, ADD a one-line report.** Reason: the entry stays in the user's
  file and would silently stop being refreshed; a report keeps that visible without making the old key work.
- **Pre-rename todo metadata key: REMOVE.** Reason: only a session started under the pre-rename skills writes it; every
  3.x todo skill writes the AOForge key, and the cost of a miss is one unsynced todo in a months-old resumed session.
- **Pre-rename adopt branch/marker: REMOVE, no detector.** Reason: an adopt is a one-shot bootstrap; one left
  unfinished across two releases is restarted on `aoforge/adopt`, and the old branch is never touched (nothing is lost).
- **0010's pre-rename block slug: REMOVE, no detector.** Reason: only a project that 0012 never moved can still carry
  that block, and such a project is on the legacy layout, which 78-07 refuses before any migration runs.
</context>

<embedded_context>

<codebase_examples>
stack-mcp.cjs:
```js
const OWNED_KEYS = Object.freeze([MANAGED_KEY, `${LEGACY.envPrefix}MANAGED`]);
function isManaged(entry) { return ... && OWNED_KEYS.some((key) => entry.env[key] === MANAGED_VALUE); }
```
todo-session.cjs:
```js
const TODO_META_KEYS = Object.freeze([`${NAMES.slug}_todo`, `${LEGACY.slug}_todo`]);
```
hooks/todo-sync.js (lines ~45-50) returns `[`${NAMES.slug}_todo`, `${LEGACY.slug}_todo`]` for its cheap prefilter.
adopt.cjs: `LEGACY_ADOPT_BRANCH`, `LEGACY_MARKER_NAME`, `legacy_branch_exists` in gitFacts, `readMarker` falling back to
the legacy marker, `decideRoute` rule 11 (`adopt-branch-conflict` / `adopt-branch-exists` for the legacy branch).
0010-store-gitignore.cjs: `LEGACY_BLOCK_START/END`, `START_MARKERS`/`END_MARKERS` with both slugs, `readBlock(...).legacy`.
</codebase_examples>

<anti_patterns>
- 0010's `found.legacy` / `legacyBlockers` are about pre-TRD JOB names (objective 46+), NOT the rename: keep them.
- Do not change 0010's block CONTENT (it lists PLANNING_DIR_NAMES; 78-11 makes that one name).
- Do not touch file-identities.legacy.test.cjs's "user files under the legacy dot directory" block (tests 4-7): 78-05
  and 78-11 own it.
- Do not edit the `aliasLegacyEnv` line in hooks/todo-sync.js (78-10 sweeps it).
- The `.mcp.json` report must not rewrite or delete the user's entry.
</anti_patterns>

<error_recovery>
- adopt-*.test.cjs suites (e2e, preflight, report, scaffold, skill-contract) may assert the legacy fact keys in JSON
  output (`legacy_branch_exists`); remove those keys from the expectations in the same commit.
- If `stack mcp` has no place for advisory lines in its report, add a `warnings: []` array to the report JSON and print
  each as `warning: <line>` in text mode, following the stack-report style.
</error_recovery>

</embedded_context>

<gotchas>
- The todo-sync hook test (hooks/todo-sync.test.js) spawns the hook against a transcript fixture; test 3d in
  file-identities does the same for the legacy key: flip it to "not archived".
- `legacy-identity-fixtures.cjs` builders (`legacyMcpJson`, `legacyTodoTranscript`, `legacyAdoptRepo`) stay; they are
  now inputs that must be ignored or reported.
</gotchas>

## Test list

Outermost first.
1. `aof-tools stack mcp --write` (scratch repo whose `.mcp.json` holds one entry owned through the pre-rename key, one
   AOForge-owned entry, one foreign entry): the legacy-owned entry is byte-identical afterwards; the AOForge-owned one is
   refreshed as before; the output carries exactly one warning naming the entry, the pre-rename key and
   `AOFORGE_MANAGED`.
2. `isManaged` is true only for `AOFORGE_MANAGED === 'stack'`.
3. Todo Stop hook over a transcript whose TaskCreate carries only the pre-rename key: nothing archived; with the AOForge
   key: archived as before.
4. `TODO_META_KEYS` deep-equals `['aoforge_todo']`; `replayTranscript` ignores the pre-rename key.
5. `adopt preflight` in a repo on the pre-rename adopt branch with its pre-rename marker: route is a fresh adopt (or the
   route an unrelated branch gives), the JSON has no `legacy_branch_exists`, and nothing is written to that branch.
6. `adopt begin` in that repo creates `aoforge/adopt` and leaves the old branch at its commit.
7. 0010 `detect` on a .gitignore holding only a block under the pre-rename slug: the block is not recognised (reported
   as absent); a block under the AOForge slug is recognised as before.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — identities are ignored or reported</name>
  <files>plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-identity-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.test.cjs</files>
  <action>
The fixtures exist (hand-built in 72-12); add only a .gitignore builder with a pre-rename-slug block if 0010's tests
lack one (fixture_strategy: generators — no generated data). Rewrite the `.mcp.json`, todo and adopt describe blocks of
file-identities.legacy.test.cjs to test-list cases 1-6, and add case 7 to the 0010 tests (as a `*.legacy.test.cjs` case
if it must spell the old slug; otherwise build it from LEGACY). Leave tests 4-7 (user dot files) as they are. Commit
failing.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.test.cjs` fails only on the rewritten cases.</verify>
  <done>RED commit with cases 1-7.</done>
  <recovery>If case 7 cannot live in a non-legacy test without spelling the slug, create `migrations/0010-store-gitignore.legacy.test.cjs` for it.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — stack-mcp ownership, todo key, hook prefilter, 0010 slug</name>
  <files>plugins/aoforge/aoforge/bin/lib/stack-mcp.cjs, plugins/aoforge/aoforge/bin/lib/stack-mcp.test.cjs, plugins/aoforge/aoforge/bin/lib/todo-session.cjs, plugins/aoforge/aoforge/bin/lib/todo-session.test.cjs, plugins/aoforge/hooks/todo-sync.js, plugins/aoforge/hooks/todo-sync.test.js, plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.cjs</files>
  <action>
- stack-mcp.cjs: ownership = `MANAGED_KEY` only. Add a detector `legacyOwnedEntries(doc)` (names of entries whose env
  has `${LEGACY.envPrefix}MANAGED === 'stack'` and no AOForge key) and surface each as one warning line in the
  `stack mcp` result: `<.mcp.json> entry "<name>" is owned through the pre-rename key <LEGACY.envPrefix>MANAGED, which
  AOForge no longer reads: rename it to <MANAGED_KEY> (or delete the entry) to have \`stack mcp --write\` manage it`.
  Update the header comment.
- todo-session.cjs: `TODO_META_KEYS = Object.freeze([`${NAMES.slug}_todo`])`; drop LEGACY import; comment.
- hooks/todo-sync.js: prefilter returns the AOForge key only (no LEGACY require).
- 0010: `START_MARKERS = [BLOCK_START]`, `END_MARKERS = [BLOCK_END]`; delete LEGACY_BLOCK_*, the `legacy` field of
  readBlock's result for the slug (NOT `found.legacy` for JOB names), and the header paragraph about the legacy slug.
  Keep the content lines as they are.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/stack-mcp.test.cjs plugins/aoforge/aoforge/bin/lib/todo-session.test.cjs plugins/aoforge/aoforge/bin/lib/todo-sync.test.cjs plugins/aoforge/hooks/todo-sync.test.js plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.test.cjs` passes (skip files that do not exist).</verify>
  <done>Cases 1-4 and 7 green.</done>
  <recovery>If removing the slug alternative breaks a 0010 test about the block a 0012 move re-upserted, that test belongs to 0012 (retired in 78-07): mark it with a comment for 78-07 instead of deleting it here.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: GREEN — adopt forgets the pre-rename branch and marker</name>
  <files>plugins/aoforge/aoforge/bin/lib/adopt.cjs</files>
  <action>
Delete LEGACY_ADOPT_BRANCH, LEGACY_MARKER_NAME, the `legacy_branch_exists` fact (gitFacts, its default object, the
returned facts and the report), the legacy marker fallback in `readMarker`, and the legacy parts of decideRoute rule 11
(keep `adopt-branch-exists` for a stale `aoforge/adopt` with no marker). Rewrite the routing comment (rule 11) and the
header paragraph "One release ... an adopt begun before the rename". Drop the LEGACY import if unused. Update any
adopt-*.test.cjs expectation that names the removed fact.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/adopt*.test.cjs` passes; `rg -n "LEGACY" plugins/aoforge/aoforge/bin/lib/adopt.cjs` finds nothing.</verify>
  <done>Cases 5-6 green; adopt spells and reads one branch name.</done>
  <recovery>If the adopt skill-contract test pins the JSON fact list, update the pin and note it in the SUMMARY.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped while iterating: node --test &lt;the touched *.test.* files&gt;)</test>
</validation_gates>

<verification>
- All cases green; RED before GREEN in `git log`.
- `rg -n "LEGACY" plugins/aoforge/aoforge/bin/lib/todo-session.cjs plugins/aoforge/aoforge/bin/lib/adopt.cjs plugins/aoforge/hooks/todo-sync.js` finds nothing; stack-mcp.cjs uses LEGACY only in the detector.
- `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` passes.
</verification>

<success_criteria>
- None of the four identities is read under its old name; the stale `.mcp.json` entry is reported. Decisions recorded.
</success_criteria>

<output>
After completion, write `78-04-SUMMARY.md` through `node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post 78-04 --from <draft>`
(after `tokens stamp 78-04 --draft <draft>`). Include the Decisions table.
</output>
