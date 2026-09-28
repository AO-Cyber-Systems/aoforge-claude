---
objective: 37-adopt-existing-repos
kind: plugin
work: feature
tdd: tdd
status: planned
overrides:
  tdd: tdd
---

# Objective 37 — `/devflow:adopt`: user-triggered adoption of a repo, and daily backup pruning

**Re-scoped by the user on 2026-09-28.** This is NOT a batch adoption of the user's 11 repos; those
are out of scope and must never be touched. It builds a user-triggered `/devflow:adopt [path]` and
proves it works end to end on scratch fixture repos only.

Source: the 2026-09-27 upgrade/bootstrap audit, section C. It depends on objective 36 (the version
stamp, `upgrade` runner, managed blocks and SessionStart hook), all on branch
`feat/stack-profile-loader`.

## Goal

A user in any repo types `/devflow:adopt` (or `/devflow:adopt <path>`), and DevFlow turns it into a
DevFlow project unattended:

- an existing codebase is mapped;
- PROJECT.md and STACK.md are inferred from the code;
- config, STATE, `state.json` and ROADMAP are created, with no invented objectives;
- the CLAUDE.md managed block is added and the version is stamped;
- everything lands on a `devflow/adopt` branch as one signed commit, never pushed;
- a review report lists every low-confidence inference.

## Decisions (user — LOCKED)

- **User-triggered, one repo per invocation.** No batch mode and no fleet run. The target is the
  cwd, or `[path]`.
- **Fully unattended.** It never asks. Anything uncertain goes into `.planning/ADOPT-REPORT.md` as
  "needs review" with its confidence and evidence. It always commits to the `devflow/adopt` branch.
  It never pushes.
- **Routing by repo state:**
  - already a DevFlow project (`.planning/` present) → `upgrade` (objective 36), never
    re-scaffolded;
  - empty or greenfield repo → say so and point at `/devflow:new-project`;
  - existing codebase → the adopt pipeline.
- **Refuse, don't guess:** a dirty working tree, a rebase/merge in progress, a detached HEAD, or a
  path that isn't a git repo each make it stop with the reason. It never stashes or resets the
  user's work.
- **E2E proof = both:**
  - (a) a simulated run: an agent follows the checkout's adopt skill and workflow verbatim against
    scratch fixture repos, using the checkout's df-tools, and its output passes `validate health`;
  - (b) a human check: the plugin is installed locally from this checkout, and a fresh session in a
    scratch fixture repo types `/devflow:adopt`. The user runs this; it changes their plugin config
    and is reversible.
- **Backups are pruned daily.** Claude Code has no persistent local scheduler: `CronCreate` is
  session-only (7-day expiry) and `schedule`/`RemoteTrigger` run in the cloud with no access to
  `~/.claude`. So pruning runs from the objective 36 SessionStart path, throttled to once per 24 h
  by a last-prune timestamp.
  - Default retention: keep backups younger than 14 days, and always the newest 5 per repo.
  - Configurable in `~/.claude/devflow/global-config.json` (`backups.retain_days`,
    `backups.keep_min`).
  - Adopting a repo, and `new-project`, register the repo with the pruner. A persistent OS scheduler
    (launchd/cron via `service-installer.cjs`) is **not** installed by adopt; at most, a documented
    opt-in command.

## Deliverables (the planner cuts the TRDs)

1. **One project-state detector** (`devflow` | `greenfield` | `brownfield` | `scratch`, plus
   signals) that the three existing heuristics delegate to: `project-state.cjs`, `init.cjs:597-622`
   and the orphaned `brownfield-detector.cjs`.
2. **A global `--cwd <dir>` flag for df-tools** (process.chdir before dispatch), so the skill can
   target `[path]`.
3. **`df-tools adopt preflight|scaffold|report [--cwd]`**, the deterministic half:
   - preflight: state, cleanliness, branch;
   - scaffold: writes config, STATE, `state.json` and ROADMAP (empty current milestone), runs
     `stack init --from codebase --write` and adds the CLAUDE.md managed block (insert allowed here,
     unlike migration 0005), then runs `upgrade --apply` to stamp;
   - report: ADOPT-REPORT.md.

   It's idempotent. A half-finished adopt resumes rather than duplicating.
4. **The `skills/adopt/SKILL.md` + `workflows/adopt.md` orchestrator**, the LLM half:
   - map-codebase in a non-interactive mode (no Refresh/Update/Skip prompt);
   - PROJECT.md inferred from the codebase maps and README: What This Is, Core Value, Validated
     requirements (existing capabilities), `kind` + `default_work` with confidence, empty Active,
     Constraints;
   - then scaffold, then `validate health` must show no errors, then the report, then one signed
     commit on `devflow/adopt`.

   Register it in HELP_TABLE, the routing table and `route-intent` ("adopt this repo", "set up
   devflow here", "bootstrap this repo"). Point the `classify-session` init-offer preamble at
   `/devflow:adopt` for brownfield repos.
5. **Backup pruning:** `lib/backup-prune.cjs` (a pure policy function plus a throttled runner),
   called from the SessionStart upgrade path and `df-tools upgrade --prune [--dry-run]`. Registering
   a repo is part of adopt and new-project. Tests use a fake HOME.
6. **Fixture repos for E2E**, built by a factory: a Go service, a Flutter app, a Node CLI, an empty
   repo, an already-DevFlow repo, and a dirty tree. Plus the simulated-run TRD (E2E proof a).
7. **Docs:** USER-GUIDE, CHANGELOG `[Unreleased]`, the repo CLAUDE.md skill/hook inventory, and the
   exact local-dev-install steps for E2E proof (b), ending in a `checkpoint:human-verify`.

## Runtime model (binding — as objectives 35/36)

- CommonJS, synchronous fs, no new npm dependencies. YAML via `yaml-lite.cjs`.
- `userHome` is injected. **Tests never read or write the real `~/.claude`.**
- Fixture git repos set `commit.gpgsign=false` on the fixture only.
- Commits go only through `df-tools commit`. If signing fails, stop and report; never bypass.
- Execution is serialized: one TRD at a time in the main checkout.
- One plain command per Bash call. No DevFlow gate is bypassed. Never use port 8080. No version
  bump, tag or push.
- **Never touch any real user repository.** E2E runs only in scratch fixture repos under the session
  scratchpad or mkdtemp.

## Regression baseline

`baseline-failures.tsv` (copied from objective 36: 21 known environment failures), with the same
classification rule. Never edit it to pass a gate.

## Definition of done

- In a scratch Go-service fixture, the simulated `/devflow:adopt` run produces:
  - a `devflow/adopt` branch with exactly one commit;
  - a `validate health` result with no errors;
  - a STACK.md that `stack validate` accepts;
  - a ROADMAP with no invented objectives;
  - a CLAUDE.md block with the version stamped;
  - an ADOPT-REPORT.md that lists the low-confidence items.
- The same holds on the Flutter and Node fixtures.
- Each routing case behaves as specified:
  - the already-DevFlow fixture routes to `upgrade`;
  - the empty fixture points at `new-project`;
  - the dirty fixture refuses with its reason and leaves the tree unchanged.
- `df-tools --cwd <fixture> adopt preflight` works from another directory.
- Pruning, with a fake HOME: a backup older than 14 days is removed unless it is one of the newest 5
  for its repo, and a second run within 24 h is a no-op.
- The ROADMAP-corruption bug is fixed first by a separate `/devflow:debug`. Completing this objective
  must leave ROADMAP.md and STATE.md undamaged, and this is checked.
- E2E proof (b) instructions exist, and the user's human-verify result is recorded.

## Out of scope

- Any of the user's real repos, and batch adoption.
- Documentation auto-correction (objective 38).
- Installing an OS scheduler.
- A release.
