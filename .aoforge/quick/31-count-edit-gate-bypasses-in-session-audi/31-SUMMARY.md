---
objective: quick-31
trd: 01
subsystem: telemetry
tags: [session-audit, edit-gate, decision-001, telemetry, tdd]
requires: []
provides:
  - "session-audit gives every edit-gate denial one outcome (bypassed, routed, abandoned) as `edit_gate_bypass`"
  - "DECISION-001 measurement over the real transcript corpus (two windows)"
affects: [session-audit, audit-cli, telemetry-guide, decision-001]
tech-stack:
  added: []
  patterns:
    - "per-session denial tracker that reads only structured blocks and writes only its own accumulator slot"
    - "heredoc stripper that keeps the opener line so `cat <<'EOF' > P` still exposes `> P`"
    - "drift-guard test instead of a runtime require across the unmirrored hooks/ boundary"
key-files:
  modified:
    - plugins/devflow/devflow/bin/lib/session-audit.cjs
    - plugins/devflow/devflow/bin/lib/session-audit.test.cjs
    - plugins/devflow/devflow/bin/lib/audit-cli.cjs
    - plugins/devflow/devflow/bin/lib/audit-cli.test.cjs
    - CHANGELOG.md
    - site/content/docs/guides/telemetry.md
decisions:
  - "A user override phrase counts as routed (a sanctioned path), documented in the code comment"
  - "The bypass sample is stamped with the bypassing command's row timestamp; by_period uses the denial's timestamp"
  - "perl -i detection requires the `i` to close the flag cluster (`-pi`, `-i.bak`), so `-Mstrict` is not read as in-place edit"
metrics:
  completed: 2026-10-05
---

# Quick 31: count edit-gate bypasses in `df-tools session-audit` Summary

`df-tools session-audit` now classifies each edit-gate denial as bypassed (a later Bash write of the same file), routed (skill, `skill-active --start`, typed `/devflow:` command or override phrase) or abandoned, and the real corpus shows 135 denials since 2026-08-01 with 9 bypasses (6.7%), none of them after 2026-09-28.

## Progress
- [x] Task 1: RED: edit-gate bypass tests (C-1..C-3, E-1..E-14, S-1..S-5, W-1..W-3, D-1) — 1c5c087a
- [x] Task 2: GREEN: tracker + summary + prose line, CHANGELOG and docs — 60a4def7
- [x] Task 3: Measure the real corpus and record DECISION-001 data in the SUMMARY — (no source files; the numbers are below)

## What was built

- `session-audit.cjs`: `trackEditGate()` is called from `accumulate()` before the array early return, so string-content user rows (typed slash commands, prompts) reach it. It keeps per-session state (edit-family `tool_use` id to path, open denials) and resolves each denial by the first event after it. `summarize()` appends `edit_gate_bypass` after `verdict` (outcomes plus still-open denials as abandoned, nothing mutated). New exports: `bashWriteTargets`, `targetMatches`, `stripHeredocBodies`, `OVERRIDE_PHRASES`. `analyze()` frees each session's id-to-path map once its file is read.
- `audit-cli.cjs`: `formatSessionAuditRaw()` keeps lines 1-2 byte for byte, adds `edit_gate: ...` as line 3, and adds the by-period and sample lines only when denials > 0. A summary with no `edit_gate_bypass` reads as zeros.
- Tests: 58 new or rewritten cases (C-1..C-3, E-1..E-14 plus E-6b, E-6c, E-13b and two extras, S-1..S-5 plus S-2b, W-1/W-2 tables, W-3, D-1). Existing test 10 was rewritten to 3 lines in the RED commit.
- CHANGELOG `[Unreleased] ### Added` bullet and a short paragraph in the telemetry guide's "Session audit" section.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: RED tests | `node --test plugins/devflow/devflow/bin/lib/session-audit.test.cjs plugins/devflow/devflow/bin/lib/audit-cli.test.cjs` | 1 (118 tests, 60 pass, 58 fail; every failure is a missing export, missing `edit_gate_bypass` or the line count) | PASS (correct RED) |
| 2: GREEN | `node --test plugins/devflow/devflow/bin/lib/session-audit.test.cjs plugins/devflow/devflow/bin/lib/audit-cli.test.cjs` | 0 (118 tests, 118 pass, 0 fail) | PASS |
| 2: full suite | `npm test` | 1 (9222 tests, 9189 pass, 1 fail, 32 skipped; the one failure is MA-7) | PASS (only the accepted MA-7) |
| 3: measure | `node plugins/devflow/devflow/bin/df-tools.cjs session-audit --since <date> --limit 4000` (both windows) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED | `node --test .../session-audit.test.cjs .../audit-cli.test.cjs` | 1 | FAIL (correct): 58 of 118 |
| GREEN | `node --test .../session-audit.test.cjs .../audit-cli.test.cjs` | 0 | PASS (correct): 118 of 118 |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| test | `npm test` | 1 | PASS with the accepted exception: only `MA-7 doctl auth init with unset DIGITALOCEAN_TOKEN` (handoff pipeline, TRD 19-05) failed |

## DECISION-001 data

Measured with the repo's df-tools (`plugins/devflow/devflow/bin/df-tools.cjs`, since the `~/.claude/devflow` mirror has not picked up this change), `--limit 4000`, over `~/.claude/projects`. Both windows scanned 2,159 files, so neither was truncated by the limit. DECISION-001.md is unchanged (`git diff --stat .planning/decisions/` is empty).

| Window | Files | Sessions | Denials | Bypasses | Routed | Abandoned | bypass_rate | `by_category['devflow-edit-gate']` |
|---|---|---|---|---|---|---|---|---|
| `--since 2026-09-28` | 2159 | 941 | 36 | 0 | 31 | 5 | 0 | 36 |
| `--since 2026-08-01` | 2159 | 2124 | 135 | 9 | 118 | 8 | 0.067 | 135 |

In both windows denials equals bypasses + routed + abandoned equals the `devflow-edit-gate` category count (36 = 0+31+5, 135 = 9+118+8).

`by_period` (denials / bypasses / routed / abandoned):

| Window | 2026-09 | 2026-10 |
|---|---|---|
| `--since 2026-09-28` | 20 / 0 / 17 / 3 | 16 / 0 / 14 / 2 |
| `--since 2026-08-01` | 119 / 9 / 104 / 6 | 16 / 0 / 14 / 2 |

Months the corpus covers: only 2026-09 and 2026-10. `by_period` of the 2026-08-01 window has no 2026-08 key, so retention has already trimmed August (and everything earlier), and the 2026-08-01 window is effectively "everything left on disk". All 9 bypasses fall between 2026-09-06 and 2026-09-14, before the 2026-09-28 cutoff.

Bypass samples (the first 5 of 9, as the product reports them; commands truncated to 150 chars):

1. 2026-09-06 `provenance_graph_widget.dart` <- `cd /Users/justin/dev/aocore/admin && cp /tmp/pgw.bak lib/features/provenance/widget/provenance_graph_widget.dart && grep -n "width: kNodeCellWidth" li...`
2. 2026-09-06 `models_visibility_test.go` <- `cat > /Users/justin/dev/aocore/go/internal/api/management/models_visibility_test.go <<'GOEOF' package management // models_visibility_test.go — object...`
3. 2026-09-06 `pricing.go` <- `mkdir -p /private/tmp/claude-501/-Users-justin-dev-aocore/597660b8-.../scratchpad && cat > /Users/justin/dev/aocore/go/interna...`
4. 2026-09-06 `models_sync_contract_test.go` <- `cat > /Users/justin/dev/aocore/go/internal/api/admin/models_sync_contract_test.go <<'GOEOF' package admin // models_sync_contract_test.go — objective ...`
5. 2026-09-12 `backfill-call-channel-ids.sql` <- `cat > /Users/justin/dev/eden-circle/.claude/worktrees/agent-a7b64309fa550f535/scripts/backfill-call-channel-ids.sql <<'SQLEOF' -- Backfill calls.channel_id ...`

Spot-check of all 9 bypasses (the product caps samples at 5, so a throwaway scratch script replayed the audit and recorded every bypass with its denied path and write target): all 9 write the denied file and none is a basename false positive. Seven target the exact denied absolute path. Two use a relative target (`lib/features/provenance/widget/provenance_graph_widget.dart`, `lib/screens/student/journal/evening_examen_screen.dart`) after a `cd` into the directory that makes it the denied file. Sample 1 is a restore from a backup (`cp /tmp/pgw.bak <denied file>`); it still counts, because the definition is any write of the denied path.

How the denials were routed (same scratch replay): in the 09-28 window all 31 routed denials resolved on a `skill-active --start` Bash call; in the 08-01 window 114 resolved that way and 4 on a `devflow:*` Skill call. No typed `/devflow:` command and no user override phrase resolved a denial in either window.

Against the pre-fix baseline in DECISION-001 (1,357 denials and 331 heredoc bypasses, 2026-05-29 to 2026-08-18, roughly 24% of denials): 135 denials and 9 bypasses (6.7%) over the surviving corpus (2026-09 to 2026-10), and 36 denials with 0 bypasses since 2026-09-28. The baseline ran as a throwaway script with its own matching, so the two rates are indicative rather than a like-for-like comparison.

Definition caveats: a bypass counts the attempt when the Bash `tool_use` appears, not a confirmed write (the tool_result is not consulted). Outcomes are per transcript file and decided by the first event after the denial. Matching is basename-tolerant, so a same-named file elsewhere is a possible false positive (none found in these 9). A user override phrase counts as routed, not bypassed. `--since` drops rows rather than files, so `sessions` counts only files that have rows after the cutoff (941 vs 2124) and a denial whose originating `tool_use` row falls before the cutoff has no path and can only end routed or abandoned.

These are the numbers only. The decision stays with the user.

## Deviations from Plan

### Auto-fixed Issues

None for the three tasks as specified.

### Refinements within the spec (noted, not Rule 1-3 fixes)

- `perl` in-place detection uses `/^-[A-Za-z]*i(\.\S+)?$/` instead of the looser `/^-[A-Za-z]*i/`, so `perl -Mstrict -e ... FILE` is not read as `-i`. Every spec case (`-pi`) still matches.
- The raw `edit_gate_by_period:` line is omitted when denials > 0 but none carries a timestamp (it would otherwise print an empty period list).
- A few extra cases beyond the list: E-6b (isMeta text does not route), E-6c (override phrase in a user text block routes), E-13b (orphan denial can still be routed), S-2b (denial without a timestamp stays out of `by_period`), a NotebookEdit case, and a no-mutation case for `summarize()`.
- Sample `ts` is the bypassing command's row timestamp; the spec example did not say which row.

## Auth Gates

None.

## Discovered commands

None. `npm test` came from the stack profile (`stack command test`).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (new `edit_gate_bypass` key with pre-existing keys unchanged; denials === bypasses + routed + abandoned === category count on fixtures and both real windows; Bash write forms, including reads and `/dev/null` and heredoc-body negatives; routing signals including gate text never routing; `--raw` lines 1-2 byte-identical with `edit_gate:` as line 3; this DECISION-001 section with DECISION-001.md untouched)
- Gate failures: MA-7 only (accepted)

## Self-Check: PASSED

- FOUND: plugins/devflow/devflow/bin/lib/session-audit.cjs, session-audit.test.cjs, audit-cli.cjs, audit-cli.test.cjs, CHANGELOG.md, site/content/docs/guides/telemetry.md (all modified in commits 1c5c087a and 60a4def7)
- FOUND commits: 1c5c087a (test), 60a4def7 (feat)
- `git diff --stat .planning/decisions/` empty; no push; ROADMAP.md untouched
