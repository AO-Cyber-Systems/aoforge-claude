---
objective: 35-stack-profile-loader
trd: "10"
subsystem: docs
tags: [stack-profile, dogfood, changelog, user-guide, proposal-status]

# Dependency graph
requires:
  - objective: 35-08
    provides: stack-profile.cjs resolveProfile, validate, command resolution
  - objective: 35-09
    provides: stack init drafting from CI/manifest evidence, org-marker detection
provides:
  - this repo's own .planning/STACK.md, dogfooding the loader end-to-end
  - PROPOSAL-stack-profile.md status updated to reflect what shipped
  - CHANGELOG.md [Unreleased] entries for the stack-profile feature set
  - USER-GUIDE.md row documenting df-tools stack subcommands
affects: [release-prep, future-objective-planning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Project stack profile at .planning/STACK.md, drafted via `stack init --write` then hand-tuned to exact locked values (extends: general, gates.objective: [test] running full npm test, gates.task/loop use scoped node --test)."

key-files:
  created:
    - .planning/STACK.md
  modified:
    - docs/PROPOSAL-stack-profile.md
    - CHANGELOG.md
    - docs/USER-GUIDE.md

key-decisions:
  - "Discarded stack init's raw evidence-derived draft (test/format/codegen/build commands scraped from workflow YAML) and replaced the frontmatter wholesale with the TRD's locked target, per the gotcha that the draft may carry commands contradicting the intended profile."
  - "No version bump, no tag, no mirror-CLI usage — all commands run via the checkout's plugins/devflow/devflow/bin/df-tools.cjs since `stack` is not yet in the ~/.claude mirror."

patterns-established:
  - "Full `npm test` reserved for the objective gate only (loop/task gates use the scoped `node --test {files}` form) — documented directly in STACK.md as the reason micro.test.cjs's 1Password hang doesn't block task-level verification."

requirements-completed: ["STK-10"]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: false

# Metrics
duration: 5min
completed: 2026-09-27
---

# Objective 35 TRD 10: Dogfood STACK.md, proposal status, CHANGELOG, USER-GUIDE Summary

**This repo now runs its own stack profile (`.planning/STACK.md`, `extends: general`, `javascript`, full `npm test` reserved for the objective gate) and the proposal/changelog/user-guide describe what objective 35 shipped — no version bump, no tag.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-27T17:43:15Z
- **Completed:** 2026-09-27T17:46:00Z (approx)
- **Tasks:** 2 completed
- **Files modified:** 4 (.planning/STACK.md created; docs/PROPOSAL-stack-profile.md, CHANGELOG.md, docs/USER-GUIDE.md modified)

## Accomplishments
- Drafted `.planning/STACK.md` via `stack init --write`, then replaced its evidence-derived frontmatter with the TRD's exact locked values.
- Proved the full DoD chain end to end: `stack validate` exits 0, `stack command test` resolves the scoped form for a named file, `validate health` shows no stack-related codes, and a clean temp dir resolves every field to `bundled`.
- Updated `docs/PROPOSAL-stack-profile.md` status line to "Implemented §6.1–6.5 (objective 35); §6.6 open".
- Added `CHANGELOG.md` `[Unreleased]` Added/Changed/Fixed entries describing the stack-profile feature set — no new version heading.
- Added a `df-tools stack` row to `docs/USER-GUIDE.md`'s Integration & Release table.
- Ran the wave-wide baseline-relative regression gate: 1 failure, exact match to `baseline-failures.tsv`, zero regressions.

## DoD Evidence

| OBJECTIVE DoD bullet | TRD | Command | Result |
|---|---|---|---|
| `.planning/STACK.md` exists with locked `id`/`languages`/`commands.test`/`gates.objective` | 35-10 | `cat .planning/STACK.md` (Write tool) | Matches target exactly: `id: devflow-claude`, `languages: [javascript]`, `commands.test: { run: "npm test", scoped: "node --test {files}", timeout_s: 900 }`, `gates.objective: [test]` |
| `stack validate` exits 0 | 35-10 | `node plugins/devflow/devflow/bin/df-tools.cjs stack validate` | `{"ok":true,"errors":[],"warnings":[]}` |
| `stack command test --files ... --raw` prints scoped command | 35-10 | `node plugins/devflow/devflow/bin/df-tools.cjs stack command test --files plugins/devflow/devflow/bin/lib/stack-profile.test.cjs --raw` | `node --test plugins/devflow/devflow/bin/lib/stack-profile.test.cjs` |
| `validate health` reports no E030/W030/W031/I030 | 35-10 | `node plugins/devflow/devflow/bin/df-tools.cjs validate health \| grep -E "E030\|W030\|W031\|I030"` | No matches (grep exit 1) |
| No STACK.md → `stack resolve --provenance` all `bundled` | 35-10 | `node <repo>/plugins/devflow/devflow/bin/df-tools.cjs stack resolve --provenance` (cwd = fresh empty scratchpad dir) | Every `provenance.*` value is `"bundled"`; `chain[0].tier` is `"bundled"` |
| PROPOSAL-stack-profile.md status updated | 35-10 | `rg -F "Implemented §6.1–6.5 (objective 35); §6.6 open" docs/PROPOSAL-stack-profile.md` | 1 match |
| CHANGELOG under `[Unreleased]`, no new version heading | 35-10 | `rg -n "^## \[" CHANGELOG.md \| head -2` | `## [Unreleased]` then `## [2.10.1] - 2026-09-26` |
| USER-GUIDE has a `df-tools stack` row | 35-10 | `rg -F "df-tools stack init" docs/USER-GUIDE.md` | 1 match |
| Version trio unchanged, no tag | 35-10 | `git diff --stat f1106e5 -- package.json plugins/devflow/.claude-plugin/plugin.json .claude-plugin/marketplace.json` / `git tag --points-at HEAD` | Both empty |
| Neutrality (no stack-specific names leaked into loader code) | 35-10 | `rg -n -i "golang\|gofmt\|\bdart\b\|flutter\|pubspec\|cargo\|pytest\|rails\|gradle\|swift\|kotlin" plugins/devflow/devflow/bin/lib/{stack-profile,stack-evidence,stack-render,json-schema-lite}.cjs` | No matches |

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Dogfood `.planning/STACK.md` and prove the DoD | `node plugins/devflow/devflow/bin/df-tools.cjs stack validate` | 0 | PASS |
| 2: Proposal status, CHANGELOG, USER-GUIDE; final regression | `rg -F "Implemented §6.1–6.5 (objective 35); §6.6 open" docs/PROPOSAL-stack-profile.md` | 0 | PASS |

## Task Commits

Each task was committed atomically:

1. **Task 1: Dogfood `.planning/STACK.md` and prove the DoD** - `b15f088` (chore)
2. **Task 2: Proposal status, CHANGELOG [Unreleased], USER-GUIDE row; final regression** - `8c18f73` (docs)

**Plan metadata:** this SUMMARY.md commit (docs, follows below)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| stack validate | `node plugins/devflow/devflow/bin/df-tools.cjs stack validate` | 0 | PASS |
| stack command test | `node plugins/devflow/devflow/bin/df-tools.cjs stack command test --files plugins/devflow/devflow/bin/lib/stack-profile.test.cjs --raw` | 0 | PASS |
| validate health | `node plugins/devflow/devflow/bin/df-tools.cjs validate health` | 0 | PASS (no E030/W030/W031/I030) |
| full regression suite | `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` | 1 | PASS (baseline-relative — see Regression Gate below) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 8/8 (all `must_haves.truths` bullets in TRD frontmatter, see DoD Evidence table)
- **Gate failures:** None (the one test failure below is pre-existing per baseline-failures.tsv)

## Regression Gate (baseline-relative)

Command: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`
Output written to session scratchpad (never the repo): `35-10-fullrun.txt`.

**Observed totals (informational):** tests 3592, suites 500, pass 3559, fail 1, cancelled 0, skipped 32, todo 0, duration 50.5s.

**Every failure, classified:**

| File:Line | Test name | Classification | Evidence |
|---|---|---|---|
| `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path` | **Pre-existing** | Exact-match entry (file:line + name) in `.planning/objectives/35-stack-profile-loader/baseline-failures.tsv` line 2. No re-run needed per gate step 3 — appears verbatim in the TSV. |

No other failures observed. All 9 other entries in `baseline-failures.tsv` (df-tools.test.cjs commit-staging tests, project-state.test.cjs cases 21a/23/26/29, verify-commits.test.js Test 5) simply did not fail in this run — consistent with the TRD's note that failure counts vary by environment (sandbox 1 fail vs. user machine's up-to-10, depending on 1Password/`op-ssh-sign` reachability). Per gate step 3, a baseline name that doesn't fail here is not a concern either way.

**Zero regressions.** No candidate-regression re-run procedure (gate step 4) was needed — the single observed failure matched the baseline TSV directly.

## Files Created/Modified
- `.planning/STACK.md` — this repo's stack profile: `extends: general`, `javascript`, `npm test` at the objective gate, `node --test {files}` scoped for loop/task gates
- `docs/PROPOSAL-stack-profile.md` — status row changed from `Draft v0.1` to `Implemented §6.1–6.5 (objective 35); §6.6 open`
- `CHANGELOG.md` — `[Unreleased]` gained Added (stack profile resolver, `validate health` Check 12, Dart/Kotlin/Swift + org-marker detection), Changed (planner/executor/testing-strategy stack integration, json-schema-lite extraction), Fixed (verifier Step 8 stack-field bug) sections
- `docs/USER-GUIDE.md` — new row for `df-tools stack init|validate|resolve|context|command` under "Integration & Release (1.28+)"

## Decisions Made
- Replaced `stack init`'s raw evidence-derived draft wholesale rather than editing it incrementally — the drafted commands (scraped from `.github/workflows/*.yml`) actively contradicted the intended profile (e.g. `format` bound to a release-tag script), so a clean rewrite of the frontmatter was safer than patching around contradictory evidence.
- Ran every command against the checkout's CLI (`plugins/devflow/devflow/bin/df-tools.cjs`), never the `~/.claude` mirror, per the TRD's binding runtime model (mirror lacks `stack` until release).

## Deviations from Plan

None — TRD executed exactly as written. No Rule 1-4 deviations triggered; no auth gates encountered; no checkpoints hit.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Objective Readiness
- Objective 35's dogfooding is complete: this repo now exercises its own stack-profile loader in normal operation.
- `docs/PROPOSAL-stack-profile.md` §6.6 remains explicitly open for any future objective that wants to pick it up.
- No version bump or tag was created in this TRD, per its explicit scope — release packaging remains a separate, later step outside objective 35.

---
*Objective: 35-stack-profile-loader*
*Completed: 2026-09-27*
