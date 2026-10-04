---
objective: 48-planning-write-path-migration
trd: "14"
subsystem: planning-verbs
tags: [store-mode, cache-writers, objective-ops, frontmatter, template-fill, requirements, ledger, characterization, tdd]

requires:
  - objective: 48-planning-write-path-migration
    provides: "48-01 planning-mode (isStoreMode, resolveMainRoot), planning-paths (classify, relToPlanning), planning-ledger (record)"
  - objective: 48-planning-write-path-migration
    provides: "48-11 planning-verbs (objectivePut, objectiveSetStatus, docPut), gh-store-cli UNQUEUED_MARK"
provides:
  - "objective.cjs: store branches for objective add (objective put), remove (refused), complete (objective set-status complete); insert unchanged (deprecated, writes nothing)"
  - "frontmatter.cjs: storeCacheRefusal — frontmatter set|merge refuse a cache-class target in store mode, naming the owning verb and `planning draft`"
  - "templates.cjs: template fill records its draft in the verb-write ledger (`template fill (not queued)`) and reports publish_with"
  - "misc.cjs: requirements mark-complete publishes REQUIREMENTS.md with doc put in store mode"
  - "__fixtures__/store-cli-fixtures.cjs: storeCliProject — spawned-df-tools store/local project with an offline gh shim, temp HOME/outbox, loopback-offline wiki remote, seeded v3 mapping"
affects: [48-15, 48-17, 48-19, 48-22]

tech-stack:
  added: []
  patterns:
    - "Characterization first: local-mode bytes and stdout pinned and committed green before any production change"
    - "One early store guard per command; the local body is textually unchanged"
    - "planning-verbs / planning-paths / planning-ledger required lazily inside the store branch"
    - "Offline GitHub for spawned CLI tests: 26 one-letter gh-shim prefixes with network stderr, wiki remote on loopback port 9"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/misc-requirements.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/store-cli-fixtures.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/objective.cjs
    - plugins/devflow/devflow/bin/lib/objective.test.cjs
    - plugins/devflow/devflow/bin/lib/frontmatter.cjs
    - plugins/devflow/devflow/bin/lib/frontmatter.test.cjs
    - plugins/devflow/devflow/bin/lib/templates.cjs
    - plugins/devflow/devflow/bin/lib/templates.test.cjs
    - plugins/devflow/devflow/bin/lib/misc.cjs

key-decisions:
  - "Store `objective add` writes OBJECTIVE.md carrying the entry today's add appends to ROADMAP.md (heading, Goal, Depends on, Jobs) under frontmatter `objective: <dir>`, `status: planned`; no .gitkeep (the dir holds OBJECTIVE.md and .planning/ is untracked in store mode)"
  - "Store `objective add` tolerates a missing ROADMAP.md (generated view not rendered yet) and numbers from the objective dirs"
  - "A new objective cannot be created offline (48-11 objectivePut): `objective add` then exits 1 with the verb error, `published:false` and a `df-tools gh sync <N>` hint; the OBJECTIVE.md write is ledgered `objective put (not queued)`"
  - "Store `objective complete` output keeps today's keys (roadmap_updated/state_updated false, state_update_reason `store_mode`), adds `completed`, `roadmap:'generated (gh pull --all)'` and `verb`; exit code is the verb's (3 pending offline)"
  - "`objective remove` refusal substitutes the target id: `... df-tools objective set-status 7 cancelled`; it fires before --force/--confirm handling, so nothing is deleted with any flags"
  - "template fill ledgers with `template fill (not queued)`, not plain `template fill`: GitHub does not hold the draft, so no drained flush may baseline it (48-11 pitfall-1 rule); W055 compares hashes only, so it stays quiet either way"
  - "frontmatter refusal resolves the target against the MAIN .planning/ first, then the cwd's, so a worktree path cannot bypass it; only class `cache` is refused (runtime, tracked-config, generated and non-planning paths work as today)"
  - "requirements mark-complete reads the MAIN checkout's REQUIREMENTS.md in store mode; nothing found -> nothing written, nothing queued, exit 0"

patterns-established:
  - "Spawned-CLI store tests use storeCliProject({store}) and assert cache file, ledger and journal ops, never GitHub objects"

requirements-completed: [GWP-01, GWP-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 16min
completed: 2026-10-01
---

# Objective 48 TRD 14: Cache writers in store mode Summary

**In store mode the df-tools commands that wrote cached planning files now go through the verbs or refuse.
`objective add` and `objective complete` call `objective put` and `objective set-status`, and `objective remove` is refused.
`frontmatter set|merge` on a cache file names the owning verb. `template fill` ledgers its draft, and
`requirements mark-complete` publishes with `doc put`. Characterization tests, committed before any change, pin local mode
byte for byte.**

## Performance

- Started 2026-10-01T12:52Z (preflight claim), finished about 2026-10-01T13:08Z (about 16 min)
- 3 tasks, 9 commits (characterization, RED and GREEN for each task), 2 files created, 7 modified

## Accomplishments

- **objective.cjs.** Each command has one `planningMode.isStoreMode(cwd)` guard, and the store branch works on the MAIN checkout (D-14).
  - `add`: numbers and slugs the objective exactly as the local body does, creates the dir and writes OBJECTIVE.md through `objectivePut`. ROADMAP.md and STATE.md are never touched. The output adds `objective_file`, `roadmap:'generated (gh pull --all)'`, `published` and `verb`.
  - `remove`: errors with "objective remove is refused in store mode: deletes are never automatic. Close the objective issue with df-tools objective set-status <id> cancelled". It makes no gh call.
  - `complete`: runs `objectiveSetStatus(id,'complete')`, which queues a patch-issue with `{state:'closed', state_reason:'completed'}`. ROADMAP, STATE and REQUIREMENTS are not edited.
  - `insert`: unchanged. It has been deprecated since 12-06 and writes nothing in either mode, so it has no guard. Tests 1b and 4b pin it.
- **frontmatter.cjs.** `storeCacheRefusal(cwd, fullPath)` runs in `set` and `merge` after the existence check, with lazy requires.
  - A cache target is refused: "`<rel>` is a GitHub-backed cache file in store mode; frontmatter edits go through df-tools `<verb>` (edit a draft: df-tools planning draft `<rel>`)".
  - `get` and `validate` are unchanged.
- **templates.cjs.** After today's write, store mode records the draft in the ledger and adds `publish_with`: `summary post`, `verification post` or `plan put-trd`. It makes no gh call and queues nothing.
- **misc.cjs.** `cmdRequirementsMarkComplete` makes today's edit in memory, then calls `docPut(root, {rel:'REQUIREMENTS.md', text, message:'requirements: mark <ids> complete'})`. The output is today's plus `verb`, and the exit code is the verb's. Only this function changed; 48-10's `cmdCommit` is untouched, and misc-commit tests are green.

## Task Commits

| Task | Characterization | RED | GREEN |
|---|---|---|---|
| 1: objective ops | be52a8c9 test(48-14): characterize local-mode objective ops | b3bfa9ec test(48-14): objective ops in store mode | c29428cb feat(48-14): objective ops route through verbs in store mode |
| 2: frontmatter + template fill | 233cabca test(48-14): characterize local-mode frontmatter set/merge and template fill | 964fc39b test(48-14): frontmatter and template fill in store mode | bb1506ac feat(48-14): frontmatter and template fill respect the cache |
| 3: requirements | 29858461 test(48-14): characterize local-mode requirements mark-complete | ea167e91 test(48-14): requirements mark-complete in store mode | c92acad4 feat(48-14): requirements mark-complete publishes to the wiki in store mode |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1 | `node --test plugins/devflow/devflow/bin/lib/objective.test.cjs` | 0 | PASS (30/30) |
| 2 | `node --test .../frontmatter.test.cjs .../templates.test.cjs` | 0 | PASS (48/48) |
| 3 | `node --test .../misc-requirements.test.cjs .../misc-commit.test.cjs` | 0 | PASS (15/15) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| CHAR 1 (1a-1d) | `node --test --test-name-pattern 48-14 objective.test.cjs` | 0 | PASS on unchanged code (correct) |
| RED 1 (2, 2b, 2c, 3, 3b, 4) | same | 1 (6 fail; 4b insert guard passes) | FAIL (correct) |
| GREEN 1 | `node --test objective.test.cjs` | 0 (30/30) | PASS (correct) |
| CHAR 2 (5, 5b, 8) | `node --test --test-name-pattern 48-14 frontmatter.test.cjs templates.test.cjs` | 0 | PASS on unchanged code (correct) |
| RED 2 (6, 6b, 7, 9, 9b) | same | 1 (5 fail; 6c and 7b local-behaviour guards pass) | FAIL (correct) |
| GREEN 2 | `node --test frontmatter.test.cjs templates.test.cjs` | 0 (48/48) | PASS (correct) |
| CHAR 3 (10, 10b) | `node --test misc-requirements.test.cjs` | 0 | PASS on unchanged code (correct) |
| RED 3 (11) | same | 1 (11 fails; 11b nothing-found guard passes) | FAIL (correct) |
| GREEN 3 | `node --test misc-requirements.test.cjs misc-commit.test.cjs` | 0 (15/15) | PASS (correct) |

No REFACTOR commits.

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test objective.test.cjs frontmatter.test.cjs templates.test.cjs misc-requirements.test.cjs` (+ misc-commit) | 0 | PASS (93/93) |
| regression | `node --test df-tools.test.cjs planning-verbs.test.cjs` | 0 | PASS (174/174) |
| verification | `rg -n "isStoreMode" objective.cjs frontmatter.cjs templates.cjs misc.cjs` | 0 | PASS: add, remove, complete, frontmatter (one guard shared by set+merge), template fill, requirements |
| extra regression | `node --test gh-store-cli gh-shim planning-ledger gh-store-e2e planning-drift state validate .test.cjs` | 0 | PASS (321/321) |
| full suite | `npm --prefix <worktree> test` | 1 | 7431 tests, 7397 pass, 2 fail, 32 skipped. Both are expected and unrelated: **MA-7** (handoff-e2e PTY doctl auth, the known flake; noted, not fixed) and **roadmap-reconcile E2E1** (fails while this SUMMARY exists and ROADMAP.md still shows the TRD as `[ ]`; the orchestrator's ROADMAP update clears it) |

### Store-off invariant (this repo)

- `planningMode(<worktree>)` returns `{"mode":"local","reason":"github.enabled is not true","root":"/Users/justin/dev/devflow-claude"}`.
- Every characterization test runs with `github.enabled: true` and no `store`. Each asserts the exact stdout and bytes on disk, zero gh calls, no outbox journal and no ledger. `objective complete 48` at the end of this objective takes the unchanged local body.

## Deviations from Plan

**1. [Rule 1 - Spec vs. 48-11 semantics] Test 2 (`objective add`) cannot exit 3 offline.** Objective 8 has no issue yet, and 48-11's `objectivePut` → `gh.syncObjective` refuses to create one offline. That gives exit 1 with "GitHub is unreachable and objective 8 has no issue yet; it cannot be created offline".
- Test 2 asserts that honest result: the dir and OBJECTIVE.md are written, ROADMAP is untouched, and the ledger shows `objective put (not queued)`. Nothing is queued for `8`, and the hint names `df-tools gh sync 8`.
- Test 2c covers the queued path that the TRD described. When `add` reuses a number the mapping already knows, it exits 3. Patch-body and wiki-push are queued, and the ledger shows `objective put`.

**2. [Rule 2 - Correctness] template fill ledgers as `template fill (not queued)`.** The TRD wrote `{verb:'template fill'}`. An unmarked entry would be settled by the next drained flush of any verb, which baselines a draft GitHub does not hold (48-RESEARCH pitfall 1, the same reason 48-11 introduced the mark). W055 compares hashes only, so it is unaffected, and the publishing verb clears the mark.

**3. [Rule 3 - Blocking] New shared test fixture `__fixtures__/store-cli-fixtures.cjs`** (not in files_modified). The TRD's `installGhShim({table:{}, defaultCode:1})` does not look offline. The shim's "no match" stderr is classified `error`, so `gh auth status` throws "not authenticated" and verbs exit 1. A missing `file://` wiki remote reads as an *uninitialised* wiki, and the flush halts (exit 2).
- The fixture answers every gh call with network stderr, using 26 one-letter prefixes.
- It points `DEVFLOW_WIKI_REMOTE` at `http://127.0.0.1:9/o/r.wiki.git`, the loopback discard port, which classifies as offline and is never 8080.
- It seeds a v3 mapping for objective 7.
- The wiki-remote half was found during Task 3 GREEN and committed with c92acad4.

**4. [Scope] `objective insert` has no store branch.** It has been deprecated since 12-06, exits 1 and writes nothing, so it has no decimal numbering to preserve. Both modes are pinned (1b, 4b).

**5. Store `objective complete` keeps today's output keys.** It adds `completed` and `verb`, and sets `state_update_reason:'store_mode'`. REQUIREMENTS.md traceability, which the local body ticks from the ROADMAP `**Requirements:**` line, is not touched in store mode. Requirements are published with `requirements mark-complete`, which goes through doc put.

## Known limitations / notes for later TRDs

- **New objective title (46/47 behaviour, not changed here).** gh `readObjectiveState` takes an objective's name and goal from ROADMAP.md. In store mode ROADMAP.md is generated, so a just-added objective's issue would be titled from its id until the view lists it. The OBJECTIVE.md heading carries the description. 48-15/48-19 may want `readObjectiveState` to fall back to the OBJECTIVE.md heading.
- **Generated views are not refused by `frontmatter set`.** Only class `cache` is refused, as the TRD specifies. W055 already reports a hand-edited generated view.
- **48-15 (CLI):** the store outputs carry `verb` (`ok, mode, rel, exit, flush, warnings, error?, note?, prose?`). The exit codes are gh-store-cli's EXIT (0/1/2/3).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5 (local byte-identical for all eight commands; store add/insert/remove/complete per D-08/D-19; frontmatter cache refusal naming the verb, runtime/non-planning paths still work; template fill ledgered with publish_with; requirements via docPut with the wiki-push queued)
- Gate failures: None from this TRD

## Self-Check: PASSED

- FOUND: all 9 key files (each ran under `node --test` above)
- FOUND: commits be52a8c9, b3bfa9ec, c29428cb, 233cabca, 964fc39b, bb1506ac, 29858461, ea167e91, c92acad4 (`git log c5832594..HEAD`)
- STATE.md / ROADMAP.md deliberately not edited: the orchestrator updates them after merging the wave
