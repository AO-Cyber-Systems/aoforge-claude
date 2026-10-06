# Requirements: v1.5 Gate & Plumbing

**Defined:** 2026-10-05
**Coverage:** 0/36 complete

Objective 55 (store live-smoke fixes, 55-1..55-6) shipped first in 2.13.2 and keeps its own IDs in its OBJECTIVE.md.

## v1.5 Requirements

### Edit gate (GATE): DECISION-001 option-a

- [x] **GATE-01**: A Bash command that writes to a tracked repo source file (redirection, `tee`, `sed -i`, `cp`/`mv` onto a file, inline python/node writes) is denied in ambient mode, the same as `Edit`/`Write`.
- [x] **GATE-02**: Text that only mentions a write (heredoc bodies, quoted arguments, `echo` to stdout) is never gated; detection is invocation-aware, as in gate-commits.
- [x] **GATE-03**: Writes to `.planning/`, `.md`, out-of-repo, tmp and scratchpad paths, and to untracked files, are never gated by the Bash rule.
- [x] **GATE-04**: Every existing escape lets the write through: live skill marker, `devflow:*` agent, override phrase, `DEVFLOW_SKIP_EDIT_GATE=1`, and `gates.editGate` warn/off.
- [x] **GATE-05**: `session-audit` reports the Bash-gate false-positive rate. The rule ships as default `strict` only if that rate is ≤2% of Bash calls in ambient sessions, and as `warn` otherwise.

### State and merge plumbing (PLMB)

- [x] **PLMB-01**: `state advance-job` leaves STATE.md `**Status:**` accurate; it no longer rewrites it to "ready for verification" mid-objective.
- [x] **PLMB-02**: Parallel wave merges no longer conflict on `STATE_ARCHIVE.md` or `state.json`, through a JSON-aware merge driver or documented regeneration.
- [x] **PLMB-03**: An executor's first `exec-context` preflight runs against its own worktree, because spawn prompts pass `--cwd <worktree>`.
- [x] **PLMB-04**: `milestone complete` counts only the milestone's objectives, so its stats and base MILESTONES entry are correct without hand-writing.
- [x] **PLMB-05**: `milestone complete` `state_updated` and `objective remove` `roadmap_updated` report whether a change was made, not whether the file exists.

### Objective-number correctness (ONUM)

- [x] **ONUM-01**: Every regex escape goes through `text-escape.cjs` (state x5, gh-hierarchy, planning-verbs, planning-entity-verbs, frontmatter, watcher-daemon), and a repo test fails CI on a new hand-rolled escape.
- [x] **ONUM-02**: Looking up objective `4.1` never matches `04.10-*` (`searchObjectiveInDir`).
- [x] **ONUM-03**: The ROADMAP lookups in novel-domain and trd-pre-check find single-digit objectives regardless of leading zeros.
- [x] **ONUM-04**: `verify trd-pre` reads requirement IDs only from ID-shaped tokens, never from a free-text Requirements line.

### Store-mode rough edges (STOR)

- [ ] **STOR-01**: The `gh setup` dry run shows the pinned `uses:` / `devflow-ref:` lines, and its printed steps include a PR-create command.
- [ ] **STOR-02**: Objective PR titles use the objective name, the same as issue titles, not the directory slug.
- [ ] **STOR-03**: `doctor` and `validate health` warn when a repo's checks workflow is pinned to a DevFlow ref older than the installed plugin.
- [ ] **STOR-04**: A skill can declare `requires:` (gh, docker, …) in its frontmatter; invoking it without the tool is refused with a doctor-backed remediation message.

### Observability and model ids (OBS)

- [ ] **OBS-01**: `model-profiles.json` pins current model ids (`claude-opus-5-5`, `claude-sonnet-5-5`), and doctor flags a stale pinned id.
- [x] **OBS-02**: `telemetry --scan` either works or is rejected with an error, never silently ignored.
- [ ] **OBS-03**: `transcript-export` runs automatically at SessionStart, throttled like the backup prune, with its own skip env.
- [x] **OBS-04**: The 09-03 SUMMARY is backfilled, clearing the last I001.

### Claude Code built-ins (BLTN): Phase J, devflow-claude#35

- [ ] **BLTN-01**: Every multi-step skill (micro, quick, build, debug, plan-objective, verify-work) reports progress with TaskCreate/TaskUpdate.
- [ ] **BLTN-02**: plan-objective, new-project and milestone complete present their drafts in plan mode (EnterPlanMode/ExitPlanMode).
- [ ] **BLTN-03**: Every discrete-choice prompt in skills and workflows uses AskUserQuestion; the sweep lists each prompt it converted.
- [ ] **BLTN-04**: `/devflow:todo` uses TodoWrite as its in-session store, with a durable archive (on disk, or the GitHub store) that a Stop-hook sync merges into.
- [ ] **BLTN-05**: A coexistence test shows DevFlow hooks degrade gracefully, compose output and isolate errors when a user-level hook fires on the same event.
- [ ] **BLTN-06**: `docs/built-in-integration-status.md` keeps a living inventory of Claude Code built-ins and DevFlow's adoption of each.

### Estimation engine (EST): Phase K, devflow-claude#36

- [x] **EST-01**: `df-tools calibrate` builds `~/.claude/devflow/calibration.json` from SUMMARY frontmatter, STATE_ARCHIVE metrics and model rates.
- [x] **EST-02**: `df-tools estimate task` classifies a task and returns median/P90 minutes, tokens and dollars with the sample count and a confidence label.
- [x] **EST-03**: `df-tools estimate trd|objective|milestone` composes task estimates and adds agent overhead and the gap-closure factor.
- [x] **EST-04**: plan-objective's PLANNING COMPLETE output includes an estimate table.
- [x] **EST-05**: `/devflow:build` shows a one-line estimate at start, the status line shows estimated time remaining, and wave reports show actual vs estimate.
- [x] **EST-06**: Executor SUMMARY frontmatter records `tokens_input` / `tokens_output`.
- [x] **EST-07**: A retroactive pass backfills token data for historical TRDs from transcripts, reusing the `df-tools context` parser.
- [ ] **EST-08**: Across the next 5 executed objectives after the engine ships, the median estimate is within ±30% of actual and P90 covers ≥80% of outcomes.

## Future Requirements

- Per-project calibration overlay on top of the global calibration (EST).
- `/devflow:loop` mode built on `ScheduleWakeup`, and other session built-ins from the J5 review.

## Out of Scope

| Item | Reason |
|------|--------|
| CI `ANTHROPIC` secret (32/33) | User action, not code |
| Branch protection on `main` (34) | User action, not code |
| Docs site Cloudflare Pages deploy | User action (create the project or fix the account/token secrets) |
| 28-06 Haiku replay eval, escalation re-spawn consumer | Dropped 2026-10-05: Sonnet matches Opus on subagent work |
| Handoff-watcher PTY gaps, `devflow-watch stash add` | Dropped 2026-10-05: unused |
| Codex port, visual workflow class | Proposals deleted |

## Traceability

| Requirement | Objective | Status |
|-------------|-----------|--------|
| GATE-01 | Objective 60 | Complete |
| GATE-02 | Objective 60 | Complete |
| GATE-03 | Objective 60 | Complete |
| GATE-04 | Objective 60 | Complete |
| GATE-05 | Objective 60 | Complete |
| PLMB-01 | Objective 59 | Complete |
| PLMB-02 | Objective 59 | Complete |
| PLMB-03 | Objective 59 | Complete |
| PLMB-04 | Objective 59 | Complete |
| PLMB-05 | Objective 59 | Complete |
| ONUM-01 | Objective 56 | Complete |
| ONUM-02 | Objective 56 | Complete |
| ONUM-03 | Objective 56 | Complete |
| ONUM-04 | Objective 56 | Complete |
| STOR-01 | Objective 61 | Pending |
| STOR-02 | Objective 61 | Pending |
| STOR-03 | Objective 61 | Pending |
| STOR-04 | Objective 61 | Pending |
| OBS-01 | Objective 61 | Pending |
| OBS-02 | Objective 61 | Complete |
| OBS-03 | Objective 61 | Pending |
| OBS-04 | Objective 61 | Complete |
| BLTN-01 | Objective 62 | Pending |
| BLTN-02 | Objective 62 | Pending |
| BLTN-03 | Objective 62 | Pending |
| BLTN-04 | Objective 63 | Pending |
| BLTN-05 | Objective 63 | Pending |
| BLTN-06 | Objective 63 | Pending |
| EST-01 | Objective 57 | Complete |
| EST-02 | Objective 58 | Complete |
| EST-03 | Objective 58 | Complete |
| EST-04 | Objective 58 | Complete |
| EST-05 | Objective 58 | Complete |
| EST-06 | Objective 57 | Complete |
| EST-07 | Objective 57 | Complete |
| EST-08 | Objective 64 | Pending |

---
*Last updated: 2026-10-05 at v1.5 start*
