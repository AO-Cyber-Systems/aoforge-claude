---
objective: 57-estimation-data-foundation
trd: "07"
subsystem: estimation
tags: [backfill, calibrate, dogfood, docs, tokens, deterministic-output]

requires:
  - objective: 57-estimation-data-foundation
    provides: tokens backfill / calibrate CLI from 57-06, calibrator from 57-05, backfill from 57-04, stamp from 57-03
provides:
  - "231 historical SUMMARYs stamped with tokens_* frontmatter (tokens_source: backfill), one commit"
  - "~/.claude/devflow/calibration.json built from this repository's history; rerun byte-identical"
  - "CHANGELOG [Unreleased], CLAUDE.md and USER-GUIDE entries for tokens, calibrate and model-rates.json"
affects: [58-estimation-engine]

tech-stack:
  added: []
  patterns:
    - "Diff guard before commit: only added tokens_*/token_model lines, zero removals, SUMMARY files only"

key-files:
  created: []
  modified:
    - CHANGELOG.md
    - CLAUDE.md
    - docs/USER-GUIDE.md
    - ".planning/objectives/*/*-SUMMARY.md (231 historical SUMMARYs, frontmatter only)"

key-decisions:
  - "Staged the backfill with the quoted pathspec `.planning/objectives/*/*-SUMMARY.md` instead of 231 explicit paths, so the user's untracked .gitkeep files can never be swept in"
  - "Kept this TRD's own SUMMARY out of the backfill commit and out of the idempotence and calibrate runs; it joined the docs commit"

requirements-completed: [EST-06, EST-07, EST-01]

duration: 4min
completed: 2026-10-05
tokens_input: 4403849
tokens_output: 22405
tokens_cache_read: 4297524
tokens_cache_write: 106241
token_model: "claude-sonnet-5-5"
tokens_source: "live"
---

# Objective 57 TRD 07: Backfill, calibrate and document Summary

**This repository's history now carries recovered token usage on 231 of 396 SUMMARYs, `~/.claude/devflow/calibration.json` was written from it (313 TRDs, 723 tasks) and reruns byte-identical, and CHANGELOG, CLAUDE.md and USER-GUIDE describe the commands.**

## Progress
- [x] Task 1: Backfill this repo's SUMMARY history — ecd446f4
- [x] Task 2: Calibrate for real, rerun byte-identical — no commit (output is `~/.claude/devflow/calibration.json`, outside the repo)
- [x] Task 3: CHANGELOG, CLAUDE.md and USER-GUIDE — 73236e50

## Accomplishments

### Backfill (EST-07, success criterion 2)

Dry run, then `--write`, with the repo copy of df-tools:

```
summaries 396 · already stamped 2 · recovered 231 · unrecovered 163 (no_transcript 156, unkeyed 7)
executor transcripts 864 (identified 241, unidentified 74, ambiguous 3, foreign 546)
written 231 · unchanged 0 · skipped 0 · failed 0
```

- **Recovered 231, unrecovered 163.** Unrecovered by reason: `no_transcript` 156 (transcript gone to retention, expected),
  `unkeyed` 7 (the SUMMARY has no TRD key to match). The 2 already-stamped SUMMARYs are 57-03 and 57-06, which carry live
  stamps and were left as written.
- Diff guard, run before the commit:
  `{"files":231,"non_summary":[],"bad_count":0,"bad":[]}`. The commit (`ecd446f4`) is 231 files, 1386 insertions (6 per file),
  0 deletions.
- Spot check (`56-05-SUMMARY.md`): `tokens_input: 4148218`, `tokens_output: 17420`, `tokens_cache_read: 4061711`,
  `tokens_cache_write: 86419`, `token_model: "claude-sonnet-5-5"`, `tokens_source: "backfill"`.
- Idempotence, after the commit: `summaries 396 · already stamped 233 · recovered 0 · unrecovered 163 (no_transcript 156,
  unkeyed 7)`. The nine untracked `.gitkeep` files under `.planning/objectives/` were never staged.

### Calibrate (EST-01, success criteria 3 and 4)

```
calibration /Users/justin/.claude/devflow/calibration.json: changed · 313 TRDs, 723 tasks, 233 with tokens · classes code_tdd 409, test_tdd 101, prompt 53, doc 49, prompt_tdd 42, schema_tdd 19, code 17, other 13, test 12, doc_tdd 5, config 2, schema 1
```

| Run | Report slot | sha256 |
|---|---|---|
| 1 (default path) | `changed` | `ed8e2ef595e661afd3ec01bbdbf6fc37fbd36c4e6eeb49ac67cce688985353e8` |
| 2 (default path) | `unchanged` | `ed8e2ef595e661afd3ec01bbdbf6fc37fbd36c4e6eeb49ac67cce688985353e8` |
| 3 (`--out` scratch copy) | `changed` (the scratch file did not exist yet) | `cmp` against the default file exits 0 |

Calibration slice (`samples`, then `[samples, minutes p50, minutes p90]` per class; `data_as_of` 2026-10-05):

```
samples: tasks 723, trds 313, with_tokens 233
all [723, 5, 18.3]        code [17, 3.5, 5]         code_tdd [409, 6, 18.3]    config [2, 1, 2.5]
doc [49, 4, 22.5]         doc_tdd [5, 5, 15]        other [13, 11, 45]         prompt [53, 3, 12.5]
prompt_tdd [42, 5, 20]    schema [1, 2, 2]          schema_tdd [19, 15, 27.5]  test [12, 2.5, 17.5]
test_tdd [101, 4.5, 18.3]
probabilities: checkpoint {n 313, value 0.016}, gap_closure {n 47, value 0.0851}
unpriced_models: []
```

`schema` (1 sample), `config` (2) and `doc_tdd` (5) are too thin to trust; `code_tdd` (409) and `test_tdd` (101) are solid.

### Forward stamp (EST-06, success criterion 1)

This SUMMARY is stamped live with `tokens stamp 57-07 --draft` (repo copy) before `summary post`; see the published
frontmatter (`tokens_source: "live"`).

### Docs

CHANGELOG `[Unreleased]` (Added: tokens, calibrate, model-rates.json, with the live numbers above; Changed: stamping,
`lib/trd-identify.cjs`, `forEachRecord`; Fixed: executor.md `--job`), a one-bullet **Estimation data** entry in CLAUDE.md's
Core Tool list, and a new USER-GUIDE section after "Upgrading a Project in Place" (commands, flags, env overrides,
`calibration.json` keys, how to update rates, why unrecovered history is normal).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: backfill | diff guard JSON (`bad_count` 0, `non_summary` `[]`); post-commit `tokens backfill --raw` reports `recovered 0`; `git status --short --untracked-files=no -- .planning/objectives` empty | 0 | PASS |
| 2: calibrate | two default runs, second `unchanged`, identical sha256; `cmp` default vs `--out` copy | 0 | PASS |
| 3: docs | `node --test lib/dispatch-completeness.test.cjs lib/doc-refs.repo.test.cjs lib/doc-surfaces.test.cjs lib/changelog.test.cjs` (28 tests) | 0 | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test_scoped | dispatch-completeness, doc-refs.repo, doc-surfaces, changelog | 0 | PASS |
| test | `npm test`: 9495 tests, 9461 pass, 2 fail, 32 skipped | 1 | only the known baseline failures |

The two failures are handoff-e2e MA-7 (PTY mock auth) and stack-drafter-fleet github-enterprise-migration (real fleet).
roadmap-reconcile E2E1, which 57-06 expected to fail until `roadmap update-job-progress 57` runs, passed in this run.

## Discovered commands

None.

## Deviations from Plan

### Choices within the TRD's and the orchestrator's instructions

- **Pathspec instead of 231 explicit paths.** The orchestrator asked for the changed SUMMARYs to be passed explicitly. The
  commit used the quoted pathspec `.planning/objectives/*/*-SUMMARY.md` (git expands it, the shell does not). The diff guard
  had already shown that exactly 231 tracked `*-SUMMARY.md` files were modified and nothing else; the pathspec cannot match
  the untracked `.gitkeep` files, and the resulting commit is 231 files, 1386 insertions, 0 deletions.
- **SUMMARY checkpoint deferred.** The per-task checkpoint for Task 1 was not published before the backfill commit, so the
  57-07 SUMMARY did not exist when backfill ran (the TRD's gotcha) and could not be recovered from this run's own transcript
  on the idempotence check. The checkpoint covering Tasks 1-3 landed in the docs commit.
- Task 2 produces no commit: `calibration.json` is under `~/.claude`, outside the repository.

None of the deviation rules (1-4) were triggered. No defect was found in the new commands.

## Issues Encountered

CLAUDE.md's first draft of the Estimation data bullet began a code span with `backfill`, which the dispatch-completeness
extractor read as a command name. Rewording it to "the backfill form" fixed it (the TRD's own recovery path).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (history backfilled with counts reported; diff guard clean; second dry run recovered 0;
  calibrate wrote and reran identical; own SUMMARY stamped live; docs describe the commands)
- Gate failures: none beyond the two known baseline failures

## Self-Check: PASSED

- FOUND: commits ecd446f4 and 73236e50 on feat/stack-profile-loader
- FOUND: /Users/justin/.claude/devflow/calibration.json (sha256 ed8e2ef5...53e8, identical on rerun)
- FOUND: CHANGELOG.md (`df-tools calibrate`, `model-rates.json`), CLAUDE.md and docs/USER-GUIDE.md (Estimation data)
- FOUND: `git status --short --untracked-files=no -- .planning/objectives` empty after the backfill commit
