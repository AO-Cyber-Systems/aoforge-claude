---
objective: 72-install-and-naming-cleanup
trd: "05"
subsystem: tooling
tags: [aoforge-rename, planning-dir, compat, legacy-fallback, W066]

requires:
  - phase: 72-02
    provides: "compat.cjs planningRoot/planningDirName/isLegacyPlanning/bothPlanningDirs/findProjectRoot; legacy-names.cjs NAMES/LEGACY"
  - phase: 72-03
    provides: "scripts/aoforge-rename.cjs --rules planning"
  - phase: 72-04
    provides: "the tree under AOForge names (plugins/aoforge, aof-tools.cjs)"
provides:
  - "Every aof-tools verb under bin/** resolves .aoforge/ first and a legacy .planning/ second; new projects get .aoforge/"
  - "planning-layout.legacy.test.cjs: the outside-in layout contract (aoforge, legacy, both, none; 48 tests)"
  - "__fixtures__/legacy-layout-fixtures.cjs planningProject({layout, git, files})"
  - "W066 legacy-planning-dir: validate health Check 21, the init plan/execute advisories, the validate help entry (lib/planning-layout.cjs)"
  - "compat.cjs: planningRel, PLANNING_DIR_NAMES, isPlanningDirName, planningDirLabel"
affects: [72-06, 72-08, 72-11, 72-21]

tech-stack:
  added: []
  patterns:
    - "A path relative to the root names the resolved directory: compat.planningRel(root, ...segments) (git pathspecs, --files, JSON output, changed lists)"
    - "A not-found message names both directories: compat.planningDirLabel() -> `.aoforge/ (or legacy .planning/)`"
    - "A scan, exclusion list or attribute line covers both names: compat.PLANNING_DIR_NAMES / isPlanningDirName"
    - "A copy keeps the source's directory name (backup, worktree provision, archive), so a legacy project never grows a second directory"
    - "A read of another branch or repository tries the new name, then the legacy one"
    - "Repo tests over this repository's planning tree use compat.planningRoot(REPO_ROOT)"
    - "Shared fixtures used by hook tests take setPlanningDir(name); the hook tests pin LEGACY.planningDir until 72-06"

key-files:
  created:
    - plugins/aoforge/aoforge/bin/lib/__fixtures__/legacy-layout-fixtures.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs
    - plugins/aoforge/aoforge/bin/lib/planning-layout.cjs
  modified:
    - "plugins/aoforge/aoforge/bin/** (codemod planning pass: 404 files rewritten, 329 residuals)"
    - plugins/aoforge/aoforge/bin/lib/compat.cjs
    - plugins/aoforge/aoforge/bin/lib/validate.cjs
    - plugins/aoforge/aoforge/bin/lib/init.cjs
    - plugins/aoforge/aoforge/bin/lib/help.cjs
    - "plugins/aoforge/aoforge/bin/lib/__fixtures__/flutter-ui-dogfood/.planning -> .aoforge (git mv)"
    - "plugins/aoforge/hooks/{classify-session,statusline,statusline-estimate,sync-runtime,todo-sync,upgrade-project}.test.js (tests only)"
    - scripts/estimate-window-eval.cjs
    - scripts/estimate-window-eval.test.cjs

key-decisions:
  - "Copies keep the source's planning-directory name (upgrade backup, workstreams provision, project-hygiene archive): planningRoot() on a fresh destination would have created .aoforge/ beside a legacy project"
  - "Migration 0010's store block follows the project's directory (planning-paths.gitignoreLines(dir)); its printed STORE_COMMIT_STEPS still names .aoforge/ and stays 72-08's"
  - "Merge-driver attributes carry a line pair per directory name, so a legacy project merges state.json the same way"
  - "Hooks resolve only the legacy directory until 72-06: tests that exercise a hook build the legacy layout (fixture switch setPlanningDir, or a legacy copy), and 72-06 removes those pins"
  - "W066 lives in its own module (planning-layout.cjs) shared by validate health Check 21 and the two init advisories; the both-layout wording follows the TRD (`both exist; the legacy one is ignored`)"
  - "Store-mode GitHub issue footers (gh-body.cjs, gh.cjs) keep the codemod's .aoforge/ text: the GitHub artefact rename is 72-11's"

requirements-completed: [INST-02, INST-03]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 2
  tdd_evidence: true
  test_pairing: true

duration: 53min
completed: 2026-10-08
tokens_input: 147217532
tokens_output: 265027
tokens_cache_read: 146602506
tokens_cache_write: 614224
token_model: "claude-opus-5-5"
tokens_source: "live"
---

# Objective 72 TRD 05: Libs resolve `.aoforge/` first, `.planning/` as fallback Summary

**The aof-tools libraries find a project's planning tree at `.aoforge/` (created for new projects) or, for one release, a legacy `.planning/`, proven by a 48-test outside-in contract over four layouts, and `validate health` / `init` name the migration with W066.**

## Progress
- [x] Task 1: Fixture builder: minimal planning trees in every layout — 812d378f
- [x] Task 2: Contract suite RED, planning pass over bin/**, residuals GREEN — 26c92021 (RED), 9ba85278 (GREEN)
- [x] Task 3: W066 in validate health and the init advisories — 7aa98814 (RED), 9583057a (GREEN)

## What was built

- **Fixture** `legacy-layout-fixtures.cjs`: `planningProject({ layout: 'aoforge'|'legacy'|'both'|'none', git, files })`
  -> `{ root, home, tmp, dir, layout, env, run, git, cleanup }`. Hand-typed PROJECT/ROADMAP/REQUIREMENTS/STATE/config
  and one objective with one TRD; the `both` legacy copy differs in one STATE.md line so a read shows which tree it
  came from; config sets `workflow.auto_advance: false` so `config-get` proves the file was read. Hermetic: fake HOME,
  TMPDIR inside the fixture (drafts land there), no `AOFORGE_*`/legacy-prefix variables, git with no system/global
  config and signing off.
- **Contract** `planning-layout.legacy.test.cjs` (48 tests, cases 1-8): reads, writes and `objective add` in layout
  aoforge; `init new-project` + `config-ensure-section` and `adopt scaffold` create `.aoforge/`; the eight read verbs
  in both single layouts plus a parity test (legacy output equals aoforge output with paths, repo keys and the W066
  advisory normalised); the six write verbs in both single layouts with "the other directory is never created";
  layout both reads and writes `.aoforge/` and leaves `.planning/` byte-identical; W066 cases 5-8.
- **Planning pass**: `scripts/aoforge-rename.cjs --rules planning --only plugins/aoforge/aoforge/bin --write`:
  `moves=0 rewrites=404 residuals=329`, same as its dry run. The 329 residuals were worked by category (below).
- **compat.cjs** gained `planningRel(root, ...segments)`, `PLANNING_DIR_NAMES`, `isPlanningDirName(name)` and
  `planningDirLabel()`; it still spells no legacy name and caches nothing.
- **Project-root discovery** goes through `compat.findProjectRoot`: estimate-run-store `findProjectRoot`,
  session-audit `findPlanningRoot` (per directory, keeping its cache), skill-active `findPlanningDir`, doctor-cli
  `resolveProject`.
- **W066** (`lib/planning-layout.cjs`, `legacyPlanningIssue(root)` / `advisoryLine(issue)`): legacy ->
  `legacy-planning-dir: this project still uses the legacy planning directory .planning/ instead of .aoforge/; AOForge
  reads it for one release (until the release after 3.0.0)`, fix ``Run `aof-tools upgrade --apply --only 0012` (or
  start a session: the upgrade hook moves it)``; both -> `.aoforge/ and .planning/ both exist; the legacy one is
  ignored`, fix "move anything you still need into .aoforge/, then remove the legacy directory". validate health
  Check 21 (warning, not repairable), both init commands push the one-line form, `aof-tools validate --help` lists it.
  This repository reports W066 now (expected until 72-21).

### Residuals, by category

| Category | Fix | Where (examples) |
|---|---|---|
| Relative paths for git and JSON output | `planningRel(root, ...)` | init.cjs (42 sites), objective/misc `directory`, config `path`, commit default `--files`, micro state files, doc-staleness pathspecs, todo-sync, roadmap milestone ops, upgrade/0001-0011 `changed` lists, adopt scaffold/report |
| `X_REL = '.aoforge/…'` constants joined with a root | per-root function or in-dir name + `planningRoot` | check-todos, dup-detect, decision-queue, gh-mapping, gh-wiki, roadmap-reconcile, skill-marker-health (`markerRel`), doctor checks 20/22/23/33, stack-profile/report, ui-metrics, migrations 0001/0002/0003/0006/0007/0009/0011 |
| Not-found messages | `planningDirLabel()` | planning-verbs (x8), planning-entity-verbs, planning-import, todo-sync, skill-active, micro, override, state, validate E001 + notes, workstreams, defaults-loader, doctor-cli, telemetry, upgrade-cli, migrate, calibrate-cli, flutter-ui-scope, 0001 |
| Scans, exclusions, attributes | both names | bash-write-gate, repo-state EXCLUDE, stack-detect SKIP_DIRS, merge-driver block + `strategyFor`, 0008 runtime-state pathspecs, doctor check 20 markers, adopt owned paths, misc `isPlanningPath`, token-usage prefixes, doctor 21/22 guards |
| Regex literal | built from both names with `escapeRegExp` | planning-audit `WRITE_OP_RE`, benchmark objective-file regex |
| Other branch / repository reads | new name, then legacy | init `_readStateBranch`, awareness branch scan, dup-detect peer branch, gh-check-cli remote config (contents API) |
| Copy destinations | keep the source's name | upgrade backup, workstreams provision, project-hygiene archive |
| Generated document text | the resolved name, threaded as a parameter | adopt STATE/CLAUDE.md overview/report, templates `@` context lines, validate regenerateState, workstreams STATE, stack init draft notes, flutter-ui bootstrap task |
| Human text naming no single location | left as the codemod's `.aoforge/` | help.cjs summaries, gh-* store messages, issue footers (72-11), planning-paths classify message, doctor titles, 0010 notes and STORE_COMMIT_STEPS (72-08) |

## Hand-off

- **72-06 (hooks and prose)**:
  - Remove the legacy pins once the hooks resolve both names: `setPlanningDir(LEGACY.planningDir)` in
    `hooks/{classify-session,statusline,statusline-estimate,todo-sync,upgrade-project}.test.js` (fixtures:
    upgrade, daemon-polish, classifier, project-state, todo-archive, gh-store); `legacyLayoutCopy` in
    `planning-verbs.e2e.test.cjs` test 6; `PLANNING = LEGACY.planningDir` in `summary-pairing.test.cjs`; the
    `planningDir: LEGACY.planningDir` project in `summary-worktree.test.cjs` test 2; the legacy scratch directory in
    `compat-entry.repo.test.cjs` test 8.
  - `state-merge-wiring.repo.test.cjs` tests 8 and 9 accept either name while the execute-objective prose says
    `.planning/`; tighten them to `NAMES.planningDir` after the prose pass.
  - `hooks/sync-runtime.test.js` and `statusline-estimate.test.js` now copy `compat.cjs` and `legacy-names.cjs` into
    their stub runtime (the libraries they copy require them).
- **72-08 (migrations)**: 0010's printed `STORE_COMMIT_STEPS` (a load-time constant 0011 dedupes on) still names
  `.aoforge/`; the block itself now follows the project's directory. 0012 is the id W066 names.
- **72-11**: store issue footers in gh-body.cjs/gh.cjs keep `.aoforge/objectives/<dir>/`.
- **72-21**: the repo tests resolve this repository's tree through `compat.planningRoot(REPO_ROOT)` and the gitignore
  repo gates through `planningDirName`, so the move needs no test edit.
- `aof-tools validate health` in this repository prints `fatal: path 'plugins/aoforge/.claude-plugin/plugin.json'
  does not exist in 'origin/main'` on stderr (a best-effort version probe against `origin/main`, which still has the
  pre-rename tree); present since 72-04, unrelated to this TRD.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture builder | `node -e "…planningProject({layout:l})…"` for aoforge, legacy, both, none | 0 (`.aoforge .git` / `.git .planning` / `.aoforge .git .planning` / `.git README.md`) | PASS |
| 2: contract + planning pass | `node --test plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs` && full suite | 0 (43/43); full suite 11,612 tests, 2 failures: E2E1 (transient) and one ENOTEMPTY temp-dir cleanup race in misc-commit-gate 6b that passes alone | PASS (baseline) |
| 2: done grep | `rg -n "path\.(join\|resolve)\([^)]*'\.planning'" plugins/aoforge/aoforge/bin -g '!*.test.cjs' -g '!__fixtures__'` | 1 (no output) | PASS |
| 3: W066 | `node --test planning-layout.legacy.test.cjs validate.test.cjs init.test.cjs` | 0 (191/191) | PASS |
| 3: this repo | `node plugins/aoforge/aoforge/bin/aof-tools.cjs validate health --raw` | 0, W066 legacy-planning-dir present; `state load --raw` state_exists=true; no `.aoforge/` created | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test plugins/aoforge/aoforge/bin/lib/planning-layout.legacy.test.cjs` | 1 (43 tests: 27 fail = layouts aoforge, both, none and parity; 16 pass = legacy) | FAIL (correct) |
| GREEN (Task 2) | same | 0 (43 pass) | PASS (correct) |
| RED (Task 3) | same file with cases 5-8 | 1 (48 tests: cases 5, 6, 7 fail; 8 passes as the no-regression guard) | FAIL (correct) |
| GREEN (Task 3) | same | 0 (48 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test 'plugins/aoforge/**/!(micro).test.cjs' 'plugins/aoforge/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 before the state update: 11,617 tests, 11,580 pass, 35 skipped (baseline 35), 2 fail = E2E1 (ROADMAP drift while this SUMMARY exists; `roadmap update-job-progress` clears it) and gh-seam test 22 (fixed in 9583057a: `planning-layout.cjs` added to the guarded planning modules, 11/11) | PASS (baseline) |

Baseline at 09fc4a2c: 11,565 tests, 11,530 pass, 0 fail, 35 skipped. `npm test` itself was not run (it includes
`micro.test.cjs`, which hangs on commit signing; 72-04 ran the suite the same way).

## Discovered commands

None. The test command came from the stack profile and the TRD.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hook tests consume the fixtures the planning pass renamed**
- **Found during:** Task 2, first full suite (107 failures; 57 in hooks/*.test.js)
- **Issue:** the codemod rewrote the shared fixtures under bin/lib/__fixtures__ to `.aoforge/`, but the hooks (72-06) still look only for `.planning/`, so classify-session, statusline, todo-sync and upgrade-project saw no project.
- **Fix:** `setPlanningDir(name)` on the six shared fixtures (default `.aoforge`); each hook test pins `LEGACY.planningDir` at load. Bin tests that compare a hook reader (summary-pairing, summary-worktree test 2, planning-verbs e2e test 6's gate) run that comparison on the legacy layout. Hook sources untouched.
- **Commit:** 9ba85278

**2. [Rule 1 - Bug] Copies would have split a legacy project**
- **Issue:** `planningRoot(dest)` on a fresh destination returns `.aoforge`, so a backup, a provisioned workstream worktree and an archive of a legacy project would have created a second directory name.
- **Fix:** the copy keeps the source's directory name (`path.basename(planning)`).
- **Commit:** 9ba85278

**3. [Rule 1 - Bug] Repo tests silently skipped against this repository**
- **Found during:** Task 2 (skips rose from 35 to 73)
- **Issue:** after the rename, tests reading this repository's tree (requirements-agreement, validate-requirements 9, stack-drafter-golden, stack-verify CLI, gh H1-H3, migrate C1/C3, frontmatter 43-03) looked for `.aoforge/` and skipped or failed; stack-drafter-fleet skipped all 33 fleet repos (their STACK.md is under `.planning/`).
- **Fix:** `compat.planningRoot(REPO_ROOT)`; the fleet test reads `HEAD:.aoforge/STACK.md`, then the legacy path; awareness G1 and gitignore-markers 7 check the line for this repository's directory. Skips back to 35.
- **Commit:** 9ba85278

**4. [Rule 3 - Blocking] Module hygiene and export locks**
- **Issue:** the codemod's `require('./compat.cjs')` broke four require allowlists (estimate-run-store, gh-outbox, planning-ledger, planning-mode) and the regex-escape guard flagged a hand-rolled escape in compat.
- **Fix:** allowlists name `./compat.cjs` (it requires only fs, path and legacy-names.cjs); the regex helper moved out of compat (benchmark builds its regex with `text-escape.escapeRegExp`); dup-detect keeps its locked 19-entry export surface (check-todos derives the log file name).
- **Commit:** 9ba85278

**5. [Rule 3 - Blocking] Outside bin/**: scripts/estimate-window-eval.cjs**
- **Issue:** the script read `.planning/` literally while its fixtures (from bin) now write `.aoforge/`.
- **Fix:** it resolves the snapshot's directory through compat and cuts into the snapshot's own name.
- **Commit:** 9ba85278

**6. [Rule 1 - Bug] Sort-order and message expectations**
- Tests pinned the old sort order (`.aoforge/…` now sorts before `.gitignore`: doctor-git, doctor 8a, misc-commit 7c) or the old not-found text (audit-cli, defaults-loader, todo-sync, telemetry, telemetry-cli, validate, validate-requirements, merge-driver 17): expectations now follow the code; merge-driver tests 12-14 expect the two-name attribute block.
- **Commit:** 9ba85278

**7. [Rule 3 - Blocking] A new `planning-*.cjs` must be guarded**
- **Issue:** gh-seam test 22 requires every `planning-*.cjs` to be in its guarded list.
- **Fix:** `planning-layout.cjs` added (it never reaches GitHub).
- **Commit:** 9583057a

### Choices the TRD left open, or where it was inexact

- **Case 2:** `init new-project` creates nothing (it reports `planning_exists`); the test checks that, then that
  `config-ensure-section` (the verb that writes the first config) creates `.aoforge/config.json`.
- **Case 3** splits into absolute checks per layout (legacy passed at RED) and a parity test against layout aoforge.
- **Case 4** runs the same write verbs in layout aoforge too, so the RED shows the new default failing.
- **The fixture** extends the TRD's config with `workflow.auto_advance: false` and adds `tmp`, `env`, `run`, `git`.
- **The flutter-ui-dogfood fixture tree** was tracked as `__fixtures__/flutter-ui-dogfood/.planning/`; the pass
  renames content, not paths, so it was moved with `git mv` to match its renamed test.
- **0010's block** now follows the project's directory, although the TRD calls the block 72-08's: leaving it at
  `.aoforge/*` while discovery read the legacy tree would have made a legacy store project verify a block that
  ignores nothing. The printed commit steps stay for 72-08.
- **compat helper tests 17-19** were written before the helpers but not run on their own before implementing.
- One split commit was not possible: the mechanical pass alone had 107 failures, so Task 2's GREEN is one commit.

## Post-TRD Verification

- Auto-fix cycles used: 2 (hook-fixture pin; gh-seam guard)
- Must-haves verified: 7/7 — layout aoforge verbs and new projects (cases 1-2); legacy verbs write under `.planning/`
  and create no `.aoforge/` (cases 3-4, 6b); W066 legacy and both, none for aoforge (cases 5, 7, 8); init advisories
  (case 6); no `path.join(<root>, '.planning'` in non-test bin code and root discovery through compat.findProjectRoot;
  repo tests use `compat.planningRoot(REPO_ROOT)` and the include-based gates assert neither name is scanned
  (rg-flag-guard 3, a new planning-writes test); full suite at baseline.
- Gate failures: none beyond the E2E1 baseline.

## Self-Check: PASSED

- Files found: __fixtures__/legacy-layout-fixtures.cjs, planning-layout.legacy.test.cjs, planning-layout.cjs, __fixtures__/flutter-ui-dogfood/.aoforge/objectives/99-sample/99-01-TRD.md; validate.cjs carries W066 (Check 21).
- Commits found: 812d378f, 26c92021, 9ba85278, 7aa98814, 9583057a.
- `git status --porcelain --untracked-files=no` empty after the last task commit.
