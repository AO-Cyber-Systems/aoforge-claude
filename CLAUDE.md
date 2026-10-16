# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- rename-guard:ignore-start -->
> **Transition (objective 72):** this file describes the renamed AOForge source tree. Until AOForge 3.0.0 is installed (TRD 72-21) the live runtime is the installed DevFlow 2.15.0 plugin: run `node ~/.claude/devflow/bin/df-tools.cjs`, and this repo's planning tree stays at `.planning/`. 72-22 removes this note.
<!-- rename-guard:ignore-end -->

<!-- Budget: this file is resident on every turn of every session. Keep it under 200 lines
     (Claude Code memory guidance) and under ~15K characters. Detail belongs in docs/ and in
     references that load on invocation. context-budget.repo.test.cjs enforces the line cap. -->

## What This Is

AOForge is a meta-prompting, context engineering and spec-driven development system for Claude Code. It ships as a Claude Code plugin (`aoforge@aocyber`) installed via `/plugin` or the Claude Desktop plugin UI. Fork of GSD v1.20.4, maintained by AO Cyber Systems.

## Commands

```bash
npm test                # Run tests (Node native test runner, ~6.5 min)
```

There is no lint command. Tests are `*.test.cjs` / `*.test.js` files beside their sources under `plugins/aoforge/` and `scripts/`.

## Publishing

Distribution is the Claude Code plugin marketplace: `.claude-plugin/marketplace.json` and `plugins/aoforge/.claude-plugin/plugin.json` declare the plugin; users add the marketplace by repo slug (`AO-Cyber-Systems/aoforge-claude`). No npm publish. Tags follow `v*` so the changelog gate works. A `v*` release also pushes `aoforge--vX.Y.Z`, the tag the stack packs resolve core from, and a pack releases from `<pack>--vX.Y.Z` with its own CHANGELOG, never marked Latest (`scripts/release-tag.cjs`). `workflow_dispatch` with `dry_run` pushes and deletes a throwaway `aoforge--v0.0.0-dryrun-<run id>` tag to prove the token can push one, and `node scripts/tag-rules.cjs <tag>` lists the tag rulesets that match (read-only).

## Architecture

### Plugin Layout (`plugins/aoforge/`)

```
plugins/aoforge/
├── .claude-plugin/plugin.json    # plugin manifest (name, version, statusLine)
├── skills/<name>/SKILL.md        # 32 user-invocable slash commands
├── agents/<agent>.md             # 12 subagent prompts
├── hooks/
│   ├── hooks.json                # event registrations (auto-loaded)
│   ├── sync-runtime.js           # SessionStart: mirrors aoforge/ → ~/.claude/aoforge/
│   └── *.js                      # the other hooks (gates, verifiers, statusline)
└── aoforge/                      # runtime mirrored to ~/.claude/aoforge/ on session start
    ├── bin/aof-tools.cjs          # central CLI invoked by skills/agents
    ├── bin/lib/*.cjs             # aof-tools internals
    ├── workflows/<name>.md       # workflow bodies referenced via @~/.claude/aoforge/workflows/...
    ├── references/<name>.md      # static reference docs read during execution
    ├── templates/<name>.md       # files copied into user projects' .aoforge/ dirs
    └── stack-profiles/<id>.md    # bundled tier-2 profile (go); flutter/dart ship in their pack
```

The `sync-runtime` SessionStart hook mirrors `${CLAUDE_PLUGIN_ROOT}/aoforge/` to `~/.claude/aoforge/` whenever the version or the content digest differs (`.plugin-version`, `.plugin-digest`). Skills and agents reach the runtime at that fixed home path in Bash and in `@` references.

**How Claude Code loads this plugin (verified on 2.1.301):** a skill body expands `@path` for absolute, `~` and `${CLAUDE_PLUGIN_ROOT}` paths and runs `` !`command` `` lines under the skill's Bash grant, and the whole body stays in the conversation. An agent body is the subagent's system prompt verbatim and a Task prompt is plain text: neither expands `@`, so an agent must `Read` a reference itself. Every command hook is its own `node` process; all hooks for one event run in parallel. Skill descriptions and agent descriptions sit in context at all times.

### Core Tool: `plugins/aoforge/aoforge/bin/aof-tools.cjs`

The CLI every skill and agent calls as `node ~/.claude/aoforge/bin/aof-tools.cjs <command> [args]`. A global `--cwd <dir>` flag precedes the command. Full catalog: `docs/AOF-TOOLS-REFERENCE.md`; `aof-tools --help` lists every command. Families:

- **State** — `state load` (config plus the STATE.md digest), `state digest`, `state get`, `state update`, `state patch`, `state advance-job` (rotates decisions past the newest 10 into STATE_ARCHIVE.md), `state rotate-decisions`, `state update-progress`, `state rekey`, `state-snapshot`. STATE.md is a digest, not an archive: W068 reports an oversized decision log.
- **Objectives and roadmap** — `objective next-decimal|add|insert|remove|complete|put|set-status`, `milestone complete|put`, `roadmap get-objective|analyze|digest|update-job-progress`. Every writing command refuses an unknown flag (`lib/flag-guard.cjs`, `lib/flag-spec.cjs`).
- **Init and models** — `init execute-objective|plan-objective|new-project|...`, `resolve-model <agent-type> [--objective N]` from `references/model-profiles.json`. Precedence: an OBJECTIVE.md/TRD `model_profile` override, then config `model_profile` (quality / balanced / budget; `auto` opts into the (kind, work) defaults table per objective, an unset key stays balanced); a stack pack agent takes its tiers from its pack manifest (objective 76/77). `--focus` applies `focus{}` tiers (`mapper_models`, `researcher_models`); `verdict_floor` keeps verifier and job-checker at Sonnet+; `--escalate-from` gives the next rung for `## ESCALATION REQUESTED` (TRDs 76-06, 76-07). The pinned ids must stay current: W063 and doctor check 13 flag a superseded one.
- **Mechanical verbs** (TRD 76-04) — one call each for work agents did by hand: `trd finalize <obj>-<trd>` (post-SUMMARY bookkeeping), `verify objective-evidence <obj>`, `validate roadmap-coverage`, `codebase facts [--focus]`, `security sweep [--focus]`.
- **Validation** — `validate consistency|health [--repair]|requirements|docs`; health checks report E0xx/W0xx codes (W040 behind, W050-W054 docs, W055-W061 store, W062-W068 pins, markers, layout, decision log).
- **Planning verbs** — every planning write is one verb taking `--from <path|->`: `plan put-trd|push`, `summary post|checkpoint [--tick <n|text>]`, `verification post`, `doc put`, `todo add|complete|sync`, `debug put|resolve`, `quick put|summary`, `decision open|answer`; plus `planning mode|draft|import`. D-01: with `github.store` off a verb writes the `.aoforge/` file byte for byte with zero `gh` calls, in the checkout that runs it when that checkout has its own planning directory, else in main (`planning-mode.resolveVerbRoot`, quick 36); in store mode it writes main's cache, the ledger and the outbox. `planning-writes.repo.test.cjs` fails CI on a direct planning write in prose.
- **GitHub** — `gh sync|pull|outbox|trd|pr|orphans|setup|status|rebrand` (opt-in `github.enabled`; store mode `github.store`). Module family `lib/gh*.cjs`; detail in `docs/USER-GUIDE.md`.
- **Telemetry and audit** — `context`, `session-audit`, `transcript-export`, `telemetry [--scan]`, `override --gate <g> --reason <why>` (`lib/audit-cli.cjs`).
- **Changelog** — `changelog update --version vX.Y.Z [--dry-run]`, `changelog check <version>`.
- **Upgrade** — `upgrade [--check|--apply] [--only id] [--confirm] [--global] [--prune] [--register]`; detection-based, idempotent migrations (`lib/migrations/NNNN-*.cjs`, `auto` | `confirm`) with backups under `~/.claude/aoforge/backups/`. 0012-0014 are the 3.0.0 rename, 0015 rotates the STATE.md decision log.
- **Adopt and doctor** — `adopt preflight|begin|scaffold|report`, `doctor [--fix] [--json] [--global]` (checks in `lib/doctor-checks/NN-<id>.cjs`; `--fix` applies only safe, reversible fixes).
- **Estimation** — `tokens trd|stamp|backfill|coverage`, `calibrate`, `estimate task|trd|objective|milestone|start|wave|finish|backtest`; rates in `references/model-rates.json`.
- **Stack packs** (objective 77, `docs/PROPOSAL-stack-packs.md` §5A) — stack-specific procedure lives in pack plugins (`plugins/aoforge-stack-flutter`, `plugins/aoforge-stack-web`), never core: a pack ships `aoforge-stack.json` (schema `schemas/stack-pack.schema.json`) and a SessionStart hook that mirrors it to `~/.claude/aoforge/stacks/<name>/`. A pack is active when its plugin is enabled and the project selects it (`extends:` one of its profiles, config `stacks.enabled`, a matching `verification.runtime`, or an active pack's `soft_depends` platform rule, such as Flutter → web for platform web); `stack discover` only proposes. `stack context <agent>` appends a Read pointer per active fragment; `stack verify --changed|--all [--task id]` merges pack results (error > missing > fail > pass); `stack doctor` checks an active pack's tools and warns on an absent soft dependency. Manifest hooks `gate_policy` (stack verify --run), `awareness` (org-awareness exports) and `ui.pattern_catalogue` keep the rest of a stack in its pack. `stack-neutrality.repo.test.cjs` fails CI on a pack-owned stack named in core outside its allowlist.
- **Stack, merge driver, shims** — `stack resolve|context|validate|init|verify|report|mcp|discover|doctor`; `merge-driver install|resolve`; `lib/legacy-names.cjs` and `lib/compat.cjs` hold the one-release rename shims (`rename-guard.repo.test.cjs` fails CI on a pre-rename name outside its ALLOW list and the ignore regions).

### Skills (`plugins/aoforge/skills/<name>/SKILL.md`)

YAML frontmatter (`name`, `description`, `argument-hint`, `allowed-tools`) and an XML body (`<objective>`, `<execution_context>` with `@` references, `<process>`, `<context>`). Skills are thin orchestrators: load context, then spawn agents with the Task tool. Project context comes from `` !`aof-tools state digest --raw` `` and `` !`aof-tools roadmap digest --raw` `` injections, never a whole `@.aoforge/STATE.md`. A skill with subcommands (status, milestone, workstreams, todo, objective) resolves the one workflow with `skill-route` and Reads only that file.

### Agents (`plugins/aoforge/agents/*.md`)

12 subagent prompts (planner, executor, verifier, debugger, ...; stack packs ship their own) with frontmatter `name`, `description`, `tools`, `color` and an XML body of `<role>`, `<philosophy>`, `<execution_flow>` steps. Spawned by skills with the model the active profile resolves. A reference is named with the moment it is needed (checkpoints.md only before a checkpoint task, tdd.md only for a TDD TRD) because the agent has to Read it.

### Templates, References, Hooks, Marketplace

- `aoforge/templates/` — `config.json`, `state.md`, `project.md`, `roadmap.md`, `requirements.md`, `milestone.md`, `job-prompt.md`, `summary*.md`: copied into projects' `.aoforge/`.
- `aoforge/references/` — model profiles, verification patterns, TDD, git conventions, checkpoints, UI branding, the design set (`design-*.md`, `full-output.md`; taste-skill under MIT, see `NOTICE.md`), `context-discipline.md`.
- `hooks/hooks.json` — every hook uses `${CLAUDE_PLUGIN_ROOT}`; detail per hook in `docs/HOOKS-REFERENCE.md`.
- `/.claude-plugin/marketplace.json` — the marketplace: core, the stack packs `aoforge-stack-flutter` and `aoforge-stack-web`, and the pointer plugin (final 3.0.0 release of the pre-rename plugin: a SessionStart notice and one forwarding skill per command, generated by `node scripts/gen-pointer-skills.cjs --write`; removed in the release after 3.0.0).

### Hooks

**Session:**
- `sync-runtime.js` — SessionStart; mirrors the runtime, then runs the global upgrade and the one-time runtime-state migration.
- `upgrade-project.js` — SessionStart; backup prune (24h), background transcript export (24h), in-place project upgrade with a background commit. Fast path when the stamp matches. Escapes `AOFORGE_SKIP_UPGRADE|PRUNE|TRANSCRIPT_EXPORT=1`.
- `awareness-cache-populate.js` — SessionStart; warms the cross-repo awareness cache under `~/.claude/aoforge/state/awareness/`.
- `classify-session.js` — SessionStart; routing directive for an AOForge project.
- `coexistence-guard.js` — SessionStart; one notice when the pre-rename plugin is still enabled. Escape `AOFORGE_SKIP_COEXISTENCE=1`.
- `route-intent.js` — UserPromptSubmit; routing reminder when a prompt matches a skill.
- `route-results.js` — UserPromptSubmit; emits queued notices and handoff results.

**Observability (warn-only):**
- `statusline.js` — StatusLine (plugin.json); model, task, context use, estimated time remaining.
- `verify-completion.js` — Stop; checks SUMMARY.md evidence.
- `verify-commits.js` — SubagentStop; warns on no recent commits, blocks an executor stop once in autonomous mode.
- `gh-flush.js` — PostToolUse(Bash) + Stop; store mode only, flushes the outbox. Escape `AOFORGE_SKIP_GH_FLUSH_HOOK=1`.
- `todo-sync.js` — Stop; merges session todos into the archive. Escape `AOFORGE_SKIP_TODO_SYNC=1`.
- Retry and resume markers live under `~/.claude/aoforge/state/hook-markers/<repo-key>/`; `hooks/planning-writes.audit.test.js` fails CI if a hook writes a runtime dotfile into `.aoforge/` beyond `.skill-active`, `.edit-override`, `.aoforge-notices.json`.

**Enforcement (active gates):**
- `pre-bash.js` — PreToolUse(Bash); the one registration for the event. Runs the five Bash hooks below in one process with the same stdin and merges their decisions (deny over ask, every reason kept; a throwing hook is skipped). Each dispatched hook carries `DISPATCHED-BY: pre-bash.js` in its header, which doctor check 12 and the hook inventory read.
- `gate-commits.js` — PreToolUse(Bash) via pre-bash; blocks raw commits (invocation-aware; merge/rebase completion and the inline `AOFORGE_ALLOW_RAW_COMMIT=1` prefix pass).
- `gate-edits.js` — PreToolUse(Edit/Write/MultiEdit); strict deny in ambient mode unless a live `.aoforge/.skill-active` marker (local or main checkout), an `aoforge:` agent, an override phrase or `AOFORGE_SKIP_EDIT_GATE=1`. Severity `gates.editGate`: strict | warn | off. Store mode denies cache paths for everyone.
- `gate-bash-writes.js` — PreToolUse(Bash) via pre-bash; the same gate for Bash writes to tracked source files; default `warn` (`gates.bashEditGate`).
- `gate-skill-requires.js` — UserPromptExpansion + PreToolUse(Skill); refuses a skill whose `requires:` tool is missing. Escape `AOFORGE_SKIP_SKILL_REQUIRES=1`.
- `gate-interactive.js` — PreToolUse(Bash) via pre-bash; routes TTY-requiring commands to the handoff watcher.
- `guard-no-progress.js` — PreToolUse on every tool (Bash via pre-bash, the rest registered directly); warns at 3 identical calls, asks at 5. Escape `AOFORGE_SKIP_PROGRESS_GUARD=1`.
- `changelog-on-tag.js` — PreToolUse(Bash) via pre-bash; blocks `git tag -a vX.Y.Z` without a `## [X.Y.Z]` entry. Escape `AOFORGE_SKIP_CHANGELOG_GATE=1`.
- `gate-executor-stop.js` — SubagentStop; blocks an executor's natural stop once without a SUMMARY or token stamp. Escape `AOFORGE_SKIP_EXECUTOR_STOP_GATE=1`.
- `auto-continue.js` — Stop; blocks once when a skill is live and the last sentence announced the model's own next step. Escape `AOFORGE_SKIP_AUTOCONTINUE=1`.

**Draft (not registered in hooks.json):**
- `inject-org-context.js` — would inject org/initiative context at planning time.
- `inject-handoff-results.js` — would surface handoff-watcher results back into the session.

**Not an AOForge hook:** the worktree-isolation guard is a Claude Code harness guard; agents emit one plain command per Bash call (`agents/executor.md` → `worktree_command_discipline`).

## Context management

Full guidance: `plugins/aoforge/aoforge/references/context-discipline.md`. Policy: do not tighten output caps (`MAX_MCP_OUTPUT_TOKENS`, `BASH_MAX_OUTPUT_LENGTH` are not binding); leave `ENABLE_TOOL_SEARCH` on its default; the lever is behaviour: locate with `rg -n`, read with `offset`/`limit`, prefer a targeted `Edit`. `aof-tools context --limit 150` recomputes the window composition from session transcripts. `context-budget.repo.test.cjs` caps this file, each skill's resolved footprint and each agent body.

## Conventions

- **Module format**: CommonJS (`.cjs`), synchronous `fs` I/O, designed as a CLI not a library.
- **Naming**: skills `<name>/SKILL.md`, agents `<agent-name>.md`, hooks `<purpose>.js`, tests `<module>.test.cjs` beside the source.
- **Markdown structure**: YAML frontmatter + XML-like tags for prompt sections; `@path` references use `@~/.claude/aoforge/...`.
- **Workflow status**: every `aoforge/workflows/*.md` carries `status: active | legacy`.
- **Version sync**: `package.json`, `plugins/aoforge/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` must match on every release.
- **Git commits**: `{type}({scope}): {description}` — feat, fix, test, refactor, perf, chore, docs. Planning docs commit through `aof-tools commit`.

## User-Facing Workflow

**new-project** → **discuss-objective** → **plan-objective** → **execute-objective** → **verify-work** → **complete-milestone**. Each step produces files in `.aoforge/` that feed the next. Execution is wave-based: independent TRDs run concurrently, each executor in a fresh context window.

## Intent Model: `kind` and `work`

A project declares `kind` (`api | app | library | ui-lib | cli | plugin`) on PROJECT.md; an objective declares `work` (`feature | port | refactor | foundation | bugfix | prototype | spike`) on OBJECTIVE.md or inherits `default_work`. The planner applies `references/defaults-table.md` for TDD posture, depth, model profile and rigor. Resolution, highest wins: TRD frontmatter → OBJECTIVE.md `overrides` → CLAUDE.md playbook sections (`## ... TDD|Test|Quality|Scope`) → defaults table → built-in fallback. Inspect with `aof-tools intent resolve --objective <id>`. Migration: `aof-tools upgrade --apply --only 0006 --kind <kind>`. Design rationale: `docs/PROPOSAL-kind-and-work.md`.

## Where we left off

Position, blockers and the newest decisions: `node ~/.claude/aoforge/bin/aof-tools.cjs state digest --raw` (`.aoforge/STATE.md` is the digest, `STATE_ARCHIVE.md` the log). Open items: `docs/USER-GUIDE.md` → GitHub integration, Known issues. Still deferred: Node/Rust/Python tier-2 stack profiles; `mcp__context7__*` cleanup in agents; `stack mcp --write` is the only writer of `.mcp.json`.
