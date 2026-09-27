---
objective: 37-adopt-existing-repos
kind: plugin
work: feature
status: registered
---

# Objective 37 — Adopt existing repos into DevFlow (`/devflow:adopt`)

Registered 2026-09-27; plan with `/devflow:plan-objective 37` after objective 36 ships.
Source: 2026-09-27 upgrade/bootstrap audit, section C. Depends on objective 36 (the version stamp,
the upgrade runner, managed blocks).

## Goal

Turn an existing non-DevFlow repo into a DevFlow project unattended, one repo or many:
`/devflow:adopt <path…>` or `--batch <file>`. The user has **11 repos** waiting.

## Decisions (user, 2026-09-27 — LOCKED)

- Output per repo: branch `devflow/adopt` + **one signed commit, no push**, plus a review report.
- Batch runs repos **sequentially**, one signing request at a time.
- A repo that is already a DevFlow project routes to `upgrade`, not adopt.

## Why (audit findings)

- `new-project --auto` assumes an empty project. It skips map-codebase, requires an idea document
  (errors without one), and still asks depth/git/agents and STACK.md questions.
- The interactive brownfield path exits after offering map-codebase and makes the user re-run it.
  map-codebase has no `--auto`.
- df-tools always uses `process.cwd()`; there is no `--cwd` or `--path` for most commands.
- There is no batch or fleet bootstrap. Objective 25 backfilled 6 repos by hand.
- Three brownfield detectors disagree (`project-state.cjs`, `init.cjs:597-622`,
  `brownfield-detector.cjs`, which is orphaned).

## Scope sketch (the planner re-cuts)

The pipeline:
1. map-codebase in auto mode.
2. PROJECT.md inferred from code: What This Is, Validated requirements, `kind`, all with confidence.
3. STACK.md from code evidence (`stack init --from codebase`).
4. config, STATE.md and state.json.
5. ROADMAP.md with an empty current milestone. **No invented objectives.**
6. The CLAUDE.md managed block.
7. The `upgrade` stamp.

Also:
- A per-repo review report listing low-confidence inferences.
- A batch summary table.
- A global `--cwd`.
- One unified detector.

**Before execution:** get the user's list of 11 repositories (paths or `owner/name`).
