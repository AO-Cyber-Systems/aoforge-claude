# Requirements: v1.6 Hardening & Release

**Defined:** 2026-10-08
**Coverage:** 0/30 complete

Scope: everything v1.5 left open (Known Gaps and tech debt in `milestones/v1.5-MILESTONE-AUDIT.md`), the eight pending todos in `.planning/todos/pending/`, and the three operational decisions carried since v1.3. Live, outward-facing steps (merge, tag, push, repository settings, secrets, Cloudflare) run only after explicit per-action user approval; DevFlow never enters a secret value.

## v1.6 Requirements

### Release (REL)

- [x] **REL-01**: The v1.5 work ships. The three version files are bumped in step, CHANGELOG `[Unreleased]` becomes the release section, `feat/stack-profile-loader` merges to `main`, and the next plugin semver tag sits on the merge commit. Each live step runs only after explicit approval.
- [x] **REL-02**: After the release and a session restart, the installed runtime mirror carries the v1.5 libs and hooks (todo-sync, checks-pin, estimate-backtest, skill-requires, builtin-audit, gate-bash-writes, gate-skill-requires, todo-sync Stop hook). `doctor` and `validate health` report no mirror lag.

### Estimation (EST): carries EST-08 forward

- [ ] **EST-09**: Every new executor SUMMARY carries `tokens_input` / `tokens_output`. Forward-stamp coverage is ≥95% over the TRDs executed in v1.6, and the coverage is measured and reported.
- [x] **EST-10**: Minutes estimates are recalibrated by a method chosen and frozen before it is scored. The choice, its provenance and its validation protocol are recorded, and nothing is fitted to the objectives it is scored on.
- [ ] **EST-11**: EST-08's criterion is re-tested prospectively. Across the first five objectives executed after EST-10 ships, each with a run-state estimate recorded before execution, the median estimate is within ±30% of actual and P90 covers ≥80% of outcomes. The report gives the honest verdict either way.

### df-tools correctness (TOOL)

- [x] **TOOL-01**: `milestone complete` takes `--dry-run`, which reports what it would write and writes nothing. Every df-tools verb that writes rejects unknown flags instead of ignoring them.
- [x] **TOOL-02**: Re-running `milestone complete` for the same version does not duplicate its MILESTONES.md entry or archive files.
- [x] **TOOL-03**: `objective remove` renumbering preserves the completion dates and other metadata of the objectives it renumbers.
- [x] **TOOL-04**: `objective complete` reports `next_objective` and `is_last_objective` correctly when later objectives exist in ROADMAP.md.
- [x] **TOOL-05**: `milestone-scope.cjs` resolves objective directories through the shared objective-number helpers (`objectiveDirMatches` / `objectiveNumPattern`), with no local parser.
- [x] **TOOL-06**: `doc put` never publishes stale content. `planning draft` reseeds a draft that is older than the live file, and `doc put` refuses a draft whose base is no longer the live file, naming the fix.
- [x] **TOOL-07**: The v1.5 audit's small CLI defects are fixed. `state update-progress` updates or errors (no silent no-op), `verify trd-pre <N>` resolves an existing objective, and `objective-job-index` reads `gap_closure` from TRD frontmatter.
- [x] **TOOL-08**: `verify-commits.js` SubagentStop output matches Claude Code's hook output schema, with a test that pins the shape.
- [x] **TOOL-09**: `validate health` and `doctor` flag a `.planning/.skill-active` marker that is tracked in git or stale, and `--repair` / `--fix` resolve it safely.
- [x] **TOOL-10**: SUMMARY frontmatter `requirements-completed` agrees with VERIFICATION: a check flags a requirement a VERIFICATION marks satisfied that no SUMMARY lists (the 58 EST-02/EST-04 case), and 58 is corrected.

### Stack drafter (SDR)

- [x] **SDR-09**: The drafter prefers a real govulncheck gate step over a `--self-test` step in the same workflow, and drafts buf lint coverage where the repo uses buf.
- [x] **SDR-10**: `stack verify --run` has a stated policy for service-backed tests (they never silently reach a local database or service; they are skipped or need an explicit opt-in) and for build artifacts (created artifacts are restored or reported).

### Handoff (HND)

- [ ] **HND-01**: The three documented PTY handoff gaps are closed: the dispatch-wrapper isatty check, the wrapper stdin race and the detector's late match. Each has a regression test.
- [ ] **HND-02**: Handoff results reach the session without a manual paste. The draft `inject-handoff-results.js` is completed and registered (or replaced), and it is covered by the hook coexistence suite.
- [ ] **HND-03**: A TTY-required command (auth login, token paste, sudo prompt) goes from detection to handoff to result in context end to end, demonstrated live with the `devflow-watch` daemon.

### Install, naming and the AOForge rename (INST)

- [x] **INST-01**: No legacy `df-*` skills or agents remain under `~/.claude` (they are moved to a backup, never deleted), and `doctor` flags any that reappear. Every user-facing reference uses the `/aoforge:<name>` form; a repo test fails on the `/df-`, `/df:` and `/devflow:` command forms in user-facing files, with changelogs and archives exempt.
- [x] **INST-02**: DevFlow is renamed AOForge everywhere it is a name: the plugin `aoforge@aocyber`, the `/aoforge:` slash namespace, `aoforge:<agent>` agent types, the `aof-tools` CLI, the `~/.claude/aoforge/` runtime, `AOFORGE_*` environment variables, the `.aoforge/` project directory, the `aoforge{}` config stamp, the `AOF ►` banner and the external names (`aoforge-claude`, `aoforge-docs`, `aoforge-checks.yml`, `aoforge-watch`, `aoforge/adopt`). A repo test fails on a legacy name outside the compatibility module, the history allowlist and the pointer plugin.
- [x] **INST-03**: Old names keep working for exactly one release: `DEVFLOW_*` variables are honoured (`AOFORGE_*` wins), `~/.claude/devflow/` state migrates to `~/.claude/aoforge/` with a backup first, gates accept `devflow:` agent types, every tool resolves `.aoforge/` first and falls back to `.planning/` with a W-code advisory naming the migration, old CLAUDE.md block markers and GitHub markers and labels are recognised so nothing is duplicated, and readers accept the `devflow{}` config key.
- [ ] **INST-04**: Projects move forward in place: an auto migration moves `.planning/` to `.aoforge/` with `git mv` from the SessionStart upgrade hook (skipped on a dirty tree or mid-merge/rebase, backup first, store-mode cache handled), config `devflow{}` becomes `aoforge{}`, CLAUDE.md managed blocks and routing text are rewritten to AOForge, and store-mode GitHub artefacts (labels, hidden markers, wiki pages, wording, check contexts) are renamed by a verb that previews with a dry run and applies one repository at a time after approval.
- [x] **INST-05**: AOForge ships as 3.0.0: the three version files agree, the CHANGELOG 3.0.0 entry leads with the rename and links the migration guide, a final `devflow@aocyber` pointer release tells users to install `aoforge@aocyber` and forwards its skills to `/aoforge:`, an installed devflow plugin is detected and the user told to disable it (pointer hooks no-op beside aoforge), and the README and docs site show the real gold AO emblem with an AOForge wordmark.
- [ ] **INST-06**: The user's setup is moved over, each live step only after explicit approval: this repository's planning tree is `.aoforge/` with its active docs in AOForge wording; the global CLAUDE.md block routes to `/aoforge:` (hand-written text changes only after a shown diff is approved); the GitHub repository is `aoforge-claude`; the local checkout is `~/dev/aoforge-claude` with its remote, Claude memory and keyed runtime state carried over; a vanity-mapping PR is drafted for review; the Pages project is `aoforge-docs`; and every fleet repository using DevFlow is upgraded with one checkpoint per repository.

### Operations (OPS): decisions carried since v1.3

- [ ] **OPS-01**: The CI `ANTHROPIC` secret is configured by the user (DevFlow never handles the value), and the live visual judge runs in CI on `main` (objectives 32/33).
- [ ] **OPS-02**: Branch protection on `main` is set (required checks, no force-push), applied only after the user approves the exact ruleset.
- [ ] **OPS-03**: The docs site deploys from `main`. The Cloudflare Pages project `devflow-docs` exists, or the workflow's account and token are corrected, and a push to `main` deploys green.

### Todo hygiene (TODO)

- [ ] **TODO-01**: Every todo pending at v1.6 start is completed through `todo complete` by the objective that addresses it, or explicitly re-scoped. None is left pending without a reason.

## Future Requirements

- Node, Rust and Python tier-2 stack profiles.
- `dflang mcp` in place of the per-language MCP servers.
- `mcp__context7__*` cleanup in agents.

## Out of Scope

- Tuning the estimator to pass EST-11 on the objectives it is scored on. A failed prospective retest is reported as failed.
- Making the Bash edit gate `strict` by default (v1.5 measured 0.035 > 0.02). It is revisited only on a new measurement.
- DevFlow entering secrets, tokens or credentials into any system. The user supplies them (OPS-01, OPS-03).

## Traceability

| Requirement | Objective | Status |
|---|---|---|
| REL-01 | Objective 65 | Complete |
| REL-02 | Objective 65 | Complete |
| EST-09 | Objective 66 (built; coverage 6/8 = 0.75, re-measured by 75) | Pending |
| EST-10 | Objective 67 | Complete |
| TOOL-01 | Objective 68 | Complete |
| TOOL-02 | Objective 68 | Complete |
| TOOL-03 | Objective 68 | Complete |
| TOOL-04 | Objective 68 | Complete |
| TOOL-05 | Objective 68 | Complete |
| TOOL-06 | Objective 69 | Complete |
| TOOL-09 | Objective 69 | Complete |
| TOOL-10 | Objective 69 | Complete |
| TOOL-07 | Objective 70 | Complete |
| TOOL-08 | Objective 70 | Complete |
| SDR-09 | Objective 71 | Complete |
| SDR-10 | Objective 71 | Complete |
| INST-01 | Objective 72 | Complete |
| INST-02 | Objective 72 | Complete |
| INST-03 | Objective 72 | Complete |
| INST-04 | Objective 72 | Pending |
| INST-05 | Objective 72 | Complete |
| INST-06 | Objective 72 | Pending |
| HND-01 | Objective 73 | Pending |
| HND-02 | Objective 73 | Pending |
| HND-03 | Objective 73 | Pending |
| OPS-01 | Objective 74 | Pending |
| OPS-02 | Objective 74 | Pending |
| OPS-03 | Objective 74 | Pending |
| EST-11 | Objective 75 | Pending |
| TODO-01 | Objective 75 | Pending |
