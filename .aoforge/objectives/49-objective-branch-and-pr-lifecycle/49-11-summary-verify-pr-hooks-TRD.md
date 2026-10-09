---
objective: 49-objective-branch-and-pr-lifecycle
trd: "11"
type: standard
wave: 4
depends_on: ["49-04", "49-05", "49-06", "49-10"]
files_modified:
  - plugins/devflow/devflow/bin/lib/planning-verbs.cjs
  - plugins/devflow/devflow/bin/lib/planning-verbs-pr.test.cjs
autonomous: true
requirements: [GPR-03, GPR-04]
must_haves:
  truths:
    - "In store mode `summary post` for a TRD queues, in the same enqueue as the SUMMARY comment, `patch-issue labels_remove:[github.labels.in_progress]` on the TRD issue and, when the objective has a PR, an `upsert-pr {id:obj} {branch, base, summary}` refreshing the summary section (`TRDs complete k/N`) — branch/base from `prs[obj]`, NO title (49-05: title is create-only, the remote title is kept)"
    - "In store mode `verification post` with frontmatter `status: passed` and a PR on record queues `post-status` success (`devflow/verification`), `pr-ready`, and `upsert-pr-comment kind=wiki-diff` holding the objective's wiki diff since `prs[obj].wiki_base_sha` (or `No wiki pages changed during this objective.`)"
    - "`verification post` with `gaps_found` queues `post-status` failure and leaves the PR in draft; `human_needed` queues `pending`"
    - "In store mode the objective issue does NOT close at verify-pass: `objective set-status complete` (and so `objective complete`) writes the status but queues no `state: closed` while the objective has an unmerged PR; it closes on merge or reconcile"
    - "In local mode `summary post`, `verification post` and `objective complete` write exactly what they write today with zero gh calls"
    - "No PR on record (store mode, objective never started) → summary/verification behave as objective 48 left them, and `objective complete` closes as before"
  artifacts:
    - path: plugins/devflow/devflow/bin/lib/planning-verbs.cjs
      provides: "PR-aware enqueues in summaryPost and verificationPost; STATUS_PATCH.complete deferred while a PR is unmerged"
  key_links:
    - "Uses 49-02 getPr, 49-04 gh-wiki.diff, 49-05 upsert-pr/pr-ready/labels_remove, 49-06 in_progress label, 49-10 post-status/upsert-pr-comment; reconcile (49-12) closes the objective after merge"
---

# TRD 49-11: TRD completion and verify pass drive the PR (GPR-03), and the early-close fix

<objective>
Hook the lifecycle into the two verbs that already mark completion: `summary post` moves the TRD out of in-progress and refreshes the PR;
`verification post` turns the verifier's verdict into a commit status, marks the PR ready and posts the wiki diff. Stop store mode from
closing the objective issue at verify time — it must close when the PR merges.

Purpose: GPR-03; GPR-04 correctness (Pitfall 3). Output: planning-verbs changes and a new test file.
</objective>

<execution_context>
@~/.claude/devflow/workflows/execute-trd.md
@~/.claude/devflow/templates/summary.md
</execution_context>

## Binding rules

- Strict TDD: failing tests first (`test(49-11): ...`), then implementation (`feat(49-11): ...`). The early-close test (8) is written
  first against today's code and must FAIL (it documents the defect).
- Commit with `node plugins/devflow/devflow/bin/df-tools.cjs commit "<msg>" --files <paths>`.
- planning-verbs stays a PLANNING_MODULE: no gh or git spawn (it may require gh-wiki and call `diff`, which spawns inside gh-wiki).
- New test file `planning-verbs-pr.test.cjs`; fake + `hermeticEnv` + `makeStoreProject({store:true})` with a wiki clone fixture and a seeded
  `prs['49']`. Never real GitHub/`~/.claude`; never port 8080.

## Decisions

- **Orchestrator directive: in store mode the objective issue must not close at verify-pass; it closes on merge or reconcile.**
  Implemented in `objectiveSetStatus`: when `status === 'complete'`, store mode, and `getPr(main, id)` exists without `merged_at`, the
  `patch-issue {state:'closed'}` is omitted (status still written; result carries `close_deferred: 'pr #N'`). `objective.cjs`
  `storeObjectiveComplete` routes through it, so no change there. After reconcile sets `merged_at`, a later `complete` closes normally.
- **Decision 1 recap**: verify pass posts a commit status, context `devflow/verification`, description
  `Objective <id> verified (<score>)` from the VERIFICATION frontmatter `score` when present (≤ 140 chars). No check run here.
- **Status sha**: left unset in the op; the flusher resolves the PR head at flush (49-10). The prose (49-13) runs `gh pr sync` before
  `verification post`, so the head includes the verified commits.
- **Wiki diff**: `gh-wiki.diff(main, prs.wiki_base_sha)`; text = a fenced ```diff block under a heading `Wiki changes during objective <id>`;
  docs/degraded pages mode or no clone → no comment (the diff is already in the PR's files). Empty diff → the "No wiki pages changed" line.
- **Summary refresh**: `k` = TRDs of the objective with a SUMMARY in the cache after this write; `N` = mapped TRDs. Payload is
  `{branch: prs.branch, base: prs.base, summary}`; no `title` (49-05 decision: title optional on refresh, remote title kept; `prs`
  stores no title, so 49-02 is unchanged). Missing `prs.branch`/`base` → no refresh op, `pr_refresh: 'skipped (no branch on record)'`.

## Test list

1. Store mode, PR on record, `summary post` for 49-01 → queued ops include the existing summary `upsert-comment`, a `patch-issue {id:'49-01'}
   {labels_remove:['devflow:in-progress']}`, and `upsert-pr {id:'49'} {branch, base, summary:'TRDs complete 1/2'}` with no `title` key; one flush applies all and the PR
   title is unchanged.
2. Store mode, no PR on record → `summary post` queues the summary comment and the label removal only (no upsert-pr).
3. `verification post` with `status: passed`, `score: 12/12 must-haves` → queued `post-status {id:'49', context:'devflow/verification'}
   {state:'success', description:'Objective 49 verified (12/12 must-haves)'}`, `pr-ready {id:'49'}`, `upsert-pr-comment {id:'49',
   kind:'wiki-diff'}` whose text contains the changed wiki page; after flush the fake PR is ready with a success status.
4. Wiki unchanged since `wiki_base_sha` → wiki-diff comment text is the "No wiki pages changed" line.
5. `status: gaps_found` → `post-status failure`; no `pr-ready`; PR stays draft.
6. `status: human_needed` → `post-status pending`; no `pr-ready`.
7. Pages (docs) mode → no wiki-diff op; status and ready still queued.
8. (Defect, RED on today's code) store mode, PR on record: `objectiveSetStatus({id:'49', status:'complete'})` → no queued op has
   `state:'closed'`; frontmatter status complete; result `close_deferred`.
9. Same with `prs['49'].merged_at` set → the close is queued (unchanged behaviour after merge).
10. Store mode, no PR on record → `complete` queues the close as today.
11. Local mode: summary post, verification post, objective set-status complete → files byte-identical to objective 48's output; `fake.calls()` empty.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Defer the objective close while a PR is unmerged (tests 8-10)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-verbs.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-pr.test.cjs</files>
  <action>
RED: tests 8-10 (8 fails today); commit `test(49-11): objective must not close before its PR merges`.
GREEN: in `objectiveSetStatus` (L485) compute the patch from `STATUS_PATCH` (L412) and drop it for `complete` when the PR rule applies;
return `close_deferred`. Commit `fix(49-11): store mode closes the objective issue on merge, not at verify`.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-verbs-pr.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs</verify>
  <done>Tests 8-10 pass; objective.test.cjs and planning-verbs.test.cjs unchanged and green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: summary post and verification post drive the PR (tests 1-7, 11)</name>
  <files>plugins/devflow/devflow/bin/lib/planning-verbs.cjs, plugins/devflow/devflow/bin/lib/planning-verbs-pr.test.cjs</files>
  <action>
RED: tests 1-7, 11; commit `test(49-11): summary and verification drive the objective PR`.
GREEN: `summaryPost` (L560) — wrap its `enqueue` so it also queues the label removal and, with a PR, the upsert-pr refresh (same
enqueue call, so one flush). `verificationPost` (L619) — parse `status`/`score` with `extractFrontmatter`; with a PR, append
post-status / pr-ready / wiki-diff per decisions. Commit `feat(49-11): TRD completion and verify pass update the PR`. Run
planning-verbs.test, planning-verbs.e2e.test, gh-store-e2e.test.
# CRITICAL: build all ops inside the existing `enqueue` callback of `writeThrough` — local mode never calls it, which is what keeps D-01.
  </action>
  <verify>node --test plugins/devflow/devflow/bin/lib/planning-verbs-pr.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs plugins/devflow/devflow/bin/lib/planning-verbs.e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs</verify>
  <done>Tests 1-7, 11 pass; existing planning-verbs and store e2e suites green.</done>
</task>

</tasks>

<embedded_context>
<codebase_examples>
- `planning-verbs.cjs`: `enqueueAndFlush` L169, `writeThrough` L228, `STATUS_PATCH` L412, `objectiveEnqueue` (status patch queued after the body sync), `objectiveSetStatus` L485, `summaryPost` L560, `verificationPost` L619.
- `objective.cjs` `storeObjectiveComplete` L383 → `objectiveSetStatus(root, {id, status:'complete'})`.
- `gh-comments.cjs` `enqueueSummary`, `enqueueVerification` — the existing store-mode enqueues being extended.
</codebase_examples>
<anti_patterns>
- Closing via `objective complete` in store mode while a PR is open (makes the PR's `Closes #obj` a no-op and closes before merge).
- Posting the status/ready from the verifier agent prose directly: the verb owns it, so every verify path gets it.
</anti_patterns>
<error_recovery>
- If `extractFrontmatter` is not exported where planning-verbs can reach it, use the frontmatter helper the module already imports.
</error_recovery>
</embedded_context>

<validation_gates>
<test>node --test plugins/devflow/devflow/bin/lib/planning-verbs-pr.test.cjs</test>
<regression>node --test plugins/devflow/devflow/bin/lib/planning-verbs.test.cjs plugins/devflow/devflow/bin/lib/objective.test.cjs plugins/devflow/devflow/bin/lib/gh-store-e2e.test.cjs plugins/devflow/devflow/bin/lib/gh-seam.repo.test.cjs</regression>
</validation_gates>

<verification>
- Zero `state:'closed'` ops for the objective before reconcile while a PR is on record (test 8).
</verification>

<success_criteria>
Finishing a TRD and passing verification are visible on the PR (label, summary, status, ready, wiki diff), and the objective issue stays
open until its PR merges.
</success_criteria>

<output>
After completion, create `.planning/objectives/49-objective-branch-and-pr-lifecycle/49-11-SUMMARY.md`
</output>
