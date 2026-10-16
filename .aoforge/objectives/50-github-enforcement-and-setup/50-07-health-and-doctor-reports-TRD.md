---
objective: 50-github-enforcement-and-setup
trd: "07"
type: standard
wave: 2
depends_on: ["50-04"]
files_modified:
  - plugins/devflow/devflow/bin/lib/validate.cjs
  - plugins/devflow/devflow/bin/lib/validate-gh-health.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/25-gh-store-sync.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/25-gh-store-sync.test.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs
  - plugins/devflow/devflow/bin/lib/doctor-checks/README.md
autonomous: true
requirements: [GEN-03]
must_haves:
  truths:
    - "`df-tools validate health` in store mode reports W057-W061 from Check 16 as warnings that are never repairable and never flip `ok` to an error"
    - "In local mode validate health output is byte-identical to before (Check 16 adds nothing, zero gh calls)"
    - "`df-tools doctor` shows a `gh-store-sync` check (id 25) that reports the same findings with a fix_command per code, report-only"
    - "The validate-health doctor check defers W057-W061 so doctor never double-reports them"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/validate.cjs
      provides: "Check 16: store sync health (W057 unsynced, W058 missing links, W059 orphans, W060 frozen drift, W061 check failed)"
    - path: plugins/devflow/devflow/bin/lib/doctor-checks/25-gh-store-sync.cjs
      provides: "doctor check id gh-store-sync composing gh-health.collectStoreHealth"
  key_links:
    - "Composes 50-04 collectStoreHealth; documented in 50-13 (USER-GUIDE W-codes)"
---

# TRD 50-07: `validate health` and `doctor` report store sync problems (GEN-03)

<objective>
Surface the 50-04 findings where people already look: `validate health` (Check 16) and `doctor` (new check 25). Both are offline and
report-only; local mode is unchanged.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(50-07): ...`), then implementation (`feat(50-07): ...`).
- Compose, never re-implement: both surfaces call `gh-health.collectStoreHealth(root)`.
- Tests: temp store projects (`makeStoreProject`), `DEVFLOW_OUTBOX_DIR` / `DEVFLOW_GH_CACHE_DIR` at temp dirs, a throwing gh seam; doctor
  tests use `doctor-fixtures.cjs` and the check's `ctx` (see `24-store-cache-tracked.test.cjs`). Never the real `~/.claude`.

## Decisions

- **Check 16** sits right after Check 15 in validate.cjs (~L706-721), same style: `if applicable, for each finding addIssue('warning',
  code, message, fix, false)`; a thrown error → W061 `gh-health-check-failed: <message>`.
- **Doctor ownership**: check 25 `gh-store-sync` OWNS W057-W061; `22-validate-health.cjs` adds them to `DEFERRED` (the W040 pattern), so
  each problem shows once. Severity: any W057 halted or W060 → `warn`; other findings → `warn`; none → `ok`; not store mode → `ok`
  "not a store-mode project". `fixable:false` always; `fix_command` is the most urgent finding's fix (halt > unsynced > frozen > links >
  orphans); `details.findings` holds all.
- **Network**: doctor stays offline like health. The online orphan scan remains `df-tools gh orphans <objective>`, named in W059 fixes.

## Test list

1. validate health, store project with 2 pending ops → issues contain W057 (warning, repairable false); `ok` semantics unchanged.
2. validate health, store project with an orphan mapping entry and a frozen-drifted TRD → W059 and W060 present.
3. validate health, store project where `collectStoreHealth` throws (stub via require cache or a corrupt input that throws) → W061.
4. validate health, local-mode project: JSON output deep-equals a run with Check 16 disabled (compare against the pre-change fixture
   expectation: no W057-W061 codes; `gh` seam never hit).
5. doctor check 25: not store mode → ok; halted outbox → warn with `fix_command` `df-tools gh outbox status`; clean store → ok.
6. doctor check 22 run against a health JSON containing W057 → W057 listed in `details.deferred`, severity not raised by it.
7. doctor README lists `25-gh-store-sync` in the numbering table.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: validate Check 16 (tests 1-4)</name>
  <files>plugins/devflow/devflow/bin/lib/validate.cjs, plugins/devflow/devflow/bin/lib/validate-gh-health.test.cjs</files>
  <action>
RED: tests 1-4 in a new validate-gh-health.test.cjs (follow validate.test.cjs Check 15 block at L1504 for project setup and how health
is invoked); commit `test(50-07): validate Check 16 store sync health`.
GREEN: Check 16 block with comment `// ─── Check 16: Store sync health (objective 50, GEN-03) ───` naming the codes. Commit
`feat(50-07): validate health reports store sync problems (W057-W061)`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/validate-gh-health.test.cjs plugins/devflow/devflow/bin/lib/validate.test.cjs</verify>
  <done>Tests 1-4 pass; validate.test.cjs unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: doctor check 25 and deferral (tests 5-7)</name>
  <files>plugins/devflow/devflow/bin/lib/doctor-checks/25-gh-store-sync.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/25-gh-store-sync.test.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/22-validate-health.cjs, plugins/devflow/devflow/bin/lib/doctor-checks/README.md</files>
  <action>
RED: tests 5-6 (25-gh-store-sync.test.cjs; the deferral case can live there too, calling check 22's exported helpers with a stubbed
`ctx.exec`) and test 7 as a README text assertion; commit `test(50-07): doctor gh-store-sync check`.
GREEN: check module exporting `{id:'gh-store-sync', title, scope:'project', run}` matching the README contract and check 24's shape;
add W057-W061 to check 22 `DEFERRED`; README row. Commit `feat(50-07): doctor reports store sync health`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/doctor-checks/25-gh-store-sync.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/21-22-project.test.cjs plugins/devflow/devflow/bin/lib/doctor.test.cjs plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs</verify>
  <done>Tests 5-7 pass; existing doctor suites pass.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `validate.cjs` Check 15 L706-721 (W055/W056 shape to copy).
- `doctor-checks/24-store-cache-tracked.cjs` (report-only check with `fix_command`), `22-validate-health.cjs` `DEFERRED` L24.
- `doctor-checks/README.md` (contract + numbering: 20-29 project).
- `doctor.cjs` loads checks by filename regex (L157) — no registry edit needed.
</codebase_examples>
<anti_patterns>
- Making W057-W061 repairable (`--repair` must never flush or rewrite the cache).
- Calling `gh orphans` from doctor (online).
</anti_patterns>
<error_recovery>
- If doctor e2e snapshots list every check id, add `gh-store-sync` to the expected list in the same commit and say so in the SUMMARY.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/validate-gh-health.test.cjs plugins/devflow/devflow/bin/lib/doctor-checks/25-gh-store-sync.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/validate.test.cjs plugins/devflow/devflow/bin/lib/doctor.test.cjs plugins/devflow/devflow/bin/lib/doctor.e2e.test.cjs</regression>
</validation_gates>

<verification>
- D-01: test 4 (local mode unchanged, zero gh calls).
</verification>

<success_criteria>
Unsynced writes, missing links, orphans and frozen-body drift are reported by both `validate health` and `doctor`, once each.
</success_criteria>

<output>
After completion, create `.planning/objectives/50-github-enforcement-and-setup/50-07-SUMMARY.md`
</output>
