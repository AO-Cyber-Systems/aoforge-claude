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

## Current Milestone: v1.5 Gate & Plumbing

**Goal:** Close the edit gate's Bash hole, clear the plumbing and correctness debt that v1.4 and the live store smoke surfaced, and ship two features: adopting Claude Code built-ins (Phase J) and an agentic estimation engine (Phase K).

**Target features:**
- Edit gate enforces the action: Bash writes to tracked source are gated like `Edit`/`Write` (DECISION-001 option-a), with the false-positive rate measured by `session-audit` before it ships as default strict
- State and merge plumbing: `state advance-job` status text, a JSON-aware merge path for `STATE_ARCHIVE.md` / `state.json`, executor preflight with `--cwd <worktree>`, honest `milestone complete` / `objective remove` reporting
- Objective-number correctness: one regex-escape helper, `4.1` vs `04.10` matching, leading-zero ROADMAP lookups, `verify trd-pre` requirement parsing
- Store-mode rough edges and observability: `gh setup` dry-run/PR titles, a stale-pin doctor warning, a `requires:` capability gate, current model ids, `telemetry --scan`, automatic `transcript-export`, the 09-03 SUMMARY
- Phase J (#35): Claude Code built-in integration (TodoWrite/Task*/plan mode/AskUserQuestion standardization, hook coexistence)
- Phase K (#36): agentic estimation engine (`df-tools calibrate`, `df-tools estimate`, planner integration)

Objective 55 (store live-smoke fixes) already shipped in 2.13.2 as the first v1.5 objective.

## Requirements

Requirement IDs live in each objective's `OBJECTIVE.md`; there is no `REQUIREMENTS.md`.

### Validated

The capability areas listed under `## Scope`: skills, subagents, hooks, `.planning/` templates and `df-tools.cjs`; the program-aware coordination layer (v1.1+); the project lifecycle (v1.3+); self-measurement (v1.3+); GitHub as an opt-in system of record (v1.4+); and environment diagnosis and repair (v1.4+). v1.2 shipped 2026-07-22, v1.3 completed 2026-09-28 and v1.4 completed 2026-10-05, with all 58 v1.4 requirement IDs satisfied (see `## Context`).

### Active

v1.5 Gate & Plumbing: see `## Current Milestone` above and `.planning/REQUIREMENTS.md` for the REQ-IDs.

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
- every objective carries an independent VERIFICATION.md, and v1.3 retro-verified 27–34.

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

v1.4 completed on 2026-10-05 with 13 objectives (42–54), all 158 TRDs executed, and objective 26 killed. It shipped as plugin 2.13.0 and 2.13.1, and `feat/stack-profile-loader` is merged to `main`. The milestone ended with CodeQL at 0 open alerts on `main`. v1.3 (27–41, plugin 2.11.0) completed 2026-09-28, and v1.2 shipped 2026-07-22.

Test suite: 9,088 tests, 1 known failure (MA-7 handoff-e2e, which fails on any machine with a real `doctl`), 32 skipped. CI is green on `main`.

Open decisions carried to v1.5:
- DECISION-001 (edit-gate posture);
- the CI Anthropic secret for the live visual judge;
- `main` branch protection.

Also open: the live store-mode smoke on a real GitHub repo (every store test uses a fake GitHub), and the Docs site deploy (Cloudflare Pages project `devflow-docs` not found).

Objective 26 (GitHub issue auto-build monitor) was killed on 2026-10-01 (resolved; GMD-04).

---
*Last updated: 2026-10-05 — v1.5 Gate & Plumbing started*
