---
objective: 78-remove-the-rename-shims
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/devflow
  - .claude-plugin/marketplace.json
  - package.json
  - scripts/gen-pointer-skills.cjs
  - scripts/gen-pointer-skills.legacy.test.cjs
  - scripts/__fixtures__/legacy-pointer-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/old-commands.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
  - plugins/aoforge/aoforge/bin/lib/skill-route.cjs
  - plugins/aoforge/aoforge/bin/lib/skill-route.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doc-refs.cjs
  - plugins/aoforge/aoforge/bin/lib/doc-refs.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doc-refs.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-command-fixtures.cjs
  - plugins/aoforge/hooks/changelog-on-tag.js
  - plugins/aoforge/hooks/changelog-on-tag.test.js
autonomous: true
requirements: [SC-2]
must_haves:
  truths:
    - "`plugins/devflow/` no longer exists; `.claude-plugin/marketplace.json` has no entry whose name or source is the pre-rename plugin; `package.json` scripts.test has no `plugins/devflow/**` glob; `scripts/gen-pointer-skills*` and `scripts/__fixtures__/legacy-pointer-fixtures.cjs` are gone"
    - "The rename guard has no ALLOW entry for the pointer plugin, its generator, the marketplace pointer span or the package.json pointer glob, and test 4 (no dead ALLOW entry) passes; the span-scoped ALLOW mechanism is still tested with a synthetic entry"
    - "skill-route.cjs exports no NAMESPACE_RENAMES; doc-refs.cjs reads only `/aoforge:<name>` references (no legacy plugin namespace, no short namespace, no dash form); DEPRECATION_MAP and REMOVED_COMMANDS behave exactly as before for `/aoforge:` text"
    - "Migration 0007 leaves pre-rename command forms untouched (it still rewrites renamed `/aoforge:` commands)"
    - "changelog-on-tag.js checks only `plugins/aoforge/.claude-plugin/plugin.json`"
    - "The three marketplace versions and `plugins/aoforge/.claude-plugin/plugin.json` still agree (no version bump here)"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/old-commands.legacy.test.cjs
      provides: "repo-level contract that the pointer release and the legacy command forms are gone"
  key_links:
    - from: plugins/aoforge/aoforge/bin/lib/doc-refs.cjs NAMESPACES
      to: NAMES.slug only
      via: "the legacy namespaces are no longer command references"
      pattern: "NAMESPACES"
    - from: plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs ALLOW
      to: tracked paths
      via: "test 4 fails on a dead entry, so the pointer entries must go in the same commit as the files"
      pattern: "ALLOW"
---

# TRD 78-02: Old commands — the pointer plugin and the legacy command forms

<objective>
Remove what kept the pre-rename commands working: the final pointer release of the old plugin (`plugins/devflow/`,
its marketplace entry, its generator script and fixtures, the package.json test glob, the rename-guard ALLOW entries
for them, the changelog gate's second manifest) and the doc-refs reading of the old slash namespaces
(`NAMESPACE_RENAMES`, the dash form), which TRD 72-13 declared one-release.

Purpose: SC-2 (the pointer plugin and its ALLOW entries are removed) and the guide's "Old commands" promise.
Output: a repository with one AOForge plugin entry for the forge and no legacy command readers.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/ROADMAP.md (Objective 78 section only)
@.aoforge/objectives/72-install-and-naming-cleanup/72-14-SUMMARY.md (what the pointer release consists of)
@plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
@plugins/aoforge/aoforge/bin/lib/doc-refs.cjs

Objective-wide rules (apply to every task):
- Use the repo copy of the CLI: `node plugins/aoforge/aoforge/bin/aof-tools.cjs ...`. Never the installed runtime.
- Commit only through `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "<type>(78-02): <desc>" --files <paths>`
  (deleted paths are listed in `--files` too). RED commit before GREEN.
- Tests use mkdtemp trees and a scratch HOME; never the real `~/.claude`. Never port 8080. Never push, tag or release.
- Rename guard: legacy names only in `legacy-names.cjs`, `__fixtures__/legacy-*`, `*.legacy.test.*`; elsewhere build
  them from LEGACY.

Decisions this TRD records (copy each, with its reason, into the SUMMARY):
- **doc-refs `NAMESPACE_RENAMES` and the dash form: REMOVE.** Reason: TRD 72-13 declared them one-release ("removed
  with the other one-release shims in the release after 3.0.0"); with the pointer release gone an old command form no
  longer runs anywhere, and migration 0007's rewrite of them is an automatic conversion of pre-rename text, which 3.1
  leaves to 3.0.x. In this repository the rename guard still fails on any legacy name outside its ALLOW list, so no
  stale form can return unnoticed. DEPRECATION_MAP/REMOVED_COMMANDS (objective 38, renamed `/aoforge:` commands) stay.
- **`LEGACY_AGENT_EXEMPT` / the 44-08 agent-path gate in doc-refs.repo.test.cjs: KEEP.** It is about pre-plugin agent
  locations, not the 3.0 rename.
- **coexistence.cjs keeps its pointer-version handling** (78-06 owns it): installed copies of the pointer release stay on
  users' machines after it leaves the marketplace, so the notice still distinguishes them.
</context>

<embedded_context>

<codebase_examples>
The four pointer ALLOW entries (rename-guard.repo.test.cjs) to delete, with their patterns built from LEGACY:
```js
{ pattern: `plugins/${LEGACY.slug}/**`, reason: '...removed in the release after 3.0.0' },
{ pattern: 'scripts/gen-pointer-skills*', reason: 'generates the pointer plugin...' },
{ pattern: '.claude-plugin/marketplace.json', spans: new RegExp(`"(?:name|source)": "(?:\\./plugins/)?${esc(LEGACY.slug)}"|...`, 'g'), reason: '...' },
{ pattern: 'package.json', spans: new RegExp(`'plugins/${esc(LEGACY.slug)}/\\*\\*/\\*\\.test\\.js'`, 'g'), reason: '...' },
```
Test 9 (9a-9c) uses the marketplace pointer entry as its sample; give `maskAllowedSpans`/`scanFile` a synthetic
span-scoped entry instead (they already take an `allow` argument).

skill-route.cjs:
```js
const NAMESPACE_RENAMES = Object.freeze({ [LEGACY.slug]: NAMES.slug, [LEGACY.commandNsShort.slice(1, -1)]: NAMES.slug });
```
doc-refs.cjs:
```js
const NAMESPACES = Object.freeze([NAMES.slug, ...Object.keys(NAMESPACE_RENAMES)]);
const DASH_NS = LEGACY.commandDash.slice(1, -1);
const DASH_RE = new RegExp(`(?<![A-Za-z0-9_./~])${escapeRegExp(LEGACY.commandDash)}([a-z][a-z0-9-]*)`, 'g');
```
changelog-on-tag.js:
```js
const PLUGIN_MANIFESTS = [NAMES.slug, LEGACY.slug].map((d) => `plugins/${d}/.claude-plugin/plugin.json`);
```
</codebase_examples>

<anti_patterns>
- Do not touch `hooks/changelog-on-tag.js`'s `aliasLegacyEnv` line: 78-10 removes every such call in one sweep.
- Do not edit coexistence.cjs or the coexistence-guard hook (78-06).
- Do not bump any version or edit CHANGELOG/CLAUDE.md/docs (78-12 does the docs in one place).
- Do not delete `__fixtures__/legacy-command-fixtures.cjs` if a remaining test imports it; trim it instead.
- Do not remove DEPRECATION_MAP or REMOVED_COMMANDS behaviour; only the legacy namespaces go.
</anti_patterns>

<error_recovery>
- If `scripts/ci-unit-gate.test.cjs` or another script test reads package.json's globs and pins the count, update the
  pin in the same commit.
- If `hook-inventory.test.cjs` or the docs data generator lists the pointer hooks, remove them there too (grep
  `pointer-notice`).
- If the marketplace schema test requires a minimum plugin count, keep the remaining entries as they are.
</error_recovery>

</embedded_context>

<gotchas>
- `plugins/devflow/` holds 34 SKILL.md files, `hooks/hooks.json`, `hooks/pointer-notice.js` (+ its legacy test),
  `README.md` and `.claude-plugin/plugin.json` (a dot directory: use `git rm -r plugins/devflow` so nothing is missed).
- doc-refs.repo.test.cjs tests 15-18 are about the legacy forms: 15 (legacy sensitivity sample) becomes "a legacy form
  is not a command reference: zero findings"; 16 (sibling plugins) keeps checking `/aoforge:` forms; 17 (EXEMPT names
  the pointer) goes; 18 (the scan set holds nothing under either planning directory or the pointer) drops the pointer.
- The rename guard's test 5c and the codemod SKIP (`scripts/aoforge-rename.cjs`) are not pointer-specific; leave them.
</gotchas>

## Test list

Outermost first.
1. Repo contract (`old-commands.legacy.test.cjs`): the pointer plugin directory is absent; marketplace.json has no
   entry named or sourced as the legacy plugin; package.json scripts.test has no glob under the legacy plugin
   directory; `scripts/gen-pointer-skills.cjs` is absent; `plugins/aoforge/.claude-plugin/plugin.json`, package.json
   and the marketplace `aoforge` entry carry the same version.
2. Rename guard: every remaining ALLOW entry matches a tracked path (existing test 4); the span-masking tests pass with
   a synthetic span-scoped entry.
3. doc-refs: `/<legacy plugin ns>:plan-objective`, `/<short ns>:plan-objective` and `/<short>-plan-objective` yield no
   finding (they are not references any more); `/aoforge:plan-objective` yields none; a renamed `/aoforge:` command
   still yields `renamed` with its successor; a removed one still yields `removed`.
4. skill-route: no `NAMESPACE_RENAMES` export.
5. Migration 0007 on a project whose CLAUDE.md block and STATE.md hold a legacy form leaves that text byte-identical,
   and still rewrites a renamed `/aoforge:` command in the same files.
6. changelog-on-tag: a tag whose version matches `plugins/aoforge` manifest passes; the hook no longer reads a second
   manifest path (its PLUGIN_MANIFESTS has one entry).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED — repo contract for the removal</name>
  <files>plugins/aoforge/aoforge/bin/lib/old-commands.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/doc-refs.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-command-fixtures.cjs</files>
  <action>
No new fixture builder is needed beyond trimming: `legacy-command-fixtures.cjs` already builds a project with legacy
command text (hand-built). Write test-list cases 1, 3, 4 and 5 (rewrite doc-refs.legacy.test.cjs and the 0007 legacy
test so they assert the NEW behaviour: legacy forms are ignored). Case 1 reads the repository (skip when not in an
aoforge checkout, the way rename-guard.repo.test.cjs does with IS_AOFORGE_CHECKOUT). Commit them failing.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/old-commands.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.legacy.test.cjs` fails on the cases above (RED), for the right reason (pointer present / legacy forms still read).</verify>
  <done>RED commit exists with the failing contract.</done>
  <recovery>If a case passes already, it is not testing the change: tighten it.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — delete the pointer release and its entries</name>
  <files>plugins/devflow/ (deleted), .claude-plugin/marketplace.json, package.json, scripts/gen-pointer-skills.cjs (deleted), scripts/gen-pointer-skills.legacy.test.cjs (deleted), scripts/__fixtures__/legacy-pointer-fixtures.cjs (deleted), plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs, plugins/aoforge/hooks/changelog-on-tag.js, plugins/aoforge/hooks/changelog-on-tag.test.js</files>
  <action>
- `git rm -r plugins/devflow scripts/gen-pointer-skills.cjs scripts/gen-pointer-skills.legacy.test.cjs scripts/__fixtures__/legacy-pointer-fixtures.cjs`.
- marketplace.json: delete the pointer entry; keep every other entry and the file's formatting.
- package.json scripts.test: drop the `'plugins/devflow/**/*.test.js'` glob.
- rename-guard.repo.test.cjs: delete the four pointer ALLOW entries and their comment; rewrite tests 9a-9c to pass a
  synthetic span-scoped entry (e.g. pattern `fixture.json`, spans built from LEGACY) to `maskAllowedSpans`/`scanFile`
  so the span mechanism stays covered.
- changelog-on-tag.js: `PLUGIN_MANIFESTS` = only the AOForge manifest; update changelog-on-tag.test.js (it imports
  LEGACY.slug for the second manifest today).
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/old-commands.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/hooks/changelog-on-tag.test.js scripts/ci-unit-gate.test.cjs` passes; `test -d plugins/devflow` fails; `rg -n -i "pointer" .claude-plugin/marketplace.json package.json` finds nothing.</verify>
  <done>Case 1, 2 and 6 green; no dead ALLOW entry.</done>
  <recovery>If a deleted file is still required somewhere, `rg -n "gen-pointer-skills|pointer-notice|legacy-pointer-fixtures"` and remove the reference; never restore the pointer.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: GREEN — doc-refs reads the AOForge namespace only</name>
  <files>plugins/aoforge/aoforge/bin/lib/skill-route.cjs, plugins/aoforge/aoforge/bin/lib/skill-route.test.cjs, plugins/aoforge/aoforge/bin/lib/doc-refs.cjs, plugins/aoforge/aoforge/bin/lib/doc-refs.test.cjs, plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs</files>
  <action>
- skill-route.cjs: delete `NAMESPACE_RENAMES` (definition, export, comments that reference it; line ~107 and ~338).
  If skill-route no longer uses LEGACY, drop the import.
- doc-refs.cjs: `NAMESPACES = [NAMES.slug]` (or inline it); delete DASH_NS/DASH_RE and the `prefix` kind for legacy
  namespaces; keep `removed -> renamed -> unknown` resolution for `/aoforge:` tokens. Drop the LEGACY import if unused.
  Rewrite the header comment (no legacy forms).
- doc-refs.test.cjs / skill-route.test.cjs: delete assertions about legacy namespaces; keep the rest.
- doc-refs.repo.test.cjs: remove the pointer EXEMPT entry and test 17; rework 15 and 18 per the gotchas; keep
  `LEGACY_AGENT_EXEMPT` and tests 11-14 untouched.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/doc-refs.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs plugins/aoforge/aoforge/bin/lib/skill-route.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/doc-staleness.test.cjs` passes; `rg -n "NAMESPACE_RENAMES|DASH_RE|commandDash|commandNsShort" plugins/aoforge/aoforge/bin/lib --glob '!legacy-names.cjs' --glob '!*.legacy.test.*' --glob '!__fixtures__/**'` finds nothing outside session-audit/agent-overhead (history readers, kept).</verify>
  <done>Cases 3-5 green; doc-refs knows one namespace.</done>
  <recovery>If doc-staleness (W050-W054) tests relied on a legacy-form fixture, switch the fixture to a renamed `/aoforge:` command.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped while iterating: node --test &lt;the touched *.test.* files&gt;)</test>
</validation_gates>

<verification>
- All test-list cases green; RED commit precedes the GREEN commits.
- `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs scripts/*.test.cjs` passes.
- `git ls-files plugins/devflow scripts/gen-pointer-skills.cjs` prints nothing.
</verification>

<success_criteria>
- No pointer release, no pointer ALLOW entry, no legacy command reader; the decisions above are in the SUMMARY.
</success_criteria>

<output>
After completion, write `78-02-SUMMARY.md` through `node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post 78-02 --from <draft>`
(after `tokens stamp 78-02 --draft <draft>`). Include the Decisions table and the list of deleted paths.
</output>
