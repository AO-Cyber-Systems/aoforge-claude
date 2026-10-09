---
objective: 49-objective-branch-and-pr-lifecycle
trd: "06"
type: standard
wave: 2
depends_on: ["49-01", "49-03"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-comments.cjs
  - plugins/devflow/devflow/bin/lib/gh-comments.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-store-cli.cjs
  - plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs
  - plugins/devflow/devflow/bin/lib/override.cjs
  - plugins/devflow/devflow/bin/lib/help.cjs
  - plugins/devflow/devflow/templates/config.json
autonomous: true
requirements: [GPR-05, GPR-03]
must_haves:
  truths:
    - "In STORE mode only, `readTrdState` reads the TRD's objective issue assignees (one read) and the spec-rev DevFlow scope rows; `readEffectiveSpec` applies only accepted scopes and returns `pending:[{n, author, comment_id}]`"
    - "With the store off, `gh trd spec|fold|freeze|scope` behave exactly as today (they still run whenever `github.enabled` is true): no assignee read, no gate, no `pending` key; the existing tests are the guard"
    - "In store mode only, `enqueueScope` writes the spec-rev event `scope n=K scope_hash=H` (49-03 `scopeEvent`, H = hash of the scope text), so a DevFlow scope is accepted only while its comment still matches; an edited DevFlow scope is pending. With the store off the event stays `scope n=K`, byte for byte"
    - "`gh trd spec <trd>` shows pending scopes (author, n) separately and never includes their text in the effective spec"
    - "`foldTrd` folds only through the highest n for which every scope ≤ n is accepted; pending scopes stay as comments and are listed"
    - "`gh trd confirm-scope <trd> <n>` confirms only when the caller's login (`gh api user`) is an assignee of the objective issue; otherwise exit 1 naming the assignees, nothing queued"
    - "With no assignee, `confirm-scope` requires `--force --reason <why>` and records the override (gate `scope-confirm`) before queueing"
    - "A confirm posts `<!-- devflow:scope-confirm n=K hash=H -->` (hash of the current scope text) as a sticky `upsert-comment` kind `scope-confirm-<n>` on the TRD issue"
    - "`gh trd start <trd>` queues `patch-issue labels_add:[github.labels.in_progress]` (default `devflow:in-progress`) on the TRD issue (the in_progress status at spawn)"
    - "With the store off, only the NEW verbs (`confirm-scope`, `trd start`) return skipped (exit 0) with zero gh calls"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-comments.cjs
      provides: "store-mode assignee/devflowScopes/confirm gathering, hash-bound scope rows in enqueueScope, pending scopes in readEffectiveSpec and foldTrd, enqueueScopeConfirm"
    - path: plugins/devflow/devflow/bin/lib/gh-store-cli.cjs
      provides: "`gh trd confirm-scope` and `gh trd start`"
  key_links:
    - "Uses 49-03 scopeAcceptance/parseScopeConfirms/buildScopeConfirm and 49-01 fake viewer/assignees/seedComment; `gh trd start` is called by 49-13 prose at TRD spawn; the label is removed by 49-11 at `summary post`"
---

# TRD 49-06: Scope-change gate, `gh trd confirm-scope`, and `gh trd start`

<objective>
Wire 49-03's pure acceptance rule into the reads that matter (`gh trd spec`, fold), add the assignee confirmation verb, and add the
TRD-start verb that marks a TRD in progress at spawn.

Purpose: GPR-05 end to end; GPR-03 "TRD status moves" (decision 3). Output: gh-comments + gh-store-cli changes, an override gate, help.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(49-06): ...`), then implementation (`feat(49-06): ...`).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- gh-comments and gh-store-cli stay in NO_DIRECT_WRITE: reads via `ghRead`/`ghPaginate`, writes only by enqueueing ops.
- CLI handlers return results through gh-store-cli `result/emit` (exit 0/1/2/3); `process.exit` is stubbed in tests.
- Tests: fake with `viewer:'alice'` or `'mallory'`, seeded `assignees`, `seedComment(..., {login})`; `hermeticEnv()`;
  `makeStoreProject({store:true})` and `{store:false}` for parity. Never real GitHub/`~/.claude`; never port 8080.

## Decisions

- **Decision 3 (orchestrator, adopted): TRD in-progress is a label.** `gh trd start <trd>` adds `github.labels.in_progress` (already in
  `templates/config.json`, default `devflow:in-progress`) at spawn; `summary post` removes it (49-11). Rationale: TRDs are not reliably
  Project items, and a label needs no org features (works in degraded mode). `gh trd start` needs no reads, so it queues offline
  (exit 3 when pending) like `gh sync`.
- **Confirm identity**: the caller's login comes from `gh api user --jq .login` (a read). The confirm is posted with the caller's token,
  so the comment author is the confirmer and 49-03's predicate re-checks it on every read (a forged marker by a non-assignee is ignored).
- **No assignee**: `--force --reason "<why>"` required; `override.recordOverride({gate:'scope-confirm', reason})` before enqueue. Add
  `'scope-confirm': null` (logged only) to `override.GATES`.
- **`github.app_login`**: read from config (absent by default); add `"app_login": ""` to `templates/config.json` `github` so `config-get`
  documents it. Empty string means "no App".
- **Fold rule**: never fold past a pending scope, so a later confirm still applies in order.
- **Store-mode only gate**: the assignee read and the acceptance gate run only when `planningMode` is `store`. Today `gh trd spec|fold`
  run whenever `github.enabled` is true; that store-off path keeps today's behaviour byte for byte (D-01). The new verbs alone are
  store-gated (skipped with the store off).
- **Hash-bound DevFlow rows (store mode only)**: in store mode `enqueueScope` (L408) changes its event from `scope n=K` to `scopeEvent(n, scopeHash(clean))`; with the store off it keeps `scope n=K`
  (`scope n=K scope_hash=H`); the row's `hash` column stays the effective-spec hash. Idempotent replay is unaffected (append dedups on
  event + hash). Legacy rows without `scope_hash` are not trusted in store mode (49-03).

## Test list

1. `readEffectiveSpec`: objective issue assignees `['alice']`; scope n=1 by alice, n=2 by mallory → text has n=1 only, `pending` lists
   n=2/mallory. One extra read (the objective issue) in `fake.calls()`.
2. A scope enqueued via `enqueueScope` (spec-rev event `scope n=3 scope_hash=<hash>`) authored by `bob` (non-assignee) → accepted.
2a. The same DevFlow scope n=3 edited on the fake afterwards (by anyone) → pending, its text excluded from the effective spec.
2b. Store off (`store:false, enabled:true`): `gh trd spec`/`foldTrd` on a TRD with a non-assignee scope → output identical to today's
    (scope applied, no `pending` key) and no objective-issue read in `fake.calls()`.
2c. Store off: `enqueueScope` queues a spec-rev entry whose event is exactly `scope n=1` (no `scope_hash`); store on: the same call
    queues `scope n=1 scope_hash=<scopeHash(text)>`.
3. `github.app_login:'devflow-app[bot]'` and a scope by that login → accepted.
4. `foldTrd` with n=1 accepted, n=2 pending, n=3 accepted → folds through 1 only; result lists pending [2]; spec-rev fold row `through 1`.
5. `gh trd spec 49-02` output (raw and JSON) shows the pending block with author and n.
6. `gh trd confirm-scope 49-02 2` as `alice` (assignee) → one queued `upsert-comment {id:'49-02', kind:'scope-confirm-2'}` whose text has
   the marker with the current hash; after flush, `readEffectiveSpec` applies n=2.
7. confirm-scope as `mallory` (not assignee) → exit 1, message lists `alice`, outbox empty.
8. confirm-scope with no assignees and no `--force` → exit 1 explaining `--force --reason`; with `--force --reason "solo repo"` →
   override log has a `scope-confirm` entry, op queued.
9. confirm-scope for a scope n that does not exist or is already accepted → exit 1 / exit 0 `already accepted` (no op).
10. Scope n=2 edited on the fake after confirmation → pending again on the next `readEffectiveSpec`.
11. `gh trd start 49-02` → queued `patch-issue {id:'49-02'} {labels_add:['devflow:in-progress']}`; after flush the label is on the issue;
    with `github.labels.in_progress:'wip'` the label is `wip`; offline (fake offline) → exit 3, op still queued.
12. Store off (`store:false`): `confirm-scope` and `start` → exit 0 `skipped`, `fake.calls()` empty. `spec` and `fold` are NOT
    skipped; they run as today (see 2b).
13. Help: the `gh` usage string lists `trd <spec|freeze|fold|scope|confirm-scope|start>`; help.test and dispatch-completeness green.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Store-mode pending scopes in readEffectiveSpec and foldTrd; hash-bound scope rows (tests 1-4, 2a-2c, 10)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-comments.cjs, plugins/devflow/devflow/bin/lib/gh-comments.test.cjs, plugins/devflow/devflow/templates/config.json</files>
  <action>
RED: tests 1-4, 2a, 2b, 2c, 10 in gh-comments.test.cjs (`describe('49-06 scope acceptance')`); commit `test(49-06): pending scopes`.
Update these existing store-mode assertions in gh-comments.test.cjs (the file runs `makeStoreProject({store:true})`, L38) to the
hash-bound event: ~L520 `['scope n=2', 'scope n=3']` and ~L702 `['freeze', 'scope n=1']` become `scopeEvent(n, scopeHash(text))` for the
same texts. L871 is a seeded legacy row on the drift read path; leave it (it must still cause no false drift).
GREEN: `enqueueScope` (L408) writes `scopeEvent(chosen, scopeHash(clean))` in store mode and `scope n=${chosen}` otherwise. Only when `planningMode` is `store`: in `readTrdState` (L211)
read the objective issue (via mapping `objectives[obj].issue_id`) for `assignees`; gather `devflowScopes` via `devflowScopesFrom(parseSpecRev(...))`, `confirms` via `parseScopeConfirms`, `appLogin` from config; build `scopeAcceptance`; pass `accept` to
`effectiveSpec` in `readEffectiveSpec` (L320) and `foldTrd` (L456) with the fold rule. Store off: none of this runs (no `accept`). Add `"app_login": ""` under `github` in
templates/config.json. Commit `feat(49-06): only accepted scopes change a TRD`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-comments.test.cjs</verify>
  <done>Tests 1-4, 2a-2c, 10 pass; the ~L520 and ~L702 assertions updated to the store-mode event; store-off event unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: `gh trd confirm-scope`, `gh trd start`, spec output, override gate, help (tests 5-9, 11-13)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-store-cli.cjs, plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs, plugins/devflow/devflow/bin/lib/gh-comments.cjs, plugins/devflow/devflow/bin/lib/override.cjs, plugins/devflow/devflow/bin/lib/help.cjs</files>
  <action>
RED: tests 5-9, 11-13 in gh-store-cli.test.cjs; commit `test(49-06): confirm-scope and trd start verbs`.
GREEN: `gh-comments.enqueueScopeConfirm(root, {trdId, n, text})`; in `cmdGhTrd` add `confirm-scope <trd> <n> [--force --reason <why>]
[--no-flush]` and `start <trd> [--no-flush]`, both store-gated (`planningMode` local → skipped, zero gh calls) and `requireEnabled`
(existing `spec|freeze|fold|scope` keep their current gating, `requireEnabled` only);
`spec` prints pending scopes. `override.GATES['scope-confirm'] = null`. Update help.cjs `gh` usage (L316) for the two verbs. Commit
`feat(49-06): confirm-scope and trd start`. Run gh-* suite, help.test, dispatch-completeness.
# GOTCHA: store-off 47 scope tests must pass untouched (the gate does not run there). A store-mode test that seeds a raw scope comment
# with no hash-bound spec-rev row will now see it pending: give that fixture a `scope n=K scope_hash=H` row (it models a DevFlow scope)
# rather than weakening the rule, and record it in the SUMMARY.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs && node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</verify>
  <done>Tests 5-9, 11-13 pass; gh-*, help and dispatch-completeness green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-comments.cjs`: `readTrdState` L211, `readEffectiveSpec` L320, `enqueueScope` L362 (queues `post-scope` + spec-rev row), `freezeTrd` L428, `foldTrd` L456.
- `gh-store-cli.cjs` `cmdGhTrd`: the `spec|freeze|fold|scope` verbs and the `result/emit` exit contract to copy.
- `override.cjs`: `GATES` L27, `recordOverride({planningDir, gate, reason, now})` L50.
- `help.cjs` L316 `gh` usage string; df-tools.cjs `case 'gh'` delegates `trd` wholesale to `cmdGhTrd` (no dispatcher edit needed).
</codebase_examples>
<anti_patterns>
- Filtering scopes in the cache materialiser: executors read the effective spec through `gh trd spec`; gate there and in fold.
- Accepting a confirm because its marker exists, without checking the comment's author against assignees.
</anti_patterns>
<error_recovery>
- If the objective issue number is missing from the mapping, `readTrdState` reports `assignees: null` and treats the TRD like "no assignee"
  (DevFlow/App scopes only); `gh trd spec` prints a hint to run `gh sync <objective>`.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-comments.test.cjs plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs' plugins/devflow/devflow/bin/lib/help.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs</regression>
</validation_gates>

<verification>
- SC3 at unit level: a non-assignee scope is pending until an assignee confirms (tests 1, 6, 7).
- `node --test plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs` green.
</verification>

<success_criteria>
A scope comment from a non-assignee is visible but not applied until an assignee confirms it, and a TRD can be marked in progress at spawn.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-06-SUMMARY.md`
</output>
