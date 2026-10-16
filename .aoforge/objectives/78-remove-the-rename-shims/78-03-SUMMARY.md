---
objective: 78-remove-the-rename-shims
trd: "03"
subsystem: github-integration
tags: [rename-shims, gh-body, gh-trd, gh-cache, gh-check, gh-setup, gh-rebrand]
requires: []
provides:
  - single-namespace GitHub marker readers (gh-body, gh-trd, gh-cache)
  - one commit status per check (aoforge/<check>)
  - AOForge-only reconcile comment recognition
  - gh setup refusal of a pre-rename PR-template block (reason legacy-pr-template)
  - gh-rebrand independent of the shared readers
affects: [78-09, 78-12]
tech-stack:
  added: []
  patterns: ["one reader namespace; the converter (gh rebrand) owns its legacy patterns"]
key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/gh-body.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-trd.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-cache.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-check-cli.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-setup.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-rebrand.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-checks.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-rebrand.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-gh-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/gh-enforcement.e2e.test.cjs
key-decisions:
  - "gh rebrand (TRD 72-16) is KEPT in 3.1.0: an explicit converter that reads old names only to rewrite them; it now owns every legacy pattern it needs"
  - "checks-pin's pre-rename caller detection (W062 legacy: true, fix gh rebrand) is KEPT as a detector"
  - "gh setup refuses the PR-template step (status conflict, reason legacy-pr-template) when the file holds the pre-rename block opener; it never appends a second block"
duration: 21min
completed: 2026-10-16
status: complete
requirements-completed: []
tokens_input: 21465526
tokens_output: 92323
tokens_cache_read: 21208100
tokens_cache_write: 257208
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 78 TRD 03: GitHub markers and status contexts Summary

**The shared GitHub codecs (gh-body, gh-trd, gh-cache) read the `aoforge` marker namespace only, the checks post one `aoforge/<check>` status, the reconcile comment is found by its AOForge marker only, gh setup refuses (never duplicates) a pre-rename PR-template block, and `gh rebrand` keeps converting on its own patterns.**

## Progress
- [x] Task 1: Fixtures and RED tests for single-namespace readers — 3e558748
- [x] Task 2: GREEN — gh-body, gh-trd, gh-cache read one namespace; gh-rebrand self-contained — 13c03aae
- [x] Task 3: GREEN — one status context, AOForge reconcile line, PR-template refusal — fca8ea7e

## What changed

- **gh-body.cjs**: `NS` is the AOForge namespace only. Removed `LEGACY_LINE_RE`, the legacy begin/end markers,
  `SECTION_FORMS`, `findPairOf` (folded into `findPair`), `respellPair`, the `legacy` flag of `firstLineMarker`,
  the restamp branch of `withCommentMarker` and the legacy branches of `mergeManaged` (the plain AOForge path is the
  pre-72-11 code, so `managedHash` of AOForge bodies is unchanged; the gh-outbox suites pass). A pre-rename id line,
  comment marker, part line, dir marker or begin/end pair is plain text: `extractMarker` -> null, `mergeManaged`
  stamps the AOForge id line above the old text and appends the AOForge section, a legacy-looking marker inside
  section content is ordinary content (`SECTION_MARKER_RE` still refuses an AOForge one). `LEGACY` stays imported only
  for `legacyLabel` / `labelForms` / `unionByNumber` (78-09 removes them).
- **gh-trd.cjs, gh-cache.cjs**: `NS` AOForge-only; no `LEGACY` import left (`rg LEGACY` finds nothing in either).
- **gh-check-cli.cjs**: `statusContexts(context)` returns `[context]`; `CONTEXT_NAMESPACES` and the `LEGACY` import are
  gone; `RECONCILE_LINE_RE` matches `<!-- aoforge:reconcile -->` only. The `labelForms` loop in `findObjectiveIssue`
  and the `PLANNING_DIR_NAMES` config fallback are left for 78-09 / 78-11.
- **gh-setup.cjs**: `LEGACY_PR_START` kept as a detector ("reported, never edited; gh rebrand re-marks it");
  `LEGACY_PR_END` deleted. A template holding the pre-rename block gets
  `action('pr-template', path, 'conflict', '<path> holds the pre-rename PR-template block; run `aof-tools gh rebrand --apply` from a checkout of this repository first', { reason: 'legacy-pr-template' })`:
  no file is planned, `applySetup` reports `conflict` (`ok: false`) and the file stays byte-identical. An AOForge block
  is still refreshed in place and a file with no block still gets one appended.
- **gh-rebrand.cjs**: one helper moved in. `baseRefresher.afterComment` joined a multi-part comment through
  `bodyLib.findCommentsByMarker`, which used to read the parts not yet rewritten in the old namespace. It now reads a
  view of the comment list with every marker re-spelled by its own `respellMarkers` (built from its `LEGACY_MARKER_RE`),
  so plans, writes and refreshed bases are as before.

## Decisions Made

| Decision | Reason |
|---|---|
| **`gh rebrand` (TRD 72-16): KEEP in 3.1.0.** | A repository's labels, hidden markers, wiki pages, ruleset contexts and checks caller cannot be fixed by a local `git mv`; the manual equivalent is dozens of API calls. It is an explicit, user-invoked converter that reads old names only to rewrite them, never to operate under them, and it is the fix the 3.1 messages name (78-09's un-rebranded-repository refusal, W062 for a pre-rename caller, this TRD's PR-template refusal). It goes in a later release once no repository needs it. To survive the shared readers' removal it owns its legacy patterns (`LEGACY_MARKER_RE`, `NS_ALT`, `MARKER_LINE_RE`, `SECTION_OPEN_RE`, and now the re-spelled view in `afterComment`). |
| **checks-pin's pre-rename caller detection (W062 `legacy: true`, fix `gh rebrand`): KEEP** as a detector. | It reports, never operates under the old name, and its fix is the kept converter (gh-checks.legacy.test.cjs case 12, unchanged). |
| The PR-template refusal fires on the pre-rename start marker alone. | Any pre-rename block, well-formed or not, would end up beside a second AOForge block if appended; gh rebrand re-marks it. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] gh rebrand warned "incomplete" while rewriting a multi-part comment**
- **Found during:** Task 2 (the TRD's anticipated case: gh-rebrand still depended on a shared legacy reader)
- **Issue:** with gh-body single-namespace, `afterComment` found only the parts already rewritten, so rebranding a
  two-part summary emitted `the summary comments on #2 are incomplete (missing part 2 of 2)` for the first part (the
  last part's refresh still wrote the right base). 3.0 gave no warning.
- **Fix:** read the comment list through gh-rebrand's own `respellMarkers` before `findCommentsByMarker`. Test 12 now
  also asserts `res.payload.warnings` is empty (it failed before the fix, passes after).
- **Files modified:** gh-rebrand.cjs, gh-rebrand.legacy.test.cjs
- **Commit:** 13c03aae

**2. [Rule 3 - Blocking] gh-rebrand.legacy.test.cjs test 12 seeded its "before" base through the shared reader**
- **Issue:** the seed for `46-01#summary` was `trd.joinParts(<legacy parts>)`, which now returns `text: null`.
- **Fix:** the pre-rebrand text is joined by hand (marker and part line off, part order kept). Only the seed changed;
  every assertion is kept (and one added, above).
- **Commit:** 13c03aae

**3. [Rule 3 - Blocking] gh-markers.legacy.test.cjs section 7 (label union, owned by 78-09) seeded legacy bodies**
- **Issue:** 7a-7e list issues under the legacy label whose bodies were legacy-marked; after 78-03 those bodies are
  unmarked, so the label-union cases would have tested the marker change instead of the union.
- **Fix:** `labelPages` gained `bodies: 'aoforge'` (default output unchanged) and 7d/7e seed `encodeTrdBody` bodies:
  an old issue whose body 3.0 rewrote while its label stayed old. The label behaviour asserted is unchanged; 78-09
  rewrites section 7 to its refusal. Section 8 (in-progress label) is untouched.
- **Commit:** 3e558748

**4. [Rule 3 - Blocking] gh-checks.legacy.test.cjs 10b depended on the legacy planning-directory fallback**
- **Fix:** the rewritten 10b puts `config.json` under `NAMES.planningDir`, so it tests the PR marker only (the
  `PLANNING_DIR_NAMES` fallback belongs to another 78 TRD).
- **Commit:** 3e558748

**5. [Rule 3 - Blocking] gh-enforcement.e2e.test.cjs pinned the second status context (file outside files_modified)**
- **Found during:** the full-suite gate after Task 3
- **Issue:** 6a asserted two statuses on the head sha ("the AOForge context and its legacy twin") and 6c two status
  POSTs ("AOForge then legacy (TRD 72-11)").
- **Fix:** both now expect one status under `aoforge/`; the comment on its `own()` helper updated. No legacy name is
  spelled in the file.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/gh-enforcement.e2e.test.cjs
- **Commit:** f5007c93

gh-body.test.cjs (in files_modified) had no 72-11 legacy-namespace cases, so it is unchanged; every legacy-spelled case
lives in the `*.legacy.test.cjs` files.

## Notes for later TRDs

- **78-09:** until its guard lands, an issue that carries only the pre-rename label **and** a pre-rename body is listed
  by the label union but is unmarked, so the outbox's adopt-by-label scan would not adopt it (the duplicate-issue hazard
  78-09's `checkRebranded` refusal closes). Ship 78-03 and 78-09 together.
- **78-12:** a ruleset that still requires `devflow/<check>` contexts now blocks PRs until `aof-tools gh rebrand
  --apply` rewrites it; `gh setup` refuses the PR-template step on a pre-rename block with the same fix.
- `isStateComment` still accepts the pre-`aoforge:id` sticky marker `<!-- df:state -->` (objective 46-era, not a 72-11
  shim). Left as is; 78-12 may decide whether it goes too.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED tests | `node --test gh-markers.legacy.test.cjs gh-checks.legacy.test.cjs` | 1 (20 of 34 failing: legacy still read/posted; 6a, 7, 8, 11b, 12 green by design) | PASS (RED) |
| 2: single-namespace readers | `node --test gh-markers.legacy gh-body gh-trd gh-cache gh-rebrand.legacy gh-outbox gh-e2e` | 1 (only the two Task 3 cases 4f) | PASS (cases 4-7 green) |
| 2: wider gh sweep | `node --test gh*.test.cjs planning-verbs*.test.cjs checks-pin.test.cjs` | 1 (only the Task 3 cases 9a, 9b, 10b, 11a, 4f x2) | PASS |
| 3: contexts, reconcile, PR template | `node --test gh-checks.legacy gh-markers.legacy gh-check-cli gh-check gh-setup gh-setup-cli gh-setup-apply gh-rebrand.legacy` | 0 | PASS |
| verification | `node --test rename-guard.repo.test.cjs` | 0 | PASS |

`gh-rebrand.test.cjs` does not exist (skipped as the TRD allows).

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test gh-markers.legacy.test.cjs gh-checks.legacy.test.cjs` | 1 | FAIL (correct) |
| GREEN (Task 2) | `node --test gh-markers.legacy ... gh-rebrand.legacy gh-outbox gh-e2e` | 1 -> cases 4-7 pass, 4f left for Task 3 | partial (correct) |
| GREEN (Task 3) | `node --test gh-checks.legacy gh-markers.legacy gh-check* gh-setup* gh-rebrand.legacy` | 0 | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | full `npm test` file set (393 files) minus `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs` | 1 | PASS for this TRD (see below) |

watcher-shell.test.cjs was excluded on instruction: its W-3 fish-shell test hangs to timeout on this machine.

Full run (after the three task commits): 12,503 tests, 12,448 pass, 15 fail, 40 skipped. Two failures were this
TRD's: `gh-enforcement.e2e.test.cjs` 6a and 6c still expected the 72-11 second context; fixed in f5007c93, the file
then passes 17/17. The other 13 are not caused by this TRD:
- 11 in `aoforge-watch.test.cjs` (6) and `handoff-e2e.test.cjs` (5): the daemon cannot start because this worktree has
  no `node_modules` (`Cannot find module 'node-pty'`); the main checkout has it. They fail the same way run alone.
- 2 in `requirements-agreement.repo.test.cjs` / `validate-requirements.test.cjs`: objective 75's VERIFICATION marks
  EST-11 satisfied while no 75 SUMMARY lists it. Both fail identically in the main checkout at the wave base 268a7a47.

## Post-TRD Verification

- Auto-fix cycles used: 1 (gh-enforcement.e2e after the full-suite gate; the gh-rebrand view was part of Task 2)
- Must-haves verified: 6/6 (single-namespace readers; no `legacy` flag / restamp / legacy section form; one status
  context and AOForge-only reconcile line; PR-template refusal naming `aof-tools gh rebrand --apply`; gh-rebrand
  legacy suite green with one assertion added; label helpers untouched)
- `rg -n "LEGACY\." gh-body.cjs` -> only `LEGACY_LABEL_PREFIX` (label helpers); gh-check-cli -> only the `labelForms`
  call 78-09 removes; gh-setup -> only the `LEGACY_PR_START` detector
- Gate failures: None caused by this TRD (13 unrelated failures listed under Validation Gate Results)
- Requirements: SC-2 is an objective success criterion, not a REQUIREMENTS.md entry; this TRD completes its marker,
  context and PR-template half, and 78-09 the label half, so `requirements-completed` stays empty here.

## Self-Check: PASSED

- FOUND: plugins/aoforge/aoforge/bin/lib/gh-markers.legacy.test.cjs, gh-checks.legacy.test.cjs,
  __fixtures__/legacy-gh-fixtures.cjs, .aoforge/objectives/78-remove-the-rename-shims/78-03-SUMMARY.md
- FOUND commits: 3e558748, 13c03aae, fca8ea7e, f5007c93 (`git log 268a7a47..HEAD`)
- RED (3e558748) precedes GREEN (13c03aae, fca8ea7e)
