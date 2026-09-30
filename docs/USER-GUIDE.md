# DevFlow User Guide

A detailed reference for workflows, troubleshooting, and configuration. For quick-start setup, see the [README](../README.md).

---

## Table of Contents

- [Workflow Diagrams](#workflow-diagrams)
- [Command Reference](#command-reference)
- [Configuration Reference](#configuration-reference)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Recovery Quick Reference](#recovery-quick-reference)

---

## Workflow Diagrams

### Full Project Lifecycle

```
  ┌──────────────────────────────────────────────────┐
  │                   NEW PROJECT                    │
  │  /devflow:new-project                                │
  │  Questions -> Research -> Requirements -> Roadmap│
  └─────────────────────────┬────────────────────────┘
                            │
             ┌──────────────▼─────────────┐
             │      FOR EACH PHASE:       │
             │                            │
             │  ┌────────────────────┐    │
             │  │ /devflow:discuss-objective │    │  <- Lock in preferences
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /devflow:plan-objective    │    │  <- Research + Plan + Verify
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /devflow:execute-objective │    │  <- Parallel execution
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /devflow:verify-work   │    │  <- Manual UAT
             │  └──────────┬─────────┘    │
             │             │              │
             │     Next Objective?────────────┘
             │             │ No
             └─────────────┼──────────────┘
                            │
            ┌───────────────▼──────────────┐
            │  /devflow:milestone audit        │
            │  /devflow:milestone complete     │
            └───────────────┬──────────────┘
                            │
                   Another milestone?
                       │          │
                      Yes         No -> Done!
                       │
               ┌───────▼──────────────┐
               │  /devflow:milestone new  │
               └──────────────────────┘
```

### Planning Agent Coordination

```
  /devflow:plan-objective N
         │
         ├── Objective Researcher (x4 parallel)
         │     ├── Stack researcher
         │     ├── Features researcher
         │     ├── Architecture researcher
         │     └── Pitfalls researcher
         │           │
         │     ┌──────▼──────┐
         │     │ RESEARCH.md │
         │     └──────┬──────┘
         │            │
         │     ┌──────▼──────┐
         │     │   Planner   │  <- Reads PROJECT.md, REQUIREMENTS.md,
         │     │             │     CONTEXT.md, RESEARCH.md
         │     └──────┬──────┘
         │            │
         │     ┌──────▼───────────┐     ┌────────┐
         │     │   Plan Checker   │────>│ PASS?  │
         │     └──────────────────┘     └───┬────┘
         │                                  │
         │                             Yes  │  No
         │                              │   │   │
         │                              │   └───┘  (loop, up to 3x)
         │                              │
         │                        ┌─────▼──────┐
         │                        │ JOB files  │
         │                        └────────────┘
         └── Done
```

### Execution Wave Coordination

```
  /devflow:execute-objective N
         │
         ├── Analyze plan dependencies
         │
         ├── Wave 1 (independent plans):
         │     ├── Executor A (fresh 200K context) -> commit
         │     └── Executor B (fresh 200K context) -> commit
         │
         ├── Wave 2 (depends on Wave 1):
         │     └── Executor C (fresh 200K context) -> commit
         │
         └── Verifier
               └── Check codebase against objective goals
                     │
                     ├── PASS -> VERIFICATION.md (success)
                     └── FAIL -> Issues logged for /devflow:verify-work
```

### Brownfield Workflow (Existing Codebase)

```
  /devflow:map-codebase
         │
         ├── Stack Mapper     -> codebase/STACK.md
         ├── Arch Mapper      -> codebase/ARCHITECTURE.md
         ├── Convention Mapper -> codebase/CONVENTIONS.md
         └── Concern Mapper   -> codebase/CONCERNS.md
                │
        ┌───────▼──────────┐
        │ /devflow:new-project │  <- Questions focus on what you're ADDING
        └──────────────────┘

  (Fully unattended instead? /devflow:adopt scaffolds the same brownfield
   project without asking anything -- see "Adopting an Existing Repo" below.)
```

---

## Command Reference

### Core Workflow

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:new-project` | Full project init: questions, research, requirements, roadmap | Start of a new project |
| `/devflow:new-project --auto @idea.md` | Automated init from document | Have a PRD or idea doc ready |
| `/devflow:discuss-objective <N>` | Capture implementation decisions before planning | Lock in preferences so research/planning don't drift |
| `/devflow:plan-objective [N]` | Research + plan + verify | Before executing an objective |
| `/devflow:execute-objective <N>` | Execute all jobs in parallel waves | After planning is complete |
| `/devflow:build <N>` | End-to-end: plan → execute → verify in one command | Confident objective, want single-command flow |
| `/devflow:verify-work [N]` | Manual UAT with auto-diagnosis | After execution completes |
| `/devflow:milestone audit` | Verify milestone met its definition of done | Before completing milestone |
| `/devflow:milestone complete` | Archive milestone, tag release | All objectives verified |
| `/devflow:milestone new [name]` | Start next version cycle | After completing a milestone |

### Navigation

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:status` | Show status and next steps | Anytime -- "where am I?" |
| `/devflow:status resume` | Restore full context from last session | Starting a new session |
| `/devflow:status pause` | Save context handoff | Stopping mid-objective |
| `/devflow:help` | Show all commands | Quick reference |

### Objective Management

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:objective add` | Append new objective to roadmap | Scope grows after initial planning |
| `/devflow:objective remove [N]` | Remove future objective and renumber | Descoping a feature |
| `/devflow:list-objective-assumptions [N]` | Preview Claude's intended approach | Before planning, to validate direction |
| `/devflow:milestone gaps` | Create objectives for audit gaps | After audit finds missing items |
| `/devflow:research-objective [N]` | Deep ecosystem research only | Complex or unfamiliar domain |

### Brownfield & Utilities

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:map-codebase` | Analyze existing codebase | Before `/devflow:new-project` on existing code |
| `/devflow:adopt [path]` | Unattended DevFlow bootstrap for an existing repo (or `[path]`) | Turn a brownfield repo into a DevFlow project without answering questions |
| `/devflow:security-audit` | OWASP Top 10 scan with confidence tagging | Before a release or after auth/crypto changes |
| `/devflow:quick` | Ad-hoc task with DevFlow guarantees | Bug fixes, small features, config changes |
| `/devflow:debug [desc]` | Systematic debugging with persistent state | When something breaks |
| `/devflow:todo add [desc]` | Capture an idea for later | Think of something during a session |
| `/devflow:todo list` | List pending todos | Review captured ideas |
| `/devflow:settings` | Configure workflow toggles and model profile | Change model, toggle agents |
| `/devflow:set-profile <profile>` | Quick profile switch | Change cost/quality tradeoff |
| `/devflow:cleanup` | Archive completed debug sessions, prune stale files | Periodic maintenance |
| `/devflow:status check [--migrate]` | Validate `.planning/` integrity and fix issues; `--migrate` upgrades the project in place (runs `df-tools upgrade`) | Planning files feel stale or corrupt, after a DevFlow update, or when `validate health` reports W040 |
| `/devflow:doctor [--fix] [--global] [path]` | Diagnose the DevFlow environment (runtime mirror, plugin cache, hooks, runtime state inside the repo, stale markers and backups); read-only unless `--fix`, which applies only safe, reversible repairs | DevFlow behaves oddly, after a plugin update, or a repo shows `.planning` runtime files changing |

### Adopting an Existing Repo (`/devflow:adopt`)

`/devflow:adopt [path]` turns an existing codebase into a DevFlow project fully unattended -- it
never asks a question. The target is the current directory, or `[path]` if given.

**What it does:** maps the codebase (`map-codebase` in non-interactive mode), infers `PROJECT.md`
(What This Is, Core Value, validated requirements, `kind` + `default_work` with confidence) and
`STACK.md` from the code, scaffolds `.planning/` (config, STATE, `state.json`, an empty-current-
milestone ROADMAP), adds the versioned CLAUDE.md managed block, stamps the version, and writes
`.planning/ADOPT-REPORT.md` listing every low-confidence inference for you to review. Everything
lands as **one signed commit on a new `devflow/adopt` branch, which is never pushed**. Re-running
`/devflow:adopt` on a half-finished adopt resumes rather than duplicating.

**Routing by repo state**, decided before anything is written:
- Already a DevFlow project (`.planning/` present) -> routed to `upgrade` (see below); never
  re-scaffolded.
- Empty or greenfield repo -> reports that and points you at `/devflow:new-project`.
- Existing codebase -> the adopt pipeline described above.

**Refusal rules.** It refuses, and touches nothing, when the target is: a dirty working tree, a
repo mid-rebase/merge, a detached HEAD, or a path that isn't a git repository at all. It names the
reason and stops -- it never stashes or resets your work.

Under the hood: `df-tools adopt preflight|begin|scaffold|report` (the deterministic half) plus the
global `df-tools --cwd <dir>` flag so the CLI can target `[path]` from anywhere. Implemented in
`lib/adopt.cjs`, `lib/adopt-cli.cjs` and `lib/repo-state.cjs`.

### Upgrading a Project in Place (`df-tools upgrade`)

When DevFlow updates, projects upgrade themselves. The `upgrade-project.js` SessionStart hook checks whether the project is behind the running version, applies the safe (`auto`) migrations, and commits **exactly the files they changed** in a detached background process, so session start never waits on commit signing. It does not commit during a rebase, merge, cherry-pick or bisect, on a detached HEAD, when a changed file already had uncommitted edits, or when signing fails. In those cases the change stays applied but uncommitted, and a one-line notice appears on your next prompt. Signing is never bypassed. Set `DEVFLOW_SKIP_UPGRADE=1` to turn it off.

You can also run it by hand:

```bash
node ~/.claude/devflow/bin/df-tools.cjs upgrade --check          # what would change (the default)
node ~/.claude/devflow/bin/df-tools.cjs upgrade --apply          # apply the auto migrations
node ~/.claude/devflow/bin/df-tools.cjs upgrade --apply --only 0006 --kind plugin   # a confirm migration
node ~/.claude/devflow/bin/df-tools.cjs upgrade --global         # preview the ~/.claude upgrade
node ~/.claude/devflow/bin/df-tools.cjs upgrade --global --confirm   # adopt the managed ~/.claude/CLAUDE.md block
```

- **Migrations** live in `lib/migrations/NNNN-*.cjs`. Each one detects its own target, so they are safe to re-run: a second `--apply` does nothing. The current set:

  | Id | Migration | Safety |
  |---|---|---|
  | 0001 | Normalise `.planning/config.json` to the nested template shape | auto |
  | 0002 | Rename legacy `*-JOB.md` to `*-TRD.md` | auto |
  | 0003 | Seed `.planning/state.json` from STATE.md | auto |
  | 0004 | Backfill `OBJECTIVE.md` for NN-named objective dirs | auto |
  | 0005 | Refresh an existing CLAUDE.md DevFlow block (never adds one) | auto |
  | 0006 | Set PROJECT.md `kind` / `default_work` | confirm |

  `confirm` migrations run only when you name them with `--only <id>` or pass `--apply --confirm`.
- **Stamp.** `.planning/config.json` records `devflow{version, migrations_applied, upgraded_at}`. `validate health` reports **W040** when the project is behind.
- **Backups** go outside the repo, to `~/.claude/devflow/backups/<repo>-<hash>/<timestamp>/`, before anything is written.
- **Global.** After each successful runtime mirror, `sync-runtime.js` runs the global upgrade. It moves legacy `~/.claude/skills/df-*`, `~/.claude/agents/df-*` and `~/.claude/devflow/VERSION` into a backup (it moves them, never deletes them). It also keeps a versioned `<!-- DEVFLOW:START v=… src=… -->` block in `~/.claude/CLAUDE.md` current, and never touches text outside the markers. If you already have a hand-written DevFlow section, you get a notice and nothing changes until you run `upgrade --global --confirm`.
- **Backup pruning.** DevFlow installs no scheduler of its own -- pruning runs from the `upgrade-project.js` SessionStart path, throttled to once per 24 hours by a last-prune timestamp. The default policy keeps backups younger than 14 days, and always keeps the newest 5 per repo. It's configurable in `~/.claude/devflow/global-config.json`: `backups.retain_days` and `backups.keep_min`. Run it by hand (or preview it) with `node ~/.claude/devflow/bin/df-tools.cjs upgrade --prune [--dry-run]`; register a repo for pruning without a full upgrade with `upgrade --register`. Both `/devflow:adopt` and `/devflow:new-project` register the repo automatically. Skip pruning entirely with `DEVFLOW_SKIP_PRUNE=1`. If you want an OS-level schedule instead of the once-per-session throttle, add your own cron line, e.g. `0 3 * * * node ~/.claude/devflow/bin/df-tools.cjs upgrade --prune` -- this is opt-in and entirely user-owned; DevFlow never installs it for you.

### Integration & Release (1.28+)

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:gh-sync [objectives\|release <tag>\|status]` | Mirror planning state to GitHub issues/releases | After `new-project`, or manually when GH drifts |
| `/devflow:workstreams [analyze\|provision\|reconcile]` | Parallel git worktrees for independent objectives | Multi-objective parallelism across worktrees |
| `df-tools stack init\|validate\|resolve\|context\|command` | Declare and check the project stack profile (`.planning/STACK.md`) | After map-codebase, or when CI commands change |

---

## Configuration Reference

DevFlow stores project settings in `.planning/config.json`. Configure during `/devflow:new-project` or update later with `/devflow:settings`.

### Full config.json Schema

```json
{
  "mode": "yolo",
  "depth": "standard",
  "model_profile": "balanced",
  "workflow": {
    "research": true,
    "job_check": true,
    "verifier": true,
    "auto_advance": true
  },
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "parallelization": {
    "enabled": true,
    "job_level": true,
    "task_level": false,
    "skip_checkpoints": true,
    "max_concurrent_agents": 3,
    "min_jobs_for_parallel": 2
  },
  "gates": {
    "require_verification": true,
    "require_tests": true,
    "confirm_project": true,
    "confirm_objectives": true,
    "confirm_roadmap": true,
    "confirm_breakdown": true,
    "confirm_job": true,
    "execute_next_job": true,
    "issues_review": true,
    "confirm_transition": true
  },
  "safety": {
    "always_confirm_destructive": true,
    "always_confirm_external_services": true
  },
  "workstreams": {
    "worktree_prefix": "../{project}-ws-",
    "branch_prefix": "df/ws-",
    "merge_strategy": "squash"
  },
  "github": {
    "enabled": false,
    "repo": "",
    "milestone_prefix": "v",
    "labels": {
      "objective": "devflow:objective",
      "in_progress": "devflow:in-progress",
      "gaps": "devflow:gaps"
    }
  }
}
```

### Core Settings

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `mode` | `interactive`, `yolo` | `yolo` | `yolo` auto-approves; `interactive` confirms at every gate |
| `depth` | `quick`, `standard`, `comprehensive` | `standard` | Planning thoroughness: 3-5, 5-8, or 8-12 objectives |
| `model_profile` | `quality`, `balanced`, `budget` | `balanced` | Model tier for each agent (see table below) |

### Planning Settings

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `planning.commit_docs` | `true`, `false` | `true` | Whether `.planning/` files are committed to git |
| `planning.search_gitignored` | `true`, `false` | `false` | Add `--no-ignore` to broad searches to include `.planning/` |

> **Note:** If `.planning/` is in `.gitignore`, `commit_docs` is automatically `false` regardless of the config value.

### Workflow Toggles

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `workflow.research` | `true`, `false` | `true` | Domain investigation before planning |
| `workflow.job_check` | `true`, `false` | `true` | Plan verification loop (up to 3 iterations) |
| `workflow.verifier` | `true`, `false` | `true` | Post-execution verification against objective goals |

Disable these to speed up objectives in familiar domains or when conserving tokens.

### Parallelization

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `parallelization.enabled` | `true`, `false` | `true` | Master switch for wave-based parallelism |
| `parallelization.job_level` | `true`, `false` | `true` | Run independent jobs concurrently in fresh contexts |
| `parallelization.task_level` | `true`, `false` | `false` | Split a single job's tasks across subagents (advanced) |
| `parallelization.skip_checkpoints` | `true`, `false` | `true` | Skip user confirmation between parallel waves |
| `parallelization.max_concurrent_agents` | integer | `3` | Cap on simultaneous subagents |
| `parallelization.min_jobs_for_parallel` | integer | `2` | Minimum independent jobs needed before parallelism kicks in |

### Gates

Fine-grained approval gates for interactive mode. Each defaults to `true`. Set to `false` to skip the corresponding confirmation.

| Gate | What it Confirms |
|---|---|
| `gates.require_verification` | Verifier must run before marking objective done |
| `gates.require_tests` | Plans must include test tasks |
| `gates.confirm_project` | PROJECT.md approval |
| `gates.confirm_objectives` | Objective list approval |
| `gates.confirm_roadmap` | Full ROADMAP.md approval |
| `gates.confirm_breakdown` | Task breakdown within a job |
| `gates.confirm_job` | JOB.md approval |
| `gates.execute_next_job` | Between-job confirmations |
| `gates.issues_review` | Pause on verification gaps before replan |
| `gates.confirm_transition` | Cross-objective transitions |

### Safety

| Setting | Default | What it Controls |
|---|---|---|
| `safety.always_confirm_destructive` | `true` | Confirm before `rm -rf`, `git reset --hard`, `DROP TABLE`, etc. |
| `safety.always_confirm_external_services` | `true` | Confirm before sending emails, posting to Slack, pushing to remotes |

### Workstreams

Parallel git worktrees for working on multiple objectives simultaneously. See `/devflow:workstreams`.

| Setting | Default | What it Controls |
|---|---|---|
| `workstreams.worktree_prefix` | `"../{project}-ws-"` | Path template for provisioned worktrees |
| `workstreams.branch_prefix` | `"df/ws-"` | Branch name prefix for worktream branches |
| `workstreams.merge_strategy` | `"squash"` | `squash`, `merge`, or `rebase` on reconcile |

### GitHub Integration (1.29+)

Opt-in mirror of planning state to GitHub issues + releases. See the **GitHub integration** section below for the full flow.

| Setting | Default | What it Controls |
|---|---|---|
| `github.enabled` | `false` | Master switch |
| `github.repo` | `""` | Target repo as `"owner/name"` |
| `github.milestone_prefix` | `"v"` | Prepended to roadmap version for milestone title |
| `github.labels.objective` | `"devflow:objective"` | Label applied to synced issues |
| `github.labels.in_progress` | `"devflow:in-progress"` | Label during execution |
| `github.labels.gaps` | `"devflow:gaps"` | Label when verifier finds gaps |

### Git Branching

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `git.branching_strategy` | `none`, `objective`, `milestone` | `none` | When and how branches are created |
| `git.objective_branch_template` | Template string | `df/objective-{objective}-{slug}` | Branch name for objective strategy |
| `git.milestone_branch_template` | Template string | `df/{milestone}-{slug}` | Branch name for milestone strategy |

**Branching strategies explained:**

| Strategy | Creates Branch | Scope | Best For |
|----------|---------------|-------|----------|
| `none` | Never | N/A | Solo development, simple projects |
| `objective` | At each `execute-objective` | One objective per branch | Code review per objective, granular rollback |
| `milestone` | At first `execute-objective` | All objectives share one branch | Release branches, PR per version |

**Template variables:** `{objective}` = zero-padded number (e.g., "03"), `{slug}` = lowercase hyphenated name, `{milestone}` = version (e.g., "v1.0").

### Model Profiles (Per-Agent Breakdown)

| Agent | `quality` | `balanced` | `budget` |
|-------|-----------|------------|----------|
| df-planner | Opus | Opus | Sonnet |
| df-roadmapper | Opus | Sonnet | Sonnet |
| df-executor | Opus | Sonnet | Sonnet |
| df-objective-researcher | Opus | Sonnet | Haiku |
| df-project-researcher | Opus | Sonnet | Haiku |
| df-research-synthesizer | Sonnet | Sonnet | Haiku |
| df-debugger | Opus | Sonnet | Sonnet |
| df-codebase-mapper | Sonnet | Haiku | Haiku |
| df-verifier | Sonnet | Sonnet | Haiku |
| df-job-checker | Sonnet | Sonnet | Haiku |
| df-integration-checker | Sonnet | Sonnet | Haiku |
| df-security-auditor | Opus | Sonnet | Sonnet |

**Profile philosophy:**
- **quality** -- Opus for all decision-making agents, Sonnet for read-only verification. Use when quota is available and the work is critical.
- **balanced** -- Opus only for planning (where architecture decisions happen), Sonnet for everything else. The default for good reason.
- **budget** -- Sonnet for anything that writes code, Haiku for research and verification. Use for high-volume work or less critical objectives.

---

## Usage Examples

### New Project (Full Cycle)

```bash
claude --dangerously-skip-permissions
/devflow:new-project            # Answer questions, configure, approve roadmap
/clear
/devflow:discuss-objective 1        # Lock in your preferences
/devflow:plan-objective 1           # Research + plan + verify
/devflow:execute-objective 1        # Parallel execution
/devflow:verify-work 1          # Manual UAT
/clear
/devflow:discuss-objective 2        # Repeat for each objective
...
/devflow:milestone audit        # Check everything shipped
/devflow:milestone complete     # Archive, tag, done
```

### New Project from Existing Document

```bash
/devflow:new-project --auto @prd.md   # Auto-runs research/requirements/roadmap from your doc
/clear
/devflow:discuss-objective 1               # Normal flow from here
```

### Existing Codebase

```bash
/devflow:adopt                  # Unattended: maps, infers PROJECT.md/STACK.md, scaffolds, commits
# (normal objective workflow from here -- or, for a manual walkthrough instead:)
/devflow:map-codebase           # Analyze what exists (parallel agents)
/devflow:new-project            # Questions focus on what you're ADDING
```

### Quick Bug Fix

```bash
/devflow:quick
> "Fix the login button not responding on mobile Safari"
```

### Resuming After a Break

```bash
/devflow:status                 # See where you left off and what's next
# or
/devflow:status resume          # Full context restoration from last session
```

### Preparing for Release

```bash
/devflow:milestone audit        # Check requirements coverage, detect stubs
/devflow:milestone gaps         # If audit found gaps, create objectives to close them
/devflow:milestone complete     # Archive, tag, done
```

### Speed vs Quality Presets

| Scenario | Mode | Depth | Profile | Research | Plan Check | Verifier |
|----------|------|-------|---------|----------|------------|----------|
| Prototyping | `yolo` | `quick` | `budget` | off | off | off |
| Normal dev | `interactive` | `standard` | `balanced` | on | on | on |
| Production | `interactive` | `comprehensive` | `quality` | on | on | on |

### Mid-Milestone Scope Changes

```bash
/devflow:objective add              # Append a new objective to the roadmap
# or
/devflow:objective remove 7         # Descope objective 7 and renumber
```

---

## Troubleshooting

### "Project already initialized"

You ran `/devflow:new-project` but `.planning/PROJECT.md` already exists. This is a safety check. If you want to start over, delete the `.planning/` directory first.

### Context Degradation During Long Sessions

Clear your context window between major commands: `/clear` in Claude Code. DevFlow is designed around fresh contexts -- every subagent gets a clean 200K window. If quality is dropping in the main session, clear and use `/devflow:status resume` or `/devflow:status` to restore state.

### Plans Seem Wrong or Misaligned

Run `/devflow:discuss-objective [N]` before planning. Most plan quality issues come from Claude making assumptions that `CONTEXT.md` would have prevented. You can also run `/devflow:list-objective-assumptions [N]` to see what Claude intends to do before committing to a plan.

### Execution Fails or Produces Stubs

Check that the plan was not too ambitious. Plans should have 2-3 tasks maximum. If tasks are too large, they exceed what a single context window can produce reliably. Re-plan with smaller scope.

### Lost Track of Where You Are

Run `/devflow:status`. It reads all state files and tells you exactly where you are and what to do next.

### Need to Change Something After Execution

Do not re-run `/devflow:execute-objective`. Use `/devflow:quick` for targeted fixes, or `/devflow:verify-work` to systematically identify and fix issues through UAT.

### Model Costs Too High

Switch to budget profile: `/devflow:set-profile budget`. Disable research and plan-check agents via `/devflow:settings` if the domain is familiar to you (or to Claude).

### Working on a Sensitive/Private Project

Set `commit_docs: false` during `/devflow:new-project` or via `/devflow:settings`. Add `.planning/` to your `.gitignore`. Planning artifacts stay local and never touch git.

### Updating DevFlow

DevFlow updates through the Claude Code plugin marketplace (`/plugin`), and `/devflow:status check --migrate` brings a project forward.

### Subagent Appears to Fail but Work Was Done

A known workaround exists for a Claude Code classification bug. DevFlow's orchestrators (execute-objective, quick) spot-check actual output before reporting failure. If you see a failure message but commits were made, check `git log` -- the work may have succeeded.

---

## Recovery Quick Reference

| Problem | Solution |
|---------|----------|
| Lost context / new session | `/devflow:status resume` or `/devflow:status` |
| Phase went wrong | `git revert` the objective commits, then re-plan |
| Need to change scope | `/devflow:objective add` or `/devflow:objective remove` |
| Milestone audit found gaps | `/devflow:milestone gaps` |
| Something broke | `/devflow:debug "description"` |
| DevFlow itself misbehaves, or runtime files keep dirtying a repo | `/devflow:doctor` (add `--fix` to apply the safe repairs) |
| Quick targeted fix | `/devflow:quick` |
| Plan doesn't match your vision | `/devflow:discuss-objective [N]` then re-plan |
| Costs running high | `/devflow:set-profile budget` and `/devflow:settings` to toggle agents off |

---

## Project File Structure

For reference, here is what DevFlow creates in your project:

```
.planning/
  PROJECT.md              # Project vision and context (always loaded)
  REQUIREMENTS.md         # Scoped v1/v2 requirements with IDs
  ROADMAP.md              # Objective breakdown with status tracking
  STATE.md                # Decisions, blockers, session memory
  config.json             # Workflow configuration
  MILESTONES.md           # Completed milestone archive
  research/               # Domain research from /devflow:new-project
  todos/
    pending/              # Captured ideas awaiting work
    done/                 # Completed todos
  debug/                  # Active debug sessions
    resolved/             # Archived debug sessions
  codebase/               # Brownfield codebase mapping (from /devflow:map-codebase)
  objectives/
    XX-objective-name/
      XX-YY-JOB.md       # Atomic execution plans
      XX-YY-SUMMARY.md    # Execution outcomes and decisions
      CONTEXT.md          # Your implementation preferences
      RESEARCH.md         # Ecosystem research findings
      VERIFICATION.md     # Post-execution verification results
```

---

## Hooks and what they enforce

DevFlow installs hooks into Claude Code's `settings.json`. Hooks run in a separate process, get the tool call as JSON on stdin, and can inject context, warn the user, or block tool execution. They are how DevFlow turns advisory rules into actually-enforced ones.

| Hook | Event | What it does | Escape hatch |
|---|---|---|---|
| `route-intent.js` | UserPromptSubmit | Detects DevFlow projects (`.planning/`) and matches user intent against 13 categories (build, plan, verify, debug, gh-sync, ...). Injects a system reminder telling Claude to use the appropriate skill rather than editing code directly. | None — silent for non-DevFlow repos and explicit `/devflow:` invocations |
| `gate-commits.js` | PreToolUse (Bash) | Blocks raw `git commit` in DevFlow projects; demands `df-tools commit` so atomic per-task commits and STATE.md stay consistent. Merge, rebase and cherry-pick completions are allowed automatically. | Inline `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit …`, or `DEVFLOW_ALLOW_RAW_COMMIT=1` exported before launching Claude Code (see below) |
| `gate-edits.js` | PreToolUse (Edit/Write/MultiEdit) | **Strict DENY by default** in ambient mode. Allows edits when `.planning/.skill-active` marker exists (executor writes this), the editing agent is a DevFlow agent (`agent_type` `devflow:<name>`), user prompt contains an override phrase (`skip devflow`, `just edit`, `bypass devflow`, `force edit`), or env var is set. Always permits `.planning/**` and `*.md` paths. (Prior `DEVFLOW_STRICT_EDITS=1` behavior is now the default.) | `DEVFLOW_SKIP_EDIT_GATE=1` disables the gate entirely |
| `changelog-on-tag.js` | PreToolUse (Bash) | Blocks `git tag -a vX.Y.Z` if `CHANGELOG.md` has no `## [X.Y.Z]` heading. Tells you to run `df-tools changelog update --version vX.Y.Z` first. | `DEVFLOW_SKIP_CHANGELOG_GATE=1` |
| `verify-completion.js` | Stop | Checks the most-recent SUMMARY.md has Task Evidence and no `Self-Check: FAILED` markers. Warns only — does not block. | n/a (warning only) |
| `verify-commits.js` | SubagentStop | Warns when a subagent finishes without producing any commits in the last 10 min — silent-failure detector for the executor. | n/a (warning only) |
| `gate-executor-stop.js` | SubagentStop | Blocks a `devflow:executor` once when it stops naturally and its TRD has no SUMMARY.md yet, telling it to finish or write the `## Progress` checkpoint. Never blocks twice in a row; fails open. | `DEVFLOW_SKIP_EXECUTOR_STOP_GATE=1` |
| `auto-continue.js` | Stop | While a DevFlow skill is active and nothing runs in the background, blocks once when Claude ends its turn right after announcing its own next step ("Writing the predicate.") instead of taking it. Questions and `/devflow:` hand-offs never trigger it. | `DEVFLOW_SKIP_AUTOCONTINUE=1` |
| `check-update.js` | SessionStart | Background npm registry check for newer DevFlow versions. | n/a |
| `upgrade-project.js` | SessionStart | Upgrades a behind DevFlow project in place: applies the `auto` migrations with the bundled df-tools, then commits exactly the changed files in a detached background process. It does not commit during a rebase, merge, cherry-pick or bisect, on a detached HEAD, over uncommitted edits (the runtime-state files migration 0008 untracks don't count), or if signing fails. Also runs the throttled backup prune (once per 24h; see [Upgrading a Project in Place](#upgrading-a-project-in-place-df-tools-upgrade)) as the first step, DevFlow project or not. Notices are emitted once, on the next prompt, by `route-results.js`. | `DEVFLOW_SKIP_UPGRADE=1` (upgrade only), `DEVFLOW_SKIP_PRUNE=1` (prune only) |
| `statusline.js` | StatusLine | Renders model, current task, context usage, update indicator. | n/a |

### "DevFlow blocked my command — why?"

If a hook denies a tool call, the model receives the denial reason and will usually correct itself. If you want to bypass:

```bash
# From Claude (the agent's Bash tool): prefix each `git commit` inline.
# Every commit invocation in the command needs its own prefix.
DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m "..."

# For a whole session: export it in YOUR terminal, BEFORE starting Claude Code.
export DEVFLOW_ALLOW_RAW_COMMIT=1
claude
```

An `export DEVFLOW_ALLOW_RAW_COMMIT=1` run by the agent inside a Bash command never works: the hook decides before the command runs and reads only its own environment, which it inherits from the terminal that launched Claude Code. The inline prefix is the only form the agent can use. Completing a merge, rebase or cherry-pick (a `git commit` while `MERGE_HEAD`, `REBASE_HEAD`, `rebase-merge/`, `rebase-apply/` or `CHERRY_PICK_HEAD` exists in the repo's git dir) is allowed automatically and needs no escape.

To turn off a hook entirely, edit `~/.claude/settings.json` and remove its entry from `hooks.PreToolUse` / `hooks.UserPromptSubmit`. Reinstalling DevFlow will re-add it.

---

## GitHub integration

Opt-in mirroring of `.planning/` to GitHub issues, milestones, and releases. Planning files remain the source of truth — GitHub is derivative. Every operation is a no-op when integration is disabled, `gh` is missing, or auth has expired; failures never block your workflow.

### Enable

In `.planning/config.json`:

```json
{
  "github": {
    "enabled": true,
    "repo": "owner/name",
    "milestone_prefix": "v",
    "labels": {
      "objective": "devflow:objective",
      "in_progress": "devflow:in-progress",
      "gaps": "devflow:gaps"
    }
  }
}
```

Prereqs: `gh` CLI installed and authenticated (`gh auth login`).

### What syncs and when

| Trigger | Action | Manual command |
|---|---|---|
| End of `/devflow:new-project` (after roadmap creation) | Creates one milestone per roadmap version + one issue per objective, persists numbers to `.planning/.gh-mapping.json` | `df-tools gh sync-objectives` |
| Verifier finds gaps (`status: gaps_found`) | Posts the VERIFICATION.md `gaps:` block as an issue comment | `df-tools gh comment <obj#> @file:path` |
| Verifier final pass passes | Closes the issue with link to verification report | `df-tools gh close-issue <obj#>` |
| Tag push (`vX.Y.Z`) | Generates rich release notes from SUMMARY.md files since previous tag, creates or edits the GitHub release | `df-tools gh sync-release vX.Y.Z` |
| Manual recovery | All of the above | `/devflow:gh-sync [objectives|release vX.Y.Z|status]` |

### Mapping file

`.planning/.gh-mapping.json` is the source of truth for "which objective maps to which GitHub issue":

```json
{
  "milestone_id": 12,
  "objectives": {
    "1": 42,
    "2": 43,
    "2.1": 44
  }
}
```

Commit it. Re-running `gh sync-objectives` is idempotent — existing issues are edited, not duplicated.

### What does NOT sync

- Issues created in GitHub do not flow back to `.planning/` (would break "planning files are truth"). File issues normally; they become input to `/devflow:plan-objective`.
- Per-task commits are not re-posted to issues (too noisy). Use `gh comment` manually if you want an update mid-execution.
- GitHub Projects v2 boards are not synced (GraphQL-only, low marginal value over labels + milestones).

### Troubleshooting

```bash
# Is the integration reachable?
node ~/.claude/devflow/bin/df-tools.cjs gh status
```

Common reasons for "skipped":
- `github.enabled is false` — set `enabled: true` in config
- `gh CLI not installed` — install from https://cli.github.com
- `gh not authenticated` — run `gh auth login`
- `github.repo must be set as "owner/name"` — fix the format

---

## CHANGELOG management

DevFlow ships with an auto-updater that keeps `CHANGELOG.md` in Keep-a-Changelog format from your conventional-commit history.

```bash
# Generate an entry for the next release from git log since the last tag
node ~/.claude/devflow/bin/df-tools.cjs changelog update --version v1.30.0

# Backfill an older release with explicit range
node ~/.claude/devflow/bin/df-tools.cjs changelog update \
  --version 1.27.4 --from 6aafba1 --to dcfba83

# Preview without writing
node ~/.claude/devflow/bin/df-tools.cjs changelog update --version v1.30.0 --dry-run

# Check whether a version already has an entry
node ~/.claude/devflow/bin/df-tools.cjs changelog check 1.29.0
```

---

## Keeping documentation current

DevFlow watches its own generated text and your project's planning docs for drift, and surfaces
what it finds as advisories — nothing here is auto-repaired.

- **W050** — a live doc (a project's CLAUDE.md DEVFLOW block, STATE.md, or DevFlow's own text)
  references a removed command with no successor.
- **W051** — `STACK.md`'s `provenance.reviewed` date is missing or older than the staleness
  threshold.
- **W052** — `STACK.md`'s declared `languages` disagree with what's actually detected in the repo.
- **W053** — a `.planning/codebase/*.md` map is more commits behind `HEAD` than the threshold.

They show up in three places: `validate health` (Check 14), `/devflow:status` (via
`df-tools validate docs --raw`, in a `## Documentation` section when there's something to say),
and `df-tools telemetry --raw`.

Command-name drift (renamed or removed `/devflow:`/`/df:` references) is the one class that *is*
fixed for you: migration `0007-doc-refs-fix` runs automatically at session start and rewrites stale
names inside your project's CLAUDE.md DEVFLOW block and STATE.md (outside `## Session Log`).
Historical records and removed-command references are never touched.

The staleness thresholds are overridable per project in `.planning/config.json`:

```json
{
  "docs": {
    "stack_review_stale_days": 90,
    "codebase_map_stale_commits": 50
  }
}
```

---

## Trying a Local Checkout of DevFlow

To run a feature that hasn't been released yet (e.g. to verify a change before it ships), install
the plugin from your local git checkout instead of the published marketplace. This is reversible --
the published build comes back exactly as it was.

0. Before changing anything:
   a. In Claude Code, run `/plugin` and note which `@aocyber` plugins are currently enabled.
   b. Optional, read-only: `node <checkout>/plugins/devflow/devflow/bin/df-tools.cjs upgrade --prune --dry-run` shows what the first prune of your real `~/.claude/devflow/backups/` would remove (it keeps anything younger than 14 days and the newest 5 per repo, and never touches `legacy-*`/`global-*`).
1. Install from your checkout (in any Claude Code session):
   - `/plugin marketplace remove aocyber`
   - `/plugin marketplace add <path-to-your-checkout>`
   - `/plugin install devflow@aocyber` (or enable it)
   - In a terminal: `rm ~/.claude/devflow/.plugin-version` -- if your checkout and the published build report the same version, `sync-runtime.js`'s version fast path would otherwise keep the OLD mirror; deleting the marker forces a re-mirror.
   - Quit that session.
2. Open a fresh session in a scratch fixture repo (never a real repository): `cd <your-fixture> && claude`. Confirm the mirror is your checkout, e.g. `node ~/.claude/devflow/bin/df-tools.cjs adopt --help` prints usage only if your checkout has `adopt` and the published build doesn't yet.
3. Exercise the feature (e.g. type `/devflow:adopt`) and check its output against what you expect.
4. Revert to the published build:
   - `/plugin marketplace remove aocyber`
   - `/plugin marketplace add AO-Cyber-Systems/devflow-claude`
   - `/plugin install devflow@aocyber`, and re-enable the plugins noted in step 0a
   - In a terminal: `rm ~/.claude/devflow/.plugin-version`, then open a new session (this re-mirrors the published build)
   - Confirm the revert: a command unique to your checkout (e.g. `adopt --help`) now fails again.
5. Optional cleanup: remove the scratch fixture and any `~/.claude/devflow/backups/<fixture>-*` your test run created; a leftover `.registry.json` entry is harmless.

**Gotcha:** if your checkout and the published marketplace build report the *same* version number,
`rm ~/.claude/devflow/.plugin-version` is required both on install **and** on revert -- otherwise
`sync-runtime.js` sees no version change and keeps serving the mirror it already has.

Commits are grouped by conventional-commit type (`feat` → Added, `fix` → Fixed, `perf` → Performance, etc.). Bare commits without a recognized type land under "Other". The `changelog-on-tag` hook blocks `git tag -a vX.Y.Z` until the entry exists, so you cannot ship a release without documenting it.
