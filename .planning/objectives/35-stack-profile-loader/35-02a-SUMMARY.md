---
objective: 35-stack-profile-loader
trd: "02a"
subsystem: config/loader
tags: [stack-profile, yaml-lite, tiered-resolution, provenance, tdd]

# Dependency graph
requires:
  - objective: none
    provides: "Foundation TRD for the stack-profile system — no upstream 35-* dependency; reads plugins/devflow/devflow/bin/lib/yaml-lite.cjs and references/stack-general.md, both pre-existing"
provides:
  - "parseProfile(text, {source}) — parses `---` fenced YAML front matter + H2 body sections, with `<!-- inherit -->` detection and fence-aware H2 splitting"
  - "resolveProfile({projectRoot, userHome, file}) — resolves the full tier chain (bundled general -> org/pack extends chain -> project .planning/STACK.md -> optional component), returning {id, frontmatter, sections, provenance, chain, component, issues, projectFile}"
  - "StackProfileError (code, source), SECTION_NAMES, _resetCache, BUNDLED_PATH exports"
  - "stack-profile-fixtures.cjs — hand-built mkdtemp factories (makeProject, makeHome, profileMd, orgProfileGoLike, cleanup)"
affects: ["35-02b (renderCommand/contextFor consumer)", "35-03 (CLI)", "35-04 (init)", "35-05 (health check)", "35-09 (detectMarkers)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tiered profile resolution: bundled -> org (extends chain, cycle/depth-capped) -> project -> component, low-to-high merge order"
    - "Per-field provenance as a flat {'dot.path': tier} map, mirroring defaults-loader.cjs's cache-reset convention (_resetCache)"
    - "Frontmatter merge: plain-object maps deep-merge recursively; commands.<key> objects and arrays/scalars/null are always atomic replace"
    - "Section merge: H2 replace-by-name by default; append when the section's first non-blank line is `<!-- inherit -->`; ## Principles always appends regardless"
    - "StackProfileError(code, message, source) class mirrors ui-spec.cjs's SurfaceSpecError pattern"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/stack-profile.cjs
    - plugins/devflow/devflow/bin/lib/stack-profile.test.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-profile-fixtures.cjs
  modified: []

key-decisions:
  - "Used yaml-lite.cjs (not frontmatter.cjs) per TRD wiring requirement — frontmatter.cjs would collapse a flow map like `{ run: discover }` into a plain string, losing the shape resolveProfile needs for commands.<key>"
  - "Self-caught a TDD-ordering mistake before any commit: Task 2's resolveProfile implementation was drafted before its R-group tests existed, which would have skipped a genuine RED phase. Reverted stack-profile.cjs to the Task-1 GREEN commit (f1bfe49) via `git checkout f1bfe49 -- stack-profile.cjs`, confirmed via grep that resolveProfile was gone, then wrote the R1-R17 + P11 tests first and confirmed a real RED (TypeError: sp._resetCache is not a function) before re-implementing."
  - "Component profile.md resolution treats a `.md`-suffixed `profile` value as a direct file path (relative to projectRoot) and any other string as an extends-chain id, deduping against ids already in the chain"

requirements-completed:
  - "STK-02 (part a): a loader parses stack profiles and resolves them through bundled general → org/pack (extends chain) → project → component tiers, with per-field provenance. Rendering and slicing are 35-02b."

# Verification evidence
verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

# Metrics
duration: 17min
completed: 2026-09-27
---

# Objective 35 TRD 02a: The stack-profile loader core Summary

**Tiered stack-profile resolver (`parseProfile`/`resolveProfile`) merging bundled general, org/pack extends chains, project `.planning/STACK.md`, and component overrides into one frontmatter+sections result with per-field provenance, built via strict RED/GREEN TDD against 30 hand-written P/R test cases.**

## Performance

- **Duration:** ~17 min (first commit to last commit; excludes the 1Password-signing pause while waiting on the human-action checkpoint)
- **Started:** 2026-09-27T11:42:58-04:00
- **Completed:** 2026-09-27T11:59:32-04:00
- **Tasks:** 2
- **Files modified:** 3 (all created, 0 pre-existing files touched)

## Accomplishments
- `parseProfile` parses `---` fenced YAML front matter plus H2 body sections, correctly skipping H2-looking lines inside fenced code blocks and detecting `<!-- inherit -->` as the section's first non-blank line
- `resolveProfile` walks bundled general → org/pack `extends` chain (cycle-checked, depth-capped at 4, `EXTENDS_UNRESOLVED`/`EXTENDS_CYCLE`/`EXTENDS_DEPTH` issue codes) → project `.planning/STACK.md` → optional longest-prefix-matched component, merging frontmatter (deep-merge maps, atomic `commands.<key>`/arrays/scalars) and sections (replace-by-name, append on `<!-- inherit -->`, `## Principles` always appends), with full per-field provenance and a `_resetCache`-able cache keyed on `{projectRoot, userHome, file}`
- 30/30 hand-written test cases pass (P1-P11 parse group, R1-R17 resolve group), including a positive control that parses the real shipped `stack-general.md` plus `go.md`/`dart.md`/`flutter.md`

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: fixture factories + parseProfile (P1-P10) | `node --test plugins/devflow/devflow/bin/lib/stack-profile.test.cjs` | 0 | PASS |
| 2: resolveProfile — tiers, extends, merge, provenance, components, cache (R1-R17) | `node --test plugins/devflow/devflow/bin/lib/stack-profile.test.cjs` | 0 | PASS |

Final full-file run: `tests 30, pass 30, fail 0`.

## Task Commits

Each task was committed atomically as a TDD RED/GREEN pair:

1. **Task 1 RED** - `6996243` test(35-02a): stack-profile fixtures and parse cases
2. **Task 1 GREEN** - `f1bfe49` feat(35-02a): parseProfile
3. **Task 2 RED** - `a55e000` test(35-02a): resolveProfile tier cases
4. **Task 2 GREEN** - `ff0ad83` feat(35-02a): resolveProfile with tiers and provenance

_Note: the Task 2 GREEN commit (`ff0ad83`) landed after a transient 1Password SSH-signing failure required a human-action checkpoint; the orchestrator confirmed the retry succeeded and the commit landed cleanly (see Deviations)._

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED | `node --test plugins/devflow/devflow/bin/lib/stack-profile.test.cjs` | 1 | FAIL (correct — stack-profile.cjs did not exist yet) |
| Task 1 GREEN | `node --test plugins/devflow/devflow/bin/lib/stack-profile.test.cjs` | 0 | PASS (correct — P1-P10 + fixtures) |
| Task 2 RED | `node --test plugins/devflow/devflow/bin/lib/stack-profile.test.cjs` | 1 | FAIL (correct — 18 new R-group + P11 tests failed with `TypeError: sp._resetCache is not a function`) |
| Task 2 GREEN | `node --test plugins/devflow/devflow/bin/lib/stack-profile.test.cjs` | 0 | PASS (correct — all 30 tests, P1-P11 + R1-R17) |

## Post-TRD Verification

- **Auto-fix cycles used:** 0
- **Must-haves verified:** 6/6 (all `<must_haves><truths>` from TRD frontmatter hold: no-STACK.md → all-`bundled`; org tier read gated on `userHome`; distinct `EXTENDS_CYCLE`/`EXTENDS_DEPTH`/`EXTENDS_UNRESOLVED` codes terminating at general without throwing; frontmatter merge semantics incl. atomic `commands.<key>`; section replace/append/Principles-always-appends; P11 neutrality)
- **Gate failures:** None blocking. See regression-gate classification below.

### Regression gate (baseline-relative)

Ran from the repo root per the TRD's exact command: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs' 'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'`, output redirected to the session scratchpad (never the repo).

**Observed totals (informational):** tests 3480, pass 3419, fail 11, cancelled 0, skipped 50, todo 0.

**11 failures, none matching any of the 10 names in `baseline-failures.tsv`:**

| File | Failing test | Classification |
|---|---|---|
| `devflow-watch.test.cjs` | foreground daemon writes PID file, status reports running, stop kills it | environment flake / pre-existing, not-a-regression |
| `devflow-watch.test.cjs` | start refuses when daemon already running | environment flake / pre-existing, not-a-regression |
| `devflow-watch.test.cjs` | start cleans up stale PID file and starts fresh | environment flake / pre-existing, not-a-regression |
| `devflow-watch.test.cjs` | C-2 start --project /p (single) writes watching:[/p] (back-compat) | environment flake / pre-existing, not-a-regression |
| `devflow-watch.test.cjs` | C-1 start --project /p1,/p2 writes watching:[/p1, /p2] | environment flake / pre-existing, not-a-regression |
| `handoff-e2e.test.cjs` | write pending → daemon executes → route-results emits result with stdout | environment flake / pre-existing, not-a-regression |
| `handoff-e2e.test.cjs` | disallowed command produces rejected done record + "Do NOT retry" guidance | environment flake / pre-existing, not-a-regression |
| `handoff-e2e.test.cjs` | idempotency: route-results emits once, silence on second invocation | environment flake / pre-existing, not-a-regression |
| `handoff-e2e.test.cjs` | multi-record: 3 queued commands appear in a single injection | environment flake / pre-existing, not-a-regression |
| `handoff-e2e.test.cjs` | LK-1: teardown reaps the daemon — no devflow-watch outlives withDaemon | environment flake / pre-existing, not-a-regression |
| `handoff-e2e.test.cjs` | LK-2: SIGTERM kills the daemon within its deadline even with a dispatch in flight | environment flake / pre-existing, not-a-regression |

**Basis for classification (TRD step 4b — this wave's diff plainly didn't touch the code these tests exercise):**
- `git diff --stat 0fb49ae..ff0ad83` (this wave's entire diff against `WAVE_BASE`) touches only `plugins/devflow/devflow/bin/lib/__fixtures__/stack-profile-fixtures.cjs`, `stack-profile.cjs`, and `stack-profile.test.cjs` (991 insertions, 0 deletions) — never `devflow-watch.cjs`, `devflow-watch.test.cjs`, `handoff-e2e.test.cjs`, or `route-results.js`. This diff-stat check was run independently by this executor, not merely taken on report.
- Corroborated by the orchestrator (a peer agent, whose report was treated as a claim to verify rather than authoritative): all 11 failures were independently reproduced on a clean worktree of `WAVE_BASE` (`0fb49ae`) containing none of objective 35's code — i.e. the failures pre-date and are independent of this TRD's changes. This TRD's own `git diff --stat` finding above corroborates that report from a second, independent angle rather than relying on it alone.
- These are daemon lifecycle / PTY-timing tests (PID files, SIGTERM deadlines, route-results injection timing) — a class of test explicitly called out by the TRD's regression-gate guidance as expected to be environment-sensitive.
- `baseline-failures.tsv` was left untouched, as required — it documents a different, narrower snapshot (10 names, none overlapping this run's 11) and is not edited to add these.

**Conclusion: not a regression. Does not block TRD completion.**

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/stack-profile.cjs` - parseProfile + resolveProfile core, StackProfileError, SECTION_NAMES, _resetCache, BUNDLED_PATH
- `plugins/devflow/devflow/bin/lib/stack-profile.test.cjs` - 30 tests: P1-P11 (parse group + neutrality) and R1-R17 (resolve group)
- `plugins/devflow/devflow/bin/lib/__fixtures__/stack-profile-fixtures.cjs` - hand-built mkdtemp factories (makeProject, makeHome, profileMd, orgProfileGoLike, cleanup)

## Decisions Made
- yaml-lite.cjs over frontmatter.cjs for parsing front matter, per the TRD's explicit wiring requirement (frontmatter.cjs would flatten flow-map values needed for `commands.<key>` shapes)
- Reverted an over-eager implementation of `resolveProfile` written before its tests existed, to preserve a genuine RED phase — caught and fixed before any commit, no shipped-code impact
- Component `profile` field disambiguation: a `.md`-suffixed string is a direct file path relative to `projectRoot`; any other string is treated as an extends-chain id and walked the same way as an org `extends` reference, deduped against ids already in the resolved chain

## Deviations from Plan

### Auto-fixed Issues

None — no Rule 1/2/3 auto-fixes were needed; the TRD's implementation guidance mapped directly onto the code.

### Process notes (no code impact)

**1. Self-caught TDD-ordering violation (internal process correction, not a Rule 1-4 deviation)**
- **Found during:** Task 2, before any test existed for `resolveProfile`
- **Issue:** Drafted the full `resolveProfile` implementation directly into `stack-profile.cjs` ahead of writing the R-group tests, which would have produced a false RED phase (tests would trivially pass on first run)
- **Fix:** Reverted `stack-profile.cjs` to the Task-1 GREEN commit (`f1bfe49`) via `git checkout f1bfe49 -- stack-profile.cjs`, confirmed via `grep -c resolveProfile` returning `0`, then wrote all R1-R17 + P11 tests first
- **Verification:** Re-ran tests and confirmed genuine RED (18 new tests failed with `TypeError: sp._resetCache is not a function`) before re-implementing
- **Committed in:** No incorrect state was ever committed; RED was committed as `a55e000`, GREEN as `ff0ad83`

**2. Transient 1Password SSH-signing failures on the Task 2 GREEN commit (environment, not code)**
- **Found during:** Attempting to commit `ff0ad83` via the sanctioned `df-tools.cjs commit` wrapper
- **Issue:** Two consecutive signing failures — `1Password: failed to fill whole buffer` then `1Password: agent returned an error` — both matching the class of failure this TRD's binding constraints require stopping on
- **Fix:** Per binding constraints, stopped immediately with no bypass (`--no-gpg-sign`, `commit.gpgsign=false`, `DEVFLOW_ALLOW_RAW_COMMIT` were never used) and returned a `## CHECKPOINT REACHED` (human-action) report naming the exact working-tree state
- **Verification:** The orchestrator resolved the signing issue and confirmed `ff0ad83` landed cleanly; this executor independently verified via `git log --oneline` and `git status --short` (clean) before proceeding
- **Committed in:** `ff0ad83` (landed after the checkpoint was resolved)

---

**Total deviations:** 0 auto-fixed (Rules 1-4); 2 process notes (1 self-caught TDD-ordering correction with no shipped-code impact, 1 environment-level signing interruption handled per binding constraints).
**Impact on plan:** None. TRD executed as written; no scope creep.

## Issues Encountered
11 pre-existing test failures in `devflow-watch.test.cjs` and `handoff-e2e.test.cjs`, unrelated to this TRD's changes — see Regression gate section above for full classification and evidence. Not blocking.

## User Setup Required
None - no external service configuration required.

## Next Objective Readiness
- `resolveProfile`'s return shape (`{id, frontmatter, sections, provenance, chain, component, issues, projectFile}`) is locked and ready for 35-02b (renderCommand/contextFor, parallel wave-1 sibling) to consume without modification, per the TRD's key_links contract
- 35-03 (CLI), 35-04 (init), 35-05 (health check), and 35-09 (detectMarkers) can call `resolveProfile` directly once merged
- No blockers

---
*Objective: 35-stack-profile-loader*
*Completed: 2026-09-27*
