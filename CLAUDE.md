# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- Budget: this file is resident on every turn of every session. context-budget.repo.test.cjs caps it at
     200 lines and 20,000 characters; never raise the caps. Detail goes to docs/AOF-TOOLS-REFERENCE.md,
     docs/HOOKS-REFERENCE.md and references that load on invocation. -->

## What This Is

AOForge is a meta-prompting, context engineering and spec-driven development system for Claude Code. It ships as a Claude Code plugin (`aoforge@aocyber`) installed via `/plugin` or the Claude Desktop plugin UI. Fork of GSD v1.20.4, maintained by AO Cyber Systems.

## Commands

```bash
npm test                # Run tests (Node native test runner, ~6.5 min)
```

There is no lint command. Tests are `*.test.cjs` / `*.test.js` files beside their sources under `plugins/aoforge/`, `plugins/aoforge-stack-*/` and `scripts/`.

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

The CLI every skill and agent calls as `node ~/.claude/aoforge/bin/aof-tools.cjs <command> [args]`. A global `--cwd <dir>` flag precedes the command. Detail for each line below: `docs/AOF-TOOLS-REFERENCE.md`; `aof-tools --help` lists every command. Families:

- **State** — `state load` (config plus the STATE.md digest), `state digest`, `state get`, `state update`, `state patch`, `state advance-job` (rotates decisions past the newest 10 into STATE_ARCHIVE.md), `state rotate-decisions`, `state update-progress`, `state rekey`, `state-snapshot`. STATE.md is a digest, not an archive: W068 reports an oversized decision log.
- **Objectives and roadmap** — `objective next-decimal|add|insert|remove|complete|put|set-status`, `milestone complete|put`, `roadmap get-objective|analyze|digest|update-job-progress`. Every writing command refuses an unknown flag (`lib/flag-guard.cjs`, `lib/flag-spec.cjs`).
- **Init and models** — `init execute-objective|plan-objective|new-project|...`, `resolve-model <agent-type> [--objective N]` from `references/model-profiles.json`: an OBJECTIVE.md/TRD `model_profile` override, then config `model_profile` (quality / balanced / budget; `auto` opts into the (kind, work) defaults table); a stack pack agent takes its tiers from its pack manifest. `--focus`, `verdict_floor` and `--escalate-from` are in the reference. W063 and doctor check 13 flag a superseded pinned id.
- **Mechanical verbs** (TRD 76-04) — `trd finalize <obj>-<trd>`, `verify objective-evidence <obj>`, `validate roadmap-coverage`, `codebase facts [--focus]`, `security sweep [--focus]`.
- **Validation** — `validate consistency|health [--repair]|requirements|docs`; codes W040 behind, W050-W054 docs, W055-W061 store, W062-W069 pins, markers, layout and the decision log. The old layout (objective 78): W066 is the one broken result when only the pre-rename planning directory exists (nothing else runs, `--repair` writes nothing) and a warning beside `.aoforge/`; W067 (pre-rename config key) and W069 (pre-rename CLAUDE.md block) are never repaired and name AOForge 3.0.x or the manual step.
- **Planning verbs** — every planning write is one verb taking `--from <path|->`: `plan put-trd|push`, `summary post|checkpoint [--tick <n|text>]`, `verification post`, `doc put`, `todo add|complete|sync`, `debug put|resolve`, `quick put|summary`, `decision open|answer`; plus `planning mode|draft|import`. D-01: with `github.store` off a verb writes the `.aoforge/` file byte for byte with zero `gh` calls, in the checkout that runs it when that checkout has its own planning directory, else in main (`planning-mode.resolveVerbRoot`, quick 36); in store mode it writes main's cache, the ledger and the outbox. `planning-writes.repo.test.cjs` fails CI on a direct planning write in prose.
- **GitHub** — `gh sync|pull|outbox|trd|pr|orphans|setup|status|rebrand` (opt-in `github.enabled`; store mode `github.store`). A repository still carrying a pre-rename label is refused by every label lookup until `gh rebrand --apply` (`lib/gh-legacy-labels.cjs`). Module family `lib/gh*.cjs`; detail in `docs/USER-GUIDE.md`.
- **Telemetry and audit** — `context`, `session-audit`, `transcript-export`, `telemetry [--scan]`, `override --gate <g> --reason <why>` (`lib/audit-cli.cjs`).
- **Config, commit, changelog** — `config-get <key>`, `commit "<msg>" --files <paths>`, `changelog update --version vX.Y.Z [--dry-run]`, `changelog check <version>`.
- **Upgrade** — `upgrade [--check|--apply] [--only id] [--confirm] [--global] [--prune] [--register]`; detection-based, idempotent migrations (`lib/migrations/NNNN-*.cjs`, `auto` | `confirm`) with backups under `~/.claude/aoforge/backups/`. 0015 rotates the STATE.md decision log. The 3.0.0 rename's 0012-0014 were retired in 3.1.0: their ids stay reserved, `--only` on one exits 1 naming AOForge 3.0.x, and a legacy-only project gets `legacy_layout` with nothing written.
- **Adopt and doctor** — `adopt preflight|begin|scaffold|report`, `doctor [--fix] [--json] [--global]` (checks in `lib/doctor-checks/NN-<id>.cjs`; `--fix` applies only safe, reversible fixes). Rename checks 15, 16 and 27 are report-only since 3.1.0; 17 (a leftover `~/.aoforge/`) keeps its fix.
- **Estimation** — `tokens trd|stamp|backfill|coverage`, `calibrate`, `estimate task|trd|objective|milestone|start|wave|finish|backtest`; rates in `references/model-rates.json`.
- **Stack packs** (objective 77) — stack-specific procedure lives in pack plugins (`plugins/aoforge-stack-flutter`, `plugins/aoforge-stack-web`), never core: a pack ships `aoforge-stack.json` and is active when its plugin is enabled and the project selects it; `stack discover` only proposes, `stack verify --changed|--all` merges pack results, `stack doctor` checks a pack's tools. `stack-neutrality.repo.test.cjs` fails CI on a pack-owned stack named in core.
- **Stack and merge driver** — `stack resolve|context|validate|init|verify|report|mcp|discover|doctor`; `merge-driver install|resolve`.
- **Rename leftovers** (objective 78) — 3.1.0 reads only AOForge names. `lib/legacy-names.cjs` alone spells the pre-rename names (NAMES, LEGACY, PRESERVE, SHIM_RELEASE `3.0.x`, SHIM_REMOVAL `3.1.0`); `lib/compat.cjs` is single-name (`.aoforge/` only, `aoforge:` agents only, no env alias, no fallback home); `lib/planning-layout.cjs`, `lib/coexistence.cjs` and `lib/legacy-layout-guard.cjs` detect the old layout and leftovers only to report them (the CLI refuses planning writes and `init` in a legacy-only project). `docs/MIGRATING-TO-AOFORGE.md` is the user guide.

### Skills (`plugins/aoforge/skills/<name>/SKILL.md`)

YAML frontmatter (`name`, `description`, `argument-hint`, `allowed-tools`) and an XML body (`<objective>`, `<execution_context>` with `@` references, `<process>`, `<context>`). Skills are thin orchestrators: load context, then spawn agents with the Task tool. Project context comes from `` !`aof-tools state digest --raw` `` and `` !`aof-tools roadmap digest --raw` `` injections, never a whole `@.aoforge/STATE.md`. A skill with subcommands (status, milestone, workstreams, todo, objective) resolves the one workflow with `skill-route` and Reads only that file.

### Agents (`plugins/aoforge/agents/*.md`)

12 subagent prompts (planner, executor, verifier, debugger, ...; stack packs ship their own) with frontmatter `name`, `description`, `tools`, `color` and an XML body of `<role>`, `<philosophy>`, `<execution_flow>` steps. Spawned by skills with the model the active profile resolves. A reference is named with the moment it is needed (checkpoints.md only before a checkpoint task, tdd.md only for a TDD TRD) because the agent has to Read it.

### Templates, References, Hooks, Marketplace

- `aoforge/templates/` — `config.json`, `state.md`, `project.md`, `roadmap.md`, `requirements.md`, `milestone.md`, `job-prompt.md`, `summary*.md`: copied into projects' `.aoforge/`.
- `aoforge/references/` — model profiles, verification patterns, TDD, git conventions, checkpoints, UI branding, the design set (`design-*.md`, `full-output.md`; taste-skill under MIT, see `NOTICE.md`), `context-discipline.md`.
- `hooks/hooks.json` — every hook uses `${CLAUDE_PLUGIN_ROOT}`; detail per hook in `docs/HOOKS-REFERENCE.md`.
- `/.claude-plugin/marketplace.json` — core, the stack packs `aoforge-stack-flutter` and `aoforge-stack-web`, and the sibling plugins. The pointer plugin was removed in 3.1.0 (objective 78); `lib/coexistence.cjs` still recognises an installed copy.

### Hooks

**Session:**
- `sync-runtime.js` — SessionStart; mirrors the runtime, then runs the global upgrade (the v1 install's prefixed skills and agents move to a backup; a pre-rename `~/.claude/CLAUDE.md` block gets one notice, never a move). No runtime-state migration since 3.1.0.
- `upgrade-project.js` — SessionStart; backup prune (24h), background transcript export (24h), in-place project upgrade with a background commit, one notice for a legacy-only project. Fast path when the stamp matches. Escapes `AOFORGE_SKIP_UPGRADE|PRUNE|TRANSCRIPT_EXPORT=1`.
- `awareness-cache-populate.js` — SessionStart; warms the cross-repo awareness cache under `~/.claude/aoforge/state/awareness/`.
- `classify-session.js` — SessionStart; routing directive for an AOForge project.
- `coexistence-guard.js` — SessionStart; one notice listing every rename leftover 3.1 no longer reads (old plugin enabled, old env variables, an unmigrated runtime home, files in `~/.aoforge/`); reports only. Escape `AOFORGE_SKIP_COEXISTENCE=1`.
- `route-intent.js` — UserPromptSubmit; routing reminder when a prompt matches a skill.
- `route-results.js` — UserPromptSubmit; queued notices, and the catch-all for handoff results no other hook took (each delivered once).
- `inject-handoff-results.js` — PostToolUse + Stop; delivers handoff results to the session and agent that queued them, holding the stop while one is running (objective 73).

**Observability (warn-only):**
- `statusline.js` — StatusLine (plugin.json); model, task, context use, estimated time remaining.
- `verify-completion.js` — Stop; checks SUMMARY.md evidence.
- `verify-commits.js` — SubagentStop; warns on no recent commits, blocks an `aoforge:executor` stop once in autonomous mode.
- `gh-flush.js` — PostToolUse(Bash) + Stop; store mode only, flushes the outbox. Escape `AOFORGE_SKIP_GH_FLUSH_HOOK=1`.
- `todo-sync.js` — Stop; merges session todos into the archive. Escape `AOFORGE_SKIP_TODO_SYNC=1`.
- Retry and resume markers live under `~/.claude/aoforge/state/hook-markers/<repo-key>/`; `hooks/planning-writes.audit.test.js` fails CI if a hook writes a runtime dotfile into `.aoforge/` beyond `.skill-active`, `.edit-override`, `.aoforge-notices.json`.

**Enforcement (active gates):**
- `pre-bash.js` — PreToolUse(Bash); the one registration for the event. Runs the five Bash hooks below in one process and merges their decisions (deny over ask, every reason kept). Each carries `DISPATCHED-BY: pre-bash.js`; `hooks/pre-bash-equivalence.test.js` proves the merge equals five separate processes over a corpus (TRD 79-03).
- `gate-commits.js` — PreToolUse(Bash) via pre-bash; blocks raw commits (invocation-aware; merge/rebase completion and the inline `AOFORGE_ALLOW_RAW_COMMIT=1` prefix pass).
- `gate-edits.js` — PreToolUse(Edit/Write/MultiEdit); strict deny in ambient mode unless a live `.aoforge/.skill-active` marker (local or main checkout), an `aoforge:` agent, an override phrase or `AOFORGE_SKIP_EDIT_GATE=1`. Severity `gates.editGate`: strict | warn | off. Store mode denies cache paths for everyone.
- `gate-bash-writes.js` — PreToolUse(Bash) via pre-bash; the same gate for Bash writes to tracked source files; default `warn` (`gates.bashEditGate`).
- `gate-skill-requires.js` — UserPromptExpansion + PreToolUse(Skill); refuses a skill whose `requires:` tool is missing. Escape `AOFORGE_SKIP_SKILL_REQUIRES=1`.
- `gate-interactive.js` — PreToolUse(Bash) via pre-bash; invocation-aware, queues a TTY-requiring command to `aoforge-watch` (matcher `lib/interactive-commands.cjs`, shared with the daemon).
- `guard-no-progress.js` — PreToolUse on every tool (Bash via pre-bash, the rest registered directly); warns at 3 identical calls, asks at 5. Escape `AOFORGE_SKIP_PROGRESS_GUARD=1`.
- `changelog-on-tag.js` — PreToolUse(Bash) via pre-bash; blocks `git tag -a vX.Y.Z` without a `## [X.Y.Z]` entry. Escape `AOFORGE_SKIP_CHANGELOG_GATE=1`.
- `gate-executor-stop.js` — SubagentStop; blocks an executor's natural stop once without a SUMMARY or token stamp. Escape `AOFORGE_SKIP_EXECUTOR_STOP_GATE=1`.
- `auto-continue.js` — Stop; blocks once when a skill is live and the last sentence announced the model's own next step. Escape `AOFORGE_SKIP_AUTOCONTINUE=1`.

**Draft (not registered in hooks.json):**
- `inject-org-context.js` — would inject org/initiative context at planning time.

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
- **Repo guards**: `rename-guard.repo.test.cjs` (no pre-rename name outside its ALLOW list and ignore regions), `reconcile-guard.repo.test.cjs` (every compat import names a real export; no tracked pre-rename planning path, TRD 79-02), `doc-refs.repo.test.cjs`, `dispatch-completeness.test.cjs` and `hook-inventory.test.cjs` (this file's command and hook lists).

## User-Facing Workflow

**new-project** → **discuss-objective** → **plan-objective** → **execute-objective** → **verify-work** → **complete-milestone**. Each step produces files in `.aoforge/` that feed the next. Execution is wave-based: independent TRDs run concurrently, each executor in a fresh context window.

## Intent Model: `kind` and `work`

A project declares `kind` (`api | app | library | ui-lib | cli | plugin`) on PROJECT.md; an objective declares `work` (`feature | port | refactor | foundation | bugfix | prototype | spike`) on OBJECTIVE.md or inherits `default_work`. The planner applies `references/defaults-table.md` for TDD posture, depth, model profile and rigor. Resolution, highest wins: TRD frontmatter → OBJECTIVE.md `overrides` → CLAUDE.md playbook sections (`## ... TDD|Test|Quality|Scope`) → defaults table → built-in fallback. Inspect with `aof-tools intent resolve --objective <id>`. Migration: `/aoforge:status check --migrate` runs `aof-tools upgrade`; setting `kind` is `aof-tools upgrade --apply --only 0006 --kind <kind>`. Design rationale: `docs/PROPOSAL-kind-and-work.md`.

## Where we left off

Position, blockers and the newest decisions: `node ~/.claude/aoforge/bin/aof-tools.cjs state digest --raw` (`.aoforge/STATE.md` is the digest, `STATE_ARCHIVE.md` the log). Open items: `docs/USER-GUIDE.md` → GitHub integration, Known issues. Standing decisions (objective 74): `main` changes only through a PR with `test (npm test, gated)` green (ruleset in `.github/rulesets/main.json`, compared by `scripts/ruleset-check.cjs`); the visual judge runs locally only, with no Anthropic credential in GitHub. Pending todos: OPS-03 (the docs Pages project and deploy, deferred by the user), the EST-11 follow-up (`est-11-follow-up-objective-75`), the vanity mapping once git.aocyber.ai is configured. The user's call: this machine still holds the pre-rename runtime home; doctor check 16 prints its `mv` into `~/.claude/aoforge/backups/`. Still deferred: removing `gh rebrand`, `lib/legacy-rewrite.cjs` and the legacy detectors once no repository needs them; Node/Rust/Python tier-2 stack profiles; `mcp__context7__*` cleanup in agents; the other UTC date sites (42-01 SUMMARY); `dflang mcp` in place of these MCP servers (`docs/PROPOSAL-stack-packs.md` §6.12). `stack mcp --write` is the only writer of `.mcp.json`.
