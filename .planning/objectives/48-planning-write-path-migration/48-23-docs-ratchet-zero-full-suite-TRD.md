---
objective: 48-planning-write-path-migration
trd: "23"
type: tdd
wave: 6
depends_on: ["48-16", "48-17", "48-18", "48-19", "48-20", "48-21", "48-22"]
files_modified:
  - plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/plan.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/execute.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/verify.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/bootstrap.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/work.json
  - plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/misc.json
  - CLAUDE.md
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - docs/PROPOSAL-github-system-of-record.md
autonomous: true
requirements: [GWP-01, GWP-02, GWP-03, GWP-04, GWP-05]
must_haves:
  truths:
    - "SC1 final: the six baseline files are deleted and `planning-writes.repo.test.cjs` asserts ZERO planning-write violations across skills, non-legacy workflows, agents and templates (no ratchet left)"
    - "CLAUDE.md documents the planning verbs, the mode switch (D-01 invariant), the store-mode gate deny, W055, migration 0010, `planning import`, and the U-1 tracked set, in the existing df-tools bullet style; skill/agent counts stay accurate"
    - "CHANGELOG.md has an Unreleased entry for objective 48 including: the cache deny needs an installed plugin at or above this release (D-10, doctor plugin-cache check), and the `todos/done` → `todo complete` (`todos/completed/`) fix"
    - "USER-GUIDE.md explains store mode for a user: turning it on, `planning import`, `upgrade --apply --only 0010 --confirm`, what stays tracked, the verbs, and what the gate message means"
    - "The proposal's status block says objective 48 is implemented and lists the 48 refinements (U-1..U-3, D-05 milestones, D-12 checkpoints) without changing the locked decisions table"
    - "SC4: `npm test` is green"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs
      provides: "zero-violation SC1 audit"
    - path: CHANGELOG.md
      provides: "objective 48 Unreleased entry"
  key_links:
    - "Closes the ratchet started in 48-04; documents 48-01..48-22"
---

# TRD 48-23: Ratchet to zero, documentation, full suite (SC1 final, SC4)

<objective>
Remove the audit's training wheels — delete the per-group baselines and make the SC1 test assert zero planning writes — then document
objective 48 for maintainers (CLAUDE.md, CHANGELOG) and users (USER-GUIDE), update the proposal's status, and run the full suite.

Purpose: SC1 (final form), SC4, and the docs for GWP-01..05. Output: test change, deleted baselines, four docs.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- TDD: RED = change the repo test to "zero violations, no baseline files allowed" while the baseline files still exist (the test fails on their
  presence); GREEN = delete them. Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>` (deleted files are
  staged removals; pass their paths).
- If any group still has violations (e.g. 48-21's documented leftover), fix the prose here with a one-line verb substitution and list it in the
  SUMMARY; do not re-introduce a baseline.
- Docs follow CLAUDE.md conventions: plain declaratives, no hype, existing bullet format. Keep CLAUDE.md lean (it is resident on every turn):
  one bullet for the verbs/store mode under "Core Tool", one line under the edit-gate hook, not a new section.
- Version files are NOT bumped (release needs separate approval, D-10). Never port 8080.

## Decisions

D-10, D-21, U-1..U-3. Settled here:

- **CLAUDE.md**: add a "Planning verbs (Unreleased)" bullet in the df-tools list: verbs, `planning mode|draft|import`, D-01 invariant ("store off,
  every verb writes today's file"), modules (`planning-mode|paths|ledger|verbs|entity-verbs|import|verbs-cli|drift|audit.cjs`, `trd-bulk.cjs`,
  `gh-milestone-store.cjs`), W055/W056, migration 0010, doctor check 24. In the gate-edits bullet: "in store mode, cache/generated `.planning/`
  paths are denied for everyone (skill markers and devflow agents included) with the verb to use; config.json, STACK.md and runtime files are allowed."
- **CHANGELOG**: `## [Unreleased]` → `### Added` / `### Changed` / `### Fixed` per Keep-a-Changelog, conventional wording used by `changelog update`.

## Test list

1. (RED) repo test with the zero rule fails while any `planning-writes-baseline/*.json` exists ("baseline files must be deleted").
2. (GREEN) baselines deleted; repo test green; `planning-audit.test.cjs` green (the unit tests do not depend on baselines).
3. `doc-refs.repo.test.cjs` green with the new docs (every command referenced exists).
4. `npm test` green (SC4).

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: SC1 to zero — delete baselines (tests 1-2)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs, plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/plan.json, plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/execute.json, plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/verify.json, plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/bootstrap.json, plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/work.json, plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline/misc.json</files>
  <action>
Rewrite the ratchet part of the repo test: drop baseline loading; assert `findings.length === 0` with the full file:line list on failure; assert the
`planning-writes-baseline/` dir does not exist; keep EXEMPT checks, sensitivity checks and 48-15's verb-existence check. Commit RED. `git rm` the six
JSON files (and the dir); commit `test(48-23): SC1 audit asserts zero planning writes`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-audit.test.cjs</verify>
  <done>Tests 1-2 pass; no baseline files remain.</done>
</task>

<task type="auto">
  <name>Task 2: CLAUDE.md, CHANGELOG, USER-GUIDE, proposal status (test 3)</name>
  <files>CLAUDE.md, CHANGELOG.md, docs/USER-GUIDE.md, docs/PROPOSAL-github-system-of-record.md</files>
  <action>
Write the docs per the decisions. USER-GUIDE: a "GitHub store mode" section with: enabling (`github.enabled` + `github.store` in config), first
run (`gh pull --all`, `planning import`, `gh outbox flush`, `upgrade --apply --only 0010 --confirm`), what git tracks afterwards (config.json,
STACK.md), the verb table (one line each), reading the gate message, W055 meaning, and the plugin-version note (D-10). Proposal: extend the status
paragraph ("Objective 48 (write-path migration) is implemented: ...") and add a short "Planning refinements (objective 48)" list (U-1 tracked set,
debug/quick/todo issues, native milestones + `Milestone-vX_Y` pages, research pages, linked-bulk thresholds, summary checkpoints). Do not edit the
Decisions table. Commit `docs(48-23): document planning verbs and store mode`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs && node plugins/devflow/devflow/bin/df-tools.cjs changelog check Unreleased 2>&1 | tail -3</verify>
  <done>doc-refs green; CHANGELOG has the Unreleased entry.</done>
</task>

<task type="auto">
  <name>Task 3: Full suite (test 4, SC4)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</files>
  <action>
Run `npm test`. Any failure: fix in the owning module test-first (separate commit, named in the SUMMARY); do not skip or weaken tests. Record
total/pass counts and duration in the SUMMARY, plus `node plugins/devflow/devflow/bin/df-tools.cjs planning mode` (expect `local`) and
`validate health --raw` warnings for this repo (no W055/W056). Commit only if a fix was needed.
  </action>
  <verify>npm test</verify>
  <done>`npm test` exits 0.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- CLAUDE.md "Core Tool" bullets (e.g. "Upgrade (Unreleased)", "Doctor (Unreleased)") — the format for the new bullet.
- 47-14 TRD (docs-and-full-suite) — the prior objective's equivalent closing TRD.
</codebase_examples>
<anti_patterns>
- Bumping package.json / plugin.json / marketplace.json versions: release is a separate, explicitly approved step.
- Adding a long CLAUDE.md section: it costs context on every turn; link the USER-GUIDE instead.
</anti_patterns>
<error_recovery>
- If `changelog check Unreleased` is not a supported form, verify with `rg -n "## \[Unreleased\]" CHANGELOG.md` instead.
</error_recovery>
</embedded_context>

<validation_gates>
<test>npm test</test>
<regression>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</regression>
</validation_gates>

<verification>
- `ls plugins/devflow/devflow/bin/lib/__fixtures__/planning-writes-baseline 2>&1` → no such directory.
- `git diff --stat package.json plugins/devflow/.claude-plugin/plugin.json .claude-plugin/marketplace.json` → empty.
</verification>

<success_criteria>
No skill, workflow, agent or template writes planning files directly, the docs say how store mode works, and the whole suite is green.
</success_criteria>

<output>
After completion, create `.planning/objectives/48-planning-write-path-migration/48-23-SUMMARY.md`
</output>
