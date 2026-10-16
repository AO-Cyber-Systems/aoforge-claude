---
objective: 47-github-authoritative-store
trd: "05"
subsystem: github-sync
tags: [gh-body, gh-mapping, managed-sections, markers, mapping-v3, tdd]

requires:
  - objective: 46-github-sync-foundations
    provides: gh-body managed sections and markers (46-03), mapping v3 with the reserved `trds` map (46-02)
provides:
  - "gh-body: OPTIONAL_SECTIONS ['wiki','meta'], extractSection, buildWikiSection, parseDirMarker, buildMetaSection, parseMeta, buildTrdsSection, findCommentsByMarker, mergeManaged(..., {preserveTicks})"
  - "gh-body: Decision-form marker ids (47-01-d1) alongside 47, 2.1 and 47-01"
  - "gh-mapping: toTrdId, getTrd, setTrd, listTrds for the v3 `trds` map"
affects: [47-07, 47-08, 47-09, 47-10]

tech-stack:
  added: []
  patterns:
    - "Optional managed sections kept out of SECTION_ORDER so 46 bodies on GitHub are untouched"
    - "Values read back off GitHub that become paths (devflow:dir) are validated to one safe segment on both build and parse"
    - "Opt-in merge behaviour via an options argument (preserveTicks default false)"

key-files:
  created:
    - .planning/objectives/47-github-authoritative-store/47-05-SUMMARY.md
  modified:
    - plugins/devflow/devflow/bin/lib/gh-body.cjs
    - plugins/devflow/devflow/bin/lib/gh-body.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-mapping.cjs
    - plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs

key-decisions:
  - "buildWikiSection takes `url` as the full page-at-revision URL (gh-wiki's pageRevisionUrl output), used as given; the TRD's example shows the sha already in the URL"
  - "buildTrdsSection items are `{ id, number, title?, done? }` (issue_number and closed accepted as spellings); tasklist mode throws TypeError for an item without an id or positive issue number rather than rendering an unlinked line"
  - "setTrd rejects a role that disagrees with the id form (`-d<k>` must be decision, otherwise trd); role defaults from the id"
  - "toTrdId is strict (`<obj>-<NN>[-d<k>]`); a trailing slug is not a TRD id"
  - "parseDirMarker only honours a marker inside the wiki section and only a single safe path segment (no `/`, `..`, leading dot)"
  - "findCommentsByMarker with no kind matches any comment-kind marker for the id; an impossible part (0/2, 3/2) is treated as part 1 of 1"

patterns-established:
  - "extractSection(body, name) is the one reader for managed section inner text (CRLF-safe, reuses findPair)"

requirements-completed: [GST-02, GST-04, GST-01, GST-08]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 25min
completed: 2026-09-30
tokens_input: 5243067
tokens_output: 59018
tokens_cache_read: 5117814
tokens_cache_write: 125161
token_model: "claude-sonnet-5-5"
tokens_source: "backfill"
---

# Objective 47 TRD 05: Body and mapping extensions Summary

**gh-body gains wiki/meta managed sections with a safe devflow:dir marker, tick-preserving criteria merge, native/task-list TRD sections, Decision-form marker ids and a part-ordered comment finder; gh-mapping gains getTrd/setTrd/listTrds for the v3 trds map that never confuses an issue number with a REST id.**

## Performance

- Duration: about 25 minutes
- Tasks: 3 of 3 (each RED then GREEN)
- Files: 4 modified, 0 new source files

## Accomplishments

- `mergeManaged(existing, sections, id, opts)` now covers `[...SECTION_ORDER, ...OPTIONAL_SECTIONS]`. `SECTION_ORDER` is unchanged, a missing `wiki`/`meta` pair is appended at the end, and bodies built by 46 are byte-identical until a caller provides the new sections.
- `preserveTicks:true` rewrites `- [ ] X` to `- [x] X` in the new criteria content when `X` (whitespace collapsed, case-insensitive `[X]`) is ticked in the existing section. It never removes a tick, never touches other sections, and a repeat push is `changed:false`. Default is off so 46's sync is unchanged.
- `buildWikiSection` / `parseDirMarker` carry the cache dir (`<!-- devflow:dir=07-store-demo -->`) plus a pinned-revision link. Build and parse both enforce one safe path segment, because `pull --all` turns the value into a path.
- `buildMetaSection` / `parseMeta` round-trip `type:`, `work:`, `kind:` and omit missing keys.
- `buildTrdsSection` renders `3 TRDs, tracked as sub-issues.` (native) or a `- [ ] #12 07-01 alpha` task list sorted by TRD id (tasklist), `_None yet._` when empty.
- Marker ids accept `47-01-d1` (MARKER_SOURCE and ID_RE widened); `47-d1`, `47-01-d`, `47-01-d1-2`, `47-01-D1` stay invalid. `<!-- devflow:dir= -->` and `<!-- devflow:file= -->` are never read as id markers.
- `findCommentsByMarker(comments, id, kind)` returns `[{comment, part, of}]` ordered by numeric part then comment id, reading `<!-- devflow:part=i/n -->` from the line after the marker (CRLF-safe).
- `toTrdId`, `getTrd`, `setTrd`, `listTrds` manage the reserved `trds` map. Entries are always `{issue_number, rest_id, role, comment_ids}` in that order; `comment_ids` merges per kind (`null` removes a kind); `setTrd` throws TypeError and leaves the map untouched on any invalid input; `rest_id === issue_number` is allowed. The header comment no longer calls `trds` reserved.

## Task Commits

| Task | Phase | Commit | Subject |
|---|---|---|---|
| 1 | RED | 5ba8159 | test(47-05): add failing tests for wiki/meta sections, preserveTicks and trds section |
| 1 | GREEN | 5ea2067 | feat(47-05): add wiki/meta sections, dir marker, preserveTicks and trds section to gh-body |
| 2 | RED | 97dbc7e | test(47-05): add failing tests for Decision-form marker ids and findCommentsByMarker |
| 2 | GREEN | ea1b40a | feat(47-05): accept Decision-form marker ids and add findCommentsByMarker to gh-body |
| 3 | RED | 2d23d19 | test(47-05): add failing tests for trds map accessors in gh-mapping |
| 3 | GREEN | 436c9b4 | feat(47-05): add toTrdId, getTrd, setTrd and listTrds for the v3 trds map |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test sha collided with the fixture's last-commit sha**
- **Found during:** Task 1 GREEN
- **Issue:** Test 3 replaced `abc1234` across the whole body, but `makeState()`'s `last_commit.sha` is also `abc1234`, so the replace rewrote the summary section and the assertion failed. The implementation was correct; the test data was ambiguous.
- **Fix:** The new `47 store sections` tests use `1a2b3c4` as the wiki sha. The 46 tests are untouched.
- **Files modified:** plugins/devflow/devflow/bin/lib/gh-body.test.cjs
- **Commit:** 5ea2067 (test file edit rides with the GREEN commit)

### Other notes

- **SUMMARY path:** the dispatch specified `47-05-SUMMARY.md`; the TRD's `<output>` named `47-05-body-mapping-extensions-SUMMARY.md`. The dispatch path was used.
- Test counts exceed the TRD's numbered list (58 new tests (27 + 14 + 17) vs 19 numbered cases) because each numbered case has edge-case siblings (CRLF, canonical ids, path-safety, validation errors). All TRD tests 1-19 are present.

## Issues Encountered

None beyond the test-data collision above. The full suite has the one known pre-existing failure (MA-7).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: wiki/meta, dir marker, preserveTicks, trds section | `node --test plugins/devflow/devflow/bin/lib/gh-body.test.cjs` | 0 (84/84) | PASS |
| 2: Decision ids, findCommentsByMarker | `node --test gh-body.test.cjs gh-issue.test.cjs gh-sync.test.cjs` | 0 (172/172) | PASS |
| 3: trds accessors | `node --test gh-mapping.test.cjs gh-e2e.test.cjs` | 0 (82/82) | PASS |

## TDD Evidence

| Phase | Command | Result | Expected |
|---|---|---|---|
| RED (task 1) | `node --test gh-body.test.cjs` | 23 failing of 84 (functions missing) | FAIL (correct) |
| GREEN (task 1) | `node --test gh-body.test.cjs` | 84 pass, 0 fail | PASS (correct) |
| RED (task 2) | `node --test gh-body.test.cjs` | 11 failing of 98 | FAIL (correct) |
| GREEN (task 2) | `node --test gh-body.test.cjs gh-issue.test.cjs gh-sync.test.cjs` | 172 pass, 0 fail | PASS (correct) |
| RED (task 3) | `node --test gh-mapping.test.cjs` | 15 failing of 58 | FAIL (correct) |
| GREEN (task 3) | `node --test gh-mapping.test.cjs gh-e2e.test.cjs` | 82 pass, 0 fail | PASS (correct) |

## Validation Gate Results

| Gate | Command | Result | Status |
|---|---|---|---|
| test | `node --test gh-body.test.cjs gh-mapping.test.cjs` | 156 pass, 0 fail | PASS |
| regression | `node --test gh-sync gh-e2e gh-issue gh-commands tests` | 114 pass, 0 fail | PASS |
| SECTION_ORDER | `rg -n "SECTION_ORDER = " gh-body.cjs` | `['summary', 'criteria', 'trds', 'footer']` | PASS |
| full suite | `npm test` | 6245 tests, 6212 pass, 1 fail, 32 skipped | PASS (only the known pre-existing MA-7 doctl-auth failure) |

## Post-TRD Verification

- Auto-fix cycles used: 0 (one test-data correction, see Deviations)
- Must-haves verified: 8/8
- Gate failures: None (MA-7 in handoff-e2e.test.cjs is pre-existing on the base and was not touched)

## Next Phase Readiness

47-07 / 47-09 can build the `wiki`, `meta`, `trds` and `criteria` sections and call `mergeManaged(..., {preserveTicks:true})`; 47-07 / 47-09 store TRD numbers and REST ids with `setTrd`; 47-08 / 47-10 read multi-part comments with `findCommentsByMarker` and the cache dir with `parseDirMarker`.

## Self-Check: PASSED

- Files exist: gh-body.cjs, gh-body.test.cjs, gh-mapping.cjs, gh-mapping.test.cjs, this SUMMARY.
- Commits 5ba8159, 5ea2067, 97dbc7e, ea1b40a, 2d23d19, 436c9b4 are on `df/exec-47-05`.
- gh-body.cjs still has no fs / child_process / gh-mapping require (module purity test passes).
