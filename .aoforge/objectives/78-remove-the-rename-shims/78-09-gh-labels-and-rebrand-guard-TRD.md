---
objective: 78-remove-the-rename-shims
trd: "09"
type: standard
wave: 2
depends_on: ["78-03"]
files_modified:
  - plugins/aoforge/aoforge/bin/lib/gh-legacy-labels.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-legacy-labels.legacy.test.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-body.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-body.test.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-issue.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-issue.test.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-cache.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-hierarchy.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-outbox-flush.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-outbox.test.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-check-cli.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-verbs.cjs
  - plugins/aoforge/aoforge/bin/lib/planning-verbs-pr.test.cjs
  - plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs
autonomous: true
requirements: [SC-2, SC-4]
must_haves:
  truths:
    - "gh-body exports no legacyLabel, labelForms or unionByNumber and no longer imports LEGACY"
    - "Every lookup by a DEFAULT label (objective issues in mirror sync and the store, the cache listing, the TRD hierarchy scan, the outbox's adopt-by-label scan, the checks' objective lookup) lists that one label only"
    - "Before such a lookup, the repository is checked once per process for the default label's pre-rename twin (`GET repos/{repo}/labels/{twin}`): present -> the lookup returns `{ ok: false }` with a message naming the twin and `aof-tools gh rebrand --apply`, so no issue is created a second time; absent (404) -> proceed; the result is cached per repo and label for the process"
    - "planning-verbs' in-progress label removal takes off the default label (or the configured one) only"
    - "`aof-tools gh rebrand` dry run and --apply still work on a repository that has the pre-rename labels (the guard never blocks the converter)"
  artifacts:
    - path: plugins/aoforge/aoforge/bin/lib/gh-legacy-labels.cjs
      provides: "the un-rebranded-repository check and its message"
      exports: [legacyTwin, checkRebranded, clearCache]
  key_links:
    - from: plugins/aoforge/aoforge/bin/lib/gh-issue.cjs scanObjectiveIssues
      to: gh-legacy-labels.checkRebranded
      via: "an un-rebranded repository fails the scan instead of being scanned under the new label only"
      pattern: "checkRebranded"
    - from: plugins/aoforge/aoforge/bin/lib/gh-outbox-flush.cjs scanByLabel
      to: gh-legacy-labels.checkRebranded
      via: "the outbox never re-creates an issue that carries the pre-rename label"
      pattern: "checkRebranded"
---

# TRD 78-09: GitHub label lookups use one label; an un-rebranded repository stops with the fix

<objective>
Remove the label-twin lookups TRD 72-11 added (a default label listed together with its pre-rename twin and merged by
issue number). Because listing only the AOForge label in a repository that still uses the pre-rename labels would make
mirror sync and the outbox create every issue a second time, replace the twin listing with a check: when the default
label's pre-rename twin exists, the lookup fails with a message that names `aof-tools gh rebrand --apply`.

Purpose: SC-2 (dual-namespace GitHub readers removed) without silent breakage (SC-4's principle applied to GitHub).
Output: gh-legacy-labels.cjs, single-label lookups in six modules, tests.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/ROADMAP.md (Objective 78 section only)
@.aoforge/objectives/78-remove-the-rename-shims/78-03-SUMMARY.md
@.aoforge/objectives/72-install-and-naming-cleanup/72-11-SUMMARY.md (label section)
@plugins/aoforge/aoforge/bin/lib/gh-issue.cjs (scanObjectiveIssues, listByLabel)
@plugins/aoforge/aoforge/bin/lib/gh-outbox-flush.cjs (lines 415-480)

Objective-wide rules (apply to every task):
- Use the repo copy of the CLI: `node plugins/aoforge/aoforge/bin/aof-tools.cjs ...`. Never the installed runtime.
- Commit only through `node plugins/aoforge/aoforge/bin/aof-tools.cjs commit "<type>(78-09): <desc>" --files <paths>`.
  RED commit before GREEN.
- Tests use the existing gh fakes/seams; no live GitHub call. Never port 8080. Never push, tag or release.
- Rename guard: legacy names only in `legacy-names.cjs`, `__fixtures__/legacy-*`, `*.legacy.test.*`; the new module
  builds the twin from `LEGACY.markerNs`.

Decision this TRD records (copy, with its reason, into the SUMMARY):
- **Label twins: REMOVE; ADD an "is this repository rebranded" check.** Reason: without the twin listing, a repository
  that still labels its issues `<pre-rename ns>:objective` would get duplicates from mirror sync and the outbox. One
  label lookup per default label per process is cheap and turns that into one clear error naming the converter
  (gh rebrand, kept by 78-03). Only DEFAULT labels have twins (a configured label is used as configured), matching
  72-11's rule.
</context>

<embedded_context>

<codebase_examples>
The twin helpers to delete (gh-body.cjs, end of file):
```js
const LEGACY_LABEL_PREFIX = `${LEGACY.markerNs}:`;
function legacyLabel(label) { ... return LEGACY_LABEL_PREFIX + label.slice(LABEL_PREFIX.length); }
function labelForms(label, defaultLabel) { const twin = label === defaultLabel ? legacyLabel(label) : null; ... }
function unionByNumber(lists) { ... }
```
A caller today (gh-issue.cjs scanObjectiveIssues):
```js
for (const label of bodyLib.labelForms(runCtx.label, DEFAULT_OBJECTIVE_LABEL)) {
  const listed = listByLabel(runCtx, label);
  if (!listed.ok) { failed = listed; break; }
  lists.push(listed.issues);
}
...
const issues = bodyLib.unionByNumber(lists);
```
Other callers: gh-cache.cjs ~531, gh-hierarchy.cjs ~678, gh-outbox-flush.cjs ~470 (scanByLabel, with
`defaultLabelFor(role)`), gh-check-cli.cjs ~319 (findObjectiveIssue), planning-verbs.cjs ~641-650 (inProgressLabels).
gh-outbox-flush's capability failure shape: `return failWith('permission', '<one line>')` — reuse failWith with a new
kind (e.g. 'legacy-namespace') for the refusal.
</codebase_examples>

<anti_patterns>
- Do not list the twin "just to detect": one label GET per default label, not a list call.
- Do not call the check for a CONFIGURED (non-default) label; 72-11 never twinned those.
- Do not let the check run inside `gh rebrand` (it reads labels to rename them). gh-rebrand does not call these
  lookups today; keep it that way and prove it with its suite.
- Do not touch gh-backfill / migration 0011 label lists (they were AOForge-only already).
- A transient API error is not "absent": treat a non-200/404 answer as the lookup's normal failure path.
</anti_patterns>

<error_recovery>
- gh-issue.test.cjs, gh-outbox.test.cjs, gh.test.cjs and planning-verbs-pr.test.cjs have 72-11 cases asserting the
  twin is listed or removed; flip them to the new behaviour (single label; refusal when the twin exists). Fakes must
  answer the label GET: add a default "404" answer to the shared fake so unrelated tests keep passing.
- If a fake client cannot express "GET label -> 404", extend it in the fixture module rather than special-casing the
  production code.
</error_recovery>

</embedded_context>

<gotchas>
- `clearCache()` is exported for tests; production code never clears it (a process that saw the twin keeps refusing
  until it exits, which is what you want during a rebrand).
- URL-encode the label name in the GET path (`:` and spaces).
- The message: `<owner/repo> still has the pre-rename label "<twin>", which AOForge no longer reads, so it will not
  look issues up by "<label>" alone: run \`aof-tools gh rebrand --apply\` (docs/MIGRATING-TO-AOFORGE.md, "Repositories
  with GitHub integration"), then retry`.
</gotchas>

## Test list

Outermost first; fakes answer `gh api` calls (hand-built; no recorded data needed).
1. Mirror sync (`gh sync` through gh-issue's run context) against a fake repository where the twin of
   `aoforge:objective` exists: the run fails with the message; no create call was made.
2. The same with the twin absent (404): issues are listed under `aoforge:objective` only and sync proceeds as before.
3. Outbox flush whose op needs `scanByLabel` for a TRD: twin present -> flush halts with kind `legacy-namespace` and
   the message; twin absent -> as before.
4. gh-check-cli `findObjectiveIssue`: twin present -> a failure naming rebrand; absent -> lists one label.
5. gh-cache listing and gh-hierarchy scan: one label listed; refusal when the twin exists.
6. planning-verbs in-progress removal: removes only `aoforge:in-progress` (or the configured label).
7. `gh-legacy-labels` unit: `legacyTwin('aoforge:trd')` -> the pre-rename twin; a non-namespaced label -> null;
   `checkRebranded` caches per repo+label (second call makes no API call); 200 -> refusal, 404 -> ok, 500 -> error.
8. gh-body exports no twin helpers; gh-rebrand dry run over the legacy fixtures is unchanged.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RED + GREEN — the rebrand check module</name>
  <files>plugins/aoforge/aoforge/bin/lib/gh-legacy-labels.cjs, plugins/aoforge/aoforge/bin/lib/gh-legacy-labels.legacy.test.cjs</files>
  <action>
RED: case 7; commit failing. GREEN: `gh-legacy-labels.cjs` exporting `legacyTwin(label)` (AOForge-namespace label ->
pre-rename twin, else null), `checkRebranded({ repo, label, defaultLabel, client })` -> `{ ok: true }` |
`{ ok: false, kind: 'legacy-namespace', error }` | `{ ok: false, kind: 'error', error }`, and `clearCache()`. Use the
same client seam the callers use for `gh api` reads (inject it; default to gh-client's read function). Header comment:
why it exists (78-09 decision) and that it is a detector, not a reader.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/gh-legacy-labels.legacy.test.cjs` passes after GREEN and failed at RED.</verify>
  <done>Case 7 green.</done>
  <recovery>If gh-client has no single-resource GET helper that reports 404 distinctly, use the one gh-capability uses (`httpStatus`/`classify`) pattern.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: RED + GREEN — store and mirror lookups (gh-issue, gh-cache, gh-hierarchy, gh-outbox-flush)</name>
  <files>plugins/aoforge/aoforge/bin/lib/gh-issue.cjs, plugins/aoforge/aoforge/bin/lib/gh-issue.test.cjs, plugins/aoforge/aoforge/bin/lib/gh-cache.cjs, plugins/aoforge/aoforge/bin/lib/gh-hierarchy.cjs, plugins/aoforge/aoforge/bin/lib/gh-outbox-flush.cjs, plugins/aoforge/aoforge/bin/lib/gh-outbox.test.cjs</files>
  <action>
RED: cases 1, 2, 3, 5 (rewrite the 72-11 twin cases in the existing suites). Commit failing.
GREEN: in each caller, replace the `labelForms` loop with: if `label === defaultLabel`, `checkRebranded(...)`; on
`ok:false` return that failure through the caller's existing failure shape (gh-outbox-flush: `failWith(kind, error)`);
then list the one label and index it directly (no unionByNumber). Update the 72-11 comments at each site.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/gh-issue.test.cjs plugins/aoforge/aoforge/bin/lib/gh-outbox.test.cjs plugins/aoforge/aoforge/bin/lib/gh-cache.test.cjs plugins/aoforge/aoforge/bin/lib/gh-hierarchy.test.cjs plugins/aoforge/aoforge/bin/lib/gh.test.cjs plugins/aoforge/aoforge/bin/lib/gh-sync.test.cjs plugins/aoforge/aoforge/bin/lib/gh-e2e.test.cjs` passes (skip absent files).</verify>
  <done>Cases 1-3 and 5 green.</done>
  <recovery>If many suites break because their fake has no label GET, add the default 404 answer to the shared fake builder (in `__fixtures__/`) in this task's commit.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: RED + GREEN — checks lookup, in-progress label, gh-body helpers removed</name>
  <files>plugins/aoforge/aoforge/bin/lib/gh-check-cli.cjs, plugins/aoforge/aoforge/bin/lib/planning-verbs.cjs, plugins/aoforge/aoforge/bin/lib/planning-verbs-pr.test.cjs, plugins/aoforge/aoforge/bin/lib/gh-body.cjs, plugins/aoforge/aoforge/bin/lib/gh-body.test.cjs, plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs</files>
  <action>
RED: cases 4, 6, 8. Commit failing.
GREEN: gh-check-cli `findObjectiveIssue` uses checkRebranded + one label; planning-verbs `inProgressLabels` returns
`[label]`; gh-body: delete LEGACY_LABEL_PREFIX, legacyLabel, labelForms, unionByNumber, their exports, the LEGACY
import and the header sentence about label twins. `rg -n "labelForms|unionByNumber|legacyLabel" plugins/aoforge` must
find nothing outside tests that assert their absence.
  </action>
  <verify>`node --test plugins/aoforge/aoforge/bin/lib/gh-check-cli.test.cjs plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/planning-verbs-pr.test.cjs plugins/aoforge/aoforge/bin/lib/gh-body.test.cjs plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs plugins/aoforge/aoforge/bin/lib/gh-rebrand.test.cjs` passes (skip absent files); `rg -n "LEGACY" plugins/aoforge/aoforge/bin/lib/gh-body.cjs` finds nothing.</verify>
  <done>Cases 4, 6, 8 green; gh-body is single-namespace end to end.</done>
  <recovery>If gh-rebrand used `legacyLabel` for its label plan, copy that one-liner into gh-rebrand (built from LEGACY) in this commit.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test (scoped while iterating: node --test &lt;the touched gh*.test.cjs files&gt;)</test>
</validation_gates>

<verification>
- Cases 1-8 green; RED before GREEN per task.
- `rg -n "LEGACY\." plugins/aoforge/aoforge/bin/lib/gh-*.cjs --glob '!*.test.*'` lists only gh-rebrand.cjs and
  gh-legacy-labels.cjs (and gh-setup.cjs's PR-template detector from 78-03).
- `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` passes.
</verification>

<success_criteria>
- No GitHub lookup reads a pre-rename label; an un-rebranded repository gets one clear error, never duplicates.
  Decision recorded.
</success_criteria>

<output>
After completion, write `78-09-SUMMARY.md` through `node plugins/aoforge/aoforge/bin/aof-tools.cjs summary post 78-09 --from <draft>`
(after `tokens stamp 78-09 --draft <draft>`). Include the Decision and every call site changed.
</output>
