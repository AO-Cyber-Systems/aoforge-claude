# Roadmap: AOForge

## Milestones

- ✅ **v1.1 — DevFlow Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)
- ✅ **v1.2 — Token Efficiency + Ambient Mode + Handoff Polish** — Objectives 10–23, 25 (shipped 2026-07-22)
- ✅ **v1.3 — Autonomy hardening, stack profile, upgrade/adopt, doc auto-correction** — Objectives 27–41 (completed 2026-09-28; plugin v2.11.0, merged to `main` with 2.13.0)
- ✅ **v1.4 — GitHub as system of record, stack drafter, doctor, autonomy hardening** — Objectives 42–54 (completed 2026-10-05; plugin v2.13.0 + v2.13.1; 26 killed)
- ✅ **v1.5 — Gate & Plumbing** — Objectives 55–64 (completed 2026-10-08; 55 in plugin v2.13.2, 56–64 unreleased; EST-08 not met, accepted)
- 🚧 **v1.6 — Hardening & Release** — Objectives 65–75 (in progress)

Full archived roadmaps: `.aoforge/milestones/v1.2-ROADMAP.md` (v1.1 + v1.2 detail), `.aoforge/milestones/v1.3-ROADMAP.md` (v1.3 detail; audit: `milestones/v1.3-MILESTONE-AUDIT.md`), `.aoforge/milestones/v1.4-ROADMAP.md` (v1.4 detail; audit: `milestones/v1.4-MILESTONE-AUDIT.md`), `.aoforge/milestones/v1.5-ROADMAP.md` (v1.5 detail; audit: `milestones/v1.5-MILESTONE-AUDIT.md`; requirements: `milestones/v1.5-REQUIREMENTS.md`). Milestone history: `.aoforge/MILESTONES.md`.

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

<details>
<summary>✅ v1.5 Gate & Plumbing — COMPLETED 2026-10-08 (Objective 55 in plugin v2.13.2; 56–64 unreleased)</summary>

- [x] Objective 55: Store live-smoke fixes (8/8) — verified 7/7
- [x] Objective 56: Objective-number correctness (5/5) — verified 6/6
- [x] Objective 57: Estimation data foundation (7/7) — verified 4/4
- [x] Objective 58: Estimation engine and surfacing (10/10) — verified 4/4
- [x] Objective 59: State and merge plumbing (7/7) — verified 5/5
- [x] Objective 60: Edit gate enforces the action (7/7) — verified 5/5
- [x] Objective 61: Store-mode rough edges and observability (9/9) — verified 5/5
- [x] Objective 62: Built-in sweep (11/11) — verified 3/3, UAT approved
- [x] Objective 63: Todo store, hook coexistence and built-in inventory (7/7) — verified 3/3, UAT approved
- [x] Objective 64: Estimate accuracy validation (10/10, incl. one gap-closure cycle) — verified 2/3; EST-08 not met, accepted

</details>

### 🚧 v1.6 Hardening & Release (In Progress)

Ship v1.5, close what it left open, and clear the backlog. Requirements: `.aoforge/REQUIREMENTS.md` (41 mapped to Objectives 65-77). Every live step (merge, tag, push, repository settings, secrets, Cloudflare) is a checkpoint that runs only on explicit per-action user approval; AOForge never enters a secret value.

Sequencing: 65 releases v1.5 first, so the installed runtime carries the v1.5 code that later objectives build on and measure. 66 (token stamp) needs that runtime. 67 (recalibration) is frozen before it is scored. Objectives 68-72 are the first five executed after 67 and are the objectives EST-11 scores, and each records a run-state estimate (`estimate start`) before it runs. 68-71 are agent-only work; 72 is scored in full, including the wait time of its rollout checkpoints (accepted 2026-10-08). 73 (live handoff demo) and 74 (user-action operations) run after the scored five because their minutes are dominated by human wait time. 75 goes last: it closes EST-11 once 68-72 have executed, and sweeps every pending todo.

- [x] **Objective 65: Release v1.5** - Version bump, CHANGELOG release section, merge to `main`, tag, and the installed runtime carrying the v1.5 libs and hooks (completed 2026-10-08)
- [x] **Objective 66: Executor token stamp** - Every new executor SUMMARY carries `tokens_input` / `tokens_output`, with measured forward-stamp coverage (completed 2026-10-08)
- [x] **Objective 67: Minutes recalibration** - A method frozen and recorded before it is scored; nothing fitted to the objectives it is scored on (completed 2026-10-08)
- [x] **Objective 68: Milestone and objective verbs** - `milestone complete` dry run and idempotence, `objective remove`/`complete` fixes, shared objective helpers, strict flag rejection (completed 2026-10-08)
- [x] **Objective 69: Drafts, health and doctor** - Stale `planning draft` protection, skill-marker health checks, requirements-completed agreement check (completed 2026-10-08)
- [x] **Objective 70: CLI defects and hook shape** - `state update-progress`, `verify trd-pre`, `objective-job-index` and the `verify-commits.js` output schema (completed 2026-10-08)
- [x] **Objective 71: Stack drafter and verify policy** - govulncheck gate preference, buf lint drafting, `stack verify --run` policy for services and artifacts (completed 2026-10-08)
- [x] **Objective 72: Rename to AOForge and naming cleanup** - DevFlow becomes AOForge with one-release shims and in-place migrations, ships as 3.0.0, the user's setup and fleet move over, and no legacy `df-*` remains (completed 2026-10-09)
- [x] **Objective 73: Handoff gaps and result injection** - Three PTY gaps closed, handoff results injected, a live TTY end-to-end demonstration (completed 2026-10-10)
- [ ] **Objective 74: Operations decisions** - CI `ANTHROPIC` secret and live visual judge, branch protection on `main`, docs site deploy
- [x] **Objective 75: Prospective estimate retest and todo sweep** - EST-08's criterion re-tested on 68-72; every pending todo completed or re-scoped (completed 2026-10-10)
- [x] **Objective 78: Remove the rename shims** - The one-release rename shims, migrations 0012/0013, the dual-namespace GitHub readers and the devflow pointer plugin go in 3.1.0, as promised for the release after 3.0.0 (completed 2026-10-17)
- [ ] **Objective 79: Reconcile and release 3.1.0** - The fix branch (main + quick 34-39), PR #129 and objective 78 meet in one integration branch, the merged tree passes every guard, and 3.1.0 ships through one PR after per-step approval

### Objective 65: Release v1.5

**Goal**: The v1.5 work is on `main`, tagged at the next plugin semver, and the installed runtime carries it.
**Requirements**: REL-01, REL-02
**Depends on**: Nothing (v1.5 is complete)
**Success Criteria** (what must be TRUE):
  1. `package.json`, `plugin.json` and `marketplace.json` carry the same new version, and CHANGELOG has a `## [X.Y.Z]` section where `[Unreleased]` was (the changelog gate passes).
  2. After the user approves each live step, `feat/stack-profile-loader` is merged to `main` and the tag sits on the merge commit. Build and validation of the release artifacts happen without any live step; merge, tag and push each stop at a checkpoint.
  3. After the release and a session restart, `~/.claude/devflow/` holds the v1.5 libs and hooks (todo-sync, checks-pin, estimate-backtest, skill-requires, builtin-audit, gate-bash-writes, gate-skill-requires, todo-sync Stop hook).
  4. `doctor` and `validate health` report no mirror lag.
**TRDs**: 4 plans

TRDs:
- [x] 65-01-release-artifacts-and-validation-TRD.md — (W1) bump package.json/plugin.json/marketplace.json to 2.14.0, promote CHANGELOG [Unreleased] to [2.14.0] by hand, regenerate docs data, signed release commit; `npm test`, tag-gate dry run, notes preview, manifest/health/doctor baseline, merge-tree clean (local only)
- [x] 65-02-push-branch-and-open-release-pr-TRD.md — (W2) approval gate: push the branch; approval gate: open the release PR; wait for green PR CI
- [x] 65-03-merge-tag-and-github-release-TRD.md — (W3) approval gate: merge the PR (merge commit); approval gate: annotated tag v2.14.0 on the merge commit and push it; verify the release.yml GitHub release and the main runs
- [x] 65-04-installed-runtime-verification-TRD.md — (W4) human action: plugin update and Claude Code restart; verify the mirror has the v1.5 libs, the installed hooks are registered, and doctor/health show no mirror lag

### Objective 66: Executor token stamp

**Goal**: Every executor SUMMARY records its own token usage at write time, so estimation data no longer depends on after-the-fact backfill.
**Requirements**: EST-09
**Depends on**: Objective 65 (the installed executor prompt must carry the stamp step, which only a release delivers)
**Success Criteria** (what must be TRUE):
  1. The installed `agents/executor.md` (new plugin version) contains the `tokens stamp ... --draft` step, and a repo test fails if the repository copy lacks it.
  2. A SUMMARY written by an executor in this milestone has `tokens_input` and `tokens_output` in its frontmatter with no backfill run.
  3. A command reports forward-stamp coverage over the TRDs executed in v1.6; the target is at least 95%, and the measured number is printed and recorded (no rounding up).
**TRDs**: 4 plans

TRDs:
- [x] 66-01-tokens-coverage-command-TRD.md — (W1) `df-tools tokens coverage [--milestone|--objective]`: live/counted forward-stamp coverage, exact fraction + floored decimal, missing reasons (stamp_skipped / no_transcript), read-only
- [x] 66-02-stop-gate-token-check-TRD.md — (W1) gate-executor-stop blocks once when the final SUMMARY has no tokens_input/tokens_output (the 64-09/64-10 skipped-stamp cause); executor.md self_check sentence
- [x] 66-03-continuation-prompt-and-inline-rule-TRD.md — (W2) execute-objective: every TRD runs in an executor (the 65-02/65-03 inline cause), explicit continuation spawn prompt with PLAN_ID/REPO_ROOT, `**Token stamp:**` line in the objective report
- [x] 66-04-docs-and-coverage-evidence-TRD.md — (W3) CHANGELOG/USER-GUIDE/CLAUDE.md; SC-1 mutation proof, SC-2 live stamps, SC-3 measured v1.6 coverage recorded verbatim; release recorded as follow-up

### Objective 67: Minutes recalibration

**Goal**: Minute estimates use a method chosen and frozen before any objective is scored with it, so the next accuracy test is honest.
**Requirements**: EST-10
**Depends on**: Objective 66 (stamped token data is calibration input), Objective 65 (the recalibrated estimator must run from the installed runtime; if estimator code changes, a patch release or a repo-copy decision is a checkpoint)
**Success Criteria** (what must be TRUE):
  1. A recorded decision names the method (TRD-level history, a recency window or weighting, or another option from the 64 report), its provenance and its validation protocol, and is committed before any scoring run.
  2. `calibrate` writes a calibration whose identity names the method and its parameters, byte-identical on unchanged inputs.
  3. The validation protocol excludes the objectives that EST-11 will score (68-72), and a check shows no input from them reached the calibration.
  4. `df-tools estimate` run from the installed runtime uses the new calibration.
**TRDs**: 9 plans

TRDs:
- [x] 67-01-method-decision-TRD.md — (W1) record DECISION-003 via `decision open|answer`: trd_level minutes, window 10, through 66; fallback task_sum; provenance; validation protocol V1-V6; committed before any score
- [x] 67-02-calibrate-method-identity-and-cutoff-TRD.md — (W2) calibration v3 `method` block in file and digest; `calibrate --minutes` / `--through` (cutoff at collection, metric rows included); fixture proof that 67-72 leave a through-66 calibration byte-identical
- [x] 67-03-estimator-trd-level-minutes-TRD.md — (W2) estimator reads v3; trd_level TRD minutes independent of task count; `calibration.method` in results, run state and text
- [x] 67-04-positive-controls-and-validation-run-TRD.md — (W3) PC1 (fdf60e66) and PC2 (64-09 rows) reproduce, then one score of task_sum vs trd_level on `--through N-1` cuts of 46-66; 64's shipRule selects; 67-VALIDATION.md
- [x] 67-05-ship-default-and-docs-TRD.md — (W4) `calibrate` default minutes method from the ship rule; method lists tied by a test; CHANGELOG/USER-GUIDE/CLAUDE.md/help
- [x] 67-06-release-artifacts-and-validation-TRD.md — (W5) 2.15.0 bump, CHANGELOG promotion, docs data, suite, tag-gate dry run, merge-tree (local only)
- [x] 67-07-push-branch-and-open-release-pr-TRD.md — (W6) approval gate: push; approval gate: open the release PR; PR CI recorded
- [x] 67-08-merge-tag-and-github-release-TRD.md — (W7) approval gate: merge (merge commit); approval gate: annotated tag v2.15.0; release.yml and main runs verified
- [x] 67-09-install-and-freeze-calibration-TRD.md — (W8) human action: plugin update + restart; installed `calibrate --minutes <selected> --window 10 --through 66` builds the frozen EST-11 calibration; SC-2/SC-3/SC-4 proven on the installed runtime; 67-FREEZE.md + STATE.md blocker

### Objective 68: Milestone and objective verbs

**Goal**: The milestone and objective verbs are safe to preview, safe to re-run, and correct when later objectives exist. This is the first of five objectives scored by EST-11 and records a run-state estimate before it runs.
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05
**Depends on**: Objective 67 (the first objective executed after EST-10 ships, scored by Objective 75)
**Success Criteria** (what must be TRUE):
  1. `milestone complete --dry-run` prints what it would write and changes nothing on disk (a diff of `.planning/` is empty).
  2. Running `milestone complete` twice for one version leaves one MILESTONES.md entry and one set of archive files.
  3. A df-tools verb that writes exits with an error naming an unknown flag instead of ignoring it.
  4. `objective remove` keeps the completion dates and other metadata of the objectives it renumbers.
  5. `objective complete` reports the right `next_objective` and `is_last_objective` when later objectives exist only in ROADMAP.md, and `milestone-scope.cjs` finds objective directories through the shared helpers with no local parser.
**TRDs**: 7 plans

TRDs:
- [x] 68-01-milestone-complete-dry-run-and-rerun-TRD.md — (W1) `milestone complete` split into a read-only plan and its executor; `--dry-run` (local); re-run keeps the entry and archives, `1.0` = `v1.0`; `milestoneHeadingPattern` in text-escape.cjs
- [x] 68-02-milestone-scope-shared-helpers-TRD.md — (W1) `parseObjectiveDirName` / `canonicalObjectiveNumber` in helpers.cjs; milestone-scope.cjs resolves directories through `objectiveDirMatches`, no DIR_RE/canonical(); exports `roadmapSections`
- [x] 68-03-unknown-flag-guard-TRD.md — (W1) dispatcher guard (`lib/flag-guard.cjs`) + `lib/flag-spec.cjs` for the planning and state writers; spawn probes assert exit 1, the named flag, no write
- [x] 68-04-objective-remove-and-complete-TRD.md — (W2) bounded NN-MM renumber rule keeps dates and metadata; `nextObjective` reads directories and ROADMAP sections for local and store `objective complete`
- [x] 68-05-flag-spec-every-writer-TRD.md — (W2) spec entries for the remaining writing commands; repo test: spec = help.cjs `mutates`, a probe per entry, exemption reasons, documented invocations accepted
- [x] 68-06-store-milestone-dry-run-TRD.md — (W2) store-mode `milestone complete --dry-run` with zero gh calls; `milestone put` shares the MILESTONES.md heading rule
- [x] 68-07-dogfood-and-docs-TRD.md — (W3) SC-1..SC-5 on scratch copies of this repo's `.planning/`; CHANGELOG, USER-GUIDE, CLAUDE.md, df-tools header; objective-complete todo completed

### Objective 69: Drafts, health and doctor

**Goal**: Planning drafts cannot publish stale content, and health checks catch a skill marker or SUMMARY record that silently misleads a gate or an audit. Scored by EST-11.
**Requirements**: TOOL-06, TOOL-09, TOOL-10
**Depends on**: Objective 68 (execution order, so the five scored objectives run in sequence)
**Success Criteria** (what must be TRUE):
  1. `planning draft` reseeds a draft older than the live file, and `doc put` refuses a draft whose base is no longer the live file with a message naming the fix.
  2. `validate health` and `doctor` flag a `.planning/.skill-active` marker that is tracked in git or stale, and `--repair` / `--fix` untrack or remove it without touching other files.
  3. A check flags a requirement that a VERIFICATION marks satisfied but no SUMMARY lists in `requirements-completed`, and Objective 58's SUMMARY frontmatter is corrected so the check passes on this repo.
**TRDs**: 6 plans

TRDs:
- [x] 69-01-draft-staleness-guard-TRD.md — (W1) draft base records (`<draft>.base.json`); `planning draft` reseeds a stale draft and keeps `.stale`; `doc put` refuses a stale draft naming `planning draft <rel>`
- [x] 69-02-skill-marker-health-check-TRD.md — (W1) `lib/skill-marker-health.cjs` + `doctor-git.checkIgnored`; `validate health` Check 19 (E006 tracked, W064 stale) and a `--repair` that untracks/removes only the marker behind the DOC-06 guard
- [x] 69-03-requirements-agreement-check-TRD.md — (W1) `lib/requirements-agreement.cjs` (REQUIREMENTS-document scope); repo test RED then GREEN by correcting eight objective 58 SUMMARYs through `summary post`
- [x] 69-04-doctor-skill-marker-ownership-TRD.md — (W2) doctor check 23 over skill-marker-health (tracked markers, owns E006/W064); check 22 defers them and counts only its own repairable issues
- [x] 69-05-validate-requirements-wiring-TRD.md — (W2) `validate health` Check 20 (W065) and `validate requirements [--objective <N>]` (dispatch, help, flag-spec, probe)
- [x] 69-06-dogfood-and-docs-TRD.md — (W3) SC-1..SC-3 on scratch copies plus landed-state evidence; CHANGELOG, USER-GUIDE, CLAUDE.md; skill-active todo completed

### Objective 70: CLI defects and hook shape

**Goal**: The small defects the v1.5 audit listed are gone, and `verify-commits.js` speaks Claude Code's hook output schema. Scored by EST-11.
**Requirements**: TOOL-07, TOOL-08
**Depends on**: Objective 69 (execution order)
**Success Criteria** (what must be TRUE):
  1. `state update-progress` changes STATE.md progress or exits with an error; it never succeeds silently doing nothing.
  2. `verify trd-pre <N>` resolves an objective that exists on disk instead of reporting "Objective not found".
  3. `objective-job-index` reports `gap_closure` read from TRD frontmatter.
  4. A `verify-commits.js` SubagentStop result is valid against Claude Code's hook output schema, and a test pins that shape.
**TRDs**: 3 plans

TRDs:
- [x] 70-01-cli-defects-TRD.md — (W1) fixture builders; `state update-progress` rewrites the plain line, inserts under `## Current Position` or exits 1; `verify trd-pre` resolves from any cwd inside the project or a path, not-found exits 1; `objective-job-index` `gap_closure`
- [x] 70-02-verify-commits-hook-shape-TRD.md — (W1) cited Stop/SubagentStop schema model (`hooks/__fixtures__/hook-output-schema.js`); top-level `{decision, reason}` scoped to `devflow:executor`; shape-pinning test; coexistence contract uses the model
- [x] 70-03-dogfood-and-docs-TRD.md — (W2) SC-1..SC-4 before/after on scratch copies and read-only live commands; CHANGELOG, CLAUDE.md, USER-GUIDE, job-checker; live-SubagentStop todo; full suite

### Objective 71: Stack drafter and verify policy

**Goal**: The stack drafter picks the gate that actually scans, and `stack verify --run` has a stated policy for tests that need services and builds that write artifacts. Scored by EST-11.
**Requirements**: SDR-09, SDR-10
**Depends on**: Objective 70 (execution order)
**Success Criteria** (what must be TRUE):
  1. For a workflow with both a `--self-test` govulncheck step and a real gate step, the drafted `audit` command is the real gate.
  2. For a repo whose lint target runs `buf lint`, the drafted lint coverage includes it; rows these rules close are removed from ACCEPTED in `stack-fleet-tables.cjs` and the fleet harness guards them.
  3. `stack verify --run` skips a service-backed test, or requires an explicit opt-in, and reports it as `env_required`; it never reaches a local database silently.
  4. A build that writes an untracked, unignored output directory is restored or reported, and it does not halt unrelated components' gates.
**TRDs**: 5 plans

TRDs:
- [x] 71-01-drafter-self-test-and-declared-linters-TRD.md — (W1) realshape builders; a `--self-test` step never fills a key beside its gate (`self_test` note); a `lint` target running the tier default plus unconditional linters (`buf lint` via AUX_LINTERS/`linterToolOf`) is kept; read-only fleet check
- [x] 71-02-fleet-tables-and-guards-TRD.md — (W2) `aodex.audit` leaves ACCEPTED; justinforme/smartWellness `lint` become OPEN `pending: 'refresh'` rows; per-repo `selfTestDrafts` guard; real-fleet harness green
- [x] 71-03-verify-service-policy-TRD.md — (W1) CI steps carry `services`/`envNames`; `stack verify --run` skips a service-backed gate `env_required` (text, CI job, test env file); `--allow-services` opt-in, marked `services=allowed`
- [x] 71-04-verify-build-outputs-TRD.md — (W2) a `build`'s new untracked files under bin/build/dist/out/target are removed, listed as `build_outputs` and do not halt other components' Dart/Flutter gates
- [x] 71-05-dogfood-and-docs-TRD.md — (W3) SC-1..SC-4 before/after (fleet read-only, `--run` on scratch clones with stubs); CHANGELOG, CLAUDE.md, USER-GUIDE, stack guide, workflows, help; todos

### Objective 72: Rename to AOForge and naming cleanup

**Goal**: DevFlow becomes AOForge everywhere it is a name, old names keep working for one release, every project and the user's setup move over in place, and the legacy `df-*` install is gone and stays gone. Scored by EST-11 (all of it, including checkpoint wait time).
**Requirements**: INST-01, INST-02, INST-03, INST-04, INST-05, INST-06
**Depends on**: Objective 71 (execution order)
**Success Criteria** (what must be TRUE):
  1. `ls ~/.claude/skills ~/.claude/agents` shows no `df-*` entries (moved to backup, never deleted), and `doctor` flags one that reappears.
  2. A repo test fails on `/df-`, `/df:` or `/devflow:` command forms in user-facing files (changelogs and archives exempt) and on any legacy DevFlow name outside the compatibility module, the history allowlist and the pointer plugin; every user-facing reference uses `/aoforge:<name>`.
  3. With only old names present (`DEVFLOW_*` set, a `.planning/` project with a `devflow{}` stamp, an old CLAUDE.md block, `devflow:` agent types and GitHub markers), every tool still works, `validate health` names the migration, and nothing is duplicated.
  4. A session start in a clean `.planning/` project moves it to `.aoforge/` with `git mv` and commits only the move; a dirty or mid-merge tree is skipped; config, CLAUDE.md and (after a dry run and approval) store-mode GitHub artefacts are renamed.
  5. 3.0.0 is tagged on `main` with the three version files in step and a CHANGELOG entry leading with the rename; the `devflow@aocyber` pointer release tells users to install `aoforge@aocyber`; aoforge flags an enabled devflow plugin.
  6. After approval of each step: this repo runs on `.aoforge/`, the global CLAUDE.md routes to `/aoforge:`, the repo is `aoforge-claude`, the checkout is `~/dev/aoforge-claude` with memory and run state carried over, the vanity PR is open for review, the Pages project is `aoforge-docs`, and each fleet repo was upgraded behind its own checkpoint.
**TRDs**: 27 plans (19 waves)

TRDs:
- [x] 72-01-rescope-requirements-and-roadmap-TRD.md — (W1) run-state estimate gate (`estimate start 72`; decision: frozen-method recalibration or unscored, never silent); INST-01 rewritten, INST-02..06 added; this entry rescoped to the AOForge rename
- [x] 72-02-legacy-names-and-compat-TRD.md — (W2) `legacy-names.cjs` (the one name map) and `compat.cjs` shims: env alias, `.aoforge`-first planning root, agent types, dot files
- [x] 72-03-rename-codemod-TRD.md — (W2) tested idempotent codemod (`scripts/aoforge-rename.cjs`): names and planning rules, preserves, skips, `unclassified=0` inventory
- [x] 72-04-apply-name-rename-TRD.md — (W3) names pass with `git mv` (plugins/aoforge, aof-tools, ...), entry points alias legacy env, rename guard repo test, CLAUDE.md transition note
- [x] 72-05-planning-dir-resolver-libs-TRD.md — (W4) libs resolve `.aoforge/` then legacy `.planning/`; legacy-layout contract suite; W066
- [x] 72-06-planning-dir-hooks-and-prose-TRD.md — (W5) hooks resolve both layouts; prose names `.aoforge/`; guard covers the planning dir name
- [x] 72-07-runtime-home-move-and-rekey-TRD.md — (W7) `~/.claude/devflow` state to `~/.claude/aoforge` (copy, outbox/backups move) from sync-runtime; `aof-tools state rekey`
- [x] 72-08-planning-dir-and-config-key-migrations-TRD.md — (W7) migrations 0012 (`git mv` to `.aoforge/`) and 0013 (config key); runner re-resolution; hook commit/defer; W067
- [x] 72-09-claude-md-markers-and-global-block-TRD.md — (W7) dual block markers, migration 0014, global template v4, outside-block diff applied only with `--confirm`
- [x] 72-10-coexistence-and-legacy-identities-TRD.md — (W6) coexistence-guard SessionStart hook; gates accept `devflow:` agent types; transcript readers keep old names
- [x] 72-11-gh-markers-labels-and-checks-TRD.md — (W7) GitHub markers and labels read both namespaces; both status contexts posted; legacy caller flagged
- [x] 72-12-file-level-legacy-identities-TRD.md — (W7) `.mcp.json` ownership key, todo metadata key, `~/.devflow/` file fallback, legacy adopt branch
- [x] 72-13-legacy-command-forms-gate-TRD.md — (W8) INST-01 repo test: `/df-`, `/df:`, `/devflow:` via NAMESPACE_RENAMES in skill-route; 0007 rewrites projects
- [x] 72-14-devflow-pointer-plugin-TRD.md — (W7) final `devflow@aocyber` 3.0.0 pointer: notice hook (no-op beside AOForge) and generated forwarding skills
- [x] 72-15-doctor-legacy-checks-TRD.md — (W8) doctor 15 (df-* reappearance), 16 (devflow leftovers), 27 (W066/W067); check 26 legacy callers
- [x] 72-16-gh-rebrand-verb-TRD.md — (W8) `aof-tools gh rebrand`: dry-run preview, per-repo apply, idempotent, resumable
- [x] 72-17-docs-identity-and-migration-guide-TRD.md — (W9) real gold AO emblem + AOForge wordmark on README and site; migration guide; USER-GUIDE/CLAUDE.md
- [x] 72-18-release-artifacts-3-0-0-TRD.md — (W10) 3.0.0 versions and CHANGELOG; validation; full upgrade rehearsal on a scratch clone (no live step)
- [x] 72-19-repo-rename-push-and-pr-TRD.md — (W11) checkpoints: rename repo to aoforge-claude, push, open the 3.0.0 PR
- [x] 72-20-merge-tag-and-release-TRD.md — (W12) checkpoints: merge, tag v3.0.0; release and marketplace verified
- [x] 72-21-install-aoforge-and-dogfood-migration-TRD.md — (W13) checkpoint install + restart; verify state migration and this repo's `.aoforge/` move; disable devflow
- [x] 72-22-active-docs-rewrite-TRD.md — (W14) PROJECT/ROADMAP/STATE/REQUIREMENTS and CLAUDE.md in AOForge terms; transition note removed
- [x] 72-23-global-claude-md-and-marketplace-TRD.md — (W15) checkpoints: global CLAUDE.md outside-block diff approval; marketplace re-point decision
- [x] 72-24-vanity-pr-and-pages-project-TRD.md — (W16) checkpoints: draft vanity-mapping PR (user merges); `aoforge-docs` Pages project + one deploy
- [x] 72-25-fleet-sweep-TRD.md — (W17) fleet discovery and preview; one approval per repository (upgrade, store-mode rebrand); nothing pushed
- [x] 72-26-checkout-move-and-rekey-TRD.md — (W18) checkpoint: user moves checkout to `~/dev/aoforge-claude`; worktrees, memory and keyed state carried over; follow-up PR for the post-merge commits (push and PR gates)
- [x] 72-27-gh-client-max-buffer-TRD.md — (W19, gap closure) gh-client spawn runner gets a 256 MiB buffer and 300 s paginated timeout with named ENOBUFS/ETIMEDOUT causes (TDD); read-only `gh rebrand --dry-run` against eden-biz recorded; INST-04 ticked only on success; no `--apply`

### Objective 73: Handoff gaps and result injection

**Goal**: A command that needs a TTY goes from detection to the user's shell to a result back in context, with no manual paste. Runs after the five scored objectives because the live demonstration includes human wait time.
**Requirements**: HND-01, HND-02, HND-03
**Depends on**: Objective 70 (the hook output shape it registers against), Objective 72 (sequencing only: stays outside the scored five)
**Success Criteria** (what must be TRUE):
  1. Each of the three PTY gaps (dispatch-wrapper isatty, wrapper stdin race, detector late match) has a regression test that fails on the old behavior and passes now.
  2. `inject-handoff-results.js` is registered in `hooks.json`, delivers a completed handoff result into the session, and appears in the hook coexistence suite.
  3. With the `aoforge-watch` daemon running, a TTY-required command (auth login, token paste or sudo prompt) is detected, handed off, run by the user, and its result appears in context. The live run is a user checkpoint and AOForge never types or reads a secret.
**TRDs**: 14 plans (8 + 6 gap closure)

TRDs:
- [x] 73-01-pty-dispatch-script-TRD.md — (W1) bash/zsh PTY dispatch through a private script file and one input line: output stays on the terminal (gap 1), no queued wrapper lines for `read` (gap 2), INT trap so Ctrl+C still ends in END:130; history guard
- [x] 73-02-handoff-delivery-library-TRD.md — (W1) `lib/handoff-results.cjs`: shared select/render, O_EXCL claim (exactly once), session/agent address, pending lookup, watcher check; route-results on it as the catch-all
- [x] 73-03-live-window-listeners-TRD.md — (W2) `attachDataListener(fn, { liveOnly })`: the detector sees only the live command (gap 3, late match); MA-6-synth / MA-7 / MA-6 assert instead of skipping
- [x] 73-04-inject-handoff-results-TRD.md — (W2) the DRAFT hook completed: PostToolUse context, Stop block with a bounded wait; gate-interactive records session/agent and names the aoforge-watch terminal
- [x] 73-05-attended-watch-terminal-TRD.md — (W3) attended `aoforge-watch start --foreground`: live output mirrored, the user's keys forwarded during a dispatch; respawning shell facade; PTY e2e test that plays the user
- [x] 73-06-hook-registration-and-coexistence-TRD.md — (W3) hooks.json PostToolUse `*` + Stop (timeout 150); coexistence RUNS entries; cited PostToolUse schema model; CLAUDE.md bullet out of Draft
- [x] 73-07-live-tty-demonstration-TRD.md — (W4, checkpoint) live run: ssh-keygen passphrase prompt answered by the user in the aoforge-watch terminal, result in context with no paste; evidence and cleanup
- [x] 73-08-docs-and-close-out-TRD.md — (W5) CHANGELOG [Unreleased], USER-GUIDE, site handoff guide, handoff skill, CLAUDE.md, HOOK_DOCS + docs data; todo complete; full suite
- [x] 73-09-home-is-never-a-project-TRD.md — (gap W1, G5a) `compat.findProjectRoot` and planning-mode stop at $HOME; spawned-hook regression under a temp HOME holding a watcher's `.aoforge/`
- [x] 73-10-gate-interactive-reads-invocations-TRD.md — (gap W1, G3/G1/G2) detection on `shell-words.parseCommand` segments: quoted text and heredoc bodies are data, flags and reasons per call, read-only key forms pass; daemon read through watcher-state
- [x] 73-11-user-files-in-runtime-home-TRD.md — (gap W2, G5b) `userDotFile` reads `~/.claude/aoforge/` first, `~/.aoforge/` and the pre-rename dir for one release; `watchStateDir`, `resolveUserFile`
- [x] 73-12-watch-daemon-state-dir-TRD.md — (gap W3, G5b) the daemon's pid and log in `~/.claude/aoforge/state/watch/`; a 3.0.0 pid file read and cleared for one release; tests and fixtures follow
- [x] 73-13-service-logs-and-doctor-check-TRD.md — (gap W3, G5) service logs in the watch dir; doctor check 17 `user-dot-dir` moves a leftover `~/.aoforge/` safely
- [x] 73-14-gap-closure-docs-TRD.md — (gap W4) CHANGELOG, USER-GUIDE known limitations and file locations, site guides, settings workflow, migration pages, CLAUDE.md, HOOK_DOCS + docs data

### Objective 74: Operations decisions

**Goal**: The three operational decisions open since v1.3 are closed. Each needs the user to act or approve, so its TRDs carry checkpoints. Runs after the five scored objectives so human wait time stays out of their minutes.
**Requirements**: OPS-01, OPS-02, OPS-03
**Depends on**: Objective 65 (branch protection and the docs deploy act on `main`, which must hold the release), Objective 72 (sequencing only)
**Success Criteria** (what must be TRUE):
  1. The user has set the `ANTHROPIC` secret (AOForge never sees the value), and the live visual judge runs in CI on a push to `main`.
  2. After the user approves the exact ruleset text, `main` requires the checks and rejects force-push; `gh` reads the ruleset back and it matches what was approved.
  3. The Cloudflare Pages project `aoforge-docs` exists, or the workflow's account and token are corrected by the user, and a push to `main` deploys green.
**TRDs**: 9 plans

TRDs:
- [x] 74-01-live-visual-judge-ci-TRD.md — (W1) real docs-site screenshot fixtures, `scripts/ci-visual-judge.cjs` (fails unless every state has vision evidence; TDD), `visual-judge.yml` on pushes to main
- [x] 74-02-cloudflare-target-and-docs-deploy-TRD.md — (W1) `scripts/ci-cloudflare-target.cjs` names the deploy account and projects without ids (TDD); docs.yml runs it and deploys previews from non-main branches
- [x] 74-03-main-ruleset-record-TRD.md — (W1) `.github/rulesets/main.json` (no force-push, PR + unit suite required) and `scripts/ruleset-check.cjs` compare/checks (TDD); live read-only inventory
- [x] 74-04-ops-branch-and-pr-TRD.md — (W2) `ops/74-ci-operations` off origin/main with only the 74-01/02 commits; checkpoints: push, open PR
- [x] 74-05-anthropic-secret-and-live-judge-run-TRD.md — (W3) checkpoints: user sets the ANTHROPIC secret (existence checked by name only); approved re-run of the live judge on the PR
- [ ] 74-06-cloudflare-credentials-and-pages-project-TRD.md — (W4) diagnostic read; checkpoints: user corrects credentials if needed and creates `aoforge-docs`; approved preview deploy
- [x] 74-07-apply-main-ruleset-TRD.md — (W5) checkpoint: user approves the exact ruleset text, one POST; read-back compare
- [x] 74-08-merge-and-verify-on-main-TRD.md — (W6) checkpoint: merge through the ruleset; verify judge, deploy and ruleset on main; checkpoint: devflow.cloud domain move decision
- [x] 74-09-docs-and-close-out-TRD.md — (W7) CHANGELOG, site guides, workflow comments, CLAUDE.md, REQUIREMENTS ticks, Pages todo complete

### Objective 75: Prospective estimate retest and todo sweep

**Goal**: EST-08's criterion is re-tested on five objectives that ran after recalibration, with the honest verdict reported, and no todo is left pending without a reason. It can close only after Objectives 68-72 have executed, the way Objective 64 depended on 59-63.
**Requirements**: EST-11, TODO-01
**Depends on**: Objective 67 (method), Objectives 68, 69, 70, 71, 72 (the five scored objectives, each with a run-state estimate recorded before it ran), Objectives 73 and 74 (their todos and decisions must be settled before the sweep)
**Success Criteria** (what must be TRUE):
  1. A report compares the pre-recorded run-state estimate with the actual for each of 68-72, with the median ratio and the P90 coverage, and states the verdict (met or not met) either way. Nothing is tuned to pass.
  2. If the median is outside ±30% or P90 covers under 80%, the report names the classes and the follow-up; it is not rounded into a pass.
  3. Forward-stamp coverage (EST-09's 95% target) is re-measured over all v1.6 TRDs and reported beside the verdict.
  4. `todo list` shows no pending todo from v1.6 start without a recorded reason: each is completed through `todo complete` or explicitly re-scoped.
**TRDs**: 5 plans (3 waves)

TRDs:
- [x] 75-01-est-11-prospective-retest-TRD.md — (W1) E1-E5 eligibility for 68-72 committed before scoring (72 unscored: no pre-execution estimate, accepted in 72-01); one `estimate backtest` run on the frozen calibration; EST-11 verdict by the pre-registered rule; classes and follow-up
- [x] 75-02-upgrade-migration-fixes-TRD.md — (W1, TDD) 0012 stages the run's own removals so it survives 0002 in one run; 0008 gitignores and untracks `.dup-detect-log.jsonl`
- [x] 75-03-progress-only-summary-in-progress-TRD.md — (W1, TDD) a SUMMARY with an unticked Progress task and no Self-Check is not complete, for reconcile and every `completedSummaryFiles` consumer
- [x] 75-04-todo-sweep-TRD.md — (W2) every pending todo completed with evidence or re-scoped with disposition fields; 75-TODO-SWEEP.md; SC-4 check
- [x] 75-05-coverage-and-close-out-TRD.md — (W3) EST-09 coverage over v1.6 beside the verdict; REQUIREMENTS/STATE from evidence; CHANGELOG, CLAUDE.md, USER-GUIDE; full suite

### Objective 76: Model efficiency and stack-specific content

**Goal**: Each agent spends top-model tokens only on judgment. The configured tier is the tier that runs, mechanical work runs as aof-tools code, each spawn loads only the instructions it needs, and stack-specific procedure lives in the stack profiles rather than in agent prompts.
**Requirements**: MEF-01, MEF-02, MEF-03, MEF-04, MEF-05, MEF-06 (the stack-content requirement moved to Objective 77, which delivers it)
**Depends on**: Objective 72 (renamed tree). Independent of 73-75.
**Success Criteria** (what must be TRUE):
  1. `resolve-model` and every `init` model field honour the objective's resolved `model_profile`; no agent spawn in a workflow or skill omits `model=` or names a placeholder its init does not emit; the UI judge reads the project profile.
  2. No agent spawn carries `@` references that do not cross the Task boundary; codebase-mapper and project-researcher spawns load only their own templates.
  3. The orchestrator runs `verify trd-pre` before spawning the job-checker, sends mechanical failures straight to revision, and the checker covers only the judgment dimensions.
  4. Self-check and state bookkeeping after a TRD, verifier evidence collection, codebase facts, roadmap coverage and the security grep sweep are aof-tools commands the agents call once.
  5. Tiers are set per focus or dimension where the work differs; the haiku tier is re-pinned after a recorded eval; pass/fail verdicts run at Sonnet or above on every profile.
  6. The debugger and the UI judge start on a cheaper tier and escalate on a recorded signal; `ESCALATION REQUESTED` re-spawns one rung up instead of FAILED.
  7. Flutter, Go, Dart and web-specific procedure is delivered through the stack profiles (or on-demand references), so a non-Flutter project's executor, verifier and planner prompts carry none of it.
**TRDs**: 8 planned
- [x] 76-01-model-resolution-wiring-TRD.md — (W1) intent profile binds; build/diagnose/audit spawns get their model; UI judge reads config
- [x] 76-02-spawn-context-diet-TRD.md — (W1) drop dead `@` lists; per-focus mapper templates; per-dimension researcher templates
- [x] 76-03-job-checker-prepass-TRD.md — (W1) `verify trd-pre` before the checker; checker narrowed to judgment dimensions
- [x] 76-04-mechanical-verbs-TRD.md — (W2) `trd finalize`, `verify objective-evidence`, `codebase facts`, `validate roadmap-coverage`, `security sweep`; executor, verifier, roadmapper, codebase-mapper and security-auditor call them
- [x] 76-05-stack-procedures-in-profiles-TRD.md — (W2) superseded by Objective 77 (stack packs): executor, planner and verifier Flutter/web procedure moved into pack fragments; the mapper's TS recipes became `codebase facts`; the integration-checker's Next.js probes remain as labelled fallbacks behind the profile's Layout section
- [ ] 76-06-per-focus-tiers-and-haiku-eval-TRD.md — (W3) done: `focus{}` tiers (mapper concerns, researcher architecture/pitfalls raised), `verdict_floor` (verifier, job-checker at Sonnet+ on every profile), `resolve-model --focus`. Open: the Haiku 5.5 eval (the pin is already claude-haiku-5-5); no tier is lowered until it is recorded
- [x] 76-07-escalation-loop-TRD.md — (W3) `resolve-model --escalate-from`; execute-objective (5e), /aoforge:debug and diagnose-issues re-spawn one rung up once; the debugger gains the return. Starting tiers unchanged pending 76-08
- [ ] 76-08-measure-TRD.md — (W4) before/after `aof-tools context` and `tokens trd` comparison; needs real runs after the release, not doable in CI

### Objective 77: Stack packs: contract and extraction

**Goal**: Core AOForge names no stack. Flutter, Dart and web procedure ships in stack pack plugins that a project selects through its stack profile, and core reaches them only through the pack contract (`docs/PROPOSAL-stack-packs.md` M0 + M0.5, no compatibility shim).
**Requirements**: PCK-01, PCK-02, PCK-03, PCK-04, STK-01
**Depends on**: Objective 76 (spawn-context work it extends)
**Success Criteria** (what must be TRUE):
  1. A pack manifest (`schemas/stack-pack.schema.json`) is discovered from its mirror, honoured only while its plugin is enabled, and activated only by the project's selection (extends, config, runtime); detection only proposes.
  2. `stack context <agent>` points each agent at the active packs' fragments and sub-agents; `stack verify --changed|--all` merges pack results, and `missing` never passes; pack profiles resolve as a tier.
  3. `aoforge-stack-flutter` and `aoforge-stack-web` ship in the marketplace with the moved modules, agents, skills, profiles and fragments, and their tests pass from the pack.
  4. `stack-neutrality.repo.test.cjs` passes: no core agent, skill, hook, workflow or lib module names a pack stack outside a data-only allowlist.
  5. Pack releases tag as `<pack>--vX.Y.Z` and the changelog gate checks them.
**TRDs**: 5 planned
- [x] 77-01-pack-contract-TRD.md — (W1) manifest schema, discovery, selection, pack profile tier, `stack discover|doctor|verify --changed`, resolve-model pack tiers
- [x] 77-02-pack-mirror-TRD.md — (W1) vendored SessionStart mirror, test helper, marketplace entries
- [x] 77-03-flutter-pack-TRD.md — (W2) Flutter modules, CLI, agent, skills, profiles and executor/planner/verifier fragments move out of core
- [x] 77-04-web-pack-TRD.md — (W2) the verifier's Playwright drive moves to the web pack's web-ui-verifier agent; core agents lose the Playwright and Maestro grants
- [x] 77-05-neutrality-and-release-TRD.md — (W3) neutrality guard, `<pack>--vX.Y.Z` tag gate, docs

### Objective 78: Remove the rename shims

**Goal**: The one-release compatibility for pre-rename names is gone in 3.1.0, the release after 3.0.0, as `SHIM_REMOVAL` and the migration guide promised. Only names that must stay (PRESERVE, history) remain, and a project still on the old layout gets a clear message naming the 3.0.x upgrade path instead of silent breakage. Numbered 78 because `main` already uses 76 and 77 (objectives 76/77 landed there on 2026-10-16); this branch is stacked on `feat/stack-profile-loader`.
**Requirements**: none mapped (user decision 2026-10-16: honour the shim-removal promise in 3.1.0)
**Depends on**: Objective 72 (the rename and its shims), Objective 73 (user-file and watch-state shims)
**Success Criteria** (what must be TRUE):
  1. `lib/compat.cjs` keeps no pre-rename reader: no legacy `.planning/` fallback in `planningDirName`/`planningRoot`/`findProjectRoot`, no pre-rename agent namespace in `isOwnAgentType`/`isOwnExecutor`, no legacy dot-dir fallbacks in `userDotFile`/`resolveUserFile`/watch state, no `aliasLegacyEnv` or `DEVFLOW_*` alias; every caller works on the AOForge names alone.
  2. Migrations 0012 and 0013, the dual-namespace GitHub readers (pre-rename labels and markers), the devflow pointer plugin (directory, marketplace entry, `scripts/gen-pointer-skills*`, package.json test glob) and the rename guard ALLOW entries for them are removed; `legacy-names.cjs` keeps only what is still needed and `SHIM_REMOVAL` says the removal is done.
  3. Each legacy doctor check (15, 16, 17, 27; W066/W067 in `validate health`) is kept as read-only reporting that names the 3.0.x upgrade path, or removed, with the reason recorded per check.
  4. A project on the old layout (only `.planning/`, a `devflow{}` stamp, `DEVFLOW_*` env) gets one clear message naming the fix, and no tool silently writes a second planning tree.
  5. docs/MIGRATING-TO-AOFORGE.md, USER-GUIDE, CHANGELOG and CLAUDE.md describe the removal; the full suite passes (watcher-shell's known fish-shell hang aside) and the rename guard still fails on legacy names outside its trimmed ALLOW list.
**TRDs**: 12 plans (4 waves)

TRDs:
- [x] 78-01-legacy-layout-detectors-TRD.md — (W1, TDD) planning-layout detectors independent of compat, the one legacy-layout message, W066 broken / W067 / new W069; validate, doctor 27/22 and doctor's project note point at 3.0.x or the manual step
- [x] 78-02-old-commands-and-pointer-plugin-TRD.md — (W1, TDD) pointer plugin, marketplace entry, gen-pointer-skills, package.json glob and their ALLOW entries removed; doc-refs drops NAMESPACE_RENAMES and the dash form
- [x] 78-03-gh-markers-and-contexts-TRD.md — (W1, TDD) GitHub body/TRD/cache readers, status contexts and reconcile line in the AOForge namespace only; gh setup refuses a pre-rename PR-template block; gh rebrand kept and self-contained
- [x] 78-04-file-identities-TRD.md — (W1, TDD) .mcp.json owner key (reported), todo metadata key, adopt branch/marker and 0010's block slug read under AOForge names only
- [x] 78-05-watch-daemon-runtime-home-TRD.md — (W2, TDD) watch pid and log from the runtime home only; a live 3.0.0 daemon is named, never duplicated
- [x] 78-06-global-legacy-notices-and-doctor-TRD.md — (W2, TDD) one SessionStart notice for the old plugin, DEVFLOW_* variables, an unmigrated runtime home and ~/.aoforge files; checks 15/16 report-only, 17 keeps its fix; runtime-state migration retired
- [x] 78-07-retire-planning-migrations-and-guard-TRD.md — (W2, TDD) migrations 0012/0013 removed (ids retired), stamp read under aoforge only, CLI guard and SessionStart notice for a legacy-only project, no second planning tree
- [x] 78-08-claude-md-aoforge-markers-only-TRD.md — (W2, TDD) managed block under AOFORGE markers only with an ELEGACYBLOCK refusal; migration 0014 and the global pre-rename move/outside rewrite removed
- [x] 78-09-gh-labels-and-rebrand-guard-TRD.md — (W2, TDD) label lookups use one label; an un-rebranded repository stops with `gh rebrand --apply` instead of getting duplicates
- [x] 78-10-env-alias-removal-TRD.md — (W3, TDD) no entry point calls aliasLegacyEnv; gate-edits single planning segment; hook comments
- [x] 78-11-compat-single-name-TRD.md — (W4, TDD, after 78-10) compat.cjs AOForge-only: planning dir, project root, agent namespace, user files; legacy exports deleted
- [x] 78-12-docs-and-close-out-TRD.md — (W5, TDD) aliasLegacyEnv deleted, SHIM_REMOVAL done, legacy-names trimmed, SC-4 end to end, guide (+ site mirror), USER-GUIDE, CHANGELOG, CLAUDE.md, full suite

### Objective 79: Reconcile and release 3.1.0

**Goal**: `main` (objectives 76/77, perf #133), `fix/post-77-verification` (quick 34-39, 3.1.0 version), PR #129 (`feat/stack-profile-loader`: 72-19..75 and the `.aoforge/` move) and objective 78 (shim removal) are one tree on `integrate/3.1.0` (branched from `feat/remove-rename-shims`, merging `fix/post-77-verification` with a merge commit, no rebase), proven green, and released as 3.1.0 through a single PR that supersedes #129. Every push, PR, merge, tag and PR close is a checkpoint that runs only on explicit per-action approval (user decision 2026-10-17).
**Requirements**: none mapped (user decision 2026-10-17: one integration PR, run as a build objective)
**Depends on**: Objective 78
**Success Criteria** (what must be TRUE):
  1. `integrate/3.1.0` contains every commit of `fix/post-77-verification` and `feat/remove-rename-shims` through one merge commit; the 15 text conflicts (ROADMAP, STATE, REQUIREMENTS, CHANGELOG, CLAUDE.md, USER-GUIDE, package.json, marketplace.json, site/data/aoforge.json, aof-tools.cjs, help.cjs, planning-mode.test.cjs, ui-metrics.cjs, aoforge-stack-flutter flutter-ui-setup and its test) are resolved as unions that keep both sides' behaviour; versions are 3.1.0 in all three files and CHANGELOG has one `## [3.1.0] - 2026-10-16` section carrying both sides.
  2. No `.planning/` path remains tracked (objectives 76/77 and quick 34-39 moved with `git mv`), the legacy .gitignore lines and their rename-guard entry are gone, and no code calls a compat export objective 78 removed (`aliasLegacyEnv`, `bothPlanningDirs`, `isLegacyPlanning`, `legacyRuntimeHome`, `resolveUserFile`) — a repo test fails if one returns.
  3. The merged tree passes: the full suite (watcher-shell's known fish-shell hang excluded and named), the CI-gated set, the rename and stack-neutrality guards, the pre-bash one-process equivalence corpus re-run against the merged per-hook chain, `validate health` and `doctor` on this repo, and the local fleet STACK.md drafter test. The two pre-existing requirements-agreement failures are fixed at their source (objective 75 records).
  4. Quick 36's worktree resolver, quick 35's model precedence, objective 76's focus tiers/escalation and objective 78's single-name compat coexist, each with its tests passing on the merged tree.
  5. After approval of each step: the branch is pushed, one PR to `main` is open with green CI, #129 is closed with a link to it, the PR is merged through the ruleset, `v3.1.0` (and `aoforge--v3.1.0` by the release workflow) is tagged on the merge commit, and the release workflow's run is verified.
**TRDs**: 10 plans (6 waves)

TRDs:
- [x] 79-01-merge-and-resolve-TRD.md — (W1) one `--no-ff` merge of fix/post-77-verification, the 15 conflicts as unions, main's 76/77 and quick 34-39 records `git mv`ed to `.aoforge/`, pre-bash alias call removed, legacy `.gitignore` lines and their guard allowance dropped, full-suite triage routed to 79-02..79-07
- [x] 79-02-compat-import-guard-and-sweep-TRD.md — (W2, TDD) `reconcile-guard.repo.test.cjs` (compat imports name real exports, the five removed names, no tracked legacy planning path); rename and stack-neutrality guards; 79-02 triage rows
- [x] 79-03-pre-bash-equivalence-and-hooks-TRD.md — (W2, TDD) hand-built Bash corpus: pre-bash one process vs the five hooks spawned and merged, mutation proof; hook-domain triage rows
- [x] 79-04-worktree-resolver-and-coexistence-TRD.md — (W2, TDD) quick 36's worktree cases on the supported layout, pre-rename worktree refused (legacy test), SC-4 suites for quick 35, objective 76 and objective 78 plus a CLI smoke
- [x] 79-05-objective-75-records-and-stack-text-TRD.md — (W2) EST-11 coverage row corrected via `verification post` (fixes the two requirements-agreement failures), STACK.md under AOForge names, pack profiles' home
- [x] 79-06-changelog-versions-and-site-data-TRD.md — (W3) one `## [3.1.0] - 2026-10-16` section for both lines plus the reconcile entry, versions and marketplace, sibling bump, plugin validation, site data
- [x] 79-07-claude-md-and-guides-TRD.md — (W3) CLAUDE.md within main's 200-line / 20,000-char budget on 3.1 facts, detail moved to the reference docs, guides without current-tense shim claims
- [ ] 79-08-full-validation-TRD.md — (W4) upgrade to 3.1.0 (migration 0015), health and doctor, full suite (watcher-shell excluded and named), CI gate and node:26 Docker run, named gates, fleet test, VALIDATED_SHA
- [ ] 79-09-push-open-pr-close-129-TRD.md — (W5, checkpoints) push integrate/3.1.0, open the 3.1.0 PR and wait for green CI, close #129 with a link (three approvals)
- [ ] 79-10-merge-dry-run-tag-and-release-TRD.md — (W6, checkpoints) merge through the ruleset, release dry-run dispatch on main, tag v3.1.0 on the merge commit (three approvals), verify the release, the aoforge--v3.1.0 alias and main's marketplace

## Progress

| Objective | Milestone | Plans | Status | Completed |
|---|---|---|---|---|
| 0–9, 6, 8, 24 (13 objectives) | v1.1 | 53/53 | Complete | 2026-05-06 |
| 10–23 (15 objectives) | v1.2 | 71/71 | Complete | 2026-05-25 |
| 25. Fleet audit fixes | v1.2 | 6/6 | Complete | 2026-07-22 |
| 27–41 (15 objectives) | v1.3 | 107/109 | Complete (27-03, 28-06 deferred) | 2026-09-28 |
| 42–54, 26 (13 objectives + 26 killed) | v1.4 | 158/158 | Complete | 2026-10-05 |
| 55–64 (10 objectives) | v1.5 | 81/81 | Complete (EST-08 not met, accepted) | 2026-10-08 |
| 65. Release v1.5 | v1.6 | 4/4 | Complete | 2026-10-08 |
| 66. Executor token stamp | v1.6 | 4/4 | Complete | 2026-10-08 |
| 67. Minutes recalibration | v1.6 | 9/9 | Complete | 2026-10-08 |
| 68. Milestone and objective verbs | v1.6 | 7/7 | Complete | 2026-10-08 |
| 69. Drafts, health and doctor | v1.6 | 6/6 | Complete | 2026-10-08 |
| 70. CLI defects and hook shape | v1.6 | 3/3 | Complete | 2026-10-08 |
| 71. Stack drafter and verify policy | v1.6 | 5/5 | Complete | 2026-10-08 |
| 72. Install and naming cleanup | v1.6 | 27/27 | Complete | 2026-10-09 |
| 73. Handoff gaps and result injection | v1.6 | 14/14 | Complete | 2026-10-10 |
| 74. Operations decisions | v1.6 | 8/9 | In Progress | - |
| 75. Prospective estimate retest and todo sweep | v1.6 | 5/5 | Complete | 2026-10-10 |
| 76. Model efficiency and stack-specific content | v1.6 | 4/8 | In Progress | - |
| 77. Stack packs: contract and extraction | v1.6 | 5/5 | In Progress | - |
| 78. Remove the rename shims | v1.6 | 12/12 | Complete | 2026-10-17 |
| 79. Reconcile and release 3.1.0 | v1.6 | 7/10 | In Progress | - |
