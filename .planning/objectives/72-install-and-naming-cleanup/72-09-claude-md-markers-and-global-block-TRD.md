---
objective: 72-install-and-naming-cleanup
trd: "09"
type: standard
wave: 7
depends_on: ["72-06", "72-10"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-claude-md-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/legacy-names.cjs
  - plugins/aoforge/aoforge/bin/lib/legacy-rewrite.cjs
  - plugins/aoforge/aoforge/bin/lib/legacy-rewrite.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/managed-block.cjs
  - plugins/aoforge/aoforge/bin/lib/managed-block.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs
  - plugins/aoforge/aoforge/bin/lib/global-upgrade.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/upgrade-cli.cjs
  - plugins/aoforge/aoforge/templates/global-claude-md.md
autonomous: true
requirements: [INST-03, INST-04, INST-06]
must_haves:
  truths:
    - "managed-block reads a block with either the AOFORGE or the legacy DEVFLOW START/END markers, writes only AOFORGE markers, and replaces a legacy-marker block in place: an upsert never produces two blocks"
    - "Migration 0014 (auto) rewrites a project CLAUDE.md's legacy-marker block to AOFORGE markers (v=/src= attributes kept) and the legacy names inside the block body (product name, slash namespace, CLI, runtime path, planning dir) to AOForge forms; text outside the block is never touched; `changed_files` is `['CLAUDE.md']`"
    - "`legacy-rewrite.rewriteLegacyNames(text)` maps every LEGACY/NAMES pair and leaves PRESERVE tokens (`devflowops`, `devFlowOps`, `devflow-desktop`, `devflow.cloud`) unchanged; legacy-names.cjs exports that PRESERVE list and it equals the codemod's global PRESERVE tokens"
    - "The global template is version 4 with AOForge routing (`/aoforge:` commands, `aoforge@aocyber`, `aoforge/adopt`), so `upgrade --global` rewrites a v3 legacy-marker block in `~/.claude/CLAUDE.md` (backup first) with no confirmation, as template bumps did before"
    - "Legacy names in hand-written text OUTSIDE the global block are never rewritten silently: `aof-tools upgrade --global` prints a unified diff of the proposed outside-block change and a notice; only `aof-tools upgrade --global --confirm` writes it (backup first); the sync-runtime path never passes confirm"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/legacy-rewrite.cjs
      provides: "rewriteLegacyNames(text) and diffLines(a, b) for previews"
      exports: ["rewriteLegacyNames", "hasLegacyNames", "unifiedDiff"]
    - path: plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.cjs
      provides: "auto migration: project CLAUDE.md managed block to AOForge markers and names"
    - path: plugins/aoforge/aoforge/templates/global-claude-md.md
      provides: "AOForge routing block, template_version 4"
      contains: "template_version: \"4\""
  key_links:
    - from: "managed-block.cjs START/END regexes"
      to: "legacy-names.cjs NAMES.blockTag / LEGACY.blockTag"
      via: "alternation built from both tags"
      pattern: "blockTag"
    - from: "global-upgrade.cjs runGlobalUpgrade"
      to: "legacy-rewrite.cjs"
      via: "outside-block proposal shown as a diff; written only with confirm"
      pattern: "rewriteLegacyNames"
---

# TRD 72-09: CLAUDE.md blocks: old markers recognised, project blocks migrated, the global file changed only with approval

<objective>
Every managed CLAUDE.md block written so far carries `DEVFLOW:START/END` markers and DevFlow routing. After 72-04 the
code writes `AOFORGE` markers, so without a shim it would no longer see the old block and would add a second one.
Recognise both markers, migrate project blocks automatically (0014), bump the global template to AOForge routing, and
for the user's global `~/.claude/CLAUDE.md` show any change to hand-written text outside the block as a diff that is
applied only on explicit confirmation.

Purpose: INST-03 (old markers recognised, never duplicated), INST-04 (CLAUDE.md migration), and the tool 72-23 uses for
INST-06's global rollout.
Output: managed-block dual markers, `legacy-rewrite.cjs`, migration 0014, global template v4, diff-then-confirm in
`upgrade --global`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md

Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures, one test at a time.

Read narrowly: `managed-block.cjs` (all, 188 lines); `global-upgrade.cjs` 1-60 (header), 231-345 (`headings`,
`findRoutingSection`, `planBlock`), 361-447 (`runGlobalUpgrade`); `upgrade-cli.cjs` the `--global` branch;
`migrations/0005-claude-md-block.cjs` (a project-block migration to mirror); `templates/global-claude-md.md`.

The user's real `~/.claude/CLAUDE.md` (do not read or write it in tests): a v3 `DEVFLOW:START ... src=global-claude-md`
block holding a "DevFlow Routing" heading and the `/devflow:` routing list; OUTSIDE the block, a "## TDD & Quality"
section saying "DevFlow's intent model ..." and an "Import Paths" section mentioning `devflowops` (a different product:
preserved). 72-23 runs the real rollout.
</context>

## Test list

**global-upgrade.legacy.test.cjs** (fake home; fixture copies of the shapes above)
1. Legacy v3 block, no outside legacy text: `runGlobalUpgrade({ userHome })` rewrites the block to v4 AOFORGE markers
   with `/aoforge:` routing, backs up the old file, writes no second block.
2. Legacy block + outside "DevFlow's intent model" line: without confirm, the block is rewritten (template bump) but
   the outside line is unchanged; the result carries `outside: { lines: 1, diff }` and a notice naming
   `aof-tools upgrade --global --confirm`.
3. Same with `confirm: true`: the outside line now says AOForge; `devflowops` elsewhere is unchanged; backup taken.
4. CLI: `aof-tools upgrade --global` (fake HOME) prints the unified diff (`-`/`+` lines) and writes nothing outside the
   block; `--global --confirm` writes it.
5. Hand-written routing section with no block (the pre-36 shape) keeps today's notice-only behaviour, recognising both
   "DevFlow Routing" and "AOForge Routing" headings.

**managed-block.legacy.test.cjs**
6. `read` of a legacy-marker block returns the same meta (`v`, `src`) as an AOFORGE block.
7. `upsert` on text with a legacy block replaces it in place with AOFORGE markers; one block results.
8. A text with one legacy and one new block -> the existing "multiple blocks" error (never silently merged).

**0014-claude-md-rebrand.legacy.test.cjs**
9. Project CLAUDE.md with a legacy block whose body has the product name, `/devflow:quick`, the legacy CLI path and the
   legacy planning dir -> markers and body rewritten; a hand-written paragraph above the block mentioning DevFlow is
   unchanged; `changed_files: ['CLAUDE.md']`.
10. Already AOFORGE with no legacy names -> not applicable. No CLAUDE.md -> not applicable.

**legacy-rewrite.legacy.test.cjs**
11. Each LEGACY/NAMES pair rewrites; PRESERVE tokens survive; `hasLegacyNames` true/false; `unifiedDiff` marks changed
    lines.
12. The codemod's global PRESERVE tokens (`require(path.resolve(__dirname, '..', '..', '..', '..', '..', 'scripts',
    'aoforge-rename.cjs')).PRESERVE`, the same REPO_ROOT formula doc-refs.repo.test.cjs uses) equal
    `legacy-names.PRESERVE` (skipped in a mirror install where scripts/ is absent).

<embedded_context>

<codebase_examples>
Current markers (managed-block.cjs 27-31):
```js
const START_RE = /<!--\s*DEVFLOW:START\b([^>]*?)\s*-->/g;     // after 72-04 the literal reads AOFORGE
const END_RE = /<!--\s*DEVFLOW:END\s*-->/g;
```
Target: `const TAGS = `(?:${NAMES.blockTag}|${LEGACY.blockTag})`;` and build START/END/SINGLE_START from it; `render`
uses `NAMES.blockTag` only.
</codebase_examples>

<anti_patterns>
- Never rewrite outside a project block, and never write outside the global block without `confirm`.
- Do not read or write the real `~/.claude/CLAUDE.md` in tests; always a fake home.
- Do not spell legacy names in non-test code: LEGACY constants and the new PRESERVE export.
- Do not change the template-bump semantics (block-only, no confirmation) beyond the version bump.
</anti_patterns>

<error_recovery>
- If the template bump makes existing global-upgrade tests fail on `v=3`, they pin the old version: update them to read
  the version from the template file, not a literal.
- If `upgrade-cli` has no place to print a diff in `--raw` mode, include it in the JSON as `outside_diff` and print it in
  prose mode.
</error_recovery>

</embedded_context>

<gotchas>
- 0007 (doc-refs fix) runs before 0014 and, after 72-13, maps legacy slash commands (including renamed ones) inside the
  block; 0014's own slash-namespace rewrite is a harmless idempotent fallback.
- Live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder: legacy CLAUDE.md shapes; PRESERVE in legacy-names</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-claude-md-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/legacy-names.cjs</files>
  <action>
Fixture: `globalClaudeMd({ outsideLegacy = true })` (a typed-out copy of the structure in context: an Import Paths
section with `devflowops`, a v3 legacy block with routing, a TDD section with the legacy product name),
`projectClaudeMd({ legacyBlock = true })`, `fakeHomeWith(text)`. legacy-names.cjs: add frozen
`PRESERVE = ['devflowops', 'devFlowOps', 'DevFlowOps', 'devflow-desktop', 'devflow.cloud']` (header: shared with the
codemod; 72-09 adds a consistency test). Check with `node -e`. Commit (`test(72-09): legacy CLAUDE.md fixtures`).
  </action>
  <verify>node -e "const f=require('./plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-claude-md-fixtures.cjs');console.log(f.globalClaudeMd().split('\n').length)" && node --test plugins/aoforge/aoforge/bin/lib/legacy-names.legacy.test.cjs</verify>
  <done>Fixtures exist; legacy-names exports PRESERVE; its suite passes.</done>
  <recovery>If legacy-names' frozen-key test enumerates exports, add PRESERVE to its expectations.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: legacy-rewrite, managed-block dual markers, migration 0014</name>
  <files>plugins/aoforge/aoforge/bin/lib/legacy-rewrite.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/legacy-rewrite.cjs, plugins/aoforge/aoforge/bin/lib/managed-block.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/managed-block.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.cjs</files>
  <action>
RED: tests 6-12 (header lists first). Run: fail. Commit RED.

GREEN: `legacy-rewrite.cjs` (mask PRESERVE, apply pairs most specific first, unmask; `unifiedDiff` with a small LCS or
line-by-line diff: no dependency); managed-block dual-tag regexes; `0014-claude-md-rebrand.cjs` (auto, since 3.0.0)
over the block only, using managed-block to locate it. Run the existing managed-block, 0005 and 0007 suites. Commit
GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/legacy-rewrite.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/managed-block.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/managed-block.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0005-claude-md-block.test.cjs</verify>
  <done>Tests 6-12 pass; existing managed-block and 0005 suites pass.</done>
  <recovery>If 0005 detects a legacy-marker block as "no block", the dual regex is not used in its read path; route it
through managed-block.read.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Global template v4 and diff-then-confirm for outside text</name>
  <files>plugins/aoforge/aoforge/bin/lib/global-upgrade.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs, plugins/aoforge/aoforge/bin/lib/upgrade-cli.cjs, plugins/aoforge/aoforge/templates/global-claude-md.md</files>
  <action>
RED: tests 1-5. Run: fail. Commit RED.

GREEN: template `template_version: "4"` and verify its routing reads AOForge (the codemod already rewrote names; fix
anything it could not); `ROUTING_RE` accepts both product names (from NAMES/LEGACY); `runGlobalUpgrade` computes the
outside-block proposal with `rewriteLegacyNames` over the text outside the block, returns it as `outside`, emits a
notice when it is non-empty and not confirmed, and writes it (after `backupClaudeMd`) only when `confirm`;
`upgrade-cli` prints the diff in prose mode and includes `outside_diff` in JSON. Run the global-upgrade, upgrade-cli and
sync-runtime suites and the full suite. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/global-upgrade.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/global-upgrade.test.cjs plugins/aoforge/aoforge/bin/lib/upgrade-cli.test.cjs</verify>
  <done>Tests 1-12 pass; existing suites pass; full suite at baseline.</done>
  <recovery>If the notices module rejects a new notice kind, reuse the existing `confirm`-pending kind global-upgrade
already emits for the hand-written routing section.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'</test>
</validation_gates>

<verification>
- `HOME=<fake with the fixture> node plugins/aoforge/aoforge/bin/aof-tools.cjs upgrade --global` prints a diff and
  leaves the outside text unchanged.
- `rg -n "blockTag" plugins/aoforge/aoforge/bin/lib/managed-block.cjs` shows both tags in the regex source.
</verification>

<success_criteria>
- No CLAUDE.md block is ever duplicated by the rename; project blocks migrate themselves; the global file's hand-written
  text changes only after the user sees and approves the diff.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-09-SUMMARY.md` through
`df-tools summary post`.
</output>
