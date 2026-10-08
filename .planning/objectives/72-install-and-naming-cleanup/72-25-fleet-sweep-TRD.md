---
objective: 72-install-and-naming-cleanup
trd: "25"
type: standard
wave: 15
depends_on: ["72-24"]
files_modified:
  - "fleet repositories under ~/dev (their .planning/ -> .aoforge/, config, CLAUDE.md block), each after its own approval"
autonomous: false
requirements: [INST-04, INST-06]
must_haves:
  truths:
    - "Every fleet repository under ~/dev that uses DevFlow (a git work tree, not a worktree directory, with a top-level legacy planning directory or a legacy stamp) is listed with its pending migrations, tree state, planning mode and, for store mode, the `gh rebrand` dry-run counts"
    - "Each repository was upgraded only after its own checkpoint was approved (one checkpoint per repository, literal reply recorded); an approved local-mode repository ends on `.aoforge/` with the AOForge stamp key and its CLAUDE.md block migrated, committed locally in that repository; nothing was pushed"
    - "For an approved store-mode repository, `gh rebrand --apply` ran only if the reply approved it (separately named in that repository's checkpoint), and the local change's commit steps (linked branch + PR) were shown, not run without approval"
    - "A dirty or mid-operation repository was not touched (recorded `skipped: <reason>`); a declined repository was not touched (recorded `held by user`)"
    - "`aof-tools validate health` in each upgraded repository reports no W066/W067"
  artifacts: []
  key_links:
    - from: "aof-tools upgrade --apply --path <repo>"
      to: "migrations 0012/0013/0014 (72-08, 72-09) and 0007 (72-13)"
      via: "the same runner the SessionStart hook uses"
      pattern: "upgrade --apply"
---

# TRD 72-25: Fleet sweep: upgrade every DevFlow repository to AOForge, one approval per repository

<objective>
Run the AOForge upgrade across every fleet repository already using DevFlow (devflowops and the other AOCyber repos),
inside 72, with one checkpoint per repository. Local changes are committed in each repository and never pushed; store-mode
repositories additionally get the GitHub rebrand only when that repository's approval names it.

Purpose: INST-06 (fleet sweep) and INST-04 in the field.
Output: a per-repository record in the SUMMARY.
</objective>

<execution_context>
@~/.claude/aoforge/workflows/execute-trd.md
@~/.claude/aoforge/templates/summary.md
</execution_context>

<context>
At planning, `~/dev/*/.planning/` existed in: devflowops, aodex, aocore, opsCluster, eden-biz, politihub, aoedge (more
may exist; Task 1 discovers them). `~/dev` also holds worktree directories (names containing `-wt-`, or a `.git` FILE)
and gitops release copies (`gitops-v1.1.*`): exclude worktree directories and non-repositories; list anything
ambiguous for the user rather than guessing. This repository is excluded (72-21 migrated it).

## Approval protocol (per repository)

Human-action checkpoints; literal replies recorded; one plain command per Bash call; never port 8080; nothing is pushed
to any remote. Task 2 is a repeated checkpoint: one per repository, in Task 1's order. Each continuation applies the
repository just approved, records it with `aof-tools summary checkpoint`, then returns the next repository's checkpoint.
</context>

<embedded_context>

<codebase_examples>
```bash
node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --check --path <repo> --raw
node ~/.claude/aoforge/bin/aof-tools.cjs --cwd <repo> config-get github.store
node ~/.claude/aoforge/bin/aof-tools.cjs --cwd <repo> gh rebrand            # dry run (store mode only)
node ~/.claude/aoforge/bin/aof-tools.cjs upgrade --apply --path <repo> --raw
node ~/.claude/aoforge/bin/aof-tools.cjs --cwd <repo> commit "chore: move to AOForge (3.0.0 upgrade)" --files <changed_files>
```
</codebase_examples>

<anti_patterns>
- One approval covering several repositories. One checkpoint, one reply, one repository.
- `confirm`-safety migrations (0006 kind, 0010/0011 store) are not part of this sweep unless the checkpoint names them.
- Pushing, opening PRs, or running store-mode commit steps on a protected/default branch without approval.
- Touching a dirty or mid-merge repository.
</anti_patterns>

<error_recovery>
- `upgrade --apply` defers 0012 (dirty): record `skipped: dirty`, offer `retry` after the user cleans it.
- The commit gate refuses (store mode, default branch): show the printed branch + PR steps and record `local change
  left uncommitted, steps shown`.
- `gh rebrand --apply` stops mid-way: record its done/left report; re-running resumes (72-16).
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: Discover the fleet and preview each repository</name>
  <files>(none: read-only across ~/dev)</files>
  <action>
List candidates: for each directory in `~/dev` (one `ls` call, then one check per candidate) keep those with a `.git`
DIRECTORY and a top-level legacy planning directory or `.aoforge/` with a legacy stamp; drop `-wt-` names and this
repository. For each, one command at a time: `upgrade --check --path`, `git -C <repo> status --porcelain | head -5`,
`git -C <repo> rev-parse --abbrev-ref HEAD`, store mode, and for store mode the `gh rebrand` dry-run counts. Record a
table (repo, branch, clean?, mode, pending migrations, rebrand counts) with `aof-tools summary checkpoint`.
  </action>
  <verify>The checkpoint SUMMARY contains one row per discovered repository.</verify>
  <done>The fleet table exists; ambiguous directories are listed for the user.</done>
  <recovery>If `upgrade --check --path` fails on a repo, record the error in its row and mark it `needs attention`.</recovery>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 2: Approval gate, once per repository: upgrade it (and, for store mode, rebrand it)</name>
  <files>(each approved fleet repository)</files>
  <action>
For the next repository in the table: if dirty or mid-operation, record `skipped: <reason>` and move on. Otherwise STOP
and present its row and: "Approve upgrading <repo>? Commands: `aof-tools upgrade --apply --path <repo>` then
`aof-tools --cwd <repo> commit "chore: move to AOForge (3.0.0 upgrade)" --files <changed_files>` (local commit only,
nothing pushed)." For store mode add: "Separately, approve `aof-tools --cwd <repo> gh rebrand --apply` (renames N labels,
M issues, ... as previewed)? Reply `approved` (both), `local-only`, or anything else to hold this repository."

On approval run exactly what was approved, record the outcome with `summary checkpoint`, then return the next
repository's checkpoint until the table is done.
  </action>
  <instructions>One repository at a time; local commits only; GitHub changes only when you say so for that repository.</instructions>
  <verification>Per repository: `.aoforge/` present, AOForge stamp, one local commit; store mode: rebrand report if approved.</verification>
  <resume-signal>Reply "approved", "local-only", or anything else to hold this repository.</resume-signal>
  <verify>For each approved repo: `git -C <repo> log -1 --format=%s` is the upgrade commit and `test -d <repo>/.aoforge`</verify>
  <done>Every repository has an outcome: upgraded, upgraded+rebranded, skipped (reason) or held.</done>
</task>

<task type="auto">
  <name>Task 3: Verify the upgraded repositories</name>
  <files>(none: read-only)</files>
  <action>
For each upgraded repository: `aof-tools --cwd <repo> validate health --raw` (no W066/W067), `git -C <repo> status
--porcelain` (clean), and for rebranded store repositories `aof-tools --cwd <repo> gh rebrand` (dry run reports nothing
left). Record the final table in the SUMMARY with a reminder that pushing is the user's step.
  </action>
  <verify>The final table shows every upgraded repository clean and W066/W067-free.</verify>
  <done>The sweep is recorded; nothing was pushed.</done>
  <recovery>A repo failing verification: record it and file a todo naming the repo and the finding.</recovery>
</task>

</tasks>

<verification>
- The SUMMARY's final table covers every discovered repository with an outcome and the approval reply.
</verification>

<success_criteria>
- Each fleet repository that the user approved now runs on AOForge, and nothing changed without its own approval.
</success_criteria>

<output>
After completion, create `72-25-SUMMARY.md` in the objective directory through `aof-tools summary post`.
</output>
