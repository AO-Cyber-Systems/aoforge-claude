---
objective: 72-install-and-naming-cleanup
trd: "26"
type: standard
wave: 18
depends_on: ["72-25"]
files_modified:
  - "~/dev/devflow-claude -> ~/dev/aoforge-claude (moved by the user)"
  - "~/.claude/projects/-Users-justin-dev-aoforge-claude/memory/ (copied from the old key)"
  - "~/.claude/aoforge/state/** (repo-keyed entries copied to the new key)"
autonomous: false
requirements: [INST-06]
must_haves:
  truths:
    - "The checkout lives at `/Users/justin/dev/aoforge-claude` (moved by the user after approval), its worktrees are repaired, `origin` is the aoforge-claude URL, and the merge driver points at a path that exists"
    - "The Claude memory directory of the old path key was COPIED to the new key (old copy kept); MEMORY.md and every memory file are present under `~/.claude/projects/-Users-justin-dev-aoforge-claude/memory/`"
    - "`aof-tools state rekey --from /Users/justin/dev/devflow-claude` copied every repo-keyed runtime entry to the new key without deleting the old; the objective 72 run state under the new key has the same `started_at` recorded in 72-01, so `estimate finish 72` works from the new path (EST-11) when 72-01 recorded a run state; on the accepted-unscored path the SUMMARY records that there was none to carry"
    - "The commits made after the 3.0.0 merge (72-21's planning-tree move, 72-22's docs, the rollout SUMMARYs and state) are on a follow-up PR into main, opened only after the user approved the push and then, separately, the PR (both literal replies recorded), or the SUMMARY lists them as unmerged (`git log --oneline origin/main..feat/stack-profile-loader`) with the hold; it also states that later objective-completion commits ride the next PR"
    - "`aof-tools validate health` and `aof-tools doctor` in the new checkout report no W066/W067 and no repo-key or path errors"
  artifacts: []
  key_links:
    - from: "aof-tools state rekey (72-07)"
      to: "~/.claude/aoforge/state/estimates/<new key>.json"
      via: "copy from devflow-claude-d3dccfe9"
      pattern: "rekey"
---

# TRD 72-26: Move the local checkout to `~/dev/aoforge-claude` and carry its keyed state over (last)

<objective>
Rename the local checkout to match the repository. Claude Code cannot move the directory it is running in, so the user
moves it and restarts there. Everything keyed to the old path then has to follow: git worktrees, the merge driver, the
Claude memory directory, and AOForge's repo-keyed runtime state, which includes the run-state estimate EST-11 scores for
this very objective. This TRD runs last so the objective finishes in its final location.

Purpose: INST-06 (local checkout move with remote, memory and keyed state carried over).
Output: the moved checkout with its state intact; evidence in the SUMMARY.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
@.aoforge/objectives/72-install-and-naming-cleanup/72-01-SUMMARY.md

The old repo key is `devflow-claude-d3dccfe9` (basename slug + sha1 of the realpath). After the move the key becomes
`aoforge-claude-<8 hex>`; AOForge's estimate, awareness, hook-marker and backup stores look up the new key, so without
the rekey the 72 run state is invisible from the new path. The Claude projects directory key for a path replaces `/`
with `-`: `-Users-justin-dev-devflow-claude` -> `-Users-justin-dev-aoforge-claude`.

## Approval protocol

Human-action checkpoints for the move (Task 1) and for the follow-up push and PR (Task 3, two gates in sequence);
literal replies recorded; approvals never carry from one gate to the next. After the restart, Tasks 2-3 run in the new
session (the orchestrator re-spawns this TRD; Task 1 then finds the move `already done`). One plain command per Bash call.
Never port 8080.
</context>

<embedded_context>

<codebase_examples>
```bash
git -C /Users/justin/dev/aoforge-claude worktree repair
node ~/.claude/aoforge/bin/aof-tools.cjs state rekey --from /Users/justin/dev/devflow-claude --to /Users/justin/dev/aoforge-claude --dry-run --raw
node ~/.claude/aoforge/bin/aof-tools.cjs merge-driver install
```
</codebase_examples>

<anti_patterns>
- Never move the directory from inside the running session; never delete the old memory or state copies.
- Never overwrite a file that already exists under the new memory key or state key (the new session may have created
  some): copy only what is missing, and list conflicts.
- No symlink from the old path (it would keep two keys alive for the same checkout).
</anti_patterns>

<error_recovery>
- `git worktree list` shows prunable entries after repair: `git worktree prune` only for entries whose directories no
  longer exist; record them.
- A memory file exists in both keys with different content: keep the new one, record the old path in the SUMMARY.
- (Scored path) `estimate finish 72` cannot find the run: the rekey missed the estimates store; fix 72-07's KEYED_STATE entry in a
  gap TRD; do not hand-edit state.
</error_recovery>

</embedded_context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Approval gate: move the checkout to ~/dev/aoforge-claude and restart there</name>
  <files>(none: the user moves the directory)</files>
  <action>
Pre-checks: `pwd` (already `/Users/justin/dev/aoforge-claude` -> `already done`); `git -C /Users/justin/dev/devflow-claude
status --porcelain` (clean, else commit the executor's own bookkeeping first); `git ... worktree list`; `test ! -e
/Users/justin/dev/aoforge-claude`. If 72-01 recorded a run state, record its `started_at` from
`~/.claude/aoforge/state/estimates/devflow-claude-d3dccfe9.json`.

STOP and present: "Approve moving the checkout? Steps for you: quit Claude Code; run `mv ~/dev/devflow-claude
~/dev/aoforge-claude`; start Claude Code in ~/dev/aoforge-claude; run `/aoforge:execute-objective 72`. In the new session
I repair the worktrees, re-install the merge driver, copy the Claude memory directory to the new path key and copy the
repo-keyed AOForge state (including this objective's run-state estimate) to the new key. Nothing old is deleted. Reply
`moved` in the new session, or anything else to hold."
  </action>
  <instructions>Move the checkout yourself (Claude Code cannot move its own working directory), then resume here.</instructions>
  <verification>The new session's cwd is /Users/justin/dev/aoforge-claude.</verification>
  <resume-signal>Reply "moved" in the new session, or anything else to hold.</resume-signal>
  <verify>`pwd` prints /Users/justin/dev/aoforge-claude and `test ! -e /Users/justin/dev/devflow-claude`</verify>
  <done>Reply recorded; checkout moved (or held).</done>
</task>

<task type="auto">
  <name>Task 2: Carry the path-keyed state over and check the new location</name>
  <files>~/.claude/projects/-Users-justin-dev-aoforge-claude/memory/, ~/.claude/aoforge/state/**</files>
  <action>
One command per call: `git -C /Users/justin/dev/aoforge-claude worktree repair`; `git ... worktree list`;
`git ... remote get-url origin` (aoforge-claude); `aof-tools merge-driver install` then `--check`; copy memory with
`cp -Rn ~/.claude/projects/-Users-justin-dev-devflow-claude/memory/ ~/.claude/projects/-Users-justin-dev-aoforge-claude/memory/`
(no-clobber; list files that differed); `aof-tools state rekey --from /Users/justin/dev/devflow-claude --to
/Users/justin/dev/aoforge-claude --dry-run --raw`, review, then the same without `--dry-run`. Scored path (72-01
`run_state: recorded`): `node -e` on the new-key estimate file (objective 72, `started_at` = Task 1's record). Unscored
path: record `no run state (unscored)`.

Then the final checks: `aof-tools validate health --raw`; `aof-tools doctor --json` (project + global; record each
non-ok finding and whether it is expected, e.g. the old runtime home left in place); `aof-tools state load --raw`;
`ls ~/.claude/skills ~/.claude/agents` (no `df-*`); `git status --porcelain` (clean).
  </action>
  <verify>node ~/.claude/aoforge/bin/aof-tools.cjs validate health --raw</verify>
  <done>Memory and keyed state copied (scored path: the 72 run state is visible from the new path with its original start
time); no W066/W067, no path or key errors; leftovers recorded.</done>
  <recovery>See error_recovery; never delete the old copies. A code defect becomes a gap TRD.</recovery>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Approval gates (two, in sequence): push the post-release commits, then open the follow-up PR</name>
  <files>(none: live git push and GitHub PR; the PR body is drafted in a temp file)</files>
  <action>
The 3.0.0 PR merged in 72-20. Everything committed after it (72-21's planning-tree move, 72-22's docs, the rollout
SUMMARYs and state) sits on `feat/stack-profile-loader` unmerged. Pre-checks, one command per call:
`git -C /Users/justin/dev/aoforge-claude fetch origin`; `git -C ... log --oneline origin/main..feat/stack-profile-loader`
(the post-release commits; record them); `git -C ... merge-base --is-ancestor origin/feat/stack-profile-loader
feat/stack-profile-loader` (fast-forward); `gh pr list --repo AO-Cyber-Systems/aoforge-claude --head
feat/stack-profile-loader --base main --state open --json number,url` (adopt an open PR if one exists).
Idempotency: no commits ahead of origin/main -> record `nothing to merge` and finish.

Gate 1 (push). STOP and present: "Approve pushing the post-release commits? Command: `git -C
/Users/justin/dev/aoforge-claude push origin feat/stack-profile-loader`. It publishes N commits (the .aoforge move, the
AOForge docs, the rollout records) and runs CI on the branch. Nothing is merged. Reply `approved`, `done`, or anything else
to hold."

Gate 2 (PR), only after gate 1 is approved and verified, as a separate checkpoint: draft the body (what the N commits
are, that 3.0.0 already shipped in the earlier PR, the CI result; ends with `🤖 Generated with [Claude
Code](https://claude.com/claude-code)`), then STOP and present: "Approve opening the follow-up PR? Command: `gh pr create
--repo AO-Cyber-Systems/aoforge-claude --base main --head feat/stack-profile-loader --title "Post-release: AOForge
dogfood (.aoforge move, docs, rollout records)" --body-file <path>`. Nothing is merged; merging it is your call. Reply
`approved`, `done`, or anything else to hold." After creation, `gh pr checks <N> --repo AO-Cyber-Systems/aoforge-claude
--watch` (re-run on a Bash timeout) and record the result.

A hold at either gate: record `held at <push|PR> by user` and the unmerged commit list in the SUMMARY. Either way the
SUMMARY states that the objective-completion commits made after this TRD (VERIFICATION, final state) are not in this PR
and ride the next one. Never force-push, never merge, never `--tags`.
  </action>
  <instructions>The rename's own dogfood commits landed after the 3.0.0 merge; a follow-up PR brings them to main. Two
approvals: push, then PR.</instructions>
  <verification>origin/feat/stack-profile-loader == the local head; PR N open against main with its checks recorded; or
the hold and the unmerged commit list are recorded.</verification>
  <resume-signal>Reply "approved" (I run the gate's command), "done" (you did), or anything else to hold.</resume-signal>
  <verify>`gh pr view <N> --repo AO-Cyber-Systems/aoforge-claude --json state,baseRefName,headRefOid` shows OPEN, base main, headRefOid == the pushed head (or the SUMMARY records the hold and `git log --oneline origin/main..feat/stack-profile-loader`)</verify>
  <done>Both replies recorded: the follow-up PR is open (URL in the SUMMARY), or the unmerged state is recorded
explicitly.</done>
</task>

</tasks>

<verification>
- Scored path: `node ~/.claude/aoforge/bin/aof-tools.cjs estimate objective 72 --line --raw` works from
  `/Users/justin/dev/aoforge-claude`.
- The follow-up PR URL (or the recorded hold with the unmerged commit list) is in the SUMMARY.
- `ls ~/.claude/projects/-Users-justin-dev-aoforge-claude/memory/MEMORY.md` exists.
</verification>

<success_criteria>
- The checkout is `~/dev/aoforge-claude` with git, memory and AOForge state intact, and objective 72 can finish there.
</success_criteria>

<output>
After completion, create `72-26-SUMMARY.md` in the objective directory through `aof-tools summary post`.
</output>
