# Roadmap: DevFlow Claude

## Milestones

- ✅ **v1.1 — DevFlow Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)
- ✅ **v1.2 — Token Efficiency + Ambient Mode + Handoff Polish** — Objectives 10–23, 25 (shipped 2026-07-22)
- ✅ **v1.3 — Autonomy hardening, stack profile, upgrade/adopt, doc auto-correction** — Objectives 27–41 (completed 2026-09-28; plugin v2.11.0, merged to `main` with 2.13.0)
- ✅ **v1.4 — GitHub as system of record, stack drafter, doctor, autonomy hardening** — Objectives 42–54 (completed 2026-10-05; plugin v2.13.0 + v2.13.1; 26 killed)
- 🚧 **v1.5 — Gate & Plumbing** — Objectives 55–64 (in progress)

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

### 🚧 v1.5 Gate & Plumbing (In Progress)

Hardening plus two feature phases (Phase J, devflow-claude#35; Phase K, devflow-claude#36). Triaged 2026-10-05. Objective 55 (store live-smoke fixes) shipped first, in 2.13.2. Requirements: `.planning/REQUIREMENTS.md` (36 mapped to Objectives 56-64).

Sequencing: ONUM first (everything after it touches objective lookups). The estimation engine (57-58) is additive and lands before the other hardening so that Objectives 59-63 are the five objectives that run with it, which is what EST-08 (Objective 64) measures. Phase J (62-63) goes last among the code objectives because it edits nearly every SKILL.md and workflow; everything that touches a skill (STOR-04, EST-04, EST-05) lands before it.

**Decide before planning (user), still open:**
- CI `ANTHROPIC` secret, needed only for the live visual judge in CI (32/33).
- Branch protection on devflow-claude `main` (34).
- Docs site deploy: Cloudflare Pages project `devflow-docs` not found (fails on every `main` push since 2.11).

- [x] **Objective 55: Store live-smoke fixes** - 8/8, shipped in 2.13.2
- [x] **Objective 56: Objective-number correctness** - One escape helper, exact objective lookups, ID-shaped requirement parsing (completed 2026-10-05)
- [x] **Objective 57: Estimation data foundation** - Token data in SUMMARYs, historical backfill, `df-tools calibrate` (completed 2026-10-05)
- [x] **Objective 58: Estimation engine and surfacing** - `df-tools estimate`, plan-objective table, build and status-line estimates (completed 2026-10-05)
- [x] **Objective 59: State and merge plumbing** - Accurate Status, conflict-free wave merges, worktree preflight, milestone stats (completed 2026-10-05)
- [x] **Objective 60: Edit gate enforces the action** - Bash writes to tracked source gated, measured before strict ships (completed 2026-10-06)
- [ ] **Objective 61: Store-mode rough edges and observability** - gh setup and PR polish, requires: gate, model ids, telemetry and transcript hygiene
- [ ] **Objective 62: Built-in sweep** - Task progress, plan mode and AskUserQuestion across skills and workflows
- [ ] **Objective 63: Todo store, hook coexistence and built-in inventory** - TodoWrite-backed `/devflow:todo`, coexistence test, living inventory
- [ ] **Objective 64: Estimate accuracy validation** - Close EST-08 against five executed objectives

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

### Objective 56: Objective-number correctness

**Goal**: Objective lookups resolve exactly the objective asked for, and no regex in df-tools is built from unescaped text, so everything later in the milestone can rely on objective resolution.
**Requirements**: ONUM-01, ONUM-02, ONUM-03, ONUM-04
**Depends on**: Nothing (Objective 55 shipped)
**Success Criteria** (what must be TRUE):
  1. No df-tools module hand-rolls a regex escape; all go through `text-escape.cjs`, and a repo test fails CI when a new one appears.
  2. `objective`/`roadmap` lookup of `4.1` returns `04.1-*` only and never `04.10-*`.
  3. ROADMAP lookups in novel-domain and trd-pre-check find single-digit objectives with or without a leading zero.
  4. `verify trd-pre` takes requirement IDs only from ID-shaped tokens; a free-text Requirements line yields none.
**TRDs:** 5 plans

TRDs:
- [x] 56-01-shared-regex-escape-TRD.md — (W1) ONUM-01: 12 hand-rolled escapes and 5 unescaped interpolations go through `text-escape.cjs`; `regex-escape.repo.test.cjs` fails CI on a new one
- [x] 56-02-exact-objective-lookups-TRD.md — (W1) ONUM-02 + ONUM-03: `objectiveDirMatches` (4.1 never selects 04.10-*), leading-zero-tolerant `objectiveNumPattern`, `boldLabelPattern`
- [x] 56-03-id-shaped-requirements-TRD.md — (W2) ONUM-04: `requirement-ids.cjs`; `verify trd-pre` and `objective complete` read IDs only from ID-shaped items; mark-complete escapes IDs
- [x] 56-04-roadmap-field-labels-TRD.md — (W2) plan-time fix: `**Goal**:` / `**Depends on**:` read in roadmap, gh, OBJECTIVE.md bootstrap; reconcile row via `objectiveNumPattern`
- [x] 56-05-changelog-and-dogfood-TRD.md — (W3) live-repo dogfood (get-objective/analyze/trd-pre 56), OBJECTIVE.md goal via `objective put`, CHANGELOG [Unreleased], full suite

### Objective 57: Estimation data foundation

**Goal**: Token usage is recorded for new executions and recovered for history, and a calibration file turns that history into per-task-class medians and P90s.
**Requirements**: EST-06, EST-07, EST-01
**Depends on**: Objective 56 (calibration walks objective directories through the corrected lookups)
**Success Criteria** (what must be TRUE):
  1. A new executor SUMMARY carries `tokens_input` and `tokens_output` in its frontmatter.
  2. The retroactive pass fills token data for historical TRDs from transcripts, using the `df-tools context` parser, and reports how many it could and could not recover.
  3. `df-tools calibrate` writes `~/.claude/devflow/calibration.json` from SUMMARY frontmatter, STATE_ARCHIVE metrics and model rates, with a sample count per class.
  4. Re-running `calibrate` on unchanged inputs produces the same file.
**TRDs:** 7 plans

TRDs:
- [x] 57-01-transcript-token-reader-TRD.md — (W1) EST-06/07 foundation: `context-audit.forEachRecord`, `token-usage.cjs` (per-message usage dedupe, executor transcript index, repo/objective matching, frontmatter stamp), `trd-identify.cjs` moved out of the executor-stop hook
- [x] 57-02-calibration-inputs-TRD.md — (W1) EST-01 inputs: `references/model-rates.json` (source + as_of per model), duration/metrics-table parsers, `classifyTask`, `collectProject`
- [x] 57-03-forward-token-stamp-TRD.md — (W2) EST-06: `df-tools tokens trd|stamp`; executor.md and execute-trd.md stamp the SUMMARY draft before `summary post`; template fields; record-metric `--job` fix
- [x] 57-04-token-backfill-TRD.md — (W2) EST-07: `planBackfill` (dry run, recovered/unrecovered by reason) and `applyBackfill` through `summary post`
- [x] 57-05-calibrator-TRD.md — (W2) EST-01: per-class p50/P90 minutes, tokens and dollars; probabilities; deterministic calibration.json writer
- [x] 57-06-tokens-and-calibrate-cli-TRD.md — (W3) `df-tools tokens backfill [--write]` and `df-tools calibrate` with spawn-level determinism tests (fake HOME)
- [x] 57-07-backfill-dogfood-and-docs-TRD.md — (W4) live backfill of this repo (diff-guarded), real calibrate twice (same sha256), live stamp of its own SUMMARY, CHANGELOG/CLAUDE.md/USER-GUIDE

### Objective 58: Estimation engine and surfacing

**Goal**: Users see an honest time, token and dollar estimate, with its confidence, when planning and when building.
**Requirements**: EST-02, EST-03, EST-04, EST-05
**Depends on**: Objective 57
**Success Criteria** (what must be TRUE):
  1. `df-tools estimate task` returns median and P90 minutes, tokens and dollars, with sample count and a confidence label.
  2. `df-tools estimate trd|objective|milestone` composes task estimates and adds agent overhead and the gap-closure factor.
  3. plan-objective's PLANNING COMPLETE output includes an estimate table.
  4. `/devflow:build` prints a one-line estimate at start, the status line shows estimated time remaining, and wave reports show actual against estimate.
**TRDs:** 10 plans

TRDs:
- [x] 58-01-composition-math-TRD.md — (W1) EST-03: `estimate-math.cjs` lognormal fit from p50/P90, comonotonic and correlated (Fenton-Wilkinson, rho 0.5) sums, parallel-wave max, gap-closure mixture; literal anchors
- [x] 58-02-agent-overhead-reader-TRD.md — (W1) EST-03 input: `agent-overhead.cjs` per-spawn minutes and tokens for planner/job-checker/verifier/researcher/integration-checker/roadmapper transcripts, repo-scoped, quick plans excluded
- [x] 58-03-calibration-v2-TRD.md — (W2) EST-03 input: calibration.json v2 `agent_overhead` + `objective_level`; `calibrate --root | --no-overhead`
- [x] 58-04-run-state-and-statusline-TRD.md — (W1) EST-05: out-of-repo estimate run state (`~/.claude/devflow/state/estimates/`), remaining-time rule, status line segment (fail-open, cached only)
- [x] 58-05-task-and-trd-estimates-TRD.md — (W2) EST-02/03: `estimate.cjs` shared classifier, confidence labels, thin-class fallback, no-data reasons, TRD composition
- [x] 58-06-objective-rollup-TRD.md — (W3) EST-03: remaining TRDs by wave, verifier overhead, gap-closure mixture, unplanned fallback from objective history
- [x] 58-07-milestone-rollup-TRD.md — (W4) EST-03: milestone scope from the ROADMAP bullet, remaining objectives + integration-checker overhead
- [x] 58-08-estimate-cli-TRD.md — (W5) EST-02/03/05: `df-tools estimate task|trd|objective|milestone|start|wave|finish`, text renderers (line, table), help and dispatch
- [x] 58-09-planning-and-build-surfacing-TRD.md — (W6) EST-04/05: estimate table in PLANNING COMPLETE and plan-objective, one-line estimate and run state in /devflow:build, actual vs estimate in wave reports; repo test pins it
- [x] 58-10-dogfood-and-docs-TRD.md — (W7) live calibrate v2 and estimates on this repo, run-state + status line smoke, in-sample backtest for Objective 64, CHANGELOG/CLAUDE.md/USER-GUIDE, full `npm test`

### Objective 59: State and merge plumbing

**Goal**: Executing an objective no longer corrupts STATE.md or fights over generated files, and milestone completion reports true numbers.
**Requirements**: PLMB-01, PLMB-02, PLMB-03, PLMB-04, PLMB-05
**Depends on**: Objective 56 (PLMB-04 and PLMB-05 count and remove objectives through the lookups)
**Success Criteria** (what must be TRUE):
  1. After `state advance-job` mid-objective, STATE.md `**Status:**` still describes the real state, not "ready for verification".
  2. A parallel wave merge completes with no conflict on `STATE_ARCHIVE.md` or `state.json`, by a JSON-aware merge driver or a documented regeneration step.
  3. An executor's first `exec-context` preflight reports its own worktree, because spawn prompts pass `--cwd <worktree>`.
  4. `milestone complete` stats and base MILESTONES entry count only that milestone's objectives.
  5. `milestone complete` `state_updated` and `objective remove` `roadmap_updated` are true only when a change was made.
**TRDs:** 7 plans

TRDs:
- [x] 59-01-state-merge-driver-TRD.md — (W1) PLMB-02: `df-tools merge-driver install|resolve|state-json` (JSON-aware state.json 3-way merge, union STATE_ARCHIVE.md, info/attributes + repo config); installed here so wave 2's merges use it
- [x] 59-02-advance-job-from-disk-TRD.md — (W2) PLMB-01: `state advance-job --objective N` derives Status and counters from the objective's TRDs/SUMMARYs; 0/0 counters write nothing (`no_position`)
- [x] 59-03-worktree-preflight-TRD.md — (W2) PLMB-03: dispatch names `CHECKOUT`, preflight runs `--cwd {CHECKOUT}`; `exec-context check` fails WRONG CHECKOUT outside the plan's worktree; `worktree` prints `preflight`
- [x] 59-04-milestone-complete-scope-TRD.md — (W2) PLMB-04/05: `milestone complete` counts only the milestone bullet's objectives (selection moved to `milestone-scope.cjs`), true one-liners and task counts, truthful `state_updated`
- [x] 59-05-objective-change-flags-TRD.md — (W2) PLMB-05: `objective remove` / `objective complete` report `roadmap_updated` only on a real change
- [x] 59-06-merge-and-state-wiring-TRD.md — (W3) execute-objective installs the driver, resolves state.json/STATE_ARCHIVE.md conflicts, regenerates position after every parallel wave; executor uses `--objective` and `--cwd`; replay test extended
- [x] 59-07-dogfood-and-docs-TRD.md — (W4) live merge on a scratch clone, advance-job here, WRONG CHECKOUT smoke, `milestone complete v1.4` on a scratch copy; CHANGELOG/CLAUDE.md/USER-GUIDE; full `npm test`

### Objective 60: Edit gate enforces the action

**Goal**: The edit gate denies Bash writes to tracked repo source in ambient mode, the same as `Edit`/`Write` (DECISION-001 option-a), and ships strict only if measured false positives are low.
**Requirements**: GATE-01, GATE-02, GATE-03, GATE-04, GATE-05
**Depends on**: Nothing (independent of 59; can run in a parallel workstream)
**Success Criteria** (what must be TRUE):
  1. In ambient mode a Bash write to a tracked source file (redirection, `tee`, `sed -i`, `cp`/`mv` onto a file, inline python/node write) is denied.
  2. Text that only mentions a write (heredoc bodies, quoted arguments, `echo` to stdout) is never gated.
  3. Writes to `.planning/`, `.md`, out-of-repo, tmp and scratchpad paths, and to untracked files, pass.
  4. A live skill marker, a `devflow:*` agent, an override phrase, `DEVFLOW_SKIP_EDIT_GATE=1`, and `gates.editGate` warn/off each let the write through.
  5. `session-audit` reports the Bash-gate false-positive rate, and the default is `strict` only if that rate is at most 2% of ambient Bash calls, otherwise `warn`.
**TRDs:** 7 plans

TRDs:
- [x] 60-01-shell-words-TRD.md — (W1) GATE-02: shell-text primitives move to `lib/shell-words.cjs` (shared by gate-commits and session-audit, no behaviour change) + `scanShell`/`parseCommand`; hand-built WRITE/MENTION/PATH case table
- [x] 60-02-bash-write-detector-TRD.md — (W2) GATE-01/02: pure `detectBashWrites` (redirect, tee, sed -i, perl -i, cp/mv, inline python/node, `sh -c`, `cd` tracking); mentions are data
- [x] 60-03-bash-write-gate-TRD.md — (W3) GATE-01/03/04/05: `evaluateBashWrites` (tracked, in-project, non-md, non-.planning), `gitTrackedSet`, `gates.bashEditGate` least-of `gates.editGate`, `recommendDefault` (≤0.02 → strict)
- [x] 60-04-bash-gate-hook-TRD.md — (W4) GATE-01..04: `hooks/gate-bash-writes.js` on PreToolUse(Bash), reusing gate-edits' escapes; lazy override consumption; registration + inventory/audit entries
- [x] 60-05-replay-false-positives-TRD.md — (W4) GATE-05: `session-audit` `bash_edit_gate` replay through the hook's decision (ambient signals, history-accurate tracked check, upper-bound rate) + raw line + `devflow-bash-edit-gate` category
- [x] 60-06-measure-and-set-default-TRD.md — (W5) GATE-05: real-corpus `session-audit --limit 0`, triage and test-first misparse fixes, evidence JSON, `BASH_EDIT_GATE_DEFAULT` from the measurement, CI agreement test
- [x] 60-07-dogfood-and-docs-TRD.md — (W6) scratch-clone stdin smoke S1-S13 + best-effort live Claude Code check; CHANGELOG/CLAUDE.md/USER-GUIDE/gen-docs-data; full `npm test`

### Objective 61: Store-mode rough edges and observability

**Goal**: Store-mode setup and PRs read correctly, stale pins and stale model ids are caught by doctor, skills can declare the tools they need, and telemetry no longer drops data silently.
**Requirements**: STOR-01, STOR-02, STOR-03, STOR-04, OBS-01, OBS-02, OBS-03, OBS-04
**Depends on**: Objective 56
**Success Criteria** (what must be TRUE):
  1. The `gh setup` dry run shows the pinned `uses:` / `devflow-ref:` lines and a PR-create step; objective PR titles use the objective name.
  2. `doctor` and `validate health` warn on a checks workflow pinned to a DevFlow ref older than the installed plugin, and on a stale pinned model id.
  3. `model-profiles.json` pins `claude-opus-5-5` and `claude-sonnet-5-5`.
  4. A skill with `requires:` in its frontmatter is refused without the tool, with a doctor-backed remediation message.
  5. `telemetry --scan` works or errors; `transcript-export` runs at SessionStart throttled with its own skip env; the 09-03 SUMMARY is backfilled and I001 clears.
**TRDs:** 9 plans

TRDs:
- [x] 61-01-checks-pin-health-TRD.md — (W1) STOR-03: `checks-pin.cjs` (pin parser, release-ref compare, owns the workflow constants), `validate health` Check 17 W062, doctor check 26 `checks-workflow-pin`, 22 defers W062
- [x] 61-02-skill-requires-lib-TRD.md — (W1) STOR-04: `requires:` skill frontmatter, `skill-requires.cjs` (stat-only PATH lookup, refusal text naming `/devflow:doctor`), doctor check 14 `skill-requires`, gh-sync requires gh
- [x] 61-03-pr-title-objective-name-TRD.md — (W1) STOR-02: one name chain in `objective-name.cjs` for issue and PR titles; fresh-store PR titled after OBJECTIVE.md, titles stay create-only
- [x] 61-04-telemetry-scan-and-09-03-backfill-TRD.md — (W1) OBS-02: `telemetry --scan [--limit|--since|--root]` via `runTelemetry`, unknown flags are errors; OBS-04: 09-03 SUMMARY backfilled from history, I001 clears
- [x] 61-05-transcript-export-schedule-TRD.md — (W1) OBS-03: upgrade-project.js step 0b starts a detached `transcript-export` at most once per 24 h (claim-then-spawn stamp in `~/.claude/devflow/state/`), `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1`
- [x] 61-06-setup-dry-run-pins-and-pr-step-TRD.md — (W2) STOR-01: dry run prints `uses:` / `devflow-ref:` (and `was` pins on a re-pin) plus the follow-up preview; every printed sequence ends `gh pr create --head <branch> --fill`
- [ ] 61-07-current-model-ids-TRD.md — (W2) OBS-01: pins `claude-opus-5-5` / `claude-sonnet-5-5`; `model-currency.cjs` derives currency from model-rates.json; doctor check 13 stale ids, validate health W063, CI guard
- [ ] 61-08-skill-requires-hook-TRD.md — (W2) STOR-04: `hooks/gate-skill-requires.js` on UserPromptExpansion (block) and PreToolUse(Skill) (deny), fails open; registration, inventory, audit
- [ ] 61-09-dogfood-and-docs-TRD.md — (W3) dogfood D1-D8 (read-only live setup dry run, scratch projects and homes, stdin smoke, best-effort live gate); CHANGELOG/CLAUDE.md/USER-GUIDE/gen-docs-data/telemetry guide; full `npm test`

### Objective 62: Built-in sweep

**Goal**: Skills and workflows use Claude Code's progress, plan-mode and question built-ins instead of ad hoc prose. This objective edits nearly every SKILL.md and workflow, so it runs after every other objective that touches them.
**Requirements**: BLTN-01, BLTN-02, BLTN-03
**Depends on**: Objective 58 (EST-04, EST-05 edit plan-objective and build), Objective 61 (STOR-04 adds skill frontmatter)
**Success Criteria** (what must be TRUE):
  1. Running micro, quick, build, debug, plan-objective or verify-work shows TaskCreate/TaskUpdate progress.
  2. plan-objective, new-project and milestone complete present their drafts in plan mode (EnterPlanMode/ExitPlanMode).
  3. Every discrete-choice prompt in skills and workflows uses AskUserQuestion, and the sweep lists each prompt it converted.
**TRDs**: TBD

### Objective 63: Todo store, hook coexistence and built-in inventory

**Goal**: `/devflow:todo` uses TodoWrite in-session with a durable archive. This is the riskiest change in Phase J (BLTN-04, J1), so it stands alone with the hook coexistence test and inventory that depend on its Stop hook.
**Requirements**: BLTN-04, BLTN-05, BLTN-06
**Depends on**: Objective 62
**Success Criteria** (what must be TRUE):
  1. `/devflow:todo` adds and lists items through TodoWrite in-session, and a Stop-hook sync merges them into a durable archive (on disk, or the GitHub store) without losing or duplicating items.
  2. A coexistence test shows DevFlow hooks degrade gracefully, compose output and isolate errors when a user-level hook fires on the same event.
  3. `docs/built-in-integration-status.md` lists the Claude Code built-ins and DevFlow's adoption of each, matching the state after Objectives 62-63.
**TRDs**: TBD

### Objective 64: Estimate accuracy validation

**Goal**: Show that the estimation engine is accurate enough to trust, against real executions. It can close only after five objectives have run with the engine.
**Requirements**: EST-08
**Depends on**: Objective 58 (engine), Objective 63 (Objectives 59-63 are the five executed after the engine ships)
**Success Criteria** (what must be TRUE):
  1. A report compares estimate with actual for the five executed objectives after the engine shipped.
  2. The median estimate is within ±30% of actual.
  3. P90 covers at least 80% of outcomes, or the report names the miscalibrated classes and the follow-up.
**TRDs**: TBD

## Progress

| Objective | Milestone | Plans | Status | Completed |
|---|---|---|---|---|
| 0–9, 6, 8, 24 (13 objectives) | v1.1 | 53/53 | Complete | 2026-05-06 |
| 10–23 (15 objectives) | v1.2 | 71/71 | Complete | 2026-05-25 |
| 25. Fleet audit fixes | v1.2 | 6/6 | Complete | 2026-07-22 |
| 27–41 (15 objectives) | v1.3 | 107/109 | Complete (27-03, 28-06 deferred) | 2026-09-28 |
| 42–54, 26 (13 objectives + 26 killed) | v1.4 | 158/158 | Complete | 2026-10-05 |
| 55. Store live-smoke fixes | v1.5 | 8/8 | Complete | 2026-10-05 |
| 56. Objective-number correctness | v1.5 | 5/5 | Complete | 2026-10-05 |
| 57. Estimation data foundation | v1.5 | 7/7 | Complete | 2026-10-05 |
| 58. Estimation engine and surfacing | v1.5 | 10/10 | Complete | 2026-10-05 |
| 59. State and merge plumbing | v1.5 | 7/7 | Complete | 2026-10-05 |
| 60. Edit gate enforces the action | v1.5 | 7/7 | Complete | 2026-10-06 |
| 61. Store-mode rough edges and observability | v1.5 | 6/9 | In Progress | - |
| 62. Built-in sweep | v1.5 | 0/0 | Not started | - |
| 63. Todo store, hook coexistence and built-in inventory | v1.5 | 0/0 | Not started | - |
| 64. Estimate accuracy validation | v1.5 | 0/0 | Not started | - |
