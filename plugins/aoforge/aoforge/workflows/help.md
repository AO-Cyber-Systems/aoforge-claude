---
status: active
---
<purpose>
Display the complete AOForge command reference. Output ONLY the reference content. Do NOT add project-specific analysis, git status, next-step suggestions, or any commentary beyond the reference.
</purpose>

<reference>
# AOForge Command Reference

**AOForge** (Get Shit Done) creates hierarchical project plans optimized for solo agentic development with Claude Code.

## Quick Start

1. `/aoforge:new-project` - Initialize project (includes research, requirements, roadmap)
2. `/aoforge:plan-objective 1` - Create detailed plan for first objective
3. `/aoforge:execute-objective 1` - Execute the objective

## Staying Updated

AOForge evolves fast. Update periodically:

```
/plugin update aoforge@aocyber
```

## Core Workflow

```
/aoforge:new-project → /aoforge:plan-objective → /aoforge:execute-objective → repeat
```

### Project Initialization

**`/aoforge:new-project`**
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

Usage: `/aoforge:new-project`

**`/aoforge:map-codebase`**
Map an existing codebase for brownfield projects.

- Analyzes codebase with parallel codebase-mapper agents, each writing drafts
- Publishes 8 focused documents to `.planning/codebase/`, one `aof-tools doc put codebase/<NAME>.md` each
- Covers stack, architecture, structure, conventions, testing, patterns, integrations, concerns
- Use before `/aoforge:new-project` on existing codebases — or use `/aoforge:adopt` to turn an existing codebase into an AOForge project directly

Usage: `/aoforge:map-codebase`

**`/aoforge:adopt [path]`**
Turn an existing repository into an AOForge project, unattended.

- Maps the code, infers `PROJECT.md` and `STACK.md`, scaffolds `config.json`/`STATE.md`/`ROADMAP.md`
- Adds the CLAUDE.md routing block and makes ONE recorded commit on an `aoforge/adopt` branch (never pushed)
- Never asks a question — uncertain inferences are written to `.planning/ADOPT-REPORT.md` for review
- Use when you have an existing repository and want AOForge set up without answering setup questions yourself

Usage: `/aoforge:adopt` or `/aoforge:adopt ./path/to/repo`

### Objective Planning

**`/aoforge:discuss-objective <number>`**
Help articulate your vision for an objective before planning.

- Captures how you imagine this objective working
- Records your vision, essentials, and boundaries in CONTEXT.md (`aof-tools doc put objectives/<dir>/<NN>-CONTEXT.md`)
- Use when you have ideas about how something should look/feel

Usage: `/aoforge:discuss-objective 2`

**`/aoforge:research-objective <number>`**
Comprehensive ecosystem research for niche/complex domains.

- Discovers standard stack, architecture patterns, pitfalls
- Records "how experts build this" knowledge in RESEARCH.md (`aof-tools doc put objectives/<dir>/<NN>-RESEARCH.md`)
- Use for 3D, games, audio, shaders, ML, and other specialized domains
- Goes beyond "which library" to ecosystem knowledge

Usage: `/aoforge:research-objective 3`

**`/aoforge:list-objective-assumptions <number>`**
See what Claude is planning to do before it starts.

- Shows Claude's intended approach for an objective
- Lets you course-correct if Claude misunderstood your vision
- No files created - conversational output only

Usage: `/aoforge:list-objective-assumptions 3`

**`/aoforge:plan-objective <number>`**
Create detailed execution plan for a specific objective.

- Publishes each TRD with `aof-tools plan put-trd <objective> <XX-YY-slug-TRD.md> --from <draft>`
- Breaks objective into concrete, actionable tasks
- Includes verification criteria and success measures
- Multiple plans per objective supported (XX-01, XX-02, etc.)
- Shows the TRD drafts in plan mode for your review before they are pushed (skipped with `--auto`, `--gaps` or `workflow.auto_advance`)

Usage: `/aoforge:plan-objective 1`
Result: `.planning/objectives/01-foundation/01-01-<slug>-TRD.md`

### Execution

**`/aoforge:execute-objective <phase-number>`**
Execute all jobs in an objective.

- Groups plans by wave (from frontmatter), executes waves sequentially
- Plans within each wave run in parallel via Task tool
- Verifies objective goal after all jobs complete
- Records progress with `aof-tools summary post`, `requirements mark-complete`, `roadmap update-job-progress` and `state` commands (REQUIREMENTS.md, ROADMAP.md, STATE.md)

Usage: `/aoforge:execute-objective 5`

### Quick Mode

**`/aoforge:quick`**
Execute small, ad-hoc tasks with AOForge guarantees but skip optional agents.

Quick mode uses the same system with a shorter path:
- Spawns planner + executor (skips researcher, checker, verifier)
- Quick tasks live in `.planning/quick/` separate from planned objectives
- Tracks each task in STATE.md's Quick Tasks table (not ROADMAP.md)

Use when you know exactly what to do and the task is small enough to not need research or verification.

Usage: `/aoforge:quick`
Result: `.planning/quick/NNN-slug/` — the plan via `aof-tools quick put <N> <slug> --from <draft>`, the summary via `aof-tools quick summary <N> --from <draft>`

### Roadmap Management

**`/aoforge:objective <add|remove>`**
Manage objectives in the current milestone roadmap.

- `add <description>` — Append a new integer objective
- `remove <number> [--force] [--confirm]` — Remove an unstarted objective and renumber. Dry-run by default: without `--confirm` it prints the delete + rename plan and changes nothing. `--force` separately overrides the refusal to remove an objective with executed jobs.

Usage: `/aoforge:objective add "Add admin dashboard"`
Usage: `/aoforge:objective remove 17 --confirm`

### Parallel Workstreams

**`/aoforge:workstreams <setup|status|merge|run>`**
Parallel feature development via git worktrees.

- `setup` — Analyze dependency graph, create worktrees and provision `.planning/`
- `status` — Progress across active workstreams
- `merge` — Squash-merge completed workstreams, reconcile `.planning/`, advance to join objective
- `run` — *(v1.2 obj 6)* Run a workstream end-to-end autonomously

Usage: `/aoforge:workstreams setup`
Usage: `/aoforge:workstreams status`
Usage: `/aoforge:workstreams merge`

### Milestone Management

**`/aoforge:milestone <new|audit|complete|gaps>`**
Manage milestones from start to archive.

- `new [name]` — Start the next development cycle (questioning → research → requirements → roadmap)
- `audit [version]` — Verify a milestone achieved its definition of done
- `complete <version>` — Archive milestone and tag git release
- `gaps` — Turn audit gaps into closure objectives

Usage: `/aoforge:milestone new "v2.0 Features"`
Usage: `/aoforge:milestone audit`
Usage: `/aoforge:milestone complete 1.0.0`
Usage: `/aoforge:milestone gaps`

### Status and Session

**`/aoforge:status [check|pause|resume]`**
Project status, health, save/resume work.

- *(no arg)* — Visual progress bar + current position + what's next
- `check` — Validate `.planning/` directory integrity (alias: `--check`)
- `pause` — Save context for later resumption (alias: `--pause`)
- `resume` — Restore context from previous session (alias: `--resume`)

Usage: `/aoforge:status`
Usage: `/aoforge:status check`
Usage: `/aoforge:status pause`
Usage: `/aoforge:status resume`

**`/aoforge:doctor [--fix] [--global] [path]`**
Diagnose and safely repair AOForge environment problems.

- *(no arg)* — Read-only report: runtime mirror, plugin cache, hook registry, model ids, runtime state inside the repo, pending migrations, stale markers and state, backups
- `--fix` — Apply only safe, reversible repairs, then re-check. Refuses index-changing fixes while unrelated changes are staged; plugin cache dirs are report-only
- `--global` — Check only the global install under `~/.claude`

Usage: `/aoforge:doctor`
Usage: `/aoforge:doctor --fix`
Usage: `/aoforge:doctor --global`
Usage: `/aoforge:doctor ./path/to/repo`

### Debugging

**`/aoforge:debug [issue description]`**
Systematic debugging with persistent state across context resets.

- Gathers symptoms through adaptive questioning
- Tracks the investigation in `.planning/debug/[slug].md` (`aof-tools debug put <slug> --from <draft>`)
- Investigates using scientific method (evidence → hypothesis → test)
- Survives `/clear` — run `/aoforge:debug` with no args to resume
- Archives resolved issues to `.planning/debug/resolved/` (`aof-tools debug resolve <slug>`)

Usage: `/aoforge:debug "login button doesn't work"`
Usage: `/aoforge:debug` (resume active session)

### Todo Management

**`/aoforge:todo <add|list>`**
Capture todos and view morning standup.

- `add [description]` — Capture idea or task from conversation context (or use provided description); also adds a `Todo:` item to the session task list when the session has task tools; files it under `.planning/todos/pending/` with `aof-tools todo add --from <draft>`; checks for duplicates
- `list [area]` — Merge the session's task-list todos into the archive first (`aof-tools todo sync`), then list pending todos with their in-session status, select one to work on; optional area filter; routes to work now / add to objective / brainstorm. A Stop hook runs the same merge at the end of every turn

Usage: `/aoforge:todo add` (infers from conversation)
Usage: `/aoforge:todo add "Add auth token refresh"`
Usage: `/aoforge:todo list`
Usage: `/aoforge:todo list api`

### User Acceptance Testing

**`/aoforge:verify-work [objective]`**
Validate built features through conversational UAT.

- Extracts testable deliverables from SUMMARY.md files
- Presents tests one at a time (pass, or describe what is wrong)
- Automatically diagnoses failures and creates fix plans
- Ready for re-execution if issues found

Usage: `/aoforge:verify-work 3`

### Milestone Auditing

See `/aoforge:milestone audit` and `/aoforge:milestone gaps` in **Milestone Management** above.

### Configuration

**`/aoforge:settings`**
Configure workflow toggles and model profile interactively.

- Toggle researcher, job checker, verifier agents
- Select model profile (quality/balanced/budget)
- Updates `.planning/config.json`

Usage: `/aoforge:settings`

**`/aoforge:set-profile <profile>`**
Quick switch model profile for AOForge agents.

- `quality` — Opus everywhere except verification
- `balanced` — Opus for planning, Sonnet for execution (default)
- `budget` — Sonnet for writing, Haiku for research/verification

Usage: `/aoforge:set-profile budget`

### Utility Commands

**`/aoforge:cleanup`**
Archive accumulated objective directories from completed milestones.

- Identifies objectives from completed milestones still in `.planning/objectives/`
- Shows dry-run summary before moving anything
- Moves objective dirs to `.planning/milestones/v{X.Y}-objectives/`
- Use after multiple milestones to reduce `.planning/objectives/` clutter

Usage: `/aoforge:cleanup`

**`/aoforge:gh-sync [migrate [--dry-run]|status|flush|pull|setup [--apply]|release <tag>|<objective>|--all]`**
Operate the GitHub store (opt-in `github.store: true`, where GitHub is the system of record).

- `migrate` moves an existing project onto the store: it shows the plan and request estimate, asks, then runs migration 0011 (resumable)
- `status`, `flush`, `pull` inspect and drain the outbox and rebuild the cache; `setup` configures the repository
- `release <tag>` generates release notes; `<objective>` / `--all` mirror objectives to issues when the store is off

Usage: `/aoforge:gh-sync migrate --dry-run`
Usage: `/aoforge:gh-sync status`

**`/aoforge:help`**
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
│   └── v1.0-objectives/          # Archived objective dirs (via /aoforge:cleanup or --archive-objectives)
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

Every planning file is written through an aof-tools verb — never by hand, and never with `Write`/`Edit`.
**In store mode (`github.store: true`) `.planning/` is a read-only cache: use the verbs.** In local mode
the same verbs write the same `.planning/` files, so the instructions never change between modes.
Content comes from `--from <path|->`; `aof-tools planning draft <rel>` prints a draft path to write first.

- `aof-tools plan put-trd <objective> <file-name> --from <path|->` — publish one TRD
- `aof-tools plan push <objective>` — push the objective's TRDs
- `aof-tools objective put <id> --from <path|->` — replace OBJECTIVE.md
- `aof-tools objective set-status <id> <status>` — planned, in_progress, verifying, complete, cancelled, reopened
- `aof-tools summary post <trd-id> --from <path|->` — publish a TRD's SUMMARY
- `aof-tools summary checkpoint <trd-id> --from <path|->` — save a mid-TRD progress checkpoint
- `aof-tools verification post <objective> --from <path|->` — publish the objective's VERIFICATION
- `aof-tools doc put <rel> --from <path|->` — any other planning doc (CONTEXT, RESEARCH, `codebase/`, `research/`, ...)
- `aof-tools decision open <trd-id> --question <text|@path>` / `decision answer <id> --from <path|->` — record a decision
- `aof-tools todo add --from <path|->` / `todo complete <stem>` — capture and close todos
- `aof-tools todo sync (--session <id> | --transcript <path>)` — merge a session's task-list todos into the archive
- `aof-tools debug put <slug> --from <path|->` / `debug resolve <slug>` — debug sessions
- `aof-tools quick put <N> <slug> --from <path|->` / `quick summary <N> --from <path|->` — quick tasks
- `aof-tools milestone put <version> --from <path|->` / `milestone complete <version>` — milestones
- `aof-tools planning mode` — prints `local` or `store`
- `aof-tools planning import` — store mode only: import an existing `.planning/` into the store
- `aof-tools gh pull --all` — regenerate the cache views (ROADMAP.md, STATE.md) from the store

`STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` progress changes go through `aof-tools state ...`,
`roadmap update-job-progress` and `requirements mark-complete`. `config.json` and `STACK.md` stay
tracked config in both modes. `aof-tools <command> --help` gives each verb's full usage.

## Workflow Modes

Set during `/aoforge:new-project`:

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
/aoforge:new-project        # Unified flow: questioning → research → requirements → roadmap
/clear
/aoforge:plan-objective 1       # Create plans for first objective
/clear
/aoforge:execute-objective 1    # Execute all jobs in objective
```

**Resuming work after a break:**

```
/aoforge:status  # See where you left off and continue
```

**Adding urgent mid-milestone work:**

```
/aoforge:objective add "Critical security fix"
/aoforge:plan-objective N          # where N is the newly added objective number
/aoforge:execute-objective N
```

**Running independent objectives in parallel:**

```
/aoforge:workstreams setup     # Analyze deps, create worktrees
# Open terminals in each worktree, run plan-objective + execute-objective
/aoforge:workstreams status    # Check progress
/aoforge:workstreams merge     # Merge when done, advance to join objective
```

**Completing a milestone:**

```
/aoforge:milestone complete 1.0.0
/clear
/aoforge:milestone new  # Start next milestone (questioning → research → requirements → roadmap)
```

**Capturing ideas during work:**

```
/aoforge:todo add                    # Capture from conversation context
/aoforge:todo add "Fix modal z-index"  # Capture with explicit description
/aoforge:todo list                   # Review and work on todos
/aoforge:todo list api               # Filter by area
```

**Debugging an issue:**

```
/aoforge:debug "form submission fails silently"  # Start debug session
# ... investigation happens, context fills up ...
/clear
/aoforge:debug                                    # Resume from where you left off
```

## Built-in Claude Code Integrations

AOForge works alongside Claude Code's built-in features:

**`/loop` — Recurring monitoring:**

```
/loop 10m /aoforge:status         # Check project status every 10 minutes
/loop 5m /aoforge:status check    # Monitor .planning/ integrity during builds
/loop 15m /aoforge:todo list      # Periodic todo reminders
```

Use `/loop` during long `/aoforge:execute-objective` runs to track progress without switching context.

**Plan Mode — Review before it is published:**

Plan mode (`EnterPlanMode`, then `ExitPlanMode`) is where AOForge asks you to approve a draft before anything is published. `/aoforge:plan-objective` shows the TRD drafts there, `/aoforge:new-project` shows PROJECT.md, the requirements and the roadmap, and `/aoforge:milestone complete` shows the milestone entry and the proposed PROJECT.md changes. Approve to publish, or choose "No, keep planning" and give feedback to get a revised draft and a second review. `--auto` skips the review (so does `workflow.auto_advance` for plan-objective and milestone complete, and `--gaps` for plan-objective). `/aoforge:build` still shows its pipeline strategy in plan mode before spawning agents. Approving a plan switches Claude Code's permission mode to the one you pick.

## Getting Help

- Read `.planning/PROJECT.md` for project vision
- Read `.planning/STATE.md` for current context
- Check `.planning/ROADMAP.md` for objective status
- Run `/aoforge:status` to check where you're up to

## Removed Skill Names (removed in v2.2)

These old skill names were removed in v2.2. Use the consolidated commands listed below for migration guidance.

<!-- doc-refs:ignore-start — rename table; asserted equal to DEPRECATION_MAP by doc-refs.repo.test.cjs -->
| Old name (removed) | Use instead |
|---|---|
| `/aoforge:add-objective` | `/aoforge:objective add` |
| `/aoforge:insert-objective` | `/aoforge:objective add` *(insert permanently deprecated — decimal objectives dropped in v1.2)* |
| `/aoforge:remove-objective` | `/aoforge:objective remove` |
| `/aoforge:new-milestone` | `/aoforge:milestone new` |
| `/aoforge:audit-milestone` | `/aoforge:milestone audit` |
| `/aoforge:complete-milestone` | `/aoforge:milestone complete` |
| `/aoforge:plan-milestone-gaps` | `/aoforge:milestone gaps` |
| `/aoforge:add-todo` | `/aoforge:todo add` |
| `/aoforge:check-todos` | `/aoforge:todo list` |
| `/aoforge:pause-work` | `/aoforge:status pause` |
| `/aoforge:resume-work` | `/aoforge:status resume` |
| `/aoforge:progress` | `/aoforge:status` |
| `/aoforge:health` | `/aoforge:status check` |
<!-- doc-refs:ignore-end -->
</reference>
