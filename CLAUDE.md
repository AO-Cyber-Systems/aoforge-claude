# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

DevFlow is a meta-prompting, context engineering, and spec-driven development system for Claude Code. It ships as a Claude Code plugin (`devflow@aocyber`) installed via `/plugin` or the Claude Desktop plugin UI. Fork of GSD v1.20.4, maintained by AO Cyber Systems.

## Commands

```bash
npm test                # Run tests (Node native test runner)
```

There is no lint command. Tests use `node --test` against `plugins/devflow/devflow/bin/df-tools.test.cjs`.

## Publishing

Distribution is via the Claude Code plugin marketplace. The repo's `.claude-plugin/marketplace.json` and `plugins/devflow/.claude-plugin/plugin.json` declare the plugin; users add the marketplace by repo slug (`AO-Cyber-Systems/devflow-claude`) and install it. There is no npm publish step. Tag and release cadence still follow the `v*` convention so the changelog gate continues to work.

## Architecture

### Plugin Layout (`plugins/devflow/`)

The plugin is the single source of truth for distribution. Layout:

```
plugins/devflow/
├── .claude-plugin/plugin.json    # plugin manifest (name, version, statusLine)
├── skills/<name>/SKILL.md        # 34 user-invocable slash commands
├── agents/<agent>.md             # 13 subagent prompts
├── hooks/
│   ├── hooks.json                # event registrations (auto-loaded)
│   ├── sync-runtime.js           # SessionStart: mirrors devflow/ → ~/.claude/devflow/
│   └── *.js                      # 7 other hooks (statusline, gates, verifiers)
└── devflow/                      # runtime mirrored to ~/.claude/devflow/ on session start
    ├── bin/df-tools.cjs          # central CLI invoked by skills/agents
    ├── bin/lib/*.cjs             # df-tools internals
    ├── workflows/<name>.md       # workflow bodies referenced via @~/.claude/devflow/workflows/...
    ├── references/<name>.md      # static reference docs read during execution
    ├── templates/<name>.md       # files copied into user projects' .planning/ dirs
    └── stack-profiles/<id>.md    # bundled tier-2 profiles (go, dart, flutter)
```

Skill `@path` references (`@~/.claude/devflow/...`) do not interpolate `${CLAUDE_PLUGIN_ROOT}`, so the `sync-runtime` SessionStart hook mirrors `${CLAUDE_PLUGIN_ROOT}/devflow/` to `~/.claude/devflow/` whenever the version or the content digest differs. The `.plugin-version` and `.plugin-digest` marker files prevent redundant copies.

### Core Tool: `plugins/devflow/devflow/bin/df-tools.cjs`

The central CLI utility used by ~50 skill and agent files. CommonJS module invoked as `node ~/.claude/devflow/bin/df-tools.cjs <command> [args]` (skills resolve the path via the home mirror). A global `--cwd <dir>` flag, valid before any command name, `chdir`s before dispatch so a command can target a path other than the caller's cwd (used by `/devflow:adopt [path]`). Provides:

- **State operations** — `state load`, `state update`, `state get`, `state patch`, `state-snapshot`
- **Objective operations** — `objective next-decimal`, `objective add/insert/remove/complete`
- **Roadmap operations** — `roadmap get-objective`, `roadmap analyze`, `roadmap update-job-progress`
- **Compound init commands** — `init execute-objective`, `init plan-objective`, `init new-project`, etc.
- **Model resolution** — `resolve-model <agent-type>` returns the model for an agent based on the active profile (quality/balanced/budget)
- **Validation** — `validate consistency`, `validate health [--repair]`
- **Config & commit** (Unreleased) — `config-get <key>` returns the documented `templates/config.json` default (exit 0) for a known-but-unset key, never overriding a legacy or alias form the user set; unknown keys still error. `commit --files` records a staged removal of a now-ignored path (git rm --cached) with a whole-index commit, and refuses if anything outside `--files` is staged.
- **GitHub integration** (1.29+, opt-in via `github.enabled` in `.planning/config.json`) — `gh sync`, `gh pull`, `gh outbox`, `gh trd`, `gh pr`, `gh orphans`, `gh setup`, `gh status`. **Store mode** (`github.store: true`, default false) makes GitHub the system of record: issues, TRD sub-issues, comments and wiki pages hold the planning state, every verb queues its write in the outbox, and `.planning/` is a cache that `gh pull --all` rebuilds. Store off is a one-way mirror. In store mode each objective runs on one linked branch and PR, and `df-tools commit` refuses the default and unlinked branches. Escapes: `DEVFLOW_SKIP_GH_GATE=1` (logged as gate gh), `DEVFLOW_SKIP_GH_FLUSH_HOOK=1`. Module families: `lib/gh*.cjs` (client, mirror, store and outbox, PR, gate and checks, setup, backfill). `/devflow:gh-sync migrate` moves a project onto the store. Detail (outbox and PR exit codes, setup payloads, W057-W061, App keys, open items): `docs/USER-GUIDE.md` → GitHub is the system of record.
- **Planning verbs** (Unreleased) — every planning write goes through one verb taking `--from <path|->`: `plan put-trd|push`, `summary post|checkpoint`, `verification post`, `doc put`, `objective put|set-status`, `todo add|complete`, `debug put|resolve`, `quick put|summary`, `decision open|answer`, `milestone put|complete`; plus `planning mode`, `planning draft <rel>` and `planning import [--dry-run]` (with the store off, a preview of the backfill and its request estimate). D-01 invariant: with `github.store` off every verb writes today's `.planning/` file byte for byte with zero `gh` calls and `.planning/` stays tracked; in store mode (set in the main checkout's config) it writes the cache, records the ledger and queues the GitHub write. `summary checkpoint|post` write the main checkout even from a worktree. `validate health` Check 15 reports W055 and W056. `planning-writes.repo.test.cjs` fails CI on any direct planning-write instruction.
- **Telemetry & audit** (2.5+) — `context` (context composition), `session-audit` (blocking-event classification), `transcript-export` (compact per-session index before retention deletes transcripts), `telemetry` (one status-facing view with advisories, including documentation staleness), `override --gate <g> --reason <why>` (structured, logged gate override; `override --list` reads the log). Implemented in `lib/context-audit.cjs`, `lib/session-audit.cjs`, `lib/transcript-export.cjs`, `lib/telemetry.cjs`, `lib/override.cjs`, fronted by `lib/audit-cli.cjs`.
- **Documentation correctness** (Unreleased) — `DEPRECATION_MAP` + `REMOVED_COMMANDS` (`lib/skill-route.cjs`) are the only rename source; `lib/doc-refs.cjs` resolves them. `doc-refs.repo.test.cjs` fails CI on stale command references. Migration 0007 fixes them in a project's CLAUDE.md DEVFLOW block and STATE.md. `validate health` Check 14 / `df-tools validate docs` report W050-W054 (advisory, never repaired).
- **Changelog** (1.30+) — `changelog update --version vX.Y.Z [--from <ref> --to <ref>] [--dry-run]`, `changelog check <version>`. Implemented in `lib/changelog.cjs`; generates Keep-a-Changelog entries from conventional-commit history.
- **Upgrade** (Unreleased) — `upgrade [--check|--apply] [--only id] [--confirm] [--path dir] [--kind k] [--default-work w] [--global]`. Brings a project forward in place and stamps `.planning/config.json` `devflow{version, migrations_applied, upgraded_at}`. The migrations are detection-based and idempotent (`lib/migrations/NNNN-*.cjs`, `auto` | `confirm`), with backups under `~/.claude/devflow/backups/`. Migration 0008 (auto) gitignores and untracks `.planning/.progress-guard.json` / `.awareness-cache.json`, keeping the working copies; it covers nested `**/.planning/` runtime state too. Migration 0009 (auto) converts `.planning/.gh-mapping.json` to v3 and normalises `.gh-sync-state.json` keys. Migration 0010 (confirm, store mode only) gitignores and untracks the planning cache, and skips while a backfill is pending. Migration 0011 (confirm, resumable) backfills the planning history onto GitHub, turns store mode on and hands off to 0010; a stop on the hourly budget is resumed by re-running it. `--global` upgrades `~/.claude` instead. `--prune [--dry-run]` runs the backup pruner unthrottled and prints its report; `--register [--path dir]` registers a repo for pruning without a full upgrade. Implemented in `lib/upgrade.cjs`, `lib/upgrade-cli.cjs`, `lib/migrations/`, `lib/managed-block.cjs`, `lib/global-upgrade.cjs` and `lib/backup-prune.cjs`. `validate health` reports W040 when a project is behind.
- **Adopt** (Unreleased) — `adopt preflight|begin|scaffold|report [--cwd dir]`. Unattended bootstrap of an existing repo into a DevFlow project: preflight checks state/cleanliness/branch, scaffold writes config/STATE/`state.json`/ROADMAP and the CLAUDE.md managed block then stamps via `upgrade --apply`, report writes `.planning/ADOPT-REPORT.md`. Idempotent — a half-finished adopt resumes. Implemented in `lib/adopt.cjs`, `lib/adopt-cli.cjs` and `lib/repo-state.cjs` (the one devflow/greenfield/brownfield/scratch detector shared with `project-state.cjs` and `init new-project`). Driven end-to-end by `skills/adopt/SKILL.md` + `workflows/adopt.md`.
- **Doctor** (Unreleased) — `doctor [--fix] [--json] [--path dir] [--global]`. Read-only by default. Checks live in `lib/doctor-checks/NN-<id>.cjs` (10-19 global install, 20-29 project, 30-39 state hygiene); the contract is in `doctor-checks/README.md`. `--fix` applies only safe, reversible fixes and re-runs every check; it refuses index-changing fixes while unrelated changes are staged (`lib/doctor-git.cjs`) and never commits. It composes validate health / upgrade / backup-prune / the stores rather than re-implementing them. Plugin cache dirs are report-only. Implemented in `lib/doctor.cjs`, `lib/doctor-cli.cjs`, `lib/doctor-git.cjs`, `lib/doctor-checks/`. Driven by `skills/doctor/SKILL.md`.
- **Stack profile** (2.11+, drafter Unreleased) — `stack resolve|context|validate|command|init|verify [--run]|report|mcp [--write]`. `.planning/STACK.md` resolves over bundled general → tier-2 → project → component. `stack init` drafts from CI/runner/manifest evidence (writes only with `--write`); `stack verify` checks each command, `--run` executes safe keys only and is effect-based (snapshot/restore around each gate; Dart/Flutter gates halt after a mutation; Flutter runs with `--no-pub`); `stack report` proposes to `.planning/STACK-REPORT.md`; `stack mcp --write` is the only writer of the opt-in `.mcp.json`. Bundled tier-2 profiles live in `devflow/stack-profiles/` (mirrored by sync-runtime); user/org overrides in `~/.claude/devflow/stacks/<id>.md` are never mirrored over. Modules: `lib/stack-profile.cjs` + `stack-evidence|ci|shell|classify|runners|detect|draft|verify|report|mcp|render.cjs`. Guide: `templates/stack.md`.

Model profiles are loaded from `plugins/devflow/devflow/references/model-profiles.json` (via `bin/lib/helpers.cjs`), which maps each agent to its opus/sonnet/haiku assignment per profile tier. The JSON also pins the concrete model id for each tier — keep those ids current when models ship; a stale id resolves to a model that never runs.

### Skills (`plugins/devflow/skills/<name>/SKILL.md`)

User-invocable slash commands (e.g., `/devflow:new-project`). Each skill is a directory containing a single `SKILL.md` with:

- **YAML frontmatter** — `name`, `description`, `argument-hint`, `allowed-tools`
- **XML-structured body** — `<objective>`, `<execution_context>` (with `@path` file references), `<process>`, `<context>`
- Skills are thin orchestrators — they load state via df-tools, then spawn agents via the Task tool

### Agents (`plugins/devflow/agents/*.md`)

Subagent prompt files (13 agents: planner, executor, verifier, debugger, etc.). Each has:

- **YAML frontmatter** — `name`, `description`, `tools`, `color`
- **XML-structured body** — `<role>`, `<philosophy>`, `<execution_flow>` with named `<step>` elements
- Agents are spawned by skills with specific model assignments from the profile table

### Templates (`plugins/devflow/devflow/templates/`)

Markdown and JSON templates that get copied into user projects' `.planning/` directories by df-tools. Key files:

- `config.json` — workflow settings (mode, depth, parallelization, gates, safety)
- `state.md` — living project memory (position, metrics, decisions, blockers)
- `project.md` — project context (what, why, constraints, decisions)
- `roadmap.md`, `requirements.md`, `milestone.md` — planning documents
- `job-prompt.md` — JOB.md structure for execution
- `summary*.md` — post-execution summary templates

### References (`plugins/devflow/devflow/references/`)

Static reference documents that agents read during execution: model profiles, verification patterns, TDD workflow, git conventions, checkpoint handling, UI branding, and the design set — `design-craft.md`, `design-tells.md`, `design-preflight.md`, `design-redesign.md`, `design-stack-web.md`, `design-stack-flutter.md` (consumed by the `eden-ui-web` / `eden-ui-flutter` design skills) plus `full-output.md` (consumed by the executor). All seven are derived from taste-skill under MIT — see `NOTICE.md`.

### Hooks (`plugins/devflow/hooks/`)

Node.js hooks declared in `plugins/devflow/hooks/hooks.json` and auto-registered when the plugin is enabled. All hook commands use `${CLAUDE_PLUGIN_ROOT}` for path resolution.

**Runtime sync:**
- `sync-runtime.js` — SessionStart; mirrors `${CLAUDE_PLUGIN_ROOT}/devflow/` to `~/.claude/devflow/` when the bundled plugin version differs from the cached `.plugin-version`, or when a same-version content change alters the bundle digest (`.plugin-digest`, from `lib/runtime-digest.cjs`). After a successful mirror, it runs the global upgrade (`lib/global-upgrade.cjs`). That moves the legacy `df-*` skills/agents to a backup and maintains the managed `~/.claude/CLAUDE.md` DevFlow block. The first adoption over a hand-written section waits for `df-tools upgrade --global --confirm`.

**Session context (SessionStart / UserPromptSubmit):**
- `awareness-cache-populate.js` — SessionStart; warms the cross-repo awareness cache, kept out of the repo at `~/.claude/devflow/state/awareness/<repo-key>.json` (`lib/awareness-store.cjs`; override `DEVFLOW_AWARENESS_DIR`)
- `classify-session.js` — SessionStart; classifies the session for routing/telemetry
- `route-results.js` — UserPromptSubmit; emits queued handoff command results
- `upgrade-project.js` — SessionStart; upgrades a behind project in place (bundled df-tools; applies auto migrations, background-commits only the changed files; skip rules, though runtime-state paths (migration 0008) are exempt from the dirty-before skip; notices via route-results). Also runs the throttled backup prune (once per 24h, DevFlow project or not) as the first step of `main()`. Escapes: `DEVFLOW_SKIP_UPGRADE=1` (upgrade only), `DEVFLOW_SKIP_PRUNE=1` (prune only)

**Observability (warn-only):**
- `statusline.js` — StatusLine (declared in plugin.json `statusLine`); renders model, task, context usage
- `verify-completion.js` — Stop; checks SUMMARY.md evidence
- `verify-commits.js` — SubagentStop; warns on no commits in last 10min
- Their autonomous retry and resume markers live in `~/.claude/devflow/state/hook-markers/<repo-key>/` (`lib/hook-marker-store.cjs`; override `DEVFLOW_HOOK_MARKER_DIR`). `hooks/planning-writes.audit.test.js` fails CI if any hook writes a runtime dotfile into `.planning/`; the allowlist is `.skill-active`, `.edit-override` and `.devflow-notices.json`.
- `gh-flush.js` — PostToolUse(Bash) + Stop; store mode only: flushes the outbox after `df-tools commit` and at Stop, reports pending/halted writes on both and cache drift (W055) at Stop only; never blocks, fails open. Escape: `DEVFLOW_SKIP_GH_FLUSH_HOOK=1`

**Enforcement (active gates):**
- `route-intent.js` — UserPromptSubmit; injects skill-routing reminders when DevFlow project is detected
- `gate-commits.js` — PreToolUse(Bash); blocks raw commit invocations. Detection is invocation-aware (TRD 27-04): heredoc bodies and quoted arguments are stripped first, so text that merely *mentions* the command is not gated. Allows merge/rebase/cherry-pick completion (MERGE_HEAD, REBASE_HEAD, rebase-merge/-apply, CHERRY_PICK_HEAD in the per-worktree git dir) and an inline `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit …` prefix; an exported variable never reaches the hook (objective 44). Escape: `DEVFLOW_ALLOW_RAW_COMMIT=1` in the env Claude Code was launched from
- `gate-edits.js` — PreToolUse(Edit/Write/MultiEdit); **strict DENY by default** in ambient mode (DevFlow project + no skill active). Allows edits when a live `.planning/.skill-active` marker exists — resolved from **both** the local `.planning/` and the MAIN checkout's, so worktree-isolated agents are not denied by a gitignored marker they can never see (TRD 27-01) — or the PreToolUse payload's `agent_type` starts with `devflow:` (objective 44), or the user prompt contains an override phrase (`skip devflow`, `just edit`, `bypass devflow`, `force edit`), or `DEVFLOW_SKIP_EDIT_GATE=1` is set. Markers carry `expires_at` (8h default). Targets outside the project root (session scratchpad, `/private/tmp`) are never gated (TRD 27-02). Severity is per-project via `.planning/config.json` → `gates.editGate`: `strict` (default) | `warn` | `off`. In store mode, cache/generated `.planning/` paths are denied for everyone (skill markers and devflow agents included) with the verb to use; config.json, STACK.md and runtime files are allowed (needs an installed plugin carrying objective 48).
- `gate-interactive.js` — PreToolUse(Bash); intercepts TTY-requiring commands and routes them to the handoff watcher
- `guard-no-progress.js` — PreToolUse(all tools); detects the same tool called with identical arguments repeatedly. Warns on stderr at 3 repeats, escalates to `ask` at 5, resets whenever the agent varies its approach. Step limits cannot do this — they fire only after the budget is spent. Deliberately **not** wired to tool errors: those run 3.6–4.3% at every model tier and are dominated by environment friction (TRD 28-04). State is per-session under `~/.claude/devflow/state/progress-guard/` (never in the repo; override `DEVFLOW_PROGRESS_GUARD_DIR`). Escape: `DEVFLOW_SKIP_PROGRESS_GUARD=1`
- `changelog-on-tag.js` — PreToolUse(Bash); blocks `git tag -a vX.Y.Z` if `CHANGELOG.md` lacks `## [X.Y.Z]`. Escape: `DEVFLOW_SKIP_CHANGELOG_GATE=1`
- `gate-executor-stop.js` — SubagentStop; blocks a `devflow:executor` natural stop once when its TRD (read from the agent transcript's first prompt) has no `<id>-SUMMARY.md` in any checkout. Never when `stop_hook_active`; fails open. Escape: `DEVFLOW_SKIP_EXECUTOR_STOP_GATE=1`
- `auto-continue.js` — Stop; blocks once when a skill marker is live, no background task is running, and the last sentence announced the model's own next step without asking (questions, `/devflow:` hand-offs, waits and reports are ignored). Escape: `DEVFLOW_SKIP_AUTOCONTINUE=1`

**Draft (not registered in hooks.json):** these files ship in `hooks/` with a `DRAFT` header (v1.1 coordination-layer work) but no event fires them.
- `inject-org-context.js` — would inject org/initiative context at planning time
- `inject-handoff-results.js` — would surface completed handoff-watcher results back into the session

**Not a DevFlow hook:** the worktree-isolation guard ("This agent is isolated in the worktree…") is a Claude Code harness guard. It refuses compound Bash commands it cannot statically verify — including ones with no git in them — and no `DEVFLOW_*` escape hatch applies. Agents mitigate it by emitting one plain command per Bash call (see `agents/executor.md` → `worktree_command_discipline`).

### Marketplace (`/.claude-plugin/marketplace.json`)

Declares the marketplace and the plugins it ships. Users add the marketplace via `/plugin marketplace add AO-Cyber-Systems/devflow-claude` (or by absolute path for development).

## Context management

Full guidance: `plugins/devflow/devflow/references/context-discipline.md`. Kept
there rather than here on purpose — this file is resident on every turn of every
session (currently ~210 lines / ~26K characters), so domain detail belongs in
references and skills that load on invocation.

Measured composition (see `df-tools context`): tool results 58%, **tool-call
inputs 33%**, assistant text 6%, images 3% (`df-tools context --limit 150`,
2026-09-28; predates the pending re-mirror). `Read` is 25% of tool-result
tokens at 2,684 per call; `Bash` served 14× the calls at 514.

Policy, stated deliberately rather than inherited as defaults:

- **Do not tighten output caps.** `MAX_MCP_OUTPUT_TOKENS` (25K, warns at 10K) and
  `BASH_MAX_OUTPUT_LENGTH` (50K) are not binding — the largest observed single
  result is 26K and p99 is ~6K. Tightening buys nothing.
- **Leave `ENABLE_TOOL_SEARCH` on its default** so MCP tool schemas stay deferred
  and out of the window.
- **Microcompaction and deferred loading already run.** They are the built-in
  answer to context pressure; `/clear` and `/compact` are manual, lossy, and land
  at the worst moment. Read narrowly from the start instead.
- **The lever is behaviour, not configuration**: locate with `rg -n` and read with
  `offset`/`limit`; prefer a targeted `Edit` over writing a whole file body into a
  tool argument.

`node ~/.claude/devflow/bin/df-tools.cjs context --limit 150` recomputes all of
the above from session transcripts. It prices images per block (~1.5K tokens),
**not** by base64 length — counting base64 chars over-states images ~25× and was
the one real error in the original audit.

## Conventions

- **Module format**: CommonJS (`.cjs`). The tool is designed to work as a CLI, not a library.
- **File I/O**: Synchronous (`fs.readFileSync`/`fs.writeFileSync`) throughout df-tools.
- **Naming**: Skills are `<name>/SKILL.md`, agents are `<agent-name>.md`, hooks are `<purpose>.js`.
- **Markdown structure**: YAML frontmatter + XML-like tags (`<objective>`, `<step name="...">`, `<execution_context>`) for semantic sections within prompts.
- **File references**: Use `@path` syntax in skill/agent markdown (e.g., `@~/.claude/devflow/templates/state.md`). The home path is populated by the `sync-runtime` hook — do not use `${CLAUDE_PLUGIN_ROOT}` in `@path` references; it does not interpolate.
- **Workflow status**: Every `plugins/devflow/devflow/workflows/*.md` file carries YAML frontmatter with `status: active | legacy`. `active` = in use by skills/agents. `legacy` = superseded but kept for cross-reference.
- **Version sync**: Three files must have matching versions on every release: `package.json`, `plugins/devflow/.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json`.
- **Git commits**: `{type}({scope}): {description}` — types: feat, fix, test, refactor, perf, chore, docs.
- **Tests**: Node native test runner, test files adjacent to source with `.test.cjs` suffix.

## User-Facing Workflow

The system drives a structured development loop: **new-project** → **discuss-objective** → **plan-objective** → **execute-objective** → **verify-work** → **complete-milestone**. Each step produces files in `.planning/` that feed the next step. Execution uses wave-based parallelism where independent jobs run concurrently, each in a fresh context window.

## Intent Model: `kind` and `work`

Every project declares a `kind` (`api | app | library | ui-lib | cli | plugin`) on PROJECT.md frontmatter. Every objective declares a `work` type (`feature | port | refactor | foundation | bugfix | prototype | spike`) on OBJECTIVE.md frontmatter, or inherits PROJECT.md `default_work`. The planner reads both and applies the `(kind, work)` defaults table at `plugins/devflow/devflow/references/defaults-table.md` to derive TDD posture, planning depth, model profile, and verification rigor.

**Resolution chain (highest wins):**
1. TRD frontmatter explicit override (`type: tdd`, `confidence: high`, etc.)
2. OBJECTIVE.md `overrides` block (`tdd`, `depth`, `model_profile`)
3. CLAUDE.md user playbook directives — the planner reads `~/.claude/CLAUDE.md` and `./CLAUDE.md` for sections matching `^##.*TDD`, `^##.*Test`, `^##.*Quality`, `^##.*Scope` and applies extracted directives
4. `(kind, work)` defaults table
5. Built-in fallback (preserves pre-intent-model planner behavior)

**Resolution is exposed via `df-tools intent resolve --objective <id>`** — used by the planner agent, available for inspection. Each resolved field carries provenance metadata so users see exactly which level supplied each value.

**Migration** for projects created before this model: `/devflow:status check --migrate`, which runs `df-tools upgrade`. Setting `kind` is a `confirm` migration: `df-tools upgrade --apply --only 0006 --kind <kind>`. Each apply backs up to `~/.claude/devflow/backups/<repo>-<hash>/<timestamp>/`, outside the repo, before writing. The `upgrade-project.js` SessionStart hook applies the `auto` migrations on its own.

See `docs/PROPOSAL-kind-and-work.md` for the full design rationale.

## Where we left off (2026-10-01, branch `feat/stack-profile-loader`)

Objective 51 (GitHub migration and docs) is done: migration 0011 backfills a project onto the GitHub store with an estimate, history closes and hour-budget resume; `/devflow:gh-sync` is the store operator; objective 26 is killed (DECISION-002). Objectives 46-51 complete the GitHub system-of-record plan.

**Next:** the first real-repository backfill as a manual UAT step against a throwaway repository; an opt-out for projects that keep GitHub in mirror mode (0011 stays a pending confirm migration, W040); the multi-line `decision answer` bug; the open items in `docs/USER-GUIDE.md` (GitHub integration, Known issues).

**Still deferred:** `mcp__context7__*` cleanup in agents; Node/Rust/Python tier-2 profiles; the other UTC date sites listed in the 42-01 SUMMARY; long-term `dflang mcp` in place of these servers (`docs/PROPOSAL-stack-packs.md` §6.12). No `upgrade` migration writes `.mcp.json`: `stack mcp --write` is its only writer.
