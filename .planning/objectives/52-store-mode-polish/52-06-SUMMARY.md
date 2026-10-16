---
objective: 52-store-mode-polish
trd: "06"
subsystem: docs
tags: [changelog, user-guide, doctor-skill, claude-md, full-suite, store-mode]

requires:
  - objective: 52-store-mode-polish
    provides: "TRDs 52-01..52-05: commit-steps.cjs builder, gate START_HINT and --raw stderr, micro store-mode skip, github.mirror_only, frontmatter block scalars"
provides:
  - "CHANGELOG [Unreleased]: one Added entry (github.mirror_only) and five Fixed entries covering items 52-1..52-6"
  - "USER-GUIDE quotes the shipped strings: the START_HINT refusal, the six-line store-form commit steps, the gh setup plain form, the 0011 MIRROR_ONLY reason"
  - "USER-GUIDE Known issues: micro's raw-git commit bypasses the store-mode gate; pre-fix multi-line resolutions stay mangled (hand fix documented)"
  - "doctor skill step 4 handles the pending-migrations (check 21) commit note as well as legacy-runtime-state"
  - "CLAUDE.md 'Where we left off' names objective 52 done; Next drops the opt-out and decision-answer items"
affects: [docs, doctor, release-notes]

tech-stack:
  added: []
  patterns:
    - "Docs quote strings rendered from the code (node -e over commit-steps.cjs and 0010 STORE_COMMIT_STEPS), never the TRD drafts"

key-files:
  created: []
  modified:
    - CHANGELOG.md
    - docs/USER-GUIDE.md
    - plugins/devflow/skills/doctor/SKILL.md
    - CLAUDE.md

key-decisions:
  - "52-06: the pre-fix multi-line resolution known issue documents a hand fix (`resolution: |-` plus lines indented two spaces), not a re-answer: `decision answer` refuses a decision that is no longer in decisions/pending/"
  - "52-06: the doctor skill keeps running the switch + escape lines in store mode and shows the gh pr start line to the user; it does not inspect git state to pick a route, as its process section requires"

requirements-completed: ["52-1", "52-2", "52-3", "52-4", "52-5", "52-6"]

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

duration: 6min
completed: 2026-10-04
tokens_input: 12217681
tokens_output: 39838
tokens_cache_read: 12065404
tokens_cache_write: 152099
token_model: "claude-opus-5-5"
tokens_source: "backfill"
---

# Objective 52 TRD 06: Docs and full suite Summary

**The CHANGELOG, USER-GUIDE, doctor skill and CLAUDE.md now describe what TRDs 52-01..52-05 shipped, quoting the real strings from the code. The two follow-ups the objective found are recorded as known issues. The full `npm test` run fails only the known MA-7 test.**

## Progress
- [x] Task 1: CHANGELOG, USER-GUIDE, doctor skill, CLAUDE.md — 82a6a779
- [x] Task 2: full suite gate — 0ae3a844

## Performance

- **Duration:** ~6 min
- **Started:** 2026-10-04T14:55:42Z
- **Completed:** 2026-10-04T15:01:19Z
- **Tasks:** 2/2
- **Files modified:** 4 (plus this SUMMARY and ROADMAP.md)

## Accomplishments

- **CHANGELOG [Unreleased].**
  - Added: `github.mirror_only`. The entry says it applies to 0011 only and only while the store is off.
  - Fixed: five entries.
    - Gate-aware printed commit follow-ups from `commit-steps.cjs`, with all four branches named.
    - Refusals name both remedies, and `--raw` writes the message to stderr.
    - micro makes no STATE.md change in store mode.
    - The debugger commits through `df-tools commit`, with the CI guard.
    - Multi-line `decision answer` round-trips through block scalars and import.
- **USER-GUIDE.**
  - The refusal quote (:941) is now the `START_HINT` wording. The escape paragraph now says every refusal names both remedies and that `--raw` puts the message on stderr.
  - The 0011 step 5 block is now the exact six-line store form rendered from `STORE_COMMIT_STEPS`, with prose on the `gh pr start` route.
  - :853 says doctor 20, doctor 21 (`devflow-upgrade`) and `gh setup --apply` (`devflow-setup`) print the same form.
  - The gh setup "Committing the written files" paragraph shows the plain form verbatim and describes the store form (reason `gh setup workflow`).
  - :763 is replaced. It now documents `df-tools config-set github.mirror_only true`: store off only, it stops 0011 and W040, `gh-sync migrate` and `status check --migrate` offer it, and it shows how to migrate later. The Mirror mode intro points at it.
  - micro's store-mode behaviour is added after the verbs table: the STATE.md row is local mode only.
  - Known issues: the multi-line `decision answer` bullet is deleted. Two bullets are added: micro's raw-git commit skips the store-mode gate, and pre-fix mangled resolutions need a hand fix.
- **doctor SKILL step 4** covers `legacy-runtime-state` (check 20) and `pending-migrations` (check 21). In local mode it runs the `commit with:` line. In store mode it runs the switch and escape lines (branches `devflow-untrack-runtime-state` / `devflow-upgrade`) and shows the push, the PR and the `gh pr start` line to the user. It never uses raw `git commit`.
- **CLAUDE.md.** The heading is `## Where we left off (2026-10-04, branch feat/stack-profile-loader)`. The body says objective 52 is done. **Next** keeps the backfill UAT and the USER-GUIDE open items, drops the opt-out and decision-answer items, and adds the micro gate-bypass follow-up. No new sections.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: docs | `node --test lib/doc-refs.repo.test.cjs lib/dispatch-completeness.test.cjs lib/hook-inventory.test.cjs lib/planning-writes.repo.test.cjs lib/prompt-raw-commit.repo.test.cjs` | 0 (43/43) | PASS |
| 1: stale lines gone | `rg -n 'no opt-out key yet\|keeps only its first line' docs/USER-GUIDE.md` | 1 (no match) | PASS |
| 1: opt-out documented | `rg -n 'mirror_only' docs/USER-GUIDE.md CHANGELOG.md` | 0 (USER-GUIDE 768, 771, 1019; CHANGELOG 177-182) | PASS |
| 1: changelog | `df-tools changelog check Unreleased` | 0 (`present: true`) | PASS |
| 1: hand-fix syntax | `node -e` over `extractFrontmatter` with `resolution: \|-` + two indented lines | 0 (`"First line.\nSecond line."`) | PASS |
| 2: full suite | `npm test` | 1 (8856 tests, 8822 pass, 2 fail, 32 skipped) | PASS (only MA-7 plus the transient E2E1, see below) |
| 2: E2E1 after tick | `node --test lib/roadmap-reconcile.test.cjs` after `roadmap update-job-progress 52` | 0 (60/60) | PASS |
| 2: MA-7 alone | `node --test --test-name-pattern=MA-7 bin/handoff-e2e.test.cjs` | 1 | known environmental failure (reproduces alone) |

(`lib/` = `plugins/devflow/devflow/bin/lib/`, `bin/` = `plugins/devflow/devflow/bin/`.)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 1 | PASS apart from known: 8856 tests, 8822 pass, 2 fail, 32 skipped, 0 cancelled, 71.9 s |

The two failures:
- **`bin/handoff-e2e.test.cjs:795` MA-7** (doctl auth init with unset DIGITALOCEAN_TOKEN). This is the known environmental failure. On this machine the mocked `doctl` exits 0 (`{"status":"done","exit_code":0,"stderr":""}`), so none of the arch-gap, resolution-failure or timeout paths match. It fails the same way when run alone. `git diff --name-only 67f87a01 HEAD` shows objective 52 changed no handoff, watcher or doctl file.
- **`lib/roadmap-reconcile.test.cjs:984` E2E1 self-test.** This failure was transient. The 52-06 SUMMARY existed while ROADMAP still showed `- [ ] 52-06`. After `roadmap update-job-progress 52` ticked it, the whole file passes 60/60.

In this run the devflow-watch and handoff-e2e daemon tests that wave 1 saw failing (10 to 11 of them) all passed. The daemon started here.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6
  - CHANGELOG has an Added entry for `github.mirror_only` and Fixed entries for 52-1..52-6.
  - USER-GUIDE documents:
    - the follow-ups (gh setup, doctor 21, 0010, doctor 20), all naming `gh pr start`;
    - the raw-mode stderr refusal and the new wording;
    - micro's store-mode behaviour;
    - the opt-out.
  - The two stale lines are gone.
  - Both new known issues are recorded.
  - The doctor skill covers check 21.
  - CLAUDE.md is current.
  - The full suite fails only MA-7. E2E1 is resolved by the tick.
- Gate failures: none attributable to objective 52.

## Files Created/Modified
- `CHANGELOG.md`: Added `github.mirror_only`; Fixed: five objective 52 entries.
- `docs/USER-GUIDE.md`: targeted edits at the anchors listed above. No section was rewritten.
- `plugins/devflow/skills/doctor/SKILL.md`: step 4 now covers both commit-producing fixes.
- `CLAUDE.md`: the "Where we left off" heading, body and **Next** line only.

## Decisions Made
See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Doc accuracy] Pre-fix mangled resolutions cannot be "re-answered"**
- **Found during:** Task 1
- **Issue:** The TRD asked the known issue to say "re-answer them before a backfill". But `decision answer` calls `decision-queue.resolveDecision`, which throws `Decision not found in pending` for a decision already in `decisions/resolved/`. Following that instruction would fail.
- **Fix:** The USER-GUIDE bullet and the CHANGELOG entry say to fix those files by hand: `resolution: |-` followed by the lines, each indented two spaces. A `node -e` check confirms that `extractFrontmatter` reads that back exactly.
- **Files modified:** docs/USER-GUIDE.md, CHANGELOG.md
- **Commit:** 82a6a779

**2. [Scope note] micro is not described anywhere in USER-GUIDE**
- The TRD said "Where micro is described: the STATE.md row is local mode only". No such passage existed, and the must-haves require USER-GUIDE to describe micro's store-mode behaviour. One sentence was added after the planning-verbs table, next to the existing "STATE.md is generated in store mode" sentence.

## Discovered commands

None. `npm test` and `node --test {files}` come from the stack profile.

## Notes for the orchestrator
- `requirements mark-complete` has nothing to update, because this repo keeps no REQUIREMENTS.md. Requirements live in OBJECTIVE.md.
- ROADMAP 52-06 was ticked by `roadmap update-job-progress 52`, which also marked objective 52 Complete.

## Self-Check: PASSED
- FOUND: CHANGELOG.md, docs/USER-GUIDE.md, plugins/devflow/skills/doctor/SKILL.md, CLAUDE.md (all modified in 82a6a779)
- FOUND commits: 82a6a779 (Task 1), 0ae3a844 (Task 2)
- FOUND: ROADMAP line `- [x] 52-06-docs-and-full-suite-TRD.md`
