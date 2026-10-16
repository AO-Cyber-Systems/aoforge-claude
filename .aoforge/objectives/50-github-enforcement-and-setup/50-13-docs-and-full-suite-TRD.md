---
objective: 50-github-enforcement-and-setup
trd: "13"
type: standard
wave: 5
depends_on: ["50-12"]
files_modified:
  - CLAUDE.md
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - docs/PROPOSAL-github-system-of-record.md
  - plugins/devflow/skills/gh-sync/SKILL.md
  - plugins/devflow/skills/help/SKILL.md
autonomous: true
requirements: [GEN-01, GEN-02, GEN-03, GEN-04, GEN-05]
must_haves:
  truths:
    - "CLAUDE.md's GitHub-integration bullet documents the store-mode commit gate (default/unlinked branch refused, `df/exec-*` allowed, escape `DEVFLOW_SKIP_GH_GATE=1` logged as gate `gh`), `gh setup [--apply]`, the required checks posted as commit statuses, Check 16 / W057-W061 and doctor check 25, in the existing bullet style without a new section; the gh-flush hook bullet from 50-05 is accurate"
    - "CHANGELOG.md [Unreleased] has an objective 50 entry: commit gate + escape, gh-flush hook, W057-W061 + doctor 25, `gh setup`, reusable workflow + caller template, config keys `github.app_id` / `github.checks_workflow`"
    - "USER-GUIDE.md store-mode section explains: why a commit is refused and what to do, the escape and where it is logged, `gh setup` dry-run then apply (what it creates, degraded cases, committing the written files through a PR, the App variables `DEVFLOW_APP_CLIENT_ID` / secret `DEVFLOW_APP_PRIVATE_KEY`), the two checks and what each verifies, and the W057-W061 codes next to W055"
    - "The proposal's status block says objective 50 is implemented and lists its refinements (the Decisions notes of 50-02, 50-03, 50-08, 50-09, 50-10, 50-11) plus the open items: live verification of the reusable workflow and status contexts on a real repo, issue-field option shape, central workflow location owned by platform/ops — without changing the locked decisions table"
    - "gh-sync and help skills list `gh setup` where they enumerate gh verbs"
    - "SC4: `npm test` is green"
  artifacts:
    - path: CHANGELOG.md
      provides: "objective 50 Unreleased entry"
    - path: docs/USER-GUIDE.md
      provides: "store-mode enforcement and setup section"
  key_links:
    - "Documents 50-01..50-12"
---

# TRD 50-13: docs and the full suite

<objective>
Describe objective 50 where users and maintainers read: CLAUDE.md, CHANGELOG, USER-GUIDE, the proposal's status block and the skills
that enumerate gh verbs. Then run the whole suite (SC4).
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Read the 50-01..50-12 SUMMARYs first; document what shipped, not what was planned (decisions may have shifted during execution).
- Narrow reads: `rg -n` then `offset`/`limit`; targeted `Edit`s, not whole-file rewrites (CLAUDE.md is resident every turn — keep the
  addition to a few sentences in the existing GitHub-integration bullet).
- Plain declarative prose, no hype. Only `df-tools` commands that exist (doc-refs test). No direct planning-write instructions in skills
  (planning-writes audit).

## Decisions

- No new CLAUDE.md section: extend the GitHub-integration bullet (and leave the hooks section to 50-05's bullet, correcting it only if
  the shipped behaviour differs).
- The proposal keeps its locked table; objective 50's refinements go in a "Planning refinements (objective 50)" list like 47-49's.

## Test list

1. `doc-refs.repo.test.cjs` green (no stale or unknown commands).
2. `hook-inventory.test.cjs` green (gh-flush bullet matches hooks.json).
3. `planning-writes.repo.test.cjs` green.
4. `npm test` green (SC4).

<tasks>

<task type="auto">
  <name>Task 1: CLAUDE.md, CHANGELOG, proposal</name>
  <files>CLAUDE.md, CHANGELOG.md, docs/PROPOSAL-github-system-of-record.md</files>
  <action>
Edit the three files per the must_haves. CHANGELOG under `## [Unreleased]` (L7) in Keep-a-Changelog groups (Added / Changed).
Proposal: update the status paragraph (objective 50 implemented) and add "### Planning refinements (objective 50)". Commit
`docs(50-13): document commit gate, gh setup and required checks`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs</verify>
  <done>Tests 1-2 pass; the three files describe what shipped.</done>
</task>

<task type="auto">
  <name>Task 2: USER-GUIDE, skills, full suite</name>
  <files>docs/USER-GUIDE.md, plugins/devflow/skills/gh-sync/SKILL.md, plugins/devflow/skills/help/SKILL.md</files>
  <action>
Add the USER-GUIDE store-mode subsection (near the W055 text around L852-857) and list W057-W061 beside W055. Add `gh setup` to the gh
verb lists in the gh-sync and help skills (only where verbs are enumerated). Commit `docs(50-13): user guide for enforcement and setup`.
Then run `npm test`; fix doc-test failures here, route code failures to a `fix(50-13): ...` commit naming the owning TRD.
  </action>
  <verify>npm test</verify>
  <done>`npm test` green (SC4).</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- CLAUDE.md "GitHub integration" bullet (Core Tool section) and `### Hooks` → Observability.
- `docs/USER-GUIDE.md` L852-857 (W055 text, store-mode section).
- `docs/PROPOSAL-github-system-of-record.md` L1-74 (status + per-objective refinements), L156-168 (Enforcement).
- 49-15 TRD/SUMMARY for the shape of the previous docs pass.
</codebase_examples>
<anti_patterns>
- Rewriting the locked decisions table.
- Documenting behaviour the SUMMARYs say changed during execution as originally planned.
</anti_patterns>
<error_recovery>
- If `npm test` fails in an unrelated pre-existing test, confirm with `git stash`-free reasoning (run that file on `main`'s version via
  `git show main:<path>` diff) and record it in the SUMMARY rather than masking it.
</error_recovery>
</embedded_context>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- SC4: `npm test` green.
</verification>

<success_criteria>
Users and maintainers can learn the enforcement model and `gh setup` from the docs, and the full suite is green.
</success_criteria>

<output>
After completion, create `.planning/objectives/50-github-enforcement-and-setup/50-13-SUMMARY.md`
</output>
