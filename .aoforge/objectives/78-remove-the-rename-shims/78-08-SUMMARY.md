---
objective: 78-remove-the-rename-shims
trd: "08"
subsystem: managed-block
tags: [rename-shims, managed-block, claude-md, global-upgrade, migrations, W069, ELEGACYBLOCK]
requires: ["78-01"]
provides:
  - "managed-block reads only the AOFORGE tag; a pre-rename START makes read/upsert/isStale(text) throw ManagedBlockError code ELEGACYBLOCK with the W069 text and err.fix"
  - "managed-block exports LEGACY_START_RE (pinned equal to planning-layout's LEGACY_BLOCK_START_RE) and LEGACY_BLOCK_CODE; read(text, { label }) and upsert(..., { label })"
  - "global upgrade block action pre_rename: no write, one action notice (key global-claude-md-pre-rename)"
affects: [78-07, 78-11, 78-12]
tech-stack:
  added: []
  patterns:
    - "Refuse, never read: a pre-rename block throws before any block parsing, so no writer can add a second block beside it"
    - "Lazy require on the error path only: managed-block loads planning-layout to word the refusal, with a built-in one-line fallback when it is absent (sync-runtime's fixed closure)"
key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/managed-block.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0005-claude-md-block.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0007-doc-refs-fix.cjs
    - plugins/aoforge/aoforge/bin/lib/global-upgrade.cjs
    - plugins/aoforge/aoforge/bin/lib/upgrade-cli.cjs
    - plugins/aoforge/aoforge/bin/lib/managed-block.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/global-upgrade.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/global-upgrade.test.cjs
    - plugins/aoforge/aoforge/bin/lib/upgrade-cli.test.cjs
    - plugins/aoforge/hooks/sync-runtime.test.js
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-claude-md-fixtures.cjs
  deleted:
    - plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.cjs
    - plugins/aoforge/aoforge/bin/lib/migrations/0014-claude-md-rebrand.legacy.test.cjs
decisions:
  - "Migration 0014 (CLAUDE.md rebrand): REMOVE. It depends on managed-block reading the pre-rename tag, which the migration guide listed among the removals; it is an automatic conversion of pre-rename text, which 3.1 leaves to 3.0.x; the manual equivalent is renaming two marker comments, which W069 names. Its id stays reserved (78-07's RETIRED_MIGRATIONS answers --only 0014)."
  - "Global upgrade's pre-rename block move and outside-text rewrite (outside, outside_diff, the --global --confirm rewrite of hand-written lines): REMOVE. Same reason; a detector plus one notice replaces them."
  - "legacy-rewrite.cjs: KEEP. After this TRD its only consumer is gh rebrand (kept, 78-03)."
  - "Unrelated 'legacy' kept: meta.legacy (an unversioned marker without v=) is objective 36's pre-v1 block format, not the rename; global-upgrade's df-* move (KEYS.legacy, result.legacy) is objective 36's."
  - "A pre-rename routing heading is checked before the AOForge Routing heading, so neither an adoption nor an appended block ever sits beside it."
  - "read() no longer returns `tag` (the capture group was simplified away rather than kept as a constant)."
requirements-completed: [SC-2, SC-4]
metrics:
  duration: 16min
  completed: 2026-10-17
  tasks: 3
  files: 13
status: complete
tokens_input: 19284646
tokens_output: 106285
tokens_cache_read: 19007807
tokens_cache_write: 276649
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 78 TRD 08: CLAUDE.md managed blocks under the AOFORGE markers only Summary

**managed-block now reads only `AOFORGE:START/END`. A pre-rename block makes `read` throw `ELEGACYBLOCK` with the W069 text, so no writer can add a second block beside it. Migration 0014 is gone, and 0005/0007 skip with a W069 reason while every other migration still applies. The global upgrade no longer moves a pre-rename block or rewrites hand-written text: it writes nothing and queues one notice naming the fix and AOForge 3.0.x.**

## Progress
- [x] Task 1: Fixtures and RED tests — 26d2d22c
- [x] Task 2: GREEN — managed-block one tag + refusal; 0014 deleted; 0005/0007 skip — 71f6d744
- [x] Task 3: GREEN — global upgrade: no pre-rename move, no outside rewrite, one notice — 011fa330

## What was built

- `managed-block.cjs`
  - Every marker regex is built from `NAMES.blockTag` only. The tag capture group is gone, so `read` returns `{start, end, content, meta}` and no `tag`.
  - `LEGACY_START_RE` (`<!--\s*<old tag>:START\b`, no flags) is a detector only. A test pins it equal to planning-layout's `LEGACY_BLOCK_START_RE` and checks that the two agree on 9 samples.
  - `read(text, { label = 'CLAUDE.md' })` checks the detector first. A match throws `ManagedBlockError` with `code: 'ELEGACYBLOCK'`, message `<W069 message>; fix: <fix>` and `err.fix`. Because the check runs first, a pre-rename block beside an AOFORGE one, or an unterminated one, is the same refusal, never "multiple".
  - `upsert(..., { label })` passes the label through. `isStale` lost its `tag` branch, and a pre-rename block given as text throws.
  - The W069 text comes from `planning-layout.legacyBlockMessage(label)`, required lazily inside the refusal only. On MODULE_NOT_FOUND (sync-runtime's fixed closure), the refusal uses a built-in one-line text.
  - New exports: `LEGACY_START_RE` and `LEGACY_BLOCK_CODE`.
- `migrations/0014-claude-md-rebrand.cjs` and its legacy test are deleted with `git rm`. The registry reads the directory, so 0014 is no longer listed.
- `migrations/0005`: detect turns ELEGACYBLOCK into `{ applies: false, reason: 'CLAUDE.md holds a pre-rename managed block (W069): <fix>' }`. The code comes from `planning-layout.CLAUDE_MD_CODE`.
- `migrations/0007`: the CLAUDE.md target becomes `present: false` with skip `holds a pre-rename managed block (W069): <fix>`, and the STATE.md part still runs. The stale header comments flagged by 78-02 are rewritten: line 5 no longer mentions legacy prefixes, and the count comment says "renamed command tokens".
- `global-upgrade.cjs`
  - `ROUTING_RE` matches AOForge only. The new `LEGACY_ROUTING_RE` is a detector.
  - `planBlock` reads with label `~/.claude/CLAUDE.md`. ELEGACYBLOCK becomes `{action: 'pre_rename', reason}`. So does a pre-rename routing heading when there is no block, checked before the AOForge heading.
  - `runGlobalUpgrade` never writes on `pre_rename`, with or without confirm. It queues one `action` notice (`source: global-upgrade`, `key: global-claude-md-pre-rename`), and `block.reason` carries the text.
  - Removed: `planOutside`, `KEYS.outside`, both outside notices, the `outside` result field and the legacy-rewrite import. The module now requires only managed-block, notices, legacy-names and text-escape.
- `upgrade-cli.cjs`: no `outside_diff` and no outside rendering. `--global --raw` prints `CLAUDE.md left untouched: <reason>` for `pre_rename`. The header no longer describes the outside diff.
- `sync-runtime.test.js`: the closure comment now says legacy-rewrite is no longer needed and planning-layout stays out on purpose.

User-facing text, from a fake home:
- Block: "legacy-claude-md-block: ~/.claude/CLAUDE.md holds a managed block under the pre-rename DEVFLOW markers, which AOForge no longer updates; fix: Rename <!-- DEVFLOW:START and <!-- DEVFLOW:END to AOFORGE; the next upgrade refreshes the block (or run AOForge 3.0.x's upgrade once). AOForge vX left ~/.claude/CLAUDE.md untouched."
- Heading: "~/.claude/CLAUDE.md has a hand-written "DevFlow Routing" section under the pre-rename product name, which AOForge no longer adopts; fix: delete that section (the next upgrade then adds the managed AOForge block), or run AOForge 3.0.x's `upgrade --global --confirm` once. ..."

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Migration 0014 (CLAUDE.md rebrand) | REMOVE | It depends on managed-block reading the pre-rename tag, which the migration guide listed among the removals ("the old block markers"). It is an automatic conversion of pre-rename text, which 3.1 leaves to 3.0.x. The manual equivalent is renaming two marker comments, which W069 names. Its id stays reserved: 78-07's RETIRED_MIGRATIONS answers `--only 0014`. |
| Global upgrade's pre-rename block move and outside-text rewrite (`outside`, `outside_diff`, `--global --confirm` rewrite of hand-written lines) | REMOVE | Same reason as above. A detector plus one notice replaces them. |
| `legacy-rewrite.cjs` | KEEP | After this TRD its only consumer is `gh rebrand` (kept, 78-03). |
| Unrelated "legacy" | KEEP | `meta.legacy` (an unversioned marker without `v=`) is objective 36's pre-v1 block format, not the rename. global-upgrade's df-* move (`KEYS.legacy`, `result.legacy`) is objective 36's too. |
| Order of the heading checks | Pre-rename heading first | With no block, a pre-rename routing heading wins over an "AOForge Routing" heading and over appending. AOForge never adds a block beside pre-rename routing text. |
| `read()` result shape | No `tag` field | The TRD allowed either keeping the capture group or simplifying it consistently. Its only reader was 0014, which is deleted. |
| W069 code in the migrations | `planning-layout.CLAUDE_MD_CODE` | Migrations load with the full lib, so 0005/0007 import the code instead of spelling W069. |

## Deviations from Plan

### Auto-fixed Issues

None. The code needed no Rule 1-3 fixes.

### Plan text that could not be followed literally

**1. The verification `rg -n "LEGACY" managed-block.cjs` finds nothing cannot hold.**
- **Issue:** The TRD also requires the code `ELEGACYBLOCK` and a detector named `LEGACY_START_RE`. Both appear in key_links, the test list and gotchas, and both contain the string. The gotcha also says the detector is "built from LEGACY.blockTag", while Task 2 says to "drop the LEGACY import". The two cannot both be met.
- **Resolution:** The `LEGACY` import stays. It is used only to build the detector and the built-in fallback text (lines 54 and 83). Every block regex (`START_RE`, `END_RE`, `SINGLE_START_RE`), `isStale` and the `read` result use `NAMES.blockTag` only. Test 6 (`isStale` ignores `tag`) and test 5d (no tag in the result) check this.

**2. global-upgrade needs no lazy planning-layout require.**
- The gotcha says global-upgrade "does the same for its notice". It does not need to. The block notice reuses the refusal message managed-block already formatted (label `~/.claude/CLAUDE.md`). The heading notice is composed from NAMES/LEGACY/SHIM_RELEASE. global-upgrade.test 14 now forbids `./legacy-rewrite.cjs`, and planning-layout was never allowed there.

**3. Two test files in files_modified needed no change.**
- `managed-block.test.cjs` and `migrations/0005-claude-md-block.test.cjs` are unchanged. Their cases (pre-v1 `meta.legacy`, "multiple", unterminated) still pass as written. 0005's W069 reason is covered outside-in by case 4.

**4. The case 4 fixture uses both fixture modules.**
- The planning tree comes from `legacy-layout-fixtures.planningProject` (hermetic HOME, git) and CLAUDE.md from `legacy-claude-md-fixtures.projectClaudeMd()`. The test compares against a control project without CLAUDE.md, so "every other migration applies" is a measured equality (`0001`, `0003`), not a hard-coded list.

**5. Fixture cleanup.** `OUTSIDE_LEGACY_LINE_NEW` was deleted because nothing uses it once the approved rewrite is gone. `globalClaudeMd({ crlf })` was added.

### Behaviour note
While the pre-rename text remains, the `pre_rename` notice is re-queued on every global upgrade (each session, through sync-runtime) under the same key. This is the same as the existing `adopt_pending` notice. An unshown copy is replaced, never duplicated.

## Left for later TRDs (outside this TRD's files_modified)
- `plugins/aoforge/aoforge/bin/lib/legacy-rewrite.cjs` lines 12-13 and `legacy-rewrite.legacy.test.cjs` line 4 still name migration 0014 and global-upgrade as its users. Its only user now is gh rebrand. Suggested owner: 78-12.
- `CLAUDE.md` (Upgrade bullet: 0014, `--global` moving a pre-rename block, `outside_diff`), `docs/USER-GUIDE.md` line 392, `docs/MIGRATING-TO-AOFORGE.md` and `site/content/docs/getting-started/migrating-to-aoforge.md` describe the removed behaviour (78-12, docs).
- The `stateRel` comment in `migrations/0007-doc-refs-fix.cjs` ("`.aoforge/`, or a legacy one") belongs with compat's `planningRel` (78-11).
- `upgrade.cjs` retired id 0014 (78-07).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixtures and RED tests | `node --test managed-block.legacy.test.cjs global-upgrade.legacy.test.cjs` (13 of 15 fail for the intended reasons; the 2 passing are the unchanged-behaviour guards: AOForge heading adoption, template routing) | 1 | PASS (RED as required) |
| 2: managed-block one tag + refusal; 0014 deleted; 0005/0007 skip | `node --test managed-block.legacy.test.cjs managed-block.test.cjs migrations/0005-claude-md-block.test.cjs migrations/0007-doc-refs-fix.test.cjs migrations/0007-doc-refs-fix.legacy.test.cjs doc-staleness.test.cjs adopt-*.test.cjs upgrade.test.cjs doc-refs.repo.test.cjs` (219 pass); `git ls-files 'plugins/aoforge/aoforge/bin/lib/migrations/0014*'` prints nothing; W069 suites from 78-01 (122 pass) | 0 | PASS |
| 3: global upgrade: no move, no outside rewrite, one notice | `node --test global-upgrade.legacy.test.cjs global-upgrade.test.cjs upgrade-cli.test.cjs ../../hooks/sync-runtime.test.js managed-block.legacy.test.cjs` (98 pass); `rg -n "outside_diff\|rewriteLegacyNames\|planOutside\|KEYS.outside" global-upgrade.cjs upgrade-cli.cjs` finds nothing | 0 / 1 (no match) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (26d2d22c) | `node --test managed-block.legacy.test.cjs global-upgrade.legacy.test.cjs` | 1 (13/15 fail: no refusal, 0005 applies, 0014 in the registry, `updated` instead of `pre_rename`, outside diff printed) | FAIL (correct) |
| GREEN Task 2 (71f6d744) | `node --test managed-block.legacy.test.cjs` + Task 2 verify set | 0 (10/10; 219 in the set) | PASS (correct) |
| GREEN Task 3 (011fa330) | `node --test global-upgrade.legacy.test.cjs global-upgrade.test.cjs upgrade-cli.test.cjs sync-runtime.test.js managed-block.legacy.test.cjs` | 0 (98/98) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test` on every touched suite (above), plus `rename-guard.repo.test.cjs` and `doc-refs.repo.test.cjs` (37 pass) | 0 | PASS |
| test (full) | npm test globs minus `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs`: 392 files, 12536 tests, 12505 pass, 2 fail, 29 skipped, 0 cancelled | 1 | PASS (no new failures) |

The full run excluded `watcher-shell.test.cjs`, because its W-3 fish-shell test hangs to timeout on this machine. node_modules was symlinked from the main checkout for the node-pty watch tests and removed afterwards. It was never committed. The 2 failures are the known pre-existing W065 noise: objective 75 marks EST-11 satisfied, but no 75 SUMMARY lists it. They are in:
- `requirements-agreement.repo.test.cjs`
- `validate-requirements.test.cjs`

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6. Each truth is covered by a test:
  - The ELEGACYBLOCK refusal with W069 text and no second block: tests 5, 5b, 5c.
  - `isStale` and `tag`: tests 6, 5d.
  - 0014 deleted: test 7.
  - 0005/0007 not applicable with W069 while the other migrations apply: test 4.
  - Global: no move, no outside rewrite, one notice: global tests 1, 1b and 2.
  - No `outside` in `upgrade --global` output: test 1b and upgrade-cli test 10.
  - Key links: `LEGACY_START_RE` is pinned to planning-layout (6b); loading managed-block and global-upgrade does not load planning-layout (6c); the fallback works without it (6d).
- Gate failures: None introduced.

## Self-Check: PASSED

- FOUND: managed-block.cjs, managed-block.legacy.test.cjs, global-upgrade.cjs, global-upgrade.legacy.test.cjs, upgrade-cli.cjs, legacy-claude-md-fixtures.cjs
- ABSENT as intended: migrations/0014-claude-md-rebrand.cjs (`git ls-files` empty)
- FOUND commits: 26d2d22c, 71f6d744, 011fa330 (`git log 5eb8c38e..HEAD`)
