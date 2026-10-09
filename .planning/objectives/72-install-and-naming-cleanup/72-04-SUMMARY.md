---
objective: 72-install-and-naming-cleanup
trd: "04"
subsystem: tooling
tags: [aoforge-rename, rename-guard, compat, git-mv, env-alias]

requires:
  - phase: 72-02
    provides: "legacy-names.cjs (NAMES/LEGACY) and compat.cjs aliasLegacyEnv"
  - phase: 72-03
    provides: "scripts/aoforge-rename.cjs names pass, PRESERVE and SKIP"
provides:
  - "The source tree under AOForge names: plugins/aoforge/ (runtime aoforge/), aof-tools.cjs, aoforge-watch.cjs, aoforge-checks.yml, site/data/aoforge.json, /aoforge: and aoforge: everywhere outside history"
  - "rename-guard.repo.test.cjs: the INST-02 repo gate (legacy product word, CLI name, banner) built from LEGACY, sharing SKIP/PRESERVE with the codemod"
  - "compat-entry.repo.test.cjs: every entry point aliases the legacy env prefix before it reads the environment"
  - "CLAUDE.md transition note (rename-guard ignore region) for the rest of objective 72"
affects: [72-05, 72-06, 72-07, 72-10, 72-11, 72-12, 72-13, 72-17, 72-21, 72-22]

tech-stack:
  added: []
  patterns:
    - "Repo gate shares its definition with the codemod: the guard requires scripts/aoforge-rename.cjs for SKIP and PRESERVE and legacy-names.cjs for the tokens"
    - "Entry points call require(<compat>).aliasLegacyEnv() as the first statement after the core requires"
    - "A test that pins historical data (planning tree, git history) builds the old spelling from LEGACY"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs
    - plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs
  modified:
    - "plugins/devflow/** -> plugins/aoforge/** (git mv, 940 detected renames)"
    - plugins/aoforge/aoforge/bin/aof-tools.cjs
    - plugins/aoforge/aoforge/bin/aoforge-watch.cjs
    - "plugins/aoforge/hooks/*.js (20 registered hooks incl. statusline.js)"
    - plugins/aoforge/hooks/changelog-on-tag.js
    - plugins/aoforge/aoforge/bin/lib/doc-refs.cjs
    - scripts/aoforge-rename.cjs
    - scripts/aoforge-rename.legacy.test.cjs
    - plugins/monorepo-standards/skills/monorepo-doctor/lib/doctor.js
    - .gitignore
    - CLAUDE.md
    - package.json
    - .claude-plugin/marketplace.json

key-decisions:
  - "The two built-in inventories (docs/built-in-sweep.md, docs/built-in-integration-status.md) are live docs, not history: repo tests check every path they cite, so the codemod's docs-history SKIP now exempts them (LIVE_DOCS), with a test"
  - "changelog-on-tag reads the plugin manifest under the new directory, then the legacy one, so a tag on a pre-rename commit is still version-checked"
  - "The planning tree keeps its history wording: gh.test H1/H2 expect the repo name of the time, built from LEGACY.repo"
  - "The rename-guard scans tracked paths as well as content, and only CLAUDE.md and docs/USER-GUIDE.md may hold an ignore region"

requirements-completed: [INST-02]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 2
  tdd_evidence: true
  test_pairing: true

duration: 40min
completed: 2026-10-08
tokens_input: 45644712
tokens_output: 94095
tokens_cache_read: 45023547
tokens_cache_write: 620777
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 04: Apply the names rename Summary

## Progress
- [x] Task 1: The rename guard, RED against today's tree — bb8f1c40
- [x] Task 2: Run the names codemod, fix manifests and residuals — a15e2af5
- [x] Task 3: Entry points alias legacy env; CLAUDE.md transition note — 6fc02a5a (RED), 6a5d912c (GREEN), f6b958c6 (CLAUDE.md note)

## What was built

- **The rename, in one commit (a15e2af5).** `node scripts/aoforge-rename.cjs --rules names --write` on a clean tree:
  `moves=14 rewrites=825 residuals=2`, the same counts as 72-03's dry run. `plugins/devflow` -> `plugins/aoforge`,
  runtime `devflow/` -> `aoforge/`, `df-tools.cjs` -> `aof-tools.cjs`, `devflow-watch.cjs` -> `aoforge-watch.cjs`,
  `devflow-checks.yml` -> `aoforge-checks.yml`, `templates/github/devflow.yml` -> `aoforge.yml`,
  `site/data/devflow.json` -> `aoforge.json`, the site reference page, two lib tests, one fixture, one cassette. The
  commit carries 940 detected renames; `git log --follow plugins/aoforge/aoforge/bin/aof-tools.cjs` reaches 69-05 and
  earlier.
- **Manifests** were right from the codemod: package `@ao-cyber-systems/aoforge-cc`, `npm test` globs
  `plugins/aoforge/**`, repository/homepage/bugs `aoforge-claude`; lockfile name; marketplace plugin `aoforge` with
  `source: ./plugins/aoforge`; plugin.json `name: aoforge` and "AOForge builds it". No hand edit was needed.
- **Manual residuals:** `.gitignore` keeps `.devflow-handoff/` and `.planning/.devflow-notices.json` beside the new
  lines; monorepo-doctor's two skip lists gain `'.aoforge'` beside `'.devflow'` and `'.planning'`.
- **rename-guard.repo.test.cjs** (10 tests): scan set = `git ls-files` minus the codemod's SKIP minus ALLOW (6 entries);
  tokens are LEGACY.slug (any case), LEGACY.cli (any case) and LEGACY.banner after masking the codemod's PRESERVE
  (global, file-scoped and the doctor's manual spans); paths are scanned as well as content; binary and non-UTF-8 files
  are skipped like the codemod skips them. Region markers are built from parts, so the guard's own source holds none.
  `IGNORE_REGION_FILES` = CLAUDE.md, docs/USER-GUIDE.md. `doc-refs.cjs` now exports its glob helper (`globToRegExp`)
  for the ALLOW matching.
- **compat-entry.repo.test.cjs** (25 tests): the entry-point list is derived from hooks.json and the plugin.json
  statusLine (20 hooks) plus `aof-tools.cjs` and `aoforge-watch.cjs`; each must call `aliasLegacyEnv(` before its first
  non-comment `process.env`. Test 8 spawns gate-edits.js in a scratch project with an environment stripped of both
  prefixes: denied without a skip variable, allowed with only the legacy one.
- **Entry points:** `aof-tools.cjs` and `aoforge-watch.cjs` call `require('./lib/compat.cjs').aliasLegacyEnv()` before
  any lib require; every registered hook calls it right after its core requires, inside a `try` that tolerates only
  `MODULE_NOT_FOUND` (the hooks' fail-open contract for a stub plugin tree).
- **CLAUDE.md** opens with the transition note inside a `rename-guard:ignore-start/-end` region (no slash command).

## Hand-off

- **72-05/06 (planning pass):** compat-entry test 8 builds its scratch project with a literal `.planning`; the planning
  pass renames it like any test literal. The `.gitignore` legacy lines and monorepo-doctor entries stay.
- **72-17:** the old site URL `/docs/reference/df-tools/` needs its 301 (not added here: the guard would flag it, and
  72-17 owns the redirect).
- **72-12:** `.devflow-notices.json` is now `.aoforge-notices.json` in the hooks and the planning-writes allowlist; the
  installed 2.15.0 runtime still writes the old name (both are gitignored).
- **Git rename detection:** 10 of the commit's paths fall under git's 50% similarity default and show as delete+add in
  `git show --stat` (small files that are mostly names: three gh-pull cassettes, ui-spec pattern catalogue,
  doc-surfaces.test.cjs, two templates, gh-sync and help SKILL.md, the site reference page). At `-M25%` all but
  `templates/global-claude-md.md` pair. Git stores no renames; the one-commit instruction makes this unavoidable.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: rename guard RED | `node --test plugins/devflow/devflow/bin/lib/rename-guard.repo.test.cjs` | 1 (8 pass, 2 fail: test 2 with 14,696 findings, test 1 because `aof-tools.cjs` did not exist yet) | PASS (expected RED) |
| 2: names codemod | `node --test .../rename-guard.repo.test.cjs` (10/10) && full suite (11,540 tests, 1 fail = E2E1) && `claude plugin validate plugins/aoforge` (0, warnings only) && `claude plugin validate .` (0) && `git status --porcelain` (only the 9 pre-existing untracked `.planning/**/.gitkeep`) | 0 / baseline | PASS |
| 3: entry alias + note | `node --test .../compat-entry.repo.test.cjs .../rename-guard.repo.test.cjs .../doc-refs.repo.test.cjs` | 0 (49 pass) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `node --test plugins/devflow/devflow/bin/lib/rename-guard.repo.test.cjs` | 1 (tests 1-2 fail; 3-6 and 5b pass) | FAIL (correct) |
| GREEN (Task 1, via Task 2) | `node --test plugins/aoforge/aoforge/bin/lib/rename-guard.repo.test.cjs` | 0 (10 pass) | PASS (correct) |
| RED (codemod rule) | `node --test --test-name-pattern "live built-in inventories" scripts/aoforge-rename.legacy.test.cjs` | 1 | FAIL (correct) |
| GREEN (codemod rule) | `node --test scripts/aoforge-rename.legacy.test.cjs` | 0 (51 pass) | PASS (correct) |
| RED (Task 3) | `node --test plugins/aoforge/aoforge/bin/lib/compat-entry.repo.test.cjs` | 1 (21 entry points fail test 7, 8b fails; 2 pass) | FAIL (correct) |
| GREEN (Task 3) | same | 0 (25 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'` | 1: 11,565 tests, 11,530 pass, 1 fail, 34 skipped. The one failure is `E2E1 reconcile dry-run` (ROADMAP drift while the 72-04 SUMMARY exists), the 71-05 baseline; `roadmap update-job-progress` clears it | PASS (baseline) |
| build | `claude plugin validate plugins/aoforge && claude plugin validate .` | 0 and 0 (warnings only: unknown `statusLine` field, unquoted `${CLAUDE_PLUGIN_ROOT}` in 21 hook commands; all pre-existing) | PASS |
| extra | `hugo --source site --minify --destination <scratchpad>` | 0 (56 pages; templates read `site.Data.aoforge`) | PASS |

`npm test` itself was not run: it includes `micro.test.cjs`, which hangs on commit signing (TRD gotcha); its script now globs `plugins/aoforge/**`.

## Discovered commands

None. The test command came from the stack profile and the TRD.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The codemod treated the two built-in inventories as history**
- **Found during:** Task 2, first full suite (builtin-status test 5, builtin-sweep test 8b: 121 rows citing `plugins/devflow/...`)
- **Issue:** SKIP `docs-history` exempted every `docs/` file but USER-GUIDE.md, but `docs/built-in-sweep.md` and `docs/built-in-integration-status.md` are live inventories that repo tests pin to the tree.
- **Fix:** `LIVE_DOCS` in `scripts/aoforge-rename.cjs` (test first), then the codemod re-run with `--only` on those two files (`rewrites=2`). Not a full reset: a full re-run would have renamed the `.gitignore` legacy lines again, and the codemod is idempotent elsewhere (a full dry run then listed only `.gitignore` and the two docs).
- **Files modified:** scripts/aoforge-rename.cjs, scripts/aoforge-rename.legacy.test.cjs, docs/built-in-sweep.md, docs/built-in-integration-status.md
- **Commit:** a15e2af5

**2. [Rule 1 - Bug] changelog-on-tag skipped the version check on a pre-rename commit**
- **Found during:** Task 2 (changelog-on-tag case 17: tagging 556f8d3 no longer denied)
- **Issue:** the hook read only `plugins/aoforge/.claude-plugin/plugin.json`; on a commit from before the rename that file is absent and the whole manifest check silently passed.
- **Fix:** read the new path, then the legacy one (`PLUGIN_MANIFESTS` from NAMES/LEGACY); the mismatch line names the path read. Case 17 expects the legacy marketplace entry name, built from LEGACY.
- **Files modified:** plugins/aoforge/hooks/changelog-on-tag.js, plugins/aoforge/hooks/changelog-on-tag.test.js
- **Commit:** a15e2af5

**3. [Rule 1 - Bug] Tests pinned to sort order or history broke on the new names (hand residuals, 3 files)**
- `aoforge-workflows.repo.test.cjs` 5e and `planning-writes.audit.test.js` self-check: expected arrays listed in the old sort order; reordered.
- `gh.test.cjs` H1/H2 read objective 0's OBJECTIVE.md from the planning tree, which keeps the repository name of the time; the expectation is now built from `LEGACY.repo`.
- **Commit:** a15e2af5

**4. [Rule 1 - Bug] The hooks' alias line broke their fail-open contract**
- **Found during:** Task 3 GREEN full suite (12 failures: 10-runtime-mirror, 11-12-install, doctor.e2e, gate-bash-writes "libs missing", gate-skill-requires "copied alone", sync-runtime: `Cannot find module '../aoforge/bin/lib/compat.cjs'`)
- **Issue:** tests copy a hook into a stub plugin tree without `aoforge/bin/lib`; the hooks must then exit 0. A bare `require(...).aliasLegacyEnv()` (the TRD's example line) throws.
- **Fix:** in hooks only, `try { require('../aoforge/bin/lib/compat.cjs').aliasLegacyEnv(); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }`, still at module scope after the core requires. `aof-tools.cjs` and `aoforge-watch.cjs` keep the plain line.
- **Commit:** 6a5d912c

### Choices the TRD left open, or where it was inexact

- **Test 5b positive control:** the TRD's `docs/x.md` is under the codemod's `docs-history` SKIP, so it cannot yield a finding. The scratch repo keeps `docs/x.md` (0 findings) and adds the live `docs/USER-GUIDE.md` as the control (1 finding).
- **RED of Task 1:** test 1 fails as well as test 2, because its anchor `plugins/aoforge/aoforge/bin/aof-tools.cjs` is the post-rename path.
- **IGNORE_REGION_FILES** started as `['docs/USER-GUIDE.md']`; Task 3 added `CLAUDE.md`, as the TRD orders.
- **Guard extras:** it scans tracked paths too (`file:0`), an end marker without a start throws, and the failure message lists the first 300 findings.
- **`doc-refs.cjs`** now exports `globToRegExp` (the TRD asked to reuse its glob helper, which was private).
- Hand fixes: 7 files (well under the 30-file stop).

## Post-TRD Verification

- Auto-fix cycles used: 2 (the codemod rule re-run; the fail-open alias form)
- Must-haves verified: 6/6. `git log --follow` on aof-tools.cjs reaches 69-05 and earlier; the guard passes (planning tree exempt under both names through SKIP, ALLOW entries live and reasoned); the full suite is at the 71-05 baseline and `npm test` globs `plugins/aoforge/**`; marketplace `aoforge`/`./plugins/aoforge`, plugin.json `name: aoforge`, both validations exit 0; every entry point aliases before reading env and gate-edits honours the legacy skip variable; CLAUDE.md opens with the transition note in a guard ignore region.
- Verification block: `rg -n -i devflow plugins/aoforge -g '!*legacy*'` prints only the preserved `devflowops` mentions and the quoted fleet repo names; `node plugins/aoforge/aoforge/bin/aof-tools.cjs state load --raw` works and reads `.planning/`.
- Gate failures: none beyond the E2E1 baseline.

## Self-Check: PASSED

- Files found: rename-guard.repo.test.cjs, compat-entry.repo.test.cjs, aof-tools.cjs, aoforge-watch.cjs, .github/workflows/aoforge-checks.yml, site/data/aoforge.json.
- Commits found: bb8f1c40, a15e2af5, 6fc02a5a, 6a5d912c, f6b958c6.
- `git status --porcelain --untracked-files=no` empty after the last task commit.
