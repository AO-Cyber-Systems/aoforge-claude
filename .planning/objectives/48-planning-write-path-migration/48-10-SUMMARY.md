---
objective: 48-planning-write-path-migration
trd: "10"
subsystem: github-sync
tags: [store-mode, gitignore, migration, confirm-only, df-tools-commit, doctor, tdd, node-test]

requires:
  - objective: 48-planning-write-path-migration
    provides: "48-01 planning-mode (store switch), planning-paths (classify, gitignoreLines, listByClass)"
  - objective: 47-github-authoritative-store
    provides: "gh-outbox journalPath/readCacheIndex, gh-trd contentHash, gh-cache recordCacheBaseline"
provides:
  - "migrations/0010-store-gitignore.cjs: confirm-only U-1 migration (detect, apply runner adapter, migrate, discover)"
  - "misc.cjs cmdCommit: per-path ignore filter (ignoredPaths) after the unchanged whole-dir probe"
  - "doctor-checks/24-store-cache-tracked.cjs: report-only store-mode check built on m0010.detect"
affects: [48-12, 48-15, 51]

tech-stack:
  added: []
  patterns:
    - "Confirm-only migration whose refusal THROWS from apply (runner reports failed, never stamps) while migrate() returns {applied:false, refused, details}"
    - "Preconditions read local state only (journal file read-only, cache index, working files); no gh, no pull"
    - "Ignore status decided by git check-ignore --no-index (global excludes off), verified after writing; rollback restores .gitignore and the index"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/misc-commit.test.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.cjs
    - plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/24-store-cache-tracked.cjs
    - plugins/devflow/devflow/bin/lib/doctor-checks/24-store-cache-tracked.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/misc.cjs

key-decisions:
  - "Legacy TRD names (NN-MM-TRD-<slug>.md) that are tracked BLOCK 0010 apply with a rename suggestion (NN-MM-<slug>-TRD.md); they are never silently untracked, and the U-1 block stays exactly three lines"
  - "cmdCommit drops a requested planning path only when it is ignored AND unknown to git (not in the index, not in HEAD); tracked ignored files and staged removals still commit, so 0008/0010 follow-up commits keep working"
  - "The whole-dir probe runs first and unchanged, so a wholly ignored .planning gives exactly today's result"
  - "0010 apply is a runner adapter that throws on refusal; migrate() carries the TRD's {applied:false, refused, details} shape"
  - "Markers are '# >>> devflow store (0010) >>>' / '# <<< ... <<<' with a local block helper; managed-block.cjs's fixed HTML-comment markers would be ignore patterns in a .gitignore"

patterns-established:
  - "A store-mode cleanup is report-only in doctor; the fix is the explicit confirm command"

requirements-completed: [GWP-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 13min
completed: 2026-10-01
---

# Objective 48 TRD 10: Migration 0010 store-gitignore, per-path commit filter, doctor check 24 Summary

**A confirm-only migration that, once the outbox is drained and every cache file is baselined on GitHub, writes the U-1
`.gitignore` block (`.planning/*`, `!config.json`, `!STACK.md`) and untracks everything else from the index only.
`df-tools commit` now skips ignored, untracked planning paths one path at a time. A report-only doctor check flags a
store-mode project that still tracks its cache.**

## Performance

- Started 2026-10-01T12:33Z, finished 2026-10-01T12:46Z (about 13 min)
- 3 tasks, 6 commits (one RED and one GREEN per task); 5 files created, 1 modified

## Accomplishments

- **cmdCommit (D-20).** The commit_docs gate and the whole-`.planning` probe are unchanged and still run first. When
  `.planning` itself is not ignored, one `git check-ignore --no-index --stdin -z -v -n` call probes each requested
  planning path. Results are matched by position, and a negation match counts as not ignored. A path is dropped into
  `skipped_planning` only if it is also unknown to git (`ls-files` and `ls-tree HEAD`, run only for the candidates).
  Dropping every path gives `{committed:false, hash:null, reason:'skipped_gitignored'}`, the same shape as today.
- **Migration 0010** (`safety:'confirm'`, `since:'2.13.0'`):
  - `detect` is never applicable outside store mode. `migrate` checks `detect` again, so even a direct call cannot
    untrack anything in a local project.
  - Preconditions are checked locally:
    - outbox journal: no pending or blocked ops and not halted. The file is read read-only, never quarantined.
    - every cache file on disk matches its baseline. Each failure is reported as `<rel>: not on GitHub yet (no baseline)`
      or `<rel>: changed since last sync`.
    - no tracked legacy-named TRD (see the deviation below).
  - Before any change it backs up `.planning/`, `CLAUDE.md`, the old `.gitignore` and the path list to
    `<userHome>/.claude/devflow/backups/<repoKey>/`.
  - It writes the block, then asks git whether config.json and STACK.md are visible and a probe TRD path is ignored.
    If not, it restores `.gitignore` and refuses; a pre-existing `.planning/` directory rule is caught this way.
  - It removes paths with `git rm --cached` in batches of 200. If a batch fails, it runs `git reset` on the paths
    already removed, restores `.gitignore` and refuses.
  - The report has `untracked` counts by class, `local_only` (runtime rels) with the D-17 note, `gitignore`,
    `backup`, and the exact follow-up `df-tools commit ... --files .gitignore .planning/`. Test 11b runs that commit
    end-to-end and gets a clean tree.
- **Doctor 24** (`store-cache-tracked`, project scope, no `fix`) gives `warn` with "store mode is on but N .planning/
  path(s) are still tracked", `fixable:false` and `fix_command: df-tools upgrade --apply --only 0010 --confirm`. It
  reports `ok` in local mode, with no project, without `.planning/`, outside a git repo, and once 0010 has been applied.

## Task Commits

| Task | RED | GREEN |
|---|---|---|
| 1: per-path commit filter | c669eabd test(48-10): commit filters ignored planning paths per path | f92b1b92 fix(48-10): commit skips ignored planning paths per path |
| 2: migration 0010 | ac1bd1f4 test(48-10): migration 0010 store gitignore | 89a6ab98 feat(48-10): migration 0010 gitignores the planning cache in store mode |
| 3: doctor check 24 | 00d1205d test(48-10): doctor store-cache-tracked | 744c554f feat(48-10): doctor reports a tracked cache in store mode |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `node --test misc-commit.test.cjs commit-staged-removal.test.cjs commit-failure.test.cjs df-tools.test.cjs` | 0 | PASS (174/174) |
| 2 | `node --test migrations/0010-store-gitignore.test.cjs upgrade.test.cjs` | 0 | PASS (51/51) |
| 3 | `node --test doctor-checks/*.test.cjs doctor*.test.cjs` | 0 | PASS (195/195) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED 1 | `node --test .../misc-commit.test.cjs` | 1 (tests 5, 6 fail: `pathspec ... did not match any file(s) known to git`; 1-4, 6b, 7, 7b-d green) | FAIL (correct) |
| GREEN 1 | same + df-tools.test.cjs, commit-staged-removal, commit-failure | 0 | PASS (correct) |
| RED 2 | `node --test .../migrations/0010-store-gitignore.test.cjs` | 1 (module missing) | FAIL (correct) |
| GREEN 2 | same + upgrade.test.cjs | 0 | PASS (correct) |
| RED 3 | `node --test .../doctor-checks/24-store-cache-tracked.test.cjs` | 1 (module missing) | FAIL (correct) |
| GREEN 3 | same + doctor suites | 0 | PASS (correct) |

No REFACTOR commits.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test misc-commit.test.cjs 0010-store-gitignore.test.cjs 24-store-cache-tracked.test.cjs` (within the runs above) | 0 | PASS |
| regression | `node --test migrations/*.test.cjs upgrade*.test.cjs hooks/upgrade-project.test.js` | 0 | PASS (217/217) |
| verification | `df-tools --cwd <worktree> upgrade --check --only 0010` (this repo, store off) | 0 | PASS: 0010 `skipped`, "local mode (github.enabled is not true): .planning/ stays tracked"; tree clean |
| full suite | `npm test` (worktree, dot reporter) | 1 | 7177 pass, 1 fail: MA-7 in handoff-e2e.test.cjs (the known flake), not fixed |

## Deviations from Plan

1. **[Rule 2 - Safety] Legacy TRD names block apply.** This handles the known issue 48-01 flagged.
   - **Problem:** `NN-MM-TRD-<slug>.md` (all of `objectives/07-handoff-watcher/`) classifies as runtime, so 0010 would
     untrack it.
   - **Choice:** this is the least invasive option. A tracked file matching
     `^objectives/<dir>/(\d+(?:\.\d+)?-\d+)-TRD-(.+)\.md$` is a precondition failure: "`<rel>`: legacy TRD name has no
     GitHub home; rename it to `<NN-MM>-<slug>-TRD.md`". `detect` mentions it too.
   - **What did not change:** the U-1 block stays exactly the three lines, the classifier is untouched, and no file
     under `objectives/07-*` was renamed.
   - **Not covered:** other runtime-class content that is not a TRD (e.g. `23-05-measurements.md`,
     `overrides/*.STACK.md`) still follows D-17: it is untracked and reported as `local_only`.
2. **[Rule 1 - Bug] The per-path filter skips only paths git does not know about.** A literal "ignored → skip" would
   break things:
   - the TRD 44-06 staged-removal commit for 0008's `.planning/.progress-guard.json`. That path is ignored in local
     mode too, so local-mode parity would break.
   - 0010's own follow-up commit.

   Tracked ignored files and staged removals therefore still commit (tests 7b, 7c, 7d, 11b). The only local-mode
   difference: an ignored, untracked planning path that someone passes explicitly. Before, git rejected it with
   `commit_failed` (exit 1, "pathspec did not match"). Now it is reported in `skipped_planning`.
3. **[Rule 3 - Blocking] 0010's `apply` throws on refusal.** The runner contract (`{changed, notes}`) has no refusal
   shape. A returned `changed: []` would be stamped as applied, and a missing `changed` gives a generic error.
   `migrate(ctx)` returns the TRD's `{applied:false, refused, details}`. `apply` throws its text, so `upgrade.apply`
   reports `failed`, halts later writes and never stamps 0010 (test 9b).
4. **[Rule 3] Block markers do not use managed-block.cjs.** Its START/END markers are fixed `<!-- DEVFLOW:... -->`
   HTML comments, and a .gitignore reads those as patterns. A small local helper keeps the same guarantees. Changing
   the shared module during a parallel wave was avoided.
5. **Placement:** `ignoredPaths` lives in `misc.cjs` beside `cmdCommit`, not in `helpers.cjs`, so the change stays
   inside this TRD's files.
6. **Test fix after the RED commit:** test 8c expected 8 tracked paths, but the fixture has 7 besides config.json and
   STACK.md (tests 11 and 14 already agreed on 7). Corrected in the GREEN commit.

## Notes for later TRDs / orchestrator

- **`--only 0010 --confirm` also runs every other applicable confirm migration.** `upgrade.cjs` selects
  `named || confirm`. On a project without `kind`, 0006 runs first, fails and halts, so 0010 never runs. `--only 0010`
  alone is enough to run 0010. The doctor `fix_command` and the refusal text keep the TRD's literal `--confirm` form.
  The 0010 test fixture sets `kind` to sidestep this. The narrowing belongs in `upgrade.cjs` (48-15 or 51).
- **This repo:** 0010 is not applicable because the store is off, and `.planning/` stays tracked. Running 0010 here
  later also needs the 8 legacy 07 TRDs renamed, otherwise it refuses.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (confirm-only and never applicable in local mode; refusal lists every blocker plus the
  three-command remedy; backup, exact block, index-only untrack, working files byte-identical, idempotent re-run;
  D-17 `local_only`; per-path commit filter with local parity; doctor 24 warn plus exact fix_command, report-only)
- Gate failures: None (full-suite MA-7 is the known flake)

## Self-Check: PASSED

- FOUND: all 6 key files (each ran under `node --test` above)
- FOUND: commits c669eabd, f92b1b92, ac1bd1f4, 89a6ab98, 00d1205d, 744c554f (`git log fdfb4b4f..HEAD`)
- STATE.md / ROADMAP.md deliberately not edited: the orchestrator updates them after merge
