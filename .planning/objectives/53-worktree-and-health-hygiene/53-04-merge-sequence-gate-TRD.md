---
objective: 53-worktree-and-health-hygiene
trd: "04"
type: standard
wave: 2
depends_on: ["53-01"]
files_modified:
  - plugins/devflow/hooks/gate-commits.js
  - plugins/devflow/hooks/gate-commits.test.js
  - plugins/devflow/hooks/gate-commits-merge-sequence.test.js
  - plugins/devflow/devflow/workflows/execute-objective.md
  - plugins/devflow/devflow/workflows/complete-milestone.md
  - plugins/devflow/devflow/workflows/workstreams-merge.md
autonomous: true
requirements: ["53-4"]
must_haves:
  truths:
    - "gate-commits' protection is unchanged: a raw `git commit` chained after `git merge`/`cherry-pick`/`revert`/`rebase` in one Bash call is still denied, because the gate decides before the merge runs"
    - "That denial now explains itself: the reason says the merge and the commit must be separate calls, and that `git commit --no-edit` on its own is allowed once MERGE_HEAD exists"
    - "execute-objective.md documents the wave merge as one command per call, including a conflict path for planning-only conflicts (STATE.md / ROADMAP.md / REQUIREMENTS.md): take ours, `git add`, then `git commit --no-edit` as its own call, and refresh the roadmap after the wave's merges; any other conflicted path still aborts as a planning error"
    - "Run in a scratch DevFlow repo, every command of the documented execute-objective merge sequence (clean merge, planning-file conflict, abort) passes through gate-commits without a deny, and the merge completes"
    - "complete-milestone.md and workstreams-merge.md no longer document a chained merge-and-commit or a bare squash-completion `git commit` the gate denies: each step is its own call, and a squash completion carries the inline `DEVFLOW_ALLOW_RAW_COMMIT=1` prefix"
  artifacts:
    - path: plugins/devflow/hooks/gate-commits.js
      provides: "chainsGitOpAndCommit(cmd) + the tailored deny reason (message only, no new allowance)"
    - path: plugins/devflow/hooks/gate-commits-merge-sequence.test.js
      provides: "documented merge sequence replayed through the hook in a scratch git repo; prose guard against chained merge+commit lines"
  key_links:
    - from: plugins/devflow/hooks/gate-commits-merge-sequence.test.js
      to: plugins/devflow/devflow/workflows/execute-objective.md
      via: "reads the 5b bash fences and replays each command through gate-commits.js"
      pattern: "execute-objective.md"
    - "gate-commits allTargetsMidOperation (MERGE_HEAD / rebase-* / CHERRY_PICK_HEAD) is what lets the separate completion commit through"
---

# TRD 53-04: The documented merge sequence passes gate-commits (item 53-4)

<objective>
Make the merge sequences DevFlow documents pass gate-commits, without weakening the gate.

**What actually fails (planner finding).** `git merge … && node …/df-tools.cjs commit …` is NOT denied: the hook allows any command that
invokes `df-tools.cjs commit`. Probing hooks/gate-commits.js shows the denied shapes are a merge chained with a RAW completion commit:
- `git merge --no-ff --no-commit X && git commit --no-edit`
- `git merge X; git checkout --theirs .planning/STATE.md && git add .planning/STATE.md && git commit --no-edit` (resolving a planning-file
  conflict in one call)

Both are denied because the hook runs before the command, when MERGE_HEAD does not exist yet. A wave merge in objective 52 hit this:
peers' STATE.md / ROADMAP.md changes conflict ("conflicts are resolved at merge time by the orchestrator", per execute-objective's
worktree_protocol). But 5b's prose says any conflict is a planning error and offers no resolution path, so the orchestrator improvised chained commands.

**Choice: one command per call, not a new allowance.** Allowing "a commit chained after a merge" would let `git merge <anything> && git commit -am …`
bypass the gate. A no-op merge (`git merge HEAD`) creates no MERGE_HEAD, so the commit would land unchecked. Predicting MERGE_HEAD from
command text cannot be made safe. Instead:
1. The gate keeps denying and says why, naming the separate-call form that IS allowed once MERGE_HEAD exists (allTargetsMidOperation).
2. execute-objective 5b documents the full sequence one command per call, including the planning-file conflict path. workstreams-merge.md
   already uses the same policy: take ours for STATE.md/ROADMAP.md because they are regenerated.
3. A test replays the documented sequence through the hook in a real scratch repo, so the prose and the gate cannot drift apart.

**Squash completions.** `git merge --squash` leaves no MERGE_HEAD (only SQUASH_MSG), so even a separate `git commit` is denied. That is the case in
complete-milestone.md and workstreams-merge.md. Detecting SQUASH_MSG would weaken the gate: git can leave it behind (for example after an aborted squash), and a stale file
would open a standing bypass. The documented squash completion uses the sanctioned, visible, per-command escape instead:
`DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m "…"`. `--no-ff --no-commit` completions need no escape when run as their own call.

Output: the explained deny, the rewritten merge prose in three workflows, and a merge-sequence replay test.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: `test(53-04): ...` (failing) before `fix(53-04): ...`.
- Use the repo df-tools. Commit with its `commit … --files`, one plain command per Bash call.
- The gate's allow and deny DECISIONS must not change. Only the deny reason text gains a hint. Every existing gate-commits.test.js case
  passes unchanged, except a case that pins the exact DENY_MESSAGE bytes for a chained merge+commit. Update that one and record it.
- TRD 53-01 (wave 1) already rewrote execute-objective's worktree_protocol, the 5b intro, the "Commit the wave's SUMMARYs" paragraph and 5c.
  Edit only the "Branch merge protocol" fences and the conflict handling, and keep 53-01's text.
- Keep every string `pr-lifecycle-prose.repo.test.cjs` pins (`git branch -d df/exec-{plan_id}`, the once-per-wave `gh pr sync`).
- Hand-built fixtures only.

## Test list

Outermost first.
1. **Replay (new hooks/gate-commits-merge-sequence.test.js, real git, skip without git):** build a scratch DevFlow repo (`.planning/ROADMAP.md`,
   `.planning/STATE.md`) with a branch `df/exec-07-01` that changes `src/a.js` and `.planning/STATE.md`, while `main` also changes
   `.planning/STATE.md`. Extract the bash commands from execute-objective.md's "Branch merge protocol" section (fenced blocks between
   the `**Branch merge protocol**` marker and the next `**…**` paragraph). Substitute `{plan_id}` with `07-01` and the documented conflict-path
   placeholders. For each command in order: feed `{tool_name:'Bash', tool_input:{command}}` to the hook (spawned with `cwd` = the scratch
   repo) and assert no deny, then run the command for real. At the end, HEAD is a merge commit with two parents and `git status --porcelain` is empty.
   Also cover the clean-merge path (no conflict) and the abort path (a conflict on `src/a.js` -> `git merge --abort` passes the hook).
2. **Prose guard (same file):** no line inside a bash fence of execute-objective.md, complete-milestone.md or workstreams-merge.md invokes
   `git merge`/`cherry-pick`/`revert` and a git commit on the same line or in the same fenced command. A bare `git commit` following
   `git merge --squash` in prose must carry the inline `DEVFLOW_ALLOW_RAW_COMMIT=1` prefix. Use the hook's exported `invokesGitCommit`
   / `hasInlineAllowPrefix` so the guard and the gate parse alike.
3. **Hook unit (gate-commits.test.js):** `chainsGitOpAndCommit` is true for `git merge X && git commit --no-edit`,
   `git merge X; git add a && git commit -m y` and `git cherry-pick Y && git commit`. It is false for `git commit -m x` alone, for
   `git merge X && node ~/.claude/devflow/bin/df-tools.cjs commit "m" --files a`, and for `echo "git merge && git commit"` (quoted text).
4. **Hook decision unchanged (gate-commits.test.js):** in a DevFlow fixture with no MERGE_HEAD, `git merge X && git commit --no-edit` is denied and
   the reason contains both the base DENY_MESSAGE and the separate-calls hint. A plain `git commit -m x` is denied with the base message
   and no hint. With MERGE_HEAD present, `git commit --no-edit` alone is allowed (the existing objective-44 case).

<embedded_context>

<codebase_examples>
gate-commits.js run() (lines ~398-436): `invokesGitCommit(cmd)` -> allow `df-tools.cjs commit` -> `hasInlineAllowPrefix(cmd)` ->
`allTargetsMidOperation(cmd, process.cwd())` -> DevFlow-project check -> `deny(DENY_MESSAGE)`. `commitInvocations(cmd)` (line ~177) splits the
masked command on `&&`, `||`, `;`, `&`, `|`, `(`, `)` and newline into simple commands. Reuse that segmentation for `chainsGitOpAndCommit`: true when
a segment that invokes `git [global flags] (merge|cherry-pick|revert|rebase|am)` comes before a segment that invokes git commit. Export it.

Deny hint text (suggested):
"This command runs `git merge` (or cherry-pick/revert/rebase) and `git commit` in one call. The gate decides before the merge runs, so
MERGE_HEAD does not exist yet. Run them as separate Bash calls: once the merge has stopped and the resolved files are staged,
`git commit --no-edit` on its own is allowed."

execute-objective.md 5b today:
```
**Branch merge protocol** — one plain command per call, for each plan in the wave:
git merge --no-ff df/exec-{plan_id}
File ownership is exclusive per wave ..., so a conflict indicates a planning error. On conflict:
git merge --abort
```
New conflict handling, one command per call:
1. `git diff --name-only --diff-filter=U` lists the conflicted paths.
2. If EVERY path is `.planning/STATE.md`, `.planning/ROADMAP.md` or `.planning/REQUIREMENTS.md`: for each, run `git checkout --ours -- <path>`
   and then `git add <path>`, then `git commit --no-edit` as its own call. After all of the wave's merges, run
   `node ~/.claude/devflow/bin/df-tools.cjs roadmap update-job-progress {objective}` and commit the result with `df-tools commit … --files .planning/ROADMAP.md`.
   This is the same "take ours, regenerate" policy as workstreams-merge.md step 3. Check `df-tools state` help for a STATE recompute command, and
   name it if one exists. If none exists, say STATE.md keeps the integration branch's copy.
3. Otherwise: `git merge --abort` and the existing planning-error route.

complete-milestone.md (~545-600) wraps `git merge --squash "$branch"` / `git merge --no-ff --no-commit "$branch"` and `git commit -m …` in
one shell block with loops. Rewrite it as numbered per-branch steps, each a single command. The squash completion becomes
`DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m "feat: $branch for v[X.Y]"`. The `--no-commit` completion becomes a plain `git commit -m …` on its own call.
workstreams-merge.md step 4 (`git commit -m "feat: merge {ws-name} …"` after `git merge --squash`) gets the inline prefix too.
</codebase_examples>

<anti_patterns>
- Do not add SQUASH_MSG (or any command-text prediction) to the allow path.
- Do not let `git merge … && git commit …` through. Only the message changes.
- Do not reintroduce chained commands in prose, even as "convenience" one-liners.
</anti_patterns>

<error_recovery>
- The hook reads `process.cwd()`. Spawn it with `cwd` set to the scratch repo, never this repo.
- Pass `GIT_CONFIG_GLOBAL=/dev/null` and set user.name/email in the scratch repo. Delete `DEVFLOW_ALLOW_RAW_COMMIT` from the hook's env in the
  replay, so an inherited escape cannot mask a deny.
- If extracting fences by marker is brittle, add an HTML comment anchor (`<!-- merge-sequence:start -->` / `<!-- merge-sequence:end -->`) around
  the section in execute-objective.md and extract between the anchors.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: explained deny for a chained git-op + commit (decision unchanged)</name>
  <files>plugins/devflow/hooks/gate-commits.js, plugins/devflow/hooks/gate-commits.test.js</files>
  <action>
RED: Test list items 3 and 4 in gate-commits.test.js. They fail: `chainsGitOpAndCommit` is not exported, and the hint is absent. Commit `test(53-04): ...`.
GREEN: add `chainsGitOpAndCommit(cmd)` (reusing commitInvocations' masking and segmentation) and export it. In run(), at the final deny, append the
hint when it is true. Change nothing else in run(). Commit `fix(53-04): ...`.
  </action>
  <verify>node --test plugins/devflow/hooks/gate-commits.test.js plugins/devflow/devflow/bin/lib/prompt-raw-commit.repo.test.cjs</verify>
  <done>Every existing gate decision is unchanged. A chained merge+commit denial names the separate-call form.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: execute-objective merge sequence one command per call, replayed through the gate</name>
  <files>plugins/devflow/devflow/workflows/execute-objective.md, plugins/devflow/hooks/gate-commits-merge-sequence.test.js</files>
  <action>
RED: write Test list item 1 (the replay) and the execute-objective part of item 2. Run it: the planning-file conflict path has no documented
commands yet, so the replay cannot complete the merge. Commit `test(53-04): ...`.
GREEN: rewrite 5b's "Branch merge protocol" and its conflict handling per codebase_examples. Each command goes in its own fenced line, with no `&&`, `;` or loops.
Re-run until the replay passes for the clean, planning-conflict and abort paths. Commit `fix(53-04): ...`.
  </action>
  <verify>node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/pr-lifecycle-prose.repo.test.cjs plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs</verify>
  <done>The documented execute-objective merge sequence passes gate-commits in a real repo, including the planning-file conflict, and the prose repo tests pass.</done>
  <recovery>If a planning-file conflict cannot be resolved with `--ours` in the replay (for example a rename), narrow the documented path to modify/modify conflicts and route everything else to the abort path.</recovery>
</task>

<task type="auto" tdd="true">
  <name>Task 3: complete-milestone and workstreams-merge stop documenting gate-denied completions</name>
  <files>plugins/devflow/devflow/workflows/complete-milestone.md, plugins/devflow/devflow/workflows/workstreams-merge.md, plugins/devflow/hooks/gate-commits-merge-sequence.test.js</files>
  <action>
RED: extend the item 2 prose guard to complete-milestone.md and workstreams-merge.md. It fails on the chained shell blocks and the bare squash
`git commit`. Commit `test(53-04): ...`.
GREEN: rewrite complete-milestone's two merge blocks (squash and history) as per-branch numbered steps, one command each. Squash completions
carry the inline `DEVFLOW_ALLOW_RAW_COMMIT=1` prefix, and `--no-ff --no-commit` completions are a plain separate `git commit`. Add the prefix to
workstreams-merge step 4. Add one sentence to each saying why: a squash leaves no MERGE_HEAD, so the gate cannot see the merge.
Commit `fix(53-04): ...`.
  </action>
  <verify>node --test plugins/devflow/hooks/gate-commits-merge-sequence.test.js plugins/devflow/devflow/bin/lib/devflow-workflows.repo.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs</verify>
  <done>No workflow documents a merge-and-commit the gate would deny, and the guard pins it.</done>
</task>

</tasks>

<validation_gates>
- test (task): `node --test` on the files in each task's `<verify>`.
- test (objective gate, run once in 53-07): `npm test`.
</validation_gates>

<verification>
- gate-commits.test.js passes with unchanged decisions plus the hint cases.
- gate-commits-merge-sequence.test.js replays the documented sequence through the hook in a scratch repo, and guards the three workflows.
</verification>

<success_criteria>
The documented merge sequence passes gate-commits. The gate still refuses every raw commit it refused before, and when the refusal is a
chained merge+commit it now says how to proceed.
</success_criteria>

<output>
Publish the SUMMARY with `summary checkpoint` / `summary post` 53-04 and commit it with your docs commit.
</output>
