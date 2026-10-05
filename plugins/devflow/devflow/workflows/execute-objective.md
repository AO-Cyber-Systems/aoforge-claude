---
status: active
---
<purpose>
Execute all jobs in an objective using wave-based parallel execution. Orchestrator stays lean — delegates job execution to subagents.
</purpose>

<core_principle>
Orchestrator coordinates, not executes. Each subagent loads the full execute-trd context. Orchestrator: discover plans → analyze deps → group waves → spawn agents → handle checkpoints → collect results.
</core_principle>

<required_reading>
Read STATE.md before any operation to load project context.
</required_reading>

<process>

<step name="initialize" priority="first">
Load all context in one call:

```bash
INIT=$(node ~/.claude/devflow/bin/df-tools.cjs init execute-objective "${OBJECTIVE_ARG}")
```

Parse JSON for: `executor_model`, `verifier_model`, `commit_docs`, `parallelization`, `branching_strategy`, `branch_name`, `objective_found`, `objective_dir`, `objective_number`, `objective_name`, `objective_slug`, `jobs`, `incomplete_jobs`, `job_count`, `incomplete_count`, `state_exists`, `roadmap_exists`, `bootstrap`, `bootstrap_objectives`, `pr_lifecycle`, `objective_branch`, `pr_number`, `branching_strategy_ignored`, `deprecations`.

`pr_lifecycle` is the one switch for the objective branch and pull request (store mode). Branch on this field only; never probe config with a shell command. When it is true, `objective_branch` is the linked branch name, `pr_number` is the PR number (null until `gh pr start` has opened it) and `branch_name` is null. When it is false, every value is as before and `deprecations` is present only if `branching_strategy` is `objective` or `milestone`.

**Bootstrap surface (one line, only when something changed).** If `bootstrap.applied` is true or
`bootstrap_objectives.applied > 0`, print exactly one line and continue:
`DevFlow bootstrap: PROJECT.md +<bootstrap.added_fields joined by ,> · created <bootstrap_objectives.paths joined by , > (uncommitted — folded into the next docs commit)`
Omit whichever half did not apply. Print nothing when neither applied.

**If `objective_found` is false:** Error — objective directory not found.
**If `job_count` is 0:** Error — no plans found in objective.
**If `state_exists` is false but `.planning/` exists:** Offer reconstruct or continue.

When `parallelization` is false, plans within a wave execute sequentially.
</step>

<step name="handle_branching">
Branch on `pr_lifecycle` from init.

**If `pr_lifecycle` is true (store mode):** the objective runs on one linked branch with one pull request, and `branching_strategy` is ignored (init reports it as `branching_strategy_ignored`; say so in one line if it is set, and do nothing with it). Start it once, here, before the first wave:

```bash
node ~/.claude/devflow/bin/df-tools.cjs gh pr start "${OBJECTIVE_NUMBER}"
```

It puts the checkout on `objective_branch`, makes one start commit and opens the draft PR. It needs GitHub, so it is an online step and queues nothing. On exit 1 (offline, uncommitted changes to tracked files, an objective with no issue yet — run `df-tools gh sync` for it first — or a refused branch name) STOP: report the message and do not spawn any executor, because every later step builds on that branch. Exit 3 means the push or flush is pending: report it, run the command again, and go on once it exits 0. Re-running it on an objective that already has its branch is safe. From here on every commit goes to `objective_branch`; the merge happens through the PR (see `update_roadmap`), never by a local merge.

**If `pr_lifecycle` is false (local mode):** unchanged. If init returned `deprecations`, print each entry once, then check `branching_strategy` from init:

**"none":** Skip, continue on current branch.

**"objective" or "milestone":** Use pre-computed `branch_name` from init:
```bash
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"
```

All subsequent commits go to this branch. User handles merging.
</step>

<step name="validate_objective">
From init JSON: `objective_dir`, `job_count`, `incomplete_count`.

Report: "Found {job_count} plans in {objective_dir} ({incomplete_count} incomplete)"
</step>

<step name="dup_detect_check">
**Skip if:** `--gaps-only` flag (gap closure plans are reactive to verification failures, not new overlap).

```bash
GAPS_ONLY=false
if [[ " $* " == *" --gaps-only "* ]]; then
  GAPS_ONLY=true
fi
```

If `GAPS_ONLY` is true, skip this step entirely and proceed to `discover_and_group_plans`.

Otherwise, run execute-time duplicate-work detection. Per CONTEXT.md locked decision #5 (friction-minimal at execute-time): only blocking matches trigger a prompt. Advisory matches are filtered upstream by `detectDuplicates(mode='execute')` and are never surfaced here. No-match path is a silent JSONL log entry.

```bash
DETECT_RAW=$(node ~/.claude/devflow/bin/df-tools.cjs dup-detect --mode execute "${OBJECTIVE_ARG}" --raw 2>/dev/null)
DETECT_OK=$?
if [[ $DETECT_OK -ne 0 ]]; then
  # Per CONTEXT.md locked decision #8: infrastructure failures are non-blocking.
  echo "Note: dup-detect skipped (df-tools dup-detect --mode execute failed); continuing without coordination signals."
  DETECT_RAW='{"blocking":false,"matches":[],"advisory":[],"warnings":["dup-detect CLI failed"],"mode":"execute","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
fi
DETECT_BLOCKING=$(echo "$DETECT_RAW" | jq -r '.blocking // false')
DETECT_MATCHES_LEN=$(echo "$DETECT_RAW" | jq -r '.matches | length')
DETECT_WARNINGS_LEN=$(echo "$DETECT_RAW" | jq -r '.warnings | length')
```

**If `DETECT_WARNINGS_LEN > 0`**, display warnings as informational blockquote (do NOT block execution):

```
> **Note:** Duplicate-work recheck ran with degraded signals:
> - {warning 1}
```

**If `DETECT_BLOCKING == "false"`** (no blocking match — the friction-minimal path):

```bash
node ~/.claude/devflow/bin/df-tools.cjs dup-detect log "${OBJECTIVE_ARG}" \
  --mode execute --blocking false --resolution none 2>/dev/null || true
```

Continue silently to `discover_and_group_plans`. **Do not display anything to the user.** This is the common case.

**If `DETECT_BLOCKING == "true"`**: display detection summary + ask user.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 DF ► DUPLICATE-WORK RECHECK — BLOCKING MATCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A peer session has started overlapping work since planning completed.
```

For each match in `DETECT_RAW.matches[]`:

```
**Match {N}** — {strength} via {source}
- Peer: `{peer_branch}` — `{peer_objective}`
- Signal: {signal}
- Score: {score}
```

Then surface AskUserQuestion (same 4-option list as plan-time, per CONTEXT.md locked decision #3):

```
AskUserQuestion(
  questions=[{
    header: "Resolution",
    question: "Detected duplicate-work overlap before execution begins. How do you want to resolve?",
    options: [
      { label: "Merge",      description: "Abort execution. Switch to peer branch and continue there." },
      { label: "Defer",      description: "Save objective state to .planning/.deferred/. Resume later." },
      { label: "Coordinate", description: "Continue execution. Add Coordination Note to CONTEXT.md naming the peer." },
      { label: "Proceed",    description: "Continue with full warning. Likely merge conflicts at commit time." }
    ],
    multiSelect: false
  }]
)
```

Map the user's label to a resolution string:

```bash
USER_LABEL="<from AskUserQuestion>"
case "$USER_LABEL" in
  Merge)      RESOLUTION="merge" ;;
  Defer)      RESOLUTION="defer" ;;
  Coordinate) RESOLUTION="coordinate" ;;
  Proceed)    RESOLUTION="proceed-anyway" ;;
  *)          RESOLUTION="proceed-anyway" ;;  # safest fallback per error-recovery
esac

PEER_BRANCH=$(echo "$DETECT_RAW" | jq -r '.matches[0].peer_branch // ""')
PEER_OBJECTIVE=$(echo "$DETECT_RAW" | jq -r '.matches[0].peer_objective // ""')

RESOLVE_RESULT=$(node ~/.claude/devflow/bin/df-tools.cjs dup-detect resolve "${OBJECTIVE_ARG}" \
  --resolution "$RESOLUTION" \
  --peer-branch "$PEER_BRANCH" \
  --peer-objective "$PEER_OBJECTIVE" \
  --raw 2>&1)
```

Note: `df-tools dup-detect resolve` calls `recordResolution` internally. No separate logging step needed.

**Workflow routing:**

- **merge** → Display abort message + git checkout suggestion. EXIT the workflow before `discover_and_group_plans`. Executor agents are NOT spawned. Display:

  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DF ► EXECUTION ABORTED — MERGE WITH PEER
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Overlapping work found on peer branch. Switch to the peer session and continue there:
    git checkout {PEER_BRANCH}

  Current objective directory left intact for manual cleanup.
  ```

  Run no further steps.

- **defer** → Display deferred state file path. EXIT the workflow before `discover_and_group_plans`. Executor agents are NOT spawned. Display:

  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DF ► EXECUTION DEFERRED
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Objective state persisted to: {RESOLVE_RESULT.defer_path}
  Resume when peer session completes.
  ```

  Run no further steps.

- **coordinate** OR **proceed-anyway** → Coordination Note has been appended to CONTEXT.md by `df-tools dup-detect resolve`. Continue to `discover_and_group_plans`. Executor agents will read CONTEXT.md transitively via their job context.

**Error recovery:** If `df-tools dup-detect resolve` exits non-zero, display the error and ask: "Continue without recording (Y) or retry (R)?" Recommended fallback: log via `dup-detect log` directly + continue to `discover_and_group_plans`.
</step>

<step name="discover_and_group_plans">
Load plan inventory with wave grouping in one call:

```bash
JOB_INDEX=$(node ~/.claude/devflow/bin/df-tools.cjs objective-job-index "${OBJECTIVE_NUMBER}")
```

Parse JSON for: `objective`, `plans[]` (each with `id`, `wave`, `autonomous`, `objective`, `files_modified`, `task_count`, `has_summary`), `waves` (map of wave number → plan IDs), `incomplete`, `has_checkpoints`.

**Filtering:** Skip plans where `has_summary: true`. If `--gaps-only`: also skip non-gap_closure plans. If all filtered: "No matching incomplete jobs" → exit.

Report:
```
## Execution Plan

**Objective {X}: {Name}** — {total_plans} plans across {wave_count} waves

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1 | 01-01, 01-02 | {from plan objectives, 3-8 words} |
| 2 | 01-03 | ... |
```
</step>

<step name="execute_waves">
Execute each wave in sequence. Within a wave: parallel if `PARALLELIZATION=true`, sequential if `false`.

**Read the mode ONCE, before the first wave** (the same form `checkpoint_handling` uses):
```bash
MODE=$(node ~/.claude/devflow/bin/df-tools.cjs config-get mode 2>/dev/null || echo "yolo"); echo "MODE=$MODE"
```
Note the printed `MODE` value as a literal. A shell variable does not survive into the next Bash call.

`AUTONOMOUS_CONTINUE` = `MODE` is `"autonomous"` or `"yolo"`. It governs ONE thing: whether you move on to the next wave without asking (items 6 and 9). It does not change failure handling. The autonomous failure protocol in item 7 stays keyed on `MODE == "autonomous"`, so a real failure in yolo still gets the non-autonomous failure prompt.

**For each wave:**

0. **Fix the repo and the base for this wave (BEFORE spawning) — issue #86:**

   An executor must be told which repository it is working in and which commit its work
   builds on. Neither may be left to the harness to infer: it used to resolve the repo
   from *this* session's cwd (dispatching an aodex objective from a session rooted
   elsewhere put the executor in a different repository entirely) and the base from the
   default branch (so wave 2 started without wave 1's commits).

   Read both, here, at the start of every wave — not once at the start of the objective.
   `WAVE_BASE` must be re-read per wave; that is what makes wave N+1 see wave N:

   ```bash
   git rev-parse --show-toplevel
   ```
   ```bash
   git rev-parse HEAD
   ```

   Note the two values down as literals (`REPO_ROOT`, `WAVE_BASE`) — a shell variable does
   not survive into the next Bash call. Both go into every executor prompt in this wave, with
   a third, `CHECKOUT`, the tree that executor works in (below).

   **If `pr_lifecycle` is true:** `gh pr start` left this checkout on `objective_branch`, so the `HEAD`
   read above is the objective branch tip, and that tip is `WAVE_BASE` for every wave, sequential or
   parallel (each wave's merge-back moves it forward). Confirm it once per wave with
   `git rev-parse --abbrev-ref HEAD`: it must print `objective_branch`. If it does not, STOP and report
   it. Something switched branches mid-objective, and worktrees cut from there would build on the wrong base.

   **Sequential wave (`PARALLELIZATION=false`, or a single plan):** the executor runs in
   `REPO_ROOT` itself, on the branch already checked out. `CHECKOUT` is `REPO_ROOT`.
   `WAVE_BASE` is the current HEAD, so the previous wave's commits are present by
   construction, and its preflight proves it.

   **Parallel wave (2+ plans):** once per objective run, before the first parallel wave's worktrees,
   register the planning-file merge drivers from the main checkout (idempotent; it prints `changed: false`
   on later runs):

   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs merge-driver install
   ```

   `.planning/state.json` then merges JSON-aware and `.planning/STATE_ARCHIVE.md` by union, so neither stops a
   wave merge. A failure, or `Unknown command` from an older runtime, is reported and the wave goes on: the
   Branch merge protocol in step 5b still handles a conflict on either file. Run the install and every wave
   merge in the main checkout, never inside an executor worktree: that worktree is removed after its merge, and
   a driver recorded from it would be stranded. `merge-driver uninstall` reverses the install.

   Then give each plan its own worktree, provisioned explicitly from `WAVE_BASE` in the target repo — never
   from the default branch:

   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs exec-context worktree --repo <REPO_ROOT> --id <plan_id> --base <WAVE_BASE>
   ```

   Run one per plan. Each prints `worktree_path`, `branch`, `merge_back`, `remove` and
   `preflight`; note them down. Pass `worktree_path` as that executor's `CHECKOUT` (the Task
   tool cannot set a working directory, and every Bash call starts in the session's
   directory, not in the worktree), and merge the branches back in step 5b before the next
   wave reads `WAVE_BASE` again. `preflight` is the exact `--cwd` check command for that
   worktree: it is the preflight line the spawn prompt below carries, filled in.

1. **Describe what's being built (BEFORE spawning):**

   Read each job's `<objective>`. Extract what's being built and why.

   Record the wave start with one plain command, wave number written out:

   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs estimate wave ${OBJECTIVE_NUMBER} {N} --start --raw
   ```

   Put the line it prints under the `## Wave {N}` header. If the estimate command fails or prints `No estimate:`, show that line (or nothing) and carry on; an estimate never blocks planning or execution.

   ```
   ---
   ## Wave {N}
   {wave estimate line}

   **{Plan ID}: {Plan Name}**
   {2-3 sentences: what this builds, technical approach, why it matters}

   Spawning {count} agent(s)...
   ---
   ```

   - Bad: "Executing terrain generation plan"
   - Good: "Procedural terrain generator using Perlin noise — creates height maps, biome zones, and collision meshes. Required before vehicle physics can interact with ground."

2. **Create progress tasks (if available):**

   For each job in the wave:
   ```
   TaskCreate(
     subject="Execute {plan_id}: {plan_name}",
     description="Executing plan {plan_number}: {plan_objective}",
     activeForm="Executing {plan_id}"
   )
   ```

3. **Assess plan complexity for model selection:**

   For each job in the wave, evaluate complexity:
   - Read `task_count` and `files_modified` from plan index
   - **Simple** (task_count <= 2, files_modified <= 3): use sonnet — straightforward implementation
   - **Standard** (task_count 3-5): use `executor_model` from profile — normal execution
   - **Complex** (task_count > 5 or files_modified > 8): use opus — benefits from stronger context management

   Log any overrides: `Model override: executor {executor_model} → {override} for {plan_id} (reason: {simple|complex} plan)`

   Safety rule: never downgrade executor below sonnet.

4. **Spawn executor agents:**

   Embed the full TRD content inline in every executor spawn prompt. A parallel-wave
   executor runs in the worktree you provisioned in step 0, where uncommitted .planning/
   files from the parent tree are not visible. Embedding the TRD guarantees the executor
   has its plan regardless of worktree state. Context cost: ~plan size per spawn;
   acceptable because TRDs are 2-3 tasks.

   Before spawning, read the plan file into orchestrator context:
   ```
   TRD_CONTENT = Read("{objective_dir}/{plan_file}")
   ```

   **If `pr_lifecycle` is true:** mark each TRD in progress as you spawn it, one plain call per TRD:

   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs gh trd start {plan_id}
   ```

   It queues a label write and reads nothing, so it works offline: exit 3 only means the write is pending,
   and the wave goes on. Exit 1 is shown as a warning and does not stop the wave. The executor's
   `summary post` removes the label and refreshes the PR when the TRD completes, so do neither yourself.
   The executor agent and its prompt are unchanged.

   ```
   Task(
     subagent_type="executor",
     model="{resolved_executor_model}",
     prompt="
       <objective>
       Execute plan {plan_number} of objective {objective_number}-{objective_name}.
       Commit each task atomically. Publish the SUMMARY with `df-tools summary checkpoint` (per task) and
       `df-tools summary post` (once). Record state with the `df-tools state` and `roadmap update-job-progress` commands.
       </objective>

       <execution_context>
       @~/.claude/devflow/workflows/execute-trd.md
       @~/.claude/devflow/templates/summary.md
       @~/.claude/devflow/references/checkpoints.md
       @~/.claude/devflow/references/tdd.md
       @~/.claude/devflow/references/anti-patterns.md
       </execution_context>

       <plan_content>
       The full TRD content is embedded below because you may be running in an isolated
       worktree where .planning/ files from the parent tree are not visible.
       --- BEGIN TRD ---
       {TRD_CONTENT}
       --- END TRD ---
       </plan_content>

       <repo_and_base>
       REPO_ROOT:  {REPO_ROOT}
       WAVE_BASE:  {WAVE_BASE}
       PLAN_ID:    {plan_id}
       CHECKOUT:   {CHECKOUT}

       Before anything else, prove you are where you are supposed to be:

         node ~/.claude/devflow/bin/df-tools.cjs --cwd {CHECKOUT} exec-context check --repo {REPO_ROOT} --base {WAVE_BASE} --id {plan_id}

       Your Bash calls start in the session's directory, not in CHECKOUT. Pass `--cwd {CHECKOUT}` to
       every df-tools call and `git -C {CHECKOUT}` to every git call, and use absolute paths under
       CHECKOUT for everything else.

       Exit 1 means WRONG REPOSITORY, BASE NOT VISIBLE or SHARED INDEX — all are hard stops. Report
       which fired, quote the output, and end your turn without writing anything. Do not
       try the paths anyway: a wrong-repo spawn cannot land a single commit where it is
       being looked for, and it fails silently if you let it. WRONG CHECKOUT is the one
       recoverable case: nothing was written and no claim was taken, so run the command it prints.
       </repo_and_base>

       <worktree_protocol>
       - You may be in a git worktree the orchestrator provisioned for you. Commit to your
         current branch as normal.
       - Publish the SUMMARY only through `node ~/.claude/devflow/bin/df-tools.cjs summary checkpoint` (per task) and
         `summary post` (once), from a `planning draft` path. In local mode the verbs write the
         checkout you are in, so from a worktree the SUMMARY lands in YOUR worktree: commit it with
         your task commits, and the wave merge delivers it. In store mode the verbs write the main
         checkout's gitignored cache and no commit carries the SUMMARY.
       - STATE.md / ROADMAP.md: change them only through `df-tools state advance-job --objective {objective_number}`
         (and the other `state` commands) and `df-tools roadmap update-job-progress`, and include the files they touch in
         your commits; conflicts are resolved at merge time by the orchestrator.
       </worktree_protocol>

       <success_criteria>
       - [ ] All tasks executed
       - [ ] Each task committed individually
       - [ ] Committed after every task; SUMMARY ## Progress kept current via `df-tools summary checkpoint` (a cut-short run is resumed, not redone)
       - [ ] SUMMARY published once via `df-tools summary post`
       - [ ] STATE.md position and decisions recorded via the `df-tools state` commands
       - [ ] Roadmap progress recorded via `df-tools roadmap update-job-progress`
       </success_criteria>
     "
   )
   ```

5. **Wait for all agents in wave to complete.**

   **Background execution (when `PARALLELIZATION=true` AND wave has 2+ plans):**

   Spawn each executor with `run_in_background=true` to enable true parallel execution:
   ```
   task_ids = []
   for each job in wave:
     result = Task(
       subagent_type="executor",
       model="{resolved_executor_model}",
       prompt="...",
       run_in_background=true
     )
     task_ids.append(result.task_id)
   ```

   While waiting for background agents:
   - Pre-read next wave's plan objectives (if next wave exists) to prepare context
   - Update TaskList progress periodically

   Poll for completion:
   ```
   for each task_id in task_ids:
     result = TaskOutput(task_id=task_id, block=true, timeout=600000)
   ```

   Collect all results, then proceed to step 5b.

   **Sequential execution (when `PARALLELIZATION=false` OR wave has 1 plan):**

   Use standard blocking Task() calls (existing behavior).

5b. **Merge the wave's worktree branches (parallel waves only):**

   **Ordering: classify (5c) and resume (5d) BEFORE this merge.** 5c reads each parallel plan's
   SUMMARY state from that plan's worktree (`<worktree_path>/.planning/...`, local mode), where the
   summary verbs wrote it, so it needs no merge. Merge only plans that are NOT INCOMPLETE. An INCOMPLETE
   executor is resumed inside its worktree, so merging that branch or removing that worktree
   would strand it. It is merged here, like any other plan, once a resume leaves it COMPLETE.
   A plan that falls through to item 7 keeps its worktree, so the fresh-respawn retry builds
   on its partial commits instead of redoing them.

   A sequential wave has nothing to merge — the executor committed to the branch you are
   already on, which is why `WAVE_BASE` for the next wave is simply the new HEAD.

   For a parallel wave, you provisioned each worktree yourself in step 0 and noted its
   `branch` and `merge_back` command, so there is no branch-list diffing to do — you know
   the names. Merge every one back into the current branch BEFORE any disk-based
   spot-check: file-existence checks read the working tree, so merge-before-spot-check
   ordering is mandatory.

   Prior art: workstreams.cjs provisions worktrees the same way, with `worktree_prefix`
   and `merge_strategy: "squash"`.

   **Branch merge protocol** — one plain command per call, for each plan in the wave. Never chain a
   merge with a commit, and never resolve a conflict in the merge's own call: a merge chained with a raw
   `git commit` is denied. gate-commits decides before a command runs, when `MERGE_HEAD` does not
   exist yet, so a completion commit chained after the merge looks like a raw commit. Run each step as its
   own Bash call. The merges run in the main checkout you are standing in, the integration checkout
   `merge_back` names, and never inside an executor worktree. Merge the plan's branch:
   ```bash
   git merge --no-ff df/exec-{plan_id}
   ```
   A clean merge commits itself, so there is nothing more to run for that plan. File ownership is
   exclusive per wave (each TRD owns different files), so a conflict in a code file indicates a planning
   error. The planning files are the exception: every executor touches `.planning/STATE.md`,
   `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` (see the worktree protocol above), and records
   its position and metrics in `.planning/state.json` and `.planning/STATE_ARCHIVE.md`, so the peers'
   changes to them can conflict. With the merge driver from step 0 installed, the last two merge without
   stopping. When the merge stops on a conflict, list the unmerged paths:
   ```bash
   git diff --name-only --diff-filter=U
   ```
   Classify every listed path three ways. `.planning/STATE.md`, `.planning/ROADMAP.md` and
   `.planning/REQUIREMENTS.md`: take the integration branch's copy of each one, as two separate calls,
   once per listed path (`<planning_path>` stands for one listed path):
   ```bash
   git checkout --ours -- <planning_path>
   ```
   ```bash
   git add <planning_path>
   ```
   `.planning/state.json` and `.planning/STATE_ARCHIVE.md`: merge them rather than dropping a peer's
   record. The command resolves the file (JSON-aware for state.json, by union for STATE_ARCHIVE.md) and
   stages it; run it once per listed state.json or STATE_ARCHIVE.md path:
   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs merge-driver resolve <planning_path>
   ```
   When every path is resolved, finish the merge with the completion commit, as its own call. It is allowed
   on its own because the stopped merge left `MERGE_HEAD`:
   ```bash
   git commit --no-edit
   ```
   If ANY other path is listed, resolve nothing. Abort the merge:
   ```bash
   git merge --abort
   ```
   Route to the failure handler with: "Merge conflict on {branch} — planning error, two
   TRDs in the same wave modified the same file."

   After EVERY parallel wave's merges, conflict or not, regenerate the position from disk: the merged
   SUMMARYs change it, and `state advance-job --objective` is idempotent. Taking ours is the same "take
   ours, regenerate" policy as workstreams-merge step 3, so a conflicted planning file loses nothing that
   cannot be rebuilt. `STATE.md` keeps the integration branch's copy: the advance rewrites its Status and
   counters from the TRDs and SUMMARYs now on disk, `state update-progress` rebuilds its progress figure,
   and a decision or note a peer recorded only in its own `STATE.md` copy is not carried over (it is still
   in that plan's SUMMARY). `ROADMAP.md` is recomputed from disk. For a conflicted
   `REQUIREMENTS.md`, re-run `node ~/.claude/devflow/bin/df-tools.cjs requirements mark-complete <ids>` with the
   `requirements:` of each plan whose copy lost. Then commit the result:
   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs state advance-job --objective "${OBJECTIVE_NUMBER}"
   ```
   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs state update-progress
   ```
   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs roadmap update-job-progress "${OBJECTIVE_NUMBER}"
   ```
   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs commit "docs(objective-{objective_number}): refresh roadmap and state after wave {N} merges" --files .planning/ROADMAP.md .planning/STATE.md .planning/state.json
   ```
   <!-- merge-sequence:end -->

   Then remove each worktree (the `remove` command `exec-context worktree` printed):
   ```bash
   git worktree remove <worktree_path>
   ```

   **If `pr_lifecycle` is true:** `df/exec-*` branches are never pushed. They are scratch branches for one
   executor, and pushing one creates a stray remote branch (and can open a stray PR). Only
   `objective_branch` ever reaches GitHub. Once a plan's branch is merged and its worktree removed,
   delete the branch locally, one plain call per merged plan:
   ```bash
   git branch -d df/exec-{plan_id}
   ```
   `-d` refuses an unmerged branch, which is what you want: if it refuses, the merge did not happen, so
   report it and keep the branch. A plan that fell through to item 7 keeps its branch and worktree.

   **The wave's SUMMARYs arrive with the merges (local mode).** Each parallel executor wrote its SUMMARY
   into its own worktree and committed it on its `df/exec-*` branch, so the merges above already bring
   them into this tree. There is nothing more to commit, and no copy of a SUMMARY exists here for a
   merge to collide with. Do not copy or move a SUMMARY between trees. In store mode the SUMMARY is the
   main checkout's gitignored cache, as before, and no commit carries it.

   **If `pr_lifecycle` is true, sync the objective PR once per wave** (every wave, a sequential one with
   nothing to merge included). It pushes `objective_branch` and refreshes the PR body, so running it once
   per wave, not after every executor, keeps the number of pushes and PR updates low:
   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs gh pr sync "${OBJECTIVE_NUMBER}"
   ```
   Exit 0: done. Exit 3: the push or the flush is pending (offline, a rate limit); say so and go on. The
   work is committed locally, and the verify step syncs again before it posts anything. Exit 2: the outbox
   halted for a human; stop and report it. Exit 1: show the message and go on, since the commits are
   safe; the verify step will not post until a sync succeeds. Warnings arrive on stderr with exit 0:
   surface them in the wave report.

   **Why the base is stated rather than inferred (issue #86):** platform-managed isolation
   branched from the default branch, not the parent HEAD, so on a feature branch the prior
   waves' commits were simply missing from a fresh worktree — each wave silently re-did or
   contradicted the last. Provisioning from `WAVE_BASE` and merging back here is what makes
   wave N+1 see wave N. The executor's `exec-context check --base` proves it rather than
   trusting it. `--id` makes check refuse a second parallel TRD in the same checkout, so
   skipping `exec-context worktree` for a parallel wave now fails loudly with `SHARED INDEX`
   (#98); a dead executor's claim is cleared with `exec-context release`.

   After all branches are merged, `git log --all --grep` and the file-existence spot-checks
   in step 6 will see every wave commit.

5c. **Classify each returned executor: COMPLETE / INCOMPLETE / FAILED.**

   An executor can come back with `<status>completed</status>` and still be unfinished. When a
   run is cut short, the task-notification `<summary>` reads like
   `Agent "<desc>" stopped at its N-turn limit (partial result; SendMessage to task-id to continue)`,
   and SubagentStop never fires, so no hook catches it. A truncation is not a failure. It is
   its own outcome with its own budget. Record each executor's **task id** (from the Task
   result or its task-notification) when you spawn it, because 5d resumes by that id.

   For each plan, gather three facts:
   - **TRD_TASKS** = the number of opening `<task` elements in `TRD_CONTENT` (`<task type=...>`
     or `<task>`; the `<tasks>` wrapper does not count). Do NOT rely on `task_count` from
     `objective-job-index`, because 44-08 fixes that field.
   - **COMMITS** = the line count of
     `git log --oneline --all --grep="({objective}-{trd})"`
     (`--all` sees an unmerged worktree branch too).
   - **SUMMARY state**, read from where the summary verbs wrote it. Local mode: a parallel plan's state
     comes from its worktree (`<worktree_path>/.planning/...`, the path you noted in step 0, read before
     the 5b merge), and a sequential plan's from the current tree. Store mode: the main checkout's
     `.planning/` and `.planning/.trd-progress/`, for every plan. It is one of:
     - `missing`: no `{objective}-{trd}-SUMMARY.md` and no `.planning/.trd-progress/{objective}-{trd}.md`;
     - `checkpoint`: the SUMMARY exists but has no `## Self-Check` heading, or (store mode) only
       `.planning/.trd-progress/{objective}-{trd}.md` exists. The executor contract
       says "A SUMMARY without `## Self-Check` means checkpoint, not complete";
     - `final`: it has `## Self-Check: PASSED` or `## Self-Check: FAILED`.

   The plan is **INCOMPLETE** when EITHER:
   - (a) the task-notification summary contains `turn limit` or `partial result`; OR
   - (b) SUMMARY is `missing` or `checkpoint` AND COMMITS < TRD_TASKS.

   (b) does not apply to a structured stop, which has its own handler and is never resumed as
   INCOMPLETE. These are: a `## CHECKPOINT REACHED` return (go to `<checkpoint_handling>`), a
   Rule 4 `decision:` return, an `## ESCALATION REQUESTED` return, or a preflight hard stop
   (`WRONG REPOSITORY`, `BASE NOT VISIBLE`, `SHARED INDEX`). The last three are FAILED.

   **COMPLETE** (not INCOMPLETE, SUMMARY `final`) → go to item 6's spot-checks.
   **INCOMPLETE** → item 5d.
   **Anything else is FAILED** → item 6/7, as today.

5d. **Resume INCOMPLETE plans.**

   A cut-short executor still holds its context: every file it read and every decision it made.
   A fresh `Task(...)` spawn throws all of that away and redoes it. So resume the SAME executor.
   Up to **3 times per plan**, call `SendMessage(to=<that executor's task id>, message=...)` with:
   ```
   Your run stopped before the TRD was finished (INCOMPLETE, not failed). Your context is intact:
   do NOT re-research and do NOT re-read files you already read.
   Already committed: {git log lines for this plan}
   Remaining steps:
   1. {first unticked ## Progress item, or first TRD task with no commit}
   2. ...
   N. Finish the SUMMARY draft with ## Self-Check and publish it once with `df-tools summary post`.
   ```
   Build the numbered steps from the plan's SUMMARY `## Progress` section (store mode: its
   `.trd-progress/` file) when there is one: its
   unticked items in order, with the `next step:` line as step 1. Without one, list the TRD's
   tasks that have no commit yet. The last step is always the final SUMMARY with
   `## Self-Check`.

   Re-classify (5c) after each resume.
   - COMPLETE → item 6.
   - FAILED → item 7.
   - Still INCOMPLETE → resume again, up to the budget.

   After the 3rd resume, a plan that is still INCOMPLETE falls through to item 7 with a
   `<failure_feedback>` block noting "truncated 4 times". It goes to the autonomous fresh-respawn
   failure protocol when `MODE` is `"autonomous"`, and to the non-autonomous failure prompt
   otherwise.

   The INCOMPLETE budget is separate from the failure retry. Resumes do not consume the one
   fresh-respawn retry, and a truncation never counts as a failure.

   This happens in EVERY mode, because resuming a truncated run is not a user decision: never
   ask whether to resume. Run the INCOMPLETE resumes for different plans of the same wave in
   parallel. While any plan in the wave is still being resumed, the next wave does not start:
   its dependents are `waiting on {id}`.

6. **Report completion — spot-check claims first:**

   Record the wave end with one plain command, wave number written out. Keep the line it prints for the report below:

   ```bash
   node ~/.claude/devflow/bin/df-tools.cjs estimate wave ${OBJECTIVE_NUMBER} {N} --done --raw
   ```

   **Update progress (if available):** For each completed plan:
   ```
   TaskUpdate(taskId=plan_task_id, status="completed")
   ```

   For each SUMMARY.md:
   - Verify first 2 files from `key-files.created` exist on disk
   - Check `git log --oneline --all --grep="{objective}-{job}"` returns ≥1 commit
   - Check for `## Self-Check: FAILED` marker

   If ANY spot-check fails: report which plan failed, route to failure handler. If `MODE` is `"autonomous"`, apply the autonomous failure protocol in step 7 directly (do not prompt). Otherwise ask "Retry plan?" or "Continue with remaining waves?"

   If pass:
   ```
   ---
   ## Wave {N} Complete
   {actual vs estimate line}

   **{Plan ID}: {Plan Name}**
   {What was built — from SUMMARY.md}
   {Notable deviations, if any}

   {If more waves: what this enables for next wave}
   ---
   ```

   - Bad: "Wave 2 complete. Proceeding to Wave 3."
   - Good: "Terrain system complete — 3 biome types, height-based texturing, physics collision meshes. Vehicle physics (Wave 3) can now reference ground surfaces."

   **When `AUTONOMOUS_CONTINUE` is true (`MODE` is `"autonomous"` or `"yolo"`)**, this report
   is an announcement, not a question. Post it, then go straight on to item 9 and spawn the next
   wave in the SAME turn. Never end the turn on "Ready for wave N?", "Continue?", "Shall I
   proceed?" or "on your word". In other interactive modes, behaviour is unchanged.

7. **Handle failures:**

   **Known Claude Code bug (classifyHandoffIfNeeded):** If an agent reports "failed" with error containing `classifyHandoffIfNeeded is not defined`, this is a Claude Code runtime bug — not a DevFlow or agent issue. The error fires in the completion handler AFTER all tool calls finish. In this case: run the same spot-checks as step 4 (SUMMARY.md exists, git commits present, no Self-Check: FAILED). If spot-checks PASS → treat as **successful**. If spot-checks FAIL → treat as real failure below.

   **A truncation is not a failure.** A plan that ends INCOMPLETE (5c) never puts its
   dependents in the skipped set. Only a plan whose fresh-respawn retry produced a real FAILED
   outcome, not another truncation, triggers the dependent-set SKIP below. A plan reaches
   this item after its 3 resumes (5d) are spent. If its fresh-respawn retry is itself cut short,
   it is INCOMPLETE again. Report it `⏳ Incomplete`, and list its dependents as
   `waiting on {id}`, not `⏭ Skipped`. Re-running `/devflow:execute-objective` picks it up
   from its `## Progress` checkpoint.

   **Autonomous failure protocol (when `MODE` is `"autonomous"`):**

   1. **RETRY ONCE:** Re-spawn a fresh executor for the failed plan with a `<failure_feedback>` block appended to the standard executor prompt:
      ```
      <failure_feedback>
      The previous attempt at this plan failed. Do NOT repeat the same approach.
      Spot-check results: {which files were missing, which commits were absent, any Self-Check: FAILED markers}
      Error output from failed attempt: {agent error / last output}
      Partial commits from failed attempt (if any): {git log output for this plan's commits}
      </failure_feedback>
      ```

   2. **If the retry also fails:** Compute the dependent set — all TRDs whose `depends_on` transitively includes the failed plan id. The orchestrator already holds this data from the objective-job-index wave/depends_on map; no shell-out needed. Skipped TRD entries are recorded with the blocking failure id.

   3. **SKIP only the dependent set.** Continue executing all remaining independent TRDs in subsequent waves as normal.

   4. **Final report** — include in `aggregate_results` output:

      | Status | TRD | Detail |
      |--------|-----|--------|
      | ✓ Complete | {id} | {one-liner from SUMMARY.md} |
      | ✗ Failed | {id} | {last error summary} |
      | ⏭ Skipped | {id} | blocked by {failed-plan-id} |
      | ⏳ Incomplete | {id} | truncated; resumable — re-run /devflow:execute-objective |
      | ⏸ Parked | {id} | pending DECISION-NNN |

      A dependent of an `⏳ Incomplete` plan is reported as `waiting on {id}`, never
      `⏭ Skipped`: nothing it depends on has failed.

      Never ask "Continue?/Stop?" mid-run in autonomous mode.

   **Non-autonomous failure handling (when `MODE` is NOT `"autonomous"`):**

   For real failures: report which plan failed → ask "Continue?" or "Stop?" → if continue, dependent plans may also fail. If stop, partial completion report.

8. **Execute checkpoint plans between waves** — see `<checkpoint_handling>`.

9. **Proceed to next wave.** When `AUTONOMOUS_CONTINUE` is true (`MODE` is `"autonomous"` or
   `"yolo"`), do it now, in this turn. Announce the wave (item 1) and spawn it (item 4) without
   asking "Ready for wave {N}?" / "Continue?". Stopping to ask between waves in yolo mode was
   58 of the 186 human nudges in the objective-44 session review. In other interactive modes,
   behaviour is unchanged. This covers between-wave continuation only. A real FAILURE in yolo
   still follows the non-autonomous failure handling in item 7.
</step>

<step name="checkpoint_handling">
Plans with `autonomous: false` require user interaction.

**Mode-aware checkpoint handling:**

Read mode and auto-advance config:
```bash
MODE=$(node ~/.claude/devflow/bin/df-tools.cjs config-get mode 2>/dev/null || echo "yolo")
AUTO_CFG=$(node ~/.claude/devflow/bin/df-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
```

**Branch 1 — Autonomous mode (`MODE` is `"autonomous"`):**

When executor returns a checkpoint AND `MODE` is `"autonomous"`:

- **human-verify** → VERIFIER-DELEGATED. Do NOT blind-approve. Spawn the verifier agent in checkpoint verification mode with the checkpoint's `what-built`, `how-to-verify` steps, and plan ID. Pass the port constraint in the prompt.

  ```
  Task(
    subagent_type="verifier",
    model="{resolved_verifier_model}",
    prompt="
      <objective>
      CHECKPOINT VERIFICATION MODE — scoped functional pass, not full objective verification.
      Verify the checkpoint below and return structured status.
      </objective>

      <checkpoint_context>
      Plan: {plan_id} — {plan_name}
      What was built: {what-built from checkpoint}
      How to verify: {how-to-verify steps from checkpoint}
      </checkpoint_context>

      <constraints>
      - NEVER use port 8080 for anything. It is permanently occupied on the operator's machine.
        If a dev/verification server is needed, bind port 8091 instead.
      - Run only the checks needed to prove or disprove the how-to-verify steps.
        Do not re-verify the whole objective.
      </constraints>

      <output_format>
      Return structured status:
        status: passed | gaps_found | human_needed
      Include evidence: commands run, observed output, screenshots taken.
      </output_format>
    "
  )
  ```

  **On verifier return:**

  - `status: passed` → spawn continuation agent with `{user_response}` = `"approved (verifier evidence: {one-line summary})"`. Log `⚡ Verifier-approved: [checkpoint]`.
  - `status: gaps_found` OR `status: human_needed` → escalate to user. Present the checkpoint using the standard "Present to user" format (step 4 of standard flow below) PLUS append a `### Verifier Report` section with the verifier's full evidence output. Wait for user response before spawning continuation agent.
  - Verifier timeout or ambiguous return → treat as `human_needed` and escalate to user. Never approve on ambiguity.

- **decision** → PARK, NOTIFY, CONTINUE INDEPENDENT.

  1. **Park:** Run the decision-queue add command with full context:
     ```bash
     node ~/.claude/devflow/bin/df-tools.cjs decision-queue add \
       --objective {N} --trd {plan_id} --wave {W} \
       --title "{one-line decision summary from checkpoint}" \
       --context "{context block from checkpoint return}" \
       --options "{option ids, comma-separated — e.g., option-a,option-b}" \
       --recommendation "{executor's recommended option id}" \
       --blocks "{TRD ids in the blocked set}" \
       --independent "{remaining executable TRD ids}"
     ```

     **Computing `--blocks` and `--independent`:**
     - The orchestrator already holds all wave/depends_on data loaded from objective-job-index.
     - Blocked set = TRDs whose `decision_gate` frontmatter matches this decision's id (DECISION-NNN), PLUS their transitive `depends_on` closure, PLUS the parked plan itself (whose continuation requires the answer).
     - When no TRD declares a `decision_gate` for this decision, `--blocks` is the parked plan id only; everything else is independent.
     - `df-tools decision-queue add` fires the OS notification itself — no separate notify call needed.

  2. **Mark parked:** Update the wave table entry for the parked plan to status `⏸ parked on DECISION-NNN`.

  3. **Continue independent:** Proceed to the next wave executing every TRD not in the blocked set. Do NOT halt all waves. Do NOT auto-select any option — parking is the only autonomous handling for decisions.

  4. **Aggregate report:** The `aggregate_results` step includes a `### Pending Decisions` section (see that step).

- **Rule 4 deviation return (autonomous mode):** When an executor returns a Rule 4 architectural stop (not a checkpoint task, but an agent return containing `decision:`, `options:`, `recommendation:` fields) AND `MODE` is `"autonomous"`:
  Park it identically to `checkpoint:decision` using `decision-queue add` with `type: rule-4-deviation`. The executor's `recommendation:` field maps to `--recommendation`, the `options:` list maps to `--options`, and the `context:` field maps to `--context`. Blocked set computation is the same as above. Never surface Rule 4 stops as mid-run user prompts in autonomous mode.

- **human-action** → Present to user. Auth gates cannot be automated.

**Branch 2 — Legacy yolo (`MODE` is NOT `"autonomous"` AND `AUTO_CFG` is `"true"`):**

When executor returns a checkpoint AND `MODE` is not `"autonomous"` AND `AUTO_CFG` is `"true"`:
- **human-verify** → Auto-spawn continuation agent with `{user_response}` = `"approved"`. Log `⚡ Auto-approved checkpoint`.
- **decision** → Auto-spawn continuation agent with `{user_response}` = first option from checkpoint details. Log `⚡ Auto-selected: [option]`.
- **human-action** → Present to user (existing behavior below). Auth gates cannot be automated.

**Branch 3 — Standard interactive flow (not auto-mode, or human-action type):**

1. Spawn agent for checkpoint plan
2. Agent runs until checkpoint task or auth gate → returns structured state
3. Agent return includes: completed tasks table, current task + blocker, checkpoint type/details, what's awaited
4. **Present to user:**
   ```
   ## Checkpoint: [Type]

   **Plan:** 03-03 Dashboard Layout
   **Progress:** 2/3 tasks complete

   [Checkpoint Details from agent return]
   [Awaiting section from agent return]
   ```
5. User responds: "approved"/"done" | issue description | decision selection
6. **Spawn continuation agent (NOT resume)** using continuation-prompt.md template:
   - `{completed_tasks_table}`: From checkpoint return
   - `{resume_task_number}` + `{resume_task_name}`: Current task
   - `{user_response}`: What user provided
   - `{resume_instructions}`: Based on checkpoint type
7. Continuation agent verifies previous commits, continues from resume point
8. Repeat until plan completes or user stops

**Why fresh agent, not resume:** Resume relies on internal serialization that breaks with parallel tool calls. Fresh agents with explicit state are more reliable.

**Future consideration:** For simple plans (single auto task + checkpoint, no parallel tool calls), agent resume may be viable. Before considering resume, verify the agent did NOT use parallel tool calls during execution. See `@~/.claude/devflow/references/checkpoints.md` "Resume vs Fresh Agent Decision" section for the full decision framework.

**Checkpoints in parallel waves:** Agent pauses and returns while other parallel agents may complete. Present checkpoint, spawn continuation, wait for all before next wave.
</step>

<step name="aggregate_results">
After all waves:

```markdown
## Objective {X}: {Name} Execution Complete

**Waves:** {N} | **Jobs:** {M}/{total} complete
**Time:** {output of `node ~/.claude/devflow/bin/df-tools.cjs estimate finish ${OBJECTIVE_NUMBER} --raw`; omit the line if it fails}

| Wave | Plans | Status |
|------|-------|--------|
| 1 | plan-01, plan-02 | ✓ Complete |
| CP | plan-03 | ✓ Verified |
| 2 | plan-04 | ✓ Complete |

### Plan Details
1. **03-01**: [one-liner from SUMMARY.md]
2. **03-02**: [one-liner from SUMMARY.md]

### Issues Encountered
[Aggregate from SUMMARYs, or "None"]

### Pending Decisions
```bash
# Check for pending decisions
ls .planning/decisions/pending/ 2>/dev/null
```
If `.planning/decisions/pending/` is non-empty, include this section:

| ID | Title | Blocked TRDs | Resolve Command |
|----|-------|-------------|----------------|
| DECISION-001 | [title from decision file] | [comma-separated TRD ids] | `/devflow:decide DECISION-001 <choice>` |

Show one row per pending decision. If `.planning/decisions/pending/` is empty or absent, omit this section entirely.
```
</step>

<step name="close_parent_artifacts">
**For decimal/polish objectives only (X.Y pattern):** Close the feedback loop by resolving parent UAT and debug artifacts.

**Skip if** objective number has no decimal (e.g., `3`, `04`) — only applies to gap-closure objectives like `4.1`, `03.1`.

**1. Detect decimal objective and derive parent:**
```bash
# Check if objective_number contains a decimal
if [[ "$OBJECTIVE_NUMBER" == *.* ]]; then
  PARENT_OBJECTIVE="${OBJECTIVE_NUMBER%%.*}"
fi
```

**2. Find parent UAT file:**
```bash
PARENT_INFO=$(node ~/.claude/devflow/bin/df-tools.cjs find-objective "${PARENT_OBJECTIVE}" --raw)
# Extract directory from PARENT_INFO JSON, then find UAT file in that directory
```

**If no parent UAT found:** Skip this step (gap-closure may have been triggered by VERIFICATION.md instead).

**3. Resolve the UAT gaps in a draft.** The UAT file is published through `doc put` and never edited in place:

```bash
node ~/.claude/devflow/bin/df-tools.cjs planning draft objectives/<parent objective dir>/<parent UAT file name>
```

In the printed draft path, read the `## Gaps` section. For each gap entry with `status: failed`:
- Set it to `status: resolved`

**4. UAT frontmatter (same draft):**

If all gaps now have `status: resolved`:
- Set frontmatter `status: diagnosed` → `status: resolved`
- Refresh the frontmatter `updated:` timestamp

Then publish the draft:

```bash
node ~/.claude/devflow/bin/df-tools.cjs doc put objectives/<parent objective dir>/<parent UAT file name> --from <draft path>
```

**5. Resolve referenced debug sessions:**

For each gap that has a `debug_session:` field:
- Read the debug session file
- Resolve it with the debug verb. In local mode it marks the session resolved and moves it to `.planning/debug/resolved/`:
```bash
node ~/.claude/devflow/bin/df-tools.cjs debug resolve {slug}
```

**6. Commit updated artifacts:**
```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs(objective-${PARENT_OBJECTIVE}): resolve UAT gaps and debug sessions after ${OBJECTIVE_NUMBER} gap closure" --files .planning/objectives/*${PARENT_OBJECTIVE}*/*-UAT.md .planning/debug/resolved/*.md
```
</step>

<step name="verify_objective_goal">
Verify objective achieved its GOAL, not just completed tasks.

Mark the objective as verifying before the verifier runs. The command is store-aware; in local mode it sets `status: verifying` in OBJECTIVE.md. A non-zero exit is reported, not fatal:

```bash
node ~/.claude/devflow/bin/df-tools.cjs objective set-status "${OBJECTIVE_NUMBER}" verifying
```

**If `pr_lifecycle` is true, sync the objective PR BEFORE the verifier runs:**

```bash
node ~/.claude/devflow/bin/df-tools.cjs gh pr sync "${OBJECTIVE_NUMBER}"
```

The verification result is recorded against the PR's head commit on GitHub. Syncing first means GitHub holds the head being verified, so the status lands on the verified head instead of a stale one. This sync must exit 0. On exit 3 (pending) or exit 1, run it again; if it still does not exit 0, STOP and report why, and do not start the verifier. Nothing may be committed to `objective_branch` between this sync and the post. Run the same sync again before every re-verify in the gap-closure loop below, because the fix TRDs moved the head. A `verification post` while the linked branch has commits that GitHub does not have is refused for that reason: it exits 1 naming `df-tools gh pr sync <objective>`, and writes and queues nothing. The remedy is the sync above, then the verification again on the pushed head.

The verifier's `verification post` does the rest: it queues the verification comment, the commit status, the ready-for-review change and the wiki diff when the verdict is `passed`. Do not call any of those from here.

**Progress tracking (if available):**
```
TaskCreate(
  subject="Verify Objective {X} goals",
  description="Checking objective goal achievement against must-haves and requirements",
  activeForm="Verifying Objective {X}"
)
```

```bash
OBJECTIVE_REQ_IDS=$(node ~/.claude/devflow/bin/df-tools.cjs roadmap get-objective "${OBJECTIVE_NUMBER}" | jq -r '.section' | grep -i "Requirements:" | sed 's/.*Requirements:\*\*\s*//' | sed 's/[\[\]]//g')
```

```
Task(
  prompt="Verify objective {objective_number} goal achievement.
Objective directory: {objective_dir}
Objective goal: {goal from ROADMAP.md}
Objective requirement IDs: {objective_req_ids}
Check must_haves against actual codebase.
Cross-reference requirement IDs from TRD/JOB frontmatter against REQUIREMENTS.md — every ID MUST be accounted for.
Draft VERIFICATION.md from `planning draft` and publish it with `node ~/.claude/devflow/bin/df-tools.cjs verification post {objective_number} --from <draft path>`.
The VERIFICATION frontmatter must carry `status: passed|gaps_found|human_needed` (optional `score:`); `verification post` reads it.",
  subagent_type="verifier",
  model="{verifier_model}"
)
```

Read status:
```bash
grep "^status:" "$OBJECTIVE_DIR"/*-VERIFICATION.md | cut -d: -f2 | tr -d ' '
```

| Status | Action |
|--------|--------|
| `passed` | → update_roadmap |
| `human_needed` | Present items for human testing, get approval or feedback |
| `gaps_found` | → auto_gap_closure |

**If human_needed:**

Display items from VERIFICATION.md `human_verification` section, then for each item use AskUserQuestion:
```
AskUserQuestion(
  header: "Verify",
  question: "{item description from VERIFICATION.md}",
  multiSelect: false,
  options: [
    { label: "Verified", description: "This works correctly" },
    { label: "Issue found", description: "Something isn't right — I'll describe" },
    { label: "Can't test now", description: "Skip this item for now" }
  ]
)
```

If "Issue found": follow up with freeform "Describe the issue:" prompt. Collect all responses and route accordingly: all verified → proceed to `update_roadmap`. Any issues → `auto_gap_closure`.

**If gaps_found → auto_gap_closure:**

Automatically generate fix TRDs and execute them (replaces manual 3-command gap-closure).

```
GAP_CLOSURE_CYCLE=0
MAX_GAP_CYCLES=2
```

**While gaps exist AND GAP_CLOSURE_CYCLE < MAX_GAP_CYCLES:**

1. **Generate fix TRDs:**
   ```
   GAP_CLOSURE_CYCLE=$((GAP_CLOSURE_CYCLE + 1))
   ```

   Display:
   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    DF ► AUTO-FIXING GAPS (Cycle {GAP_CLOSURE_CYCLE}/{MAX_GAP_CYCLES})
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

   Spawn planner with `--gaps` flag:
   ```
   Task(
     prompt="<planning_context>
     **Objective:** {objective_number}
     **Mode:** gap_closure
     **Gap Closure:** {verification_content}
     **State:** {state_content}
     **Roadmap:** {roadmap_content}
     </planning_context>",
     subagent_type="planner",
     model="{planner_model}",
     description="Plan gap closure for Objective {objective_number}"
   )
   ```

2. **Execute fix TRDs:**
   Spawn executor agents for gap-closure TRDs (same wave-based execution as main execute step).

3. **Re-verify:**
   If `pr_lifecycle` is true, run `gh pr sync` first (see the sync before the verifier above); `verification post` refuses an unsynced head and names that command. Re-run verification. Read new status.

   - `passed` → Break loop, continue to update_roadmap
   - `gaps_found` → Continue loop (next cycle)

**If still failing after MAX_GAP_CYCLES:**

```
## ⚠ Objective {X}: {Name} — Gaps Remain After 2 Auto-Fix Cycles

**Score:** {N}/{M} must-haves verified
**Report:** {objective_dir}/{phase_num}-VERIFICATION.md

### Remaining Gaps
{Gap summaries from VERIFICATION.md}

Auto-fix could not resolve all gaps. Manual intervention needed.

Options:
- `/devflow:plan-objective {X} --gaps` — Manual gap closure planning
- `/devflow:verify-work {X}` — Manual testing
- `cat {objective_dir}/{phase_num}-VERIFICATION.md` — Full report
```

Stop auto-advance chain at this point.
</step>

<step name="update_roadmap">
**Mark objective complete and update all tracking files:**

```bash
COMPLETION=$(node ~/.claude/devflow/bin/df-tools.cjs objective complete "${OBJECTIVE_NUMBER}")
```

The CLI handles:
- Marking objective checkbox `[x]` with completion date
- Updating Progress table (Status → Complete, date)
- Updating job count to final
- Advancing STATE.md to next objective
- Updating REQUIREMENTS.md traceability

Extract from result: `next_objective`, `next_objective_name`, `is_last_objective`.

**Auto-reconcile ROADMAP drift (TRD 18-02):**

Before the final commit, reconcile any ROADMAP ↔ disk drift so the commit captures the corrected state in one atomic move. Non-blocking — failure produces a warning but does not abort completion.

```bash
node ~/.claude/devflow/bin/df-tools.cjs sync-roadmap || {
  echo "Note: sync-roadmap reconcile skipped (CLI failed); continuing without ROADMAP drift correction."
}
```

**Auto-push to GitHub (objective 46, GSF-03):**

Push the objective's state to its GitHub issue (created on first sync). When `github.enabled` is not true the command reports `skipped` and exits 0. A failure never blocks completion, but it is shown, never swallowed. `OBJECTIVE_DIR` may be the bare directory name or the `.planning/objectives/…` path that `init` reports; `basename` accepts both.

```bash
OBJECTIVE_DIR="$(basename "${OBJECTIVE_DIR}")"
if SYNC_OUT=$(node ~/.claude/devflow/bin/df-tools.cjs gh sync "${OBJECTIVE_DIR}" 2>&1); then
  :
else
  echo "WARNING: GitHub sync failed for objective ${OBJECTIVE_DIR} (completion continues):"
  printf '%s\n' "$SYNC_OUT" | head -40
  echo "Retry: node ~/.claude/devflow/bin/df-tools.cjs gh sync ${OBJECTIVE_DIR}"
fi
```

```bash
node ~/.claude/devflow/bin/df-tools.cjs commit "docs(objective-{X}): complete objective execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md .planning/objectives/{objective_dir}/*-VERIFICATION.md
```

Add `.planning/objectives/{objective_dir}/OBJECTIVE.md` to `--files` when the objective has one, because `objective set-status` changed it.

**If `pr_lifecycle` is true — merge the objective PR, then reconcile.**

In store mode `objective complete` does not close the objective's GitHub issue while its PR is unmerged: it exits 0, writes the status and prints a warning that the close is deferred. The objective issue closes on merge, not at verify, so the objective is not finished until its PR is. Local mode is unaffected (nothing here applies to it).

Offer the merge with AskUserQuestion (header "Merge", options "Merge now" and "Leave open for review"). Never merge without a yes. The merge method is `github.pr.merge_method` (default `squash`). On "Merge now":

```bash
node ~/.claude/devflow/bin/df-tools.cjs gh pr merge "${OBJECTIVE_NUMBER}"
```

- exit 0: merged and reconciled in the same call. The issues are closed, the Project is Done, the checkout is back on the default branch and the objective branch is deleted.
- exit 3: the PR was only enqueued in the merge queue (or the flush is pending). Nothing is wrong. Tell the user to run `gh pr reconcile` once it lands (below).
- exit 2: the outbox halted for a human. Stop and report the PR and the reason it printed.
- exit 1: refused (still a draft, the linked branch has unpushed commits, no successful `devflow/verification` status on the current head, closed, or offline). Nothing was queued. Report the message. The draft check comes first: a draft PR is refused with "PR is still a draft; run verification first" even when the branch also has unpushed commits, and only a ready PR gets the unpushed refusal, which names `df-tools gh pr sync <objective>`. A missing or stale verification, or unpushed commits, mean `gh pr sync` and the verification have to be redone (`verify_objective_goal`); do not retry the merge unchanged.
- Warnings (a kept branch, a skipped Project or local step) arrive on stderr with exit 0. Show them; do not swallow them.

Then reconcile:

```bash
node ~/.claude/devflow/bin/df-tools.cjs gh pr reconcile "${OBJECTIVE_NUMBER}"
```

Run it when the merge exited 3 (a merge queue) and the PR has landed, or when a human merged the PR on GitHub instead. It is idempotent, so running it twice is safe. Exit 0: reconciled. Exit 3: the PR is still open or a flush is pending, so run it again later. Exit 1: the PR was closed without merging; report it and do not mark anything done.

A dependent objective starts from the default branch, so merge (or reconcile) this PR before starting it.
</step>

<step name="offer_next">

**Exception:** If `gaps_found`, the `verify_objective_goal` step already presents the gap-closure path (`/devflow:plan-objective {X} --gaps`). No additional routing needed — skip auto-advance.

**Auto-advance detection:**

1. Parse `--auto` flag from $ARGUMENTS
2. Read `workflow.auto_advance` from config:
   ```bash
   AUTO_CFG=$(node ~/.claude/devflow/bin/df-tools.cjs config-get workflow.auto_advance 2>/dev/null || echo "false")
   ```

**If `--auto` flag present OR `AUTO_CFG` is true (AND verification passed with no gaps):**

```
╔══════════════════════════════════════════╗
║  AUTO-ADVANCING → TRANSITION             ║
║  Objective {X} verified, continuing chain    ║
╚══════════════════════════════════════════╝
```

Execute the transition workflow inline (do NOT use Task — orchestrator context is ~10-15%, transition needs objective completion data already in context):

Read and follow `~/.claude/devflow/workflows/transition.md`, passing through the `--auto` flag so it propagates to the next objective invocation.

**If neither `--auto` nor `AUTO_CFG` is true:**

The workflow ends. The user runs `/devflow:status` or invokes the transition workflow manually.
</step>

</process>

<context_efficiency>
Orchestrator: ~10-15% context. Subagents: fresh 200k each. No polling (Task blocks). No context bleed.
</context_efficiency>

<failure_handling>
- **classifyHandoffIfNeeded false failure:** Agent reports "failed" but error is `classifyHandoffIfNeeded is not defined` → Claude Code bug, not DevFlow. Spot-check (SUMMARY exists, commits present) → if pass, treat as success
- **Truncated executor (turn limit / partial result) → INCOMPLETE → SendMessage resume (≤3), never a failure.** Its dependents wait; they are never skipped (items 5c, 5d, 7)
- **Agent fails mid-plan:** Missing SUMMARY.md → classify first (5c). With COMMITS < TRD_TASKS it is INCOMPLETE, so resume it (5d). Otherwise, or once the resumes are spent, report and ask the user how to proceed
- **Dependency chain breaks:** Wave 1 fails → Wave 2 dependents likely fail → user chooses attempt or skip
- **All agents in wave fail:** Systemic issue → stop, report for investigation
- **Checkpoint unresolvable:** "Skip this job?" or "Abort objective execution?" → record partial progress in STATE.md
</failure_handling>

<resumption>
Re-run `/devflow:execute-objective {objective}` → discover_plans finds completed SUMMARYs → skips them → resumes from first incomplete plan → continues wave execution.

STATE.md tracks: last completed plan, current wave, pending checkpoints.
</resumption>
