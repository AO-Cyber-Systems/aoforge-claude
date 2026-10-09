---
objective: 46-github-sync-foundations
trd: "03"
subsystem: github-sync
tags: [github, markers, managed-sections, idempotency, pure-module]

requires:
  - objective: none
    provides: wave 1, no dependencies
provides:
  - "lib/gh-body.cjs: stable devflow:id issue/comment markers"
  - "mergeManaged: writes only inside devflow:begin/end sections, human text byte-identical, idempotent"
  - "indexByMarker / parseTitleNumber: marker and title lookup primitives for find-or-create"
  - "buildStateComment / isStateComment: sticky comment under the new marker, legacy df:state still recognised"
affects: [46-05-gh-issue-resolution, 46-07-sync-core-rewire, 46-08-command-surface]

tech-stack:
  added: []
  patterns:
    - "indexOf-based section splicing (never a global regex) so only the first well-formed pair per name changes"
    - "dangling begin markers are skipped, so a malformed section cannot widen into a pair that eats human text"
    - "pure module with a purity test: no fs, no child_process, no gh-mapping import"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-body.cjs
    - plugins/devflow/devflow/bin/lib/gh-body.test.cjs
  modified: []

key-decisions:
  - "Marker ids are written canonically (046 -> 46, 02.1 -> 2.1, 46-02 kept); an id extractMarker could not read back makes markerLine/commentMarker throw and mergeManaged return ok:false"
  - "mergeManaged folds CRLF to LF to merge and compare, and writes a changed result back as CRLF when the caller's body used CRLF, so human CRLF bytes survive"
  - "Fresh body puts the marker directly above the first section (the TRD's target layout), not separated by a blank line"
  - "indexByMarker maps id to the issue NUMBER (test 17), and leaves duplicated ids out of byId"

patterns-established:
  - "Managed-section merge: replace inner text of the first well-formed pair, append missing sections, warn on malformed, never delete"

requirements-completed: [GSF-02, GSF-06]
# GSF-02 is the marker half only; lookup by marker (find-or-create) is 46-05.

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 15min
completed: 2026-09-30
tokens_input: 5189694
tokens_output: 74844
tokens_cache_read: 5054856
tokens_cache_write: 134746
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 46 TRD 03: Markers and managed body sections Summary

**`lib/gh-body.cjs`: a stable `devflow:id` marker plus marker-delimited managed sections, so a sync rewrites only DevFlow's own text and leaves every human-written byte of an issue body alone.**

## Performance

- **Duration:** about 15 min (claim 17:55Z, finished 18:10Z)
- **Tasks:** 2 of 2
- **Files:** 2 created (`gh-body.cjs`, `gh-body.test.cjs`), 0 modified
- **Tests:** 57 in `gh-body.test.cjs`, all passing (TRD list 1-18 plus extras)

## Accomplishments

- Marker helpers: `markerLine`, `commentMarker`, `extractMarker`, `withCommentMarker`. They accept `2.1`, `0`, `46` and the reserved TRD form `46-02`.
- `buildObjectiveSections(state)` returns `{summary, criteria, trds, footer}` in `SECTION_ORDER`, carrying today's gen-2 body content. Empty lists render `_None yet._`.
- `mergeManaged(existing, sections, id)` returns `{ok, body, changed, warnings}`. Success criterion 3 is demonstrated at unit level in test 7: human text above, between and below the sections survives two consecutive merges byte for byte, including trailing spaces, a tab and a missing final newline.
- Re-merging identical sections gives `changed:false` (the caller skips `issue edit`). A body marked for another id is refused. A legacy body with no markers is kept whole and the sections are appended below it.
- `buildStateComment` / `isStateComment`: sticky comment under `<!-- devflow:id=N kind=state -->`; the legacy `<!-- df:state -->` is still recognised, so existing comments can be edited in place and rewritten with the new marker.
- `indexByMarker` reports duplicate ids instead of picking one; `parseTitleNumber` is the pre-marker fallback.

## Task Commits

| Task | Commit | Type | What |
|---|---|---|---|
| 1 RED | `e5fd079` | test | failing tests for markers, section builder, comment helpers, lookup |
| 1 GREEN | `4b266ff` | feat | markers, `buildObjectiveSections`, state comment, `indexByMarker`, `parseTitleNumber` |
| 2 RED | `d72dcb5` | test | failing tests for `mergeManaged` |
| 2 GREEN | `629c847` | feat | `mergeManaged`, `MAX_BODY_CHARS` |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Markers, section builder, comment helpers | `node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs` | 0 (33/33) | PASS |
| 2: mergeManaged | `node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs` | 0 (57/57) | PASS |
| Purity | `rg -n "require\('(fs\|child_process)'\)" plugins/devflow/devflow/bin/lib/gh-body.cjs` | 1 (no matches) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED | `node --test .../gh-body.test.cjs` | 1 (`Cannot find module './gh-body.cjs'`) | FAIL (correct) |
| Task 1 GREEN | `node --test .../gh-body.test.cjs` | 0 (33 pass) | PASS (correct) |
| Task 2 RED | `node --test .../gh-body.test.cjs` | 1 (24 `mergeManaged` tests fail, 33 still pass) | FAIL (correct) |
| Task 2 GREEN | `node --test .../gh-body.test.cjs` | 0 (57 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs` | 0 | PASS |
| full suite | `node --test` over the `npm test` globs, `NODE_PATH` set (see Issues) | 1 | 5832 pass, 1 fail = MA-7 only |

## Deviations from Plan

### Auto-fixed / auto-added (Rules 1-3)

**1. [Rule 1 - Bug] Dangling `begin` marker could swallow human text on the second merge**
- **Found during:** Task 2 design, before writing GREEN.
- **Issue:** The TRD's "find the first `begin`, then the first `end` after it" is unsafe after a malformed merge. The stray `begin` is left in place (text is never deleted) and a fresh pair is appended after it. On the next merge the stray `begin` pairs with the fresh pair's `end`, and everything between is replaced.
- **Fix:** `findPair` skips a `begin` when another `begin` of the same name comes before the next `end`. Tests 10b and 10c pin it.
- **Files:** `gh-body.cjs`, `gh-body.test.cjs`. **Commit:** `629c847` (tests in `d72dcb5`).

**2. [Rule 2 - Missing critical functionality] CRLF bodies lost their `\r` bytes**
- **Issue:** The TRD folds CRLF to LF and builds the result from the folded text, so a changing merge on a body GitHub stored as CRLF would rewrite every human line ending, contradicting "human text byte-identical".
- **Fix:** a changed result is written back as CRLF when the caller's body used CRLF; an unchanged result returns the caller's body exactly as passed. Tests 13 and 13b.
- **Commit:** `629c847`.

**3. [Rule 2 - Missing critical functionality] Marker ids and section content were not validated**
- **Issue:** A marker id `extractMarker` cannot read back would create an issue that find-or-create can never locate; section text containing a `devflow:begin/end` marker could forge a section boundary.
- **Fix:** ids are canonicalised (leading zeros dropped) and invalid ids throw from `markerLine`/`commentMarker` and return `ok:false` from `mergeManaged`; section content with a marker, or a non-string, returns `ok:false`. Tests 1c, 1d, 11b, 15d, 15e.
- **Commit:** `4b266ff`, `629c847`.

### Minor interpretation (not a rule deviation)

- **Fresh-body layout.** The TRD's algorithm says `join('\n\n')` (blank line after the marker); its "Target layout" and the research both show the marker directly above the first `begin`. I followed the layout. The spec tests (5-14) pass either way.
- **Test count.** The TRD lists 18 tests; the file has 57 because each numbered case is split into its sub-cases and the extras above are covered.

## Issues Encountered

**1. Preflight fired `SHARED INDEX` on the first attempt (my error, not a dispatch defect).**
My shell's cwd was the main checkout, not the worktree, so `exec-context check` inspected `/Users/justin/dev/devflow-claude` and found the sibling 46-01 executor's claim. I confirmed the worktree exists and is its own toplevel, then reran the same command with `df-tools --cwd <worktree>`. It passed: `checkout` is the worktree, `head_sha` equals `WAVE_BASE`, `base_visible:true`, my claim registered under `46-03-gh-body-markers`. I did not run `exec-context release` and did not touch the 46-01 claim. All later commands used absolute worktree paths, `git -C`, or `--cwd`.

**2. Ten test failures in the full suite were a worktree environment artifact, not this change.**
`npm test` in the worktree gave 5805 pass / 10 fail: the `devflow-watch` start tests and the `handoff pipeline` end-to-end tests. The daemon logs `failed to spawn shell` and exits 3, because `ShellSession` calls `require('node-pty')` and a fresh worktree has no `node_modules` (the main checkout has `node-pty`). Rerunning the same suite with `NODE_PATH=/Users/justin/dev/devflow-claude/node_modules` (env var only, nothing written to either tree) gave 5832 pass / 1 fail, and that one is MA-7 (`doctl auth init`), the accepted pre-existing failure. Sibling worktrees will hit the same 10 unless they do the same.

## For downstream TRDs

- **46-05:** `indexByMarker(issues).byId` maps canonical id to the issue **number**, not the issue object. `duplicates` ids are absent from `byId` and the caller must stop and report. `extractMarker` returns canonical ids (`046` comes back as `46`).
- **46-07:** `mergeManaged` returns `{ok:false, error}` with no `body` on refusal (id mismatch, invalid id, size, bad section). On `changed:false` the `body` is the caller's input unchanged; skip `issue edit`. Check `warnings` (`malformed section NAME`) and surface them.
- **46-08:** `withCommentMarker(id, kind, text)` throws on an invalid id or kind, and leaves a body that already opens with a marker for the same id untouched (whatever its kind).
- `isStateComment` matches the legacy `<!-- df:state -->` for **any** id, since the legacy marker carries none; the caller already knows which issue it is reading.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 8/8 (marker on body line 1 and comment line 1; inner-text-only replacement with human text byte-identical across two merges; `changed:false` on identical content; id-mismatch refused; legacy body preserved whole; sticky finder accepts both markers; `indexByMarker` reports duplicates; 60,000-character guard exact at the boundary)
- Gate failures: None for this TRD. Full suite: only MA-7 (accepted).

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/gh-body.cjs`
- FOUND: `plugins/devflow/devflow/bin/lib/gh-body.test.cjs`
- FOUND commits: `e5fd079`, `4b266ff`, `d72dcb5`, `629c847`
- `git diff --stat cb51578 HEAD` showed only those two files before this SUMMARY; `.planning/STATE.md` and `.planning/ROADMAP.md` untouched, per the worktree protocol.
