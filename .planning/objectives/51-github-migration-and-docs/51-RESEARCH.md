# Objective 51: GitHub migration and docs - Research

**Researched:** 2026-10-01
**Domain:** DevFlow upgrade migration (backfill into the GitHub store), fake-GitHub testing, documentation correctness, decision recording
**Confidence:** HIGH (everything below is read from the repo at HEAD `697cdbb5`; no external sources needed, the platform limits are quoted from the locked proposal)

<user_constraints>
## User Constraints (from OBJECTIVE.md, the proposal and the orchestrator brief)

### Locked Decisions
- Design source is `docs/PROPOSAL-github-system-of-record.md` (decisions locked 2026-09-30). Do not re-litigate: GitHub is authoritative, `.planning/` is a gitignored cache, one PR per objective, outbox pacing, wiki for reference text, degraded mode without org features.
- Strict TDD (kind `plugin`): the failing test is committed first.
- Tests mock `gh` through `_setRunGh` / temp dirs / env overrides. Never call the real GitHub API, never touch the real `~/.claude`.
- Never use port 8080.
- **GMD-04 is DECIDED by the user: objective 26 (GitHub issue auto-build monitor) is KILLED.** (OBJECTIVE.md says "re-based or killed"; the orchestrator brief resolves it to killed. Research only how to record it.)
- Requirements: GMD-01 (confirm `upgrade` migration, backfill then switch to the cache model), GMD-02 (dry-run shows the full plan and request count first), GMD-03 (USER-GUIDE + CLAUDE.md rewritten, `/devflow:gh-sync` repurposed or retired, doc-refs updated), GMD-04 (objective 26 decision recorded).
- Success criteria: (1) a 20-objective fixture backfills under the secondary limits and resumes after interruption; (2) re-running is a no-op; (3) docs pass doc-refs and `npm test` is green.

### Claude's Discretion
- Whether the migration is a thin wrapper or new code; how the estimate is computed; whether `/devflow:gh-sync` is repurposed or retired; how the kill is recorded.

### Deferred Ideas (OUT OF SCOPE)
- Stacked PRs; live-GitHub verification of the reusable workflow (open items of objective 50); any auto-build monitor work.
</user_constraints>

<phase_requirements>
## Objective Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GMD-01 | confirm migration: backfill + switch to cache model | Section 1: compose `planning import` + outbox flush + `pull --all` + 0010 under new migration 0011; gaps G1-G6 are new code |
| GMD-02 | dry-run shows full plan and request count | Section 1.5: extend `planImport` dry-run with an `estimate` block, surface it through 0011 `detect` reason and a `--dry-run` path |
| GMD-03 | docs rewritten, gh-sync repurposed, doc-refs updated | Section 3: repurpose in place (no rename, so doc-refs maps are untouched); CLAUDE.md slimmed, detail to USER-GUIDE |
| GMD-04 | objective 26 decision recorded | Section 4: `objective set-status 26 cancelled` + disposition text + ROADMAP/STATE lines; never `objective remove` |
</phase_requirements>

## Summary

Most of the backfill already exists. Objective 48's `planning import [--dry-run]` (`plugins/devflow/devflow/bin/lib/planning-import.cjs:163`) walks every un-baselined cache file, queues one hierarchy push per objective (`gh-hierarchy.pushHierarchy`, `gh-hierarchy.cjs:483`), Decision issues, entity issues (todos/debug/quick), one wiki push and milestone pages, then runs ONE flush and lets the drained flush baseline the ledgered files (`gh-store-cli.cjs:210` `settleLedger`). Migration 0010 (`migrations/0010-store-gitignore.cjs`) then gitignores and untracks the cache and refuses until the journal is drained and every cache file has a baseline. Objective 51 therefore needs a thin orchestrating migration (0011) plus a small number of real gaps, not a second importer.

The gaps are the interesting part. (G1) Nothing closes the issues of finished work: `buildOps` (`gh-hierarchy.cjs:392`) only creates and links, so a backfill of this repo (57 objective dirs, 336 TRDs, 334 SUMMARYs) would open ~400 issues for work that shipped months ago. (G2) The cost is large: this repo is roughly 2,000 budgeted writes; the journal budget is 80/min **and 450/h** (`gh-outbox.cjs:47`, the proposal text says 500/h; the code governs), so the wall clock is hours and the migration MUST be a resumable multi-session process, not a blocking call. Even the 20-objective fixture crosses the hourly budget, which is what makes SC1 testable. (G3) `planImport` has no request estimate. (G4) The upgrade runner is single-shot and ordered by id, so 0010 (id lower than 0011) runs first on a resume and halts the runner. (G5) The unmapped-objective issue creation inside `gh.syncObjective` writes live, outside the journal budget. (G6) The store switch must come before the import (`planImport` refuses in local mode) and the follow-up commit needs the logged gate escape.

Docs: the USER-GUIDE and CLAUDE.md still describe "planning files remain the source of truth, GitHub is derivative" in several places, the USER-GUIDE migration table stops at 0006, and CLAUDE.md's single GitHub bullet is 5,688 characters of a 30,869-character resident file. Repurposing `/devflow:gh-sync` in place keeps `DEPRECATION_MAP`/`REMOVED_COMMANDS` untouched and avoids touching `route-intent.js`, `flow`, `sync-roadmap` and the global CLAUDE.md template.

**Primary recommendation:** add migration `0011-github-store-backfill` (confirm, `since: '2.13.0'`) as a phase machine over existing library calls (preflight, store switch, `planImport`, bounded flush loop, `pull --all` verification, then 0010's `migrate`); add one new module `gh-backfill.cjs` for the genuinely new pieces (history-close ops, estimator, resume logic); test through the existing fake GitHub with a new 20-objective fixture builder and a fake clock.

## Standard Stack

No new dependencies. Everything is Node built-ins plus existing in-repo libraries.

### Core
| Module | Path (under `plugins/devflow/devflow/bin/lib/`) | Purpose | Why standard |
|---|---|---|---|
| upgrade runner | `upgrade.cjs` | registry, `check`, `apply`, backup, stamp | Only migration entry point; `upgrade-cli.cjs` fronts it |
| planning import | `planning-import.cjs` | queue everything un-baselined, one flush | Already idempotent, has `--dry-run`, reports refused/kept_local |
| outbox | `gh-outbox.cjs`, `gh-outbox-flush.cjs` | durable journal, budget, coalescing, flush | The only sanctioned writer; resumable by construction |
| hierarchy | `gh-hierarchy.cjs` | `planPush`, `buildOps`, `pushHierarchy`, `openDecision` | The ops a backfill needs |
| store CLI | `gh-store-cli.cjs` | `EXIT`, `flushResult`, `settleLedger` | Exit codes 0/1/2/3 and ledger settle |
| 0010 | `migrations/0010-store-gitignore.cjs` | `migrate`, `detect`, `discover` | Reuse as the final phase; do not reimplement |
| mode | `planning-mode.cjs` | store switch reader (strict booleans) | Only reader of `github.store` |

### Supporting (tests)
| Module | Path | Purpose |
|---|---|---|
| fake GitHub | `__fixtures__/gh-fake.cjs` (`createFakeGitHub`) | issues, comments, milestones, wiki flag, `failNext`, `setOffline`, `writes()`, `writeTimes()` |
| store fixtures | `__fixtures__/gh-store-fixtures.cjs` | `makeStoreProject`, `hermeticEnv`, `oversizedTrdText` |
| wiki remote | `__fixtures__/wiki-remote.cjs` | `createWikiRemote`, `gitAvailable`, `applyGitTestEnv` (local bare repo over file://) |
| upgrade fixtures | `__fixtures__/upgrade-fixtures.cjs` | `makeFakeHome`, `initGitFixture`, `snapshot`, `diffSnapshots` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| Wrapper migration over `planImport` | New standalone importer | Rejected: duplicates ledger/baseline/refused logic that 48-12 already tests |
| Blocking apply that sleeps through hour budgets | Resumable phases | Rejected: a flush that waits an hour per 450 writes would hold a SessionStart/CLI for hours; the `gh-flush` hook already continues a drain at Stop |

**Installation:** none. NB the installed mirror `~/.claude/devflow/bin/df-tools.cjs` is stale in this checkout (it answers `Unknown command: doc` and has no `decision`); run the repo copy, `node plugins/devflow/devflow/bin/df-tools.cjs`, for every verb below until the mirror re-syncs.

## 1. GMD-01 / GMD-02: the backfill migration

### 1.1 How migrations are structured (what 0011 must satisfy)

- Registry: `upgrade.cjs:67` `loadRegistry` loads `migrations/NNNN-<slug>.cjs` (not `*.test.cjs`); contract check at `upgrade.cjs:36`: `id` 4 digits equal to the filename, non-empty `title`, `since` `X.Y.Z`, `safety` in `auto|confirm`, sync `detect(ctx) -> {applies, reason}` and sync `apply(ctx) -> {changed:[posix rel paths], notes}`.
- `ctx = {projectRoot, userHome, pluginVersion, dryRun, options}`; `userHome` is injected, never resolved by the module (`upgrade.cjs:11`). Tests must pass a temp home.
- Next number is **0011**. Existing: 0001-0010; 0009 `since: '2.13.0'` (`0009-gh-mapping-v3.cjs:113`), 0010 `since: '2.13.0'` (`0010-store-gitignore.cjs:396`); `plugin.json` is 2.12.0, so 2.13.0 is the unreleased version. Use `since: '2.13.0'`.
- Selection (`upgrade.cjs:430`): an `auto` migration runs on a bare `--apply`; a `confirm` one only when named (`--only 0011`) or with `--apply --confirm`. `upgrade-project.js` (SessionStart) applies `auto` only, so a confirm migration can never run unattended. 0011 must be `confirm`.
- Backup: the runner calls `backup()` once before the first write (`upgrade.cjs:436`): `.planning/` + CLAUDE.md copied to `~/.claude/devflow/backups/<repo>-<hash>/<ts>/`. A migration needing more (0010 stores the old `.gitignore` and the untracked list there) gets the dir back as `report.backup`; 0010 re-calls `upgrade.backup` itself (`0010...cjs:353`).
- Failure semantics: `apply` throwing marks `failed`, sets `halted` (later migrations are left pending) and the id is not stamped (`upgrade.cjs:456-460`). `migrations_applied` is only a record; `detect` is the source of truth, so a half-done migration stays `applies: true`.
- Dry run: `upgrade.check` calls `detect` with `dryRun: true` and reports `{id, title, reason}` under `pending_confirm` (`upgrade.cjs:371`). It never calls `apply`. `upgrade --dry-run` is rejected unless combined with `--prune` (`upgrade-cli.cjs:122`). Therefore GMD-02's "full plan and request count" must travel in the `detect` **reason** string (multi-line is fine in `--raw` JSON) or in a new dry-run entry point (recommended: both, see 1.5).
- 0010 is the model: confirm, store-mode-only, local `detect`, preconditions that refuse with every blocker listed and the remedy, `apply` throws on refusal (`0010...cjs:383`).

### 1.2 What already does backfill-like work

| Piece | Where | What it covers | Idempotence |
|---|---|---|---|
| `planning import` | `planning-import.cjs:163-333` | objectives (hierarchy push, or `gh.syncObjective` find-or-create when unmapped, `:209`), Decision issues + answers (`:224`), todos/debug/quick (`ev.importEntity`, `:261`), one wiki push (`ev.docsPut`, `:283`), `## vX.Y` milestone sections (`:297`), refused >60,000-char TRDs, `kept_local` (decision without `trd:`, legacy-named TRDs), one flush (`:320`) | selects only files with no baseline in the cache index (`:174`), so a drained second run queues nothing (tested: `planning-import.test.cjs` test 11) |
| `gh sync --all` store mode | `gh.cjs:1795-1800` | objectives + hierarchy only, `deferFlush` | superset-of-nothing: no decisions/entities/docs/milestones; do not use |
| outbox | `gh-outbox.cjs` | `BUDGET {minute: 80, hour: 450}` (`:47`), `enqueue` coalesces a pending op with the same kind+target (`:667-695`), journal atomically rewritten, ops `pending|done|blocked`, `halted` | upsert handlers scan GitHub by `devflow:id` marker, so a lost mapping or an interrupted create does not duplicate (`gh-outbox-flush.cjs:494-540`) |
| flush | `gh-outbox-flush.cjs:1560-1640` | strict `seq` order; sleeps up to 3x on the **minute** budget when `wait`; the **hour** budget returns `pending {reason:'budget', budget:'hour', wait_ms}` (`:1593-1600`); a secondary limit marks the op pending with `retry_after` (`:1624`); offline marks pending; a remote edit halts; others block+halt; `maxOps` option (`:1589`) | resumable: state is the journal, not the process |
| exit codes | `gh-store-cli.cjs:35,196` | 0 flushed/skipped/running, 1 error, 2 halted, 3 pending | `flushResult` settles the ledger only on a drained `flushed` |
| `gh-flush.js` hook | `hooks/gh-flush.js` | `gh outbox flush --no-wait` bounded 20 s (PostToolUse) / 30 s (Stop) in store mode | continues a long drain across sessions with no migration involvement |
| wiki | `gh-wiki.cjs`, `handleWikiPush` (`gh-outbox-flush.cjs:1092`) | git push to the wiki clone at `.planning/wiki/`; first page must exist (`DEFAULT_WIKI_BLOCK`, `:235`) | git, not REST: no budget cost |
| 0010 | see 1.1 | gitignore block + `git rm --cached`; refuses on pending/blocked/halted journal, any cache file without a baseline, legacy TRD names | `detect` false once only config.json and STACK.md are tracked and the block is current |

### 1.3 Recommendation: thin wrapper plus a small `gh-backfill.cjs`

Do not write a second importer. Migration `0011-github-store-backfill.cjs` is a phase machine; `gh-backfill.cjs` holds the new pieces so the migration file stays readable and the pieces are unit-testable without the upgrade runner.

Phases (each re-entrant; the journal and the cache index are the only state):

0. **Preflight (local, no writes).** `github.enabled === true` and `github.repo` set (else `detect` is `applies:false`, reason "GitHub integration not enabled": zero gh calls, parity with local mode). Refuse listing every blocker: not a git work tree; a `merge/rebase` in progress; an outbox journal with `halted` or `blocked` ops (a human must resolve first); legacy-named TRDs (0010 will refuse them anyway; list them up front with the rename).
1. **Connectivity preflight (apply only, never in `detect`).** `gh auth`, capability detection (`gh-capability.detectCapabilities`, as `pushHierarchy` does, `gh-hierarchy.cjs:504`) and the wiki first-page check. A wiki with no first page halts the flush (`DEFAULT_WIKI_BLOCK`): fail here with the one-line fix instead of 20 minutes in. Read-only token (`modes.writable === false`) refuses.
2. **Store switch.** Write `github.store: true` into `.planning/config.json` (config.json stays tracked, U-1). It must precede the import because `planImport` returns `{ok:false, error:'planning import needs github.store: true'}` in local mode (`planning-import.cjs:170`) and `planning-mode.cjs` is the single reader. Consequence to accept and document: from here until 0010 runs, the edit gate denies cache edits and `df-tools commit` refuses the default branch; the backup taken by the runner is the rollback (`github.store: false` restores local behaviour byte for byte, D-01).
3. **Queue.** If the journal already has pending ops, SKIP the import (resume path, see pitfall P3) and go to 4. Otherwise `planImport(root, {dryRun:false})` plus `gh-backfill` history-close ops (G1).
4. **Drain.** Bounded loop: `flushLib.flush(root, {wait:true})`; on `pending/budget/hour` stop and return "N ops remain; re-run `df-tools upgrade --apply --only 0011 --confirm` (or just keep working: the gh-flush hook drains it)". On `halted` stop with `gh outbox status` guidance (exit 2 semantics). The migration `apply` THROWS a typed refusal for pending/halted so the runner reports `failed` and never stamps (same shape as 0010's refusal). Work already done stays in the journal.
5. **Verify.** After a drained `flushed`: `gh pull --all` (exit 0 clean, 2 rebuilt-with-attention) and per-objective orphan report (`gh orphans`, `gh-hierarchy.reportOrphans`, `:659`): every TRD file has an issue and vice versa. Any gap refuses 0010.
6. **Switch to the cache model.** Call `require('./0010-store-gitignore.cjs').migrate(ctx)` in-process (it re-checks journal, baselines, legacy names, backs up). Return its `changed`/`notes`. Print the commit follow-up with the gate escape (P6).

`detect(ctx)` (local, offline, `dryRun`-safe): `applies:false` when GitHub is disabled; `applies:true` when store is off; when store is on, `applies:true` iff un-baselined cache files exist, or the journal has pending/blocked ops, or 0010 would still apply and phases 4-5 are complete. Once store is on, the journal is drained, every cache file is baselined and only config.json/STACK.md are tracked with a current block, `applies:false` ("already on GitHub"). That is the SC2 no-op.

### 1.4 Gaps to close (these are the new code)

| # | Gap | Evidence | Fix |
|---|---|---|---|
| G1 | **Historical work is created open.** `buildOps` emits no `state` for finished objectives/TRDs; the only closers are PR merge (`Closes #`), `objective set-status`, `gh-pr` reconcile, `gh-check-cli`. A backfill would open ~400 issues for this repo. | `gh-hierarchy.cjs:392-458`; `STATUS_PATCH` `planning-verbs.cjs:419`; `patch-issue` accepts `state`/`state_reason` for any id (`gh-outbox.cjs:224-246`) | `gh-backfill.historyOps(root)`: for each imported objective, `patch-issue {state:'closed', state_reason:'completed'}` for every TRD that has a SUMMARY, and for the objective when OBJECTIVE.md `status: complete` or ROADMAP/progress marks it shipped; `not_planned` for `status: cancelled`. Enqueue AFTER the hierarchy ops so seq order creates before closing. Also close native milestones of shipped versions (`gh-milestone-store.cjs:259` `patchMilestone` state closed; the milestone verbs `milestone put|complete`). |
| G2 | **Hours of wall clock.** 20 objectives x ~5 TRDs is ~500 writes (> 450/h); this repo is ~2,000. | counts: 336 TRDs, 334 SUMMARYs, 57 objective dirs, 44 VERIFICATIONs (`ls .planning/objectives`); budget `gh-outbox.cjs:47` | Treat as resumable by design (phase 4). Do not raise the budget. Show the ETA in the dry-run (1.5). Open question OQ1 on archived-milestone history. |
| G3 | `planImport` dry-run reports counts per kind, not requests. | `planning-import.cjs:166` report shape | add `estimate` (1.5) |
| G4 | Runner order: 0010 < 0011, so on a resume `--apply --confirm` evaluates 0010 first; its `detect` applies (store on, files tracked) and `migrate` refuses (journal pending), which sets `halted` and leaves 0011 unrun (`upgrade.cjs:456-460`). | `upgrade.cjs:430-460`, `0010...cjs:344` | Resume with `--only 0011` (state it in every printed message) AND make 0010's `detect` return `applies:false, reason:'GitHub backfill (0011) in progress'` while the journal has pending ops and 0011 applies. Tested by an explicit `--apply --confirm` resume case. Do not renumber or reorder. |
| G5 | `gh.syncObjective` for an unmapped objective creates the objective issue **live** (`gh.cjs:1425-1515`, via `planImport` `:209`), outside the journal budget. With store on `syncObjective` queues the rest with `deferFlush`. 57 live creates are not recorded in `journal.writes`, so the hourly budget under-counts. | `gh-outbox-flush.cjs:1535` `recordWrites` (module-private) | wrap the queue phase: `before = client.writeCount()`; after, `outbox.recordWrite(journal, now)` x delta then `outbox.writeJournal` (both exported, `gh-outbox.cjs:1177,1190`). Pacing is still 1 write/s via the client (`gh-client.cjs:31`), so no secondary-limit risk, only budget accuracy. |
| G6 | Ordering/commit: the config flip, `.gitignore` block and index removals leave a dirty tree that `df-tools commit` refuses on the default branch (`reason: default_branch`), the exact hazard 50-13 documented for 0010 (printed `COMMIT_COMMAND` at `0010...cjs:67` is wrong in store mode). | `50-13-SUMMARY.md` "Open items"; CLAUDE.md gate bullet | 0011 prints: create branch, `DEVFLOW_SKIP_GH_GATE=1 df-tools commit ... --files .gitignore .planning/` (logged as gate `gh`), push, PR. Fix the same text in 0010's notes and doctor check 20 while here (docs-only strings; code in `0010` line 67). |

Decisions/todos/reference docs coverage: `planImport` already maps them (decisions with `trd:` to Decision issues, those without stay local and are reported `kept_local`; todos/debug/quick via `importEntity`; PROJECT, REQUIREMENTS, research/, milestones/, codebase/, objective docs through one wiki push; `## vX.Y` MILESTONES.md sections). Residual coverage questions for the planner to verify by test rather than assume: (a) a historical `decisions/pending|resolved/DECISION-NNN.md` with no `trd:` (this repo's DECISION-001 has `trd: 27-03`, so it imports; others may not); (b) archived `milestones/vX.Y-ROADMAP.md` and `*-MILESTONE-AUDIT.md` map to wiki pages (`gh-wiki.pageForCachePath`; unmapped ones are `kept_local`, which blocks 0010? it does not: 0010's baseline check only lists `cache` class files, and `kept_local` ones are untracked as `local_only`, but they stay in the backup only, so list them in the dry-run so the user decides); (c) `kept_local` and `refused` items must be printed by the migration as a "will stay local" table, never hidden.

### 1.5 GMD-02: the dry-run plan and request estimate

Add to `planImport`'s report an `estimate`, computed from the ops it already enumerates (it already runs `planPush` per objective in dry-run, `planning-import.cjs:189`, and `buildOps` is pure):

```
estimate: {
  objectives, trds, comments, decisions, entities, wiki_pushes, milestones, history_closes,
  ops,            // logical outbox ops
  writes_max,     // upper bound of budgeted gh writes (REST/GraphQL mutations)
  reads_approx,   // informational (primary limit is 5,000/h; not binding)
  minutes_min,    // writes_max / 80 (minute budget)
  hours_min,      // ceil(writes_max / 450) - 1 full waits of the hourly budget
  by_kind: { 'upsert-issue': n, ... }
}
```

Cost table (writes per logical op; derive it, then PIN it with a calibration test, below): `upsert-issue` create = 1 POST (+ one-time label/milestone ensures amortised per run, see `createIssue` `gh-outbox-flush.cjs:596`), update = 0-1 PATCH; `link-sub-issue` 1; `block` 1; `upsert-comment` 1 (replace mode reads then writes only when different); `patch-issue` 1 (0 when state already equal); `set-fields` up to the field count; `patch-body` 1; `wiki-push` 0 REST writes (git); milestone put 1-2. Use the upper bound everywhere (never underestimate).

**Calibration test (this is what makes the number trustworthy):** build the 20-objective fixture, run the real import+drain against the fake, assert `fake.writes().length <= estimate.writes_max` and `>= 0.6 * estimate.writes_max` (a loose lower bound catches a cost table that is wildly pessimistic). A change to `buildOps` then fails this test and forces the table to be updated.

Surfacing: (1) `0011.detect().reason` is a one-paragraph summary ("backfill: 20 objectives, 100 TRDs, ~540 writes, about 2 h at the 450/h budget; run `df-tools planning import --dry-run` for the full plan"); detect stays offline and cheap because it only calls `planPush` (local). (2) `df-tools planning import --dry-run` prints the full plan: per-kind counts, the estimate, `refused`, `kept_local`, and the history-close counts. (3) 0011 `apply` with `ctx.dryRun` returns the same text in `notes` with `changed: []` and writes nothing, zero gh calls (assert `fake.calls().length === 0` and a `snapshot()` equality of the project).

## 2. Testing (SC1, SC2)

### 2.1 How the fakes work

- `createFakeGitHub(opts)` (`__fixtures__/gh-fake.cjs:185`): in-memory repo with issues, comments, milestones, labels, sub-issues, PRs, wiki capability, and per-call logs: `calls()`, `writes()` (mutating argv only), `writeTimes()` (stamps from the injected `now`). Controls: `failNext(match, response)` (match is argv predicate, string or RegExp on the joined argv; response `{ok:false, stderr}` served once, `:1628`), `setOffline(bool)` (every call fails like an outage, `:1611-1616`), `humanEditBody`, `seedIssue/seedComment/seedMilestone`. Options: `ownerType`, `hasWiki`, `types`, `fields`, `viewer`, `mergeQueue`, etc.
- Seam: `gh._setRunGh(fake.runGh)` (`gh.cjs:39`) forwards to `client._setRunGh` (`gh-client.cjs:86`); restore with `_setRunGh(null)`. Every gh call in the store goes through `gh-client`.
- Time: `client._resetClient()`, `client._setNow(() => clock.t)`, `client._setSleep(ms => { clock.t += ms; })` (as `planning-import.test.cjs:41-45`). The journal budget takes `now` from `flush(..., {now, sleep})` (`gh-outbox-flush.cjs:1548`). With a fake sleep that advances the fake clock, a flush that "waits" a minute costs no real time.
- Secondary limit simulation (`gh-outbox-flush.test.cjs:1294`): `fake.failNext(/POST .*sub_issues/, {ok:false, status:1, stderr:'HTTP 403: You have exceeded a secondary rate limit\nretry-after: 30'})`. A `wait:true` flush retries with the client policy (`MAX_RETRIES` 4) then leaves the op pending with `retry_after`; `wait:false` leaves it pending immediately.
- Hermetic env: `hermeticEnv()` (`gh-store-fixtures.cjs:399`) sets `HOME`, `DEVFLOW_OUTBOX_DIR`, `DEVFLOW_GH_CACHE_DIR`, git isolation; `createWikiRemote()` + `applyGitTestEnv` give a real local bare wiki repo through `DEVFLOW_WIKI_REMOTE`. `planning-import.test.cjs` `useProject` (`:35-65`) is the template: copy it.
- The fake does not itself enforce the 80/min or 450/h limits. The enforcement under test is `gh-outbox.budgetCheck` (journal) and the client's pacing; the fake's role is to count and stamp writes. Assert pacing from `fake.writeTimes()` (consecutive stamps >= 1,000 ms apart; no 60 s window holds more than 80; no 3,600 s window more than 450).

### 2.2 The 20-objective fixture (new code, test-only)

`makeStoreProject` builds ONE objective (`07-store-demo`, 3 TRDs, `gh-store-fixtures.cjs:304`). Add `__fixtures__/gh-backfill-fixtures.cjs` exporting `makeBackfillProject({objectives: 20, trdsPerObjective: 5, git: true, ...})`:

- `.planning/config.json`: `{github: {enabled: true, repo: 'o/r'}}` (store OFF: the migration flips it) and a `devflow` stamp behind the plugin version.
- ROADMAP with `### Objective N:` headers (the resolver regex is `gh-mapping.cjs:124`; a directory alone also resolves, `:108`), a milestone list line, progress rows.
- 20 dirs `NN-slug/` with `OBJECTIVE.md` (frontmatter `work`, `status`), 5 TRDs each as `NN-MM-<slug>-TRD.md` with `wave:` and `depends_on:` (so `block` edges exist), SUMMARY for ~80%, VERIFICATION for ~half; objectives 1-15 `status: complete`, 16-18 in progress, 19 `cancelled`, 20 planned (exercises history closes and `not_planned`).
- Plus: 3 todos, 1 debug session, 1 quick dir, `PROJECT.md`/`REQUIREMENTS.md`/`research/a.md`, a decision with `trd:` and one without, a legacy-named TRD in a separate negative-case variant, an oversize 61,000-char TRD in another.
- `initGitFixture` (`upgrade-fixtures.cjs`) so 0010 can run `git rm --cached`; all tracked and committed.
- Keep TRD bodies small (~1 KB) so 100 TRDs stay fast; it is op count, not size, that matters.

### 2.3 SC1: completes under the limits and resumes after interruption

Test file `migrations/0011-github-store-backfill.test.cjs` (+ `gh-backfill.test.cjs` for the library, + `gh-backfill.e2e.test.cjs` through `df-tools upgrade` CLI). Scenarios, all with the fake clock:

1. **Full run in fake time.** Dry-run first (assert zero `calls()` and unchanged `snapshot()`), then apply. Because ~500 writes exceed 450/h, the first apply returns pending with `budget: 'hour'` and `wait_ms > 0`: assert `exit` 3 semantics and that `apply` threw the typed "pending" refusal (not stamped). Advance the fake clock by `wait_ms`, re-run `--only 0011`: drains. Assert at the end: 20 Objective issues, 100 TRD sub-issues, blocked-by edges equal `waveEdges`, SUMMARY comments, closed state on the shipped set and `not_planned` on objective 19, wiki pages in the bare remote, mapping v3 entries for all, cache index baselined, journal empty.
2. **Limits respected.** From `fake.writeTimes()`: min gap >= 1,000 ms; max writes in any rolling 60 s <= 80; in any rolling 3,600 s <= 450. (Reads excluded; `writes()` already excludes them.)
3. **Interruption mid-flush.** Use `flush(..., {maxOps: N})` through a test hook (the migration accepts `ctx.options.maxOps`) or `fake.failNext(/POST .*issues$/, offlineResponse)` after K writes then `fake.setOffline(true)` for several calls then `false`. Assert: journal retains the un-run ops `pending`, completed ops `done`, nothing lost; the second run does not re-queue (resume path: pending ops, so no `planImport`), and the final GitHub state equals scenario 1's (compare issue/comment/sub-issue sets by `devflow:id`, not by number). Add a "process killed between create and mapping write" case: delete the mapping file after a drain-in-progress; the next flush finds issues by marker, no duplicates (`gh-outbox-flush.cjs:494`).
4. **Secondary limit.** `failNext(/POST .*issues$/, secondary('\nretry-after: 30'))` x1 during a `wait:true` flush: op stays pending with `retry_after`, run ends `pending/rate_limited`, resume after advancing the clock completes; assert no write was repeated for an already-done op.
5. **Remote edit halt.** `fake.humanEditBody(n, ...)` on a managed issue between runs: exit 2, apply throws with the `gh outbox status` guidance; 0010 never ran; `resolve --accept-remote` then re-run completes.
6. **0010 resume trap (G4).** Interrupted store-on state, then `upgrade --apply --confirm` (no `--only`): assert the runner reaches 0011 (needs the 0010 `detect` tweak) rather than halting on 0010.
7. **Preflight refusals.** hasWiki false / no first page; read-only token (`push: false`); `halted` journal; legacy TRD name; oversize TRD (reported in `refused`, which 0010 will not tolerate? `planImport` leaves them without baseline, so 0010 refuses: assert 0011 lists them as blockers up front and makes zero gh writes).

### 2.4 SC2: re-run is a no-op

After scenario 1 completes and 0010 applies: `upgrade --check` reports 0011 and 0010 `applies:false` (skipped, reasons stated); `upgrade --apply --only 0011 --confirm` again produces `applied: []`, **zero gh writes** (`fake.writes().length` unchanged; reads are allowed because `upsert` handlers read-before-write, so do NOT assert zero calls), unchanged project `snapshot()` (use `diffSnapshots`), unchanged `config.json` stamp bytes, unchanged journal. Also assert the same on a project that was never GitHub-enabled (parity: zero calls, byte-identical tree), and on a local-mode project with `github.enabled` true but store false and nothing to import ("nothing to backfill" must not flip the store switch silently: decide and test; recommend it still applies, because the user asked for the migration, but with an empty plan).

### 2.5 TDD ordering

Strict TDD (plugin kind): per TRD, commit the failing test (RED) before the implementation. The estimate, history-closes, fixture builder and the 0010 tweak each get their own RED-GREEN pairs. Pin the calibration test early (it fails until both estimator and history ops exist).

## 3. GMD-03: documentation

### 3.1 What describes the local model (must change)

`docs/USER-GUIDE.md` (1,071 lines):
- L252-258 Integration table: `/devflow:gh-sync [objectives|release <tag>|status]` "Mirror planning state to GitHub issues/releases".
- L397-399 "Opt-in mirror of planning state to GitHub issues + releases" and the config table lead-in (L397-417): store key row exists; default description is the mirror.
- L667-669 intro: "Planning files remain the source of truth — GitHub is derivative."
- L673-760 `### Enable` / `What syncs and when` / `Mapping file` ("Commit it") / how a sync treats an issue: all legacy-mirror content. Keep as the "legacy mirror mode (store off)" reference but demote it below store mode, or fold.
- L744-964 `### Store mode` (about 220 lines) is already the new model; it should become the primary section, headed "GitHub is the system of record", with a new **Migrating an existing project** subsection (preflight, dry-run output, the 0011 command sequence, resume, 0010, commit via branch + escape, `gh setup`).
- L221-249 migrations table stops at 0006: add 0007-0011 (0007 doc-refs fix, 0008 runtime-state untrack, 0009 gh-mapping v3, 0010 store gitignore, 0011 backfill), with safety column.
- L418-436 Git Branching: already notes deprecation in store mode; keep.
- L599-627 Project File Structure: add "store mode: cache, gitignored" note.
- L539-580 Troubleshooting: add backfill pending/halted, wiki first page, hour budget.

`CLAUDE.md` (30,869 chars, resident every turn):
- The **GitHub integration** bullet (line 58) is 5,688 characters and growing every objective. Replace by a ~900-character bullet: what it is, the config switch, store-mode one-liner, enforcement one-liner, the escapes, the module family names, and "see `docs/USER-GUIDE.md` Store mode". Move the verb-by-verb detail (outbox exit codes, `gh pr` verbs, setup payload rules, W057-W061, App keys, open items) to USER-GUIDE where most of it already lives (50-13 duplicated it into both).
- **Planning verbs** bullet: also long; keep the one-sentence invariant (D-01) and the verb list, drop module lists.
- Add one line for migration 0011 (confirm, resumable) in the Upgrade bullet; keep "Where we left off" current.
- Target: net CLAUDE.md shrink (each of these is resident cost; project policy is to keep detail in references, `CLAUDE.md` "Context management").

Constraints any CLAUDE.md edit must respect (all CI):
- `dispatch-completeness.test.cjs` test 5 (`:197`): in `- **` bullets, the first word of each backtick span after the first ` — ` must be a dispatching df-tools command (`:82-93`) or exempt. 50-13 broke this once with `reason`, `prs`, `planning-consistency`. Write such spans so the first word is a real command, or avoid backticks (`50-13-SUMMARY.md` Deviation 1).
- `hook-inventory.test.cjs` pins the `### Hooks` bullet list to `hooks.json` + `statusLine`, both directions. Do not add or reword hook names casually; no new hook is planned.
- `doc-refs.repo.test.cjs`: no stale `/devflow:` command (renamed or removed) in CLAUDE.md, templates/claude-md.md, templates/global-claude-md.md.
- `planning-writes.repo.test.cjs`: skills, non-legacy workflows, agents and templates must hold zero direct planning-write instructions; a read-only/explanatory line takes an inline `<!-- planning-audit: allow <reason >=20 chars> -->`. USER-GUIDE and CLAUDE.md are out of scope of that scan; skills are in scope.
- Migration 0007 rewrites stale command refs in a project's CLAUDE.md DEVFLOW block (the template `templates/claude-md.md`), so any template change must stay doc-refs clean.

### 3.2 `/devflow:gh-sync`: repurpose, do not retire

Now (`plugins/devflow/skills/gh-sync/SKILL.md`, 98 lines): described as "One-way push from `.planning/` -> GitHub. Planning files remain authoritative", modes `--all|<objective>|objectives|release <tag>|status|setup [--apply]`, store-mode afterthought paragraph (outbox/pull/orphans/pr verbs), step 3 commits `.planning/.gh-mapping.json` and `github_issue` (wrong in store mode where the mapping is untracked cache; `.gh-mapping.json` is runtime/cache under the U-1 classification).

Recommendation: keep the name and make it the operator skill for the GitHub store. Rewrite the objective block: "GitHub is the system of record when `github.store` is on; this skill runs the maintenance verbs." Modes: `migrate [--dry-run]` (wraps `upgrade --check|--apply --only 0011`, shows the dry-run, requires explicit user say-so before apply, and states resume), `status` (adds outbox status + W057-W061 report), `flush`, `pull`, `setup [--apply]`, `release <tag>`, and legacy `<objective>|--all` documented as "mirror mode, store off only". In store mode steps that commit the mapping must go. Reasons: (a) no entry added to `DEPRECATION_MAP`/`REMOVED_COMMANDS` (`skill-route.cjs:109,134`), which are the only rename source and what `doc-refs.cjs` and `doc-refs.repo.test.cjs` test 5 (help.md rename table must deep-equal `DEPRECATION_MAP`) validate; (b) the references that already exist stay valid: `route-intent.js:254`, `skills/flow/SKILL.md:17,28,74-79` chains (build-and-sync, verify-and-sync, ship-and-release), `skills/sync-roadmap/SKILL.md:67`, `templates/global-claude-md.md:22`, USER-GUIDE L256/L707, README.md L42.
- If the planner nonetheless retires it: add `'gh-sync': '<successor>'` to `DEPRECATION_MAP`, update the fenced table in `workflows/help.md` (test 5), fix every reference above, run migration-0007 fixtures, and re-check `route-intent.js` skill routing tests. That is ~8 files for no user benefit.
- The `flow` chains that say "push state to GitHub" must be reworded for store mode ("flush the outbox"), because in store mode execute-objective already writes through verbs.
- README.md L42 still says `gh sync-objectives` (a deprecated alias in `DF_TOOLS_DEPRECATIONS`, `skill-route.cjs:139`); `df-tools-deprecations.repo.test.cjs` likely covers it: fix it to `gh sync --all`.

### 3.3 CHANGELOG and proposal

Add `[Unreleased]` entries (Added: migration 0011, estimate in `planning import --dry-run`, history closes; Changed: gh-sync repurposed, 0010 detect/notes; Removed: nothing). Proposal: update the status block and add "Planning refinements (objective 51)"; the decisions table is untouched.

## 4. GMD-04: recording the kill of objective 26

Facts:
- `.planning/objectives/26-github-issue-auto-build-monitor/` holds only `OBJECTIVE.md` (git status also shows untracked `.gitkeep` files for 26-31; they are harmless and not part of this change). Its frontmatter is `work: feature` only: no `status`, no `milestone`.
- ROADMAP.md has no `### Objective 26` section. It appears in the milestones list line 8 ("kill candidate"), the Objective 51 success criterion 2 (line 307, "objective 26 re-based or killed"), the "Other v1.4 candidates" bullet (line 312) and a progress-table row (line 352: `| 26. ... | v1.4 | 0/— | Moved to v1.4 (kill candidate) | — |`).
- The directory resolves as an objective (`gh-mapping.resolveObjective` finds dirs without a ROADMAP header, `:108-118`), so `objective set-status` works on it.
- `df-tools objective remove` is destructive: it cascades renumbering of everything above (memory note `feedback_dftools_objective_ops`) and in store mode it is refused outright (`objective.cjs:631`: "deletes are never automatic ... set-status ... cancelled"). **Do not use it.** Cancelled is the repo's own designed state (`STATUSES` in `planning-verbs.cjs` include `cancelled`; store mode maps it to `state: closed, state_reason: not_planned`, `:421`).
- `.planning/decisions/` holds only `pending/DECISION-001.md` (a blocking-question queue entry, `trd: 27-03`); no `resolved/` dir exists yet. `decision open` in local mode needs a question and optional TRD id (`planning-entity-verbs.cjs:415`); the CLI exposes the TRD as a positional (`planning-verbs-cli.cjs:267`) and has no `--objective` flag. A decision-queue entry means "a question blocking a TRD", which a user-made kill is not.

Recommended record (do it in the first wave, in this repo, in local mode, BEFORE any backfill of this repo so the kill flows into GitHub as a closed `not_planned` issue):
1. `node plugins/devflow/devflow/bin/df-tools.cjs objective set-status 26 cancelled` (writes `status: cancelled` into OBJECTIVE.md frontmatter; local mode, no gh call). Then add a `## Disposition` section to OBJECTIVE.md via `objective put 26 --from <draft>` (use `planning draft`): "Killed 2026-10-01 by user decision (GMD-04). Rationale: GitHub is now the system of record; objectives 47 (outbox/store), 49 (branch and PR lifecycle) and 50 (enforcement) supply the issue graph and PR lifecycle that an auto-build monitor would have had to build; the unattended `claude -p` runner remains an unmitigated prompt-injection surface (design constraints retained below for any future restart). Not re-based." Keep the locked-design text (it is the only record of the allowlist constraint). Verify the exact rationale wording with the user; the brief gives only "KILL".
2. ROADMAP.md: change line 8 and the "Other v1.4 candidates" bullet to state "KILLED 2026-10-01", set the progress row to `Cancelled (killed by user decision 2026-10-01; GMD-04)`, and reword objective 51 success criterion 2 to "objective 26 killed; decision recorded". Edit through the skill-marker path (ROADMAP is hand-maintained in local mode; in store mode it becomes a generated view and `gh pull --all` never overwrites a hand-maintained one).
3. STATE.md "Recent Decisions": one dated line. PROJECT.md "Open decisions carried to v1.4" (L126-127) is the existing decision list: add "Objective 26 killed (resolved)". There is no Key Decisions table in PROJECT.md, so do not invent one.
4. Optional durable decision file: `decision open <trd> --question @file` then `decision answer`, only if a TRD id exists to attach to (use the 51 GMD-04 TRD id once planned). This produces the `decisions/resolved/` file shape that import and `gh pull` understand. Recommended: yes, as a lightweight ADR attached to the objective-51 TRD that records it, because after the backfill a Decision issue plus its answer is the queryable record. Not required for the objective issue itself.
5. MILESTONES.md: no entry (v1.4 is not complete; it records milestones at completion).
6. Check that nothing else references 26 as live work: `grep` found it only in ROADMAP, the objective dir and `roadmap.test.cjs` (a fixture, not the live file).

After backfill in store mode, the objective 26 issue exists as Objective-type, closed `not_planned`, which `devflow/planning-consistency` tolerates only when no objective PR targets it (`50-03`: a closing target already `not_planned` fails an objective PR); nothing links a PR to 26, so it is safe.

## Architecture Patterns

### Recommended structure
```
plugins/devflow/devflow/bin/lib/
├── migrations/0011-github-store-backfill.cjs        # phase machine; apply throws a typed refusal on pending/halted
├── migrations/0011-github-store-backfill.test.cjs
├── gh-backfill.cjs                                  # historyOps, estimate, resume decision, journal-budget bookkeeping
├── gh-backfill.test.cjs
├── planning-import.cjs                              # + estimate in the report (additive)
└── __fixtures__/gh-backfill-fixtures.cjs            # makeBackfillProject (20 objectives)
```

### Pattern 1: phase machine over a durable journal
State lives in the outbox journal and the cache index, never in the process. `detect` derives "which phase am I in" from local facts; `apply` does the next phase(s) it can and throws a typed refusal (`err.refusal`, as 0010 does `:383-390`) when it stops short. The runner then reports `failed`, does not stamp, and a re-run continues. Source: `0010-store-gitignore.cjs`, `gh-outbox.cjs` journal design.

### Pattern 2: queue everything, flush once, settle on drain
`planImport` queues with `noFlush`-style deferral, ledgers the bytes each op carries (`recordQueued`, `planning-import.cjs:104`) and flushes once; only a drained flush baselines (`settleLedger`). A partial flush leaves ledger entries unsettled by design (W055 reports drift); resuming = flush again, not re-import.

### Pattern 3: dry-run computed from pure planners
`planPush`/`buildOps` are pure (no gh, no outbox); the estimate is a fold over their ops. Keep the estimator pure and total so `detect` can call it.

### Anti-patterns to avoid
- Calling `gh sync --all` as the backfill (no decisions/entities/docs/milestones, `gh.cjs:1795`).
- Sleeping through the hourly budget inside `apply`.
- Re-running `planImport` while ops are pending: it re-enqueues objectives whose ops are already `done` (coalescing only merges `pending` ops, `gh-outbox.cjs:643-695`), costing reads and risking churn.
- Reading `github.store` outside `planning-mode.cjs`.
- Editing planning files directly in skills (CI: `planning-writes.repo.test.cjs`); use verbs.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Queue + pace + retry GitHub writes | a loop with sleeps | `outbox.enqueue` + `flushLib.flush` | budget 80/min, 450/h, retry-after, halt on remote edit, cross-process lock |
| Import of local files | a second importer | `planImport` | ledger/baseline/refused/kept_local are tested |
| Idempotent create | local mapping only | marker scan in `handleUpsertIssue` | survives a lost mapping |
| gitignore + untrack | own git calls | `0010.migrate` | rollback, backup, probe via `git check-ignore`, legacy-name refusal |
| Backups | copy code | `upgrade.backup` | outside repo, unique dir, registered for prune |
| Fake GitHub | new fake | `createFakeGitHub` | already models sub-issues, types, fields, wiki flag, failure injection |
| Rename tracking for docs | ad-hoc scans | `doc-refs.cjs` + `DEPRECATION_MAP` | single rename source |

**Key insight:** the budget, resume and idempotence machinery is the hard part and already exists; 51's value is composition, history closure and an honest estimate.

## Common Pitfalls

### P1: backfill opens hundreds of issues for shipped work
**What goes wrong:** every historical TRD and objective issue is created OPEN (G1). **Why:** `buildOps` has no state ops; only PR merge/verbs close. **Avoid:** history-close ops (1.4 G1), asserted in SC1 scenario 1. **Warning sign:** open-issue count after backfill >> in-progress TRDs.

### P2: the hour budget makes this a multi-hour job
**What:** 450/h; ~2,000 writes for this repo. **Avoid:** resumable phases, honest ETA in the dry-run, the `gh-flush` Stop hook continues the drain (bounded, `--no-wait`). Never advertise "completes in minutes".

### P3: resume re-imports and re-queues
**What:** after an interruption the un-settled ledger leaves files without baselines, so a naive re-run of `planImport` re-queues. **Avoid:** if the journal has pending ops, only flush; import again only after a drain (which then queues nothing new). Test: interruption scenario asserts no duplicate ops/writes.

### P4: runner order halts the resume (G4)
0010 evaluates before 0011 in `--apply --confirm`; fix with the 0010 `detect` tweak and "resume with `--only 0011`" messaging.

### P5: partial store state is a hybrid
Between the store flip and 0010, git still tracks the cache while the edit gate denies direct edits. **Avoid:** the migration prints this window explicitly, and recommends running steps back to back; rollback = `github.store: false` plus the backup.

### P6: commits are refused after the switch
Store mode refuses `df-tools commit` on the default branch (50-02/50-06). **Avoid:** instruct branch + logged escape; correct 0010's printed command and the `gh setup` notice; USER-GUIDE already says use the escape.

### P7: `gh setup` bootstrap deadlock
`gh setup --apply` creates a ruleset requiring two statuses that exist only once the workflow is on the default branch (proposal, objective 50 open items). Order for the user: migrate, commit via PR, merge the workflow PR first with a one-time admin bypass, then require the checks. Do not fold `gh setup` into 0011; document the order.

### P8: CLAUDE.md edits fail an unrelated test
`dispatch-completeness` test 5 reads backtick spans as command names (3.1). Run it after every CLAUDE.md edit.

### P9: estimate drifts from reality
Pin with the calibration test; use upper bounds.

### P10: archived-milestone history dominates the cost
v1.1-v1.3 objectives are ~85% of this repo's TRDs. See OQ1.

### P11: testing against the real world by accident
All gh calls must be seamed; add the fixture to `gh-seam.repo.test.cjs` expectations if it scans (it exists: `gh-seam.repo.test.cjs`). Use `hermeticEnv` for `HOME`; never call `os.homedir()` in new code; pass `userHome` through `ctx`.

## Code Examples

### Resume-safe apply skeleton (shape, not final code)
```js
// migrations/0011-github-store-backfill.cjs  (Source: pattern of 0010-store-gitignore.cjs:338-391)
function migrate(ctx) {
  const det = detect(ctx);
  if (!det.applies) return { applied: false, changed: [], notes: `not applicable: ${det.reason}` };
  const plan = backfill.plan(ctx.projectRoot);                  // pure: planImport dry-run + historyOps + estimate
  if (ctx.dryRun) return { applied: false, dryRun: true, changed: [], notes: backfill.render(plan) };
  const blockers = backfill.preflight(ctx);                     // local first, then gh auth/capability/wiki
  if (blockers.length) return refusal(blockers);
  backfill.ensureStoreSwitch(ctx.projectRoot);                  // config.json github.store=true
  if (!backfill.hasPendingOps(ctx.projectRoot)) backfill.queue(ctx.projectRoot); // planImport + historyOps (+ G5 bookkeeping)
  const drained = backfill.drain(ctx.projectRoot, ctx.options); // flush loop; returns {status, exit, wait_ms?}
  if (drained.status !== 'flushed') return refusal(backfill.resumeText(drained)); // apply() throws -> not stamped
  const verify = backfill.verify(ctx.projectRoot);              // gh pull --all + orphans
  if (!verify.ok) return refusal(verify.details);
  return require('./0010-store-gitignore.cjs').migrate(ctx);    // switch to the cache model
}
```

### Rate and pacing assertion
```js
// Source: gh-fake.cjs writeTimes(); budgets gh-outbox.cjs:47
const t = fake.writeTimes();
for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= client.MIN_WRITE_INTERVAL_MS);
const within = (ms) => Math.max(...t.map((x, i) => t.filter((y) => y >= x && y < x + ms).length));
assert.ok(within(60_000) <= 80);
assert.ok(within(3_600_000) <= 450);
```

### Calling the repo's df-tools (the installed mirror is stale)
```bash
node plugins/devflow/devflow/bin/df-tools.cjs objective set-status 26 cancelled
node plugins/devflow/devflow/bin/df-tools.cjs planning import --dry-run
node plugins/devflow/devflow/bin/df-tools.cjs upgrade --check --only 0011
node plugins/devflow/devflow/bin/df-tools.cjs upgrade --apply --only 0011 --confirm
node plugins/devflow/devflow/bin/df-tools.cjs gh outbox status
```

## State of the Art

| Old approach | Current approach | When | Impact |
|---|---|---|---|
| `gh sync-objectives` one-way mirror, planning files authoritative | store mode: outbox, hierarchy, wiki, cache | objectives 46-50 (2026-09/10) | backfill is `planning import` + flush, not a sync |
| `git.branching_strategy` | linked branch + one PR per objective | objective 49 | commits on default branch refused |
| README `gh sync-objectives` | `gh sync --all` | 46-08 | docs still stale (README L42) |

**Deprecated/outdated in this repo's own docs:** USER-GUIDE migration table (stops at 0006), "GitHub is derivative" intros, `gh-sync` skill step 3 committing `.gh-mapping.json`.

## Open Questions

1. **OQ1: backfill the shipped history as closed issues, or wiki-only?**
   - Known: full backfill is ~2,000 writes (about 4.5 h) for this repo; most are v1.1-v1.3 TRDs. `gh pull --all` rebuilds the cache from GitHub, so history absent from GitHub disappears from a fresh clone's cache (local git history and the backup keep it).
   - Unclear: whether the user wants 336 closed TRD issues for archived milestones.
   - Recommendation: default to FULL backfill (closed issues, consistent model, no data loss on rebuild) with an opt-in `--history wiki` / `options.history` that, for archived milestones, imports only wiki pages and one closed Objective issue per objective (no TRD issues). Decide in plan-objective with the user; the dry-run already shows both costs.
2. **OQ2: nothing-to-import projects.** A GitHub-enabled project with an empty plan: flip the switch anyway? Recommendation: yes (the user confirmed the migration), empty plan, test it.
3. **OQ3: kill rationale wording** for objective 26. The brief gives the decision, not the reasons; the draft above is inferred from 47/49/50 overlap and the unmitigated runner risk. Confirm with the user before committing it.
4. **OQ4: live behaviour** is unverified for the same reasons as objective 50 (no real-repo run): hour-budget handling against real secondary limits, wiki push of ~100 pages, sub-issue API limits at scale (100 TRDs/objective cap is enforced locally, `gh-trd.cjs`). Mark the first real-repo run as a manual UAT step with a throwaway repository, not part of CI.
5. **OQ5: `kept_local` items** (decisions with no `trd:`, unmapped docs): blocks nothing, but should the migration refuse until the user acknowledges them? Recommendation: print them, require `--confirm` (already required), no extra flag.

## Proposed TRD breakdown (waves, strict TDD)

Numbers are proposals for plan-objective. RED = failing test committed first, GREEN = implementation.

**Wave 1 (parallel, no shared files)**
- **51-01 GMD-04: record the kill** (docs/state only, no TDD needed except that doc-refs and consistency tests stay green). `objective set-status 26 cancelled`, disposition text, ROADMAP/STATE/PROJECT lines, optional decision file. Verify: `validate consistency`, `doc-refs.repo.test.cjs`.
- **51-02 backfill fixtures:** `__fixtures__/gh-backfill-fixtures.cjs` (`makeBackfillProject`), with its own fixture tests (counts, git state, determinism), plus a fake-clock helper if `useProject` is copied (`planning-import.test.cjs:35`). RED first (fixture shape tests).

**Wave 2**
- **51-03 `gh-backfill.cjs` core:** `historyOps` (G1), `estimate` (cost table), `hasPendingOps`, budget bookkeeping for live creates (G5). RED: unit tests on small projects, the calibration test (skipped until 51-04 wires them, or run against the fake directly through `planImport`).
- **51-04 `planImport` additive changes:** `estimate` in the report and the history ops queued after hierarchy ops; keep `planning-import.test.cjs` green (the new fields are additive); `--dry-run` prints the plan. RED: dry-run report has `estimate`, zero calls; real run closes the shipped set.

**Wave 3**
- **51-05 migration 0011 (detect, dry-run, preflight, store switch):** contract tests via `upgrade.loadRegistry`, `detect` matrix (disabled, store off, store on drained, pending, unbaselined), `check` shows reason with the estimate, dry-run `apply` writes nothing and makes zero calls. RED first.
- **51-06 migration 0011 apply (queue, drain, verify, 0010 handoff) + 0010 `detect` tweak (G4) + 0010 notes fix (G6):** the SC1/SC2 scenarios of 2.3-2.4 (full run, hour-budget stop and resume, interruption, secondary limit, remote-edit halt, `--apply --confirm` resume, re-run no-op, store-off parity). Largest TRD; consider splitting in two (happy path+budget; failure scenarios) to stay under the 40K-char TRD budget.

**Wave 4**
- **51-07 e2e through the CLI + doctor/health:** `upgrade --check|--apply` via `df-tools.cjs` with `HOME` temp; optional doctor check (30-39 hygiene range or 20-29 project) "backfill incomplete" or extend check 25's report; manual UAT note for a throwaway repo.
- **51-08 GMD-03 docs:** USER-GUIDE rewrite (Store mode primary, migration table 0007-0011, Migrating section, troubleshooting, intros), CLAUDE.md slimming and migration line, gh-sync skill repurpose (+ `flow` chain wording, README L42, global template line check), CHANGELOG `[Unreleased]`, proposal status + refinements. Verify after each file: `doc-refs.repo.test.cjs`, `dispatch-completeness.test.cjs`, `hook-inventory.test.cjs`, `planning-writes.repo.test.cjs`, `df-tools-deprecations.repo.test.cjs`.
- **51-09 full suite:** `npm test`; known environmental failure from 50-13 is MA-7 (`handoff-e2e.test.cjs`, real `doctl` on the machine); do not mask it. (SC3.)

Dependencies: 51-04 needs 51-03; 51-05/06 need 51-02-04; 51-08 last (documents shipped behaviour, as 50-13 learned: state what the code does, not what was planned).

## Sources

### Primary (HIGH confidence): all read directly at HEAD
- `plugins/devflow/devflow/bin/lib/planning-import.cjs` (full), `migrations/0010-store-gitignore.cjs` (full), `upgrade.cjs`, `upgrade-cli.cjs`, `gh-outbox.cjs` (budget, enqueue, ops table), `gh-outbox-flush.cjs` (flush loop, upsert-issue, classification), `gh-hierarchy.cjs` (`planPush`, `buildOps`, `pushHierarchy`), `gh-store-cli.cjs` (`EXIT`, `flushResult`, `settleLedger`), `gh.cjs` (`syncObjective`), `gh-client.cjs` (pacing, per-run budget 450), `planning-verbs.cjs` (`objectiveSetStatus`, `STATUS_PATCH`), `planning-entity-verbs.cjs` (`decisionOpen`), `planning-verbs-cli.cjs`, `skill-route.cjs`, `__fixtures__/gh-fake.cjs`, `gh-store-fixtures.cjs`, `planning-import.test.cjs`, `gh-outbox-flush.test.cjs` (secondary limit cases).
- `docs/PROPOSAL-github-system-of-record.md`, `.planning/objectives/50-.../50-13-SUMMARY.md`, `.planning/objectives/51-.../OBJECTIVE.md`, `.planning/objectives/26-.../OBJECTIVE.md`, `.planning/ROADMAP.md`, `CLAUDE.md`, `docs/USER-GUIDE.md`, `plugins/devflow/skills/gh-sync/SKILL.md`.

### Secondary / Tertiary
- None. GitHub platform limits (80/min, 500/h secondary; code enforces 450/h) are quoted from the locked proposal and `gh-outbox.cjs`, not re-verified against GitHub docs (not needed: the design is locked and the code is the contract).

## Metadata

**Confidence breakdown:**
- Standard stack / composition: HIGH, code read end to end.
- Gaps G1-G6: HIGH for G1, G3, G4 (traced in code); MEDIUM for G5 (traced to the live-create path, impact on budget accounting inferred) and the cost table values (to be pinned by the calibration test, not by this document).
- Docs and CI constraints: HIGH (tests read), except exact USER-GUIDE edits (planner discretion).
- Live GitHub behaviour: LOW (unverified, same open items as objective 50).

**Research date:** 2026-10-01
**Valid until:** until objectives 47-50 modules change (stable repo-internal; re-check `gh-outbox.cjs` BUDGET and `planning-import.cjs` before planning if any lands)
