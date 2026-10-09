# Roadmap: DevFlow Claude

## Milestones

- ✅ **v1.1 — DevFlow Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)
- ✅ **v1.2 — Token Efficiency + Ambient Mode + Handoff Polish** — Objectives 10–23, 25 (shipped 2026-07-22)
- ✅ **v1.3 — Autonomy hardening, stack profile, upgrade/adopt, doc auto-correction** — Objectives 27–41 (completed 2026-09-28; plugin v2.11.0, merged to `main` with 2.13.0)
- ✅ **v1.4 — GitHub as system of record, stack drafter, doctor, autonomy hardening** — Objectives 42–54 (completed 2026-10-05; plugin v2.13.0 + v2.13.1; 26 killed)
- ✅ **v1.5 — Gate & Plumbing** — Objectives 55–64 (completed 2026-10-08; 55 in plugin v2.13.2, 56–64 unreleased; EST-08 not met, accepted)
- 🚧 **v1.6 — Hardening & Release** — Objectives 65–75 (in progress)

Full archived roadmaps: `.planning/milestones/v1.2-ROADMAP.md` (v1.1 + v1.2 detail), `.planning/milestones/v1.3-ROADMAP.md` (v1.3 detail; audit: `milestones/v1.3-MILESTONE-AUDIT.md`), `.planning/milestones/v1.4-ROADMAP.md` (v1.4 detail; audit: `milestones/v1.4-MILESTONE-AUDIT.md`), `.planning/milestones/v1.5-ROADMAP.md` (v1.5 detail; audit: `milestones/v1.5-MILESTONE-AUDIT.md`; requirements: `milestones/v1.5-REQUIREMENTS.md`). Milestone history: `.planning/MILESTONES.md`.

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

Ship v1.5, close what it left open, and clear the backlog. Requirements: `.planning/REQUIREMENTS.md` (30 mapped to Objectives 65-75). Every live step (merge, tag, push, repository settings, secrets, Cloudflare) is a checkpoint that runs only on explicit per-action user approval; DevFlow never enters a secret value.

Sequencing: 65 releases v1.5 first, so the installed runtime carries the v1.5 code that later objectives build on and measure. 66 (token stamp) needs that runtime. 67 (recalibration) is frozen before it is scored. Objectives 68-72 are the first five executed after 67 and are the objectives EST-11 scores, and each records a run-state estimate (`estimate start`) before it runs. 68-71 are agent-only work; 72 is scored in full, including the wait time of its rollout checkpoints (accepted 2026-10-08). 73 (live handoff demo) and 74 (user-action operations) run after the scored five because their minutes are dominated by human wait time. 75 goes last: it closes EST-11 once 68-72 have executed, and sweeps every pending todo.

- [x] **Objective 65: Release v1.5** - Version bump, CHANGELOG release section, merge to `main`, tag, and the installed runtime carrying the v1.5 libs and hooks (completed 2026-10-08)
- [x] **Objective 66: Executor token stamp** - Every new executor SUMMARY carries `tokens_input` / `tokens_output`, with measured forward-stamp coverage (completed 2026-10-08)
- [x] **Objective 67: Minutes recalibration** - A method frozen and recorded before it is scored; nothing fitted to the objectives it is scored on (completed 2026-10-08)
- [x] **Objective 68: Milestone and objective verbs** - `milestone complete` dry run and idempotence, `objective remove`/`complete` fixes, shared objective helpers, strict flag rejection (completed 2026-10-08)
- [x] **Objective 69: Drafts, health and doctor** - Stale `planning draft` protection, skill-marker health checks, requirements-completed agreement check (completed 2026-10-08)
- [x] **Objective 70: CLI defects and hook shape** - `state update-progress`, `verify trd-pre`, `objective-job-index` and the `verify-commits.js` output schema (completed 2026-10-08)
- [x] **Objective 71: Stack drafter and verify policy** - govulncheck gate preference, buf lint drafting, `stack verify --run` policy for services and artifacts (completed 2026-10-08)
- [ ] **Objective 72: Rename to AOForge and naming cleanup** - DevFlow becomes AOForge with one-release shims and in-place migrations, ships as 3.0.0, the user's setup and fleet move over, and no legacy `df-*` remains
- [ ] **Objective 73: Handoff gaps and result injection** - Three PTY gaps closed, handoff results injected, a live TTY end-to-end demonstration
- [ ] **Objective 74: Operations decisions** - CI `ANTHROPIC` secret and live visual judge, branch protection on `main`, docs site deploy
- [ ] **Objective 75: Prospective estimate retest and todo sweep** - EST-08's criterion re-tested on 68-72; every pending todo completed or re-scoped

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
**TRDs**: 26 plans (18 waves)

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
- [ ] 72-13-legacy-command-forms-gate-TRD.md — (W8) INST-01 repo test: `/df-`, `/df:`, `/devflow:` via NAMESPACE_RENAMES in skill-route; 0007 rewrites projects
- [x] 72-14-devflow-pointer-plugin-TRD.md — (W7) final `devflow@aocyber` 3.0.0 pointer: notice hook (no-op beside AOForge) and generated forwarding skills
- [ ] 72-15-doctor-legacy-checks-TRD.md — (W8) doctor 15 (df-* reappearance), 16 (devflow leftovers), 27 (W066/W067); check 26 legacy callers
- [ ] 72-16-gh-rebrand-verb-TRD.md — (W8) `aof-tools gh rebrand`: dry-run preview, per-repo apply, idempotent, resumable
- [ ] 72-17-docs-identity-and-migration-guide-TRD.md — (W9) real gold AO emblem + AOForge wordmark on README and site; migration guide; USER-GUIDE/CLAUDE.md
- [ ] 72-18-release-artifacts-3-0-0-TRD.md — (W10) 3.0.0 versions and CHANGELOG; validation; full upgrade rehearsal on a scratch clone (no live step)
- [ ] 72-19-repo-rename-push-and-pr-TRD.md — (W11) checkpoints: rename repo to aoforge-claude, push, open the 3.0.0 PR
- [ ] 72-20-merge-tag-and-release-TRD.md — (W12) checkpoints: merge, tag v3.0.0; release and marketplace verified
- [ ] 72-21-install-aoforge-and-dogfood-migration-TRD.md — (W13) checkpoint install + restart; verify state migration and this repo's `.aoforge/` move; disable devflow
- [ ] 72-22-active-docs-rewrite-TRD.md — (W14) PROJECT/ROADMAP/STATE/REQUIREMENTS and CLAUDE.md in AOForge terms; transition note removed
- [ ] 72-23-global-claude-md-and-marketplace-TRD.md — (W15) checkpoints: global CLAUDE.md outside-block diff approval; marketplace re-point decision
- [ ] 72-24-vanity-pr-and-pages-project-TRD.md — (W16) checkpoints: draft vanity-mapping PR (user merges); `aoforge-docs` Pages project + one deploy
- [ ] 72-25-fleet-sweep-TRD.md — (W17) fleet discovery and preview; one approval per repository (upgrade, store-mode rebrand); nothing pushed
- [ ] 72-26-checkout-move-and-rekey-TRD.md — (W18) checkpoint: user moves checkout to `~/dev/aoforge-claude`; worktrees, memory and keyed state carried over; follow-up PR for the post-merge commits (push and PR gates)

### Objective 73: Handoff gaps and result injection

**Goal**: A command that needs a TTY goes from detection to the user's shell to a result back in context, with no manual paste. Runs after the five scored objectives because the live demonstration includes human wait time.
**Requirements**: HND-01, HND-02, HND-03
**Depends on**: Objective 70 (the hook output shape it registers against), Objective 72 (sequencing only: stays outside the scored five)
**Success Criteria** (what must be TRUE):
  1. Each of the three PTY gaps (dispatch-wrapper isatty, wrapper stdin race, detector late match) has a regression test that fails on the old behavior and passes now.
  2. `inject-handoff-results.js` is registered in `hooks.json`, delivers a completed handoff result into the session, and appears in the hook coexistence suite.
  3. With the `devflow-watch` daemon running, a TTY-required command (auth login, token paste or sudo prompt) is detected, handed off, run by the user, and its result appears in context. The live run is a user checkpoint and DevFlow never types or reads a secret.
**TRDs**: TBD

### Objective 74: Operations decisions

**Goal**: The three operational decisions open since v1.3 are closed. Each needs the user to act or approve, so its TRDs carry checkpoints. Runs after the five scored objectives so human wait time stays out of their minutes.
**Requirements**: OPS-01, OPS-02, OPS-03
**Depends on**: Objective 65 (branch protection and the docs deploy act on `main`, which must hold the release), Objective 72 (sequencing only)
**Success Criteria** (what must be TRUE):
  1. The user has set the `ANTHROPIC` secret (DevFlow never sees the value), and the live visual judge runs in CI on a push to `main`.
  2. After the user approves the exact ruleset text, `main` requires the checks and rejects force-push; `gh` reads the ruleset back and it matches what was approved.
  3. The Cloudflare Pages project `devflow-docs` exists, or the workflow's account and token are corrected by the user, and a push to `main` deploys green.
**TRDs**: TBD

### Objective 75: Prospective estimate retest and todo sweep

**Goal**: EST-08's criterion is re-tested on five objectives that ran after recalibration, with the honest verdict reported, and no todo is left pending without a reason. It can close only after Objectives 68-72 have executed, the way Objective 64 depended on 59-63.
**Requirements**: EST-11, TODO-01
**Depends on**: Objective 67 (method), Objectives 68, 69, 70, 71, 72 (the five scored objectives, each with a run-state estimate recorded before it ran), Objectives 73 and 74 (their todos and decisions must be settled before the sweep)
**Success Criteria** (what must be TRUE):
  1. A report compares the pre-recorded run-state estimate with the actual for each of 68-72, with the median ratio and the P90 coverage, and states the verdict (met or not met) either way. Nothing is tuned to pass.
  2. If the median is outside ±30% or P90 covers under 80%, the report names the classes and the follow-up; it is not rounded into a pass.
  3. Forward-stamp coverage (EST-09's 95% target) is re-measured over all v1.6 TRDs and reported beside the verdict.
  4. `todo list` shows no pending todo from v1.6 start without a recorded reason: each is completed through `todo complete` or explicitly re-scoped.
**TRDs**: TBD

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
| 72. Install and naming cleanup | v1.6 | 13/26 | In Progress | - |
| 73. Handoff gaps and result injection | v1.6 | 0/? | Not started | - |
| 74. Operations decisions | v1.6 | 0/? | Not started | - |
| 75. Prospective estimate retest and todo sweep | v1.6 | 0/? | Not started | - |
