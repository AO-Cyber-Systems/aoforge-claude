---
objective: 47-github-authoritative-store
trd: "03"
type: tdd
wave: 1
depends_on: []
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-outbox.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs
autonomous: true
requirements: [GST-05]
must_haves:
  truths:
    - "The journal lives at `$DEVFLOW_OUTBOX_DIR/<repoKey>.json`, else `~/.claude/devflow/state/outbox/<repoKey>.json`; nothing is written inside the project"
    - "Ops are LOGICAL (`kind` + `target` + `payload`), validated against one `OP_KINDS` schema table; an invalid op is refused at enqueue"
    - "Enqueue coalesces a pending op with the same kind+target in place (latest payload wins, original `seq` kept) and is a no-op returning `skipped` when `github.enabled` is false"
    - "`nextOp` returns ops strictly in `seq` order and never returns an op past an earlier `pending` or `blocked` one"
    - "A corrupt journal is renamed to `.corrupt-<ts>` and reported, never silently dropped"
    - "A lockfile created with O_EXCL lets one flusher run at a time; a lock older than 10 minutes is stale and replaced"
    - "The cross-process write budget refuses a write at >= 80 in the last 60 s (with a wait) and >= 450 in the last hour (stop)"
    - "A per-issue base store (`<repoKey>.base.json`) records `{issue_number, issue_id, body_hash, updated_at}` used for remote-edit detection"
    - "The module is hook-safe: it requires only node builtins and `sync-state.cjs`"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-outbox.cjs
      provides: "OP_KINDS, validateOp, targetKey, opKey, stateDir, repoKey, journalPath, readJournal, writeJournal, enqueue, nextOp, markDone, markPending, markBlocked, setHalted, clearHalted, dropOp, status, acquireLock, budgetCheck, recordWrite, readBase, getBase, setBase, readCacheIndex, writeCacheIndex, isEnabled"
  key_links:
    - "47-07 gh-outbox-flush executes ops from this journal; 47-08 and 47-09 enqueue ops; 47-10 uses readCacheIndex/writeCacheIndex and setBase on pull; 47-11 `gh outbox status|flush|resolve` reads status()"
---

# TRD 47-03: Outbox journal store (GST-05, store half)

<objective>
Create `lib/gh-outbox.cjs`: the durable, per-repo queue for every GitHub issue write objective 47 introduces. It stores
logical ops, keeps FIFO order, coalesces duplicates, guards against two concurrent flushers, enforces the 80/min and 450/h
budget across processes, and keeps the "last known base" of each issue for remote-edit detection. No gh calls here;
execution is 47-07.

Purpose: GST-05 (durable, paced, resumable). Output: `gh-outbox.cjs` + `gh-outbox.test.cjs`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: RED commit before GREEN. Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Hook-safe: `require` only `fs`, `os`, `path`, `crypto` and `./sync-state.cjs` (for `atomicWrite`). Do NOT require `gh-client`,
  `helpers`, `upgrade` or `awareness-store` (keeps the post-commit / Stop hook path of objectives 49-50 cheap). Copy the 8-line
  `repoKey` from `awareness-store.cjs:57-67` with a comment; a test asserts the two agree.
- Every test sets `DEVFLOW_OUTBOX_DIR` and `HOME` to temp dirs; one guard test asserts the real `~/.claude/devflow/state/outbox`
  is untouched (listing and mtime before == after, or absent before and after).
- Inject time: functions take `now` (ms) as a parameter; no `Date.now()` inside logic paths except as a default argument.
- No property-based tests, no generated data, never port 8080.
- Research reference: `47-RESEARCH.md` → "Outbox design (GST-05)".

## Decisions taken in planning

- **D-13 One op schema table.** `OP_KINDS` is the single contract between enqueuers (47-08, 47-09, 47-12) and the executor (47-07):

| kind | target | payload |
|---|---|---|
| `upsert-issue` | `{id, role:'trd'\|'decision'}` | `{title, body, labels[], milestone_title\|null, type\|null}` |
| `patch-body` | `{id}` | `{mode:'managed', sections:{name:text}, preserve_ticks?:bool, derive?:{wiki?:{dir}, trds?:true, meta?:{type,work,kind}}}` or `{mode:'replace', body}` |
| `patch-issue` | `{id}` | `{type?, state?, state_reason?, labels_add?[]}` (at least one key) |
| `link-sub-issue` | `{parent, child}` | `{}` |
| `block` | `{blocked, blocker}` | `{}` |
| `set-fields` | `{id}` | `{values:{work?, kind?}}` |
| `upsert-comment` | `{id, kind}` | `{text, mode:'replace'}` or `{mode:'append-spec-rev', entry:{at,event,hash,chars}}` |
| `post-scope` | `{id, n}` | `{text}` |
| `wiki-push` | `{store:'pages'}` | `{pages:[cache_rel], message}` |

  Ids are DevFlow ids (`47`, `47-01`, `47-01-d1`), never issue numbers — the executor resolves numbers at run time, so a
  resume after a crash re-resolves state and cannot double-create.
  Capability-dependent parts are DERIVED at execution, not frozen into the op: `patch-body.derive` asks the executor to compute
  the `wiki` (pinned sha), `trds` (native line or task list) and `meta` (degraded only) sections; `wiki-push` names cache files
  (relative to `.planning/`) whose CURRENT bytes the executor writes into whichever store (wiki or `docs/`) capability selects.
  This keeps the journal small and lets a push queued offline, before capabilities are known, flush correctly later.
- **D-14 Disabled.** When `.planning/config.json` `github.enabled` is not `true`, `enqueue` writes nothing and returns
  `{skipped:true, reason}` (46's contract). Degraded mode is NOT disabled.
- **Budget numbers.** Minute window 80 (wait until the oldest write in the window ages out), hour window 450 (stop; report
  "budget; resume later"). The per-process `WRITE_BUDGET_PER_RUN` in gh-client remains a second guard.
- **Cache index** (`<repoKey>.cache.json`) stores `{relPath: contentHash}` of the last materialised cache file; 47-10 uses it to
  refuse overwriting a locally modified file. It lives here so all per-repo state shares one dir and one key.

<embedded_context>

<codebase_examples>
`repoKey` to copy (`awareness-store.cjs:57-67`):
```js
function repoKey(projectRoot) {
  let real;
  try { real = fs.realpathSync(projectRoot); } catch { real = path.resolve(projectRoot); }
  const slug = path.basename(real).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hash8 = crypto.createHash('sha1').update(real).digest('hex').slice(0, 8);
  return `${slug}-${hash8}`;
}
```
State dir convention (`awareness-store.cjs:44-48`):
```js
function stateDir(env = process.env, home) {
  const override = env && env.DEVFLOW_AWARENESS_DIR;
  if (override) return override;
  return path.join(home || os.homedir(), '.claude', 'devflow', 'state', 'awareness');
}
```
Atomic write (`sync-state.cjs:106-115`, exported as `atomicWrite`): tmp file + rename in the same dir.

Journal shape:
```json
{ "version": 1, "repo": "o/r",
  "ops": [ { "seq": 1, "key": "sha256:..", "kind": "upsert-issue", "target": {"id":"07-01","role":"trd"},
             "payload": {}, "base": null, "status": "pending", "attempts": 0, "last_error": null,
             "retry_after": null, "queued_at": "..", "done_at": null } ],
  "halted": null, "next_seq": 2, "writes": [1767225600000] }
```
`status` ∈ `pending | done | blocked`. `halted` = `{reason:'remote-edit'|'blocked', seq, target, detail}` or null.
</codebase_examples>

<anti_patterns>
- Storing argv. Ops are logical; argv is built by the executor at run time.
- Reordering by priority or kind. FIFO by `seq` only; the enqueuer is responsible for create → link → block order.
- Deleting `done` ops eagerly: keep the last 200 done ops for `status`, prune older ones on write.
- Swallowing a JSON parse error and starting an empty journal (silent data loss).
</anti_patterns>

<error_recovery>
- Corrupt journal: rename to `<file>.corrupt-<now>`, return `{journal: empty, recovered:{corrupt_path}}`; `status()` surfaces it.
- Lock held by a live, non-stale owner: `acquireLock` returns `{ok:false, running:true, owner:{pid, at}}`; the caller exits 0 with
  "flush already running".
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/47-github-authoritative-store/47-RESEARCH.md
</context>

<gotchas>
- `os.homedir()` honours `HOME` on macOS/Linux, so tests that set `HOME` are hermetic; still prefer `DEVFLOW_OUTBOX_DIR` in tests.
- Coalescing must only touch `pending` ops; a `blocked` op with the same target is NOT replaced (the human must resolve it first).
- `opKey(op)` = `contentHash`-style `sha256:` of `kind + JSON(target) + JSON(payload)` with sorted keys — write a tiny stable
  stringify; do not rely on insertion order.
- Lock file is created with `fs.openSync(path, 'wx')`; release removes it only if it still holds our pid.
</gotchas>

## Test list

Schema and keys
1. `validateOp` accepts one valid op of each of the 9 kinds; rejects unknown kind, missing target field, `patch-issue` with empty payload, a numeric target id (`{id: 12}`).
2. `opKey` is stable across payload key order; differs when payload differs.
3. `repoKey(dir)` equals `require('./awareness-store.cjs').repoKey(dir)` for a temp dir.

Journal
4. `journalPath(root)` honours `DEVFLOW_OUTBOX_DIR`; without it uses `$HOME/.claude/devflow/state/outbox/`.
5. `enqueue(root, [a, b, c], {now})` assigns seq 1,2,3, status pending, `queued_at` ISO from `now`.
6. Coalesce: enqueue `patch-body` for `07` twice with different sections → one op, original seq, latest payload; a `blocked` op for the same target is not replaced (new op appended).
7. `enabled:false` in config → `{skipped:true}` and no file created.
8. `nextOp`: seq 1 done, 2 pending, 3 pending → 2; seq 2 blocked → null with `halted` reason `blocked`; `halted` set → null.
9. `markDone`, `markPending({error, retry_after})` (attempts++), `markBlocked(reason)`, `dropOp(seq)`; `status()` counts `{pending, blocked, done, halted}`.
10. Corrupt journal file → renamed `.corrupt-*`, empty journal returned, `status().recovered` names the path.
11. Done-op pruning keeps the newest 200 done ops.

Lock and budget
12. `acquireLock` twice → second `{ok:false, running:true}`; after `release()` acquires again; a lock with `at` older than 10 min is stale → acquired, `stale_replaced:true`.
13. `budgetCheck(journal, now)`: 79 writes in the last 60 s → ok; 80 → `{ok:false, reason:'minute', wait_ms}` where wait_ms ages out the oldest; 450 in the last hour → `{ok:false, reason:'hour'}`; writes older than 1 h are pruned by `recordWrite`.

Base and cache index
14. `setBase(root, '07-01', {issue_number:12, issue_id:1000012, body_hash, updated_at})`, `getBase` round-trips; `readBase` on missing file → `{}`.
15. `writeCacheIndex(root, {'objectives/07-store-demo/OBJECTIVE.md':'sha256:..'})` / `readCacheIndex` round-trip.

Hygiene
16. Guard: the real `~/.claude/devflow/state/outbox` listing is unchanged by the whole suite (compute the real path from `os.userInfo().homedir`, not `HOME`).
17. `gh-outbox.cjs` source requires only fs/os/path/crypto/./sync-state.cjs (static check on `require(` lines).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Op schema, keys, journal store, enqueue/coalesce/FIFO (tests 1-11)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-outbox.cjs, plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</files>
  <action>
RED: tests 1-11 with a hand-built op factory `op(kind, target, payload)` and a temp project helper that writes
`.planning/config.json` `{github:{enabled:true, repo:'o/r'}}`. Commit RED.

GREEN: implement `OP_KINDS` (table in Decisions), `validateOp`, `targetKey`, `opKey`, `stateDir(env, home)`
(`DEVFLOW_OUTBOX_DIR` override, else `~/.claude/devflow/state/outbox`), `repoKey`, `journalPath`, `isEnabled(root)`
(reads `.planning/config.json` directly with fs + JSON.parse; missing/invalid → false), `readJournal`, `writeJournal`
(atomicWrite, prunes done ops beyond 200), `enqueue(root, ops, {now = Date.now()} = {})` → `{ok, enqueued:[seq], coalesced:[seq], skipped?}`,
`nextOp`, `markDone`, `markPending`, `markBlocked`, `setHalted`, `clearHalted`, `dropOp`, `status`.
# CRITICAL: enqueue validates ALL ops before writing ANY (all-or-nothing).
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</verify>
  <done>Tests 1-11 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Lock, cross-process budget, base store, cache index, hygiene (tests 12-17)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-outbox.cjs, plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</files>
  <action>
RED: tests 12-17. Commit RED.

GREEN: `acquireLock(root, {now, staleMs = 600000, pid = process.pid})` → `{ok, release, stale_replaced}` |
`{ok:false, running:true, owner}`; `budgetCheck(journal, now)` and `recordWrite(journal, at)` (mutates and returns the journal;
callers persist via writeJournal); `readBase/getBase/setBase` on `<repoKey>.base.json`; `readCacheIndex/writeCacheIndex`
on `<repoKey>.cache.json`. All writes via `atomicWrite`.
Commit GREEN.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</verify>
  <done>Tests 1-17 pass; static require check passes.</done>
</task>

</tasks>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</test>
</validation_gates>

<verification>
- `rg -n "require\(" plugins/devflow/devflow/bin/lib/gh-outbox.cjs` lists only fs, os, path, crypto, ./sync-state.cjs.
- The guard test proves the real state dir is untouched.
</verification>

<success_criteria>
A durable, hook-safe, per-repo outbox exists with one op contract, FIFO order, coalescing, a single-flusher lock, a
cross-process write budget and a base-hash store.
</success_criteria>

<output>
After completion, create `.planning/objectives/47-github-authoritative-store/47-03-gh-outbox-store-SUMMARY.md`
</output>
