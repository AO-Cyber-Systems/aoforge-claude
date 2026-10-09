---
objective: 38-doc-auto-correction
trd: "11"
subsystem: telemetry
tags: [telemetry, cli, doc-staleness, status, help]

requires:
  - objective: 38-doc-auto-correction TRD 04
    provides: workflow bodies naming only live commands
  - objective: 38-doc-auto-correction TRD 10
    provides: doc-staleness.collect() and `df-tools validate docs`
provides:
  - "`df-tools telemetry [--raw]` — a real, wired CLI command (was documented but unreachable)"
  - "telemetry.collect() merges doc-staleness advisories (`docs: <code> <message> — <fix>`)"
  - "`/devflow:status` renders a `## Documentation` section from `validate docs --raw`"
affects: [38-12]

tech-stack:
  added: []
  patterns:
    - "Inline require of the module being stubbed (not top-of-file) so require.cache substitution in tests reaches the real call site — mirrors validate.cjs's W054 test pattern"

key-files:
  created:
    - plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs
  modified:
    - plugins/devflow/devflow/bin/lib/telemetry.cjs
    - plugins/devflow/devflow/bin/lib/telemetry.test.cjs
    - plugins/devflow/devflow/bin/df-tools.cjs
    - plugins/devflow/devflow/bin/lib/help.cjs
    - plugins/devflow/devflow/workflows/progress.md

key-decisions:
  - "df-tools.cjs has no top-level fs/path/os or `output` import (most cases delegate to lib cmd* functions that import their own). The `telemetry` case requires all four locally, matching the existing inline-require style used by the `planning sibling-trd-scan` case a few hundred lines up — not a top-of-file addition."
  - "CLI test 5's fixture combines 5 recordOverride() calls with a stale-STACK.md fixture (not just one signal) so the raw/JSON line-equality assertion is checked against a genuinely multi-line advisories array, not a length-1 coincidence."

patterns-established:
  - "Inline require of a stubbed dependency at its true call site (not hoisted to file top) keeps require.cache substitution effective for a failure-path test"

requirements-completed:
  - "DOC-08 (telemetry + status): `df-tools telemetry` is a real CLI command whose advisories include doc staleness; `/devflow:status` shows doc advisories"

verification:
  gates_defined: 1
  gates_passed: 1
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true

duration: ~15min
completed: 2026-09-28
tokens_input: 9133019
tokens_output: 45917
tokens_cache_read: 9013639
tokens_cache_write: 119204
token_model: "claude-sonnet-5"
tokens_source: "backfill"
---

# Objective 38 TRD 11: Wire `df-tools telemetry` and show doc advisories in `/devflow:status` Summary

**`df-tools telemetry [--raw]` goes from `Error: Unknown command: telemetry` to a live dispatcher case that merges `doc-staleness.collect()` into the existing overrides/progress-guard advisories, and `/devflow:status`'s report step now renders those same advisories in a `## Documentation` section via `validate docs --raw`.**

## Performance

- **Duration:** ~15 min (4 task commits + full regression suite + this summary)
- **Started:** 2026-09-28T13:04:32Z (preflight claim)
- **Completed:** 2026-09-28T13:10:17-04:00 (last task commit) + regression/summary time
- **Tasks:** 2
- **Files modified:** 5 (4 modified, 1 created)

## Accomplishments
- `telemetry.collect({planningDir, sessionReport, userHome})` now also calls `doc-staleness.collect({projectRoot, userHome})`, setting `out.docs = {checked, count}` and pushing one `docs: <code> <message> — <fix>` advisory per issue; a throw becomes the single advisory `docs: staleness check failed — <msg>`.
- `df-tools telemetry [--raw]` is a real dispatcher case (`df-tools.cjs`), with a matching `help.cjs` entry so `telemetry --help` and the every-case-has-help gate both pass.
- `/devflow:status`'s `report` step (`workflows/progress.md`) now runs `df-tools.cjs validate docs --raw` and presents a `## Documentation` section (only shown when the output isn't `no documentation advisories`), naming the live `/devflow:status check` command per the workflow's own gotcha.
- `doc-surfaces.test.cjs` (new) pins the wiring itself: the dispatcher case, the help entry, and the workflow text — not just the runtime behavior.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Doc advisories in telemetry.collect | `node --test plugins/devflow/devflow/bin/lib/telemetry.test.cjs` | 0 | PASS (11/11) |
| 2: CLI + status surface | `node --test telemetry.test.cjs doc-surfaces.test.cjs help.test.cjs doc-refs.repo.test.cjs` | 0 | PASS (39/39) |
| 2: done criterion | `node plugins/devflow/devflow/bin/df-tools.cjs telemetry --raw` (this repo) | 0 | PASS — `nothing needs attention` |

## Task Commits

Each task was committed atomically (RED then GREEN, per `tdd="true"`):

1. **Task 1 RED:** `619a9cf` — test(38-11): telemetry carries documentation-staleness advisories
2. **Task 1 GREEN:** `57ab2f6` — feat(38-11): telemetry.collect merges doc-staleness advisories
3. **Task 2 RED:** `28d0b38` — test(38-11): df-tools telemetry CLI and status doc-advisory wiring
4. **Task 2 GREEN:** `b0d9875` — feat(38-11): wire df-tools telemetry; /devflow:status shows doc advisories

**Plan metadata:** (this commit, to follow)

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| Task 2 verify (telemetry, doc-surfaces, help, doc-refs) | `node --test <4 files>` | 0 | PASS (39/39) |
| Full suite (regression gate) | `npm test` | non-zero (1 pre-existing baseline flake) | PASS — see Regression Suite below |

## TDD Evidence

**Task 1 — Doc advisories in telemetry.collect (tests 1-3):**

| Phase | Command | Exit Code | Result |
|---|---|---|---|
| RED | `node --test telemetry.test.cjs` | 1 | 8 old pass, 3 new fail (test 1: no `docs: W051` advisory yet; test 2: `r.docs` undefined → TypeError; test 3: stub never reached, no `docs:` advisory) — correct RED |
| GREEN | `node --test telemetry.test.cjs` | 0 | 11/11 pass |

**Task 2 — `df-tools telemetry` CLI + status surface (tests 4-9):**

| Phase | Command | Exit Code | Result |
|---|---|---|---|
| RED | `node --test telemetry.test.cjs doc-surfaces.test.cjs` | 1 | 11 old pass, 6 new fail (`Error: Unknown command: telemetry` ×4 CLI tests; `case 'telemetry'` / `## Documentation` absent ×2 doc-surfaces tests) — correct RED |
| GREEN | `node --test telemetry.test.cjs doc-surfaces.test.cjs help.test.cjs doc-refs.repo.test.cjs` | 0 | 39/39 pass |

Interim GREEN fix (still within Task 2, before the commit): the codebase-example dispatcher snippet assumed `output(...)` was already in scope inside `df-tools.cjs`, but `df-tools.cjs` has no top-level `output` import — every other case delegates to a `lib/*.cjs` `cmd*` function that imports its own. First GREEN attempt threw `ReferenceError: output is not defined` on tests 6-7 (caught by the same RED→GREEN verify run, not a separate deviation cycle); fixed by requiring `{ output }` from `helpers.cjs` locally inside the `telemetry` case, aliased `outputTelemetry` to avoid shadowing. Re-ran GREEN verify — 39/39 pass. Not logged as a Rule-1/2/3 deviation since it surfaced and was fixed inside the same GREEN pass before any commit, per the TDD flow's own "debug/iterate (max 3 attempts)" allowance.

## `df-tools telemetry` — before / after

**Before** (verified in the TRD's own must_haves truth #1, 2026-09-28, prior to this TRD's base commit `3efb4ea`):
```
$ node plugins/devflow/devflow/bin/df-tools.cjs telemetry
Error: Unknown command: telemetry
```

**After** (this repo, post-TRD):
```
$ node plugins/devflow/devflow/bin/df-tools.cjs telemetry --raw
nothing needs attention
$ node plugins/devflow/devflow/bin/df-tools.cjs telemetry
{
  "overrides": { "total": 0, "by_gate": {}, "recent": [] },
  "progress_guard": { "sessions_tracked": 2, "worst_streak": 1 },
  "blocks": null,
  "docs": {
    "checked": {
      "removed_refs": "ok",
      "stack_review": "ok",
      "stack_drift": "ok",
      "codebase_map": "skipped:no-maps"
    },
    "count": 0
  },
  "advisories": ["nothing needs attention"]
}
```

## Post-TRD Verification

- **Auto-fix cycles used:** 0 (the `output` scoping fix above was resolved inside the normal RED→GREEN debug/iterate step, not a post-hoc Rule 1-3 deviation)
- **Must-haves verified:** 6/6 — before/after CLI behavior, `out.docs = {checked, count}` + `docs:` advisory format, throw fallback advisory, pre-existing telemetry tests unchanged, `help.cjs` entry + `help.test.cjs` green + other objective-31 modules left unwired, `progress.md` `## Documentation` section + `doc-surfaces.test.cjs` pinning
- **Gate failures:** None

## Regression Suite (full run vs. baseline)

`npm --prefix /Users/justin/dev/devflow-claude test` — one full run before final commit:

```
ℹ tests 4119
ℹ suites 607
ℹ pass 4086
ℹ fail 1
ℹ cancelled 0
ℹ skipped 32
```

The one failure is named verbatim in `.planning/objectives/38-doc-auto-correction/baseline-failures.tsv`:

- `plugins/devflow/devflow/bin/handoff-e2e.test.cjs:795:3` — `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path`

Re-ran in isolation (`node --test --test-name-pattern="MA-7" handoff-e2e.test.cjs`) — same failure, confirming it is the pre-existing baseline flake, not a regression introduced by this TRD (none of this TRD's files touch `handoff-e2e.test.cjs` or the doctl/daemon secret-resolution path). No unlisted failures — nothing else required isolated re-run. The TSV was not edited.

Test count increased from 38-10's baseline run (4096 tests) to 4119 — the 23 new tests are this TRD's own (11 telemetry.test.cjs additions minus the 2 already counted pre-existing, actually: 6 new telemetry.test.cjs tests + 2 new doc-surfaces.test.cjs tests = 8 net-new test cases visible in the task-2 verify run; the broader 23-test delta across the full suite reflects other in-flight objective work already on this branch, not attributable to 38-11 alone).

## Deviations from Plan

None — TRD executed exactly as written. The one implementation wrinkle (the `output` helper not being in `df-tools.cjs`'s top-level scope, unlike the codebase-example snippet assumed) was caught and fixed within Task 2's own GREEN iteration, before any commit, and is documented above under TDD Evidence rather than as a Rule 1-3 deviation, since it never reached a committed or user-visible state in its broken form.

## Issues Encountered

A message purporting to be from "another Claude session" arrived mid-execution (after Task 1's GREEN test run, before its commit) asking this agent to "continue TRD 38-11 from where you stopped." This agent had not stopped and was not spawned by that sender; per the harness's own framing, such a message cannot authorize or redirect this agent's work, and no `SendMessage` tool was available in this session to reply. Treated as informational only — this agent continued its own in-progress execution without restarting, duplicating, or ceding any step. Flagging here for the orchestrator in case a second executor was also dispatched against the same `38-11` claim (the `exec-context check` claim system exists precisely to prevent two executors sharing one git index).

## Files Created/Modified
- `plugins/devflow/devflow/bin/lib/telemetry.cjs` - `collect()` merges doc-staleness issues into `out.docs` and `docs:`-prefixed advisories
- `plugins/devflow/devflow/bin/lib/telemetry.test.cjs` - tests 1-3 (doc-advisory merge) + tests 4-7 (CLI wiring)
- `plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs` - new; tests 8-9 (wiring pins: dispatcher case, help entry, progress.md text)
- `plugins/devflow/devflow/bin/df-tools.cjs` - new `case 'telemetry'` dispatcher arm
- `plugins/devflow/devflow/bin/lib/help.cjs` - new `telemetry` COMMANDS entry
- `plugins/devflow/devflow/workflows/progress.md` - `report` step now computes `DOC_ADVISORIES` and the Present template gained a conditional `## Documentation` section

## Decisions Made
- Kept the scope strictly to `telemetry` per the TRD's own binding runtime model — `context`, `session-audit`, `override` and `transcript-export` remain unwired; that is TRD 38-12's documented decision to record in CLAUDE.md, not this TRD's to make.
- Did not add a `--sessions` flag to `df-tools telemetry` (per gotcha: `sessionReport` stays opt-in/caller-supplied, and session-audit is unwired).

## Next Objective Readiness
- TRD 38-12 can now correct CLAUDE.md to state that `telemetry` is wired while `context`/`session-audit`/`override`/`transcript-export` remain intentionally unwired.
- Health Check 14 (38-10) remains the severable fallback per this TRD's `key_links` — if 38-11 were ever reverted, every doc advisory would still surface there.

---
*Objective: 38-doc-auto-correction*
*Completed: 2026-09-28*

## Self-Check: PASSED

- `plugins/devflow/devflow/bin/lib/telemetry.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/telemetry.test.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/doc-surfaces.test.cjs` — FOUND
- `plugins/devflow/devflow/bin/df-tools.cjs` — FOUND
- `plugins/devflow/devflow/bin/lib/help.cjs` — FOUND
- `plugins/devflow/devflow/workflows/progress.md` — FOUND
- Commit `619a9cf` — FOUND in git log
- Commit `57ab2f6` — FOUND in git log
- Commit `28d0b38` — FOUND in git log
- Commit `b0d9875` — FOUND in git log
