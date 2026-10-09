---
objective: 72-install-and-naming-cleanup
trd: "11"
type: standard
wave: 7
depends_on: ["72-06", "72-10"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-gh-fixtures.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-body.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-cache.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-pull.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-hierarchy.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-issue.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-verbs.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-outbox.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-check.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-check-cli.cjs
  - plugins/aoforge/aoforge/bin/lib/checks-pin.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs
autonomous: true
requirements: [INST-03]
must_haves:
  truths:
    - "Every GitHub body parser accepts the legacy marker namespace as well as `aoforge:` (issue id line, comment id+kind, PR marker, part line, begin/end sections, dir marker, reconcile marker); every writer emits only `aoforge:`; a body updated through a section writer keeps one marker set (the legacy section is replaced in place, never duplicated)"
    - "Issue lookups by the default type labels find issues labelled either `aoforge:<kind>` or the legacy `<legacy>:<kind>` (union, de-duplicated); a label explicitly configured in `github.labels.*` is used as configured; the in-progress label is removed in both forms and added in the AOForge form"
    - "The check runner posts each required status under the AOForge context AND the legacy context for one release, so rulesets created before 3.0.0 keep passing; it recognises a legacy PR marker as an AOForge objective PR"
    - "checks-pin parses a legacy managed caller (legacy repo slug, legacy reusable-workflow file name, legacy ref input), reports its pin like a new caller, and marks it `legacy: true` so a pin bump is never applied to it without the rebrand rewriting the whole caller (72-15 makes doctor check 26 point at `aof-tools gh rebrand`)"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-gh-fixtures.cjs
      provides: "legacy issue/comment/PR bodies, label sets, legacy caller workflow text"
      exports: ["legacyIssueBody", "legacyComment", "legacyPrBody", "legacyCaller", "labelPages"]
    - path: plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs
      provides: "parsers accept both namespaces; writers emit one; label union"
    - path: plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs
      provides: "both status contexts posted; legacy PR marker; legacy caller pin"
  key_links:
    - from: "gh-body.cjs marker sources"
      to: "legacy-names.cjs NAMES.markerNs / LEGACY.markerNs"
      via: "namespace alternation in every marker regex source"
      pattern: "markerNs"
    - from: "gh-check-cli.cjs postStatus"
      to: "GitHub statuses API"
      via: "one POST per context: AOForge then legacy"
      pattern: "checkContextNs"
---

# TRD 72-11: GitHub markers, labels and check contexts written so far keep working

<objective>
Store-mode projects keep their planning state in GitHub issues marked `<!-- devflow:id=... -->`, labelled
`devflow:objective` and friends, guarded by required status checks named `devflow/...`. After 72-04 the code speaks
`aoforge:`. Until a repository is rebranded (72-16, per repo, after approval), AOForge must read the old markers and
labels, must not duplicate a marked section when it writes, and must keep the old rulesets green.

Purpose: INST-03 for every GitHub artefact; the safety net under INST-04's per-repo rebrand.
Output: dual-namespace parsers, label union lookups, dual status contexts, legacy caller parsing.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<context>
@.planning/objectives/72-install-and-naming-cleanup/72-CONTEXT.md

Project kind `plugin`, work `feature`: TDD strict, test list first, hand-built fixtures (recorded gh cassettes exist in
`__fixtures__/gh-cassettes/`; extend that pattern, never generate bodies), one test at a time.

Sites at planning (names as they read after 72-04): gh-body.cjs marker sources (MARKER_SOURCE, PR_MARKER_SOURCE, 
PART_LINE_RE ~186, SECTION_MARKER_RE ~380, DIR_MARKER_RE ~587, `markerLine`, `prMarker`, `commentMarker`);
gh-cache.cjs ENTITY_COMMENT_MARKER_RE ~299 and the label table ~509; gh-check-cli.cjs DEFAULT_OBJECTIVE_LABEL ~66,
RECONCILE_MARKER ~330, `postStatus` ~153, CONTEXTS; gh-check.cjs PR-marker handling ~42 and ~327; gh-hierarchy.cjs
DEFAULT_LABELS ~250; gh-issue.cjs ~78; planning-verbs.cjs IN_PROGRESS_LABEL ~625; gh-outbox.cjs entity labels ~126;
checks-pin.cjs 50-90. Find label-scoped issue listing with `rg -n "label" plugins/aoforge/aoforge/bin/lib/gh-pull.cjs plugins/aoforge/aoforge/bin/lib/gh-cache.cjs plugins/aoforge/aoforge/bin/lib/gh-hierarchy.cjs`.
</context>

## Test list

**gh-markers.legacy.test.cjs**
1. `parseIdLine` (or the module's equivalent) on a legacy issue body line 1 -> the same `{ id }` as the AOForge line.
2. Legacy comment marker with `kind=state` -> same `{ id, kind }`; legacy entity comment marker (todo/debug/quick) ->
   recognised by gh-cache.
3. Legacy multi-part comment (`part=1/2`) is reassembled like the new form.
4. Legacy `begin NAME`/`end NAME` section: `upsertSection` replaces it in place with AOForge markers; the body holds
   exactly one section of that name; user text outside it is byte-identical.
5. Legacy dir marker in a wiki section -> parsed.
6. Writers: `markerLine('46')`, `commentMarker`, `prMarker` emit only the AOForge namespace.
7. Label union: a label listing stub returns issue #1 under the AOForge objective label and #2 under the legacy one,
   #3 under both -> lookup yields #1, #2, #3 once each; with `github.labels.objective: 'custom'` only `custom` is queried.
8. In-progress label: removing it issues removals for both forms; adding uses the AOForge form only.

**gh-checks.legacy.test.cjs** (client stubbed at the `ghWrite`/`getJson` seam the existing gh-check tests use)
9. `postStatus` for `planning-consistency` posts two statuses: AOForge context first, then the legacy context, same
   state and description.
10. A PR body opening with the legacy PR marker is treated as an objective PR (not "not an objective PR").
11. Reconcile finds an existing legacy reconcile comment and does not post a second one.
12. checks-pin on `legacyCaller()` -> `{ managed: true, uses_ref: <sha>, legacy: true }` with the same pin fields as a
    new caller; a new caller has `legacy: false`.

<embedded_context>

<codebase_examples>
Marker namespace alternation, built once per module:
```js
const { NAMES, LEGACY } = require('./legacy-names.cjs');
const { escapeRegExp } = require('./text-escape.cjs');
const NS = `(?:${escapeRegExp(NAMES.markerNs)}|${escapeRegExp(LEGACY.markerNs)})`;
// e.g. MARKER_SOURCE = `<!--\\s*${NS}:id=(...)\\s*-->`
```
Writers keep using `NAMES.markerNs` only.
</codebase_examples>

<anti_patterns>
- Never write a legacy marker or label. The shim is read-side only (plus the second status context).
- Never query GitHub search with a namespace-specific string without also querying the legacy form while the shim lives.
- Do not rename labels or edit bodies here: that is the rebrand verb (72-16), behind a dry run and approval.
- No live GitHub calls in tests.
</anti_patterns>

<error_recovery>
- If a parser's capture-group numbering shifts because of the new group, use a non-capturing `(?:...)` (as above).
- If a cassette replays a request list and the label union adds a request, record the extra page in a new cassette
  built from the fixture (hand-written JSON), never by calling GitHub.
</error_recovery>

</embedded_context>

<gotchas>
- `aoforge-checks.yml` is consumed by user repos at a pinned SHA: a legacy caller keeps calling the legacy workflow at
  its old pin (the old commit stays reachable through GitHub's rename redirect). Do NOT add a legacy input alias to
  `aoforge-checks.yml`; instead checks-pin flags the caller `legacy: true`, and only the rebrand (72-16) rewrites a
  caller (slug, file name, input name and pin together).
- Live runtime is DevFlow 2.15.0: commit with `node ~/.claude/devflow/bin/df-tools.cjs commit`. Never port 8080.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: Fixture builder: legacy GitHub artefacts</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-gh-fixtures.cjs</files>
  <action>
Typed-out builders: `legacyIssueBody({ id, sections })` (legacy id line, a legacy begin/end section, user text below),
`legacyComment({ id, kind, parts })`, `legacyPrBody({ objective })`, `legacyCaller({ sha })` (a managed caller workflow
text with the legacy repo slug, legacy reusable-workflow file name and legacy ref input, modelled on
`templates/github/aoforge.yml`), `labelPages({ aoforge: [...], legacy: [...] })` (gh issue list JSON pages). Header:
legacy names may be spelled here. Check with `node -e`. Commit (`test(72-11): legacy GitHub artefact fixtures`).
  </action>
  <verify>node -e "const f=require('./plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-gh-fixtures.cjs');console.log(f.legacyIssueBody({id:'46'}).split('\n')[0])"</verify>
  <done>Builders return legacy-shaped text and JSON.</done>
  <recovery>Copy shapes from the existing gh fixtures and cassettes, replacing only the namespace.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Body markers and label lookups read both namespaces</name>
  <files>plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/gh-body.cjs, plugins/aoforge/aoforge/bin/lib/gh-cache.cjs, plugins/aoforge/aoforge/bin/lib/gh-pull.cjs, plugins/aoforge/aoforge/bin/lib/gh-hierarchy.cjs, plugins/aoforge/aoforge/bin/lib/gh-issue.cjs, plugins/aoforge/aoforge/bin/lib/planning-verbs.cjs</files>
  <action>
RED: tests 1-8 (header list first). Run: fail. Commit RED.

GREEN: namespace alternation in every gh-body/gh-cache marker source; section upsert matches either namespace and
writes AOForge; default-label lookups query both forms and merge by issue number (only when the label in use is the
default, built as `${NS}:<kind>`), including gh-outbox's todo/debug/quick entity labels (writers keep the AOForge
form); in-progress label removal for both forms. Run every `gh-*.test.cjs` and the
planning-verbs suites. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs && node --test plugins/aoforge/aoforge/bin/lib/gh-*.test.cjs plugins/aoforge/aoforge/bin/lib/planning-verbs*.test.cjs</verify>
  <done>Tests 1-8 pass; all gh and planning-verbs suites pass.</done>
  <recovery>If a gh suite pins a request count, the label union added requests: assert the new count only where the
default label is used.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Check contexts, PR marker and caller pin</name>
  <files>plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/gh-check.cjs, plugins/aoforge/aoforge/bin/lib/gh-check-cli.cjs, plugins/aoforge/aoforge/bin/lib/checks-pin.cjs</files>
  <action>
RED: tests 9-12. Run: fail. Commit RED.

GREEN: `postStatus` loops over `[NAMES.checkContextNs, LEGACY.checkContextNs]` contexts (comment: the legacy context is
removed in the release after 3.0.0, after rebrand updates rulesets); PR-marker and reconcile-marker recognition through
the alternation; checks-pin accepts the legacy slug/file/input and sets `legacy: true` (gotchas). Run the gh-check,
checks-pin, workflow-permissions and rename-guard suites and the full
suite. Commit GREEN.
  </action>
  <verify>node --test plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/gh-check.test.cjs plugins/aoforge/aoforge/bin/lib/gh-check-cli.test.cjs plugins/aoforge/aoforge/bin/lib/checks-pin.test.cjs plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs scripts/workflow-permissions.test.cjs</verify>
  <done>Tests 9-12 pass; all listed suites pass; full suite at baseline.</done>
  <recovery>If GitHub's statuses API rate matters in tests, it does not: the client is stubbed. In production two POSTs
per check run is within budget; note it in the module header.</recovery>
</task>

</tasks>

<validation_gates>
<test>node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'</test>
</validation_gates>

<verification>
- `rg -n "markerNs" plugins/aoforge/aoforge/bin/lib/gh-body.cjs plugins/aoforge/aoforge/bin/lib/gh-cache.cjs` shows the
  alternation in every marker source.
- `rg -n "checkContextNs" plugins/aoforge/aoforge/bin/lib/gh-check-cli.cjs` shows both contexts posted.
</verification>

<success_criteria>
- A store-mode repository that has not been rebranded keeps syncing, merging and passing its required checks under
  AOForge 3.0.0, and AOForge never writes a duplicate marked section.
</success_criteria>

<output>
After completion, create `.planning/objectives/72-install-and-naming-cleanup/72-11-SUMMARY.md` through
`df-tools summary post`.
</output>
