---
objective: 51-github-migration-and-docs
trd: "09"
subsystem: skills
tags: [gh-sync, store-mode, migration-0011, docs, skill-contract, tdd]

requires:
  - objective: 51-github-migration-and-docs
    provides: "51-05 planning import --dry-run preview + estimate; 51-06/51-07 migration 0011 (detect reason, pending/halted/preflight/verify/handoff refusals, STORE_COMMIT_STEPS, SETUP_NOTE)"
provides:
  - "/devflow:gh-sync repurposed in place as the GitHub store operator: migrate [--dry-run], status, flush, pull, setup [--apply], release <tag>, and <objective>|--all as the store-off mirror"
  - "gh-sync-skill.repo.test.cjs pins the mode list, AskUserQuestion, the migrate commands, the absence of a mapping-file commit and of a raw git commit, and the gh-sync modes used by the flow chains"
affects: [51-10]

tech-stack:
  added: []
  patterns:
    - "skill contract pinned by a repo test over the prose (frontmatter hint parsed into modes, and those modes checked against the chains that call the skill)"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs
  modified:
    - plugins/devflow/skills/gh-sync/SKILL.md
    - plugins/devflow/skills/flow/SKILL.md
    - plugins/devflow/skills/sync-roadmap/SKILL.md
    - plugins/devflow/devflow/templates/global-claude-md.md
    - plugins/devflow/devflow/workflows/help.md
    - README.md

key-decisions:
  - "The plan step runs `upgrade --check --only 0011` WITHOUT `--raw`. The TRD's `--raw` form prints only the projectSummary line ('1 needs confirmation (0011)'), which drops the plan sentence. The JSON carries that sentence in `pending_confirm[].reason`, and in `skipped[].reason` when there is nothing to do."
  - "No arguments means `status` in store mode and `--all` with the store off. `objectives` still means `--all`. In store mode `<objective>|--all` points at `flush`, and keeps `gh sync <objective>` as the recovery re-push."
  - "The commit after a migrate is shown from the migration's notes (branch devflow-store-cache, logged DEVFLOW_SKIP_GH_GATE escape, push, PR). The agent runs it only when the user asks, and never as a raw `git commit`."
  - "`Write` was dropped from the skill's allowed-tools. GitHub enablement goes through `df-tools config-set`, and no step writes a file directly."
  - "Old trigger phrases are kept and the new ones added. route-intent.js keys on its own regex, not on the description, and is unchanged."

requirements-completed: [GMD-03]

verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: 10min
completed: 2026-10-01
---

# Objective 51 TRD 09: `/devflow:gh-sync` as the GitHub store operator Summary

**`/devflow:gh-sync migrate` handles the whole migration.**
- **Plan first:** it shows the backfill plan and its request estimate, from `planning import --dry-run` and `upgrade --check --only 0011`.
- **Approval:** it asks with AskUserQuestion and states the cost: 80 writes a minute, 450 an hour, store mode from the start.
- **Apply:** it then runs `upgrade --apply --only 0011 --confirm`.
- **After the apply:** it explains a pending stop ("N ops remain; re-run `/devflow:gh-sync migrate` later or keep working (the gh-flush hook drains it)"), a halt, other refusals, and the branch plus logged-escape commit.

The status, flush, pull, setup and release modes cover the rest of store operation. The flow chains, the help reference, the global routing template and the README now describe the store model.

## What was built

- **`skills/gh-sync/SKILL.md`** (95 lines, previously 98):
  - Frontmatter: new description and triggers, with "migrate to github", "move planning to github", "github store" and "flush the outbox" added and the old triggers kept. The argument-hint is `[migrate [--dry-run]|status|flush|pull|setup [--apply]|release <tag>|<objective>|--all]`. allowed-tools are Read, Bash and AskUserQuestion.
  - `<objective>`: says GitHub is the system of record when the store is on, and holds the mode table.
  - `<process>`: one step per mode. The old "commit `.planning/.gh-mapping.json`" step is gone. The mapping is now described as recoverable, and as cache in store mode.
  - The line "create or edit the GitHub release" is kept, so the planning-writes EXEMPT entry still matches.
- **`skills/flow/SKILL.md`:**
  - build-and-sync and verify-and-sync say "in store mode this flushes the outbox; with the store off it mirrors the objective to its issue".
  - ship-and-release uses `/devflow:gh-sync release {tag}`. It previously used the nonexistent `sync-release` mode.
- **`skills/sync-roadmap/SKILL.md`:** `df:gh-sync` is replaced by `/devflow:gh-sync`.
- **`templates/global-claude-md.md`:** now reads `GitHub store (migrate, status, flush, setup, release) → /devflow:gh-sync`.
- **`workflows/help.md`:** a `/devflow:gh-sync` entry under Utility Commands that lists `migrate`. The rename table is untouched.
- **`README.md`:** the GitHub bullet now covers the opt-in store as system of record, the `gh sync --all` mirror for store-off projects, and `/devflow:gh-sync migrate`. `sync-objectives` no longer appears.
- **Unchanged:** `skill-route.cjs` (DEPRECATION_MAP, REMOVED_COMMANDS) and `route-intent.js`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: pin the skill contract, rewrite gh-sync | `node --test gh-sync-skill.repo.test.cjs planning-writes.repo.test.cjs doc-refs.repo.test.cjs` (+ df-tools-deprecations) | 0 | PASS 30/30 |
| 2: flow, sync-roadmap, help, global template, README | `node --test gh-sync-skill doc-refs df-tools-deprecations devflow-workflows planning-writes` + `hooks/route-intent.test.js` + `global-upgrade.test.cjs` | 0 | PASS 177/177; `rg -n "sync-objectives" README.md` is empty |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (T1, 9ed0a199) | `node --test gh-sync-skill.repo.test.cjs` | 1 | FAIL 2/2: the hint lacks `migrate`; three lines tie a commit to `.gh-mapping.json` |
| GREEN (T1, 2e4351dc) | same + planning-writes, doc-refs, deprecations | 0 | PASS 30/30 |
| RED (T2, fc254345) | `node --test gh-sync-skill.repo.test.cjs` | 1 | FAIL 2/4: flow line 79 uses `sync-release`, and the chains lack store wording (tests 3, 3b) |
| GREEN (T2, aa7df9e9) | the Task 2 verify set | 0 | PASS 177/177 |
| REFACTOR | none | n/a | n/a |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `node --test plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs` | 0 | PASS 4/4 |
| regression | `node --test doc-refs.repo.test.cjs planning-writes.repo.test.cjs df-tools-deprecations.repo.test.cjs` | 0 | PASS |
| full suite | `npm test` (worktree) | 1 | 8386 tests: 8327 pass, 9 fail, 50 skipped. All 9 failures are the known worktree-environment ones, not fixed. Three are in `devflow-watch.test.cjs` and six in `handoff-e2e.test.cjs`, which includes MA-7. All come from "node-pty not installed" in the worktree. No other file fails. |

## Deviations from Plan

### Auto-fixed Issues

None.

### Plan adjustments

**1. [Plan] The help entry was added in `workflows/help.md`, not `skills/help/SKILL.md`.**
- **Why:** The help skill only renders `workflows/help.md` ("no additions or modifications"), and no gh-sync modes were listed anywhere, so the help skill had nothing to change. The entry is under Utility Commands; the rename table is untouched (doc-refs tests 4-5 green). `workflows/help.md` is outside files_modified, and `skills/help/SKILL.md` is unchanged.
- **Commit:** aa7df9e9

**2. [Plan] The plan step runs `upgrade --check --only 0011`, not `... --raw`.** The reason is in the key decisions.

**3. [Plan] Added test 3b.** It pins the build-and-sync and verify-and-sync store wording, which the TRD's Decisions require but its test list did not cover.

### Notes

- **The global template change will not reach existing installs on its own.** `template_version` stays "2", and global-upgrade test 13 pins "version 2". `global-upgrade` rewrites an existing block only when the template version goes stale (`managedBlock.isStale`). So the new routing line reaches new and adopted blocks, and existing `~/.claude/CLAUDE.md` blocks pick it up at the next template version bump. A bump would need test 13 changed too; that is a 51-10 or release-time call.
- **Edit gate:** no write was denied, so no skill marker was set.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 5/5
  - mode table and system-of-record wording (test 1)
  - migrate plan, approval, apply, resume, budget, hook and commit steps (test 2 plus review)
  - no mapping commit, rename maps unchanged (test 2; `skill-route.cjs` untouched)
  - flow chains and README (tests 3 and 3b, rg)
  - doc-refs, planning-writes, deprecations and route-intent green
- Gate failures: None

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/gh-sync-skill.repo.test.cjs
- FOUND: plugins/devflow/skills/gh-sync/SKILL.md
- FOUND commits: 9ed0a199, 2e4351dc, fc254345, aa7df9e9
