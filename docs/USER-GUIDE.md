# DevFlow User Guide

A detailed reference for workflows, troubleshooting, and configuration. For quick-start setup, see the [README](../README.md).

---

## Table of Contents

- [Workflow Diagrams](#workflow-diagrams)
- [Command Reference](#command-reference)
- [Configuration Reference](#configuration-reference)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Recovery Quick Reference](#recovery-quick-reference)

---

## Workflow Diagrams

### Full Project Lifecycle

```
  ┌──────────────────────────────────────────────────┐
  │                   NEW PROJECT                    │
  │  /devflow:new-project                                │
  │  Questions -> Research -> Requirements -> Roadmap│
  └─────────────────────────┬────────────────────────┘
                            │
             ┌──────────────▼─────────────┐
             │      FOR EACH PHASE:       │
             │                            │
             │  ┌────────────────────┐    │
             │  │ /devflow:discuss-objective │    │  <- Lock in preferences
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /devflow:plan-objective    │    │  <- Research + Plan + Verify
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /devflow:execute-objective │    │  <- Parallel execution
             │  └──────────┬─────────┘    │
             │             │              │
             │  ┌──────────▼─────────┐    │
             │  │ /devflow:verify-work   │    │  <- Manual UAT
             │  └──────────┬─────────┘    │
             │             │              │
             │     Next Objective?────────────┘
             │             │ No
             └─────────────┼──────────────┘
                            │
            ┌───────────────▼──────────────┐
            │  /devflow:milestone audit        │
            │  /devflow:milestone complete     │
            └───────────────┬──────────────┘
                            │
                   Another milestone?
                       │          │
                      Yes         No -> Done!
                       │
               ┌───────▼──────────────┐
               │  /devflow:milestone new  │
               └──────────────────────┘
```

### Planning Agent Coordination

```
  /devflow:plan-objective N
         │
         ├── Objective Researcher (x4 parallel)
         │     ├── Stack researcher
         │     ├── Features researcher
         │     ├── Architecture researcher
         │     └── Pitfalls researcher
         │           │
         │     ┌──────▼──────┐
         │     │ RESEARCH.md │
         │     └──────┬──────┘
         │            │
         │     ┌──────▼──────┐
         │     │   Planner   │  <- Reads PROJECT.md, REQUIREMENTS.md,
         │     │             │     CONTEXT.md, RESEARCH.md
         │     └──────┬──────┘
         │            │
         │     ┌──────▼───────────┐     ┌────────┐
         │     │   Plan Checker   │────>│ PASS?  │
         │     └──────────────────┘     └───┬────┘
         │                                  │
         │                             Yes  │  No
         │                              │   │   │
         │                              │   └───┘  (loop, up to 3x)
         │                              │
         │                        ┌─────▼──────┐
         │                        │ JOB files  │
         │                        └────────────┘
         └── Done
```

### Execution Wave Coordination

```
  /devflow:execute-objective N
         │
         ├── Analyze plan dependencies
         │
         ├── Wave 1 (independent plans):
         │     ├── Executor A (fresh 200K context) -> commit
         │     └── Executor B (fresh 200K context) -> commit
         │
         ├── Wave 2 (depends on Wave 1):
         │     └── Executor C (fresh 200K context) -> commit
         │
         └── Verifier
               └── Check codebase against objective goals
                     │
                     ├── PASS -> VERIFICATION.md (success)
                     └── FAIL -> Issues logged for /devflow:verify-work
```

### Brownfield Workflow (Existing Codebase)

```
  /devflow:map-codebase
         │
         ├── Stack Mapper     -> codebase/STACK.md
         ├── Arch Mapper      -> codebase/ARCHITECTURE.md
         ├── Convention Mapper -> codebase/CONVENTIONS.md
         └── Concern Mapper   -> codebase/CONCERNS.md
                │
        ┌───────▼──────────┐
        │ /devflow:new-project │  <- Questions focus on what you're ADDING
        └──────────────────┘

  (Fully unattended instead? /devflow:adopt scaffolds the same brownfield
   project without asking anything -- see "Adopting an Existing Repo" below.)
```

---

## Command Reference

### Core Workflow

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:new-project` | Full project init: questions, research, requirements, roadmap | Start of a new project |
| `/devflow:new-project --auto @idea.md` | Automated init from document | Have a PRD or idea doc ready |
| `/devflow:discuss-objective <N>` | Capture implementation decisions before planning | Lock in preferences so research/planning don't drift |
| `/devflow:plan-objective [N]` | Research + plan + verify | Before executing an objective |
| `/devflow:execute-objective <N>` | Execute all jobs in parallel waves | After planning is complete |
| `/devflow:build <N>` | End-to-end: plan → execute → verify in one command | Confident objective, want single-command flow |
| `/devflow:verify-work [N]` | Manual UAT with auto-diagnosis | After execution completes |
| `/devflow:milestone audit` | Verify milestone met its definition of done | Before completing milestone |
| `/devflow:milestone complete` | Archive milestone, tag release | All objectives verified |
| `/devflow:milestone new [name]` | Start next version cycle | After completing a milestone |

### Navigation

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:status` | Show status and next steps | Anytime -- "where am I?" |
| `/devflow:status resume` | Restore full context from last session | Starting a new session |
| `/devflow:status pause` | Save context handoff | Stopping mid-objective |
| `/devflow:help` | Show all commands | Quick reference |

### Objective Management

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:objective add` | Append new objective to roadmap | Scope grows after initial planning |
| `/devflow:objective remove [N]` | Remove future objective and renumber | Descoping a feature |
| `/devflow:list-objective-assumptions [N]` | Preview Claude's intended approach | Before planning, to validate direction |
| `/devflow:milestone gaps` | Create objectives for audit gaps | After audit finds missing items |
| `/devflow:research-objective [N]` | Deep ecosystem research only | Complex or unfamiliar domain |

### Brownfield & Utilities

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:map-codebase` | Analyze existing codebase | Before `/devflow:new-project` on existing code |
| `/devflow:adopt [path]` | Unattended DevFlow bootstrap for an existing repo (or `[path]`) | Turn a brownfield repo into a DevFlow project without answering questions |
| `/devflow:security-audit` | OWASP Top 10 scan with confidence tagging | Before a release or after auth/crypto changes |
| `/devflow:quick` | Ad-hoc task with DevFlow guarantees | Bug fixes, small features, config changes |
| `/devflow:debug [desc]` | Systematic debugging with persistent state | When something breaks |
| `/devflow:todo add [desc]` | Capture an idea for later | Think of something during a session |
| `/devflow:todo list` | List pending todos | Review captured ideas |
| `/devflow:settings` | Configure workflow toggles and model profile | Change model, toggle agents |
| `/devflow:set-profile <profile>` | Quick profile switch | Change cost/quality tradeoff |
| `/devflow:cleanup` | Archive completed debug sessions, prune stale files | Periodic maintenance |
| `/devflow:status check [--migrate]` | Validate `.planning/` integrity and fix issues; `--migrate` upgrades the project in place (runs `df-tools upgrade`) | Planning files feel stale or corrupt, after a DevFlow update, or when `validate health` reports W040 |
| `/devflow:doctor [--fix] [--global] [path]` | Diagnose the DevFlow environment (runtime mirror, plugin cache, hooks, runtime state inside the repo, stale markers and backups, resolved decisions whose multi-line answer a pre-52 writer flattened (check 33)); read-only unless `--fix`, which applies only safe, reversible repairs | DevFlow behaves oddly, after a plugin update, or a repo shows `.planning` runtime files changing |

### Adopting an Existing Repo (`/devflow:adopt`)

`/devflow:adopt [path]` turns an existing codebase into a DevFlow project fully unattended -- it
never asks a question. The target is the current directory, or `[path]` if given.

**What it does:** maps the codebase (`map-codebase` in non-interactive mode), infers `PROJECT.md`
(What This Is, Core Value, validated requirements, `kind` + `default_work` with confidence) and
`STACK.md` from the code, scaffolds `.planning/` (config, STATE, `state.json`, an empty-current-
milestone ROADMAP), adds the versioned CLAUDE.md managed block, stamps the version, and writes
`.planning/ADOPT-REPORT.md` listing every low-confidence inference for you to review. Everything
lands as **one signed commit on a new `devflow/adopt` branch, which is never pushed**. Re-running
`/devflow:adopt` on a half-finished adopt resumes rather than duplicating.

**Routing by repo state**, decided before anything is written:
- Already a DevFlow project (`.planning/` present) -> routed to `upgrade` (see below); never
  re-scaffolded.
- Empty or greenfield repo -> reports that and points you at `/devflow:new-project`.
- Existing codebase -> the adopt pipeline described above.

**Refusal rules.** It refuses, and touches nothing, when the target is: a dirty working tree, a
repo mid-rebase/merge, a detached HEAD, or a path that isn't a git repository at all. It names the
reason and stops -- it never stashes or resets your work.

Under the hood: `df-tools adopt preflight|begin|scaffold|report` (the deterministic half) plus the
global `df-tools --cwd <dir>` flag so the CLI can target `[path]` from anywhere. Implemented in
`lib/adopt.cjs`, `lib/adopt-cli.cjs` and `lib/repo-state.cjs`.

### Upgrading a Project in Place (`df-tools upgrade`)

When DevFlow updates, projects upgrade themselves. The `upgrade-project.js` SessionStart hook checks whether the project is behind the running version, applies the safe (`auto`) migrations, and commits **exactly the files they changed** in a detached background process, so session start never waits on commit signing. It does not commit during a rebase, merge, cherry-pick or bisect, on a detached HEAD, when a changed file already had uncommitted edits, or when signing fails. In those cases the change stays applied but uncommitted, and a one-line notice appears on your next prompt. Signing is never bypassed. Set `DEVFLOW_SKIP_UPGRADE=1` to turn it off.

You can also run it by hand:

```bash
node ~/.claude/devflow/bin/df-tools.cjs upgrade --check          # what would change (the default)
node ~/.claude/devflow/bin/df-tools.cjs upgrade --apply          # apply the auto migrations
node ~/.claude/devflow/bin/df-tools.cjs upgrade --apply --only 0006 --kind plugin   # a confirm migration
node ~/.claude/devflow/bin/df-tools.cjs upgrade --global         # preview the ~/.claude upgrade
node ~/.claude/devflow/bin/df-tools.cjs upgrade --global --confirm   # adopt the managed ~/.claude/CLAUDE.md block
```

- **Migrations** live in `lib/migrations/NNNN-*.cjs`. Each one detects its own target, so they are safe to re-run: a second `--apply` does nothing. The current set:

  | Id | Migration | Safety |
  |---|---|---|
  | 0001 | Normalise `.planning/config.json` to the nested template shape | auto |
  | 0002 | Rename legacy `*-JOB.md` to `*-TRD.md` | auto |
  | 0003 | Seed `.planning/state.json` from STATE.md | auto |
  | 0004 | Backfill `OBJECTIVE.md` for NN-named objective dirs | auto |
  | 0005 | Refresh an existing CLAUDE.md DevFlow block (never adds one) | auto |
  | 0006 | Set PROJECT.md `kind` / `default_work` | confirm |
  | 0007 | Rewrite stale DevFlow command references in the CLAUDE.md DevFlow block and STATE.md | auto |
  | 0008 | Gitignore and untrack runtime state (`.planning/.progress-guard.json`, `.awareness-cache.json`, nested `**/.planning/` too); the working copies stay | auto |
  | 0009 | Convert `.planning/.gh-mapping.json` to v3 and key `.gh-sync-state.json` by objective id | auto |
  | 0010 | Gitignore and untrack the planning cache (store mode only); skips while a GitHub backfill is still pending | confirm |
  | 0011 | Backfill the planning history onto GitHub and turn store mode on, then hand off to 0010; resumable (see **Migrating an existing project**) | confirm |

  `confirm` migrations run only when you name them with `--only <id>` or pass `--apply --confirm`. `--confirm` selects every applicable confirm migration, including ones `--only` does not name; `--only <id>` alone runs just that one.
- **Stamp.** `.planning/config.json` records `devflow{version, migrations_applied, upgraded_at}`. `validate health` reports **W040** when the project is behind.
- **Backups** go outside the repo, to `~/.claude/devflow/backups/<repo>-<hash>/<timestamp>/`, before anything is written.
- **Global.** After each successful runtime mirror, `sync-runtime.js` runs the global upgrade. It moves legacy `~/.claude/skills/df-*`, `~/.claude/agents/df-*` and `~/.claude/devflow/VERSION` into a backup (it moves them, never deletes them). It also keeps a versioned `<!-- DEVFLOW:START v=… src=… -->` block in `~/.claude/CLAUDE.md` current, and never touches text outside the markers. A block refreshes only when the template version rises: version 3 adds the `/devflow:doctor` routing line (and carries the `/devflow:gh-sync` line), so an existing block picks up both at the next global upgrade. If you already have a hand-written DevFlow section, you get a notice and nothing changes until you run `upgrade --global --confirm`.
- **Backup pruning.** DevFlow installs no scheduler of its own -- pruning runs from the `upgrade-project.js` SessionStart path, throttled to once per 24 hours by a last-prune timestamp. The default policy keeps backups younger than 14 days, and always keeps the newest 5 per repo. It's configurable in `~/.claude/devflow/global-config.json`: `backups.retain_days` and `backups.keep_min`. Run it by hand (or preview it) with `node ~/.claude/devflow/bin/df-tools.cjs upgrade --prune [--dry-run]`; register a repo for pruning without a full upgrade with `upgrade --register`. Both `/devflow:adopt` and `/devflow:new-project` register the repo automatically. Skip pruning entirely with `DEVFLOW_SKIP_PRUNE=1`. If you want an OS-level schedule instead of the once-per-session throttle, add your own cron line, e.g. `0 3 * * * node ~/.claude/devflow/bin/df-tools.cjs upgrade --prune` -- this is opt-in and entirely user-owned; DevFlow never installs it for you.

### Estimation data (`df-tools tokens`, `df-tools calibrate`)

Estimates need measured history. Two commands turn the history DevFlow already keeps (SUMMARY frontmatter, STATE_ARCHIVE metrics and Claude Code transcripts) into numbers a later objective can read.

```bash
node ~/.claude/devflow/bin/df-tools.cjs tokens trd 57-03                      # token usage of one TRD (read-only)
node ~/.claude/devflow/bin/df-tools.cjs tokens stamp 57-03 --draft <path>     # add token fields to a SUMMARY draft
node ~/.claude/devflow/bin/df-tools.cjs tokens backfill                       # dry run: what could be recovered
node ~/.claude/devflow/bin/df-tools.cjs tokens backfill --write               # stamp the recoverable SUMMARYs
node ~/.claude/devflow/bin/df-tools.cjs calibrate                             # write ~/.claude/devflow/calibration.json
node ~/.claude/devflow/bin/df-tools.cjs calibrate --dry-run --raw             # report only, write nothing
```

- **`tokens`.** Reads the executor transcripts under `~/.claude/projects` (`--root` to point elsewhere, `--repo` for another repository) and sums usage once per API message, so a message split across several transcript lines is not counted twice. `tokens stamp` adds `tokens_input`, `tokens_output`, `tokens_cache_read`, `tokens_cache_write`, `token_model` and `tokens_source: "live"` to the SUMMARY draft you name. Executors run it before `summary post`, so a new SUMMARY carries token data from the start. It never writes under `.planning/` and exits 0 with `stamped: false` when no transcript is found.
- **`tokens backfill`.** Covers every SUMMARY of the checkout holding the current directory. It is a dry run unless `--write`, and `--write` goes through `summary post`, so the only change is added `tokens_*` and `token_model` frontmatter lines (`tokens_source: "backfill"`). A second `--write` writes nothing. `--force` restamps a SUMMARY that already has token values; a live stamp is otherwise left as written. Expect many SUMMARYs to stay unrecovered: Claude Code deletes old transcripts, and an older SUMMARY may carry no TRD key. The report counts them by reason (`no_transcript`, `unkeyed`) and exits 0, since unrecoverable history is the normal outcome. Exit 1 means a usage error or a failed write.
- **`calibrate`.** Builds per-task-class p50 and P90 for minutes, files, tokens and dollars, plus TRD-level figures, the checkpoint and gap-closure probabilities and the agent overhead (the planner, job-checker, verifier, objective-researcher, integration-checker and roadmapper spawns, read from the subagent transcripts), and writes them to `~/.claude/devflow/calibration.json`. The file is the artifact; stdout is one summary line (`changed`, `unchanged` or `dry run`, then TRD, task and token-sample counts and a count per class). The output is deterministic: a rerun on unchanged inputs is byte-identical and reports `unchanged`. It refuses to write, and exits 1, when no DevFlow project is found, so a mistyped path cannot overwrite a good file with zeros.
- **Where it looks and writes.** `--paths <dir[,dir]>`, else `DEVFLOW_CALIBRATE_PATHS` (separated by the platform path delimiter), else the checkout holding the current directory. `--out <file>` wins over `DEVFLOW_CALIBRATION_PATH`, which wins over the default `~/.claude/devflow/calibration.json`. `--rates <file>` replaces the bundled rates file. `--root <dir>` points the overhead scan at another Claude Code projects directory (default `~/.claude/projects`); `--no-overhead` skips the scan, and the two cannot be combined.
- **`calibration.json` top-level keys (version 2).** `samples` (`tasks`, `trds`, `with_tokens`), `task_classes` (one entry per class, plus `all`, each with `samples` and min/p50/p90/max for `minutes`, `files`, `tokens_input`, `tokens_output` and `cost_usd`), `trd_level` (the same figures per TRD), `probabilities` (`checkpoint`, `gap_closure`, each with `n` and `value`), `models` (the rate used per model), `data_as_of` and `inputs_digest` (the date and digest of the inputs, so a changed file is explained by changed inputs). Version 2 adds `agent_overhead` (one entry per agent type with `samples` and p50/P90 `minutes`, `tokens_input`, `tokens_output` and `cost_usd`), `agent_overhead_sources` (what the transcript scan saw: `scanned`, `spawns`, `matched`, `foreign`, `quick`, `unreadable`) and `objective_level` (the same figures for a whole objective, plus its `trds` and `tasks` counts, which is what an unplanned objective is estimated from). It also records `sources`, `unpriced_models`, `rates_as_of` and the classifier version. On this repository the first version 2 run read 323 TRDs, 746 tasks and 236 TRDs with token data, and measured overhead from 31 verifier, 26 planner, 22 job-checker, 11 objective-researcher, 4 integration-checker and 1 roadmapper spawns.
- **Rates.** `devflow/references/model-rates.json` holds USD per million tokens for each model id seen in transcripts. Every entry carries its own `source` and `as_of`. To update it, re-read the vendor's pricing page, edit the entry, and set `source` and `as_of` to match what you read; do not copy rates from memory. A model with no entry shows up under `unpriced_models` and its dollars are left out rather than guessed.
- **Unrecoverable history is normal.** A class with few samples has wide percentiles; `samples` says how much to trust each one.

### Estimates (`df-tools estimate`)

`estimate` turns `calibration.json` into a forecast for a task, a TRD, an objective or a milestone: median and P90 minutes, tokens and dollars, with the sample count behind them and a confidence label. Run `calibrate` first; without a usable calibration every form prints `No estimate: <reason>` (naming `df-tools calibrate`) and exits 0, never a number it cannot back.

```bash
node ~/.claude/devflow/bin/df-tools.cjs estimate task --files <a[,b]> [--tdd] [--trd-type <t>]   # or --class <name>, or --checkpoint
node ~/.claude/devflow/bin/df-tools.cjs estimate trd 58-05
node ~/.claude/devflow/bin/df-tools.cjs estimate objective 58 [--all] [--table|--line]
node ~/.claude/devflow/bin/df-tools.cjs estimate milestone [v1.5] [--table|--line]
node ~/.claude/devflow/bin/df-tools.cjs estimate start 58                  # begin a run: estimate the remaining TRDs, write the run state
node ~/.claude/devflow/bin/df-tools.cjs estimate wave 58 2 --start         # or --done
node ~/.claude/devflow/bin/df-tools.cjs estimate finish 58                 # close the run, print actual against estimate
```

Every form takes `--raw` for paste-ready text (JSON is the default) and `--calibration <file>` (else `DEVFLOW_CALIBRATION_PATH`, else `~/.claude/devflow/calibration.json`). Exit 1 means a usage error or an objective, TRD or milestone that does not exist. Output from this repository:

```
Task code_tdd: 6 min (P90 18 min) · tokens 3.6M in / 29K out · $1.35 (P90 $2.20) · n=332, confidence high
TRD 58-05: 10 min (P90 24 min) · $2.63 (P90 $4.36) · 2 tasks · confidence low
Objective 58 estimate: 2h 19m median (P90 5h 42m) wall · $32.69 (P90 $48.34) · 10 TRDs estimated in 7 waves · confidence low
```

- **Method.** The tasks of one TRD move together, so their quantiles add quantile by quantile. TRDs, waves, agent overhead and objectives combine as a correlated sum with rho 0.5. TRDs in the same wave run in parallel, so a wave takes the max of its TRDs. For a planned objective the planner and job-checker have already run (reported as `spent`, never added) and one verifier spawn is added. Gap closure is a mixture with the calibrated probability (8% across this repository's 48 objectives): with that probability one more planner, one TRD and one more verifier follow, so it lifts the P90 more than the median. An unplanned objective is estimated serially from `objective_level` plus a planner, job-checker and verifier, and gap closure is not added because that history already includes it. Every figure is rounded once, at output.
- **Confidence.** Each task is labelled by the samples behind its class: `high` at 30 or more, `medium` at 10 to 29, `low` at 1 to 9, `none` with no data. A class with fewer than 5 samples falls back to the all-task figures and is capped at `low`. A TRD, objective or milestone takes the weakest component that carries at least 10% of the median, and says which one (`weakest: ...`). An unplanned objective is never better than `low`, since it comes from history and not from a plan.
- **`objective`.** Counts only TRDs without a SUMMARY (`TRDs left`); `--all` estimates every TRD, done or not, as a backtest (`TRDs estimated`). `--table` prints the wall, agent, token and cost rows with the verifier and gap-closure terms named; `--line` prints one line. For an objective whose TRDs are all done the text forms print `all TRDs done`, so read a completed objective's backtest from the JSON. `estimate objective` needs the objective's directory; `milestone` also covers an objective that exists only in the ROADMAP and marks it `unplanned`.
- **`milestone`.** One row per objective not yet done (`partial`, `planned` or `unplanned`), a total row, and a footer naming the done and cancelled objectives, for example `v1.5 total (7 objectives left) 8h 55m median, P90 20h 03m, $226.43, confidence low` with 55-57 done and 59-64 unplanned.
- **Where estimates appear.** The planner's PLANNING COMPLETE return and plan-objective's OBJECTIVE PLANNED view carry the `objective --table` output. `/devflow:build` prints the one-line estimate in its build plan and the actual-vs-estimate line when it finishes. Execute-objective's wave reports show each wave's estimate when it starts and its actual and verdict when it ends. The status line shows time remaining while a run is live. All of these are fail-soft: a missing calibration never blocks planning or execution.
- **Run state.** `start`, `wave --start|--done` and `finish` are the only writers of the run state, one small JSON file per project, `~/.claude/devflow/state/estimates/<repo-key>.json` (override the directory with `DEVFLOW_ESTIMATE_STATE_DIR`). It is never written inside the repository. A run for another objective, a finished one, or one idle for more than 12 hours is not live: `wave --start` begins a new run, and `wave --done` and `finish` say `actual unknown (no run state)`. `wave --done` and `finish` are idempotent: a second call reprints the stored line and writes nothing. The verdict is `at or under median`, `within P90` or `over P90`.
- **Status line.** While a run is live the status line adds `⏱ 58 W7/7 ~20m left` (the objective, the current wave of the total, and the remaining median), or `⏱ 58 W7/7 over P90` once the wave has outrun its P90. Nothing is computed per render: it reads the one cached file. After `finish` the segment is gone.
- **What is assumed.** The correlation of 0.5 is an assumption, not a measurement. A first in-sample backtest of objectives 55 to 57 (the calibration already contains them, so it is optimistic) put the cost medians within 6% of actual and the minutes medians 1.5x to 2.8x above it, and every actual fell under its P90. Objective 64 tests the method out of sample.

### Parallel wave merges (`df-tools merge-driver`)

Executors in one wave each write `.planning/state.json` and `.planning/STATE_ARCHIVE.md` on their own branch, so the merges back would conflict on both. `/devflow:execute-objective` installs a merge driver once per run, before the first parallel wave's worktrees, so they merge without a conflict.

```bash
node ~/.claude/devflow/bin/df-tools.cjs merge-driver install            # run from the MAIN checkout
node ~/.claude/devflow/bin/df-tools.cjs merge-driver install --check    # writes nothing; true or false
node ~/.claude/devflow/bin/df-tools.cjs merge-driver uninstall          # the undo
```

- **Where it runs.** Install from the main checkout, where wave merges run, and never inside an executor worktree. The registration is per clone: a block in the common `info/attributes` plus a `merge.devflow-state-json` section in the repo's git config. Nothing is committed, so a fresh clone has no driver until `install` runs there. `install` is idempotent, `uninstall` is idempotent and removes only that block and section, and `install --check` reports `installed: false` afterwards.
- **What each file does on merge.** `state.json` is merged as JSON. `decisions`, `blockers` and `session_log` keep both sides' additions (ours first, then theirs) and drop an entry one side removed, `metrics` counters sum both deltas (two parallel `+1` jobs make `+2`), a number changed on both sides takes the larger, an ISO date the later, and any other key changed on both sides keeps ours with a note. `STATE_ARCHIVE.md` merges by union, so both sides' new rows are kept. STATE.md, ROADMAP.md and REQUIREMENTS.md still conflict; the wave merge takes ours for those and regenerates them afterwards with `state advance-job --objective N`, `state update-progress` and `roadmap update-job-progress N`, in one commit.
- **Fail-safe.** The recorded driver is a shell wrapper that runs df-tools only if the binary exists and otherwise falls back to `git merge-file`. A missing binary therefore gives an ordinary text conflict with markers, never an aborted merge. The wrapper points at the main checkout's `plugins/devflow/devflow/bin/df-tools.cjs` or at the `~/.claude/devflow` mirror's, depending on which copy ran `install`, and never at a worktree copy that a later `git worktree remove` would strand. After a plugin update, the next run of `execute-objective` re-points the driver at the mirror (`changed: true` once).
- **If a merge stops anyway** (the driver was not installed, or the runtime predates it): `node ~/.claude/devflow/bin/df-tools.cjs merge-driver resolve .planning/state.json` (or `.planning/STATE_ARCHIVE.md`) resolves the stopped file from the index stages by the same rules and stages the result, then finish the merge with `git commit --no-edit`. It refuses any other path.
- **Position after a wave.** `state advance-job --objective N` reads objective N's TRDs and SUMMARYs from disk and writes `Executing objective N — D/T TRDs complete` (`ready for verification` only when D equals T), so it is the same answer however the merges went and is safe to run again. Without `--objective`, a project with no usable position (state.json at 0/0, or no counters) writes nothing and reports `reason: no_position`.
- **The executor's checkout.** The dispatch names each executor's `CHECKOUT`. Every Bash call starts in the session's directory, not the worktree, so the preflight is `df-tools --cwd <CHECKOUT> exec-context check --repo <REPO_ROOT> --base <WAVE_BASE> --id <plan_id>`, and `exec-context worktree` prints that command as `preflight`. A check that runs elsewhere while a worktree exists for `--id` fails `WRONG CHECKOUT`, takes no claim and prints the `--cwd` command to run.
- **`milestone complete`.** It counts, lists and archives only the objectives the milestone's ROADMAP bullet names, and reports `objective_numbers`, `cancelled` (in-range objectives whose OBJECTIVE.md says `status: cancelled`), `absent` (numbers in the bullet's range with neither a directory nor a ROADMAP section) and `scope_source` (`milestone bullet`, `roadmap sections` or `objective directories`). `state_updated` is true only when STATE.md changed, and `objective remove` and `objective complete` report `roadmap_updated` the same way, so a repeated `objective complete` reports `false`.

### Telemetry (`df-tools telemetry`)

One local view of where DevFlow is being blocked and what needs attention. Nothing leaves your machine.

```bash
node ~/.claude/devflow/bin/df-tools.cjs telemetry                                    # planning state, overrides and advisories
node ~/.claude/devflow/bin/df-tools.cjs telemetry --scan                             # plus a fresh audit of your session transcripts
node ~/.claude/devflow/bin/df-tools.cjs telemetry --scan --limit 20 --since 2026-09-01 --root <projects dir>
```

- **`--scan`.** Reads Claude Code session transcripts (by default the newest 150 under `~/.claude/projects`; `--limit 0` reads all of them) and fills the `blocks` object: the total number of blocking events, how many are DevFlow-owned, the share of sessions with a block and the top categories. A `scan` object records the `root`, `limit`, `since` and `files_scanned` that were used, and the advisories gain a line about the blocks. It reads transcripts, not `.planning/`, so it works outside a DevFlow project too. With `--raw` the output is text and starts with `scan: <n> transcripts, <n> blocks (<n> DevFlow-owned)`; without it, JSON.
- **Flags that need `--scan`.** `--limit`, `--since YYYY-MM-DD` and `--root` only mean something to the scan, so without it they exit 1 with `--limit, --since and --root need --scan`. Every other unknown flag exits 1 as well (`unknown flag: --scna`). Before objective 61, `telemetry` silently ignored `--scan` and every other flag, so a typo looked like a clean result.
- **Needs an installed plugin carrying objective 61.** An older one ignores the flags.

#### Automatic transcript export

Claude Code deletes old transcripts, and `df-tools transcript-export` keeps a compact one-row-per-session index so longitudinal measurement survives. You no longer have to remember to run it. The `upgrade-project.js` SessionStart hook starts it as a detached background process at most once every 24 hours, in every session, whether or not the directory is a DevFlow project:

- **What it runs.** `df-tools transcript-export --root ~/.claude/projects --out ~/.claude/devflow/transcript-index.jsonl`, using the bundled df-tools. It never passes `--full`, so it never makes a raw copy of the transcripts; run the command by hand with `--full <dir>` when you want one.
- **The 24-hour stamp.** `~/.claude/devflow/state/transcript-export/last-run.json` holds `{ "last_run_at": <time> }`. The hook writes it before it starts the export, so two sessions that start together run one export. A run younger than 24 hours is skipped, and so is a machine with no `~/.claude/projects`.
- **Never in your way.** The first run on a large transcript history is slow, which is why it is a background child and not part of session start. Session start prints nothing for it, and a failure to start it is one `[devflow] transcript export skipped: <reason>` line on stderr.
- **Escape.** `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1` in the environment Claude Code is launched from turns it off. It is independent of `DEVFLOW_SKIP_UPGRADE=1` and `DEVFLOW_SKIP_PRUNE=1`.
- **Needs an installed plugin carrying objective 61.**

### Integration & Release (1.28+)

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/devflow:gh-sync [migrate\|status\|flush\|pull\|setup\|release <tag>\|<objective>\|--all]` | Operate the GitHub store: migrate a project onto it, status, flush the outbox, rebuild the cache, set the repository up, release notes. With the store off, mirror objectives to issues | To move a project onto GitHub, or when GitHub drifts |
| `/devflow:workstreams [analyze\|provision\|reconcile]` | Parallel git worktrees for independent objectives | Multi-objective parallelism across worktrees |
| `df-tools stack init\|validate\|resolve\|context\|command` | Declare and check the project stack profile (`.planning/STACK.md`) | After map-codebase, or when CI commands change |

---

## Configuration Reference

DevFlow stores project settings in `.planning/config.json`. Configure during `/devflow:new-project` or update later with `/devflow:settings`.

### Full config.json Schema

```json
{
  "mode": "yolo",
  "depth": "standard",
  "model_profile": "balanced",
  "workflow": {
    "research": true,
    "job_check": true,
    "verifier": true,
    "auto_advance": true
  },
  "planning": {
    "commit_docs": true,
    "search_gitignored": false
  },
  "parallelization": {
    "enabled": true,
    "job_level": true,
    "task_level": false,
    "skip_checkpoints": true,
    "max_concurrent_agents": 3,
    "min_jobs_for_parallel": 2
  },
  "gates": {
    "require_verification": true,
    "require_tests": true,
    "confirm_project": true,
    "confirm_objectives": true,
    "confirm_roadmap": true,
    "confirm_breakdown": true,
    "confirm_job": true,
    "execute_next_job": true,
    "issues_review": true,
    "confirm_transition": true
  },
  "safety": {
    "always_confirm_destructive": true,
    "always_confirm_external_services": true
  },
  "workstreams": {
    "worktree_prefix": "../{project}-ws-",
    "branch_prefix": "df/ws-",
    "merge_strategy": "squash"
  },
  "github": {
    "enabled": false,
    "repo": "",
    "milestone_prefix": "v",
    "labels": {
      "objective": "devflow:objective",
      "in_progress": "devflow:in-progress",
      "gaps": "devflow:gaps"
    }
  }
}
```

### Core Settings

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `mode` | `interactive`, `yolo` | `yolo` | `yolo` auto-approves; `interactive` confirms at every gate |
| `depth` | `quick`, `standard`, `comprehensive` | `standard` | Planning thoroughness: 3-5, 5-8, or 8-12 objectives |
| `model_profile` | `quality`, `balanced`, `budget` | `balanced` | Model tier for each agent (see table below) |

### Planning Settings

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `planning.commit_docs` | `true`, `false` | `true` | Whether `.planning/` files are committed to git |
| `planning.search_gitignored` | `true`, `false` | `false` | Add `--no-ignore` to broad searches to include `.planning/` |

> **Note:** If `.planning/` is in `.gitignore`, `commit_docs` is automatically `false` regardless of the config value.

### Workflow Toggles

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `workflow.research` | `true`, `false` | `true` | Domain investigation before planning |
| `workflow.job_check` | `true`, `false` | `true` | Plan verification loop (up to 3 iterations) |
| `workflow.verifier` | `true`, `false` | `true` | Post-execution verification against objective goals |

Disable these to speed up objectives in familiar domains or when conserving tokens.

### Parallelization

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `parallelization.enabled` | `true`, `false` | `true` | Master switch for wave-based parallelism |
| `parallelization.job_level` | `true`, `false` | `true` | Run independent jobs concurrently in fresh contexts |
| `parallelization.task_level` | `true`, `false` | `false` | Split a single job's tasks across subagents (advanced) |
| `parallelization.skip_checkpoints` | `true`, `false` | `true` | Skip user confirmation between parallel waves |
| `parallelization.max_concurrent_agents` | integer | `3` | Cap on simultaneous subagents |
| `parallelization.min_jobs_for_parallel` | integer | `2` | Minimum independent jobs needed before parallelism kicks in |

### Gates

Fine-grained approval gates for interactive mode. Each defaults to `true`. Set to `false` to skip the corresponding confirmation.

| Gate | What it Confirms |
|---|---|
| `gates.require_verification` | Verifier must run before marking objective done |
| `gates.require_tests` | Plans must include test tasks |
| `gates.confirm_project` | PROJECT.md approval |
| `gates.confirm_objectives` | Objective list approval |
| `gates.confirm_roadmap` | Full ROADMAP.md approval |
| `gates.confirm_breakdown` | Task breakdown within a job |
| `gates.confirm_job` | JOB.md approval |
| `gates.execute_next_job` | Between-job confirmations |
| `gates.issues_review` | Pause on verification gaps before replan |
| `gates.confirm_transition` | Cross-objective transitions |

### Safety

| Setting | Default | What it Controls |
|---|---|---|
| `safety.always_confirm_destructive` | `true` | Confirm before `rm -rf`, `git reset --hard`, `DROP TABLE`, etc. |
| `safety.always_confirm_external_services` | `true` | Confirm before sending emails, posting to Slack, pushing to remotes |

### Workstreams

Parallel git worktrees for working on multiple objectives simultaneously. See `/devflow:workstreams`.

| Setting | Default | What it Controls |
|---|---|---|
| `workstreams.worktree_prefix` | `"../{project}-ws-"` | Path template for provisioned worktrees |
| `workstreams.branch_prefix` | `"df/ws-"` | Branch name prefix for worktream branches |
| `workstreams.merge_strategy` | `"squash"` | `squash`, `merge`, or `rebase` on reconcile |

### GitHub Integration (1.29+)

Opt-in. With `github.store: true` GitHub is the system of record; with it off, DevFlow mirrors planning state to GitHub issues and releases. See the **GitHub integration** section below for both modes and the migration.

| Setting | Default | What it Controls |
|---|---|---|
| `github.enabled` | `false` | Master switch |
| `github.repo` | `""` | Target repo as `"owner/name"` |
| `github.milestone_prefix` | `"v"` | Prepended to roadmap version for milestone title |
| `github.labels.objective` | `"devflow:objective"` | Label applied to synced issues |
| `github.labels.in_progress` | `"devflow:in-progress"` | Label during execution |
| `github.labels.gaps` | `"devflow:gaps"` | Label when verifier finds gaps |
| `github.project_cache_ttl_minutes` | `360` | How long discovered Project v2 fields and options are cached (under `~/.claude/devflow/state/gh-project/`, override `DEVFLOW_GH_CACHE_DIR`) |
| `github.store` | `false` | Store mode, where GitHub is the system of record (strict boolean: only `true` turns it on). On an existing project let migration 0011 set it. See **GitHub is the system of record (store mode)** below |
| `github.labels.trd` / `github.labels.decision` | `"devflow:trd"` / `"devflow:decision"` | Labels for TRD and Decision issues; also how a repository without issue types tells them apart |
| `github.wiki.remote` | `""` | Wiki remote override; empty means `https://github.com/<repo>.wiki.git` (env override `DEVFLOW_WIKI_REMOTE`) |
| `github.pr.merge_method` | `"squash"` | How `gh pr merge` merges the objective PR: `squash`, `merge` or `rebase`. A merge queue ignores it |
| `github.app_login` | `""` | Login of the DevFlow GitHub App; a scope comment it wrote counts as accepted (store mode) |
| `github.app_id` | `""` | Numeric id of the DevFlow GitHub App. When set, `gh setup` pins the two required checks to that App (`integration_id`); leave empty to accept the checks from any source. See **Enforcement and setup** |
| `github.checks_workflow` | `""` | `owner/repo/.github/workflows/devflow-checks.yml@ref` that the managed caller workflow runs. Empty means `AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml@v<installed version>`. The caller's `devflow-ref:` input follows the same `@ref` |

### Git Branching

| Setting | Options | Default | What it Controls |
|---------|---------|---------|------------------|
| `git.branching_strategy` | `none`, `objective`, `milestone` | `none` | When and how branches are created |
| `git.objective_branch_template` | Template string | `df/objective-{objective}-{slug}` | Branch name for objective strategy |
| `git.milestone_branch_template` | Template string | `df/{milestone}-{slug}` | Branch name for milestone strategy |

**Branching strategies explained:**

| Strategy | Creates Branch | Scope | Best For |
|----------|---------------|-------|----------|
| `none` | Never | N/A | Solo development, simple projects |
| `objective` | At each `execute-objective` | One objective per branch | Code review per objective, granular rollback |
| `milestone` | At first `execute-objective` | All objectives share one branch | Release branches, PR per version |

`git.branching_strategy` is deprecated. In store mode (`github.store: true`) it no longer applies: each objective gets one linked branch and one pull request (see **One branch and one pull request per objective** under **GitHub is the system of record (store mode)**), and `init` reports a configured strategy as `branching_strategy_ignored`. In local mode it behaves as above and `init` prints a deprecation notice for `objective` and `milestone`.

**Template variables:** `{objective}` = zero-padded number (e.g., "03"), `{slug}` = lowercase hyphenated name, `{milestone}` = version (e.g., "v1.0").

### Model Profiles (Per-Agent Breakdown)

| Agent | `quality` | `balanced` | `budget` |
|-------|-----------|------------|----------|
| df-planner | Opus | Opus | Sonnet |
| df-roadmapper | Opus | Sonnet | Sonnet |
| df-executor | Opus | Sonnet | Sonnet |
| df-objective-researcher | Opus | Sonnet | Haiku |
| df-project-researcher | Opus | Sonnet | Haiku |
| df-research-synthesizer | Sonnet | Sonnet | Haiku |
| df-debugger | Opus | Sonnet | Sonnet |
| df-codebase-mapper | Sonnet | Haiku | Haiku |
| df-verifier | Sonnet | Sonnet | Haiku |
| df-job-checker | Sonnet | Sonnet | Haiku |
| df-integration-checker | Sonnet | Sonnet | Haiku |
| df-security-auditor | Opus | Sonnet | Sonnet |

**Profile philosophy:**
- **quality** -- Opus for all decision-making agents, Sonnet for read-only verification. Use when quota is available and the work is critical.
- **balanced** -- Opus only for planning (where architecture decisions happen), Sonnet for everything else. The default for good reason.
- **budget** -- Sonnet for anything that writes code, Haiku for research and verification. Use for high-volume work or less critical objectives.

**Model ids (W063).** The table above names tiers (Opus, Sonnet, Haiku). The concrete model id each tier resolves to is pinned in `plugins/devflow/devflow/references/model-profiles.json` (`df-tools resolve-model <agent>` prints it), and a stale id resolves to a model that never runs. Whether an id is current is read from `references/model-rates.json`, the price table, not from a list kept in the checker: an id is **superseded** when a newer version of the same family is priced there, and **unpriced** when it is not in the table at all (aliases never count as newer). `validate health` (Check 18) reports either as W063, never repaired, and `/devflow:doctor` check 13 appends the same finding to its model-profiles report, for example `models.opus = <id> is superseded by <current> (model-rates.json)`. The fix is to update `models` in `model-profiles.json` and release. A repository test fails CI on the day `model-rates.json` gains a newer model while the pins stay put, so the pins cannot drift unnoticed. This needs an installed plugin carrying objective 61.

---

## Usage Examples

### New Project (Full Cycle)

```bash
claude --dangerously-skip-permissions
/devflow:new-project            # Answer questions, configure, approve roadmap
/clear
/devflow:discuss-objective 1        # Lock in your preferences
/devflow:plan-objective 1           # Research + plan + verify
/devflow:execute-objective 1        # Parallel execution
/devflow:verify-work 1          # Manual UAT
/clear
/devflow:discuss-objective 2        # Repeat for each objective
...
/devflow:milestone audit        # Check everything shipped
/devflow:milestone complete     # Archive, tag, done
```

### New Project from Existing Document

```bash
/devflow:new-project --auto @prd.md   # Auto-runs research/requirements/roadmap from your doc
/clear
/devflow:discuss-objective 1               # Normal flow from here
```

### Existing Codebase

```bash
/devflow:adopt                  # Unattended: maps, infers PROJECT.md/STACK.md, scaffolds, commits
# (normal objective workflow from here -- or, for a manual walkthrough instead:)
/devflow:map-codebase           # Analyze what exists (parallel agents)
/devflow:new-project            # Questions focus on what you're ADDING
```

### Quick Bug Fix

```bash
/devflow:quick
> "Fix the login button not responding on mobile Safari"
```

### Resuming After a Break

```bash
/devflow:status                 # See where you left off and what's next
# or
/devflow:status resume          # Full context restoration from last session
```

### Preparing for Release

```bash
/devflow:milestone audit        # Check requirements coverage, detect stubs
/devflow:milestone gaps         # If audit found gaps, create objectives to close them
/devflow:milestone complete     # Archive, tag, done
```

### Speed vs Quality Presets

| Scenario | Mode | Depth | Profile | Research | Plan Check | Verifier |
|----------|------|-------|---------|----------|------------|----------|
| Prototyping | `yolo` | `quick` | `budget` | off | off | off |
| Normal dev | `interactive` | `standard` | `balanced` | on | on | on |
| Production | `interactive` | `comprehensive` | `quality` | on | on | on |

### Mid-Milestone Scope Changes

```bash
/devflow:objective add              # Append a new objective to the roadmap
# or
/devflow:objective remove 7         # Descope objective 7 and renumber
```

---

## Troubleshooting

### "Project already initialized"

You ran `/devflow:new-project` but `.planning/PROJECT.md` already exists. This is a safety check. If you want to start over, delete the `.planning/` directory first.

### Context Degradation During Long Sessions

Clear your context window between major commands: `/clear` in Claude Code. DevFlow is designed around fresh contexts -- every subagent gets a clean 200K window. If quality is dropping in the main session, clear and use `/devflow:status resume` or `/devflow:status` to restore state.

### Plans Seem Wrong or Misaligned

Run `/devflow:discuss-objective [N]` before planning. Most plan quality issues come from Claude making assumptions that `CONTEXT.md` would have prevented. You can also run `/devflow:list-objective-assumptions [N]` to see what Claude intends to do before committing to a plan.

### Execution Fails or Produces Stubs

Check that the plan was not too ambitious. Plans should have 2-3 tasks maximum. If tasks are too large, they exceed what a single context window can produce reliably. Re-plan with smaller scope.

### Lost Track of Where You Are

Run `/devflow:status`. It reads all state files and tells you exactly where you are and what to do next.

### Need to Change Something After Execution

Do not re-run `/devflow:execute-objective`. Use `/devflow:quick` for targeted fixes, or `/devflow:verify-work` to systematically identify and fix issues through UAT.

### Model Costs Too High

Switch to budget profile: `/devflow:set-profile budget`. Disable research and plan-check agents via `/devflow:settings` if the domain is familiar to you (or to Claude).

### Working on a Sensitive/Private Project

Set `commit_docs: false` during `/devflow:new-project` or via `/devflow:settings`. Add `.planning/` to your `.gitignore`. Planning artifacts stay local and never touch git.

### Updating DevFlow

DevFlow updates through the Claude Code plugin marketplace (`/plugin`), and `/devflow:status check --migrate` brings a project forward.

### Subagent Appears to Fail but Work Was Done

A known workaround exists for a Claude Code classification bug. DevFlow's orchestrators (execute-objective, quick) spot-check actual output before reporting failure. If you see a failure message but commits were made, check `git log` -- the work may have succeeded.

---

## Recovery Quick Reference

| Problem | Solution |
|---------|----------|
| Lost context / new session | `/devflow:status resume` or `/devflow:status` |
| Phase went wrong | `git revert` the objective commits, then re-plan |
| Need to change scope | `/devflow:objective add` or `/devflow:objective remove` |
| Milestone audit found gaps | `/devflow:milestone gaps` |
| Something broke | `/devflow:debug "description"` |
| DevFlow itself misbehaves, or runtime files keep dirtying a repo | `/devflow:doctor` (add `--fix` to apply the safe repairs) |
| GitHub backfill stopped part-way | Run `df-tools upgrade --apply --only 0011 --confirm` again (see **GitHub integration** > **Troubleshooting**) |
| Quick targeted fix | `/devflow:quick` |
| Plan doesn't match your vision | `/devflow:discuss-objective [N]` then re-plan |
| Costs running high | `/devflow:set-profile budget` and `/devflow:settings` to toggle agents off |

---

## Project File Structure

For reference, here is what DevFlow creates in your project:

```
.planning/
  PROJECT.md              # Project vision and context (always loaded)
  REQUIREMENTS.md         # Scoped v1/v2 requirements with IDs
  ROADMAP.md              # Objective breakdown with status tracking
  STATE.md                # Decisions, blockers, session memory
  config.json             # Workflow configuration
  MILESTONES.md           # Completed milestone archive
  research/               # Domain research from /devflow:new-project
  todos/
    pending/              # Captured ideas awaiting work
    done/                 # Completed todos
  debug/                  # Active debug sessions
    resolved/             # Archived debug sessions
  codebase/               # Brownfield codebase mapping (from /devflow:map-codebase)
  objectives/
    XX-objective-name/
      XX-YY-JOB.md       # Atomic execution plans
      XX-YY-SUMMARY.md    # Execution outcomes and decisions
      CONTEXT.md          # Your implementation preferences
      RESEARCH.md         # Ecosystem research findings
      VERIFICATION.md     # Post-execution verification results
```

In store mode (`github.store: true`) GitHub holds these files. Git tracks only `config.json` and `STACK.md`; the rest of `.planning/` is a cache that `gh pull --all` rebuilds, plus runtime files and the wiki clone in `.planning/wiki/`. See **GitHub integration**.

---

## Hooks and what they enforce

DevFlow installs hooks into Claude Code's `settings.json`. Hooks run in a separate process, get the tool call as JSON on stdin, and can inject context, warn the user, or block tool execution. They are how DevFlow turns advisory rules into actually-enforced ones.

| Hook | Event | What it does | Escape hatch |
|---|---|---|---|
| `route-intent.js` | UserPromptSubmit | Detects DevFlow projects (`.planning/`) and matches user intent against 13 categories (build, plan, verify, debug, gh-sync, ...). Injects a system reminder telling Claude to use the appropriate skill rather than editing code directly. | None — silent for non-DevFlow repos and explicit `/devflow:` invocations |
| `gate-commits.js` | PreToolUse (Bash) | Blocks raw `git commit` in DevFlow projects; demands `df-tools commit` so atomic per-task commits and STATE.md stay consistent. Merge, rebase and cherry-pick completions are allowed automatically. | Inline `DEVFLOW_ALLOW_RAW_COMMIT=1 git commit …`, or `DEVFLOW_ALLOW_RAW_COMMIT=1` exported before launching Claude Code (see below) |
| `gate-edits.js` | PreToolUse (Edit/Write/MultiEdit) | **Strict DENY by default** in ambient mode. Allows edits when `.planning/.skill-active` marker exists (executor writes this), the editing agent is a DevFlow agent (`agent_type` `devflow:<name>`), user prompt contains an override phrase (`skip devflow`, `just edit`, `bypass devflow`, `force edit`), or env var is set. Always permits `.planning/**` and `*.md` paths. (Prior `DEVFLOW_STRICT_EDITS=1` behavior is now the default.) | `DEVFLOW_SKIP_EDIT_GATE=1` in the environment Claude Code was launched from disables the gate entirely (see [Bash writes and the edit gate](#bash-writes-and-the-edit-gate)) |
| `gate-bash-writes.js` | PreToolUse (Bash) | Applies the Edit gate to Bash. In ambient mode, denies (`strict`) or asks (`warn`, the shipped default) when a command writes a tracked source file: a redirect, `tee`, `sed -i`, `perl -i`, `cp`/`mv` or inline python/node. Mentions, `.planning/`, `*.md`, untracked files and paths outside the project are never gated. Same escapes as `gate-edits.js`. Needs an installed plugin carrying objective 60. See [Bash writes and the edit gate](#bash-writes-and-the-edit-gate). | `DEVFLOW_SKIP_EDIT_GATE=1` in the environment Claude Code was launched from (not as an inline prefix), `gates.bashEditGate: off` |
| `changelog-on-tag.js` | PreToolUse (Bash) | Blocks `git tag -a vX.Y.Z` if `CHANGELOG.md` has no `## [X.Y.Z]` heading. Tells you to run `df-tools changelog update --version vX.Y.Z` first. | `DEVFLOW_SKIP_CHANGELOG_GATE=1` |
| `verify-completion.js` | Stop | Checks the most-recent SUMMARY.md has Task Evidence and no `Self-Check: FAILED` markers. Warns only — does not block. | n/a (warning only) |
| `verify-commits.js` | SubagentStop | Warns when a subagent finishes without producing any commits in the last 10 min — silent-failure detector for the executor. | n/a (warning only) |
| `gate-executor-stop.js` | SubagentStop | Blocks a `devflow:executor` once when it stops naturally and its TRD has no SUMMARY.md yet, telling it to finish or write the `## Progress` checkpoint. Never blocks twice in a row; fails open. | `DEVFLOW_SKIP_EXECUTOR_STOP_GATE=1` |
| `gate-skill-requires.js` | UserPromptExpansion, PreToolUse (Skill) | Refuses to start a `/devflow:<skill>` whose `SKILL.md` declares `requires:` a tool that is not on PATH (today `/devflow:gh-sync`, which needs `gh`). A typed command is blocked and a Skill tool call is denied, each with the install hint and a pointer to `/devflow:doctor`. Fails open. Needs an installed plugin carrying objective 61. See [Skills that need a tool](#skills-that-need-a-tool-requires). | `DEVFLOW_SKIP_SKILL_REQUIRES=1` in the environment Claude Code was launched from |
| `auto-continue.js` | Stop | While a DevFlow skill is active and nothing runs in the background, blocks once when Claude ends its turn right after announcing its own next step ("Writing the predicate.") instead of taking it. Questions and `/devflow:` hand-offs never trigger it. | `DEVFLOW_SKIP_AUTOCONTINUE=1` |
| `check-update.js` | SessionStart | Background npm registry check for newer DevFlow versions. | n/a |
| `upgrade-project.js` | SessionStart | Upgrades a behind DevFlow project in place: applies the `auto` migrations with the bundled df-tools, then commits exactly the changed files in a detached background process. It does not commit during a rebase, merge, cherry-pick or bisect, on a detached HEAD, over uncommitted edits (the runtime-state files migration 0008 untracks don't count), or if signing fails. Also runs the throttled backup prune (once per 24h; see [Upgrading a Project in Place](#upgrading-a-project-in-place-df-tools-upgrade)) as the first step, DevFlow project or not, then starts a detached background transcript export at most once per 24h (see [Automatic transcript export](#automatic-transcript-export)). Notices are emitted once, on the next prompt, by `route-results.js`. | `DEVFLOW_SKIP_UPGRADE=1` (upgrade only), `DEVFLOW_SKIP_PRUNE=1` (prune only), `DEVFLOW_SKIP_TRANSCRIPT_EXPORT=1` (export only) |
| `statusline.js` | StatusLine | Renders model, current task, context usage, update indicator and, while an objective builds, estimated time remaining (`⏱ 58 W7/7 ~20m left`) from the estimate run state. | n/a |

### Bash writes and the edit gate

`gate-edits.js` stops an Edit or Write of tracked source in ambient mode (a DevFlow project with no skill active). A Bash `sed -i`, `cat > file <<'EOF'` or `python3 -c "open(...,'w')"` used to do the same job unchecked. `gate-bash-writes.js` closes that gap (DECISION-001): the same rule, applied to the file a Bash command writes. It is a routing nudge, not a sandbox, and it ships with the next release: the installed plugin must carry objective 60, and an older plugin has no such hook.

**What it gates.** A command that writes a file git tracks, through:

- a redirect (`>`, `>>`, `>|`, with or without a file descriptor), including the redirect on a heredoc opener (`cat > f <<'EOF'`)
- `tee`, `sed -i`, `perl -i` (and `perl -pi -e`), and the destination of `cp` and `mv` (into a directory it is judged on `<dir>/<name of the source>`)
- inline interpreter code: python `open(path, 'w'|'a'|'x'|'+')`, `Path(...).write_text` and `write_bytes`, and node `writeFileSync`, `appendFileSync`, `writeFile`, `appendFile` and `createWriteStream`, whether given with `-c`/`-e` or as a heredoc on the interpreter's stdin
- the same commands behind `env`, `command`, `sudo`, `nohup`, `time`, leading `NAME=value` words, or `bash|sh|zsh|dash -c '...'` (to depth 3)

A relative target is resolved against the session's working directory, following `cd`, `pushd` and `popd` within the command.

**What it never gates.**

- A command that only mentions a write: a heredoc body, a quoted argument, a comment (`grep -n "> src/a.js" README.md`, `echo "x > y"`).
- Anything under `.planning/`, and any `*.md` file.
- A file git does not track (untracked or ignored). Git is asked once per command, and only when a candidate inside the project exists.
- A path outside the project: `/tmp`, the session scratchpad, another repository.
- A target that cannot be resolved statically (`$VAR`, backticks, `cd -`, an unknown working directory).
- A directory with no `.planning/` above it (not a DevFlow project).

**Escapes.** They are the Edit gate's own, because the hook calls the same functions:

- a live `.planning/.skill-active` marker, in this project's `.planning/` or the main checkout's
- a `devflow:*` agent
- an override phrase in your prompt (`skip devflow`, `just edit`, `bypass devflow`, `force edit`). It is a one-shot marker, and the Bash hook consumes it only when a write would otherwise be gated, so an `ls` never spends it
- `gates.editGate: off` or `gates.bashEditGate: off` in `.planning/config.json`
- `DEVFLOW_SKIP_EDIT_GATE=1`, **only in the environment Claude Code was launched from**:

```bash
# In YOUR terminal, before starting Claude Code
export DEVFLOW_SKIP_EDIT_GATE=1
claude
```

A hook runs in Claude Code's own process, so it never sees a variable set inside the Bash command. `DEVFLOW_SKIP_EDIT_GATE=1 sed -i ...` typed as a prefix does not bypass the gate, and neither does an `export` run by the agent. (`gate-commits.js` differs: it reads an inline `DEVFLOW_ALLOW_RAW_COMMIT=1` prefix out of the command text. The edit gates do not.)

**Severity.** The effective rule is the least severe of `gates.editGate` and `gates.bashEditGate` (`off` < `warn` < `strict`). `strict` denies, `warn` asks you to approve, `off` allows. `gates.editGate` defaults to `strict` and an unknown value counts as `strict`. An unset or invalid `gates.bashEditGate` takes the default below.

| `gates.editGate` | `gates.bashEditGate` | Bash write to a tracked file |
|---|---|---|
| `strict` (default) | unset | `ask` (the shipped default, `warn`) |
| `strict` | `strict` | deny |
| `strict` | `warn` | ask |
| `strict` | `off` | allowed |
| `warn` | `strict` | ask |
| `warn` | `warn` | ask |
| `warn` | `off` | allowed |
| `off` | any | allowed |

To opt in to denying, set `"gates": { "bashEditGate": "strict" }` in `.planning/config.json`.

**The default and how it was decided.** The shipped default is `warn`, the constant `BASH_EDIT_GATE_DEFAULT` in `plugins/devflow/devflow/bin/lib/bash-write-gate.cjs`. The rule is code, not judgment: `strict` is recommended only when the false-positive rate is at most 2% (`FP_THRESHOLD = 0.02`, `recommendDefault`), otherwise `warn`. The rate was measured on 2026-10-06 by replaying the hook's own decision over every retained Claude Code transcript (`df-tools session-audit --limit 0`), with git history at each call's timestamp deciding whether a file was tracked:

| Quantity | Value |
|---|---|
| Transcript files / sessions | 2,263 / 2,258 |
| Bash calls | 138,304 |
| Excluded (devflow agent / devflow skill / not a DevFlow project) | 81,522 / 29,162 / 9,663 |
| Ambient Bash calls (the denominator) | 17,957 |
| Would-deny | 633 (python 489, cp 54, redirect 41, sed-i 32, perl-i 14, mv 3, tee 0, node 0) |
| False-positive rate | 633 / 17,957 = **0.035251** |
| Threshold | 0.02 |
| Recommended and shipped default | `warn` |

The rate is an upper bound: every would-deny counts as a false positive, even where the write is exactly what the rule is meant to stop, so the true rate is lower. The detector needed no fix (`detector_fixes` is empty). The numbers live in `plugins/devflow/devflow/references/bash-edit-gate-evidence.json`, and a test fails CI when that file, the constant and `recommendDefault` disagree.

**Re-measure.** Run `node ~/.claude/devflow/bin/df-tools.cjs session-audit --limit 0`. The `bash_edit_gate` key of the JSON carries the counts, and `--raw` prints it as the last line:

```
bash_edit_gate: ambient_bash_calls 17957, would_deny 633, false_positive_rate 0.035251 (upper bound), threshold 0.02, recommended_default warn
```

Transcripts are deleted under the retention window, so a later run covers different calls. When `recommended_default` turns `strict`, change `BASH_EDIT_GATE_DEFAULT` and the evidence file together.

**Known false negatives.** The detector reads command text only:

- a `>` in the middle of a word (`a>b`)
- git operations (`git mv`, `git checkout -- file`, `git apply`), `patch`, `rm`, `dd` and `install`
- writes made by `awk`, `xargs` or `find -exec`
- a heredoc piped into an interpreter (`cat <<EOF | python3 -`), because the heredoc belongs to `cat`
- a write made by a program the command merely runs (a script file, a formatter), because its code is not in the command

**The `cd` approximation.** Subshell scoping is not modelled: after `(cd sub && echo a > f)`, a later `echo b > g` in the same command is resolved against `sub`. The error is a wrong path, and the tracked-file check usually absorbs it (a path that is not tracked passes).

### "DevFlow blocked my command — why?"

If a hook denies a tool call, the model receives the denial reason and will usually correct itself. If you want to bypass:

```bash
# From Claude (the agent's Bash tool): prefix each `git commit` inline.
# Every commit invocation in the command needs its own prefix.
DEVFLOW_ALLOW_RAW_COMMIT=1 git commit -m "..."

# For a whole session: export it in YOUR terminal, BEFORE starting Claude Code.
export DEVFLOW_ALLOW_RAW_COMMIT=1
claude
```

An `export DEVFLOW_ALLOW_RAW_COMMIT=1` run by the agent inside a Bash command never works: the hook decides before the command runs and reads only its own environment, which it inherits from the terminal that launched Claude Code. The inline prefix is the only form the agent can use. Completing a merge, rebase or cherry-pick (a `git commit` while `MERGE_HEAD`, `REBASE_HEAD`, `rebase-merge/`, `rebase-apply/` or `CHERRY_PICK_HEAD` exists in the repo's git dir) is allowed automatically and needs no escape.

To turn off a hook entirely, edit `~/.claude/settings.json` and remove its entry from `hooks.PreToolUse` / `hooks.UserPromptSubmit`. Reinstalling DevFlow will re-add it.

### Skills that need a tool (`requires:`)

A skill cannot refuse itself: by the time its body runs, the model is already carrying it out. So a skill that cannot work without an external tool declares that tool in its `SKILL.md` frontmatter, and a hook refuses to start the skill when the tool is missing:

```yaml
requires:
  - gh
```

`requires:` takes a tool name or a list of names (lowercase letters, digits, `.`, `_`, `+` and `-`, no paths). Today only `/devflow:gh-sync` declares one, `gh`. A skill that needs a tool for only some of its subcommands does not declare it, because `requires:` refuses the whole skill.

- **What happens.** `gate-skill-requires.js` checks each declared tool on PATH (a stat of the executable file, nothing is run). A missing tool stops the skill before it starts. A typed `/devflow:gh-sync status` is blocked on `UserPromptExpansion` and the turn ends with the reason on screen. A Skill tool call (Claude invoking `devflow:gh-sync` itself) is denied on `PreToolUse`, and Claude sees the same reason and relays it. The reason names the skill and the tool, gives one install hint (for `gh`: install the GitHub CLI from https://cli.github.com, then run `gh auth login`), and points at `/devflow:doctor` and the escape.
- **What it leaves alone.** Skills with no `requires:`, other plugins' skills, built-in slash commands such as `/review`, and a skill whose tools are all on PATH pass with no output. The gate is not project-scoped: a missing `gh` breaks `/devflow:gh-sync` in any directory.
- **Fixing it.** Run `/devflow:doctor`. Its check 14, `skill-requires`, lists every tool the installed skills declare that is not on PATH, with the skill that needs it and the install hint. It only reports, and it never installs anything. Install the tool, then run the skill again.
- **Escape.** `DEVFLOW_SKIP_SKILL_REQUIRES=1` in the environment Claude Code is launched from, never as an inline prefix on a command, because a hook runs in Claude Code's own process. To back the gate out without the variable, delete its two registrations from the plugin's `hooks/hooks.json`.
- **Fail open.** Malformed input, a missing library from a partial install, an invalid `requires:` value or any other error lets the skill start. A gate that cannot decide must not stop work.
- **Needs an installed plugin carrying objective 61.** An older plugin has neither the field nor the hook.

---

## GitHub integration

DevFlow works with GitHub in one of two modes, chosen by `github.store` in `.planning/config.json`:

- **Store mode** (`github.store: true`): GitHub is the system of record. Issues, TRD sub-issues, comments and wiki pages hold the planning state; `.planning/` is a cache that `gh pull --all` rebuilds, and every planning verb queues its GitHub write. An existing project moves onto it with migration 0011 (see **Migrating an existing project**).
- **Mirror mode** (store off, the default): DevFlow pushes objectives to GitHub issues, milestones and releases one way, and skills and agents read the planning files (see **Mirror mode (store off)**).

Both modes need `github.enabled: true` and `github.repo`. With `github.enabled` false every GitHub command reports `skipped` and exits 0 without calling `gh`. With it true, a command that cannot reach GitHub (no `gh`, expired auth, a failed call) exits 1 and says why. The workflow steps that run a sync after planning and after execution show that failure as a warning and carry on, so your workflow is never blocked.

### GitHub is the system of record (store mode)

In store mode GitHub holds the whole planning hierarchy. It is on only when `github.store` is exactly `true`. Skills and agents publish planning files through df-tools verbs, each verb queues its GitHub write in the outbox, and `.planning/` is a cache you can rebuild from GitHub (see **The planning write path**). Each objective runs on one linked branch and one pull request (see **One branch and one pull request per objective**), and the repository enforces the model (see **Enforcement and setup**). With the store off, every planning verb writes the same `.planning/` file it always did and **Mirror mode (store off)** applies.

#### Migrating an existing project

Migration 0011 moves an existing project onto the store in place: it puts the planning history on GitHub, closes what already shipped, turns `github.store` on and then untracks the cache. It is a `confirm` migration, so it never runs from a bare `upgrade --apply` or from the SessionStart hook. `/devflow:gh-sync migrate` walks you through it (plan, approval, apply, commit); the steps below are what it runs.

**1. Prepare.** Set `github.enabled: true` and `github.repo: "owner/name"` (the full block is under **Enable** in **Mirror mode**). Leave `github.store` alone: the migration turns it on after a backup. Authenticate `gh` with the `repo` scope, turn the repository wiki on (Settings > General > Features > Wikis) and create its first page once in the GitHub web UI.

**2. Read the plan.** Neither command writes anything or calls GitHub:

```bash
node ~/.claude/devflow/bin/df-tools.cjs planning import --dry-run
node ~/.claude/devflow/bin/df-tools.cjs upgrade --check --only 0011
```

With the store off and `github.enabled` true, `planning import --dry-run` previews the backfill (a real `planning import` still refuses until the store is on):

```
preview (store is off): this is what the GitHub backfill would queue.
planning import (dry run): queued <count> <kind>, ...
estimate: ~<writes> writes (upper bound) in <ops> ops; at 80/min and 450/h at least <h> h of hourly-budget waits
history: <n> closed (completed), <m> closed (not planned)
will stay local:
  | file | why |
```

- **estimate** is an upper bound on GitHub writes. On the 20-objective test fixture it is 770 writes and a real backfill made 639. Writes are paced at 80 a minute and 450 an hour, so a backfill over 450 writes spans more than one hour; a repository with a few hundred TRDs needs about 2,000 writes, about 4.5 hours.
- **history**: shipped work is created and then closed as completed. That is every TRD with a SUMMARY, and every objective whose OBJECTIVE.md says `status: complete` or whose ROADMAP `## Progress` row says Complete. A cancelled objective closes as not planned, together with its TRDs that have no SUMMARY. Open work stays open. Each shipped milestone in MILESTONES.md is closed.
- **will stay local** lists each file the backfill does not put on GitHub and why: a refused TRD (over 60,000 characters; split it first) or a kept-local file such as a decision with no `trd:`. Kept-local files block nothing; after the backfill they stay on disk and the notes name them.
- `upgrade --check --only 0011` prints JSON. Before the migration, 0011 is under `pending_confirm` with the plan in one sentence as its `reason`; once it is done, 0011 is under `skipped` with `already on GitHub (backfill complete)`.

**3. Apply.**

```bash
node ~/.claude/devflow/bin/df-tools.cjs upgrade --apply --only 0011 --confirm
```

In order, the apply:

1. checks the local state and refuses on every blocker at once, each with its fix: not a git work tree; a merge, rebase, cherry-pick or revert in progress; a halted, blocked or unreadable outbox journal; legacy-named TRDs (`NN-MM-TRD-<slug>.md`, with the rename); TRDs over 60,000 characters;
2. checks GitHub, reading only: `gh` authenticated with the `repo` scope, a token that can write, and a wiki that is enabled and has a first page;
3. backs up `.planning/config.json` and sets `github.store: true`. The notes name the backup; to roll back, set `github.store` to false;
4. queues the whole backfill once, history closes included. A re-run while ops are still queued skips this step, so nothing is imported twice, and on such a resume a lost `.planning/.gh-mapping.json` is rebuilt from the `devflow:id` markers on GitHub;
5. drains the outbox within the budgets;
6. verifies GitHub with `gh pull --all` and the orphan report: every TRD file has an issue linked under its objective, and every TRD issue has a file;
7. runs migration 0010, which gitignores and untracks the cache, and records both 0010 and 0011 in the stamp.

From step 3 until the end the project is in store mode: the edit gate denies edits to cache files, and `df-tools commit` refuses the default branch. A project with nothing to import still has the store turned on.

**4. Resume after the hourly budget.** A large backfill stops when the hour budget runs out. The apply reports 0011 under `failed` and exits 1, and the message starts with "not an error":

```
not an error: <N> of <M> ops remain (GitHub's hourly write budget (450/h) is spent); <K> ops written to GitHub by this apply
resume at <time> (in ~<minutes> min): run `df-tools upgrade --apply --only 0011 --confirm` again then, or keep working and let the gh-flush hook drain it; `df-tools gh outbox status` shows the queue
```

Nothing is lost. Run the same command after the resume time; it skips the import and drains what is left. Being offline, a long secondary rate limit and this run's own write cap stop the apply the same way, each with its reason. Or keep working: in store mode the `gh-flush` hook flushes the queue after each `df-tools commit` and at Stop. The hook only drains the queue, so run the apply once more when `gh outbox status` shows it empty, to verify and untrack the cache. While ops are pending, migration 0010 skips with a reason that names `--only 0011`, so a bare `upgrade --apply --confirm` reaches 0011 too.

A message that starts `the outbox halted at op <seq>` means someone edited a DevFlow-managed section of an issue on GitHub between runs. Run `gh outbox status`, choose `gh outbox resolve <seq> --accept-remote` (keep GitHub's edit) or `--overwrite` (keep the local write), then apply again. Any other stop (`preflight`, `verify`, `handoff`) lists each blocker with its fix; fix them and apply again.

**5. Commit the switch.** When the apply completes, its notes end with these steps:

```
commit on a new branch with the logged escape (gate gh; store mode refuses the default branch and unlinked branches), then merge it through a pull request:
  git switch -c devflow-store-cache
  DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="store migration" node ~/.claude/devflow/bin/df-tools.cjs commit "chore: gitignore the planning cache (store mode)" --files .gitignore .planning/
  git push -u origin devflow-store-cache
  gh pr create --head devflow-store-cache --fill
  or, on an objective's linked branch (`df-tools gh pr start <objective>`), commit there with: node ~/.claude/devflow/bin/df-tools.cjs commit "chore: gitignore the planning cache (store mode)" --files .gitignore .planning/
```

Store mode refuses `df-tools commit` on the default branch and on a branch that no objective pull request names, so the first route takes the logged escape (gate `gh` in `.planning/.override-log.jsonl`; `df-tools override --list` shows it). The last line is the other route: on a branch that `gh pr start` linked to an objective, the bare command is accepted and needs no escape. Each line runs as printed. `/devflow:gh-sync migrate` shows the steps and runs them only when you ask.

**6. Then `gh setup`.** It is not part of the migration. Merge the migration's pull request first. Then run `gh setup` (a dry run) and `gh setup --apply`, merge its workflow pull request with the repository-admin bypass the setup ruleset grants (`gh pr merge <number> --admin --squash`; the required checks exist only once the workflow is on the default branch), and only then require the checks. See **Enforcement and setup**.

**Running it again.** After it completes, `upgrade --check` lists 0011 and 0010 under `skipped`, and another apply makes no GitHub write and changes no file.

**Known behaviour.**

- A project that enables GitHub for mirror mode keeps 0011 as a pending confirm migration: `validate health` reports W040 ("1 need confirmation") and `doctor` check 21 names 0011. Nothing applies 0011 without your confirmation. To keep mirror mode and stop the prompt, record the opt-out in the tracked config and commit `.planning/config.json`:

  ```bash
  node ~/.claude/devflow/bin/df-tools.cjs config-set github.mirror_only true
  ```

  While `github.store` is off, 0011 then skips with "mirror mode kept (github.mirror_only: true)", so W040, doctor check 21 and the SessionStart notice no longer count it, and `upgrade --apply --confirm` passes it over. Only boolean `true` counts. With the store on the key is ignored, so a pending backfill still resumes. It applies to 0011 alone and declines no other migration. `/devflow:gh-sync migrate` and `/devflow:status check --migrate` offer it as **Keep mirror mode**. To migrate later, run `df-tools config-set github.mirror_only false`, then `df-tools upgrade --apply --only 0011 --confirm`.
- `--confirm` selects every applicable confirm migration, not only the one `--only` names: 0006 on a project with no `kind`, and 0010 on a store-mode project. `--only 0011` without `--confirm` runs 0011 alone. On a halted journal, `--only 0011 --confirm` therefore fails on 0010 first ("outbox: halted (remote-edit)"), and 0010's message points at `planning import` and `gh outbox flush`. The fix is the `gh outbox resolve` step above; nothing was written.
- While a backfill drains, `doctor` check 24 reports `ok` with "nothing to untrack: GitHub backfill in progress". The untrack waits for the drain and the hand-off to 0010.
- The backfill is tested against a model of GitHub and, through the CLI, against a `gh` shim, not against a live repository. Run your first real backfill against a throwaway repository (a manual UAT step, not part of CI) before you migrate a repository you care about.
- A store project created from scratch, with nothing to import, gets `.planning/state.json` and its version stamp from `df-tools upgrade --apply`, which the SessionStart hook also runs when a session opens in a project that is behind. The 2026-10-05 live run confirmed it: `upgrade --apply` seeded `state.json`, stamped the project, and `validate health` then reported no W009 and no W040. There is no one-command store bootstrap in `new-project`. That is deferred on purpose: it would be a new feature rather than a fix for a defect the smoke found, and the hook plus `upgrade --apply` already covers it.

#### What the store holds

With `github.store: true`, `df-tools gh sync <objective>` also pushes:

- the hierarchy: milestone, Objective issue, one TRD sub-issue per TRD (native sub-issues, blocked-by edges derived from waves);
- SUMMARY.md and VERIFICATION.md as marked comments (long files are split into numbered parts and rejoined on pull);
- reference pages (OBJECTIVE, CONTEXT, RESEARCH, PROJECT, REQUIREMENTS, codebase docs) to the repository wiki, plus a `Roadmap` page rendered from the issues.

A TRD body is the TRD file verbatim behind `devflow:id` and `devflow:file` markers. A TRD of 40,000 characters or more warns; over 60,000 the sync is refused before any GitHub call (zero `gh` calls) and names the TRD. Split it.

#### The outbox

Every store write is queued in a per-repo journal at `~/.claude/devflow/state/outbox/` (override `DEVFLOW_OUTBOX_DIR`) and flushed in order, so a dropped connection loses nothing. Offline, `gh sync` of an objective that already has an issue queues its changes and reports `pending`; an objective with no issue yet cannot be created offline (that sync fails and queues nothing).

```bash
node ~/.claude/devflow/bin/df-tools.cjs gh outbox status
node ~/.claude/devflow/bin/df-tools.cjs gh outbox flush [--no-wait]
node ~/.claude/devflow/bin/df-tools.cjs gh outbox resolve <seq> --accept-remote|--overwrite
```

`flush` exit codes (the `gh trd` verbs that flush use the same ones):

| Exit | Meaning | What to do |
|---|---|---|
| 0 | flushed, skipped (GitHub integration off) or running (another flush holds the lock) | nothing |
| 1 | error (bad config, no repo, a failed flush) | read the message |
| 2 | halted: a human must look | see below |
| 3 | pending: offline or rate limited, nothing lost | run `flush` again later |

`--no-wait` is hook mode: a rate-limited write is left queued instead of waited out. `gh outbox status` makes no GitHub calls; it reports the counts, the journal path, any halt and one sentence per degraded capability.

**Resolving a halt.** Before overwriting an issue the flusher compares it with what it last saw. If a person edited a managed section or a TRD body on GitHub, the queue halts at that op and everything behind it waits; edits to human-written text outside the managed sections are merged without a halt. `gh outbox status` names the issue (`#N`) and prints both commands for the halted `<seq>`:

- `gh outbox resolve <seq> --accept-remote` drops the local write and keeps what is on GitHub (then run `gh pull --all` to bring it down);
- `gh outbox resolve <seq> --overwrite` keeps the local write and replaces GitHub's version.

After either, the queue behind the halt drains on the next `flush` (or sync). A wiki with no first page also halts (`reason: blocked`): create the first wiki page once in the GitHub web UI, then `flush`. The next `flush` retries the blocked wiki push once, so `resolve --overwrite` is not needed for it; if the wiki still has no first page, that one attempt ends in the same halt (exit 2) and nothing loops. A blocked write of any other kind is not retried and keeps its `resolve` step. DevFlow never falls back to `docs/` for that. The retry is covered by a test against a model of GitHub; the smoke repository's wiki already had its first page, so it was not re-run live.

#### TRD verbs

```bash
node ~/.claude/devflow/bin/df-tools.cjs gh trd spec <trd>
node ~/.claude/devflow/bin/df-tools.cjs gh trd freeze <trd>
node ~/.claude/devflow/bin/df-tools.cjs gh trd scope <trd> <body|@file:path> [--n K]
node ~/.claude/devflow/bin/df-tools.cjs gh trd fold <trd> [--force]
```

`spec` prints the effective spec: the issue body plus its scope comments applied in `n` order. `scope` adds a scope comment; one that would push the effective spec past 60,000 characters (or that is itself too large) exits 1 with "becomes a new TRD", because that change belongs in a new TRD. `freeze` records the body as final: after it the body is not edited and changes go in as scope comments; an already frozen TRD is a no-op. `fold` rewrites the body to the effective spec and records it; on an open TRD it needs `--force`. All three flush by default (`--no-flush` leaves the ops queued; `--no-wait` is hook mode).

**Known limitation (open decision).** `freeze`, `scope` and `fold` read the issue and its comments from GitHub first, so they need connectivity: offline they exit 1 and queue nothing. Only `gh sync` and the outbox queue offline. `gh orphans <objective>` is read-only and lists TRD issues with no local file and local TRDs with no issue.

#### Rebuilding the cache: `gh pull --all`

`df-tools gh pull --all [--force]` reads the issues, comments and pages and lays them out as `.planning/` files, byte for byte. It writes only what changed (a second run writes nothing) and never deletes anything. It will not overwrite a file you edited locally since the last sync; that file is reported as `local_modified` and `--force` takes GitHub's version. A ROADMAP.md or STATE.md without the generated header is hand-maintained: it is reported and never overwritten, even with `--force`. Exit 0 means the cache matches GitHub, 1 an error, and 2 that the cache was rebuilt but something needs your attention (a locally modified file, a hand-maintained ROADMAP.md, a local file GitHub does not have, an item that could not be read or placed).

#### Degraded mode

Capabilities are detected per repository and cached under `<DEVFLOW_GH_CACHE_DIR>/capabilities/` (`~/.claude/devflow/state/gh-project/capabilities/` by default), then reported by `gh outbox status`. Nothing to configure:

- no issue types or project fields (a user-owned repository): the labels `devflow:trd` / `devflow:decision` (`github.labels.trd|decision`) and a `meta` section in the objective body carry what types and fields would;
- no wiki: reference pages are written to `docs/devflow/` and committed with your normal workflow; the sub-issue tree and blocked-by edges stay native.

#### The planning write path (objective 48)

Every planning file has one df-tools verb that writes it. Skills and agents call the verb; nobody edits the file by hand. Content comes from `--from <path>` (or `-` for stdin), usually a copy made with `planning draft <rel>`, which prints a temp path seeded with the current file.

**Store off (the default).** Each verb writes the same `.planning/` file, byte for byte, that the old flow wrote, makes no `gh` calls, and `.planning/` stays tracked in git. Nothing changes for a project that never sets `github.store`.

**Turning it on.** Use migration 0011 (see **Migrating an existing project**); it also handles a project with nothing to import. The manual route below still works, but it skips the preflight, the live-write budget bookkeeping and the verification that 0011 runs. Set both keys in `.planning/config.json`, then run the first-run steps once from the main checkout:

```json
{ "github": { "enabled": true, "store": true } }
```

```bash
node ~/.claude/devflow/bin/df-tools.cjs planning mode                 # prints: store
node ~/.claude/devflow/bin/df-tools.cjs gh pull --all                 # bring down what GitHub already has
node ~/.claude/devflow/bin/df-tools.cjs planning import --dry-run     # count what is only local
node ~/.claude/devflow/bin/df-tools.cjs planning import               # queue it to GitHub
node ~/.claude/devflow/bin/df-tools.cjs gh outbox flush               # drain the queue
node ~/.claude/devflow/bin/df-tools.cjs upgrade --apply --only 0010 --confirm
```

`planning import` reports, rather than skips, TRDs over the 60,000-character budget, decisions with no TRD and legacy-named TRDs (`NN-MM-TRD-<slug>.md`); rename or split those first. Running it twice queues nothing new, and a real import also queues the history closes described under **Migrating an existing project**. Migration 0010 refuses until the outbox is drained and every cache file is on GitHub, and lists each blocker; while the outbox holds only pending ops, 0010 skips instead, with a reason that names `--only 0011`. `--confirm` also runs any other pending confirm migration (for example 0006 on a project without `kind`); `--only 0010` without `--confirm` runs 0010 alone.

**What git tracks afterwards.** Migration 0010 writes a `.gitignore` block (`.planning/*`, `!.planning/config.json`, `!.planning/STACK.md`) and untracks everything else from the index; the files stay on disk as the cache. The wiki clone at `.planning/wiki/` is excluded from its checks. Since objective 50, store mode refuses `df-tools commit` on the default branch (`default_branch`; see **Enforcement and setup**), so the migration prints the store-mode commit steps instead of a bare `df-tools commit` line: a new `devflow-store-cache` branch, the commit with `DEVFLOW_SKIP_GH_GATE=1` and a reason (logged), a push, a pull request, and a last line for an objective's linked branch (`df-tools gh pr start <objective>`), where the bare command is accepted (shown in step 5 of **Migrating an existing project**). Every commit follow-up DevFlow prints comes from the same builder, so in store mode `doctor` check 20 (branch `devflow-untrack-runtime-state`), `doctor` check 21 (branch `devflow-upgrade`) and `gh setup --apply` (branch `devflow-setup`) print the same form. In local mode doctor 20 and 21 still print `commit with: <df-tools commit ...>`. `df-tools doctor` warns (check 24) while a store-mode project still tracks its cache.

**The verbs.**

| Verb | Writes |
|---|---|
| `plan put-trd <obj> <file> --from <f> [--no-push]` / `plan push <obj>` | a TRD; refused over 60,000 encoded characters or once frozen. Batch with `--no-push`, then one `push` |
| `summary checkpoint <trd> --from <f>` | progress after each task. Store mode writes runtime `.planning/.trd-progress/<trd>.md` and never reaches GitHub |
| `summary post <trd> --from <f>` | the final SUMMARY, the one GitHub write per TRD |
| `verification post <obj> --from <f>` | VERIFICATION.md |
| `doc put <rel> --from <f>` | OBJECTIVE/CONTEXT/RESEARCH/UAT pages, PROJECT.md, REQUIREMENTS.md, `research/`, `codebase/` |
| `objective put <id> --from <f>` / `objective set-status <id> <status>` | an objective's OBJECTIVE.md and its status |
| `todo add --from <f>` / `todo complete <stem>` | a todo (an issue in store mode); completion moves it to `todos/completed/` |
| `debug put <slug> --from <f>` / `debug resolve <slug>` | a debug session (a `Debug` issue in store mode) |
| `quick put <N> <slug> --from <f>` / `quick summary <N> --from <f>` | a quick task and its summary (a `Quick` issue) |
| `decision open <trd> --question <q>` / `decision answer <trd>-d<k> --from <f>` | a decision on a TRD |
| `milestone put <v> --from <f>` / `milestone complete <v>` | a milestone (a native GitHub milestone plus a `Milestone-vX_Y` wiki page) |

`summary checkpoint` and `summary post` write the checkout that runs them in local mode, so an executor worktree commits its own SUMMARY with its task commits and it arrives through the wave merge, with no untracked copy left in the main checkout. In store mode they write the main checkout's cache, because the cache, ledger and outbox live there. In store mode STATE.md, ROADMAP.md and MILESTONES.md are generated: STATE.md mutators record into the per-clone `state.json`, and `gh pull --all` regenerates the views. `/devflow:micro` follows the same rule: `df-tools micro commit` appends a Quick Tasks row to STATE.md and commits it separately in local mode only. In store mode it makes one commit, the source change, leaves STATE.md alone and reports `state_row: "skipped_store_mode"`, so it raises no W055. It commits through `df-tools commit`, so store mode refuses it on the default branch, an unlinked branch or a detached HEAD with the same gate message as any other commit (exit 1, nothing committed, the micro marker kept). Switch to the objective's linked branch and run it again, or take the logged `DEVFLOW_SKIP_GH_GATE=1` escape.

**An objective the verbs do not know.** `objective put`, `plan put-trd`, `verification post` and the other verbs that take an objective id never create an objective. For an id with no ROADMAP entry and no directory under `.planning/objectives`, they exit 1 with `objective 9 is not known (no ROADMAP entry or directory under .planning/objectives); register a new objective with df-tools objective add "<description>", then run this again`, and write and queue nothing. `objective add` owns the number, the slug and the directory. In store mode it also creates the objective's issue, titled after the description (`[Objective 2] Goodbye CLI`) with a footer that says the issue is the source of truth and `.planning/` a local cache.

**Decisions answered before objective 52.** A multi-line `decision answer` written before objective 52 left a mangled `resolution` in `.planning/decisions/resolved/DECISION-NNN.md` that reads back as its first line. `df-tools doctor` check 33 (`decision-resolution`) finds these, and `doctor --fix` repairs each one whose full answer is recoverable from the file: it backs up first, rewrites the answer as a `|-` block scalar, and writes only after the rebuilt file re-parses to the recovered answer. A decision whose answer already reads back whole is left alone. Fix by hand only the files the check reports as unrecoverable: write the answer as `resolution: |-` followed by its lines, each indented two spaces. In store mode the check is report-only; fix the decision's GitHub copy by hand, then run `gh pull --all`. Repair these before a backfill so 0011 carries the whole answer to GitHub.

**Reading the gate message.** In store mode the edit gate denies an Edit or Write of a cached or generated `.planning/` file for everyone, including skills and DevFlow agents:

```
.planning/objectives/48-x/48-01-foo-TRD.md is a read-only cache of GitHub in store mode (github.store: true). Change it with: `df-tools plan put-trd 48 48-01-foo-TRD.md --from <draft>`. Direct edits are overwritten by gh pull --all and flagged by validate (W055).
```

Run the named verb with a draft instead. `config.json`, `STACK.md` and runtime files (`.trd-progress/`, `.skill-active` and the like) are always editable. The deny takes effect only once the installed DevFlow plugin is at or above the release that carries objective 48; `df-tools doctor` reports a stale plugin cache (check 11).

**W055.** `validate health` (Check 15) reports W055 for a cache or generated file whose bytes match neither its last GitHub baseline nor a pending verb write: someone changed it outside a verb. The message names the verb that publishes it, or `gh pull --all --force` to take GitHub's version back. W056 means the check could not run, or stopped at its 5,000-file cap (for example an unreadable ledger). Neither appears in local mode.

**W057-W061.** `validate health` (Check 16) and `df-tools doctor` (check 25, `gh-store-sync`) report whether the store and GitHub agree. They read local state only (the outbox, the mapping, the objective files) and make no GitHub call; all five are warnings that `--repair` and `doctor --fix` never touch. None appears in local mode.

| Code | Meaning | What to do |
|---|---|---|
| W057 | unsynced writes: pending or blocked ops in the outbox, a halted outbox, or a recovered journal (a `.corrupt-*` file is named) | `gh outbox flush`; for a halt, `gh outbox status` then `gh outbox resolve <seq> --accept-remote\|--overwrite`; for a recovered journal, read the named file, run `gh sync --all` to queue what it held, then delete it |
| W058 | missing links: a TRD file with no mapped issue, an objective with TRDs and no issue, a PR entry with no number | `gh sync <objective>` (or `gh pr sync <objective>` for a PR entry) |
| W059 | orphans: a mapped TRD whose file is gone, or a PR entry whose objective has no directory | `gh orphans <objective>` confirms against GitHub; restore a missing file with `gh pull --all`, or, if the objective was removed on purpose, close its pull request on GitHub |
| W060 | frozen-body drift: a frozen TRD whose local text no longer matches the body hash recorded at the last sync | publish the change as a scope comment (`gh trd scope`), or take GitHub's version back with `gh pull --all --force` |
| W061 | the check itself could not run (an unreadable mapping, outbox or file); the other checks still ran | read the message; fix the named input |

`doctor` check 25 shows the same findings as one warning with the most urgent fix command (a halt first, then unsynced writes, frozen drift, missing links, orphans, a failed check) and the full list under `--json`. Doctor check 22 (`validate health`) leaves these five codes to check 25, so each problem appears once.

#### One branch and one pull request per objective (objective 49)

In store mode `/devflow:execute-objective` runs each objective on one linked branch and one pull request. With `github.store` off none of this applies: every `gh pr` verb, `gh trd confirm-scope` and `gh trd start` prints `skipped`, exits 0 and makes no `gh` call, and `git.branching_strategy` keeps its old meaning. In store mode `git.branching_strategy` is ignored (see **Git Branching**), and `complete-milestone` no longer merges branches itself.

```bash
node ~/.claude/devflow/bin/df-tools.cjs gh pr start <objective>
node ~/.claude/devflow/bin/df-tools.cjs gh pr sync <objective>
node ~/.claude/devflow/bin/df-tools.cjs gh pr status <objective>
node ~/.claude/devflow/bin/df-tools.cjs gh pr merge <objective>
node ~/.claude/devflow/bin/df-tools.cjs gh pr reconcile <objective>
```

**Start.** `gh pr start` creates the objective branch linked to the objective issue, makes a start commit and opens a draft PR. The PR body carries `Closes #<objective issue>` and one `Closes #<TRD issue>` per TRD, and pins the wiki revision the objective was planned against. It also freezes every TRD, so a change after this point is a scope comment, not a body edit. `start` reads GitHub first: offline it exits 1 and queues nothing, so run it again when you are back online. The later verbs queue through the outbox.

**TRDs.** At spawn, `gh trd start <trd>` puts the `github.labels.in_progress` label on the TRD's issue; `summary post` takes it off. Every commit on the objective branch ends with a `Refs #N` paragraph, the TRD's issue for a wave commit and the objective's for the start commit. It is a plain last paragraph, not a git trailer (git's trailer parser needs a colon), and matches `^Refs #\d+$`. A squash merge keeps these only in the PR's commit list, not in the squashed commit. After each wave, `gh pr sync` pushes the branch and refreshes the PR body.

**Scope confirmation.** An executor reads a TRD's effective spec with `gh trd spec <trd>`. A scope comment counts only when an assignee of the objective issue wrote it, the DevFlow App (`github.app_login`) wrote it, DevFlow recorded it, or an assignee confirmed it. Anything else is pending, and `gh pr status` lists it with the command to accept it:

```bash
node ~/.claude/devflow/bin/df-tools.cjs gh trd confirm-scope <trd> <n>
```

A confirm counts only if an assignee posted it, so the token DevFlow uses must belong to one. Editing a scope after it was accepted makes it pending again.

**Verify.** On a pass, `verification post` sets the commit status `devflow/verification` on the PR's head commit, marks the PR ready for review and posts the wiki diff as a PR comment. It is a commit status, not a check run, because only a GitHub App can create a check run; the two required checks of objective 50 are commit statuses too (see **Enforcement and setup**). Run `gh pr sync` first: the status is posted on the pushed head, so that head has to contain the verified commits. `verification post` enforces this: while the linked branch has commits that GitHub does not have, it exits 1 and names `df-tools gh pr sync <objective>`, and it writes no file and queues nothing. After the sync, verify again on the pushed head. If DevFlow cannot tell whether the branch is ahead (a git failure), it posts anyway and warns, naming the same command. The objective issue stays open at this point.

**Merge.** DevFlow offers the merge once the objective is verified; it never merges on its own. If you decline, or an auto-advance chain moves on without it, the next objective starts from the default branch without this one's work. `gh pr merge` refuses a draft PR, a linked branch with unpushed commits, a PR with no passing `devflow/verification` on its current head and a closed PR. It merges with `github.pr.merge_method` (default `squash`), or enqueues the PR where the base branch has a merge queue. The checks run in that order, and the draft check comes first. On a draft PR the refusal is `PR is still a draft; run verification first`, even when the branch also has unpushed commits. Only a ready PR gets the unpushed refusal:

```
df/objective-02-goodbye-cli has 1 unpushed commit (25662fa) that is not on GitHub: the pull request head does not contain it. Run df-tools gh pr sync 2 to push it, re-run verification on the pushed head, then try again. Nothing was queued or written.
```

Run `gh pr sync`, verify again and merge again. A draft PR with unpushed commits reaches this remedy in two steps, because `verification post` is the step that names `gh pr sync` there.

| Exit (`gh pr merge`) | Meaning | What to do |
|---|---|---|
| 0 | merged and reconciled | nothing |
| 3 | enqueued in a merge queue, or `--no-flush` | run `gh pr reconcile` after the queue lands the PR; repeat until it exits 0 |
| 2 | halted for a human (the halt names the PR and the reason) | fix it on GitHub, then `gh outbox flush` |
| 1 | refused (draft, unpushed commits, no passing status, closed unmerged, offline) | read the message; nothing was queued. For unpushed commits run `gh pr sync`, verify again, merge again |

**Reconcile.** `gh pr reconcile` runs after the PR merges, whether DevFlow or a person merged it on GitHub. GitHub caps how many issues a closing keyword closes, so reconcile reads every issue the PR should have closed (the objective and each TRD) and closes the ones that are still open. It then updates the Project fields, deletes the remote branch, returns your checkout to the default branch and pulls the cache. A local branch is deleted when its tip is in the merged history or when its changes are already on the default branch even though its tip is not an ancestor of the merged head (for example, you merged the default branch into the objective branch after the last push and the PR was then squash-merged). The content check is read-only (`git merge-tree`), needs git 2.38 or later, and treats anything it cannot decide as unknown. A local branch that holds unpushed or unmerged work, one that conflicts with the default branch, and any branch on an older git, is kept and reported with `was kept: its tip is not in the merged pull request`. The live run's squash merge of a fully pushed branch ended with `kept: []` and no warning. It is idempotent. Exit 0 is done, 3 means a queued PR has not landed yet, 1 is an error; warnings go to stderr with exit 0. The objective issue closes here or through the PR's `Closes`, never at verify.

`gh pr status <objective>` shows where an objective stands at any point: the branch, the PR and its state, the `devflow/verification` status, the issues the PR closes, pending scopes and queued writes.

#### Enforcement and setup (objective 50)

Objective 50 enforces the planning model in two places: on your machine, where `df-tools commit` and a hook guard the working copy, and on GitHub, where `df-tools gh setup` configures the repository once and two required checks run on every pull request. The local guards act in store mode only. With `github.store` off, `df-tools commit` behaves as before, the hook stays silent, and none of this makes a `gh` call.

**Why a commit is refused.** In store mode `df-tools commit` checks the branch before it stages anything. On the default branch it exits 1 with:

```
Refusing to commit on main, the default branch. To get a linked branch, run `df-tools gh pr start <objective>` and commit on its branch, or prefix the commit with DEVFLOW_SKIP_GH_GATE=1 (logged as gate gh; DEVFLOW_SKIP_GH_GATE_REASON=<why> records why).
```

The `reason` is `default_branch`, `unlinked_branch` (a branch that no unmerged objective PR names, which includes the old branch of a merged objective) or `detached_head`. Nothing is staged and HEAD does not move. A branch counts as linked when the mapping's `prs` entry for an objective names it and that PR is not merged; that is a local fact, so the gate works offline. A `df/exec-*` executor branch is allowed when the main checkout is on a linked branch, and a merge or rebase in progress is never refused. What to do: run `gh pr start <objective>` and commit on the branch it creates. `/devflow:execute-objective` already does this. A commit on a linked branch whose message has no recognised scope ends with `Refs #<objective issue>`.

**The escape.** Put `DEVFLOW_SKIP_GH_GATE=1` in front of the command, for example `DEVFLOW_SKIP_GH_GATE=1 df-tools commit "chore: ..." --files <paths>`, and a refused commit lands anyway. The value must be exactly `1`. The result carries `gate_escaped: true`. Once the commit has landed, a `gate: gh` entry is appended to `.planning/.override-log.jsonl` in the main checkout (also when you commit from an executor worktree), and `df-tools override --list` shows it. Set `DEVFLOW_SKIP_GH_GATE_REASON="<why>"` to record the reason. A refused or empty commit logs nothing. The gate guards `df-tools commit` only. Every refusal names both remedies, `gh pr start` and this escape. With `--raw`, a refusal prints only the reason code on stdout and exits 1, and the full message goes to stderr.

**Queued writes are flushed for you.** In store mode the `gh-flush` hook runs after a `df-tools commit` and at Stop. It sends queued GitHub writes, and says so when writes are still queued (offline, rate limited), when the outbox is halted for a human, or, at Stop, when a cache file was changed outside a verb (W055). It never blocks and never writes under `.planning/`. `DEVFLOW_SKIP_GH_FLUSH_HOOK=1` turns it off.

**`gh setup`.** One command configures a repository. It is a dry-run until you pass `--apply`, and it needs `github.enabled` and `github.repo` (not store mode):

```bash
node ~/.claude/devflow/bin/df-tools.cjs gh setup              # dry-run: prints every action and the exact request, changes nothing
node ~/.claude/devflow/bin/df-tools.cjs gh setup --apply      # does it
node ~/.claude/devflow/bin/df-tools.cjs gh setup --apply --refresh   # also forget a recorded merge-queue refusal and try again
node ~/.claude/devflow/bin/df-tools.cjs gh setup --require-wiki      # exit 1 while the wiki has no first page
```

Read the dry-run first. A run reads the repository, then lists one line per action as `[created|updated|exists|skipped|manual|conflict|advisory|failed] kind target`, with the `gh` command or the file it would write underneath. Under the managed workflow action it prints the two pinned lines, `uses:` and `devflow-ref:`, so the ref the checks will run is visible before `--apply`; a workflow the run would re-pin also gets a `was` line for each previous pin. When the plan would write the workflow or the pull request template, the dry run ends with a preview of the follow-up (`After --apply: it writes <files> to the working tree, not committed.`, then the `Commit them through a pull request:` steps below). A current workflow and template print neither. This needs an installed plugin carrying objective 61. `--apply` makes these changes, in order, and attempts every action even when one fails:

- repository settings: wiki on, delete branch on merge;
- labels: `github.labels` roles (objective, trd, decision, todo, debug, quick, plus in-progress and gaps when configured);
- on an organization: issue types Objective, TRD, Decision, Debug and Quick, and the issue fields `work` and `kind`;
- the ruleset `devflow: default branch` on the default branch: pull request required (no approvals), no force-push, no deletion, the required checks below, a bypass for the repository-admin role (`bypass_mode: always`), and a merge queue (method from `github.pr.merge_method`) where the plan allows one;
- `.github/workflows/devflow.yml`, a managed caller of the reusable workflow, and a managed block in `.github/pull_request_template.md` that asks for `Closes #<objective issue>`.

A second `--apply` makes no GitHub write and changes no file. A ruleset that already does everything asked, or more, is left alone; a weaker one is updated with the union and never loses a rule or a bypass actor. The union also adds the repository-admin bypass when the ruleset lacks it; an admin entry that is already there keeps its mode, so a team that tightened it in GitHub is left alone. A workflow file you wrote yourself (no `# devflow:managed` line at the top) is a `conflict`: it is never overwritten and the run exits 1, in a dry-run too, so CI can use the dry-run as a readiness check.

Degraded cases never stop the run. On a user-owned repository, or where an organization endpoint answers 403 or 404, issue types, fields and rulesets are `skipped` and DevFlow keeps using labels and body metadata. If GitHub refuses the merge queue (HTTP 422, usually a plan limit), `gh setup` retries the ruleset without it, reports "merge queue unavailable on this plan" and records that, so the next run writes nothing; `--refresh` tries the queue again. An issue-field write that GitHub refuses is retried as a plain text field. A wiki with no first page is reported; create the first page once in the GitHub web UI (`--require-wiki` makes that an exit 1).

**Committing the written files.** `--apply` writes the two files into your working tree and leaves them uncommitted. Put them on a branch and merge them through a pull request, before anything else: the ruleset requires two checks that exist only once the workflow is on the default branch, so until then nothing can merge without the ruleset's repository-admin bypass (see **Merging the workflow pull request** below). `--apply` prints the steps under `Commit them through a pull request:`, and they run as printed; `--files` names only the files that run wrote. Outside store mode they are a plain branch sequence:

```
commit on a new branch, then merge it through a pull request:
  git switch -c devflow-setup
  node ~/.claude/devflow/bin/df-tools.cjs commit "chore: add the DevFlow checks workflow and pull request template" --files .github/workflows/devflow.yml .github/pull_request_template.md
  git push -u origin devflow-setup
  gh pr create --head devflow-setup --fill
```

In store mode `df-tools commit` refuses an unlinked branch, so the commit line carries the logged escape (`DEVFLOW_SKIP_GH_GATE=1 DEVFLOW_SKIP_GH_GATE_REASON="gh setup workflow"`) and a last line gives the linked-branch route through `gh pr start`, the same form as step 5 of **Migrating an existing project**.

**Opening the workflow pull request.** The last printed step is a runnable command: `gh pr create --head devflow-setup --fill`. It opens the pull request from the branch you just pushed, against the default branch, and fills the title and body from the commit. The same line ends the steps that migration 0010 and doctor checks 20 and 21 print, so every printed branch-and-pull-request sequence finishes with `gh pr create --head <branch> --fill`. The steps also assume that no local `devflow-setup` branch exists. A clone that ran setup before can still have one, and `git switch -c devflow-setup` then fails with `a branch named 'devflow-setup' already exists`. Delete it first. If it was already merged, `git diff --stat <default branch> devflow-setup` prints nothing, and `git branch -D devflow-setup` is safe. Then run the printed steps.

**Merging the workflow pull request.** The ruleset `gh setup` creates grants the repository-admin role a bypass, so you can merge this one pull request before its required checks can pass. Merge it with the GitHub CLI's own `gh pr merge <number> --admin --squash`. That is GitHub's command, not the `df-tools gh pr merge` verb, which merges objective pull requests. `--apply` prints the same command after the commit steps, with the method taken from `github.pr.merge_method` (`--merge` or `--rebase` when it is set to those, `--squash` otherwise), and names the web UI choice "Merge without waiting for requirements to be met" as the alternative. On the smoke repository the re-run merged its workflow pull request #6 with `gh pr merge 6 --admin --squash` while the merge queue and the required-checks rule were active; `devflow/linked-issue` had failed on it because that pull request closes no issue, and the bypass merged it anyway. Every later pull request goes through the checks and the merge queue, with no bypass.

**Picking up a fixed checks workflow.** The managed caller `.github/workflows/devflow.yml` pins both its `uses:` line and the `devflow-ref:` input to `v<plugin version>`. A repository that set up earlier keeps running the reusable workflow it was pinned to, so a fix to that workflow reaches it in four steps. Upgrade the plugin. Run `gh setup`: the dry run lists the managed workflow as `[update]` with `refresh the managed DevFlow checks workflow`. Run `gh setup --apply`, which writes the file uncommitted. Then commit it and merge the workflow pull request as above. To pin a branch, tag or commit instead, set `github.checks_workflow` to `<owner>/<repo>/.github/workflows/devflow-checks.yml@<ref>`; `devflow-ref` then takes the same `@<ref>`, so the runner script and the reusable workflow come from one ref. The dry run prints the pinned `uses:` and `devflow-ref:` lines under the workflow action, with a `was` line for each pin it would replace, so you can read the new ref before you run `--apply`. To spot a stale pin without running setup, see **Stale checks-workflow pins (W062)** below.

**Stale checks-workflow pins (W062).** `validate health` (Check 17) and `/devflow:doctor` (check 26, `checks-workflow-pin`) warn when the managed `.github/workflows/devflow.yml` is pinned to a DevFlow release older than the installed plugin, so a fix to the reusable workflow does not wait on someone remembering to re-run setup. Both are local file reads with no `gh` or git call. What they compare, as `major.minor.patch` integers against the installed plugin version (the running one when no plugin is registered):

- the `devflow-ref:` input, always;
- the `uses:` ref, only when its path is DevFlow's own reusable workflow (`AO-Cyber-Systems/devflow-claude/.github/workflows/devflow-checks.yml`).

What they never warn about: a branch, a tag that is not a release, a commit SHA, a fork's own ref, a workflow without the `# devflow:managed` header (it is yours), and an absent file. A pin newer than the plugin is reported as ahead, not stale. The W062 message names the oldest stale ref and the field that pins it, and its fix is `node ~/.claude/devflow/bin/df-tools.cjs gh setup --apply`, then committing the written file and merging the workflow pull request as above. If `github.checks_workflow` in `.planning/config.json` names an `@ref`, update that first: setup re-renders the configured ref, and so would write the stale pin again. Doctor check 22 defers W062 to check 26, so the problem shows once. W062 is never repaired automatically. This needs an installed plugin carrying objective 61.

**The App (optional).** The checks run on the workflow's own token by default. To run them as a GitHub App, create the App and install it on the repository, then set the repository or organization variable `DEVFLOW_APP_CLIENT_ID` and the secret `DEVFLOW_APP_PRIVATE_KEY`. The workflow mints a token scoped to the one repository (and a read-only one to check out DevFlow). Set `github.app_id` to the App's numeric id and rerun `gh setup --apply` only once those are set: the ruleset then accepts the two checks only from that App, and a status posted by the workflow token would not satisfy it.

**The two required checks.** The reusable workflow `.github/workflows/devflow-checks.yml` (the caller's `uses:` target, `github.checks_workflow`) runs `gh-check-cli.cjs` on `pull_request` and on `merge_group`, and posts each result as a commit status on the PR head (or the merge-queue group head). The statuses are the required contexts, so the match does not depend on job or workflow names. There are no path or branch filters; a required check that a filter stops from running would hold every merge forever.

| Context | Passes when |
|---|---|
| `devflow/linked-issue` | the PR targets the default branch and carries at least one closing reference (`Closes`, `Fixes` or `Resolves #N`, any tense, also `owner/repo#N` for this repository and issue URLs) to an issue that exists and is not itself a pull request. Fenced code and HTML comments are ignored, a reference to another repository does not count, and `Refs #N` in commits is noted but never required |
| `devflow/planning-consistency` | store mode is off or the PR is not a DevFlow objective PR (it carries no `devflow:pr` marker), which pass with the reason stated; otherwise the PR targets the default branch and closes the objective issue and every TRD issue linked under it, and none of those was closed as not planned. It reads the GitHub issue graph, never `.planning/`, which is an untracked cache |

A failing check names each problem on its own line in the status description and the workflow log, and an internal error posts an `error` status rather than leaving the check pending. After a merged PR into the default branch, the workflow's `reconcile` job closes any issue the PR should have closed and left open and adds one comment; it does nothing for an unmerged PR or another base branch.

**Verified on a real repository.** A smoke on 2026-10-05 and its re-run on `AO-Cyber-Systems/devflow-store-smoke` exercised this setup live. The re-run proved four things. The setup ruleset (with the repository-admin bypass) lets the workflow pull request merge with `gh pr merge <number> --admin --squash`. The reusable workflow, pinned to a commit, posts real verdicts as the two required statuses through `workflow_call`, with no `ENOENT` in the job logs. An objective pull request goes through the merge queue: the `merge_group` run 37310333089 succeeded and produced merge commit `34ba818e`. And `gh pr reconcile` after that merge reported `kept: []` and no warning. The same run showed both unpushed-commit refusals naming `gh pr sync`, and an objective issue titled after the objective's name. Not yet verified live: the issue-field option shape, which neither run exercised, and the wiki first-page retry, which only a test against a model of GitHub covers. The central location of the reusable workflow is owned by platform and operations; point `github.checks_workflow` at it. If an action fails, `gh setup` reports it as `failed` with GitHub's one-line error and exits 1 after trying the rest.

#### Where the code lives

For maintainers. Under `plugins/devflow/devflow/bin/lib/`:

- client and mirror: `gh.cjs`, `gh-client.cjs` (every `gh` call: writes at least 1 s apart, secondary limits retried, `github.enabled` gate, failure exits 1), `gh-mapping.cjs`, `gh-body.cjs`, `gh-issue.cjs`, `gh-project.cjs`, `gh-milestone.cjs`, `gh-pull.cjs`;
- store (objective 47): `gh-trd.cjs`, `gh-capability.cjs`, `gh-outbox.cjs`, `gh-outbox-flush.cjs`, `gh-hierarchy.cjs`, `gh-comments.cjs`, `gh-wiki.cjs`, `gh-cache.cjs`, `gh-store-cli.cjs`;
- planning verbs (objective 48): `planning-mode.cjs`, `planning-paths.cjs`, `planning-ledger.cjs`, `planning-verbs.cjs`, `planning-entity-verbs.cjs`, `planning-import.cjs`, `planning-verbs-cli.cjs`, `planning-drift.cjs`, `planning-audit.cjs`, `trd-bulk.cjs`, `gh-milestone-store.cjs`;
- branch and pull request (objective 49): `gh-pr.cjs`, `gh-pr-cli.cjs`, `commit-trailer.cjs`;
- enforcement and setup (objective 50): `gh-gate.cjs`, `gh-check.cjs`, `gh-check-cli.cjs`, `gh-health.cjs`, `gh-setup.cjs`, `gh-setup-cli.cjs`;
- migration (objective 51): `gh-backfill.cjs` (history closes, the estimate, resume detection) and `migrations/0011-github-store-backfill.cjs`.

State outside the repository: the outbox journal per repository in `~/.claude/devflow/state/outbox/` (`DEVFLOW_OUTBOX_DIR`), Project fields and the capability cache under `~/.claude/devflow/state/gh-project/` (`DEVFLOW_GH_CACHE_DIR`). The wiki clone is `.planning/wiki/` (remote from `github.wiki.remote` or `DEVFLOW_WIKI_REMOTE`).

### Mirror mode (store off)

With `github.store` off (the default), DevFlow mirrors objectives to GitHub one way: one issue per objective, its milestone, release notes and the Project fields. Skills and agents read the planning files; GitHub shows what they say, and nothing on GitHub changes them unless you run `gh pull <objective> --apply`. To make GitHub the system of record instead, see **Migrating an existing project** above. To stay in mirror mode and stop migration 0011 from asking, run `df-tools config-set github.mirror_only true` (see **Known behaviour** there).

#### Enable

In `.planning/config.json`:

```json
{
  "github": {
    "enabled": true,
    "repo": "owner/name",
    "milestone_prefix": "v",
    "labels": {
      "objective": "devflow:objective",
      "in_progress": "devflow:in-progress",
      "gaps": "devflow:gaps"
    }
  }
}
```

Prereqs: `gh` CLI installed and authenticated (`gh auth login`).

#### What syncs and when

| Trigger | Action | Manual command |
|---|---|---|
| End of `/devflow:new-project` (after roadmap creation) | Creates one milestone per roadmap version + one issue per objective, persists numbers to `.planning/.gh-mapping.json` | `df-tools gh sync --all` |
| End of `/devflow:execute-objective` | Pushes that objective: creates its issue on the first sync, updates the managed body sections, the sticky state comment and the Project fields, and writes `github_issue` to its OBJECTIVE.md. A failure prints a warning and the retry command | `df-tools gh sync <objective>` |
| Verifier finds gaps (`status: gaps_found`) | Posts the VERIFICATION.md `gaps:` block as an issue comment (`--kind verification`) | `df-tools gh comment <objective> @file:path --kind verification` |
| Verifier final pass passes | Closes the issue with link to verification report. In store mode nothing closes here: the issue closes when the objective PR merges | `df-tools gh close-issue <objective>` |
| Tag push (`vX.Y.Z`) | Generates rich release notes from SUMMARY.md files since previous tag, creates or edits the GitHub release | `df-tools gh sync-release vX.Y.Z` |
| Read back | Compares the issue with the local state and reports drift; `--apply` writes the differences | `df-tools gh pull <objective> [--apply]` |
| Resolve the issue chain | Prints the objective's issue and its parent issue chain as JSON | `df-tools gh resolve <objective>` |
| Migrate onto the store | Backfills the planning history and turns store mode on (see **Migrating an existing project**) | `df-tools upgrade --apply --only 0011 --confirm` |
| Rebuild the cache (store mode) | Rebuilds `.planning/` from GitHub: TRDs, SUMMARY and VERIFICATION, pages, a generated ROADMAP.md and STATE.md | `df-tools gh pull --all [--force]` |
| Queued writes (store mode) | Shows or drains the outbox of pending GitHub writes | `df-tools gh outbox status`, `df-tools gh outbox flush [--no-wait]` |
| Objective branch and PR (store mode) | One linked branch and one draft PR per objective, from execute start to merge | `df-tools gh pr start\|sync\|status\|merge\|reconcile <objective>` |
| TRD spec and scope (store mode) | Prints a TRD's effective spec, freezes it, adds a scope change or folds scope comments into the body | `df-tools gh trd spec\|freeze\|fold\|scope <trd>` |
| Orphans (store mode) | Lists TRD issues with no local file and local TRDs with no issue; deletes nothing | `df-tools gh orphans <objective>` |
| Manual recovery | All of the above | `/devflow:gh-sync [migrate [--dry-run]\|status\|flush\|pull\|setup [--apply]\|release <tag>\|<objective>\|--all]` |

`<objective>` takes any spelling: `46`, `046`, `46-github-sync-foundations`, `2.1`. `gh comment` and `gh close-issue` also take `#N` for a raw issue. `gh sync-objectives` is a deprecated alias of `gh sync --all`. `gh sync --all` keeps going past a failing objective, prints JSON on stdout and exits 1 if any objective failed.

#### How a sync treats an issue

- The first line of the body is `<!-- devflow:id=N -->`. DevFlow rewrites only the text between its `devflow:begin` and `devflow:end` section markers; anything a person wrote above, between or below them is kept byte for byte.
- An issue made by an older DevFlow has no markers. Its old generated text is kept and the managed sections are appended below it once. Delete the old text by hand if you want it gone.
- The sticky state comment carries `<!-- devflow:id=N kind=state -->` and is edited in place. An older `<!-- df:state -->` comment is adopted and rewritten with the new marker. Comments posted by `gh comment` and `gh close-issue` carry `devflow:id` markers with their kind.
- An issue is found through the mapping, then OBJECTIVE.md `github_issue`, then the `devflow:id` marker, then an `[Objective N]` title, and only then created. Two candidates stop that objective with an error; nothing is guessed or duplicated.
- Every `gh` call goes through one client: writes are at least 1 s apart, a secondary rate limit is retried after GitHub's `retry-after`, and list calls read every page.
- The milestone is the objective's `milestone:` frontmatter, else the current entry in the ROADMAP `## Milestones` list.
- Project v2 fields are discovered from GitHub and cached, not hardcoded. The project comes from PROJECT.md `org_project`, then `awareness.org_project_id` in config.json. With neither, project fields are skipped.
- `gh pull` after a push reports no drift: the push records GitHub's own `updatedAt` as the baseline.
- If an OBJECTIVE.md already has a different `github_issue`, your value is kept and the difference is reported.

#### Mapping file

`.planning/.gh-mapping.json` records which objective maps to which GitHub issue. It is version 3, keyed by the canonical objective id (`46`, `2.1`; leading zeros stripped):

```json
{
  "version": 3,
  "repo": "owner/name",
  "milestones": { "v1.4": 12 },
  "objectives": {
    "1": { "issue_id": 42, "state_comment_id": 901, "verified_at": null },
    "2.1": { "issue_id": 44, "state_comment_id": null, "verified_at": null }
  },
  "trds": {}
}
```

In mirror mode, commit it; in store mode it is cache, untracked by migration 0010. Re-running `gh sync --all` is idempotent — existing issues are edited, not duplicated. Older mapping shapes are converted by upgrade migration 0009, which also re-keys `.planning/.gh-sync-state.json` by objective id (`df-tools upgrade`, applied automatically on session start).

If the mapping file is lost, re-run `gh sync --all`: the `devflow:id` markers on GitHub lead back to the same issues and no duplicates are created.

### What does NOT sync

- In mirror mode, issues created in GitHub do not flow back to `.planning/`: the mirror is one way. File issues normally; they become input to `/devflow:plan-objective`. With store mode, `gh pull --all` is the way back, under the overwrite rules above.
- Per-task commits are not re-posted to issues (too noisy). Use `gh comment` manually if you want an update mid-execution.
- Project v2 boards are only updated for issues DevFlow syncs (status and similar fields, when a project is configured). DevFlow does not create boards, fields or options.

### Troubleshooting

```bash
# Is the integration reachable?
node ~/.claude/devflow/bin/df-tools.cjs gh status
```

`skipped` (exit 0, no `gh` calls) means the integration is off:
- `github.enabled is not true` — set `enabled: true` in config
- `github.repo is not set` — set `github.repo` to `"owner/name"`

These exit 1 with the reason and the fix:
- `gh CLI not installed` — install from https://cli.github.com
- `gh not authenticated` — run `gh auth login` (Project fields also need the `project` scope; `gh auth refresh` adds it)

**The backfill stopped with "not an error: N of M ops remain".** The hour budget, being offline, a long secondary rate limit or this run's write cap stopped migration 0011. Nothing is lost. Run `df-tools upgrade --apply --only 0011 --confirm` again after the resume time it prints; it skips the import and drains what is left, then verifies and untracks the cache. See step 4 of **Migrating an existing project**.

**The backfill or a flush halted.** `gh outbox flush` exits 2, or 0011 says `the outbox halted at op <seq>`: someone edited a DevFlow-managed section or a TRD body on GitHub. Run `gh outbox status`, then `gh outbox resolve <seq> --accept-remote` (keep GitHub's version) or `--overwrite` (keep the local write), then flush or apply again. While the journal is halted, `upgrade --apply --only 0011 --confirm` fails on migration 0010 first; resolve the halt, not the import 0010's message mentions.

**The wiki has no first page.** 0011's preflight refuses, `gh setup --require-wiki` exits 1, and a store flush that pushes a page halts with `reason: blocked`. Create the first wiki page once in the GitHub web UI (turn the wiki on first under Settings > General > Features > Wikis), then apply or flush again. DevFlow never falls back to `docs/` for this.

**The hourly budget.** The outbox sends at most 80 writes a minute and 450 an hour, measured over a rolling window in the journal, and one process sends at most 450 `gh` writes. `gh outbox flush` waits out the minute budget and exits 3 (pending) when the hour budget is spent; `--no-wait` (the hook) leaves rate-limited writes queued. `gh outbox status` shows the counts and why the last flush stopped. Run the flush again later, or keep working and let the `gh-flush` hook drain the queue.

**Known issues.**

- After a backfill, `gh pull --all` can list objective 1's `OBJECTIVE.md` as an orphan even though its issue exists. It is an attention item (exit 2), not a gap; 0011's verification does not refuse on it.
- Fixed in objective 59: the `.planning/state.json` and `.planning/STATE_ARCHIVE.md` conflicts between parallel executors' branches no longer need a hand merge. The merge driver and `merge-driver resolve` cover both files; see **Parallel wave merges** under the Command Reference.
- `objective remove` renumbers every later objective with a text pass over ROADMAP.md that also rewrites any `NN-NN` token that is a date (a progress row dated `2026-03-15` becomes `2025-02-15` when objective 1 is removed). Run it only on a ROADMAP.md you have committed, and read the diff. Fixing the pass is open.
- `milestone complete` appends a new MILESTONES.md entry on every run, so running it twice for one version leaves two entries, although `state_updated` is `false` the second time. Skipping the append when the version already has an entry is open.
- `git switch -c devflow-setup`, the first step `gh setup --apply` prints, fails when an earlier run left a local `devflow-setup` branch. That is covered under **Opening the workflow pull request**; changing the printed steps to cope with it is open.
- On a draft pull request with unpushed commits, `gh pr merge` refuses with `PR is still a draft; run verification first`, and only `verification post` then names `gh pr sync`. The draft check runs first on purpose (a test pins the order), so the remedy takes two steps. Naming `gh pr sync` in the draft refusal is open.
- A store-mode objective issue and its pull request are titled after the objective's name (`[Objective 2] Goodbye CLI` and `Objective 2: Goodbye CLI`), taken from the ROADMAP name, then the `OBJECTIVE.md` heading, then the slug. The title is set only when the issue or pull request is created, so one created before this fix keeps its slug title, and a title you edit by hand is never overwritten by a sync. The store footer change makes the next sync of an existing objective send one body update.

---

## CHANGELOG management

DevFlow ships with an auto-updater that keeps `CHANGELOG.md` in Keep-a-Changelog format from your conventional-commit history.

```bash
# Generate an entry for the next release from git log since the last tag
node ~/.claude/devflow/bin/df-tools.cjs changelog update --version v1.30.0

# Backfill an older release with explicit range
node ~/.claude/devflow/bin/df-tools.cjs changelog update \
  --version 1.27.4 --from 6aafba1 --to dcfba83

# Preview without writing
node ~/.claude/devflow/bin/df-tools.cjs changelog update --version v1.30.0 --dry-run

# Check whether a version already has an entry
node ~/.claude/devflow/bin/df-tools.cjs changelog check 1.29.0
```

---

## Keeping documentation current

DevFlow watches its own generated text and your project's planning docs for drift, and surfaces
what it finds as advisories — nothing here is auto-repaired.

- **W050** — a live doc (a project's CLAUDE.md DEVFLOW block, STATE.md, or DevFlow's own text)
  references a removed command with no successor.
- **W051** — `STACK.md`'s `provenance.reviewed` date is missing or older than the staleness
  threshold.
- **W052** — `STACK.md`'s declared `languages` disagree with what's actually detected in the repo.
- **W053** — a `.planning/codebase/*.md` map is more commits behind `HEAD` than the threshold.

They show up in three places: `validate health` (Check 14), `/devflow:status` (via
`df-tools validate docs --raw`, in a `## Documentation` section when there's something to say),
and `df-tools telemetry --raw`.

Command-name drift (renamed or removed `/devflow:`/`/df:` references) is the one class that *is*
fixed for you: migration `0007-doc-refs-fix` runs automatically at session start and rewrites stale
names inside your project's CLAUDE.md DEVFLOW block and STATE.md (outside `## Session Log`).
Historical records and removed-command references are never touched.

The staleness thresholds are overridable per project in `.planning/config.json`:

```json
{
  "docs": {
    "stack_review_stale_days": 90,
    "codebase_map_stale_commits": 50
  }
}
```

---

## Trying a Local Checkout of DevFlow

To run a feature that hasn't been released yet (e.g. to verify a change before it ships), install
the plugin from your local git checkout instead of the published marketplace. This is reversible --
the published build comes back exactly as it was.

0. Before changing anything:
   a. In Claude Code, run `/plugin` and note which `@aocyber` plugins are currently enabled.
   b. Optional, read-only: `node <checkout>/plugins/devflow/devflow/bin/df-tools.cjs upgrade --prune --dry-run` shows what the first prune of your real `~/.claude/devflow/backups/` would remove (it keeps anything younger than 14 days and the newest 5 per repo, and never touches `legacy-*`/`global-*`).
1. Install from your checkout (in any Claude Code session):
   - `/plugin marketplace remove aocyber`
   - `/plugin marketplace add <path-to-your-checkout>`
   - `/plugin install devflow@aocyber` (or enable it)
   - In a terminal: `rm ~/.claude/devflow/.plugin-version` -- if your checkout and the published build report the same version, `sync-runtime.js`'s version fast path would otherwise keep the OLD mirror; deleting the marker forces a re-mirror.
   - Quit that session.
2. Open a fresh session in a scratch fixture repo (never a real repository): `cd <your-fixture> && claude`. Confirm the mirror is your checkout, e.g. `node ~/.claude/devflow/bin/df-tools.cjs adopt --help` prints usage only if your checkout has `adopt` and the published build doesn't yet.
3. Exercise the feature (e.g. type `/devflow:adopt`) and check its output against what you expect.
4. Revert to the published build:
   - `/plugin marketplace remove aocyber`
   - `/plugin marketplace add AO-Cyber-Systems/devflow-claude`
   - `/plugin install devflow@aocyber`, and re-enable the plugins noted in step 0a
   - In a terminal: `rm ~/.claude/devflow/.plugin-version`, then open a new session (this re-mirrors the published build)
   - Confirm the revert: a command unique to your checkout (e.g. `adopt --help`) now fails again.
5. Optional cleanup: remove the scratch fixture and any `~/.claude/devflow/backups/<fixture>-*` your test run created; a leftover `.registry.json` entry is harmless.

**Gotcha:** if your checkout and the published marketplace build report the *same* version number,
`rm ~/.claude/devflow/.plugin-version` is required both on install **and** on revert -- otherwise
`sync-runtime.js` sees no version change and keeps serving the mirror it already has.

Commits are grouped by conventional-commit type (`feat` → Added, `fix` → Fixed, `perf` → Performance, etc.). Bare commits without a recognized type land under "Other". The `changelog-on-tag` hook blocks `git tag -a vX.Y.Z` until the entry exists, so you cannot ship a release without documenting it.
