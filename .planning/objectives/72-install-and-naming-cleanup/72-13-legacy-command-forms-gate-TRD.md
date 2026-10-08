---
objective: 72-install-and-naming-cleanup
trd: "13"
type: standard
wave: 5
depends_on: ["72-06"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-command-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/skill-route.cjs
  - plugins/aoforge/aoforge/bin/lib/doc-refs.cjs
  - plugins/aoforge/aoforge/bin/lib/doc-refs.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.legacy.test.cjs
autonomous: true
requirements: [INST-01]
must_haves:
  truths:
    - "skill-route.cjs exports `NAMESPACE_RENAMES` mapping the legacy slash namespaces (`devflow`, `df`, derived from LEGACY) to `aoforge`; DEPRECATION_MAP, REMOVED_COMMANDS and NAMESPACE_RENAMES are together the single rename source and doc-refs declares no mapping of its own"
    - "doc-refs classifies `/devflow:<x>` and `/df:<x>` as `prefix` with replacement `/aoforge:<x>` (or `renamed` with `/aoforge:<mapped>` when `<x>` is in DEPRECATION_MAP), and `/df-<x>` as `prefix` only when `<x>` is a live skill, a DEPRECATION_MAP key or a removed command (so `/df-tools.cjs` and paths are never findings)"
    - "The doc-refs repo gate fails on any `/df-`, `/df:` or `/devflow:` form in its scan set (and on legacy forms in the sibling plugins), with CHANGELOG, `.planning/`/`.aoforge/` archives, tests and legacy fixtures exempt; it passes on the tree"
    - "Migration 0007 rewrites `/devflow:quick` to `/aoforge:quick` and `/devflow:progress` to `/aoforge:status` inside a project CLAUDE.md managed block and STATE.md outside its Session Log, and leaves a removed command as written"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/skill-route.cjs
      provides: "NAMESPACE_RENAMES beside DEPRECATION_MAP and REMOVED_COMMANDS"
      contains: "NAMESPACE_RENAMES"
    - path: plugins/aoforge/aoforge/bin/lib/doc-refs.legacy.test.cjs
      provides: "legacy command forms: classification and rewrite"
    - path: plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs
      provides: "INST-01 repo gate over legacy command forms"
  key_links:
    - from: "doc-refs.cjs resolveToken"
      to: "skill-route.cjs NAMESPACE_RENAMES + DEPRECATION_MAP + REMOVED_COMMANDS"
      via: "require; precedence removed -> renamed -> prefix -> unknown -> ok"
      pattern: "NAMESPACE_RENAMES"
    - from: "migrations/0007-doc-refs-fix.cjs"
      to: "doc-refs.rewriteText"
      via: "unchanged call; new forms flow through the resolver"
      pattern: "rewriteText"
---

# TRD 72-13: The repo test that fails on legacy command forms (`/df-`, `/df:`, `/devflow:`)

<objective>
INST-01's gate: every user-facing command reference uses `/aoforge:<name>`, and a repo test fails on `/df-`, `/df:` and
now `/devflow:`. The existing doc-refs gate (objective 38) is the right home: it already reads the rename map from
skill-route.cjs, scans the live text, exempts tests and archives, and drives migration 0007's project fixes. Teach it
the legacy namespaces through one new map in skill-route.cjs.

Purpose: INST-01 (repo test and the `/aoforge:` form everywhere user-facing), INST-04 via 0007 for projects.
Output: NAMESPACE_RENAMES, doc-refs legacy forms, repo gate extended, 0007 covered.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md

Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures, one test at a time.

Read narrowly: `doc-refs.cjs` 1-60 (TOKEN_RE, resolveToken), 118-190 (scanText, rewriteText), 210-300 (liveSkillNames,
walkFiles); `doc-refs.repo.test.cjs` 1-130 (test list, SCAN_INCLUDE, EXEMPT) and its sensitivity tests;
`skill-route.cjs` 100-145; `migrations/0007-doc-refs-fix.cjs` 1-60.

After 72-04 the TOKEN_RE reads `(aoforge|df)` and the replacements `/aoforge:`; a `/devflow:` form is currently not
even matched, which is the gap this TRD closes.
</context>

## Test list

**doc-refs.legacy.test.cjs**
1. `resolveToken('devflow', 'quick')` -> prefix `/aoforge:quick`; `('df', 'quick')` -> prefix `/aoforge:quick`.
2. `resolveToken('devflow', 'progress')` -> renamed `/aoforge:status`; `('devflow', 'update')` -> removed.
3. `resolveToken('aoforge', 'quick')` -> ok; `('aoforge', 'nope', { liveSkills })` -> unknown.
4. `scanText('/df-quick and /df-tools.cjs and ~/bin/df-plan')` -> one finding (`/df-quick`, prefix); `/df-progress` ->
   renamed `/aoforge:status`; `/df-nope` -> no finding.
5. `rewriteText` turns `/devflow:quick /df:health /df-quick /devflow:update` into
   `/aoforge:quick /aoforge:status check /aoforge:quick /devflow:update` (removed left as written).
6. `NAMESPACE_RENAMES` is frozen, keys derived from LEGACY (`devflow`, `df`), values `aoforge`.

**doc-refs.repo.test.cjs (extended)**
7. Sensitivity sample `"/df:quick /devflow:health /aoforge:update /aoforge:nope /aoforge:status /devflow:quick"` -> kinds
   `[prefix, renamed, removed, unknown, prefix]` (status ok, filtered).
8. Sibling-plugin scan (`plugins/eden-ui-*/**`, `plugins/monorepo-standards/**`, `plugins/aosentry-mcp/**`,
   `plugins/social-media-generator/**`): zero `prefix`/`renamed` findings (unknown names there are other plugins'
   commands and are ignored).
9. Main gate green on the tree; EXEMPT gains `**/legacy-names.cjs` and `**/__fixtures__/legacy-*` only if they appear
   in the scan set (tests are already exempt).

**0007-doc-refs-fix.legacy.test.cjs**
10. Project with a managed block containing `/devflow:quick` and `/devflow:progress`, STATE.md with `/df:quick` above
    the Session Log and `/devflow:quick` inside it -> after apply, block and pre-log STATE.md rewritten, Session Log
    unchanged, `changed_files` lists both.

<embedded_context>

<codebase_examples>
Today (post-72-04):
```js
const TOKEN_RE = /(?<![A-Za-z0-9_])\/(aoforge|df):([a-z][a-z0-9-]*)/g;
if (prefix === 'df') return { kind: 'prefix', replacement: '/aoforge:' + name };
```
Target: namespaces from `[NAMES.slug, ...Object.keys(NAMESPACE_RENAMES)]`, the colon form for all, and a second
dash-form matcher for the legacy short namespace only (`/df-<name>`), filtered to known command names before it becomes a
finding. Replacements from `NAMES.commandNs`.
</codebase_examples>

<anti_patterns>
- Do not add a second rename table in doc-refs or the test. One source: skill-route.cjs.
- Do not scan CHANGELOG, the planning archives or docs history.
- Do not let the dash form match paths (`bin/df-tools`, `~/.claude/agents/df-*`): only `/df-<known command>` with the
  slash not preceded by an identifier, `.`, `/` or `~`.
</anti_patterns>

<error_recovery>
- If the gate finds legacy forms in files 72-04's codemod could not reach (e.g. a `/df-` dash form), fix them with
  `rewriteText` through a tiny one-off node call and commit them with this TRD; record the files.
- If the help.md rename-table test breaks, the table must still deep-equal DEPRECATION_MAP (NAMESPACE_RENAMES is separate).
</error_recovery>

</embedded_context>

<gotchas>
- The CLAUDE.md transition note spells no slash command (72-04), so it needs no exemption.
- Live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder: legacy command text and a project with a legacy block</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-command-fixtures.cjs</files>
  <action>
`legacyCommandText()` (the strings of tests 4, 5, 7, typed out), `legacyCommandProject()` (tmp project, `.aoforge/`
layout, CLAUDE.md with an AOFORGE-marked block containing legacy command forms, STATE.md with a Session Log section; use
`legacy-layout-fixtures.cjs` for the tree). Check with `node -e`. Commit (`test(72-13): legacy command fixtures`).
  </action>
  <verify>node -e "const f=require('./plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-command-fixtures.cjs');const p=f.legacyCommandProject();console.log(require('fs').existsSync(p.root+'/CLAUDE.md'));p.cleanup()"</verify>
  <done>Both builders exist.</done>
  <recovery>Build the block with managed-block.render so its markers are current.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: NAMESPACE_RENAMES and doc-refs legacy forms</name>
  <files>plugins/aoforge/aoforge/bin/lib/doc-refs.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/skill-route.cjs, plugins/aoforge/aoforge/bin/lib/doc-refs.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.legacy.test.cjs</files>
  <action>
RED: tests 1-6 and 10. Run: fail. Commit RED.

GREEN: `NAMESPACE_RENAMES` in skill-route.cjs (comment: part of the single rename source, objective 72); doc-refs
resolver and matchers per codebase_examples; header comment updated. 0007 should need no code change; if it does, keep
it calling doc-refs only. Run the doc-refs, skill-route and 0007 suites. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/doc-refs.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.test.cjs plugins/aoforge/aoforge/bin/lib/skill-route.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.test.cjs</verify>
  <done>Tests 1-6 and 10 pass; existing suites pass.</done>
  <recovery>If doc-refs.test.cjs pinned the old `prefix` replacement for `/df:` (now `/aoforge:`), it was rewritten by the
codemod already; any other mismatch is a precedence bug.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: The repo gate over legacy forms, including the sibling plugins</name>
  <files>plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs</files>
  <action>
RED: tests 7-9 (extend the header test list as items 15-17, objective 72). Run: 7 and 8 fail until the resolver
change is in (it is, from Task 2) or until sibling files are fixed; fix any legacy form the gate finds in user-facing
files (error_recovery). Commit GREEN with the fixes. Run the full suite.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>Tests 7-9 pass; the gate is green; full suite at baseline.</done>
  <recovery>A finding inside a sibling plugin naming its OWN command under the wrong namespace (e.g. a monorepo-standards
skill written as a legacy-namespace command): rewrite it to that plugin's namespace, not to aoforge, and say so in the
SUMMARY.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'</test>
</validation_gates>

<verification>
- `node --test plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs` passes.
- `printf '/devflow:quick\n' > <scratch>/x.md` scanned with `node -e` through `scanText` yields one `prefix` finding.
</verification>

<success_criteria>
- INST-01's repo test exists and is green; legacy command forms in projects are fixed by migration 0007.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-13-SUMMARY.md` through
`df-tools summary post`.
</output>
