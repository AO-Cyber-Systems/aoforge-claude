---
objective: 49-objective-branch-and-pr-lifecycle
trd: "15"
type: standard
wave: 6
depends_on: ["49-13", "49-14"]
files_modified:
  - CLAUDE.md
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - docs/PROPOSAL-github-system-of-record.md
  - plugins/devflow/skills/gh-sync/SKILL.md
autonomous: true
requirements: [GPR-01, GPR-02, GPR-03, GPR-04, GPR-05, GPR-06]
must_haves:
  truths:
    - "CLAUDE.md's GitHub-integration bullet documents `gh pr start|sync|status|merge|reconcile`, `gh trd confirm-scope|start`, the `Refs #N` commit trailer (store mode), the `prs` mapping map, and that the objective issue closes on merge — in the existing bullet style, without a new section"
    - "CHANGELOG.md [Unreleased] has an objective 49 entry covering the lifecycle verbs, the scope gate, the trailer, the store-mode early-close fix, `github.pr.merge_method`, `github.app_login`, and the `branching_strategy` deprecation"
    - "USER-GUIDE.md store-mode section explains the per-objective branch and PR for a user: start, what the PR closes, scope confirmation, verify (commit status `devflow/verification`, not a check run, and why), merge (queue where present), reconcile, and that `branching_strategy` no longer applies in store mode"
    - "The proposal's status block says objective 49 is implemented and lists its refinements (decisions 1-7, the close-on-merge fix) without changing the locked decisions table"
    - "gh-sync SKILL.md mentions the PR verbs only if its scope covers them (otherwise unchanged; record the call in the SUMMARY)"
    - "doc-refs, dispatch-completeness (FLOOR from CLAUDE.md) and planning-writes audits pass"
    - "SC4: `npm test` is green"
  artifacts:
    - path: CHANGELOG.md
      provides: "objective 49 Unreleased entry"
    - path: docs/USER-GUIDE.md
      provides: "store-mode objective branch and PR section"
  key_links:
    - "Documents 49-01..49-14"
---

# TRD 49-15: Documentation and the full suite (SC4)

<objective>
Document the objective branch and PR lifecycle for maintainers (CLAUDE.md, CHANGELOG) and users (USER-GUIDE), record objective 49's
decisions in the proposal's status block, and run the full suite.

Purpose: SC4 and the documentation for GPR-01..06. Output: docs only, plus a green `npm test`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- TDD here = the audits: run `doc-refs.repo.test`, `dispatch-completeness.test` and `planning-writes.repo.test` before editing (green),
  edit, re-run (green). Any doc that names a `df-tools` command must name a dispatched one.
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- Plain declaratives, no hype (CLAUDE.md conventions). CLAUDE.md is resident every turn: extend the existing GitHub-integration bullet,
  add at most a few sentences, no new section. Keep skill/agent counts accurate.
- Never port 8080.

## Decisions to record (proposal status block + USER-GUIDE where user-facing)

1. Verification is a commit status `devflow/verification` locally; a check run only from the App (objective 50). Only GitHub Apps can
   create check runs.
2. `gh pr start` is online-required (exit 1, nothing queued); later PR ops go through the outbox.
3. TRD in-progress is the `github.labels.in_progress` label, added at spawn (`gh trd start`), removed at `summary post`.
4. `gh pr start` freezes every TRD.
5. Merge method defaults to squash (`github.pr.merge_method`); merge queue used where the base branch has one.
6. Reconcile verifies every issue's closure and closes stragglers; it does not rely on keyword closing limits.
7. `git.branching_strategy` is replaced in store mode only (deprecation notice in local mode); complete-milestone no longer merges
   branches locally in store mode.
8. Store mode no longer closes the objective issue at verify-pass; it closes on merge or reconcile.
Also: the `Refs #N` trailer is a plain paragraph (git's trailer parser needs `:`), so objective 50's linked-issue check should match
`^Refs #\d+$`; squash merges keep trailers in the PR commit list only.

## Test list

1. Before edits: doc-refs, dispatch-completeness, planning-writes green.
2. After edits: same three green; `grep -n "gh pr" CLAUDE.md` shows the bullet; CHANGELOG `## [Unreleased]` contains `objective 49`.
3. `npm test` green (SC4).

<tasks>

<task type="auto">
  <name>Task 1: CLAUDE.md, CHANGELOG, USER-GUIDE, proposal, gh-sync skill</name>
  <files>CLAUDE.md, CHANGELOG.md, docs/USER-GUIDE.md, docs/PROPOSAL-github-system-of-record.md, plugins/devflow/skills/gh-sync/SKILL.md</files>
  <action>
Run the three audits (expect green). Edit:
- CLAUDE.md "GitHub integration" bullet under Core Tool: one or two sentences for the PR lifecycle verbs, trailer, `prs` map, close-on-merge.
- CHANGELOG.md `## [Unreleased]`: an objective 49 subsection (Added / Changed / Fixed) per the must_haves.
- USER-GUIDE.md "Store mode": a subsection "One branch and one pull request per objective" walking start → TRDs → verify → merge →
  reconcile, scope confirmation, and the commit-status note.
- Proposal: status paragraph says 49 is implemented; add "### Planning refinements (objective 49)" listing decisions 1-8 and the trailer
  note, in the style of the 47/48 refinement lists. Do not edit the Decisions table.
- gh-sync SKILL.md: add a short pointer to `gh pr status` only if the skill describes per-objective GitHub state; otherwise leave it.
Re-run the audits. Commit `docs(49-15): document the objective branch and PR lifecycle`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs</verify>
  <done>Docs updated; three audits green.</done>
</task>

<task type="auto">
  <name>Task 2: Full suite (SC4)</name>
  <files>CHANGELOG.md</files>
  <action>
Run `npm test` from the repo root. If anything fails, diagnose: a defect in an objective 49 module is fixed test-first in that module
(commit `fix(49-15): ...`, list the file in the SUMMARY); an unrelated pre-existing failure is reported in the SUMMARY with evidence
(fails on the base commit too) and not fixed here. Touch CHANGELOG only if a fix changes user-visible behaviour.
  </action>
  <verify>npm test</verify>
  <done>`npm test` exits 0, or every remaining failure is shown to be pre-existing on the base commit.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- 48-23 (docs, ratchet zero, full suite) is the format precedent; the CLAUDE.md "GitHub integration" and "Planning verbs" bullets show the voice.
- `dispatch-completeness.test.cjs` reads its FLOOR from CLAUDE.md: every `df-tools <name>` written there must dispatch.
</codebase_examples>
<anti_patterns>
- A new top-level CLAUDE.md section (resident context cost).
- Rewording the proposal's locked Decisions table.
</anti_patterns>
<error_recovery>
- If doc-refs flags a command name, check `DEPRECATION_MAP`/`REMOVED_COMMANDS` in skill-route.cjs before changing the doc.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs</test>
<regression>npm test</regression>
</validation_gates>

<verification>
- `npm test` green (SC4).
</verification>

<success_criteria>
Maintainers and users can find and follow the objective PR lifecycle, objective 49's decisions are on record, and the full suite passes.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-15-SUMMARY.md`
</output>
