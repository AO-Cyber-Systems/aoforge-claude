---
objective: 53-worktree-and-health-hygiene
trd: "07"
type: standard
wave: 3
depends_on: ["53-01", "53-02", "53-03", "53-04", "53-05", "53-06"]
files_modified:
  - CHANGELOG.md
  - docs/USER-GUIDE.md
  - CLAUDE.md
autonomous: true
requirements: ["53-1", "53-2", "53-3", "53-4", "53-5", "53-6", "53-7", "53-8"]
must_haves:
  truths:
    - "CHANGELOG [Unreleased] records every objective-53 change under Fixed/Changed/Added: worktree SUMMARY writes, named-TRD summary pairing (five readers plus gate-executor-stop), micro through df-tools commit, the merge-sequence prose and explained deny, the awareness export removal, global template v3 with /devflow:doctor, and doctor check 33 decision-resolution"
    - "USER-GUIDE Known issues no longer lists the micro raw-git item, the pre-52 mangled-decision hand-fix item (replaced by the doctor repair, with the hand fix kept only for the unrecoverable case) or the gh-sync routing-line item (fixed by the template v3 bump)"
    - "USER-GUIDE line ~879 and CLAUDE.md's planning-verbs bullet describe the new summary-verb rule: local mode writes the checkout that runs it (a worktree commits its own SUMMARY), and store mode writes the main checkout's cache"
    - "CLAUDE.md 'Where we left off' and 'Next' describe objective 53 as done and drop the micro raw-git item from Next"
    - "Item 53-6 is recorded as already closed by 43-03, with evidence: `verify artifacts` passes on all 15 objective-42 TRDs, and frontmatter.test.cjs '43-03 D11 #2' pins every 42 TRD"
    - "`npm test` is green apart from the known MA-7 (handoff-e2e with a real doctl)"
  artifacts:
    - path: CHANGELOG.md
      provides: "[Unreleased] entries for objective 53"
    - path: docs/USER-GUIDE.md
      provides: "updated summary-verb rule, doctor check 33, trimmed Known issues"
    - path: CLAUDE.md
      provides: "planning-verbs bullet and Where we left off / Next for objective 53"
  key_links:
    - "USER-GUIDE Known issues <- the fixes in 53-03 (micro), 53-05 (template v3), 53-06 (decision repair)"
    - "CLAUDE.md planning-verbs bullet <- 53-01 resolveCheckoutRoot rule"
---

# TRD 53-07: Docs and the full suite for objective 53

<objective>
Record objective 53 in the changelog and user guide, refresh CLAUDE.md's resident summary, close item 53-6 with evidence, and run the
full `npm test` gate.

Purpose: the objective's success criteria require the optional items to be closed or explicitly deferred, and `npm test` to be green apart
from MA-7. CLAUDE.md is resident on every turn, so it must describe the summary-verb rule as it now is.

Item 53-6 needs no code. The planner verified that `df-tools verify artifacts` passes on all 15 objective-42 TRDs. Commit 9f93abde
(43-03, "must_haves parser follows the real indent; report string key_links (D11)") fixed the parser, and frontmatter.test.cjs
'43-03 D11 #2: every objective-42 TRD yields a non-empty artifact list' is the regression test the item asks for. 42's key_links are
prose strings, which `verify key-links` now reports as "not machine-checkable" rather than skipping. This TRD records that evidence, and the audit's
item is stale.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Docs only. No code changes. <!-- TDD-EXCEPTION: documentation and the full-suite gate; no logic. -->
- Read each wave-1/2 SUMMARY (53-01..53-06) first and describe what actually shipped, including deviations. Do not describe the plan.
- Use the repo df-tools. Commit with its `commit … --files`, one plain command per Bash call.
- CLAUDE.md is resident context. Keep the edits tight: replace sentences rather than append paragraphs.
- Keep-a-Changelog voice, as in the existing [Unreleased] entries.

## Test list

Not applicable (docs). Gates:
1. `node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs` passes after the edits.
2. `node plugins/devflow/devflow/bin/df-tools.cjs changelog check Unreleased` (or the form `changelog check` accepts) passes, if it applies to Unreleased.
3. `npm test`: only MA-7 may fail.

<embedded_context>

<codebase_examples>
USER-GUIDE.md:879 today: "`summary checkpoint` and `summary post` write the main checkout even when run from a worktree, so
`/devflow:execute-objective` commits a wave's SUMMARYs from the main checkout after merging it." Replace with the 53-01 rule.

USER-GUIDE.md "**Known issues.**" (~1125-1131) today lists:
- micro commits with raw git (fixed by 53-03, so remove it; mention the store-mode refusal where micro is described, ~879);
- the pre-52 mangled decision hand-fix (53-06: replace it with "`df-tools doctor` check 33 `decision-resolution` finds these; `doctor --fix` repairs those whose
  answer is recoverable; hand-fix only what it reports as unrecoverable", and move it out of Known issues into the doctor/decisions text);
- objective 1 orphan after a backfill (keep);
- the gh-sync routing line reaching new blocks only (fixed by the 53-05 template v3 bump, so remove it, and say existing blocks pick up gh-sync and doctor at the next global upgrade).

USER-GUIDE.md:192 lists what `/devflow:doctor` diagnoses. Add the decision check.

CLAUDE.md planning-verbs bullet contains "`summary checkpoint|post` write the main checkout even from a worktree." Replace it with one sentence carrying the
53-01 rule. The Doctor bullet: optionally name check 33. "Where we left off (2026-10-04 …)": objective 53 (worktree and health hygiene)
is done. Name the shipped items in one sentence. "**Next:**": drop "`micro commit` uses raw git …". Keep the backfill UAT, and add the user actions
OBJECTIVE.md lists (release 42-53 and re-sync the runtime; apply migration 0009 in this repo).
</codebase_examples>

<anti_patterns>
- Do not re-describe 52's work as 53's.
- Do not leave a Known issue that a 53 TRD fixed, and do not delete one it did not fix.
- Do not hide a new test failure under "MA-7". Name every failing test file.
</anti_patterns>

<error_recovery>
- If `npm test` shows failures beyond MA-7, re-run each failing file alone with `node --test <file>`. If it passes alone, and it is a known
  environmental daemon test (devflow-watch, handoff-e2e) listed as pre-existing in STATE.md, record it as environmental with the
  isolated pass. Otherwise it is a real failure: stop, report it with the file and assertion, and do not mark this TRD complete.
- roadmap-reconcile E2E1 reconciles the MAIN checkout's ROADMAP. If it flags 53 TRDs whose SUMMARY exists but whose box is unticked, run
  `node plugins/devflow/devflow/bin/df-tools.cjs roadmap update-job-progress 53` and re-run it.
</error_recovery>

</embedded_context>

<tasks>

<task type="auto">
  <name>Task 1: CHANGELOG, USER-GUIDE and CLAUDE.md for objective 53; close item 53-6 with evidence</name>
  <files>CHANGELOG.md, docs/USER-GUIDE.md, CLAUDE.md</files>
  <action>
1. Read 53-01..53-06 SUMMARYs (from `.planning/objectives/53-worktree-and-health-hygiene/`).
2. CHANGELOG [Unreleased]:
   - Fixed: worktree SUMMARY copies (53-1); I001 / has_summary for named TRDs across health, consistency, objective-job-index, find-objective,
     verify objective-completeness and gate-executor-stop (53-2); micro through df-tools commit (53-3); merge prose that the gate denied (53-4).
   - Changed: the explained gate-commits deny; global CLAUDE.md template v3 routes to `/devflow:doctor`; the UI-VISUAL-EVAL dirs archived (repo only, optional).
   - Added: doctor check 33 `decision-resolution` (53-8).
   - Removed: the dead `AWARENESS_CACHE_REL` export.
   Put each under the matching existing subheading.
3. USER-GUIDE: line ~879 rule; doctor table row ~192; Known issues per codebase_examples.
4. CLAUDE.md: planning-verbs sentence; "Where we left off" + "Next".
5. Item 53-6 evidence: run `for f in .planning/objectives/42-*/42-*-TRD.md; do node plugins/devflow/devflow/bin/df-tools.cjs verify artifacts "$f"; done`
   and paste the pass counts (all_passed true, 15/15 TRDs) into the SUMMARY under "Item 53-6: closed by 43-03".
6. Run gates 1-2. Commit `docs(53-07): ...`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/doc-refs.repo.test.cjs plugins/devflow/devflow/bin/lib/planning-writes.repo.test.cjs && rg -n "commits with raw git|even when run from a worktree|even from a worktree|reaches new and adopted blocks only" docs/USER-GUIDE.md CLAUDE.md (expect no output)</verify>
  <done>CHANGELOG, USER-GUIDE and CLAUDE.md describe what shipped, the fixed known issues are gone, and 53-6 is closed with evidence.</done>
</task>

<task type="auto">
  <name>Task 2: full npm test gate and final health snapshot</name>
  <files>CHANGELOG.md</files>
  <action>
Run `npm test` from the repo root once (it takes several minutes, so use a long timeout). Record the totals (tests, pass, fail, skipped) and every failing test file.
Classify each failure per error_recovery. Then run `node plugins/devflow/devflow/bin/df-tools.cjs validate health` and record its codes. Expect no I001 for
TRDs that have a summary, and no W001 or W005. W040 for the pending 0009 is out of scope (a user action). Put both outputs in the SUMMARY.
Touch CHANGELOG.md only if the run reveals an entry that is wrong.
  </action>
  <verify>npm test (only MA-7 fails, or the remainder is proven environmental by isolated re-runs); node plugins/devflow/devflow/bin/df-tools.cjs validate health</verify>
  <done>The full suite is green apart from MA-7, and the health snapshot is recorded.</done>
</task>

</tasks>

<validation_gates>
- test (objective gate): `npm test`.
</validation_gates>

<verification>
- doc-refs and planning-writes repo tests pass.
- `npm test`: only MA-7 fails.
- `validate health`: no I001 for summarised TRDs, no W001, no W005.
</verification>

<success_criteria>
Objective 53 is documented and its fixed known issues are removed. Item 53-6 is closed with evidence, and the full suite is green apart from MA-7.
</success_criteria>

<output>
Publish the SUMMARY with `summary checkpoint` / `summary post` 53-07 and commit it with your docs commit.
</output>
