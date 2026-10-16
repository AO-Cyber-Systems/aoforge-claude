---
objective: 37-adopt-existing-repos
trd: "05"
subsystem: adopt
tags: [adopt, routing, preflight, begin, marker, tdd]

# Dependency graph
requires: ["37-01", "37-02"]
provides:
  - "adopt.cjs: ADOPT_BRANCH, MARKER_NAME, OWNED_PATHS, gitFacts, readMarker, writeMarker, resumeSteps, decideRoute (pure), preflight, begin"
  - "adopt-cli.cjs: cmdAdopt(cwd, args, raw) — preflight | begin wired; scaffold/report stubbed for 37-07/37-08"
  - "df-tools.cjs 'adopt' dispatcher case; help.cjs HELP_TABLE 'adopt' entry naming preflight/begin/scaffold/report"
affects: ["37-06", "37-07", "37-08", "37-09"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure/IO separation mirroring repo-state.cjs: decideRoute(facts) is a pure, total function over a facts object; gitFacts/readMarker/resumeSteps do all IO; preflight/begin compose them. All 12 routing rules live in decideRoute's own ordered comment block."
    - "Out-of-tree marker via `git rev-parse --git-path devflow-adopt.json` — lives in the git dir, never dirty, never committed, worktree-safe."
    - "userHome dependency injection: only adopt-cli.cjs calls os.homedir(); adopt.cjs takes userHome/env as options so tests inject gitEnv(fakeHome) and never touch the real ~/.claude."

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/adopt.cjs
    - plugins/devflow/devflow/bin/lib/adopt-cli.cjs
    - plugins/devflow/devflow/bin/lib/adopt-preflight.test.cjs
  modified:
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs

key-decisions:
  - "HELP_TABLE usage string deviates from the TRD's literal example. The TRD's embedded_context shows `usage: 'df-tools [--cwd <dir>] adopt <preflight|begin|scaffold|report> [--raw]'`, but help.test.cjs asserts every usage line starts with the literal string `df-tools <command-name>` (here, `df-tools adopt`). The bracketed `--cwd` prefix would fail that assertion. Used `usage: 'df-tools adopt <preflight|begin|scaffold|report> [--raw]'` instead — same information, help.test.cjs's own 'each usage line starts with df-tools <command>' case passes, and the global `--cwd` flag is still documented in the `details` prose ('Combine with the global --cwd <dir> flag to target another repo.')."
  - "adopt.cjs was written as one coherent module covering both Task 1 (gitFacts, decideRoute, preflight) and Task 2 (readMarker, writeMarker, resumeSteps, begin) functionality in a single GREEN implementation, because the pure/IO design does not decompose cleanly mid-module and the marker/resume logic is load-bearing for decideRoute's own rule order (an in-progress marker changes routing before Task 2's tests exist to prove it). Consequence documented under Deviations: Task 2's RED phase did not observe an actual failing run."
  - "Confirmed via `git --version` -> 2.50.1 (Apple Git-155), which is >= 2.23, so `begin()`'s primary path (`git switch -c devflow/adopt`) was exercised by every fixture test; the `git checkout -b` fallback for git < 2.23 is implemented but untested in this environment (no assertion in adopt-preflight.test.cjs distinguishes the two; the TRD's <recovery> note only asked that the git version be recorded here)."
  - "Pre-existing bug noted, not fixed: help.cjs's commandUsage() spreads a string `details` field character-by-character, producing garbled per-line detail output for every HELP_TABLE entry (not adopt-specific). Out of scope for this TRD's 19 test cases and must_haves; the adopt entry follows the same string-based `details:` convention as every other entry for consistency with the existing (broken) renderer."

patterns-established:
  - "adopt.cjs is sectioned with a `// --- preflight / begin ---` comment banner so 37-07 (scaffold) and 37-08 (report) can append below without restructuring."

requirements-completed: ["ADP-03"]

# Verification evidence
verification:
  tasks_passed: 2
  tasks_total: 2
  deviations: 3
  auth_gates: 0

metrics:
  duration: "~1 session (continuation)"
  completed: 2026-09-28
tokens_input: 9701670
tokens_output: 109606
tokens_cache_read: 9389978
tokens_cache_write: 311514
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 37 TRD 05: `adopt preflight` and `adopt begin` Summary

Implemented `df-tools adopt preflight` (read-only routing/refusal) and `df-tools adopt begin`
(branch + out-of-tree resumable marker) as the deterministic front door of `/devflow:adopt`,
covering all 19 specified test cases (38 `test()` invocations counting the 20-row pure
`decideRoute` table) against hand-built git fixtures, with zero side effects on every refusal path.

## What Changed

- **`adopt.cjs`** (new): `gitFacts(root, {env})` reads repo state via plain `git` calls
  (`is-inside-work-tree`, `show-toplevel`, `symbolic-ref`, `rev-parse HEAD`, porcelain status,
  `show-ref`, `ls-files`). `decideRoute(facts)` is a pure, total function implementing the 12-rule
  precedence order from the TRD's must_haves (not-a-dir -> not-a-repo -> not-repo-root ->
  busy-operation -> detached-HEAD -> active-marker(resume/refuse) -> dirty-tree ->
  `.planning`-present-upgrade -> greenfield-new-project -> no-commits-refuse ->
  branch-exists-refuse -> adopt). `readMarker`/`writeMarker` persist JSON at
  `git rev-parse --git-path devflow-adopt.json`. `resumeSteps` derives
  `{mapped, project_md, scaffolded, reported}` from disk state plus marker contents. `preflight`
  and `begin` are the IO orchestrators; `begin` runs `git switch -c devflow/adopt` (HEAD and
  working tree unchanged) then writes the marker, or returns the preflight report unchanged for
  every other route.
- **`adopt-cli.cjs`** (new): `cmdAdopt(cwd, args, raw)` dispatches `preflight`/`begin` into
  `adopt.cjs` with `{userHome: os.homedir(), env: process.env}`; `scaffold`/`report` exit 1 with
  "not implemented yet" pending 37-07/37-08. Exit code is 3 for `route: 'refuse'`, 0 otherwise.
- **`df-tools.cjs`**: added the `case 'adopt':` dispatcher entry delegating to `adopt-cli.cmdAdopt`.
- **`help.cjs`**: added the `'adopt'` HELP_TABLE entry (`mutates: true`) naming all four
  subcommands.
- **`adopt-preflight.test.cjs`** (new): all 19 test cases against `adopt-fixtures.cjs` generators
  (`go-service`, devflow, empty, dirty fixtures), spawning the real CLI via `spawnSync` with
  `--cwd <fixture>` from an unrelated mkdtemp directory and `gitEnv(fakeHome)`, plus the pure
  20-row `decideRoute` precedence table and a spawned `--help` check.

## Deviations from Plan

### Auto-fixed / Documented Issues

**1. [Rule 4-adjacent, resolved without a checkpoint] HELP_TABLE usage string**
- **Found during:** Task 1 GREEN, running `help.test.cjs` against the TRD's literal example usage.
- **Issue:** The TRD's `<codebase_examples>` usage string (`'df-tools [--cwd <dir>] adopt ...'`)
  does not start with the literal `df-tools adopt`, which fails `help.test.cjs`'s generic
  "each usage line starts with df-tools <command>" assertion applied to every entry.
- **Fix:** Used `usage: 'df-tools adopt <preflight|begin|scaffold|report> [--raw]'`; documented
  the global `--cwd` flag in `details` prose instead of the usage line.
- **Files modified:** `plugins/devflow/devflow/bin/lib/help.cjs`
- **Commit:** 1dfb214

**2. [Process deviation] Task 2 RED phase did not observe a failing run**
- **Found during:** Task 2, writing tests 11-17.
- **Issue:** Task 1's GREEN implementation (commit 1dfb214) already contained the full module —
  `readMarker`, `writeMarker`, `resumeSteps`, and `begin` — because the pure/IO design and the
  marker-aware routing rule in `decideRoute` are not separable from Task 1's own rule-order
  requirement (must_haves truth #21 requires the "in-progress adopt marker" check to exist for
  Task 1's table test #18 to pass, even though Task 1's spawned tests 1-10 never exercise `begin`).
  Consequently, when tests 11-17 were appended (commit a38a083), they passed immediately (38/38)
  rather than failing first — no code diff accompanied that commit because the implementation was
  already complete.
- **Resolution:** No fabricated failing run is claimed anywhere in this SUMMARY. Task 2's TDD
  Evidence below records this honestly as "not observed" rather than reporting a synthetic RED
  result. All 7 of Task 2's tests are proven correct by the GREEN run (38/38 passing, and by the
  `stash|reset --` absence check and the branch/marker/resume assertions each test makes).
- **Files modified:** `plugins/devflow/devflow/bin/lib/adopt-preflight.test.cjs`
- **Commit:** a38a083 (tests only, no accompanying feat commit for Task 2)

**3. [Informational, not fixed] Pre-existing `help.cjs` rendering bug**
- **Found during:** Task 1 GREEN, reading `help.cjs`'s `commandUsage()` for the entry template.
- **Issue:** `commandUsage()` spreads a string `details` field character-by-character
  (`...c.details` applied to a string), producing garbled per-character detail output for every
  HELP_TABLE entry, not just `adopt`.
- **Fix:** None — confirmed out of scope for this TRD's 19 test cases and must_haves. The `adopt`
  entry uses the same string-based `details:` convention as every existing entry for consistency.
  Flagged here for a future TRD.
- **Files modified:** none
- **Commit:** n/a

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: gitFacts + pure decideRoute + preflight CLI (tests 1-10, 18, 19) | `node --test plugins/devflow/devflow/bin/lib/adopt-preflight.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs` | 0 | PASS |
| 2: begin + marker + resume (tests 11-17) | `node --test plugins/devflow/devflow/bin/lib/adopt-preflight.test.cjs` | 0 | PASS |
| Combined final run | `node --test plugins/devflow/devflow/bin/lib/adopt-preflight.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs` | 0 | PASS (50/50: 38 adopt + 12 help) |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| Task 1 RED (tests 1-10, 18, 19 written; `adopt.cjs` did not exist) | `node --test plugins/devflow/devflow/bin/lib/adopt-preflight.test.cjs` | non-zero (`MODULE_NOT_FOUND: Cannot find module './adopt.cjs'`) | FAIL (correct) |
| Task 1 GREEN (after `adopt.cjs`/`adopt-cli.cjs`/dispatcher/HELP_TABLE) | `node --test plugins/devflow/devflow/bin/lib/adopt-preflight.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs` | 0 | PASS (correct) |
| Task 2 RED (tests 11-17 appended) | not observed — see Deviation 2 above; implementation was already complete from Task 1's GREEN commit | 0 (passed immediately) | Deviation: expected FAIL, actually PASS |
| Task 2 GREEN (full suite) | `node --test plugins/devflow/devflow/bin/lib/adopt-preflight.test.cjs` | 0 | PASS (38/38, correct) |

## Post-TRD Verification

- Auto-fix cycles used: 0 (both documented deviations were design/process decisions, not bug
  fix-and-retry cycles)
- Must-haves verified:
  - `--cwd` spawn from an unrelated directory routes go-service->adopt, devflow->upgrade,
    empty->new-project, dirty->refuse (`dirty-tree`, naming `main.go`/`notes.txt`) — tests 1-4, PASS
  - Every refusal leaves the repo unchanged (`repoSnapshot` identical before/after, for both
    preflight and begin) — tests 4-8, 10, 14, 15, 16, PASS
  - 12-rule precedence order (busy > detached > marker-resume > dirty > `.planning` > greenfield >
    no-commits > branch-exists > adopt) — tests 9, 18 (20-row table), PASS
  - `scratch` routes to adopt, not refused — covered by go-service fixture's `repo_state.state`
    assertion (test 1) and table test 18
  - `begin` on route adopt: `git switch -c devflow/adopt`, HEAD/tree unchanged, marker written at
    the git-path location with `status: 'in_progress'`, `base_branch`, `base_sha`, `started_at`,
    `plugin_version` — test 11, PASS
  - Resume idempotency: second `begin` leaves marker bytes identical — test 12, PASS
  - Post-adopt-commit routing to `upgrade` (marker ignored once `.planning/ROADMAP.md` tracked in
    HEAD) — test 17, PASS
  - Exit codes: refuse->3, all else->0 — verified throughout every spawned test
  - HELP_TABLE `adopt` entry exists, `mutates: true`, usage names all 4 subcommands,
    `help.test.cjs` passes — PASS (with Deviation 1 noted above)
  - `rg -n "stash|reset --" plugins/devflow/devflow/bin/lib/adopt.cjs` finds no git stash/reset
    invocation (3 matches, all in comments/user-facing message strings stating "adopt never
    stashes") — PASS
  - 9/9 must_haves truths: **PASS**
- Gate failures: None outside baseline (see Regression Gate below)

## Regression Gate

Command: `node --test --test-reporter=spec 'plugins/devflow/**/!(micro).test.cjs'
'plugins/devflow/**/*.test.js' 'scripts/**/*.test.cjs'` (run from repo root).

- **Observed totals:** 3906 tests, 3873 pass, 1 fail, 32 skipped, 0 cancelled.
- **Failures classified:**

| Test | File:Line | Classification |
|---|---|---|
| MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path | `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` | **Baseline** — present verbatim in `.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv` (line 16). Pre-existing, unrelated to this TRD's files. |

- **Re-run note:** a first invocation of the gate (before this classification pass) additionally
  showed 2 failures in `check-todos.test.cjs` (`E2E1` self-test JSON parse, `E2E3` workflow
  dispatch target path) that are **not** in the baseline TSV. Isolating the cause: that first
  invocation's shell `cwd` was this session's default working directory
  (`.planning/objectives/37-adopt-existing-repos`), not the repo root, so `df-tools check-todos`'s
  own self-test spawned against the wrong tree. Re-running the identical command with `cwd`
  forced to the repo root (via a scratchpad wrapper script, since a bare `cd &&` is a compound
  command) reproduced neither failure — both are **environment artifacts of the invocation**, not
  regressions, and are excluded from the table above. `adopt-preflight.test.cjs` was unaffected in
  either run (it always spawns `df-tools` with an explicit `--cwd <fixture>` argument).
- **New/undeclared regressions: 0.** The 20 other baseline-TSV entries (devflow-watch,
  `df-tools --files` x4, remaining `handoff-e2e` cases, `project-state.test.cjs` x4,
  `verify-commits.test.js`) did not fail in this run; baseline entries are a tolerance allowlist,
  not a requirement that they always fail.
- `baseline-failures.tsv` was not edited.

## Commits

| Hash | Message |
|---|---|
| d95ae79 | test(37-05): adopt preflight routing and refusal cases |
| 1dfb214 | feat(37-05): df-tools adopt preflight |
| a38a083 | test(37-05): adopt begin, marker and resume cases |

## Self-Check: PASSED

- `plugins/devflow/devflow/bin/lib/adopt.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/adopt-cli.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/adopt-preflight.test.cjs` — FOUND
- `plugins/devflow/devflow/bin/df-tools.cjs` — FOUND (modified)
- `plugins/devflow/devflow/bin/lib/help.cjs` — FOUND (modified)
- Commit d95ae79 — FOUND in `git log`
- Commit 1dfb214 — FOUND in `git log`
- Commit a38a083 — FOUND in `git log`
