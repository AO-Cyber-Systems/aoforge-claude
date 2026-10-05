---
objective: 48-planning-write-path-migration
trd: "21"
subsystem: planning-prose
tags: [gwp-02, sc1, prose-migration, misc-group, codebase-map, help, tdd]
requires:
  - 48-04 (planning-audit scanner, ratchet, misc.json baseline of 27)
  - 48-15 (verb CLI forms: doc put, planning draft, objective put/set-status, state, gh pull)
provides:
  - "misc audit group at zero findings (misc.json holds only _comment)"
  - "map-codebase: mapper agents write drafts; the orchestrator publishes each with doc put codebase/<NAME>.md, one at a time, after a draft secret check"
  - "help.md 'Planning Verbs' section: one line per 48-15 verb plus the store-mode rule"
affects:
  - 48-23 (with 48-16..48-20 brings every baseline to empty so the baselines can be deleted)
tech-stack:
  added: []
  patterns: [draft-then-publish from orchestrator, planning-mode guard for generated views, inline allow marker for df-tools-internal behaviour]
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/misc.json
    - plugins/devflow/agents/codebase-mapper.md
    - plugins/devflow/devflow/workflows/map-codebase.md
    - plugins/devflow/skills/map-codebase/SKILL.md
    - plugins/devflow/devflow/workflows/help.md
    - plugins/devflow/devflow/workflows/health.md
    - plugins/devflow/devflow/workflows/resume-project.md
    - plugins/devflow/devflow/workflows/workstreams-merge.md
    - plugins/devflow/devflow/workflows/workstreams-setup.md
    - plugins/devflow/skills/gh-sync/SKILL.md
    - plugins/devflow/skills/sync-roadmap/SKILL.md
decisions:
  - "Mapper agents only write drafts (planning draft codebase/<NAME>.md); a new publish_maps step in map-codebase runs doc put per map, sequentially, so four mappers never race on the store"
  - "publish_maps greps the drafts for secrets BEFORE any doc put: in store mode a published map leaves the machine, so the existing post-write scan_for_secrets is too late there"
  - "health.md regenerateState row takes an inline allow marker: it documents what `validate health --repair` does itself, not an agent write"
  - "resume-project reconstruction: store mode regenerates STATE.md with gh pull --all; local mode uses validate health --repair then state patch / state record-session"
  - "workstreams-merge keeps reconcile in both modes (it also updates workstreams.json and reports next_objective) and, in store mode only, follows it with gh pull --all plus state add-decision/add-blocker"
metrics:
  duration: ~9 min
  started: 2026-10-01T13:23:42Z
  completed: 2026-10-01T13:31:52Z
  tasks: 2
  files: 11
tokens_input: 7010012
tokens_output: 47344
tokens_cache_read: 6883359
tokens_cache_write: 126521
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 48 TRD 21: Prose migration, audit group `misc` (codebase map, sync, status, help, workstreams) Summary

**The last prose group now routes every planning write through a df-tools verb. Codebase mappers write drafts, and the map-codebase orchestrator publishes each one with `doc put codebase/<NAME>.md` after a secret check. help.md has a Planning Verbs reference and states the store-mode rule. The `misc` baseline is empty, down from 27 findings.**

## What changed

- **Codebase mapping** (codebase-mapper.md, map-codebase.md, map-codebase SKILL.md):
  - Each mapper gets its path with `df-tools planning draft codebase/<NAME>.md` and writes there.
    - The path is deterministic, and an existing draft is never re-seeded.
    - Mappers never publish.
  - A new `publish_maps` step runs after `verify_output`. It first greps the drafts for secrets, then runs `doc put codebase/<NAME>.md --from <draft>` for each map, one at a time.
  - `create_structure` no longer runs `mkdir`.
  - The confirmation format lists draft paths.
  - Non-interactive mode covers `publish_maps`. A secret hit there does not pause; it is left for `adopt report`.
  - The mapper now states explicitly that it must never write `.planning/STACK.md` (U-1). That file is drafted by `stack init` and approved by the user.
- **help.md:**
  - The map-codebase, discuss, research, plan, execute, quick, debug and todo entries now name their verbs.
  - map-codebase is now described accurately: codebase-mapper agents (not Explore) and 8 docs (it had said 7).
  - A new `## Planning Verbs` section lists every 48-15 verb on one line each. It states the rule "in store mode `.planning/` is a read-only cache: use the verbs", and that local mode writes the same files.
- **gh-sync:** `gh sync` itself records `github_issue`. Any other OBJECTIVE.md change goes through `objective put <id> --from <draft>`.
- **sync-roadmap:**
  - A store-mode note says write and `--interactive` are no-ops (exit 0) and points to `gh pull --all`. This behaviour is from 48-13 and was confirmed in `roadmap-reconcile-cli.cjs`.
  - The note sits beside both the rules and process step 4.
  - The "Edit manually" advice is replaced by `objective set-status <id> reopened`, plus a hand fix of the local ROADMAP `**Status:**` line.
- **resume-project:** `update_session` uses `state record-session --stopped-at ... --resume-file ...`. Reconstruction depends on mode:
  - store: `gh pull --all`;
  - local: `validate health --repair`, then `state patch` and `state record-session`.
- **workstreams-merge:** the description of reconcile is reworded. A store-mode guard regenerates the views with `gh pull --all`.
- **workstreams-setup:** a regex misread is reworded ("create git worktrees" sat within 80 characters of ROADMAP).
- **health.md:** the inline allow marker on the `regenerateState` repair-table row.
- status/SKILL.md, pause-work.md and progress.md had no findings. Status only reads, and pause writes `.continue-here.md`, which is runtime because it sits under a dot segment. They needed no edit.

## Per-file findings (misc group)

| File | Before | After |
|---|---|---|
| agents/codebase-mapper.md | 2 | 0 |
| workflows/health.md | 1 | 0 (1 allowed by marker) |
| workflows/help.md | 8 | 0 |
| workflows/map-codebase.md | 5 | 0 |
| workflows/resume-project.md | 2 | 0 |
| workflows/workstreams-merge.md | 1 | 0 |
| workflows/workstreams-setup.md | 1 | 0 |
| skills/gh-sync/SKILL.md | 1 | 0 |
| skills/map-codebase/SKILL.md | 2 | 0 |
| skills/sync-roadmap/SKILL.md | 4 | 0 |
| **total** | **27** | **0** |

## Task Commits

| Task | Commit | Message |
|---|---|---|
| 1 RED | 3a59b0dc | test(48-21): misc group must have zero planning writes |
| 1 GREEN | 3f89d17f | docs(48-21): codebase maps publish with doc put |
| 2 | 3217a0da | docs(48-21): sync, status and help use planning verbs |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED baseline + codebase mapping | `node --test .../planning-writes.repo.test.cjs`, filtered for map-codebase/codebase-mapper | 0 matches in the failure list | PASS |
| 1 | `rg -n "doc put codebase/" .../workflows/map-codebase.md` | 0 (lines 7, 274) | PASS |
| 2: remaining misc files | `node --test .../planning-writes.repo.test.cjs .../doc-refs.repo.test.cjs` | 0 (28/28) | PASS |
| 2 | `rg -n "df-tools[^\|]*2>/dev/null"` over every files_modified path | no match | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test .../planning-writes.repo.test.cjs` (misc.json emptied) | 1 (gate lists 27 misc findings) | FAIL (correct) |
| GREEN (T1) | same, filtered for mapping files | mapping files absent from the list | PASS (correct) |
| GREEN (T2) | `node --test .../planning-writes.repo.test.cjs .../doc-refs.repo.test.cjs` | 0 (28/28) | PASS (correct) |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` | 0 | PASS |
| regression | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS |
| full suite | `npm test` | 1: 7458 tests, 7425 pass, 1 fail, 32 skipped | PASS except the known flake |

**Full suite:** the only failure is MA-7 in `handoff-e2e.test.cjs`, the known doctl PTY flake. It was noted and not fixed, as instructed. roadmap-reconcile E2E1 passed because the suite ran before this SUMMARY existed. Once this SUMMARY lands, E2E1 is expected to fail until the orchestrator ticks 48-21 in ROADMAP.

## Invariant check (github.store off)

- **Prose uses the verbs in both modes.**
  - In local mode `doc put`, `state record-session`, `objective put` and the rest write the same `.planning/` files as before.
  - No instruction tells an agent to skip a write in local mode.
  - The store-only branches (resume reconstruction, the workstreams-merge follow-up, the sync-roadmap no-op note) leave local behaviour exactly as it was.
- **The map-codebase commit step is unchanged** (`--files .planning/codebase/*.md CLAUDE.md`). `df-tools commit` already drops gitignored planning paths in store mode (48-10).
- **No code changed.** This TRD edits prose and one fixture only.

## Deviations from Plan

1. **[Rule 2 - Security] A draft secret check now runs before publishing.**
   - **Found during:** Task 1.
   - **Issue:** `scan_for_secrets` runs after CLAUDE.md is generated. With publishing moved to `doc put`, a store-mode publish would push a map to GitHub before any scan, which takes a secret off the machine.
   - **Fix:** `publish_maps` greps the drafts with the same pattern first and pauses on a hit. Non-interactive mode leaves the hit for `adopt report`, as before.
   - **Commit:** 3f89d17f.
2. **[Accuracy] help.md map-codebase entry.** "Explore agents" became codebase-mapper agents and "7 documents" became 8, because PATTERNS.md was missing. The plan-objective entry was also changed from `JOB.md` to TRD and `plan put-trd`. These lines sat next to flagged lines and described the old write path.
3. **[Process] Bad preflight run, released.** The first preflight ran from the main checkout because the Bash cwd is the main repo, and it claimed that checkout for 48-21. I released that claim at once with `exec-context release`, and the check passed from the worktree via `--cwd`. No file was written in the main checkout.
4. **[Process] Resumed.** An orchestrator message asked me to resume at Task 2. The session itself was continuous, so nothing was redone.

## Post-TRD Verification

- Auto-fix cycles used: 1 (a sync-roadmap trigger line still matched because "update" sat within 80 chars of ROADMAP; it was split onto its own line)
- Must-haves verified: 5/5
  - misc.json holds only `_comment` and SC1 is green.
  - Maps go through `doc put codebase/<NAME>.md` from the orchestrator, and the mapper never writes `.planning/STACK.md`.
  - gh-sync uses `objective put`, sync-roadmap's store no-op is explained, and resume uses `state record-session`.
  - The help.md Planning Verbs section and its store-mode rule are in place.
  - No df-tools verb line redirects stderr.
- Gate failures: none. The full suite's only failure is the MA-7 flake.

## Self-Check: PASSED

- FOUND: misc.json (only `_comment`)
- FOUND: the `doc put codebase/` lines in map-codebase.md
- FOUND: commits 3a59b0dc, 3f89d17f, 3217a0da on df/exec-48-21
- STATE.md and ROADMAP.md were deliberately not edited; the orchestrator updates them after the merge.
