---
objective: 59-state-and-merge-plumbing
trd: "03"
type: standard
wave: 2
depends_on: ["59-01"]
files_modified:
  - plugins/devflow/devflow/bin/lib/exec-context.cjs
  - plugins/devflow/devflow/bin/lib/exec-context.test.cjs
  - plugins/devflow/devflow/bin/lib/trd-identify.test.cjs
  - plugins/devflow/devflow/bin/lib/executor-isolation.test.cjs
  - plugins/devflow/agents/executor.md
  - plugins/devflow/devflow/workflows/execute-objective.md
autonomous: true
requirements: [PLMB-03]
must_haves:
  truths:
    - "execute-objective.md's executor spawn prompt names a `CHECKOUT` (the provisioned worktree for a parallel wave, REPO_ROOT for a sequential one) and its preflight line is `node ~/.claude/devflow/bin/df-tools.cjs --cwd {CHECKOUT} exec-context check --repo {REPO_ROOT} --base {WAVE_BASE} --id {plan_id}`"
    - "executor.md's first step runs the same `--cwd <CHECKOUT>` preflight and tells the executor that every Bash call starts in the session's directory, so every later df-tools call takes `--cwd <checkout>` and every git call `git -C <checkout>`"
    - "`exec-context check --id X` run anywhere other than the worktree provisioned for X (branch `df/exec-<slug(X)>`) fails `WRONG CHECKOUT`, names the worktree and the `--cwd` re-run command, and takes no claim — so a forgotten `--cwd` can no longer claim the main checkout or report a false SHARED INDEX"
    - "`exec-context worktree` prints a `preflight` field holding the exact `--cwd` check command for that worktree"
    - "trd-identify still identifies the plan from a preflight line that carries `--cwd` before `exec-context check`"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/exec-context.cjs
      provides: "WRONG CHECKOUT guard in check; `preflight` field in worktree output"
    - path: plugins/devflow/agents/executor.md
      provides: "repo_base_preflight with --cwd <CHECKOUT> and the WRONG CHECKOUT row"
    - path: plugins/devflow/devflow/workflows/execute-objective.md
      provides: "CHECKOUT in step 0 and in the spawn prompt's <repo_and_base>"
  key_links:
    - "execute-objective step 0 `exec-context worktree` -> worktree_path / preflight -> spawn prompt CHECKOUT -> executor preflight `--cwd {CHECKOUT}`"
    - "df-tools global `--cwd <dir>` (issue 37-02) chdirs before dispatch -> cmdExecContextCheck(cwd = the worktree)"
    - "trd-identify EXEC_ID_RE (`exec-context[ \\t]+check\\b ... --id`) -> gate-executor-stop and token-usage identify the TRD"
---

# TRD 59-03: The executor's first preflight runs against its own worktree (PLMB-03)

<objective>
Every Bash call an executor makes starts in the session's directory, which for a parallel wave is the MAIN checkout, not
the worktree the orchestrator provisioned. The spawn prompt's preflight has no `--cwd`, so the first
`exec-context check` inspects the main checkout: it claims (main checkout, base) under the plan id, and when a sibling got
there first it reports a false `SHARED INDEX`. Thirteen SUMMARYs across objectives 42-57 record the same detour (re-run
with `--cwd <worktree>`, then release the stray claim): 42-01, 42-04, 43-01, 43-03, 46-01, 46-02, 46-03, 48-20, 49-10,
50-01, 50-02, 50-05, 53-01.

Two halves:

1. **Prompts** — the dispatch names a `CHECKOUT` and the preflight passes `--cwd {CHECKOUT}` (execute-objective spawn
   prompt and step 0; executor.md `repo_base_preflight`). For a sequential wave CHECKOUT is REPO_ROOT.
2. **Code** — `exec-context check --id X` refuses with `WRONG CHECKOUT` when a worktree on branch `df/exec-<slug(X)>`
   exists and the check is not running in it. No claim is taken, and the message prints the exact `--cwd` command. A
   prompt that forgets `--cwd` (an older orchestrator, a hand dispatch) then costs one re-run instead of a stray claim.
   `exec-context worktree` also prints that command as `preflight`, so the orchestrator can paste it.

Purpose: success criterion 3. Output: the guard and the `preflight` field with tests, the prompt edits with prose tests.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD for the code half (RED then GREEN commits). The prose half is pinned by `executor-isolation.test.cjs`:
  change the assertions first (RED against today's prose), then the prose.
- Fixtures: extend the hermetic repo helpers already in `exec-context.test.cjs` (`makeRepo`, `git`, `run`) with one
  hand-built helper, `provisionWorktree(repo, id, base)`, that runs the real `exec-context worktree` command. No new
  fixture module: these tests already own their git scaffolding.
- Every command you document must stay ONE plain command per Bash call: no `&&`, `;`, pipes, `$(...)` or `cd`. The
  harness worktree guard refuses compound commands it cannot verify.
- Do not touch `quick.md`: its executor runs in REPO_ROOT and its preflight is pinned separately.
- One plain command per Bash call yourself, and in a worktree dispatch address your CHECKOUT explicitly.

## Test list

Code (`exec-context.test.cjs`, real binary, hermetic repos):

1. `exec-context worktree --repo R --id 59-03 --base B` → JSON carries
   `preflight: "node ~/.claude/devflow/bin/df-tools.cjs --cwd <worktree_path> exec-context check --repo <repo_root> --base <base_sha> --id 59-03"`.
2. With that worktree provisioned, `exec-context check --repo R --base B --id 59-03` run from the MAIN checkout → exit 1;
   stderr starts `WRONG CHECKOUT`, contains the worktree path and `--cwd <worktree_path> exec-context check`; the claims
   directory (`<common git dir>/devflow-exec-claims/`) holds no file for the main checkout's key.
3. The same check through the global flag (`df-tools --cwd <worktree> exec-context check ...`) → exit 0, `checkout` =
   the worktree's realpath, `is_worktree: true`, a claim recorded for the worktree.
4. Sequential control: no `df/exec-<id>` branch exists → the check from the main checkout passes exactly as before.
5. Slug parity: a worktree provisioned with `--id "59-03"` and checked with `--id 59-03`, and an id with uppercase
   letters (`--id A-1` → branch `df/exec-a-1`), both match through the same `slugify`.
6. A sibling's worktree (id 59-04) does not trip a 59-03 check in the main checkout; the existing SHARED INDEX tests
   pass unchanged.
7. A pruned worktree (directory deleted, `git worktree list` still lists it as prunable) does not count as the owner.

Identification (`trd-identify.test.cjs`):

8. A prompt whose preflight is
   `node ~/.claude/devflow/bin/df-tools.cjs --cwd /x/wt exec-context check --repo /x/r --base abc --id 59-03`
   identifies `59-03`.

Prose (`executor-isolation.test.cjs`):

9. executor.md's preflight command matches
   `df-tools.cjs --cwd <CHECKOUT> exec-context check --repo <REPO_ROOT> --base <WAVE_BASE> --id <plan_id>` and its
   failure table names `WRONG CHECKOUT`.
10. execute-objective.md has a `CHECKOUT:` line in `<repo_and_base>` and the preflight
    `df-tools.cjs --cwd {CHECKOUT} exec-context check --repo {REPO_ROOT} --base {WAVE_BASE} --id {plan_id}`; step 0
    says CHECKOUT is the `worktree_path` for a parallel wave and REPO_ROOT for a sequential one.
11. Existing assertions keep their intent with the flag allowed:
    `/df-tools\.cjs (?:--cwd \S+ )?exec-context check --repo/`.
12. Neither preflight line contains `&&`, `;`, `|` or `cd `.

<embedded_context>

<codebase_examples>
The check today (`lib/exec-context.cjs`), where the guard goes — after the repository identity test, before any claim:

```js
  const actual = repoIdentity(cwd);
  ...
  if (actual.commonDir !== expected.commonDir) {
    error(`WRONG REPOSITORY — this spawn is rooted in the wrong repo.\n` + ...);
  }
  // <- WRONG CHECKOUT guard here (needs actual, expected, idArg, baseArg)
  const head = git(cwd, ['rev-parse', 'HEAD']);
  ...
  const claim = (idArg && baseSha) ? takeClaim(actual, idArg, baseSha, expected.mainRoot, baseArg) : null;
```

Note `idArg` is parsed with `flag(args, '--id')` further down today; move that parse (and its "given without a value"
error) above the guard.

Worktree provisioning names the branch from a slug: `const id = slugify(idArg); ... const branch = \`df/exec-${id}\`;`
with `slugify(s) = String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')`. Its result object:
`{ ok, repo_root, worktree_path: realpath(worktreePath), branch, base_ref, base_sha, merge_into, merge_back, remove }`.

The executor prompt block to change (`execute-objective.md`, step 4):

```
       <repo_and_base>
       REPO_ROOT:  {REPO_ROOT}
       WAVE_BASE:  {WAVE_BASE}
       PLAN_ID:    {plan_id}

       Before anything else, prove you are where you are supposed to be:

         node ~/.claude/devflow/bin/df-tools.cjs exec-context check --repo {REPO_ROOT} --base {WAVE_BASE} --id {plan_id}
```

and step 0: "Run one per plan. Each prints `worktree_path`, `branch`, `merge_back` and `remove`; note them down. Pass
`worktree_path` as that executor's working directory, ..." (the Task tool has no working-directory parameter, which is
why this never took effect).

executor.md `repo_base_preflight` today runs
`node ~/.claude/devflow/bin/df-tools.cjs exec-context check --repo <REPO_ROOT> --base <WAVE_BASE> --id <plan_id>` and
has a three-row failure table (WRONG REPOSITORY, BASE NOT VISIBLE, SHARED INDEX), "All three are hard stops".

trd-identify (`lib/trd-identify.cjs`):
`EXEC_ID_RE = /exec-context[ \t]+check\b[^\n]*?[ \t]--id(?:=|[ \t]+)(ID)ID_END/g` — anchored at `exec-context`, so a
`--cwd` before it should already match; test 8 proves it.
</codebase_examples>

<anti_patterns>
- Do not make the preflight self-certify: keep `--repo {REPO_ROOT}` as the dispatch's claim and `--cwd {CHECKOUT}` as the
  tree being checked. Never `--repo $(git rev-parse --show-toplevel)` (issue #100 finding 3; a test pins it).
- Do not describe WRONG CHECKOUT as a hard stop: nothing was written and no claim was taken, so the remedy is to run the
  printed command. The other three failures stay hard stops.
- Do not release or touch other ids' claims anywhere in the new code.
</anti_patterns>

<error_recovery>
- If test 2 still finds a claim file, the guard runs after `takeClaim`; move it above the HEAD resolution.
- If the porcelain parse misses the worktree, print `git worktree list --porcelain` in the test: entries are blank-line
  separated blocks of `worktree <path>`, `HEAD <sha>`, `branch refs/heads/<name>`, optionally `prunable ...`.
- If executor-isolation tests that you did not mean to change fail, a regex you widened now matches less; keep each
  original assertion's intent and only allow the optional `--cwd <...> ` segment.
</error_recovery>

</embedded_context>

<gotchas>
- Compare worktree paths by realpath (macOS `/var` vs `/private/var`); `repoIdentity` already realpaths `checkout`.
- `git worktree list --porcelain` from the actual checkout lists the main checkout and every linked worktree of the
  repository; match `branch refs/heads/df/exec-<slug>` exactly, and require `fs.existsSync(path)`.
- The message must print a runnable command: include `--base <baseArg>` only when `--base` was given.
- In `preflight` use the `~/.claude/devflow/bin/df-tools.cjs` spelling (the path every prompt uses), the realpath'd
  `worktree_path`, `repo.mainRoot`, `baseSha` and the id as given (`idArg`, not the slug).
- Sequential waves: CHECKOUT = REPO_ROOT, so `--cwd {CHECKOUT}` is redundant there but keeps one preflight form.
</gotchas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: WRONG CHECKOUT guard and the `preflight` field (tests 1-8)</name>
  <files>plugins/devflow/devflow/bin/lib/exec-context.cjs, plugins/devflow/devflow/bin/lib/exec-context.test.cjs, plugins/devflow/devflow/bin/lib/trd-identify.test.cjs</files>
  <action>
Fixture first: `provisionWorktree(repo, id, base)` helper in exec-context.test.cjs (runs the real
`exec-context worktree`, returns the parsed JSON, registers the worktree for cleanup).

RED: tests 1-7 in exec-context.test.cjs and test 8 in trd-identify.test.cjs. Expect 1, 2, 5 and 7 to fail (no field, no
guard); 3, 4, 6 and 8 may already pass (they are controls). Commit `test(59-03): wrong-checkout preflight cases`.

GREEN in exec-context.cjs:

```
worktreeForId(identity, id):            # id already slugified
  out = git(identity.checkout, ['worktree', 'list', '--porcelain'])
  for block in out.stdout.split(/\n\n+/):
    path   = /^worktree (.+)$/m;  branch = /^branch refs\/heads\/(.+)$/m
    if branch === `df/exec-${id}` and fs.existsSync(path) -> return { path: realpath(path), branch }
  return null

cmdExecContextCheck: after the WRONG REPOSITORY check
  parse --id (moved up)
  if (idArg):
    owned = worktreeForId(actual, slugify(idArg))
    if (owned && owned.path !== actual.checkout)
      error(`WRONG CHECKOUT — a worktree was provisioned for ${idArg} and this check ran somewhere else.\n` +
            `  your worktree : ${owned.path} (branch ${owned.branch})\n` +
            `  checked here  : ${actual.checkout}\n` +
            `Every Bash call starts in the session's directory, not in your worktree, so the check must name it:\n` +
            `  node ~/.claude/devflow/bin/df-tools.cjs --cwd ${owned.path} exec-context check --repo ${expected.mainRoot}` +
            (baseArg ? ` --base ${baseArg}` : '') + ` --id ${idArg}\n` +
            `No claim was taken here.`)

cmdExecContextWorktree result: add
  preflight: `node ~/.claude/devflow/bin/df-tools.cjs --cwd ${realpath(worktreePath)} exec-context check --repo ${repo.mainRoot} --base ${baseSha} --id ${idArg}`
```

Update the module header comment (check: the WRONG CHECKOUT rule; worktree: the `preflight` field). Commit
`fix(59-03): exec-context check refuses a check outside the plan's worktree`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/exec-context.test.cjs plugins/devflow/devflow/bin/lib/trd-identify.test.cjs` passes.</verify>
  <done>Tests 1-8 pass; 1, 2, 5, 7 went RED then GREEN; the existing exec-context tests are unchanged and green.</done>
  <recovery>If an existing test provisions a worktree and then checks from the main checkout on purpose (SHARED INDEX scenario), give that scenario a different id from the provisioned one rather than weakening the guard; record it in the SUMMARY.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 2: CHECKOUT and `--cwd` in the dispatch and the executor's first step (tests 9-12)</name>
  <files>plugins/devflow/devflow/bin/lib/executor-isolation.test.cjs, plugins/devflow/agents/executor.md, plugins/devflow/devflow/workflows/execute-objective.md</files>
  <action>
RED: tests 9-12 in executor-isolation.test.cjs (widen the two existing `exec-context check --repo` regexes per test 11 in
the same commit). Commit `test(59-03): dispatch and executor preflight carry --cwd`.

GREEN, prose only (targeted Edits, no rewrites of surrounding text):

1. execute-objective.md step 0, parallel wave: the worktree command now prints `worktree_path`, `branch`, `merge_back`,
   `remove` and `preflight`; replace "Pass `worktree_path` as that executor's working directory" with: pass
   `worktree_path` as that executor's `CHECKOUT` (the Task tool cannot set a working directory, and every Bash call starts
   in the session's directory). Sequential wave: `CHECKOUT` is `REPO_ROOT`.
2. execute-objective.md spawn prompt `<repo_and_base>`: add `CHECKOUT:   {CHECKOUT}` under PLAN_ID; the preflight line
   becomes
   `node ~/.claude/devflow/bin/df-tools.cjs --cwd {CHECKOUT} exec-context check --repo {REPO_ROOT} --base {WAVE_BASE} --id {plan_id}`;
   add after it: "Your Bash calls start in the session's directory, not in CHECKOUT. Pass `--cwd {CHECKOUT}` to every
   df-tools call and `git -C {CHECKOUT}` to every git call, and use absolute paths under CHECKOUT for everything else."
   Add WRONG CHECKOUT to the "Exit 1 means ..." sentence as the one recoverable case (run the command it prints).
3. executor.md `repo_base_preflight`: the command becomes
   `node ~/.claude/devflow/bin/df-tools.cjs --cwd <CHECKOUT> exec-context check --repo <REPO_ROOT> --base <WAVE_BASE> --id <plan_id>`
   with the explanation above (session directory, the 13 recorded detours in one clause); if the dispatch names no
   CHECKOUT, use REPO_ROOT. After "Note `checkout` down": every later df-tools call takes `--cwd <checkout>`, every git
   call `git -C <checkout>`. Add a fourth table row, `WRONG CHECKOUT` — "A worktree was provisioned for your plan id and
   the check ran elsewhere (usually the main checkout). Nothing was claimed or written." → "Run the `--cwd` command it
   prints, then continue." Change "All three are hard stops" to say the first three are hard stops and WRONG CHECKOUT is
   corrected by the re-run.

Keep `<!-- merge-sequence:end -->` and the Branch merge protocol untouched (59-06 owns them).
Commit `docs(59-03): executor preflight names its checkout with --cwd`.
  </action>
  <verify>`node --test plugins/devflow/devflow/bin/lib/executor-isolation.test.cjs plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` passes.</verify>
  <done>Tests 9-12 went RED then GREEN; the merge-sequence replay and doc-refs tests are unaffected.</done>
  <recovery>If doc-refs or another repo prose test fails on the new text, it is matching a command spelling; keep the canonical `node ~/.claude/devflow/bin/df-tools.cjs` prefix and the flag order `--cwd <dir> exec-context check`.</recovery>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
<test_scoped>node --test plugins/devflow/devflow/bin/lib/exec-context.test.cjs plugins/devflow/devflow/bin/lib/trd-identify.test.cjs plugins/devflow/devflow/bin/lib/executor-isolation.test.cjs plugins/devflow/hooks/gate-commits-merge-sequence.test.js</test_scoped>
<!-- lint/build/typecheck: none in the stack profile. Known baseline npm test failures: MA-7 doctl handoff,
     roadmap-reconcile E2E1, stack-drafter-fleet github-enterprise-migration. -->
</validation_gates>

<verification>
- PLMB-03: test 3 shows the `--cwd` preflight reporting the worktree; tests 9-10 pin the prompts that issue it; test 2
  shows the omitted-flag case failing loudly without a stray claim.
- gate-executor-stop / token-usage identification still works with the new preflight form (test 8).
</verification>

<success_criteria>
- 12 named tests pass; full `npm test` at baseline (three known failures).
</success_criteria>

<output>
After completion, publish `59-03-SUMMARY.md` with `node plugins/devflow/devflow/bin/df-tools.cjs summary post`, as
execute-trd describes. Quote the final WRONG CHECKOUT message and the `preflight` field shape.
</output>
