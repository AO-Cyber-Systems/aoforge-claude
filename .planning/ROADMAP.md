# Roadmap: DevFlow Claude

## Milestones

- ✅ **v1.1 — DevFlow Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)
- ✅ **v1.2 — Token Efficiency + Ambient Mode + Handoff Polish** — Objectives 10–23, 25 (shipped 2026-07-22)
- ✅ **v1.3 — Autonomy hardening, stack profile, upgrade/adopt, doc auto-correction** — Objectives 27–41 (completed 2026-09-28; plugin v2.11.0, merge to `main` pending)
- 📋 **v1.4 — not yet planned** — candidate: Objective 26 (moved from v1.3 2026-09-28; kill candidate)

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
| 26. GitHub issue auto-build monitor | v1.4 | 0/— | Moved to v1.4 (kill candidate) | — |
