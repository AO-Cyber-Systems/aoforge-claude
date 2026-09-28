# Milestones

## v1.1 DevFlow Coordination Layer (Shipped: 2026-05-06)

**Objectives completed:** 13 objectives (0–9, 6, 8, 24), ~53 plans

**Delivered:** Program-aware coordination layer for the AO-Cyber-Systems org — GitHub Issues + Projects v2 as the substrate, git as the peer-awareness store.

**Key accomplishments:**
- (kind, work) intent model: 42-cell defaults table + `intent.cjs` resolver with per-field provenance; CLAUDE.md TDD-playbook absorption (`claude-md.cjs`)
- GitHub coordination layer: frontmatter GH-link conventions, `gh resolve` chain walker, `gh sync` with sticky-comment idempotency, Product Roadmap Project v2 field updates
- Cross-repo awareness: peer branch scanner (git-based) + org Project walker + `/devflow:awareness` skill + SessionStart cache populate
- Planning-time org awareness: sibling/eden-libs/org-overlap scanners feeding "Cross-Repo Considerations" into CONTEXT.md
- Duplicate-work detection with Merge/Defer/Coordinate/Proceed resolution flow at plan + execute time
- Initiative context layer: GitHub Epics projected to `~/.claude/devflow/initiatives/` for planner strategic context
- Unified `/devflow:todo list` morning-standup view; program-aware TUI viewer
- Roadmap ↔ disk reconciliation (`df-tools sync-roadmap` + skill)

**Note:** v1.1 was not formally archived at its completion; its full roadmap record is preserved inside `milestones/v1.2-ROADMAP.md`. Objective 9's 09-03 TRD shipped its deliverables (CLI + skill + lib, all live) without a SUMMARY.md — documentation gap only.

---

## v1.2 Token Efficiency + Ambient Mode + Handoff Polish (Shipped: 2026-07-22)

**Objectives completed:** 17 objectives (10-E, 11-D, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 10-autonomous, 23, 10-flutter, 25), 83 plans

**Delivered:** Cut per-invocation token cost, converted routing from advisory to authoritative (ambient mode), closed the TTY-interactive handoff gap with a PTY-backed daemon, and finished with a fleet-wide audit-fix pass.

**Key accomplishments:**
- Skill consolidation 28→14 (`/devflow:objective`, `/devflow:milestone`, `/devflow:status`, `/devflow:todo` subcommand forms) + prompt extraction to shared references (~25-55k tokens saved per build)
- Ambient mode: authoritative `route-intent.js` + `classify-session.js` SessionStart hook + strict-by-default `gate-edits.js` with skill-active marker
- `/devflow:micro` tier (~2k tokens) for sub-30-LOC changes; auto-init detection for non-DevFlow projects
- PTY-backed handoff watcher (node-pty): TTY-interactive auth flows, token-passing schema with redaction, daemon polish (notifications, auto-launch, multi-project, status-line, cross-shell)
- Bidirectional GH sync (pull + conflict resolution) + 3-tier configurable defaults table
- Autonomous mode overhaul: verifier-delegated checkpoints, decision queue, auto-resume/retry hooks, unattended runbook
- Flutter UI verification process: state-coverage schema, planner/executor/verifier gates, Maestro + integration_test pyramid, auto-generated UAT
- Fleet audit fixes (obj 25): phantom skill names corrected, VERIFY rule tightened, adoption router rules, `gates.editGate` knob, global + fleet CLAUDE.md/PROJECT.md alignment (6 repos gained `kind:` frontmatter)

**UAT:** objective 25 verified 8/8 pass (`objectives/25-fleet-audit-fixes/25-UAT.md`)

---

## v1.3 Autonomy Hardening, Stack Profile, Upgrade/Adopt, Doc Auto-correction (Completed: 2026-09-28)

**Objectives completed:** 15 objectives (27–41), 109 TRDs (107 executed; 27-03 and 28-06 deferred by decision). 26 moved to v1.4 as a kill candidate.

**Delivered:** DevFlow stopped blocking its own agents and now measures that. Model tiers actually bind. DevFlow resolves a per-project stack profile and upgrades projects and the global `~/.claude` state in place. It adopts existing repos unattended and keeps its own documentation current. Every objective in the milestone was independently verified.

**Release:** plugin **v2.11.0**. Release commit `b907932`; the annotated tag is local only until the branch merges to `main`. Branch `feat/stack-profile-loader`: 352 commits past v2.10.1, and 163 plugin files changed (+27,065 / −847). Tests: 4268 total, 4235 pass, 1 known failure (MA-7), 32 skipped. Timeline 2026-08-18 → 2026-09-28.

**Key accomplishments:**
- Gate correctness (27): the edit-gate marker resolves across worktrees and has a TTL, targets outside the repo are never gated, and the commit gate matches actual invocations rather than substrings.
- Model tiers bind (28): the profile table resolves live model ids, and `effort` is set per agent. A no-progress guard hook was added, plus an escalation policy.
- Context discipline and telemetry (29–31, 39): `df-tools context|session-audit|transcript-export|override|telemetry` all dispatch now. Read share of context fell from 53.6% to 24.5%.
- Visual gate made honest and runnable in CI (32–33), and the Surface Spec schema, validator, renderer, review sheet and look-lock landed (34).
- Stack profile (35): `.planning/STACK.md` tiers, the `df-tools stack *` commands, and agent wiring in place of branching on stack in prose.
- Upgrade in place (36): a registry of detection-based migrations (0001–0007) with out-of-repo backups, SessionStart auto-apply and commit, and managed CLAUDE.md blocks.
- `/devflow:adopt` (37) adopts an existing repo unattended. Backups are pruned daily.
- Doc auto-correction (38): a command-reference checker (CI gate plus migration 0007), staleness advisories W050–W054, and the stale-command cleanup.
- Tooling correctness (40) and retroactive verification of 27–34 (41). The retroactive pass caught and fixed two regressions.
- Quick 21: `sync-runtime` never downgrades the home mirror.

### Known Gaps

All of these are delivery or decision items. No requirement is unsatisfied. See `milestones/v1.3-MILESTONE-AUDIT.md`, revision 3.
- **Not live yet.** 2.11.0 has to be pushed, merged to `main`, and tagged on the merge commit, then picked up with `/plugin update devflow@aocyber`.
- **Stale sessions.** Four sessions from Sep 22–26 (PIDs 58289, 95689, 49829, 70814) are pinned to the orphaned 2.7.1 cache. They keep resetting `~/.claude/devflow` to 2.7.1, so `validate health` reports E020. They need to be quit.
- **Human decisions pending:**
  - CI `ANTHROPIC` secret for `--judge live` (32/33)
  - branch protection on `main` for `agent-shell-harness` (34)
  - DECISION-001, the 27-03 edit-gate posture
- **Post-release measurement:** `session-audit --since v2.11.0` gives the real before/after for 27–30, and objective 29's 24.5% should be re-measured once the release is live.
- **Tooling:** `df-tools milestone complete` counts every objective directory, not only the milestone's, so this entry was written by hand.

---
