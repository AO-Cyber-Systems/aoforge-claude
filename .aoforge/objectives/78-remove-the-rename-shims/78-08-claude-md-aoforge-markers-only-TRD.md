---
objective: 78-remove-the-rename-shims
trd: "08"
type: standard
wave: 2
depends_on: ["78-01"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/managed-block.cjs
  - plugins/aoforge/aoforge/bin/lib/managed-block.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/managed-block.test.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0005-claude-md-block.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0005-claude-md-block.test.cjs
  - plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.cjs
  - plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs
  - plugins/aoforge/aoforge/bin/lib/global-upgrade.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/global-upgrade.test.cjs
  - plugins/aoforge/aoforge/bin/lib/upgrade-cli.cjs
  - plugins/aoforge/aoforge/bin/lib/upgrade-cli.test.cjs
  - plugins/aoforge/hooks/sync-runtime.test.js
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-claude-md-fixtures.cjs
autonomous: true
requirements: [SC-2, SC-4]
must_haves:
  truths:
    - "managed-block reads and writes only the AOFORGE block tag; a text holding a START marker under the pre-rename tag makes `read` (and therefore `upsert`) throw ManagedBlockError with code `ELEGACYBLOCK` and the W069 message and fix (text from planning-layout.legacyBlockMessage, loaded lazily); no caller ever adds a second block beside it"
    - "`isStale` no longer special-cases the pre-rename tag; `read` returns no `tag` other than the AOFORGE one"
    - "Migration 0014 and its test are deleted"
    - "Migrations 0005 and 0007 treat ELEGACYBLOCK as not applicable (reason names W069) so an upgrade run with a pre-rename block still applies every other migration"
    - "The global upgrade no longer moves a pre-rename block in ~/.claude/CLAUDE.md, no longer rewrites hand-written text outside the block, and no longer offers `outside_diff`; a pre-rename block or a pre-rename routing heading yields one global notice naming the fix and no write"
    - "`aof-tools upgrade --global` output has no `outside` section"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/managed-block.cjs
      provides: "one-tag managed block with a refusal on pre-rename markers"
  key_links:
    - from: plugins/aoforge/aoforge/bin/lib/managed-block.cjs read
      to: its own LEGACY_START_RE (same pattern as planning-layout.hasLegacyBlockMarker; a test pins them equal)
      via: "detection needs no new eager dependency; the message text is lazily taken from planning-layout"
      pattern: "LEGACY_START_RE"
    - from: plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs
      to: notices (global)
      via: "ELEGACYBLOCK / pre-rename routing heading -> one notice, no write"
      pattern: "ELEGACYBLOCK"
---

# TRD 78-08: CLAUDE.md managed blocks under the AOFORGE markers only; migration 0014 removed

<objective>
Stop reading managed blocks under the pre-rename `DEVFLOW` markers (TRD 72-09), remove migration 0014 that moved them,
and remove the global upgrade's pre-rename block move and outside-text rewrite. A CLAUDE.md that still holds a
pre-rename block is refused with the W069 text from 78-01 (never duplicated), in projects and in `~/.claude/CLAUDE.md`.

Purpose: SC-2 (the old block markers, promised in the guide, are gone) and SC-4 (one clear message instead of a second
block).
Output: one-tag managed-block, no 0014, simplified global upgrade, tests.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/ROADMAP.md (Objective 78 section only)
@.aoforge/objectives/72-install-and-naming-cleanup/72-09-SUMMARY.md
@plugins/aoforge/aoforge/bin/lib/managed-block.cjs
@plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs (lines 1-70, 270-520)

Objective-wide rules (apply to every task):
- Use the repo copy of the CLI: `node plugins/aoforge/aoforge/bin/aof-tools.cjs ...`. Never the installed runtime.
- Commit only through `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "<type>(78-08): <desc>" --files <paths>`.
  RED commit before GREEN.
- Tests use fake homes and mkdtemp projects; NEVER read or write the real `~/.claude/CLAUDE.md`. Never port 8080.
  Never push, tag or release.
- Rename guard: legacy names only in `legacy-names.cjs`, `__fixtures__/legacy-*`, `*.legacy.test.*`.

Decisions this TRD records (copy each, with its reason, into the SUMMARY):
- **Migration 0014 (CLAUDE.md rebrand): REMOVE.** Reason: it depends on managed-block reading the pre-rename tag,
  which the migration guide listed among the removals ("the old block markers"); it is an automatic conversion of
  pre-rename text, which 3.1 leaves to 3.0.x; the manual equivalent is renaming two marker comments, which W069 names.
  Its id stays reserved (78-07's RETIRED_MIGRATIONS answers `--only 0014`).
- **Global upgrade's pre-rename block move and outside-text rewrite (`outside_diff`, `--global --confirm` rewrite of
  hand-written lines): REMOVE.** Reason: same as above; a detector plus one notice replaces them.
- **`legacy-rewrite.cjs`: KEEP** — after this TRD its only consumer is `gh rebrand` (kept, 78-03).
- **Unrelated "legacy" kept:** `meta.legacy` (an unversioned marker without `v=`) is objective 36's pre-v1 block format,
  not the rename; and global-upgrade's df-* move (`KEYS.legacy`, `result.legacy`) is objective 36's.
</context>

<embedded_context>

<codebase_examples>
managed-block.cjs today:
```js
const TAGS = `(${escapeRegExp(NAMES.blockTag)}|${escapeRegExp(LEGACY.blockTag)})`;
function read(text) { ... throws ManagedBlockError on several STARTs or an unterminated one ...
  return { start, end, content, meta: metaFromAttrs(s[2]), tag: s[1] }; }
function isStale(blockOrText, ver) { ...
  if (block.tag === LEGACY.blockTag) return true;
  if (!block.meta || block.meta.legacy || block.meta.v == null) return true; ... }
```
Callers and how they react to ManagedBlockError today: adopt.cjs scaffold wraps `read` and rethrows
`CLAUDE.md: <message>` before any write (no change needed); doc-staleness.cjs imports ManagedBlockError and skips;
0007 wraps `read` in try; 0005 calls `read` bare (line ~84) — must catch; global-upgrade reads at ~325 and ~376.
global-upgrade.cjs:
```js
const ROUTING_RE = new RegExp(`^(?:${escapeRegExp(NAMES.product)}|${escapeRegExp(LEGACY.product)}) Routing\\b`, 'i');
const { rewriteLegacyNames, diffLines, unifiedDiff } = require('./legacy-rewrite.cjs');
// ~381: outside rewrite of the text around the block; ~496/504: notice texts for it
```
upgrade-cli.cjs (~194-205) renders `result.outside` (lines, diff, applied).
</codebase_examples>

<anti_patterns>
- Do not make `read` silently ignore a pre-rename block: a writer would then append a second block. Throw.
- Do not let a migration's `detect` throw on ELEGACYBLOCK: the runner would halt every later migration.
- Do not touch `meta.legacy` handling (pre-v1 markers) or the df-* move.
- Do not delete legacy-rewrite.cjs; do not touch gh-rebrand.cjs.
- Do not edit upgrade.cjs (78-07 owns it, including the retired id 0014).
</anti_patterns>

<error_recovery>
- adopt-e2e-assert.cjs (`__fixtures__`) and legacy-command-fixtures.cjs call managed-block; if a fixture deliberately
  builds a pre-rename block for an adopt test, that test now expects the refusal.
- If global-upgrade tests snapshot the `outside` payload, delete those snapshots; keep the hand-written AOForge Routing
  adoption path (`--global --confirm` over an "AOForge Routing" heading) exactly as is.
- If the global CLAUDE.md template's `template_version` is asserted to be 4 because of the pre-rename move, leave the
  template alone (content unchanged) and update only the assertion's comment.
</error_recovery>

</embedded_context>

<gotchas>
- NO new eager require in managed-block.cjs or global-upgrade.cjs: hooks/sync-runtime.test.js copies a fixed closure of
  lib files into a fake plugin root (global-upgrade, managed-block, notices, compat, legacy-names, text-escape,
  legacy-rewrite) and 78-06's sync-runtime.legacy.test.js does the same in this wave. managed-block detects with its own
  `LEGACY_START_RE` built from LEGACY.blockTag (it already imports legacy-names), and requires planning-layout.cjs
  lazily, only inside the refusal path, to format the text (fallback: a built-in one-line message when the require
  fails with MODULE_NOT_FOUND). global-upgrade does the same for its notice. Update the closure comment in
  sync-runtime.test.js (legacy-rewrite is no longer needed there; leaving it in the list is harmless).
- The ELEGACYBLOCK text comes from `planningLayout.legacyBlockMessage(fileLabel)` (78-01): pass `'CLAUDE.md'` for a
  project and `'~/.claude/CLAUDE.md'` for the global file. Do not edit planning-layout.cjs here.
- A pre-rename routing HEADING (hand-written, no block) is detected with the legacy product name: keep that one
  alternative as a detector constant (`LEGACY_ROUTING_RE`) that leads to the notice, separate from ROUTING_RE.
</gotchas>

## Test list

Outermost first; fixtures from `legacy-claude-md-fixtures.cjs` (hand-built).
1. `aof-tools upgrade --global --apply` (fake HOME whose ~/.claude/CLAUDE.md has a pre-rename block): the file is
   byte-identical; one global notice names the marker rename and AOForge 3.0.x; the JSON/text has no `outside`.
2. Same with a hand-written pre-rename routing heading and no block: byte-identical file; one notice; no block added.
3. Same with an AOForge block (current or stale) and with an "AOForge Routing" hand-written section: behaviour exactly
   as before (refresh / notice-only / --confirm adopts).
4. `aof-tools upgrade --apply` in a project whose CLAUDE.md holds a pre-rename block: every other applicable migration
   applies; 0005 and 0007 report not applicable with a reason naming W069; CLAUDE.md byte-identical.
5. `managedBlock.read` of a text with a pre-rename START -> throws ManagedBlockError, `code === 'ELEGACYBLOCK'`,
   message names the markers and the fix; with an AOFORGE block -> as before, no `tag` other than AOFORGE;
   `upsert` over a pre-rename block -> throws, text unchanged.
6. `isStale` no longer reads `tag`. managed-block's `LEGACY_START_RE` and planning-layout's `hasLegacyBlockMarker`
   agree on a fixed sample set (legacy START with/without attributes, CRLF, AOFORGE START, END-only, prose mention).
   Loading managed-block.cjs and global-upgrade.cjs does not load planning-layout.cjs (assert via `require.cache`).
7. The registry no longer contains 0014.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fixtures and RED tests</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-claude-md-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/managed-block.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/global-upgrade.legacy.test.cjs</files>
  <action>
The fixtures exist (`globalClaudeMd`, `handWrittenRoutingClaudeMd`, `projectClaudeMd`, `fakeHomeWith`, `projectWith`);
add only what a case lacks (e.g. a CRLF variant). Rewrite managed-block.legacy.test.cjs to cases 5-6 and
global-upgrade.legacy.test.cjs to cases 1-2 (the 72-09 "moved in place" cases become "refused, one notice"). Add case 4
as an outside-in test (spawn `aof-tools --cwd <project> upgrade --apply --raw`). Commit failing.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/managed-block.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/global-upgrade.legacy.test.cjs` fails on the rewritten cases.</verify>
  <done>RED commit with cases 1, 2, 4, 5, 6.</done>
  <recovery>Put case 4 in managed-block.legacy.test.cjs if a separate file is simpler; it must spawn the CLI.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — managed-block one tag + refusal; 0014 deleted; 0005/0007 skip</name>
  <files>plugins/aoforge/aoforge/bin/lib/managed-block.cjs, plugins/aoforge/aoforge/bin/lib/managed-block.test.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0005-claude-md-block.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0005-claude-md-block.test.cjs, plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.cjs</files>
  <action>
- managed-block.cjs: TAGS = AOFORGE only (keep the capture group shape or simplify it consistently); at the top of
  `read`, `if (LEGACY_START_RE.test(text))` throw ManagedBlockError with `code = 'ELEGACYBLOCK'` and the text of
  `legacyBlockMessage('CLAUDE.md')` (message, then `fix:` and the fix; callers that know the file pass their own label
  through an optional `read(text, { label })`); remove the `tag === LEGACY.blockTag` branch of isStale and the "multiple
  blocks, legacy ones included" wording; drop the LEGACY import. Rewrite the header paragraph about pre-rename markers.
- `git rm` 0014 and its legacy test.
- 0005: catch ELEGACYBLOCK in detect -> `{ applies: false, reason: 'CLAUDE.md holds a pre-rename managed block (W069): <fix>' }`.
- 0007: where it reads the block, treat ELEGACYBLOCK as "no block" for the block part (STATE.md part still runs).
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/managed-block.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/managed-block.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0005-claude-md-block.test.cjs plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.test.cjs plugins/aoforge/aoforge/bin/lib/doc-staleness.test.cjs plugins/aoforge/aoforge/bin/lib/adopt*.test.cjs` passes (skip absent files); `git ls-files 'plugins/aoforge/aoforge/bin/lib/migrations/0014*'` prints nothing.</verify>
  <done>Cases 4-7 green.</done>
  <recovery>If the lazy require of planning-layout creates a cycle at refusal time, format the text in managed-block from NAMES/LEGACY/SHIM_RELEASE and keep a test asserting it equals `legacyBlockMessage('CLAUDE.md')`.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: GREEN — global upgrade: no pre-rename move, no outside rewrite, one notice</name>
  <files>plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs, plugins/aoforge/aoforge/bin/lib/global-upgrade.test.cjs, plugins/aoforge/aoforge/bin/lib/upgrade-cli.cjs, plugins/aoforge/aoforge/bin/lib/upgrade-cli.test.cjs</files>
  <action>
- global-upgrade.cjs: ROUTING_RE = AOForge product only; add `LEGACY_ROUTING_RE` (detector). In the block step, catch
  ELEGACYBLOCK and, when LEGACY_ROUTING_RE matches a heading and no AOFORGE block exists, skip the write and queue one
  global notice (`source: 'global-upgrade'`, a stable `key`, level `action`) whose message names `~/.claude/CLAUDE.md`,
  the marker rename (or deleting the pre-rename section) and AOForge 3.0.x. Delete the outside-text rewrite
  (rewriteLegacyNames over text outside the block, `outside: {lines, diff, applied, backup}`, the KEYS entry and notice
  texts for it, the `--confirm` branch that wrote it). Drop legacy-rewrite and LEGACY imports if unused (the detector
  constant may keep LEGACY). Rewrite the header bullets about pre-rename handling.
- upgrade-cli.cjs: remove the `outside` rendering and the header lines 14-17 about it.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/global-upgrade.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/global-upgrade.test.cjs plugins/aoforge/aoforge/bin/lib/upgrade-cli.test.cjs plugins/aoforge/hooks/sync-runtime.test.js` passes; `rg -n "outside_diff|rewriteLegacyNames" plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs plugins/aoforge/aoforge/bin/lib/upgrade-cli.cjs` finds nothing.</verify>
  <done>Cases 1-3 green.</done>
  <recovery>If sync-runtime.test.js asserts the outside notice on first session, drop that assertion (the notice no longer exists) and keep the managed-block assertions.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped while iterating: node --test &lt;the touched *.test.* files&gt;)</test>
</validation_gates>

<verification>
- Cases 1-7 green; RED before GREEN.
- `rg -n "LEGACY" plugins/aoforge/aoforge/bin/lib/managed-block.cjs` finds nothing.
- `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` passes.
</verification>

<success_criteria>
- A pre-rename block is never read as a block and never duplicated; the user is told once with the fix. Decisions
  recorded.
</success_criteria>

<output>
After completion, write `78-08-SUMMARY.md` through `node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post 78-08 --from <draft>`
(after `tokens stamp 78-08 --draft <draft>`). Include the Decisions table.
</output>
