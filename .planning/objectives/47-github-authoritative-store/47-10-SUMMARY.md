---
objective: 47-github-authoritative-store
trd: "10"
subsystem: github-store
tags: [github, cache-rebuild, pull-all, materialise, generated-views, outbox-bases]

requires:
  - objective: 47-github-authoritative-store
    provides: "47-01 gh-trd codec, 47-03 outbox (bases, cache index), 47-04 gh-wiki, 47-05 body markers, 47-06 gh-capability, 47-08 gh-comments"
provides:
  - "lib/gh-cache.cjs: readRemoteModel, materialize, renderRoadmap, renderState, writeCache, recordCacheBaseline, refreshBases, pullAll, GENERATED_HEADER"
  - "df-tools gh pull --all [--force]: rebuild .planning/ from GitHub alone; exit 0 / 1 / 2"
affects: [47-11-store-cli, 47-12-sync-store-wiring, 47-13-store-e2e, 47-14-docs-and-full-suite]

tech-stack:
  added: []
  patterns:
    - "one flat remote model feeds materialize, renderRoadmap and renderState; the wiki Roadmap page and local ROADMAP.md share one renderer"
    - "D-26 write rules driven by a content-hash cache index kept in the outbox state dir (outside the repo)"
    - "reads only: ghPaginate list-and-scan with full pagination, no search, no write path"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-cache.cjs
    - plugins/devflow/devflow/bin/lib/gh-cache.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/gh-pull.cjs
    - plugins/devflow/devflow/bin/lib/gh-pull.test.cjs

key-decisions:
  - "readRemoteModel returns the model FLAT with ok:true merged in ({ok:true, repo, pages, pages_report, objectives, trds, decisions, problems}), so renderRoadmap(readRemoteModel(root)) composes; ok:false results carry error (and skipped:true when github is disabled)"
  - "TRD-to-objective association is by id prefix only; native sub-issue lists are not read (no extra calls). An unplaceable TRD is reported as orphan_trds"
  - "a hand-maintained ROADMAP.md/STATE.md is never overwritten, not even with --force; a generated one (header present) is always refreshed, never local_modified"
  - "exit 2 when attention is non-empty: local_modified, hand_maintained, orphans, skipped wiki pages, rejected items, no_dir objectives, orphan TRDs, duplicate objective ids, or write errors"
  - "orphans are local STORE files only (PROJECT/REQUIREMENTS, page-table codebase/adr/retros, and OBJECTIVE/CONTEXT/RESEARCH/TRD/SUMMARY/VERIFICATION in objective dirs); config, UAT notes, the wiki clone and hand-kept ROADMAP/STATE are never orphans"

patterns-established:
  - "a pull records what it wrote in the cache index, and a push records baselines with recordCacheBaseline, so 'GitHub changed and the user did not' is decidable"

requirements-completed: [GST-07, GST-06, GST-08, GST-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 2 sessions
completed: 2026-10-01
---

# Objective 47 TRD 10: Cache rebuild, `gh pull --all`, generated ROADMAP/STATE Summary

**`lib/gh-cache.cjs` reads the whole planning hierarchy from GitHub (issues, paginated comments, wiki or `docs/devflow/` pages) into one model, lays it out in the canonical `.planning/` tree byte-exactly, renders ROADMAP.md and STATE.md from the issues with one renderer, and writes only what changed without ever deleting, clobbering a local edit or overwriting a hand-kept file. `gh pull --all [--force]` fronts it.**

## Accomplishments

- **Pure materialisation.** `materialize(model)` returns `{files, sources, rejected, no_dir, orphan_trds, unmapped_pages}`. TRD files come from the issue body (`decodeTrdBody`), SUMMARY from the TRD's `summary` comment, VERIFICATION from the objective's `verification` comment (both via `decodeFileComment`, multi-part rejoined in part order), and OBJECTIVE/CONTEXT/RESEARCH/PROJECT/REQUIREMENTS/codebase from pages through `gh-wiki.cachePathForPage`. CRLF is normalised everywhere and nothing is trimmed (a TRD without a trailing newline round-trips). The generated `Roadmap` page is never materialised.
- **Path safety.** A `devflow:file` / `devflow:dir` that is unsafe, or whose leading number does not belong to its owner, is rejected and reported; two sources for one path never overwrite each other.
- **One renderer.** `renderRoadmap(model)` groups by milestone (natural order, no-milestone last as `Unscheduled`) then numeric objective id; `renderState(model)` names the lowest-numbered open objective and `done/total` TRDs. Both start with `GENERATED_HEADER`, carry no timestamps, and match the TRD's literal example exactly.
- **Remote model.** `readRemoteModel` lists `devflow:objective` / `devflow:trd` / `devflow:decision` issues with `ghPaginate` (state=all, PRs dropped), reads every comment page of each objective and decodable TRD, probes capabilities once for the pages mode, and reads pages from the wiki clone (`ensureClone` + `fetch`) or `docs/devflow/`. A wiki that cannot be read is reported and the pages skipped; the issue-derived files still materialise. An objective id claimed by two issues is left out and reported.
- **Safe writer.** `writeCache` implements D-26 with the outbox cache index; a second `pullAll` with no remote change writes zero files (asserted by `written == []` and by aged mtimes staying aged). `recordCacheBaseline` is the push-side counterpart.
- **Base refresh.** After a pull, every pulled issue (`<id>`) and file comment (`<id>#summary`, `<id>#verification`) gets a fresh outbox base via `flushLib.baseFromIssue`, except targets with a pending/blocked op.
- **Command.** `cmdGhPull(cwd, ['--all' ...])`: enabled gate (zero gh calls when off), `pullAll`, JSON or prose, exit 0 / 1 / 2. The per-objective drift pull is untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Base refresh also skips a TRD/comment whose cache file stayed `local_modified`**
- **Found during:** Task 2 design
- **Issue:** the TRD says "refresh every pulled issue EXCEPT targets with pending ops". If GitHub's TRD body changed and the local file was also edited (so the pull kept the local file), adopting GitHub's new state as the base would hide the remote edit from the flusher, and a later push would silently overwrite it.
- **Fix:** `materialize` returns `sources` (file to base key); `pullAll` passes the keys of `local_modified`/`hand_maintained` files as `skip` to `refreshBases` (`bases.skipped_local`). Covered by a dedicated test.
- **Files modified:** `gh-cache.cjs`, `gh-cache.test.cjs`
- **Commit:** f19b165 (RED beb1e58)

### Scope decisions

- **Sub-issue lists not read.** The TRD asks for native sub-issue lists "for the orphan report only". Association is by id prefix (D-25 note), so those reads add one call per objective for a report nothing consumes; an unplaceable TRD is already reported as `orphan_trds`. Left out; no behaviour depends on it.
- **`decisions`** are read into the model (list-and-scan, as the TRD says) but nothing is materialised from them.
- **SUMMARY name** follows the dispatch (`47-10-SUMMARY.md`, the name `gate-executor-stop.js` looks for), not the longer name in the TRD's `<output>` block.
- No fixture was extended; tests use `gh-fake.cjs`, `gh-store-fixtures.cjs` (`hermeticEnv`, `STORE_FIXTURE`) and `wiki-remote.cjs` as they are. No module outside the four owned files was touched.

## Authentication Gates

None.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Pure materialisation and renderers (tests 1-4) | `node --test plugins/devflow/devflow/bin/lib/gh-cache.test.cjs` | 0 (21 pass) | PASS |
| 2: Remote model reader and safe writer (tests 5-13) | `node --test plugins/devflow/devflow/bin/lib/gh-cache.test.cjs` | 0 (54 pass) | PASS |
| 3: `gh pull --all` branch (tests 14-15) | `node --test plugins/devflow/devflow/bin/lib/gh-pull.test.cjs plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs` | 0 (gh-pull 37 pass) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED 1 (2cb5547) | `node --test .../gh-cache.test.cjs` | 1 (module not found) | FAIL (correct) |
| GREEN 1 (864080c) | same | 0, 21 pass | PASS (correct) |
| RED 2 (beb1e58) | same | 1, 33 fail (functions missing) | FAIL (correct) |
| GREEN 2 (f19b165) | same | 0, 54 pass | PASS (correct) |
| RED 3 (c83a161) | `node --test .../gh-pull.test.cjs` | 1, 8 fail (`--all` unhandled; test 15 passes by design, it pins unchanged behaviour) | FAIL (correct) |
| GREEN 3 (da2c676) | same | 0, 37 pass | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test .../gh-cache.test.cjs .../gh-pull.test.cjs` | 0 | PASS |
| regression | `node --test .../gh-e2e.test.cjs .../gh-sync.test.cjs` | 0 (all four files: 139 pass, 0 fail) | PASS |
| verification | `rg -n "ghWrite\|--search\|writePage\(" gh-cache.cjs` | 1 (no match, as required) | PASS |
| full suite | `npm test` | 1: 6840 tests, 6807 pass, 1 fail, 32 skipped | PASS (the one failure is the known pre-existing `handoff-e2e` MA-7 doctl auth) |

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (rebuild from GitHub alone; one pure canonical layout with CRLF normalised; generated header and one renderer; never rewrite / delete / clobber; base refresh skipping pending targets; zero-write second pull; full-pagination list-and-scan)
- Gate failures: None

## API contract for 47-11 / 47-12

```js
const cache = require('./gh-cache.cjs');
cache.GENERATED_HEADER                    // '<!-- generated by devflow; do not edit -->'
cache.readRemoteModel(root, {pagesMode?}) // -> {ok:true, repo, pages:{page:text}, pages_report:{mode,skipped,message?,ahead?,dirty?,updated?},
                                          //     objectives:[{id,number,rest_id,title,name,state,milestone,body,updated_at,comments}],
                                          //     trds:[{id,number,rest_id,title,state,body,updated_at,comments}], decisions, problems}
                                          //   | {ok:false, error} | {ok:false, skipped:true, reason, error}   (never throws)
cache.renderRoadmap(model)                // string; THE wiki `Roadmap` page text and ROADMAP.md (throws TypeError on an ok:false model)
cache.renderState(model)                  // string; STATE.md
cache.materialize(model)                  // pure -> {files:{rel:text}, sources:{rel:baseKey}, rejected, no_dir, orphan_trds, unmapped_pages}
cache.writeCache(root, files, {force?, skipPageOrphans?})   // -> {written, skipped, local_modified, hand_maintained, orphans, errors}
cache.recordCacheBaseline(root, relPaths) // -> {recorded, missing, invalid}; 47-12 calls it for files it just pushed
cache.refreshBases(root, model, {skip?: Set})
cache.pullAll(root, {force?})             // -> {ok:true, written, skipped, local_modified, hand_maintained, orphans, rejected, no_dir,
                                          //     orphan_trds, unmapped_pages, duplicates, pages, bases, notes, attention:[string], errors}
```

`df-tools gh pull --all [--force]`: exit 0 clean, 1 error, 2 rebuilt but `attention` is non-empty; `github.enabled` false prints `{ok:false, skipped:true}` and exits 0 with zero gh calls.

## Self-Check: PASSED

- Created files present: `gh-cache.cjs`, `gh-cache.test.cjs` (both under `plugins/devflow/devflow/bin/lib/`).
- Commits present: 2cb5547, 864080c, beb1e58, f19b165, c83a161, da2c676.
- `.planning/STATE.md` and `.planning/ROADMAP.md` untouched (the orchestrator updates them after merging).
