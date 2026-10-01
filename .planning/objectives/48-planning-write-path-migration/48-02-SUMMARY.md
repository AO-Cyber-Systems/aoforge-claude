---
objective: 48-planning-write-path-migration
trd: "02"
subsystem: github-sync
tags: [entity-codec, mapping, outbox, todo, debug, quick, node-test, tdd]

requires: []
provides:
  - "gh-trd.cjs: ENTITY_ID_RE, ENTITY_ID_LINE_RE, isSafeEntityPath, encodeEntityBody, decodeEntityBody (separate codec from the TRD one; neither decoder accepts the other's body)"
  - "gh-mapping.cjs: toEntityId, getEntity, setEntity, listEntities; top-level `entities` section rendered after `trds` only when non-empty; migrateMapping carries it"
  - "gh-outbox.cjs: ROLES = [trd, decision, todo, debug, quick] (frozen, exported), ENTITY_ROLES (frozen label/type table), ENTITY_ID_RE; upsert-issue refuses an entity id whose prefix disagrees with its role"
affects: [48-06, 48-07, 48-12]

tech-stack:
  added: []
  patterns:
    - "One entity-id grammar: gh-trd owns ENTITY_ID_RE, gh-mapping imports it (gh-trd requires only crypto, so no cycle), gh-outbox duplicates it to stay hook-safe and a test pins the two `.source` values"
    - "Additive top-level mapping section rendered only when non-empty, so every existing .gh-mapping.json is byte-identical after a read-modify-write (pinned by a literal characterization test)"

key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/gh-trd.cjs
    - plugins/devflow/devflow/bin/lib/gh-trd.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-mapping.cjs
    - plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox.cjs
    - plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs

key-decisions:
  - "Entity file line carries a .planning/-relative PATH, validated by isSafeEntityPath (every `/` segment is a safe file name: no leading dot, no `..`, no empty segment, no backslash), not the single-segment fileLine 47 uses"
  - "Entity ids have exactly one spelling: toEntityId neither trims nor lowercases (unlike toTrdId), so the outbox, mapping and codec agree byte-for-byte on keys"
  - "decodeTrdBody and decodeEntityBody share a private decodeHeader(body, idLineRe, parseFile); ID_LINE_RE stays numeric-only so an entity body is never decoded as a TRD"
  - "upsert-issue with role trd/decision keeps the 47 path (no new id check); only entity roles are prefix-checked"
  - "migrateMapping drops a non-object `entities` with a note (it is now a known key, so it is no longer carried as an extra)"

patterns-established:
  - "Entity entry shape mirrors trds: {issue_number, rest_id, role, comment_ids}; role defaults from the id prefix and must agree with it"

requirements-completed: [GWP-01, GWP-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 16min
completed: 2026-10-01
---

# Objective 48 TRD 02: Entity issue contract Summary

**Todos, debug sessions and quick tasks now have an issue contract: `todo-<stem>` / `debug-<stem>` / `quick-<N>` ids, a byte-exact entity body codec whose file line is a `.planning/`-relative path, an `entities` mapping section that is invisible until used, and outbox roles with a frozen label/type table and a prefix-vs-role check. No GitHub calls; the flusher branch is 48-06 and materialisation is 48-07.**

## Performance

- **Duration:** about 16 min
- **Started:** 2026-10-01T11:44:15Z
- **Completed:** 2026-10-01T11:59:38Z
- **Tasks:** 3 of 3
- **Files modified:** 6 (3 modules, 3 test files)

## Accomplishments

- `encodeEntityBody` / `decodeEntityBody` round-trip todo, debug and quick bodies byte-exactly (CRLF normalised, empty text, stripped trailing newline). `decodeTrdBody` refuses an entity body and `decodeEntityBody` refuses a TRD body (U-1, U-3, D-03).
- `entities` mapping section with `toEntityId` / `getEntity` / `setEntity` / `listEntities`. A mapping without entities serialises to a pinned literal identical to the 47 output, and an empty `entities: {}` is not rendered.
- `ROLES` extended to five and exported; `ENTITY_ROLES` = `{todo: devflow:todo / no type, debug: devflow:debug / Debug, quick: devflow:quick / Quick}`, frozen at both levels. `upsert-issue` returns `entity id <id> does not match role <role>` on a mismatch; `upsert-comment` and `patch-issue` accept entity ids.

## Task Commits

1. **Task 1: Entity body codec in gh-trd (tests 2-4)**: `d98522b` (test, RED), `d46abd5` (feat, GREEN)
2. **Task 2: Mapping entities section (tests 5-9)**: `c91a714` (test, characterization), `efb58ef` (test, RED), `18be44b` (feat, GREEN)
3. **Task 3: Outbox roles and entity-aware validation (tests 10-13)**: `a844fd1` (test, characterization), `771d8a4` (test, RED), `8f5bbca` (feat, GREEN)

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Entity body codec | `node --test plugins/devflow/devflow/bin/lib/gh-trd.test.cjs` | 0 | PASS (164/164) |
| 2: Mapping entities | `node --test plugins/devflow/devflow/bin/lib/gh-mapping.test.cjs plugins/devflow/devflow/bin/lib/migrations/0009-gh-mapping-v3.test.cjs` | 0 | PASS (106/106) |
| 3: Outbox entity roles | `node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs` | 0 | PASS (217/217) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1) | `node --test .../gh-trd.test.cjs` | 1 | FAIL (correct): encodeEntityBody/decodeEntityBody/ENTITY_ID_RE missing |
| GREEN (T1) | `node --test .../gh-trd.test.cjs` | 0 | PASS (correct) |
| characterization (T2) | `node --test .../gh-mapping.test.cjs` | 0 | PASS on 47 code (pinned literal) |
| RED (T2) | `node --test .../gh-mapping.test.cjs` | 1 | FAIL (correct): 14 failures; accessors missing, `entities: {}` rendered as an extra, a non-object entities carried |
| GREEN (T2) | `node --test .../gh-mapping.test.cjs .../0009-gh-mapping-v3.test.cjs` | 0 | PASS (correct) |
| characterization (T3) | `node --test .../gh-outbox.test.cjs` | 0 | PASS on 47 code (pinned `trd\|decision` error strings for `bogus` and `todo`) |
| RED (T3) | `node --test .../gh-outbox.test.cjs` | 1 | FAIL (correct): 6 failures; roles, ENTITY_ROLES, ENTITY_ID_RE missing |
| GREEN (T3) | `node --test .../gh-outbox.test.cjs .../gh-outbox-flush.test.cjs` | 0 | PASS (correct) |

Two RED-phase tests passed before GREEN by construction: 7d (setEntity rejects a bad id; calling a missing function also throws TypeError) and 13 (47's `ID_RE` already accepts entity ids for `upsert-comment` / `patch-issue`). Both now pass for the intended reason and guard behaviour 48-06 relies on.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test gh-trd.test.cjs gh-mapping.test.cjs gh-outbox.test.cjs` | 0 | PASS (308/308) |
| regression | `node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'` | 0 | PASS (1149/1149: 47's 1107 plus 42 new) |
| full suite | `node --test` over the `npm test` globs, worktree paths | 1 | 6957 pass, 1 fail (MA-7, known pre-existing doctl auth flake in handoff-e2e.test.cjs), 32 skipped |

## Files Modified

- `plugins/devflow/devflow/bin/lib/gh-trd.cjs`: entity id grammar, `isSafeEntityPath`, entity file line, private `decodeHeader` shared with `decodeTrdBody`, `encodeEntityBody` / `decodeEntityBody`.
- `plugins/devflow/devflow/bin/lib/gh-mapping.cjs`: imports `ENTITY_ID_RE`; `entities` in `KNOWN_TOP_LEVEL`, `migrateMapping` and `serializeMapping`; the four entity accessors; `mergeCommentIds` names its caller in errors (default `setTrd`, so 47's messages are unchanged).
- `plugins/devflow/devflow/bin/lib/gh-outbox.cjs`: frozen `ROLES`, `ENTITY_ROLES`, duplicated `ENTITY_ID_RE`, the entity prefix check in `upsert-issue`; exports.
- The three matching `.test.cjs` files: tests 2-13 plus guards.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Entity file line cannot reuse `fileLine`**
- **Found during:** Task 1
- **Issue:** The TRD says to reuse `fileLine`, but 47's `SAFE_FILE_RE` accepts a single path segment only, and the entity file line must carry `todos/pending/x.md` / `quick/12-fix-x/12-JOB.md`.
- **Fix:** Added `isSafeEntityPath` (every `/` segment passes 47's `isSafeFileName`) and a private `entityFileLine` / `parseEntityFileLine` over the unchanged `FILE_LINE_RE`. Dot-prefixed segments are refused, so a pull can never write a runtime dotfile. `isSafeEntityPath` is exported for 48-07 / 48-12.
- **Files modified:** gh-trd.cjs, gh-trd.test.cjs
- **Commits:** d98522b, d46abd5

**2. [Rule 2 - Missing critical] `migrateMapping` must carry `entities`**
- **Found during:** Task 2
- **Issue:** Adding `entities` to `KNOWN_TOP_LEVEL` alone would stop `migrateMapping` (which `writeMappingV3` runs first) from carrying it as an extra, so every write would silently drop the entity map.
- **Fix:** `migrateMapping` clones a plain-object `entities` (`changed` stays false for a v3 input) and drops a non-object one with a note. Test 8d pins both cases; 8c pins a disk round-trip.
- **Commits:** efb58ef, 18be44b

**3. [Rule 3 - Blocking] gh-outbox cannot require gh-trd or gh-mapping**
- **Found during:** Task 3
- **Issue:** 47's hygiene tests 17a/17b pin gh-outbox's requires to builtins plus `./sync-state.cjs` and forbid loading gh-mapping.
- **Fix:** Duplicated `ENTITY_ID_RE` in gh-outbox, following the TRD's own error_recovery; test 12b asserts the same `.source` and `.flags` as gh-trd's.
- **Commits:** 771d8a4, 8f5bbca

### Environment note (not a code deviation)

The home runtime mirror (`~/.claude/devflow`) was re-synced to plugin 2.10.1 mid-run, presumably by another session, and lost the global `--cwd` flag after the first commit. The remaining commits used the worktree's own `plugins/devflow/devflow/bin/df-tools.cjs commit` (the form the TRD's binding rules name). The mirror was left as is: re-syncing `~/.claude` is out of scope.

**Total deviations:** 3 auto-fixed (2 blocking, 1 missing-critical). **Impact:** all additive; the 47 contract is unchanged (`ID_LINE_RE`, `TRD_ROLES`, `encodeTrdBody`, `setTrd` and every existing signature are untouched).

## Issues Encountered

- One full-suite run via `npm --prefix` hit three `devflow-watch` daemon-start timeouts (about 3s each), which did not recur on the rerun. They come from load-sensitive timing in parallel worktrees and do not touch the gh-* modules.
- MA-7 (handoff-e2e, doctl auth) fails as a known flake; it was noted and not fixed, per the dispatch.

## Notes for downstream TRDs

- **48-06 (flusher):** today's `handleUpsertIssue` refuses an entity op safely (`toTrdId` gives null, so `failWith('error', ...)`), so an entity op queued early blocks and is never filed as a TRD. Branch on `Object.hasOwn(outbox.ENTITY_ROLES, role)` and use `getEntity` / `setEntity`; apply `config.github.labels.<role>` over `ENTITY_ROLES[role].label`.
- **48-07 (cache):** decode with `decodeEntityBody`; `file` is already validated as `.planning/`-relative and dot-free.
- **48-12 (verbs):** build ids that pass `ENTITY_ID_RE` (lowercased stem, max 100 chars); `encodeEntityBody` throws a TypeError otherwise.
- **Store-off invariant:** nothing here reads `github.store` or writes under `.planning/`; local-mode behaviour is unchanged.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (codec round-trip and mutual refusal; toEntityId grammar; entities section with a byte-identical no-entities serialisation; ROLES/ENTITY_ROLES/role-prefix check; every existing gh-trd/gh-mapping/gh-outbox test unchanged and green)
- Gate failures: None (full-suite MA-7 is a known pre-existing flake outside scope)

## Self-Check: PASSED

- All 6 modified files are present in the worktree.
- All 8 commits are present in `git log baad394..HEAD`: d98522b, d46abd5, c91a714, efb58ef, 18be44b, a844fd1, 771d8a4, 8f5bbca.
