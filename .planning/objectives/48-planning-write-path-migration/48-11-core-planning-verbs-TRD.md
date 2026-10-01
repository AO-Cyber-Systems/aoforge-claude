---
objective: 48-planning-write-path-migration
trd: "11"
type: tdd
wave: 2
depends_on: ["48-01", "48-03", "48-05"]
files_modified:
  - plugins/devflow/devflow/bin/lib/planning-verbs.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-store-cli.cjs
  - plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs
autonomous: true
requirements: [GWP-01, GWP-05]
must_haves:
  truths:
    - "LOCAL MODE INVARIANT (D-01): `putTrd`, `objectivePut`, `objectiveSetStatus` (non-complete), `summaryPost`, `summaryCheckpoint`, `verificationPost`, `docPut` write exactly the file today's prose writes — same path, same bytes as the `--from` input — and make zero gh calls and zero outbox/ledger writes"
    - "STORE MODE: each verb validates, writes the cache file atomically, records the ledger, enqueues the right op(s) (hierarchy push, summary/verification comment, wiki-push, patch-issue), flushes unless `noFlush`, and after a completed flush records the cache baseline and clears the ledger entry (D-15)"
    - "`putTrd` in store mode refuses an encoded body over 60,000 chars before writing anything and warns at 40,000+; linked-bulk findings are warnings (U-2, D-06); local mode only warns. `noPush` skips the hierarchy enqueue (D-11); `planPush` enqueues it once"
    - "`putTrd` in store mode on a frozen TRD refuses naming `gh trd scope`; when the freeze state cannot be read (offline) it warns and proceeds"
    - "`summaryCheckpoint` writes SUMMARY.md in local mode and `.planning/.trd-progress/<trd>.md` in store mode, never enqueuing (D-12)"
    - "`docPut` accepts only rels with `gh-wiki.pageForCachePath(rel) !== null` and otherwise fails naming the class and the right verb from planning-paths"
    - "`draftPath(root, rel)` returns an absolute path under `os.tmpdir()/devflow-drafts/<repoKey>/<rel>`, seeded with the current cache content when it exists (D-13)"
    - "Every verb resolves the MAIN checkout first, so a call from a worktree uses the main journal and cache (D-14)"
    - "`gh outbox flush` settles the ledger after a drained flush: entries whose bytes still match are baselined and forgotten"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-verbs.cjs
      provides: "writeThrough, putTrd, planPush, objectivePut, objectiveSetStatus, summaryPost, summaryCheckpoint, verificationPost, docPut, draftPath, STATUSES"
    - path: plugins/devflow/devflow/bin/lib/gh-store-cli.cjs
      provides: "exports queuedResult/EXIT/flushResult; settleLedger after flush"
  key_links:
    - "Consumes 47: gh-hierarchy.pushHierarchy, gh-comments.enqueueSummary/enqueueVerification/readTrdState, gh-trd.assertEditable, gh-outbox.enqueue, gh-cache.recordCacheBaseline, gh.syncObjective, gh-wiki.pageForCachePath; 48-01 mode/paths/ledger; 48-03 trd-bulk.checkTrd"
    - "CLI wiring is 48-15; entity verbs (decision/todo/debug/quick/milestone/import) are 48-12 and reuse `writeThrough`"
---

# TRD 48-11: Core planning verbs — put-trd, objective, summary, verification, doc, drafts (GWP-01)

<objective>
Build the verb library that every skill and agent will call: one `writeThrough` primitive with a local branch (today's file write) and a
store branch (cache + ledger + outbox + flush + baseline), and the core verbs on top of it. Export the 47 enqueue-then-flush helper and
settle the ledger after flushes.

Purpose: GWP-01 (core verbs), GWP-05 (put-trd budget), D-01/D-06/D-11/D-12/D-13/D-14/D-15. Output: `planning-verbs.cjs` + tests, gh-store-cli changes + tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD; every verb gets a LOCAL-mode test (bytes + path + zero gh calls + no outbox file) before its STORE-mode test.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- No `spawnSync` in planning-verbs: gh only through 47 libraries (gh-client seam), git only through gh-wiki. Results are plain objects
  `{ok, mode, rel, path, warnings, queued?, flush?, exit}`; no `process.exit`, no stdout (CLI is 48-15).
- Tests: `hermeticEnv()`, `makeStoreProject({store:true|false})`, `createFakeGitHub(project.fakeOptions)` + `gh._setRunGh(fake.runGh)`,
  `createWikiRemote()` for doc put, fake clock; `_resetClient()` afterEach. Hand-written TRD/summary texts (47's `oversizedTrdText` for sizes).
  Never real GitHub/`~/.claude`, never port 8080.

## Decisions

D-01, D-06, D-08, D-11, D-12, D-13, D-14, D-15, D-16. Settled here:

- **writeThrough(root, {rel, text, verb, enqueue, noFlush})**: `main = resolveMainRoot(root)`; `mode = planningMode(main).mode`.
  local → `atomicWrite(main/.planning/rel, text)` (create dirs); return `{ok:true, mode:'local', exit:0}`.
  store → atomic write; `ledger.record(main, rel, text, {verb})`; `queued = enqueue(main)`; if `noFlush` → `exit:0` + queued note;
  else `flush(main)`; on flush status `done` → `recordCacheBaseline(main, [rel])` + `ledger.forget(main,[rel])`. Exit codes = 47 `EXIT`
  (0 ok, 1 error, 2 halted, 3 pending). A failing `enqueue` leaves the cache file written AND in the ledger (W055 stays quiet; the next
  verb or `planning import` re-enqueues) and returns exit 1 with the error.
- **putTrd(root, {objective, file, text, noPush, noFlush})**: file must match `TRD_FILE_RE` and belong to the objective; dir via
  `gh-hierarchy.resolveObjectiveDir`. `trdBulk.checkTrd`: store + `over` → `{ok:false, refused:'budget', exit:1}` with nothing written.
  Store: freeze check via `ghComments.readTrdState` → `ghTrd.assertEditable`; a read failure → warning "freeze state unknown (offline); proceeding".
  Enqueue = `pushHierarchy(main, objective)` unless `noPush`.
- **planPush(root, objective)**: store → `pushHierarchy` + flush (+ baseline of all TRD rels the push covered); local → `{ok:true, skipped:'local mode'}`.
- **objectivePut(root, {id, text})** → rel `objectives/<dir>/OBJECTIVE.md`; store enqueue = `gh.syncObjective(id, main)` (find-or-create; its
  store path enqueues the body patch per 47-12) + wiki-push of the objective page.
- **objectiveSetStatus(root, {id, status})**: `STATUSES = ['planned','in_progress','verifying','complete','cancelled','reopened']`; unknown → error
  listing them. Local: set frontmatter `status:` in OBJECTIVE.md via `frontmatter.setFrontmatterField` on the text, then writeThrough; for
  `complete` also return `{delegate:'objective complete'}` (48-15 runs today's `cmdObjectiveComplete`). Store: terminal statuses enqueue
  `patch-issue` (`complete` → `{state:'closed', state_reason:'completed'}`, `cancelled` → `not_planned`, `reopened` → `{state:'open'}`) plus the
  frontmatter update through `objectivePut`; non-terminal statuses = frontmatter through `objectivePut` only.
- **summaryPost(root, {trd, text, file?})**: rel = `objectives/<dir>/<file || <trd-prefix>-SUMMARY.md>`; store enqueue = `enqueueSummary`; also
  deletes `.planning/.trd-progress/<trd>.md` if present.
- **summaryCheckpoint**: local → same rel as summaryPost; store → `.trd-progress/<trd>.md` plain atomic write, no ledger, no enqueue.
- **verificationPost(root, {objective, text, file?})**: rel `objectives/<dir>/<prefix>-VERIFICATION.md`; store enqueue = `enqueueVerification`.
- **docPut(root, {rel, text, message})**: page check; store enqueue = `outbox.enqueue([{kind:'wiki-push', target:{}, payload:{pages:[rel], message}}])`
  (check the exact `wiki-push` target/payload schema in `OP_KINDS` and use it verbatim).
- **draftPath(root, rel)**: `os.tmpdir()/devflow-drafts/<outbox.repoKey(main)>/<rel>`; mkdir -p; copy current cache file if present and the
  draft is absent; return the absolute path.
- **settleLedger(root)** in gh-store-cli `flushResult`: when the flush status is `done` (journal drained), `settleCandidates` → baseline + forget
  matching rels; drifted rels stay (W055 will report them).

## Test list

local mode (`makeStoreProject({store:false})`, fake installed to prove zero calls)
1. `putTrd` writes `.planning/objectives/07-store-demo/07-04-x-TRD.md` with the input bytes; `fake.calls().length === 0`; no outbox journal file exists.
2. `putTrd` with a 61,000-char TRD → written, warning names `over`; a 9,000-char fenced block → bulk warning.
3. `objectivePut`, `summaryPost`, `summaryCheckpoint`, `verificationPost`, `docPut('PROJECT.md')` → exact files, zero calls.
4. `objectiveSetStatus(7, 'verifying')` → OBJECTIVE.md frontmatter `status: verifying`, rest byte-identical; `'complete'` → `{delegate:'objective complete'}`; `'bogus'` → error listing STATUSES.
5. `docPut('objectives/07-store-demo/07-01-a-TRD.md')` → error naming `plan put-trd`.

store mode (`makeStoreProject({store:true})`, fake GitHub, wiki remote)
6. `putTrd` ×3 with `noPush`, then `planPush(7)` → fake has 3 TRD sub-issues; ledger empty after the flush; cache index holds the 3 hashes.
7. `putTrd` over 60,000 → `refused:'budget'`, file not written, zero calls.
8. `putTrd` on a frozen TRD (fake spec-rev comment marks it frozen) → refused naming `gh trd scope`; fake offline → warning "freeze state unknown", proceeds, exit 3 (pending).
9. `summaryPost('7-01')` → `devflow:summary` comment on the TRD issue; `.trd-progress/7-01.md` removed.
10. `summaryCheckpoint('7-01')` → `.planning/.trd-progress/7-01.md` written, zero calls, no ledger entry.
11. `verificationPost(7)` → sticky verification comment on the objective issue.
12. `docPut('research/a.md')` → page `Research-a` in the wiki remote; `docPut('objectives/07-store-demo/07-CONTEXT.md')` → context page.
13. `objectiveSetStatus(7, 'complete')` → objective issue closed/completed; `'cancelled'` → not_planned.
14. `noFlush` → exit 0, journal has the op, ledger holds the rel, no baseline yet; then `gh outbox flush` (via `cmdGhOutbox`) settles: baseline recorded, ledger empty.
15. Worktree: hand-built worktree layout (as in 48-01 test 3) → `putTrd` with `root` = worktree writes into the MAIN `.planning/` and the main journal.
16. `draftPath` returns a path under `os.tmpdir()/devflow-drafts/`, seeded with the cache text; second call does not overwrite the draft.
17. `queuedResult`, `EXIT`, `flushResult` are exported from gh-store-cli and existing gh-store-cli tests pass.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: writeThrough, putTrd, planPush, draftPath; export queuedResult (tests 1-2, 5-8, 15-17)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-verbs.cjs, plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs, plugins/devflow/devflow/bin/lib/gh-store-cli.cjs, plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs</files>
  <action>
RED: tests 1-2, 5-8, 15-16 in `planning-verbs.test.cjs` and 17 in `gh-store-cli.test.cjs`. Commit `test(48-11): writeThrough and put-trd`.
GREEN: export `queuedResult`, `EXIT`, `flushResult` from gh-store-cli (no behaviour change). Implement `writeThrough`, `putTrd`, `planPush`,
`draftPath` per the decisions (pseudocode):
```
putTrd: main=resolveMainRoot(root); assert file/objective; chk=checkTrd({file,text})
  if store && chk.status==='over' -> refuse(budget)
  if store -> st=readTrdState(main,id); if st.ok: assertEditable(st) else warn(freeze unknown)
  return writeThrough(main,{rel,text,verb:'plan put-trd', enqueue: noPush?null:(m)=>pushHierarchy(m,objective), noFlush})
```
Commit `feat(48-11): writeThrough, plan put-trd, plan push, drafts`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs</verify>
  <done>Tests 1-2, 5-8, 15-17 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: objective put/set-status, summary post/checkpoint, verification post, doc put (tests 3-4, 9-13)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-verbs.cjs, plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs</files>
  <action>
RED: tests 3-4, 9-13. Commit `test(48-11): objective, summary, verification and doc verbs`.
GREEN: implement the remaining verbs on `writeThrough`. Header comment: the D-01 invariant, the verb → op table, and why 47's direct writes in
`gh.syncObjective` stay direct (D-16). Commit `feat(48-11): objective, summary, verification and doc verbs`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs</verify>
  <done>Tests 3-4, 9-13 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Ledger settles after a drained flush (test 14)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-store-cli.cjs, plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs, plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs</files>
  <action>
RED: test 14 (store mode, `noFlush` put, then `cmdGhOutbox(cwd, ['outbox','flush'], true)` captured). Commit `test(48-11): flush settles the ledger`.
GREEN: in `flushResult`, when the flush result reports a drained journal, call `settleLedger(cwd)` (uses `planning-ledger.settleCandidates`
+ `gh-cache.recordCacheBaseline` + `forget`); report `settled:[rels]` in the payload. Never fail the flush because of settle errors (warning).
Commit `feat(48-11): outbox flush settles verb writes`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs</verify>
  <done>Test 14 passes; 47 store e2e green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-store-cli.cjs` L306 `queuedResult(cwd, args, queued, headline)`, L195 `flushResult`, L31 `EXIT`.
- `gh-hierarchy.cjs` L483 `pushHierarchy(root, objectiveArg, opts)` (returns `{ok, skipped?, enqueued, coalesced}`), L92 `resolveObjectiveDir`, L83 `TRD_FILE_RE`.
- `gh-comments.cjs` L146 `enqueueSummary(root, {trdId, file, text, now})`, L156 `enqueueVerification`, L211 `readTrdState`.
- `gh.cjs` L1425 `syncObjective(objectiveArg, projectRoot, opts)`.
</codebase_examples>
<anti_patterns>
- Recording the baseline at enqueue time: `gh pull --all` before the flush would overwrite the new local file with the old remote one (48-RESEARCH pitfall 1).
- Posting a SUMMARY comment per task: 80 writes/min budget; checkpoints stay local (D-12).
- Swallowing errors (`2>/dev/null` era, objective 46 defect 3): every failure returns `ok:false` with a message and exit 1/2/3.
</anti_patterns>
<error_recovery>
- If `gh.syncObjective` writes directly in a way the fake does not support, add the missing fake route in a follow-up note in the SUMMARY and stub `syncObjective` via an injectable `opts.syncObjective` in the test.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs plugins/devflow/devflow/bin/lib/gh-store-cli.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs'</regression>
</validation_gates>

<verification>
- `rg -n "spawnSync|execSync|process\.exit|console\.log" plugins/devflow/devflow/bin/lib/planning-verbs.cjs` → no matches.
</verification>

<success_criteria>
One call writes a planning artifact correctly in either mode: today's file locally, cache + outbox + baseline in store mode, with the TRD budget enforced where GitHub needs it.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-11-SUMMARY.md`
</output>
