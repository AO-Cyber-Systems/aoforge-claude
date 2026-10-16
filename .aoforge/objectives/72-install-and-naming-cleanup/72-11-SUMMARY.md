---
objective: 72-install-and-naming-cleanup
trd: "11"
subsystem: github-store
tags: [aoforge-rename, shims, github-store, markers, labels, required-checks, checks-pin]

requires:
  - phase: 72-02
    provides: "legacy-names.cjs NAMES/LEGACY (markerNs, checkContextNs, checksCaller, checksWorkflow, repo, slug)"
  - phase: 72-05
    provides: "compat.PLANNING_DIR_NAMES (gh-check-cli reads the head's config.json under either planning directory)"
  - phase: 72-10
    provides: "the legacy fixture and *.legacy.test.* conventions the rename guard allows"
provides:
  - "gh-body.cjs: every marker reader (id line, comment id+kind, PR marker, part line, begin/end sections, dir marker) accepts the legacy namespace through one non-capturing NS alternation; writers emit AOForge only"
  - "gh-body.cjs mergeManaged/findPair/extractSection: a legacy begin/end pair is found, replaced in place in the AOForge form when its content changes, re-spelled when the body changes anyway, and left alone when nothing changes (no write only to rename a marker)"
  - "gh-body.cjs withCommentMarker restamps a legacy first line for the same id in the AOForge form"
  - "gh-body.cjs legacyLabel(label), labelForms(label, defaultLabel), unionByNumber(lists): the default label and its legacy twin, merged by issue number"
  - "gh-trd.cjs: TRD and entity id/file header lines, scope, scope-confirm and part lines read both namespaces"
  - "Default-label lookups list both forms: gh-cache readRemoteModel (objective, trd, decision, todo, debug, quick), gh-issue scanObjectiveIssues, gh-hierarchy reportOrphans, gh-outbox-flush scanByLabel, gh-check-cli findObjectiveIssue; a label configured to anything else is listed alone"
  - "planning-verbs summary post removes the in-progress label in both forms (default only); trd start still adds the AOForge form"
  - "gh-setup planPrTemplate replaces a legacy PR-template block in place"
  - "gh-check-cli postStatus posts each verdict under the AOForge context, then the legacy one (CONTEXT_NAMESPACES); reconcile edits an existing reconcile comment of either namespace in place instead of posting a second"
  - "checks-pin.cjs: parseWorkflowPins reads the legacy caller (header, slug, workflow file, ref input) and sets `legacy`; pinStatus compares its pins like a new caller's; readWorkflowPin falls back to the legacy caller path; collectPinFindings returns `path` and `legacy`, and a legacy caller's W062 fix points at `aof-tools gh rebrand`, never `gh setup --apply`"
  - "__fixtures__/legacy-gh-fixtures.cjs: legacyIssueBody, legacyComment, legacyPrBody, legacyTrdBody, legacyEntityBody, legacyReconcileComment, legacyPrTemplate, legacyCaller, labelPages, HUMAN_TEXT"
affects: [72-15, 72-16, 72-25]

tech-stack:
  added: []
  patterns:
    - "A reader matches `(?:<NAMES.markerNs>|<LEGACY.markerNs>)` built once per module with escapeRegExp; writers keep the AOForge literal"
    - "A rewrite of a legacy-marked block happens only as part of a write that changes the body; an unchanged body is never written just to rename a marker"
    - "A lookup by a default label lists `labelForms(label, default)` and merges with `unionByNumber`; a configured label is used as configured"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-gh-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs
  modified:
    - plugins/aoforge/aoforge/bin/lib/gh-body.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-trd.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-cache.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-issue.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-hierarchy.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-outbox-flush.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-setup.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-verbs.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-check-cli.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-check.cjs
    - plugins/aoforge/aoforge/bin/lib/checks-pin.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-commands.test.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-issue.test.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-verbs-pr.test.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-check-cli.test.cjs
    - plugins/aoforge/aoforge/bin/lib/checks-pin.test.cjs

key-decisions:
  - "A legacy section is rewritten in the AOForge form only when the merge changes the body (its own content, or another section's); merging identical content is changed:false, so a sync never PATCHes an issue just to rename its markers. The legacy id line is kept: it is read like the AOForge one, and the rebrand rewrites it"
  - "Label union only when the label in use equals the AOForge default. The old config template wrote `github.labels.*` explicitly in the legacy namespace, so such a project keeps reading and writing its configured legacy label until the rebrand changes both"
  - "Statuses are POSTed AOForge first, then legacy; a failure of either throws, and the error path posts `error` under both, so a legacy ruleset never waits on a context that never comes"
  - "Reconcile keeps one comment per PR: an existing reconcile comment (either namespace) is PATCHed under the AOForge marker with its earlier text kept and the new lines appended; an unreadable comment list falls back to a new comment"
  - "checks-pin keeps MANAGED_HEADER and WORKFLOW_PATH AOForge-only (gh setup's update-vs-conflict rule never adopts the legacy caller); the legacy caller is read with separate constants, flagged `legacy`, and compared like a new caller, with the pin roles named the same (`aoforge-ref`, `uses`)"

requirements-completed: [INST-03]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 2
  tdd_evidence: true
  test_pairing: true

duration: 37min
completed: 2026-10-09
tokens_input: 64278980
tokens_output: 177049
tokens_cache_read: 63834688
tokens_cache_write: 443880
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 11: GitHub markers, labels and check contexts written so far keep working Summary

**Every GitHub body reader now accepts the legacy `devflow` marker namespace while every writer emits `aoforge`. Lookups by a default label also list its legacy twin and merge by issue number. Each required status is posted under the AOForge context and then the legacy one. checks-pin reads the pre-rename caller workflow and flags it `legacy: true`.**

## Progress
- [x] Task 1: Fixture builder: legacy GitHub artefacts — 41c00fbb
- [x] Task 2: Body markers and label lookups read both namespaces — 19880e6c (RED), 98c4297a (GREEN)
- [x] Task 3: Check contexts, PR marker and caller pin — abe55c3c (RED), c9d5ad4f (GREEN), bcb26932 (e2e expectation fix)

## What was built

- **Fixtures** (`__fixtures__/legacy-gh-fixtures.cjs`). Typed-out builders copy each shape from the pre-rename writers (gh-body, gh-trd, gh-check-cli, gh-setup and `templates/github/devflow.yml` at `a15e2af5~1`) and change only the namespace:
  - Bodies: `legacyIssueBody`, `legacyPrBody`, `legacyTrdBody`, `legacyEntityBody`.
  - Comments: `legacyComment` (single or numbered parts), `legacyReconcileComment`.
  - Files: `legacyPrTemplate`, `legacyCaller`.
  - Labels: `labelPages`, which returns the label names, fake-ready issue seeds and the REST page per label.
- **gh-body.cjs**:
  - **Markers.** One `NS` alternation (non-capturing, built from `NAMES.markerNs`/`LEGACY.markerNs` with `escapeRegExp`) feeds `MARKER_SOURCE`, `PR_MARKER_SOURCE`, `PART_LINE_RE`, `SECTION_MARKER_RE` and `DIR_MARKER_RE`.
  - **Sections.** `findPair` looks for a well-formed pair in each namespace and takes the earliest. A pair never mixes the two namespaces.
  - **mergeManaged** handles a legacy pair three ways:
    - Changed content: replaced in place with `renderBlock` (AOForge).
    - Same content: kept, and re-spelled with `respellPair` only if the body changes anyway.
    - The malformed-section warning sees markers in either namespace.
  - **withCommentMarker** restamps a legacy first line for the same id.
  - **Label helpers:** `legacyLabel`, `labelForms` and `unionByNumber`.
- **gh-trd.cjs**: the TRD and entity id/file lines, scope, scope-confirm and part lines read both namespaces. The legacy TRD bodies, entity bodies and multi-part file comments therefore decode, and gh-cache materialises them.
- **Label union**, used wherever a default label is listed:
  - `gh-cache.listLabelled` covers all six roles.
  - `gh-issue.scanObjectiveIssues` keeps one scan per run, which is now one `issue list` per label form.
  - `gh-hierarchy.reportOrphans`.
  - `gh-outbox-flush.scanByLabel`, through the new `defaultLabelFor(role)`. A legacy-labelled TRD issue is adopted instead of created a second time.
  - `gh-check-cli.findObjectiveIssue` lists the AOForge label first and the legacy one only when the first did not find the objective.
- **In-progress label**: `planning-verbs.inProgressLabels` takes off the default and its legacy twin, or the configured label alone. `removeLabelOp` takes a list. `trd start` is unchanged and adds the AOForge form.
- **gh-setup**: a legacy `pr-template` block is replaced in place, so a second block is never appended.
- **gh-check-cli**:
  - `postStatus` loops over `CONTEXT_NAMESPACES = [NAMES.checkContextNs, LEGACY.checkContextNs]`.
  - Reconcile finds an existing reconcile comment of either namespace (`RECONCILE_LINE_RE`, first line only) and edits it in place (`writeReconcileComment`).
  - The header comment says why statuses are posted twice and what that costs.
- **checks-pin**:
  - New `LEGACY_WORKFLOW_PATH`, `LEGACY_MANAGED_HEADER`, `LEGACY_CHECKS_WORKFLOW` and `LEGACY_REF_LINE`.
  - `parseWorkflowPins` returns `legacy`. `pinStatus` compares the legacy `uses:` path too.
  - `readWorkflowPin` falls back to the legacy caller and returns `path`.
  - `collectPinFindings` returns `path` and `legacy`, and gives `FIX_LEGACY` for a legacy caller.
  - The module's require pin is widened to the two leaf modules `legacy-names.cjs` and `text-escape.cjs`. The test also checks that both stay leaves.

## Hand-off

- **72-16 (rebrand)**:
  - **Config labels.** A project created by the old plugin has `github.labels.{objective,in_progress,gaps,trd,decision}` written explicitly in the legacy namespace (the old `templates/config.json`). Lookups use a configured label as configured. The rebrand must rewrite those values together with the label rename, or the lookups keep querying the legacy label afterwards.
  - **Bases.** Rewriting a managed body or comment changes its hash. Refresh the outbox base (`body_hash`) for every rewritten issue and comment, or the next flush reads the change as a human edit and halts.
  - **Frozen TRDs (W060).** The same applies to frozen TRDs. `gh-health` W060 compares `contentHash(encodeTrdBody(...))`, which now has an AOForge header, with a base recorded from the legacy body. So a frozen TRD in a repository that has not been rebranded reports W060 until its base is refreshed. This is advisory only, and it is not fixed here.
  - **PR template.** Rewrite the managed block of `.github/pull_request_template.md` too. `gh setup` already replaces it in place.
  - **Shared helpers.** `gh-body.legacyLabel` / `labelForms` give the label pairs. `checks-pin.parseWorkflowPins(...).legacy` and `collectPinFindings(...).path` identify the caller to rewrite.
- **72-15 (doctor check 26)**: `collectPinFindings` now returns `legacy` and the real `path`, and its W062 `fix` for a legacy caller names `aof-tools gh rebrand`. However, `okFinding` and the `could not be read` text in `doctor-checks/26-checks-workflow-pin.cjs` still name `WORKFLOW_PATH`, and its `FIX_COMMAND` is still `gh setup --apply`.
- **Shim removal (the release after 3.0.0)**: remove these:
  - the `NS` alternations in gh-body, gh-trd and gh-cache, and `RECONCILE_LINE_RE` in gh-check-cli;
  - the legacy twin in `labelForms` and the `SECTION_FORMS` legacy entry;
  - `CONTEXT_NAMESPACES[1]`;
  - `LEGACY_PR_START/END` in gh-setup;
  - the `LEGACY_*` constants in checks-pin.
- **Deferred (not changed, untested)**: migration 0011's `recordObjectiveBases`, `readoptMapping` and `repairObjectiveBodies` still list only the configured or default AOForge labels. A backfill interrupted under the old plugin and resumed under 3.0.0 would not re-adopt legacy-labelled issues by marker; its ops block and the drain halts, with no duplicates. This needs the 51-08 resume harness. Resume with the old plugin, or rebrand first.
- `gh-pull.cjs` (in `files_modified`) has no label-scoped listing; it only tracks label sets as fields, so nothing changed there. `gh-outbox.cjs` (in `files_modified`) is also unchanged: its entity labels are writer defaults, and the lookups by them are unioned in gh-cache and gh-outbox-flush.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builder | TRD `node -e "...legacyIssueBody({id:'46'}).split('\n')[0]"` -> `<!-- devflow:id=46 -->`; plus the comment, PR, caller and labelPages shapes | 0 | PASS |
| 2: markers + labels | `node --test gh-markers.legacy.test.cjs` && `node --test gh-*.test.cjs planning-verbs*.test.cjs` (+ rename-guard) | 0 (2068/2068) | PASS |
| 3: contexts + pin | `node --test gh-checks.legacy.test.cjs gh-check.test.cjs gh-check-cli.test.cjs checks-pin.test.cjs rename-guard.repo.test.cjs` (158/158) and `scripts/workflow-permissions.test.cjs validate-checks-pin.test.cjs gh-setup.test.cjs` (112/112) | 0 | PASS |
| verification | `rg -n "markerNs" gh-body.cjs gh-cache.cjs`: NS built from markerNs feeds every marker source; `rg -n "checkContextNs" gh-check-cli.cjs`: CONTEXT_NAMESPACES posts both | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs` | 1 (22 tests: 18 fail; 4 pass = 6a writers, 7c configured label, 8b trd start, 8c configured in-progress, which are the controls) | FAIL (correct) |
| GREEN (Task 2) | same + every gh-* and planning-verbs* suite | 0 (2068 pass) | PASS (correct) |
| RED (7e, after code) | 7e with `gh-hierarchy.cjs` stashed to its pre-change form | 1 (unlinked `[]`, expected `[{7-09, #2}]`) | FAIL (correct) |
| RED (Task 3) | `node --test plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs` | 1 (8 tests: 7 fail; 10a passes, see Deviations) | FAIL (correct) |
| GREEN (Task 3) | the Task 3 verify suites | 0 (158 + 112 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (after Task 2) | `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'` (in the worktree) | 1: 11,727 tests, 11,664 pass, 51 skipped, 12 fail = 11 daemon tests (aoforge-watch, handoff-e2e: no node-pty in a worktree) + E2E1 (baseline) | PASS (baseline) |
| test (after Task 3) | same | 1: 11,735 tests, 15 fail = the 11 daemon tests + E2E1 + `gh-enforcement.e2e` 6a-6c (pinned one status; fixed in bcb26932, 12/12) | FIXED |
| test (final, after bcb26932) | same | 1: 11,735 tests, 11,673 pass, 51 skipped, 11 fail = 10 daemon tests (aoforge-watch 4, handoff-e2e 6: no node-pty) + E2E1 | PASS (baseline) |

`npm test` was not run, because it includes `micro.test.cjs`, which hangs on commit signing (as in 72-04 to 72-10).

## Discovered commands

None. The test command came from the stack profile and the TRD.

## Estimate

`estimate trd 72-11`: 10 min (P90 19 min), $3.72 (P90 $6.01), 3 tasks, confidence medium. `estimate start` was not re-run: the wave-7 run state was already recorded. Measured: 37 min. The overrun came from the scope beyond the TRD's file list (gh-trd, the flusher scan, gh-setup, gh-hierarchy, reconcile dedup) and from updating six existing suites that pinned one list, one status or one removed label.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] gh-trd.cjs readers**
- **Found during:** Task 2 (test list items 1c, 2b and 3)
- **Issue:** The TRD/entity body codec and the part, file, scope and scope-confirm lines have their own regexes in gh-trd.cjs, which was not in `files_modified`. Without them a legacy TRD issue is "not an aoforge TRD body", and a legacy SUMMARY comment has no file line.
- **Fix:** the same `NS` alternation there.
- **Commit:** 98c4297a

**2. [Rule 2 - Missing critical] The flusher's marker scan created a duplicate TRD issue**
- **Found during:** Task 2 (test 7d)
- **Issue:** With no mapping, `upsert-issue` lists the default role label, so a legacy-labelled TRD issue was not found and a second issue was created.
- **Fix:** `scanByLabel` unions the label forms.
- **Commit:** 98c4297a

**3. [Rule 2 - Missing critical] gh setup appended a second PR-template block**
- **Found during:** Task 2 (test 4f)
- **Fix:** the legacy block is replaced in place.
- **Commit:** 98c4297a

**4. [Rule 2] gh orphans missed legacy-labelled TRD issues**
- **Fix:** `reportOrphans` unions the label forms.
- **Note:** Test 7e was written after this code, in the GREEN pass. Its RED was shown by stashing the gh-hierarchy change; it failed with `unlinked: []`.
- **Commit:** 98c4297a

**5. [Rule 1 - Bug] Reconcile could post a second comment**
- **Found during:** Task 3 (test 11)
- **Issue:** The runner never looked for an existing reconcile comment. After the old runner's comment, a re-run that closes a straggler posted a second one, in either namespace.
- **Fix:** It now edits the existing one in place.
- **Commit:** c9d5ad4f

**6. [Rule 3 - Blocking] Existing suites pinned one list, one status or one removed label**
- **Found during:** the Task 2 and Task 3 verify runs
- **Fix:** Expectations were updated only where the default label or an AOForge context is in use:
  - `gh-commands.test.cjs` 1, 2 and 4: two `issue list` calls per run.
  - `gh-issue.test.cjs`: `SCAN_LISTS = 2`, and the second call is the legacy label.
  - `planning-verbs-pr.test.cjs` 1, 1b and 2: `IN_PROGRESS_FORMS`.
  - `gh-check-cli.test.cjs`: the AOForge statuses are judged through `own(sha)`, because the fake keeps statuses newest first.
  - `checks-pin.test.cjs`: the empty answer has `legacy: false`, and the require pin allows two leaf modules.
  - `gh-enforcement.e2e.test.cjs` 6a-6c, found by the Task 3 full-suite gate: two statuses on the head sha, the AOForge one judged; the script run makes two status POSTs to the same endpoint.
- **Commits:** 98c4297a, c9d5ad4f, bcb26932

### Choices the TRD left open, or where it was inexact

- **Test 10a** was green at RED. `gh-check.cjs` needs no code change, because its only PR-marker reader is gh-body's `extractPrMarker`, made dual-namespace in Task 2. Only a header note was added. Test 10b, the runner finding the objective under the legacy label, is the RED for item 10.
- **The TRD's "upsertSection"** is `mergeManaged`. The policy is to rewrite a legacy section only when the body changes, so idempotence holds. See key-decisions.
- **Label union is keyed on the label in use equalling the AOForge default.** Test 7 ("custom" is queried alone) and the legacy config-template case follow from that. See the 72-16 hand-off.
- **Pin roles for a legacy caller keep the names `aoforge-ref`/`uses`**, so `pinStatus` output is identical for the two callers (test 12b).

## Post-TRD Verification

- Auto-fix cycles used: 2 (the existing suites after each GREEN; the e2e suite after the Task 3 gate)
- Must-haves verified: 4/4
  - Parsers in both namespaces and writers in one (tests 1-6), with one marker set per section (4, 4b, 4c, 4e, 4f).
  - Label union with de-duplication (7a, 7b, 7d, 7e). A configured label is listed alone (7c). The in-progress label is removed in both forms and added in one (8a, 8b, 8c).
  - Both status contexts (9a, 9b). A legacy PR marker is an objective PR (10a, 10b).
  - The legacy caller is parsed, flagged `legacy: true` and compared like a new one (12a, 12b, 12c).
- Gate failures: none beyond the baseline (E2E1, and the daemon tests that need node-pty, which is not installed in a worktree)

## Self-Check: PASSED

- Files: `__fixtures__/legacy-gh-fixtures.cjs`, `gh-markers.legacy.test.cjs` and `gh-checks.legacy.test.cjs` exist in the worktree.
- Commits: 41c00fbb, 19880e6c, 98c4297a, abe55c3c, c9d5ad4f and bcb26932 are all on `df/exec-72-11-gh-markers-labels-and-checks` (`git log 412dcca3..HEAD`). The tree was clean before this post.
- Tests: the two legacy suites pass (23 and 8). The final full-suite gate fails only the baseline: E2E1 and the node-pty daemon tests.
- No real GitHub call was made. Every test runs on the fake through the gh-client seam or the PATH shim.
