---
objective: 45-devflow-doctor
verified: 2026-09-30T00:00:00Z
status: passed
score: 13/13 must-haves verified (DOC-01..07, SC1-6)
notes:
  - "AWARENESS_CACHE_REL in awareness.cjs is exported but no non-test code reads it (dead constant, harmless; no legacy fallback exists)."
  - "templates/global-claude-md.md has no /devflow:doctor mention (deferred, accepted)."
  - ".devflow-notices.json is a documented SC1 exception, pinned in planning-writes.audit.test.js ALLOWED_WRITES."
  - "Real `doctor --json --path .` (read-only): 7 ok, 4 warn, 0 error; stale plugin-cache dirs are report-only as specified."
---

# Objective 45: DevFlow doctor + runtime hygiene - Verification

**Goal:** DevFlow can diagnose and repair environment problems, and no runtime state churns inside a project's working tree.
**Status:** passed

## Requirements

| ID | Status | Evidence |
|----|--------|----------|
| DOC-01 | SATISFIED | `awareness-store.cjs` (out-of-tree store); grep shows no reader of the legacy in-tree path (only the exported unused constant and comments saying "ignored"); populate hook, awareness.cjs, init.cjs, awareness skill updated; tests pass. |
| DOC-02 | SATISFIED | 0008 uses `git ls-files` over nested paths; its test file passes (nested tracked, idempotent). |
| DOC-03 | SATISFIED | `runtime-digest.cjs` + sync-runtime `.plugin-digest`; digest tests in sync-runtime.test.js pass. |
| DOC-04 | SATISFIED | `doctor.cjs`, `doctor-cli.cjs`; live run returns id/severity/finding/fixable JSON; read-only test 2 in e2e passes. |
| DOC-05 | SATISFIED | Checks 10,11,12,13,20,21,22,23,30,31,32 all present with tests; e2e test 1 flags every problem. |
| DOC-06 | SATISFIED | `doctor-git.cjs` guard; e2e test 6 (unrelated staged file: index untouched, files not deleted, rest applied) passes. |
| DOC-07 | SATISFIED | `skills/doctor/SKILL.md`, help.md entry, CLAUDE.md Doctor bullet and skills count 34 (matches 34 dirs), route-intent rule, CHANGELOG [Unreleased] entry. |

## Success criteria

1. SC1 VERIFIED: `planning-writes.audit.test.js` (behavioral and static) passes; the only allowed hook writes are `.skill-active`, `.edit-override` and `.devflow-notices.json` (event-driven).
2. SC2 VERIFIED: 0008 tests.
3. SC3 VERIFIED: sync-runtime digest tests.
4. SC4 VERIFIED: doctor.e2e tests 1, 3, 4, 5 (second report has nothing fixable and no error; plugin-cache warn remains by design).
5. SC5 VERIFIED: e2e test 6.
6. SC6 VERIFIED: skill and docs exist; targeted tests green. Full `npm test` was not rerun; the reported single failure (MA-7 doctl) predates the objective (fails on base).

## Tests run

- doctor, doctor-cli, doctor-git, doctor.e2e, awareness-store, awareness, runtime-digest, 0008: 279 pass, 0 fail (1 spurious fail from passing a directory).
- doctor-checks/*.test.cjs plus hooks (planning-writes.audit, sync-runtime, awareness-cache-populate, upgrade-project, route-intent, verify-commits, verify-completion): 428 pass, 0 fail.

## Judgment of known deviations

- 45-03 digest seeding in four no-op tests: ACCEPTED. The tests still assert the no-op path (matching digest is the new "current mirror" state); a new describe block covers the re-mirror case. Not a weakening.
- 45-06 dirtiness ignoring legacy runtime files: ACCEPTED. Prevents the runtime state doctor fixes from being counted as user dirt; consistent with the 0008 dirty-before exemption.
- legacy-runtime-state severity: ACCEPTED. `error` when tracked, `warn` when only untracked/present (check 20 line 138); reasonable and exercised in e2e.
- 45-07 backups fix command targeting global-config.json: ACCEPTED. `backup-prune.cjs` reads retention from that exact file.
- `.devflow-notices.json` exception: ACCEPTED (pinned in audit).
- Global CLAUDE.md template not updated: ACCEPTED as deferred; not required by DOC-07.

## Deployment verification

deployment_verification: not_available (no devcluster; plugin/CLI objective).

## Human verification

None required.
