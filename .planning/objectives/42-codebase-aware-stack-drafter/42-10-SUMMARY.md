---
objective: 42-codebase-aware-stack-drafter
trd: "10"
job: 42-10
subsystem: stack-drafter
tags: [docs, claude-md, changelog, stack-template, sync-runtime, stack-profiles]

requires:
  - objective: 42-codebase-aware-stack-drafter
    provides: "42-01..09: validation fixes and local date, bundled tier-2 profiles and the SUBDIRS entry, CI/shell/classify/runners/detect, verify, draft, report, mcp"
provides:
  - "CLAUDE.md Stack profile Core Tool bullet, the stack-profiles/ layout line, and a current 'Where we left off' block"
  - "CHANGELOG [Unreleased] Added/Changed/Fixed entries for the whole of objective 42 (no version heading)"
  - "templates/stack.md guidance: components, run: discover + notes comment, STACK-REPORT.md, verify --run safe keys, opt-in .mcp.json"
  - "sync-runtime regression test: a mirror creates stack-profiles/go.md and leaves ~/.claude/devflow/stacks/ byte-identical"
  - "docs/stack-profiles/README.md and repointed testing-strategy.md / PROPOSAL-stack-profile.md"
affects: [42-11]

tech-stack:
  added: []
  patterns:
    - "Core Tool bullets are scanned by dispatch-completeness: every backtick span's first word must be a real df-tools command, so spans are written `stack <sub>` rather than a bare `report`/`mcp`/`general`"

key-files:
  created:
    - docs/stack-profiles/README.md
  modified:
    - CLAUDE.md
    - CHANGELOG.md
    - plugins/devflow/devflow/templates/stack.md
    - plugins/devflow/devflow/references/testing-strategy.md
    - docs/PROPOSAL-stack-profile.md
    - plugins/devflow/hooks/sync-runtime.test.js

key-decisions:
  - "The regression test seeds the bundled profile into the tmp plugin tree inside the test (not in makeTmpRoot), so every other sync-runtime test keeps its existing fixture"
  - "A second case covers a version-bump re-mirror: stack-profiles/ is replaced wholesale (a profile removed upstream disappears) while stacks/ survives, which documents why overrides belong in stacks/"
  - "CLAUDE.md's 'Where we left off' says no `upgrade` migration writes .mcp.json on purpose (Q4: opt-in; upgrade-project.js auto-applies and commits migrations), so the omitted upgrade migration is not mistaken for a gap"
  - "Nothing in the docs claims fleet rollout results or Node/Rust/Python tier-2 profiles; 42-ROLLOUT.md is only pointed at"

requirements-completed: [SDR-01, SDR-02, SDR-03, SDR-04, SDR-05, SDR-06, SDR-07]

verification:
  gates_defined: 4
  gates_passed: 4
  auto_fix_cycles: 1
  tdd_evidence: false
  test_pairing: true

duration: ~25 min
completed: 2026-09-29
---

# Objective 42 TRD 10: Documentation and bundled-profile mirroring Summary

**CLAUDE.md, CHANGELOG [Unreleased], templates/stack.md and the doc pointers now describe the shipped drafter/verify/report/mcp and the bundled tier-2 profiles, and a sync-runtime regression test proves a mirror run refreshes `stack-profiles/` while leaving `~/.claude/devflow/stacks/` byte-identical.**

## Performance

- Tasks: 3/3 plus one fix commit (documentation tasks are not RED/GREEN; the Task 3 test guards behaviour shipped in 42-02 and passed on first run)
- Files: 1 created, 6 modified (`stack-general.md` needed no change)

## Accomplishments

- **CLAUDE.md (Task 1).** Added a **Stack profile** Core Tool bullet (subcommands, tier order, the safe-key and opt-in rules, bundled vs user/org tier, module list) and the `stack-profiles/<id>.md` layout line. Replaced the stale 'Where we left off' block (which listed work 42-01..09 finished) with three short paragraphs: what objective 42 shipped, the `42-ROLLOUT.md` pointer, why no `upgrade` migration writes `.mcp.json`, and what is still deferred (`mcp__context7__*` cleanup, Node/Rust/Python tier-2, the other UTC date sites from the 42-01 SUMMARY, long-term `dflang mcp`). Net change: -1 line (205 to 204).
- **CHANGELOG (Task 2).** `[Unreleased]` gained Added (verify, report, mcp, bundled tier-2, components, W033, `confirm_stack_profile` and agent grants), Changed (grounded drafter, profiles moved from `docs/` to `stack-profiles/`) and Fixed (CI fragment drafting, local-date `reviewed`, STK010, positional `stack validate`). No version heading, one `## [Unreleased]`.
- **templates/stack.md (Task 2).** Corrected the `extends` and `components` frontmatter comments (bundled tier, profile id) and added a guidance block on components (trailing slash, cwd join), `run: discover` plus the notes comment, `STACK-REPORT.md`, `stack verify --run` safe keys and the `.mcp.json` opt-in. Frontmatter stays valid; the 742 doc-refs + `stack-*` tests pass.
- **Mirror regression test (Task 3).** Two cases in `sync-runtime.test.js`: a fresh mirror creates `stack-profiles/go.md` and leaves `stacks/custom.md` (non-UTF-8 bytes) and a nested `stacks/acme/nested.md` unchanged; a version-bump re-mirror drops a stale bundled profile but still leaves `stacks/` untouched. Drift guard B stays green.
- **Doc pointers (Tasks 2-3).** `docs/stack-profiles/README.md` says the profiles moved to `plugins/devflow/devflow/stack-profiles/`, ship bundled, and are overridden by `~/.claude/devflow/stacks/<id>.md`. `testing-strategy.md` and `PROPOSAL-stack-profile.md` (Ships-with row, plus two "Implemented in objective 42" notes on drafting and tier-2 shipping) point at the bundled dir.

## Task Commits

| Task | Commit | Message |
|---|---|---|
| 1 | 53b6d93 | docs(42-10): refresh CLAUDE.md for the stack drafter, verify, report and mcp |
| 2 | c31f2b2 | docs(42-10): CHANGELOG Unreleased, STACK template guidance and proposal cross-refs |
| 3 | f4f4537 | test(42-10): pin that a mirror leaves ~/.claude/devflow/stacks/ alone; point docs at bundled stack-profiles/ |
| fix | f906d67 | fix(42-10): keep the CLAUDE.md Stack profile bullet dispatch-completeness clean |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CLAUDE.md bullet failed dispatch-completeness test 5**
- **Found during:** wave-level `npm test` after Task 3 (the per-task gate `doc-refs.repo.test.cjs` does not run it)
- **Issue:** `dispatch-completeness.test.cjs` treats the first word of every backtick span in a Core Tool bullet as a df-tools command. My bullet had bare `general`, `report` and `mcp` spans: "not a COMMANDS key".
- **Fix:** Reworded the bullet so each span starts with `stack` (`stack init`, `stack verify`, `stack report`, `stack mcp --write`) and dropped the backticks around `general`.
- **Files modified:** CLAUDE.md
- **Commit:** f906d67

**2. [Scope note] PROPOSAL-stack-profile.md edited in the Task 2 commit, not Task 3**
- The TRD says Task 2's "Implemented in objective 42" notes and Task 3's line-9 path update are one edit to the same file. Both landed in c31f2b2, so the Task 3 commit (f4f4537) does not include that file.

**3. [Scope note] `stack-general.md` untouched**
- `rg -n "docs/stack-profiles|enabled_tools"` finds nothing in it, so the TRD's "only if it references removed behaviour" condition did not fire.

**4. [Scope note] `docs/stack-profiles/` had to be recreated**
- 42-02's `git mv` left the directory empty and git dropped it, so the README is a new file in a new directory (the content test C4 only asserts the three profile files are gone).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: CLAUDE.md | `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs`; `git diff --stat CLAUDE.md` (net -1) | 0 (10/10) | PASS |
| 2: CHANGELOG + template + proposal | `node --test doc-refs.repo.test.cjs 'stack-*.test.cjs'` | 0 (742/742) | PASS |
| 3: mirror test + docs | `node --test plugins/devflow/hooks/sync-runtime.test.js` | 0 (38/38, 2 new) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | none (the repo has no lint command) | n/a | n/a |
| test | `node --test doc-refs.repo.test.cjs 'stack-*.test.cjs' sync-runtime.test.js` | 0 | PASS |
| build | `node plugins/devflow/devflow/bin/df-tools.cjs validate docs --raw` | 0 ("no documentation advisories") | PASS |
| wave | `npm test` | tests 4918, pass 4885, fail 1, skipped 32 | PASS (the only failure is the known handoff-e2e MA-7 / PTY-path mock auth; baseline 4916/4883/1/32, +2 new tests) |

Verification greps: `rg -n "## \[Unreleased\]" CHANGELOG.md` finds exactly one heading; no new `## [x.y.z]` section was added.

## Post-TRD Verification

- Auto-fix cycles used: 1
- Must-haves verified: 7/7 (CLAUDE.md content and no stale 'left off' items; CHANGELOG entries and no version section; template guidance; doc-refs green; mirror regression test; README pointer; testing-strategy and PROPOSAL pointers)
- Gate failures: the first wave run also reported the dispatch-completeness failure (fixed in f906d67, deviation 1). A later wave run showed three adopt tests (adopt E2E, `adopt begin` spawned, `adopt report`) failing after ~960 s each, a hang unrelated to this TRD: the same test files pass in isolation (22/22, ~2.5 s each), and a clean full rerun had only MA-7 failing. The known handoff-e2e PTY-path failure is the only remaining one.

## Self-Check: PASSED

- Created file exists: docs/stack-profiles/README.md.
- Commits 53b6d93, c31f2b2, f4f4537 and f906d67 are on feat/stack-profile-loader.
- `git diff --shortstat` for CLAUDE.md vs the wave base is +7/-8 (net -1, limit +10).
