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
---

# Objective 72 TRD 04: Apply the names rename Summary

## Progress
- [x] Task 1: The rename guard, RED against today's tree — bb8f1c40
- [x] Task 2: Run the names codemod, fix manifests and residuals — a15e2af5
- [x] Task 3: Entry points alias legacy env; CLAUDE.md transition note — 6fc02a5a (RED), 6a5d912c (GREEN), (this commit) (CLAUDE.md note)

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
