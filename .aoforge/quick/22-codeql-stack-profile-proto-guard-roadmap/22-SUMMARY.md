# Quick Task 22: CodeQL — Prototype-Pollution Guard + Regex-Injection Escape Summary

Closes the two CodeQL alerts newly introduced by PR #114 — `js/prototype-pollution-utility` in
`mergeFrontmatter` (`stack-profile.cjs`) and `js/regex-injection` in `roadmap-progress.cjs`'s
row/header matchers — under strict TDD (RED then GREEN per task). The other 19 pre-existing
CodeQL alerts (regex-injection/escaping elsewhere) were explicitly out of scope per 22-JOB.md.

## Changes

**Task 1 — `js/prototype-pollution-utility` (`stack-profile.cjs`)**

`mergeFrontmatter`'s recursive merge now refuses `__proto__`, `constructor`, and `prototype` keys
before any read or assignment happens:

```js
if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
```

Real global `Object.prototype` pollution occurred because the merge's read-then-recurse branch
reads `acc[key]` — for a plain accumulator with no own `__proto__`, that GET returns the actual
inherited `Object.prototype` reference via the exotic accessor — and then recurses into that
returned object, so a leaf assignment lands directly on the real global prototype.
`constructor`/`prototype` pollute differently (own-property shadowing on the specific
accumulator, not the true global prototype) since they aren't accessor properties like
`__proto__`, but all three are refused identically and uniformly, both top-level and nested.
Sibling keys continue to merge normally.

**Task 2 — `js/regex-injection` (`roadmap-progress.cjs`)**

Both `updateProgressTableRow` and `updateJobsLine` built their row/header-matching regex from
`objectiveNum.replace('.', '\\.')` — escaping only the literal `.`, and only its first
occurrence. Every other regex metacharacter (`+ ( ) * ? ^ $ { } | [ ] \`) reached
`new RegExp(...)` unescaped, either silently matching the wrong objective's row/section (an
unescaped `+` in `"1+"` greedily matches `"1"` or `"11"`) or throwing on an unbalanced construct
like `"("`. Added a local `escapeRegExp` mirroring `objective.cjs:921`'s exact pattern
(`s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`) and use it at both call sites in place of the
partial `.replace('.', '\\.')`.

**Task 3 — CHANGELOG.md**

Added a `### Fixed` bullet under `## [2.11.0]` documenting both closed alerts, and ran the full
`npm test` suite to confirm no regressions.

## Commits

| Commit | Type | Description |
|---|---|---|
| `a453f25` | test | RED — prove `mergeFrontmatter` prototype-pollution vulnerability (includes `22-JOB.md`) |
| `f6dedf3` | fix | GREEN — `mergeFrontmatter` refuses `__proto__`/`constructor`/`prototype` keys |
| `dc8f22f` | test | RED — prove regex-injection in `roadmap-progress` row/header matchers |
| `ec943dc` | fix | GREEN — `roadmap-progress` escapes objective numbers fully |
| `db2691d` | docs | CHANGELOG entry for the two closed CodeQL alerts |
| (this commit) | docs | `22-SUMMARY.md` |

## Task Evidence

| Task | Verify Command | Result |
|---|---|---|
| 1: prototype-pollution guard | `node --test plugins/devflow/devflow/bin/lib/stack-profile.test.cjs` | 32/32 pass (30 pre-existing + 2 new SEC1/SEC2) |
| 2: regex-injection escape | `node --test plugins/devflow/devflow/bin/lib/roadmap-progress.test.cjs` | 8/8 pass (RX1-4, JX1-4) |
| 2: regression check (real consumers) | `node --test plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/roadmap.test.cjs` | 49/49 pass |
| 3: CHANGELOG + full suite | `npm test` | 4278 tests / 4245 pass / 1 fail (MA-7, pre-existing) / 32 skipped |

RED-phase confirmation (both tasks): before the corresponding GREEN fix, the new tests failed as
designed —
- Task 1: SEC1/SEC2 failed with `AssertionError: Object.prototype must not be polluted` (`1 !==
  undefined`); all 30 pre-existing `stack-profile.test.cjs` tests still passed (the deliberate
  `Object.prototype` pollution was cleaned up via `try/finally` after each SEC test, so it never
  bled into other tests in the same `node:test` process).
- Task 2: RX1-3 and JX1-3 failed as designed (6/8); RX4/JX4 passed in both RED and GREEN, by
  design — they are regression-guard tests confirming `escapeRegExp("4.1")` behaves identically
  to the old single-dot escape for the one case it already handled correctly.

## Full-Suite Verification

| | Baseline | After quick-22 | Delta |
|---|---|---|---|
| Total tests | 4268 | 4278 | +10 |
| Pass | 4235 | 4245 | +10 |
| Fail | 1 (MA-7, pre-existing) | 1 (MA-7, pre-existing) | 0 |
| Skipped | 32 | 32 | 0 |

The +10 tests/passes are exactly the 2 SEC tests (Task 1) + 8 RX/JX tests (Task 2) added in this
quick task. The single failure (MA-7) is the pre-existing, unrelated `doctl auth init`
handoff-e2e assertion — the only acceptable failure per 22-JOB.md — and is unchanged from
baseline. No new failures, no new skips, no regressions.

## Deviations from Plan

None — 22-JOB.md executed exactly as written.

Implementation note (not a deviation): Task 1's tests drive `mergeFrontmatter` indirectly through
`stack-profile.cjs`'s exported `resolveFromParsed` entry point, since `mergeFrontmatter` itself is
not part of the module's public export surface — this was the JOB.md's own first-preference
approach.

## Self-Check: PASSED

- `plugins/devflow/devflow/bin/lib/stack-profile.cjs` — FOUND, guard present at the top of
  `mergeFrontmatter`'s loop body.
- `plugins/devflow/devflow/bin/lib/stack-profile.test.cjs` — FOUND, SEC1/SEC2 describe block
  present.
- `plugins/devflow/devflow/bin/lib/roadmap-progress.cjs` — FOUND, `escapeRegExp` defined and used
  at both call sites.
- `plugins/devflow/devflow/bin/lib/roadmap-progress.test.cjs` — FOUND (newly created), RX/JX
  describe blocks present.
- `CHANGELOG.md` — FOUND, new `### Fixed` bullet present under `## [2.11.0]`.
- Commits `a453f25`, `f6dedf3`, `dc8f22f`, `ec943dc`, `db2691d` — all FOUND in `git log`.

## Post-TRD Verification

- Auto-fix cycles used: 0 (no deviations required — plan executed exactly as written)
- Must-haves verified: 3/3 (both CodeQL alerts closed with passing RED→GREEN evidence; CHANGELOG
  entry added and full suite verified clean against baseline)
- Gate failures: None
