---
objective: 78-remove-the-rename-shims
trd: "04"
subsystem: rename-shims
tags: [rename, shims, stack-mcp, mcp-json, todo-sync, adopt, migration-0010]

requires:
  - objective: 72-rename-to-aoforge
    provides: the 72-12 read-side shims (.mcp.json owner key, todo metadata key, adopt branch/marker) and the 72-08 dual-slug 0010 block reader removed here
provides:
  - "stack-mcp owns a .mcp.json entry only through AOFORGE_MANAGED === 'stack'; legacyOwnedEntries(doc) finds entries owned through the pre-rename key and every stackMcp result carries `warnings: []` with one line per such entry (preview and --write)"
  - "todo-session TODO_META_KEYS is ['aoforge_todo']; the todo-sync Stop hook prefilter types the same key and exports it, and todo-sync.test.js pins the two equal"
  - "adopt reads and routes on aoforge/adopt and aoforge-adopt.json only: no legacy_branch_exists fact, no adopt-branch-conflict route, no pre-rename marker fallback"
  - "migration 0010 recognises its .gitignore block only under the AOForge slug; a pre-rename-slug block is kept as user text"
affects: [78-05-watch-daemon-runtime-home, 78-07-retire-planning-migrations-and-guard, 78-11-compat-single-name, 78-12-docs-and-close-out]

tech-stack:
  added: []
  patterns:
    - "A removed read shim leaves a read-only detector where silence would hide a stale user file (the .mcp.json warning); elsewhere the old identity is plain user data"
    - "A hook's cheap prefilter types its constant instead of loading the library, and a test pins it to the library's value"

key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/stack-mcp.cjs
    - plugins/aoforge/aoforge/bin/lib/stack-mcp.test.cjs
    - plugins/aoforge/aoforge/bin/lib/todo-session.cjs
    - plugins/aoforge/aoforge/bin/lib/todo-session.test.cjs
    - plugins/aoforge/hooks/todo-sync.js
    - plugins/aoforge/hooks/todo-sync.test.js
    - plugins/aoforge/aoforge/bin/lib/adopt.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0010-store-gitignore.test.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/file-identities.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-identity-fixtures.cjs

key-decisions:
  - "Pre-rename .mcp.json owner key: REMOVE the read, ADD a one-line report. The entry stays in the user's file and would silently stop being refreshed; a report keeps that visible without making the old key work"
  - "Pre-rename todo metadata key: REMOVE. Only a session started under the pre-rename skills writes it; every 3.x todo skill writes the AOForge key, and the cost of a miss is one unsynced todo in a months-old resumed session"
  - "Pre-rename adopt branch/marker: REMOVE, no detector. An adopt is a one-shot bootstrap; one left unfinished across two releases is restarted on aoforge/adopt, and the old branch is never touched (nothing is lost)"
  - "0010's pre-rename block slug: REMOVE, no detector. Only a project that 0012 never moved can still carry that block, and such a project is on the legacy layout, which 78-07 refuses before any migration runs"
  - "The .mcp.json warning is reported by a preview too (stack mcp reads .mcp.json leniently for it and never refuses); `warnings` is always present, empty when nothing is stale"
  - "An entry carrying the AOForge key at any value is not reported, even beside the pre-rename key: the user has already chosen for it"

requirements-completed: []

verification:
  gates_defined: 1
  gates_passed: 0
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 14min
completed: 2026-10-16
tokens_input: 27731953
tokens_output: 102056
tokens_cache_read: 27460515
tokens_cache_write: 271176
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 78 TRD 04: Identities in users' files Summary

One-liner: the `.mcp.json` owner key, the session-todo metadata key, the adopt branch and marker, and 0010's ignore-block slug are each read under the AOForge name only; a `.mcp.json` entry still owned through the pre-rename key is left byte-identical and reported in one `warnings` line naming `AOFORGE_MANAGED` as the fix.

## Progress
- [x] Task 1: RED — identities are ignored or reported — 326f8932
- [x] Task 2: GREEN — stack-mcp ownership, todo key, hook prefilter, 0010 slug — bdb1fe13
- [x] Task 3: GREEN — adopt forgets the pre-rename branch and marker — 58f65a15

## What changed

- **`.mcp.json` owner key** (`stack-mcp.cjs`). `isManaged` is `env.AOFORGE_MANAGED === 'stack'` alone; `OWNED_KEYS` is
  gone. New `legacyOwnedEntries(doc)` (exported) names entries whose env has the pre-rename `..._MANAGED === 'stack'`
  and no AOForge key; `LEGACY` is used only to build that key. Every `stackMcp` result now has `warnings` (an array,
  empty when nothing is stale), one line per such entry:
  `.mcp.json entry "<name>" is owned through the pre-rename key <KEY>, which AOForge no longer reads: rename it to AOFORGE_MANAGED (or delete the entry) to have \`stack mcp --write\` manage it`.
  The entry is never rewritten or removed. Under a name the profile wants it is a foreign clash (skipped
  `foreign_entry`). A preview reads `.mcp.json` leniently for the report and still writes nothing. Header updated.
- **Todo metadata key** (`todo-session.cjs`, `hooks/todo-sync.js`). `TODO_META_KEYS` is `['aoforge_todo']`; the
  `LEGACY` import is gone. A plain-subject TaskCreate carrying only the pre-rename key is not a todo; a `Todo: ` subject
  still is, with its stem derived. The Stop hook's prefilter types `TODO_META_KEY = 'aoforge_todo'` (no library load,
  no `LEGACY` require) and exports it; `todo-sync.test.js` pins it equal to `TODO_META_KEYS`. The `aliasLegacyEnv`
  line is untouched (78-10).
- **Adopt** (`adopt.cjs`). `LEGACY_ADOPT_BRANCH`, `LEGACY_MARKER_NAME`, the `legacy_branch_exists` fact (empty facts,
  `gitFacts`, the preflight facts and the report), `readMarker`'s fallback, `markerPath`'s name parameter and the
  `adopt-branch-conflict` route are gone. Rule 11 is "a stale `aoforge/adopt` with no marker → `adopt-branch-exists`".
  A repo on the pre-rename branch with its marker gets a fresh adopt; `begin` creates `aoforge/adopt` and leaves the
  old branch at its commit and the old marker byte-identical. `rg -n LEGACY adopt.cjs` finds nothing.
- **Migration 0010** (`0010-store-gitignore.cjs`). `START_MARKERS = [BLOCK_START]`, `END_MARKERS = [BLOCK_END]`;
  `LEGACY_BLOCK_START/END` (constants and exports) and the slug `legacy` field of `readBlock`/`blockState` are gone.
  `found.legacy` / `legacyBlockers` (pre-TRD JOB names) are kept, and the block content is unchanged. A pre-rename-slug
  block is user text: kept byte for byte, the AOForge block appended beside it, no "two blocks" refusal.

## Decisions

| Decision | Reason |
|---|---|
| Pre-rename `.mcp.json` owner key: REMOVE the read, ADD a one-line report | The entry stays in the user's file and would silently stop being refreshed; a report keeps that visible without making the old key work |
| Pre-rename todo metadata key: REMOVE | Only a session started under the pre-rename skills writes it; every 3.x todo skill writes the AOForge key, and the cost of a miss is one unsynced todo in a months-old resumed session |
| Pre-rename adopt branch/marker: REMOVE, no detector | An adopt is a one-shot bootstrap; one left unfinished across two releases is restarted on `aoforge/adopt`, and the old branch is never touched (nothing is lost) |
| 0010's pre-rename block slug: REMOVE, no detector | Only a project that 0012 never moved can still carry that block, and such a project is on the legacy layout, which 78-07 refuses before any migration runs |
| The preview reports stale entries too; `warnings` is always present | `stack mcp` (no `--write`) is how a user sees what would change; a stale entry is part of that. An always-present array keeps the JSON shape stable |
| An entry carrying the AOForge key at any value is not reported | The user has already chosen for that entry; only an entry the old key alone claims is stale |
| The hook types its key and a test pins it to the library | The prefilter must stay cheap (no library load); the test replaces the shared import as the guard against drift |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Skipped 0012 tests 9 and 9b for 78-07**
- **Found during:** Task 2
- **Issue:** `0012-planning-dir-move.legacy.test.cjs` 9 ("exactly one, AOForge-marked block" after the move) and 9b
  ("0010 recognises the legacy-marker block") assert the dual-slug reading this TRD removes. With 0010 reading the
  AOForge slug only, 0012's re-upsert appends a block beside the pre-rename one.
- **Fix:** as the Task 2 recovery directs, the tests are marked rather than deleted or rewritten: `{ skip: RETIRED_BY_78_07 }`
  with a comment naming 78-07, which retires 0012 and this file. The file is outside `files_modified`; 78-07 runs in
  wave 2 on top of this change, so no merge conflict arises.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/migrations/0012-planning-dir-move.legacy.test.cjs
- **Commit:** bdb1fe13

**2. [Rule 3 - Blocking] Fixture option `planning` on `legacyAdoptRepo`**
- **Found during:** Task 1
- **Issue:** the builder always created `.planning/`, which compat still resolves (until 78-11), so the repo classified
  as `aoforge` and routed to `upgrade`; that tests the planning layout (78-07/78-11), not the adopt branch.
- **Fix:** `legacyAdoptRepo({ planning: false })` leaves only the branch and the marker; defaults unchanged.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-identity-fixtures.cjs
- **Commit:** 326f8932

### Additions inside files_modified

- `stack-mcp.test.cjs`: `warnings` is `[]` in its tests 1 and 3; `todo-session.test.cjs` 3a pins `TODO_META_KEYS`;
  `todo-sync.test.js` pins the hook key to the library key.
- 0010 case 7 lives in `0010-store-gitignore.test.cjs` (7, 7b, 7c, 7d), built from `LEGACY.slug`, so no
  `*.legacy.test.cjs` file was needed.
- The test-list cases 1-6 live in `file-identities.legacy.test.cjs` under that file's own numbering (1-2 mcp, 3 todo,
  8 adopt; TRD cases in brackets in its header). Old 8f (`renderReport` naming the pre-rename branch) is dropped:
  no adopt runs on that branch any more. Tests 4-7 (user dot files) are untouched.

## Hand-off (outside this TRD's files)

- **78-12 (docs):** `docs/USER-GUIDE.md` lines 133-135 and 345-347 still say an adopt begun before the rename resumes
  on its pre-rename branch and that both branches refuse with `adopt-branch-conflict`; `docs/MIGRATING-TO-AOFORGE.md`
  line 76 says the same. Neither doc mentions the `.mcp.json` key or the todo key today; the new `.mcp.json` report
  (and `warnings` in the `stack mcp` JSON) is worth a line there. The CHANGELOG needs entries for all four removals.
- **78-07:** delete 0012 tests 9/9b with the file (they are skipped with `RETIRED_BY_78_07`).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED | `node --test file-identities.legacy.test.cjs migrations/0010-store-gitignore.test.cjs` | 1 | PASS (expected fail: 20 failures, all rewritten cases; 32 pass incl. tests 4-7 and every existing 0010 test) |
| 2: GREEN mcp/todo/hook/0010 | `node --test file-identities.legacy.test.cjs stack-mcp.test.cjs todo-session.test.cjs todo-sync.test.cjs hooks/todo-sync.test.js migrations/0010-store-gitignore.test.cjs` | 1 | PASS for the task: 177/183, the 6 failures are the adopt cases (Task 3); cases 1-4 and 7 green |
| 2: neighbours | `node --test migrations/0012-planning-dir-move.legacy.test.cjs rename-guard.repo.test.cjs validate.test.cjs` | 0 | PASS (141 pass, 2 skipped: 0012 9/9b) |
| 3: GREEN adopt | `node --test file-identities.legacy.test.cjs adopt-e2e.test.cjs adopt-preflight.test.cjs adopt-report.test.cjs adopt-scaffold.test.cjs adopt-skill-contract.test.cjs` | 0 | PASS (118/118); `rg -n LEGACY adopt.cjs` finds nothing |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test file-identities.legacy.test.cjs migrations/0010-store-gitignore.test.cjs` | 1 | FAIL (correct): 20 fail, each on the old behaviour (legacy entry dropped, `isManaged` true for the old key, `warnings` undefined, `TODO_META_KEYS` two keys, hook archives, route `resume`, legacy block recognised) |
| GREEN (Task 2) | the Task 2 verify set | 1 | cases 1-4 and 7 PASS; only the 6 adopt cases fail (Task 3) |
| GREEN (Task 3) | the Task 3 verify set | 0 | PASS (correct) |
| REFACTOR | none needed | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` file set minus `watcher-shell.test.cjs` (runner in the session scratchpad; ANTHROPIC_* unset), after Task 3 | 1 | 12509 tests, 12452 pass, 15 fail, 42 skipped (110.8 s). All 15 failures pre-exist or come from the environment (below), so it is not a clean PASS |

The 15 failures:
- 6 in `aoforge-watch.test.cjs` and 6 in `handoff-e2e.test.cjs`: the node-pty watch-daemon tests; this worktree has no
  `node_modules` (known environment noise).
- `requirements-agreement.repo.test.cjs` 11 and `validate-requirements.test.cjs` 9: EST-11 / objective 75, present at
  the wave base.
- `merge-driver-cli.test.cjs` 19: `ENOTEMPTY` while removing its temp dir under parallel load; it passes alone
  (13/13), and this TRD touches no merge-driver code.

`watcher-shell.test.cjs` was excluded on purpose: its W-3 fish-shell test hangs to timeout on this machine.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (AOFORGE_MANAGED-only ownership plus a one-line report naming the fix; TODO_META_KEYS
  `['aoforge_todo']` and the hook prefilter agree; no `legacy_branch_exists`, no `adopt-branch-conflict`, the old branch
  untouched; 0010 slug AOForge-only; file-identities 1-3 and 8 rewritten, 4-7 left)
- `rg -n "LEGACY"` over todo-session.cjs, adopt.cjs and hooks/todo-sync.js: nothing; stack-mcp.cjs uses LEGACY only to
  build the detector's key
- `rename-guard.repo.test.cjs`: PASS
- Gate failures: none caused by this TRD (see Validation Gate Results)
- Requirements: SC-1/SC-2 are objective-wide success criteria. This TRD covers its share; they close with the
  objective, so `requirements-completed` stays empty

## Self-Check: PASSED

- FOUND: commits 326f8932, bdb1fe13, 58f65a15 (`git cat-file -t` → commit)
- FOUND: stack-mcp.cjs, todo-session.cjs, hooks/todo-sync.js, adopt.cjs, 0010-store-gitignore.cjs,
  file-identities.legacy.test.cjs, legacy-identity-fixtures.cjs and this SUMMARY, all tracked
