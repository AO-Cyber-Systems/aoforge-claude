---
mode: quick
id: 20-jobs-line-replaces-its-leading-count-ins
title: "`updateJobsLine()` replaces an existing leading count instead of prepending a second one"
commits:
  - ad846ef # test: failing cases for Jobs-line leading-count replace
  - 3ee4cfb # fix: Jobs line replaces its leading count instead of prepending a second one
completed: 2026-09-28
---

# Quick 20: Jobs line replaces its leading count instead of prepending a second one — Summary

`computeJobsLineText()` in `plugins/devflow/devflow/bin/lib/roadmap-progress.cjs` only ever
stripped a literal `N/M jobs (complete|executed)` prefix, so real ROADMAP lines like
`0/16 complete` (no `jobs` word) never matched — the new counter got **prepended** on top
of the old one instead of replacing it, e.g.
`15/16 jobs executed — 0/16 complete — 16 TRDs in 13 waves (...)`.

## What changed

`JOBS_MANAGED_PREFIX_PATTERN` (single strip-only pattern) was replaced with two patterns:

- `JOBS_LEADING_COUNT_PATTERN` — matches a leading `N/M` count fragment: numbers, an
  optional single noun word (`jobs` / `TRDs` / ...), then a verb (`complete` / `executed` /
  `done`), anchored to the start of the value.
- `JOBS_STACKED_COUNT_PATTERN` — the same fragment shape, preceded by a separator
  (`—`, `;`, `,`, `-`), used in a loop to self-heal an already-doubled line.

New `computeJobsLineText(existingText, counterText)` behavior:

- **Leading count present:** replace ONLY the `N/M` numbers with the numbers from
  `counterText`. The author's own noun and verb, and every byte after the fragment, are
  kept byte-identical. `10/10 complete, verified passed 66/66 (...)` → only `10/10` can
  ever change; `66/66` is never mistaken for a count because it isn't at the start of the
  value.
- **No leading count:** prepend `N/M jobs complete — ` exactly as before (unaffected).
- **Already-stacked count** (an old bug's leftover): the extra fragment(s) after the first
  are stripped, and the result keeps the FIRST fragment's own noun and verb, not the
  counter's.

This is an orchestrator-directed refinement of the JOB.md spec: the JOB.md's own test list
assumed the new counter's wording (`N/M jobs complete`) replaced the whole leading
fragment; the orchestrator instructed that only the numbers get replaced, keeping the
author's original noun/verb. Test expectations in both files were written to the
orchestrator's semantics, not the JOB.md's literal ones (this also means a line like
`0/16 complete` becomes `16/16 complete`, never `16/16 jobs complete`).

## Task Evidence

| Task | Command | Exit Code | Status |
|---|---|---|---|
| 1: RED | `node --test roadmap.test.cjs` / `objective.test.cjs` | 1 / 1 | FAIL (correct — 9 + 1 new cases failed on duplicated-count output; all pre-existing cases passed) |
| 2: GREEN | `node --test roadmap.test.cjs` / `objective.test.cjs` | 0 / 0 | PASS (19/19, 7/7) |
| 3: Scratch replay + gate | see below | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test --test-reporter=tap roadmap.test.cjs` | fail 9/19 | FAIL (correct) |
| RED | `node --test --test-reporter=tap objective.test.cjs` | fail 1/7 | FAIL (correct) |
| GREEN | `node --test --test-reporter=tap roadmap.test.cjs` | pass 19/19 | PASS (correct) |
| GREEN | `node --test --test-reporter=tap objective.test.cjs` | pass 7/7 | PASS (correct) |

Cases 1, 2, 4, 5, 7, 12, 14 failed at RED as required (duplicated-count output, e.g.
`10/10 jobs complete — 0/10 complete — 10 TRDs in 4 waves (...)`); cases 3 and 6 also
failed at RED under the orchestrator's stricter semantics (not required, but consistent);
cases 8–11 and the two fixture-sanity checks already passed (regression guards, unaffected
prepend/placeholder paths).

## Scratch replay (Objective 37)

Ran against a throwaway copy at
`/private/tmp/claude-501/-Users-justin-dev-devflow-claude/93fad3ef-03e9-445d-8200-6b34fdb012b2/scratchpad/quick20-replay`
via `df-tools.cjs --cwd <scratch>`, never the real repo:

```
node .../df-tools.cjs --cwd <scratch> roadmap update-job-progress 37
node .../df-tools.cjs --cwd <scratch> objective complete 37
diff <scratch>/ROADMAP.before.md <scratch>/.planning/ROADMAP.md
```

Diff — exactly 2 hunks, nothing else changed:

```diff
92c92
< | 37. /devflow:adopt + backup pruning | v1.3 | 0/16 | Planned | — |
---
> | 37. /devflow:adopt + backup pruning | v1.3 | 16/16 | Complete | 2026-09-28 |
275c275
< **Jobs:** 0/16 complete — 16 TRDs in 13 waves (planned 2026-09-28; objective-local requirement IDs ADP-01..ADP-07; simulated runs 37-11→37-14 chained in depends_on so each runs alone and owns its own gate; 37-16 is a human-verify checkpoint, not autonomous)
---
> **Jobs:** 16/16 complete — 16 TRDs in 13 waves (planned 2026-09-28; objective-local requirement IDs ADP-01..ADP-07; simulated runs 37-11→37-14 chained in depends_on so each runs alone and owns its own gate; 37-16 is a human-verify checkpoint, not autonomous)
```

The Jobs line has a single `16/16 complete` count (no inserted "jobs" word, since the
original `0/16 complete` fragment had no noun) with a byte-identical tail. Confirmed via
`git -C /Users/justin/dev/devflow-claude status --short .planning` (and `git diff --stat`)
that the real `.planning/ROADMAP.md` and the rest of `.planning/` were never touched by
either `--cwd`-scoped command.

## Validation Gate Results (regression, baseline-relative)

`npm test` (4023 tests, 577 suites): 3990 pass, 1 fail, 32 skipped.

| Gate | Command | Result |
|---|---|---|
| Full suite | `npm test` | 1 failure total |
| Baseline classification | vs `.planning/objectives/37-adopt-existing-repos/baseline-failures.tsv`, excluding `micro.test.cjs` | PASS — the one failure is in the baseline |

The single failure — `handoff-e2e.test.cjs:795:3` "MA-7 doctl auth init with unset
DIGITALOCEAN_TOKEN — secret-resolution OR architectural-gap path" — is listed verbatim in
`baseline-failures.tsv` (pre-existing, environment/timing-dependent). No failure came from
`micro.test.cjs` on either side. No new failures outside the baseline.

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (leading-count replace, prepend-when-absent, placeholder/empty,
  stacked self-heal, idempotency, Objective 37 scratch replay)
- Gate failures: None outside baseline

## Self-Check: PASSED

- `plugins/devflow/devflow/bin/lib/roadmap-progress.cjs` — FOUND, modified
- `plugins/devflow/devflow/bin/lib/roadmap.test.cjs` — FOUND, modified (19 tests, 0 fail)
- `plugins/devflow/devflow/bin/lib/objective.test.cjs` — FOUND, modified (7 tests, 0 fail)
- Commit `ad846ef` (test:) — FOUND in `git log`
- Commit `3ee4cfb` (fix:) — FOUND in `git log`
- Real `.planning/ROADMAP.md` — confirmed untouched by scratch replay
