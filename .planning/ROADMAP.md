# Roadmap: DevFlow Claude

## Milestones

- ✅ **v1.1 — DevFlow Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)
- ✅ **v1.2 — Token Efficiency + Ambient Mode + Handoff Polish** — Objectives 10–23, 25 (shipped 2026-07-22)
- 📋 **v1.3 — not yet planned** (`/devflow:milestone new`)

Full archived roadmaps: `.planning/milestones/v1.2-ROADMAP.md` (contains both v1.1 and v1.2 detail). Milestone history: `.planning/MILESTONES.md`.

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

### 📋 v1.3 (not yet planned)

Candidate scope carried forward from v1.2 deferrals:

- Phase J — Claude Code built-in integration (devflow-claude#35)
- Phase K — Agentic estimation engine (devflow-claude#36)
- PTY architectural gaps from TRD 19-05 (dispatch-wrapper isatty, wrapper stdin race, detector Ctrl+C-on-late-match)
- `devflow-watch stash add` CLI for token-passing `value_source: 'stash'`
- Durable worktree-executor marker fix (eden-press editGate "warn" is the interim mitigation)
- Docs cleanup: stale USER-GUIDE.md rows (resume-work/progress/pause-work/add-objective)
- 09-03 SUMMARY.md backfill (deliverables shipped, summary doc missing)

### Objective 26: GitHub issue auto-build monitor

**Goal:** Discover untracked GitHub issues in the current repo and drive qualifying ones through the full DevFlow pipeline (plan → execute → verify → PR) unattended, behind a trusted-author gate.
**Depends on:** Objective 25
**Jobs:** 0 jobs

Jobs:
- [ ] TBD (run /devflow:plan-objective 26 to break down)

## Progress

| Objective | Milestone | Plans | Status | Completed |
|---|---|---|---|---|
| 0–9, 6, 8, 24 (13 objectives) | v1.1 | 53/53 | Complete | 2026-05-06 |
| 10–23 (15 objectives) | v1.2 | 71/71 | Complete | 2026-05-25 |
| 25. Fleet audit fixes | v1.2 | 6/6 | Complete | 2026-07-22 |
| 26. GitHub issue auto-build monitor | v1.3 | 0/6 | Planning | — |
| 27. Gate correctness | v1.3 | 5/6 | Complete (1 deferred) | 2026-08-18 |
| 28. Model tier binding and escalation | v1.3 | 5/6 | Complete (1 deferred) | 2026-08-19 |
| 29. Context discipline | v1.3 | 4/4 | Complete | 2026-08-19 |
| 30. Agent environment hygiene | v1.3 | 4/4 | Complete | 2026-08-19 |
| 31. Telemetry and retention | v1.3 | 3/3 | Complete | 2026-08-19 |
| 32. Visual-eval default path tells the truth | v1.3 | 4/4 | Complete | 2026-08-27 |
| 33. The visual gate actually runs in CI | v1.3 | 3/3 | Complete | 2026-08-27 |
| 34. UI Oracle Loop W1b — Surface Spec | v1.3 | 11/11 | Complete | 2026-09-22 |
| 35. Stack profile loader | v1.3 | 11/11 | Complete | 2026-09-27 |
| 36. Upgrade in place | v1.3 | 10/10 | Complete | 2026-09-27 |
| 37. /devflow:adopt + backup pruning | v1.3 | 0/16 | Planned | — |
| 38. Doc auto-correction | v1.3 | 0/— | Registered | — |

### Objective 27: Gate correctness ✅

**Goal:** Stop DevFlow's own gates from blocking DevFlow's own agents — close the three gate defects measured in the Autonomy Blocker Audit (1,048 edit-gate denials inside subagents, 280 on paths outside the repo, 446 commit-gate blocks from substring matching), and mitigate the harness worktree guard DevFlow cannot fix.
**Depends on:** — (independent)
**Source:** Autonomy Blocker Audit, 2026-08-18
**Jobs:** 6/6 complete

Jobs:
- [x] 27-01 Marker resolves across git worktrees + TTL (`9571a11`, `ec83003`)
- [x] 27-02 Targets outside the project root are never gated (`9571a11`)
- [x] 27-04 Commit gate matches invocation, not substring (`c13d5db`)
- [x] 27-05 Executor worktree command discipline — F-01 mitigation (`786752d`)
- [x] 27-06 Stale hook inventory, model-profiles claim, `/df:` prefix (`5d0aed8`)
- [ ] 27-03 Gate posture — **deferred by decision**, see SUMMARY.md

Evidence: 2709 tests / 2649 pass / 10 fail — identical failures to the pre-objective baseline (2681/2621/10). 28 tests added, 0 regressions.

### Objective 28: Model tier binding and escalation ✅

**Goal:** Make the model profile table actually bind (it was inert for every skill caller), refresh the live model ids, and give DevFlow an escalation signal that is not raw tool-error rate.
**Depends on:** Objective 27 (clean gate signal)
**Source:** Autonomy Blocker Audit, 2026-08-18
**Jobs:** 5/6 complete

Jobs:
- [x] 28-01 Model ids refreshed; models{} documented as live (`d469837`)
- [x] 28-02 Profile table binds; resolution auditable, unknown agents loud (`d469837`)
- [x] 28-03 effort declared per agent; reference regenerated (`55d1a82`)
- [x] 28-04 No-progress guard — lib + PreToolUse hook (`c6c1a74`)
- [x] 28-05 Escalation policy + executor request protocol (`ac7dc89`)
- [ ] 28-06 Haiku replay eval — **deferred**, 63 Haiku turns is no basis to decide

Evidence: 2748 tests / 2689 pass / 9 fail — same pre-existing daemon/timing failures. 39 tests added, 0 regressions.

### Objective 29: Context discipline ✅

**Goal:** Cut the context DevFlow agents consume — targeting whole-file reads (49.9% of tool-result tokens) and full file bodies written into tool-call arguments (33.8% of the window) — and make the measurement repeatable so the improvement is observed rather than assumed.
**Depends on:** Objective 27 (marker fix re-permits Edit)
**Source:** Autonomy Blocker Audit, 2026-08-18 — finding F-10
**Jobs:** 4/4 complete

Jobs:
- [x] 29-01 Read narrowly — locate with rg, read with offset/limit (`e0a2c81`)
- [x] 29-02 Prefer targeted Edit over whole-file tool arguments (`e0a2c81`)
- [x] 29-03 Guardrail policy recorded; CLAUDE.md audited (~3.2K tok, not bloated) (`173c7f0`)
- [x] 29-04 `df-tools context` — repeatable composition measurement (`173c7f0`)

Evidence: 2761 tests / 2701 pass / 10 fail — same pre-existing daemon/timing failures. 13 tests added, 0 regressions. Tool independently reproduces the audit (Read 53.6% @ 2,301 tok/call, images 1.4%, subagent p50 117K vs main 329K) and reports `read_share_ok: false` at 53.6% as the pre-change baseline.

### Objective 30: Agent environment hygiene ✅

**Goal:** Close the long tail of environment friction from finding F-05 — agent tool allowlists that forbid what the prompt instructs, a routing table advertising skills the model cannot invoke, CWD drift, build timeouts, and overrides that leave no trace.
**Depends on:** — (independent)
**Source:** Autonomy Blocker Audit, 2026-08-18 — finding F-05
**Jobs:** 4/4 complete

Jobs:
- [x] 30-01 Agent allowlists cover what prompts call (`6037be7`)
- [x] 30-02 Routing stops advertising un-invocable skills (`6037be7`)
- [x] 30-03 Anchor paths to worktree root; raise build timeouts (`68bd573`)
- [x] 30-04 Structured, logged gate overrides (`68bd573`)

Evidence: 2797 tests / 2737 pass / 10 fail — same pre-existing daemon/timing failures. 29 tests added, 0 regressions.

### Objective 31: Telemetry and retention ✅

**Goal:** Make objectives 27–30 verifiable rather than asserted — classify blocking events repeatably, preserve session evidence before retention deletes it, and turn the signals into advisories someone will actually read.
**Depends on:** Objectives 27, 28, 30 (emit the signals this aggregates)
**Source:** Autonomy Blocker Audit, 2026-08-18
**Jobs:** 3/3 complete

Jobs:
- [x] 31-03 `df-tools session-audit` — the programme's acceptance test (`51c7766`)
- [x] 31-02 `df-tools transcript-export` — compact index before retention (`51c7766`)
- [x] 31-01 `df-tools telemetry` — status-facing view with advisories (`81796d6`)

Evidence: 2839 tests / 2780 pass / 9 fail — same pre-existing daemon/timing failures. 42 tests added, 0 regressions.
**Caveat:** hooks run from the plugin cache, so 27–30 take effect only after a version bump + `sync-runtime`. Re-run `session-audit --since <release>` then — that comparison is the real verdict.


### Objective 32: Visual-eval default path tells the truth

**Goal:** The default `df-tools verify flutter-ui-eval` invocation stops reporting green for states nothing judged. A `state_id` absent from `labels.json` must resolve to review or fail — never pass — and the offline path must stop emitting a fabricated `confidence` for a comparison it never performed.
**Depends on:** PR #68 (`feat/ui-visual-eval`) — adds the real `--judge live` vision judge this objective builds on. **Branch decision: stack, do not wait.** Work on `fix/ui-eval-default-honesty` cut from `feat/ui-visual-eval` and PR'd back into it, so #68 ships the judge and the honest default path together.
**Source:** AO-Cyber-Systems/aodex#485 (OPEN). Umbrella: AO-Cyber-Systems/eden-biz#683 (Phase 1).
**TRDs:** 4 plans in 4 waves (sequential — all four edit `flutter-ui-eval.cjs`)

Why: #485 audited the shipped gate and found `makeOfflineLabelEchoJudge` reads only `state_id` — it never opens `screenshot_path`, never reads `expected`. A missing label defaults to `{ is_broken: false }`. Reported impact: **40 states passing, 34 of which had never been judged by anything.** PR #68 supplies the judge; this objective makes the DEFAULT path honest.

Reproduced during planning against the current tree: an unlabelled state reports `"verdict": "pass"`; a stub-shaped state reports `"reviews": [null]`; and a run scoring `verdict: "fail"` exits 0.

TRDs:
- [x] 32-01-TRD.md — Wave 1: a state nothing judged stops reporting pass (#485 defect 1, the headline)
- [x] 32-02-TRD.md — Wave 2: offline path stops fabricating confidence; every state nameable (#485 defect 2)
- [x] 32-03-TRD.md — Wave 3: judge selection explicit; default declares itself advisory (#485 defect 3)
- [x] 32-04-TRD.md — Wave 4: a failing run exits non-zero (found in planning; severable)


### Objective 33: The visual gate actually runs in CI

**Goal:** Verifier Step 8c invokes the visual-eval engine with something the engine can load, so the gate executes instead of routing to SKIPPED. Today it is structurally unreachable and has judged nothing, ever.
**Depends on:** Objective 32 (makes the gate's output and exit code honest). 33 makes it RUN — both are required before "the visual gate works" is true. **Branch decision: stack.** Work on `fix/ui-eval-gate-runs` cut from `fix/ui-eval-default-honesty` (obj 32) at its tip, PR'd into `feat/ui-visual-eval` — 32-03 and 33-03 both rewrite verifier.md Step 8c, and 33 is the last writer.
**Source:** Found while planning objective 32. Umbrella: AO-Cyber-Systems/eden-biz#683 (Phase 1). Related: AO-Cyber-Systems/aodex#485.
**Jobs:** 3 TRDs in 3 waves (sequential — 33-02 and 33-03 edit files objective 32 also edits)

Why: `agents/verifier.md` Step 8c calls `df-tools verify flutter-ui-eval "$OBJECTIVE" --raw`, passing an objective **id**. The handler's first argument is a **manifest path** (`loadManifest(manifestPath)` → `fs.readFileSync`). Reproduced: `verify flutter-ui-eval 32 --raw` → `{"error":"manifest/captureResults not found","path":"32"}`. Step 8c's own contract then routes any `{error}` to `SKIPPED … NEVER a hard fail` — so the gate silently no-ops on every objective. It reports skipped rather than false-green, which is why #485 did not catch it, but CI coverage of the visual gate is currently **zero**.

Jobs:
- [x] 33-01-TRD.md — Wave 1: one lookup, in code — objective id to manifest, four honest statuses (`not_applicable`/`absent`/`invalid`/`resolved`)
- [x] 33-02-TRD.md — Wave 2: the load-bearing fix — the invocation Step 8c actually contains resolves to something the engine can load
- [x] 33-03-TRD.md — Wave 3: what the gate does when it runs and finds nothing (MISSING vs gap vs silent skip) + Step 8c routing

Decision recorded in OBJECTIVE.md: **resolution is owned by the handler, not the prose** (option c, implemented as b). Two prose documents already drifted apart on this lookup; the side that owns it is the side that cannot drift, so it moves into code once. The load-bearing test then EXECUTES the invocation extracted from `verifier.md` itself — it pins behaviour, not a string.

Manifest-less policy: `not_applicable` skips silently (existing gate preserved), `absent` is **MISSING** — the surface stays on the human-verification list plus a todo, escalating to a gap only when `visual_gate: true` — and `invalid` gaps loudly. Replacing a gate that never runs with a gate that always gaps would just get it disabled.
### Objective 34: UI Oracle Loop W1b — Surface Spec: schema, validator, renderer, review sheet, look-lock, prose harness

**Goal:** DevFlow can parse and validate a Surface Spec — the one hand-authored description of how a UI surface must function — derive the ui-eval manifest, navigation graph and control table from it, render a review sheet a human approves, record that approval as a look-lock later phases anchor on, and run agent prose that encodes shell semantics against a real harness.
**Depends on:** Objective 33 (the gate it feeds), UI Oracle Loop wave 0 (shipped v2.8.0)
**Source:** `docs/PROPOSAL-ui-oracle-loop.md` §4/§8/§12/§21 · `docs/IMPLEMENTATION-PLAN-ui-oracle-loop.md` Part 3 "W1b"
**Jobs:** 11/11 TRDs executed in 9 waves (two parallel roots: 34-01 schema chain, 34-09 harness chain). Both checkpoints closed — 34-06 human-verify approved 2026-09-26; tag v2.9.0 created 2026-09-23.

Jobs:
- [x] 34-01-TRD.md — Wave 1: `yaml-lite` — the subset YAML parser, and everything it refuses
- [x] 34-02-TRD.md — Wave 2: Surface Spec schema v1, the parser front door, and the `projects-rail` positive control
- [x] 34-03-TRD.md — Wave 3: `validateSurfaceSpec` — invariants I1-I3 and their known-broken fixtures
- [x] 34-04-TRD.md — Wave 4: invariants I4-I8, six more known-broken fixtures, and the `ui spec validate` arm (exit 1 with codes) — carries the I6 hit-rect decision checkpoint
- [x] 34-05-TRD.md — Wave 5: `renderSurfaceSpec` — manifest, nav graph, control table, capture list
- [x] 34-06-TRD.md — Wave 6: the review sheet and a `sheet_hash` that survives a template edit- [x] 34-07-TRD.md — Wave 7: look-lock — writing the acceptance block, and clearing it on shape change only
- [x] 34-08-TRD.md — Wave 8: `frontend-design` build mode step 0 — no composition without a valid, locked spec
- [x] 34-09-TRD.md — Wave 1: the agent shell harness — extraction, the call model, and cwd that persists
- [x] 34-10-TRD.md — Wave 2: the harness meets real prose — scratch monorepo, stubs, annotations, and CI
- [x] 34-11-TRD.md — Wave 9: release 2.9.0 — version trio + CHANGELOG landed

### Objective 35: Stack profile — loader, CLI, drafting, validation, agent wiring, neutral references ✅

**Goal:** DevFlow resolves a per-project stack profile (`.planning/STACK.md` over bundled `general` → org/pack → project → component tiers), validates and drafts it, and agents read their slice of it instead of branching on stack in prose. No STACK.md means the bundled `general` profile: commands discovered, never assumed; the check loop runs everywhere by decision (2026-09-27).
**Depends on:** `docs/PROPOSAL-stack-profile.md` + artifacts (`2946f97`). **Branch decision: stack.** `feat/stack-profile-loader` cut from `docs/stack-packs-proposal` @ `f1106e5`.
**Source:** Proposal §6 steps 1–5 (step 6, Flutter extraction, stays with `PROPOSAL-stack-packs.md`).
**Jobs:** 11/11 complete, verified passed 10/10 (35-VERIFICATION.md) — 11 TRDs in 6 waves (planned 2026-09-27; 35-02 split into 02a/02b per job-checker; objective-local requirement IDs STK-01..STK-10, STK-02 shared by 02a/02b)

Why: verifier Step 8 selects its runtime check from a `project.md` stack field that does not exist, so every non-Flutter/web project is SKIPPED; the planner scrapes gates out of prose; no detector knows Dart; `testing-strategy.md` guesses the stack from `kind`.

Jobs:
- [x] 35-01-TRD.md — Wave 1: extract the schema walker into `json-schema-lite.cjs`, add the stack-profile keywords
- [x] 35-02a-TRD.md — Wave 1: `stack-profile.cjs` loader core — parse, tiers + extends chain, merge + provenance, components (owns fixtures)
- [x] 35-02b-TRD.md — Wave 1: `stack-render.cjs` — renderCommand + contextFor per-agent slices and token cap
- [x] 35-03-TRD.md — Wave 2: `validateProfile` (STK001–STK009) and `df-tools stack resolve|context|validate|command`
- [x] 35-04-TRD.md — Wave 3: `df-tools stack init` drafting; codebase/STACK.md Commands section; map-codebase + new-project confirm steps
- [x] 35-05-TRD.md — Wave 3: `validate health` Check 12 (E030/W030/W031/W032/I030), never auto-repaired
- [x] 35-06-TRD.md — Wave 4: planner `<validation_gates>` from `stack command`; executor loop, task gates, generated-file guard, Discovered commands
- [x] 35-07-TRD.md — Wave 4: verifier Step 8 keyed on `verification.runtime` + `gates.objective`; debugger; integration-checker probe globs
- [x] 35-08-TRD.md — Wave 5: neutral references (testing-strategy, verification-patterns, checkpoints); planner Step 4 reads the Testing section
- [x] 35-09-TRD.md — Wave 5: detectors know Dart/Kotlin/Swift and read org-profile `detect` via `detectMarkers()`; codebase-mapper list
- [x] 35-10-TRD.md — Wave 6: dogfood `.planning/STACK.md`; proposal status; CHANGELOG [Unreleased]; USER-GUIDE (no version bump or tag)

### Objective 36: Upgrade in place

**Goal:** When DevFlow upgrades, every DevFlow project upgrades itself in place, and so does the global `~/.claude` state. The project records the version that last touched it, detection-based idempotent migrations run from a registry with an out-of-repo backup, safe ones apply and auto-commit at session start, and judgement ones become a notice. `health --migrate` finally runs the migrations.
**Depends on:** Objective 35 (same branch, `feat/stack-profile-loader`).
**Source:** 2026-09-27 upgrade/bootstrap audit. **Decisions (user):** auto-apply + auto-commit (only touched files, never bypass signing); a managed block in `~/.claude/CLAUDE.md`; the legacy install is moved to a backup, not deleted.
**Jobs:** 10/10 complete, verified passed 66/66 (36-VERIFICATION.md) — 10 TRDs in 4 waves (planned 2026-09-27; 36-04 split into 04a/04b/04c; notices primitive moved into 36-02; 36-06 and 36-07 moved earlier, 36-03 later, by real dependencies; objective-local requirement IDs UPG-01..UPG-08, UPG-04 shared by 04a/04b/04c)

Jobs:
- [x] 36-01-TRD.md — Wave 1: `lib/upgrade.cjs` runner — registry + contract validation, id order, out-of-repo backup, `config.json devflow{}` stamp, report (owns the shared fixtures)
- [x] 36-02-TRD.md — Wave 1: `lib/managed-block.cjs` (versioned `DEVFLOW:START v= src=` blocks, legacy = stale, byte-exact outside) + `lib/notices.cjs` one-shot notices
- [x] 36-07-TRD.md — Wave 1: plan/execute-objective surface init `bootstrap`/`bootstrap_objectives` in one line; dead import removed
- [x] 36-04a-TRD.md — Wave 2: migrations 0001 config-stamp, 0002 job-to-trd, 0003 state-json-seed; health repairs call them
- [x] 36-04b-TRD.md — Wave 2: migrations 0004 objective-md-backfill (revives `backfillAllObjectives`), 0006 kind-work (confirm, wraps `migrate.cjs`)
- [x] 36-04c-TRD.md — Wave 2: migration 0005 claude-md-block (existing blocks only); corrected, versioned `templates/claude-md.md`; map-codebase writes versioned markers
- [x] 36-06-TRD.md — Wave 2: `lib/global-upgrade.cjs` + `templates/global-claude-md.md` + sync-runtime call — legacy moved to backup, managed `~/.claude/CLAUDE.md` block, first adoption confirm-only
- [x] 36-03-TRD.md — Wave 3: `df-tools upgrade [--check|--apply|--only|--confirm|--path|--global]` + HELP_TABLE; health W040; `status check --migrate` runs upgrade
- [x] 36-05-TRD.md — Wave 3: `hooks/upgrade-project.js` — fast path, sync apply, detached commit of only `changed_files` with skip rules; notices emitted once via route-results
- [x] 36-08-TRD.md — Wave 4: dogfood `upgrade` on this repo; CHANGELOG [Unreleased], CLAUDE.md, USER-GUIDE, intent hint (no version bump or tag)

### Objective 37: `/devflow:adopt` — user-triggered repo adoption + daily backup pruning

**Goal:** A user in any repo types `/devflow:adopt [path]` and DevFlow turns it into a DevFlow project unattended: map the code, infer PROJECT.md/STACK.md, scaffold config/STATE/ROADMAP (no invented objectives), add the CLAUDE.md block, stamp the version, and make one signed commit on a `devflow/adopt` branch (no push) with an ADOPT-REPORT.md of low-confidence items. Backups under `~/.claude/devflow/backups/` are pruned daily (14 days / keep 5 per repo, SessionStart-throttled; Claude Code has no persistent local scheduler).
**Depends on:** Objective 36 (stamp, upgrade runner, managed blocks, SessionStart hook); the ROADMAP-corruption fix (`/devflow:debug`, done first).
**Decisions (user, 2026-09-28):** re-scoped away from batch-adopting the user's 11 repos (out of scope, never touched); fully unattended; E2E proof = simulated run on scratch fixtures + a local-dev-install human check.
**Jobs:** 0/16 complete — 16 TRDs in 10 waves (planned 2026-09-28; objective-local requirement IDs ADP-01..ADP-07; execution serialized; 37-16 is a human-verify checkpoint, not autonomous)

Jobs:
- [ ] 37-01-TRD.md — Wave 1: `__fixtures__/adopt-fixtures.cjs` scratch-repo factory (Go, Flutter, Node, empty, DevFlow, dirty) + `lib/repo-state.cjs` detector (devflow|greenfield|brownfield|scratch)
- [ ] 37-02-TRD.md — Wave 1: global `df-tools --cwd <dir>` (chdir before dispatch; flag-region boundary)
- [ ] 37-03-TRD.md — Wave 1: `lib/backup-prune.cjs` pure retention policy (14 days / newest 5), 24 h throttle, global-config keys, repo registry; `upgrade.repoKey`
- [ ] 37-04-TRD.md — Wave 2: project-state, brownfield-detector and init new-project delegate to repo-state (parity proven)
- [ ] 37-05-TRD.md — Wave 2: `df-tools adopt preflight|begin` — routing, refusals with zero side effects, devflow/adopt branch, resumable git-dir marker; HELP_TABLE entry
- [ ] 37-06-TRD.md — Wave 3: prune wired into SessionStart (`upgrade-project.js`, every session) + `upgrade --prune [--dry-run]` / `--register`
- [ ] 37-07-TRD.md — Wave 3: `adopt scaffold` — STATE, objective-less ROADMAP, STACK.md, CLAUDE.md block, stamp via the upgrade runner, register; idempotent
- [ ] 37-08-TRD.md — Wave 4: `adopt report` (ADOPT-REPORT.md needs-review, redaction, commit file list) + `adopt-e2e-assert.cjs` structural checker + deterministic 3-stack pipeline test
- [ ] 37-09-TRD.md — Wave 5: `skills/adopt/SKILL.md` + `workflows/adopt.md` (unattended), map-codebase non-interactive mode, new-project points at adopt + registers; contract test
- [ ] 37-10-TRD.md — Wave 6: routing — route-intent adopt intents (also outside DevFlow projects), global routing template v2, help, init-offer → /devflow:adopt for brownfield
- [ ] 37-11-TRD.md — Wave 7: E2E proof (a) — simulated agent run of the checkout skill on the Go fixture
- [ ] 37-12-TRD.md — Wave 8: E2E proof (a) — Node fixture + second adopt routes to upgrade (idempotency)
- [ ] 37-13-TRD.md — Wave 8: E2E proof (a) — Flutter fixture
- [ ] 37-14-TRD.md — Wave 8: E2E proof (a) — routing cases (DevFlow → upgrade, empty → new-project, dirty/non-git refuse unchanged); wave-8 gate
- [ ] 37-15-TRD.md — Wave 9: docs (USER-GUIDE, CHANGELOG [Unreleased], CLAUDE.md, gen-docs) + dry-run completion leaves ROADMAP/STATE intact + final full-suite gate
- [ ] 37-16-TRD.md — Wave 10: E2E proof (b) — checkpoint:human-verify: local install from this checkout, fresh session, `/devflow:adopt`, revert

### Objective 38: Documentation auto-correction

**Goal:** DevFlow keeps its own, project and global documentation current as it runs: a command-reference checker + rename map (a CI test on the plugin, an auto-fix in projects), staleness advisories (STACK.md review age and drift, codebase-map age, W002), and a one-time cleanup of DevFlow's own stale docs.
**Depends on:** Objective 36 (managed blocks, upgrade runner).
**Jobs:** registered, not planned.
