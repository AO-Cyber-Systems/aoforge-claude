---
objective: 39-telemetry-audit-cli
trd: "03"
subsystem: docs
tags: [claude-md, hooks, inventory, gate-names, site-docs, tdd]

# Dependency graph
requires: []
provides:
  - "lib/hook-inventory.test.cjs — hooksSection/parseBullets/registeredScripts/classifyInventory pure parsers, pinning CLAUDE.md's ### Hooks section to hooks.json + plugin.json statusLine in both directions"
  - "CLAUDE.md ### Hooks Draft (not registered in hooks.json) group for inject-org-context.js / inject-handoff-results.js"
  - "site override examples (telemetry.md, architecture/hooks.md, troubleshooting.md, configuration/gates.md) use --gate edits, matching lib/override.cjs's real GATES keys"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pin-a-doc-to-its-source-of-truth test: pure parser functions (hooksSection/parseBullets/registeredScripts/classifyInventory) operate on markdown/JSON strings, no fs coupling in the logic, only in the describe-block fixture loaders — mirrors doc-surfaces.test.cjs's IS_DEVFLOW_CHECKOUT skip guard."
    - "Bidirectional inventory pin: registered ⊆ documented (test 1) AND documented ⊆ registered ∪ draft (test 2) — either direction alone allows silent drift the other doesn't catch."

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs
  modified:
    - CLAUDE.md
    - site/content/docs/guides/telemetry.md
    - site/content/docs/architecture/hooks.md
    - site/content/docs/troubleshooting.md
    - site/content/docs/configuration/gates.md

key-decisions:
  - "Test 3 (Draft labels are true) is a for-loop with no length>0 assertion, so it is vacuously true before the Draft group exists (RED phase) and becomes a real per-entry check once the group is added (GREEN) — per the TRD's explicit 'test 3 vacuous' RED requirement."
  - "parseBullets takes only the FIRST backtick span of a bullet line and only if it ends in .js, so long Enforcement-group bullets with multiple inline `code spans` (e.g. gate-edits.js's `.planning/.skill-active`) don't false-match on a later span."
  - "classifyInventory returns {undocumentedLive: [...]} rather than a boolean, so both the real-file tests and the synthetic sensitivity-control test can assert on the exact script names reported."

patterns-established:
  - "hooksSection(md) bounds itself to the next literal '\\n### ' heading, so the parser never needs a hardcoded list of section names to stop at."

requirements-completed: [AUD-07, AUD-08]

# Verification evidence
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 25min
completed: 2026-09-28
tokens_input: 4080357
tokens_output: 28227
tokens_cache_read: 3988042
tokens_cache_write: 92217
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 39 TRD 03: Hook inventory truth + pinned test; site gate-name fix Summary

**`hook-inventory.test.cjs` pins CLAUDE.md's `### Hooks` bullet list to `hooks.json` (+ plugin.json's `statusLine`) in both directions — RED caught `inject-org-context.js`/`inject-handoff-results.js` documented as live when neither is registered; GREEN moved them into a new `Draft (not registered in hooks.json)` group. Separately, four site doc pages' `df-tools override --gate gate-edits` examples now read `--gate edits`, matching `lib/override.cjs`'s real `GATES` keys (`edits`/`commits`/`changelog`).**

## Performance

- **Tasks:** 2
- **Files modified:** 6 (1 created, 5 modified)
- **Duration:** ~25 min

## Accomplishments
- New pure parsers in `lib/hook-inventory.test.cjs`: `hooksSection(md)`, `parseBullets(section)`, `registeredScripts(hooksJson, pluginJson)`, `classifyInventory(md, registeredSet)` — no fs coupling in the logic, only in the test's fixture loaders.
- 5 tests: registered⊆documented, documented⊆registered∪draft, Draft-labels-are-true, a hand-written synthetic-snippet sensitivity control, and a sanity floor (≥10 registered scripts, non-empty bullet set) guarding against a silently-matching-nothing regex.
- CLAUDE.md's `### Hooks` section: `inject-org-context.js` and `inject-handoff-results.js` moved out of `**Session context**` into a new `**Draft (not registered in hooks.json):**` group, with their descriptions preserved (reworded "would inject"/"would surface" instead of asserting live behavior), not deleted.
- Four site pages' `df-tools override` examples fixed: `--gate gate-edits` → `--gate edits`. Hook-name mentions of `gate-edits`/`gate-commits` elsewhere on those same pages were left untouched (11 total remaining mentions in the 4 edited files, unchanged; only the `--gate` argument value changed).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: hook-inventory pin test + CLAUDE.md fix | `node --test plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs` | 0 | PASS (5/5) |
| 2: site docs use real override gate names | `rg -n -e '--gate gate-' site/content` | 1 (no matches) | PASS |

## Task Commits

Each task was committed atomically (RED then GREEN, per strict TDD for Task 1):

1. **Task 1 RED** - `47e1e0d` test(39-03): pin CLAUDE.md hook inventory to hooks.json
2. **Task 1 GREEN** - `48f7326` docs(39-03): mark draft hooks as not registered in CLAUDE.md inventory
3. **Task 2** - `3d0a5d8` docs(39-03): site override examples use real gate names

**Plan metadata:** (this commit) docs(39-03): complete TRD

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Combined pin + doc-refs suite | `node --test plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs` | 0 | PASS (15/15) |
| Site gate-name grep (negative) | `rg -n -e '--gate gate-' site/content` | 1 (no matches) | PASS |
| Site gate-name grep (positive) | `rg -n -e '--gate edits' site/content` | 0 (4 lines) | PASS |
| Full regression suite | `npm test` | 1 (pre-existing) | PASS — see below |

`npm test`: 4142 tests / 4109 pass / 1 fail / 32 skipped. Baseline after 39-01 was 4137 / 4104 / 1 / 32 — totals moved up by exactly the 5 new tests this TRD added, and the single failure is the same pre-existing MA-7 (`handoff-e2e.test.cjs`, `doctl auth init` with unset `DIGITALOCEAN_TOKEN`), unrelated to this TRD.

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs` | 1 | FAIL (correct — test 2 reported `AssertionError: ... found: inject-handoff-results.js, inject-org-context.js`; tests 1, 3, 4, 5 passed) |
| GREEN | `node --test plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs` | 0 | PASS (5/5) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 5/5 — every registered script has a CLAUDE.md bullet; every bullet is registered or Draft-grouped; the Draft group's two scripts both exist on disk and carry a `DRAFT` header (`grep -n -i DRAFT` confirmed) and are unregistered; the classifier is sensitive (synthetic `ghost.js` test); `rg -n -e '--gate gate-' site/content` returns nothing.
- **Gate failures:** None

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs` - New. Pure parsers (`hooksSection`, `parseBullets`, `registeredScripts`, `isDraftGroup`, `classifyInventory`) + 5 tests, guarded by `IS_DEVFLOW_CHECKOUT` per the `doc-surfaces.test.cjs` precedent.
- `CLAUDE.md` - `### Hooks` section only: removed the two `inject-*` bullets from `**Session context**`, added a `**Draft (not registered in hooks.json):**` group with both bullets reworded to conditional ("would ...") phrasing.
- `site/content/docs/guides/telemetry.md:68`, `architecture/hooks.md:115`, `troubleshooting.md:24`, `configuration/gates.md:76` - `--gate gate-edits` → `--gate edits` in each `df-tools override` example. No other lines touched.

## Decisions Made
- Test 3's Draft-label check is a for-loop with no non-empty assertion, so it is vacuously true pre-GREEN (satisfying the TRD's explicit RED-phase requirement) and becomes a real per-script check once the Draft group exists.
- `parseBullets` takes only the first backtick span per `- \`...\`` line and requires it to end in `.js`, per the gotcha about Enforcement-group bullets carrying multiple inline code spans (e.g. `gate-edits.js`'s own bullet mentions `` `.planning/.skill-active` `` later in the same line).
- Did not add the optional "(override gates: edits, commits, changelog)" clarifying line to any of the four site pages — each example already sits under a "Logging an override" / "Override log" heading with surrounding prose, and `df-tools override --help` already lists accepted values, so the extra line was judged redundant rather than required.

## Deviations from Plan

None — TRD executed exactly as written. Test bodies (`hooksSection`/`parseBullets`/`registeredScripts`/`classifyInventory`) were sketched only as function names in the TRD's Test list; filling in their implementation per the Test list, codebase_examples, and gotchas is task execution, not a deviation.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Follow-up Note

`telemetry --scan` (mentioned in `site/content/docs/guides/telemetry.md`) is unimplemented and deferred, per the TRD's anti_patterns instruction — that page's `--scan` lines were explicitly out of scope for this TRD and were left untouched. A future TRD should either implement `df-tools telemetry --scan` or remove the doc reference to it.

## Next Objective Readiness
- CLAUDE.md's hook inventory is now accurate and test-pinned in both directions; any future hook added to `hooks.json` without a CLAUDE.md bullet (or vice versa) will fail `hook-inventory.test.cjs` immediately.
- All four `df-tools override` examples across the published site now use gate names the CLI actually accepts.

---
*Objective: 39-telemetry-audit-cli*
*Completed: 2026-09-28*
