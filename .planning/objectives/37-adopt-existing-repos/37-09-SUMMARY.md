---
objective: 37-adopt-existing-repos
trd: "09"
subsystem: adopt
tags: [devflow, skill, workflow, map-codebase, new-project, tdd, contract-test]

# Dependency graph
requires:
  - objective: 37-adopt-existing-repos
    provides: "37-06 upgrade --prune/--register; 37-08 adopt report commit_files/commit_message/needs_review, adopt begin() .planning/ mkdir fix"
provides:
  - "/devflow:adopt skill (plugins/devflow/skills/adopt/SKILL.md) — unattended, never calls AskUserQuestion"
  - "workflows/adopt.md orchestration: preflight route handling, begin, non-interactive map, PROJECT.md + .adopt-inferences.json inference, scaffold, health, report, one commit on devflow/adopt"
  - "map-codebase.md <non_interactive_mode> section (additive, no interactive behavior changed)"
  - "new-project.md Brownfield Offer recommends /devflow:adopt; both config.json commit sites now also register with the pruner"
  - "adopt-skill-contract.test.cjs — 12 TDD contract tests over the skill/workflow prose"
affects: ["38-*", "any future adopt-flow TRDs", "map-codebase non-interactive consumers"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prose-file contract testing: assert frontmatter, step order, forbidden substrings, and cross-file wiring on markdown skills/workflows rather than runtime behavior (precedent: ui-spec-skill-contract.test.cjs)"

key-files:
  created:
    - plugins/devflow/skills/adopt/SKILL.md
    - plugins/devflow/devflow/workflows/adopt.md
    - plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs
  modified:
    - plugins/devflow/devflow/workflows/map-codebase.md
    - plugins/devflow/skills/map-codebase/SKILL.md
    - plugins/devflow/devflow/workflows/new-project.md

key-decisions:
  - "Wrote the 12-test contract suite test-first (RED before adopt.md/SKILL.md existed) since no prior test file existed for this TRD"
  - "Used backtick-adjacency for the word 'commit' and paraphrase for forbidden literals (port 8080, git push, --no-verify) throughout adopt.md prose to avoid false positive/negative literal-substring matches in the contract tests"
  - "Fixed the never-delete guarantee wording in map-codebase.md to lowercase 'never delete' to satisfy the test's case-sensitive regex, rather than loosening the test"

requirements-completed: ["ADP-04", "ADP-05"]

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 1
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: ~7min (commit-to-commit span; session spanned a context-compaction resume)
completed: 2026-09-28
---

# Objective 37 TRD 09: Adopt Skill + Workflow Summary

**`/devflow:adopt` skill + `workflows/adopt.md` orchestrate preflight-routed, unattended repo adoption (map → infer PROJECT.md → scaffold → validate → report → one commit on `devflow/adopt`); map-codebase gains a non-interactive mode and new-project now recommends adopt and registers repos for pruning.**

## Performance

- **Duration:** ~7 min (commit span 03:50:57–03:57:19 UTC-4); the session itself spanned a context-compaction resume, so wall-clock authoring time is longer than the commit span alone
- **Tasks:** 2/2 completed
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `/devflow:adopt` skill: thin, unattended orchestrator (`allowed-tools` excludes `AskUserQuestion`, no `disable-model-invocation`) delegating entirely to `workflows/adopt.md`
- `workflows/adopt.md`: 10-step process (`resolve_target` → `preflight` → `begin` → `map` → `infer_project` → `scaffold` → `health` → `report` → `commit` → `summary`) covering all five preflight routes (`refuse`/`new-project`/`upgrade`/`resume`/`adopt`), a kind rubric matching `intent.cjs` `VALID_KINDS` exactly, and confidence levels (high/medium/low) for every inference
- `map-codebase.md` non-interactive mode: `check_existing`, `draft_stack_profile`, `scan_for_secrets`, `commit_codebase_map`, `offer_next` all made deterministic and additive — zero lines deleted from the existing interactive flow
- `new-project.md`: Brownfield Offer now recommends "Adopt instead"; both `config.json` commit sites now also call `upgrade --register`
- 12-test TDD contract suite (`adopt-skill-contract.test.cjs`) asserting every checkable must-have: frontmatter, allowed-tools, step ordering, `--cwd` presence on every df-tools line, forbidden strings, route coverage, kind-rubric-vs-`VALID_KINDS` parity, PROJECT.md section list, and all three map-codebase/new-project edits

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: adopt skill/workflow contract (RED then GREEN) | `node --test plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs` | 0 | PASS (12/12, after one wording fix) |
| 2: map-codebase non-interactive + new-project edits | `node --test plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs` + `node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs plugins/devflow/devflow/bin/lib/templates.test.cjs` | 0 | PASS (12/12 contract; 49/49 classifier+templates) |

## Task Commits

1. **Task 1a: RED — adopt skill/workflow contract test** — `f550a7c` (test)
2. **Task 1b: GREEN — adopt skill and workflow** — `498358a` (feat)
3. **Task 2: GREEN — map-codebase non-interactive mode; new-project points at adopt and registers for pruning** — `2886eee` (feat)

_TDD task: RED (f550a7c) then GREEN (498358a) as two distinct commits, per TRD instruction._

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs` (before `skills/adopt/SKILL.md` and `workflows/adopt.md` existed) | 1 | FAIL (correct — all 12 tests failed, target files absent) |
| GREEN (Task 1) | same command, after authoring skill + workflow | 1 → 0 | One wording collision on test 6 (`AskUserQuestion` appeared twice), fixed in `<success_criteria>` wording; tests 1-9 passed on first pass, 10-12 not yet applicable (map-codebase/new-project not yet edited) |
| GREEN (Task 2) | same command, after map-codebase + new-project edits | 0 | PASS — all 12/12, after one further fix (lowercase "never delete" wording in map-codebase.md to satisfy the case-sensitive regex) |

## Validation Gate Results (one-time regression gate, run after both tasks)

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| full suite (excl. micro.test.cjs) | `node --test --test-reporter=spec` over all `plugins/devflow/**/*.test.{cjs,js}` (minus `micro.test.cjs`) + `scripts/**/*.test.cjs` | 1 (1 test failed) | PASS — sole failure is a pre-existing baseline entry, not a regression |

**Regression classification:**

- Observed totals: 3967 tests, 3934 pass, 1 fail, 32 skipped, 0 cancelled
- The 1 failure: `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` — "MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path"
- Present verbatim in `.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv` (line: `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3	MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path`) → **classified BASELINE, not a regression**
- All 20 other baseline-listed flaky tests (devflow-watch.test.cjs daemon lifecycle, df-tools.cjs `--files` commit tests, remaining handoff-e2e cases, project-state.test.cjs cases 21a/23/26/29, verify-commits.test.js Test 5) passed on this run — no new failures introduced by this TRD's changes
- `baseline-failures.tsv` was not edited

## Post-TRD Verification

- **Auto-fix cycles used:** 1 (two small wording fixes to satisfy the self-authored contract test: `AskUserQuestion` double-occurrence in Task 1, lowercase "never delete" in Task 2 — both fixes applied to the markdown per the TRD's own error-recovery guidance, never to the test)
- **Must-haves verified:** 8/8 (all TRD `must_haves.truths` entries covered by the 12 passing contract tests)
- **Gate failures:** None (the 1 observed test-suite failure is a pre-existing baseline entry, classified above)

## Files Created/Modified
- `plugins/devflow/skills/adopt/SKILL.md` - new `/devflow:adopt [path]` skill; thin orchestrator, `allowed-tools` excludes AskUserQuestion, references `@~/.claude/devflow/workflows/adopt.md`
- `plugins/devflow/devflow/workflows/adopt.md` - new 10-step orchestration workflow: preflight route handling (refuse/new-project/upgrade/resume/adopt), begin, non-interactive map, PROJECT.md + `.adopt-inferences.json` inference with kind rubric + confidence levels, scaffold, health, report, single commit, summary
- `plugins/devflow/devflow/bin/lib/adopt-skill-contract.test.cjs` - new 12-test TDD contract suite over the skill/workflow prose files
- `plugins/devflow/devflow/workflows/map-codebase.md` - added `<non_interactive_mode>` section (additive only, 29 insertions, 0 deletions) covering check_existing, draft_stack_profile, scan_for_secrets, commit_codebase_map, offer_next
- `plugins/devflow/skills/map-codebase/SKILL.md` - `argument-hint` now mentions `[--non-interactive]`
- `plugins/devflow/devflow/workflows/new-project.md` - Brownfield Offer recommends "Adopt instead" (`/devflow:adopt`); both config.json commit sites now also run `upgrade --register`

## Decisions Made
- Authored the 12-test contract suite myself (no prior test file existed for this TRD), modeling structural conventions on the `ui-spec-skill-contract.test.cjs` precedent (path resolution via `DEVFLOW_ROOT`/`PLUGINS_ROOT`, guarded-extraction regex style)
- Used backtick-adjacency for the word "commit" and paraphrase for forbidden literals (the disallowed default web port, `git push`, bypassing signing/verification hooks) throughout `adopt.md` prose, to avoid the contract test's literal-substring markers producing false positives/negatives while still reading naturally
- Both `config.json` commit sites in `new-project.md` needed the identical `upgrade --register` addition; used two distinct `Edit` calls anchored on each site's differing trailing context (the following `**Persist auto-advance...**` vs `**Note:** Run /devflow:settings...` lines) rather than a single non-unique `replace_all`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AskUserQuestion literal appeared twice, failing contract test 6**
- **Found during:** Task 1 (first GREEN attempt)
- **Issue:** Both the `<rules>` block and `<success_criteria>` block in `adopt.md` mentioned the literal string `AskUserQuestion`, but the contract requires it to occur exactly once (in the rule that forbids it)
- **Fix:** Reworded the `<success_criteria>` line from "No AskUserQuestion call anywhere in the run." to "Never asks the user anything, anywhere in the run." — removes the second literal occurrence without weakening the guarantee
- **Files modified:** `plugins/devflow/devflow/workflows/adopt.md`
- **Verification:** Re-ran the contract suite; tests 1-9 passed
- **Committed in:** `498358a` (Task 1 GREEN commit)

**2. [Rule 1 - Bug] "never delete" guarantee used capitalized wording, failing contract test 10**
- **Found during:** Task 2 (first GREEN attempt)
- **Issue:** `map-codebase.md`'s `<non_interactive_mode>` block stated "Never delete existing documents." (capital N), but the contract test's regex `/never delete/` is case-sensitive and requires the lowercase form
- **Fix:** Reworded to "...map only the docs that are missing or empty — never delete existing documents." (lowercase, inline)
- **Files modified:** `plugins/devflow/devflow/workflows/map-codebase.md`
- **Verification:** Re-ran the contract suite; all 12/12 passed
- **Committed in:** `2886eee` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - wording bugs against the self-authored contract test)
**Impact on plan:** Both fixes were applied to the markdown deliverables, never to the test, per the TRD's own error-recovery guidance. No scope creep.

## Issues Encountered
None beyond the two wording fixes documented above. All `Edit` calls succeeded without "string not found"/"not unique" errors, including the two `config.json` commit-site edits in `new-project.md` (resolved via distinguishing trailing context rather than `replace_all`).

## User Setup Required
None - no external service configuration required.

## Next Objective Readiness
- `/devflow:adopt` is fully wired: skill → workflow → `df-tools --cwd "$TARGET" adopt preflight|begin|scaffold|report`, `upgrade --check/--apply`, `validate health`, `skill-active --start/--end`, ending in one `commit`
- `map-codebase.md`'s non-interactive mode is consumed by `/devflow:adopt`'s `map` step and directly invocable via `/devflow:map-codebase --non-interactive`
- `new-project.md`'s brownfield path now funnels existing-code users toward `/devflow:adopt` and every fresh project registers itself with the pruner (37-06) at both config-commit sites
- No blockers for downstream objective-37 TRDs or for wiring an end-to-end `/devflow:adopt` runtime smoke test in a later wave

---
*Objective: 37-adopt-existing-repos*
*Completed: 2026-09-28*
