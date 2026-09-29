# Roadmap: DevFlow Claude

## Milestones

- ✅ **v1.1 — DevFlow Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)
- ✅ **v1.2 — Token Efficiency + Ambient Mode + Handoff Polish** — Objectives 10–23, 25 (shipped 2026-07-22)
- ✅ **v1.3 — Autonomy hardening, stack profile, upgrade/adopt, doc auto-correction** — Objectives 27–41 (completed 2026-09-28; plugin v2.11.0, merge to `main` pending)
- 📋 **v1.4 — not yet planned** — candidates: Objective 26 (moved from v1.3 2026-09-28; kill candidate), Objective 42 (codebase-aware stack drafter, in progress), Objective 44 (autonomy hardening)

Full archived roadmaps: `.planning/milestones/v1.2-ROADMAP.md` (v1.1 + v1.2 detail), `.planning/milestones/v1.3-ROADMAP.md` (v1.3 detail; audit: `milestones/v1.3-MILESTONE-AUDIT.md`). Milestone history: `.planning/MILESTONES.md`.

## Objectives

<details>
<summary>✅ v1.1 DevFlow Coordination Layer — SHIPPED 2026-05-06</summary>

- [x] Objective 0: Refine (kind, work) defaults table (6/6 plans)
- [x] Objective 1: GitHub coordination layer (6/6 plans)
- [x] Objective 2: Cross-repo awareness layer (7/7 plans)
- [x] Objective 3: Planning-time org awareness (7/7 plans)
- [x] Objective 4: Duplicate-work detection + resolution flow (6/6 plans)
- [x] Objective 5: Initiative context layer (5/5 plans)
- [x] Objective 6: Unified check-todos (4/4 plans)
- [x] Objective 7: Handoff watcher (shipped via PR #19)
- [x] Objective 8: Program-aware TUI viewer (3/3 plans)
- [x] Objective 9: Roadmap ↔ disk reconciliation (3/3 delivered; 09-03 SUMMARY.md missing — docs gap only)
- [x] Objective 24: Natural-language routing trigger fixes (3/3 plans)

</details>

<details>
<summary>✅ v1.2 Token Efficiency + Ambient Mode + Handoff Polish — SHIPPED 2026-07-22</summary>

- [x] Objective 10: Phase E — Agent-spawn audit (2/2 plans)
- [x] Objective 11: Phase D — build → verifier wiring (1/1 plan)
- [x] Objective 12: Phase G+I — Skill consolidation 28→14 (7/7 plans)
- [x] Objective 13: Phase H — Prompt extraction to references (4/4 plans)
- [x] Objective 14: Phase F — Default-on safety nets (5/5 plans)
- [x] Objective 15: Phase A — Authoritative routing keystone (5/5 plans)
- [x] Objective 16: Phase B — /devflow:micro skill (4/4 plans)
- [x] Objective 17: Phase C — Auto-init detection (4/4 plans)
- [x] Objective 18: v1.1 polish bundle (3/3 plans)
- [x] Objective 19: PTY support for handoff watcher (5/5 plans)
- [x] Objective 20: Daemon polish bundle (5/5 plans)
- [x] Objective 21: Bidirectional GH sync + configurable defaults table (5/5 plans)
- [x] Objective 22: Workflow-impediment fixes (4/4 plans)
- [x] Objective 10: Autonomous mode overhaul (9/9 plans) <!-- duplicate number, parallel session -->
- [x] Objective 23: Claude compatibility cleanup (5/5 plans)
- [x] Objective 10: Flutter UI verification process (9/9 plans, released v2.2.0) <!-- duplicate number, parallel session -->
- [x] Objective 25: Fleet audit fixes (6/6 plans, UAT 8/8 pass)

</details>

<details>
<summary>✅ v1.3 Autonomy Hardening, Stack Profile, Upgrade/Adopt, Doc Auto-correction — COMPLETED 2026-09-28 (plugin v2.11.0)</summary>

- [x] Objective 27: Gate correctness (5/6; 27-03 deferred → DECISION-001) — verified 6/6
- [x] Objective 28: Model tier binding and escalation (5/6; 28-06 deferred) — verified 6/6
- [x] Objective 29: Context discipline (4/4) — verified 5/5
- [x] Objective 30: Agent environment hygiene (4/4) — verified 5/5
- [x] Objective 31: Telemetry and retention (3/3) — verified 6/6
- [x] Objective 32: Visual-eval default path tells the truth (4/4) — verified 23/23, human_needed (CI secret)
- [x] Objective 33: The visual gate actually runs in CI (3/3) — verified 22/22
- [x] Objective 34: UI Oracle Loop W1b — Surface Spec (11/11) — verified 9/9, human_needed (branch protection)
- [x] Objective 35: Stack profile loader (11/11) — verified 10/10
- [x] Objective 36: Upgrade in place (10/10) — verified 66/66
- [x] Objective 37: /devflow:adopt + backup pruning (16/16) — verified 7/7
- [x] Objective 38: Documentation auto-correction (12/12) — verified 9/9
- [x] Objective 39: Wire the telemetry & audit CLI (5/5, gap closure) — verified 12/12
- [x] Objective 40: Tooling correctness (6/6, gap closure) — verified 8/8
- [x] Objective 41: Retroactive verification of 27–34 (8/8, gap closure) — verified 6/6

</details>

### 📋 v1.4 candidates

### Objective 42: Codebase-aware stack drafter

**Goal:** `stack init` / `/devflow:adopt` draft a correct, verified `.planning/STACK.md` grounded in the codebase, wired to language skills + MCP, with a CI/CD + local-testing recommendations report; then roll out to every canonical DevFlow repo in `~/dev`.
**Requirements:** SDR-01, SDR-02, SDR-03, SDR-04, SDR-05, SDR-06, SDR-07, SDR-08
**Success Criteria**:
1. Re-running `stack init` on fixtures shaped like every observed failure yields correct keys, no fragments/comments/echo lines, and `discover` for unverifiable commands
2. Go/Dart/Flutter repos draft `extends: go|dart|flutter` with the fixed tier-2 profiles installed, and monorepo areas as `components`
3. Drafts carry `agent_tooling.mcp` + `skills` for detected stacks; the adopt/map-codebase agent path confirms configuration via gopls/dart MCP when available
4. `.planning/STACK-REPORT.md` lists CI/CD + local-testing recommendations per stack, never auto-applied
5. `stack validate` warns on `<sha>` pins, rejects positional paths; `reviewed` is the local date
6. Every canonical DevFlow repo in `~/dev` has a committed, validated STACK.md (unpushed) or is listed as blocked with a reason
**Plans:** 15 TRDs in 10 waves (42-12/42-13 = gap cycle 1, 42-14/42-15 = gap cycle 2, from the 42-11 dry-run reviews)
TRDs:
- [x] 42-01-TRD.md — (W1) validation fixes: STK010 placeholder pins, reject positional path, local-date `reviewed`; `stack verify|report|mcp` lazy dispatch
- [x] 42-03-TRD.md — (W1) `stack-shell` / `stack-ci` / `stack-classify`: joined logical commands, fragment drop rules, cwd, `uses:`, semantic key table
- [x] 42-04-TRD.md — (W1) `stack-runners`: Make (`-C dir`) / Task / just / npm-family / conventional scripts with bodies
- [x] 42-02-TRD.md — (W2) fixed go/dart/flutter shipped as bundled tier-2 in `devflow/stack-profiles/` + loader bundled-tier lookup + SUBDIRS
- [x] 42-06-TRD.md — (W2) `stack-verify` + `stack verify [--run] [--draft]`: resolvability, safe-key run policy, deny list
- [x] 42-05-TRD.md — (W3) `stack-detect` areas (depth 3), Dart-vs-Flutter object `detect`, component extends walk + cwd join
- [x] 42-07-TRD.md — (W4) drafter integration: preference order, verify→discover + notes, components, adopt; e2e over every failure shape
- [x] 42-09-TRD.md — (W4) `stack mcp [--write]` (opt-in), W033, agent/skill MCP grants, `confirm_stack_profile` workflow step
- [x] 42-08-TRD.md — (W5) `stack report [--write] [--draft]` → `.planning/STACK-REPORT.md` catalogue + adopt report link
- [x] 42-10-TRD.md — (W6) docs (CLAUDE.md, CHANGELOG [Unreleased], templates/stack.md) + sync-runtime SUBDIRS `stack-profiles` mirror + doc pointers
- [x] 42-12-TRD.md — (W6, gap G1) gitignore-aware area detection, report components = STACK.md components, file-level STACK.md gitignore preflight
- [x] 42-13-TRD.md — (W7, gap G2/G3) broad repo-wide `test` (narrow → notes, inherit profile default), canonical runner targets (alternates → notes)
- [x] 42-14-TRD.md — (W8, gap cycle 2: D1/D2/D4/D5) CI checkout-path cwd normalisation + `cwd_missing`, ignored/untracked/nested-repo cwds to notes, `--no-index` stack-file ignore check in preview
- [x] 42-15-TRD.md — (W9, gap cycle 2: D3) root-override policy (primary-stack match; sub-area candidates to notes), D1-D5 e2e, 42-11 re-run hand-off
- [x] 42-11-TRD.md — (W10, checkpoint; Task 1 re-run after 42-14/42-15) fleet rollout: dry-run table 42-ROLLOUT.md → human approval → write/verify/report + two-file commit on the current branch incl. dirty repos (user decision 2026-09-29; no push)

### Objective 44: Autonomy hardening

**Goal:** Executors and orchestrators run to completion without human nudges: no self-imposed turn caps, truncation handled as resumable INCOMPLETE (never failure), gates stop blocking DevFlow's own agents and merge completions, runtime state files stop dirtying repos, and premature main-loop stops auto-continue. Evidence: `objectives/44-autonomy-hardening/44-EVIDENCE.md` (2026-09-29 session review: 506/1337 executor runs capped, 186 human nudges, 3,725 errors catalogued).
**Requirements:** AUT-01, AUT-02, AUT-03, AUT-04, AUT-05, AUT-06, AUT-07
**Depends on:** none
**Success Criteria**:
1. executor.md / verifier.md carry no `maxTurns`; execute-objective has an INCOMPLETE outcome resumed via SendMessage (≤3) that never skips dependents
2. A SubagentStop hook blocks a `devflow:executor` natural stop once when its TRD has no SUMMARY.md, never when `stop_hook_active` is true
3. No shipped workflow/skill tells an agent to read `~/.claude/agents/*.md`; the doc-refs CI test fails if one returns
4. gate-edits allows `agent_type` `devflow:*`; gate-commits allows merge/rebase/cherry-pick completion and inline `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit`, and its message no longer suggests `export`
5. Migration 0008 gitignores and untracks `.progress-guard.json` / `.awareness-cache.json`, idempotently
6. A Stop hook auto-continues an announced-but-not-taken step once (skill marker live, no running background tasks, no question); `yolo` counts as autonomous between waves; `DEVFLOW_SKIP_AUTOCONTINUE=1` disables it
7. Synthesizer returns text, planner has Edit, executor forbids `sleep`-poll, `config-get` returns defaults for known unset keys; `npm test` green
**Plans:** 10 TRDs in 4 waves (44-10 = gap cycle 1 from 44-VERIFICATION)
TRDs:
- [x] 44-01-TRD.md — (W1) uncap executor/verifier; per-task commit + `## Progress` checkpoint + no sleep-poll; execute-objective INCOMPLETE → SendMessage resume (≤3), dependents never skipped; yolo continues between waves (AUT-01, AUT-06, AUT-07, AUT-03)
- [x] 44-02-TRD.md — (W1) drop legacy `~/.claude/agents/*.md` read instructions (typed research-objective spawns); synthesizer returns text, orchestrators write SUMMARY.md; planner gets Edit (AUT-03, AUT-07)
- [x] 44-03-TRD.md — (W1, tdd) gate-edits allows `devflow:*` agent_type; gate-commits allows merge/rebase/cherry-pick completion + inline `DEVFLOW_ALLOW_RAW_COMMIT=1` prefix, no `export` advice (AUT-04)
- [x] 44-04-TRD.md — (W1, tdd) `gate-executor-stop.js` SubagentStop completion gate for `devflow:executor` (AUT-02)
- [x] 44-05-TRD.md — (W1, tdd) `auto-continue.js` Stop hook: announced-but-not-taken step, once (AUT-06)
- [x] 44-06-TRD.md — (W1, tdd) migration 0008 untracks runtime state files; `df-tools commit` records staged removals; upgrade hook dirty-exemption (AUT-05)
- [x] 44-07-TRD.md — (W1, tdd) `config-get` returns documented defaults for known unset keys (AUT-07)
- [x] 44-08-TRD.md — (W2, tdd) objective-job-index: Progress-only SUMMARY is incomplete + XML task_count; doc-refs legacy agent-path CI guard (AUT-01, AUT-03)
- [x] 44-09-TRD.md — (W3) register hooks in hooks.json; CLAUDE.md hook inventory, HOOK_DOCS, CHANGELOG [Unreleased]; full `npm test` (AUT-01..07)
- [ ] 44-10-TRD.md — (W4, tdd, gap closure) gate-commits ignores stale bare REBASE_HEAD; executor-stop reason names the concrete SUMMARY path (AUT-04, AUT-02)

### Objective 43: Stack drafter rules

**Goal:** Fix the drafter defects objective 42's rollout hand-fixed (aggregate targets, multi-stack roots, manifest-less roots, environment targets, internal Taskfile tasks, wrapped component recipes, commit gitignore check) so re-drafting matches the 11 override files.
**Requirements:** see `.planning/objectives/43-stack-drafter-rules/OBJECTIVE.md`
**Plans:** TBD

### Other v1.4 candidates

- **Objective 26: GitHub issue auto-build monitor** — moved out of v1.3 on 2026-09-28 by user decision; **candidate for killing**. Goal: discover untracked GitHub issues and drive trusted-author ones plan → execute → verify → PR unattended via `devflow-watch`. Locked design in `.planning/objectives/26-github-issue-auto-build-monitor/OBJECTIVE.md`; not planned.

- **v1.3 delivery (not objectives — user actions):**
  - merge `feat/stack-profile-loader` → `main`, then tag v2.11.0 on the merge commit and push it;
  - quit the stale 2.7.1 sessions;
  - run `session-audit --since v2.11.0`.
- **v1.3 decisions pending:**
  - DECISION-001 (27-03 edit-gate posture);
  - CI `ANTHROPIC` secret (32/33);
  - `main` branch protection (34).
- **v1.3 deferred / tech debt** (full list in `milestones/v1.3-MILESTONE-AUDIT.md`):
  - 28-06 Haiku replay eval; escalation re-spawn consumer; `models.opus` → `claude-opus-5-5`;
  - `telemetry --scan` silently ignored; `transcript-export` unscheduled;
  - `milestone complete` stats count every objective dir and report `state_updated` by existence; `objective remove` `roadmap_updated` same;
  - adopt/new-project don't gitignore `.planning/.*` markers;
  - CLAUDE.md agent/hook counts stale (13 agents / 16 hooks).
- Sibling plugin `monorepo-standards` names its commands `/devflow:*` (out of this plugin's scope).

### Carried-forward v1.2 deferrals

Candidate scope carried forward from v1.2 deferrals:

- Phase J — Claude Code built-in integration (devflow-claude#35)
- Phase K — Agentic estimation engine (devflow-claude#36)
- PTY architectural gaps from TRD 19-05 (dispatch-wrapper isatty, wrapper stdin race, detector Ctrl+C-on-late-match)
- `devflow-watch stash add` CLI for token-passing `value_source: 'stash'`
- 09-03 SUMMARY.md backfill (deliverables shipped, summary doc missing)

## Progress

| Objective | Milestone | Plans | Status | Completed |
|---|---|---|---|---|
| 0–9, 6, 8, 24 (13 objectives) | v1.1 | 53/53 | Complete | 2026-05-06 |
| 10–23 (15 objectives) | v1.2 | 71/71 | Complete | 2026-05-25 |
| 25. Fleet audit fixes | v1.2 | 6/6 | Complete | 2026-07-22 |
| 27–41 (15 objectives) | v1.3 | 107/109 | Complete (27-03, 28-06 deferred) | 2026-09-28 |
| 42. Codebase-aware stack drafter | v1.4 | 15/15 | Verified: gaps_found (5/6 SC; gaps carried to 43; fleet 33/36) | 2026-09-29 |
| 44. Autonomy hardening | v1.4 | 9/10 | Gap closure | — |
| 43. Stack drafter rules | v1.4 | 0/— | Registered | — |
| 26. GitHub issue auto-build monitor | v1.4 | 0/— | Moved to v1.4 (kill candidate) | — |
