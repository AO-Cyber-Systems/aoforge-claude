---
objective: 55-store-live-smoke-fixes
trd: "02"
type: standard
wave: 1
depends_on: []
files_modified:
  - .github/workflows/devflow-checks.yml
  - plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
  - plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs
  - plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs
autonomous: true
requirements: ["55-4", "55-3"]
must_haves:
  truths:
    - "Every `sparse-checkout:` in .github/workflows/devflow-checks.yml (linked-issue, planning-consistency, reconcile) lists both plugins/devflow/devflow/bin and plugins/devflow/devflow/references"
    - "A temp directory holding only the paths the workflow's sparse checkout lists runs `node .../gh-check-cli.cjs <check>` for all three checks on a closed, unmerged pull_request event with exit 0 and no ENOENT / Cannot find module on stderr (it failed with ENOENT model-profiles.json before the fix)"
    - "Every module in gh-check-cli.cjs's relative-require closure, including lazily required ones, loads from that sparse copy"
    - "A wiki-push op halted as blocked because the wiki had no first page is retried by the next `gh outbox flush` with no `resolve`: once the wiki exists the flush exits 0 and the op is done"
    - "While the wiki still has no first page, `gh outbox flush` halts again with reason `blocked` (exit 2), after exactly one attempt; blocked ops of any other kind still need `gh outbox resolve`"
  artifacts:
    - path: .github/workflows/devflow-checks.yml
      provides: "sparse-checkout including references/ in all three jobs"
    - path: plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs
      provides: "sparse-copy guard test running gh-check-cli"
    - path: plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs
      provides: "flush re-queues a halted blocked wiki-push once at start"
  key_links:
    - "devflow-checks.yml sparse-checkout -> .devflow/plugins/devflow/devflow/{bin,references} -> gh-check-cli -> gh-client -> helpers.cjs reads ../../references/model-profiles.json"
    - "gh outbox flush -> flush() start -> halted blocked wiki-push -> markPending + clearHalted -> handleWikiPush re-probes"
---

# TRD 55-02: Required checks load from their sparse checkout; a blocked wiki push retries on flush (items 55-4, 55-3)

<objective>
Two store-mode runtime defects from the live smoke, both regression-first.

**55-4.** Every required-check job crashed. `.github/workflows/devflow-checks.yml` checks out only
`plugins/devflow/devflow/bin` (lines 110, 170, 230). The chain `gh-check-cli.cjs` -> `gh-client.cjs:26` -> `helpers.cjs:10` reads
`path.join(__dirname, '../../references/model-profiles.json')` at module load, so the job dies with
`ENOENT .devflow/plugins/devflow/devflow/references/model-profiles.json`. The fix is to add `plugins/devflow/devflow/references`
to every sparse checkout. Removing the helpers dependency was rejected: helpers.cjs is shared by ~every module, and only the
checkout list is wrong. Add a guard test that rebuilds the sparse checkout from the workflow's own lists and runs the runner from
it, so a missing directory fails CI and not a customer's PR. The caller half of 55-4 (pinning `devflow-ref`) is TRD 55-01.

**55-3.** A `wiki-push` op that blocked on "The wiki has no first page yet: create the first wiki page in the GitHub web UI, then run
`df-tools gh outbox flush`" stayed blocked after the page existed. `flush()` returns `halted` as soon as `nextOp` reports
`halted`/`blocked` (gh-outbox-flush.cjs:1587) and never retries. Only `resolve <seq> --overwrite` moved it. Fix flush so the
message is true: at the start of each flush, a halted blocked `wiki-push` goes back to pending once and runs again. If the wiki is
ready it publishes. If not, it blocks and halts exactly as today. The conflict message ("resolve it in .planning/wiki, then
flush again", gh-outbox-flush.cjs:1082) also says flush again, so the rule covers every blocked wiki-push. Other op kinds keep
their human `resolve` step.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(55-02): ...` (failing) before `fix(55-02): ...`, per task.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Hand-built event JSON and fixtures. No property-based testing. No network, no real GitHub. The guard test spawns `node` only.
- Do not edit `__fixtures__/gh-fake.cjs` (TRD 55-01 owns it this wave). The wiki is modelled by the local bare-repo fixtures
  (`__fixtures__/wiki-remote.cjs`, `useStore({wiki: 'missing'})` in gh-store-e2e.test.cjs), not the fake.
- No YAML parser dependency: the existing repo test reads the workflow as lines (devflow-workflows.repo.test.cjs header). Keep it so.

## Test list

Outermost first.

55-4, devflow-workflows.repo.test.cjs (new describe `55-02 the check runner loads from the workflow's sparse checkout`):
1. Each of the three `sparse-checkout:` values, single-line or `|` block, parses to a set that contains
   `plugins/devflow/devflow/bin` and `plugins/devflow/devflow/references`. All three sets are equal. RED today.
2. Copy only the paths in the linked-issue job's set from the repo into a temp dir laid out like `.devflow/`. For each of
   `linked-issue`, `planning-consistency` and `reconcile`, spawn `node <tmp>/plugins/devflow/devflow/bin/lib/gh-check-cli.cjs <check>`
   with `GITHUB_EVENT_PATH` pointing at a hand-built event
   (`{action: 'closed', pull_request: {number: 1, merged: false, head: {sha: 'a'.repeat(40)}, base: {ref: 'main'}}, repository:
   {full_name: 'o/r', default_branch: 'main'}}`), `GITHUB_EVENT_NAME=pull_request`, `GITHUB_REPOSITORY=o/r`, and a temp
   `HOME`/`DEVFLOW_GH_CACHE_DIR`. Expect exit 0 (skipped), and no `ENOENT` or `Cannot find module` in stderr. RED today: exit 1,
   ENOENT model-profiles.json.
3. In the same copy, collect the static closure of relative requires from gh-check-cli.cjs (regex
   `require\(\s*'(\.\/[^']+)'\s*\)` over each file, following new `./x.cjs` files; this catches the lazy
   `require('./gh-hierarchy.cjs')` at gh-check-cli.cjs:304). Load each module in one child `node -e` from the sparse copy. Expect
   exit 0.

55-3, gh-store-e2e.test.cjs (CLI level, inside `describe('an uninitialised wiki ...')`, after test 12):
4. `12b`: sync halts on the wiki-push (as in test 12). The fixture then gives the wiki its first page: a bare repo at the configured
   missing URL with one commit. `gh outbox flush` then exits 0, the halted wiki-push op is `done`, `gh outbox status` shows no
   halt, and no `resolve` command was run.
5. Test 12's existing second flush with the wiki still missing keeps exiting 2 with halt reason `blocked`. Unchanged; it now
   proves the retry re-blocks.

55-3, gh-outbox-flush.test.cjs (unit, flush with injected capabilities/wikiRemote as the 16x tests do):
6. A journal halted on a blocked wiki-push, wiki still uninitialised: `flush()` returns `halted` after exactly one wiki-push
   attempt (count the wiki remote probes or handler invocations through the existing seams). No loop.
7. A journal halted on a blocked op of another kind (an `upsert-issue` blocked by `validation`): `flush()` returns `halted`
   without executing that op. `resolve` is still the only way out.

<embedded_context>

<codebase_examples>
The workflow step to change (identical in all three jobs, lines 104-112, 164-172, 224-232):

```yaml
      - name: Check out the DevFlow check runner
        uses: actions/checkout@v7
        with:
          repository: ${{ inputs.devflow-repo }}
          ref: ${{ inputs.devflow-ref }}
          path: .devflow
          sparse-checkout: |
            plugins/devflow/devflow/bin
            plugins/devflow/devflow/references
          token: ${{ steps.app-src.outputs.token || github.token }}
          persist-credentials: false
```

Add one header-comment line explaining why references/ is in the list (helpers.cjs reads model-profiles.json at load).
`actions/checkout` uses cone mode by default, so directory entries are what it expects.

The repo test reads the workflow as lines. Reuse its helpers (`blockUnder`/step helpers near lines 35-75) to find each
`sparse-checkout:` value. A `|` block's items are the following lines indented deeper than the key.

Flush entry (gh-outbox-flush.cjs:1569-1587). Insert the retry after the lock is acquired and before the loop:

```js
  const lock = outbox.acquireLock(root, { now: clock() });
  if (!lock.ok) return { ...result, status: 'running', owner: lock.owner };
  ...
  try {
    retryBlockedWiki(root, clock);   // new: a halted, blocked wiki-push becomes pending once per flush
    let ctx = null;
```

```js
/**
 * A wiki-push blocked on the wiki itself (no first page, unreachable, a rebase conflict) is a human step whose
 * message says "then flush again". Re-queue it once at the start of every flush. If the wiki is still not ready the
 * op blocks and halts again, exactly as before. Other blocked kinds still need `resolve`.
 */
function retryBlockedWiki(root, clock) {
  const { journal } = outbox.readJournal(root, { now: clock() });
  const h = journal && journal.halted;
  if (!h || h.reason !== 'blocked') return;
  const op = (journal.ops || []).find((o) => o.seq === h.seq);
  if (!op || op.kind !== 'wiki-push' || op.status !== 'blocked') return;
  outbox.markPending(root, op.seq, { error: null });
  outbox.clearHalted(root);
}
```

Check the real `readJournal`/`markPending`/`clearHalted` signatures in gh-outbox.cjs before using them. `resolveHalt`
(gh-outbox-flush.cjs:1710-1740) already uses `markPending(root, seq, {error: null})` and `clearHalted(root)`.
</codebase_examples>

<anti_patterns>
- Do not retry inside the loop: one attempt per flush. The `gh-flush.js` hook runs flush at every Stop, and a loop would spin on
  `git ls-remote`.
- Do not cache an "uninitialised" wiki answer. gh-capability.cjs:202 `isBlockedWiki` deliberately never remembers it. Leave that
  as it is.
- Do not hard-code the runner's module list in test 3. Derive it from the requires, or the guard rots when a module is added.
- Do not make the guard test depend on `gh` or the network: closed, unmerged events exit before any gh call
  (gh-check-cli.cjs:228, :367).
</anti_patterns>

<error_recovery>
- If test 2 still fails after the workflow fix with a different missing path, gh-check-cli reads another directory at load. Add
  that directory to all three lists (and to test 1's expected set), and record it in the SUMMARY.
- If `markPending` refuses a `blocked` op, follow how `resolveHalt` does it (gh-outbox-flush.cjs:1728-1731) instead of adding a new
  outbox API.
- If gh-store-e2e test 12 starts exiting 0 on the second flush, the retry runs on a wiki that is still missing: the fixture's
  missing URL must stay missing until test 12b creates it.
</error_recovery>

</embedded_context>

<context>
- Live CI log (smoke, 2026-10-05): `ENOENT .devflow/plugins/devflow/devflow/references/model-profiles.json` from helpers.cjs:10 via
  gh-client.cjs:26.
- A repository pinned to `v2.13.1` keeps the broken reusable workflow until it re-pins: the fix reaches it through a release plus
  `gh setup --apply` (TRD 55-01 test 13, documented in 55-08), or through `github.checks_workflow@<ref>` (TRD 55-06 uses that).
- Capability message (gh-capability.cjs:498) stays as is: after this fix "then run `df-tools gh outbox flush`" is accurate.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Sparse-checkout guard test, then add references/ to all three jobs</name>
  <files>plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs, .github/workflows/devflow-checks.yml</files>
  <action>
RED: tests 1-3. Build the temp copy with `fs.cpSync(path.join(REPO_ROOT, p), path.join(tmp, p), {recursive: true})` for each
parsed path. Clean it up in `after`/`t.after`. Run test 2 and confirm the ENOENT before committing
`test(55-02): check runner must load from the workflow's sparse checkout`.

GREEN: switch all three `sparse-checkout:` values to the `|` block with both directories, and add the header comment line. Commit
`fix(55-02): check out references/ for the DevFlow check runner`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs</verify>
  <done>Tests 1-3 pass; before the fix test 2 failed with ENOENT model-profiles.json (quote it in the SUMMARY); every pre-existing workflow repo test passes.</done>
  <recovery>If a pre-existing test pins the single-line `sparse-checkout: plugins/devflow/devflow/bin`, update it to the block form; that line was the bug.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Flush retries a halted blocked wiki-push once</name>
  <files>plugins/devflow/devflow/bin/lib/gh-outbox-flush.cjs, plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs, plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs</files>
  <action>
RED: test 4 (e2e 12b) and tests 6-7 (unit). Test 4 must fail today: flush exits 2 because the halt persists. Commit
`test(55-02): a blocked wiki push retries once the wiki exists`.

GREEN: add `retryBlockedWiki` and call it at the start of `flush()`, inside the lock (code example). Update the `flush` JSDoc:
a halted blocked wiki-push is retried once per flush. Commit `fix(55-02): outbox flush retries a wiki push blocked on the wiki`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox.test.cjs</verify>
  <done>Tests 4, 6 and 7 pass; e2e test 12 still exits 2 on the second flush while the wiki is missing; no other outbox test changes.</done>
  <recovery>If creating the wiki's first page in the fixture is awkward, use `createWikiRemote()` from `__fixtures__/wiki-remote.cjs` and point `DEVFLOW_WIKI_REMOTE` (or the config's wiki.remote) at it between the two flushes, the way 16e builds a reachable remote.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs plugins/devflow/devflow/bin/lib/gh-outbox-flush.test.cjs plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs</test_scoped>
</validation_gates>

<verification>
- `rg -n -A2 "sparse-checkout:" .github/workflows/devflow-checks.yml` shows references/ under all three.
- The scoped tests pass; `npm test` has no new failures (MA-7 only).
</verification>

<success_criteria>
- The runner provably loads from exactly what the workflow checks out. A future missing directory fails this repository's CI.
- The wiki first-page path works as its own message says: create the page, run flush.
</success_criteria>

<output>
After completion, publish `55-02-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as execute-trd
describes. Quote the RED ENOENT line.
</output>
