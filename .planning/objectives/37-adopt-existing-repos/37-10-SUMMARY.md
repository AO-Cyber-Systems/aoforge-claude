---
objective: 37-adopt-existing-repos
trd: "10"
subsystem: routing
tags: [route-intent, classifier, classify-session, global-claude-md, help]
dependency-graph:
  - objective: 37-adopt-existing-repos
    requires: "37-04 (getProjectState().state / repo-state), 37-09 (/devflow:adopt skill + workflow)"
    provides: "adopt is discoverable via natural-language routing, the global routing table, /devflow:help, and the SessionStart init-offer for brownfield repos"
affects: ["any future routing-table or classifier TRDs"]
tech-stack:
  added: []
  patterns:
    - "route-intent.js: adopt intent bypasses the interrogative Q&A skip-rule (\"can you set up devflow here\" is a polite request, not a question about the code)"
    - "renderRoutingPreamble({mode, repoState}) branches on repoState only for mode==='init-offer'; auto-init is never routed to adopt (user-triggered, LOCKED)"
key-files:
  created: []
  modified:
    - plugins/devflow/hooks/route-intent.js
    - plugins/devflow/hooks/route-intent.test.js
    - plugins/devflow/devflow/templates/global-claude-md.md
    - plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs
    - plugins/devflow/devflow/workflows/help.md
    - plugins/devflow/devflow/bin/lib/classifier.cjs
    - plugins/devflow/devflow/bin/lib/classifier.test.cjs
    - plugins/devflow/hooks/classify-session.js
    - plugins/devflow/hooks/classify-session.test.js
    - plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs
    - plugins/devflow/hooks/sync-runtime.test.js
decisions:
  - "Adopt intent bypasses the Q&A interrogative skip-rule in matchIntent (only for the adopt regex) because the TRD's own fire-list includes \"can you set up devflow in this repo\", which the pre-existing skip-rule would otherwise swallow"
  - "The non-DevFlow-project reminder is plain text (3 lines), not the box-drawn OBLIGATORY directive — that treatment is reserved for inside DevFlow projects"
  - "Fixed two pre-existing tests (upgrade-cli.test.cjs, sync-runtime.test.js) that hardcoded the managed-block literal 'v=1 src=global-claude-md' — these read the real template file and broke as a direct, intended consequence of the template_version bump to '2' (not scope creep; same class of byte-expectation break called out in the TRD's own error_recovery note for global-upgrade.test.cjs test 4)"
metrics:
  duration: "~1h"
  completed: 2026-09-28
---

# Objective 37 TRD 10: Register adopt in routing — route-intent, routing table, help, init-offer Summary

**`/devflow:adopt` is now routed by natural-language intent (inside and outside DevFlow projects), listed in the global routing table (v2) and `/devflow:help`, and offered by the SessionStart init-offer for brownfield repos — while auto-init and the greenfield/no-repoState init-offer text stay byte-identical to before.**

## What Was Built

- **`route-intent.js`**: new `adopt` INTENT_MAP entry (before NEW PROJECT) matching "adopt this/the/my repo/repository/project/codebase", "set up devflow here/in this/the/my repo/repository/project", "bootstrap this/the/my repo/repository/project/codebase". The Q&A interrogative skip-rule (`why|how|can|could|would|should|is|are|does|did|do`) now has a targeted exception: if the adopt regex matches, the skip-rule does not fire, because the TRD's own fire-list requires "can you set up devflow in this repo" to route. `main()` now handles the no-`.planning/` case: when the ONLY match is `adopt`, it emits a plain 3-line reminder (`renderAdoptReminder()`) via the same JSON `additionalContext` envelope used elsewhere; every other prompt in a non-DevFlow directory still produces empty stdout, unchanged.
- **`templates/global-claude-md.md`**: `template_version` bumped `"1"` → `"2"`; new routing bullet added directly after New project setup: `- Adopt an existing repo (unattended, one commit on devflow/adopt) → \`/devflow:adopt\``.
- **`workflows/help.md`**: new `/devflow:adopt [path]` entry (one paragraph, usage line) under Project Initialization; the map-codebase entry's "Use before `/devflow:new-project` on existing codebases" bullet now also points at `/devflow:adopt` for turning an existing codebase into a DevFlow project directly.
- **`classifier.cjs`**: new `ADOPT_OFFER_PREAMBLE` constant (LOCKED TEXT for this TRD), and `renderRoutingPreamble({mode, repoState})` now branches: `mode==='init-offer' && repoState==='brownfield'` → `ADOPT_OFFER_PREAMBLE`; every other init-offer call (no `repoState`, or `repoState==='greenfield'`) → the original `INIT_OFFER_PREAMBLE`, byte-identical. `auto-init` mode ignores `repoState` entirely — adopt is user-triggered and never auto-invoked.
- **`classify-session.js`**: now reads `state.state` (37-04's `getProjectState` result) into `repoState` and passes it through to `renderRoutingPreamble({ mode, repoState })`.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: route-intent adopt intent, routing table v2, help | `node --test plugins/devflow/hooks/route-intent.test.js plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs` | 0 | PASS |
| 2: init-offer names adopt for brownfield repos | `node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs plugins/devflow/hooks/classify-session.test.js` | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (task 1) | `node --test plugins/devflow/hooks/route-intent.test.js plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs` | 1 | FAIL (correct — adopt tests + template-v2 test absent/wrong) |
| GREEN (task 1, 1st pass) | same | 1 | 2 residual failures found: Q&A skip-rule swallowed "can you set up devflow in this repo"; global-upgrade test 4 hardcoded `v=1` in its expected diff detail |
| GREEN (task 1, fixed) | same | 0 | PASS |
| RED (task 2) | `node --test plugins/devflow/devflow/bin/lib/classifier.test.cjs plugins/devflow/hooks/classify-session.test.js` | 1 | FAIL (correct — ADOPT_OFFER_PREAMBLE/repoState wiring absent) |
| GREEN (task 2) | same | 0 | PASS |

## Post-TRD Verification

- Auto-fix cycles used: 2 (Rule 1/Rule 3 — see Deviations below)
- Must-haves verified: 6/6 (all `must_haves.truths` in the TRD frontmatter)
- Gate failures: None beyond the pre-existing baseline entry (see Regression Gate below)

## Commits

1. `test(37-10): adopt routing and template v2 cases` — `7fa827c`
2. `feat(37-10): route adopt intents; list /devflow:adopt in the routing table and help` — `6eab1da`
3. `test(37-10): init-offer points at adopt for brownfield repos` — `ad32616`
4. `feat(37-10): classify-session init-offer points brownfield repos at /devflow:adopt` — `b3f1264`
5. `fix(37-10): update v=1 byte expectations to v=2 after global-claude-md template bump` — `d342241`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Q&A interrogative skip-rule swallowed a TRD-required adopt fire prompt**
- **Found during:** Task 1 GREEN, first test run
- **Issue:** `matchIntent`'s existing skip-rule returns `[]` for any prompt starting with an interrogative word (`can`, `how`, `why`, ...). The TRD's own test list requires `"can you set up devflow in this repo"` to fire `/devflow:adopt`, which the skip-rule was silently discarding.
- **Fix:** Added a targeted exception in `matchIntent`: if the adopt regex matches the prompt, the interrogative skip-rule is bypassed for that prompt only. All other Q&A behavior (debug, build, etc. starting with "can/how/why") is unchanged — verified by the full existing no-fire-fixture suite still passing.
- **Files modified:** `plugins/devflow/hooks/route-intent.js`
- **Commit:** `6eab1da`

**2. [Rule 3 - Blocking] Byte-locked test expectations broke on the template_version bump**
- **Found during:** Task 1 GREEN, first test run (`global-upgrade.test.cjs` test 4), then again at the full regression gate (`upgrade-cli.test.cjs` test 10, `sync-runtime.test.js` test 15)
- **Issue:** Three pre-existing tests hardcode the literal managed-block marker `<!-- DEVFLOW:START v=1 src=global-claude-md -->` while reading/copying the real `global-claude-md.md` template. Bumping `template_version` to `"2"` (a TRD must-have) made the real template render `v=2`, so all three literal-comparison tests failed — this is exactly the byte-expectation break the TRD's own `<error_recovery>` note anticipated for `global-upgrade.test.cjs` test 4, and the same class of issue turned up in two more files the TRD did not name in `files_modified`.
- **Fix:** Updated the hardcoded `v=1` literal to `v=2` in all three locations (the diff-detail assertion string in `global-upgrade.test.cjs`, and the `MANAGED_START`/`START` constants in `upgrade-cli.test.cjs` and `sync-runtime.test.js`). No other assertion logic changed.
- **Files modified:** `plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs` (part of task 1's GREEN commit), `plugins/devflow/devflow/bin/lib/upgrade-cli.test.cjs`, `plugins/devflow/hooks/sync-runtime.test.js` (separate `fix(37-10)` commit, found only at the full regression gate since the wave `verification` command list did not include these two files)
- **Commits:** `6eab1da` (global-upgrade.test.cjs), `d342241` (upgrade-cli.test.cjs, sync-runtime.test.js)

## Regression Gate (baseline-relative)

Command: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`

Observed totals (information only): **tests 3975, suites 568, pass 3942, fail 1, cancelled 0, skipped 32, todo 0**.

| Failing test | Classification | Evidence |
|---|---|---|
| `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` — `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path` | **BASELINE** (pre-existing, unrelated to this TRD's diff) | Present verbatim in `.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv` line 16. This TRD's diff touches only `route-intent.js`, `classifier.cjs`, `classify-session.js`, `global-claude-md.md`, `help.md`, and test files for those — none of which `handoff-e2e.test.cjs` exercises. |

Two additional failures surfaced on the **first** full-gate run and were fixed before this TRD was considered complete (see Deviations #2 above); the **second** full-gate run (after the fix commit) shows only the one baseline failure. `baseline-failures.tsv` was never edited.

## Self-Check: PASSED

- `plugins/devflow/hooks/route-intent.js` — FOUND
- `plugins/devflow/hooks/route-intent.test.js` — FOUND
- `plugins/devflow/devflow/templates/global-claude-md.md` — FOUND
- `plugins/devflow/devflow/bin/lib/global-upgrade.test.cjs` — FOUND
- `plugins/devflow/devflow/workflows/help.md` — FOUND
- `plugins/devflow/devflow/bin/lib/classifier.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/classifier.test.cjs` — FOUND
- `plugins/devflow/hooks/classify-session.js` — FOUND
- `plugins/devflow/hooks/classify-session.test.js` — FOUND
- `7fa827c`, `6eab1da`, `ad32616`, `b3f1264`, `d342241` — all FOUND in `git log --oneline`

## Notes for Downstream Work

- Adopt is now fully discoverable end-to-end: natural-language routing (both inside and outside DevFlow projects), the global `~/.claude/CLAUDE.md` managed block (v2, refreshed by objective 36's global upgrade on next sync — never run against the real home by this TRD), `/devflow:help`, and the SessionStart init-offer for brownfield repos.
- The `ADOPT_OFFER_PREAMBLE` and the `repoState` branch in `renderRoutingPreamble` are LOCKED TEXT per the file's existing convention — future changes to this wording belong in a dedicated TRD, per the file's own LOCKED TEXT comments.
- No blockers for downstream objective-37 TRDs.
