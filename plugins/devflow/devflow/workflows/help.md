---
status: active
---
<purpose>
Display the complete DevFlow command reference. Output ONLY the reference content. Do NOT add project-specific analysis, git status, next-step suggestions, or any commentary beyond the reference.
</purpose>

<reference>
# DevFlow Command Reference

**DevFlow** (Get Shit Done) creates hierarchical project plans optimized for solo agentic development with Claude Code.

## Quick Start

1. `/devflow:new-project` - Initialize project (includes research, requirements, roadmap)
2. `/devflow:plan-objective 1` - Create detailed plan for first objective
3. `/devflow:execute-objective 1` - Execute the objective

## Staying Updated

DevFlow evolves fast. Update periodically:

```
/plugin update devflow@aocyber
```

## Core Workflow

```
/devflow:new-project → /devflow:plan-objective → /devflow:execute-objective → repeat
```

### Project Initialization

**`/devflow:new-project`**
Initialize new project through unified flow.

One command takes you from idea to ready-for-planning:
- Deep questioning to understand what you're building
- Optional domain research (spawns 4 parallel researcher agents)
- Requirements definition with v1/v2/out-of-scope scoping
- Roadmap creation with objective breakdown and success criteria

Creates all `.planning/` artifacts:
- `PROJECT.md` — vision and requirements
- `config.json` — workflow mode (interactive/yolo)
- `research/` — domain research (if selected)
- `REQUIREMENTS.md` — scoped requirements with REQ-IDs
- `ROADMAP.md` — objectives mapped to requirements
- `STATE.md` — project memory

Usage: `/devflow:new-project`

**`/devflow:map-codebase`**
Map an existing codebase for brownfield projects.

- Analyzes codebase with parallel codebase-mapper agents, each writing drafts
- Publishes 8 focused documents to `.planning/codebase/`, one `df-tools doc put codebase/<NAME>.md` each
- Covers stack, architecture, structure, conventions, testing, patterns, integrations, concerns
- Use before `/devflow:new-project` on existing codebases — or use `/devflow:adopt` to turn an existing codebase into a DevFlow project directly

Usage: `/devflow:map-codebase`

**`/devflow:adopt [path]`**
Turn an existing repository into a DevFlow project, unattended.

- Maps the code, infers `PROJECT.md` and `STACK.md`, scaffolds `config.json`/`STATE.md`/`ROADMAP.md`
- Adds the CLAUDE.md routing block and makes ONE recorded commit on a `devflow/adopt` branch (never pushed)
- Never asks a question — uncertain inferences are written to `.planning/ADOPT-REPORT.md` for review
- Use when you have an existing repository and want DevFlow set up without answering setup questions yourself

Usage: `/devflow:adopt` or `/devflow:adopt ./path/to/repo`

### Objective Planning

**`/devflow:discuss-objective <number>`**
Help articulate your vision for an objective before planning.

- Captures how you imagine this objective working
- Records your vision, essentials, and boundaries in CONTEXT.md (`df-tools doc put objectives/<dir>/<NN>-CONTEXT.md`)
- Use when you have ideas about how something should look/feel

Usage: `/devflow:discuss-objective 2`

**`/devflow:research-objective <number>`**
Comprehensive ecosystem research for niche/complex domains.

- Discovers standard stack, architecture patterns, pitfalls
- Records "how experts build this" knowledge in RESEARCH.md (`df-tools doc put objectives/<dir>/<NN>-RESEARCH.md`)
- Use for 3D, games, audio, shaders, ML, and other specialized domains
- Goes beyond "which library" to ecosystem knowledge

Usage: `/devflow:research-objective 3`

**`/devflow:list-objective-assumptions <number>`**
See what Claude is planning to do before it starts.

- Shows Claude's intended approach for an objective
- Lets you course-correct if Claude misunderstood your vision
- No files created - conversational output only

Usage: `/devflow:list-objective-assumptions 3`

**`/devflow:plan-objective <number>`**
Create detailed execution plan for a specific objective.

- Publishes each TRD with `df-tools plan put-trd <objective> <XX-YY-slug-TRD.md> --from <draft>`
- Breaks objective into concrete, actionable tasks
- Includes verification criteria and success measures
- Multiple plans per objective supported (XX-01, XX-02, etc.)

Usage: `/devflow:plan-objective 1`
Result: `.planning/objectives/01-foundation/01-01-<slug>-TRD.md`

### Execution

**`/devflow:execute-objective <phase-number>`**
Execute all jobs in an objective.

- Groups plans by wave (from frontmatter), executes waves sequentially
- Plans within each wave run in parallel via Task tool
- Verifies objective goal after all jobs complete
- Records progress with `df-tools summary post`, `requirements mark-complete`, `roadmap update-job-progress` and `state` commands (REQUIREMENTS.md, ROADMAP.md, STATE.md)

Usage: `/devflow:execute-objective 5`

### Quick Mode

**`/devflow:quick`**
Execute small, ad-hoc tasks with DevFlow guarantees but skip optional agents.

Quick mode uses the same system with a shorter path:
- Spawns planner + executor (skips researcher, checker, verifier)
- Quick tasks live in `.planning/quick/` separate from planned objectives
- Tracks each task in STATE.md's Quick Tasks table (not ROADMAP.md)

Use when you know exactly what to do and the task is small enough to not need research or verification.

Usage: `/devflow:quick`
Result: `.planning/quick/NNN-slug/` — the plan via `df-tools quick put <N> <slug> --from <draft>`, the summary via `df-tools quick summary <N> --from <draft>`

### Roadmap Management

**`/devflow:objective <add|remove>`**
Manage objectives in the current milestone roadmap.

- `add <description>` — Append a new integer objective
- `remove <number> [--force] [--confirm]` — Remove an unstarted objective and renumber. Dry-run by default: without `--confirm` it prints the delete + rename plan and changes nothing. `--force` separately overrides the refusal to remove an objective with executed jobs.

Usage: `/devflow:objective add "Add admin dashboard"`
Usage: `/devflow:objective remove 17 --confirm`

### Parallel Workstreams

**`/devflow:workstreams <setup|status|merge|run>`**
Parallel feature development via git worktrees.

- `setup` — Analyze dependency graph, create worktrees and provision `.planning/`
- `status` — Progress across active workstreams
- `merge` — Squash-merge completed workstreams, reconcile `.planning/`, advance to join objective
- `run` — *(v1.2 obj 6)* Run a workstream end-to-end autonomously

Usage: `/devflow:workstreams setup`
Usage: `/devflow:workstreams status`
Usage: `/devflow:workstreams merge`

### Milestone Management

**`/devflow:milestone <new|audit|complete|gaps>`**
Manage milestones from start to archive.

- `new [name]` — Start the next development cycle (questioning → research → requirements → roadmap)
- `audit [version]` — Verify a milestone achieved its definition of done
- `complete <version>` — Archive milestone and tag git release
- `gaps` — Turn audit gaps into closure objectives

Usage: `/devflow:milestone new "v2.0 Features"`
Usage: `/devflow:milestone audit`
Usage: `/devflow:milestone complete 1.0.0`
Usage: `/devflow:milestone gaps`

### Status and Session

**`/devflow:status [check|pause|resume]`**
Project status, health, save/resume work.

- *(no arg)* — Visual progress bar + current position + what's next
- `check` — Validate `.planning/` directory integrity (alias: `--check`)
- `pause` — Save context for later resumption (alias: `--pause`)
- `resume` — Restore context from previous session (alias: `--resume`)

Usage: `/devflow:status`
Usage: `/devflow:status check`
Usage: `/devflow:status pause`
Usage: `/devflow:status resume`

**`/devflow:doctor [--fix] [--global] [path]`**
Diagnose and safely repair DevFlow environment problems.

- *(no arg)* — Read-only report: runtime mirror, plugin cache, hook registry, model ids, runtime state inside the repo, pending migrations, stale markers and state, backups
- `--fix` — Apply only safe, reversible repairs, then re-check. Refuses index-changing fixes while unrelated changes are staged; plugin cache dirs are report-only
- `--global` — Check only the global install under `~/.claude`

Usage: `/devflow:doctor`
Usage: `/devflow:doctor --fix`
Usage: `/devflow:doctor --global`
Usage: `/devflow:doctor ./path/to/repo`

### Debugging

**`/devflow:debug [issue description]`**
Systematic debugging with persistent state across context resets.

- Gathers symptoms through adaptive questioning
- Tracks the investigation in `.planning/debug/[slug].md` (`df-tools debug put <slug> --from <draft>`)
- Investigates using scientific method (evidence → hypothesis → test)
- Survives `/clear` — run `/devflow:debug` with no args to resume
- Archives resolved issues to `.planning/debug/resolved/` (`df-tools debug resolve <slug>`)

Usage: `/devflow:debug "login button doesn't work"`
Usage: `/devflow:debug` (resume active session)

### Todo Management

**`/devflow:todo <add|list>`**
Capture todos and view morning standup.

- `add [description]` — Capture idea or task from conversation context (or use provided description); files it under `.planning/todos/pending/` with `df-tools todo add --from <draft>`; checks for duplicates
- `list [area]` — List pending todos, select one to work on; optional area filter; routes to work now / add to objective / brainstorm

Usage: `/devflow:todo add` (infers from conversation)
Usage: `/devflow:todo add "Add auth token refresh"`
Usage: `/devflow:todo list`
Usage: `/devflow:todo list api`

### User Acceptance Testing

**`/devflow:verify-work [objective]`**
Validate built features through conversational UAT.

- Extracts testable deliverables from SUMMARY.md files
- Presents tests one at a time (pass, or describe what is wrong)
- Automatically diagnoses failures and creates fix plans
- Ready for re-execution if issues found

Usage: `/devflow:verify-work 3`

### Milestone Auditing

See `/devflow:milestone audit` and `/devflow:milestone gaps` in **Milestone Management** above.

### Configuration

**`/devflow:settings`**
Configure workflow toggles and model profile interactively.

- Toggle researcher, job checker, verifier agents
- Select model profile (quality/balanced/budget)
- Updates `.planning/config.json`

Usage: `/devflow:settings`

**`/devflow:set-profile <profile>`**
Quick switch model profile for DevFlow agents.

- `quality` — Opus everywhere except verification
- `balanced` — Opus for planning, Sonnet for execution (default)
- `budget` — Sonnet for writing, Haiku for research/verification

Usage: `/devflow:set-profile budget`

### Utility Commands

**`/devflow:cleanup`**
Archive accumulated objective directories from completed milestones.

- Identifies objectives from completed milestones still in `.planning/objectives/`
- Shows dry-run summary before moving anything
- Moves objective dirs to `.planning/milestones/v{X.Y}-objectives/`
- Use after multiple milestones to reduce `.planning/objectives/` clutter

Usage: `/devflow:cleanup`

**`/devflow:gh-sync [migrate [--dry-run]|status|flush|pull|setup [--apply]|release <tag>|<objective>|--all]`**
Operate the GitHub store (opt-in `github.store: true`, where GitHub is the system of record).

- `migrate` moves an existing project onto the store: it shows the plan and request estimate, asks, then runs migration 0011 (resumable)
- `status`, `flush`, `pull` inspect and drain the outbox and rebuild the cache; `setup` configures the repository
- `release <tag>` generates release notes; `<objective>` / `--all` mirror objectives to issues when the store is off

Usage: `/devflow:gh-sync migrate --dry-run`
Usage: `/devflow:gh-sync status`

**`/devflow:help`**
Show this command reference.

## Files & Structure

```
.planning/
├── PROJECT.md            # Project vision
├── ROADMAP.md            # Current objective breakdown
├── STATE.md              # Project memory & context
├── config.json           # Workflow mode & gates
├── todos/                # Captured ideas and tasks
│   ├── pending/          # Todos waiting to be worked on
│   └── done/             # Completed todos
├── debug/                # Active debug sessions
│   └── resolved/         # Archived resolved issues
├── milestones/
│   ├── v1.0-ROADMAP.md       # Archived roadmap snapshot
│   ├── v1.0-REQUIREMENTS.md  # Archived requirements
│   └── v1.0-objectives/          # Archived objective dirs (via /devflow:cleanup or --archive-objectives)
│       ├── 01-foundation/
│       └── 02-core-features/
├── codebase/             # Codebase map (brownfield projects)
│   ├── STACK.md          # Languages, frameworks, dependencies
│   ├── ARCHITECTURE.md   # Patterns, layers, data flow
│   ├── STRUCTURE.md      # Directory layout, key files
│   ├── CONVENTIONS.md    # Coding standards, naming
│   ├── TESTING.md        # Test setup, patterns
│   ├── INTEGRATIONS.md   # External services, APIs
│   └── CONCERNS.md       # Tech debt, known issues
└── objectives/
    ├── 01-foundation/
    │   ├── 01-01-JOB.md
    │   └── 01-01-SUMMARY.md
    └── 02-core-features/
        ├── 02-01-JOB.md
        └── 02-01-SUMMARY.md
```

## Planning Verbs

Every planning file is written through a df-tools verb — never by hand, and never with `Write`/`Edit`.
**In store mode (`github.store: true`) `.planning/` is a read-only cache: use the verbs.** In local mode
the same verbs write the same `.planning/` files, so the instructions never change between modes.
Content comes from `--from <path|->`; `df-tools planning draft <rel>` prints a draft path to write first.

- `df-tools plan put-trd <objective> <file-name> --from <path|->` — publish one TRD
- `df-tools plan push <objective>` — push the objective's TRDs
- `df-tools objective put <id> --from <path|->` — replace OBJECTIVE.md
- `df-tools objective set-status <id> <status>` — planned, in_progress, verifying, complete, cancelled, reopened
- `df-tools summary post <trd-id> --from <path|->` — publish a TRD's SUMMARY
- `df-tools summary checkpoint <trd-id> --from <path|->` — save a mid-TRD progress checkpoint
- `df-tools verification post <objective> --from <path|->` — publish the objective's VERIFICATION
- `df-tools doc put <rel> --from <path|->` — any other planning doc (CONTEXT, RESEARCH, `codebase/`, `research/`, ...)
- `df-tools decision open <trd-id> --question <text|@path>` / `decision answer <id> --from <path|->` — record a decision
- `df-tools todo add --from <path|->` / `todo complete <stem>` — capture and close todos
- `df-tools debug put <slug> --from <path|->` / `debug resolve <slug>` — debug sessions
- `df-tools quick put <N> <slug> --from <path|->` / `quick summary <N> --from <path|->` — quick tasks
- `df-tools milestone put <version> --from <path|->` / `milestone complete <version>` — milestones
- `df-tools planning mode` — prints `local` or `store`
- `df-tools planning import` — store mode only: import an existing `.planning/` into the store
- `df-tools gh pull --all` — regenerate the cache views (ROADMAP.md, STATE.md) from the store

`STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` progress changes go through `df-tools state ...`,
`roadmap update-job-progress` and `requirements mark-complete`. `config.json` and `STACK.md` stay
tracked config in both modes. `df-tools <command> --help` gives each verb's full usage.

## Workflow Modes

Set during `/devflow:new-project`:

**Interactive Mode**

- Confirms each major decision
- Pauses at checkpoints for approval
- More guidance throughout

**YOLO Mode**

- Auto-approves most decisions
- Executes plans without confirmation
- Only stops for critical checkpoints

Change anytime by editing `.planning/config.json`

## Planning Configuration

Configure how planning artifacts are managed in `.planning/config.json`:

**`planning.commit_docs`** (default: `true`)
- `true`: Planning artifacts committed to git (standard workflow)
- `false`: Planning artifacts kept local-only, not committed

When `commit_docs: false`:
- Add `.planning/` to your `.gitignore`
- Useful for OSS contributions, client projects, or keeping planning private
- All planning files still work normally, just not tracked in git

**`planning.search_gitignored`** (default: `false`)
- `true`: Add `--no-ignore` to broad ripgrep searches
- Only needed when `.planning/` is gitignored and you want project-wide searches to include it

Example config:
```json
{
  "planning": {
    "commit_docs": false,
    "search_gitignored": true
  }
}
```

## Common Workflows

**Starting a new project:**

```
/devflow:new-project        # Unified flow: questioning → research → requirements → roadmap
/clear
/devflow:plan-objective 1       # Create plans for first objective
/clear
/devflow:execute-objective 1    # Execute all jobs in objective
```

**Resuming work after a break:**

```
/devflow:status  # See where you left off and continue
```

**Adding urgent mid-milestone work:**

```
/devflow:objective add "Critical security fix"
/devflow:plan-objective N          # where N is the newly added objective number
/devflow:execute-objective N
```

**Running independent objectives in parallel:**

```
/devflow:workstreams setup     # Analyze deps, create worktrees
# Open terminals in each worktree, run plan-objective + execute-objective
/devflow:workstreams status    # Check progress
/devflow:workstreams merge     # Merge when done, advance to join objective
```

**Completing a milestone:**

```
/devflow:milestone complete 1.0.0
/clear
/devflow:milestone new  # Start next milestone (questioning → research → requirements → roadmap)
```

**Capturing ideas during work:**

```
/devflow:todo add                    # Capture from conversation context
/devflow:todo add "Fix modal z-index"  # Capture with explicit description
/devflow:todo list                   # Review and work on todos
/devflow:todo list api               # Filter by area
```

**Debugging an issue:**

```
/devflow:debug "form submission fails silently"  # Start debug session
# ... investigation happens, context fills up ...
/clear
/devflow:debug                                    # Resume from where you left off
```

## Built-in Claude Code Integrations

DevFlow works alongside Claude Code's built-in features:

**`/loop` — Recurring monitoring:**

```
/loop 10m /devflow:status         # Check project status every 10 minutes
/loop 5m /devflow:status check    # Monitor .planning/ integrity during builds
/loop 15m /devflow:todo list      # Periodic todo reminders
```

Use `/loop` during long `/devflow:execute-objective` runs to track progress without switching context.

**Plan Mode — Pre-build alignment:**

Claude Code's built-in plan mode (`EnterPlanMode`) is used by `/devflow:build` and `/devflow:plan-objective` to present the execution strategy before spawning expensive agent pipelines. This lets you review and approve the approach (objective scope, agent assignments, research decisions) before any work begins.

## Getting Help

- Read `.planning/PROJECT.md` for project vision
- Read `.planning/STATE.md` for current context
- Check `.planning/ROADMAP.md` for objective status
- Run `/devflow:status` to check where you're up to

## Removed Skill Names (removed in v2.2)

These old skill names were removed in v2.2. Use the consolidated commands listed below for migration guidance.

<!-- doc-refs:ignore-start — rename table; asserted equal to DEPRECATION_MAP by doc-refs.repo.test.cjs -->
| Old name (removed) | Use instead |
|---|---|
| `/devflow:add-objective` | `/devflow:objective add` |
| `/devflow:insert-objective` | `/devflow:objective add` *(insert permanently deprecated — decimal objectives dropped in v1.2)* |
| `/devflow:remove-objective` | `/devflow:objective remove` |
| `/devflow:new-milestone` | `/devflow:milestone new` |
| `/devflow:audit-milestone` | `/devflow:milestone audit` |
| `/devflow:complete-milestone` | `/devflow:milestone complete` |
| `/devflow:plan-milestone-gaps` | `/devflow:milestone gaps` |
| `/devflow:add-todo` | `/devflow:todo add` |
| `/devflow:check-todos` | `/devflow:todo list` |
| `/devflow:pause-work` | `/devflow:status pause` |
| `/devflow:resume-work` | `/devflow:status resume` |
| `/devflow:progress` | `/devflow:status` |
| `/devflow:health` | `/devflow:status check` |
<!-- doc-refs:ignore-end -->
</reference>
