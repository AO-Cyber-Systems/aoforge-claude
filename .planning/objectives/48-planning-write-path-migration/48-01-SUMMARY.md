---
objective: 48-planning-write-path-migration
trd: "01"
subsystem: github-sync
tags: [planning-mode, path-classifier, ledger, store-mode, hook-safe, worktree, node-test, tdd]

requires:
  - objective: 47-github-authoritative-store
    provides: "gh-outbox stateDir/repoKey (per-repo out-of-tree state), gh-trd contentHash (cache-index hash), sync-state atomicWrite"
provides:
  - "lib/planning-mode.cjs: planningMode(cwd) -> {mode, reason, root}, isStoreMode, readPlanningConfig, resolveMainRoot (fs-only worktree -> main checkout via .git file + commondir)"
  - "lib/planning-paths.cjs: total classify(rel) -> {class, verb, hint, entity}; CLASSES, VERB_TABLE, TRACKED_CONFIG, gitignoreLines, relToPlanning, listByClass"
  - "lib/planning-ledger.cjs: verb-write ledger at <stateDir>/<repoKey>.verb-writes.json; ledgerPath, readLedger, record, forget, matches, settleCandidates"
affects: [48-04, 48-07, 48-08, 48-09, 48-10, 48-11, 48-12, 48-13, 48-14, 48-15, 48-22]

tech-stack:
  added: []
  patterns:
    - "Single reader of github.store for planning writes (planning-mode); strict === true on both enabled and store"
    - "Ordered first-match rule table with an explicit runtime default, so classification is total and unknown is never cache"
    - "Per-repo out-of-tree state built from the outbox's exported stateDir + repoKey (no new location scheme)"
    - "Corrupt state: reads report corrupt and never write; writes quarantine to <file>.corrupt-<ms> and return recovered.corrupt_path (the outbox journal's policy)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/planning-mode.cjs
    - plugins/devflow/devflow/bin/lib/planning-mode.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-paths.cjs
    - plugins/devflow/devflow/bin/lib/planning-paths.test.cjs
    - plugins/devflow/devflow/bin/lib/planning-ledger.cjs
    - plugins/devflow/devflow/bin/lib/planning-ledger.test.cjs
  modified: []

key-decisions:
  - "planningMode returns {mode, reason, root}: root (the resolved main checkout, or null) lets callers reuse the D-14 resolution"
  - "resolveMainRoot: commondir first; without commondir only a <main>/.git/worktrees/<id> gitdir climbs to <main>; any other .git file (submodule) stays at the dir holding it"
  - "Objective-dir TRD/SUMMARY/VERIFICATION/CONTEXT/RESEARCH take an OPTIONAL <prefix>- (gh-cache OWNED_OBJECTIVE_FILE_RE shape), so every file 47 owns stays cache; the generic <prefix>-<SUFFIX>.md doc rule requires the prefix and excludes legacy JOB"
  - "A dot segment ANYWHERE (not only the first) is runtime: no verb writes wiki/.git/** or editor swap files"
  - "Hints carry concrete arguments when the path names them (objective id from the dir, TRD id from the file, the rel for doc put, stem/N for entities); otherwise the table's placeholder"
  - "Entity ids use the lowercased stem (48-02 grammar); a stem the grammar refuses keeps class cache with entity null"
  - "VERB_TABLE holds the primary verb of each rule (10 verbs); hint-only secondary verbs (todo complete, debug resolve, quick summary, decision answer, objective set-status) are not in it"
  - "Ledger takes no lock (callers may hold the outbox lock); forget writes only when something was removed; settleCandidates returns {matching, drifted}, a missing/unreadable file counts as drifted"

patterns-established:
  - "Later 48 TRDs call planningMode/classify/ledger instead of reading github.store or path shapes themselves"

requirements-completed: [GWP-01, GWP-03, GWP-04]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 12min
completed: 2026-10-01
---

# Objective 48 TRD 01: Planning mode switch, path classifier, verb-write ledger Summary

**Three hook-safe modules: a strict-boolean `local`/`store` switch that resolves the main checkout from any worktree without
spawning git, a total classifier that maps every `.planning/` path to tracked-config/cache/generated/runtime plus its owning
verb and entity id, and an out-of-tree verb-write ledger beside the outbox journal and cache index.**

## Performance

- Started 2026-10-01T11:44Z, finished 2026-10-01T11:56Z (about 12 min)
- 3 tasks, 6 commits (RED and GREEN for each), 6 files created

## Accomplishments

- `planning-mode.cjs`: `store` only for `github.enabled === true && github.store === true` in the MAIN checkout's config; the string
  `"true"`, malformed JSON, non-object JSON, a missing config and a missing `.planning/` are all `local`. On this repo it reports
  `local` with root `/Users/justin/dev/devflow-claude` when called from the 48-01 worktree, so the D-01 store-off invariant holds.
- `planning-paths.cjs`: implements the TRD class table as an ordered rule array. On this repo's real `.planning/` it lists
  2 tracked-config, 3 generated, 815 cache and 43 runtime files.
- `planning-ledger.cjs`: `{version:1, entries:{rel:{hash, at, verb}}}` at `<stateDir>/<repoKey>.verb-writes.json`; hashes are
  gh-trd `contentHash`, so they compare directly with the 47 cache index. The cache-index format is untouched.

## Task Commits

| Task | RED | GREEN |
|---|---|---|
| 1: planning-mode | 4e6aad3 test(48-01): mode switch and main root | 9220d56 feat(48-01): planning-mode switch |
| 2: planning-paths | e6499ba test(48-01): planning path classifier | 45f2608 feat(48-01): planning path classifier |
| 3: planning-ledger | dd10c04 test(48-01): verb-write ledger | e05c26a feat(48-01): verb-write ledger |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: planning-mode | `node --test plugins/devflow/devflow/bin/lib/planning-mode.test.cjs` | 0 | PASS (27/27) |
| 2: planning-paths | `node --test plugins/devflow/devflow/bin/lib/planning-paths.test.cjs` | 0 | PASS (79/79) |
| 3: planning-ledger | `node --test plugins/devflow/devflow/bin/lib/planning-ledger.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs` | 0 | PASS (101/101) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED 1 | `node --test .../planning-mode.test.cjs` | 1 (module missing) | FAIL (correct) |
| GREEN 1 | `node --test .../planning-mode.test.cjs` | 0 | PASS (correct) |
| RED 2 | `node --test .../planning-paths.test.cjs` | 1 (module missing) | FAIL (correct) |
| GREEN 2 | `node --test .../planning-paths.test.cjs` | 0 | PASS (correct) |
| RED 3 | `node --test .../planning-ledger.test.cjs` | 1 (module missing) | FAIL (correct) |
| GREEN 3 | `node --test .../planning-ledger.test.cjs .../gh-outbox.test.cjs` | 0 | PASS (correct) |

No REFACTOR commits: none of the GREEN code needed cleanup.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test planning-mode.test.cjs planning-paths.test.cjs planning-ledger.test.cjs` | 0 | PASS (129/129) |
| regression | `node --test gh-outbox.test.cjs gh-cache.test.cjs` | 0 | PASS (132/132) |
| verification | `rg -n "child_process"` over the three modules | 1 (no match) | PASS |
| verification | `rg -n "github.store\|\.store\b"` over `planning-*.cjs` | 0 | PASS: only planning-mode.cjs and its test |
| full suite | `node --test` over the `npm test` globs (worktree, absolute paths, dot reporter) | 1 | 8166 pass, 2 leaf failures, neither from 48-01 (see below) |

Full-suite failures, both outside this TRD's files:

- **MA-7** in `handoff-e2e.test.cjs` (doctl auth, plus its parent suite "PTY-path mock auth"): the known pre-existing flake. Noted, not fixed.
- **`planning-writes.audit.test.js` test 10** ("classify-session.js [session start]"): `spawnSync ... node EPIPE` while the whole suite
  ran in parallel. The same file passes on its own (`node --test plugins/devflow/hooks/planning-writes.audit.test.js`, exit 0). This
  TRD touches no hook, so the failure was transient resource contention.

## Deviations from Plan

None that change the TRD's contract. Within the TRD's latitude, two choices go further than the table's literal text:

1. **Optional prefix for the 47-owned objective docs.** The table writes `objectives/<dir>/*-TRD.md` and `<prefix>-<SUFFIX>.md`. gh-cache
   `OWNED_OBJECTIVE_FILE_RE` and gh-wiki `objectiveDocRule` also own bare `CONTEXT.md` / `RESEARCH.md` (and `TRD/SUMMARY/VERIFICATION`
   without a prefix). Requiring the prefix would make 48-07's classifier-based `listOwnedLocal` drop files 47 owns. The generic doc rule
   still requires the prefix, so a bare `README.md` stays runtime.
2. **Dot segments at any depth are runtime**, not only in the first segment. The literal table would class `wiki/.git/HEAD` as cache
   (`doc put`). This change only moves paths toward runtime, which is the safe direction.

## Notes for later TRDs

- **48-10 / 48-12 (migration, import):** legacy TRD names of the form `NN-MM-TRD-<slug>.md` (e.g. all of
  `objectives/07-handoff-watcher/`) classify as **runtime**, consistent with gh-hierarchy `TRD_FILE_RE`, which cannot parse them either.
  Under the U-1 gitignore, migration 0010 would untrack them and `planning import` would skip them. Decide on a rename or an
  explicit carve-out before running 0010 on this repo.
- **48-11 (ledger writes):** the ledger is a short read-modify-write with no lock of its own. Record while holding the outbox lock
  if two verbs can write at once.
- **Home-mirror df-tools lacks `--cwd`:** `~/.claude/devflow/bin/df-tools.cjs` (the installed mirror) rejects `--cwd`, so commits
  from a worktree went through the worktree's own `plugins/devflow/devflow/bin/df-tools.cjs --cwd <worktree> commit`, as the
  TRD's binding rules specify.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (strict-boolean mode from the MAIN config; fs-only `resolveMainRoot`; total classify with verb and hint;
  the table rows asserted by test 5; exact `gitignoreLines`; the ledger beside the journal and cache index with nothing under the repo
  or HOME; no `gh`/`git` spawn in any module)
- Gate failures: None

## Self-Check: PASSED

- FOUND: all 6 key files (each ran under `node --test` above)
- FOUND: commits 4e6aad3, 9220d56, e6499ba, 45f2608, dd10c04, e05c26a (`git log baad394..HEAD`)
- STATE.md / ROADMAP.md deliberately not edited: the orchestrator updates them after merging the wave
