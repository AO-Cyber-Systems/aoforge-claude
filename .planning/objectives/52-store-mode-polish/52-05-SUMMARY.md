---
objective: 52-store-mode-polish
trd: "05"
subsystem: planning-state
tags: [frontmatter, yaml, block-scalar, decision-queue, decision-answer, planning-import, backfill, tdd]
requires: []
provides:
  - "reconstructFrontmatter writes any string holding a newline (top level and one level down) as a `|-` literal block scalar indented two columns past its key; single-line output is byte-identical"
  - "extractFrontmatter reads `|`, `|-`, `|+` (and `>`/`>-`/`>+`, literally) block scalars at any nesting level, stripping exactly keyIndent + 2 columns"
  - "decision-queue.resolveDecision normalises the answer (CRLF -> LF, trimEnd) before the options check and before writing `resolution`"
  - "planning-import frontmatterField returns the full text of a block-scalar field, so the 0011 backfill carries a multi-line answer to GitHub"
affects: [52-06]
tech-stack:
  added: []
  patterns: [block-scalar path gated on `\\n` so single-line frontmatter never changes, strip exactly keyIndent + 2 columns rather than the minimum indentation]
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/frontmatter.cjs
    - plugins/devflow/devflow/bin/lib/frontmatter.test.cjs
    - plugins/devflow/devflow/bin/lib/decision-queue.cjs
    - plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-import.cjs
    - plugins/devflow/devflow/bin/lib/planning-import.test.cjs
key-decisions:
  - "The fix is in the shared serializer and parser (frontmatter.cjs), not in decision-queue. Any multi-line string written through spliceFrontmatter was invalid YAML before; now it is a `|-` block. The block path triggers only for strings that contain `\\n`, so every existing single-line value serialises byte for byte as before (pinned by test 52-05 #9)."
  - "The serializer drops trailing newlines (`|-` strips them on read) and writes an empty content line as an empty line, with no trailing spaces. An answer line `---` is written as `  ---`, so it can no longer close the frontmatter."
  - "The parser strips exactly keyIndent + 2 columns, so leading spaces inside the content survive (`  indented line`). A non-blank line at or left of the key's indent ends the block."
  - "`>` / `>-` / `>+` are parsed as literal blocks, not folded. The serializer never emits them, and a wrong fold would be worse than an honest literal. The code comment says so."
  - "resolveDecision normalises first, so a one-line answer read from a file (`decision answer --from`, which always ends in a newline) is written as `resolution: <answer>` and matches its declared option. Without this it became a one-line `|-` block and tripped the `not in declared options` warning."
requirements-completed: ["52-6"]
verification:
  gates_defined: 1
  gates_passed: 0  # npm test exit 1: 11 failures outside this TRD (10 watcher-daemon, also failing at WAVE_BASE; 1 main-checkout roadmap self-test)
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true
duration: 13min
completed: 2026-10-04
---

# Objective 52 TRD 05: Multi-line `decision answer` round-trips intact Summary

**A multi-line `decision answer` now reads back exactly as written. The shared frontmatter serializer writes any string that contains a newline as a YAML `|-` block scalar. The hand parser reads `|`, `|-` and `|+` blocks back to the exact text. `resolveDecision` normalises CRLF and trailing whitespace first. `planning import` reads a block-scalar `resolution` in full, so the 0011 backfill carries the whole answer to GitHub. The planner's reproduction now gives back the full answer with `resolved_at` intact and no spurious `Reason` key. Single-line frontmatter is byte-identical to before.**

## Progress
- [x] Task 1: block scalars in the shared frontmatter serializer and parser — RED 4ab2e30a, GREEN 0788b0c1
- [x] Task 2: decision answer round-trips in local and store mode — RED 84458e03, GREEN 47c806ef
- [x] Task 3: planning import carries a multi-line resolution to GitHub — RED daa8b1b0, GREEN 91a8b0d9
- [x] Post-TRD verification: `npm test` gate and the planner's reproduction

## Performance

- Started: 2026-10-04T14:32:56Z
- Finished: 2026-10-04T14:46Z (about 13 min)
- Tasks: 3 of 3, in 6 commits (RED + GREEN per task)
- Files modified: 6 source/test files

## What changed

- `frontmatter.cjs`
  - `blockScalarLines(pad, key, text)` emits `key: |-` plus the lines, each indented two columns past the key. `reconstructFrontmatter` uses it for a top-level string and for a nested `subval` string that contains `\n`. The third-level `subsubval` branch is unchanged, as the TRD said.
  - `readBlockScalar(lines, start, keyIndent, indicator)` collects every following line that is blank or indented past the key. It strips exactly `keyIndent + 2` columns (all leading whitespace when the line is shorter) and applies chomping: `-` strips, none clips to one newline, `+` keeps.
  - `extractFrontmatter`'s loop is now index-based, so it can skip past a block. The block starts only when the value is exactly `|`, `|-`, `|+`, `>`, `>-` or `>+` (`BLOCK_SCALAR_RE`), so `a | b` stays a plain scalar.
- `decision-queue.cjs` `resolveDecision`: `const text = String(choice).replace(/\r\n/g, '\n').trimEnd()` is used for both the options check and `fm.resolution`.
- `planning-import.cjs` `frontmatterField`: when the captured value is a block indicator, it returns `extractFrontmatter(text.replace(/\r\n/g, '\n'))[key]` if that is a non-empty string, and null otherwise. The single-line path is unchanged. Requiring `./frontmatter.cjs` creates no cycle (checked with `node -e "require(...)"`).

## Deviations from Plan

### Test-list adjustments (no code deviation)

**1. Item 2's given input passes on Task 1 alone, so I added inputs that fail without the Task 2 fix**
- **Found during:** Task 2 RED
- **Issue:** The TRD says item 2 (`'a\r\nb\r\n'` -> `a\nb`) "fails today on `\r`". But Task 1's serializer already normalises CRLF and drops trailing newlines, so the item passes once Task 1 is in. It could not serve as Task 2's RED.
- **Fix:** I kept the TRD's assertion and added two cases that do fail without the `resolveDecision` normalisation. First, `'a\nb  \r\n\r\n'` must read back as `a\nb` (trailing whitespace trimmed). Second, `'B\r\n'` against `options: [A, B]` must be written as a plain `resolution: B` with no `not in declared options` warning. Item 1 (the CLI test) also gained a one-line `--from` answer that must be written as `resolution: Option A`. The multi-line half of item 1 already passed on Task 1, which shows the serializer fixes the CLI path end to end.
- **Files modified:** plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs
- **Commit:** 84458e03

**2. Item 3 (store mode) also sends CRLF input** to check that the answer comment and the cache file get the normalised text. It is a guard and was green before and after, as the TRD expected.

### Auto-fixed Issues

None. No existing test pinned a broken multi-line shape. The error-recovery case in the TRD did not come up.

## Known limitations

- A multi-line value whose **first** line starts with whitespace is written as `|-` with no indentation indicator. DevFlow's own parser reads it back exactly, because it strips exactly keyIndent + 2. A strict external YAML parser would infer a deeper block indent and lose those leading spaces. `resolveDecision` trims only the end, so an answer that starts with spaces hits this case. It is rare, and `|2-` was deliberately left out (the TRD names exactly six indicators).
- Decisions resolved before this fix are still mangled on disk. Out of scope; TRD 52-06 documents it.
- An empty `recommendation:` is still read as `{}`. Out of scope per the TRD.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: block scalars in frontmatter.cjs | `node --test plugins/devflow/devflow/bin/lib/frontmatter.test.cjs plugins/devflow/devflow/bin/lib/decision-queue.test.cjs` | 0 | PASS (80/80) |
| 2: decision answer local + store | `node --test plugins/devflow/devflow/bin/lib/planning-entity-verbs.test.cjs plugins/devflow/devflow/bin/lib/decision-queue.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs-cli.test.cjs` | 0 | PASS (48/48) |
| 3: import multi-line resolution | `node --test plugins/devflow/devflow/bin/lib/planning-import.test.cjs plugins/devflow/devflow/bin/lib/planning-import-backfill.test.cjs` | 0 | PASS (9/9) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| T1 RED | `node --test --test-name-pattern=52-05 frontmatter.test.cjs` | 1 | FAIL (correct): 6 failures, e.g. `'a: x\ny' !== 'a: \|-\n  x\n  y'`, `'\|-' !== 'a\nb'`, resolution `'Option B.'`; #9 (byte-identity guard) passes |
| T1 GREEN | `node --test frontmatter.test.cjs decision-queue.test.cjs` | 0 | PASS (correct) |
| T2 RED | `node --test --test-name-pattern=52-05 planning-entity-verbs.test.cjs` | 1 | FAIL (correct): `resolution: \|-\n  Option A` not `resolution: Option A`; `'a\nb  ' !== 'a\nb'`; #3 store guard passes |
| T2 GREEN | `node --test planning-entity-verbs.test.cjs decision-queue.test.cjs planning-verbs-cli.test.cjs` | 0 | PASS (correct) |
| T3 RED | `node --test --test-name-pattern="11b\|52-05" planning-import.test.cjs` | 1 | FAIL (correct): queued answer `['\|-']` not the two lines; #5 (`resolution: B` -> `B`) passes |
| T3 GREEN | `node --test planning-import.test.cjs planning-import-backfill.test.cjs` | 0 | PASS (correct) |
| REFACTOR | none needed | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 1 | FAIL: 8739 pass, 11 fail, 50 skipped of 8800. None of the 11 is in or depends on a file this TRD touched |

The 11 failures:
- **10 come from the watcher daemon** (`devflow-watch.test.cjs` foreground start, 4; `handoff-e2e.test.cjs`, 6). In this sandbox the foreground daemon never writes its PID file. The same failure (`PID file should be created`) reproduces at WAVE_BASE 67f87a01: I extracted that commit's tree with `git archive` into the scratchpad and ran `devflow-watch.test.cjs` there, and 2 of the 4 fail. The other two are the same start race and fail intermittently. None of `devflow-watch.cjs`, `watcher-daemon.cjs` or `handoff-e2e.test.cjs` loads frontmatter.cjs, decision-queue.cjs or planning-import.cjs.
- **1 is `roadmap-reconcile.test.cjs` E2E1**, a self-test that reconciles the MAIN checkout's ROADMAP.md. It finds `52-01`..`52-05` SUMMARY files in the main checkout, which the wave's `summary checkpoint` calls wrote, so it reports their `- [ ]` lines as drift. It will clear when the orchestrator merges the wave and ticks the roadmap.
- `planning-writes.audit.test.js` "classify-session.js cwd=flutter" failed once with spawn EPIPE in the first full run (with Task 1 applied). It passed when run alone and in the final run, so it is a load flake.

No project STACK.md exists (the stack resolves to General only), so there was no inner loop and no task gates beyond the TRD's.

## Discovered commands

None.

## Post-TRD Verification

- Planner's reproduction, re-run in a scratch project (`.planning/config.json` `{}`): `decision open 52-01 --question "Pick?"`, then `decision answer DECISION-001 --from ans.md` with `Option B.\nReason: second line with colon\n---\nthird line\n`. The file holds `resolution: |-` followed by the four indented lines and `resolved_at: "2026-10-04T14:42:39.803Z"`. `extractFrontmatter` returns `resolution: "Option B.\nReason: second line with colon\n---\nthird line"`, `status: resolved` and `resolved_at`, with no `Reason` key.
- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (local CLI round trip; serializer/parser block scalars at top level and one level down; single-line byte-identity; import queues the full answer; store comment -> pull round trip)
- Gate failures: `npm test` exits 1 on 11 tests: 10 watcher-daemon tests, which also fail at WAVE_BASE in this environment, and 1 main-checkout roadmap self-test that sees the wave's in-flight SUMMARY files. No failure is in or depends on a file this TRD touched. Details are under Validation Gate Results.

## Notes for the orchestrator

- `summary checkpoint` / `summary post` resolve the MAIN checkout, so each call also wrote `/Users/justin/dev/devflow-claude/.planning/objectives/52-store-mode-polish/52-05-SUMMARY.md` there, where it sits untracked. The same file is committed on `df/exec-52-05`. Remove the untracked main-checkout copy before merging, or git will refuse to overwrite it.
- STATE.md / ROADMAP.md / REQUIREMENTS.md updates (`state advance-job`, `roadmap update-job-progress 52`, `requirements mark-complete 52-6`) are made in the final docs commit on this branch. Expect conflicts with the wave peers at merge.

## Self-Check: PASSED

- FOUND: all 6 modified files (frontmatter.cjs, frontmatter.test.cjs, decision-queue.cjs, planning-entity-verbs.test.cjs, planning-import.cjs, planning-import.test.cjs)
- FOUND: commits 4ab2e30a, 0788b0c1, 84458e03, 47c806ef, daa8b1b0, 91a8b0d9 on df/exec-52-05 (`git log 67f87a01..HEAD`)
- Worktree clean after the last task commit
- The three scoped verify commands pass. The `npm test` gate exits 1 on 11 failures outside this TRD (see Validation Gate Results).
