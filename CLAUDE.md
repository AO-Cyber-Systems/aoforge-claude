# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- rename-guard:ignore-start -->
> **Transition (objective 72):** this file describes the renamed AOForge source tree. Until AOForge 3.0.0 is installed (TRD 72-21) the live runtime is the installed DevFlow 2.15.0 plugin: run `node ~/.claude/devflow/bin/df-tools.cjs`, and this repo's planning tree stays at `.planning/`. 72-22 removes this note.
<!-- rename-guard:ignore-end -->

## What This Is

AOForge is a meta-prompting, context engineering, and spec-driven development system for Claude Code. It ships as a Claude Code plugin (`aoforge@aocyber`) installed via `/plugin` or the Claude Desktop plugin UI. Fork of GSD v1.20.4, maintained by AO Cyber Systems.

## Commands

```bash
npm test                # Run tests (Node native test runner)
```

There is no lint command. Tests use `node --test` against `plugins/aoforge/aoforge/bin/aof-tools.test.cjs`.

## Publishing

Distribution is via the Claude Code plugin marketplace. The repo's `.claude-plugin/marketplace.json` and `plugins/aoforge/.claude-plugin/plugin.json` declare the plugin; users add the marketplace by repo slug (`AO-Cyber-Systems/aoforge-claude`) and install it. There is no npm publish step. Tag and release cadence still follow the `v*` convention so the changelog gate continues to work.

## Architecture

### Plugin Layout (`plugins/aoforge/`)

The plugin is the single source of truth for distribution. Layout:

```
plugins/aoforge/
├── .claude-plugin/plugin.json    # plugin manifest (name, version, statusLine)
├── skills/<name>/SKILL.md        # 34 user-invocable slash commands
├── agents/<agent>.md             # 13 subagent prompts
├── hooks/
│   ├── hooks.json                # event registrations (auto-loaded)
│   ├── sync-runtime.js           # SessionStart: mirrors aoforge/ → ~/.claude/aoforge/
│   └── *.js                      # 7 other hooks (statusline, gates, verifiers)
└── aoforge/                      # runtime mirrored to ~/.claude/aoforge/ on session start
    ├── bin/aof-tools.cjs          # central CLI invoked by skills/agents
    ├── bin/lib/*.cjs             # aof-tools internals
    ├── workflows/<name>.md       # workflow bodies referenced via @~/.claude/aoforge/workflows/...
    ├── references/<name>.md      # static reference docs read during execution
    ├── templates/<name>.md       # files copied into user projects' .aoforge/ dirs
    └── stack-profiles/<id>.md    # bundled tier-2 profiles (go, dart, flutter)
```

Skill `@path` references (`@~/.claude/aoforge/...`) do not interpolate `${CLAUDE_PLUGIN_ROOT}`, so the `sync-runtime` SessionStart hook mirrors `${CLAUDE_PLUGIN_ROOT}/aoforge/` to `~/.claude/aoforge/` whenever the version or the content digest differs. The `.plugin-version` and `.plugin-digest` marker files prevent redundant copies.

### Core Tool: `plugins/aoforge/aoforge/bin/aof-tools.cjs`

The central CLI utility used by ~50 skill and agent files. CommonJS module invoked as `node ~/.claude/aoforge/bin/aof-tools.cjs <command> [args]` (skills resolve the path via the home mirror). A global `--cwd <dir>` flag, valid before any command name, `chdir`s before dispatch so a command can target a path other than the caller's cwd (used by `/aoforge:adopt [path]`). Provides:

- **State operations** — `state load`, `state update`, `state get`, `state patch`, `state-snapshot`, `state advance-job [--objective N]` (with `--objective`, position and Status come from the objective's TRD and SUMMARY files on disk); `state update-progress` rewrites or adds the Progress line under `## Current Position`, else exits 1; `state rekey --from <old checkout path> [--to <new path>] [--dry-run] [--raw]` copies repo-keyed runtime state (KEYED_STATE: estimate run state and history, awareness, hook markers, outbox journal without its `.lock`, backups plus the registry entry, planning drafts) from a moved checkout's old key to its new one, merging and never deleting (`lib/state-rekey.cjs`, TRD 72-07)
- **Objective operations** — `objective next-decimal`, `objective add/insert/remove/complete`; `milestone complete <v> --dry-run` previews and a re-run keeps the existing entry and archives. Every writing command rejects an unknown flag with exit 1 before it runs (`lib/flag-guard.cjs` + `lib/flag-spec.cjs`, kept complete by `flag-spec.repo.test.cjs`).
- **Roadmap operations** — `roadmap get-objective`, `roadmap analyze`, `roadmap update-job-progress`
- **Compound init commands** — `init execute-objective`, `init plan-objective`, `init new-project`, etc.
- **Model resolution** — `resolve-model <agent-type>` returns the model for an agent based on the active profile (quality/balanced/budget)
- **Validation** — `validate consistency`, `validate health [--repair]`, `validate requirements [--objective N]` (read-only W065 scan, `lib/requirements-agreement.cjs`); `validate health` Check 19 reports E006/W064 (tracked or stale `.aoforge/.skill-active`, `lib/skill-marker-health.cjs`, `--repair` untracks only it) and Check 20 W065; W066 legacy-planning-dir (only the legacy planning directory, fix `upgrade --apply --only 0012`; or both directories, the legacy one ignored) and W067 legacy-config-key (the upgrade stamp only under the legacy key, fix `--only 0013`) come from `lib/planning-layout.cjs`, advisory, never repaired
- **Config & commit** (Unreleased) — `config-get <key>` returns the documented `templates/config.json` default (exit 0) for a known-but-unset key, never overriding a legacy or alias form the user set; unknown keys still error. `commit --files` records a staged removal of a now-ignored path (git rm --cached) with a whole-index commit, and refuses if anything outside `--files` is staged.
- **GitHub integration** (1.29+, opt-in via `github.enabled` in `.aoforge/config.json`) — `gh sync`, `gh pull`, `gh outbox`, `gh trd`, `gh pr`, `gh orphans`, `gh setup`, `gh status`, `gh rebrand [--repo o/r] [--apply|--dry-run] [--raw]` (TRD 72-16, `lib/gh-rebrand.cjs`: dry run by default; renames one repository's pre-rename labels (merged into an existing AOForge label with a destructive delete), managed issue/PR/comment markers and wording (only the product name outside managed sections; PRESERVE tokens and the repo slug never), wiki pages, ruleset check contexts (repository admin, else the section reports "needs admin") and, in a checkout, the managed caller, docs backend, PR template block and config labels; `--apply` stops at the first failure and resumes by re-planning, refreshes outbox bases in store mode, never commits; flush the outbox first and set `AOFORGE_APP_*` by hand). **Store mode** (`github.store: true`, default false) makes GitHub the system of record: issues, TRD sub-issues, comments and wiki pages hold the planning state, every verb queues its write in the outbox, and `.aoforge/` is a cache that `gh pull --all` rebuilds. Store off is a one-way mirror. In store mode each objective runs on one linked branch and PR, and `aof-tools commit` refuses the default and unlinked branches. Escapes: `AOFORGE_SKIP_GH_GATE=1` (logged as gate gh), `AOFORGE_SKIP_GH_FLUSH_HOOK=1`. Module families: `lib/gh*.cjs` (client, mirror, store and outbox, PR, gate and checks, setup, backfill). `/aoforge:gh-sync migrate` moves a project onto the store. Detail (outbox and PR exit codes, setup payloads, W057-W061, App keys, open items): `docs/USER-GUIDE.md` → GitHub is the system of record.
- **Planning verbs** (Unreleased) — every planning write goes through one verb taking `--from <path|->`: `plan put-trd|push`, `summary post|checkpoint`, `verification post`, `doc put`, `objective put|set-status`, `todo add|complete|sync`, `debug put|resolve`, `quick put|summary`, `decision open|answer`, `milestone put|complete` (`todo sync` merges a session's task-list todos into the archive; the todo-sync Stop hook runs it); plus `planning mode`, `planning draft <rel>` (reseeds a stale draft and keeps `<draft>.stale`; `doc put` refuses one, `lib/planning-drafts.cjs`) and `planning import [--dry-run]` (with the store off, a preview of the backfill and its request estimate). D-01 invariant: with `github.store` off every verb writes today's `.aoforge/` file byte for byte with zero `gh` calls and `.aoforge/` stays tracked; in store mode (set in the main checkout's config) it writes the cache, records the ledger and queues the GitHub write. `summary checkpoint|post` write the checkout that runs them in local mode (a worktree commits its own SUMMARY) and the main checkout's cache in store mode. `validate health` Check 15 reports W055 and W056. `planning-writes.repo.test.cjs` fails CI on any direct planning-write instruction.
- **Telemetry & audit** (2.5+) — `context` (context composition), `session-audit` (blocking-event classification), `transcript-export` (compact per-session index before retention deletes transcripts), `telemetry [--scan [--limit N] [--since YYYY-MM-DD] [--root dir]]` (one status-facing view with advisories, including documentation staleness; `--scan` adds a transcript session audit of blocking events and rejects an unknown flag), `override --gate <g> --reason <why>` (structured, logged gate override; `override --list` reads the log). Implemented in `lib/context-audit.cjs`, `lib/session-audit.cjs`, `lib/transcript-export.cjs`, `lib/telemetry.cjs`, `lib/override.cjs`, fronted by `lib/audit-cli.cjs`.
- **Documentation correctness** (Unreleased) — `DEPRECATION_MAP` + `REMOVED_COMMANDS` (`lib/skill-route.cjs`) are the only rename source; `lib/doc-refs.cjs` resolves them. `doc-refs.repo.test.cjs` fails CI on stale command references. Migration 0007 fixes them in a project's CLAUDE.md AOFORGE block and STATE.md. `validate health` Check 14 / `aof-tools validate docs` report W050-W054 (advisory, never repaired).
- **Changelog** (1.30+) — `changelog update --version vX.Y.Z [--from <ref> --to <ref>] [--dry-run]`, `changelog check <version>`. Implemented in `lib/changelog.cjs`; generates Keep-a-Changelog entries from conventional-commit history.
- **Upgrade** (Unreleased) — `upgrade [--check|--apply] [--only id] [--confirm] [--path dir] [--kind k] [--default-work w] [--global]`. Brings a project forward in place and stamps `.aoforge/config.json` `aoforge{version, migrations_applied, upgraded_at}`. The migrations are detection-based and idempotent (`lib/migrations/NNNN-*.cjs`, `auto` | `confirm`), with backups under `~/.claude/aoforge/backups/`. Migration 0008 (auto) gitignores and untracks `.aoforge/.progress-guard.json` / `.awareness-cache.json`, keeping the working copies; it covers nested `**/.aoforge/` runtime state too. Migration 0009 (auto) converts `.aoforge/.gh-mapping.json` to v3 and normalises `.gh-sync-state.json` keys. Migration 0010 (confirm, store mode only) gitignores and untracks the planning cache, and skips while a backfill is pending. Migration 0011 (confirm, resumable) backfills the planning history onto GitHub, turns store mode on and hands off to 0010; a stop on the hourly budget is resumed by re-running it. The 3.0.0 rename adds three auto migrations: 0012 moves the legacy planning directory to `.aoforge/` with git mv (backup first; legacy ignore lines kept beside their `.aoforge/` twins; deferred, with one upgrade-deferred-0012 notice and `report.deferred`, on tracked changes, an operation in progress or an existing `.aoforge/`), 0013 renames the legacy config stamp key to `aoforge{}`, and 0014 moves a project CLAUDE.md managed block to the AOFORGE markers and names (text outside never touched). `--global` upgrades `~/.claude` instead; since template v4 it moves a pre-rename block with no confirmation and offers the rewrite of hand-written lines outside it as a diff (`outside_diff`, `--raw`) that only `--global --confirm` writes. `--prune [--dry-run]` runs the backup pruner unthrottled and prints its report; `--register [--path dir]` registers a repo for pruning without a full upgrade. Implemented in `lib/upgrade.cjs`, `lib/upgrade-cli.cjs`, `lib/migrations/`, `lib/managed-block.cjs`, `lib/global-upgrade.cjs` and `lib/backup-prune.cjs`. `validate health` reports W040 when a project is behind.
- **Estimation data** (Unreleased) — `tokens trd|stamp|backfill|coverage` reads per-TRD executor token usage from transcripts (the backfill form is a dry run unless `--write`; `tokens coverage [--milestone|--objective]` reports forward-stamp coverage, live over counted, floored and read-only); `calibrate [--paths] [--out] [--rates] [--window <N|all>] [--minutes <task_sum|trd_level>] [--through <N>] [--dry-run]` writes per-task-class p50/P90 minutes, tokens and dollars to `~/.claude/aoforge/calibration.json` (override `AOFORGE_CALIBRATION_PATH`), byte-identical on unchanged inputs. `calibrate` also measures agent overhead (`--root`, `--no-overhead`); calibration version 2 adds `agent_overhead` and `objective_level`, version 3 adds the method block (minutes, window, cutoff). `estimate task|trd|objective|milestone` prints median/P90 minutes, tokens and dollars with sample count and confidence (correlated-sum composition, wave max, gap-closure mixture); `estimate start|wave|finish` keep the run state in `~/.claude/aoforge/state/estimates/` (override `AOFORGE_ESTIMATE_STATE_DIR`) that the status line reads and archive finished runs to `history/<repo-key>/` beside it; `estimate backtest <N[,N...]> [--calibration f] [--raw]` compares estimates with measured minutes and priced tokens and prints the EST-08 verdict (objective 64: not met, `64-ACCURACY-REPORT.md`). `calibrate` keeps the 10 most recent objectives with samples per project by default and `--window all` keeps all history; default changed but EST-08 is still not met (minutes median ratio 1.348 to 1.238 on 59-63, five leave-future-out objectives, cost P90 coverage 78%, not prospective). Objective 67 froze the minutes method for EST-11 (DECISION-003: trd_level, window 10, through 66; validation in `67-VALIDATION.md`). Rates live in `references/model-rates.json`. Implemented in `lib/token-usage.cjs`, `token-backfill.cjs`, `tokens-cli.cjs`, `token-coverage.cjs`, `calibration-inputs.cjs`, `calibrator.cjs`, `calibrate-cli.cjs`, `trd-identify.cjs`, `agent-overhead.cjs`, `estimate-math.cjs`, `estimate.cjs`, `estimate-rollup.cjs`, `estimate-milestone.cjs`, `estimate-format.cjs`, `estimate-cli.cjs`, `estimate-run-store.cjs`, `estimate-backtest.cjs`. Detail: `docs/USER-GUIDE.md` → Estimation data, Estimates.
- **Adopt** (Unreleased) — `adopt preflight|begin|scaffold|report [--cwd dir]`. Unattended bootstrap of an existing repo into an AOForge project: preflight checks state/cleanliness/branch, scaffold writes config/STATE/`state.json`/ROADMAP and the CLAUDE.md managed block then stamps via `upgrade --apply`, report writes `.aoforge/ADOPT-REPORT.md`. Idempotent — a half-finished adopt resumes. Implemented in `lib/adopt.cjs`, `lib/adopt-cli.cjs` and `lib/repo-state.cjs` (the one aoforge/greenfield/brownfield/scratch detector shared with `project-state.cjs` and `init new-project`). Driven end-to-end by `skills/adopt/SKILL.md` + `workflows/adopt.md`.
- **Doctor** (Unreleased) — `doctor [--fix] [--json] [--path dir] [--global]`. Read-only by default. Checks live in `lib/doctor-checks/NN-<id>.cjs` (10-19 global install, 20-29 project, 30-39 state hygiene, including 13 (model-profiles, which also flags a superseded model id), 14 (skill-requires), 26 (checks-workflow-pin), 23 (skill-markers, which also catches a tracked marker and owns E006/W064, check 22 defers them) and 33 (decision-resolution, which repairs decisions flattened by the pre-52 writer); for the 3.0.0 rename, 15 (legacy-df-install: legacy-prefixed skills/agents under `~/.claude`, fix moves them into `backups/legacy-<ts>/`), 16 (legacy-plugin-runtime: the old plugin still enabled (report-only), the old runtime home unmigrated or left over (fix: one step per run, migrate then move it into `backups/legacy-<old runtime dir>-runtime-<ts>/`, refused while the old plugin is enabled), legacy env vars (report-only)), 27 (legacy-planning-layout: owns W066/W067, check 22 defers them, report-only) and 26's legacy branch (a pre-rename managed caller gets W062 with `gh rebrand --dry-run`, never a re-pin)); `validate health` Check 17 reports W062 (stale checks-workflow pin) and Check 18 W063 (superseded model id); the contract is in `doctor-checks/README.md`. `--fix` applies only safe, reversible fixes and re-runs every check; it refuses index-changing fixes while unrelated changes are staged (`lib/doctor-git.cjs`) and never commits. It composes validate health / upgrade / backup-prune / the stores rather than re-implementing them. Plugin cache dirs are report-only. Implemented in `lib/doctor.cjs`, `lib/doctor-cli.cjs`, `lib/doctor-git.cjs`, `lib/doctor-checks/`. Driven by `skills/doctor/SKILL.md`.
- **Merge driver** (Unreleased) — `merge-driver install [--check]|uninstall|resolve <path>|state-json`. Per-clone, nothing committed: a JSON-aware 3-way merge for `.aoforge/state.json` and union for `STATE_ARCHIVE.md` so parallel wave merges do not conflict. The recorded driver is a fail-safe wrapper (a missing binary degrades to an ordinary conflict) pointing at the main checkout's or the mirror's aof-tools; the execute-objective workflow installs it and falls back to `merge-driver resolve <path>`. Implemented in `lib/state-merge.cjs`, `lib/merge-driver-cli.cjs`. Detail: `docs/USER-GUIDE.md` → Parallel wave merges.
- **Stack profile** (2.11+, drafter Unreleased) — `stack resolve|context|validate|command|init|verify [--run [--allow-services]]|report|mcp [--write]`. `.aoforge/STACK.md` resolves over bundled general → tier-2 → project → component. `stack init` drafts from CI/runner/manifest evidence (writes only with `--write`; a gate's `--self-test` step never beats the gate; a lint target adding linters such as buf lint is kept); `stack verify` checks each command, `--run` executes safe keys only and is effect-based (snapshot/restore around each gate; Dart/Flutter gates halt after a mutation; Flutter runs with `--no-pub`; a gate with a service signal (its text, the CI job that runs it, or for test/e2e a `.env.test` file) is skipped `env_required` unless `--allow-services`; a build gate's new files under bin/build/dist/out/target are removed and listed as `build_outputs` without halting); `stack report` proposes to `.aoforge/STACK-REPORT.md`; `stack mcp --write` is the only writer of the opt-in `.mcp.json`. Bundled tier-2 profiles live in `aoforge/stack-profiles/` (mirrored by sync-runtime); user/org overrides in `~/.claude/aoforge/stacks/<id>.md` are never mirrored over. Modules: `lib/stack-profile.cjs` + `stack-evidence|ci|shell|classify|runners|detect|draft|verify|report|mcp|render.cjs`. Guide: `templates/stack.md`.
- **Rename shims** (3.0.0, objective 72) — `lib/legacy-names.cjs` is the only module that spells the pre-rename names: `NAMES`, `LEGACY`, `PRESERVE` (other products and the docs domain, never rewritten) and `SHIM_REMOVAL` ("the release after 3.0.0"); everything else builds them from it, and `rename-guard.repo.test.cjs` fails CI on a legacy name outside its ALLOW list and the ignore regions of `IGNORE_REGION_FILES` (this file, USER-GUIDE, the migration guide and its site page, the site `_redirects`). `lib/compat.cjs` holds the one-release shims, new name first: `aliasLegacyEnv` (every hook and the CLI call it first), `planningDirName`/`planningRoot`/`findProjectRoot` (`.aoforge/` then the legacy directory), `isOwnAgentType`/`isOwnExecutor`, `userDotFile`, `runtimeHome`/`legacyRuntimeHome`. They, migrations 0012/0013, the dual-namespace GitHub readers and the pointer plugin are removed in the release after 3.0.0. User-facing guide: `docs/MIGRATING-TO-AOFORGE.md`.
- **Built-in sweep** (Unreleased) — `builtin-sweep.repo.test.cjs` fails CI on a discrete-choice prose prompt outside AskUserQuestion, an AskUserQuestion schema break, missing TaskCreate/TaskUpdate progress in micro/quick/build/debug/plan-objective/verify-work, a missing plan-mode draft review in plan-objective/new-project/milestone complete, or an undeclared built-in (ExitPlanMode is never pre-approved). Inventory: `docs/built-in-sweep.md`; rules: `references/built-ins.md`.

Model profiles are loaded from `plugins/aoforge/aoforge/references/model-profiles.json` (via `bin/lib/helpers.cjs`), which maps each agent to its opus/sonnet/haiku assignment per profile tier. The JSON also pins the concrete model id for each tier — keep those ids current when models ship; a stale id resolves to a model that never runs. Doctor check 13 and `validate health` W063 flag a pin that `references/model-rates.json` shows superseded.

### Skills (`plugins/aoforge/skills/<name>/SKILL.md`)

User-invocable slash commands (e.g., `/aoforge:new-project`). Each skill is a directory containing a single `SKILL.md` with:

- **YAML frontmatter** — `name`, `description`, `argument-hint`, `allowed-tools`
- **XML-structured body** — `<objective>`, `<execution_context>` (with `@path` file references), `<process>`, `<context>`
- Skills are thin orchestrators — they load state via aof-tools, then spawn agents via the Task tool

### Agents (`plugins/aoforge/agents/*.md`)

Subagent prompt files (13 agents: planner, executor, verifier, debugger, etc.). Each has:

- **YAML frontmatter** — `name`, `description`, `tools`, `color`
- **XML-structured body** — `<role>`, `<philosophy>`, `<execution_flow>` with named `<step>` elements
- Agents are spawned by skills with specific model assignments from the profile table

### Templates (`plugins/aoforge/aoforge/templates/`)

Markdown and JSON templates that get copied into user projects' `.aoforge/` directories by aof-tools. Key files:

- `config.json` — workflow settings (mode, depth, parallelization, gates, safety)
- `state.md` — living project memory (position, metrics, decisions, blockers)
- `project.md` — project context (what, why, constraints, decisions)
- `roadmap.md`, `requirements.md`, `milestone.md` — planning documents
- `job-prompt.md` — JOB.md structure for execution
- `summary*.md` — post-execution summary templates

### References (`plugins/aoforge/aoforge/references/`)

Static reference documents that agents read during execution: model profiles, verification patterns, TDD workflow, git conventions, checkpoint handling, UI branding, and the design set — `design-craft.md`, `design-tells.md`, `design-preflight.md`, `design-redesign.md`, `design-stack-web.md`, `design-stack-flutter.md` (consumed by the `eden-ui-web` / `eden-ui-flutter` design skills) plus `full-output.md` (consumed by the executor). All seven are derived from taste-skill under MIT — see `NOTICE.md`.

### Hooks (`plugins/aoforge/hooks/`)

Node.js hooks declared in `plugins/aoforge/hooks/hooks.json` and auto-registered when the plugin is enabled. All hook commands use `${CLAUDE_PLUGIN_ROOT}` for path resolution.

**Runtime sync:**
- `sync-runtime.js` — SessionStart; mirrors `${CLAUDE_PLUGIN_ROOT}/aoforge/` to `~/.claude/aoforge/` when the bundled plugin version differs from the cached `.plugin-version`, or when a same-version content change alters the bundle digest (`.plugin-digest`, from `lib/runtime-digest.cjs`). After a successful mirror, it runs the global upgrade (`lib/global-upgrade.cjs`). That moves the legacy `df-*` skills/agents to a backup and maintains the managed `~/.claude/CLAUDE.md` AOForge block. The first adoption over a hand-written section waits for `aof-tools upgrade --global --confirm`. On the first AOForge session it also carries the pre-rename runtime home's state into `~/.claude/aoforge/` once (`lib/runtime-state-migrate.cjs`: copies calibration, audit log, transcript index, `stacks/` and `state/**`, moves `state/outbox` and `backups/` per child, never overwrites; marker `.legacy-state-migrated.json` written last, so a failure retries next session; an error is one `[aoforge] runtime state migration skipped:` stderr line).

**Session context (SessionStart / UserPromptSubmit):**
- `awareness-cache-populate.js` — SessionStart; warms the cross-repo awareness cache, kept out of the repo at `~/.claude/aoforge/state/awareness/<repo-key>.json` (`lib/awareness-store.cjs`; override `AOFORGE_AWARENESS_DIR`)
- `classify-session.js` — SessionStart; classifies the session for routing/telemetry
- `route-results.js` — UserPromptSubmit; emits queued handoff command results
- `upgrade-project.js` — SessionStart; upgrades a behind project in place (bundled aof-tools; applies auto migrations, background-commits only the changed files; skip rules, though runtime-state paths (migration 0008) are exempt from the dirty-before skip; notices via route-results). Also runs the throttled backup prune (once per 24h, AOForge project or not) as the first step of `main()`, then starts a detached background `aof-tools transcript-export` at most once per 24h (step 0b, `lib/transcript-export-schedule.cjs`, stamp under `~/.claude/aoforge/state/transcript-export/`). Escapes: `AOFORGE_SKIP_UPGRADE=1` (upgrade only), `AOFORGE_SKIP_PRUNE=1` (prune only), `AOFORGE_SKIP_TRANSCRIPT_EXPORT=1` (export only)
- `coexistence-guard.js` — SessionStart; when the pre-rename plugin (`LEGACY.plugin` in `lib/legacy-names.cjs`) is still installed and enabled beside AOForge, queues one global notice per session naming its version and the exact `claude plugin disable` command (`lib/coexistence.cjs`, objective 72). Never edits settings. Escape: `AOFORGE_SKIP_COEXISTENCE=1`

**Observability (warn-only):**
- `statusline.js` — StatusLine (declared in plugin.json `statusLine`); renders model, task, context usage and, while an objective builds, estimated time remaining from the estimate run state
- `verify-completion.js` — Stop; checks SUMMARY.md evidence
- `verify-commits.js` — SubagentStop; warns on no commits in last 10min, and in autonomous mode blocks an `aoforge:executor` (for one release also the pre-rename namespace's executor, `compat.isOwnExecutor`) stop once per agent (top-level `{decision, reason}`, objective 70)
- Their autonomous retry and resume markers live in `~/.claude/aoforge/state/hook-markers/<repo-key>/` (`lib/hook-marker-store.cjs`; override `AOFORGE_HOOK_MARKER_DIR`). `hooks/planning-writes.audit.test.js` fails CI if any hook writes a runtime dotfile into `.aoforge/`; the allowlist is `.skill-active`, `.edit-override` and `.aoforge-notices.json`.
- `gh-flush.js` — PostToolUse(Bash) + Stop; store mode only: flushes the outbox after `aof-tools commit` and at Stop, reports pending/halted writes on both and cache drift (W055) at Stop only; never blocks, fails open. Escape: `AOFORGE_SKIP_GH_FLUSH_HOOK=1`
- `todo-sync.js` — Stop; merges the session's `/aoforge:todo` items (TaskCreate/TaskUpdate or TodoWrite calls in the transcript) into the todo archive with `todo sync`'s library (`.aoforge/todos/`, or queued for the GitHub store); idempotent, never blocks, keeps no state, fails open. Escape: `AOFORGE_SKIP_TODO_SYNC=1`

**Enforcement (active gates):**
- `route-intent.js` — UserPromptSubmit; injects skill-routing reminders when AOForge project is detected
- `gate-commits.js` — PreToolUse(Bash); blocks raw commit invocations. Detection is invocation-aware (TRD 27-04): heredoc bodies and quoted arguments are stripped first, so text that merely *mentions* the command is not gated. Allows merge/rebase/cherry-pick completion (MERGE_HEAD, REBASE_HEAD, rebase-merge/-apply, CHERRY_PICK_HEAD in the per-worktree git dir) and an inline `AOFORGE_ALLOW_RAW_COMMIT=1 git commit …` prefix; an exported variable never reaches the hook (objective 44). Escape: `AOFORGE_ALLOW_RAW_COMMIT=1` in the env Claude Code was launched from
- `gate-edits.js` — PreToolUse(Edit/Write/MultiEdit); **strict DENY by default** in ambient mode (AOForge project + no skill active). Allows edits when a live `.aoforge/.skill-active` marker exists — resolved from **both** the local `.aoforge/` and the MAIN checkout's, so worktree-isolated agents are not denied by a gitignored marker they can never see (TRD 27-01) — or the PreToolUse payload's `agent_type` starts with `aoforge:` (objective 44; for one release also the pre-rename agent namespace, `compat.isOwnAgentType`, TRD 72-10), or the user prompt contains an override phrase (`skip aoforge`, `just edit`, `bypass aoforge`, `force edit`), or `AOFORGE_SKIP_EDIT_GATE=1` is set in the environment Claude Code was launched from. Markers carry `expires_at` (8h default). Targets outside the project root (session scratchpad, `/private/tmp`) are never gated (TRD 27-02). Severity is per-project via `.aoforge/config.json` → `gates.editGate`: `strict` (default) | `warn` | `off`. In store mode, cache/generated `.aoforge/` paths are denied for everyone (skill markers and aoforge agents included) with the verb to use; config.json, STACK.md and runtime files are allowed (needs an installed plugin carrying objective 48). Bash writes to the same files are gated by `gate-bash-writes.js`.
- `gate-bash-writes.js` — PreToolUse(Bash); denies a Bash write to a tracked source file in ambient mode (redirect, `tee`, `sed -i`, `perl -i`, `cp`/`mv`, inline python/node), the same as Edit/Write (DECISION-001, objective 60). Mentions (heredoc bodies, quoted args) and writes to `.aoforge/`, `*.md`, untracked files, paths outside the project and unresolvable targets are never gated. Same escapes as gate-edits (live skill marker, `aoforge:*` agent, override phrase); the override marker is consumed only by a write that would be gated. Severity is the least of `gates.editGate` and `gates.bashEditGate` (`strict` deny | `warn` ask | `off`). With no `bashEditGate` key the default is `warn` (`BASH_EDIT_GATE_DEFAULT`), measured at 633/17,957 = 0.035251 of ambient Bash calls (an upper bound, above the 0.02 threshold), so `strict` is opt-in; `gates.editGate` `warn` softens it to ask and `off` disables it. Escape: `AOFORGE_SKIP_EDIT_GATE=1` only in the environment Claude Code was launched from, never as an inline command prefix (a hook runs in Claude Code's own process); needs an installed plugin carrying objective 60
- `gate-skill-requires.js` — UserPromptExpansion + PreToolUse(Skill); refuses a `/aoforge:<skill>` whose SKILL.md `requires:` names a tool that is not on PATH (block on a typed command, deny on a Skill call), naming the install hint and `/aoforge:doctor` (check `skill-requires`). Not project-scoped; fails open. Escape: `AOFORGE_SKIP_SKILL_REQUIRES=1`, only in the environment Claude Code is launched from; needs an installed plugin carrying objective 61
- `gate-interactive.js` — PreToolUse(Bash); intercepts TTY-requiring commands and routes them to the handoff watcher
- `guard-no-progress.js` — PreToolUse(all tools); detects the same tool called with identical arguments repeatedly. Warns on stderr at 3 repeats, escalates to `ask` at 5, resets whenever the agent varies its approach. Step limits cannot do this — they fire only after the budget is spent. Deliberately **not** wired to tool errors: those run 3.6–4.3% at every model tier and are dominated by environment friction (TRD 28-04). State is per-session under `~/.claude/aoforge/state/progress-guard/` (never in the repo; override `AOFORGE_PROGRESS_GUARD_DIR`). Escape: `AOFORGE_SKIP_PROGRESS_GUARD=1`
- `changelog-on-tag.js` — PreToolUse(Bash); blocks `git tag -a vX.Y.Z` if `CHANGELOG.md` lacks `## [X.Y.Z]`. Escape: `AOFORGE_SKIP_CHANGELOG_GATE=1`
- `gate-executor-stop.js` — SubagentStop; blocks an `aoforge:executor` (or the pre-rename namespace's executor) natural stop once when its TRD (read from the agent transcript's first prompt) has no `<id>-SUMMARY.md` in any checkout, or its final SUMMARY has no `tokens_input`/`tokens_output` (objective 66). Never when `stop_hook_active`; fails open. Escape: `AOFORGE_SKIP_EXECUTOR_STOP_GATE=1`
- `auto-continue.js` — Stop; blocks once when a skill marker is live, no background task is running, and the last sentence announced the model's own next step without asking (questions, `/aoforge:` hand-offs, waits and reports are ignored). Escape: `AOFORGE_SKIP_AUTOCONTINUE=1`

**Draft (not registered in hooks.json):** these files ship in `hooks/` with a `DRAFT` header (v1.1 coordination-layer work) but no event fires them.
- `inject-org-context.js` — would inject org/initiative context at planning time
- `inject-handoff-results.js` — would surface completed handoff-watcher results back into the session

**Not an AOForge hook:** the worktree-isolation guard ("This agent is isolated in the worktree…") is a Claude Code harness guard. It refuses compound Bash commands it cannot statically verify — including ones with no git in them — and no `AOFORGE_*` escape hatch applies. Agents mitigate it by emitting one plain command per Bash call (see `agents/executor.md` → `worktree_command_discipline`).

### Marketplace (`/.claude-plugin/marketplace.json`)

Declares the marketplace and the plugins it ships. Users add the marketplace via `/plugin marketplace add AO-Cyber-Systems/aoforge-claude` (or by absolute path for development).

It also ships the pointer plugin: the final 3.0.0 release of the pre-rename plugin (its directory under `plugins/`, named by `LEGACY.slug`). It has a SessionStart notice that goes quiet once `~/.claude/aoforge/.plugin-version` exists, and one forwarding skill per AOForge command, generated by `node scripts/gen-pointer-skills.cjs --write` (`--check` runs in the suite; rerun `--write` whenever an AOForge skill's name, description or argument-hint changes). It ships no agents, gates or runtime. Its version stays at or above `coexistence.POINTER_MAJOR` (3), and it is removed in the release after 3.0.0 together with `scripts/gen-pointer-skills*`, its marketplace entry and package.json test glob, and the rename guard's ALLOW entries for it.

## Context management

Full guidance: `plugins/aoforge/aoforge/references/context-discipline.md`. Kept
there rather than here on purpose — this file is resident on every turn of every
session (currently ~210 lines / ~26K characters), so domain detail belongs in
references and skills that load on invocation.

Measured composition (see `aof-tools context`): tool results 58%, **tool-call
inputs 33%**, assistant text 6%, images 3% (`aof-tools context --limit 150`,
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

`node ~/.claude/aoforge/bin/aof-tools.cjs context --limit 150` recomputes all of
the above from session transcripts. It prices images per block (~1.5K tokens),
**not** by base64 length — counting base64 chars over-states images ~25× and was
the one real error in the original audit.

## Conventions

- **Module format**: CommonJS (`.cjs`). The tool is designed to work as a CLI, not a library.
- **File I/O**: Synchronous (`fs.readFileSync`/`fs.writeFileSync`) throughout aof-tools.
- **Naming**: Skills are `<name>/SKILL.md`, agents are `<agent-name>.md`, hooks are `<purpose>.js`.
- **Markdown structure**: YAML frontmatter + XML-like tags (`<objective>`, `<step name="...">`, `<execution_context>`) for semantic sections within prompts.
- **File references**: Use `@path` syntax in skill/agent markdown (e.g., `@~/.claude/aoforge/templates/state.md`). The home path is populated by the `sync-runtime` hook — do not use `${CLAUDE_PLUGIN_ROOT}` in `@path` references; it does not interpolate.
- **Workflow status**: Every `plugins/aoforge/aoforge/workflows/*.md` file carries YAML frontmatter with `status: active | legacy`. `active` = in use by skills/agents. `legacy` = superseded but kept for cross-reference.
- **Version sync**: Three files must have matching versions on every release: `package.json`, `plugins/aoforge/.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json`.
- **Git commits**: `{type}({scope}): {description}` — types: feat, fix, test, refactor, perf, chore, docs.
- **Tests**: Node native test runner, test files adjacent to source with `.test.cjs` suffix.

## User-Facing Workflow

The system drives a structured development loop: **new-project** → **discuss-objective** → **plan-objective** → **execute-objective** → **verify-work** → **complete-milestone**. Each step produces files in `.aoforge/` that feed the next step. Execution uses wave-based parallelism where independent jobs run concurrently, each in a fresh context window.

## Intent Model: `kind` and `work`

Every project declares a `kind` (`api | app | library | ui-lib | cli | plugin`) on PROJECT.md frontmatter. Every objective declares a `work` type (`feature | port | refactor | foundation | bugfix | prototype | spike`) on OBJECTIVE.md frontmatter, or inherits PROJECT.md `default_work`. The planner reads both and applies the `(kind, work)` defaults table at `plugins/aoforge/aoforge/references/defaults-table.md` to derive TDD posture, planning depth, model profile, and verification rigor.

**Resolution chain (highest wins):**
1. TRD frontmatter explicit override (`type: tdd`, `confidence: high`, etc.)
2. OBJECTIVE.md `overrides` block (`tdd`, `depth`, `model_profile`)
3. CLAUDE.md user playbook directives — the planner reads `~/.claude/CLAUDE.md` and `./CLAUDE.md` for sections matching `^##.*TDD`, `^##.*Test`, `^##.*Quality`, `^##.*Scope` and applies extracted directives
4. `(kind, work)` defaults table
5. Built-in fallback (preserves pre-intent-model planner behavior)

**Resolution is exposed via `aof-tools intent resolve --objective <id>`** — used by the planner agent, available for inspection. Each resolved field carries provenance metadata so users see exactly which level supplied each value.

**Migration** for projects created before this model: `/aoforge:status check --migrate`, which runs `aof-tools upgrade`. Setting `kind` is a `confirm` migration: `aof-tools upgrade --apply --only 0006 --kind <kind>`. Each apply backs up to `~/.claude/aoforge/backups/<repo>-<hash>/<timestamp>/`, outside the repo, before writing. The `upgrade-project.js` SessionStart hook applies the `auto` migrations on its own.

See `docs/PROPOSAL-kind-and-work.md` for the full design rationale.

## Where we left off (2026-10-04, branch `feat/stack-profile-loader`)

Objective 53 (worktree and health hygiene) is done: local-mode `summary` verbs write the checkout that commits them, named TRDs pair with their SUMMARY everywhere (`helpers.trdKey`), `micro commit` goes through `aof-tools commit` and its store-mode gate, the documented wave merge passes `gate-commits` (one command per call), the global template is v3 with `/aoforge:doctor`, and `doctor` check 33 repairs pre-52 flattened decisions. Objectives 46-52 completed the GitHub system-of-record plan.

**Next:** the first real-repository backfill as a manual UAT step against a throwaway repository; release 42-53 and re-sync the runtime; apply migration 0009 in this repo (`aof-tools upgrade --apply --only 0009`); the open items in `docs/USER-GUIDE.md` (GitHub integration, Known issues).

**Still deferred:** `mcp__context7__*` cleanup in agents; Node/Rust/Python tier-2 profiles; the other UTC date sites listed in the 42-01 SUMMARY; long-term `dflang mcp` in place of these servers (`docs/PROPOSAL-stack-packs.md` §6.12). No `upgrade` migration writes `.mcp.json`: `stack mcp --write` is its only writer.
