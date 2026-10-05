# Roadmap: DevFlow Claude

## Milestones

- ✅ **v1.1 — DevFlow Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)
- ✅ **v1.2 — Token Efficiency + Ambient Mode + Handoff Polish** — Objectives 10–23, 25 (shipped 2026-07-22)
- ✅ **v1.3 — Autonomy hardening, stack profile, upgrade/adopt, doc auto-correction** — Objectives 27–41 (completed 2026-09-28; plugin v2.11.0, merged to `main` with 2.13.0)
- ✅ **v1.4 — GitHub as system of record, stack drafter, doctor, autonomy hardening** — Objectives 42–54 (completed 2026-10-05; plugin v2.13.0 + v2.13.1; 26 killed)
- 📋 **v1.5 — not yet planned**

Full archived roadmaps: `.planning/milestones/v1.2-ROADMAP.md` (v1.1 + v1.2 detail), `.planning/milestones/v1.3-ROADMAP.md` (v1.3 detail; audit: `milestones/v1.3-MILESTONE-AUDIT.md`), `.planning/milestones/v1.4-ROADMAP.md` (v1.4 detail; audit: `milestones/v1.4-MILESTONE-AUDIT.md`). Milestone history: `.planning/MILESTONES.md`.

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

<details>
<summary>✅ v1.4 GitHub as System of Record, Stack Drafter, Doctor, Autonomy Hardening — COMPLETED 2026-10-05 (plugin v2.13.0 + v2.13.1)</summary>

- [x] Objective 42: Codebase-aware stack drafter (15/15) — verified 5/6, gap closed by 43
- [x] Objective 43: Stack drafter rules (15/15, gap closure) — verified 36/36
- [x] Objective 44: Autonomy hardening (10/10) — verified 7/7
- [x] Objective 45: DevFlow doctor + runtime hygiene (10/10) — verified 13/13
- [x] Objective 46: GitHub sync foundations (10/10) — verified 6/6
- [x] Objective 47: GitHub authoritative store (14/14) — verified 6/6
- [x] Objective 48: Planning write-path migration (23/23) — verified 10/10, human_needed (live smoke)
- [x] Objective 49: Objective branch and PR lifecycle (15/15) — verified 4/4
- [x] Objective 50: GitHub enforcement and setup (13/13) — verified 4/4
- [x] Objective 51: GitHub migration and docs (10/10) — verified 3/3
- [x] Objective 52: Store-mode polish (6/6, tech debt) — verified 32/32
- [x] Objective 53: Worktree and health hygiene (7/7, tech debt) — verified 8/8
- [x] Objective 54: CodeQL cleanup (10/10) — verified 9/9; CodeQL on main 56 → 0
- [—] Objective 26: GitHub issue auto-build monitor — killed 2026-10-01 (GMD-04)

</details>

### 📋 v1.5 candidates

Not yet planned; `/devflow:milestone new` starts it. Triaged 2026-10-05: resolved items were removed, low-value ones dropped, and the rest grouped below. Objective 55 (store live-smoke fixes) shipped first, in 2.13.2. Suggested shape: a hardening milestone (the four "Do" groups), with #35 or #36 added if it should carry a feature.

**Decide before planning (user):**
- CI `ANTHROPIC` secret, needed only for the live visual judge in CI (32/33).
- Branch protection on devflow-claude `main` (34).
- Docs site deploy: Cloudflare Pages project `devflow-docs` not found (fails on every `main` push since 2.11).

**Do: edit gate enforces the action (DECISION-001 resolved option-a, 2026-10-05)**
- Gate writes to tracked repo source made through Bash (redirection, `tee`, `sed -i`, `cp`/`mv` onto a file, inline python/node writes) like `Edit`/`Write`. It is preventive: 0 bypasses since 2.11.0 (quick-31).
- Bounds: invocation-aware parsing (strip heredoc bodies and quoted args); tracked-source scope only (never `.planning/`, `.md`, out-of-repo, tmp or scratchpad); keep every existing escape and `gates.editGate`; measure the false-positive rate with `session-audit` before it ships as default strict. See `.planning/decisions/resolved/DECISION-001.md`.

**Do: state and merge plumbing**
- `state advance-job` rewrites STATE.md `**Status:**` to "ready for verification" (hit every 55 executor).
- Merge path for `STATE_ARCHIVE.md` / `state.json`: parallel waves conflict on them every time. Candidate fix: a JSON-aware merge driver.
- Executors run their first `exec-context` preflight from the main checkout. Spawn prompts should pass `--cwd <worktree>`.
- `milestone complete` stats count every objective dir. Its `state_updated`, and `objective remove`'s `roadmap_updated`, report by existence.

**Do: objective-number correctness**
- Hand-rolled regex escapes outside `text-escape.cjs` (state x5, gh-hierarchy, planning-verbs, planning-entity-verbs, frontmatter, watcher-daemon).
- `searchObjectiveInDir` matches `04.10-*` for `4.1`. The ROADMAP lookup in novel-domain and trd-pre-check never matches single-digit objectives (leading zero).
- `verify trd-pre` reads a free-text Requirements line as requirement IDs.

**Do: store-mode rough edges**
- `gh setup` dry run omits the pinned `uses:`/`devflow-ref:` lines, and its printed steps lack a PR-create command.
- PR titles still use the directory slug (issue titles use the name).
- Doctor/health warning when a repo's checks workflow is pinned to a DevFlow ref older than the installed plugin (pre-2.13.2 pins have broken checks).
- Capability gate: `requires:` skill frontmatter plus a doctor-backed refusal with remediation (gh, docker, …). This is the one idea kept from the deleted visual-workflow proposal.

**Do: observability and model ids**
- `model-profiles.json` pins `claude-opus-5` / `claude-sonnet-5`; current ids are `claude-opus-5-5` / `claude-sonnet-5-5`.
- `telemetry --scan` is silently ignored: implement it or reject the flag.
- `transcript-export` never runs automatically: throttle it at SessionStart like the backup prune.
- Backfill the 09-03 SUMMARY (the last I001).

**Feature candidates (pick zero or one):**
- #35 Phase J: Claude Code built-in integration.
- #36 Phase K: agentic estimation engine (`df-tools estimate`).

**Dropped 2026-10-05:**
- Resolved: CLAUDE.md counts now match (13 agents / 16 hooks / 34 skills); adopt now gitignores `.planning/.*` markers.
- Intentional: on a draft PR, `gh pr merge` reports "draft" before the unpushed-commit guard.
- Low value: 28-06 Haiku replay eval and the escalation re-spawn consumer (Sonnet matches Opus on subagent work).
- Unused: handoff-watcher PTY gaps and the `devflow-watch stash add` CLI.
- Out of scope: the sibling `monorepo-standards` command naming; the Codex port and the visual workflow class proposals (deleted).

### Objective 55: Store live-smoke fixes

**Goal:** Fix what the first live store-mode smoke (2026-10-05, `AO-Cyber-Systems/devflow-store-smoke`) found against real GitHub. Three bugs block store adoption: (1) the `gh setup` ruleset has no bypass actors, (4) `devflow-checks.yml` sparse-checkout omits `references/`, so the required checks crash, and (5) verify, merge and reconcile ignore unpushed local commits. Also fix the wiki-retry, `objective put` and wording issues, then re-run the live smoke.
**Requirements:** 55-1, 55-2, 55-3, 55-4, 55-5, 55-6
**Depends on:** none
**TRDs:** 8 plans

TRDs:
- [x] 55-01-setup-ruleset-bypass-and-pin-TRD.md — (W1) 55-1 + 55-4 caller: setup ruleset grants RepositoryRole 5 `always` bypass (superset-idempotent), guidance names `gh pr merge <n> --admin`; `checks_workflow@<ref>` pins `devflow-ref`
- [x] 55-02-checks-sparse-and-wiki-retry-TRD.md — (W1) 55-4: `references/` in every sparse checkout + sparse-copy guard test; 55-3: flush retries a halted blocked wiki-push once
- [x] 55-03-unpushed-commit-guard-TRD.md — (W1) 55-5: `unpushedCommits`; `verification post` and `gh pr merge` refuse naming `gh pr sync`
- [x] 55-04-store-issue-naming-TRD.md — (W1) 55-6: objective issue title from ROADMAP / OBJECTIVE.md heading, not the dir slug; store-mode footer
- [x] 55-05-objective-put-hint-and-reconcile-content-TRD.md — (W2) 55-2: unknown objective names `objective add`; 55-6: reconcile deletes branches whose content is already merged (merge-tree)
- [x] 55-06-live-setup-rerun-TRD.md — (W3, checkpoint) push approval; smoke `upgrade --apply` (state.json/stamp); ruleset re-created by `gh setup --apply`; workflow PR merged with admin bypass; runner without ENOENT
- [x] 55-07-live-objective-lifecycle-TRD.md — (W4) objective 2 live: guard fires, `gh pr sync`, checks green, merge queue, reconcile, code on main
- [x] 55-08-docs-and-changelog-TRD.md — (W5) USER-GUIDE / gh-sync skill / execute-objective prose from the live results; CHANGELOG [Unreleased]; `npm test`

## Progress

| Objective | Milestone | Plans | Status | Completed |
|---|---|---|---|---|
| 0–9, 6, 8, 24 (13 objectives) | v1.1 | 53/53 | Complete | 2026-05-06 |
| 10–23 (15 objectives) | v1.2 | 71/71 | Complete | 2026-05-25 |
| 25. Fleet audit fixes | v1.2 | 6/6 | Complete | 2026-07-22 |
| 27–41 (15 objectives) | v1.3 | 107/109 | Complete (27-03, 28-06 deferred) | 2026-09-28 |
| 42–54, 26 (13 objectives + 26 killed) | v1.4 | 158/158 | Complete | 2026-10-05 |
| 55. Store live-smoke fixes | v1.5 | 8/8 | Complete | 2026-10-05 |
