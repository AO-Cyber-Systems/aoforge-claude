---
objective: quick-39
trd: 01
subsystem: stack-packs
tags: [stack-neutrality, stack-packs, web, flutter, guard]
requires: [quick-38]
provides:
  - stack-neutrality guard over the whole core plugin, matching browser_* tool names
  - web executor fragment checkpoint pre-check
  - Flutter planner TRD field reference, complete Step 9 UAT rules, profile testing cells
affects: [verify-work, checkpoints, verification-patterns, trd-prompt, UAT template, testing-strategy]
tech-stack:
  added: []
  patterns: [core points at `stack context <agent>`; packs carry the procedure]
key-files:
  created: []
  modified:
    - plugins/aoforge/aoforge/bin/lib/stack-neutrality.repo.test.cjs
    - plugins/aoforge/aoforge/workflows/verify-work.md
    - plugins/aoforge/aoforge/references/checkpoints.md
    - plugins/aoforge/aoforge/references/verification-patterns.md
    - plugins/aoforge/aoforge/references/defaults-table.md
    - plugins/aoforge/aoforge/references/model-profiles.json
    - plugins/aoforge/aoforge/references/model-profiles.md
    - plugins/aoforge/aoforge/references/testing-strategy.md
    - plugins/aoforge/aoforge/templates/trd-prompt.md
    - plugins/aoforge/aoforge/templates/UAT.md
    - plugins/aoforge/aoforge/templates/stack.md
    - plugins/aoforge/aoforge/templates/codebase/stack.md
    - plugins/aoforge/aoforge/templates/codebase/testing.md
    - plugins/aoforge-stack-web/fragments/executor.md
    - plugins/aoforge-stack-web/CHANGELOG.md
    - plugins/aoforge-stack-flutter/fragments/planner.md
    - plugins/aoforge-stack-flutter/fragments/verifier.md
    - plugins/aoforge-stack-flutter/profiles/flutter.md
    - plugins/aoforge-stack-flutter/CHANGELOG.md
    - CHANGELOG.md
decisions:
  - "verify-work drives no UI: it reuses pack evidence, else spawns the agent `stack context verifier --raw` lists under packs.subagents, else presents the test without a Pre-verified block"
  - "The executor's checkpoint pre-check is the web pack's existing read-only per-route check; click and screenshot stay with web-ui-verifier (no new grant)"
  - "design-stack-flutter.md stays in core as ALLOW-listed known debt: it moves with the design set, not into a stack pack"
metrics:
  completed: 2026-10-16
  tasks: 3
  commits: 5
  files: 20
---

# Quick 39: Move the remaining web and Flutter procedure out of core Summary

**The neutrality guard now scans all of core (447 files) and matches `browser_*` from any MCP server; verify-work, checkpoints and verification-patterns name no browser tool, and the TRD template's Flutter fields, the UAT auto-generation section and testing-strategy's Flutter cells live in the Flutter pack, with no fact lost (token check: 0 MISS).**

## Progress
- [x] Task 1: Guard scans all of core and matches browser_ tools (RED) — ea78762f
- [x] Task 2: Browser pre-verification leaves core; neutral rewrites — 7e6aeba4 (A-D), 49d90560 (E)
- [x] Task 3: Flutter TRD fields, UAT generation and testing cells leave core (GREEN); changelogs — c7f1ec7d (GREEN), 68dab58c (docs)

## Commits

| Hash | Message |
|---|---|
| ea78762f | test(stack-neutrality): scan all of core and match browser_ tool calls (RED) |
| 7e6aeba4 | refactor(stack-web): UI pre-verification leaves core checkpoints, verification patterns and verify-work |
| 49d90560 | refactor(core): stack-neutral defaults, model-profile and STACK.md template wording |
| c7f1ec7d | refactor(stack-flutter): TRD fields, UAT generation and testing cells leave core |
| 68dab58c | docs(quick-39): changelogs for the core neutrality sweep |

All five were made with `aof-tools commit --files`. BASE = `764626d823d0df165ba2adc330385d4d60bd5d28` (HEAD at planning time, unchanged at start). `git diff BASE --stat` lists exactly the 20 `files_modified` paths. `git diff BASE -G 8080` touches no line. GRANT_ALLOW and the executor's `tools:` line are unchanged (`git diff BASE -G 'GRANT_ALLOW|mcp__plugin_playwright'` is empty). Nothing pushed, tagged or released; nothing written under ~/.claude or /Users/justin/dev/aoforge-claude.

## Test totals

Full suite (npm test's globs, HOME = scratch dir, `plugins/aoforge/aoforge/bin/lib/watcher-shell.test.cjs` excluded):

| Run | tests | pass | fail | skipped |
|---|---|---|---|---|
| BASE 764626d8 | 12113 | 12083 | 0 | 30 |
| End (68dab58c) | 12115 | 12085 | 0 | 30 |

Scoped set (tests/pass, all 0 fail and 0 skipped):

| File | BASE | End |
|---|---|---|
| stack-neutrality.repo | 5/5 | 7/7 |
| planning-writes.repo | 11/11 | 11/11 |
| builtin-sweep.repo | 17/17 | 17/17 |
| ui-spec-lock | 18/18 | 18/18 |
| ui-spec-skill-contract | 15/15 | 15/15 |
| context-budget.repo | 6/6 | 6/6 |
| model-profiles | 32/32 | 32/32 |
| intent | 57/57 | 57/57 |
| defaults-loader | 22/22 | 22/22 |
| stack-packs | 46/46 | 46/46 |
| rename-guard.repo | 20/20 | 20/20 |
| doc-refs.repo | 18/18 | 18/18 |
| planning-audit | 17/17 | 17/17 |
| Flutter pack `lib/*.test.cjs` | 268/268 | 268/268 |

The BASE numbers match the planning-time gotchas exactly.

## RED failure (Task 1)

After ea78762f the real-tree scan failed with 69 offending lines in exactly the twelve MOVE/NEUTRAL files of the Disposition table, and nothing else (447 files scanned; every other guard test passed):

```
aoforge/references/checkpoints.md (8)          aoforge/templates/UAT.md (5)
aoforge/references/defaults-table.md (3)       aoforge/templates/codebase/stack.md (1)
aoforge/references/model-profiles.json (1)     aoforge/templates/codebase/testing.md (1)
aoforge/references/model-profiles.md (2)       aoforge/templates/stack.md (5)
aoforge/references/testing-strategy.md (13)    aoforge/templates/trd-prompt.md (18)
aoforge/references/verification-patterns.md (7) aoforge/workflows/verify-work.md (5)
```

After Task 2 A-D: 49 lines in 9 files. After Task 2 E: 36 lines in 3 files (trd-prompt.md, UAT.md, testing-strategy.md). After Task 3: 0.

## Disposition (final state)

| Core file | Lines at BASE | Disposition | Final state |
|---|---|---|---|
| aoforge/workflows/verify-work.md | 243-259 | MOVE, Task 2 | Done (7e6aeba4). Neutral `**Stack pre-verification (UI tests):**` step: pack evidence, else the `packs.subagents` agent via Task, else no Pre-verified block. CHECKPOINT box and both builtin-audit markers untouched; "skip stack pre-verification" |
| aoforge/references/checkpoints.md | 626-640, 696-697 | MOVE, Task 2 | Done (7e6aeba4). `## Stack Pre-Verification Before Checkpoints` points at `stack context executor`; fenced browser block removed; neutral paragraphs, evidence template and broken-environment example kept; table rows "stack pack pre-check" / "stack pack UI drive". look-lock section untouched |
| aoforge/references/verification-patterns.md | 18, 126-131, 597 | MOVE, Task 2 | Done (7e6aeba4). Points at the pack's UI drive (`stack context verifier`); question bullets kept |
| aoforge/templates/codebase/stack.md, codebase/testing.md | 41, 170 | NEUTRAL, Task 2 | Done (49d90560). `"<browser E2E runner> for E2E"` |
| aoforge/references/defaults-table.md | 133, 136, 144 | NEUTRAL, Task 2 | Done (49d90560). "UI flow driver→integration→widget/component→unit", "UI flow + integration + component render", "UI flow drivers" |
| aoforge/references/model-profiles.json, model-profiles.md | 4; 50, 77 | NEUTRAL, Task 2 | Done (49d90560). "a stack pack's vision judge"; `_comment` line count unchanged; JSON parses |
| aoforge/templates/stack.md | 26, 131, 139-140, 157 | NEUTRAL, Task 2 | Done (49d90560). Lookup corrected to user → enabled pack → bundled; `go fix`, a lint ID; "guarded gates (the tools a pack's gate policy guards)", checked against stack-verify.cjs:1379-1388 and `gatePolicy().guardedTools` |
| aoforge/templates/trd-prompt.md | 33-53, 198, 224-239 | MOVE, Task 3 | Done (c7f1ec7d). Neutral stack-fields YAML block; `### Stack fields (optional; defined by a stack pack)` with `stack`, `platform`, `api_contract`; `type: standard  # standard \| tdd \| ui` and the `type` row kept |
| aoforge/templates/UAT.md | 74-101 | MOVE, Task 3 | Done (c7f1ec7d). `## Pack-generated UAT`, keeps `the generator REFUSES to overwrite` |
| aoforge/references/testing-strategy.md | 15, 27-35, 39-46, 53, 70-71, 89 | MOVE, Task 3 | Done (c7f1ec7d). Flutter column and gotcha section gone; line 27 corrected (only go.md is bundled) |
| aoforge/references/design-craft.md | 4 hits | ALLOW, Task 1 | ALLOW (design set read from the core mirror) |
| aoforge/references/design-preflight.md | 5 hits | ALLOW, Task 1 | ALLOW (per-surface checklists side by side) |
| aoforge/references/design-stack-flutter.md | 27 hits | ALLOW, Task 1, known debt | ALLOW, reason begins "known debt:" |
| aoforge/references/deployment-verification.md | 82 | ALLOW, Task 1 | ALLOW (data: worked `impact` example) |
| aoforge/schemas/must_not_vocabulary.json | 3 | ALLOW, Task 1 | ALLOW (data: source attribution) |
| aoforge/schemas/stack-profile.schema.json | 35, 48 | ALLOW, Task 1 | ALLOW (data: manifests across languages) |
| aoforge/schemas/surface-spec.schema.json | 319 | ALLOW, Task 1 | ALLOW (data: package name in a description) |
| agents/executor.md | 5 | GRANT_ALLOW, unchanged | Unchanged; exactness test passes under the new PATTERN (all five tokens also match `browser_`) |
| 13 existing ALLOW entries | | Unchanged | Unchanged, all still match PATTERN |
| hooks/__fixtures__/*, `*.test.cjs` | | Not scanned | Not scanned (new test asserts it) |

No file outside the table appeared in the RED scan. `rg -l -i --hidden` over plugins/aoforge (tests and fixtures excluded) now lists exactly agents/executor.md plus the 20 ALLOW files.

## Moved-text map

Every removed block was saved first (decision 8) under `/private/tmp/claude-501/-Users-justin-dev-aoforge-claude/29d3d902-73eb-439c-9c64-ba469a668a6e/scratchpad/q39/orig/` and walked by eye.

| Core block (BASE) | Fact | Pack location | Status |
|---|---|---|---|
| verify-work.md 239 | Only when a dev server runs or can be started | web agents/web-ui-verifier.md "Readiness probe before navigating" | Present |
| verify-work.md 241-260 | navigate → snapshot → click + re-snapshot → screenshot | web-ui-verifier.md `**Drive:**` | Present |
| verify-work.md 262 | Results go into the checkpoint box | core verify-work (box kept; "Fill the box's Pre-verified lines from the pack's row") | Kept in core (neutral) |
| checkpoints.md 626 | Pre-verify before a UI `checkpoint:human-verify` | web fragments/executor.md `## Before a UI checkpoint:human-verify` | Added |
| checkpoints.md 630, 633 | navigate, snapshot | web executor.md `## The check (per route)`, reused by the new section | Present (reused, not restated) |
| checkpoints.md 636 | take_screenshot | web-ui-verifier `**Drive:**` | Deliberately dropped from the executor path: no grant; web-ui-verifier covers it (decision 7) |
| checkpoints.md 639-640 | click + re-snapshot | web-ui-verifier `**Drive:**`; the new section leaves interaction steps in how-to-verify | Deliberately dropped from the executor path: no grant; web-ui-verifier covers it (decision 7) |
| checkpoints.md 642-660 | fails/passes paragraphs, evidence template, broken-environment example | core checkpoints.md | Kept in core (neutral) |
| checkpoints.md 696-697 | UI pre-verify is automatable | core table rows | Reworded in core |
| verification-patterns.md 126-131 | navigate, snapshot, screenshot, click | web-ui-verifier `**Drive:**` | Present |
| defaults-table.md (app) | Maestro / integration_test / Playwright named as the flow tools | flutter profiles/flutter.md `## Testing` (Maestro, integration_test); web pack (web-ui-verifier) | Present |
| model-profiles.json/.md | flutter-ui-eval.cjs reads `models{}` | flutter lib/flutter-ui-eval.cjs, agents/ui-evaluator.md (name model-profiles) | Present |
| templates/stack.md 131 | `dart fix` as an enforcing tool | flutter profiles (Avoid rows "`dart fix`") | Present |
| templates/stack.md 26, 139-140 | dart/flutter as bundled ids | (was wrong: they ship in the Flutter pack) | Corrected in core |
| templates/stack.md 157 | build outputs do not halt later Flutter/Dart gates | core: "guarded gates (the tools a pack's gate policy guards)" | Kept in core (neutral, verified against stack-verify.cjs) |
| trd-prompt.md 33-53 | YAML example: stack, platform, state_management, must_haves.artifacts states/tests | flutter fragments/planner.md `## TRD frontmatter for type: ui` | Added (verbatim, minus api_contract) |
| trd-prompt.md 40-42 | api_contract with SHA pin | core trd-prompt.md (neutral `<contract file>` path) | Kept in core |
| trd-prompt.md 228-235 | Field table rows for stack, platform, state_management, states, tests.widget/integration/maestro | planner.md field table | Added |
| trd-prompt.md 229 | "Narrow only if a TRD genuinely targets a single platform" | planner.md table | Added |
| trd-prompt.md 230 | `provider` is a valid state_management | planner.md table, with the caveat: no catalogue, scored like `other` | Added |
| trd-prompt.md 234 | flutter test / flutter drive -d chrome per platform | planner.md step 2 | Present |
| trd-prompt.md 234 | `flutter test integration_test/` form | flutter fragments/executor.md post-all-tasks | Present |
| trd-prompt.md 234 | driver scaffolded by the bootstrap task | planner.md table | Added |
| trd-prompt.md 235 | Maestro mobile-only, maestro#2591, no web opt-in flag | planner.md step 2 + table | Present + added |
| trd-prompt.md 237 | Not in FRONTMATTER_SCHEMAS.trd.required; planner is the gate; PLANNING INCONCLUSIVE | planner.md step 2, step 4 | Present |
| trd-prompt.md 237 | A non-UI TRD that omits the fields validates | planner.md closing paragraph | Added |
| trd-prompt.md 239 | Executor runs tests.integration twice; chromedriver; Maestro web semantics overlay broken upstream | planner.md closing paragraph | Added |
| UAT.md 76 | `aof-flutter generate uat` for type: ui + stack: flutter | flutter fragments/verifier.md Step 9 | Present |
| UAT.md 78 | (state, platform) rows; 3 states × [mobile, web] = 6 | verifier.md Step 9 | Added |
| UAT.md 79 | one mobile-only row per `.maestro/` YAML; #2591; flutter-state-patterns.md pointer | verifier.md Step 9 | Added |
| UAT.md 80 | Web row command `flutter drive --driver=... --target=<tests.integration> -d chrome` | verifier.md Step 9 | Added |
| UAT.md 82 | `### N.` / `expected:` / `result: [pending]` format, about 5 minutes | verifier.md Step 9 (core keeps the format pointer) | Added |
| UAT.md 84-91 | generate + `doc put` publish | verifier.md Step 9 (existing) + core neutral `doc put` | Present |
| UAT.md 93 | later edits through `planning draft` + `doc put` | verifier.md Step 9 + core | Added |
| UAT.md 95 | generator refuses to overwrite non-pending results | core (exact substring kept) + verifier.md "refusing to overwrite" | Present |
| UAT.md 97 | Human-readable state text incl. `initial`; generic custom-state text | verifier.md Step 9 | Added |
| UAT.md 99 | Per-platform expansion REQUIRED by default, not opt-in | verifier.md Step 9 | Added |
| UAT.md 101 | Web mechanism: flutter drive on the same tests.integration path | verifier.md Step 9 web-row bullet | Added |
| testing-strategy.md 31-37 | Flutter cells: flutter test, integration_test harness, Patrol/Maestro, flutter-ui-eval (golden net + VLM judge), matchesGoldenFile on aodex/eden-biz, widget-tree behavioral parity | flutter profiles/flutter.md `## Testing` Layers bullet | Added |
| testing-strategy.md 34 | AI exploratory "(no formal pattern in org)" Flutter cell | none | Deliberately dropped: empty cell |
| testing-strategy.md 36 | Wrong-tenant "(rarely applicable)" Flutter cell | none | Deliberately dropped: empty cell |
| testing-strategy.md 35 | "shipped in AOForge 2.4.0" | none | Deliberately dropped: release history, not procedure |
| testing-strategy.md 39-46 | pumpAndSettle vs requestAnimationFrame; Patrol or Future.delayed(100 ms); note in `<gotchas>` | flutter.md Web gotcha bullet | Added |
| testing-strategy.md 53 | Drift / Floor generate DAO classes | flutter.md Codegen bullet (core keeps a neutral "SQLite ORMs" row) | Added |
| testing-strategy.md 71 | Mobile outside-in route | flutter.md Outside-in bullet | Added |
| testing-strategy.md 27 | dart.md and flutter.md bundled in core | (was wrong) | Corrected in core |
| all | REQ-10-01, REQ-10-06 (UAT.md heading), REQ-10-08, TRD 10-02/10-03/10-04a/10-04b provenance tags | none | Deliberately dropped: provenance, not procedure |

## Token check output (Task 3 D)

```
plugins/aoforge-stack-web/agents/web-ui-verifier.md :: browser_navigate, browser_snapshot, browser_take_screenshot,
    Click key interactive elements, re-snapshot, readiness probe ............................ ok (5/5)
plugins/aoforge-stack-web/fragments/executor.md :: checkpoint:human-verify, click ........... ok (2/2)
plugins/aoforge-stack-flutter/fragments/planner.md :: provider, single platform, state_management: riverpod,
    tests.maestro, mobile-dev-inc/maestro#2591, test_driver/integration_test.dart, FRONTMATTER_SCHEMAS.trd ok (7/7)
plugins/aoforge-stack-flutter/fragments/verifier.md :: initial, result: [pending], REQUIRED, .maestro/, -d chrome,
    planning draft, refusing to overwrite ................................................... ok (7/7)
plugins/aoforge-stack-flutter/profiles/flutter.md :: pumpAndSettle, requestAnimationFrame, Future.delayed,
    matchesGoldenFile, flutter-ui-eval, behavioral parity, Drift, Patrol, Maestro ............ ok (9/9)
MISS count: 0
```

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Guard RED | `node --test .../stack-neutrality.repo.test.cjs` | 1 (only the real-tree scan fails, 12 files) | PASS (RED as required) |
| 2: Browser pre-verification leaves core | offender scan (3 files left); `rg -l -i 'browser_[a-z]\|playwright'` (executor.md, testing-strategy.md, stack-classify.cjs, stack-report.cjs); scoped set; `JSON.parse(model-profiles.json)` | 0 | PASS |
| 3: GREEN + changelogs | `node --test .../stack-neutrality.repo.test.cjs` (7/7); token check (0 MISS); `stack validate --profile .../flutter.md`; scoped set + Flutter pack 268/268; full suite | 0 (validate: see below) | PASS |

`stack validate --profile plugins/aoforge-stack-flutter/profiles/flutter.md` exits 1 with one error, STK002 (`extends 'dart' not found` under ~/.claude/aoforge/stacks, the pack not being installed in this environment). The BASE profile, validated from a scratch copy, gives the identical single STK002. No new error, no STK007. Flutter profile body is about 70 lines (limit 150); planner.md is 10,898 bytes (under the ~11 KB recovery threshold, so no separate reference file).

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | full suite (npm test globs, HOME = scratch, watcher-shell excluded) | 0 | PASS (12115 tests, 12085 pass, 0 fail, 30 skipped; +2 = the new guard tests) |

## Deviations from Plan

**1. [Rule 3 - Blocking] stack-neutrality reached only 6 tests after Task 1.** The test list adds one new test and extends two, giving 6, but the must-haves require at least 7. The GREEN commit (c7f1ec7d) splits the coverage test: "the scan covers the trees it claims" keeps the include and pack-owned-gone assertions, and a new "the scan skips tests and fixtures" holds the `.test.cjs` and `__fixtures__` assertions. The guard file is in `files_modified`, so it rides the GREEN commit; commit count stays at five.

**2. Port rule wording in the web checkpoint section.** The JOB asked to "keep the port rule wording", but the verification step requires that the diff add no `8080`. The new section says "the port rule included (any server you start binds 8091)" and leaves the never-8080 sentence to the existing Preconditions, which it references.

No test file other than the guard was edited; no recovery path was used.

## Findings (not acted on)

- `plugins/aoforge-stack-flutter/profiles/flutter.md` line 51 still says "Tier-2 profile, bundled with AOForge (`aoforge/stack-profiles/flutter.md`)", which has been false since objective 77 (it ships in the pack). Outside this JOB's scope; a one-line fix for a later sweep.
- The Flutter verifier fragment's Step 9 still points at "`templates/UAT.md` lifecycle section"; that section remains in core and is neutral, so the pointer stays valid.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 9/9
- Gate failures: None

State updates (`state advance-job`, `roadmap update-job-progress`, …) were not run: this is a quick task and the
orchestrator saves the SUMMARY and records state. ROADMAP.md was not touched.

## Self-Check: PASSED

- Commits: ea78762f, 7e6aeba4, 49d90560, c7f1ec7d, 68dab58c all FOUND in `git log 764626d8..HEAD`.
- Sections: web executor.md `## Before a UI checkpoint:human-verify`, Flutter planner.md `## TRD frontmatter for type: ui`,
  flutter.md Testing "Web gotcha", core UAT.md `## Pack-generated UAT`, checkpoints.md
  `## Stack Pre-Verification Before Checkpoints`, verify-work.md `Stack pre-verification (UI tests)`: all FOUND.
- Worktree clean apart from the untracked `.planning/quick/39-move-remaining-web-and-flutter-procedure/` (left as asked).
