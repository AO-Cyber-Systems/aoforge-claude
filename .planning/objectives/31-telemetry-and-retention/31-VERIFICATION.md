---
objective: 31-telemetry-and-retention
verified: 2026-09-28
status: passed
score: 6/6
re_verification: false
gaps: []
deferred:
  - item: "df-tools telemetry --scan (CLI transcript scan feeding the blocking-events advisory)"
    where: plugins/devflow/devflow/bin/df-tools.cjs:803-814 (telemetry case calls collect({ planningDir, userHome }) with no sessionReport)
    why: "Explicitly deferred by objective 39 (ROADMAP Objective 39: '`telemetry --scan` deferred'). The lib path (collect({ sessionReport })) is implemented and tested; only the CLI flag is absent."
notes:
  - kind: live_runtime
    note: "Live-runtime confirmation pending release. Hooks run from the plugin cache, so the 27-30 fixes take effect only after a plugin version bump plus sync-runtime. Verified against repo code and tests only. Re-run `df-tools session-audit --since <release-date>` after the bump; that comparison is the programme's real verdict."
  - kind: baseline
    note: "Pre-release baseline, 2026-09-28: `session-audit --limit 50` gives devflow_owned_events 1 (category tool-not-available), total_events 41, 15 of 50 sessions with blocks (30%). With `--since 2026-09-20`, 19 sessions have 0 DevFlow-owned blocks. Remaining DevFlow-owned events in historical transcripts are expected and are not a gap."
  - kind: minor_cli_ergonomics
    note: "`df-tools telemetry --scan --raw` exits 0 and prints 'nothing needs attention', ignoring the unknown flag without any warning. The same window's session-audit reports 1 DevFlow-owned event. A user who reads the 31 SUMMARY ('Transcript scanning is opt-in (--scan)') could take this as a clean scan. Advisory only: it is the deferred item above, not a regression."
  - kind: summary_drift
    note: "31 SUMMARY describes `--scan` as available. At the CLI it is not (see the deferral). The lib-level opt-in is real. The SUMMARY predates objective 39's wiring, so this is superseded wording, not a missing implementation."
evidence:
  - type: log
    path: "inline (see Live CLI evidence below)"
    truth: "1-6"
---

# Objective 31: Telemetry and retention — Verification Report

**Objective goal (ROADMAP):** Make objectives 27–30 verifiable rather than asserted. Classify blocking events repeatably, preserve session evidence before retention deletes it, and turn the signals into advisories someone will actually read.
**Verified:** 2026-09-28
**Status:** passed
**Re-verification:** No (initial, retroactive via TRD 41-03)

Every check was run independently against the repo copy `node plugins/devflow/devflow/bin/df-tools.cjs`. `transcript-export` wrote only to a scratchpad `--out` file. `~/.claude/devflow/transcript-index.jsonl` did not exist before the runs and still does not exist after them (`wc: ... No such file or directory`).

## Observable truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | 31-03: `session-audit [--since] [--limit] [--root]` runs and reports `devflow_owned_events` separately from the total | VERIFIED | `--limit 50` returns JSON with `"total_events": 41` and `"devflow_owned_events": 1`, plus `verdict: "1 DevFlow-owned blocks remain — objectives 27/30 target these"`. `--since 2026-09-20 --limit 50 --raw` returns `sessions: 19 ... verdict: no DevFlow-owned blocks in this window`. `--root <scratch>` returns `files_scanned: 1`. All three flags are honoured |
| 2 | `DEVFLOW_OWNED` excludes `worktree-isolation`, pinned by a test | VERIFIED | `session-audit.cjs:51-54`: the set is `devflow-edit-gate, devflow-commit-gate, devflow-changelog-gate, skill-not-invocable, tool-not-available`. `worktree-isolation` is only a RULES entry (`:39`). Two tests pin the exclusion: `session-audit.test.cjs:150` `DEVFLOW_OWNED excludes the harness worktree guard` asserts `DEVFLOW_OWNED.has('worktree-isolation') === false`, and `:105` counts the worktree guard outside the DevFlow-owned total. Both pass |
| 3 | Classification uses only structured failed `tool_result`s; prose about a gate is never counted | VERIFIED | `accumulate()` (`session-audit.cjs:~75-95`) skips any block unless `block.type === 'tool_result' && block.is_error === true`. Tests `:62` `prose ABOUT gates is NOT an event (the 899-false-hit bug)` (a successful Read carrying gate text gives 0 events) and `:73` (assistant text block gives 0 events) both pass |
| 4 | 31-02: `transcript-export --out <file> --limit N` writes a compact per-session index; the incremental skip compares stat size on both sides (multi-byte UTF-8 test) | VERIFIED | Run 1: `indexed 5, skipped 0, copied 0 of 5 sessions -> <scratch>/index.jsonl` (5 lines, 1785 bytes; one source row alone is `bytes: 13940645`). Run 2: `indexed 0, skipped 5`. Code: the row's `bytes` is `fs.statSync(file).size` (`transcript-export.cjs:47`), and the skip compares `seen.get(session) >= fs.statSync(file).size` (`:128-129`), so both sides use stat size. Test `transcript-export.test.cjs:64` writes `'héllo — em dash'` and asserts `row.bytes === statSync(p).size`. Tests `:84` (second run skips) and `:97` (grown session re-indexed) pass |
| 5 | 31-01: `telemetry` gives advisories as sentences (override x5 → mis-scoped; repeated call → stuck loop; DevFlow-owned blocks → names target objectives); a clean project says "nothing needs attention" | VERIFIED (the CLI half of the blocks advisory is deferred) | `telemetry --raw` on this repo prints `nothing needs attention`. `telemetry.cjs:40` prints `...overridden Nx — a gate fought repeatedly is mis-scoped, not a user problem`, `:54` prints `...check for a stuck loop`, and `:70-71` prints `N DevFlow-owned blocks in this window — objectives 27/30 target these...`. Tests `:43`, `:50`, `:68` and `:31/:64/:115` cover each case and pass. The blocks advisory only fires when a caller supplies `sessionReport`, and the CLI never does. That is the `--scan` deferral from objective 39 (see frontmatter) |
| 6 | All three are reachable from the CLI | VERIFIED | `dispatch-completeness.test.cjs:121` lists `telemetry, context, session-audit, transcript-export, override`, with a positive control on `telemetry` at `:151`. It gives 7/7 pass. `audit-cli.test.cjs` spawns the real df-tools for `context / session-audit (CLI)` (`:157`), `transcript-export (CLI)` (`:344`) and `override (CLI)` (`:473`), and gives 37/37 pass. `telemetry.test.cjs` has the suite `df-tools telemetry (CLI) — objective 38` and passes. All three commands also ran live above |

**Score:** 6/6

## Key links

| From | To | Status |
|------|----|--------|
| 31-03 | `bin/lib/session-audit.cjs`: DEVFLOW_OWNED excludes worktree-isolation; only structured tool_results are classified | WIRED (`df-tools.cjs` `case 'session-audit'` → `audit-cli.runSessionAudit`) |
| 31-02 | `bin/lib/transcript-export.cjs`: stat-size incremental skip | WIRED (CLI via `audit-cli.cjs`; skip observed live on run 2) |
| 31-01 | `bin/lib/telemetry.cjs` + `df-tools telemetry` | WIRED (`df-tools.cjs:803-814`); the `sessionReport` input is not wired at the CLI (deferred `--scan`) |

## Tests run (targeted)

| File | Result |
|------|--------|
| `bin/lib/session-audit.test.cjs` | 24 pass / 0 fail |
| `bin/lib/transcript-export.test.cjs` | 10 pass / 0 fail |
| `bin/lib/telemetry.test.cjs` | 15 pass / 0 fail |
| `bin/lib/audit-cli.test.cjs` | 37 pass / 0 fail |
| `bin/lib/dispatch-completeness.test.cjs` | 7 pass / 0 fail |

## Live CLI evidence (quoted)

```
$ df-tools session-audit --limit 50 --raw
files_scanned: 50, sessions: 50, sessions_with_blocks: 15 (30%)
verdict: 1 DevFlow-owned blocks remain — objectives 27/30 target these

$ df-tools transcript-export --out <scratch>/index.jsonl --limit 5 --raw   # run 1
indexed 5, skipped 0, copied 0 of 5 sessions -> <scratch>/index.jsonl
$ (same)                                                                   # run 2
indexed 0, skipped 5, copied 0 of 5 sessions -> <scratch>/index.jsonl

$ df-tools telemetry --raw
nothing needs attention
```

## Superseded vs missing

- `telemetry --scan` has been **deferred** (by objective 39), not lost. The lib supports `sessionReport`, and only the CLI flag is absent.
- The 31 SUMMARY's line "Transcript scanning is opt-in (`--scan`)" is **superseded wording**. It describes the lib-level opt-in and predates the CLI wiring.

## Human verification required

None for this objective. The live-runtime comparison after release (`session-audit --since <release-date>`) is a follow-up measurement, not a check a human needs to make.

## Gaps summary

None. All 6 truths hold against the repo code and live CLI runs. Objective 39 already deferred the one functional shortfall: the CLI cannot feed transcript blocks into `telemetry`. Unknown flags being silently ignored is an advisory note.

---

_Verified: 2026-09-28_
_Verifier: Claude (verifier, TRD 41-03)_
