---
objective: 51-github-migration-and-docs
trd: "10"
type: standard
wave: 6
depends_on: ["51-01", "51-05", "51-08", "51-09"]
files_modified:
  - CLAUDE.md
  - docs/USER-GUIDE.md
  - CHANGELOG.md
  - docs/PROPOSAL-github-system-of-record.md
autonomous: true
requirements: [GMD-03]
must_haves:
  truths:
    - "CLAUDE.md shrinks: the GitHub-integration bullet is replaced by one of about 900 characters (what the store is, the `github.store` switch, enforcement in one line, the escapes, module family names, and a pointer to docs/USER-GUIDE.md Store mode); the Planning verbs bullet keeps the D-01 invariant and verb list without module lists; the Upgrade bullet gains one line for migration 0011 (confirm, resumable); `wc -c CLAUDE.md` is at least 4,000 characters below the 30,869 baseline"
    - "USER-GUIDE leads its GitHub chapter with `GitHub is the system of record` (store mode) and a `Migrating an existing project` subsection: preflight, dry-run output and request estimate, the `/devflow:gh-sync migrate` / `upgrade --apply --only 0011 --confirm` sequence, hour-budget resume and the gh-flush hook, 0010, committing via branch + logged escape, then `gh setup` ordering; the one-way mirror is demoted to `Mirror mode (store off)`; no remaining text says GitHub is derivative"
    - "USER-GUIDE's migrations table lists 0007-0011 with their safety; troubleshooting covers backfill pending/halted, the wiki first page, the hourly budget; the detail moved out of CLAUDE.md (outbox exit codes, gh pr verbs, setup payloads, W057-W061, App keys, open items) is present in USER-GUIDE; a manual UAT note says the first real-repo backfill is run against a throwaway repository"
    - "CHANGELOG `[Unreleased]` has objective 51 entries (Added: migration 0011, backfill estimate and preview in `planning import --dry-run`, history closes; Changed: `/devflow:gh-sync` repurposed, 0010 defers during a backfill and prints the store-mode commit; objective 26 killed)"
    - "The proposal's status block says objective 51 is implemented and lists `Planning refinements (objective 51)` (OQ1 closed history, OQ2 empty plan flips, OQ5 kept_local printed, G4 0010 deferral, G5 live-create bookkeeping, objective 26 killed) without changing the locked decisions table"
    - "doc-refs, dispatch-completeness, hook-inventory, planning-writes and df-tools-deprecations tests are green and `npm test` is green apart from the known MA-7 handoff-e2e environmental failure, reported not masked (SC3)"
  artifacts:
    - path: docs/USER-GUIDE.md
      provides: "GitHub system-of-record chapter with migration guide"
    - path: CLAUDE.md
      provides: "slimmed resident context"
  key_links:
    - "Documents 51-01..51-09"
---

# TRD 51-10: docs for the GitHub model and the full suite (GMD-03, SC3)

<objective>
Rewrite the user-facing and maintainer docs for GitHub as the system of record, move the per-verb detail out of the resident CLAUDE.md
into USER-GUIDE, record objective 51 in CHANGELOG and the proposal, then run the full suite.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Read 51-01..51-09 SUMMARYs first; document what shipped (50-13 lesson).
- Narrow reads (`rg -n`, then `offset`/`limit`) and targeted `Edit`s; never rewrite a whole file body.
- CLAUDE.md constraints (CI): in `- **` bullets the first word of each backtick span after the first ` — ` must be a dispatching
  df-tools command or exempt (`dispatch-completeness.test.cjs` test 5; 50-13 Deviation 1) — avoid backticks for non-command words.
  Do not reword `### Hooks` bullets (`hook-inventory.test.cjs`). No stale `/devflow:` names (doc-refs). Keep the "Where we left off"
  section current (objective 51 done; next steps).
- Plain declarative prose, no hype. Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- No TDD: documentation only; the guard tests are the checks. <!-- TDD-EXCEPTION: docs-only TRD guarded by repo doc tests -->

## Decisions

- Move, do not delete: before cutting a CLAUDE.md sentence, confirm USER-GUIDE already says it (`rg`) or add it there in the same commit.
- USER-GUIDE structure (current lines from research §3.1: integration table L252-258, config L397-417, intro L667-669, legacy mirror
  L673-760, store mode L744-964, migrations table L221-249, structure L599-627, troubleshooting L539-580): make store mode the primary
  section, add Migrating, demote the mirror, extend the tables. Line numbers drift; locate with `rg -n`.
- The migration sequence documented is the shipped one, including that an apply stopped on the hourly budget reports `failed` with
  "not an error: N ops remain" and is resumed with the same command.
- Proposal: status paragraph + "### Planning refinements (objective 51)"; decisions table untouched.

## Test list

1. `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs` green.
2. `rg -n -i "derivative|source of truth" docs/USER-GUIDE.md` shows no line describing planning files as authoritative over GitHub in store mode.
3. `wc -c CLAUDE.md` <= 26,869.
4. `npm test` green except MA-7 (SC3).

<tasks>

<task type="auto">
  <name>Task 1: USER-GUIDE rewrite (receives the detail first)</name>
  <files>docs/USER-GUIDE.md</files>
  <action>
Per must_haves and Decisions. Add the CLAUDE.md detail that will be cut in Task 2 to the store-mode section where it is missing.
Commit `docs(51-10): user guide for GitHub as the system of record and the migration`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs && rg -n "Migrating an existing project|0011" docs/USER-GUIDE.md</verify>
  <done>Test 2 holds; migration section and 0007-0011 table present.</done>
</task>

<task type="auto">
  <name>Task 2: CLAUDE.md slimming, CHANGELOG, proposal</name>
  <files>CLAUDE.md, CHANGELOG.md, docs/PROPOSAL-github-system-of-record.md</files>
  <action>
Replace the GitHub-integration bullet; trim the Planning verbs bullet; add the 0011 line to the Upgrade bullet; update "Where we left
off". CHANGELOG under `## [Unreleased]` (Added / Changed groups). Proposal status + refinements. Run test 1 after each CLAUDE.md edit.
Commit `docs(51-10): slim CLAUDE.md, changelog and proposal for objective 51`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/dispatch-completeness.test.cjs plugins/devflow/devflow/bin/lib/hook-inventory.test.cjs && wc -c CLAUDE.md</verify>
  <done>Tests 1 and 3 hold.</done>
</task>

<task type="auto">
  <name>Task 3: full suite (SC3)</name>
  <files>docs/USER-GUIDE.md, CLAUDE.md</files>
  <action>
Run `npm test`. Fix doc-test failures here (`docs(51-10): ...`); route a code failure to a `fix(51-10): ...` commit naming the owning
TRD. MA-7 (`handoff-e2e.test.cjs`, real `doctl` on the machine) is the known environmental failure: report it, do not mask it.
Record pass/fail/skip counts in the SUMMARY.
  </action>
  <verify>npm test</verify>
  <done>SC3 passes only if `npm test` has no failure, or its sole failure is the known MA-7 handoff-e2e test, reported verbatim
  (test name + error lines) in the SUMMARY with a citation of where it is already documented (.planning/PROJECT.md "1 known failure
  (MA-7 handoff-e2e)" and 50-13-SUMMARY.md). Any other failure fails SC3.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- CLAUDE.md L58 GitHub-integration bullet (5,688 chars), Planning verbs and Upgrade bullets in `### Core Tool`.
- `docs/PROPOSAL-github-system-of-record.md` status block and per-objective refinements (L1-74 per 50-13).
- 50-13 TRD/SUMMARY (previous docs pass; Deviation 1 on backtick spans).
</codebase_examples>
<anti_patterns>
- Growing CLAUDE.md; documenting planned rather than shipped behaviour; rewriting the locked table.
</anti_patterns>
<error_recovery>
- If dispatch-completeness flags a backtick span, rephrase without backticks or lead the span with the real command (`gh pr ...`).
</error_recovery>
</embedded_context>

<validation_gates>
<test>npm test</test>
</validation_gates>

<verification>
- GMD-03 docs half; SC3: doc-refs green and `npm test` green.
</verification>

<success_criteria>
Users can learn and run the migration from USER-GUIDE alone, CLAUDE.md costs less resident context, and the suite is green.
</success_criteria>

<output>
After completion, create `.planning/objectives/51-github-migration-and-docs/51-10-SUMMARY.md` (via `summary post 51-10 --from <file>`)
</output>
