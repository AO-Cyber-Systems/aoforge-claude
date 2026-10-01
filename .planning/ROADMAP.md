# Roadmap: DevFlow Claude

## Milestones

- ✅ **v1.1 — DevFlow Coordination Layer** — Objectives 0–9, 6, 8, 24 (shipped 2026-05-06)
- ✅ **v1.2 — Token Efficiency + Ambient Mode + Handoff Polish** — Objectives 10–23, 25 (shipped 2026-07-22)
- ✅ **v1.3 — Autonomy hardening, stack profile, upgrade/adopt, doc auto-correction** — Objectives 27–41 (completed 2026-09-28; plugin v2.11.0, merge to `main` pending)
- 📋 **v1.4 — not yet planned** — candidates: Objective 26 (moved from v1.3 2026-09-28; kill candidate), Objective 42 (codebase-aware stack drafter, in progress), Objective 44 (autonomy hardening), Objectives 46–51 (GitHub as system of record)

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
- [x] 44-10-TRD.md — (W4, tdd, gap closure) gate-commits ignores stale bare REBASE_HEAD; executor-stop reason names the concrete SUMMARY path (AUT-04, AUT-02)

### Objective 43: Stack drafter rules

**Goal:** Fix the drafter defects objective 42's rollout hand-fixed (aggregate targets, multi-stack roots, manifest-less roots, environment targets, internal Taskfile tasks, wrapped component recipes, commit gitignore check) so re-drafting matches the 11 override files.
**Requirements:** see `.planning/objectives/43-stack-drafter-rules/OBJECTIVE.md`
**Plans:** TBD

### Objective 45: DevFlow doctor + runtime hygiene

**Goal:** `df-tools doctor` / `/devflow:doctor` diagnose and safely repair environment problems (stale runtime mirror, in-repo runtime state, pending migrations, stale markers/state/backups, hook drift); awareness cache leaves the repo; 0008 covers nested `.planning/`; sync-runtime re-mirrors same-version content changes.
**Requirements:** DOC-01..DOC-07 (see `.planning/objectives/45-devflow-doctor/OBJECTIVE.md`)
**Plans:** 10 TRDs in 4 waves

TRDs:
- [x] 45-01-TRD.md — awareness cache out of the repo via awareness-store (DOC-01) [W1]
- [x] 45-02-TRD.md — migration 0008 covers nested .planning runtime state (DOC-02) [W1]
- [x] 45-03-TRD.md — sync-runtime version + content digest marker (DOC-03) [W1]
- [x] 45-04-TRD.md — doctor engine, check registry, CLI + dispatch + help (DOC-04) [W1]
- [x] 45-05-TRD.md — global install checks: runtime mirror, plugin cache, hooks registry, model ids (DOC-05) [W2]
- [x] 45-06-TRD.md — project checks + staged-changes guard: legacy state, migrations, health, markers (DOC-05/06) [W2]
- [x] 45-07-TRD.md — state-hygiene checks: guard state, awareness state, backups (DOC-05) [W2]
- [x] 45-08-TRD.md — end-to-end doctor on aodex-like fixture (SC4/SC5) [W3]
- [x] 45-09-TRD.md — /devflow:doctor skill, route-intent, docs, full npm test (DOC-07) [W4]
- [x] 45-10-TRD.md — autonomous hook markers out of .planning + SC1 planning-writes audit [W1]

<!-- GitHub system of record: objectives 46–51, design in docs/PROPOSAL-github-system-of-record.md -->

### Objective 46: GitHub sync foundations

**Goal:** The existing GitHub sync is correct, idempotent and rate-safe, so the authoritative store can be built on it.
**Requirements:** GSF-01, GSF-02, GSF-03, GSF-04, GSF-05, GSF-06, GSF-07, GSF-08
**Depends on:** none
**Success Criteria**:
1. Push and pull resolve the same issue through one v3 mapping keyed by DevFlow id
2. Losing the mapping never creates duplicate issues
3. Human text outside managed body sections survives syncs
4. Secondary rate limits are retried after `retry-after`; post-execute sync failures are reported
**Plans:** 10 TRDs in 6 waves

TRDs:
- [x] 46-01-gh-client-TRD.md — (W1, tdd) `gh-client.cjs`: one gh seam, writes paced ≥1 s, secondary-limit retry honouring `retry-after`, `--paginate --slurp`, `github.enabled` gate, exit codes; gh PATH shim (GSF-08)
- [x] 46-02-gh-mapping-v3-TRD.md — (W1, tdd) `gh-mapping.cjs`: objective id normaliser, mapping v3, pure v1/v2→v3 conversion; migration 0009 (auto) (GSF-01)
- [x] 46-03-gh-body-markers-TRD.md — (W1, tdd) `gh-body.cjs`: `devflow:id` markers, managed body sections that preserve human text, sticky-marker compat, marker index (GSF-02, GSF-06)
- [x] 46-04-gh-project-discovery-TRD.md — (W1, tdd) `gh-project.cjs`: Project v2 fields via GraphQL, out-of-repo TTL cache, live options (GSF-07)
- [x] 46-05-gh-issue-resolution-TRD.md — (W2, tdd) `gh-issue.cjs` find-or-create (mapping → frontmatter → marker → title → create) + `gh-milestone.cjs` current milestone; stateful fake GitHub (GSF-02, GSF-01, GSF-05)
- [x] 46-06-pull-syncstate-rewire-TRD.md — (W2, tdd) `setFrontmatterField`; sync-state keyed by id; `gh pull`/conflict on v3 mapping, `resolveRepo`, enabled gate, client seam (GSF-01, GSF-04, GSF-08)
- [x] 46-07-sync-core-rewire-TRD.md — (W3, tdd) `gh sync <objective>` rebuilt: create-if-absent, managed body, paginated sticky comment, live Project fields, `github_issue` write-back; fixture read removed (GSF-01, 02, 04, 06, 07, 08)
- [x] 46-08-command-surface-TRD.md — (W4, tdd) `gh sync --all`, deprecated `sync-objectives` alias, comment/close-issue/sync-release/resolve/status on the seam + v3 + markers + gate + exit codes; gen-1 code deleted; repo guard (GSF-01, GSF-02, GSF-08)
- [x] 46-09-e2e-push-pull-TRD.md — (W5) end-to-end push → pull on one fake GitHub: SC1-SC4 + legacy mapping matrix
- [x] 46-10-sync-step-and-docs-TRD.md — (W6, tdd) execute-objective sync step passes the dir and reports failures (GSF-03, SC5); deprecation guard; skill/agent/workflow/template/CLAUDE.md/USER-GUIDE/CHANGELOG; full `npm test` (SC6)

### Objective 47: GitHub authoritative store

**Goal:** GitHub holds the full planning hierarchy and content (milestone → objective issue → TRD sub-issues, detail in the wiki), and DevFlow round-trips it through an outbox and a local cache.
**Requirements:** GST-01..GST-08 (see `.planning/objectives/47-github-authoritative-store/OBJECTIVE.md`)
**Depends on:** Objective 46
**Success Criteria**:
1. A fixture objective round-trips: push → issues, sub-issues, blocked-by, wiki page; `pull --all` regenerates the cache
2. TRDs over 60K characters are refused before an issue exists; scope comments form the effective spec
3. Offline writes flush in order; a remote edit halts the flush
4. Degraded mode works on a user-owned repo
**Plans:** 14 TRDs in 6 waves

TRDs:
- [x] 47-01-gh-trd-codec-TRD.md — (W1, tdd) `gh-trd.cjs`: TRD body codec (id + file header), 40K/60K budget, scope comments by `n`, effective spec, fold, spec-rev log, lossless comment parts (GST-03)
- [x] 47-02-fake-github-store-TRD.md — (W1, tdd) fake GitHub extended: REST create with ids ≠ numbers, sub-issues, dependencies, types, fields, repo meta, offline; store fixture builder (GST-01, GST-05, GST-08)
- [x] 47-03-gh-outbox-store-TRD.md — (W1, tdd) `gh-outbox.cjs`: durable per-repo journal, logical op schema, coalesce/FIFO, lock, 80/min + 450/h budget, base hashes (GST-05)
- [x] 47-04-gh-wiki-store-TRD.md — (W1, tdd) `gh-wiki.cjs`: `.wiki.git` clone at `.planning/wiki/`, page table, commit + rebase + push on master, revision pin, `docs/devflow/` backend; local bare-repo fixture (GST-06, GST-08)
- [x] 47-05-body-mapping-extensions-TRD.md — (W1, tdd) `gh-body` wiki/meta sections, dir marker, tick-preserving criteria, trds section, Decision ids, part finder; `gh-mapping` trds accessors (GST-02, GST-04)
- [x] 47-06-gh-capability-TRD.md — (W2, tdd) `gh-capability.cjs`: probe + TTL cache for types, fields, sub-issues, dependencies, wiki; degraded mode selection (GST-08)
- [x] 47-07-gh-outbox-flush-TRD.md — (W2, tdd) `gh-outbox-flush.cjs`: idempotent op handlers, ordered flush, offline/rate-limit pending, remote-edit halt, resolve; `gh-client` scoped retry policy (GST-05)
- [x] 47-08-gh-comments-TRD.md — (W2, tdd) `gh-comments.cjs`: SUMMARY/VERIFICATION comments, scope changes with budget, freeze, fold, effective spec, drift (GST-03, GST-04)
- [x] 47-09-gh-hierarchy-TRD.md — (W3, tdd) `gh-hierarchy.cjs`: budget gate before any write, objective → TRD sub-issues → blocked-by, Decision issues, pages, one objective-body writer, orphans (GST-01, GST-02)
- [x] 47-10-gh-cache-pull-all-TRD.md — (W3, tdd) `gh-cache.cjs` + `gh pull --all`: rebuild cache from issues + wiki, generated ROADMAP/STATE, safe overwrite rules (GST-07)
- [x] 47-11-store-cli-TRD.md — (W4, tdd) `gh outbox status|flush|resolve` (exit 0/1/2/3), `gh trd spec|freeze|fold|scope`, `gh orphans`; dispatch + help
- [x] 47-12-sync-store-wiring-TRD.md — (W4, tdd) `gh sync` store mode behind `github.store`: hierarchy via outbox, Roadmap wiki page, cache baseline; config defaults; seam guard
- [x] 47-13-store-e2e-TRD.md — (W5) end-to-end SC1-SC5 on one fake GitHub + local wiki remote; seam guard covers gh-store-cli
- [x] 47-14-docs-and-full-suite-TRD.md — (W6) CLAUDE.md, CHANGELOG [Unreleased], USER-GUIDE, gh-sync skill, proposal status; full `npm test` (SC6)

### Objective 48: Planning write-path migration

**Goal:** Skills and agents change planning state only through df-tools verbs that write to GitHub, and `.planning/` becomes a gitignored cache.
**Requirements:** GWP-01..GWP-05 (see `.planning/objectives/48-planning-write-path-migration/OBJECTIVE.md`)
**Depends on:** Objective 47
**Success Criteria**:
1. No skill/agent/workflow writes planning files directly (CI audit test)
2. The edit gate denies direct cache edits and names the verb
3. Plan → execute → verify leaves `git status` clean apart from code
**Plans:** 23 TRDs in 6 waves

TRDs:
- [x] 48-01-planning-mode-paths-ledger-TRD.md — (W1, tdd) `planning-mode` (store iff github.enabled && github.store; main-checkout root), `planning-paths` total classifier + verb table + U-1 gitignore lines, `planning-ledger` verb-write ledger
- [x] 48-02-entity-issue-contract-TRD.md — (W1, tdd) entity body codec, mapping `entities`, outbox roles todo/debug/quick + ENTITY_ROLES
- [x] 48-03-trd-budget-and-bulk-TRD.md — (W1, tdd) `trd-bulk` 40K/60K budget + linked-bulk (8,000-char block, 40% share) warnings; `verify trd-pre` trd_budget; job-checker Dimension 8 (GWP-05)
- [x] 48-04-planning-writes-audit-ratchet-TRD.md — (W2, tdd) SC1 audit: planning-write scanner + repo ratchet test with six per-group baselines
- [x] 48-05-wiki-pages-and-native-milestones-TRD.md — (W1, tdd) PAGE_TABLE rules for research/, milestones/, objective docs; `gh-milestone-store` native milestones; fake milestone PATCH
- [x] 48-06-flusher-entity-roles-TRD.md — (W2, tdd) flusher creates/updates/closes todo, debug (Debug type), quick (Quick type) issues; optional types; decision answer pinned
- [x] 48-07-cache-materialize-entities-TRD.md — (W2, tdd) `gh pull --all` rebuilds todos, debug, quick, decisions, generated MILESTONES.md; owned list via classifier
- [x] 48-08-edit-gate-cache-deny-TRD.md — (W2, tdd) store-mode gate denies cache/generated edits naming the verb (`plan put-trd`), store off unchanged (SC2)
- [x] 48-09-validate-w055-cache-drift-TRD.md — (W2, tdd) `validate health` W055: cache file changed outside a verb (baseline + ledger hashes)
- [x] 48-10-store-gitignore-migration-TRD.md — (W2, tdd) confirm migration 0010 (gitignore `.planning/*` except config.json + STACK.md), per-path `commit` filter, doctor check 24
- [x] 48-11-core-planning-verbs-TRD.md — (W2, tdd) `writeThrough` + put-trd/push, objective put/set-status, summary post/checkpoint, verification post, doc put, drafts; flush settles ledger
- [x] 48-12-entity-verbs-and-import-TRD.md — (W3, tdd) decision open/answer, todo add/complete, debug put/resolve, quick put/summary, milestone put/complete; `planning import`
- [x] 48-13-generated-view-writers-store-mode-TRD.md — (W2, tdd) state mutators write state.json only, roadmap writers no-op in store mode
- [x] 48-14-cache-writers-store-mode-TRD.md — (W3, tdd) objective add/insert/remove/complete, frontmatter set/merge, template fill, requirements mark-complete in store mode
- [x] 48-15-verb-cli-wiring-TRD.md — (W4, tdd) df-tools dispatch + help for every verb; seam guard; verbs-exist audit
- [x] 48-16-prose-plan-research-discuss-TRD.md — (W5, tdd) prose group `plan`: planner (put-trd, scope budget), researcher, discuss, discovery
- [x] 48-17-prose-execute-TRD.md — (W5, tdd) prose group `execute`: executor summary checkpoint/post, execute flows, transition, build
- [x] 48-18-prose-verify-TRD.md — (W5, tdd) prose group `verify`: verifier verification post, UAT, UI eval, design review, security audit
- [x] 48-19-prose-bootstrap-milestone-TRD.md — (W5, tdd) prose group `bootstrap`: new-project, roadmapper, researchers, milestones, adopt, add/remove objective
- [x] 48-20-prose-todo-decide-debug-quick-TRD.md — (W5, tdd) prose group `work`: todos, decide, debugger, quick, micro
- [x] 48-21-prose-codebase-status-misc-TRD.md — (W5, tdd) prose group `misc`: map-codebase, gh-sync, sync-roadmap, status, help, workstreams
- [x] 48-22-store-e2e-and-parity-TRD.md — (W5) SC3 plan→execute→verify on the fake GitHub leaves git clean apart from code; store-off parity; W055/offline negatives
- [x] 48-23-docs-ratchet-zero-full-suite-TRD.md — (W6, tdd) SC1 audit to zero (baselines deleted), CLAUDE.md, CHANGELOG, USER-GUIDE, proposal status; `npm test` (SC4)

### Objective 49: Objective branch and PR lifecycle

**Goal:** Every objective runs on one linked branch and ends in one pull request that closes the objective and all its TRDs on merge.
**Requirements:** GPR-01..GPR-06 (see `.planning/objectives/49-objective-branch-and-pr-lifecycle/OBJECTIVE.md`)
**Depends on:** Objective 48
**Success Criteria**:
1. One draft PR per objective with closing references for every TRD
2. Wave worktrees merge into the objective branch with no extra PRs
3. Non-assignee scope changes wait for assignee confirmation
**Plans:** 15 TRDs in 6 waves

TRDs:
- [x] 49-01-fake-github-prs-branches-statuses-TRD.md — (W1) fake GitHub: PRs on the shared issue counter, pulls/statuses/refs REST, linked-branch/ready/merge-queue GraphQL, comment authors + assignees, humanMergePr
- [x] 49-02-mapping-prs-and-read-classification-TRD.md — (W1) mapping top-level `prs` map (byte-stable when empty), `issue develop --list` is a read
- [x] 49-03-scope-acceptance-predicate-TRD.md — (W1) GPR-05 pure half: scope authors, confirm marker bound to the scope hash, acceptance predicate, pending scopes in effectiveSpec
- [x] 49-04-objective-branch-git-seam-and-wiki-diff-TRD.md — (W1) `objective-branch` git seam (fetch/switch/start commit/push/cleanup), `makeGitRemote` fixture, `gh-wiki.diff`
- [x] 49-05-outbox-upsert-pr-and-ready-TRD.md — (W2) outbox `upsert-pr` (draft, closes derived at flush, wiki pin, `devflow:pr=` marker), `pr-ready`, `patch-issue labels_remove`
- [x] 49-06-scope-gate-confirm-and-trd-start-TRD.md — (W2) only accepted scopes change a TRD; `gh trd confirm-scope` (assignee only), `gh trd start` (in_progress label)
- [x] 49-07-commit-refs-trailer-TRD.md — (W2) `df-tools commit` adds `Refs #issue` from the commit scope in store mode (main-root mapping)
- [x] 49-08-init-pr-lifecycle-fields-TRD.md — (W2) init `pr_lifecycle`, `objective_branch`, `pr_number`, `branching_strategy_ignored`; local deprecation notice
- [x] 49-09-gh-pr-start-sync-status-TRD.md — (W3) `gh pr start|sync|status`: linked branch, start commit, one draft PR, freeze every TRD; dispatch, help, seam guard
- [x] 49-10-outbox-status-comment-merge-ops-TRD.md — (W3) outbox `post-status` (devflow/verification), `upsert-pr-comment`, `pr-merge` (squash default, queue-aware), `delete-branch`
- [x] 49-11-summary-verify-pr-hooks-TRD.md — (W4) summary post drops in_progress + refreshes PR; verify pass → status, ready, wiki diff; objective issue closes on merge, not at verify
- [x] 49-12-pr-merge-and-reconcile-TRD.md — (W4) `gh pr merge` (verified + ready only) and `gh pr reconcile` (stragglers closed, Project Done, branches deleted, cache pulled)
- [x] 49-13-workflow-prose-pr-lifecycle-TRD.md — (W5) execute-objective + complete-milestone drive the PR in store mode; `branching_strategy` deprecated (GPR-06)
- [x] 49-14-pr-lifecycle-e2e-and-parity-TRD.md — (W5) SC1 one PR closing every TRD, SC2 worktrees with no extra PRs, SC3 scope pending until confirmed; store-off parity
- [x] 49-15-docs-and-full-suite-TRD.md — (W6) CLAUDE.md, CHANGELOG, USER-GUIDE, proposal refinements, gh-sync skill; `npm test` (SC4)

### Objective 50: GitHub enforcement and setup

**Goal:** Branch and PR discipline is enforced locally and on GitHub, and `df-tools gh setup` configures a repository for it.
**Requirements:** GEN-01..GEN-05 (see `.planning/objectives/50-github-enforcement-and-setup/OBJECTIVE.md`)
**Depends on:** Objective 49
**Success Criteria**:
1. Commits on the default branch or unlinked branches are refused; the escape is logged
2. `gh setup` dry-run lists rulesets, checks, types and fields; apply is idempotent
3. The linked-issue required check fails a PR without a closing reference
**Plans:** 13 TRDs in 5 waves

TRDs:
- [x] 50-01-fake-github-setup-and-check-routes-TRD.md — (W1) fake GitHub: rulesets (422 merge queue, 403 non-admin), repo PATCH, labels list, org type/field writes (api-version header, options 422), PR commits, contents
- [x] 50-02-commit-gate-decision-TRD.md — (W1) pure gate: default/unlinked/detached refused, linked `prs` branch and `df/exec-*` (main on linked branch) allowed, `DEVFLOW_SKIP_GH_GATE=1`; `gh` override gate
- [x] 50-03-required-check-logic-TRD.md — (W1) pure `devflow/linked-issue` (closing ref to an existing issue, base = default) and `devflow/planning-consistency` (GitHub graph in store mode, pass when store off), reconcile plan
- [x] 50-04-store-health-collector-TRD.md — (W1) offline store health: W057 unsynced, W058 missing links, W059 orphans, W060 frozen-body drift, W061 check failed
- [x] 50-05-outbox-flush-hook-TRD.md — (W1) `gh-flush.js` PostToolUse(Bash, after `df-tools commit`) + Stop: flush outbox, report pending/halted/drift, never blocks
- [ ] 50-06-commit-gate-wiring-TRD.md — (W2) `df-tools commit` refuses before staging in store mode, logs the escape via override, `Refs #` falls back to the linked objective
- [ ] 50-07-health-and-doctor-reports-TRD.md — (W2) validate Check 16 (W057-W061), doctor check 25 `gh-store-sync`, check 22 defers the codes
- [ ] 50-08-check-runner-cli-TRD.md — (W2) Actions runner: posts the two contexts as commit statuses (PR + merge_group), merge-time reconcile closes stragglers
- [ ] 50-09-setup-plan-TRD.md — (W2) `gh setup` state reader, pure plan (ruleset superset-idempotent, types, fields, labels, settings, files, wiki, merge_group advisories), dry-run renderer
- [ ] 50-10-actions-workflows-and-templates-TRD.md — (W2) reusable `devflow-checks.yml` (workflow_call, App token via client-id), managed caller template, PR-template block
- [ ] 50-11-gh-setup-apply-and-cli-TRD.md — (W3) `df-tools gh setup [--apply]`: idempotent apply, merge-queue/field/403 degradation, dispatch, help, `github.app_id` / `github.checks_workflow`
- [ ] 50-12-enforcement-e2e-and-parity-TRD.md — (W4) SC1-SC3 through real entry points; store-off parity (zero gh calls) for everything but `gh setup`
- [ ] 50-13-docs-and-full-suite-TRD.md — (W5) CLAUDE.md, CHANGELOG, USER-GUIDE, proposal refinements, gh-sync/help skills; `npm test` (SC4)

### Objective 51: GitHub migration and docs

**Goal:** Existing DevFlow projects move to GitHub as the system of record in place, and the docs describe the new model.
**Requirements:** GMD-01..GMD-04 (see `.planning/objectives/51-github-migration-and-docs/OBJECTIVE.md`)
**Depends on:** Objective 50
**Success Criteria**:
1. Backfill stays under secondary limits, resumes after interruption, and re-runs as a no-op
2. Docs pass doc-refs; objective 26 re-based or killed
**Plans:** TBD (run /devflow:plan-objective 51)

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
| 44. Autonomy hardening | v1.4 | 10/10 | Complete | 2026-09-29 |
| 43. Stack drafter rules | v1.4 | 0/— | Registered | — |
| 45. DevFlow doctor + runtime hygiene | v1.4 | 10/10 | Complete | 2026-09-30 |
| 26. GitHub issue auto-build monitor | v1.4 | 0/— | Moved to v1.4 (kill candidate) | — |
| 46. GitHub sync foundations | v1.4 | 10/10 | Complete | 2026-09-30 |
| 47. GitHub authoritative store | v1.4 | 14/14 | Complete | 2026-10-01 |
| 48. Planning write-path migration | v1.4 | 23/23 | Complete | 2026-10-01 |
| 49. Objective branch and PR lifecycle | v1.4 | 15/15 | Complete | 2026-10-01 |
| 50. GitHub enforcement and setup | v1.4 | 5/13 | In Progress | — |
| 51. GitHub migration and docs | v1.4 | 0/— | Registered | — |
