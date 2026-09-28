---
quick: 21
title: "sync-runtime never downgrades the ~/.claude/devflow mirror"
type: standard
tdd: true
tasks_completed: 3
tasks_total: 3
files_modified:
  - plugins/devflow/hooks/sync-runtime.js
  - plugins/devflow/hooks/sync-runtime.test.js
  - CHANGELOG.md
commits:
  - ee780b6
  - eeecc0b
  - c1616a2
completed: 2026-09-28
---

# Quick 21: sync-runtime never downgrades the home mirror — Summary

Replaced `sync-runtime.js`'s `installedVersion === pluginVersion` early exit with a
semver-gated mirror decision. A session running an older plugin cache (e.g. a stale
2.7.1 checkout) can no longer re-mirror over a newer `~/.claude/devflow` (e.g. 2.10.1)
and drag it backwards.

## Objective

Stop the mirror from flip-flopping between plugin versions across sessions. Mirror
only when: (a) the mirror's `.plugin-version` is missing/unparseable, (b) the bundled
plugin is strictly semver-newer than the mirror, or (c) versions are equal but
`bin/df-tools.cjs` (the content sentinel) is missing. Every other case exits 0 and
touches nothing; on a downgrade refusal, one line goes to stderr.

## Commits

| Commit | Type | Description |
|---|---|---|
| `ee780b6` | test | RED — 17 new cases pinning the no-downgrade contract, plus the uncommitted 21-JOB.md |
| `eeecc0b` | fix | GREEN — inline `parseSemver`/`compareSemver` + decision gate in sync-runtime.js |
| `c1616a2` | docs | CHANGELOG bullet under `## [Unreleased]` → `### Fixed` |

## Task Evidence

| Task | Verify Command | Result | Status |
|---|---|---|---|
| 1: RED | `node --test plugins/devflow/hooks/sync-runtime.test.js` | 36 tests, 28 pass / 8 fail — failing set = {1, 2, 3, 11, 12, 15, 16, case-17}, exactly the RED column | PASS |
| 2: GREEN | `node --test plugins/devflow/hooks/sync-runtime.test.js` | 36 tests, 36 pass / 0 fail | PASS |
| 3: CHANGELOG + full suite | `npm test` | 4268 tests, 4235 pass, 1 fail (MA-7 only), 32 skipped | PASS |

## TDD Evidence

| Phase | Command | Result | Expected |
|---|---|---|---|
| RED | `node --test plugins/devflow/hooks/sync-runtime.test.js` | 8 failures (cases 1, 2, 3, 11, 12, 15, 16, case-17); all 28 pre-existing cases still passed | FAIL as designed (correct) |
| GREEN | `node --test plugins/devflow/hooks/sync-runtime.test.js` | 36/36 pass, including the pre-existing Tests 2, 3, 7 and the full TRD 36-06 block | PASS (correct) |
| Full suite | `npm test` | 4268/4235/1-fail(MA-7)/32-skipped vs baseline 4251/4218/1-fail(MA-7)/32-skipped — exactly +17 tests, +17 passes, same single pre-existing failure | PASS (correct) |

No REFACTOR commit was needed — the GREEN implementation matched the TRD's pseudocode
shape closely enough that no follow-up cleanup pass was warranted.

## Implementation notes

- `parseSemver`: `/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/` on
  the trimmed string. Returns `null` for missing/empty/garbage input (never throws).
  Leading `v` and `+build` metadata are stripped by the regex itself; prerelease
  identifiers are split on `.`.
- `compareSemver`: numeric compare on `[major, minor, patch]` first; then prerelease
  per the semver 2.0 spec (no-prerelease beats any prerelease; shared identifiers compare
  numeric-vs-numeric numerically, numeric < alphanumeric, alphanumeric by ASCII; fewer
  identifiers loses when all shared ones are equal). Deliberately NOT validate.cjs's
  `compareSemver` — that one drops prerelease entirely and would rank `2.10.1-rc.1` equal
  to `2.10.1`.
- Decision gate sits exactly where the old early exit was — before the
  `fs.existsSync(sourceDir)` check, the tmp-dir sweep, and the swap — so every no-op path
  returns before any of that runs.
- The plugin.json read and its `catch { process.exit(0) }` for malformed/missing manifests
  are unchanged, as is everything below the gate (swap, `.plugin-version` write, global
  upgrade).

## validate.cjs finding

Read `plugins/devflow/devflow/bin/lib/validate.cjs` lines ~416-505 (Check 11, engine lag).
Confirmed unchanged, as expected at planning time:

- Mirror **behind** installed (`compareSemver(mirrorVer, installedVer) < 0`) → `E020`
  (error, `mirror-stale`).
- Mirror **ahead** of installed (`compareSemver(mirrorVer, installedVer) > 0`) → `I022`
  (info, `mirror-ahead`, no fix text).
- `plugins/devflow/devflow/bin/lib/validate.test.cjs:313-347` already covers both
  directions explicitly (`E020 (not I022) raised when the mirror is BEHIND...` and
  `I022 (not E020) raised when the mirror is AHEAD...`), plus the equal case.

validate.cjs was **not modified** — the classification was already correct, exactly as
TRD 21 anticipated. No edit was needed.

## Deviations from Plan

None — the TRD's three tasks were executed as written, in order, with the exact commit
messages and `--files` scoping specified. The pseudocode's decision shape (mirrorSv /
pluginSv / sentinelOk / cmp branches) was implemented essentially verbatim; only the
`compareSemver` internals (parts loop instead of unrolled) and the `parseSemver`
comment style differ from the TRD's inline sketch, which is cosmetic.

## Self-Check

- `plugins/devflow/hooks/sync-runtime.js` — FOUND, modified as described.
- `plugins/devflow/hooks/sync-runtime.test.js` — FOUND, modified as described.
- `CHANGELOG.md` — FOUND, modified as described.
- Commit `ee780b6` — FOUND in `git log --oneline`.
- Commit `eeecc0b` — FOUND in `git log --oneline`.
- Commit `c1616a2` — FOUND in `git log --oneline`.

## Self-Check: PASSED

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 7/7 (observable_truths from the JOB frontmatter — no-downgrade,
  numeric-not-lexical newer-wins, equal+sentinel-missing self-heals, missing/unparseable
  mirror version always mirrors, unparseable plugin version never overwrites a parseable
  mirror, prerelease-aware comparison with `v`/`+build` normalization, validate.cjs
  I022/E020 classification untouched and confirmed correct)
- Gate failures: None
