---
objective: 71-stack-drafter-and-verify-policy
job: "02"
subsystem: stack-drafter
tags: [fleet-harness, drift, self-test, refresh-pending, ratchet, stack-init]
requires:
  - objective: 71-stack-drafter-and-verify-policy
    provides: "71-01 self-test rule and declared-linters rule (the two rules this TRD guards)"
provides:
  - "selfTestDrafts({ commands, evidence }): a per-repo fleet guard that fails when a draft fills a key with a self-test beside its gate"
  - "OPEN pending: 'refresh' rows (justinforme lint, smartWellness lint), reported as refresh pending, held by the existing ratchet"
  - "ACCEPTED without aodex.audit (12 rows)"
affects: [71-05 dogfood and docs]
tech-stack:
  added: []
  patterns:
    - "guard predicate written apart from the drafter's so a broken drafter predicate cannot hide its own regression"
    - "OPEN pending: 'refresh' marks a follow-up (committed file stale) as distinct from a drafter gap"
key-files:
  created: []
  modified:
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-drift-compare.cjs
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs
    - plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs
key-decisions:
  - "selfTestDrafts does not import stack-draft.cjs: its marker test and its same-entry-point test are its own"
  - "A refresh-pending OPEN row is tolerated only while it drifts, exactly like any OPEN row; the ratchet is unchanged"
  - "ACCEPTED did not grow: aodex.audit was removed because the rule that excused it now drafts the gate"
requirements-completed: [SDR-09]
verification:
  gates_defined: 2
  gates_passed: 2
  auto_fix_cycles: 0
  tdd_evidence: true
  test_pairing: true
completed: 2026-10-08
---

# Objective 71 TRD 02: Fleet tables and guards Summary

The fleet harness now records what TRD 71-01's two rules closed and guards both of them: `aodex.audit` left ACCEPTED, justinforme and smartWellness `lint` are OPEN `pending: 'refresh'` rows, and a new per-repo `selfTestDrafts` guard fails any fleet draft that picks a self-test step beside its gate.

## Progress
- [x] Task 1: `selfTestDrafts` guard and refresh-pending OPEN rows, on synthetic data — 8c779238 (RED), e7be13cf (GREEN)
- [x] Task 2: Tables updated, per-repo self-test guard wired, real-fleet run green — b5aab54c (RED), (this commit) (GREEN)

## What changed

**`selfTestDrafts` (`__fixtures__/stack-drift-compare.cjs`, pure, no require).** `selfTestDrafts({ commands, evidence }) -> [{ key, run, gate }]`. For each drafted own command it reads the self-test words with its own marker regex (`--selftest`, `--self-test`, `--self-test=x`, `--selftest-<case>`, a bare `selftest`), never counting the program, the script after `bash|sh|zsh|dash`, the target after a task runner (`make`, `just`, ...), or a word an evidence item names as its `target.name` / `invokedName`. It reports a finding only when the evidence holds an item for the same key, at the same cwd (null, `''` and `.` are the root, `./go/` is `go`), whose command equals the drafted run with those words removed. A lone self-test is allowed. It never throws on a bare-string entry, `discover` / `none`, a missing `commands` or malformed evidence.

**Harness (`stack-drafter-fleet.test.cjs`).** `assess` reports an OPEN entry with `pending: 'refresh'` as `<repo>: OPEN, refresh pending (<kind>): <row>`, tolerated only while it drifts; the "remove it from OPEN" ratchet is untouched. `stackInit` also returns the init JSON's `evidence`, and the per-repo test asserts `selfTestDrafts(...)` is `[]` after the `problems` assert. The `ACCEPTED_ROWS` pin lost `aodex.audit` (12 rows). The OPEN guard requires `pending === 'refresh'` when present and a reason naming both `draft` and `committed`.

**Tables (`__fixtures__/stack-fleet-tables.cjs`).** The aodex `audit` ACCEPTED entry is deleted (its `lint` entry and every other row are byte-identical). OPEN holds exactly two entries, justinforme `lint` and smartWellness `lint`, both `pending: 'refresh'`. The header documents `pending: 'refresh'`, amends the "OPEN rows keep the objective at gaps_found" sentence, and records why `aodex.audit` left ACCEPTED.

## Harness diagnostics (real fleet, `~/dev`)

- **aodex:** `aodex: more specific: audit: committed \`discover\` vs draft \`bash scripts/check-govulncheck.sh (cwd go)\`` (a plain more-specific note now, no longer an accepted row); `lint` still `accepted by user 2026-10-03 (more_specific)`. `selfTestDrafts` returns `[]`.
- **justinforme:** `justinforme: OPEN, refresh pending (conflict): lint: committed \`go vet ./...\` vs draft \`make lint\``
- **smartWellness:** `smartWellness: OPEN, refresh pending (conflict): lint: committed \`go vet ./...\` vs draft \`make lint\``
- **dfip:** lint matches (no row). 32 of 33 repo tests pass and 1 is skipped per repo: aoedge has no committed `.planning/STACK.md` at HEAD (pre-existing, not a failure). Every repo's HEAD and `git status --porcelain=v1 -uall` were equal before and after its draft (the existing read-only check).
- `OPEN rows for the verifier: 2 (justinforme, smartWellness)`.
- Not new, not tabled: `trades: more specific: typecheck: committed discover vs draft npx tsc --noEmit` is a plain more-specific note (never a failure). It predates this TRD.

Both Makefiles were read to confirm the reasons: `lint:` runs `go vet ./...` then `buf lint` in justinforme (Makefile:80) and smartWellness (Makefile:106), and both committed STACK.md files (reviewed 2026-09-29) carry no `lint` key, so they inherit `go vet ./...`. Mutation check against real aodex evidence: the pre-71-01 pick `bash scripts/check-govulncheck.sh --self-test` returns `[{ key: 'audit', run, gate: 'bash scripts/check-govulncheck.sh' }]`; the real draft returns `[]`.

## Follow-up for TRD 71-05's todo

Refreshing the committed `.planning/STACK.md` in **justinforme** and **smartWellness** so `lint` is `make lint` (a commit in each repo, which needs the user, per 43-ROLLOUT option (c)). When that lands, each OPEN row stops drifting and the ratchet fails it with `remove it from OPEN`, which is the signal to delete the row.

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: selfTestDrafts + refresh note | `DEVFLOW_SKIP_FLEET_HARNESS=1 node --test stack-drafter-fleet.test.cjs stack-drafter-realshape.test.cjs` (34 tests) | 0 | PASS |
| 2: tables + per-repo guard | `node --test stack-drafter-fleet.test.cjs` against `~/dev` (50 tests: 49 pass, 0 fail, 1 per-repo skip) | 0 | PASS |

## TDD Evidence

| Phase | Command | Exit Code | Expected |
|---|---|---|---|
| RED (Task 1) | `DEVFLOW_SKIP_FLEET_HARNESS=1 node --test stack-drafter-fleet.test.cjs`: cases 8-12 `selfTestDrafts is not a function`, case 13 no `refresh pending` note; case 14 passes (pins the existing ratchet) | 1 | FAIL (correct) |
| GREEN (Task 1) | same plus stack-drafter-realshape.test.cjs, 34 tests | 0 | PASS (correct) |
| RED (Task 2) | `node --test stack-drafter-fleet.test.cjs` against `~/dev`: justinforme and smartWellness `new conflict: lint`, `ACCEPTED_ROWS` pin still holds `aodex.audit` (3 failures) | 1 | FAIL (correct) |
| GREEN (Task 2) | same, 50 tests | 0 | PASS (correct) |

