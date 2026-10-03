---
objective: 43-stack-drafter-rules
trd: "15"
job: 43-15
subsystem: stack-drafter
tags: [stack, rollout, gap-closure, fleet-harness, accepted, changelog, decision]
requires:
  - objective: 43-stack-drafter-rules
    provides: "43-08 compareDrift and the fleet harness; 43-09..43-13 drafter rules; 43-14 refreshed aoinference and opsCluster files"
provides:
  - "43-ROLLOUT.md `## Gap closure cycle 1: dry-run drift (TRD 43-15)`: the 33-repo table, read-only proof, residual list, the decision verbatim and the applied tables"
  - "stack-fleet-tables.cjs exports exactly FLEET, ACCEPTED (13 user-accepted rows) and OPEN (empty); KNOWN_DRIFT is deleted"
  - "stack-drafter-fleet.test.cjs: `assess` classification, OPEN ratchet, ACCEPTED shape and pinned-row guard, no-third-table guard, synthetic-table tests"
  - "CHANGELOG [Unreleased]: Added (real-fleet harness) and Fixed (Stack drafter rules, gap cycle 1)"
affects: []
tech-stack:
  added: []
  patterns:
    - "Record the human decision verbatim and commit it before the first table edit"
    - "An ACCEPTED row is tolerated only as the kind that was accepted (conflict or more_specific)"
    - "Test a ratchet on synthetic tables when its real table is empty"
key-files:
  created: []
  modified:
    - .planning/objectives/43-stack-drafter-rules/43-ROLLOUT.md
    - plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs
    - plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs
    - CHANGELOG.md
key-decisions:
  - "The user replied `accept-all` (2026-10-03). Every residual row is accepted, so OPEN is empty. The table cannot show an unresolved row; the verifier still has the follow-ups below"
  - "ACCEPTED entries carry `kind`. The user asked for the more-specific rows in ACCEPTED, and 43-ROLLOUT.md had said they need no entry; without `kind` an accepted more-specific row would also hide a later conflict on the same key"
  - "ACCEPTED is a list of entries per repo (not one entry), because aodex has two rows with different reasons. devcluster's entry gained `kind`, `decided` and `by: 'user'`"
  - "dfip.lint, justinforme.lint and smartWellness.lint are accepted but not table rows: the harness sees no drift on them"
requirements-completed: []
requirements-partial: [SDR-08]
verification:
  gates_defined: 3
  gates_passed: 2 # lint not_available; test red only on the known MA-7
  auto_fix_cycles: 0
  tdd_evidence: false
  test_pairing: true
duration: ~20min (continuation after the checkpoint; Task 1 ran in the earlier session)
completed: 2026-10-03
---

# Objective 43 TRD 15: Final fleet dry run, residual decision, and docs Summary

**The user accepted every residual row (`accept-all`, 2026-10-03). KNOWN_DRIFT is deleted, ACCEPTED holds 13 user-accepted rows and OPEN is empty, the fleet harness is green (42 of 42), the CHANGELOG describes the gap-cycle-1 rules, and `npm test` fails only on MA-7.**

## Progress
- [x] Task 1: Read-only fleet dry run and residual list — ea95cf8c
- [x] Task 2: Human decides each residual row — 4daf6232 (reply `accept-all`, recorded verbatim under `### Decision` in 43-ROLLOUT.md)
- [x] Task 3: Apply the decision, retire KNOWN_DRIFT, CHANGELOG and the full suite — c6379a8a

## Fleet dry run against the 43-07 baseline (Task 1)

33 repos, `stack init` only, no `--write`, no `--run`, at devflow-claude HEAD `c3ad796c`. 33 of 33 signatures (HEAD, branch, porcelain, hash-object of every listed path) were identical before and after, in two passes.

| | 43-07 baseline | 43-15 |
|---|---|---|
| evaluated | 32 | 33 |
| match | 18 | 24 |
| drift repos | 14 | 9 (6 more_specific, 3 conflict) |
| conflict repos | 12 | 3 (devcluster ACCEPTED; ao-terminal, aocore residual) |
| more_specific repos | 2 | 6 (9 rows) |
| politihub | not evaluated | evaluated, counted: no conflict, one more-specific row (`lint`) |

Nine of the twelve 43-07 conflict repos closed (aodex, aoedge, aoinference, devflowops, eden-biz, eden-libs, justinforme, opsCluster, smartWellness).

## Decision and disposition (Task 2)

The user's reply was `accept-all`. It is recorded verbatim under `### Decision` in 43-ROLLOUT.md and was committed (4daf6232) before any table changed.

| Row | Kind | Disposition | In a table? |
|---|---|---|---|
| ao-terminal.deps | conflict | accepted: hand-edited flags; drafter stays verbatim (draft `npm ci --no-audit --no-fund` vs committed `npm ci`) | ACCEPTED |
| aocore.test | conflict | accepted: hand-edited flags; drafter stays verbatim (draft `go test -short ./... -race -coverprofile=coverage.out -timeout 5m` vs committed `go test -short -race ./... -timeout 5m`) | ACCEPTED |
| aodex.audit | more_specific | accepted; row-specific reason: the draft picks the govulncheck `--self-test` step, not the gate | ACCEPTED |
| aodex.lint | more_specific | accepted | ACCEPTED |
| aofamily.build, aofamily.deps, aofamily.lint | more_specific | accepted (primary component `ai/go/` of a four-module repo) | ACCEPTED |
| eden-biz.e2e, EdenDocs.deps | more_specific | accepted (draft-only `discover`) | ACCEPTED |
| justinforme.e2e | more_specific | accepted (`make smoke-canvass`, a stub until Obj 9) | ACCEPTED |
| politihub.lint | more_specific | accepted | ACCEPTED |
| devcluster.lint, devcluster.test | conflict | accepted earlier (user decision 2026-10-03, remedy (c)) | ACCEPTED |
| dfip.lint | coverage | accepted: the guaranteed part is `go vet`; `golangci-lint run` is optional by its own design | no (no drift to show) |
| justinforme.lint | coverage | accepted; `make lint` also runs `buf lint`, which the draft and the reviewed file drop | no (no drift to show) |
| smartWellness.lint | coverage | accepted; `make lint` also runs `buf lint`, which the draft and the reviewed file drop | no (no drift to show) |

Open and refresh-later rows: none. No fleet repo was written or committed in this TRD.

## What was built (Task 3)

- `stack-fleet-tables.cjs` exports exactly `FLEET`, `ACCEPTED` and `OPEN`. `ACCEPTED` is `{ repo: [ { keys, kind, reason, decided, by } ] }`, 13 rows, every entry `by: 'user'`. `OPEN` is `{}` with its shape documented. `KNOWN_DRIFT` is deleted.
- `stack-drafter-fleet.test.cjs`: a pure `assess(repo, rows, { accepted, open })` returns problems and notes. A conflict outside ACCEPTED fails. A more-specific row, an ACCEPTED row and an OPEN row are `t.diagnostic`, never a failure. An OPEN key that no longer drifts fails with "remove it". An ACCEPTED row that no longer drifts that way is a diagnostic only. Guards: the module exports exactly three tables with no `KNOWN_DRIFT`; ACCEPTED is exactly the 13 pinned rows with kind, reason, date and `by: 'user'`; OPEN entries have keys and a reason. Five tests run `assess` on synthetic tables, because OPEN is empty and its ratchet would otherwise never run.
- CHANGELOG `[Unreleased]`: one `### Added` entry (the real-fleet harness) and one `### Fixed` entry, "Stack drafter rules, gap cycle 1 (objective 43)", with a line per rule shipped in 43-09..43-13 and a closing line on the verbatim principle and the accepted rows.
- 43-ROLLOUT.md `### Applied`: the final tables and the harness result.

## Follow-ups for the verifier (accepted as current state, still known drafter limitations)

1. **aodex.audit.** The draft takes the CI self-test step (`bash scripts/check-govulncheck.sh --self-test`, `go.yml:116`) instead of the gate (`go.yml:127`, after `go install govulncheck@latest`); the value scans nothing. A general rule may exist: of two CI steps that run the same script, the one passing a self-test flag tests the gate and is not the gate. This is a drafter change, out of scope for 43-15.
2. **`buf lint` coverage, justinforme and smartWellness.** Each `make lint` runs `go vet ./...` then `buf lint`; the draft and the committed file inherit only `go vet ./...`. The harness shows no row, so it is not a table entry. A future rule (a key-named target whose body is the tier default plus further linters is the entry point) or a refresh of the committed files to `lint: make lint` would close it. 43-12 narrowed its declared-target rule on purpose to keep these matching.
3. **ao-terminal.deps and aocore.test** stay as hand-edited flag differences the drafter will never reproduce under the verbatim principle (accepted).

## Task Evidence

| Task | Verify Command | Exit Code | Status |
|---|---|---|---|
| 1: Read-only fleet dry run and residual list | `grep -n "Gap closure cycle 1: dry-run drift" .planning/objectives/43-stack-drafter-rules/43-ROLLOUT.md`; `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs` (36/36 then) | 0 | PASS |
| 2: Human decides each residual row | the reply exists in 43-ROLLOUT.md (4daf6232) before Task 3 edited stack-fleet-tables.cjs (c6379a8a) | n/a (checkpoint) | PASS |
| 3: Apply the decision, retire KNOWN_DRIFT, CHANGELOG, full suite | `node --test plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs`; `grep -n "gap cycle 1" CHANGELOG.md`; `npm test` | harness 0 (42 pass, 0 fail); grep 0; npm test 1 (MA-7 only) | PASS |

## Validation Gate Results

| Gate | Command | Exit Code | Status |
|---|---|---|---|
| lint | not_available (no lint command in this repo) | n/a | not_available |
| test | `npm test` | 1 | 8789 tests, 8756 pass, 1 fail (MA-7, the known environmental failure), 32 skipped, 0 cancelled |
| scoped | `node --test plugins/devflow/devflow/bin/lib/stack-*.test.cjs` | 0 | PASS (1296 tests, 1296 pass, 0 fail, 0 skipped) |

`npm test` was run twice. The first run (before the ROADMAP update) had two failures: MA-7 and `E2E1: SELF-TEST` in `roadmap-reconcile.test.cjs`, which found the 43-15 SUMMARY present while ROADMAP.md still showed `- [ ] 43-15-TRD.md`. That is a transient of the checkpoint state, not a code defect. `roadmap update-job-progress 43` ticked the box, and the second run has MA-7 only.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] ACCEPTED entries carry `kind`.** The user asked for the more-specific rows to go into ACCEPTED, and the TRD's entry shape is `{ keys, reason, decided, by }`. A key-only entry would tolerate any later drift on that key, so an accepted more-specific row could hide a new conflict. Each entry names the kind accepted, and `assess` tolerates a row only as that kind. Files: `stack-fleet-tables.cjs`, `stack-drafter-fleet.test.cjs`. Commit c6379a8a.

**2. [Rule 3 - Blocking] ACCEPTED is a list per repo, and devcluster's entry gained fields.** One entry per repo cannot hold aodex's two reasons. devcluster's existing entry became a one-element list and gained `kind: 'conflict'`, `decided: '2026-10-03'` and `by: 'user'`, so the new "every ACCEPTED entry is `by: 'user'`" guard needs no exception. Its keys and reason are unchanged. Commit c6379a8a.

**3. Verification wording.** The TRD says to run `npm test` with a 900000 ms timeout; the shell tool caps a call at 600000 ms, so it ran as a background task (about 97 s).

## Post-TRD Verification

- Auto-fix cycles used: 0
- Must-haves verified: 6/6 (cycle-1 table for 33 repos with read-only proof; every row classified and every residual explained; politihub evaluated and counted; decision recorded before any table changed; KNOWN_DRIFT gone and no third table asserted; CHANGELOG written and `npm test` only MA-7)
- Gate failures: MA-7 (known, environmental: the test expects `doctl auth init` to fail on an unset token, and on this host it exits 0 with empty stderr)
- SDR-08 stays `requirements-partial`. Its open part is a fresh fleet `stack verify --run` (3 of 33 repos ran it), which this TRD excludes (it needs a fresh fleet approval and a host cgo linker fix). `.planning/REQUIREMENTS.md` does not exist in this project, so `requirements mark-complete` was not run.
- The objective's `roadmap update-job-progress` reports `Complete` (15 of 15 TRDs have a SUMMARY). Whether the objective passes is the verifier's call; the follow-ups above are the known limitations.

## Self-Check: PASSED

- FOUND: `plugins/devflow/devflow/bin/lib/__fixtures__/stack-fleet-tables.cjs`, `plugins/devflow/devflow/bin/lib/stack-drafter-fleet.test.cjs`, `.planning/objectives/43-stack-drafter-rules/43-ROLLOUT.md`, `CHANGELOG.md`
- FOUND commits: `ea95cf8c`, `4daf6232`, `c6379a8a`
- `KNOWN_DRIFT` appears in code only in comments and in the guard that asserts it is gone
- `### Decision` precedes the table edit: `4daf6232` is an ancestor of `c6379a8a`
