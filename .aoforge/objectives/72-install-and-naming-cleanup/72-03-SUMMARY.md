---
objective: 72-install-and-naming-cleanup
job: "03"
subsystem: tooling
tags: [aoforge-rename, codemod, git-mv, inventory, idempotent]

requires:
  - phase: 72-01
    provides: "INST-02 rescoped to the AOForge rename; objective 72 roadmap entry"
provides:
  - "scripts/aoforge-rename.cjs: one-shot DevFlow -> AOForge codemod (names pass, planning pass, inventory, dry run, write, report, --only)"
  - "A clean inventory of this repository for both passes (unclassified=0), with the manual list"
  - "scripts/__fixtures__/legacy-rename-fixtures.cjs: hand-built sample tree and scratch git repo shaped like this repository"
affects: [72-04, 72-05, 72-06, 72-10, 72-11, 72-12]

tech-stack:
  added: []
  patterns:
    - "Preserve by placeholder: preserved tokens are swapped for \\u0000P<n>\\u0000, rules run, placeholders restored"
    - "Occurrence-level classification: the inventory and the rewrite share one occurrence classifier, so they cannot disagree"
    - "Moves are planned as ordered directory moves then file moves, applied with git mv; a re-run plans nothing"

key-files:
  created:
    - scripts/aoforge-rename.cjs
    - scripts/aoforge-rename.legacy.test.cjs
    - scripts/__fixtures__/legacy-rename-fixtures.cjs
  modified: []

key-decisions:
  - "Renames are blind for known shapes and held back only for what is NOT ours: devflowops, devflow-desktop, devflow.cloud, quoted fleet repo names, and the monorepo-doctor skip list. A token is unclassified when devflow/df-tools is glued to other letters (devflowzap) or spelled in a way no rule rewrites (devFlow)."
  - "Tokens that cross a process or machine boundary (workflow inputs, ~/.devflow, launchd label, .devflow-handoff, merge driver name) are renamed by the codemod, not held back; 72-10/11/12 add the legacy spellings through legacy-names.cjs. They are listed under Hand-off."
  - "In test code (*.test.*, __fixtures__) the planning pass is a plain .planning -> .aoforge rename with no planningRoot and no residual, because a test builds a fixture project on purpose. In non-test JS, path.join|resolve(<expr>, '.planning'...) becomes planningRoot(<expr>) and every other string occurrence is renamed AND listed as a residual."
  - "The article is fixed by the names pass (\"a DevFlow project\" -> \"an AOForge project\") as a silent rule that does not count as a rename."

requirements-completed: []

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 25min
completed: 2026-10-08
tokens_input: 16649212
tokens_output: 162023
tokens_cache_read: 16403583
tokens_cache_write: 245461
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 72 TRD 03: Rename codemod Summary

**`scripts/aoforge-rename.cjs` plans and applies the DevFlow -> AOForge rename in two idempotent passes (names, planning) with `git mv`, preserve masks and skip lists, and classifies every legacy token in this repository: both inventories print `unclassified=0`.**

## Progress
- [x] Task 1: Fixture builders: sample files and a scratch repo shaped like this one — fcaf94a0
- [x] Task 2: Pure rules: paths, names, planning, preserves, skips — 6e6df03b (RED e2de11cf)
- [x] Task 3: CLI (inventory, dry run, write, report) and a clean inventory of this repo — 87bda6e6 (CLI GREEN, RED ca5ee0a1), 244815a8 (classification)

## What was built

- `scripts/aoforge-rename.cjs` (CommonJS, Node built-ins only, requires nothing from `plugins/`). Exports `mapPath`,
  `rewriteNames`, `rewritePlanning`, `classifyToken`, `inventory`, `PRESERVE`, `SKIP`, `main`, plus `isSkipped`,
  `processFile`, `planMoves`, `PATH_RULES`, `NAME_RULES`, `PLANNING_RULES`, `KNOWN_GLUED`.
- `scripts/aoforge-rename.legacy.test.cjs`: 50 tests, the 13-case list in the header. CLI tests spawn the script in a scratch git repo.
- `scripts/__fixtures__/legacy-rename-fixtures.cjs`: `sampleFiles()` (19 typed-out files, one executable stub) and `scratchRepo(extra)`.
- CLI: `--rules names|planning` (required), `--inventory`, `--dry-run` (default), `--write`, `--report <file>`, `--only <prefix>` (repeatable). An unknown flag, a missing value, a positional argument, `--write` with `--inventory`, or a non-git directory exits 1.
- Names pass order: preserves (masked), `/devflow:`, `devflow:<agent>`, `df-tools`, `DF-TOOLS`, the `DF ►` banner, `DEVFLOW`, `DevFlow`, `Devflow`, `devflow`. A silent first rule fixes "a" to "an" before the new names.
- Planning pass: `path.join|resolve(<expr>, '.planning'...)` -> `planningRoot(<expr>)` with one import from `compat.cjs` (relative per file: hooks `../aoforge/bin/lib/compat.cjs`, `bin/lib/x.cjs` `./compat.cjs`, `migrations/` and `doctor-checks/` `../compat.cjs`, `bin/aof-tools.cjs` `./lib/compat.cjs`; an existing destructure gains `planningRoot`; a file that already declares it is left alone and reported). Other `.planning` -> `.aoforge`; property access (`cfg.planning`, `.planningDir`) is untouched; a regex literal in non-test code is left for 72-06.
- Moves: `plugins/devflow -> plugins/aoforge`, then `plugins/aoforge/devflow -> plugins/aoforge/aoforge`, then per-file basename renames (`df-tools*`, `devflow-*`). All through `git mv`; the executable bit follows.

## Inventories of this repository (read-only, nothing written)

| Pass | rename (distinct / occurrences) | preserve | manual | unclassified |
|---|---|---|---|---|
| `--rules names` | 859 / 11,985 | 9 / 25 | 1 / 2 | **0** |
| `--rules planning` | 358 / 5,292 | 23 / 251 | 2 / 5 | **0** |

Manual list (text left unchanged, reported for a human):

| Pass | Token | Where | Reason |
|---|---|---|---|
| names | `'.devflow'` | `monorepo-standards/.../doctor.js` lines 41, 162 | the doctor skips dirs by name: ADD `'.aoforge'` beside it, keep the legacy entries |
| planning | `'.planning'` | same two lines | same: ADD `'.aoforge'`, keep `'.planning'` |
| planning | `/\/\.planning\//`-style regex literals | `gate-edits.js:398`, `benchmark.cjs:239`, `planning-audit.cjs:55` | 72-06 builds them from `LEGACY` |

Preserved (names): `devflowops` (+ `.format`, `.tidy`, `-shaped`), `devflow.cloud` (3 spellings), quoted fleet repo names `'devflow'` and `'devflow-test'` in `stack-fleet-tables.cjs`.

Dry run on this repository: names `moves=14 rewrites=825 residuals=2`; planning (before 72-02's `compat.cjs` exists) `rewrites=613`, 271 residuals say "no compat.cjs in reach".

## Trial on a scratch clone (not this repository)

To check the tool beyond the fixtures, the committed tree was cloned into the session scratchpad, a stub `compat.cjs` added there, and both passes run with `--write`:

- names: `moves=14 rewrites=825 residuals=2`; planning: `rewrites=613 residuals=348` (338 string literals in code, 3 regex literals, 2 doctor lines, 5 in `scripts/estimate-window-eval.cjs` which has no `compat.cjs` in reach).
- A re-run of each pass: `moves=0 rewrites=0` (idempotent). `--inventory` after the names write still `unclassified=0`.
- `node --check` on all 706 `.cjs`/`.js` files in the clone: 0 syntax failures; 97 files received the `planningRoot` import.
- Prose scan of the clone: no "a AOForge", no "Aoforge" outside identifiers.
- The trial found one over-broad preserve (below).

## Hand-off for 72-04, 72-10, 72-11, 72-12

The names pass renames these boundary-crossing tokens like any other. They are the places where an old spelling still has to be accepted (through `legacy-names.cjs`), by occurrence count in the names inventory:

| Count | Token | Owner |
|---|---|---|
| 1,205 | `DEVFLOW_*` env vars | 72-02 `aliasLegacyEnv` |
| 388 | `devflow-claude` (repo name, URLs) | 72-19 |
| 169 | `devflow-watch` (daemon, pid, log, allow files) | 72-12 |
| 96 | `devflow-ref` / `devflow_ref` / `devflow-repo` (reusable-workflow inputs callers pass) | 72-11 |
| 95 | `.devflow-handoff` directories | 72-12 |
| 94 | `~/.devflow` user dot dir | 72-02 `userDotFile` |
| 70 | `devflow-store-cache`, `devflow_todo` metadata, `devflow-setup` | 72-11 |
| 35 | `.devflow-notices.json` | 72-12 |
| 13 | git merge driver `devflow-state-json` | 72-12 |
| 11 | `.devflow/no-binaries.yml` (monorepo-standards convention in other repos) | 72-25 |
| 6 | launchd label `com.aocyber.devflow-watch` | 72-12 |

72-04 should run `--rules names --write` in a clean tree, review the 2 manual lines, then run the repo tests. Run the planning pass only after 72-02's `compat.cjs` is in the tree, or the 271 `no compat.cjs in reach` residuals will not become `planningRoot` calls.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixtures | `node -e "...scratchRepo()...git status --porcelain..."` | 0 (printed `clean`; 19 files; stub is 100755) | PASS |
| 2: pure rules | `node --test scripts/aoforge-rename.legacy.test.cjs` | 0 (34 pass) | PASS |
| 3: CLI + inventory | `node --test scripts/aoforge-rename.legacy.test.cjs && node scripts/aoforge-rename.cjs --rules names --inventory \| tail -1 && node scripts/aoforge-rename.cjs --rules planning --inventory \| tail -1 && git status --porcelain` | 0 (50 pass; `unclassified=0` twice; empty status) | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 2) | `node --test scripts/aoforge-rename.legacy.test.cjs` | 1 (`Cannot find module './aoforge-rename.cjs'`) | FAIL (correct) |
| GREEN (Task 2) | same | 0 (34 pass) | PASS (correct) |
| RED (Task 3 CLI) | same | 1 (11 CLI fail, 34 pure pass) | FAIL (correct) |
| GREEN (Task 3 CLI) | same | 0 (45 pass) | PASS (correct) |
| RED (new rule shapes) | same | 1 (2 fail) | FAIL (correct) |
| GREEN (new rule shapes) | same | 0 (49 pass) | PASS (correct) |
| RED (article rule) | same | 1 (1 fail) | FAIL (correct) |
| GREEN (article rule) | same | 0 (50 pass) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test (scoped) | `node --test scripts/aoforge-rename.legacy.test.cjs` | 0 (50 pass) | PASS |
| test (full) | `npm test` with `node_modules` linked into the worktree | 0 (11,558 tests, 0 fail, 35 skipped), run after `roadmap update-job-progress`. Before that step the one failure was `E2E1 reconcile dry-run`: ROADMAP drift while a SUMMARY exists | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The fleet-name preserve was too broad for `stack-*.test.cjs`**
- **Found during:** Task 3, scratch-clone trial
- **Issue:** the TRD scopes quoted `'devflow'` to `stack-*.test.cjs`, but `stack-profile.test.cjs` and `stack-validate.test.cjs` use `path.join(home, '.claude', 'devflow', 'stacks', ...)`, the runtime directory, which must be renamed. The preserve left it unchanged.
- **Fix:** the scoped pattern excludes a quoted name that follows `'.claude',` (negative lookbehind). Pure test added.
- **Files modified:** `scripts/aoforge-rename.cjs`, `scripts/aoforge-rename.legacy.test.cjs`
- **Commit:** 244815a8

**2. [Rule 2 - Missing critical] Rule shapes the inventory exposed**
- **Found during:** Task 3 (the step the TRD prescribes: add rules until `unclassified=0`)
- **Issue:** one glued token (`devflowx`, a negative test vector in `gate-edits.test.js`) and two `.planning` occurrences after a closing bracket (`':(exclude).planning'`, `` `${path.sep}.planning${path.sep}` ``).
- **Fix:** `KNOWN_GLUED` (exact token), a git-pathspec rule and an interpolation rule in `occurrenceKind`. Tests added first.
- **Commit:** 244815a8

**3. [Rule 2 - Missing critical] Article fix**
- **Found during:** Task 3, reading the clone diff ("Not a AOForge project")
- **Fix:** a silent first name rule turns "a DevFlow", "a df-tools" into "an AOForge", "an aof-tools". Test added first.
- **Commit:** 244815a8

### Design choices the TRD left open

- Test code (`*.test.*`, `__fixtures__/`) gets a plain `.planning` -> `.aoforge` rename in the planning pass (no `planningRoot`, no residual). Code comment lines are renamed without a residual.
- The inventory reports one row per (token, action, detail); `unclassified=<n>` counts distinct rows. A quoted file-scoped span is listed under its quoted text (`'devflow-test'`).
- `--write` and `--dry-run` are mutually exclusive; `--inventory` cannot be combined with either. A directory move that would land on an existing tracked directory is reported as a residual, not forced.
- `--only`: a directory move runs only when a prefix covers the whole directory; file moves, rewrites and inventory follow the files under the prefix.
- The `--write` trial ran on a clone in the scratchpad. The TRD forbids `--write` against this repository, and none was run against it.

### Process notes

- **Accidental daemon start.** While diagnosing nine failing daemon tests I ran `devflow-watch.cjs start --foreground` against the real `$HOME`. It started, then exited when its output pipe closed; its PID file is gone and no process is left. The only trace is lines appended to `~/.devflow/devflow-watch.log`.
- **Daemon tests need `node_modules`.** The first full `npm test` in this worktree had 10 failures: nine devflow-watch/handoff daemon tests (the worktree has no `node_modules`; they pass 22/22 with the main checkout's `node_modules` symlinked in, and in the main checkout) and `E2E1` roadmap drift (see Validation Gate Results). The symlink was removed after each run.

## Self-Check: PASSED

- Files found: `scripts/aoforge-rename.cjs`, `scripts/aoforge-rename.legacy.test.cjs`, `scripts/__fixtures__/legacy-rename-fixtures.cjs`.
- Commits found: fcaf94a0, e2de11cf, 6e6df03b, ca5ee0a1, 87bda6e6, 244815a8.
- `git status --porcelain` empty after the inventory runs: the repository was not rewritten.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (inventory names and planning exit 0 with `unclassified=0` and exit 1 with `devflowzap`; dry run leaves a clean tree; `--write` uses `git mv`, keeps mode 100755, second dry run `moves=0 rewrites=0`; preserved and skipped content unchanged in the CLI test; planning rule injects one `planningRoot` import with the right relative path and lists other occurrences as residuals)
- Gate failures: None
