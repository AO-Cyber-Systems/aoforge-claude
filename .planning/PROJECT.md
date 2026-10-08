---
kind: plugin
default_work: feature
org: AO-Cyber-Systems
github_repo: AO-Cyber-Systems/devflow-claude
---

# DevFlow Claude

## What This Is

DevFlow is a meta-prompting, context engineering, and spec-driven development system for Claude Code. It ships as a Claude Code plugin (`devflow@aocyber`) installed via `/plugin` or the Claude Desktop plugin UI. Maintained by AO Cyber Systems.

## Core Value

AI workflow orchestration for Claude Code sessions — skills, hooks, MCP integration, planning state, and program-aware coordination across the AO-Cyber-Systems org.

## Current Milestone

None. v1.5 Gate & Plumbing completed 2026-10-08. Start the next one with `/devflow:milestone new`.

## Requirements

Requirement IDs live in each objective's `OBJECTIVE.md`; there is no `REQUIREMENTS.md`.

### Validated

The capability areas listed under `## Scope`: skills, subagents, hooks, `.planning/` templates and `df-tools.cjs`; the program-aware coordination layer (v1.1+); the project lifecycle (v1.3+); self-measurement (v1.3+); GitHub as an opt-in system of record (v1.4+); and environment diagnosis and repair (v1.4+). v1.2 shipped 2026-07-22, v1.3 completed 2026-09-28, v1.4 completed 2026-10-05 (58/58 requirement IDs) and v1.5 completed 2026-10-08 (35/36; EST-08 not met, accepted). v1.5 added: the edit gate on Bash writes, objective-number correctness, state and merge plumbing, store-mode observability, Claude Code built-in adoption and the estimation engine (see `## Context`).

### Active

None until the next milestone is defined. Carried forward: EST-08 (estimate accuracy; recalibrate minutes and retest prospectively over the next five objectives).

### Out of Scope

See `## Out of Scope` below.

## Scope

devflow-claude owns:

- **Skills** (`/devflow:*` slash commands): planning, building, debugging, verification, todos, intent resolution
- **Subagents**: planner, executor, verifier, debugger, etc.
- **Hooks**: SessionStart sync, gate-commits, gate-edits, gate-interactive, route-intent, statusline, verifiers
- **Templates** for `.planning/` artifacts (PROJECT, OBJECTIVE, ROADMAP, JOB, SUMMARY, STATE)
- **`df-tools.cjs`**: central CLI used by skills/agents for state ops, objective ops, model resolution, GitHub integration, changelog generation, intent resolution
- **Program-aware coordination layer** (v1.1+): cross-repo awareness via GitHub Issues + Projects v2 substrate
- **Project lifecycle** (v1.3+):
  - per-project stack profile (`.planning/STACK.md`, `df-tools stack`);
  - in-place upgrades of projects and global `~/.claude` state (`df-tools upgrade`, migration registry, managed CLAUDE.md blocks);
  - unattended adoption of existing repos (`/devflow:adopt`);
  - self-correcting documentation (command-reference checker, staleness advisories).
- **Self-measurement** (v1.3+): `df-tools context|session-audit|transcript-export|override|telemetry`, `validate health` Checks 12–14
- **GitHub as system of record** (v1.4+, opt-in via `github.enabled` + `github.store`):
  - planning state lives in issues, TRD sub-issues, comments, the wiki and native milestones, written through an outbox, with `.planning/` as a rebuildable cache;
  - every planning write goes through a df-tools verb;
  - one linked branch and PR per objective, enforced locally and by required checks, with `gh setup` to configure a repo;
  - in-place migration (0011, `/devflow:gh-sync migrate`).
- **Environment diagnosis** (v1.4+): `df-tools doctor` / `/devflow:doctor`, and the codebase-aware stack drafter (`stack init|verify|report|mcp`)
- **Estimation** (v1.5+): `df-tools calibrate` and `df-tools estimate` (task to milestone, run state, status-line ETA, backtest), measured out of sample against real executions
- **Claude Code built-in integration** (v1.5+): task progress, plan mode, AskUserQuestion and the todo task list across skills and workflows, with a CI ratchet and a living inventory (`docs/built-in-integration-status.md`)

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

When Claude hits a command it can't run itself (TTY-interactive, shell-flow, password-prompt), the system queues the handoff and Claude continues with parallel work. The devflow-watch daemon (shipped v1.1, PTY-backed since v1.2) executes queued commands in the user's interactive shell — including TTY-interactive auth flows — and injects results back. The user never has to manually paste `! cmd`. Three known PTY architectural gaps (dispatch-wrapper isatty, wrapper stdin race, detector late-match) are documented for v1.3+.

### Measure it, don't assert it

Since v1.3, claims that DevFlow is better are backed by repeatable measurements rather than stated:
- `session-audit` classifies blocking events;
- `context` measures context composition;
- every objective carries an independent VERIFICATION.md, and v1.3 retro-verified 27–34;
- since v1.5, gate defaults are set from measured false-positive rates (the Bash edit gate ships `warn` because its measured upper bound was 0.035 > 0.02), and the estimator is judged by an out-of-sample backtest with pre-registered thresholds. A failed measurement is reported as failed (EST-08), not tuned until it passes.

The fixes to DevFlow's own gates count as done only when the post-release audit shows the blocking categories have collapsed.

### Ambient mode — routing is authoritative

Since v1.2, DevFlow routing is enforcement, not advice: `route-intent.js` injects obligatory routing directives, `classify-session.js` classifies sessions at start, and `gate-edits.js` denies ambient edits by default (per-repo `gates.editGate: warn|strict|off` knob since obj 25). Skills arm a `.planning/.skill-active` marker to permit edits.

### Foundation first; adoption follows

devflow-claude provides the *mechanics* for coordination. Adopting those mechanics across the org's repos (issue templates, label taxonomy, sub-issue backfilling, draft-milestone promotion) is parallel program work, not part of devflow-claude's roadmap.

## Distribution

- Source of truth: `plugins/devflow/` (skills, agents, hooks, runtime)
- Marketplace: `.claude-plugin/marketplace.json`
- Installation: `/plugin marketplace add AO-Cyber-Systems/devflow-claude` then enable `devflow@aocyber`
- Version sync: `package.json`, `plugins/devflow/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` must match on every release
- Releases: `v*` tag triggers changelog gate; tag the merge commit on `main` (the marketplace installs from `main`, so a local or branch tag changes nothing for users)
- Runtime mirror: `sync-runtime` copies `plugins/devflow/devflow/` to `~/.claude/devflow/` only when the plugin is newer (since quick 21). An older, still-running session can no longer downgrade it, but sessions started on a pre-2.11.0 plugin can until they are quit.

## Org Context

- Organization: `AO-Cyber-Systems`
- Master roadmap: GitHub Project ID `PVT_kwDODwqLrc4BRsOP` ("Product Roadmap")
  - Custom fields: Status (Todo/In Progress/Done), Product (8 product lines), Quarter (Q1 2026 → Q4 2027)
- Repos in the AO-Cyber-Systems org devflow-claude coordinates with:
  - `aodex` (Rails API + Go port — agent control plane, knowledge, MCP)
  - `aosentry` (Go — AI gateway, routing rules, local model catalog)
  - `aodex-flutter` (Flutter macOS app — Hub UI)
  - `eden-libs` (shared SDK across products)
  - `devflow` (Go CLI/daemon — local dev platform; sibling, not subordinate)
  - `eden-biz`, `aocyber-cloud`, `eden-ui`, etc.

## Repo Layout

```
devflow-claude/
├── .planning/                   # planning state (this directory tree)
├── .claude-plugin/              # marketplace metadata
├── plugins/devflow/             # plugin source — single source of truth for distribution
│   ├── .claude-plugin/plugin.json
│   ├── skills/<name>/SKILL.md
│   ├── agents/<agent>.md
│   ├── hooks/{hooks.json,*.js}
│   └── devflow/                 # runtime mirrored to ~/.claude/devflow/ on session start
│       ├── bin/df-tools.cjs
│       ├── workflows/<name>.md
│       ├── references/<name>.md
│       └── templates/<name>.md
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

v1.5 Gate & Plumbing completed on 2026-10-08 with 10 objectives (55–64) and 81 TRDs. Objective 55 shipped as plugin 2.13.2. Objectives 56–64 are on `feat/stack-profile-loader`, under `[Unreleased]`, and not yet released. v1.4 (42–54, plugin 2.13.0/2.13.1) completed 2026-10-05, v1.3 (27–41, plugin 2.11.0) completed 2026-09-28, and v1.2 shipped 2026-07-22.

Test suite: 11,071 tests, 11,037 pass, 0 fail, 34 skipped.

The estimation engine works, but its minute estimates run high: 1.24× actual after the recency-window fix, with only 2 of 5 objectives within ±30%. Cost estimates are close (0.80–0.86×). EST-08 is accepted as not met. Run history is now archived per objective, so the next five objectives give a genuinely prospective retest.

Open decisions carried to the next milestone:
- the CI Anthropic secret for the live visual judge;
- `main` branch protection;
- the Docs site deploy (Cloudflare Pages project `devflow-docs` not found).

DECISION-001 (edit-gate posture) was resolved in v1.5 (Objective 60, option-a, with a measured `warn` default).

Release step pending: merge to `main`, then tag the next plugin semver. The installed runtime (2.13.2) lacks the v1.5 libs and hooks until then.

Objective 26 (GitHub issue auto-build monitor) was killed on 2026-10-01 (resolved; GMD-04).

---
*Last updated: 2026-10-08 after v1.5 milestone*
