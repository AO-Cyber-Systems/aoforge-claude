---
objective: 36-upgrade-in-place
trd: "01"
subsystem: upgrade
tags: [upgrade, migrations, registry, backup, stamp, fixtures]

# Dependency graph
requires: []
provides:
  - "lib/upgrade.cjs — loadRegistry, readStamp, writeStamp, backupDirFor, backup, check, apply, RegistryError, DEFAULT_REGISTRY_DIR (= lib/migrations)"
  - "lib/__fixtures__/upgrade-fixtures.cjs — the ONLY shared objective-36 fixture module: makeFakeHome, HAND_WRITTEN_ROUTING, makeV1Project, makeStampedProject, initGitFixture, gitEnv, migrationSource, makeRegistryDir, snapshot, diffSnapshots (+ LEGACY_CLAUDE_MD_BLOCK, V1_FLAT_CONFIG, FIXTURE_STAMP_TIME)"
affects: [36-03, 36-04a, 36-04b, 36-04c, 36-05, 36-06, 36-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Detection-based migration registry: one NNNN-slug.cjs per migration, contract-validated at load, all problems collected into one RegistryError"
    - "Per-migration detect-then-apply in id order (a later detect sees earlier applies); the first failure halts every later write but detection still reports what is pending"
    - "Backups live under the injected userHome, never in the repo; the dir is claimed with a non-recursive mkdir so equal timestamps get -1, -2 suffixes"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/upgrade.cjs
    - plugins/devflow/devflow/bin/lib/upgrade.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/upgrade-fixtures.cjs
  modified: []

key-decisions:
  - "apply() detects each migration immediately before running it (not one detect pass up front), so a migration that depends on an earlier one's output sees it."
  - "Any failure (detect, apply, bad changed path, backup, unparseable config.json) halts all later writes; later applicable migrations are still reported in pending / pending_confirm."
  - "The stamp is written only when something was applied or the version actually advances, so a no-op apply leaves config.json byte-identical (the hook's fast path depends on this)."
  - "check() hands detect a ctx with dryRun: true; apply() hands both detect and apply the same shape with the caller's dryRun."
  - "apply() and check() throw TypeError unless userHome is an absolute path; upgrade.cjs never resolves a home directory itself."
  - "RegistryError.problems is string[] with exactly one entry per bad file ('<file>: issue; issue'); a duplicate id produces an entry for each file, each naming the other."
  - "In dryRun, changed_files includes .planning/config.json when the stamp WOULD be written."

requirements-completed: [UPG-01]

# Verification evidence
verification:
  gates_defined: 3
  gates_passed: 3
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: ~45min
completed: 2026-09-27
tokens_input: 8218338
tokens_output: 92139
tokens_cache_read: 8065434
tokens_cache_write: 152780
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 36 TRD 01: The upgrade runner Summary

**`lib/upgrade.cjs` loads a contract-validated registry of `NNNN-slug.cjs` migrations and runs them in id order. It backs up `.planning/` and `CLAUDE.md` under `<userHome>/.claude/devflow/backups/<slug>-<hash8>/<ts>/` before the first write, stamps `config.json` `devflow{version, migrations_applied, upgraded_at}`, and returns the `{from,to,up_to_date,applied,pending,pending_confirm,skipped,failed,changed_files,backup}` report. The shared objective-36 fixture module ships alongside it.**

## Performance

- **Started:** 2026-09-27T22:23:54Z (preflight claim)
- **Tasks:** 2, both TDD (RED then GREEN; no refactor commit needed)
- **Files:** 3 created, 0 modified

## Accomplishments

- **Registry:** `loadRegistry` reads only `NNNN-slug.cjs` files and ignores `*.test.cjs`, so the `lib/migrations/*.test.cjs` files planned in 36-04 are safe. It validates `id`, `title`, `since` and `safety`, requires `detect` and `apply`, and checks that the id matches the filename. It rejects duplicate ids and catches load errors. Every problem is reported in one `RegistryError`. The require cache is cleared on every load.
- **check():** read-only. Returns pending, pending_confirm, skipped and failed (with the detect phase). An unparseable `config.json` shows up as `failed:{id:'stamp'}`, and a check that could not run never reports `up_to_date`.
- **apply():**
  - Auto migrations run when applicable, narrowed by `only`. Confirm migrations run only when named in `only` or when `confirm: true` is passed.
  - The backup is taken lazily, just before the first real write. None is taken on dryRun or for a stamp-only change.
  - Each migration's `changed` paths are checked: they must be relative and POSIX, with no `..`.
  - The version advances only when nothing failed and no applicable auto migration was left unrun.
  - Every other key in `config.json` is kept, in its original order.
- **Fixtures:** every builder in the TRD API is written and self-checked (F1-F5), so the later TRDs can import them read-only. `makeStampedProject` is built to leave nothing pending for the real migrations 0001-0006: nested template config, TRD files, `state.json`, every OBJECTIVE.md present, PROJECT.md with `kind`, and a CLAUDE.md with no block.

## Fixture API as built

| Builder | Result |
|---|---|
| `makeFakeHome({legacy, claudeMd})` | mkdtemp home with `.claude/`. `legacy` adds `skills/df-plan/SKILL.md`, `agents/df-planner.md`, `devflow/VERSION` (`1.20.4`, no newline) and a `skills/keep-me/SKILL.md` that must never move. `claudeMd` writes `.claude/CLAUDE.md` |
| `HAND_WRITTEN_ROUTING` | `# HARD RULES` → `# DevFlow Routing` (bullets) → `## TDD & Quality` → `# Brand Guide` |
| `makeV1Project({flatConfig, jobFiles, stateJson, missingObjectiveMd, projectKind, claudeMdBlock})` | As specified in the TRD. The legacy block is `START + "\n\n" + body + "\n" + END`, with a blank line after START and before END, mirroring `templates/claude-md.md`. Exported as `LEGACY_CLAUDE_MD_BLOCK` |
| `makeStampedProject(version, {migrations_applied})` | `makeV1Project` in its modern shape (nested `templates/config.json` content, TRD files, `state.json`, both OBJECTIVE.md files, `kind: app`, `claudeMdBlock: 'none'`) plus a `devflow` stamp with `upgraded_at = FIXTURE_STAMP_TIME` |
| `initGitFixture(root, home)` / `gitEnv(home)` | Local identity, with `commit.gpgsign` and `tag.gpgsign` set to false on the fixture repo only. `gitEnv` also strips `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and similar variables, so fixture git calls can never touch the host repo |
| `migrationSource({...})` | Any field passed as `undefined` is left out of the source, which is how the missing-field tests are built. `fs` and `path` are in scope for the detect/apply bodies |
| `makeRegistryDir`, `snapshot`, `diffSnapshots` | As specified. `snapshot` skips `.git/` and records symlinks by their target |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Fixture builders + registry loader (tests 1-9) | `node --test plugins/devflow/devflow/bin/lib/upgrade.test.cjs` | 0 (16/16) | PASS |
| 2: check / apply / backup / stamp / report (tests 10-26) | `node --test plugins/devflow/devflow/bin/lib/upgrade.test.cjs` | 0 (35/35) | PASS |
| No real-home access | `rg -n "homedir\|~/.claude\|require('os')" plugins/devflow/devflow/bin/lib/upgrade.cjs` | 1 (no matches) | PASS |

## TDD Evidence

| Task | Phase | Command | Exit Code | Expected | Commit |
|---|---|---|---|---|---|
| 1 | RED | `node --test .../upgrade.test.cjs` | 1 (`Cannot find module './upgrade.cjs'`) | FAIL (correct) | fb00dce |
| 1 | GREEN | `node --test .../upgrade.test.cjs` | 0 (16 pass) | PASS (correct) | fda6eea |
| 2 | RED | `node --test .../upgrade.test.cjs` | 1 (19 fail: `check/apply/readStamp is not a function`; 16 pass) | FAIL (correct) | cd6266c |
| 2 | GREEN | `node --test .../upgrade.test.cjs` | 0 (35 pass) | PASS (correct) | d739677 |

The 35 tests break down as the 26 TRD cases, fixture self-checks F1-F5, and four extras:
- 9b: the require cache is cleared between loads.
- 10b: `only` narrows check, and `up_to_date` is true or false as expected on stamped projects.
- 24b: a missing or relative `userHome` throws before anything is written.
- `DEFAULT_REGISTRY_DIR` points at `lib/migrations`.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| TRD fast verify | `node --test plugins/devflow/devflow/bin/lib/upgrade.test.cjs` | 0 (35/35) | PASS |
| No real home | `rg -n "homedir\|~/.claude" plugins/devflow/devflow/bin/lib/upgrade.cjs` | 1 (no matches) | PASS |
| Wave regression (baseline-relative) | `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` (output in the session scratchpad) | 1 | PASS: 0 regressions |

**Observed totals (for information only):** 3627 tests, 505 suites. 3594 passed, 1 failed, 0 cancelled, 32 skipped.

**How each failure was classified:**

| File:line | Test name | Classification |
|---|---|---|
| `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | **pre-existing** (listed in `baseline-failures.tsv`) |

- Regressions: none.
- Environment flakes: none.
- The other 20 baseline entries passed in this run: the 1Password signing tests and the devflow-watch, handoff-e2e and project-state tests. 1Password was unlocked, and this run was in the main checkout, not a worktree.
- The 35 new `upgrade.test.cjs` tests are not in the TSV, and all of them pass.
- The real `~/.claude/devflow/backups` still does not exist after the run, so no test leaked into the real home.
- `baseline-failures.tsv` was not edited.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Edit gate denied the first Write (no `.skill-active` marker)**
- **Found during:** Task 1
- **Fix:** Ran `df-tools skill-active --start execute-objective`, which is the hook's documented allow-path for a running executor and the same fix used in 25-01 and 33-01. No bypass phrase or environment variable was used.

**2. [Rule 2 - Critical] `gitEnv` strips repository-redirect variables**
- **Found during:** Task 1
- **Issue:** If the suite runs inside a git hook of this repo, an inherited `GIT_DIR` or `GIT_WORK_TREE` would point fixture git calls at this repository.
- **Fix:** `gitEnv` removes `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_PREFIX` and `GIT_NAMESPACE`. It is otherwise exactly as specified.

**3. [Rule 2 - Critical] The backup guard resolves symlinks in paths that do not exist yet**
- **Issue:** The backup dir does not exist at guard time, so on macOS a plain `realpath` leaves `/var` unresolved while the project resolves to `/private/var`. A home nested inside the project would then pass the "inside the project" check.
- **Fix:** Added a `realpathLoose` helper that resolves the deepest existing ancestor. Test 17 covers it.

**4. [Scope clarification] Behaviour the TRD left open, now pinned by tests**
- A failure halts all later writes. This covers a detect failure, a bad `changed` path, a backup failure, or an unparseable `config.json` found at start. Later applicable migrations are reported in pending.
- A backup failure is reported as `failed:{id:'backup'}` instead of being thrown.
- `apply()` returning something other than `{changed: []}`, or returning a promise, counts as a failure.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7
- Gate failures: see Validation Gate Results

## Open Issues

- `.planning/.skill-active` (gitignored) was armed for this executor and left in place for the orchestrator. It expires on its own after 8 hours.

## Self-Check: PASSED

- The following files exist: `lib/upgrade.cjs`, `lib/upgrade.test.cjs` and `lib/__fixtures__/upgrade-fixtures.cjs`.
- The following commits exist on `feat/stack-profile-loader`: fb00dce, fda6eea, cd6266c and d739677.
