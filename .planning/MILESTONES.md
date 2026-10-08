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

## v1.4 GitHub as System of Record, Stack Drafter, Doctor, Autonomy Hardening (Completed: 2026-10-05)

**Objectives completed:** 13 objectives (42–54), 158 TRDs, all executed. Objective 26 was killed by user decision on 2026-10-01 (GMD-04, DECISION-002).

**Delivered:** GitHub can now be the system of record for planning state. Projects opt in, and existing projects migrate in place with a resumable backfill. Each objective runs on one linked branch and ends in one PR, enforced locally and on GitHub. The stack drafter writes a verified STACK.md for a codebase, and re-drafting reproduces the fleet's hand-fixed overrides. Two other changes landed: `df-tools doctor` diagnoses and repairs DevFlow environment problems, and executors run to completion without nudges. By the end of the milestone, CodeQL reported no open alerts on `main`.

**Release:** plugin **v2.13.0** (PR #121, merge `2f0ed83b`), **v2.13.1** (PR #122, merge `f101acb6`), plus PR #123 (`d79fed0c`, CodeQL #89, unreleased). `feat/stack-profile-loader` is merged into `main`. From v2.11.0 to v2.13.1: 1,163 commits and 426 plugin files changed (+128,235 / −3,123). Tests: 9,088 total, 9,055 pass, 1 known failure (MA-7), 32 skipped, and CI is green on `main`. Timeline: 2026-09-28 → 2026-10-05.

**Key accomplishments:**
- **GitHub as system of record (46–51), opt-in via `github.enabled` + `github.store`.**
  - Storage: objective issues, TRD sub-issues, comments, the wiki and native milestones, written through a rate-safe outbox. `.planning/` becomes a cache that `gh pull --all` rebuilds.
  - Writes: every planning write goes through a df-tools verb, and a CI audit enforces that.
  - Discipline: one linked branch and PR per objective, with a commit gate, required checks and `gh setup`.
  - Migration: 0011 / `/devflow:gh-sync migrate` backfills an existing project in place, and resumes after a stop. With store mode off, behaviour is byte-for-byte unchanged.
- **Stack drafter (42–43):** `stack init|verify|report|mcp` and bundled go/dart/flutter profiles. `stack verify --run` is effect-based and safe. Re-drafting matches all 11 fleet override files, and SDR-08 passed 104 of 105 fleet gates.
- **Autonomy hardening (44):** executors have no turn cap and resume when INCOMPLETE. This added the executor stop gate, auto-continue, gates that let DevFlow's own agents and merge completions through, and runtime state kept out of repos.
- **`df-tools doctor` / `/devflow:doctor` (45):** a diagnose-and-safe-fix check registry, with the awareness cache and hook markers moved out of repos. sync-runtime now re-mirrors when the content digest changes.
- **Store-mode polish and hygiene (52–53):**
  - Printed follow-ups now pass the gates, and refusals name both remedies.
  - Added the `github.mirror_only` opt-out, multi-line decision answers that round-trip, and doctor check 33 to repair existing ones.
  - Summary verbs write the worktree they run in, and every reader uses one shared SUMMARY key.
  - `micro commit` is now gated.
- **CodeQL cleanup (54 + PR #123):** CodeQL on `main` went from 56 open alerts to 0, with shared `escapeRegExp` / `mdCell` helpers, a `config-set` prototype guard, workflow token permissions and `execFileSync` in tests. #95 and #146 were dismissed with reasons.

### Known Gaps

No requirement is unsatisfied: 58/58. See `milestones/v1.4-MILESTONE-AUDIT.md` (2026-10-05, passed).
- **Live store-mode smoke.** Every store test runs against a fake GitHub. The first real backfill against a throwaway repo is a manual UAT step.
- **Docs site deploy.** It fails on every push to `main` because the Cloudflare Pages project `devflow-docs` is not found (8000007). The fix is to create the project or correct the account and token secrets.
- **Not live locally.** The installed plugin and the `~/.claude/devflow` mirror are still 2.12.0. Run `/plugin update devflow@aocyber` to pick up 2.13.1. Migration 0009 is pending in this repo.
- **Still pending from v1.3:** the CI `ANTHROPIC` secret (32/33), branch protection on `main` (34), DECISION-001 (27-03).
- **Tech debt for the next milestone:**
  - Hand-rolled regex escapes outside `text-escape.cjs`.
  - The merge path doesn't document STATE_ARCHIVE.md or `state.json`.
  - Two older objective-number lookup bugs (`searchObjectiveInDir`, leading-zero lookups).
  - `verify trd-pre` reads a free-text Requirements line as a requirement ID.
- **Tooling:** `df-tools milestone complete` still counts every objective directory, so this entry was written by hand.

---

## v1.5 Gate & Plumbing (Completed: 2026-10-08)

**Objectives completed:** 10 objectives (55–64), 81 TRDs, all executed (64 includes one gap-closure cycle, 64-07 to 64-10).

**Delivered:**
- **Edit gate:** it now covers Bash writes to tracked source, not just `Edit`/`Write`.
- **Plumbing and correctness:** cleared the debt that v1.4 and the live store smoke surfaced: objective lookups, state and merge, store-mode rough edges and observability.
- **Built-in adoption (Phase J):** skills and workflows now use Claude Code's progress, plan-mode, question and todo built-ins.
- **Estimation engine (Phase K):** an agentic engine prints time, token and dollar estimates with their confidence. It was then measured out of sample. It does **not** yet meet its own accuracy target on minutes (EST-08, accepted as not met).

**Release:** **v2.13.2** carried Objective 55. Objectives 56–64 are in `[Unreleased]` on `feat/stack-profile-loader` and are not released yet.
- **Git range:** `f88e283b` → `bb0558a6`.
- **Volume:** 544 commits, 119 of them `feat(`. 681 files changed (+86,949 / −1,149); plugin files: 260 changed (+43,701 / −997).
- **Tests:** 11,071 in total, 11,037 pass, 0 fail, 34 skipped.
- **Timeline:** 2026-10-05 → 2026-10-08.

**Key accomplishments:**
- **Store live-smoke fixes (55, shipped in 2.13.2):**
  - `gh setup` ruleset bypass actors and `references/` in the checks sparse-checkout.
  - An unpushed-commit guard on verify, merge and reconcile.
  - Wiki retry and store issue naming, proven against real GitHub.
- **Objective-number correctness (56):**
  - One `text-escape.cjs`, with a CI ratchet against hand-rolled escapes.
  - `4.1` never selects `04.10-*`, and lookups tolerate leading zeros.
  - Requirement IDs come only from ID-shaped tokens.
- **Estimation engine (57–58, 64):**
  - Token data stamped into SUMMARYs and backfilled from transcripts.
  - `df-tools calibrate`: deterministic, measured agent overhead, and from 64 a recency window that defaults to 10 objectives.
  - `df-tools estimate task|trd|objective|milestone|start|wave|finish|backtest`.
  - Estimate tables in PLANNING COMPLETE, a one-line build estimate, a status-line ETA, and actual against estimate in wave reports.
  - Run history archived per objective, so future validation is prospective.
- **State and merge plumbing (59):**
  - A JSON-aware merge driver for `state.json` and `STATE_ARCHIVE.md`.
  - `state advance-job --objective` derives Status from disk.
  - `--cwd` worktree preflight, `milestone complete` scoped to the milestone bullet, and truthful change flags.
- **Edit gate on Bash writes (60):**
  - `gate-bash-writes.js` covers redirects, `tee`, `sed -i`, `cp`/`mv` and inline interpreter writes. Mentions are never gated.
  - The false-positive rate was measured by `session-audit` at ≤ 0.035 (an upper bound). The default therefore ships as `warn`, and `strict` is opt-in.
- **Store-mode rough edges and observability (61):**
  - A checks-workflow pin warning (W062).
  - `requires:` skill gating through doctor.
  - Current model ids, with a stale-id warning (W063).
  - `telemetry --scan`.
  - A throttled SessionStart `transcript-export`.
  - Objective-named PR titles.
- **Built-in sweep and todo store (62–63):**
  - TaskCreate/TaskUpdate progress, plan-mode draft review, and AskUserQuestion in every skill and workflow, enforced by a CI ratchet.
  - `/devflow:todo` on the session task list, with a Stop-hook sync into a durable archive.
  - A hook coexistence suite.
  - `docs/built-in-integration-status.md`.

### Known Gaps

The audit status is `gaps_found` (35/36 requirements, 10/10 objectives, integration 11/12, flows 4/4). See `milestones/v1.5-MILESTONE-AUDIT.md`.

- **EST-08 (Objective 64), unsatisfied but accepted on 2026-10-08.** The requirement: across 59–63, the median estimate is within ±30% of actual and P90 covers ≥80% of outcomes.
  - **Measured on the frozen pre-59 calibration:**
    - Agent-minutes median ratio: 1.51, with 2/5 objectives in band.
    - Cost: median ratio 0.86, 4/5 objectives in band.
    - P90 covers 5/5 objectives on minutes.
  - **After honest gap closure** (recency window 10, chosen on 46–58 and validated leave-future-out): the minutes ratio improved to 1.24, but still only 2/5 objectives are in band, and cost P90 coverage is 78% of TRDs.
  - **Only prospective point:** objective 63 came in at 0.87× its pre-recorded wall estimate.
  - **Follow-up:** todo `recalibrate-estimate-minutes-est-08-not-met`. Retest prospectively on the next five objectives.
- **Not live locally.** The installed runtime is 2.13.2. It lacks the v1.5 libraries (todo-sync, checks-pin, estimate-backtest, skill-requires, builtin-audit) and the new hooks. They become live after a release from `main` and a session restart.
- **Still open from earlier milestones:**
  - CI `ANTHROPIC` secret (32/33).
  - Branch protection on `main` (34).
  - The docs site deploy: the Cloudflare Pages project `devflow-docs` is not found.
- **Tech debt for the next milestone:**
  - `milestone complete` has no `--dry-run` and silently ignores unknown flags.
  - `milestone-scope.cjs` uses a local objective-directory parser instead of the 56 helpers.
  - `milestone complete` re-run duplicates its MILESTONES entry.
  - `objective remove` renumbering rewrites dates.
  - 58's SUMMARY frontmatter omits EST-02 and EST-04.
  - The executor token stamp is missing from the installed runtime (todo).
  - `planning draft` can be staler than the live file.
  - The `verify-commits.js` SubagentStop output shape.
  - df-tools noise: a no-op `state update-progress`, `objective-job-index` showing gap_closure as null, and `verify trd-pre 64` returning "not found".

---
