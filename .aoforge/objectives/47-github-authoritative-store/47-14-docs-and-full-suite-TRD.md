---
objective: 47-github-authoritative-store
trd: "14"
type: standard
wave: 6
depends_on: ["47-13"]
files_modified:
  - CLAUDE.md
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - docs/PROPOSAL-github-system-of-record.md
  - plugins/devflow/skills/gh-sync/SKILL.md
autonomous: true
requirements: [GST-01, GST-02, GST-03, GST-04, GST-05, GST-06, GST-07, GST-08]
must_haves:
  truths:
    - "CLAUDE.md's GitHub bullet names every new command as `gh <sub>` (`gh outbox`, `gh trd`, `gh orphans`, `gh pull --all`), the `github.store` switch, the new modules, and the state locations (`DEVFLOW_OUTBOX_DIR`, `.planning/wiki/`, `DEVFLOW_WIKI_REMOTE`), so the dispatch-completeness extractor and doc-refs guard pass"
    - "CHANGELOG `[Unreleased]` has an Added entry for the authoritative store (hierarchy, TRD codec and budget, comments, outbox, wiki store, pull --all, degraded mode) and notes that `github.store` defaults to false"
    - "USER-GUIDE's GitHub section explains store mode, the outbox exit codes (0/1/2/3) and how to resolve a halt, `gh trd` verbs, `gh pull --all` overwrite rules, and degraded mode"
    - "The gh-sync skill documents store mode and points at `gh outbox status|flush`"
    - "The proposal records objective 47 as implemented and lists the decisions taken during planning that refine it"
    - "`npm test` is green (SC6) and the SUMMARY records the test count against 46's baseline of 6,187"
  artifacts:
    - path: CLAUDE.md
      provides: "df-tools GitHub integration bullet updated for objective 47"
    - path: CHANGELOG.md
      provides: "[Unreleased] Added: GitHub authoritative store"
  key_links:
    - "dispatch-completeness.test.cjs reads CLAUDE.md and requires every named `df-tools` command to dispatch; doc-refs.repo.test.cjs fails on stale command references"
---

# TRD 47-14: Documentation and full test suite (SC6)

<objective>
Document the authoritative store where users and future agents look — the CLAUDE.md df-tools section, CHANGELOG `[Unreleased]`,
USER-GUIDE, the gh-sync skill and the proposal's status — and run the whole test suite.

Purpose: SC6 and discoverability of GST-01..08. Output: doc edits; green `npm test`.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

<!-- TDD-EXCEPTION: documentation-only TRD; the guards that check these docs (dispatch-completeness, doc-refs) already exist and are run below. -->

## Binding rules

- Commit via `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>` (`docs(47): ...`).
- Read CLAUDE.md / USER-GUIDE narrowly (`rg -n` then `offset`/`limit`); edit with targeted `Edit` calls, never by rewriting whole files.
- Keep the CLAUDE.md bullet compact (CLAUDE.md is resident every turn): one bullet extension, not a new section.
- Never port 8080. Do not touch `.planning/STATE.md` or ROADMAP.md here (the orchestrator completes the objective).

## Decisions taken in planning

- Document `github.store: false` as the default and that objectives 48-51 move skills/agents onto the store; until then planning files remain
  the working copy and the store is a push target plus a rebuildable cache.
- Name commands as `gh <sub>` in CLAUDE.md (46-10 learned the extractor keys on that form).

<embedded_context>

<codebase_examples>
Current CLAUDE.md bullet (line ~58) starts: `- **GitHub integration** (1.29+, opt-in via `.planning/config.json` `github` block) — `gh sync [<objective>|--all]` ...`
and ends `...; planning files remain authoritative.` Extend it with: store mode (`github.store: true`) → `gh sync` pushes milestone → Objective
issue → TRD sub-issues (blocked-by from waves; Decision issues block TRDs), SUMMARY/VERIFICATION comments, wiki pages; `gh outbox status|flush|resolve`
(exit 0/1/2/3); `gh trd spec|freeze|fold|scope`; `gh orphans`; `gh pull --all [--force]`; modules `gh-trd|gh-capability|gh-outbox|gh-outbox-flush|gh-hierarchy|gh-comments|gh-wiki|gh-cache|gh-store-cli.cjs`;
journal at `~/.claude/devflow/state/outbox/` (`DEVFLOW_OUTBOX_DIR`), wiki clone at `.planning/wiki/` (`DEVFLOW_WIKI_REMOTE`), degraded mode auto-detected.

USER-GUIDE GitHub section starts at `## GitHub integration` (~line 658); the command table is at ~687-692 — add rows for `gh pull --all`,
`gh outbox flush`, `gh trd ...`; add a "Store mode" subsection.

CHANGELOG `[Unreleased]` → `### Added` already exists (migration 0009 entry); add the store entry there.
</codebase_examples>

<anti_patterns>
- Describing deferred work (put-trd, decision verbs, edit gate, PR lifecycle, gh setup, migration) as shipped.
- Duplicating the proposal into CLAUDE.md.
</anti_patterns>

<error_recovery>
- `dispatch-completeness.test.cjs` failing on a name: the doc names something that does not dispatch — fix the doc wording (or, if the command is
  missing, that is a 47-11 defect: fix there test-first).
- Any unrelated `npm test` failure: check whether it fails on the base commit (`git stash` is NOT allowed with other agents' work; instead run the
  single failing file at `HEAD~N` in a temp worktree) and record it in the SUMMARY rather than masking it.
</error_recovery>

</embedded_context>

<context>
@.planning/objectives/47-github-authoritative-store/OBJECTIVE.md
@.planning/objectives/46-github-sync-foundations/46-10-sync-step-and-docs-TRD.md
</context>

<gotchas>
- The changelog gate (`changelog-on-tag.js`) only checks tagged versions; `[Unreleased]` is free-form but keep Keep-a-Changelog style.
- Proposal: add one line under "Status" (e.g. "Objective 47 implemented 2026-10-xx: ...") and a short "Planning refinements (objective 47)" list
  with D-01 header line, D-15 `github.store` opt-in, D-24 managed-hash remote-edit rule, D-17 wiki clone location; do not alter the locked decisions table.
</gotchas>

<tasks>

<task type="auto">
  <name>Task 1: CLAUDE.md, CHANGELOG, USER-GUIDE, gh-sync skill, proposal status</name>
  <files>CLAUDE.md, CHANGELOG.md, docs/USER-GUIDE.md, docs/PROPOSAL-github-system-of-record.md, plugins/devflow/skills/gh-sync/SKILL.md</files>
  <action>
Apply the edits described in codebase_examples and gotchas. In the gh-sync skill add a short "Store mode" paragraph and the commands
`df-tools gh outbox status`, `df-tools gh outbox flush`, `df-tools gh pull --all`. Commit `docs(47): document the GitHub authoritative store`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/help.test.cjs</verify>
  <done>Guards green; every new command named in CLAUDE.md as `gh <sub>`.</done>
</task>

<task type="auto">
  <name>Task 2: Full suite (SC6)</name>
  <files>CHANGELOG.md</files>
  <action>
Run `npm test` from the repo root. Record the totals (tests, pass, fail, skipped) in the SUMMARY and compare with 46's baseline (6,187 tests, 0 failures).
If anything fails, fix it in the owning module test-first in a separate commit and re-run until green. If the CHANGELOG entry needs the final
module list adjusted after fixes, update it (this is why CHANGELOG.md is listed here).
  </action>
  <verify>npm test</verify>
  <done>`npm test` exits 0; SUMMARY lists the counts and any fixes.</done>
</task>

</tasks>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- `npm test` exits 0 (SC6).
- `rg -n "gh outbox|gh trd|gh pull --all|gh orphans" CLAUDE.md docs/USER-GUIDE.md` returns matches in both files.
</verification>

<success_criteria>
The store is documented for users and agents, guards that check documentation pass, and the full suite is green.
</success_criteria>

<output>
After completion, create `.planning/objectives/47-github-authoritative-store/47-14-docs-and-full-suite-SUMMARY.md`
</output>
