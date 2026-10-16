---
objective: 78-remove-the-rename-shims
trd: "03"
type: standard
wave: 1
depends_on: []
files_modified:
  - plugins/aoforge/aoforge/bin/lib/gh-body.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-trd.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-cache.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-check-cli.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-setup.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-body.test.cjs
  - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-gh-fixtures.cjs
autonomous: true
requirements: [SC-2]
must_haves:
  truths:
    - "gh-body, gh-trd and gh-cache readers match only the `aoforge` marker namespace: a body, comment, TRD or entity whose first line is a pre-rename marker decodes as unmarked (extractMarker -> null), and a pre-rename begin/end pair is not a managed section"
    - "extractMarker no longer returns a `legacy` flag and withCommentMarker no longer restamps a pre-rename first line; mergeManaged/findPair know one section form"
    - "gh-check-cli posts each `aoforge/<check>` status once, under `aoforge/` only; the reconcile comment is recognised only by `<!-- aoforge:reconcile -->`"
    - "gh setup refuses to write the PR template when the file holds the pre-rename PR-template block, naming `aof-tools gh rebrand --apply` (run from a checkout); it never appends a second block"
    - "`aof-tools gh rebrand` (dry run and --apply) still finds and rewrites every pre-rename label, marker, section, PR template, caller and ruleset context: gh-rebrand.legacy.test.cjs passes unchanged in intent"
    - "The label helpers (legacyLabel, labelForms, unionByNumber) are untouched here (78-09 removes them)"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs
      provides: "pre-rename markers are ignored by every reader"
    - path: plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs
      provides: "one status context per check; legacy reconcile line not recognised"
  key_links:
    - from: plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs
      to: its own LEGACY-built marker/section regexes
      via: "the converter keeps reading the old namespace after the shared readers stop"
      pattern: "LEGACY_MARKER_RE"
    - from: plugins/aoforge/aoforge/bin/lib/gh-setup.cjs PR template step
      to: "gh rebrand --apply"
      via: "a pre-rename PR-template block is reported, never duplicated"
      pattern: "rebrand"
---

# TRD 78-03: GitHub bodies, markers and status contexts read the AOForge namespace only

<objective>
Remove the dual-namespace readers TRD 72-11 added to the GitHub body, TRD, entity and cache codecs, the second status
context the checks post, the legacy reconcile line, and gh setup's in-place replacement of a pre-rename PR-template
block. `gh rebrand` keeps working on its own.

Purpose: SC-2 (dual-namespace GitHub readers removed). Label lookups and the guard that stops an un-rebranded
repository from getting duplicate issues are 78-09.
Output: single-namespace codecs, one status context, a PR-template refusal, a self-contained gh-rebrand.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/ROADMAP.md (Objective 78 section only)
@.aoforge/objectives/72-install-and-naming-cleanup/72-11-SUMMARY.md (what the readers do today)
@plugins/aoforge/aoforge/bin/lib/gh-body.cjs
@plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs (lines 60-140 and 770-850)

Objective-wide rules (apply to every task):
- Use the repo copy of the CLI: `node plugins/aoforge/aoforge/bin/aof-tools.cjs ...`. Never the installed runtime.
- Commit only through `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "<type>(78-03): <desc>" --files <paths>`.
  RED commit before GREEN.
- Tests use the existing gh fakes/seams and a scratch HOME; no live GitHub call. Never port 8080. Never push, tag or
  release.
- Rename guard: legacy names only in `legacy-names.cjs`, `__fixtures__/legacy-*`, `*.legacy.test.*`; elsewhere build
  them from LEGACY.

Decision this TRD records (copy, with its reason, into the SUMMARY):
- **`gh rebrand` (TRD 72-16): KEEP in 3.1.0.** Reason: a repository's labels, hidden markers, wiki pages, ruleset
  contexts and checks caller cannot be fixed by a local `git mv`; the manual equivalent is dozens of API calls. It is
  an explicit, user-invoked converter that reads old names only to rewrite them, never to operate under them, and it is
  the fix the 3.1 messages name (78-09's un-rebranded-repository refusal, W062 for a pre-rename caller). It goes in a
  later release once no repository needs it. To survive the shared readers' removal it owns its legacy patterns.
- **checks-pin's pre-rename caller detection (W062 `legacy: true`, fix `gh rebrand`): KEEP** as a detector.
</context>

<embedded_context>

<codebase_examples>
gh-body.cjs readers today (to reduce to the AOForge namespace):
```js
const NS = `(?:${escapeRegExp(NAMES.markerNs)}|${escapeRegExp(LEGACY.markerNs)})`;
const LEGACY_LINE_RE = new RegExp(`^\\s*<!--\\s*${escapeRegExp(LEGACY.markerNs)}:`);
const legacyBeginMarker = (name) => `<!-- ${LEGACY.markerNs}:begin ${name} -->`;
const SECTION_FORMS = Object.freeze([
  { begin: beginMarker, end: endMarker, legacy: false },
  { begin: legacyBeginMarker, end: legacyEndMarker, legacy: true },
]);
// extractMarker returns { id, kind, legacy }; withCommentMarker restamps a legacy first line; mergeManaged respells a legacy pair.
```
gh-trd.cjs and gh-cache.cjs each define the same `NS` alternation. gh-check-cli.cjs:
```js
const CONTEXT_NAMESPACES = Object.freeze([NAMES.checkContextNs, LEGACY.checkContextNs]);
function statusContexts(context) { ... return CONTEXT_NAMESPACES.map((ns) => `${ns}${check}`); }
const RECONCILE_LINE_RE = new RegExp(`^\\s*<!--\\s*(?:${...NAMES.markerNs}|${...LEGACY.markerNs}):reconcile\\s*-->\\s*$`);
```
gh-setup.cjs (lines ~235 and ~418): `LEGACY_PR_START`/`LEGACY_PR_END`; a found legacy block is replaced in place.
gh-rebrand.cjs already builds its own `LEGACY_MARKER_RE`, `NS_ALT`, `MARKER_LINE_RE`, `SECTION_OPEN_RE` from LEGACY; it
calls `bodyLib.extractMarker` / `findCommentsByMarker` only on text it has already rewritten (line ~828).
</codebase_examples>

<anti_patterns>
- Do not remove `legacyLabel`, `labelForms` or `unionByNumber` from gh-body.cjs, and do not edit gh-issue, gh-hierarchy,
  gh-outbox-flush or planning-verbs: 78-09 owns label lookups (same wave ordering: 78-09 depends on this TRD).
- Do not make a shared reader "tolerate" the old namespace in another way (e.g. a case-insensitive prefix); one
  namespace means one.
- Do not weaken gh-rebrand.legacy.test.cjs to make it pass: if it fails, gh-rebrand still depends on a shared legacy
  reader; give gh-rebrand its own copy of that pattern (built from LEGACY).
- Keep every writer byte-identical (writers already emit `aoforge` only).
</anti_patterns>

<error_recovery>
- gh-body.test.cjs, gh-trd tests, gh-cache tests and gh-e2e tests may contain "accepts the legacy namespace" cases from
  72-11; flip them to "ignores" (move them into gh-markers.legacy.test.cjs if they spell the legacy name) rather than
  deleting coverage.
- If `SECTION_MARKER_RE` (forgery guard) changes what section content may contain, keep it matching the AOForge
  namespace and add a case that a legacy-looking marker inside content is now plain content.
</error_recovery>

</embedded_context>

<gotchas>
- `mergeManaged` has a three-way legacy-pair branch (lines ~560-590): with one section form it collapses to the plain
  path. Re-read the function end to end after the edit; the managed hash (`managedHash`) must be unchanged for AOForge
  bodies (gh-outbox tests pin it).
- The checks reusable workflow and templates/github/aoforge.yml need no change; only the CLI posted twice.
- A repository whose ruleset still requires `devflow/<check>` contexts will now block PRs until `gh rebrand --apply`
  rewrites the ruleset. That is the promised 3.1 behaviour; 78-12 documents it.
</gotchas>

## Test list

Outermost first; fixtures from `__fixtures__/legacy-gh-fixtures.cjs` (hand-built, typed from the pre-rename writers).
1. `gh check` (through gh-check-cli's injectable client) posts exactly one status per check, context `aoforge/<check>`.
2. A reconcile comment whose first line is the pre-rename reconcile marker is not found as "the reconcile comment"; a
   new one is created with the AOForge marker (the AOForge one is still found and updated).
3. `gh setup` (seamed) on a PR template holding the pre-rename block: refuses that step with a message naming
   `aof-tools gh rebrand --apply`; the file is byte-identical; a template with an AOForge block is updated in place as
   before; a template with no block gets one appended as before.
4. gh-cache materialisation (pull) of an objective whose body uses pre-rename markers: not decoded as managed (no
   cache file from it), and an AOForge body still decodes.
5. gh-body: `extractMarker` of a pre-rename first line -> null; of an AOForge one -> `{ id, kind }` with no `legacy`
   key; `withCommentMarker` on a body whose first line is a pre-rename marker for the same id adds an AOForge marker line
   (it is not restamped in place); `mergeManaged` treats a pre-rename begin/end pair as plain text and appends the
   AOForge section.
6. gh-trd: TRD, entity, scope and part lines in the pre-rename namespace are not parsed; AOForge ones are.
7. gh-rebrand dry run and apply over the legacy fixtures produce the same plans and writes as before this TRD
   (existing gh-rebrand.legacy.test.cjs cases).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fixtures and RED tests for single-namespace readers</name>
  <files>plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-gh-fixtures.cjs, plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs, plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs</files>
  <action>
The fixture module already types out legacy bodies, comments, PR templates and callers. Add only what is missing for
the test list (e.g. a PR template holding both nothing else and the legacy block; a reconcile comment builder if not
present). Rewrite gh-markers.legacy.test.cjs and gh-checks.legacy.test.cjs so they assert the 3.1 behaviour (cases
1-6): legacy input is ignored or refused. Commit failing.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs` fails on cases 1-6 for the right reason (legacy still read/posted).</verify>
  <done>RED commit with cases 1-6.</done>
  <recovery>If a fixture change alters gh-rebrand tests, keep the old builder and add a new one.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GREEN — gh-body, gh-trd, gh-cache read one namespace; gh-rebrand self-contained</name>
  <files>plugins/aoforge/aoforge/bin/lib/gh-body.cjs, plugins/aoforge/aoforge/bin/lib/gh-trd.cjs, plugins/aoforge/aoforge/bin/lib/gh-cache.cjs, plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs, plugins/aoforge/aoforge/bin/lib/gh-body.test.cjs, plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs</files>
  <action>
- gh-body.cjs: `NS = escapeRegExp(NAMES.markerNs)`; delete LEGACY_LINE_RE, legacyBeginMarker/legacyEndMarker, the legacy
  SECTION_FORMS entry (or SECTION_FORMS altogether if one form remains), `respellPair`, the `legacy` flag in
  extractMarker/findPair, the restamp branch of withCommentMarker and the legacy branches of mergeManaged. Keep LEGACY
  imported only for the label helpers at the end (78-09 removes them). Rewrite the header comment.
- gh-trd.cjs, gh-cache.cjs: `NS` = AOForge only; drop the LEGACY import where unused; update comments.
- gh-rebrand.cjs: run its suite first. If any case breaks because it relied on a shared reader accepting the old
  namespace (e.g. finding managed issues/comments or section boundaries), give gh-rebrand a local helper built from
  its existing `NS_ALT`/`LEGACY_MARKER_RE`. Do not change its plans or output.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/gh-body.test.cjs plugins/aoforge/aoforge/bin/lib/gh-trd.test.cjs plugins/aoforge/aoforge/bin/lib/gh-cache.test.cjs plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/gh-rebrand.test.cjs plugins/aoforge/aoforge/bin/lib/gh-outbox.test.cjs plugins/aoforge/aoforge/bin/lib/gh-e2e.test.cjs` passes (skip any file that does not exist).</verify>
  <done>Cases 4-7 green; `rg -n "LEGACY" plugins/aoforge/aoforge/bin/lib/gh-trd.cjs plugins/aoforge/aoforge/bin/lib/gh-cache.cjs` finds nothing.</done>
  <recovery>If managedHash changes for AOForge bodies, a section boundary moved: diff old/new `findPair` on the gh-outbox fixtures and restore the AOForge-path logic exactly.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: GREEN — one status context, AOForge reconcile line, PR-template refusal</name>
  <files>plugins/aoforge/aoforge/bin/lib/gh-check-cli.cjs, plugins/aoforge/aoforge/bin/lib/gh-setup.cjs</files>
  <action>
- gh-check-cli.cjs: `statusContexts(context)` returns `[context]`; delete CONTEXT_NAMESPACES and its comment;
  RECONCILE_LINE_RE matches the AOForge namespace only. Leave `findObjectiveIssue`'s labelForms loop for 78-09.
- gh-setup.cjs: keep `LEGACY_PR_START` as a detector constant (comment: "pre-rename block: reported, never edited;
  `gh rebrand` re-marks it"); where the in-place replacement was, return a refusal result for the PR-template step
  (`{ ok: false, reason: 'legacy-pr-template', message: '<path> holds the pre-rename PR-template block; run \`aof-tools
  gh rebrand --apply\` from a checkout of this repository first' }` in the shape the step already uses for failures) and
  write nothing. Delete LEGACY_PR_END if unused.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/gh-check-cli.test.cjs plugins/aoforge/aoforge/bin/lib/gh-check.test.cjs plugins/aoforge/aoforge/bin/lib/gh-setup.test.cjs plugins/aoforge/aoforge/bin/lib/gh-setup-cli.test.cjs plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs` passes (skip files that do not exist).</verify>
  <done>Cases 1-3 green; gh setup never appends a second PR-template block.</done>
  <recovery>If gh-rebrand's local-files section used gh-setup's legacy replacement, move that replacement into gh-rebrand (built from LEGACY) instead of keeping it in gh-setup.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped while iterating: node --test &lt;the touched gh*.test.cjs files&gt;)</test>
</validation_gates>

<verification>
- Every test-list case green; RED commit precedes GREEN commits.
- `rg -n "LEGACY\." plugins/aoforge/aoforge/bin/lib/gh-body.cjs` shows only the label helpers; gh-check-cli shows only
  the labelForms call 78-09 removes.
- `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` passes.
</verification>

<success_criteria>
- No shared GitHub reader accepts the old namespace; gh rebrand still converts a pre-rename repository.
- The gh-rebrand KEEP decision is in the SUMMARY with its reason.
</success_criteria>

<output>
After completion, write `78-03-SUMMARY.md` through `node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post 78-03 --from <draft>`
(after `tokens stamp 78-03 --draft <draft>`). Include the Decisions table and any gh-rebrand helper moved in.
</output>
