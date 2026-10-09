---
kind: plugin
default_work: feature
org: AO-Cyber-Systems
github_repo: AO-Cyber-Systems/aoforge-claude
---

# AOForge

## What This Is

AOForge is a meta-prompting, context engineering, and spec-driven development system for Claude Code. It ships as a Claude Code plugin (`aoforge@aocyber`) installed via `/plugin` or the Claude Desktop plugin UI. Maintained by AO Cyber Systems. Until 3.0.0 (2026-10-09) it was named DevFlow (`devflow@aocyber`, repository `devflow-claude`).

## Core Value

AI workflow orchestration for Claude Code sessions — skills, hooks, MCP integration, planning state, and program-aware coordination across the AO-Cyber-Systems org.

## Current Milestone: v1.6 Hardening & Release

**Goal:** Ship v1.5 to users, close everything v1.5 left open, and clear the accumulated backlog: estimate accuracy re-tested prospectively, aof-tools correctness debt, stack-drafter policy gaps, the remaining handoff and install friction, and the three long-open operational decisions.

**Target features:**
- Release: v1.5 work merged to `main` and tagged at the next plugin semver, with the installed runtime carrying the v1.5 libs and hooks
- Estimation: executor token stamp on every new SUMMARY, minutes recalibrated by a pre-registered method, EST-08's criterion re-tested prospectively on five objectives
- aof-tools correctness: `milestone complete` dry run and idempotence, `objective remove`/`objective complete` fixes, shared objective helpers in `milestone-scope.cjs`, stale `planning draft` protection, the small CLI defects the v1.5 audit listed, `verify-commits.js` output shape, health checks for tracked or stale skill markers
- Stack drafter: govulncheck self-test and buf lint rules; a `stack verify --run` policy for service-backed tests and build artifacts
- Handoff and install: the three known PTY handoff gaps and handoff-result injection; consistent slash-command naming with no legacy `df-*` remnants, and the rename to AOForge (3.0.0, Objective 72)
- Operations: the CI `ANTHROPIC` secret for the live visual judge, branch protection on `main`, and a working docs site deploy

## Requirements

Requirement IDs live in each objective's `OBJECTIVE.md`; there is no `REQUIREMENTS.md`.

### Validated

The capability areas listed under `## Scope`: skills, subagents, hooks, `.aoforge/` templates and `aof-tools.cjs`; the program-aware coordination layer (v1.1+); the project lifecycle (v1.3+); self-measurement (v1.3+); GitHub as an opt-in system of record (v1.4+); and environment diagnosis and repair (v1.4+). v1.2 shipped 2026-07-22, v1.3 completed 2026-09-28, v1.4 completed 2026-10-05 (58/58 requirement IDs) and v1.5 completed 2026-10-08 (35/36; EST-08 not met, accepted). v1.5 added: the edit gate on Bash writes, objective-number correctness, state and merge plumbing, store-mode observability, Claude Code built-in adoption and the estimation engine (see `## Context`).

### Active

v1.6 Hardening & Release: see `## Current Milestone` above and `.aoforge/REQUIREMENTS.md` for the REQ-IDs (EST-08 carried forward as EST-09..11).

### Out of Scope

See `## Out of Scope` below.

## Scope

AOForge (repository `aoforge-claude`) owns:

- **Skills** (`/aoforge:*` slash commands): planning, building, debugging, verification, todos, intent resolution
- **Subagents**: planner, executor, verifier, debugger, etc.
- **Hooks**: SessionStart sync, gate-commits, gate-edits, gate-interactive, route-intent, statusline, verifiers
- **Templates** for `.aoforge/` artifacts (PROJECT, OBJECTIVE, ROADMAP, JOB, SUMMARY, STATE)
- **`aof-tools.cjs`**: central CLI used by skills/agents for state ops, objective ops, model resolution, GitHub integration, changelog generation, intent resolution
- **Program-aware coordination layer** (v1.1+): cross-repo awareness via GitHub Issues + Projects v2 substrate
- **Project lifecycle** (v1.3+):
  - per-project stack profile (`.aoforge/STACK.md`, `aof-tools stack`);
  - in-place upgrades of projects and global `~/.claude` state (`aof-tools upgrade`, migration registry, managed CLAUDE.md blocks);
  - unattended adoption of existing repos (`/aoforge:adopt`);
  - self-correcting documentation (command-reference checker, staleness advisories).
- **Self-measurement** (v1.3+): `aof-tools context|session-audit|transcript-export|override|telemetry`, `validate health` Checks 12–14
- **GitHub as system of record** (v1.4+, opt-in via `github.enabled` + `github.store`):
  - planning state lives in issues, TRD sub-issues, comments, the wiki and native milestones, written through an outbox, with `.aoforge/` as a rebuildable cache;
  - every planning write goes through an aof-tools verb;
  - one linked branch and PR per objective, enforced locally and by required checks, with `gh setup` to configure a repo;
  - in-place migration (0011, `/aoforge:gh-sync migrate`).
- **Environment diagnosis** (v1.4+): `aof-tools doctor` / `/aoforge:doctor`, and the codebase-aware stack drafter (`stack init|verify|report|mcp`)
- **Estimation** (v1.5+): `aof-tools calibrate` and `aof-tools estimate` (task to milestone, run state, status-line ETA, backtest), measured out of sample against real executions
- **Claude Code built-in integration** (v1.5+): task progress, plan mode, AskUserQuestion and the todo task list across skills and workflows, with a CI ratchet and a living inventory (`docs/built-in-integration-status.md`)
- **Rename compatibility** (3.0.0, v1.6): the pre-rename names (`devflow@aocyber`, `/devflow:`, `df-tools`, `~/.claude/devflow/`, `DEVFLOW_*`, `.planning/`) keep working for one release through shims, in-place migrations (0012-0014, `gh rebrand`) and a final `devflow@aocyber` pointer release; all are removed in the release after 3.0.0

## Out of Scope

- Local development platform (project registry, baseline stack, secrets, toolchain orchestration) — that's `devflow` (Go CLI/daemon)
- AI gateway, routing rules, model catalog — that's `aosentry`
- Identity, teams, projects, knowledge, agent control plane backend — that's `aodex`
- Native macOS UI — that's `aodex-flutter`

## Architectural Principles

### Plan org-aware, execute repo-focused

Planning consults the org's broader state (sibling repos, eden-libs reuse opportunities, the org Product Roadmap) to surface overlap, duplication risk, and shared-service opportunities. Execution stays a local heads-down loop with at most an async preamble pulling thin context.

The brains go at plan time where overlap/duplication/shared-service decisions actually matter; execution stays a local heads-down loop with at most a thin context preamble.

### Continue executing — no manual paste

When Claude hits a command it can't run itself (TTY-interactive, shell-flow, password-prompt), the system queues the handoff and Claude continues with parallel work. The `aoforge-watch` daemon (shipped v1.1 as `devflow-watch`, PTY-backed since v1.2) executes queued commands in the user's interactive shell — including TTY-interactive auth flows — and injects results back. The user never has to manually paste `! cmd`. Three known PTY architectural gaps (dispatch-wrapper isatty, wrapper stdin race, detector late-match) are documented for v1.3+.

### Measure it, don't assert it

Since v1.3, claims that AOForge is better are backed by repeatable measurements rather than stated:
- `session-audit` classifies blocking events;
- `context` measures context composition;
- every objective carries an independent VERIFICATION.md, and v1.3 retro-verified 27–34;
- since v1.5, gate defaults are set from measured false-positive rates (the Bash edit gate ships `warn` because its measured upper bound was 0.035 > 0.02), and the estimator is judged by an out-of-sample backtest with pre-registered thresholds. A failed measurement is reported as failed (EST-08), not tuned until it passes.

The fixes to AOForge's own gates count as done only when the post-release audit shows the blocking categories have collapsed.

### Ambient mode — routing is authoritative

Since v1.2, AOForge routing is enforcement, not advice: `route-intent.js` injects obligatory routing directives, `classify-session.js` classifies sessions at start, and `gate-edits.js` denies ambient edits by default (per-repo `gates.editGate: warn|strict|off` knob since obj 25). Skills arm a `.aoforge/.skill-active` marker to permit edits.

### Foundation first; adoption follows

AOForge provides the *mechanics* for coordination. Adopting those mechanics across the org's repos (issue templates, label taxonomy, sub-issue backfilling, draft-milestone promotion) is parallel program work, not part of AOForge's roadmap.

## Distribution

- Source of truth: `plugins/aoforge/` (skills, agents, hooks, runtime)
- Marketplace: `.claude-plugin/marketplace.json` (ships `aoforge` and, until the release after 3.0.0, the final `devflow` 3.0.0 pointer plugin under `plugins/devflow/`)
- Installation: `/plugin marketplace add AO-Cyber-Systems/aoforge-claude` then enable `aoforge@aocyber`
- Version sync: `package.json`, `plugins/aoforge/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` must match on every release
- Releases: `v*` tag triggers changelog gate; tag the merge commit on `main` (the marketplace installs from `main`, so a local or branch tag changes nothing for users)
- Runtime mirror: `sync-runtime` copies `plugins/aoforge/aoforge/` to `~/.claude/aoforge/` only when the plugin is newer (since quick 21). An older, still-running session can no longer downgrade it, but sessions started on a pre-2.11.0 plugin can until they are quit.

## Org Context

- Organization: `AO-Cyber-Systems`
- Master roadmap: GitHub Project ID `PVT_kwDODwqLrc4BRsOP` ("Product Roadmap")
  - Custom fields: Status (Todo/In Progress/Done), Product (8 product lines), Quarter (Q1 2026 → Q4 2027)
- Repos in the AO-Cyber-Systems org AOForge coordinates with:
  - `aodex` (Rails API + Go port — agent control plane, knowledge, MCP)
  - `aosentry` (Go — AI gateway, routing rules, local model catalog)
  - `aodex-flutter` (Flutter macOS app — Hub UI)
  - `eden-libs` (shared SDK across products)
  - `devflow` (Go CLI/daemon — local dev platform; sibling, not subordinate)
  - `eden-biz`, `aocyber-cloud`, `eden-ui`, etc.

## Repo Layout

```
aoforge-claude/
├── .aoforge/                    # planning state (this directory tree)
├── .claude-plugin/              # marketplace metadata
├── plugins/aoforge/             # plugin source — single source of truth for distribution
│   ├── .claude-plugin/plugin.json
│   ├── skills/<name>/SKILL.md
│   ├── agents/<agent>.md
│   ├── hooks/{hooks.json,*.js}
│   └── aoforge/                 # runtime mirrored to ~/.claude/aoforge/ on session start
│       ├── bin/aof-tools.cjs
│       ├── workflows/<name>.md
│       ├── references/<name>.md
│       └── templates/<name>.md
├── plugins/devflow/             # final 3.0.0 pointer release of the pre-rename plugin (removed the release after 3.0.0)
├── docs/                        # design proposals, implementation plans
├── CHANGELOG.md
└── package.json
```

## Constraints

- All hooks must be idempotent and fast (<200ms typical) — they run on every relevant tool call
- Distribution is via Claude Code plugin marketplace; no npm publish
- Three version files must stay in sync on every release
- Plugin must work with both interactive Claude Code sessions and background subagent execution
- Milestone names (v1.1, v1.2) are planning nomenclature, NOT release versions — release tags follow the plugin's own semver (v2.x); never tag a bare `v1.2`-style milestone name (release-on-tag CI triggers on `v*`)

## Context

v1.5 Gate & Plumbing completed on 2026-10-08 with 10 objectives (55–64) and 81 TRDs. Objective 55 shipped as plugin 2.13.2. Objectives 56–64 shipped in plugin 2.14.0 (Objective 65). v1.4 (42–54, plugin 2.13.0/2.13.1) completed 2026-10-05, v1.3 (27–41, plugin 2.11.0) completed 2026-09-28, and v1.2 shipped 2026-07-22.

Test suite: 11,071 tests, 11,037 pass, 0 fail, 34 skipped.

The estimation engine works, but its minute estimates run high: 1.24× actual after the recency-window fix, with only 2 of 5 objectives within ±30%. Cost estimates are close (0.80–0.86×). EST-08 is accepted as not met. Run history is now archived per objective, so the next five objectives give a genuinely prospective retest.

Open decisions carried to the next milestone:
- the CI Anthropic secret for the live visual judge;
- `main` branch protection;
- the Docs site deploy (the Cloudflare Pages project `devflow-docs` was never found; the deploy now targets `aoforge-docs`, which TRD 72-24 creates behind a checkpoint, and OPS-03 closes).

DECISION-001 (edit-gate posture) was resolved in v1.5 (Objective 60, option-a, with a measured `warn` default).

Objective 72 renamed the plugin to AOForge and released it as 3.0.0 (tag `v3.0.0` on `main` b4a9d870, 2026-10-09). This repository runs on the installed AOForge 3.0.0 with its planning tree at `.aoforge/` (TRD 72-21); the rollout steps 72-23 to 72-26 are still open.

Objective 26 (GitHub issue auto-build monitor) was killed on 2026-10-01 (resolved; GMD-04).

---
*Last updated: 2026-10-09 — AOForge wording after the 3.0.0 rename (TRD 72-22)*
