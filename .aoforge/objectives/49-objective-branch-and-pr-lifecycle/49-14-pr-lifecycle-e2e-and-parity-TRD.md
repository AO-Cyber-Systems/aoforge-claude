---
objective: 49-objective-branch-and-pr-lifecycle
trd: "14"
type: standard
wave: 5
depends_on: ["49-06", "49-07", "49-08", "49-09", "49-11", "49-12"]
files_modified:
  - plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs
autonomous: true
requirements: [GPR-01, GPR-02, GPR-03, GPR-04, GPR-05, GPR-06]
must_haves:
  truths:
    - "SC1: a fixture objective with three TRDs produces exactly one PR, and its `Closes #N` set equals the objective issue plus the three TRD issues"
    - "SC2: two parallel wave worktrees created from the objective branch, each committing via `df-tools commit`, merge back into the objective branch; afterwards GitHub has exactly one PR and the remote has only `main` and the objective branch; every non-merge commit on the objective branch carries `Refs #<issue>`"
    - "SC3: a scope comment from a non-assignee is excluded from `gh trd spec` and listed as pending until an assignee runs `gh trd confirm-scope`, after which it applies"
    - "Verify pass → PR ready, `devflow/verification` success on the head, wiki-diff comment; the objective issue is still open before merge"
    - "Merge → reconcile → every issue closed, remote and local objective branch gone, `gh pull --all` ran; reconcile twice is a no-op"
    - "Store-off parity: the same sequence with `github.store:false` makes zero gh calls, commit messages carry no `Refs`, init reports `pr_lifecycle:false`, and `gh pr *` verbs report skipped"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs
      provides: "end-to-end lifecycle on the fake GitHub + temp git remote; SC1-SC3; store-off parity"
  key_links:
    - "Exercises 49-01..49-12 together in the order 49-13's prose runs them"
---

# TRD 49-14: End-to-end lifecycle on the fake GitHub, and store-off parity (SC1-SC3)

<objective>
Prove the objective's success criteria with one test file that runs the whole lifecycle — start, parallel worktrees, TRD completion,
scope gating, verify, merge, reconcile — against the fake GitHub and a temp git remote, and prove local mode is untouched.

Purpose: SC1, SC2, SC3 and the D-01 invariant for objective 49. Output: one e2e test file (tests only; any defect it finds is fixed
test-first in the owning module and recorded in the SUMMARY).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Write each scenario as a failing-or-passing test first and commit it (`test(49-14): ...`). If a scenario fails because of a defect,
  fix it in the owning module with its own RED test in that module's test file, commit `fix(49-14): ...`, and list it in the SUMMARY.
  Add any such file to this TRD's SUMMARY `files_modified`.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- In-process library calls with `client._setRunGh(fake.runGh)` (subprocess CLIs cannot see the stub), `makeGitRemote()`, `hermeticEnv()`,
  `makeStoreProject({store:true})`, fake clock. Worktrees via `exec-context` worktree functions or `git worktree add -b df/exec-<id>`
  from the objective branch, mirroring the prose. Never real GitHub/`~/.claude`; never port 8080.
- Follow 48-22 (`gh-store-e2e.test.cjs`) for structure and parity style.

## Test list

1. **SC1** — mapping objective 49 (#100) + TRDs 49-01..03 (#101-#103); `startObjectivePr` → fake has exactly one PR; parse its body
   `Closes #N` lines → `[100,101,102,103]`; `prs['49']` set; TRDs frozen.
2. **SC2** — `gh trd start` for 49-01 and 49-02; two worktrees from the objective branch; one `cmdCommit("feat(49-01): a")` and one
   `cmdCommit("feat(49-02): b")`; merge both back `--no-ff` into the objective branch; delete `df/exec-*`; `syncObjectivePr` → fake still
   has one PR (no PR for any `df/exec-*`); `git ls-remote origin` heads = `{main, df/objective-49-…}`; `git log main..HEAD --no-merges
   --format=%B` every entry has `Refs #101`, `Refs #102` or `Refs #100` (start commit).
3. **TRD completion** — `summaryPost` for 49-01/49-02 → `devflow:in-progress` label removed; PR summary section `TRDs complete 2/3`.
4. **SC3** — objective issue assignees `['alice']`; `seedComment(#103, scope n=1 by 'mallory')` → `readEffectiveSpec('49-03')` excludes
   it and lists it pending; `confirm-scope 49-03 1` as `mallory` → exit 1; as `alice` → queued and flushed; spec now includes it.
5. **Verify pass** — wiki page edited in the clone after `wiki_base_sha`; `syncObjectivePr`; `verificationPost` (`status: passed`) →
   PR ready, status success on the PR head, wiki-diff comment mentions the page; `objectiveSetStatus complete` queues no close; issue #100
   still open.
6. **Merge + reconcile** — `mergeObjectivePr` (no queue) → merged; reconcile: #100-#103 closed, remote objective branch deleted, local on
   `main` with the merge, local objective branch deleted, `pullAll` stub called; second reconcile → zero writes.
7. **Queue variant** — `mergeQueue:true`: merge → queued, exit 3; reconcile → exit 3; `humanMergePr` with `closeKeywordCap:2` →
   reconcile closes the stragglers.
8. **Store-off parity** — same project with `store:false, enabled:true`: start/sync/status/merge/reconcile/confirm-scope/trd start →
   skipped, `fake.calls()` empty; `cmdCommit("feat(49-01): a")` message has no `Refs`; init execute-objective `pr_lifecycle:false`;
   `objectiveSetStatus complete` behaves as objective 48 (local write only).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: SC1, SC2 and TRD completion (tests 1-3)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs</files>
  <action>
Write tests 1-3 with a shared `before` that builds the fake, temp remote, store project and mapping. Run; fix any defect test-first in its
owning module (see binding rules). Commit `test(49-14): one PR per objective; worktrees merge into the objective branch`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs</verify>
  <done>Tests 1-3 pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: SC3, verify, merge, queue, parity (tests 4-8)</name>
  <files>plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs</files>
  <action>
Write tests 4-8. Run; fix defects test-first in owning modules. Commit `test(49-14): scope gate, verify, merge, reconcile, store-off parity`.
Then run every gh-*, planning-verbs and repo audit suite.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs && node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs' 'plugins/devflow/devflow/bin/lib/planning-*.test.cjs'</verify>
  <done>Tests 4-8 pass; gh-* and planning-* suites green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `gh-store-e2e.test.cjs` (48-22): plan → execute → verify on the fake, store-off parity assertions.
- `__fixtures__/gh-store-fixtures.cjs` `makeStoreProject` L304, `hermeticEnv` L399; `__fixtures__/git-remote.cjs` (49-04).
- `exec-context.cjs` `cmdExecContextWorktree` L378 (base + merge_back semantics).
</codebase_examples>
<anti_patterns>
- Spawning `node df-tools.cjs` subprocesses for store-mode steps (the gh stub does not cross processes).
- Asserting on fake internals where a public read exists (use `GET pulls`, `GET issues/{n}` through the fake's routes).
</anti_patterns>
<error_recovery>
- If worktree creation through exec-context needs a TTY or hook context, use `git worktree add` directly in the test; SC2 is about the
  branch/merge topology and PR count, not exec-context internals.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/gh-pr-e2e.test.cjs</test>
<regression>node --test 'plugins/devflow/devflow/bin/lib/gh-*.test.cjs' 'plugins/devflow/devflow/bin/lib/planning-*.test.cjs'</regression>
</validation_gates>

<verification>
- SC1, SC2, SC3 each map to a named test (1, 2, 4).
</verification>

<success_criteria>
The objective's three success criteria and the store-off invariant are proven by one end-to-end test file.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-14-SUMMARY.md`
</output>
