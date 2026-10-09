---
objective: 72-install-and-naming-cleanup
trd: "17"
subsystem: docs
tags: [aoforge-rename, docs, identity, brand, migration-guide, site, rename-guard]

requires:
  - phase: 72-07
    provides: "runtime-state migration (marker .legacy-state-migrated.json) and `state rekey`"
  - phase: 72-08
    provides: "migrations 0012/0013, W067, the deferral notice"
  - phase: 72-09
    provides: "migration 0014, dual CLAUDE.md markers, the global outside-block diff and --confirm"
  - phase: 72-10
    provides: "coexistence-guard hook and lib/coexistence.cjs"
  - phase: 72-13
    provides: "doc-refs legacy command forms gate and the mirror caveat for the dash form"
  - phase: 72-14
    provides: "the pointer plugin and gen-pointer-skills"
  - phase: 72-15
    provides: "doctor checks 15/16/27 and check 26's legacy branch"
  - phase: 72-16
    provides: "`aof-tools gh rebrand` and its user notes"
provides:
  - "assets/ao-icon.svg: the real gold AO emblem, byte-identical to https://aocyber.ai/images/ao-icon.svg (sha256 12f6c83e14bae0f19a07cf6585f0ffb6eda417bcc53b72159f5ffd7ce1765965), source recorded in assets/SOURCES.md; site/static/ao-icon.svg was already the same bytes"
  - "README header: the emblem sized by height (height=72) above an `<h1>AOForge</h1>` wordmark, plus an 'Upgrading from 2.x?' link to the migration guide"
  - "site header: emblem sized by height only (height=26, CSS width:auto) beside the AOForge wordmark; site/static/_redirects: /docs/reference/<old CLI>/ -> /docs/reference/aof-tools/ 301 inside a rename-guard ignore region"
  - "docs/MIGRATING-TO-AOFORGE.md and site/content/docs/getting-started/migrating-to-aoforge.md (weight 15, after Installation): name map, what keeps working, what moves by itself, the 11-step checklist, Check it, repositories with GitHub integration (gh rebrand), removing the shims"
  - "rename-guard.repo.test.cjs: MIGRATION_GUIDES and site/static/_redirects in IGNORE_REGION_FILES; test 3d (every entry is a tracked, scanned file) and 3e (each guide is clean only because of its regions, and one appended legacy word outside a region is exactly one finding, on a temp git copy)"
  - "scripts/aoforge-rename.cjs LIVE_DOCS includes the migration guide (so the guard scans it); doc-refs.repo.test.cjs SCAN_INCLUDE includes it (INST-01 gate)"
  - "USER-GUIDE: 'Renamed to AOForge (3.0.0)' section (shim layer legacy-names.cjs/compat.cjs, runtime-state migration, state rekey, command forms and the mirror caveat, pointer plugin, coexistence notice, doctor checks 15/16/27/26, GitHub artefacts, adopt-branch-conflict, ELEGACYDAEMON, override phrases); W066/W067 health-check table; migrations 0012-0014 rows and deferred migrations; global v4 block and outside-block --confirm; coexistence-guard hooks-table row; 'Rebranding a repository (gh rebrand)' subsection; Updating AOForge (pointer plugin); recovery rows"
  - "CLAUDE.md: state rekey (State operations), W066/W067 (Validation), gh rebrand (GitHub integration), 0012-0014 + global v4 (Upgrade), checks 15/16/27 + 26 legacy branch (Doctor), a 'Rename shims' bullet, sync-runtime's runtime-state migration (Hooks), the pointer plugin (Marketplace); the transition note is untouched"
  - "site/data/aoforge.json regenerated (hooks 23: coexistence-guard listed; gh-flush gets its purpose; dfTools lists `gh rebrand` and `state rekey`)"
affects: [72-18, 72-21, 72-22, 72-23, 72-24, 72-25]

tech-stack:
  added: []
  patterns:
    - "A live doc that must spell old names is listed in the guard's IGNORE_REGION_FILES, kept out of the codemod's docs-history SKIP (LIVE_DOCS) so the guard actually scans it, and pinned by a sensitivity test on a temp git copy"
    - "Legacy slash forms in user-facing docs are written with a placeholder (`/<old ns>:<name>`), which the doc-refs token regex cannot match, so the docs stay inside the INST-01 gate without doc-refs ignore regions"

key-files:
  created:
    - assets/ao-icon.svg
    - assets/SOURCES.md
    - docs/MIGRATING-TO-AOFORGE.md
    - site/content/docs/getting-started/migrating-to-aoforge.md
  modified:
    - README.md
    - site/layouts/partials/header.html
    - site/static/_redirects
    - site/content/docs/getting-started/installation.md
    - site/data/aoforge.json
    - docs/USER-GUIDE.md
    - CLAUDE.md
    - scripts/aoforge-rename.cjs
    - scripts/gen-docs-data.cjs
    - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
    - plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs

key-decisions:
  - "The repo guide is the source; the site page is the same body with Hugo front matter (title, weight 15, lede) instead of the H1"
  - "The migration guide is live documentation: added to the codemod's LIVE_DOCS and to doc-refs SCAN_INCLUDE, so both repo gates scan it"
  - "The site header emblem is sized by height only (the width attribute was dropped; the existing CSS already sets height 26px, width auto)"
  - "site/static/_redirects joins IGNORE_REGION_FILES: Cloudflare Pages `_redirects` takes `#` comments, which carry the region markers around the one old URL"

requirements-completed: [INST-02, INST-05]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

duration: 21min
completed: 2026-10-09
tokens_input: 41247864
tokens_output: 115167
tokens_cache_read: 40940329
tokens_cache_write: 307145
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 17: Identity, migration guide and the documentation of every new surface Summary

**The README and the docs site now show the real gold AO emblem (downloaded from aocyber.ai, sha256-verified, source recorded) with an AOForge wordmark; `docs/MIGRATING-TO-AOFORGE.md` and its site page give the full name map, the one-release shims, what migrates by itself, an 11-step checklist, `gh rebrand` per repository and the shim removal; USER-GUIDE and CLAUDE.md document every surface objective 72 added; the rename guard now scans the guide and proves its regions are what keep it clean.**

## Progress
- [x] Task 1: The real emblem and the identity on README and the site — bfa83ebb
- [x] Task 2: Migration guide (repo + site) inside guard ignore regions — 54387a6b (RED), cbf2bba1 (GREEN)
- [x] Task 3: USER-GUIDE, CLAUDE.md and the site data — 4b40672e

## What was built

- **Identity.**
  - `assets/ao-icon.svg` downloaded with `curl -fsSL` into an empty scratch directory from https://aocyber.ai/images/ao-icon.svg and copied unchanged. sha256 `12f6c83e14bae0f19a07cf6585f0ffb6eda417bcc53b72159f5ffd7ce1765965`, equal to the existing `site/static/ao-icon.svg`, so that file was left as is. The viewBox is 900×969.69 and the gold gradient (`#fce88d` to `#efb32c` plus its stops) is untouched.
  - `assets/SOURCES.md` records the file, source URL, download date and sha256, says the emblem is the web/UI mark (not the print lockup) and is sized by height, and notes that `terminal.svg` is GSD-baseline artwork, not a brand asset.
  - README opens with `<img src="assets/ao-icon.svg" alt="AO Cyber Systems" height="72">` and `<h1>AOForge</h1>`. The tagline, badges and install block are kept. A new line links the migration guide for 2.x users.
  - Site header: `<img src="/ao-icon.svg" ... height="26">` (width dropped; `main.css` already has `.brand img { height: 26px; width: auto; }`), so the rendered box is 24×26 (ratio 0.923; 0.928 expected, rounding). The home hero lede, button and footer already said AOForge.
  - `site/static/_redirects`: `/docs/reference/<old CLI>/  /docs/reference/aof-tools/  301`, the old path inside `# rename-guard:ignore-start/-end` comments.
- **Migration guide** (`docs/MIGRATING-TO-AOFORGE.md`, and the same body at `site/content/docs/getting-started/migrating-to-aoforge.md` with front matter, weight 15 so it sits after Installation):
  - Name map: 21 rows (product, repo, plugin, slash commands, pre-plugin command forms, agent types, CLI, runtime home, env vars, planning dir, config key, block markers, banner, user dot dir, watch daemon, adopt branch, labels and markers, check contexts, checks workflow and caller, App variable and secret, Pages project).
  - What keeps working: the pointer plugin (forwarding, the 6 manual-only commands, the notice), env aliasing, the planning-dir fallback (W066), the config key (W067), old block markers, old agent types, old GitHub artefacts (labels, markers, dual check contexts), old user dot files, the old adopt branch, old ignore lines. Plus what does not carry over: the old override phrases, the old CLI path, a running legacy watch daemon (`ELEGACYDAEMON`).
  - What moves by itself: the runtime-state migration (copy and move split, marker, run once), the legacy df-* install, the global block, the coexistence notice; then 0012/0013/0014/0007 per project, the 0012 deferral and the untracked-files caveat (72-08 hand-off).
  - What you do: install (marketplace update, install), restart, disable the old plugin, replace a watch login service, review then `upgrade --global --confirm`, `doctor --global --fix`, rename `DEVFLOW_*`, update scripts, open each project, rebrand each GitHub repository, `state rekey` for a moved checkout.
  - Check it: `doctor --global`, `doctor`, `validate health`, with a findings table for checks 15/16/27/26 and W066/W067.
  - Repositories with GitHub integration: flush the outbox first, dry run, what each section rewrites (including the destructive label merge), what is never rewritten, apply and resume, the App variable and secret set by hand, admin for rulesets, what `gh rebrand` does not cover, and the 0011-backfill workaround (rebrand before resuming, or finish on the old plugin).
  - Removing the shims: what goes in the release after 3.0.0 and what to finish first.
  - Every legacy spelling sits inside a rename-guard ignore region. Legacy slash forms are written as `/<ns>:<name>` placeholders, which the doc-refs token regex cannot match, so the guide passes the INST-01 gate.
- **Guards.** `rename-guard.repo.test.cjs` lists both guides and `_redirects` in `IGNORE_REGION_FILES`, with tests 3d and 3e (see TDD Evidence). `scripts/aoforge-rename.cjs` adds the guide to LIVE_DOCS (the docs-history SKIP otherwise hides it from the guard). `doc-refs.repo.test.cjs` adds it to SCAN_INCLUDE.
- **USER-GUIDE / CLAUDE.md**: every surface listed under provides. Discoverability: the README line, a line on the site installation page, the TOC entry and recovery rows.
- **Site data**: `gen-docs-data.cjs` gains HOOK_DOCS entries for `coexistence-guard.js` and `gh-flush.js` (it was listed under "Other" with no purpose); `site/data/aoforge.json` regenerated.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: emblem and identity | `shasum -a 256 assets/ao-icon.svg site/static/ao-icon.svg && rg -n "ao-icon.svg" README.md site/layouts/partials/header.html && rg -n "aof-tools" site/static/_redirects` | 0 (both `12f6c83e…5965`; README:3, header:5; _redirects:3,8) | PASS |
| 1: site build | `hugo --source site --minify` (hugo v0.167.0) | 0 | PASS |
| 1: browser | Playwright on `hugo server -p 8091`: header shows the gold emblem + "AOForge"; emblem box 24×26 | n/a | PASS |
| 2: guard + doc-refs | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs` | 0 (38/38) | PASS |
| 2: site page | built HTML of the migration page: 7 h2, 3 tables, 11 checklist items in one `<ol>`, 6 code blocks, 0 unescaped placeholders; rendered after Installation in the nav | n/a | PASS |
| 3: gates | `node --test rename-guard.repo.test.cjs doc-refs.repo.test.cjs dispatch-completeness.test.cjs hook-inventory.test.cjs scripts/aoforge-rename.legacy.test.cjs` | 0 (104/104) | PASS |
| 3: TRD verification | `rg -n -e "state rekey" -e "gh rebrand" -e "W066" -e "W067" docs/USER-GUIDE.md CLAUDE.md`; `rg -n "aoforge@aocyber" docs/MIGRATING-TO-AOFORGE.md` | 0 (USER-GUIDE 20 lines, CLAUDE.md 4; guide lines 24, 136) | PASS |
| 3: site data | `node scripts/gen-docs-data.cjs` then `hugo --source site --minify` | 0 (hooks=23; the hooks page lists coexistence-guard.js) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` (3d: both guides "not tracked or not scanned"; 3e: ENOENT for both) | 1 | FAIL (correct) |
| GREEN | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS (correct) |

Sensitivity is part of 3e: with the region markers removed each guide has findings, and one appended legacy word outside every region is exactly one finding on its line. doc-refs on the guide: 0 findings as written; a stray old-namespace build command appended gives one `prefix` finding.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (Task 1) | `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 0: 11,938 tests, 11,904 pass, 34 skipped, 0 fail | PASS |
| test (Task 2) | same | 1: 11,941 tests, 11,905 pass, 35 skipped, 1 fail = E2E1 roadmap drift on 72-17 itself (this TRD's in-progress SUMMARY checkpoint; known baseline, clears with `roadmap update-job-progress`) | PASS (baseline) |
| test (Task 3) | same | 1: 11,941 tests, 11,905 pass, 35 skipped, 1 fail = the same E2E1 72-17 drift | PASS (baseline) |
| build | `hugo --source site --minify` | 0 | PASS |

`npm test` was not run: it includes `micro.test.cjs`, which the dispatch says to exclude.

## Estimate

`estimate trd 72-17`: 10 min (P90 19 min), $4.07 (P90 $6.72), 3 tasks, confidence low. `estimate start` was not re-run (the wave run state was already recorded). Measured: 21 min (03:10:03Z to 03:30:45Z), just over P90. The three full-suite runs (about 2.5 min each) and reading the hand-offs of twelve SUMMARYs took most of the overrun.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `site/static/_redirects` added to IGNORE_REGION_FILES in Task 1**
- **Found during:** Task 1
- **Issue:** the redirect spells the old CLI URL inside an ignore region (as the TRD asks), but test 3c fails any region outside `IGNORE_REGION_FILES`, and the TRD only planned the guard edit in Task 2.
- **Fix:** listed `_redirects` in Task 1's commit, with a comment.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
- **Commit:** bfa83ebb

**2. [Rule 3 - Blocking] The migration guide added to the codemod's LIVE_DOCS**
- **Found during:** Task 2
- **Issue:** `docs/**` other than LIVE_DOCS is the codemod's docs-history SKIP, which the guard shares. Without the change the guide would never be scanned, and "a legacy name outside an ignore region still fails the guard" could not hold.
- **Fix:** `scripts/aoforge-rename.cjs` LIVE_DOCS (and its two descriptions) include `docs/MIGRATING-TO-AOFORGE.md`. Test 3d pins it: every IGNORE_REGION_FILES entry must be in the scan set.
- **Files modified:** scripts/aoforge-rename.cjs
- **Commit:** cbf2bba1

**3. [Rule 2 - Missing gate] The guide added to doc-refs SCAN_INCLUDE**
- **Found during:** Task 2
- **Issue:** the INST-01 gate scanned only the site copy. The repo copy is a live doc, not a dated record.
- **Fix:** one SCAN_INCLUDE entry and the "Not scanned by design" comment updated.
- **Files modified:** plugins/aoforge/aoforge/bin/lib/doc-refs.repo.test.cjs
- **Commit:** cbf2bba1

**4. [Rule 2 - Discoverability] Links to the guide from the README and the site installation page**
- **Found during:** Task 2
- **Issue:** the success criterion is that a reader of the README or the site knows how to move over. Before this, neither linked the guide.
- **Fix:** one line each. Neither spells an old name.
- **Files modified:** README.md, site/content/docs/getting-started/installation.md
- **Commit:** cbf2bba1

**5. [Rule 1 - Bug] A nonexistent npm package named in two docs**
- **Found during:** Task 3
- **Issue:** the codemod had rewritten the historic npm installer's package name in the README and in the site installation page ("Migrating from a previous npm install"). The result was a package that never existed. The real one carries the old name.
- **Fix:** described the old installer without naming the package ("the old `npx` installer, from before it shipped as a plugin"), so no old name is needed outside a region.
- **Files modified:** README.md, site/content/docs/getting-started/installation.md
- **Commit:** 4b40672e

**6. [Rule 2 - Site data] HOOK_DOCS entries for coexistence-guard and gh-flush**
- **Found during:** Task 3
- **Issue:** regenerating as-is would list `coexistence-guard.js` under "Other" with no purpose (72-10 hand-off). `gh-flush.js` was already listed that way.
- **Fix:** two HOOK_DOCS entries in `scripts/gen-docs-data.cjs`, then regenerated. The data diff is only these entries, the hook count and the `rebrand`/`rekey` subcommands.
- **Files modified:** scripts/gen-docs-data.cjs, site/data/aoforge.json
- **Commit:** 4b40672e

**7. [Rule 1 - Gate] Core Tool wording adjusted for dispatch-completeness**
- **Found during:** Task 3
- **Issue:** `dispatch-completeness` test 5 reads the first word of every backtick span in a Core Tool bullet as a command. Five new spans (`legacy-planning-dir`, `legacy-config-key`, `needs admin`, `git mv`, `upgrade-deferred-0012`) failed it.
- **Fix:** wrote those five as plain text. The test is unchanged.
- **Files modified:** CLAUDE.md
- **Commit:** 4b40672e

## Discovered commands

| Key | Command | Evidence |
|---|---|---|
| docs build | `hugo --source site --minify` (after `node scripts/gen-docs-data.cjs`) | package.json `docs:build`, site/hugo.toml comment |
| docs preview | `hugo server --source site -p 8091` | package.json `docs:serve` (port 8091) |

## Hand-off

- **72-18 (release 3.0.0)**: link the CHANGELOG 3.0.0 entry to `docs/MIGRATING-TO-AOFORGE.md`. After the version bump, run `node scripts/gen-docs-data.cjs`: the site header and home hero read `site/data/aoforge.json`, which still says v2.15.0.
- **72-21 / 72-22**: the guide's "What you do" is the dogfood checklist. The order is install, restart, disable, `upgrade --global --raw`/`--confirm`, then `doctor --global --fix`, as the 72-07 and 72-15 hand-offs require. 72-22's prose rewrite should keep the guide, the USER-GUIDE rename section and the CLAUDE.md transition note consistent; the transition note is untouched.
- **72-24 (Pages project)**: the redirect lives in `site/static/_redirects`. The domain stays `devflow.cloud` (hugo.toml `baseURL` untouched).
- **Shim removal (the release after 3.0.0)**: the guide's "Removing the shims" section, the USER-GUIDE rename section and the CLAUDE.md "Rename shims" bullet describe the shims in the present tense. Update them with the removal. `_redirects` can keep its redirect.
- **Not changed**: the USER-GUIDE hooks table still lists `check-update.js` (an npm-era hook that is not in `hooks/`); that predates this TRD. `site/layouts/shortcodes/dftools.html` keeps its short name, which is not a guard token.

## Post-TRD Verification

- Auto-fix cycles used: 1 (dispatch-completeness wording)
- Must-haves verified: 5/5 (emblem + README wordmark sized by height with source; site header/home/footer + 301 redirect + hugo exit 0; migration guide covers every truth bullet; USER-GUIDE and CLAUDE.md document every new surface with the transition note kept; guard and doc-refs pass with the guide in ignore regions and in IGNORE_REGION_FILES)
- Gate failures: none beyond the known E2E1 baseline (72-17's own checkpoint)

## Self-Check: PASSED

- FOUND: assets/ao-icon.svg, assets/SOURCES.md, docs/MIGRATING-TO-AOFORGE.md, site/content/docs/getting-started/migrating-to-aoforge.md, site/static/_redirects, site/data/aoforge.json
- FOUND: bfa83ebb, 54387a6b, cbf2bba1, 4b40672e
- Both emblem copies: sha256 12f6c83e14bae0f19a07cf6585f0ffb6eda417bcc53b72159f5ffd7ce1765965, equal to the download
