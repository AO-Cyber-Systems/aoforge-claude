---
objective: 51-github-migration-and-docs
trd: "06"
type: standard
wave: 3
depends_on: ["51-02", "51-03", "51-04", "51-05"]
files_modified:
  - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
  - plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs
autonomous: true
requirements: [GMD-01, GMD-02]
must_haves:
  truths:
    - "`upgrade.loadRegistry` loads `0011-github-store-backfill` with `safety: 'confirm'`, `since: '2.13.0'`, so it never runs from a bare `--apply` or the SessionStart hook"
    - "`detect` is local and offline: `applies:false` when `github.enabled` is not true or `github.repo` is unset (zero gh calls, D-01 parity); `applies:true` when store is off; with store on it applies iff un-baselined cache files exist or the journal has pending/blocked ops; else `applies:false` ('already on GitHub')"
    - "When it applies, the `detect` reason is a one-paragraph plan summary from `planImport({dryRun:true})`: objective/TRD counts, history closes, `renderEstimate`, and the pointer to `df-tools planning import --dry-run` for the full plan (GMD-02)"
    - "`migrate` with `ctx.dryRun` returns the full plan text in `notes`, `changed: []`, writes nothing and makes zero gh calls"
    - "Preflight refuses, listing every blocker with its remedy and making zero gh writes: not a git work tree, merge/rebase in progress, halted or blocked journal, legacy-named TRDs, TRDs over 60,000 chars; then (apply only) gh auth/capability failure, a read-only token, a wiki with no first page"
    - "After preflight the store switch writes `github.store: true` into `.planning/config.json` (idempotent); the queue phase calls `planImport({noFlush:true})` only when the journal has no pending ops, and records live creates against the journal budget (G5)"
    - "An empty plan (OQ2 default) still flips the switch and reports `nothing to backfill`"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs
      provides: "id 0011, detect, preflightLocal, preflightRemote, ensureStoreSwitch, queue, migrate (phases 0-3; drain/verify/handoff stubs throw a typed 'not yet' refusal until 51-07), apply"
  key_links:
    - "51-07 adds drain, verify and the 0010 handoff to the same `migrate`; 51-09 wraps it in `/devflow:gh-sync migrate`"
---

# TRD 51-06: migration 0011, part 1 — detect, dry run, preflight, switch, queue (GMD-01, GMD-02)

<objective>
Create the confirm migration `0011-github-store-backfill` as a re-entrant phase machine over existing library calls. This TRD lands the
offline `detect` (with the plan summary), the zero-write dry run, preflight refusals, the store switch and the resume-aware queue
phase. Draining and the switch to the cache model come in 51-07.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(51-06): ...` before each `feat(51-06): ...`.
- Locked design (`docs/PROPOSAL-github-system-of-record.md`): GitHub authoritative, `.planning/` a gitignored cache, outbox pacing
  (80/min, 450/h), wiki for reference text, degraded mode. Do not raise budgets or bypass the outbox.
- `userHome` comes from `ctx` (never `os.homedir()`); tests use `useBackfillEnv` (51-02), `makeFakeHome`, `createFakeGitHub`
  through `_setRunGh`. Never the real GitHub or `~/.claude`. Never port 8080.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.

## Decisions

- **Shape**: module exports `{id:'0011', title:'Backfill planning history into the GitHub store', since:'2.13.0', safety:'confirm',
  detect, apply, migrate, preflightLocal, preflightRemote, ensureStoreSwitch, queue}`; `apply(ctx)` calls `migrate` and THROWS an
  `Error` with `err.refusal = {code, details}` when `migrate` stops short, exactly like 0010 (`0010...cjs` L383-391), so the runner
  marks `failed` and never stamps. Codes: `preflight`, `pending`, `halted`, `verify`, `not_implemented` (removed by 51-07).
- **Phases** (research §1.3): 0 local preflight → 1 remote preflight (apply only) → 2 store switch → 3 queue → [51-07: 4 drain →
  5 verify → 6 0010 handoff]. Every phase is re-entrant; the journal and cache index are the only state.
- **detect** never calls gh and never writes: GitHub disabled/unset repo → `applies:false, reason:'GitHub integration not enabled'`.
  It calls `planImport(root, {dryRun:true})` (51-05 preview works with store off) for the summary. Store on and nothing left
  (journal drained, no un-baselined cache file) → `applies:false, reason:'already on GitHub (backfill complete)'` — unless 0010 still
  applies, in which case 0011 still applies (its last phase hands off to 0010; 51-07 completes that path).
- **Remote preflight**: `ghCapability.detectCapabilities(root, {...})` (as `pushHierarchy` does, gh-hierarchy.cjs L499) for auth,
  `modes.writable` and wiki; the wiki first-page probe is the same check the flush relies on (`DEFAULT_WIKI_BLOCK`,
  gh-outbox-flush.cjs ~L235; find the probe in gh-wiki.cjs). Reads only. A wiki with no first page refuses with the one-line fix.
- **Store switch**: rewrite `.planning/config.json` with `github.store = true`, preserving key order and the trailing newline;
  no-op when already true. The runner's backup (upgrade.cjs L436) is the rollback; the refusal text after the switch says
  "rollback: set github.store to false (the backup is at <report.backup>)".
- **Queue**: `if (backfill.hasPendingOps(root).any) skip` (pitfall P3: never re-import while ops are pending); else
  `before = client.writeCount(); planImport(root, {noFlush:true}); backfill.recordLiveWrites(root, client.writeCount() - before, now)`.
  `planImport` errors → refusal `preflight` with its message.
- **Test hooks**: `ctx.options.{now, sleep, maxOps}` are passed through to the client and flush (51-07); the CLI never sets them.
- **OQ5 default**: `kept_local`/`refused` are printed in notes; no extra acknowledgement flag (`--confirm` is already required).
- **Partial window (P5)**: the store-switch note says plainly that until the migration finishes, the edit gate denies cache edits and
  `df-tools commit` refuses the default branch.

## Test list

1. Contract: `upgrade.loadRegistry()` includes 0011 with the fields above; `upgrade.check` on a stamped fixture lists it under
   `pending_confirm`, never under auto.
2. detect matrix: disabled → false, zero calls, tree byte-identical; enabled + store off → true with reason containing `20 objectives`,
   `writes` and `planning import --dry-run`; store on + pending journal → true; store on + drained + all baselined + 0010 done → false.
3. Dry run: `migrate({...ctx, dryRun:true})` → `changed: []`, notes contain the estimate and the will-stay-local table;
   `fake.calls().length === 0`; `snapshot()` unchanged.
4. Local preflight refusals (each alone, then all together listing every blocker): non-git dir, `MERGE_HEAD` present, halted journal,
   blocked op, `{legacyTrd:true}`, `{oversizeTrd:true}` → throws `refusal.code === 'preflight'`, zero gh writes, config unchanged.
5. Remote preflight refusals: `createFakeGitHub({hasWiki:false})`, a wiki remote with no first page, a read-only token (`push:false`)
   → refusal names the fix; config unchanged (switch not reached).
6. Switch + queue: apply on the fixture → `github.store === true`, journal holds the import ops then history ops, live creates are
   counted in the journal budget (`budgetCheck` window grows by the fake's live write count); refusal code `not_implemented` (until 51-07).
7. Resume queue: second apply with pending ops → `planImport` not called again (spy via journal op count unchanged and no new seq).
8. Empty plan: GitHub enabled, store off, no objectives → switch flipped, notes `nothing to backfill`.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: contract, detect and dry run (tests 1-3)</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs, plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs</files>
  <action>
RED: tests 1-3; commit `test(51-06): migration 0011 contract, detect and dry run`.
GREEN: module skeleton, `detect`, dry-run branch of `migrate`. Commit `feat(51-06): migration 0011 detect and dry-run plan`.
# CRITICAL: detect is called by `upgrade --check` on every project; it must be cheap and make zero gh calls.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs plugins/devflow/devflow/bin/lib/upgrade.test.cjs</verify>
  <done>Tests 1-3 pass; upgrade suite green (any test that pins the migration count or list is updated in the RED commit).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: preflight (tests 4-5)</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs, plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs</files>
  <action>
RED: tests 4-5; commit `test(51-06): migration 0011 preflight refusals`.
GREEN: `preflightLocal(ctx)` returns every blocker (reuse 0010's legacy-name and journal blocker helpers only if already exported;
otherwise implement them locally — do not edit 0010 in this TRD); `preflightRemote(ctx)`. Commit
`feat(51-06): migration 0011 preflight`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs</verify>
  <done>Tests 4-5 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: store switch and resume-aware queue (tests 6-8)</name>
  <files>plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.cjs, plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs</files>
  <action>
RED: tests 6-8; commit `test(51-06): migration 0011 store switch and queue`.
GREEN: `ensureStoreSwitch`, `queue`, and `migrate` running phases 0-3 then throwing `not_implemented` ("drain lands in TRD 51-07").
Commit `feat(51-06): migration 0011 switches the store and queues the backfill`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs plugins/devflow/devflow/bin/lib/planning-import-backfill.test.cjs</verify>
  <done>Tests 6-8 pass.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `upgrade.cjs`: contract check L36, `loadRegistry` L67, `check` L371, selection L430, backup L436, failure/halt L456-460.
- `migrations/0010-store-gitignore.cjs`: `detect` L217, blockers L241-290, `migrate` L338, typed refusal in `apply` L383-391.
- `planning-import.cjs` (after 51-05): `planImport(root, {dryRun, noFlush})`, `report.estimate`, `report.preview`.
- `gh-backfill.cjs` (51-03): `hasPendingOps`, `recordLiveWrites`, `renderEstimate`.
- `gh-client.cjs` `writeCount` (exported L464).
- `planning-mode.cjs` — the only reader of `github.store`.
</codebase_examples>
<anti_patterns>
- gh calls in `detect`; sleeping in `apply`; re-running `planImport` with pending ops; reading `github.store` directly.
</anti_patterns>
<error_recovery>
- If `upgrade.test.cjs` asserts the exact registry list, add 0011 there in the RED commit.
- If `detectCapabilities` caches to `DEVFLOW_GH_CACHE_DIR`, make sure `hermeticEnv` points it at a temp dir before the call.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/migrations/0011-github-store-backfill.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/upgrade.test.cjs plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs plugins/devflow/devflow/bin/lib/migrations/0010-store-gitignore.test.cjs</regression>
</validation_gates>

<verification>
- GMD-02: tests 2-3 (plan and request count, zero writes). GMD-01 phases 0-3: tests 4-8.
</verification>

<success_criteria>
`upgrade --check` shows the backfill plan and cost; an apply refuses safely or switches the store and queues everything exactly once.
</success_criteria>

<output>
After completion, create `.planning/objectives/51-github-migration-and-docs/51-06-SUMMARY.md` (via `summary post 51-06 --from <file>`)
</output>
