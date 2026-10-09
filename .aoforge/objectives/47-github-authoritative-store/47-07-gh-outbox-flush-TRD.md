---
objective: 47-github-authoritative-store
trd: "07"
type: tdd
wave: 2
depends_on: ["47-01", "47-02", "47-03", "47-04", "47-05"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-client.cjs
  - plugins/devflow/devflow/bin/lib/gh-client.test.cjs
autonomous: true
requirements: [GST-05, GST-01, GST-04, GST-06, GST-08]
must_haves:
  truths:
    - "`flush(root)` executes journal ops strictly in `seq` order through gh-client, one handler per `OP_KINDS` kind, and every handler is idempotent (a re-run after a crash creates nothing twice: marker scan + existing-link reads + 422 'already exists' = success)"
    - "Issues are created with REST `POST repos/o/r/issues` (`--input -`) storing BOTH `number` and `rest_id`; sub-issue and dependency writes send `rest_id` with `-F`, never the number"
    - "A create whose response `type` is not the requested type is reported and recorded; the scan label already carries the type (D-08 runtime half)"
    - "Offline or rate-limited ops stay `pending` and the flush stops with status `pending`; reconnecting and flushing again completes them in the original order (SC4 unit level)"
    - "Before patching an issue body or a DevFlow comment, the flusher compares the CURRENT body hash with the stored base; a change inside managed sections (or to a frozen/fully-managed TRD body) halts the flush with a report naming the issue and nothing is written; a change only to human text outside managed sections is merged and the flush continues"
    - "`updated_at` is only a pre-filter: DevFlow's own link/comment writes bumping `updated_at` never cause a halt (Pitfall 2)"
    - "gh-client gains a scoped retry policy (`withRetryPolicy(policy, fn)`) that is never smuggled through `opts`; `wait:false` flushes run with `maxRetries:0` and never sleep on a secondary limit"
    - "The cross-process budget (80/min, 450/h) is checked before every op and every gh write performed by the flusher is recorded in the journal"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
      provides: "classifyFailure, HANDLERS, flush, resolveHalt, deriveSections"
    - path: plugins/devflow/devflow/bin/lib/gh-client.cjs
      provides: "adds withRetryPolicy, writeCount; attemptLoop honours the active policy"
  key_links:
    - "Consumes gh-outbox (journal/lock/budget/base), gh-trd (contentHash, splitParts, appendSpecRev), gh-body (mergeManaged, findCommentsByMarker, section builders), gh-mapping (getTrd/setTrd, getEntry), gh-issue (createRunContext, ensureMilestone), gh-wiki (openStore). Capabilities are INJECTED (`opts.modes` / `opts.getModes`) so this TRD does not depend on 47-06; the default lazily requires gh-capability"
---

# TRD 47-07: Outbox flusher, op handlers, remote-edit halt, client retry policy (GST-05)

<objective>
Create `lib/gh-outbox-flush.cjs`: the single executor for the outbox. It takes the lock, checks the budget, runs ops in order
through idempotent handlers, stops cleanly when offline or rate-limited, and halts for a human when an issue was edited on GitHub
inside DevFlow's managed regions since the last pull. Extend `gh-client.cjs` with a scoped retry policy so a flush running in a hook
never sleeps for minutes.

Purpose: GST-05 (paced, resumable, remote-edit halt) and the write mechanics of GST-01/04/06/08. Output: flusher + tests;
client extension + tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Every gh call through `gh-client` (`ghRead`, `ghWrite`, `ghPaginate`); git only through `gh-wiki`. No `spawnSync` here.
- Tests: fake installed via `client._setRunGh(fake.runGh)`, fake clock via `_setNow/_setSleep`, `_resetClient()` in afterEach,
  `hermeticEnv()` + `makeStoreProject()` from `__fixtures__/gh-store-fixtures.cjs`, wiki via `__fixtures__/wiki-remote.cjs`.
  Inject modes (`flush(root, {modes})`) — do not require gh-capability in tests.
- Every existing `gh-client.test.cjs` case passes unchanged (default policy = today's behaviour).
- No property-based tests, no generated data, never port 8080, never real GitHub or real `~/.claude`.
- Research reference: `47-RESEARCH.md` → "Outbox design (GST-05)", "GitHub API facts", Pitfalls 1, 2, 3, 7, 8; Open Question 7.

## Decisions taken in planning

- **D-23 Retry policy (Pitfall 8).** `gh-client.withRetryPolicy({maxRetries}, fn)` sets a module-level policy for the
  duration of `fn` (try/finally restore), so helpers the handlers call (e.g. `gh-issue.ensureMilestone`) inherit it. `attemptLoop` reads
  the active policy; `opts` is still spread into `spawnSync` untouched and never carries policy keys. Interactive flush: default
  (`MAX_RETRIES` = 4). `flush(root, {wait:false})` (hooks, objective 49/50): `{maxRetries:0}`; a secondary limit leaves the op pending with
  `retry_after` from `parseRetryAfter`.
- **D-24 Remote-edit detection (Pitfall 2).** The base store keeps per target `{issue_number, rest_id, body_hash,
  managed_hash, updated_at, frozen}`; `managed_hash` = contentHash of the concatenated managed-section inner texts (gh-body
  `extractSection` for each name present), computed with criteria checkboxes normalised (`- [x]` → `- [ ]`) so a verifier or human
  ticking a success criterion is NOT a remote edit (the tick is carried forward by `preserve_ticks`). Before a body write: GET the issue; if `updated_at === base.updated_at` skip hashing; else
  compare hashes:
  - objective body (`patch-body` managed): `managed_hash` differs → HALT; only `body_hash` differs → merge onto the fresh body and continue.
  - TRD body (fully DevFlow-managed; `upsert-issue` update or `patch-body` replace): `body_hash` differs → HALT.
  - frozen TRD (`base.frozen`): never patch the body; a differing hash is reported as `drift` (warning), op marked done.
  - no base yet (first DevFlow write to an issue created by 46): the fresh body becomes the base; no halt.
  After every successful write, store the hash of the body RETURNED by GitHub (never a locally recomputed one).
  Comments: base key `<id>#<kind>`; a `replace` comment whose current hash differs from base → HALT; `append-spec-rev` never halts.
- **D-04 runtime.** `upsert-comment` replace mode splits text with `gh-trd.splitParts(text, COMMENT_MAX_CHARS, {reserve})`; existing part
  comments are patched in order, missing ones posted; surplus older parts are re-marked to kind `<kind>-superseded` (never deleted).
- **D-21 Halt resolution.** `resolveHalt(root, seq, 'accept-remote'|'overwrite')`: accept-remote drops the op and refreshes the base from
  GitHub; overwrite refreshes the base and re-queues the op unchanged (it will then merge/replace). Both clear `halted`.
- **Hierarchy fallback.** `link-sub-issue` with `modes.hierarchy === 'tasklist'` is marked done with `note:'tasklist'` (the objective's
  `trds` section, derived at execution, carries the task list).
- **Pages.** `wiki-push` with `modes.pages === 'blocked'` → op `blocked`, flush halted with the capability message; `'docs'` → pages written
  to `docs/devflow/`, done; `'wiki'` → `ensureClone`, write pages from the CURRENT cache files, `push`; rebase conflict → blocked (human);
  offline → pending.

<embedded_context>

<codebase_examples>
Attempt loop to extend (`gh-client.cjs:218-235`):
```js
function attemptLoop(args, opts, paced) {
  for (let attempt = 0; ; attempt++) {
    if (paced) { if (writeCount >= WRITE_BUDGET_PER_RUN) return budgetExhausted(attempt); ...sleep to pace... }
    const r = runGhImpl(args, opts);
    if (paced) { writeCount++; lastWriteAt = nowImpl(); }
    if (r.ok || !isSecondaryLimit(r) || attempt >= MAX_RETRIES) return { ...r, attempts: attempt + 1 };
    sleepImpl(retryDelayMs(r, attempt));
  }
}
```
Replace `MAX_RETRIES` in the condition with `activePolicy.maxRetries` (default `MAX_RETRIES`). Export `writeCount: () => writeCount`.

REST shapes (research "Code Examples"):
```js
ghWrite(['api', '--method', 'POST', `repos/${repo}/issues`, '--input', '-'],
        { input: JSON.stringify({ title, body, labels, milestone: milestoneNumber, type: 'TRD' }) });
ghWrite(['api', '--method', 'POST', `repos/${repo}/issues/${parent.number}/sub_issues`, '-F', `sub_issue_id=${child.rest_id}`]);
ghWrite(['api', '--method', 'POST', `repos/${repo}/issues/${blocked.number}/dependencies/blocked_by`, '-F', `issue_id=${blocker.rest_id}`]);
ghWrite(['api', '--method', 'PATCH', `repos/${repo}/issues/${n}`, '--input', '-'], { input: JSON.stringify({ body }) });
```
Existing helpers: `gh-issue.createRunContext(cwd)` (enabled gate, mapping, label), `gh-issue.ensureMilestone(runCtx, title)` → number;
`gh-mapping.readMappingV3/writeMappingV3`, `getEntry(m, objId).issue_id` is the objective issue NUMBER (46 naming).

classifyFailure (pure):
| class | rule | flusher action |
|---|---|---|
| `offline` | `status === null` or stderr `/could not resolve host|connection refused|timed out|network is unreachable|dial tcp|EOF/i` | pending, stop (`pending`) |
| `rate_limited` | `client.isSecondaryLimit(r)` or budget refusal | pending + `retry_after`, stop (`pending`) |
| `already_exists` | 422 with `already exists|already been taken|duplicate` | success |
| `validation` | other 422 | blocked, halt |
| `permission` | 403 not secondary | blocked, halt |
| `not_found` | 404 on a mapped issue | blocked, halt (report: deleted on GitHub? orphan) |
| `error` | anything else | blocked, halt |
</codebase_examples>

<anti_patterns>
- Comparing `updated_at` alone for remote edits (Pitfall 2) — the fake bumps it on DevFlow's own link/comment writes; a test proves no false halt.
- Sending `issue_number` as `sub_issue_id`/`issue_id` (Pitfall 1); `-f` instead of `-F` (string → 422).
- Running an op past an earlier pending/blocked op.
- Sleeping inside a `wait:false` flush.
- Deleting comments, sub-issue links or dependencies.
</anti_patterns>

<error_recovery>
- Crash mid-flush: the lock is stale after 10 minutes; the next flush re-runs the first pending op, whose handler re-resolves state
  (marker scan, existing links) — no duplicate.
- A handler throwing a JS error → op blocked with `last_error: e.message`, flush halted, lock released (try/finally).
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/47-github-authoritative-store/47-RESEARCH.md
@.planning/objectives/47-github-authoritative-store/47-03-gh-outbox-store-TRD.md
</context>

<gotchas>
- TRD list-and-scan: `ghPaginate('repos/o/r/issues?labels=devflow:trd&state=all')` + `gh-body.indexByMarker`; duplicates → blocked (never guess).
- Labels: TRD issues get `[github.labels.trd || 'devflow:trd']`, decisions `[github.labels.decision || 'devflow:decision']`; create missing
  labels lazily with `gh label create` (idempotent, like `ensureObjectiveLabel`).
- Milestone on REST create is the NUMBER from `ensureMilestone`.
- Cache sub-issue and blocked_by reads per flush (one GET per parent / per blocked issue).
- **D-10** `gh api --input -` stdin (research Open Q7): `defaultRunGh` spreads `opts` into `spawnSync`, so `{input}` reaches stdin; the client test
  asserts the runner receives `opts.input` byte-identical and no policy keys.
</gotchas>

## Test list

gh-client (added to `gh-client.test.cjs`)
1. Default policy: secondary limit retried up to 4 times (existing behaviour unchanged).
2. `withRetryPolicy({maxRetries:0}, () => ghWrite(...))` → one attempt, no `sleep` call, result carries the limit failure; policy restored afterwards (next call retries again), also when `fn` throws.
3. The runner receives `opts` exactly as passed (`{input:'{"a":1}'}`) — no policy keys — for `--input -` writes (Open Q7).
4. `writeCount()` increases by one per paced attempt.

classifyFailure
5. One case per row of the classification table, including 422 "already exists" → `already_exists`.

Handlers (fake + temp project, modes injected native)
6. `upsert-issue` (trd) create: one REST POST with `--input`, labels `devflow:trd`, milestone number, `type:'TRD'`; mapping `trds['7-01']` has `issue_number` and `rest_id = 1_000_000 + number`; base stored from the response body.
7. Re-run the same op after deleting the mapping → found by marker scan, zero creates (idempotent).
8. Create response with `type: null` (fake org without TRD type) → warning `type TRD not applied`, op done.
9. `link-sub-issue` sends `-F sub_issue_id=<rest_id>`; repeating it → zero writes (read finds the child); `modes.hierarchy:'tasklist'` → zero writes, done with note.
10. `block` sends `-F issue_id=<blocker rest_id>` on the blocked issue's number; repeat → zero writes.
11. `set-fields` native → POST issue-field-values with field ids; `modes.fields:'meta'` → zero writes.
12. `upsert-comment` replace: posts `<!-- devflow:id=7-01 kind=summary -->` + text; second run with same text → zero writes; 130K-char text → 3 part comments; shrinking to 1 part re-marks parts 2-3 as `summary-superseded`.
13. `upsert-comment append-spec-rev`: creates the spec-rev comment then appends; identical entry → zero writes; `freeze` entry sets `base.frozen`.
14. `post-scope n=2` posts once; re-run → zero writes.
15. `patch-body` managed with `derive:{wiki:{dir}, trds:true, meta:{...}}`: wiki section has the store's `headSha` and dir marker; trds section native line (or task list under `tasklist`); meta present only when `modes.types==='labels'` or `modes.fields==='meta'`; `preserveTicks:true` keeps a verifier tick.
16. `wiki-push` with `modes.pages:'wiki'` → page on the fixture remote; `'docs'` → `docs/devflow/<Page>.md`; `'blocked'` → op blocked, flush halted with the capability message.

Flush loop (SC4 unit)
17. Three ops; `fake.setOffline(true)` → flush returns `{status:'pending'}`, all 3 pending, zero successful writes; `setOffline(false)` → flush runs 1,2,3 in order (assert fake write order) and returns `flushed`.
18. Op 2 blocked (fake 403) → op 3 not executed; `halted.reason === 'blocked'`.
19. Remote edit: after a successful managed patch, `fake.humanEditBody(n, <body with a managed section changed>)`; enqueue another patch → `{status:'halted', halted:{reason:'remote-edit', target:{id:'7'}, issue_number:n}}`, ZERO writes after the halt.
20. Human text added OUTSIDE managed sections → merged, no halt, human text preserved byte-for-byte.
20a. A criterion ticked on GitHub (`[ ]`→`[x]` inside `criteria` only) → no halt; the next managed patch keeps the tick.
21. TRD body edited on GitHub then an `upsert-issue` update → halt; frozen TRD with edited body → no write, `drift` warning, done.
22. DevFlow's own link + comment writes bump `updated_at`, then a managed patch → no halt (Pitfall 2).
23. `resolveHalt(seq,'accept-remote')` drops the op and refreshes base; `'overwrite'` re-queues; both clear `halted`; next flush proceeds.
24. Budget: journal with 80 writes in the last 60 s → `wait:true` sleeps (fake sleep) then runs; `wait:false` → `pending` without sleep; 450 in the hour → `pending`, reason `budget`.
25. Lock held by another live owner → `{status:'running'}`, zero gh calls.
26. Secondary limit during a `wait:false` flush → op pending with `retry_after`, no sleep recorded.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: gh-client scoped retry policy + classifyFailure (tests 1-5)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-client.cjs, plugins/devflow/devflow/bin/lib/gh-client.test.cjs, plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs, plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs</files>
  <action>
RED: tests 1-4 in `gh-client.test.cjs`; test 5 in a new `gh-outbox-flush.test.cjs`. Commit RED.
GREEN: in gh-client add `let activePolicy = { maxRetries: MAX_RETRIES }`, `withRetryPolicy(policy, fn)` (validate `maxRetries` is a
non-negative integer; try/finally restore), use `activePolicy.maxRetries` in `attemptLoop`, export `withRetryPolicy` and
`writeCount: () => writeCount`; `_resetClient()` also resets the policy. Create `gh-outbox-flush.cjs` with `classifyFailure(r)`.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-client.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs</verify>
  <done>Tests 1-5 pass; every pre-existing gh-client test passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Idempotent op handlers and derived sections (tests 6-16)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs, plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs</files>
  <action>
RED: tests 6-16 (one `describe` per kind) on `makeStoreProject()` + `createFakeGitHub(fakeOptions)`; seed the objective issue with
`fake.seedIssue` carrying `<!-- devflow:id=7 -->` and set `mapping.objectives['7']`. Commit RED.
GREEN: `HANDLERS = { 'upsert-issue', 'patch-body', 'patch-issue', 'link-sub-issue', 'block', 'set-fields', 'upsert-comment', 'post-scope', 'wiki-push' }`,
each `(ctx, op) → {ok, class?, warnings, note?, halt?}` where `ctx = {root, repo, runCtx, mapping, modes, caps, cache:{subIssues, blockedBy, comments}, store}`.
`deriveSections(ctx, payload)` builds wiki/trds/meta via gh-body builders, gh-wiki `objectivePage` / `pageRevisionUrl` / store `headSha`.
Persist mapping changes with `writeMappingV3` after each successful op that changed it; persist base via `gh-outbox.setBase`.
# CRITICAL: store hashes of bodies RETURNED by GitHub, never locally recomputed ones.
# GOTCHA: objective issue number = getEntry(mapping, objId).issue_id (46 naming); TRD = getTrd(...).issue_number / .rest_id.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs</verify>
  <done>Tests 5-16 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Flush loop — order, offline, halt, budget, lock, resolve (tests 17-26)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs, plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs</files>
  <action>
RED: tests 17-26. Commit RED.
GREEN: `flush(root, {wait = true, modes, getModes, now, maxOps} = {})` → `{status:'flushed'|'pending'|'halted'|'running'|'skipped'|'error', done:[seq], pending, halted, warnings}`.
Approach:
1. `outbox.isEnabled(root)` false → `skipped`. `acquireLock` → `running` if held.
2. modes = `opts.modes || (opts.getModes || defaultGetModes)(root)`; `defaultGetModes` lazily requires gh-capability (`detectCapabilities` + `resolveModes`); provisional/stale modes are re-detected here.
3. Loop: `op = nextOp(journal)`; none → `flushed`. `budgetCheck` → minute: `wait ? sleep(wait_ms) : stop pending`; hour → stop pending (reason `budget`).
4. `before = client.writeCount()`; run `client.withRetryPolicy(wait ? default : {maxRetries:0}, () => HANDLERS[op.kind](ctx, op))`;
   record `writeCount() - before` timestamps via `recordWrite`.
5. Map result: ok → markDone; halt → setHalted + stop `halted`; class offline/rate_limited → markPending + stop `pending`; else markBlocked + setHalted + stop `halted`.
6. Persist the journal after every op; release the lock in `finally`.
`resolveHalt(root, seq, choice)` per D-21.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs plugins/devflow/devflow/bin/lib/gh-client.test.cjs plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs</verify>
  <done>Tests 1-26 pass; 46 e2e still green.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs plugins/devflow/devflow/bin/lib/gh-client.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/gh-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-sync.test.cjs plugins/devflow/devflow/bin/lib/gh-shim.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</regression>
</validation_gates>

<verification>
- `rg -n "spawnSync|child_process" plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs` → no matches.
- `rg -n "sub_issue_id=\\$\\{[^}]*number" plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs` → no matches (ids, not numbers).
- Tests 17 and 19 demonstrate SC4 at unit level.
</verification>

<success_criteria>
One executor drains the outbox in order, idempotently, at GitHub's pace; it waits out outages, never sleeps inside hooks,
and stops for a human when GitHub content DevFlow manages was edited remotely.
</success_criteria>

<output>
After completion, create `.planning/objectives/47-github-authoritative-store/47-07-gh-outbox-flush-SUMMARY.md`
</output>
