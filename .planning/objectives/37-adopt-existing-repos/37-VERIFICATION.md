---
objective: 37-adopt-existing-repos
verified: 2026-09-28T11:45:00Z
status: passed
score: 7/7 must-haves verified (ADP-01..ADP-07)
not_independently_verified:
  - item: "Historical /devflow:debug ROADMAP-corruption fix commit (predates 37-01)"
    reason: "Not audited directly; inferred safe from the current clean ROADMAP.md and this session's own scratch replay (see DoD table)."
  - item: "Refusal on rebase/merge-in-progress and detached-HEAD (37-05's other refusal branches)"
    reason: "Only dirty-tree and non-git-path refusals were independently re-driven end-to-end; the other two refusal branches were not re-exercised in this pass (coordinator called time before this was reached)."
  - item: "SessionStart hook (`upgrade-project.js`) invoking `backup-prune.runThrottled` live"
    reason: "The pure policy + throttle were verified directly against `backup-prune.cjs`; the hook wiring itself was confirmed by code/doc inspection (upgrade-cli.cjs `--prune`/`--register` flags, CLAUDE.md/USER-GUIDE text) but not executed as a live SessionStart event."
  - item: "Full node --test regression suite"
    reason: "Not re-run in this pass. `git diff --stat 3ee4cfb HEAD -- plugins scripts` returned empty (confirmed independently below), so the suite's last recorded run (37-11 SUMMARY: 3975 tests, 3942 pass, 1 pre-existing failure MA-7, matching baseline-failures.tsv line 16) still applies to this HEAD."
---

# Objective 37: `/devflow:adopt` Verification Report

**Objective Goal:** A user in any repo types `/devflow:adopt [path]`, and DevFlow turns it into a DevFlow project unattended — maps the code, infers PROJECT.md/STACK.md, scaffolds config/STATE/ROADMAP with no invented objectives, adds the CLAUDE.md block and stamps the version, makes one signed commit on `devflow/adopt` (never pushed), and writes an ADOPT-REPORT.md of low-confidence items. Backups are pruned daily (14 days / keep 5), throttled to once per 24h.

**Verified:** 2026-09-28, repo `/Users/justin/dev/devflow-claude`, branch `feat/stack-profile-loader`, HEAD.
**Status:** passed
**Method:** re-ran the deterministic half of the pipeline (`adopt preflight/begin/scaffold/report`) end-to-end against **fresh, independently-built fixtures** (via the checkout's own `adopt-fixtures.cjs`, never reusing test-file fixture code), using the CHECKOUT's `df-tools.cjs`, a fully faked HOME, and the shipped structural checker (`adopt-e2e-assert.cjs`). LLM-only steps (map-codebase, PROJECT.md inference) were stood in with deterministic literal fixture data (`writeMappedDocs`/`writeProjectMd`/`writeInferences`), consistent with the evidence rule that the LLM half cannot be re-run deterministically here.

## Definition of Done — Evidence

| # | DoD bullet | Status | Evidence |
|---|---|---|---|
| 1 | Go fixture: `devflow/adopt` branch, one commit, `validate health` no errors, STACK.md valid, ROADMAP zero objectives, CLAUDE.md block stamped, ADOPT-REPORT.md needs-review list | ✓ VERIFIED | Fresh Go-service fixture built via `adopt-fixtures.cjs make go-service`; ran `adopt preflight→begin→scaffold→report`+commit; `adopt-e2e-assert.cjs check` → `"ok": true`, all 13 checks `ok:true` (branch_is_adopt, one_commit, tree_clean, not_pushed, health_no_errors, stack_valid, roadmap_zero_objectives, claude_block_versioned v=2, stamp_current 2.10.1, report_needs_review 1 medium field, project_kind_valid, commit_contents 16 files under `.planning/`/`CLAUDE.md`, no_secrets). Matches 37-11-SUMMARY.md's independently-recorded run. |
| 2 | Same holds on Flutter fixture | ✓ VERIFIED | Fresh `flutter-app` fixture, same pipeline, `adopt-e2e-assert.cjs check` → `ok:true`, all 13 checks pass (`project_kind_valid: kind="app" default_work="feature"`). |
| 3 | Same holds on Node fixture | ✓ VERIFIED | Fresh `node-cli` fixture, same pipeline, `adopt-e2e-assert.cjs check` → `ok:true`, all 13 checks pass (`project_kind_valid: kind="cli"`). |
| 4 | Already-DevFlow fixture routes to `upgrade` | ✓ VERIFIED | Fresh `devflow` fixture; `adopt preflight` → `{"route":"upgrade","message":"already a DevFlow project","next":"df-tools --cwd <target> upgrade --check"}`. |
| 5 | Empty fixture points at `new-project` | ✓ VERIFIED | Fresh `empty` fixture; `adopt preflight` → `{"route":"new-project","message":"no source code yet"}`. |
| 6 | Dirty fixture refuses with reason, tree unchanged | ✓ VERIFIED | Fresh `dirty` fixture (uncommitted `main.go` edit + untracked `notes.txt`); `adopt preflight` → exit 3, `{"route":"refuse","reason":"dirty-tree","message":"...main.go, notes.txt"}`. `git status --porcelain` after the call: identical (` M main.go`, `?? notes.txt`) — nothing stashed or reset. |
| 6b | Non-git path refuses | ✓ VERIFIED (additional, beyond DoD text but in the Decisions section) | Plain non-git dir; `adopt preflight` → exit 3, `{"route":"refuse","reason":"not-a-git-repo"}`. |
| 7 | `df-tools --cwd <fixture> adopt preflight` works from another directory | ✓ VERIFIED | Invoked with shell cwd = repo root (`/Users/justin/dev/devflow-claude`), `--cwd` pointed at a fixture under the scratchpad; `target` in the JSON response correctly resolved to the fixture path, not the shell cwd. |
| 8 | Pruning (fake HOME): >14-day backup removed unless newest-5; second run within 24h is a no-op | ✓ VERIFIED | Independent hand-built spot-check (own seeding code, not the test file's `seedBackups`) against `backup-prune.cjs` directly: repo with ages [1,2,3,4,5,20,30] days → `runPrune` removed exactly the 20d and 30d entries, kept 5 (the newest). `runThrottled` at `NOW` and `NOW+23h` both returned `{throttled:true}` with nothing removed; at `NOW+25h` it actually ran and removed a newly-seeded 30-day entry. |
| 9 | ROADMAP-corruption bug fixed first; completing obj 37 leaves ROADMAP.md/STATE.md undamaged, checked | ✓ VERIFIED (replay); historical fix not re-audited | Scratch-copy replay (see below) of `roadmap update-job-progress 37` + `objective complete 37` on a full `.planning/` copy: ROADMAP.md diff = exactly 2 lines changed (progress-table row `0/16 Planned —` → `16/16 Complete 2026-09-28`, and the `**Jobs:**` summary line `0/16` → `16/16`); STATE.md diff = 0 lines. `state.json` also came out byte-identical despite the command reporting `state_updated:true` in its JSON (noted, not a defect — no net content change). Current real ROADMAP.md is free of the corruption pattern. The historical debug-objective commit itself was not independently audited in this pass (see `not_independently_verified`). |
| 10 | E2E proof (b) instructions exist; human-verify result recorded | ✓ VERIFIED | `docs/USER-GUIDE.md` §"Adopting an Existing Repo" has the exact local-dev-install + revert steps. `37-16-SUMMARY.md` records the verbatim verdict: **`approved.`** — "covers every check in step 4 (a through f) of the checklist, and confirms the revert to the published `aocyber` marketplace (step 5) worked." |

## Requirements Coverage — ADP-01 .. ADP-07

| Req | Description (from TRD frontmatter) | Owning TRD(s) | Status | Evidence |
|---|---|---|---|---|
| ADP-01 | One project-state detector (`devflow\|greenfield\|brownfield\|scratch`); 3 existing heuristics delegate to it | 37-01, 37-04 | ✓ SATISFIED | `lib/repo-state.cjs` exists; `repo-state-delegation.test.cjs` present; live preflight runs above correctly classified all 6 fixture kinds (brownfield for go/flutter/node/dirty, greenfield for empty, devflow for devflow fixture). |
| ADP-02 | Global `--cwd <dir>` flag, `process.chdir`s before dispatch | 37-02 | ✓ SATISFIED | `df-tools.cjs:270-277` calls `extractCwdFlag` + `process.chdir` before command dispatch, confirmed in source; live-tested from a different shell cwd (DoD #7). |
| ADP-03 | `adopt preflight\|begin\|scaffold\|report [--cwd]` deterministic half; idempotent resume | 37-05, 37-07, 37-08 | ✓ SATISFIED | All 4 subcommands exercised end-to-end on 3 fixture stacks; `scaffold`'s marker (`steps.scaffolded`) and `report`'s marker (`steps.reported`) confirm the resumable-step design; `adopt.cjs:552` scaffold only runs from `route: 'resume'`, refusing to write anything if PROJECT.md/CLAUDE.md checks fail first. |
| ADP-04 | `skills/adopt/SKILL.md` + `workflows/adopt.md` orchestrator; registered in HELP_TABLE/routing/route-intent/init-offer | 37-09, 37-10 | ✓ SATISFIED | `skills/adopt/SKILL.md` and `workflows/adopt.md` exist, verbatim-followed per 37-11..37-14 SUMMARYs; `df-tools --help` lists `adopt`; `route-intent.js:129-133` matches "adopt this repo"/"set up devflow here"/"bootstrap this repo" and routes outside DevFlow projects too (`renderAdoptReminder`, confirmed by grep). LLM orchestration itself not re-run live in this pass (not deterministically re-runnable; relied on 37-11..37-14 SUMMARY + my own fresh structural-checker reruns standing in for the mapping step). |
| ADP-05 | Backup pruning: pure policy, 24h-throttled runner, config, registration | 37-03, 37-06, 37-09 | ✓ SATISFIED | Policy + throttle independently re-derived (DoD #8); `upgrade-cli.cjs` has `--prune`/`--dry-run`/`--register` flags wired (confirmed in source + its own test file's the 9-14 test range); `adopt scaffold`'s output includes a `registry_key` for every fixture run, confirming registration fires. SessionStart hook wiring itself inspected via code/docs, not executed live (see caveat above). |
| ADP-06 | Fixture factory + E2E proof (a): Go/Flutter/Node pass structural checker; routing cases correct | 37-01, 37-08, 37-11, 37-12, 37-13, 37-14 | ✓ SATISFIED | Fresh reruns on all 3 stacks pass 13/13 structural checks each (DoD #1-3); all 4 routing/refusal cases independently re-driven (DoD #4-6b), matching 37-14-SUMMARY's claims. |
| ADP-07 | Docs (USER-GUIDE, CHANGELOG, CLAUDE.md inventory) + E2E proof (b) human-verify recorded | 37-15, 37-16 | ✓ SATISFIED | `docs/USER-GUIDE.md`, `CHANGELOG.md` `[Unreleased]`, and root `CLAUDE.md` all describe `/devflow:adopt`, `--cwd`, and backup pruning (grepped directly). No version bump (`package.json`/`plugin.json`/`marketplace.json` all still `2.10.1`) and no tag on HEAD (`git tag --points-at HEAD` empty). `37-16-SUMMARY.md` records verdict `approved.` verbatim. |

No orphaned requirement IDs: ADP-01..ADP-07 are objective-local (no `.planning/REQUIREMENTS.md` entries expected per ROADMAP note), and every one is claimed by at least one TRD above.

## Anti-Patterns

Grepped `adopt.cjs`, `adopt-cli.cjs`, `backup-prune.cjs`, `repo-state.cjs`, `cwd-flag.cjs`, `skills/adopt/SKILL.md`, `workflows/adopt.md` for `TODO|FIXME|XXX|HACK|PLACEHOLDER|coming soon` — zero matches.

## AskUserQuestion Check

`grep -rn "AskUserQuestion" skills/adopt/ workflows/adopt.md workflows/map-codebase.md` → only 2 hits, both explicit **prohibitions** in prose ("Never call AskUserQuestion"), no actual invocation. `map-codebase.md`'s interactive Refresh/Update/Skip prompt is gated behind a documented `<non_interactive_mode>` block used by `/devflow:adopt`.

## Regression

`git diff --stat 3ee4cfb HEAD -- plugins scripts` → **empty** (confirmed independently, not taken on claim). Only planning docs (this VERIFICATION.md aside) changed since that commit, so the last recorded full-suite run at this code state stands: 37-11-SUMMARY.md's regression gate — 3975 tests, 3942 pass, 1 fail (`handoff-e2e.test.cjs:795` `MA-7`), matching `baseline-failures.tsv` line 16 verbatim (pre-existing, not a regression). The suite was not re-run fresh in this verification pass.

## Human Verification Required

None outstanding — ADP-07's E2E proof (b) checkpoint was already run by the user and recorded as `approved.` in `37-16-SUMMARY.md` (verbatim verdict quoted above).

## Gaps Summary

No gaps found. All 7 requirement IDs (ADP-01..ADP-07) are satisfied by live, independently-reproduced evidence for every deterministic/testable claim; the sole non-reproducible piece (the LLM mapping/inference step) is explicitly out of scope for deterministic re-verification and its recorded SUMMARYs are corroborated by fresh structural-checker reruns standing in for that step on 3 independent fixture stacks. Four items are logged above as **not independently re-driven in this pass** (historical corruption-fix commit, two additional refusal branches, live SessionStart hook firing, and a fresh full-suite run) — none contradicted by any evidence gathered, and none block the objective's DoD as written.

---

_Verified: 2026-09-28T11:45:00Z_
_Verifier: Claude (verifier)_
